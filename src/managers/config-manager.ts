import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, restoreBackup } from '../utils/backup.js';
import { readIfExists, readJson, sha256, writeFileAtomic } from '../utils/filesystem.js';
import { ManifestSchema, type Manifest } from '../utils/validation.js';
import { VERSION } from '../version.js';

export const MANIFEST_PATH = `${STATE_DIR}/manifest.json`;

export function loadManifest(root: string): Manifest | undefined {
  const r = readJson(path.join(root, MANIFEST_PATH));
  if (!r.ok) return undefined;
  const parsed = ManifestSchema.safeParse(r.value);
  return parsed.success ? parsed.data : undefined;
}

export function emptyManifest(scope: Manifest['scope']): Manifest {
  const now = new Date().toISOString();
  return { schemaVersion: 1, toolVersion: VERSION, createdAt: now, updatedAt: now, selections: [], scope, files: [], plugins: [], mcpServers: [] };
}

export function saveManifest(root: string, m: Manifest): void {
  m.updatedAt = new Date().toISOString();
  m.toolVersion = VERSION;
  writeFileAtomic(path.join(root, MANIFEST_PATH), JSON.stringify(m, null, 2) + '\n');
  // Keep backups and the manifest out of git without touching the user's .gitignore.
  const gi = path.join(root, STATE_DIR, '.gitignore');
  if (!fs.existsSync(gi)) writeFileAtomic(gi, 'backups/\n');
}

/** Records a file change. The first record for a path wins, so rollback returns to the pre-crazy-claude state. */
export function recordFile(m: Manifest, entry: Manifest['files'][number]): void {
  const existing = m.files.find((f) => f.path === entry.path);
  if (existing) existing.sha256 = entry.sha256;
  else m.files.push(entry);
}

export interface RollbackResult {
  restored: string[];
  removed: string[];
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Undoes crazy-claude file changes: restores backups of modified files and deletes files it created —
 * but only when the file still matches what crazy-claude wrote (user edits are never discarded).
 */
export function rollbackFiles(root: string, m: Manifest, opts: { dryRun: boolean; force?: boolean }): RollbackResult {
  const res: RollbackResult = { restored: [], removed: [], skipped: [] };
  for (const f of [...m.files].reverse()) {
    const abs = path.join(root, f.path);
    const current = readIfExists(abs);
    if (current === undefined) {
      res.skipped.push({ path: f.path, reason: 'already gone' });
      continue;
    }
    if (sha256(current) !== f.sha256 && !opts.force) {
      res.skipped.push({ path: f.path, reason: 'changed since crazy-claude wrote it (use --force)' });
      continue;
    }
    if (f.action === 'modified' && f.backup) {
      if (!opts.dryRun) restoreBackup(root, f.backup, f.path);
      res.restored.push(f.path);
    } else if (f.action === 'created') {
      if (!opts.dryRun) {
        fs.rmSync(abs);
        pruneEmptyDirs(root, path.dirname(abs));
      }
      res.removed.push(f.path);
    } else {
      res.skipped.push({ path: f.path, reason: 'no backup recorded' });
    }
  }
  return res;
}

/** Removes directories left empty by a rollback, walking up but never past (or including) the project root. */
function pruneEmptyDirs(root: string, dir: string): void {
  const stop = path.resolve(root);
  let cur = path.resolve(dir);
  while (cur.startsWith(stop + path.sep) && fs.existsSync(cur) && fs.readdirSync(cur).length === 0) {
    fs.rmdirSync(cur);
    cur = path.dirname(cur);
  }
}
