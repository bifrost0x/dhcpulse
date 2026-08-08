import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { findForbiddenPaths } from './repository-policy.mjs';

const result = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
  windowsHide: true,
});

if (result.error || result.status !== 0) {
  const reason = result.error?.message ?? result.stderr.trim() ?? 'unknown Git error';
  console.error(`Repository verification could not list tracked files: ${reason}`);
  process.exit(1);
}

const trackedFiles = result.stdout.split('\0').filter(Boolean);
const forbiddenPaths = findForbiddenPaths(trackedFiles);

if (forbiddenPaths.length > 0) {
  console.error('Repository verification failed. Forbidden tracked paths:');
  for (const filePath of forbiddenPaths) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log(`Repository verification passed (${trackedFiles.length} tracked files checked).`);
