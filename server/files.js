// Small helpers for reading and writing JSON in the data folder, written atomically.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';

export function readJSON(dir, name, fallback) {
  try {
    const p = join(dir, name);
    if (!existsSync(p)) return fallback;
    const buf = readFileSync(p);
    return JSON.parse((name.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8'));
  } catch (e) {
    console.warn(`[files] could not read ${name}: ${e.message}`);
    return fallback;
  }
}

export function writeJSON(dir, name, data) {
  const p = join(dir, name);
  mkdirSync(dirname(p), { recursive: true });
  const json = JSON.stringify(data);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, name.endsWith('.gz') ? gzipSync(json) : json);
  renameSync(tmp, p);
}
