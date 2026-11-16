import fs from 'node:fs';
import path from 'node:path';
import { readIfExists, writeFileAtomic } from './filesystem.js';

export const STATE_DIR = '.crazy-claude';

/** One backup session per process run, so a run's backups land in one timestamped folder. */
export class BackupSession {
  readonly id: string;
  readonly dir: string;

  constructor(private readonly root: string, id?: string) {
    this.id = id ?? new Date().toISOString().replace(/[:.]/g, '-');
    this.dir = path.join(root, STATE_DIR, 'backups', this.id);
  }

  /** Copies `rel` into the backup folder. Returns the backup path relative to root, or undefined if nothing to back up. */
  backup(rel: string): string | undefined {
    const content = readIfExists(path.join(this.root, rel));
    if (content === undefined) return undefined;
    const dest = path.join(this.dir, rel);
    writeFileAtomic(dest, content);
    return path.relative(this.root, dest).split(path.sep).join('/');
  }
}

/** Restores a backed-up file over its original location. */
export function restoreBackup(root: string, backupRel: string, targetRel: string): void {
  const content = fs.readFileSync(path.join(root, backupRel), 'utf8');
  writeFileAtomic(path.join(root, targetRel), content);
}
