import type { ProjectProfile, Recommendation } from '../types.js';
import { REGISTRY, type RegistryEntry } from '../registry/index.js';
import { matchEntry, scoreEntry } from './scoring.js';

export interface RecommendContext {
  /** When false, plugin/LSP recommendations are dropped (they need the `claude` CLI). */
  claudeAvailable: boolean;
  /** Plugin names already installed (bare names) — marked, not re-recommended. */
  installedPlugins?: string[];
  /** MCP server names already configured. */
  existingMcpServers?: string[];
  registry?: RegistryEntry[];
  /** Keep entries superseded by a *recommended* (not installed) plugin — used when the user explicitly asks for them. */
  keepSuperseded?: boolean;
}

export interface RecommendResult {
  recommendations: Recommendation[];
  /** Entries removed because a better equivalent was recommended or already present. */
  skipped: Array<{ id: string; reason: string }>;
}

export function toRecommendation(entry: RegistryEntry, matched: string[], priority: number): Recommendation {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    description: entry.description,
    reasons: [entry.reason(matched)],
    technologies: matched,
    source: entry.source,
    compatibility: entry.compatibility,
    security: entry.security,
    priority,
    requiresApproval: entry.requiresApproval,
    supersedes: entry.supersedes,
  };
}

export function recommend(profile: ProjectProfile, ctx: RecommendContext): RecommendResult {
  const registry = ctx.registry ?? REGISTRY;
  const skipped: RecommendResult['skipped'] = [];
  const byId = new Map<string, Recommendation>();
  const installed = new Set(ctx.installedPlugins ?? []);
  const existingMcp = new Set(ctx.existingMcpServers ?? []);

  for (const entry of registry) {
    if (byId.has(entry.id)) {
      skipped.push({ id: entry.id, reason: 'duplicate registry id' });
      continue;
    }
    const match = matchEntry(entry, profile);
    if (!match) continue;
    if ((entry.type === 'plugin' || entry.type === 'lsp') && !ctx.claudeAvailable) {
      skipped.push({ id: entry.id, reason: 'Claude Code CLI not found — plugins cannot be installed' });
      continue;
    }
    if ((entry.type === 'plugin' || entry.type === 'lsp') && installed.has(entry.name)) {
      skipped.push({ id: entry.id, reason: 'plugin already installed' });
      // An installed plugin still makes its MCP equivalents redundant.
      for (const s of entry.supersedes ?? []) skipped.push({ id: s, reason: `provided by installed plugin ${entry.name}` });
      continue;
    }
    if (entry.type === 'mcp' && 'serverName' in entry && existingMcp.has(String((entry as { serverName: string }).serverName))) {
      skipped.push({ id: entry.id, reason: 'MCP server already configured' });
      continue;
    }
    if (entry.type === 'skill' && profile.existing.skills.includes(entry.id.replace(/^skill-/, ''))) {
      skipped.push({ id: entry.id, reason: 'skill already exists in .claude/skills' });
      continue;
    }
    if (entry.type === 'agent' && profile.existing.agents.includes(entry.id.replace(/^agent-/, ''))) {
      skipped.push({ id: entry.id, reason: 'agent already exists in .claude/agents' });
      continue;
    }
    byId.set(entry.id, toRecommendation(entry, match.matched, scoreEntry(entry, match)));
  }

  // Remove ids superseded by a kept recommendation or an installed plugin.
  const supersededBy = new Map<string, string>();
  if (!ctx.keepSuperseded) for (const rec of byId.values()) for (const s of rec.supersedes ?? []) supersededBy.set(s, rec.name);
  for (const s of skipped) if (s.reason.startsWith('provided by')) supersededBy.set(s.id, s.reason);
  for (const [id, by] of supersededBy) {
    if (byId.delete(id) && !skipped.some((s) => s.id === id)) skipped.push({ id, reason: `covered by ${by}` });
  }

  const recommendations = [...byId.values()].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  return { recommendations, skipped };
}
