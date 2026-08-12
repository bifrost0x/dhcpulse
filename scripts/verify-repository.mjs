import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import process from 'node:process';
import path from 'node:path';

import {
  findForbiddenPaths,
  findMutableReleaseDownloads,
  findUnpinnedActionReferences,
  findUnpinnedDockerImages,
} from './repository-policy.mjs';

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
const workflowDirectory = '.github/workflows';
const workflows = readdirSync(workflowDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
  .map((entry) => {
    const workflowPath = path.posix.join(workflowDirectory, entry.name);
    return {
      path: workflowPath,
      content: readFileSync(workflowPath, 'utf8'),
    };
  });
const unpinnedActions = findUnpinnedActionReferences(workflows);
const mutableReleaseDownloads = findMutableReleaseDownloads(workflows);
const unpinnedDockerImages = findUnpinnedDockerImages(readFileSync('Dockerfile', 'utf8'));

if (forbiddenPaths.length > 0 || unpinnedActions.length > 0 || unpinnedDockerImages.length > 0 || mutableReleaseDownloads.length > 0) {
  console.error('Repository verification failed.');
  if (forbiddenPaths.length > 0) {
    console.error('Forbidden tracked paths:');
  }
  for (const filePath of forbiddenPaths) {
    console.error(`- ${filePath}`);
  }
  if (unpinnedActions.length > 0) {
    console.error('Mutable GitHub Action references:');
  }
  for (const reference of unpinnedActions) {
    console.error(`- ${reference}`);
  }
  if (unpinnedDockerImages.length > 0) {
    console.error('Docker base images without immutable digests:');
  }
  for (const image of unpinnedDockerImages) {
    console.error(`- ${image}`);
  }
  if (mutableReleaseDownloads.length > 0) {
    console.error('Mutable latest-release workflow downloads:');
  }
  for (const reference of mutableReleaseDownloads) {
    console.error(`- ${reference}`);
  }
  process.exit(1);
}

console.log(`Repository verification passed (${trackedFiles.length} tracked files checked).`);
