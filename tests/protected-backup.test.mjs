import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, readdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { protectBackup } from '../cloudflare/scripts/protected-backup.mjs';

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'faultcite-envelope-test-'));
  const keyFile = join(dir, 'key'); const input = join(dir, 'synthetic'); const envelope = join(dir, 'envelope');
  const bytes = randomBytes(200000);
  await writeFile(keyFile, randomBytes(32), { mode: 0o600 });
  await writeFile(input, bytes, { mode: 0o600 });
  try { await run({ dir, keyFile, input, envelope, bytes }); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('protected backup streams synthetic roundtrip, randomizes nonce and uses private permissions', async () => fixture(async f => {
  await protectBackup({ ...f, mode: 'encrypt', output: f.envelope });
  const second = join(f.dir, 'second');
  await protectBackup({ ...f, mode: 'encrypt', output: second });
  assert.notDeepEqual(await readFile(f.envelope), await readFile(second));
  const output = join(f.dir, 'restored');
  await protectBackup({ ...f, mode: 'decrypt', input: f.envelope, output });
  assert.deepEqual(await readFile(output), f.bytes);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal((await stat(f.envelope)).mode & 0o777, 0o600);
  assert.ok(!(await readdir(f.dir)).some(name => name.startsWith('.faultcite-backup-')));
}));

test('wrong key, modified header/ciphertext/tag and truncation never publish plaintext', async () => fixture(async f => {
  await protectBackup({ ...f, mode: 'encrypt', output: f.envelope });
  const original = await readFile(f.envelope);
  const wrongKey = join(f.dir, 'wrong-key');
  await writeFile(wrongKey, randomBytes(32), { mode: 0o600 });
  const cases = [
    { bytes: original, keyFile: wrongKey },
    ...[0, 10, 100, original.length - 1].map(index => { const bytes = Buffer.from(original); bytes[index] ^= 1; return { bytes }; }),
    ...[0, 8, 24, original.length - 1].map(length => ({ bytes: original.subarray(0, length) })),
  ];
  for (let i = 0; i < cases.length; i++) {
    const damaged = join(f.dir, `damaged-${i}`); const output = join(f.dir, `restored-${i}`);
    await writeFile(damaged, cases[i].bytes);
    await assert.rejects(protectBackup({ mode: 'decrypt', input: damaged, output, keyFile: cases[i].keyFile || f.keyFile }));
    await assert.rejects(stat(output), { code: 'ENOENT' });
    assert.ok(!(await readdir(f.dir)).some(name => name.startsWith('.faultcite-backup-')));
  }
}));

test('existing output is never overwritten and shared key permissions are rejected', async () => fixture(async f => {
  await writeFile(f.envelope, 'keep');
  await assert.rejects(protectBackup({ ...f, mode: 'encrypt', output: f.envelope }));
  assert.equal(await readFile(f.envelope, 'utf8'), 'keep');
  await chmod(f.keyFile, 0o644);
  const output = join(f.dir, 'new');
  await assert.rejects(protectBackup({ ...f, mode: 'encrypt', output }));
  await assert.rejects(stat(output), { code: 'ENOENT' });
}));

test('empty synthetic file roundtrips with authenticated framing', async () => fixture(async f => {
  await writeFile(f.input, '');
  await protectBackup({ ...f, mode: 'encrypt', output: f.envelope });
  const output = join(f.dir, 'empty-restored');
  await protectBackup({ ...f, mode: 'decrypt', input: f.envelope, output });
  assert.equal((await readFile(output)).length, 0);
}));

test('concurrent publishers cannot overwrite the winning envelope', async () => fixture(async f => {
  const attempts = await Promise.allSettled([
    protectBackup({ ...f, mode: 'encrypt', output: f.envelope }),
    protectBackup({ ...f, mode: 'encrypt', output: f.envelope }),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
  const output = join(f.dir, 'race-restored');
  await protectBackup({ ...f, mode: 'decrypt', input: f.envelope, output });
  assert.deepEqual(await readFile(output), f.bytes);
  assert.ok(!(await readdir(f.dir)).some(name => name.startsWith('.faultcite-backup-')));
}));
