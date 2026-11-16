import type { RegistryEntry } from './types.js';

/** A server entry as written to `.mcp.json` (Claude Code expands ${VAR} placeholders at runtime). */
export type McpServerConfig =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> };

export interface McpRegistryEntry extends RegistryEntry {
  serverName: string;
  config: McpServerConfig;
  /** Environment variables the user must export; values are never written by crazy-claude. */
  requiredEnv: string[];
}

const mcp = (e: Omit<McpRegistryEntry, 'type' | 'requiresApproval'>): McpRegistryEntry => ({ ...e, type: 'mcp', requiresApproval: true });

export const MCP_SERVERS: McpRegistryEntry[] = [
  mcp({
    id: 'mcp-context7', name: 'Context7 MCP', serverName: 'context7', triggers: [], always: true,
    description: 'Current library documentation lookup via Upstash Context7.',
    reason: () => 'Gives Claude version-accurate docs for your dependencies.',
    basePriority: 55, requiredEnv: [],
    config: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    source: { trust: 'official-vendor', origin: 'npm: @upstash/context7-mcp', reference: 'https://github.com/upstash/context7' },
    compatibility: 'Node.js 18+.', security: 'Queries are sent to context7.com.',
  }),
  mcp({
    id: 'mcp-playwright', name: 'Playwright MCP', serverName: 'playwright',
    triggers: ['playwright', 'react', 'nextjs', 'vue', 'angular', 'svelte'],
    description: 'Browser automation through accessibility snapshots.',
    reason: (m) => `${m.join(', ')} detected — Claude can verify UI in a real browser.`,
    basePriority: 54, requiredEnv: [],
    config: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
    source: { trust: 'official-vendor', origin: 'npm: @playwright/mcp', reference: 'https://github.com/microsoft/playwright-mcp' },
    compatibility: 'Node.js 18+; downloads browsers on first run.', security: 'Browser can visit arbitrary URLs.',
  }),
  mcp({
    id: 'mcp-github', name: 'GitHub MCP (remote)', serverName: 'github', triggers: ['github-actions'], condition: (p) => p.hasGit,
    description: "GitHub's official remote MCP server: issues, PRs, Actions, code search.",
    reason: () => 'Git repository detected.', basePriority: 52, requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    config: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}' } },
    source: { trust: 'official-vendor', origin: 'GitHub remote MCP', reference: 'https://github.com/github/github-mcp-server' },
    compatibility: 'Requires a GitHub personal access token in your shell environment.',
    security: 'Token is referenced as ${GITHUB_PERSONAL_ACCESS_TOKEN}; never stored in .mcp.json. Use a fine-grained token.',
  }),
  mcp({
    id: 'mcp-supabase', name: 'Supabase MCP (remote, read-only)', serverName: 'supabase', triggers: ['supabase'],
    description: 'Hosted Supabase MCP server in read-only mode (OAuth login on first use).',
    reason: () => 'Supabase detected.', basePriority: 68, requiredEnv: [],
    config: { type: 'http', url: 'https://mcp.supabase.com/mcp?read_only=true' },
    source: { trust: 'official-vendor', origin: 'Supabase hosted MCP', reference: 'https://supabase.com/docs/guides/getting-started/mcp' },
    compatibility: 'Authenticates through your browser.', security: 'Configured read-only. Scope to a development project.',
  }),
  mcp({
    id: 'mcp-mongodb', name: 'MongoDB MCP (read-only)', serverName: 'mongodb', triggers: ['mongodb'],
    description: 'Official MongoDB MCP server, started with --readOnly.',
    reason: () => 'MongoDB driver detected.', basePriority: 64, requiredEnv: ['MDB_MCP_CONNECTION_STRING'],
    config: { command: 'npx', args: ['-y', 'mongodb-mcp-server', '--readOnly'], env: { MDB_MCP_CONNECTION_STRING: '${MDB_MCP_CONNECTION_STRING}' } },
    source: { trust: 'official-vendor', origin: 'npm: mongodb-mcp-server', reference: 'https://github.com/mongodb-js/mongodb-mcp-server' },
    compatibility: 'Node.js 20+.', security: 'Connection string comes from your environment; use a read-only DB user.',
  }),
  mcp({
    id: 'mcp-postgres', name: 'PostgreSQL MCP (reference, read-only)', serverName: 'postgres', triggers: ['postgresql'],
    description: 'Read-only SQL access to a PostgreSQL database.',
    reason: () => 'PostgreSQL driver detected.', basePriority: 50, requiredEnv: ['DATABASE_URL'],
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', '${DATABASE_URL}'] },
    source: { trust: 'community', origin: 'npm: @modelcontextprotocol/server-postgres (archived reference server)', reference: 'https://github.com/modelcontextprotocol/servers-archived' },
    compatibility: 'Archived reference implementation — fine for local dev, not maintained.',
    security: 'Point DATABASE_URL at a local/dev database with a read-only role. Never production.',
  }),
];
