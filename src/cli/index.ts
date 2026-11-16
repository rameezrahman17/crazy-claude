#!/usr/bin/env node
import { Command, Option } from 'commander';
import { VERSION } from '../version.js';
import { c, log } from '../utils/logger.js';
import { toOptions, type GlobalFlags } from './context.js';
import { runInit } from './commands/init.js';
import { analyzeCmd, doctorCmd, exportCmd, importCmd, mcpCmd, pluginsCmd, recommendCmd, rollbackCmd, DEFAULT_EXPORT } from './commands/info.js';

const program = new Command();

program
  .name('crazy-claude')
  .description('Supercharge Claude Code. Automatically.')
  .version(VERSION, '-v, --version')
  .showHelpAfterError();

/** Options shared by every command. */
const common = (cmd: Command) =>
  cmd
    .option('-C, --cwd <dir>', 'project directory (default: current directory)')
    .option('--dry-run', 'show what would happen without writing or installing anything')
    .option('-y, --yes', 'non-interactive: accept the default selection and apply (for CI)')
    .option('--force', 'back up and replace existing files that differ from the generated version')
    .addOption(new Option('--scope <scope>', 'plugin install scope').choices(['project', 'user', 'local']).default('project'));

const run = (fn: (flags: GlobalFlags & Record<string, unknown>, ...args: unknown[]) => Promise<unknown> | unknown) =>
  async (...args: unknown[]) => {
    const cmd = args[args.length - 1] as Command;
    // optsWithGlobals: flags given before a subcommand (e.g. `mcp -C dir add`) are merged in.
    const flags = cmd.optsWithGlobals() as GlobalFlags & Record<string, unknown>;
    try {
      await fn(flags, ...args.slice(0, -2));
    } catch (e) {
      log.error((e as Error).message);
      process.exitCode = 1;
    }
  };

common(program.command('init'))
  .description('analyze the project, pick capabilities, and configure Claude Code')
  .option('--include-external', 'with --yes: also select recommended plugins and MCP servers')
  .action(run((f) => runInit({ ...toOptions(f), includeExternal: Boolean(f.includeExternal) })));

common(program.command('analyze'))
  .description('detect the tech stack and print a project profile')
  .option('--json', 'machine-readable output')
  .action(run((f) => analyzeCmd(toOptions(f), Boolean(f.json))));

common(program.command('recommend'))
  .description('list recommended plugins, MCP servers, skills, agents and hooks')
  .option('--json', 'machine-readable output')
  .option('--verbose', 'show source, security and compatibility details')
  .action(run((f) => recommendCmd(toOptions(f), Boolean(f.json), Boolean(f.verbose))));

common(program.command('install'))
  .description('apply specific recommendations by id (see `recommend`)')
  .argument('<ids...>', 'recommendation ids, e.g. skill-api-design agent-code-reviewer typescript-lsp')
  .action(run((f, ids) => runInit({ ...toOptions(f), only: ids as string[], yes: true, quietBanner: true })));

common(program.command('plugins'))
  .description('show marketplaces, installed plugins and recommended plugins')
  .option('--json', 'machine-readable output')
  .action(run((f) => pluginsCmd(toOptions(f), Boolean(f.json))));

const mcp = common(program.command('mcp'))
  .description('show MCP configuration and recommended servers')
  .option('--json', 'machine-readable output')
  .action(run((f) => mcpCmd(toOptions(f), Boolean(f.json))));
common(mcp.command('add'))
  .description('add recommended MCP servers to .mcp.json (existing entries are never modified)')
  .argument('[ids...]', 'mcp recommendation ids (default: all recommended)')
  .action(run((f, ids) => runInit({ ...toOptions(f), types: ['mcp'], only: (ids as string[]).length ? (ids as string[]) : undefined, includeExternal: true, quietBanner: true })));

const generateGroup = (name: 'agents' | 'skills', type: 'agent' | 'skill') => {
  const group = program.command(name).description(`manage project ${name}`);
  common(group.command('generate'))
    .description(`generate project-specific ${name} into .claude/${name}/`)
    .action(run((f) => runInit({ ...toOptions(f), types: [type], quietBanner: true })));
};
generateGroup('agents', 'agent');
generateGroup('skills', 'skill');

common(program.command('doctor'))
  .description('check Claude Code, configuration validity, hooks, MCP and plugins')
  .option('--json', 'machine-readable output')
  .action(run((f) => doctorCmd(toOptions(f), Boolean(f.json))));

common(program.command('optimize'))
  .description('re-analyze and offer only capabilities not yet applied')
  .action(run((f) => runInit({ ...toOptions(f), onlyNew: true })));

common(program.command('export'))
  .description('export the crazy-claude selection as a portable, secret-free manifest')
  .argument('[file]', 'output file', DEFAULT_EXPORT)
  .action(run((f, file) => exportCmd(toOptions(f), file as string)));

common(program.command('import'))
  .description('reproduce an exported configuration in this project')
  .argument('[file]', 'export file', DEFAULT_EXPORT)
  .action(run((f, file) => importCmd(toOptions(f), file as string)));

common(program.command('rollback'))
  .description('undo crazy-claude changes (restores backups; keeps files you edited since)')
  .action(run((f) => rollbackCmd(toOptions(f))));

program.addHelpText('after', `
${c.bold('Examples')}
  $ npx crazy-claude init              interactive setup
  $ npx crazy-claude init --dry-run    preview everything, change nothing
  $ npx crazy-claude init --yes        CI: apply local config (skills, agents, hooks, CLAUDE.md)
  $ npx crazy-claude recommend --verbose
  $ npx crazy-claude doctor
`);

program.parseAsync(process.argv);
