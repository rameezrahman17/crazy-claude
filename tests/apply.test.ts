import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeProject } from '../src/core/analyzer.js';
import { recommend } from '../src/core/recommender.js';
import { applyPlan, buildPlan } from '../src/managers/installer.js';
import { loadManifest, rollbackFiles } from '../src/managers/config-manager.js';
import { PluginManager } from '../src/managers/plugin-manager.js';
import { readMcpState } from '../src/managers/mcp-manager.js';
import { McpJsonSchema, ExportSchema, findLiteralSecrets } from '../src/utils/validation.js';
import { BackupSession, restoreBackup } from '../src/utils/backup.js';
import type { CliOptions } from '../src/types.js';
import type { Exec } from '../src/utils/exec.js';
import { exists, read, tempFixture } from './helpers.js';

const opts = (cwd: string, o: Partial<CliOptions> = {}): CliOptions => ({ cwd, dryRun: false, yes: true, force: false, scope: 'project', ...o });

async function planFor(root: string, ids?: string[]) {
  const profile = await analyzeProject(root);
  const recs = recommend(profile, { claudeAvailable: true, keepSuperseded: true }).recommendations;
  const selected = ids ? recs.filter((r) => ids.includes(r.id)) : recs.filter((r) => !r.requiresApproval);
  return { profile, plan: buildPlan(profile, selected, 'project') };
}

/** Fake `claude` CLI recording every call — tests never touch the real environment. */
function fakeClaude(calls: string[][]): PluginManager {
  const exec: Exec = (_cmd, args) => {
    calls.push(args);
    const out = (stdout: string) => ({ ok: true, code: 0, stdout, stderr: '' });
    if (args[0] === '--version') return out('2.1.0 (Claude Code)');
    if (args.includes('--available')) return out(JSON.stringify({ available: [
      { pluginId: 'typescript-lsp@claude-plugins-official', name: 'typescript-lsp', marketplaceName: 'claude-plugins-official' },
      { pluginId: 'evil@random-market', name: 'evil', marketplaceName: 'random-market' },
    ] }));
    if (args[1] === 'list') return out('[]');
    if (args[1] === 'install') return out('Successfully installed');
    return { ok: false, code: 1, stdout: '', stderr: 'unknown' };
  };
  return new PluginManager('/', exec);
}

describe('dry-run', () => {
  it('writes nothing and executes nothing', async () => {
    const root = tempFixture('react-app');
    const before = fs.readdirSync(root).sort();
    const { profile, plan } = await planFor(root, ['claude-md', 'skill-react-components', 'hook-secret-scan', 'mcp-playwright', 'typescript-lsp']);
    const calls: string[][] = [];
    const results = await applyPlan(profile, plan, opts(root, { dryRun: true }), { plugins: fakeClaude(calls) });
    expect(results.every((r) => r.status === 'planned')).toBe(true);
    expect(fs.readdirSync(root).sort()).toEqual(before);
    expect(calls).toHaveLength(0);
  });
});

describe('apply', () => {
  it('creates config, records a manifest, and is idempotent', async () => {
    const root = tempFixture('react-app');
    const { profile, plan } = await planFor(root);
    const first = await applyPlan(profile, plan, opts(root));
    expect(first.filter((r) => r.status === 'failed')).toEqual([]);
    expect(exists(root, 'CLAUDE.md')).toBe(true);
    expect(exists(root, '.claude/skills/react-components/SKILL.md')).toBe(true);
    expect(exists(root, '.claude/agents/frontend-engineer.md')).toBe(true);
    expect(JSON.parse(read(root, '.claude/settings.json')).hooks.PreToolUse).toBeTruthy();
    expect(loadManifest(root)?.files.length).toBeGreaterThan(5);

    const second = await applyPlan(profile, plan, opts(root));
    expect(second.every((r) => r.status === 'unchanged')).toBe(true);
  });

  it('never silently overwrites an existing file that differs', async () => {
    const root = tempFixture('express-api');
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# hand written\n');
    const { profile, plan } = await planFor(root, ['claude-md']);
    const [r] = await applyPlan(profile, plan, opts(root));
    expect(r!.status).toBe('skipped');
    expect(read(root, 'CLAUDE.md')).toBe('# hand written\n');

    const [alongside] = await applyPlan(profile, plan, opts(root), { resolveConflict: async () => 'alongside' });
    expect(alongside!.status).toBe('written-alongside');
    expect(exists(root, 'CLAUDE.crazy.md')).toBe(true);
    expect(read(root, 'CLAUDE.md')).toBe('# hand written\n');

    const [forced] = await applyPlan(profile, plan, opts(root, { force: true }));
    expect(forced!.status).toBe('updated');
    const m = loadManifest(root)!;
    const rec = m.files.find((f) => f.path === 'CLAUDE.md')!;
    expect(rec.action).toBe('modified');
    expect(read(root, rec.backup!)).toBe('# hand written\n');
  });

  it('adds MCP servers without touching existing ones and writes no secrets', async () => {
    const root = tempFixture('express-api');
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { mongodb: { command: 'my-own' }, mine: { command: 'x' } } }));
    const { profile, plan } = await planFor(root, ['mcp-mongodb', 'mcp-github']);
    await applyPlan(profile, plan, opts(root));
    const state = readMcpState(root);
    expect(state.valid).toBe(true);
    expect((state.servers.mongodb as { command: string }).command).toBe('my-own');
    expect(state.literalSecrets).toEqual([]);
    expect(McpJsonSchema.safeParse(JSON.parse(read(root, '.mcp.json'))).success).toBe(true);
  });

  it('refuses to modify an invalid .mcp.json', async () => {
    const root = tempFixture('react-app');
    fs.writeFileSync(path.join(root, '.mcp.json'), '{ broken');
    const { profile, plan } = await planFor(root, ['mcp-playwright']);
    const [r] = await applyPlan(profile, plan, opts(root));
    expect(r!.status).toBe('failed');
    expect(read(root, '.mcp.json')).toBe('{ broken');
  });

  it('only installs plugins resolved from trusted marketplaces', async () => {
    const root = tempFixture('react-app');
    const profile = await analyzeProject(root);
    const calls: string[][] = [];
    const plan = [
      { kind: 'plugin' as const, recId: 'typescript-lsp', name: 'typescript-lsp', scope: 'project' as const },
      { kind: 'plugin' as const, recId: 'evil', name: 'evil', scope: 'project' as const },
    ];
    const results = await applyPlan(profile, plan, opts(root), { plugins: fakeClaude(calls) });
    expect(results[0]!.status).toBe('installed');
    expect(results[1]!.status).toBe('failed');
    expect(calls.filter((c) => c[1] === 'install')).toEqual([['plugin', 'install', 'typescript-lsp@claude-plugins-official', '--scope', 'project']]);
  });
});

