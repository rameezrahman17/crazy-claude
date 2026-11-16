import type { ProjectProfile, RecommendationType, SourceTrust } from '../types.js';

export interface RegistryEntry {
  id: string;
  name: string;
  type: RecommendationType;
  description: string;
  /** Tech ids that trigger this entry. Empty + `always` means recommend for every project. */
  triggers: string[];
  always?: boolean;
  /** Extra gate evaluated against the profile (e.g. "has a git repo"). */
  condition?: (p: ProjectProfile) => boolean;
  /** Why it is recommended, given the matched technology names. */
  reason: (matched: string[]) => string;
  basePriority: number;
  source: { trust: SourceTrust; origin: string; reference?: string };
  compatibility: string;
  security: string;
  requiresApproval: boolean;
  /** Recommendation ids this entry makes redundant (e.g. a plugin bundling the same MCP server). */
  supersedes?: string[];
}
