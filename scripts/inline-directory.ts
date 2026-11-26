import fs from 'node:fs';

const APP_SCRIPT_PATTERN = /<script\s+src=["'](?:\.\/)?app\.js["']\s*><\/script>/;

export function serializeForInlineScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function injectDirectoryData(html: string, directoryData: unknown): string {
  if (!APP_SCRIPT_PATTERN.test(html)) {
    throw new Error('Could not find <script src="app.js"></script> in index.html to inject window.DIRECTORY_DATA.');
  }

  const inlineScript = `<script>window.DIRECTORY_DATA = ${serializeForInlineScript(directoryData)};</script>`;
  return html.replace(APP_SCRIPT_PATTERN, (match) => `${inlineScript}\n  ${match}`);
}

export function readDirectoryJson(directoryJsonPath: string): unknown {
  return JSON.parse(fs.readFileSync(directoryJsonPath, 'utf8'));
}
