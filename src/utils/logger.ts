import chalk from 'chalk';

let quiet = false;
export const setQuiet = (q: boolean) => { quiet = q; };

export const c = {
  brand: chalk.hex('#D97757'),
  dim: chalk.dim,
  bold: chalk.bold,
  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
  info: chalk.cyan,
  muted: chalk.gray,
};

export const log = {
  line: (msg = '') => { if (!quiet) console.log(msg); },
  info: (msg: string) => { if (!quiet) console.log(`  ${c.info('ℹ')} ${msg}`); },
  ok: (msg: string) => { if (!quiet) console.log(`  ${c.ok('✓')} ${msg}`); },
  warn: (msg: string) => console.log(`  ${c.warn('!')} ${msg}`),
  error: (msg: string) => console.error(`  ${c.err('✗')} ${msg}`),
  section: (title: string) => { if (!quiet) console.log(`\n  ${c.bold(c.brand(title))}\n  ${c.muted('─'.repeat(Math.min(60, title.length + 8)))}`); },
};

/** Masks anything that looks like a credential before it is printed. */
export function redact(text: string): string {
  return text
    .replace(/\b(sk-ant-|sk-|ghp_|github_pat_|xox[abpors]-|AKIA|AIza)[A-Za-z0-9_-]{8,}/g, (m) => `${m.slice(0, 6)}…[redacted]`)
    .replace(/(\/\/[^\s:/@]+:)[^\s@/]+@/g, '$1[redacted]@')
    .replace(/((?:token|secret|password|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',]{6,}/gi, '$1[redacted]');
}
