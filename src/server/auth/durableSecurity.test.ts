import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDurableSecurity, provisionSecurityDatabase } from './durableSecurity.ts';
import { requireAuth } from './requireAuth.ts';

test('bootstrap durável exige arquivo provisionado e preserva sessão revogada, auditoria e suspensão', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aoc-security-'));
  const file = path.join(dir, 'security.sqlite');
  try {
    assert.throws(() => openDurableSecurity(undefined));
    assert.throws(() => openDurableSecurity(file));
    const db = new DatabaseSync(file);
    try {
      fs.chmodSync(file, 0o600);
      assert.throws(() => openDurableSecurity(file));
      provisionSecurityDatabase(db);
    } finally { db.close(); }
    let connection = openDurableSecurity(file);
    const human = { userId: 'human-synthetic', tenantId: 'tenant-a', role: 'admin' as const,
      actorKind: 'humano' as const };
    const author = { userId: 'author-synthetic', tenantId: 'tenant-a', role: 'operator' as const,
      actorKind: 'orquestrador' as const };
    try {
      const session = await connection.security.sessions.create(human);
      const authorSession = await connection.security.sessions.create(author);
      const resolve = (sessionId: string) => requireAuth({ headers: { authorization: 'Bearer ' + sessionId } },
        { getSession: (id) => connection.security.sessions.get(id) });
      const auth = await resolve(session.sessionId);
      const authorAuth = await resolve(authorSession.sessionId);
      assert.equal(connection.security.killSwitch.isEnabled(), true);
      const subject = connection.security.audits.create(authorAuth);
      connection.security.audits.approve(subject.id, auth);
      connection.security.killSwitch.setEnabled(false, auth);
      connection.security.killSwitch.setEnabled(true, auth);
      await connection.security.sessions.revoke(session.sessionId);
      connection.close();
      connection = openDurableSecurity(file);
      assert.equal(connection.security.killSwitch.isEnabled(), true);
      await assert.rejects(() => resolve(session.sessionId), /revogada/);
      const nextAuthor = await resolve(authorSession.sessionId);
      assert.equal(connection.security.audits.readOwn(subject.id, nextAuthor).approved, true);
      assert.throws(() => connection.security.audits.readOwn(subject.id, { ...nextAuthor, tenantId: 'tenant-b' }));
      const check = new DatabaseSync(file);
      try {
        const row = check.prepare('SELECT token_hash FROM aoc_sessions LIMIT 1').get();
        assert.equal(String(row?.token_hash).length, 64);
        assert.notEqual(row?.token_hash, session.sessionId);
      } finally { check.close(); }
    } finally { connection.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
