/** Programmatic API — the CLI is a thin layer over these modules. */
export { analyzeProject } from './core/analyzer.js';
export { detectTechnologies, TECH_RULES } from './core/detector.js';
export { scanProject } from './core/scanner.js';
export { recommend } from './core/recommender.js';
export { scoreEntry, matchEntry } from './core/scoring.js';
export { REGISTRY } from './registry/index.js';
export { buildPlan, applyPlan } from './managers/installer.js';
export { PluginManager } from './managers/plugin-manager.js';
export { runDoctor } from './diagnostics/doctor.js';
export { generateClaudeMd } from './generators/claude-md.js';
export type * from './types.js';
