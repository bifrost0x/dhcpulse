import { describe, expect, it } from 'vitest';

import {
  findForbiddenPaths,
  findMutableReleaseDownloads,
  findUnpinnedActionReferences,
  findUnpinnedDockerImages,
} from './repository-policy.mjs';

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

  it('rejects mutable GitHub Action references', () => {
    expect(
      findUnpinnedActionReferences([
        {
          path: '.github/workflows/ci.yml',
          content: `steps:
  - uses: actions/checkout@v5
  - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
  - name: Deploy
    uses: actions/deploy-pages@v4
  - uses: ./local-action
`,
        },
      ]),
    ).toEqual([
      '.github/workflows/ci.yml:2 actions/checkout@v5',
      '.github/workflows/ci.yml:5 actions/deploy-pages@v4',
    ]);
  });

  it('rejects Docker base images without immutable digests', () => {
    expect(
      findUnpinnedDockerImages(`FROM --platform=linux/amd64 node:24-alpine
FROM nginx:1.31@sha256:${'a'.repeat(64)}
FROM scratch
`),
    ).toEqual(['line 1 node:24-alpine']);
  });

  it('rejects mutable latest-release downloads in workflows', () => {
    expect(findMutableReleaseDownloads([{
      path: '.github/workflows/security.yml',
      content: `run: curl -L https://github.com/tool/project/releases/latest/download/tool.tar.gz
run: curl -L https://github.com/tool/project/releases/download/v1.2.3/tool.tar.gz
`,
    }])).toEqual([
      '.github/workflows/security.yml:1 run: curl -L https://github.com/tool/project/releases/latest/download/tool.tar.gz',
    ]);
  });
});
