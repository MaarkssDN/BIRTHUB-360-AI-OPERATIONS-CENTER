/**
 * Contrato do time de autenticação. Este arquivo é o único lugar do tipo.
 * `requireAuth(request, env)` pertence a esse time e não é implementado aqui.
 * Nenhum repositório lê tenant a partir de um request.
 */

export type Role = 'viewer' | 'operator' | 'admin';

export interface AuthContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly sessionId: string;
}

export class AuthContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthContextError';
  }
}

const ROLES: readonly Role[] = ['viewer', 'operator', 'admin'];

export function parseAuthContext(value: unknown): AuthContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AuthContextError('AuthContext ausente. A chamada foi recusada.');
  }
  const record = value as Record<string, unknown>;
  const role = record.role;
  if (!isRole(role)) {
    throw new AuthContextError('Papel do AuthContext inválido.');
  }
  return {
    userId: requiredString(record.userId, 'userId'),
    tenantId: requiredString(record.tenantId, 'tenantId'),
    role,
    sessionId: requiredString(record.sessionId, 'sessionId'),
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AuthContextError(`AuthContext.${field} ausente. A chamada foi recusada.`);
  }
  return value;
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.some((role) => role === value);
}
