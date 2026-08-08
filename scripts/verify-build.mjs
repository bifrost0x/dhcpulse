import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDirectory = new URL('../dist/', import.meta.url);
const distPath = fileURLToPath(distDirectory);
const html = await readFile(new URL('index.html', distDirectory), 'utf8');
const assets = await readdir(new URL('assets/', distDirectory));
const scripts = assets.filter((name) => name.endsWith('.js'));

if (!html.includes("connect-src 'none'")) {
  throw new Error("Production HTML must enforce connect-src 'none'.");
}

if (/(?:src|href)="\/(?!\/)/.test(html)) {
  throw new Error('Production HTML contains a root-relative asset that breaks subpath hosting.');
}

if (scripts.length === 0) {
  throw new Error('Production build contains no JavaScript asset.');
}

const networkPrimitive = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/;
for (const script of scripts) {
  const source = await readFile(join(distPath, 'assets', script), 'utf8');
  const match = source.match(networkPrimitive);
  if (match) {
    throw new Error(`Production JavaScript contains network primitive: ${match[1]}.`);
  }
}

console.log(`Verified ${scripts.length} JavaScript asset: no network primitives and CSP blocks connections.`);
