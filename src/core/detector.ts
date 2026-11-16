import path from 'node:path';
import type { DetectedTech, TechCategory } from '../types.js';
import type { ScanResult } from './scanner.js';

interface TechRule {
  id: string;
  name: string;
  category: TechCategory;
  /** npm package names (exact) or prefixes ending with '*' */
  npm?: string[];
  /** python distribution names (lowercase) */
  py?: string[];
  /** regexes tested against relative file paths */
  files?: RegExp[];
  /** Implied by another detected tech */
  impliedBy?: string[];
}

export const TECH_RULES: TechRule[] = [
  // Languages / runtimes
  { id: 'typescript', name: 'TypeScript', category: 'language', npm: ['typescript'], files: [/(^|\/)tsconfig(\.[\w-]+)?\.json$/] },
  { id: 'javascript', name: 'JavaScript', category: 'language', files: [/(^|\/)package\.json$/, /\.(m|c)?jsx?$/] },
  { id: 'nodejs', name: 'Node.js', category: 'backend', files: [/(^|\/)package\.json$/, /(^|\/)\.nvmrc$/] },
  { id: 'python', name: 'Python', category: 'language', files: [/(^|\/)(requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|setup\.py)$/, /\.py$/] },
  { id: 'go', name: 'Go', category: 'language', files: [/(^|\/)go\.mod$/] },
  { id: 'rust', name: 'Rust', category: 'language', files: [/(^|\/)Cargo\.toml$/] },

  // Frontend
  { id: 'react', name: 'React', category: 'frontend', npm: ['react', 'react-dom'] },
  { id: 'nextjs', name: 'Next.js', category: 'frontend', npm: ['next'], files: [/(^|\/)next\.config\.(js|mjs|ts|cjs)$/] },
  { id: 'vue', name: 'Vue', category: 'frontend', npm: ['vue', 'nuxt'], files: [/\.vue$/] },
  { id: 'nuxt', name: 'Nuxt', category: 'frontend', npm: ['nuxt'], files: [/(^|\/)nuxt\.config\.(js|ts|mjs)$/] },
  { id: 'angular', name: 'Angular', category: 'frontend', npm: ['@angular/core'], files: [/(^|\/)angular\.json$/] },
  { id: 'svelte', name: 'Svelte', category: 'frontend', npm: ['svelte', '@sveltejs/kit'] },
  { id: 'vite', name: 'Vite', category: 'tooling', npm: ['vite'], files: [/(^|\/)vite\.config\.(js|ts|mjs)$/] },
  { id: 'tailwind', name: 'Tailwind CSS', category: 'styling', npm: ['tailwindcss', '@tailwindcss/*'], files: [/(^|\/)tailwind\.config\.(js|ts|cjs|mjs)$/] },
  { id: 'threejs', name: 'Three.js', category: 'graphics', npm: ['three', '@react-three/fiber'] },

  // Backend
  { id: 'express', name: 'Express', category: 'backend', npm: ['express'] },
  { id: 'nestjs', name: 'NestJS', category: 'backend', npm: ['@nestjs/core'], files: [/(^|\/)nest-cli\.json$/] },
  { id: 'fastify', name: 'Fastify', category: 'backend', npm: ['fastify'] },
  { id: 'hono', name: 'Hono', category: 'backend', npm: ['hono'] },
  { id: 'django', name: 'Django', category: 'backend', py: ['django', 'djangorestframework'], files: [/(^|\/)manage\.py$/] },
  { id: 'fastapi', name: 'FastAPI', category: 'backend', py: ['fastapi'] },
  { id: 'flask', name: 'Flask', category: 'backend', py: ['flask'] },

  // Databases
  { id: 'postgresql', name: 'PostgreSQL', category: 'database', npm: ['pg', 'postgres', '@neondatabase/serverless', '@vercel/postgres'], py: ['psycopg2', 'psycopg2-binary', 'psycopg', 'asyncpg'] },
  { id: 'mysql', name: 'MySQL', category: 'database', npm: ['mysql', 'mysql2'], py: ['mysqlclient', 'pymysql'] },
  { id: 'mongodb', name: 'MongoDB', category: 'database', npm: ['mongodb', 'mongoose'], py: ['pymongo', 'motor', 'mongoengine'] },
  { id: 'redis', name: 'Redis', category: 'database', npm: ['redis', 'ioredis', '@upstash/redis'], py: ['redis'] },
  { id: 'sqlite', name: 'SQLite', category: 'database', npm: ['better-sqlite3', 'sqlite3'] },
  { id: 'supabase', name: 'Supabase', category: 'database', npm: ['@supabase/supabase-js', '@supabase/ssr'], py: ['supabase'], files: [/(^|\/)supabase\/config\.toml$/] },

  // ORMs
  { id: 'prisma', name: 'Prisma', category: 'orm', npm: ['prisma', '@prisma/client'], files: [/(^|\/)schema\.prisma$/] },
  { id: 'drizzle', name: 'Drizzle', category: 'orm', npm: ['drizzle-orm', 'drizzle-kit'], files: [/(^|\/)drizzle\.config\.(ts|js)$/] },
  { id: 'typeorm', name: 'TypeORM', category: 'orm', npm: ['typeorm'] },
  { id: 'sqlalchemy', name: 'SQLAlchemy', category: 'orm', py: ['sqlalchemy', 'sqlmodel'] },

  // Testing
  { id: 'jest', name: 'Jest', category: 'testing', npm: ['jest'], files: [/(^|\/)jest\.config\.(js|ts|cjs|mjs)$/] },
  { id: 'vitest', name: 'Vitest', category: 'testing', npm: ['vitest'], files: [/(^|\/)vitest\.config\.(js|ts|mjs)$/] },
  { id: 'playwright', name: 'Playwright', category: 'testing', npm: ['@playwright/test', 'playwright'], py: ['playwright', 'pytest-playwright'], files: [/(^|\/)playwright\.config\.(js|ts)$/] },
  { id: 'cypress', name: 'Cypress', category: 'testing', npm: ['cypress'] },
  { id: 'testing-library', name: 'Testing Library', category: 'testing', npm: ['@testing-library/*'] },
  { id: 'pytest', name: 'pytest', category: 'testing', py: ['pytest'], files: [/(^|\/)(pytest\.ini|conftest\.py)$/] },

  // Auth
  { id: 'nextauth', name: 'Auth.js / NextAuth', category: 'auth', npm: ['next-auth', '@auth/core'] },
  { id: 'clerk', name: 'Clerk', category: 'auth', npm: ['@clerk/*'] },
  { id: 'passport', name: 'Passport', category: 'auth', npm: ['passport'] },
  { id: 'jwt', name: 'JSON Web Tokens', category: 'auth', npm: ['jsonwebtoken', 'jose'], py: ['pyjwt', 'python-jose'] },
  { id: 'lucia', name: 'Lucia', category: 'auth', npm: ['lucia'] },
  { id: 'better-auth', name: 'Better Auth', category: 'auth', npm: ['better-auth'] },
  { id: 'firebase-auth', name: 'Firebase', category: 'auth', npm: ['firebase', 'firebase-admin'] },

  // Infra / tooling
  { id: 'docker', name: 'Docker', category: 'infra', files: [/(^|\/)Dockerfile(\.[\w-]+)?$/, /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/] },
  { id: 'github-actions', name: 'GitHub Actions', category: 'infra', files: [/^\.github\/workflows\/.+\.ya?ml$/] },
  { id: 'eslint', name: 'ESLint', category: 'tooling', npm: ['eslint'], files: [/(^|\/)(\.eslintrc(\.\w+)?|eslint\.config\.(js|mjs|cjs|ts))$/] },
  { id: 'prettier', name: 'Prettier', category: 'tooling', npm: ['prettier'], files: [/(^|\/)\.prettierrc(\.\w+)?$/] },
  { id: 'biome', name: 'Biome', category: 'tooling', npm: ['@biomejs/biome'], files: [/(^|\/)biome\.jsonc?$/] },
  { id: 'ruff', name: 'Ruff', category: 'tooling', py: ['ruff'], files: [/(^|\/)ruff\.toml$/] },
  { id: 'stripe', name: 'Stripe', category: 'backend', npm: ['stripe', '@stripe/stripe-js'], py: ['stripe'] },
  { id: 'sentry', name: 'Sentry', category: 'tooling', npm: ['@sentry/*'], py: ['sentry-sdk'] },
  { id: 'vercel', name: 'Vercel', category: 'infra', files: [/(^|\/)vercel\.json$/] },
];

