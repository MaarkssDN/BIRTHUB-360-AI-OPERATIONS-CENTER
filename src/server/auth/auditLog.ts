import { randomBytes } from 'node:crypto';
import { actorKindFromRole, assertIndependentAuditor, type ActorKind } from './actor.ts';
import { AuthError, type AuthContext } from './requireAuth.ts';

export class ResourceError extends Error {
  readonly status = 404 as const;
  readonly code = 'not_found' as const;

  constructor() {
    super('Recurso inacessível.');
    this.name = 'ResourceError';
  }
}

export class ConflictError extends Error {
  readonly status = 409 as const;
  readonly code = 'already_approved' as const;

  constructor() {
    super('Recurso já aprovado.');
    this.name = 'ConflictError';
  }
}

export type AuditSubject = {
  readonly id: string;
  readonly tenantId: string;
  readonly authorUserId: string;
  readonly authorKind: ActorKind;
  readonly approved: boolean;
  readonly auditorUserId: string | null;
  readonly auditorKind: ActorKind | null;
};

/**
 * Sujeitos de auditoria em memória. O autor é copiado do `AuthContext`
 * no `create`. Leitura é só do próprio autor no próprio tenant.
 * Aprovação é no tenant da sessão e recusa auditor = autor.
 */
export class MemoryAuditLog {
  private readonly records = new Map<string, AuditSubject>();

  create(auth: AuthContext): AuditSubject {
    const authorKind = actorKindFromRole(auth.role);
    if ((auth.role !== 'admin' && auth.role !== 'operator') || !authorKind) {
      throw new AuthError(403, 'forbidden', 'Papel insuficiente.');
    }
    const subject: AuditSubject = Object.freeze({
      id: randomBytes(16).toString('base64url'),
      tenantId: auth.tenantId,
      authorUserId: auth.userId,
      authorKind,
      approved: false,
      auditorUserId: null,
      auditorKind: null,
    });
    this.records.set(subject.id, subject);
    return subject;
  }

  readOwn(id: string, auth: AuthContext): AuditSubject {
    const current = this.records.get(id);
    if (!current || current.tenantId !== auth.tenantId || current.authorUserId !== auth.userId) {
      throw new ResourceError();
    }
    return current;
  }

  approve(id: string, auditor: AuthContext): AuditSubject {
    const current = this.records.get(id);
    if (!current || current.tenantId !== auditor.tenantId) {
      throw new ResourceError();
    }
    assertIndependentAuditor(auditor.userId, current.authorUserId);
    const auditorKind = actorKindFromRole(auditor.role);
    if (auditor.role !== 'admin' || auditorKind !== 'humano') {
      throw new AuthError(403, 'forbidden', 'Papel insuficiente.');
    }
    if (current.approved) {
      throw new ConflictError();
    }
    const next: AuditSubject = Object.freeze({
      ...current,
      approved: true,
      auditorUserId: auditor.userId,
      auditorKind,
    });
    this.records.set(id, next);
    return next;
  }
}
