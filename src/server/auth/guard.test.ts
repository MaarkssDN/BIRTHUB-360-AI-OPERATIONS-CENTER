import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';
import { bindSyntheticDatabase } from '../../../test/with-synthetic-db.ts';
import { createApp } from '../app.ts';
import { createApiGuard, assertApiRouteMatrix, assertApiRoutesGuarded, listApiRoutes } from './guard.ts';
import { createAppSecurity } from './security.ts';

const sandbox = bindSyntheticDatabase();

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test('uma rota /api registrada antes do guard falha a checagem', () => {
  const bare = express();
  bare.get('/api/segredo', (_req, res) => {
    res.status(200).end();
  });
  assert.throws(() => {
    assertApiRoutesGuarded(bare);
  }, /\/api\/segredo/);
});

test('o app real segue a matriz e a allowlist é só health e ready', async () => {
  const app = await createApp({ vite: false });
  assertApiRoutesGuarded(app);
  assertApiRouteMatrix(app);
  const guarded = listApiRoutes(app).filter((route) => route.path.startsWith('/api'));
  assert.ok(guarded.length > 0);
  for (const route of guarded) {
    assert.equal(route.guarded, true, `${route.method} ${route.path}`);
  }
});

test('rota /api fora da allowlist sem sessão responde 401 e as públicas não vazam identidade', async () => {
  const app = await createApp({ vite: false });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('porta efêmera indisponível');
    }
    const base = `http://127.0.0.1:${String(address.port)}`;
    const dbPath = sandbox.dbPath();
    for (const route of listApiRoutes(app)) {
      if (!route.path.startsWith('/api')) continue;
      const path = route.path.replaceAll(':id', 'id-sintetico');
      const response = await fetch(`${base}${path}`, { method: route.method });
      const key = `${route.method} ${route.path}`;
      const text = await response.text();
      assert.equal(text.includes(dbPath), false, key);
      assert.equal(text.includes('userId'), false, key);
      assert.equal(text.includes('tenantId'), false, key);
      assert.equal(text.includes('sessionId'), false, key);
      if (key === 'GET /api/health' || key === 'GET /api/ready') {
        assert.equal(response.status, 200, key);
      } else {
        assert.equal(response.status, 401, key);
      }
    }

    const healthSlash = await fetch(`${base}/api/health/`);
    assert.equal(healthSlash.status, 200);
    const healthPost = await fetch(`${base}/api/health`, { method: 'POST' });
    assert.equal(healthPost.status, 401);
    const healthHead = await fetch(`${base}/api/health`, { method: 'HEAD' });
    assert.equal(healthHead.status, 200);
    const aliased = await fetch(`${base}/API/me`);
    assert.equal(aliased.status, 401);
    const trailed = await fetch(`${base}/api/me/`);
    assert.equal(trailed.status, 401);
    const garbage = await fetch(`${base}/api/health`, {
      headers: { authorization: 'Bearer nao-e-sessao' },
    });
    assert.equal(garbage.status, 200);
  } finally {
    await closeServer(server);
    await app.closeEmbeddedServers();
  }
});

test('o guard de um app vazio não libera /api/segredo', async () => {
  const bare = express();
  bare.use(createApiGuard(createAppSecurity()));
  bare.get('/api/segredo', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  bare.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status =
      typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    res.status(status).end();
  });
  const server = bare.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('porta efêmera indisponível');
    }
    const response = await fetch(`http://127.0.0.1:${String(address.port)}/api/segredo`);
    assert.equal(response.status, 401);
  } finally {
    await closeServer(server);
  }
});
