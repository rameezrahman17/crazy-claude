import { spawnSync } from 'node:child_process';

export interface ExecResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export type Exec = (cmd: string, args: string[], opts?: { timeoutMs?: number; cwd?: string }) => ExecResult;

/** Runs a command without a shell (no injection via arguments). */
export const defaultExec: Exec = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeoutMs ?? 120_000,
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Marketplace listings can exceed 1 MB of JSON.
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: process.env.CI ?? '' },
  });
  return {
    ok: r.status === 0 && !r.error,
    code: r.status,
    stdout: r.stdout ?? '',
    stderr: (r.stderr ?? '') + (r.error ? String(r.error.message) : ''),
  };
};
