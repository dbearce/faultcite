import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('migration_verify', Path(__file__).resolve().parents[1] / 'cloudflare/scripts/verify-migration-export.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture():
    return [
        {'kind': 'header', 'format': 'faultcite-migration-v1', 'restoreVerified': False},
        {'kind': 'schema', 'type': 'table', 'name': 'parents', 'tbl_name': 'parents', 'sql': 'CREATE TABLE parents(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, data BLOB)'},
        {'kind': 'schema', 'type': 'table', 'name': 'children', 'tbl_name': 'children', 'sql': 'CREATE TABLE children(id TEXT PRIMARY KEY, parent INTEGER REFERENCES parents(id), doubled INTEGER GENERATED ALWAYS AS (parent * 2) VIRTUAL) WITHOUT ROWID'},
        {'kind': 'schema', 'type': 'index', 'name': 'child_parent', 'tbl_name': 'children', 'sql': 'CREATE INDEX child_parent ON children(parent)'},
        {'kind': 'schema', 'type': 'view', 'name': 'parent_view', 'tbl_name': 'parent_view', 'sql': 'CREATE VIEW parent_view AS SELECT id FROM parents'},
        {'kind': 'schema', 'type': 'trigger', 'name': 'parent_trigger', 'tbl_name': 'parents', 'sql': 'CREATE TRIGGER parent_trigger AFTER INSERT ON parents BEGIN UPDATE parents SET text = text WHERE id = NEW.id; END'},
        {'kind': 'row', 'table': 'parents', 'sql': "INSERT INTO parents(rowid,id,text,data) VALUES(9223372036854775806,9223372036854775806,CAST(X'610062' AS TEXT),X'00FF');"},
        {'kind': 'table-end', 'table': 'parents', 'rows': 1},
        {'kind': 'row', 'table': 'children', 'sql': "INSERT INTO children(id,parent) VALUES('c',9223372036854775806);"},
        {'kind': 'table-end', 'table': 'children', 'rows': 1},
        {'kind': 'sequences', 'rows': [{'name': 'parents', 'seq': '9223372036854775806'}]},
        {'kind': 'file', 'key': '../../outside.txt', 'size': 3, 'customMetadata': {'type': 'fixture'}},
        {'kind': 'file-chunk', 'data': base64.b64encode(b'a\x00b').decode()},
        {'kind': 'file-end', 'key': '../../outside.txt', 'bytes': 3, 'sha256': hashlib.sha256(b'a\x00b').hexdigest()},
        {'kind': 'file', 'key': 'empty', 'size': 0},
        {'kind': 'file-end', 'key': 'empty', 'bytes': 0, 'sha256': hashlib.sha256(b'').hexdigest()},
    ]


def encode(items):
    payload = b''.join((json.dumps(item, separators=(',', ':')) + '\n').encode() for item in items)
    return payload + (json.dumps({'kind': 'complete', 'records': len(items), 'sha256': hashlib.sha256(payload).hexdigest()}) + '\n').encode()


class MigrationRestoreTests(unittest.TestCase):
    def check_archive(self, data):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'archive.ndjson'
            path.write_bytes(data)
            return MODULE.verify(path)

    def test_full_roundtrip(self):
        result = self.check_archive(encode(fixture()))
        self.assertTrue(result['offlineRestorePassed'])
        self.assertFalse(result['productionAcceptance'])
        self.assertEqual((result['tables'], result['rows'], result['files']), (2, 2, 2))

    def test_restore_preserves_values_and_hashes_keys(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / 'input.ndjson'
            archive.write_bytes(encode(fixture()))
            schema, counts, sequences, _, _ = MODULE.validate(archive, root)
            MODULE.restore(root, schema, counts, sequences)
            with sqlite3.connect(root / 'rehearsal.sqlite') as db:
                self.assertEqual(db.execute('SELECT id,hex(text),hex(data) FROM parents').fetchone(), (9223372036854775806, '610062', '00FF'))
                self.assertEqual(db.execute('SELECT seq FROM sqlite_sequence').fetchone(), (9223372036854775806,))
            self.assertEqual(len(list(root.glob('object-*'))), 2)
            self.assertFalse((root / 'outside.txt').exists())

    def test_corruption_and_truncation(self):
        data = encode(fixture())
        for bad in (data.replace(b'610062', b'610063'), data.rsplit(b'\n', 2)[0] + b'\n', data + b'{}\n'):
            with self.subTest(bad=bad[-60:]):
                with self.assertRaises(ValueError):
                    self.check_archive(bad)

    def test_file_checksum_and_table_count(self):
        for index, field, value in ((13, 'sha256', '0' * 64), (7, 'rows', 2), (13, 'bytes', 4)):
            items = fixture()
            items[index][field] = value
            with self.assertRaises(ValueError):
                self.check_archive(encode(items))

    def test_sql_attacks(self):
        for sql in ("ATTACH DATABASE '/tmp/evil' AS evil", 'DELETE FROM parents', "INSERT INTO parents(id) SELECT 1", "INSERT INTO parents(id) VALUES(1); DROP TABLE children;", "INSERT INTO parents(id) VALUES(load_extension('evil'));", "INSERT INTO children(id) VALUES('wrong-target')"):
            items = fixture()
            items[6]['sql'] = sql
            with self.subTest(sql=sql):
                with self.assertRaises((ValueError, sqlite3.Error)):
                    self.check_archive(encode(items))

    def test_duplicate_and_order_records(self):
        for index in (1, 7, 11):
            items = fixture()
            items.insert(index, items[index].copy())
            with self.assertRaises(ValueError):
                self.check_archive(encode(items))

    def test_broken_foreign_key(self):
        items = fixture()
        items[8]['sql'] = "INSERT INTO children(id,parent) VALUES('c',1);"
        with self.assertRaises(ValueError):
            self.check_archive(encode(items))

    def test_unknown_record_and_duplicate_json_key(self):
        items = fixture()
        items.append({'kind': 'surprise'})
        with self.assertRaises(ValueError):
            self.check_archive(encode(items))
        with self.assertRaises(ValueError):
            self.check_archive(b'{"kind":"header","kind":"header"}\n')

    def test_generated_function_and_no_overwrite(self):
        items = fixture()
        items[2]['sql'] = items[2]['sql'].replace('parent * 2', 'length(id)')
        self.assertTrue(self.check_archive(encode(items))['offlineRestorePassed'])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sentinel = root / 'rehearsal.sqlite'
            sentinel.write_bytes(b'preserve this')
            with self.assertRaises(FileExistsError):
                MODULE.restore(root, [], {}, None)
            self.assertEqual(sentinel.read_bytes(), b'preserve this')

    def test_missing_sequence_inventory(self):
        items = [item for item in fixture() if item['kind'] != 'sequences']
        with self.assertRaises(ValueError):
            self.check_archive(encode(items))


if __name__ == '__main__':
    unittest.main()
