#!/usr/bin/env node
// Local envelope only: does not capture data, prove source consistency, or approve key custody.
import { constants } from 'node:fs';
import { open, mkdtemp, link, rm, lstat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('FCBAK001');
const HEADER_SIZE = MAGIC.length + 12;
const TAG_SIZE = 16;
const MAX_PLAINTEXT = 2 ** 36 - 32; // AES-GCM per-invocation bound.

async function regularFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) throw new Error('Regular file required');
    return file;
  } catch (error) { await file.close(); throw error; }
}

async function exactRead(file, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error('Incomplete envelope');
    offset += bytesRead;
  }
  return buffer;
}

export async function protectBackup({ mode, input, output, keyFile }) {
  if (!['encrypt', 'decrypt'].includes(mode) || !input || !output || !keyFile) throw new Error('Invalid arguments');
  const destination = resolve(output);
  if ([resolve(input), resolve(keyFile)].includes(destination)) throw new Error('Output must be a new file');
  // Detect ordinary collisions early; exclusive hard-link publication handles races.
  try { await lstat(destination); throw new Error('Output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let key, source, folder;
  try {
    const keyHandle = await regularFile(keyFile);
    try {
      const info = await keyHandle.stat();
      if (info.size !== 32 || (info.mode & 0o077) || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('Key must be an owned private 32-byte binary file');
      key = await exactRead(keyHandle, 32, 0);
    } finally { await keyHandle.close(); }
    source = await regularFile(input);
    const before = await source.stat({ bigint: true });
    const length = Number(before.size);
    const payloadSize = mode === 'encrypt' ? length : length - HEADER_SIZE - TAG_SIZE;
    if (!Number.isSafeInteger(length) || payloadSize < 0 || payloadSize > MAX_PLAINTEXT) throw new Error('Invalid envelope size');
    const header = mode === 'encrypt' ? Buffer.concat([MAGIC, randomBytes(12)]) : await exactRead(source, HEADER_SIZE, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unsupported envelope');
    const cipher = mode === 'encrypt'
      ? createCipheriv('aes-256-gcm', key, header.subarray(MAGIC.length), { authTagLength: TAG_SIZE })
      : createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length), { authTagLength: TAG_SIZE });
    cipher.setAAD(header);
    if (mode === 'decrypt') cipher.setAuthTag(await exactRead(source, TAG_SIZE, length - TAG_SIZE));
    folder = await mkdtemp(join(dirname(destination), '.faultcite-backup-'));
    const temporary = join(folder, 'payload');
    const target = await open(temporary, 'wx', 0o600);
    try {
      if (mode === 'encrypt') await target.writeFile(header);
      const start = mode === 'encrypt' ? 0 : HEADER_SIZE;
      if (payloadSize) {
        for await (const chunk of source.createReadStream({ start, end: start + payloadSize - 1, autoClose: false, highWaterMark: 64 * 1024 })) {
          await target.writeFile(cipher.update(chunk));
        }
      }
      // GCM final authenticates before any decrypted destination is published.
      await target.writeFile(cipher.final());
      if (mode === 'encrypt') await target.writeFile(cipher.getAuthTag());
      const after = await source.stat({ bigint: true });
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('Input changed during processing');
      await target.sync();
    } finally { await target.close(); }
    await link(temporary, destination); // Atomic, same-filesystem, fails if destination exists.
    const parent = await open(dirname(destination), constants.O_RDONLY);
    try { await parent.sync(); } finally { await parent.close(); }
    return { format: 'FCBAK001', operation: mode, authenticated: true };
  } finally {
    key?.fill(0);
    try { if (source) await source.close(); }
    finally { if (folder) await rm(folder, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, input, output, ...extra] = process.argv.slice(2);
  if (extra.length || !process.env.FAULTCITE_BACKUP_KEY_FILE) {
    console.error('Usage: FAULTCITE_BACKUP_KEY_FILE=/private/key node protected-backup.mjs encrypt|decrypt INPUT NEW_OUTPUT');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await protectBackup({ mode, input, output, keyFile: process.env.FAULTCITE_BACKUP_KEY_FILE }))); }
    catch { console.error('Protected backup operation failed; output was not verified. Check key, input integrity, permissions and output availability.'); process.exitCode = 1; }
  }
}
