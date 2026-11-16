import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const sha256 = (text: string): string => crypto.createHash('sha256').update(text).digest('hex');

export function readIfExists(abs: string): string | undefined {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return undefined;
  }
}

/** Atomic write: write to a temp file in the same dir, then rename. */
export function writeFileAtomic(abs: string, content: string, mode?: number): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode });
  fs.renameSync(tmp, abs);
}

export function readJson<T = unknown>(abs: string): { ok: true; value: T } | { ok: false; error: string; missing: boolean } {
  const text = readIfExists(abs);
  if (text === undefined) return { ok: false, error: 'file not found', missing: true };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}`, missing: false };
  }
}

export const toPosix = (p: string) => p.split(path.sep).join('/');
