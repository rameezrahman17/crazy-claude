import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Copies a fixture into a fresh temp dir so tests can write to it. */
export function tempFixture(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cb-${name}-`));
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

export const read = (root: string, rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
export const exists = (root: string, rel: string) => fs.existsSync(path.join(root, rel));
