import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { analyzeProject } from '../src/core/analyzer.js';
import { recommend } from '../src/core/recommender.js';
import { scoreEntry, matchEntry } from '../src/core/scoring.js';
import { REGISTRY } from '../src/registry/index.js';
import type { RegistryEntry } from '../src/registry/types.js';
import { FIXTURES } from './helpers.js';

const profile = (n: string) => analyzeProject(path.join(FIXTURES, n));

describe('recommendation scoring', () => {
  const entry = REGISTRY.find((e) => e.id === 'skill-api-design')!;

  it('scales with detection confidence', () => {
    const strong = scoreEntry(entry, { matched: ['Express'], confidence: 0.95 });
    const weak = scoreEntry(entry, { matched: ['Express'], confidence: 0.5 });
    expect(strong).toBeGreaterThan(weak);
  });

  it('rewards breadth of matching technologies, capped at 100', () => {
    const one = scoreEntry(entry, { matched: ['a'], confidence: 1 });
    const many = scoreEntry(entry, { matched: ['a', 'b', 'c', 'd', 'e', 'f'], confidence: 1 });
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(100);
  });

  it('does not match entries whose triggers are absent', async () => {
    const p = await profile('python-api');
    expect(matchEntry(REGISTRY.find((e) => e.id === 'skill-react-components')!, p)).toBeNull();
  });

  it('produces stack-relevant recommendations sorted by priority', async () => {
    const { recommendations } = recommend(await profile('nextjs-app'), { claudeAvailable: true });
    const ids = recommendations.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['claude-md', 'skill-nextjs-app-router', 'skill-database-optimization', 'agent-frontend-engineer', 'prisma']));
    expect(ids).not.toContain('skill-python-conventions');
    expect(ids).not.toContain('agent-backend-engineer');
    const prio = recommendations.map((r) => r.priority);
    expect([...prio].sort((a, b) => b - a)).toEqual(prio);
  });

  it('every recommendation carries source, security, compatibility and priority', async () => {
    const { recommendations } = recommend(await profile('express-api'), { claudeAvailable: true });
    for (const r of recommendations) {
      expect(r.source.origin).toBeTruthy();
      expect(r.security).toBeTruthy();
      expect(r.compatibility).toBeTruthy();
      expect(r.reasons[0]).toBeTruthy();
      expect(r.priority).toBeGreaterThanOrEqual(0);
    }
  });

  it('drops plugins when Claude Code is unavailable', async () => {
    const { recommendations, skipped } = recommend(await profile('nextjs-app'), { claudeAvailable: false });
    expect(recommendations.some((r) => r.type === 'plugin' || r.type === 'lsp')).toBe(false);
    expect(skipped.some((s) => s.reason.includes('Claude Code CLI not found'))).toBe(true);
    // ...and MCP equivalents are then offered instead.
    expect(recommendations.map((r) => r.id)).toContain('mcp-playwright');
  });
});

describe('duplicate handling', () => {
  it('a recommended plugin supersedes its MCP equivalent', async () => {
    const { recommendations, skipped } = recommend(await profile('express-api'), { claudeAvailable: true });
    const ids = recommendations.map((r) => r.id);
    expect(ids).toContain('mongodb');
    expect(ids).not.toContain('mcp-mongodb');
    expect(skipped.find((s) => s.id === 'mcp-mongodb')?.reason).toMatch(/covered by mongodb/);
  });

  it('keeps superseded entries when explicitly requested', async () => {
    const { recommendations } = recommend(await profile('express-api'), { claudeAvailable: true, keepSuperseded: true });
    expect(recommendations.map((r) => r.id)).toContain('mcp-mongodb');
  });

  it('installed plugins are not re-recommended and suppress their MCP twin', async () => {
    const { recommendations, skipped } = recommend(await profile('react-app'), { claudeAvailable: true, installedPlugins: ['context7'] });
    const ids = recommendations.map((r) => r.id);
    expect(ids).not.toContain('context7');
    expect(ids).not.toContain('mcp-context7');
    expect(skipped.find((s) => s.id === 'context7')?.reason).toBe('plugin already installed');
  });

  it('skips MCP servers that are already configured', async () => {
    const { recommendations } = recommend(await profile('react-app'), { claudeAvailable: false, existingMcpServers: ['playwright'] });
    expect(recommendations.map((r) => r.id)).not.toContain('mcp-playwright');
  });

  it('ignores duplicate registry ids', async () => {
    const dup: RegistryEntry = { ...REGISTRY[0]! };
    const { recommendations, skipped } = recommend(await profile('react-app'), { claudeAvailable: true, registry: [REGISTRY[0]!, dup] });
    expect(recommendations.filter((r) => r.id === dup.id)).toHaveLength(1);
    expect(skipped.some((s) => s.reason === 'duplicate registry id')).toBe(true);
  });

  it('registry ids are unique', () => {
    const ids = REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
