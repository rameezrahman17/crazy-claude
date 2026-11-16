import fs from 'node:fs';
import path from 'node:path';
import type { CliOptions, ProjectProfile, Recommendation } from '../types.js';
import { generateClaudeMd } from '../generators/claude-md.js';
import { generateSkills, type GeneratedFile } from '../generators/skill-generator.js';
import { generateAgents } from '../generators/agent-generator.js';
import { generateHooks, mergeHookSettings, type HookSettingsEntry } from '../generators/hook-generator.js';
import { MCP_FILE, mcpEntriesFor, mergeMcpServers, readMcpState, requiredEnv } from './mcp-manager.js';
import { PluginManager } from './plugin-manager.js';
import { emptyManifest, loadManifest, recordFile, saveManifest } from './config-manager.js';
import type { McpRegistryEntry } from '../registry/mcp.js';
import { BackupSession } from '../utils/backup.js';
import { readIfExists, readJson, sha256, writeFileAtomic } from '../utils/filesystem.js';
import { SettingsSchema } from '../utils/validation.js';

export const SETTINGS_FILE = '.claude/settings.json';

export type PlanAction =
  | { kind: 'write'; recId: string; path: string; content: string; mode?: number }
  | { kind: 'mcp'; recIds: string[]; servers: McpRegistryEntry[] }
  | { kind: 'hooks-settings'; recIds: string[]; entries: HookSettingsEntry[] }
  | { kind: 'plugin'; recId: string; name: string; scope: CliOptions['scope'] };

export type ActionStatus = 'planned' | 'created' | 'updated' | 'unchanged' | 'skipped' | 'written-alongside' | 'installed' | 'failed';

export interface ActionResult {
  action: PlanAction;
  target: string;
  status: ActionStatus;
  detail?: string;
}

export type ConflictChoice = 'overwrite' | 'alongside' | 'skip';
export type ConflictResolver = (rel: string) => Promise<ConflictChoice>;

export function describeAction(a: PlanAction): string {
  switch (a.kind) {
    case 'write': return a.path;
    case 'mcp': return `${MCP_FILE} ← ${a.servers.map((s) => s.serverName).join(', ')}`;
    case 'hooks-settings': return `${SETTINGS_FILE} ← ${a.entries.length} hook(s)`;
    case 'plugin': return `claude plugin install ${a.name} --scope ${a.scope}`;
  }
}

/** Turns selected recommendations into concrete, side-effect-free plan actions. */
export function buildPlan(profile: ProjectProfile, selected: Recommendation[], scope: CliOptions['scope']): PlanAction[] {
  const ids = selected.map((r) => r.id);
  const actions: PlanAction[] = [];
  const files: GeneratedFile[] = [];

  if (ids.includes('claude-md')) files.push({ path: 'CLAUDE.md', content: generateClaudeMd(profile), recId: 'claude-md' });
  files.push(...generateSkills(profile, ids), ...generateAgents(profile, ids));
  const hooks = generateHooks(profile, ids);
  files.push(...hooks.files);
  for (const f of files) actions.push({ kind: 'write', recId: f.recId, path: f.path, content: f.content, mode: f.mode });

  if (hooks.settings.length) {
    actions.push({ kind: 'hooks-settings', recIds: hooks.files.map((f) => f.recId), entries: hooks.settings });
  }
  const mcp = mcpEntriesFor(ids);
  if (mcp.length) actions.push({ kind: 'mcp', recIds: mcp.map((m) => m.id), servers: mcp });

  for (const r of selected) {
    if (r.type === 'plugin' || r.type === 'lsp') actions.push({ kind: 'plugin', recId: r.id, name: r.name, scope });
  }
  return actions;
}

export interface ApplyDeps {
  plugins?: PluginManager;
  resolveConflict?: ConflictResolver;
  onProgress?: (msg: string) => void;
}

const alongsidePath = (rel: string) => {
  const ext = path.extname(rel);
  return `${rel.slice(0, rel.length - ext.length)}.crazy${ext}`;
};

/**
 * Executes a plan. In dry-run mode nothing is written or executed; every action reports `planned`.
 * Existing files are never overwritten silently: identical → unchanged; different → resolver/--force decides,
 * otherwise skipped. Every modified file is backed up first, and every change is recorded in the manifest.
 */
