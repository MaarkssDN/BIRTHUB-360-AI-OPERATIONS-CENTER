import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { AuthError, ROLES, verifiedActorKind, type ActorKind, type Role, type SessionRecord } from './requireAuth.ts';
import type { SessionStore } from './sessionStore.ts';

const credentialPattern = /^[A-Za-z0-9_-]{43}$/;
function digest(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
export function provisionPrincipalRegistry(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS aoc_principals (
    credential_hash TEXT PRIMARY KEY CHECK(length(credential_hash)=64),
    user_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('viewer','operator','admin')),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('humano','orquestrador','runner')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    UNIQUE(user_id,tenant_id)
  );`);
}
/** Trusted offline provisioning only. No request path calls this function.
 * Caller handles verification of human identity and secure delivery of key. */
export function registerPrincipal(db: DatabaseSync, identity: {
  userId: string; tenantId: string; role: Role; actorKind: ActorKind;
}): string {
  if (!identity.userId.trim() || !identity.tenantId.trim() ||
      !ROLES.includes(identity.role) || !verifiedActorKind(identity.actorKind)) throw new Error('Identidade inválida.');
  const secret = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO aoc_principals(credential_hash,user_id,tenant_id,role,actor_kind) VALUES (?,?,?,?,?)')
    .run(digest(secret), identity.userId.trim(), identity.tenantId.trim(), identity.role, identity.actorKind);
  return secret;
}
/** The only credential input is the opaque secret; identity/role/tenant come
 * from an explicitly provisioned registry. Never expose this as public HTTP. */
export async function issueAuthenticatedSession(db: DatabaseSync, sessions: SessionStore, credential: string): Promise<SessionRecord> {
  const deny = () => new AuthError(401, 'unauthenticated', 'Credencial inválida.');
  if (!credentialPattern.test(credential)) throw deny();
  const row = db.prepare('SELECT user_id,tenant_id,role,actor_kind FROM aoc_principals WHERE credential_hash=? AND active=1')
    .get(digest(credential));
  const kind = verifiedActorKind(row?.actor_kind);
  const role = ROLES.find((candidate) => candidate === row?.role);
  if (!row || !kind || !role || typeof row.user_id !== 'string' || typeof row.tenant_id !== 'string') throw deny();
  return sessions.create({ userId: row.user_id, tenantId: row.tenant_id, role, actorKind: kind, ttlMs: 15 * 60_000 });
}
