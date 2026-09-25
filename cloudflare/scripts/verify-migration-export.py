#!/usr/bin/env python3
"""Offline rehearsal only. Never connects to or writes a live database/bucket.

Reads an exporter NDJSON archive, validates its framing and digests, restores it
inside a fresh private temporary directory, checks SQLite, then deletes the
temporary copy. A successful report is NOT production migration acceptance.
"""
import argparse
from contextlib import ExitStack
import base64
import hashlib
import json
import re
import sqlite3
import tempfile
from pathlib import Path

MAX_LINE = 8 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON field')
        result[key] = value
    return result


def records(stream):
    while True:
        line = stream.readline(MAX_LINE + 1)
        if not line:
            return
        require(len(line) <= MAX_LINE and line.endswith(b'\n'), 'Invalid or oversized record')
        obj = json.loads(line, object_pairs_hook=unique_object,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Invalid JSON number')))
        require(isinstance(obj, dict), 'Record must be an object')
        yield line, obj


def validate(source, root):
    digest = hashlib.sha256()
    count = 0
    schema = []
    names = set()
    tables = []
    table_index = 0
    row_count = 0
    table_counts = {}
    keys = set()
    phase = 'header'
    active = None
    sequences = None
    complete = False
    with ExitStack() as files, open(source, 'rb') as stream, open(root / 'validated.ndjson', 'xb') as spool:
        for line, obj in records(stream):
            require(not complete, 'Data after footer')
            kind = obj.get('kind')
            if kind == 'complete':
                require(phase != 'header' and active is None and table_index == len(tables), 'Incomplete archive')
                require(type(obj.get('records')) is int and obj['records'] == count, 'Record count mismatch')
                require(obj.get('sha256') == digest.hexdigest(), 'Archive checksum mismatch')
                complete = True
                continue
            digest.update(line)
            count += 1
            spool.write(line)
            if phase == 'header':
                require(obj == {'kind': 'header', 'format': 'faultcite-migration-v1', 'restoreVerified': False}, 'Invalid header')
                phase = 'schema'
                continue
            if kind == 'schema':
                require(phase == 'schema', 'Late schema')
                require(obj.get('type') in ('table', 'index', 'trigger', 'view'), 'Unsupported schema type')
                name = obj.get('name')
                require(isinstance(name, str) and name and '\x00' not in name, 'Invalid schema name')
                require(name.lower() not in names and not name.lower().startswith(('sqlite_', '_cf_')), 'Duplicate or reserved schema')
                names.add(name.lower())
                require(isinstance(obj.get('sql'), str) and isinstance(obj.get('tbl_name'), str), 'Missing schema SQL')
                schema.append(obj)
                if obj['type'] == 'table':
                    tables.append(name)
                continue
            if phase == 'schema':
                phase = 'rows'
            if kind in ('row', 'table-end'):
                require(phase == 'rows' and table_index < len(tables) and obj.get('table') == tables[table_index], 'Table order mismatch')
                if kind == 'row':
                    require(isinstance(obj.get('sql'), str), 'Missing row SQL')
                    row_count += 1
                else:
                    require(type(obj.get('rows')) is int and obj['rows'] == row_count, 'Table count mismatch')
                    table_counts[obj['table']] = row_count
                    table_index += 1
                    row_count = 0
                continue
            require(table_index == len(tables), 'Missing table end')
            if kind == 'sequences':
                require(phase == 'rows' and sequences is None, 'Unexpected sequences')
                sequences = obj.get('rows')
                require(isinstance(sequences, list), 'Invalid sequences')
                seen = set()
                for row in sequences:
                    require(isinstance(row, dict) and row.get('name') in tables and row['name'] not in seen, 'Invalid sequence table')
                    require(isinstance(row.get('seq'), str) and re.fullmatch(r'\d+', row['seq']) and int(row['seq']) <= 9223372036854775807, 'Invalid sequence value')
                    seen.add(row['name'])
                phase = 'files'
                continue
            phase = 'files'
            if kind == 'file':
                require(active is None, 'Overlapping files')
                key = obj.get('key')
                require(isinstance(key, str) and key not in keys, 'Invalid or duplicate file key')
                require(type(obj.get('size')) is int and obj['size'] >= 0, 'Invalid file size')
                keys.add(key)
                # Untrusted object keys never become filesystem paths.
                path = root / ('object-' + hashlib.sha256(key.encode()).hexdigest())
                active = [obj, hashlib.sha256(), 0, files.enter_context(open(path, 'xb'))]
            elif kind == 'file-chunk':
                require(active is not None and isinstance(obj.get('data'), str), 'Unexpected file chunk')
                chunk = base64.b64decode(obj['data'], validate=True)
                require(base64.b64encode(chunk).decode() == obj['data'] and 0 < len(chunk) <= 65536, 'Invalid chunk encoding or size')
                active[1].update(chunk)
                active[2] += len(chunk)
                require(active[2] <= active[0]['size'], 'Oversized file')
                active[3].write(chunk)
            elif kind == 'file-end':
                require(active is not None and obj.get('key') == active[0]['key'], 'Unexpected file end')
                active[3].close()
                require(type(obj.get('bytes')) is int and obj['bytes'] == active[2] == active[0]['size'], 'File length mismatch')
                require(obj.get('sha256') == active[1].hexdigest(), 'File checksum mismatch')
                active = None
            else:
                raise ValueError('Unknown record kind')
    if active:
        active[3].close()
    require(complete, 'Missing completion footer')
    return schema, table_counts, sequences, len(keys), digest.hexdigest()


def restore(root, schema, table_counts, sequences):
    database_path = root / 'rehearsal.sqlite'
    # Refuse reuse even when this helper is called independently of verify().
    with open(database_path, 'xb'):
        pass
    db = sqlite3.connect(database_path, isolation_level=None)
    db.execute('PRAGMA trusted_schema=OFF')
    db.execute('PRAGMA foreign_keys=OFF')
    db.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, MAX_LINE)
    budget = [5_000_000]
    def progress():
        budget[0] -= 1000
        return budget[0] <= 0
    db.set_progress_handler(progress, 1000)
    def execute_guarded(sql, phase, target):
        def authorize(action, first, second, database, origin):
            if action == sqlite3.SQLITE_FUNCTION:
                return sqlite3.SQLITE_OK if second in ('length', 'lower', 'upper', 'coalesce', 'ifnull', 'abs', 'round', 'substr', 'trim', 'typeof') else sqlite3.SQLITE_DENY
            if phase == 'row':
                return sqlite3.SQLITE_OK if action == sqlite3.SQLITE_INSERT and first == target and database == 'main' and origin is None else sqlite3.SQLITE_DENY
            allowed = {sqlite3.SQLITE_CREATE_TABLE, sqlite3.SQLITE_CREATE_INDEX,
                       sqlite3.SQLITE_CREATE_TRIGGER, sqlite3.SQLITE_CREATE_VIEW,
                       sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_READ,
                       sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE, sqlite3.SQLITE_REINDEX}
            if database not in (None, 'main') or action not in allowed:
                return sqlite3.SQLITE_DENY
            if action in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE) and first != 'sqlite_master':
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK
        db.set_authorizer(authorize)
        try:
            db.execute(sql)  # Never executescript: no additional statements.
        finally:
            db.set_authorizer(None)
    try:
        for entry in schema:
            if entry['type'] == 'table':
                execute_guarded(entry['sql'], 'schema', entry['name'])
        with open(root / 'validated.ndjson', 'rb') as stream:
            for _, obj in records(stream):
                if obj['kind'] == 'row':
                    execute_guarded(obj['sql'], 'row', obj['table'])
        has_sequences = bool(db.execute("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").fetchone())
        require(has_sequences == (sequences is not None), 'Sequence inventory mismatch')
        if sequences is not None:
            db.execute('DELETE FROM sqlite_sequence')
            db.executemany('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)', [(r['name'], int(r['seq'])) for r in sequences])
        for entry in schema:
            if entry['type'] != 'table':
                execute_guarded(entry['sql'], 'schema', entry['name'])
        actual = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").fetchall()
        expected = [(e['type'], e['name'], e['tbl_name'], e['sql']) for e in schema]
        require(sorted(actual) == sorted(expected), 'Restored schema differs')
        for table, count in table_counts.items():
            quoted = '"' + table.replace('"', '""') + '"'
            require(db.execute('SELECT COUNT(*) FROM ' + quoted).fetchone()[0] == count, 'Restored row count differs')
        require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Integrity check failed')
        require(db.execute('PRAGMA foreign_key_check').fetchall() == [], 'Foreign key check failed')
    finally:
        db.close()


def verify(source):
    with tempfile.TemporaryDirectory(prefix='faultcite-restore-') as folder:
        root = Path(folder)
        schema, counts, sequences, files, digest = validate(source, root)
        restore(root, schema, counts, sequences)
        return {'offlineRestorePassed': True, 'productionAcceptance': False,
                'tables': len(counts), 'rows': sum(counts.values()), 'files': files,
                'archiveSha256': digest}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.archive)))
    except (ValueError, OSError, sqlite3.Error) as error:
        # Do not print source SQL, object keys, or customer data.
        parser.exit(1, 'Archive validation or isolated restore failed (' + type(error).__name__ + ').\n')
