import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { analyzeProject } from '../src/core/analyzer.js';
import { collectNpmDeps, collectPythonDeps } from '../src/core/detector.js';
import { scanProject, isSecretFile } from '../src/core/scanner.js';
import { FIXTURES } from './helpers.js';

const ids = async (name: string) => (await analyzeProject(path.join(FIXTURES, name))).technologies.map((t) => t.id);

describe('project detection', () => {
  it('detects a Vite React + TypeScript app', async () => {
    const t = await ids('react-app');
    expect(t).toEqual(expect.arrayContaining(['react', 'typescript', 'vite', 'vitest', 'tailwind', 'eslint', 'prettier', 'testing-library']));
    expect(t).not.toContain('nextjs');
  });

  it('detects Next.js with Prisma, Postgres, NextAuth and Playwright', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'nextjs-app'));
    expect(p.technologies.map((t) => t.id)).toEqual(expect.arrayContaining(['nextjs', 'react', 'prisma', 'postgresql', 'nextauth', 'playwright', 'tailwind']));
    expect(p.packageManager).toBe('pnpm');
    expect(p.directories).toContain('app');
  });

  it('detects Express + MongoDB + Docker + Jest with yarn', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'express-api'));
    expect(p.technologies.map((t) => t.id)).toEqual(expect.arrayContaining(['express', 'mongodb', 'redis', 'jwt', 'docker', 'jest', 'eslint']));
    expect(p.packageManager).toBe('yarn');
    expect(p.scripts.lint).toBe('eslint src');
  });

  it('detects a FastAPI Python project from requirements and pyproject', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'python-api'));
    expect(p.technologies.map((t) => t.id)).toEqual(expect.arrayContaining(['python', 'fastapi', 'sqlalchemy', 'postgresql', 'pytest', 'ruff']));
    expect(p.technologies.map((t) => t.id)).not.toContain('nodejs');
    expect(p.name).toBe('python-api');
    expect(p.packageManager).toBe('pip');
  });

  it('records evidence for each detection', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'nextjs-app'));
    const next = p.technologies.find((t) => t.id === 'nextjs')!;
    expect(next.evidence.some((e) => e.includes('dependency: next'))).toBe(true);
    expect(next.confidence).toBeGreaterThan(0.9);
  });
});

describe('dependency detection', () => {
  it('collects npm deps across dependency blocks', async () => {
    const deps = collectNpmDeps(await scanProject(path.join(FIXTURES, 'react-app')));
    expect(deps.has('react')).toBe(true);
    expect(deps.has('vitest')).toBe(true);
  });

  it('parses python requirement specifiers, extras and comments', async () => {
    const deps = collectPythonDeps(await scanProject(path.join(FIXTURES, 'python-api')));
    expect([...deps.keys()]).toEqual(expect.arrayContaining(['fastapi', 'uvicorn', 'sqlalchemy', 'psycopg2-binary', 'pytest', 'pydantic']));
    expect(deps.has('comment')).toBe(false);
    expect(deps.has('name')).toBe(false);
  });

  it('never reads secret files', () => {
    expect(isSecretFile('.env')).toBe(true);
    expect(isSecretFile('config/.env.production')).toBe(true);
    expect(isSecretFile('certs/server.pem')).toBe(true);
    expect(isSecretFile('package.json')).toBe(false);
  });
});
