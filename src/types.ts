export type TechCategory =
  | 'language'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'orm'
  | 'testing'
  | 'styling'
  | 'infra'
  | 'auth'
  | 'tooling'
  | 'graphics';

export interface DetectedTech {
  id: string;
  name: string;
  category: TechCategory;
  /** 0..1 — how sure we are the project uses this */
  confidence: number;
  /** Human-readable evidence, e.g. "package.json dependency: next" */
  evidence: string[];
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'poetry' | 'uv' | 'unknown';

export interface ProjectProfile {
  root: string;
  name: string;
  description?: string;
  packageManager: PackageManager;
  languages: string[];
  technologies: DetectedTech[];
  /** package.json scripts (name -> command) */
  scripts: Record<string, string>;
  /** Well-known top-level directories that exist */
  directories: string[];
  /** Notable config files present */
  configFiles: string[];
  isMonorepo: boolean;
  hasGit: boolean;
  existing: {
    claudeMd: boolean;
    claudeDir: boolean;
    mcpJson: boolean;
    settingsJson: boolean;
    skills: string[];
    agents: string[];
  };
  fileCount: number;
}

export type RecommendationType = 'plugin' | 'mcp' | 'skill' | 'agent' | 'hook' | 'lsp' | 'instructions';

export type SourceTrust = 'official-anthropic' | 'official-vendor' | 'community' | 'generated-local';

export interface Recommendation {
  id: string;
  name: string;
  type: RecommendationType;
  description: string;
  reasons: string[];
  technologies: string[];
  source: {
    trust: SourceTrust;
    /** e.g. "claude-plugins-official marketplace", "npm: @playwright/mcp" */
    origin: string;
    reference?: string;
  };
  compatibility: string;
  security: string;
  priority: number;
  requiresApproval: boolean;
  /** Ids that duplicate this capability; the higher priority one wins */
  supersedes?: string[];
}

export interface CliOptions {
  cwd: string;
  dryRun: boolean;
  yes: boolean;
  force: boolean;
  scope: 'project' | 'user' | 'local';
}
