import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { bindSyntheticDatabase } from '../../test/with-synthetic-db.ts';
import { HealthResponseSchema, ReadyResponseSchema } from '../shared/contracts.ts';
import { createApp, type CreateAppOptions } from './app.ts';

const sandbox = bindSyntheticDatabase();

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function withClient(
  run: (baseUrl: string) => Promise<void>,
  options: CreateAppOptions = {},
): Promise<void> {
  const app = await createApp({ vite: false, ...options });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('porta efêmera indisponível');
    }
    await run(`http://127.0.0.1:${String(address.port)}`);
  } finally {
    await closeServer(server);
    await app.closeEmbeddedServers();
  }
}

type SocketKind = 'loopback' | 'public' | 'other';

function classifySocket(hexAddress: string): SocketKind {
  const normalized = hexAddress.toLowerCase();
  if (normalized === '0100007f' || normalized === '00000000000000000000000001000000') {
    return 'loopback';
  }
  if (normalized === '00000000' || /^0+$/.test(normalized)) {
    return 'public';
  }
  return 'other';
}

function ownListeningSockets(): SocketKind[] {
  const inodes = new Set<string>();
  for (const fd of fsSync.readdirSync('/proc/self/fd')) {
    try {
      const link = fsSync.readlinkSync(`/proc/self/fd/${fd}`);
      const match = /socket:\[(\d+)\]/.exec(link);
      if (match?.[1]) {
        inodes.add(match[1]);
      }
    } catch {
      // descritor fechado entre a listagem e a leitura
    }
  }
  const kinds: SocketKind[] = [];
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const rows = fsSync.readFileSync(table, 'utf8').trim().split('\n').slice(1);
    for (const row of rows) {
      const columns = row.trim().split(/\s+/);
      const local = columns[1];
      const state = columns[3];
      const inode = columns[9];
      if (state !== '0A' || !local || !inode || !inodes.has(inode)) {
        continue;
      }
      const hexAddress = local.split(':')[0];
      if (hexAddress) {
        kinds.push(classifySocket(hexAddress));
      }
    }
  }
  return kinds;
}

test('GET /api/health não devolve o banco', async () => {
  await withClient(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    assert.deepEqual(HealthResponseSchema.parse(body), {
      status: 'ok',
      service: 'b360-aoc',
      persistence: 'fail-closed',
    });
    assert.equal(JSON.stringify(body).includes('MSN-SYNTHETIC'), false);
  });
});

test('GET /api/ready expõe só schema e seed', async () => {
  await withClient(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ready`);
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    assert.deepEqual(ReadyResponseSchema.parse(body), {
      status: 'ready',
      schemaVersion: 1,
      seed: 'synthetic',
    });
  });
});

test('GET /api/ready falha fechado e não recria o arquivo', async () => {
  const filePath = sandbox.dbPath();
  await fs.rm(filePath);
  await withClient(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ready`);
    assert.equal(response.status, 503);
    const body: unknown = await response.json();
    const parsed = ReadyResponseSchema.parse(body);
    assert.equal(parsed.status, 'not-ready');
    assert.match(parsed.error ?? '', /fail-closed/);
  });
  await assert.rejects(fs.access(filePath));
});

test('o client estático não mascara /api e devolve o index', async () => {
  const clientDir = path.join(sandbox.dir(), 'client');
  await fs.mkdir(clientDir);
  await fs.writeFile(path.join(clientDir, 'index.html'), '<div id="root">scaffold</div>', 'utf8');
  await withClient(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /scaffold/);
    const nested = await fetch(`${baseUrl}/qualquer`);
    assert.equal(nested.status, 200);
    assert.match(await nested.text(), /scaffold/);
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-powered-by'), null);
    const missingApi = await fetch(`${baseUrl}/api/nao-existe`);
    assert.equal(missingApi.status, 404);
  }, { clientDir });
});

test('GET /api/ready não devolve caminho absoluto', async () => {
  const filePath = sandbox.dbPath();
  await fs.rm(filePath);
  await fs.mkdir(filePath);
  await withClient(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ready`);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body.includes(filePath), false);
    assert.match(body, /Falha ao ler o banco/);
  });
});

test('o HMR do Vite em modo dev escuta só em loopback', { timeout: 120_000 }, async () => {
  const app = await createApp({ vite: true });
  try {
    const kinds = ownListeningSockets();
    assert.equal(kinds.includes('public'), false);
    assert.equal(kinds.includes('other'), false);
    assert.equal(kinds.includes('loopback'), true);
  } finally {
    await app.closeEmbeddedServers();
  }
});

test('index ausente no client estático não vira seed do banco', async () => {
  const clientDir = path.join(sandbox.dir(), 'client-vazio');
  await fs.mkdir(clientDir);
  await withClient(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/painel`);
    assert.equal(page.status, 404);
    const state = await fs.readFile(sandbox.dbPath(), 'utf8');
    assert.match(state, /synthetic/);
  }, { clientDir });
});
