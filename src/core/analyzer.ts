import fs from 'node:fs';
import path from 'node:path';
import type { PackageManager, ProjectProfile } from '../types.js';
import { detectTechnologies } from './detector.js';
import { scanProject, type ScanResult } from './scanner.js';

const NOTABLE_DIRS = [
  'src', 'app', 'pages', 'components', 'lib', 'server', 'api', 'routes', 'controllers', 'services',
  'models', 'prisma', 'db', 'migrations', 'tests', 'test', '__tests__', 'e2e', 'public', 'packages',
  'apps', 'scripts', 'docs', 'supabase', 'src/app', 'src/pages', 'src/components', 'src/lib', 'src/server',
];

const NOTABLE_CONFIGS = /^(package\.json|tsconfig\.json|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|next\.config\.\w+|vite\.config\.\w+|tailwind\.config\.\w+|jest\.config\.\w+|vitest\.config\.\w+|playwright\.config\.\w+|drizzle\.config\.\w+|pyproject\.toml|requirements\.txt|manage\.py|\.eslintrc(\.\w+)?|eslint\.config\.\w+|\.prettierrc(\.\w+)?|biome\.json|turbo\.json|nx\.json|pnpm-workspace\.yaml|vercel\.json)$/;

function detectPackageManager(scan: ScanResult): PackageManager {
  const root = scan.packageJsons.find((p) => p.path === 'package.json')?.json;
  const declared = root?.packageManager?.split('@')[0];
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'npm' || declared === 'bun') return declared;
  if (scan.exists('pnpm-lock.yaml')) return 'pnpm';
  if (scan.exists('yarn.lock')) return 'yarn';
  if (scan.exists('bun.lockb') || scan.exists('bun.lock')) return 'bun';
  if (scan.exists('package-lock.json') || scan.exists('package.json')) return 'npm';
  if (scan.exists('uv.lock')) return 'uv';
  if (scan.exists('poetry.lock')) return 'poetry';
  if (scan.exists('requirements.txt') || scan.exists('pyproject.toml')) return 'pip';
  return 'unknown';
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export async function analyzeProject(root: string): Promise<ProjectProfile> {
  const scan = await scanProject(root);
  const technologies = detectTechnologies(scan);
  const rootPkg = scan.packageJsons.find((p) => p.path === 'package.json')?.json;

  const languages = technologies.filter((t) => t.category === 'language').map((t) => t.name);
  // When TypeScript is used, "JavaScript" is implied and adds noise.
  const langs = languages.includes('TypeScript') ? languages.filter((l) => l !== 'JavaScript') : languages;

  const pyName = scan.readText('pyproject.toml')?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];

  return {
    root,
    name: rootPkg?.name ?? pyName ?? path.basename(root),
    description: rootPkg?.description,
    packageManager: detectPackageManager(scan),
    languages: langs,
    technologies,
    scripts: rootPkg?.scripts ?? {},
    directories: NOTABLE_DIRS.filter((d) => fs.existsSync(path.join(root, d)) && fs.statSync(path.join(root, d)).isDirectory()),
    configFiles: scan.files.filter((f) => !f.includes('/') && NOTABLE_CONFIGS.test(f)),
    isMonorepo: Boolean(rootPkg?.workspaces) || scan.exists('pnpm-workspace.yaml') || scan.exists('turbo.json') || scan.exists('nx.json'),
    hasGit: fs.existsSync(path.join(root, '.git')),
    existing: {
      claudeMd: fs.existsSync(path.join(root, 'CLAUDE.md')),
      claudeDir: fs.existsSync(path.join(root, '.claude')),
      mcpJson: fs.existsSync(path.join(root, '.mcp.json')),
      settingsJson: fs.existsSync(path.join(root, '.claude', 'settings.json')),
      skills: listDir(path.join(root, '.claude', 'skills')),
      agents: listDir(path.join(root, '.claude', 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')),
    },
    fileCount: scan.files.length,
  };
}

export const has = (profile: ProjectProfile, ...ids: string[]): boolean =>
  ids.some((id) => profile.technologies.some((t) => t.id === id));

export const techNames = (profile: ProjectProfile, ...ids: string[]): string[] =>
  profile.technologies.filter((t) => ids.includes(t.id)).map((t) => t.name);

/** Returns the command used to run a package.json script with the detected package manager. */
export function runScript(profile: ProjectProfile, script: string): string {
  const pm = profile.packageManager;
  if (pm === 'yarn') return `yarn ${script}`;
  if (pm === 'pnpm') return `pnpm ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return script === 'test' || script === 'start' ? `npm ${script}` : `npm run ${script}`;
}
