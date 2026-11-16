import type { ProjectProfile } from '../types.js';
import type { RegistryEntry } from '../registry/types.js';

export interface Match {
  matched: string[];
  confidence: number;
}

/** Returns which triggers matched, or null if the entry does not apply to this project. */
export function matchEntry(entry: RegistryEntry, profile: ProjectProfile): Match | null {
  if (entry.condition && !entry.condition(profile)) return null;
  const hits = profile.technologies.filter((t) => entry.triggers.includes(t.id));
  if (hits.length === 0) {
    return entry.always ? { matched: [], confidence: 1 } : null;
  }
  return { matched: hits.map((t) => t.name), confidence: Math.max(...hits.map((t) => t.confidence)) };
}

/**
 * Priority 0–100: base priority, boosted for each additional matching technology,
 * scaled by detection confidence so weak evidence (e.g. a stray .py file) ranks lower.
 */
export function scoreEntry(entry: RegistryEntry, match: Match): number {
  const breadthBonus = Math.min(10, Math.max(0, match.matched.length - 1) * 3);
  const confidenceFactor = 0.6 + 0.4 * match.confidence;
  return Math.max(0, Math.min(100, Math.round((entry.basePriority + breadthBonus) * confidenceFactor)));
}

/** Score at/above which a recommendation is pre-selected. */
export const DEFAULT_SELECT_THRESHOLD = 55;