/** Collects every npm dependency name across root + workspace package.json files. */
export function collectNpmDeps(scan: ScanResult): Map<string, string> {
  const deps = new Map<string, string>();
  for (const { path: p, json } of scan.packageJsons) {
    for (const block of [json.dependencies, json.devDependencies, json.peerDependencies]) {
      for (const name of Object.keys(block ?? {})) if (!deps.has(name)) deps.set(name, p);
    }
  }
  return deps;
}

/** Extracts python distribution names from requirements*.txt, pyproject.toml and Pipfile. */
export function collectPythonDeps(scan: ScanResult): Map<string, string> {
  const deps = new Map<string, string>();
  const add = (raw: string, file: string) => {
    const m = raw.trim().toLowerCase().match(/^([a-z0-9][a-z0-9._-]*)/);
    if (m?.[1] && !deps.has(m[1])) deps.set(m[1].replace(/_/g, '-'), file);
  };
  for (const f of scan.files) {
    const base = path.basename(f);
    if (/^requirements[\w.-]*\.txt$/.test(base)) {
      for (const line of (scan.readText(f) ?? '').split('\n')) {
        if (line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('-')) add(line, f);
      }
    } else if (base === 'pyproject.toml' || base === 'Pipfile') {
      const text = scan.readText(f) ?? '';
      // PEP 621 arrays: "fastapi>=0.1", and poetry/pipfile tables: fastapi = "^0.1"
      for (const m of text.matchAll(/^\s*"([A-Za-z0-9][A-Za-z0-9._-]*)\s*[\[<>=!~;"]/gm)) add(m[1]!, f);
      for (const m of text.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*["{]/gm)) {
        const name = m[1]!.toLowerCase();
        if (!['name', 'version', 'description', 'python', 'readme', 'license', 'requires-python', 'url', 'verify_ssl'].includes(name)) add(name, f);
      }
    }
  }
  return deps;
}

