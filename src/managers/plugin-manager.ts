import { defaultExec, type Exec } from '../utils/exec.js';

/**
 * Thin wrapper over the documented `claude plugin` CLI (verified against Claude Code 2.1.x):
 *   claude plugin list --json
 *   claude plugin list --available --json
 *   claude plugin marketplace list --json
 *   claude plugin install <name@marketplace> --scope <user|project|local>
 *   claude plugin uninstall <name@marketplace> --scope <scope>
 * No other flags are used. Arguments are passed without a shell.
 */
export interface InstalledPlugin { id: string; name: string; scope: string; enabled: boolean }
export interface AvailablePlugin { pluginId: string; name: string; marketplaceName: string; description?: string }
export interface Marketplace { name: string; source?: string; repo?: string }

/** Marketplaces we trust by default, in preference order. */
export const TRUSTED_MARKETPLACES = ['claude-plugins-official', 'anthropic-plugin-directory'];

const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/i;

export class PluginManager {
  /** `cwd` must be the project root: project/local scopes are resolved relative to it. */
  constructor(private readonly cwd: string = process.cwd(), private readonly exec: Exec = defaultExec) {}

  claudeVersion(): string | undefined {
    const r = this.exec('claude', ['--version'], { timeoutMs: 15_000, cwd: this.cwd });
    return r.ok ? r.stdout.trim().split('\n')[0] : undefined;
  }

  private json<T>(args: string[]): T | undefined {
    const r = this.exec('claude', args, { timeoutMs: 60_000, cwd: this.cwd });
    if (!r.ok) return undefined;
    try {
      return JSON.parse(r.stdout) as T;
    } catch {
      return undefined;
    }
  }

  listInstalled(): InstalledPlugin[] {
    const raw = this.json<Array<{ id: string; scope: string; enabled?: boolean }>>(['plugin', 'list', '--json']) ?? [];
    return raw.map((p) => ({ id: p.id, name: p.id.split('@')[0] ?? p.id, scope: p.scope, enabled: p.enabled !== false }));
  }

  listAvailable(): AvailablePlugin[] {
    return this.json<{ available?: AvailablePlugin[] }>(['plugin', 'list', '--available', '--json'])?.available ?? [];
  }

  listMarketplaces(): Marketplace[] {
    return this.json<Marketplace[]>(['plugin', 'marketplace', 'list', '--json']) ?? [];
  }

  /**
   * Resolves a bare plugin name to `name@marketplace`, only from trusted marketplaces.
   * Returns undefined if the plugin is not published in a trusted, configured marketplace.
   */
  resolve(name: string, available: AvailablePlugin[]): string | undefined {
    for (const mp of TRUSTED_MARKETPLACES) {
      const hit = available.find((p) => p.name === name && p.marketplaceName === mp);
      if (hit && PLUGIN_ID.test(hit.pluginId)) return hit.pluginId;
    }
    return undefined;
  }

  install(pluginId: string, scope: 'user' | 'project' | 'local'): { ok: boolean; message: string } {
    if (!PLUGIN_ID.test(pluginId)) return { ok: false, message: `refusing to install unverified plugin id "${pluginId}"` };
    const r = this.exec('claude', ['plugin', 'install', pluginId, '--scope', scope], { timeoutMs: 180_000, cwd: this.cwd });
    const out = (r.stdout + r.stderr).trim().split('\n').filter(Boolean).slice(-2).join(' ');
    return { ok: r.ok, message: out || (r.ok ? 'installed' : `exit code ${r.code}`) };
  }

  uninstall(pluginId: string, scope: 'user' | 'project' | 'local'): { ok: boolean; message: string } {
    if (!PLUGIN_ID.test(pluginId)) return { ok: false, message: `invalid plugin id "${pluginId}"` };
    const r = this.exec('claude', ['plugin', 'uninstall', pluginId, '--scope', scope], { timeoutMs: 60_000, cwd: this.cwd });
    return { ok: r.ok, message: (r.stdout + r.stderr).trim().split('\n').slice(-1)[0] ?? '' };
  }
}
