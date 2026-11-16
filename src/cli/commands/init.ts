import * as p from '@clack/prompts';
import ora from 'ora';
import type { CliOptions, Recommendation } from '../../types.js';
import { DEFAULT_SELECT_THRESHOLD } from '../../core/scoring.js';
import { applyPlan, buildPlan, type ActionResult, type ConflictChoice } from '../../managers/installer.js';
import { loadManifest } from '../../managers/config-manager.js';
import { runDoctor } from '../../diagnostics/doctor.js';
import { c, log } from '../../utils/logger.js';
import { banner, printChecks, printPlan, printProfile, printRecommendations, printResults, TYPE_LABEL } from '../ui.js';
import { isInteractive, runAnalysis } from '../context.js';

export interface InitOptions extends CliOptions {
  /** Pre-select external integrations (plugins / MCP) in non-interactive mode. */
  includeExternal?: boolean;
  /** Only offer recommendations not applied by a previous run (used by `optimize`). */
  onlyNew?: boolean;
  /** Restrict to specific recommendation ids (used by `install`, `import`). */
  only?: string[];
  /** Restrict to recommendation types (used by `skills generate`, `agents generate`, `mcp add`). */
  types?: Recommendation['type'][];
  quietBanner?: boolean;
}

const cancelled = (v: unknown): boolean => {
  if (p.isCancel(v)) {
    p.cancel('Cancelled — nothing was changed.');
    return true;
  }
  return false;
};

export async function runInit(opts: InitOptions): Promise<ActionResult[] | undefined> {
  const interactive = isInteractive(opts);
  if (!opts.quietBanner) {
    banner();
    log.line(`  ${c.muted(opts.dryRun ? 'Dry run — nothing will be written or installed.' : 'Initializing project intelligence…')}\n`);
  }

  // STEP 2–3: detection + analysis report
  const analysis = await runAnalysis(opts, { keepSuperseded: Boolean(opts.only || opts.types) });
  const { profile } = analysis;
  if (!opts.quietBanner) printProfile(profile);

  // STEP 4: recommendations
  let recs = analysis.result.recommendations;
  const manifest = loadManifest(opts.cwd);
  if (opts.onlyNew && manifest) recs = recs.filter((r) => !manifest.selections.includes(r.id));
  if (opts.types) recs = recs.filter((r) => opts.types!.includes(r.type));
  if (opts.only) {
    const unknown = opts.only.filter((id) => !analysis.result.recommendations.some((r) => r.id === id));
    for (const id of unknown) {
      const why = analysis.result.skipped.find((s) => s.id === id)?.reason ?? 'not applicable to this project or unknown id';
      log.warn(`${id}: ${why}`);
    }
    recs = recs.filter((r) => opts.only!.includes(r.id));
  }
  if (!recs.length) {
    log.ok(opts.onlyNew ? 'Environment is already optimized — no new recommendations.' : 'Nothing to recommend for this selection.');
    return [];
  }
  printRecommendations(recs);

  // STEP 5: selection
  const defaults = recs.filter((r) =>
    opts.only ? true : r.priority >= DEFAULT_SELECT_THRESHOLD && (!r.requiresApproval || interactive || opts.includeExternal),
  );
  let selected: Recommendation[] = defaults;
  if (interactive && !opts.only) {
    log.line();
    const choice = await p.multiselect({
      message: 'Select capabilities to set up (space to toggle, enter to confirm)',
      options: recs.map((r) => ({
        value: r.id,
        label: `${r.name} ${c.muted(`[${TYPE_LABEL[r.type]}]`)}`,
        hint: `${r.priority} · ${r.requiresApproval ? 'external · ' : ''}${r.description.slice(0, 60)}`,
      })),
      initialValues: defaults.map((r) => r.id),
      required: false,
    });
    if (cancelled(choice)) return undefined;
    selected = recs.filter((r) => (choice as string[]).includes(r.id));
  }
  if (!selected.length) {
    log.info('Nothing selected — no changes made.');
    return [];
  }

  // STEP 6: preview
  const plan = buildPlan(profile, selected, opts.scope);
  printPlan(plan, selected);

  // STEP 7: confirmation (always required for side effects unless --yes)
  if (!opts.dryRun) {
    if (interactive) {
      const ok = await p.confirm({ message: `Apply ${plan.length} change(s)? Existing files are backed up and never overwritten silently.` });
      if (cancelled(ok) || !ok) {
        log.info('Aborted — nothing was changed.');
        return undefined;
      }
    } else if (!opts.yes) {
      log.warn('Non-interactive session: re-run with --yes to apply, or --dry-run to preview.');
      process.exitCode = 2;
      return undefined;
    }
  }

  // STEP 8: apply
  log.section(opts.dryRun ? 'Dry run' : 'Applying');
  const spinner = interactive && !opts.dryRun ? ora({ indent: 2 }) : undefined;
  const results = await applyPlan(profile, plan, opts, {
    plugins: analysis.plugins,
    onProgress: (m) => spinner?.start(m),
    resolveConflict: interactive
      ? async (rel) => {
          spinner?.stop();
          const v = await p.select<ConflictChoice>({
            message: `${rel} already exists and differs from the generated version.`,
            options: [
              { value: 'alongside', label: `Write alongside as ${rel.replace(/(\.\w+)$/, '.crazy$1')}`, hint: 'safe — merge manually' },
              { value: 'overwrite', label: 'Back up and replace' },
              { value: 'skip', label: 'Skip' },
            ],
          });
          return p.isCancel(v) ? 'skip' : v;
        }
      : undefined,
  });
  spinner?.stop();
  printResults(results);

  // STEP 9: verification
  if (!opts.dryRun) {
    log.section('Verification');
    const checks = runDoctor(opts.cwd, analysis.claudeVersion ? analysis.plugins : undefined).filter((ch) => ch.status !== 'pass');
    if (checks.length) printChecks(checks);
    else log.ok('All checks passed');
  }

  // STEP 10: final report
  const count = (s: ActionResult['status'][]) => results.filter((r) => s.includes(r.status)).length;
  log.section('Summary');
  if (opts.dryRun) {
    log.line(`  ${count(['planned'])} action(s) planned. Re-run without --dry-run to apply.`);
  } else {
    log.line(`  ${c.ok(`${count(['created', 'updated', 'installed', 'written-alongside'])} applied`)} · ${count(['unchanged'])} unchanged · ${c.warn(`${count(['skipped'])} skipped`)} · ${c.err(`${count(['failed'])} failed`)}`);
    log.line(`  ${c.muted('Backups + manifest:')} .crazy-claude/   ${c.muted('Undo:')} crazy-claude rollback`);
    if (results.some((r) => r.action.kind === 'plugin' && r.status === 'installed')) log.line(`  ${c.muted('Restart Claude Code to load newly installed plugins.')}`);
    if (results.some((r) => r.action.kind === 'mcp' && ['created', 'updated'].includes(r.status))) log.line(`  ${c.muted('Claude Code will ask you to approve new project MCP servers on next start.')}`);
    log.line(`\n  ${c.brand('Your Claude Code environment is ready.')} Run ${c.bold('claude')} to start.`);
  }
  log.line();
  return results;
}