function npmMatch(pattern: string, deps: Map<string, string>): string[] {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return [...deps.keys()].filter((d) => d.startsWith(prefix));
  }
  return deps.has(pattern) ? [pattern] : [];
}

export function detectTechnologies(scan: ScanResult): DetectedTech[] {
  const npmDeps = collectNpmDeps(scan);
  const pyDeps = collectPythonDeps(scan);
  const found = new Map<string, DetectedTech>();

  for (const rule of TECH_RULES) {
    const evidence: string[] = [];
    let confidence = 0;

    for (const pattern of rule.npm ?? []) {
      for (const dep of npmMatch(pattern, npmDeps)) {
        evidence.push(`${npmDeps.get(dep)} dependency: ${dep}`);
        confidence = Math.max(confidence, 0.95);
      }
    }
    for (const name of rule.py ?? []) {
      if (pyDeps.has(name)) {
        evidence.push(`${pyDeps.get(name)} dependency: ${name}`);
        confidence = Math.max(confidence, 0.95);
      }
    }
    for (const re of rule.files ?? []) {
      const matches = scan.files.filter((f) => re.test(f));
      if (matches.length) {
        evidence.push(`file: ${matches[0]}${matches.length > 1 ? ` (+${matches.length - 1} more)` : ''}`);
        // Source-file extension matches are weaker evidence than config files.
        confidence = Math.max(confidence, re.source.includes('\\.(m|c)?jsx?$') || re.source === '\\.py$' ? 0.6 : 0.85);
      }
    }
    if (evidence.length) {
      found.set(rule.id, { id: rule.id, name: rule.name, category: rule.category, confidence, evidence: evidence.slice(0, 4) });
    }
  }

  // Next.js implies React; Nuxt implies Vue.
  if (found.has('nextjs') && !found.has('react')) {
    found.set('react', { id: 'react', name: 'React', category: 'frontend', confidence: 0.9, evidence: ['implied by Next.js'] });
  }
  // Tools configured via pyproject sections rather than dependencies or dedicated files.
  const pyproject = scan.readText('pyproject.toml') ?? '';
  for (const [id, name] of [['ruff', 'Ruff'], ['pytest', 'pytest']] as const) {
    const section = id === 'pytest' ? 'tool.pytest' : 'tool.ruff';
    if (!found.has(id) && pyproject.includes(`[${section}`)) {
      found.set(id, { id, name, category: id === 'ruff' ? 'tooling' : 'testing', confidence: 0.9, evidence: [`pyproject.toml [${section}]`] });
    }
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
}