export async function applyPlan(profile: ProjectProfile, actions: PlanAction[], opts: CliOptions, deps: ApplyDeps = {}): Promise<ActionResult[]> {
  const root = profile.root;
  const results: ActionResult[] = [];
  if (opts.dryRun) {
    return actions.map((a) => ({ action: a, target: describeAction(a), status: 'planned' as const, detail: dryRunDetail(root, a) }));
  }

  const backup = new BackupSession(root);
  const manifest = loadManifest(root) ?? emptyManifest(opts.scope);
  manifest.scope = opts.scope;
  const progress = deps.onProgress ?? (() => {});

  const writeTracked = (rel: string, content: string, recId: string | undefined, mode?: number): 'created' | 'updated' => {
    const abs = path.join(root, rel);
    const existed = fs.existsSync(abs);
    const backupRel = existed ? backup.backup(rel) : undefined;
    writeFileAtomic(abs, content, mode);
    if (mode) fs.chmodSync(abs, mode);
    recordFile(manifest, { path: rel, action: existed ? 'modified' : 'created', sha256: sha256(content), backup: backupRel, recId });
    return existed ? 'updated' : 'created';
  };

  let pluginCache: { available: ReturnType<PluginManager['listAvailable']>; installed: ReturnType<PluginManager['listInstalled']> } | undefined;

  for (const a of actions) {
    const target = describeAction(a);
    progress(target);
    try {
      if (a.kind === 'write') {
        const existing = readIfExists(path.join(root, a.path));
        if (existing === undefined) {
          results.push({ action: a, target, status: writeTracked(a.path, a.content, a.recId, a.mode) });
        } else if (existing === a.content) {
          results.push({ action: a, target, status: 'unchanged' });
        } else {
          const choice: ConflictChoice = opts.force ? 'overwrite' : deps.resolveConflict ? await deps.resolveConflict(a.path) : 'skip';
          if (choice === 'overwrite') {
            writeTracked(a.path, a.content, a.recId, a.mode);
            results.push({ action: a, target, status: 'updated', detail: 'previous version backed up' });
          } else if (choice === 'alongside') {
            const alt = alongsidePath(a.path);
            writeTracked(alt, a.content, a.recId, a.mode);
            results.push({ action: a, target, status: 'written-alongside', detail: `wrote ${alt} — merge manually` });
          } else {
            results.push({ action: a, target, status: 'skipped', detail: 'file exists with different content (use --force to back up and replace)' });
          }
        }
      } else if (a.kind === 'mcp') {
        const state = readMcpState(root);
        if (state.exists && !state.valid) {
          results.push({ action: a, target, status: 'failed', detail: `existing ${MCP_FILE} is invalid (${state.error}); not modified` });
          continue;
        }
        const current = readJson<Record<string, unknown>>(path.join(root, MCP_FILE));
        const { doc, added, kept } = mergeMcpServers(current.ok ? current.value : undefined, a.servers);
        if (!added.length) {
          results.push({ action: a, target, status: 'unchanged', detail: `already configured: ${kept.join(', ')}` });
          continue;
        }
        const status = writeTracked(MCP_FILE, JSON.stringify(doc, null, 2) + '\n', a.recIds.join(','));
        manifest.mcpServers = [...new Set([...manifest.mcpServers, ...added])];
        const env = requiredEnv(a.servers.filter((s) => added.includes(s.serverName)));
        const missing = env.filter((e) => !e.set).map((e) => e.name);
        results.push({
          action: a, target, status,
          detail: `added ${added.join(', ')}${kept.length ? `; left existing ${kept.join(', ')} untouched` : ''}${missing.length ? `; export ${missing.join(', ')} before starting Claude` : ''}`,
        });
      } else if (a.kind === 'hooks-settings') {
        const abs = path.join(root, SETTINGS_FILE);
        const current = readJson<Record<string, unknown>>(abs);
        if (!current.ok && !current.missing) {
          results.push({ action: a, target, status: 'failed', detail: `${SETTINGS_FILE} is not valid JSON; not modified` });
          continue;
        }
        const base = current.ok ? current.value : {};
        if (!SettingsSchema.safeParse(base).success) {
          results.push({ action: a, target, status: 'failed', detail: `${SETTINGS_FILE} has an unexpected hooks shape; not modified` });
          continue;
        }
        const { settings, added } = mergeHookSettings(base, a.entries);
        if (!added) {
          results.push({ action: a, target, status: 'unchanged' });
          continue;
        }
        const status = writeTracked(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', a.recIds.join(','));
        results.push({ action: a, target, status, detail: `${added} hook(s) registered` });
      } else if (a.kind === 'plugin') {
        const pm = deps.plugins ?? new PluginManager(root);
        pluginCache ??= { available: pm.listAvailable(), installed: pm.listInstalled() };
        if (pluginCache.installed.some((p) => p.name === a.name)) {
          results.push({ action: a, target, status: 'unchanged', detail: 'already installed' });
          continue;
        }
        const id = pm.resolve(a.name, pluginCache.available);
        if (!id) {
          results.push({ action: a, target, status: 'failed', detail: 'not found in a trusted configured marketplace — not installed' });
          continue;
        }
        const r = pm.install(id, a.scope);
        if (r.ok) {
          manifest.plugins.push({ id, scope: a.scope });
          pluginCache.installed.push({ id, name: a.name, scope: a.scope, enabled: true });
        }
        results.push({ action: { ...a }, target: `${id} (${a.scope})`, status: r.ok ? 'installed' : 'failed', detail: r.message });
      }
    } catch (e) {
      results.push({ action: a, target, status: 'failed', detail: (e as Error).message });
    }
  }

  const ids = actions.flatMap((a) => ('recId' in a ? [a.recId] : a.recIds));
  manifest.selections = [...new Set([...manifest.selections, ...ids])];
  saveManifest(root, manifest);
  return results;
}

function dryRunDetail(root: string, a: PlanAction): string {
  if (a.kind === 'write') {
    const existing = readIfExists(path.join(root, a.path));
    if (existing === undefined) return `would create (${a.content.split('\n').length} lines)`;
    return existing === a.content ? 'already up to date' : 'exists with different content — would ask / skip (backup on overwrite)';
  }
  if (a.kind === 'mcp') {
    const state = readMcpState(root);
    const names = a.servers.map((s) => s.serverName);
    const present = names.filter((n) => n in state.servers);
    return `would add ${names.filter((n) => !present.includes(n)).join(', ') || 'nothing'}${present.length ? ` (keeps existing: ${present.join(', ')})` : ''}`;
  }
  if (a.kind === 'hooks-settings') return `would ${readIfExists(path.join(root, SETTINGS_FILE)) === undefined ? 'create settings with' : 'merge'} ${a.entries.length} hook(s) (existing hooks kept)`;
  return 'would verify the plugin in a trusted marketplace, then install';
}
