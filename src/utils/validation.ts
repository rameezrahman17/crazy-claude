import { z } from 'zod';

const stdioServer = z.object({
  type: z.literal('stdio').optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
}).passthrough();

const remoteServer = z.object({
  type: z.enum(['http', 'sse', 'ws']),
  url: z.string().url().or(z.string().regex(/\$\{/)),
  headers: z.record(z.string()).optional(),
}).passthrough();

export const McpServerSchema = z.union([remoteServer, stdioServer]);
export const McpJsonSchema = z.object({ mcpServers: z.record(McpServerSchema) }).passthrough();

const hookCommand = z.object({ type: z.literal('command'), command: z.string().min(1), timeout: z.number().positive().optional() }).passthrough();
const hookAny = z.union([hookCommand, z.object({ type: z.string() }).passthrough()]);
export const HookMatcherSchema = z.object({ matcher: z.string().optional(), hooks: z.array(hookAny) }).passthrough();
export const SettingsSchema = z.object({
  hooks: z.record(z.array(HookMatcherSchema)).optional(),
  enabledPlugins: z.record(z.unknown()).optional(),
}).passthrough();

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  toolVersion: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  selections: z.array(z.string()),
  scope: z.enum(['project', 'user', 'local']).default('project'),
  files: z.array(z.object({
    path: z.string(),
    action: z.enum(['created', 'modified']),
    sha256: z.string(),
    backup: z.string().optional(),
    recId: z.string().optional(),
  })),
  plugins: z.array(z.object({ id: z.string(), scope: z.enum(['project', 'user', 'local']) })),
  mcpServers: z.array(z.string()),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** Portable export format: what to set up, never what was written or any secret value. */
export const ExportSchema = z.object({
  $schema: z.literal('crazy-claude/export@1'),
  exportedAt: z.string(),
  toolVersion: z.string(),
  project: z.object({ name: z.string(), technologies: z.array(z.string()) }),
  scope: z.enum(['project', 'user', 'local']),
  selections: z.array(z.string().regex(/^[a-z0-9@._-]+$/i)),
});
export type ExportFile = z.infer<typeof ExportSchema>;

/** Detects values that look like literal secrets (not ${VAR} placeholders). */
export function findLiteralSecrets(obj: unknown, path = ''): string[] {
  const out: string[] = [];
  if (typeof obj === 'string') {
    if (!/\$\{[A-Z0-9_]+\}/.test(obj) && /(sk-ant-|sk-[A-Za-z0-9]{20}|ghp_|github_pat_|xox[abpors]-|AKIA[0-9A-Z]{16}|:\/\/[^\s:/@]+:[^\s@/]{3,}@)/.test(obj)) out.push(path);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...findLiteralSecrets(v, `${path}[${i}]`)));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) out.push(...findLiteralSecrets(v, path ? `${path}.${k}` : k));
  }
  return out;
}
