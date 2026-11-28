import { evaluateAuditorIndependence } from '../../domain/independence.ts';
import { AuthError, verifiedActorKind, type AuthContext, type ActorKind } from './requireAuth.ts';
export type { ActorKind } from './requireAuth.ts';

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
  return verifiedActorKind(auth.actorKind) ?? null;
}
