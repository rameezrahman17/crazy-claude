import type { RegistryEntry } from './types.js';

/**
 * Curated Claude Code plugins. Names were verified against the `claude-plugins-official`
 * and `anthropic-plugin-directory` marketplaces (Claude Code 2.1.x, `claude plugin list --available --json`).
 * The plugin manager re-verifies availability at runtime and never installs a name it cannot resolve.
 */
const MARKETPLACE = 'Claude Code plugin marketplace (claude-plugins-official / anthropic-plugin-directory)';
const REF = 'https://code.claude.com/docs/en/plugins';

const plugin = (e: Omit<RegistryEntry, 'type' | 'source' | 'requiresApproval'> & { trust?: RegistryEntry['source']['trust'] }): RegistryEntry => ({
  ...e,
  type: e.id.endsWith('-lsp') ? 'lsp' : 'plugin',
  requiresApproval: true,
  source: { trust: e.trust ?? 'official-anthropic', origin: MARKETPLACE, reference: REF },
});

export const PLUGINS: RegistryEntry[] = [
  plugin({
    id: 'typescript-lsp', name: 'typescript-lsp', triggers: ['typescript', 'javascript'],
    description: 'TypeScript/JavaScript language server: go-to-definition, references and diagnostics for Claude.',
    reason: (m) => `${m.join(', ')} detected — gives Claude real type information instead of guessing.`,
    basePriority: 78, compatibility: 'Requires typescript-language-server on PATH (npm i -g typescript-language-server typescript).',
    security: 'Runs a local language server process; no network access.',
  }),
  plugin({
    id: 'pyright-lsp', name: 'pyright-lsp', triggers: ['python'],
    description: 'Pyright language server for Python type checking and navigation.',
    reason: () => 'Python detected — enables type-aware navigation and diagnostics.',
    basePriority: 76, compatibility: 'Requires pyright on PATH (npm i -g pyright or pip install pyright).',
    security: 'Runs a local language server process; no network access.',
  }),
  plugin({
    id: 'gopls-lsp', name: 'gopls-lsp', triggers: ['go'],
    description: 'Go language server (gopls) integration.', reason: () => 'Go module detected.',
    basePriority: 76, compatibility: 'Requires gopls on PATH.', security: 'Local process only.',
  }),
  plugin({
    id: 'rust-analyzer-lsp', name: 'rust-analyzer-lsp', triggers: ['rust'],
    description: 'rust-analyzer language server integration.', reason: () => 'Cargo project detected.',
    basePriority: 76, compatibility: 'Requires rust-analyzer on PATH.', security: 'Local process only.',
  }),
  plugin({
    id: 'context7', name: 'context7', triggers: [], always: true, trust: 'official-vendor',
    description: 'Up-to-date, version-specific library documentation pulled into context (Upstash Context7).',
    reason: () => 'Reduces hallucinated APIs by fetching current docs for your dependencies.',
    basePriority: 62, compatibility: 'Any project. Uses a remote MCP endpoint.',
    security: 'Sends library names/queries to context7.com. Do not include proprietary code in queries.',
    supersedes: ['mcp-context7'],
  }),
  plugin({
    id: 'playwright', name: 'playwright', triggers: ['playwright', 'react', 'nextjs', 'vue', 'angular', 'svelte'], trust: 'official-vendor',
    description: 'Microsoft Playwright MCP: lets Claude drive a real browser to verify UI and write E2E tests.',
    reason: (m) => `${m.join(', ')} detected — Claude can open the app and check its own UI work.`,
    basePriority: 60, compatibility: 'Downloads browser binaries on first use.',
    security: 'Browser can reach any URL; review actions on authenticated sites.',
    supersedes: ['mcp-playwright'],
  }),
  plugin({
    id: 'github', name: 'github', triggers: ['github-actions'], condition: (p) => p.hasGit, trust: 'official-vendor',
    description: 'GitHub integration: issues, pull requests, Actions runs and code search.',
    reason: () => 'Git repository detected — manage PRs and issues without leaving Claude.',
    basePriority: 58, compatibility: 'Needs a GitHub token or OAuth on first use.',
    security: 'Grants repo access with your token scopes. Use a fine-grained token with least privilege.',
    supersedes: ['mcp-github'],
  }),
  plugin({
    id: 'supabase', name: 'supabase', triggers: ['supabase'], trust: 'official-vendor',
    description: 'Supabase MCP integration: inspect schema, run SQL, manage migrations and edge functions.',
    reason: () => 'Supabase client/config detected.',
    basePriority: 74, compatibility: 'Authenticates with your Supabase account via OAuth.',
    security: 'Can modify databases. Prefer a development project and read-only mode for production.',
    supersedes: ['mcp-supabase', 'mcp-postgres'],
  }),
  plugin({
    id: 'prisma', name: 'prisma', triggers: ['prisma'], trust: 'official-vendor',
    description: 'Prisma MCP integration for schema management and migrations.',
    reason: () => 'Prisma schema detected.', basePriority: 70,
    compatibility: 'Uses the Prisma CLI from your project.', security: 'Migrations change databases — review before applying.',
  }),
  plugin({
    id: 'mongodb', name: 'mongodb', triggers: ['mongodb'], trust: 'official-vendor',
    description: 'Official MongoDB plugin (MCP server + skills) for querying and schema exploration.',
    reason: () => 'MongoDB driver detected.', basePriority: 70,
    compatibility: 'Needs a MongoDB connection string at runtime.',
    security: 'Use a read-only database user where possible.', supersedes: ['mcp-mongodb'],
  }),
  plugin({
    id: 'vercel', name: 'vercel', triggers: ['nextjs', 'vercel'], trust: 'official-vendor',
    description: 'Vercel deployment and project management integration.',
    reason: (m) => `${m.join(', ')} detected — deploy previews and inspect build logs.`,
    basePriority: 48, compatibility: 'Requires a Vercel account.', security: 'Can trigger deployments.',
  }),
  plugin({
    id: 'stripe', name: 'stripe', triggers: ['stripe'], trust: 'official-vendor',
    description: 'Stripe integration and best-practice guidance for payments code.',
    reason: () => 'Stripe SDK detected.', basePriority: 60,
    compatibility: 'Requires a Stripe account.', security: 'Use test-mode keys only during development.',
  }),
  plugin({
    id: 'sentry', name: 'sentry', triggers: ['sentry'], trust: 'official-vendor',
    description: 'Sentry error monitoring: pull issues and stack traces into Claude.',
    reason: () => 'Sentry SDK detected.', basePriority: 55,
    compatibility: 'Requires a Sentry account.', security: 'Error payloads can include user data.',
  }),
  plugin({
    id: 'firebase', name: 'firebase', triggers: ['firebase-auth'], trust: 'official-vendor',
    description: 'Google Firebase MCP integration (Firestore, Auth, hosting).',
    reason: () => 'Firebase SDK detected.', basePriority: 60,
    compatibility: 'Requires the Firebase CLI login.', security: 'Can modify production data — use emulators where possible.',
  }),
  plugin({
    id: 'frontend-design', name: 'frontend-design', triggers: ['react', 'nextjs', 'vue', 'angular', 'svelte', 'tailwind'],
    description: 'Guidance for distinctive, production-grade frontend design.',
    reason: (m) => `${m.join(', ')} detected.`, basePriority: 50,
    compatibility: 'Skill-only plugin; no external services.', security: 'No code execution.',
  }),
  plugin({
    id: 'security-guidance', name: 'security-guidance',
    triggers: ['express', 'nestjs', 'fastify', 'hono', 'django', 'fastapi', 'flask', 'nextauth', 'clerk', 'passport', 'jwt', 'better-auth', 'lucia'],
    description: 'Warns about common security pitfalls (injection, XSS, unsafe eval) while Claude edits code.',
    reason: (m) => `Server/auth code detected (${m.join(', ')}).`, basePriority: 66,
    compatibility: 'Installs a PreToolUse hook.', security: 'Read-only analysis of edits.',
  }),
  plugin({
    id: 'pr-review-toolkit', name: 'pr-review-toolkit', triggers: [], always: true, condition: (p) => p.hasGit,
    description: 'Specialized PR review agents: tests, error handling, types, comments, simplification.',
    reason: () => 'Git repository detected — structured review before merging.', basePriority: 52,
    compatibility: 'Works best with the GitHub CLI (gh).', security: 'Reads diffs; does not push.',
  }),
  plugin({
    id: 'commit-commands', name: 'commit-commands', triggers: [], always: true, condition: (p) => p.hasGit,
    description: 'Slash commands for commit, push and PR creation workflows.',
    reason: () => 'Git repository detected.', basePriority: 40,
    compatibility: 'Requires git; PR commands need gh.', security: 'Commands push to remotes only when invoked.',
  }),
  plugin({
    id: 'feature-dev', name: 'feature-dev', triggers: [], always: true,
    description: 'Structured feature development workflow with explorer, architect and reviewer agents.',
    reason: () => 'Useful for any codebase with non-trivial features.', basePriority: 42,
    compatibility: 'Any project.', security: 'No external services.',
  }),
  plugin({
    id: 'claude-md-management', name: 'claude-md-management', triggers: [], always: true,
    description: 'Audit and keep CLAUDE.md files accurate as the project evolves.',
    reason: () => 'Keeps the generated CLAUDE.md from going stale.', basePriority: 38,
    compatibility: 'Any project.', security: 'Edits CLAUDE.md files only.',
  }),
];
