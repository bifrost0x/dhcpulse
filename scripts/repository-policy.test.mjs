import { describe, expect, it } from 'vitest';

import { findForbiddenPaths } from './repository-policy.mjs';

describe('repository policy', () => {
  it('rejects internal planning and local tool artifacts', () => {
    expect(
      findForbiddenPaths([
        'docs/development/implementation-plan.md',
        'docs/superpowers/plans/release.md',
        'plans/next-release.md',
        '.codex/settings.json',
        '.agents/config.json',
        'graphify-out/graph.json',
        '.worktrees/release/index',
        'AGENTS.md',
        'CLAUDE.md',
        'GEMINI.md',
        '.github/copilot-instructions.md',
      ]),
    ).toEqual([
      'docs/development/implementation-plan.md',
      'docs/superpowers/plans/release.md',
      'plans/next-release.md',
      '.codex/settings.json',
      '.agents/config.json',
      'graphify-out/graph.json',
      '.worktrees/release/index',
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
      '.github/copilot-instructions.md',
    ]);
  });

  it('rejects local editor state and credential material', () => {
    expect(
      findForbiddenPaths([
        '.vscode/settings.json',
        '.idea/workspace.xml',
        '.env',
        '.env.production',
        '.npmrc',
        'secrets/token.txt',
        '.secrets/token.txt',
        'certificates/server.key',
        'certificates/server.pem',
        'certificates/server.p12',
        'certificates/server.pfx',
      ]),
    ).toHaveLength(11);
  });

  it('allows public product documentation, source code, and env templates', () => {
    expect(
      findForbiddenPaths([
        'docs/architecture/initial-release.md',
        'src/domain/planner.ts',
        'src/domain/planner.test.ts',
        '.env.example',
        'SECURITY.md',
      ]),
    ).toEqual([]);
  });
});
