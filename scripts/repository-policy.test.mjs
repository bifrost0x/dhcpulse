import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import {
  findForbiddenPaths,
  findMutableReleaseDownloads,
  findUnpinnedActionReferences,
  findUnpinnedDockerImages,
} from './repository-policy.mjs';

describe('repository policy', () => {
  it('validates release artifacts before publishing architecture images', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    const containerJob = workflow.match(/\n {2}container:\n([\s\S]*?)\n {2}publish:\n/)?.[1];

    expect(containerJob).toBeDefined();
    expect(containerJob).toMatch(/^ {4}needs: static-artifacts$/m);
  });

  it('provides deterministic npm and collision-safe Compose startup paths', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const compose = await readFile('compose.yaml', 'utf8');
    const buildCompose = await readFile('compose.build.yaml', 'utf8').catch(() => '');
    const readme = await readFile('README.md', 'utf8');
    const gettingStarted = await readFile('docs/getting-started.md', 'utf8');
    const deployment = await readFile('docs/deployment.md', 'utf8');

    expect(packageJson.scripts.dev).toContain('--host 0.0.0.0');
    expect(packageJson.scripts.dev).toContain('--port 5173');
    expect(packageJson.scripts.start).toBe('npm run build && npm run preview');
    expect(packageJson.scripts.preview).toContain('--host 0.0.0.0');
    expect(packageJson.scripts.preview).toContain('--port 4173');
    expect(compose).not.toMatch(/^\s*container_name:/m);
    expect(compose).not.toMatch(/^\s*build:/m);
    expect(compose).toContain('ghcr.io/bifrost0x/dhcpulse:latest');
    expect(buildCompose).toMatch(/^\s*build:/m);
    expect(buildCompose).toContain('dhcpulse:local');
    expect(readme).toContain('http://localhost:5173/');
    expect(readme).toContain('http://localhost:8080/');
    expect(gettingStarted).toContain('http://localhost:5173/');
    expect(gettingStarted).toContain('http://localhost:4173/');
    expect(gettingStarted).toContain('http://localhost:8080/');
    expect(deployment).toContain('docker compose pull');
    expect(deployment).toContain('docker compose up -d --wait');
  });

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
