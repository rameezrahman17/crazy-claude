import fs from 'node:fs';
import path from 'node:path';
import { PLUGINS } from '../registry/plugins.js';
import { MCP_SERVERS } from '../registry/mcp.js';
import { readMcpState } from '../managers/mcp-manager.js';
import { loadManifest, MANIFEST_PATH } from '../managers/config-manager.js';
import { SETTINGS_FILE } from '../managers/installer.js';
import type { PluginManager } from '../managers/plugin-manager.js';
import { readIfExists, readJson } from '../utils/filesystem.js';
import { SettingsSchema } from '../utils/validation.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface Check { status: CheckStatus; title: string; detail?: string; fix?: string }

const frontmatter = (text: string): Record<string, string> | undefined => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return undefined;
  const out: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]!] = kv[2]!;
  }
  return out;
};

export function runDoctor(root: string, pm: PluginManager | undefined): Check[] {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Node.js
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  add(major > 18 || (major === 18 && minor >= 17)
    ? { status: 'pass', title: `Node.js ${process.versions.node}` }
    : { status: 'fail', title: `Node.js ${process.versions.node} is too old`, fix: 'Install Node.js 18.17 or newer (20 LTS recommended).' });

  // Claude Code
  const version = pm?.claudeVersion();
  add(version
    ? { status: 'pass', title: `Claude Code ${version}` }
    : { status: 'warn', title: 'Claude Code CLI not found on PATH', detail: 'Plugins cannot be listed or installed.', fix: 'Install Claude Code: npm install -g @anthropic-ai/claude-code' });

  // CLAUDE.md
  const claudeMd = readIfExists(path.join(root, 'CLAUDE.md'));
  if (claudeMd === undefined) add({ status: 'warn', title: 'No CLAUDE.md', fix: 'Run: crazy-claude init (or crazy-claude optimize)' });
  else if (claudeMd.trim().length < 200) add({ status: 'warn', title: 'CLAUDE.md is very short', detail: `${claudeMd.length} chars`, fix: 'Add commands, conventions and architecture notes.' });
  else add({ status: 'pass', title: `CLAUDE.md present (${claudeMd.split('\n').length} lines)` });

  // MCP
  const mcp = readMcpState(root);
  if (!mcp.exists) add({ status: 'pass', title: 'No project .mcp.json (none configured)' });
  else if (!mcp.valid) add({ status: 'fail', title: '.mcp.json is invalid', detail: mcp.error, fix: 'Fix the JSON, or restore a backup from .crazy-claude/backups/.' });
  else add({ status: 'pass', title: `.mcp.json valid (${Object.keys(mcp.servers).length} server(s))` });
  if (mcp.literalSecrets.length) {
    add({ status: 'fail', title: '.mcp.json contains what looks like a literal secret', detail: mcp.literalSecrets.join(', '), fix: 'Replace the value with an ${ENV_VAR} placeholder and rotate the exposed credential.' });
  }
  for (const name of Object.keys(mcp.servers)) {
    const entry = MCP_SERVERS.find((m) => m.serverName === name);
    for (const env of entry?.requiredEnv ?? []) {
      if (!process.env[env]) add({ status: 'warn', title: `MCP server "${name}" needs $${env}`, fix: `export ${env}=... in your shell profile (never in .mcp.json)` });
    }
  }

  // Settings + hooks
  const settings = readJson<Record<string, unknown>>(path.join(root, SETTINGS_FILE));
  if (!settings.ok && !settings.missing) {
    add({ status: 'fail', title: `${SETTINGS_FILE} is not valid JSON`, detail: settings.error, fix: 'Fix the JSON syntax.' });
  } else if (settings.ok) {
    const parsed = SettingsSchema.safeParse(settings.value);
    if (!parsed.success) add({ status: 'fail', title: `${SETTINGS_FILE} has an invalid shape`, detail: parsed.error.issues[0]?.message });
    const hooks = (settings.value.hooks ?? {}) as Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
    let total = 0;
    for (const groups of Object.values(hooks)) {
      for (const g of groups) {
        for (const h of g.hooks ?? []) {
          total++;
          const m = h.command?.match(/\$CLAUDE_PROJECT_DIR\/([^"\s]+)/);
          if (m && !fs.existsSync(path.join(root, m[1]!))) {
            add({ status: 'fail', title: 'Hook points to a missing script', detail: m[1], fix: 'Re-run crazy-claude init, or remove the hook from settings.json.' });
          }
        }
      }
    }
    add({ status: 'pass', title: `${SETTINGS_FILE} valid (${total} hook(s))` });
  }

  // Skills & agents
  const skillsDir = path.join(root, '.claude', 'skills');
  for (const s of fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : []) {
    const text = readIfExists(path.join(skillsDir, s, 'SKILL.md'));
    if (text === undefined) { add({ status: 'warn', title: `Skill "${s}" has no SKILL.md` }); continue; }
    const fm = frontmatter(text);
    if (!fm?.name || !fm.description) add({ status: 'fail', title: `Skill "${s}" is missing name/description frontmatter`, fix: 'Add YAML frontmatter with name and description.' });
  }
  const agentsDir = path.join(root, '.claude', 'agents');
  for (const a of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')) : []) {
    const fm = frontmatter(readIfExists(path.join(agentsDir, a)) ?? '');
    if (!fm?.name || !fm.description) add({ status: 'fail', title: `Agent "${a}" is missing name/description frontmatter` });
  }

  // Plugins + duplicates
  if (version && pm) {
    const installed = pm.listInstalled();
    add({ status: 'pass', title: `${installed.length} plugin(s) installed` });
    for (const p of installed) {
      const reg = PLUGINS.find((r) => r.name === p.name);
      for (const sup of reg?.supersedes ?? []) {
        const server = MCP_SERVERS.find((m) => m.id === sup)?.serverName;
        if (server && server in mcp.servers) {
          add({ status: 'warn', title: `Duplicate capability: plugin "${p.name}" and MCP server "${server}"`, fix: `Remove "${server}" from .mcp.json or uninstall the plugin.` });
        }
      }
      const dupes = installed.filter((o) => o.name === p.name && o.id !== p.id);
      if (dupes.length && p.id < dupes[0]!.id) add({ status: 'warn', title: `Plugin "${p.name}" installed from multiple marketplaces`, detail: [p.id, ...dupes.map((d) => d.id)].join(', ') });
    }
  }

  // Manifest integrity
  const manifestExists = fs.existsSync(path.join(root, MANIFEST_PATH));
  const manifest = loadManifest(root);
  if (manifestExists && !manifest) add({ status: 'fail', title: `${MANIFEST_PATH} is invalid`, fix: 'Delete it and re-run crazy-claude init.' });
  for (const f of manifest?.files ?? []) {
    if (!fs.existsSync(path.join(root, f.path))) add({ status: 'warn', title: `Managed file missing: ${f.path}`, fix: 'Re-run crazy-claude init to regenerate it.' });
  }

  // Secret hygiene
  const gitignore = readIfExists(path.join(root, '.gitignore')) ?? '';
  const envFiles = fs.readdirSync(root).filter((f) => /^\.env(\.|$)/.test(f) && !/example|sample|template/.test(f));
  if (envFiles.length && !/^\.env/m.test(gitignore)) {
    add({ status: 'fail', title: `${envFiles.join(', ')} not ignored by git`, fix: 'Add ".env*" (and "!.env.example") to .gitignore.' });
  }
  return checks;
}
