#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STATIC_EXTENSIONS = new Set(['.html', '.css', '.js']);
const STATIC_DIRS = ['favicon'];

function main(): void {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const entries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
  const copied: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!STATIC_EXTENSIONS.has(path.extname(entry.name))) continue;

    fs.copyFileSync(path.join(ROOT_DIR, entry.name), path.join(DIST_DIR, entry.name));
    copied.push(entry.name);
  }

  for (const dir of STATIC_DIRS) {
    const src = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(DIST_DIR, dir), { recursive: true });
    copied.push(`${dir}/`);
  }

  if (!copied.includes('index.html')) {
    throw new Error('Expected index.html in project root, but none was found.');
  }

  console.log(`[build] Staged ${copied.length} asset(s) into dist/: ${copied.sort().join(', ')}`);
}

main();
