import type { ProjectProfile } from '../types.js';
import { HOOKS, type HookRegistryEntry } from '../registry/hooks.js';
import type { GeneratedFile } from './skill-generator.js';

export const HOOK_DIR = '.claude/hooks/crazy-claude';

export interface HookSettingsEntry {
  event: HookRegistryEntry['event'];
  matcher: string;
  command: string;
  timeout: number;
}

export const hookCommand = (scriptName: string) => `node "$CLAUDE_PROJECT_DIR/${HOOK_DIR}/${scriptName}.mjs"`;

export function generateHooks(p: ProjectProfile, ids: string[]): { files: GeneratedFile[]; settings: HookSettingsEntry[] } {
  const selected = HOOKS.filter((h) => ids.includes(h.id));
  return {
    files: selected.map((h) => ({ path: `${HOOK_DIR}/${h.scriptName}.mjs`, content: h.script(p), recId: h.id, mode: 0o755 })),
    settings: selected.map((h) => ({ event: h.event, matcher: h.matcher, command: hookCommand(h.scriptName), timeout: h.timeout })),
  };
}

type SettingsHooks = Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command?: string; timeout?: number }> }>>;

/** Merges hook entries into a settings object without duplicating or removing existing hooks. */
export function mergeHookSettings(settings: Record<string, unknown>, entries: HookSettingsEntry[]): { settings: Record<string, unknown>; added: number } {
  const next = structuredClone(settings);
  const hooks = ((next.hooks as SettingsHooks | undefined) ?? {}) as SettingsHooks;
  let added = 0;
  for (const e of entries) {
    const list = (hooks[e.event] ??= []);
    const exists = list.some((m) => m.hooks?.some((h) => h.command === e.command));
    if (exists) continue;
    let group = list.find((m) => m.matcher === e.matcher);
    if (!group) {
      group = { matcher: e.matcher, hooks: [] };
      list.push(group);
    }
    group.hooks.push({ type: 'command', command: e.command, timeout: e.timeout });
    added++;
  }
  next.hooks = hooks;
  return { settings: next, added };
}
