import type { ProjectProfile, Recommendation, RecommendationType } from '../types.js';
import type { ActionResult, PlanAction } from '../managers/installer.js';
import { describeAction } from '../managers/installer.js';
import type { Check } from '../diagnostics/doctor.js';
import { c, log } from '../utils/logger.js';
import { VERSION } from '../version.js';

const LOGO = [
  '   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗',
  '  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝',
  '  ██║     ██║     ███████║██║   ██║██║  ██║█████╗  ',
  '  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ',
  '  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗',
  '   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝',
];

export function banner(): void {
  const cols = process.stdout.columns ?? 80;
  log.line();
  if (cols >= 56) for (const l of LOGO) log.line(c.brand(l));
  log.line(`\n${' '.repeat(13)}${c.bold('C R A Z Y   C L A U D E')}`);
  log.line(`${' '.repeat(10)}${c.muted('Your AI coding environment, optimized.')}\n`);
  log.line(`  ${c.muted('Version:')} ${VERSION}`);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function printProfile(p: ProjectProfile): void {
  log.section('Project profile');
  log.line(`  ${c.bold(p.name)}${p.description ? c.muted(` — ${p.description}`) : ''}`);
  log.line(`  ${c.muted('Root:')} ${p.root}`);
  log.line(`  ${c.muted('Package manager:')} ${p.packageManager}${p.isMonorepo ? c.muted(' · monorepo') : ''}   ${c.muted('Files scanned:')} ${p.fileCount}   ${c.muted('Git:')} ${p.hasGit ? 'yes' : 'no'}`);
  const groups = new Map<string, string[]>();
  for (const t of p.technologies) {
    if (t.id === 'javascript' && p.technologies.some((x) => x.id === 'typescript')) continue;
    const label = t.confidence < 0.8 ? `${t.name} ${c.muted(`(${pct(t.confidence)})`)}` : t.name;
    groups.set(t.category, [...(groups.get(t.category) ?? []), label]);
  }
  log.line();
  if (!groups.size) log.warn('No known technologies detected.');
  for (const [cat, names] of groups) log.line(`  ${c.info(cat.padEnd(10))} ${names.join(c.muted(' · '))}`);
  const ex = p.existing;
  const existing = [ex.claudeMd && 'CLAUDE.md', ex.mcpJson && '.mcp.json', ex.settingsJson && '.claude/settings.json',
    ex.skills.length && `${ex.skills.length} skill(s)`, ex.agents.length && `${ex.agents.length} agent(s)`].filter(Boolean);
  log.line(`\n  ${c.muted('Existing Claude config:')} ${existing.length ? existing.join(', ') : 'none'}`);
}

export const TYPE_LABEL: Record<RecommendationType, string> = {
  instructions: 'Project instructions', plugin: 'Plugins', lsp: 'LSP integrations', mcp: 'MCP servers', skill: 'Skills', agent: 'Subagents', hook: 'Hooks',
};
const TYPE_ORDER: RecommendationType[] = ['instructions', 'plugin', 'lsp', 'mcp', 'skill', 'agent', 'hook'];

const trustBadge = (r: Recommendation) =>
  ({ 'official-anthropic': c.ok('official'), 'official-vendor': c.info('vendor'), community: c.warn('community'), 'generated-local': c.muted('local') })[r.source.trust];

const bar = (n: number) => {
  const filled = Math.round(n / 10);
  const color = n >= 70 ? c.ok : n >= 50 ? c.warn : c.muted;
  return color('█'.repeat(filled)) + c.muted('░'.repeat(10 - filled));
};

export function printRecommendations(recs: Recommendation[], verbose = false): void {
  log.section(`Recommendations (${recs.length})`);
  for (const type of TYPE_ORDER) {
    const group = recs.filter((r) => r.type === type);
    if (!group.length) continue;
    log.line(`\n  ${c.bold(TYPE_LABEL[type])}`);
    for (const r of group) {
      log.line(`  ${bar(r.priority)} ${String(r.priority).padStart(3)}  ${c.bold(r.name.padEnd(28))} ${trustBadge(r)}${r.requiresApproval ? c.warn(' · needs approval') : ''}`);
      log.line(`  ${' '.repeat(16)}${c.muted(r.reasons[0] ?? '')}`);
      if (verbose) {
        log.line(`  ${' '.repeat(16)}${c.muted('Source:')} ${r.source.origin}${r.source.reference ? c.muted(` (${r.source.reference})`) : ''}`);
        log.line(`  ${' '.repeat(16)}${c.muted('Security:')} ${r.security}`);
        log.line(`  ${' '.repeat(16)}${c.muted('Compatibility:')} ${r.compatibility}`);
      }
    }
  }
}

export function printPlan(actions: PlanAction[], recs: Recommendation[]): void {
  log.section('Installation plan');
  const icon = (a: PlanAction) => (a.kind === 'plugin' ? c.warn('⬇') : a.kind === 'write' ? c.info('+') : c.info('~'));
  for (const a of actions) log.line(`  ${icon(a)} ${describeAction(a)}`);
  const external = recs.filter((r) => r.requiresApproval);
  if (external.length) {
    log.line(`\n  ${c.warn('External integrations')} ${c.muted('(code from outside this repo / network access):')}`);
    for (const r of external) log.line(`    ${c.muted('•')} ${r.name}: ${c.muted(r.security)}`);
  }
}

const STATUS_STYLE: Record<ActionResult['status'], (s: string) => string> = {
  planned: c.info, created: c.ok, updated: c.ok, installed: c.ok, unchanged: c.muted, 'written-alongside': c.warn, skipped: c.warn, failed: c.err,
};

export function printResults(results: ActionResult[]): void {
  for (const r of results) {
    const style = STATUS_STYLE[r.status];
    log.line(`  ${style(r.status.padEnd(17))} ${r.target}${r.detail ? c.muted(` — ${r.detail}`) : ''}`);
  }
}

export function printChecks(checks: Check[]): void {
  const sym = { pass: c.ok('✓'), warn: c.warn('!'), fail: c.err('✗') };
  for (const ch of checks) {
    log.line(`  ${sym[ch.status]} ${ch.title}${ch.detail ? c.muted(` — ${ch.detail}`) : ''}`);
    if (ch.fix && ch.status !== 'pass') log.line(`      ${c.muted('fix:')} ${ch.fix}`);
  }
}
