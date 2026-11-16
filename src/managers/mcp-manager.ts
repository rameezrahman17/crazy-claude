import path from 'node:path';
import { MCP_SERVERS, type McpRegistryEntry } from '../registry/mcp.js';
import { readJson } from '../utils/filesystem.js';
import { McpJsonSchema, findLiteralSecrets } from '../utils/validation.js';

export const MCP_FILE = '.mcp.json';

export interface McpState {
  exists: boolean;
  valid: boolean;
  error?: string;
  servers: Record<string, unknown>;
  literalSecrets: string[];
}

/** Reads and validates the project-scoped `.mcp.json`. */
export function readMcpState(root: string): McpState {
  const r = readJson<unknown>(path.join(root, MCP_FILE));
  if (!r.ok) return { exists: !r.missing, valid: r.missing, error: r.missing ? undefined : r.error, servers: {}, literalSecrets: [] };
  const parsed = McpJsonSchema.safeParse(r.value);
  const servers = (r.value as { mcpServers?: Record<string, unknown> })?.mcpServers ?? {};
  return {
    exists: true,
    valid: parsed.success,
    error: parsed.success ? undefined : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    servers,
    literalSecrets: findLiteralSecrets(servers),
  };
}

export function mcpEntriesFor(ids: string[]): McpRegistryEntry[] {
  return MCP_SERVERS.filter((m) => ids.includes(m.id));
}

/**
 * Adds servers that are not already configured. Existing server entries are never modified.
 * Returns the merged document and which servers were added / left alone.
 */
export function mergeMcpServers(existing: Record<string, unknown> | undefined, entries: McpRegistryEntry[]) {
  const doc = structuredClone(existing ?? {}) as { mcpServers?: Record<string, unknown> };
  doc.mcpServers ??= {};
  const added: string[] = [];
  const kept: string[] = [];
  for (const e of entries) {
    if (e.serverName in doc.mcpServers) {
      kept.push(e.serverName);
      continue;
    }
    doc.mcpServers[e.serverName] = structuredClone(e.config);
    added.push(e.serverName);
  }
  return { doc, added, kept };
}

/** Env vars the selected servers need, with whether they're currently set (values are never printed). */
export function requiredEnv(entries: McpRegistryEntry[]): Array<{ name: string; set: boolean; server: string }> {
  return entries.flatMap((e) => e.requiredEnv.map((name) => ({ name, set: Boolean(process.env[name]), server: e.serverName })));
}
