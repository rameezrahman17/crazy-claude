import path from 'node:path';
import * as p from '@clack/prompts';
import type { CliOptions } from '../../types.js';
import { runDoctor } from '../../diagnostics/doctor.js';
import { PluginManager } from '../../managers/plugin-manager.js';
import { readMcpState, requiredEnv } from '../../managers/mcp-manager.js';
import { loadManifest, rollbackFiles, saveManifest } from '../../managers/config-manager.js';
import { MCP_SERVERS } from '../../registry/mcp.js';
import { ExportSchema, findLiteralSecrets, type ExportFile } from '../../utils/validation.js';
import { readJson, writeFileAtomic } from '../../utils/filesystem.js';
import { c, log, redact } from '../../utils/logger.js';
import { VERSION } from '../../version.js';
import { analyzeProject } from '../../core/analyzer.js';
import { printChecks, printProfile, printRecommendations } from '../ui.js';
import { isInteractive, runAnalysis } from '../context.js';
import { runInit } from './init.js';

export async function analyzeCmd(opts: CliOptions, json: boolean) {
  const a = await runAnalysis(opts, { spinner: !json });
  if (json) return console.log(JSON.stringify(a.profile, null, 2));
  printProfile(a.profile);
  log.line();
}

export async function recommendCmd(opts: CliOptions, json: boolean, verbose: boolean) {
  const a = await runAnalysis(opts, { spinner: !json });
  if (json) return console.log(JSON.stringify(a.result, null, 2));
  printRecommendations(a.result.recommendations, verbose);
  if (a.result.skipped.length) {
    log.line(`\n  ${c.muted('Not recommended:')}`);
    for (const s of a.result.skipped) log.line(`  ${c.muted(`· ${s.id} — ${s.reason}`)}`);
  }
  log.line(`\n  ${c.muted('Apply with:')} crazy-claude init   ${c.muted('or')} crazy-claude install <id…>\n`);
}

export async function pluginsCmd(opts: CliOptions, json: boolean) {
  const pm = new PluginManager(opts.cwd);
  const version = pm.claudeVersion();
  if (!version) {
    log.error('Claude Code CLI not found on PATH. Install it with: npm install -g @anthropic-ai/claude-code');
    process.exitCode = 1;
    return;
  }
  const installed = pm.listInstalled();
  const marketplaces = pm.listMarketplaces();
  const a = await runAnalysis(opts, { spinner: false });
  const recs = a.result.recommendations.filter((r) => r.type === 'plugin' || r.type === 'lsp');
  const available = pm.listAvailable();
  const rows = recs.map((r) => ({ id: r.id, resolved: pm.resolve(r.name, available), priority: r.priority, reason: r.reasons[0] }));
  if (json) return console.log(JSON.stringify({ claudeVersion: version, marketplaces, installed, recommended: rows }, null, 2));

  log.section(`Claude Code ${version}`);
  log.line(`  ${c.bold('Marketplaces')}`);
  for (const m of marketplaces) log.line(`  · ${m.name} ${c.muted(m.repo ?? m.source ?? '')}`);
  log.line(`\n  ${c.bold(`Installed (${installed.length})`)}`);
  for (const i of installed) log.line(`  ${i.enabled ? c.ok('●') : c.muted('○')} ${i.id} ${c.muted(i.scope)}`);
  log.line(`\n  ${c.bold('Recommended for this project')}`);
  if (!rows.length) log.line(`  ${c.muted('none (everything relevant is already installed)')}`);
  for (const r of rows) {
    log.line(`  ${r.resolved ? c.ok('✓') : c.warn('?')} ${r.id.padEnd(22)} ${String(r.priority).padStart(3)}  ${c.muted(r.resolved ? r.resolved : 'not in a trusted configured marketplace')}`);
  }
  log.line(`\n  ${c.muted('Install:')} crazy-claude install ${rows.filter((r) => r.resolved).map((r) => r.id).slice(0, 3).join(' ') || '<id>'}\n`);
}

export async function mcpCmd(opts: CliOptions, json: boolean) {
  const state = readMcpState(opts.cwd);
  const a = await runAnalysis(opts, { spinner: false, keepSuperseded: true });
  const recs = a.result.recommendations.filter((r) => r.type === 'mcp');
  if (json) return console.log(JSON.stringify({ configured: Object.keys(state.servers), valid: state.valid, recommended: recs.map((r) => r.id) }, null, 2));
  log.section('MCP servers (.mcp.json)');
  if (!state.exists) log.line(`  ${c.muted('No project .mcp.json yet.')}`);
  else if (!state.valid) log.error(`Invalid .mcp.json: ${state.error}`);
  for (const [name, cfg] of Object.entries(state.servers)) log.line(`  ${c.ok('●')} ${name} ${c.muted(redact(JSON.stringify(cfg)).slice(0, 90))}`);
  if (state.literalSecrets.length) log.error(`Literal secret-like values at: ${state.literalSecrets.join(', ')} — use \${VAR} placeholders.`);
  log.line(`\n  ${c.bold('Recommended')}`);
  if (!recs.length) log.line(`  ${c.muted('none')}`);
  for (const r of recs) {
    const entry = MCP_SERVERS.find((m) => m.id === r.id)!;
    const env = requiredEnv([entry]);
    log.line(`  ${r.id.padEnd(16)} ${String(r.priority).padStart(3)}  ${r.name} ${c.muted(`(${r.source.origin})`)}`);
    for (const e of env) log.line(`  ${' '.repeat(22)}${e.set ? c.ok('✓') : c.warn('!')} $${e.name} ${c.muted(e.set ? 'set' : 'not set')}`);
  }
  log.line(`\n  ${c.muted('Add:')} crazy-claude mcp add ${recs.map((r) => r.id).join(' ') || '<id>'}\n`);
}

