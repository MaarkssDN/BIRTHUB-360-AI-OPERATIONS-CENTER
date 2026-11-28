import { parseAuthContext, AuthContextError, type AuthContext } from '../auth/context.ts';
import { assertTenantIsolationConfigured } from './tenantExtension.ts';

export type { AuthContext };

export interface MissionView {
  readonly id: string;
  readonly title: string;
}

export interface MissionUnitOfWork {
  getMission(id: string): MissionView | null;
  setMissionTitle(id: string, title: string): void;
}

export interface MissionRepository {
  read<T>(auth: AuthContext, work: (unitOfWork: MissionUnitOfWork) => T): T;
  write<T>(auth: AuthContext, work: (unitOfWork: MissionUnitOfWork) => T): T;
  close(): void;
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export function requireRepositoryAuth(value: unknown, mode: 'read' | 'write'): AuthContext {
  assertTenantIsolationConfigured();
  const auth = parseAuthContext(value);
  if (mode === 'write' && auth.role === 'viewer') {
    throw new AuthContextError('Papel viewer não grava.');
  }
  return auth;
}

export function assertWork<T>(
  work: (unitOfWork: MissionUnitOfWork) => T,
): (unitOfWork: MissionUnitOfWork) => T {
  if (typeof work !== 'function') {
    throw new RepositoryError('A unidade de trabalho é obrigatória.');
  }
  return work;
}

export function assertMissionTitle(id: string, title: string): void {
  if (id.trim() === '') {
    throw new RepositoryError('Id da missão ausente.');
  }
  if (title.trim() === '') {
    throw new RepositoryError('Título da missão ausente.');
  }
}
