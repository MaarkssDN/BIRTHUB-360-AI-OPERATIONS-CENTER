import { evaluateAuditorIndependence } from '../../domain/independence.ts';
import { AuthError, type AuthContext, type Role } from './requireAuth.ts';

/** Tipo de autor derivado do papel da sessão. Nunca vem do body. */
export type ActorKind = 'humano' | 'orquestrador';

export function actorKindFromRole(role: Role): ActorKind | null {
  if (role === 'admin') return 'humano';
  if (role === 'operator') return 'orquestrador';
  return null;
}

/**
 * O auditor é o `userId` do `AuthContext`. O autor é o gravado no servidor
 * quando o recurso foi criado. Iguais, ou identidade em branco → 403.
 */
export function assertIndependentAuditor(auditorUserId: string, authorUserId: string): void {
  const verdict = evaluateAuditorIndependence({
    executorAgentId: authorUserId,
    auditorAgentId: auditorUserId,
  });
  if (!verdict.ok) {
    throw new AuthError(
      403,
      'self_approval',
      'Auditor igual ao autor, ou identidade ausente. Autoaprovação recusada.',
    );
  }
}

export function actorKindOf(auth: AuthContext): ActorKind | null {
  return actorKindFromRole(auth.role);
}
