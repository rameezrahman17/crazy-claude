import fg from 'fast-glob';
import fs from 'node:fs';
import path from 'node:path';

/** Directories never scanned — dependencies, VCS, build output, caches. */
export const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.output', '.svelte-kit',
  'coverage', '.turbo', '.cache', '.venv', 'venv', 'env', '__pycache__', '.mypy_cache',
  '.pytest_cache', 'target', 'vendor', '.idea', '.vscode', '.crazy-claude', 'fixtures', '__fixtures__',
];

/** Files we never read, even if listed — they may contain secrets. */
const SECRET_PATTERNS = [/^\.env(\..*)?$/, /\.pem$/, /\.key$/, /^id_rsa/, /credentials/i, /\.p12$/];

const MAX_READ_BYTES = 512 * 1024;
const MAX_FILES = 5000;

export interface ScanResult {
  root: string;
  files: string[];
  packageJsons: Array<{ path: string; json: PackageJson }>;
  readText: (rel: string) => string | undefined;
  exists: (rel: string) => boolean;
}

export interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: unknown;
  packageManager?: string;
}

export function isSecretFile(rel: string): boolean {
  const base = path.basename(rel);
  return SECRET_PATTERNS.some((re) => re.test(base));
}

export async function scanProject(root: string): Promise<ScanResult> {
  const files = await fg(['**/*'], {
    cwd: root,
    dot: true,
    onlyFiles: true,
    deep: 6,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: IGNORED_DIRS.map((d) => `**/${d}/**`),
  });
  const limited = files.slice(0, MAX_FILES).sort();
  const fileSet = new Set(limited);

  const readText = (rel: string): string | undefined => {
    if (isSecretFile(rel)) return undefined;
    const abs = path.join(root, rel);
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > MAX_READ_BYTES) return undefined;
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return undefined;
    }
  };

  const packageJsons: ScanResult['packageJsons'] = [];
  for (const f of limited) {
    if (path.basename(f) !== 'package.json') continue;
    if (f.split('/').length > 3) continue; // root + workspaces only (packages/x/package.json)
    const text = readText(f);
    if (!text) continue;
    try {
      packageJsons.push({ path: f, json: JSON.parse(text) as PackageJson });
    } catch {
      /* malformed package.json — reported by doctor */
    }
  }
  packageJsons.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  return {
    root,
    files: limited,
    packageJsons,
    readText,
    exists: (rel) => fileSet.has(rel) || fs.existsSync(path.join(root, rel)),
  };
}
