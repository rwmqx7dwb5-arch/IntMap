import { randomUUID } from 'node:crypto';
import {
  mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, statSync, lstatSync, chmodSync,
  linkSync, renameSync, unlinkSync, rmdirSync, mkdtempSync, rmSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function absent(err) { return err.code === 'ENOENT'; }

function canonical(file) {
  try { return realpathSync(file); }
  catch (err) {
    if (!absent(err) || lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw err;
    mkdirSync(dirname(file), { recursive: true });
    return join(realpathSync(dirname(file)), basename(file));
  }
}

function removeEmpty(dir) {
  try { rmdirSync(dir); }
  catch (err) { if (!absent(err) && !['ENOTEMPTY', 'EEXIST'].includes(err.code)) throw err; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code !== 'ESRCH'; }
}

function clearAbandoned(lock) {
  let owners;
  try { owners = readdirSync(lock); }
  catch (err) { if (absent(err)) return; throw err; }
  if (owners.length === 0) { removeEmpty(lock); return; }
  if (owners.length !== 1) return;
  const match = /^(\d+)-[0-9a-f-]{36}$/.exec(owners[0]);
  if (!match || alive(Number(match[1]))) return;
  // Only the exact, unique owner marker can be removed. A contender that has
  // already installed a new marker cannot be evicted by another stale reader.
  try { unlinkSync(join(lock, owners[0])); }
  catch (err) { if (absent(err)) return; throw err; }
  removeEmpty(lock);
}

export async function withSettingsLock(file, fn) {
  const target = canonical(file);
  const lock = target + '.intmap-lock';
  const stage = mkdtempSync(lock + '-');
  const marker = process.pid + '-' + randomUUID();
  try {
    writeFileSync(join(stage, marker), '', { flag: 'wx', mode: 0o600 });
    const deadline = performance.now() + 30_000;
    for (;;) {
      try { renameSync(stage, lock); break; }
      catch (err) {
        // A loaded settings transaction normally takes milliseconds. The deadline
        // bounds the wait for a still-running or unidentifiable owner.
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(err.code)) throw err;
        if (performance.now() >= deadline) throw new Error('Timed out waiting for settings lock: ' + lock, { cause: err });
        clearAbandoned(lock);
        await delay(25);
      }
    }
    try { return await fn(target); }
    finally {
      unlinkSync(join(lock, marker));
      removeEmpty(lock);
    }
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

function readCurrent(file) {
  try { return readFileSync(file); }
  catch (err) { if (absent(err)) return null; throw err; }
}

function sameBytes(a, b) { return a === null ? b === null : b !== null && a.equals(b); }

export function replaceSettings(file, bytes, { expected, backup } = {}) {
  const dir = mkdtempSync(join(dirname(file), '.intmap-settings-'));
  const staged = join(dir, 'settings');
  try {
    const mode = expected ? statSync(file, { throwIfNoEntry: false })?.mode : undefined;
    writeFileSync(staged, bytes, { flag: 'wx', mode: 0o600, flush: true });
    if (mode != null && process.platform !== 'win32') chmodSync(staged, mode & 0o777);
    if (backup && expected) {
      const old = join(dir, 'previous');
      writeFileSync(old, expected, { flag: 'wx', mode: 0o600, flush: true });
      try { linkSync(old, backup); }
      catch (err) { if (err.code !== 'EEXIST') throw err; }
    }
    // Also catch edits by the app or an editor made since we read the file.
    if (expected !== undefined && !sameBytes(expected, readCurrent(file))) return false;
    renameSync(staged, file);
    return true;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function updateSettingsLocked(file, transform, options) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = readCurrent(file);
    const { text, result } = transform(before === null ? null : decoder.decode(before));
    if (text == null || sameBytes(before, Buffer.from(text))) return result;
    if (replaceSettings(file, text, { expected: before, ...options })) return result;
  }
  throw new Error('Settings kept changing during the update: ' + file);
}

export function updateSettings(file, transform, options) {
  return withSettingsLock(file, target => updateSettingsLocked(target, transform, options));
}
