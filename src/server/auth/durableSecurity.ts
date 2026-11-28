import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { actorKindOf, assertIndependentAuditor } from './actor.ts';
import { ResourceError, ConflictError, type AuditSubject } from './auditLog.ts';
import { SqliteKillSwitch } from './killSwitch.ts';
import { AuthError, ROLES, isOpaqueSessionId, verifiedActorKind, type AuthContext, type SessionRecord } from './requireAuth.ts';
import { DEFAULT_SESSION_TTL_MS, SessionStoreError, type CreateSessionInput, type SessionStore } from './sessionStore.ts';
import type { AppSecurity, AuditLog } from './security.ts';

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Explicit provisioning only; never invoked from an HTTP handler or normal startup. */
export function provisionSecurityDatabase(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS aoc_sessions (
    token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
    user_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('viewer','operator','admin')),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('humano','orquestrador','runner')),
    expires_at INTEGER NOT NULL, revoked_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS aoc_audit_subjects (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, author_user_id TEXT NOT NULL,
    author_kind TEXT NOT NULL CHECK(author_kind IN ('humano','orquestrador','runner')),
    approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
    auditor_user_id TEXT, auditor_kind TEXT,
    CHECK(auditor_user_id IS NULL OR auditor_user_id <> author_user_id),
    CHECK((approved = 0 AND auditor_user_id IS NULL AND auditor_kind IS NULL) OR
      (approved = 1 AND auditor_user_id IS NOT NULL AND auditor_kind = 'humano'))
  );`);
  SqliteKillSwitch.provision(db);
}
export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: DatabaseSync, private readonly now = Date.now) {}
  async create(input: CreateSessionInput): Promise<SessionRecord> {
    await Promise.resolve();
    const userId = input.userId?.trim(), tenantId = input.tenantId?.trim();
    const actorKind = verifiedActorKind(input.actorKind);
    const now = this.now();
    const expiresAt = input.expiresAt ?? now + (input.ttlMs ?? DEFAULT_SESSION_TTL_MS);
    if (!userId || !tenantId || !actorKind || !ROLES.includes(input.role) ||
        !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > DEFAULT_SESSION_TTL_MS) {
      throw new SessionStoreError('Sessão ou identidade inválida.');
    }
    const sessionId = crypto.randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO aoc_sessions VALUES (?, ?, ?, ?, ?, ?, NULL)')
      .run(hash(sessionId), userId, tenantId, input.role, actorKind, expiresAt);
    return { sessionId, userId, tenantId, role: input.role, actorKind, expiresAt, revokedAt: null };
  }
  async get(sessionId: string): Promise<SessionRecord | null> {
    await Promise.resolve();
    if (!isOpaqueSessionId(sessionId)) return null;
    const row = this.db.prepare('SELECT * FROM aoc_sessions WHERE token_hash = ?').get(hash(sessionId));
    if (!row || typeof row.user_id !== 'string' || typeof row.tenant_id !== 'string' ||
        typeof row.role !== 'string' || typeof row.expires_at !== 'number' ||
        (row.revoked_at !== null && typeof row.revoked_at !== 'number')) return null;
    const actorKind = verifiedActorKind(row.actor_kind);
    if (!actorKind) return null;
    return { sessionId, userId: row.user_id, tenantId: row.tenant_id, role: row.role,
      actorKind, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }
  async revoke(sessionId: string, revokedAt = this.now()): Promise<SessionRecord | null> {
    if (!isOpaqueSessionId(sessionId)) return null;
    if (!Number.isSafeInteger(revokedAt)) throw new SessionStoreError('Revogação inválida.');
    this.db.prepare('UPDATE aoc_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?')
      .run(revokedAt, hash(sessionId));
    return this.get(sessionId);
  }
}
export class SqliteAuditLog implements AuditLog {
  constructor(private readonly db: DatabaseSync) {}
  private find(id: string, tenantId: string): AuditSubject {
    const row = this.db.prepare('SELECT * FROM aoc_audit_subjects WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId);
    const authorKind = verifiedActorKind(row?.author_kind);
    if (!row || !authorKind || typeof row.author_user_id !== 'string') throw new ResourceError();
    return { id, tenantId, authorUserId: row.author_user_id, authorKind, approved: row.approved === 1,
      auditorUserId: typeof row.auditor_user_id === 'string' ? row.auditor_user_id : null,
      auditorKind: verifiedActorKind(row.auditor_kind) ?? null };
  }
  create(auth: AuthContext): AuditSubject {
    const kind = actorKindOf(auth);
    if (!kind || (auth.role !== 'admin' && auth.role !== 'operator')) {
      throw new AuthError(403, 'forbidden', 'Papel insuficiente.');
    }
    const id = crypto.randomBytes(16).toString('base64url');
    this.db.prepare('INSERT INTO aoc_audit_subjects(id, tenant_id, author_user_id, author_kind) VALUES (?, ?, ?, ?)')
      .run(id, auth.tenantId, auth.userId, kind);
    return this.find(id, auth.tenantId);
  }
  readOwn(id: string, auth: AuthContext): AuditSubject {
    const subject = this.find(id, auth.tenantId);
    if (subject.authorUserId !== auth.userId) throw new ResourceError();
    return subject;
  }
  approve(id: string, auditor: AuthContext): AuditSubject {
    const subject = this.find(id, auditor.tenantId);
    assertIndependentAuditor(auditor.userId, subject.authorUserId);
    if (auditor.role !== 'admin' || actorKindOf(auditor) !== 'humano') {
      throw new AuthError(403, 'forbidden', 'Papel insuficiente.');
    }
    const result = this.db.prepare(`UPDATE aoc_audit_subjects
      SET approved=1, auditor_user_id=?, auditor_kind='humano'
      WHERE id=? AND tenant_id=? AND approved=0 AND author_user_id<>?`)
      .run(auditor.userId, id, auditor.tenantId, auditor.userId);
    if (Number(result.changes) !== 1) throw new ConflictError();
    return this.find(id, auditor.tenantId);
  }
}
export function openDurableSecurity(filename: string | undefined): { security: AppSecurity; close(): void } {
  if (!filename || !path.isAbsolute(filename)) throw new Error('Banco de segurança não configurado.');
  const resolved = path.resolve(filename);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() ||
      fs.realpathSync.native(resolved) !== resolved ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('Banco de segurança inválido ou permissões inseguras.');
  }
  const db = new DatabaseSync(resolved);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 1000;');
    db.prepare('SELECT token_hash, actor_kind, revoked_at FROM aoc_sessions LIMIT 0').all();
    db.prepare('SELECT id, tenant_id, author_kind, approved FROM aoc_audit_subjects LIMIT 0').all();
    const state = db.prepare('SELECT enabled FROM aoc_emergency_stop WHERE id=1').get();
    if (!state || (state.enabled !== 0 && state.enabled !== 1)) throw new Error('Suspensão indisponível.');
    const security: AppSecurity = { now: Date.now, sessions: new SqliteSessionStore(db),
      audits: new SqliteAuditLog(db), killSwitch: new SqliteKillSwitch(db) };
    return { security, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}
