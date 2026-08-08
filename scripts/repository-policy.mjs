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
