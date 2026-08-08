import path from 'node:path';

const forbiddenDirectoryPrefixes = [
  '.agents/',
  '.codex/',
  '.idea/',
  '.secrets/',
  '.vscode/',
  '.worktrees/',
  'docs/development/',
  'docs/superpowers/',
  'graphify-out/',
  'plans/',
  'secrets/',
  'worktrees/',
];

const forbiddenExactPaths = new Set([
  '.github/copilot-instructions.md',
  '.npmrc',
  'agents.md',
  'claude.md',
  'gemini.md',
  'plan.md',
]);

const forbiddenCredentialExtensions = new Set(['.key', '.p12', '.pem', '.pfx']);

function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

function isForbiddenPath(filePath) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const basename = path.posix.basename(normalizedPath);

  if (forbiddenExactPaths.has(normalizedPath)) {
    return true;
  }

  if (forbiddenDirectoryPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    return true;
  }

  if (
    (basename === '.env' || basename.startsWith('.env.')) &&
    basename !== '.env.example'
  ) {
    return true;
  }

  if (basename === 'implementation-plan.md' || basename.endsWith('-implementation-plan.md')) {
    return true;
  }

  return forbiddenCredentialExtensions.has(path.posix.extname(normalizedPath));
}

export function findForbiddenPaths(filePaths) {
  return filePaths.filter(isForbiddenPath);
}

export function findUnpinnedActionReferences(workflows) {
  const findings = [];

  for (const workflow of workflows) {
    const lines = workflow.content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const match = line.match(/^\s*(?:-\s+)?uses:\s+([^\s#]+)(?:\s+#.*)?$/);
      if (!match) {
        continue;
      }

      const reference = match[1].replace(/^['"]|['"]$/g, '');
      if (reference.startsWith('./') || /@[0-9a-f]{40}$/i.test(reference)) {
        continue;
      }

      findings.push(`${workflow.path}:${index + 1} ${reference}`);
    }
  }

  return findings;
}

export function findUnpinnedDockerImages(dockerfile) {
  const findings = [];
  const lines = dockerfile.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i);
    if (!match) {
      continue;
    }

    const image = match[1];
    if (image.toLowerCase() === 'scratch' || /@sha256:[0-9a-f]{64}$/i.test(image)) {
      continue;
    }

    findings.push(`line ${index + 1} ${image}`);
  }

  return findings;
}
