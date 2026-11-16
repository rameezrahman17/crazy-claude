import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { analyzeProject } from '../src/core/analyzer.js';
import { generateSkills } from '../src/generators/skill-generator.js';
import { generateAgents } from '../src/generators/agent-generator.js';
import { generateHooks, mergeHookSettings } from '../src/generators/hook-generator.js';
import { generateClaudeMd } from '../src/generators/claude-md.js';
import { SKILLS } from '../src/registry/skills.js';
import { AGENTS } from '../src/registry/agents.js';
import { FIXTURES } from './helpers.js';

const fm = (text: string) => Object.fromEntries([...text.match(/^---\n([\s\S]*?)\n---/)![1]!.matchAll(/^([\w-]+): (.*)$/gm)].map((m) => [m[1], m[2]]));

describe('skill generation', () => {
  it('renders valid SKILL.md files with name + description frontmatter', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'nextjs-app'));
    const files = generateSkills(p, SKILLS.map((s) => s.id));
    expect(files.length).toBe(SKILLS.length);
    for (const f of files) {
      expect(f.path).toMatch(/^\.claude\/skills\/[a-z0-9-]+\/SKILL\.md$/);
      const meta = fm(f.content);
      expect(meta.name).toBe(f.path.split('/')[2]);
      expect(JSON.parse(meta.description!)).toMatch(/^Use (when|for)/);
      expect(f.content.length).toBeGreaterThan(300);
    }
  });

  it('tailors content to the detected stack', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'nextjs-app'));
    const [db] = generateSkills(p, ['skill-database-optimization']);
    expect(db!.content).toContain('prisma migrate dev');
    const py = await analyzeProject(path.join(FIXTURES, 'python-api'));
    const [api] = generateSkills(py, ['skill-api-design']);
    expect(api!.content).toContain('Pydantic');
  });
});

describe('agent generation', () => {
  it('renders agents with name, description and a restricted tool list', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'express-api'));
    const files = generateAgents(p, AGENTS.map((a) => a.id));
    for (const f of files) {
      const meta = fm(f.content);
      expect(f.path).toBe(`.claude/agents/${meta.name}.md`);
      expect(meta.description).toBeTruthy();
      expect(meta.tools).toMatch(/Read/);
      expect(f.content).toMatch(/## (Boundaries|Check for)/);
    }
  });

  it('keeps the security auditor and reviewer read-only', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'express-api'));
    const [sec, rev] = generateAgents(p, ['agent-security-auditor', 'agent-code-reviewer']);
    expect(fm(sec!.content).tools).not.toMatch(/Edit|Write/);
    expect(fm(rev!.content).tools).not.toMatch(/Edit|Write/);
  });
});

describe('hooks and CLAUDE.md', () => {
  it('merges hook settings without duplicating or dropping existing hooks', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'react-app'));
    const { settings: entries } = generateHooks(p, ['hook-secret-scan', 'hook-format-on-edit']);
    const existing = { model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }] } };
    const once = mergeHookSettings(existing, entries);
    const twice = mergeHookSettings(once.settings, entries);
    expect(once.added).toBe(2);
    expect(twice.added).toBe(0);
    expect(JSON.stringify(twice.settings)).toContain('mine.sh');
    expect((twice.settings as { model: string }).model).toBe('opus');
  });

  it('generates a CLAUDE.md grounded in real project findings', async () => {
    const p = await analyzeProject(path.join(FIXTURES, 'express-api'));
    const md = generateClaudeMd(p);
    expect(md).toContain('# express-api');
    expect(md).toContain('yarn lint');
    expect(md).toContain('Express');
    expect(md).toContain('MongoDB');
    expect(md).toMatch(/## Security/);
  });
});
