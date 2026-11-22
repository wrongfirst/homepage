#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const ALLOWED_ROOT_FILES = new Set(['index.html', 'styles.css', 'tokens.css', 'app.js', 'directory.json']);
const ALLOWED_DIRS = new Set(['favicon']);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function parseArgs(argv: string[]): { serveDist: boolean; port: number; host?: string } {
  const serveDist = argv.includes('--dist');
  let port = Number(process.env.PORT) || (serveDist ? 8080 : 5173);
  let host: string | undefined = process.env.HOST || undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) port = parsed;
      i++;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number.parseInt(arg.slice('--port='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) port = parsed;
    } else if (arg === '--host') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        host = next;
        i++;
      } else {
        host = '0.0.0.0';
      }
    } else if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length) || '0.0.0.0';
    }
  }

  return { serveDist, port, host };
}

function isTailscaleIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function getTailscaleAddresses(): Array<{ name: string; address: string }> {
  const results: Array<{ name: string; address: string }> = [];
  const seen = new Set<string>();
  const interfaces = os.networkInterfaces();

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.internal || entry.family !== 'IPv4') continue;
      if (name.toLowerCase().startsWith('tailscale') || isTailscaleIpv4(entry.address)) {
        if (!seen.has(entry.address)) {
          seen.add(entry.address);
          results.push({ name, address: entry.address });
        }
      }
    }
  }

  return results;
}

function getNetworkIpv4Addresses(): Array<{ name: string; address: string }> {
  const results: Array<{ name: string; address: string }> = [];
  const interfaces = os.networkInterfaces();

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.internal || entry.family !== 'IPv4') continue;
      results.push({ name, address: entry.address });
    }
  }

  return results;
}

const { serveDist, port, host } = parseArgs(process.argv.slice(2));
const baseDir = serveDist ? DIST_DIR : ROOT_DIR;

function resolveRequestPath(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const normalized = path.posix.normalize(decoded);
  const rel = normalized === '/' ? 'index.html' : normalized.replace(/^\/+/, '');
  const parts = rel.split('/');

  if (parts.includes('..')) return null;

  if (serveDist) {
    const fullPath = path.resolve(DIST_DIR, ...parts);
    return fullPath.startsWith(DIST_DIR + path.sep) || fullPath === DIST_DIR ? fullPath : null;
  }

  if (parts.length === 1 && ALLOWED_ROOT_FILES.has(parts[0])) {
    return path.join(ROOT_DIR, parts[0]);
  }
  if (parts.length >= 2 && ALLOWED_DIRS.has(parts[0])) {
    return path.join(ROOT_DIR, ...parts);
  }
  return null;
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let pathname: string;
  try {
    pathname = new URL(req.url, `http://localhost:${port}`).pathname;
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  const filePath = resolveRequestPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function listenOn(bindHost: string): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);
    server.once('error', reject);
    server.listen(port, bindHost, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

async function main(): Promise<void> {
  const servers: http.Server[] = [];

  if (host) {
    servers.push(await listenOn(host));
    console.log(`Serving files from ${baseDir}`);
    if (host === '0.0.0.0' || host === '::') {
      console.log(`  Local:   http://localhost:${port}`);
      for (const iface of getNetworkIpv4Addresses()) {
        console.log(`  Network: http://${iface.address}:${port}  (${iface.name})`);
      }
    } else {
      console.log(`  Server:  http://${host}:${port}`);
    }
  } else {
    // Default: bind localhost (IPv4 + optional IPv6) and any active Tailscale interface
    servers.push(await listenOn('127.0.0.1'));
    try {
      servers.push(await listenOn('::1'));
    } catch {
      // IPv6 loopback may be unavailable
    }

    const tailscaleIfaces = getTailscaleAddresses();
    const boundTailscale: Array<{ name: string; address: string }> = [];
    for (const iface of tailscaleIfaces) {
      try {
        servers.push(await listenOn(iface.address));
        boundTailscale.push(iface);
      } catch (err: any) {
        console.warn(`[dev] Could not bind Tailscale interface ${iface.name} (${iface.address}): ${err.message}`);
      }
    }

    console.log(`Serving files from ${baseDir}`);
    console.log(`  Local:     http://localhost:${port}`);
    for (const iface of boundTailscale) {
      console.log(`  Tailscale: http://${iface.address}:${port}  (${iface.name})`);
    }
  }

  const shutdown = () => {
    for (const s of servers) s.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`[dev] Failed to start server: ${err.message}`);
  process.exit(1);
});
