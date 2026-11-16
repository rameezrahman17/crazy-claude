# Crazy Claude

[![npm](https://img.shields.io/npm/v/crazy-claude.svg)](https://www.npmjs.com/package/crazy-claude) [![CI](https://github.com/rameezrahman17/crazy-claude/actions/workflows/ci.yml/badge.svg)](https://github.com/rameezrahman17/crazy-claude/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Supercharge Claude Code. Automatically.**

Crazy Claude analyzes your project and configures [Claude Code](https://code.claude.com) with the plugins, MCP servers, skills, subagents, hooks and `CLAUDE.md` that fit **your** stack. It doesn't install everything it knows about.

```bash
npx crazy-claude init
```

```text
  ✔ Project detected: nextjs-app (10 technologies)
  ✔ Claude Code 2.1.296 (Claude Code) · 10 plugin(s) installed
  ✔ 25 recommendations generated

  Project profile
  ───────────────────────
  nextjs-app
  Package manager: pnpm   Files scanned: 6   Git: no

  auth       Auth.js / NextAuth
  frontend   Next.js · React
  testing    Playwright
  database   PostgreSQL
  orm        Prisma
  styling    Tailwind CSS
  language   TypeScript

  Recommendations (25)
  ────────────────────────────

  Project instructions
  █████████░  90  CLAUDE.md project instructions local

  Plugins
  ███████░░░  69  prisma                       vendor · needs approval
                  Prisma schema detected.
  ███████░░░  65  playwright                   vendor · needs approval
                  Next.js, Playwright, React detected — Claude can open the app and check its own UI work.
  ...
  ◆ Select capabilities to set up (space to toggle, enter to confirm)
```

---

## Features

| | |
|---|---|
| **Project intelligence** | Detects about 50 technologies from `package.json` (including workspaces), lockfiles, `requirements*.txt`, `pyproject.toml`, `Pipfile`, `tsconfig`, Docker/compose files and framework configs. Every detection records its evidence and a confidence score. |
| **Deterministic recommendations** | A local, curated registry scored against your profile. No AI API calls and no network access are needed to recommend. |
| **Plugin manager** | Uses the documented `claude plugin` CLI. Before installing, it checks that each plugin is published in a **trusted, configured marketplace** (`claude-plugins-official`, `anthropic-plugin-directory`). Plugins that are already installed are skipped. |
| **MCP manager** | Adds servers to `.mcp.json` without modifying existing entries. Secrets are written only as `${ENV_VAR}` placeholders. |
| **Skill generator** | Writes `.claude/skills/<name>/SKILL.md` files tailored to the stack, e.g. Prisma migration commands or Pydantic validation guidance. |
| **Subagent generator** | Only agents the project needs, each with least-privilege tools. The security auditor and code reviewer are read-only. |
| **Hook generator** | Blocks edits to secret files, blocks hard-coded credentials, formats edited files, and lints before `git commit`. None of the hooks is destructive. |
| **CLAUDE.md generator** | Built from real findings (scripts, directories, stack and conventions) rather than boilerplate. |
| **Safety** | Dry-run mode, a backup before every modification, no silent overwrites, a change manifest, and `rollback`. |
| **Doctor** | Validates config, hooks, MCP, plugin duplicates, missing env vars and secret hygiene. |
| **Export / import** | Portable, versioned, secret-free selection manifest. |

## Install

```bash
npx crazy-claude init          # no install needed
# or
npm install -g crazy-claude
```

Requires Node.js ≥ 18.17. Claude Code is optional: without it, plugin recommendations are disabled and MCP equivalents are offered instead.

## Commands

| Command | What it does |
|---|---|
| `crazy-claude init` | Full interactive flow: detect → profile → recommend → select → preview → confirm → apply → verify → report |
| `crazy-claude init --dry-run` | Shows exactly what would be written or installed. Changes nothing. |
| `crazy-claude init --yes` | Non-interactive (CI). Applies the local config: CLAUDE.md, skills, agents and hooks. |
| `crazy-claude init --yes --include-external` | Also applies recommended plugins and MCP servers |
| `crazy-claude analyze [--json]` | Project profile |
| `crazy-claude recommend [--verbose] [--json]` | Recommendations with source, security and compatibility details |
| `crazy-claude install <id...>` | Apply specific recommendations, e.g. `install skill-api-design typescript-lsp` |
| `crazy-claude plugins` | Marketplaces, installed plugins, and recommended plugins with their resolved IDs |
| `crazy-claude mcp` / `mcp add [id...]` | MCP status and required env vars / add servers |
| `crazy-claude skills generate` | Generate project skills only |
| `crazy-claude agents generate` | Generate subagents only |
| `crazy-claude doctor` | Health check; exits 1 on failures |
| `crazy-claude optimize` | Re-analyze and offer only what hasn't been applied yet |
| `crazy-claude export [file]` | Write `crazy-claude.config.json` |
| `crazy-claude import [file]` | Re-create an exported setup in this project |
| `crazy-claude rollback` | Undo crazy-claude changes |

Common flags: `-C, --cwd <dir>`, `--dry-run`, `-y, --yes`, `--force` (back up and replace files that differ), `--scope project|user|local` (plugin install scope, default `project`).

## What gets written

```text
CLAUDE.md                                  project instructions
.claude/skills/<name>/SKILL.md             skills
.claude/agents/<name>.md                   subagents
.claude/hooks/crazy-claude/*.mjs           hook scripts (Node, no dependencies)
.claude/settings.json                      hook registrations (merged)
.mcp.json                                  MCP servers (merged, placeholders only)
.crazy-claude/manifest.json                what crazy-claude changed (for rollback)
.crazy-claude/backups/<timestamp>/         copies of every file modified
```

## Supported technologies

**Languages:** TypeScript, JavaScript, Python, Go, Rust · **Frontend:** React, Next.js, Vue, Nuxt, Angular, Svelte, Vite, Tailwind CSS, Three.js · **Backend:** Node.js, Express, NestJS, Fastify, Hono, Django, FastAPI, Flask · **Data:** PostgreSQL, MySQL, MongoDB, Redis, SQLite, Supabase, Prisma, Drizzle, TypeORM, SQLAlchemy · **Testing:** Jest, Vitest, Playwright, Cypress, Testing Library, pytest · **Auth:** Auth.js/NextAuth, Clerk, Passport, JWT, Lucia, Better Auth, Firebase · **Infra/tooling:** Docker, GitHub Actions, Vercel, ESLint, Prettier, Biome, Ruff, Stripe, Sentry

## Registry and sources

Each recommendation shows its **trust level**:

- `official`: plugin from Anthropic's plugin marketplaces
- `vendor`: published by the technology's vendor (e.g. Microsoft Playwright MCP, GitHub's remote MCP server, MongoDB MCP)
- `community`: third-party or unmaintained, flagged with a warning (e.g. the archived reference PostgreSQL MCP server)
- `local`: generated by crazy-claude into your repo

Plugin names in the registry were checked against the live marketplaces. They are checked again at install time, and a name that isn't found in a trusted marketplace is reported as **failed** and never guessed. See `src/registry/` to add entries.

## Security

- Never reads `.env*`, keys, or credential files during scanning. Skips `node_modules`, `.git`, build output and files over 512 KB.
- Never writes secret values. MCP credentials are `${VAR}` placeholders, and the doctor flags literal secrets in `.mcp.json`.
- Never overwrites a file silently. You choose to write a `.crazy` copy alongside it, back up and replace, or skip. Non-interactive runs skip unless `--force` is given.
- Invalid existing JSON config is reported and left untouched.
- External commands run without a shell, with fixed, documented arguments. Nothing from marketplace metadata is executed by crazy-claude.
- Plugin installs that need marketplace-declared commands are not auto-confirmed. Claude Code's own confirmation applies.
- Rollback never discards your edits. Files changed since crazy-claude wrote them are skipped unless you pass `--force`.

## Architecture

```text
src/
  core/         scanner → detector → analyzer → recommender (+ scoring)
  registry/     curated plugins, MCP servers, skills, agents, hooks
  generators/   CLAUDE.md, SKILL.md, agent .md, hook scripts + settings merge
  managers/     plugin (claude CLI), mcp, config/manifest/rollback, installer (plan → apply)
  diagnostics/  doctor
  cli/          commander commands + terminal UI
```

Recommendation is a pure function `(profile, context) → recommendations`. That keeps it deterministic and testable, and lets an optional AI-assisted ranker plug in later without changing the apply engine. `buildPlan` produces side-effect-free actions, and `applyPlan` is the only code that writes or executes.

Programmatic use:

```ts
import { analyzeProject, recommend } from 'crazy-claude';
const profile = await analyzeProject(process.cwd());
const { recommendations } = recommend(profile, { claudeAvailable: false });
```

## Development

```bash
npm install
npm run build
npm test
node dist/cli/index.js init --dry-run -C tests/fixtures/nextjs-app
```

Fixtures for React, Next.js, Express and Python live in `tests/fixtures/`.

## Contributing

PRs are welcome. To add a technology, add a rule to `TECH_RULES` in `src/core/detector.ts` and a fixture-backed test. To add a capability, add an entry in `src/registry/` with an honest `source`, `security` and `compatibility`. Only reference plugins and MCP servers that actually exist, and link the source.

## Roadmap

- Remote, signed registry with zod validation (local registry stays the fallback)
- Optional AI-assisted ranking on top of the deterministic engine
- Test-on-stop hook and per-language formatter auto-detection
- User-scope skills/agents (`~/.claude`) and team presets
- Monorepo-aware per-package CLAUDE.md files

## License

MIT
