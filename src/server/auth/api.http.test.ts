import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../app.ts';
import { API_ROUTE_MATRIX } from './matrix.ts';
import { ROLES, type Role, type SessionRecord } from './requireAuth.ts';
import { createAppSecurity, type AppSecurity } from './security.ts';
import { MemorySessionStore, type SessionStore } from './sessionStore.ts';
import { clearSessionCookieHeader } from './sessionCookie.ts';

const NOW = 1_700_000_000_000;
const PROTECTED = API_ROUTE_MATRIX.filter((rule) => !rule.public);

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function withApp(
  run: (base: string, security: AppSecurity) => Promise<void>,
  partial?: Partial<AppSecurity>,
): Promise<void> {
  const security = createAppSecurity({ now: () => NOW, ...partial });
  const app = await createApp({ vite: false, security });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('porta efêmera indisponível');
    }
    await run(`http://127.0.0.1:${String(address.port)}`, security);
  } finally {
    await closeServer(server);
    await app.closeEmbeddedServers();
  }
}

function materialize(path: string): string {
  return path.replaceAll(':id', 'id-sintetico');
}

async function send(
  base: string,
  method: string,
  path: string,
  sessionId?: string,
  init?: { headers?: Record<string, string>; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = { ...init?.headers };
  if (sessionId !== undefined) headers.authorization = `Bearer ${sessionId}`;
  let body: string | undefined;
  if (init?.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  return fetch(`${base}${path}`, { method, headers, body });
}

async function readRecord(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  assert.ok(body !== null && typeof body === 'object' && !Array.isArray(body));
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) record[key] = value;
  return record;
}

function codeOf(record: Record<string, unknown>): string {
  assert.equal(record.status, 'error');
  assert.equal(typeof record.code, 'string');
  return record.code as string;
}

async function sessionFor(
  security: AppSecurity,
  role: Role,
  userId = `user-${role}`,
  tenantId = 'tenant-a',
): Promise<SessionRecord> {
  return security.sessions.create({ userId, tenantId, role });
}

for (const rule of PROTECTED) {
  test(`sem sessão ${rule.method} ${rule.path} responde 401`, async () => {
    await withApp(async (base) => {
      const response = await send(base, rule.method, materialize(rule.path));
      assert.equal(response.status, 401);
      const record = await readRecord(response);
      assert.equal(codeOf(record), 'unauthenticated');
      assert.equal(JSON.stringify(record).includes('sessionId'), false);
    });
  });
}

for (const rule of PROTECTED) {
  for (const role of ROLES) {
    if ((rule.roles as readonly string[]).includes(role)) continue;
    test(`${role} recebe 403 em ${rule.method} ${rule.path}`, async () => {
      await withApp(async (base, security) => {
        const session = await sessionFor(security, role);
        const body = rule.path === '/api/kill-switch' ? { enabled: true, updatedBy: 'forjado' } : {};
        const response = await send(base, rule.method, materialize(rule.path), session.sessionId, {
          body: rule.method === 'POST' ? body : undefined,
        });
        assert.equal(response.status, 403);
        assert.equal(codeOf(await readRecord(response)), 'forbidden');
        assert.equal(security.killSwitch.isEnabled(), false);
      });
    });
  }
}

for (const rule of PROTECTED) {
  test(`tenant divergente em ${rule.method} ${rule.path} é 403`, async () => {
    await withApp(async (base, security) => {
      const session = await sessionFor(security, 'admin', 'user-admin');
      const response = await send(base, rule.method, materialize(rule.path), session.sessionId, {
        headers: { 'x-tenant-id': 'tenant-b' },
        body:
          rule.method === 'POST'
            ? { enabled: false, tenantId: 'tenant-b', tenant_id: 'tenant-b' }
            : undefined,
      });
      assert.equal(response.status, 403);
      assert.equal(codeOf(await readRecord(response)), 'tenant_mismatch');
    });
  });
}

test('identidade de /api/me vem da sessão e o id da sessão não volta no corpo', async () => {
  await withApp(async (base, security) => {
    const session = await sessionFor(security, 'viewer', 'user-real');
    const response = await send(base, 'GET', '/api/me', session.sessionId, {
      headers: {
        'x-user-id': 'user-forjado',
        'x-role': 'admin',
        'x-tenant-id': 'tenant-a',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await readRecord(response);
    assert.deepEqual(body, {
      userId: 'user-real',
      tenantId: 'tenant-a',
      role: 'viewer',
    });
    assert.equal(JSON.stringify(body).includes(session.sessionId), false);
  });
});

test('query, body e cookie de tenant divergentes são 403 e o tenant igual é ignorado', async () => {
  await withApp(async (base, security) => {
    const session = await sessionFor(security, 'operator', 'user-op');
    const query = await send(base, 'GET', '/api/me?tenant_id=tenant-b', session.sessionId);
    assert.equal(query.status, 403);
    assert.equal(codeOf(await readRecord(query)), 'tenant_mismatch');

    const cookie = await send(base, 'GET', '/api/me', undefined, {
      headers: { cookie: `b360_session=${session.sessionId}; tenantId=tenant-b` },
    });
    assert.equal(cookie.status, 403);
    assert.equal(codeOf(await readRecord(cookie)), 'tenant_mismatch');

    const same = await send(base, 'POST', '/api/audit-subjects', session.sessionId, {
      body: { tenantId: 'tenant-a', authorUserId: 'user-forjado', authorKind: 'humano', role: 'admin' },
    });
    assert.equal(same.status, 201);
    const created = await readRecord(same);
    assert.equal(created.authorUserId, 'user-op');
    assert.equal(created.authorKind, 'orquestrador');
    assert.equal(created.tenantId, 'tenant-a');

    const diverged = await send(base, 'POST', '/api/audit-subjects', session.sessionId, {
      body: { tenant_id: 'tenant-b' },
    });
    assert.equal(diverged.status, 403);
    assert.equal(codeOf(await readRecord(diverged)), 'tenant_mismatch');
  });
});

test('cookie opaco autentica e bearer divergente do cookie é 401', async () => {
  await withApp(async (base, security) => {
    const session = await sessionFor(security, 'viewer', 'user-cookie');
    const other = await sessionFor(security, 'admin', 'user-other');
    const ok = await send(base, 'GET', '/api/me', undefined, {
      headers: { cookie: `b360_session=${session.sessionId}; role=admin; userId=user-forjado` },
    });
    assert.equal(ok.status, 200);
    const body = await readRecord(ok);
    assert.equal(body.userId, 'user-cookie');
    assert.equal(body.role, 'viewer');

    const diverged = await send(base, 'GET', '/api/me', session.sessionId, {
      headers: { cookie: `b360_session=${other.sessionId}` },
    });
    assert.equal(diverged.status, 401);
    assert.equal(codeOf(await readRecord(diverged)), 'unauthenticated');
  });
});

test('replay de sessão revogada e sessão expirada são 401', async () => {
  await withApp(async (base, security) => {
    const kept = await sessionFor(security, 'viewer', 'user-kept');
    const revoked = await sessionFor(security, 'viewer', 'user-revoked');
    const first = await send(base, 'GET', '/api/me', revoked.sessionId);
    assert.equal(first.status, 200);
    const deleted = await send(base, 'DELETE', '/api/session', revoked.sessionId, {
      body: { sessionId: kept.sessionId },
    });
    assert.equal(deleted.status, 204);
    const cleared = deleted.headers.getSetCookie();
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0], clearSessionCookieHeader());
    const replay = await send(base, 'GET', '/api/me', revoked.sessionId);
    assert.equal(replay.status, 401);
    assert.equal(codeOf(await readRecord(replay)), 'unauthenticated');
    const second = await send(base, 'GET', '/api/me', revoked.sessionId);
    assert.equal(second.status, 401);
    const keptOk = await send(base, 'GET', '/api/me', kept.sessionId);
    assert.equal(keptOk.status, 200);
  });

  const now = () => NOW;
  const sessions = new MemorySessionStore({ now });
  await withApp(
    async (base) => {
      const expired = await sessions.create({
        userId: 'user-exp',
        tenantId: 'tenant-exp',
        role: 'viewer',
        expiresAt: NOW - 1,
      });
      const response = await send(base, 'GET', '/api/me', expired.sessionId);
      assert.equal(response.status, 401);
      assert.equal(codeOf(await readRecord(response)), 'unauthenticated');
    },
    { sessions, now },
  );
});

test('sessão incompleta e falha do store fecham em 401 ou 403 sem tenant inventado', async () => {
  const sessionId = 'b'.repeat(32);
  const incomplete: SessionStore = {
    create() {
      return Promise.reject(new Error('create não é rota'));
    },
    get(id: string) {
      if (id !== sessionId) return Promise.resolve(null);
      return Promise.resolve({
        sessionId,
        userId: 'user-a',
        tenantId: '',
        role: 'admin',
        expiresAt: NOW + 60_000,
        revokedAt: null,
      });
    },
    revoke() {
      return Promise.resolve(null);
    },
  };
  await withApp(
    async (base) => {
      const response = await send(base, 'GET', '/api/me', sessionId);
      assert.equal(response.status, 403);
      const record = await readRecord(response);
      assert.equal(codeOf(record), 'incomplete_session');
      assert.equal(JSON.stringify(record).includes('tenant-'), false);
    },
    { sessions: incomplete, now: () => NOW },
  );

  const broken: SessionStore = {
    create() {
      return Promise.reject(new Error('create não é rota'));
    },
    get() {
      return Promise.reject(new Error('disco indisponível'));
    },
    revoke() {
      return Promise.resolve(null);
    },
  };
  await withApp(
    async (base) => {
      const response = await send(base, 'GET', '/api/me', 'c'.repeat(32));
      assert.equal(response.status, 401);
      const text = await response.text();
      assert.equal(text.includes('disco'), false);
      assert.equal(text.includes('indisponível'), false);
    },
    { sessions: broken, now: () => NOW },
  );
});

test('recurso de outro tenant ou outro usuário é inacessível com o mesmo 404', async () => {
  await withApp(async (base, security) => {
    const author = await sessionFor(security, 'operator', 'user-author');
    const sameTenant = await sessionFor(security, 'admin', 'user-other');
    const otherTenant = await sessionFor(security, 'admin', 'user-cross', 'tenant-b');
    const created = await send(base, 'POST', '/api/audit-subjects', author.sessionId, { body: {} });
    assert.equal(created.status, 201);
    const subject = await readRecord(created);
    const id = subject.id;
    assert.equal(typeof id, 'string');

    const missing = await send(base, 'GET', '/api/audit-subjects/nao-existe', author.sessionId);
    const otherUser = await send(base, 'GET', `/api/audit-subjects/${String(id)}`, sameTenant.sessionId);
    const cross = await send(base, 'GET', `/api/audit-subjects/${String(id)}`, otherTenant.sessionId);
    assert.equal(missing.status, 404);
    assert.equal(otherUser.status, 404);
    assert.equal(cross.status, 404);
    const missingBody = await readRecord(missing);
    const otherBody = await readRecord(otherUser);
    const crossBody = await readRecord(cross);
    assert.deepEqual(missingBody, { status: 'error', code: 'not_found' });
    assert.deepEqual(otherBody, missingBody);
    assert.deepEqual(crossBody, missingBody);

    const own = await send(base, 'GET', `/api/audit-subjects/${String(id)}`, author.sessionId);
    assert.equal(own.status, 200);
    const ownBody = await readRecord(own);
    assert.equal(ownBody.authorUserId, 'user-author');
    assert.equal(ownBody.tenantId, 'tenant-a');

    const viewer = await sessionFor(security, 'viewer', 'user-view');
    const viewerMiss = await send(base, 'GET', `/api/audit-subjects/${String(id)}`, viewer.sessionId);
    assert.equal(viewerMiss.status, 404);
    const approval = await send(
      base,
      'POST',
      `/api/audit-subjects/${String(id)}/approval`,
      otherTenant.sessionId,
      { body: { auditorId: 'user-author' } },
    );
    assert.equal(approval.status, 404);
    assert.deepEqual(await readRecord(approval), { status: 'error', code: 'not_found' });
  });
});

test('auditor igual ao autor é 403 mesmo com ids forjados no body', async () => {
  await withApp(async (base, security) => {
    const author = await sessionFor(security, 'admin', 'user-author');
    const auditor = await sessionFor(security, 'admin', 'user-auditor');
    const created = await send(base, 'POST', '/api/audit-subjects', author.sessionId, {
      body: { authorKind: 'orquestrador', authorUserId: 'user-auditor' },
    });
    assert.equal(created.status, 201);
    const subject = await readRecord(created);
    assert.equal(subject.authorKind, 'humano');
    assert.equal(subject.authorUserId, 'user-author');
    const id = String(subject.id);

    const self = await send(base, 'POST', `/api/audit-subjects/${id}/approval`, author.sessionId, {
      body: { auditorId: 'user-auditor', authorId: 'user-auditor', authorKind: 'orquestrador' },
    });
    assert.equal(self.status, 403);
    assert.equal(codeOf(await readRecord(self)), 'self_approval');
    const after = await readRecord(
      await send(base, 'GET', `/api/audit-subjects/${id}`, author.sessionId),
    );
    assert.equal(after.approved, false);
    assert.equal(after.auditorUserId, null);

    const ok = await send(base, 'POST', `/api/audit-subjects/${id}/approval`, auditor.sessionId, {
      body: { auditorId: 'user-author', actorKind: 'orquestrador' },
    });
    assert.equal(ok.status, 200);
    const approved = await readRecord(ok);
    assert.equal(approved.auditorUserId, 'user-auditor');
    assert.equal(approved.auditorKind, 'humano');
    assert.equal(approved.authorUserId, 'user-author');
    assert.equal(JSON.stringify(approved).includes(auditor.sessionId), false);
  });
});

test('kill switch só admin, autor da sessão, e mutação recusa enquanto ligado', async () => {
  await withApp(async (base, security) => {
    const admin = await sessionFor(security, 'admin', 'user-admin');
    const operator = await sessionFor(security, 'operator', 'user-op');
    const viewer = await sessionFor(security, 'viewer', 'user-view');
    const created = await send(base, 'POST', '/api/audit-subjects', operator.sessionId, { body: {} });
    assert.equal(created.status, 201);
    const id = String((await readRecord(created)).id);

    const readDenied = await send(base, 'GET', '/api/kill-switch', operator.sessionId);
    assert.equal(readDenied.status, 403);
    assert.equal(codeOf(await readRecord(readDenied)), 'forbidden');

    const initial = await readRecord(await send(base, 'GET', '/api/kill-switch', admin.sessionId));
    assert.deepEqual(initial, { enabled: false, updatedBy: null, actorKind: null });

    const invalid = await send(base, 'POST', '/api/kill-switch', admin.sessionId, {
      body: { enabled: 'true', updatedBy: 'forjado' },
    });
    assert.equal(invalid.status, 400);
    assert.equal(security.killSwitch.isEnabled(), false);

    const engaged = await readRecord(
      await send(base, 'POST', '/api/kill-switch', admin.sessionId, {
        body: { enabled: true, updatedBy: 'forjado', actorKind: 'orquestrador', userId: 'forjado' },
      }),
    );
    assert.equal(engaged.enabled, true);
    assert.equal(engaged.updatedBy, 'user-admin');
    assert.equal(engaged.actorKind, 'humano');

    const mutation = await send(base, 'POST', '/api/audit-subjects', operator.sessionId, { body: {} });
    assert.equal(mutation.status, 403);
    assert.equal(codeOf(await readRecord(mutation)), 'kill_switch');
    const roleFirst = await send(base, 'POST', '/api/audit-subjects', viewer.sessionId, { body: {} });
    assert.equal(roleFirst.status, 403);
    assert.equal(codeOf(await readRecord(roleFirst)), 'forbidden');
    const approval = await send(base, 'POST', `/api/audit-subjects/${id}/approval`, admin.sessionId, {
      body: {},
    });
    assert.equal(approval.status, 403);
    assert.equal(codeOf(await readRecord(approval)), 'kill_switch');
    const stillThere = await send(base, 'GET', `/api/audit-subjects/${id}`, operator.sessionId);
    assert.equal(stillThere.status, 200);

    const logout = await send(base, 'DELETE', '/api/session', viewer.sessionId);
    assert.equal(logout.status, 204);
    const replay = await send(base, 'GET', '/api/me', viewer.sessionId);
    assert.equal(replay.status, 401);

    const released = await readRecord(
      await send(base, 'POST', '/api/kill-switch', admin.sessionId, {
        body: { enabled: false, updatedBy: 'forjado' },
      }),
    );
    assert.equal(released.enabled, false);
    assert.equal(released.updatedBy, 'user-admin');
    const after = await send(base, 'POST', `/api/audit-subjects/${id}/approval`, admin.sessionId, {
      body: { auditorId: 'user-op' },
    });
    assert.equal(after.status, 200);
    assert.equal((await readRecord(after)).auditorUserId, 'user-admin');
  });
});

test('caminho /api desconhecido sem sessão é 401 e com sessão é 404', async () => {
  await withApp(async (base, security) => {
    const anonymous = await send(base, 'GET', '/api/nao-existe');
    assert.equal(anonymous.status, 401);
    const session = await sessionFor(security, 'viewer');
    const known = await send(base, 'GET', '/api/nao-existe', session.sessionId);
    assert.equal(known.status, 404);
  });
});
