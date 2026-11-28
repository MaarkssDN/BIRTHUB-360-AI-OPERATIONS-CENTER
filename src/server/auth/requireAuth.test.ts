import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthError,
  requireAuth,
  type RequireAuthRequest,
  type SessionRecord,
} from './requireAuth.ts';

const NOW = 1_700_000_000_000;
const SESSION_ID = 'sess_opaque_id_0001';

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: SESSION_ID,
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: 'operator',
    expiresAt: NOW + 60_000,
    revokedAt: null,
    ...overrides,
  };
}

function envFor(stored: SessionRecord | null, now = NOW) {
  return {
    now: () => now,
    getSession: (sessionId: string) =>
      stored && stored.sessionId === sessionId ? stored : null,
  };
}

function request(overrides: Partial<RequireAuthRequest> = {}): RequireAuthRequest {
  return {
    headers: { authorization: `Bearer ${SESSION_ID}` },
    query: {},
    body: {},
    ...overrides,
  };
}

test('sessão válida devolve identidade só do registro do servidor', async () => {
  const auth = await requireAuth(
    request({
      headers: {
        authorization: `Bearer ${SESSION_ID}`,
        'x-user-id': 'user-forjado',
        'x-role': 'admin',
      },
      query: { userId: 'user-forjado', role: 'admin' },
      body: { userId: 'user-forjado', role: 'admin', authorId: 'autor-forjado' },
    }),
    envFor(record()),
  );

  assert.deepEqual(auth, {
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: 'operator',
    sessionId: SESSION_ID,
  });
  assert.throws(() => {
    (auth as { role: string }).role = 'admin';
  });
});

test('sem credencial, sessão desconhecida e cookie ilegível são 401', async () => {
  await assert.rejects(() => requireAuth({ headers: {} }, envFor(record())), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'unauthenticated');
    return true;
  });

  await assert.rejects(() => requireAuth(request(), envFor(null)), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.status, 401);
    return true;
  });

  await assert.rejects(
    () => requireAuth({ headers: { cookie: 'b360_session=%E0%A4%A' } }, envFor(record())),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test('sessão expirada ou revogada é 401 e o mesmo id não volta a autenticar', async () => {
  await assert.rejects(
    () => requireAuth(request(), envFor(record({ expiresAt: NOW - 1 }))),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      assert.match(error.message, /expirada/i);
      return true;
    },
  );

  const revoked = record({ revokedAt: NOW - 10 });
  await assert.rejects(() => requireAuth(request(), envFor(revoked)), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.status, 401);
    assert.match(error.message, /revogada/i);
    return true;
  });

  await assert.rejects(() => requireAuth(request(), envFor(revoked)), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.status, 401);
    return true;
  });
});

test('bearer e cookie de sessão divergentes são 401', async () => {
  const other = 'sess_opaque_id_0002';
  await assert.rejects(
    () =>
      requireAuth(
        request({
          headers: {
            authorization: `Bearer ${SESSION_ID}`,
            cookie: `b360_session=${other}`,
          },
        }),
        envFor(record()),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test('cookie opaco resolve a sessão sem ler identidade do cookie', async () => {
  const auth = await requireAuth(
    {
      headers: {
        cookie: `b360_session=${SESSION_ID}; userId=user-forjado; role=admin`,
      },
    },
    envFor(record({ role: 'viewer' })),
  );

  assert.equal(auth.userId, 'user-a');
  assert.equal(auth.role, 'viewer');
  assert.equal(auth.tenantId, 'tenant-a');
});

test('tenant_id do cliente é ignorado quando coincide e 403 quando diverge', async () => {
  const sources: Array<(tenant: string) => RequireAuthRequest> = [
    (tenant) =>
      request({ headers: { authorization: `Bearer ${SESSION_ID}`, 'x-tenant-id': tenant } }),
    (tenant) => request({ query: { tenant_id: tenant } }),
    (tenant) => request({ query: { tenantId: tenant } }),
    (tenant) => request({ body: { tenant_id: tenant, userId: 'user-forjado' } }),
    (tenant) => request({ body: { tenantId: tenant } }),
    (tenant) =>
      request({
        headers: {
          authorization: `Bearer ${SESSION_ID}`,
          cookie: `tenant_id=${encodeURIComponent(tenant)}`,
        },
      }),
  ];

  for (const build of sources) {
    const same = await requireAuth(build('tenant-a'), envFor(record()));
    assert.equal(same.tenantId, 'tenant-a');
    assert.equal(same.userId, 'user-a');

    await assert.rejects(() => requireAuth(build('tenant-b'), envFor(record())), (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'tenant_mismatch');
      return true;
    });
  }
});

test('tenant enviado como objeto não vira o tenant da sessão', async () => {
  await assert.rejects(
    () =>
      requireAuth(
        request({ query: { tenantId: { nested: 'tenant-a' } } }),
        envFor(record()),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'tenant_mismatch');
      return true;
    },
  );
});

test('token com pontos, no formato de JWT, é 401', async () => {
  await assert.rejects(
    () =>
      requireAuth(
        { headers: { authorization: 'Bearer aaaaaaaa.bbbbbbbb.cccccccc' } },
        envFor(record()),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 'unauthenticated');
      return true;
    },
  );
});

test('sessão sem tenant, sem usuário ou sem papel conhecido é 403 e não cai num tenant default', async () => {
  const incomplete: Array<Partial<SessionRecord>> = [
    { tenantId: '' },
    { tenantId: '   ' },
    { tenantId: undefined },
    { userId: '' },
    { userId: undefined },
    { role: '' },
    { role: undefined },
    { role: 'superadmin' },
    { role: 'ADMIN' },
    { role: 'owner' },
  ];

  for (const override of incomplete) {
    await assert.rejects(
      () => requireAuth(request(), envFor(record(override))),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.status, 403);
        assert.equal(error.code, 'incomplete_session');
        assert.equal(error.message.includes('default'), false);
        return true;
      },
    );
  }
});

test('registro apontando para outro sessionId é 401', async () => {
  await assert.rejects(
    () =>
      requireAuth(request(), {
        now: () => NOW,
        getSession: () => record({ sessionId: 'sess_opaque_id_other' }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      return true;
    },
  );
});