export async function doctorCmd(opts: CliOptions, json: boolean) {
  const pm = new PluginManager(opts.cwd);
  const checks = runDoctor(opts.cwd, pm);
  if (json) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    log.section('Crazy Claude doctor');
    printChecks(checks);
    const fails = checks.filter((ch) => ch.status === 'fail').length;
    const warns = checks.filter((ch) => ch.status === 'warn').length;
    log.line(`\n  ${fails ? c.err(`${fails} problem(s)`) : c.ok('No problems')} · ${warns} warning(s)\n`);
  }
  if (checks.some((ch) => ch.status === 'fail')) process.exitCode = 1;
}

export const DEFAULT_EXPORT = 'crazy-claude.config.json';

export async function exportCmd(opts: CliOptions, file = DEFAULT_EXPORT) {
  const m = loadManifest(opts.cwd);
  if (!m) {
    log.error('No crazy-claude manifest found. Run crazy-claude init first.');
    process.exitCode = 1;
    return;
  }
  const profile = await analyzeProject(opts.cwd);
  const out: ExportFile = {
    $schema: 'crazy-claude/export@1',
    exportedAt: new Date().toISOString(),
    toolVersion: VERSION,
    project: { name: profile.name, technologies: profile.technologies.map((t) => t.id) },
    scope: m.scope,
    selections: m.selections,
  };
  if (findLiteralSecrets(out).length) throw new Error('refusing to export: secret-like value detected');
  const target = path.resolve(opts.cwd, file);
  if (opts.dryRun) {
    log.info(`Would write ${target}`);
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  writeFileAtomic(target, JSON.stringify(out, null, 2) + '\n');
  log.ok(`Exported ${m.selections.length} selection(s) to ${path.relative(opts.cwd, target)}`);
  log.line(`  ${c.muted('Contains recommendation ids only — no file contents, paths or secrets.')}`);
}

export async function importCmd(opts: CliOptions, file: string) {
  const r = readJson(path.resolve(opts.cwd, file));
  if (!r.ok) {
    log.error(`Cannot read ${file}: ${r.error}`);
    process.exitCode = 1;
    return;
  }
  const parsed = ExportSchema.safeParse(r.value);
  if (!parsed.success) {
    log.error(`Invalid export file: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    process.exitCode = 1;
    return;
  }
  log.info(`Importing ${parsed.data.selections.length} selection(s) exported from "${parsed.data.project.name}" (v${parsed.data.toolVersion})`);
  // Re-generates against THIS project; ids that don't apply here are reported and skipped.
  await runInit({ ...opts, scope: parsed.data.scope, only: parsed.data.selections });
}

export async function rollbackCmd(opts: CliOptions) {
  const m = loadManifest(opts.cwd);
  if (!m) {
    log.error('No crazy-claude manifest found — nothing to roll back.');
    process.exitCode = 1;
    return;
  }
  const preview = rollbackFiles(opts.cwd, m, { dryRun: true, force: opts.force });
  log.section('Rollback');
  for (const f of preview.restored) log.line(`  ${c.info('restore')} ${f}`);
  for (const f of preview.removed) log.line(`  ${c.warn('remove ')} ${f}`);
  for (const s of preview.skipped) log.line(`  ${c.muted(`skip    ${s.path} — ${s.reason}`)}`);
  for (const pl of m.plugins) log.line(`  ${c.warn('uninstall')} ${pl.id} (${pl.scope})`);
  if (opts.dryRun) return;
  if (isInteractive(opts)) {
    const ok = await p.confirm({ message: 'Proceed with rollback?' });
    if (p.isCancel(ok) || !ok) return log.info('Aborted.');
  } else if (!opts.yes) {
    return log.warn('Re-run with --yes to roll back non-interactively.');
  }
  const res = rollbackFiles(opts.cwd, m, { dryRun: false, force: opts.force });
  const pm = new PluginManager(opts.cwd);
  const remainingPlugins = [];
  for (const pl of m.plugins) {
    const r = pm.uninstall(pl.id, pl.scope);
    (r.ok ? log.ok : log.error)(`uninstall ${pl.id}: ${r.message}`);
    if (!r.ok) remainingPlugins.push(pl);
  }
  const touched = new Set([...res.restored, ...res.removed]);
  m.files = m.files.filter((f) => !touched.has(f.path));
  m.plugins = remainingPlugins;
  if (!m.files.length) m.mcpServers = [];
  m.selections = m.files.length || m.plugins.length ? m.selections : [];
  saveManifest(opts.cwd, m);
  log.ok(`Restored ${res.restored.length}, removed ${res.removed.length}, skipped ${res.skipped.length} file(s).`);
}
