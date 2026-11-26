#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectDirectoryData, readDirectoryJson } from './inline-directory.ts';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STATIC_FILES = ['index.html', 'tokens.css', 'styles.css', 'app.js', 'directory.json'];
const STATIC_DIRS = ['favicon'];

function main(): void {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const directoryJsonPath = path.join(ROOT_DIR, 'directory.json');
  if (!fs.existsSync(directoryJsonPath)) {
    throw new Error('Expected directory.json in project root, but none was found.');
  }
  const directoryData = readDirectoryJson(directoryJsonPath);

  const copied: string[] = [];

  for (const filename of STATIC_FILES) {
    const src = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(src)) {
      throw new Error(`Expected ${filename} in project root, but none was found.`);
    }

    const dest = path.join(DIST_DIR, filename);
    if (filename === 'index.html') {
      const html = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(dest, injectDirectoryData(html, directoryData), 'utf8');
    } else {
      if (filename.endsWith('.json') && filename !== 'directory.json') {
        JSON.parse(fs.readFileSync(src, 'utf8'));
      }
      fs.copyFileSync(src, dest);
    }
    copied.push(filename);
  }

  for (const dir of STATIC_DIRS) {
    const src = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(DIST_DIR, dir), { recursive: true });
    copied.push(`${dir}/`);
  }

  console.log(`[build] Staged ${copied.length} asset(s) into dist/: ${copied.sort().join(', ')}`);
}

main();
