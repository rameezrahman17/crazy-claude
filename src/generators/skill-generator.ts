import type { ProjectProfile } from '../types.js';
import { SKILLS, type SkillRegistryEntry } from '../registry/skills.js';

export interface GeneratedFile {
  path: string;
  content: string;
  recId: string;
  mode?: number;
}

/** Renders a SKILL.md with YAML frontmatter (name + description), as Claude Code expects. */
export function renderSkill(entry: SkillRegistryEntry, p: ProjectProfile): GeneratedFile {
  const content = `---
name: ${entry.skillName}
description: ${JSON.stringify(entry.trigger)}
---

${entry.body(p).trim()}
`;
  return { path: `.claude/skills/${entry.skillName}/SKILL.md`, content, recId: entry.id };
}

export function generateSkills(p: ProjectProfile, ids: string[]): GeneratedFile[] {
  return SKILLS.filter((s) => ids.includes(s.id)).map((s) => renderSkill(s, p));
}
