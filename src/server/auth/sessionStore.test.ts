import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SESSION_COOKIE_NAME } from './requireAuth.ts';
import { clearSessionCookieHeader, sessionCookieHeader } from './sessionCookie.ts';
import {
  DEFAULT_SESSION_TTL_MS,
  MemorySessionStore,
  SessionStoreError,
  type CreateSessionInput,
} from './sessionStore.ts';

const NOW = 1_700_000_000_000;

function store(): MemorySessionStore {
  return new MemorySessionStore({ now: () => NOW });
}

test('create gera id opaco e ignora id enviado pelo chamador', async () => {
  const sessions = store();
  const input: CreateSessionInput = {
    userId: ' user-a ',
    tenantId: ' tenant-a ',
    role: 'viewer',
  };
  const forged = { ...input, sessionId: 'cliente-escolheu-o-id-xxxxxx' };
  const created = await sessions.create(forged);
  assert.notEqual(created.sessionId, 'cliente-escolheu-o-id-xxxxxx');
  assert.match(created.sessionId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.sessionId.includes('.'), false);
  assert.equal(created.userId, 'user-a');
  assert.equal(created.tenantId, 'tenant-a');
  assert.equal(created.role, 'viewer');
  assert.equal(created.revokedAt, null);
  assert.equal(created.expiresAt, NOW + DEFAULT_SESSION_TTL_MS);
  assert.equal(DEFAULT_SESSION_TTL_MS, 8 * 60 * 60 * 1000);

  const again = await sessions.create(input);
  assert.notEqual(again.sessionId, created.sessionId);
  const loaded = await sessions.get(created.sessionId);
  assert.equal(loaded?.role, 'viewer');
});

test('create recusa tenant, usuário ou papel ausentes e não grava sessão', async () => {
  const sessions = store();
  const cases: Array<CreateSessionInput> = [
    { userId: 'user-a', tenantId: '   ', role: 'admin' },
    { userId: ' ', tenantId: 'tenant-a', role: 'admin' },
    { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' as CreateSessionInput['role'] },
  ];
  for (const input of cases) {
    await assert.rejects(
      () => sessions.create(input),
      (error: unknown) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.message.includes('default'), false);
        return true;
      },
    );
  }
  assert.equal(await sessions.get('a'.repeat(32)), null);
});

test('get devolve sessão expirada e revoke mantém o registro', async () => {
  const sessions = store();
  const created = await sessions.create({
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: 'operator',
    expiresAt: NOW - 5,
  });
  const expired = await sessions.get(created.sessionId);
  assert.equal(expired?.expiresAt, NOW - 5);

  const active = await sessions.create({
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: 'operator',
  });
  const revoked = await sessions.revoke(active.sessionId, NOW);
  assert.equal(revoked?.revokedAt, NOW);
  const again = await sessions.revoke(active.sessionId, NOW + 10);
  assert.equal(again?.revokedAt, NOW);
  assert.equal((await sessions.get(active.sessionId))?.revokedAt, NOW);
  assert.equal(await sessions.revoke('a'.repeat(32)), null);
});

test('o cookie leva só o id opaco, com HttpOnly, Secure e SameSite=Strict', () => {
  const sessionId = 'a'.repeat(32);
  const header = sessionCookieHeader(sessionId, 60);
  assert.equal(
    header,
    `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=60`,
  );
  assert.equal(header.includes('Domain='), false);
  assert.equal(
    clearSessionCookieHeader(),
    `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
  );
  assert.throws(() => sessionCookieHeader('aaaaaaaa.bbbbbbbb.cccccccc', 60));
  assert.throws(() => sessionCookieHeader('curto', 60));
  assert.throws(() => sessionCookieHeader(sessionId, -1));

  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const dev = sessionCookieHeader(sessionId, 10);
  process.env.NODE_ENV = 'production';
  const prod = sessionCookieHeader(sessionId, 10);
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
  assert.equal(dev, prod);
  assert.match(dev, /Secure/);
});