describe('backup and restore', () => {
  it('backs up and restores a file', () => {
    const root = tempFixture('react-app');
    const session = new BackupSession(root, 'test');
    const b = session.backup('package.json')!;
    const original = read(root, 'package.json');
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    restoreBackup(root, b, 'package.json');
    expect(read(root, 'package.json')).toBe(original);
    expect(session.backup('does-not-exist.txt')).toBeUndefined();
  });

  it('rollback removes created files, restores modified ones, and keeps user edits', async () => {
    const root = tempFixture('express-api');
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# mine\n');
    const { profile, plan } = await planFor(root);
    await applyPlan(profile, plan, opts(root, { force: true }));
    fs.appendFileSync(path.join(root, '.claude/agents/code-reviewer.md'), '\nuser edit');

    const res = rollbackFiles(root, loadManifest(root)!, { dryRun: false });
    expect(read(root, 'CLAUDE.md')).toBe('# mine\n');
    expect(res.restored).toContain('CLAUDE.md');
    expect(exists(root, '.claude/skills/api-design/SKILL.md')).toBe(false);
    expect(exists(root, '.claude/skills')).toBe(false);
    expect(exists(root, '.claude/agents/code-reviewer.md')).toBe(true);
    expect(res.skipped.map((s) => s.path)).toContain('.claude/agents/code-reviewer.md');
  });
});

describe('configuration validation', () => {
  it('detects literal secrets but allows ${VAR} placeholders', () => {
    expect(findLiteralSecrets({ env: { T: '${GITHUB_TOKEN}' } })).toEqual([]);
    expect(findLiteralSecrets({ env: { T: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' } })).toEqual(['env.T']);
    expect(findLiteralSecrets({ args: ['postgres://u:hunter2@db.example.com/x'] })).toEqual(['args[0]']);
  });

  it('validates MCP and export schemas', () => {
    expect(McpJsonSchema.safeParse({ mcpServers: { a: { command: 'npx' } } }).success).toBe(true);
    expect(McpJsonSchema.safeParse({ mcpServers: { a: { type: 'http', url: 'not a url' } } }).success).toBe(false);
    expect(ExportSchema.safeParse({ $schema: 'crazy-claude/export@1', exportedAt: 'x', toolVersion: '1', project: { name: 'a', technologies: [] }, scope: 'project', selections: ['rm -rf /'] }).success).toBe(false);
  });
});

describe('generated hooks execute correctly', () => {
  it('protect-sensitive-files and secret-scan block with exit code 2', async () => {
    const root = tempFixture('react-app');
    const { profile, plan } = await planFor(root, ['hook-protect-sensitive-files', 'hook-secret-scan']);
    await applyPlan(profile, plan, opts(root));
    const run = (script: string, input: unknown) =>
      spawnSync('node', [path.join(root, '.claude/hooks/crazy-claude', script)], { input: JSON.stringify(input), encoding: 'utf8' });
    expect(run('protect-sensitive-files.mjs', { tool_input: { file_path: '/p/.env.local' } }).status).toBe(2);
    expect(run('protect-sensitive-files.mjs', { tool_input: { file_path: '/p/.env.example' } }).status).toBe(0);
    expect(run('protect-sensitive-files.mjs', { tool_input: { file_path: '/p/src/app.ts' } }).status).toBe(0);
    const leak = run('secret-scan.mjs', { tool_input: { file_path: 'a.ts', content: 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"' } });
    expect(leak.status).toBe(2);
    expect(leak.stderr).toContain('Anthropic API key');
    expect(leak.stderr).not.toContain('abcdefghijklmnop');
    expect(run('secret-scan.mjs', { tool_input: { file_path: 'a.ts', content: 'const k = process.env.KEY' } }).status).toBe(0);
  });
});
