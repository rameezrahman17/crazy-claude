import path from 'node:path';
import ora from 'ora';
import type { CliOptions, ProjectProfile } from '../types.js';
import { analyzeProject } from '../core/analyzer.js';
import { recommend, type RecommendResult } from '../core/recommender.js';
import { PluginManager, type InstalledPlugin } from '../managers/plugin-manager.js';
import { readMcpState } from '../managers/mcp-manager.js';

export interface GlobalFlags {
  cwd?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  scope?: string;
  json?: boolean;
}

export function toOptions(flags: GlobalFlags): CliOptions {
  const scope = flags.scope ?? 'project';
  if (!['project', 'user', 'local'].includes(scope)) throw new Error(`--scope must be project, user or local (got "${scope}")`);
  return {
    cwd: path.resolve(flags.cwd ?? process.cwd()),
    dryRun: Boolean(flags.dryRun),
    yes: Boolean(flags.yes),
    force: Boolean(flags.force),
    scope: scope as CliOptions['scope'],
  };
}

export const isInteractive = (o: CliOptions) => !o.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI;

export interface Analysis {
  profile: ProjectProfile;
  claudeVersion?: string;
  installedPlugins: InstalledPlugin[];
  result: RecommendResult;
  plugins: PluginManager;
}

/** Shared analysis pipeline used by init / analyze / recommend / optimize. */
export async function runAnalysis(opts: CliOptions, { spinner = true, keepSuperseded = false } = {}): Promise<Analysis> {
  const sp = spinner ? ora({ text: 'Scanning project…', indent: 2 }).start() : undefined;
  const profile = await analyzeProject(opts.cwd);
  sp?.succeed(`Project detected: ${profile.name} (${profile.technologies.length} technologies)`);

  const plugins = new PluginManager(opts.cwd);
  const sp2 = spinner ? ora({ text: 'Checking Claude Code installation…', indent: 2 }).start() : undefined;
  const claudeVersion = plugins.claudeVersion();
  const installedPlugins = claudeVersion ? plugins.listInstalled() : [];
  if (claudeVersion) sp2?.succeed(`Claude Code ${claudeVersion} · ${installedPlugins.length} plugin(s) installed`);
  else sp2?.warn('Claude Code CLI not found — plugin recommendations disabled');

  const mcp = readMcpState(opts.cwd);
  const result = recommend(profile, {
    claudeAvailable: Boolean(claudeVersion),
    installedPlugins: installedPlugins.map((p) => p.name),
    existingMcpServers: Object.keys(mcp.servers),
    keepSuperseded,
  });
  sp && ora({ indent: 2 }).succeed(`${result.recommendations.length} recommendations generated`);
  return { profile, claudeVersion, installedPlugins, result, plugins };
}
