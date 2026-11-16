import type { ProjectProfile } from '../types.js';
import { AGENTS, type AgentRegistryEntry } from '../registry/agents.js';
import type { GeneratedFile } from './skill-generator.js';

/** Renders a subagent definition: YAML frontmatter (name, description, tools) + system prompt. */
export function renderAgent(entry: AgentRegistryEntry, p: ProjectProfile): GeneratedFile {
  const content = `---
name: ${entry.agentName}
description: ${JSON.stringify(entry.delegateWhen)}
tools: ${entry.tools.join(', ')}
---

${entry.body(p).trim()}
`;
  return { path: `.claude/agents/${entry.agentName}.md`, content, recId: entry.id };
}

export function generateAgents(p: ProjectProfile, ids: string[]): GeneratedFile[] {
  return AGENTS.filter((a) => ids.includes(a.id)).map((a) => renderAgent(a, p));
}
