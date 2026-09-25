import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('offline migration archive validation and isolated restore regressions', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_migration_restore.py', '-v'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran [1-9][0-9]* tests?/, 'Restore tests must not silently run zero tests');
});
