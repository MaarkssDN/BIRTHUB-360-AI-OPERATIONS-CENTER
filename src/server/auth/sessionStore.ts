import { randomBytes } from 'node:crypto';
import {
  ROLES,
  isOpaqueSessionId,
  type Role,
  type SessionRecord,
} from './requireAuth.ts';

/** Oito horas. A sessão já nasce com prazo; não há sessão eterna. */
export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class SessionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionStoreError';
  }
}

/**
 * Entrada de `create`. O id da sessão não faz parte do contrato:
 * o servidor gera um id opaco. Não há tenant default.
 */
export interface CreateSessionInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly ttlMs?: number;
  /** Epoch em ms. Útil para testes de expiração. Tem prioridade sobre `ttlMs`. */
  readonly expiresAt?: number;
}

/**
 * Persistência de sessão para o time da camada D1 implementar.
 *
 * - `create` gera o id (`crypto.randomBytes`). Não aceita id do cliente.
 * - `get` devolve o registro mesmo expirado ou revogado. `null` só se o id
 *   não existe. Quem aplica expiração e revogação em todo request é
 *   `requireAuth`.
 * - `revoke` grava `revokedAt` e mantém o registro, para que um replay
 *   continue sendo 401 de sessão revogada.
 * - O `tenantId` gravado é o que o servidor passou a `create`. Esta
 *   interface não lê tenant de header, body ou query.
 *
 * `MemorySessionStore` é a implementação de dev e testes. Não é durável
 * e não é compartilhada entre processos.
 */
export interface SessionStore {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, revokedAt?: number): Promise<SessionRecord | null>;
}

export type MemorySessionStoreOptions = {
  readonly now?: () => number;
  readonly ttlMs?: number;
};

export class MemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: MemorySessionStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  create(input: CreateSessionInput): Promise<SessionRecord> {
    try {
      const userId = requiredText(input.userId, 'userId');
      const tenantId = requiredText(input.tenantId, 'tenantId');
      const role = knownRole(input.role);
      const expiresAt = this.resolveExpiry(input);
      const sessionId = this.newId();
      const record = Object.freeze({
        sessionId,
        userId,
        tenantId,
        role,
        expiresAt,
        revokedAt: null,
      });
      this.records.set(sessionId, record);
      return Promise.resolve(copyRecord(record));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('Falha ao criar sessão.'));
    }
  }

  get(sessionId: string): Promise<SessionRecord | null> {
    const record = this.records.get(sessionId);
    return Promise.resolve(record ? copyRecord(record) : null);
  }

  revoke(sessionId: string, revokedAt = this.now()): Promise<SessionRecord | null> {
    const current = this.records.get(sessionId);
    if (!current) return Promise.resolve(null);
    if (isAlreadyRevoked(current.revokedAt)) return Promise.resolve(copyRecord(current));
    const next = Object.freeze({
      ...current,
      revokedAt,
    });
    this.records.set(sessionId, next);
    return Promise.resolve(copyRecord(next));
  }

  private resolveExpiry(input: CreateSessionInput): number {
    if (input.expiresAt !== undefined) {
      if (!Number.isFinite(input.expiresAt)) {
        throw new SessionStoreError('expiresAt inválido. Sessão não criada.');
      }
      return input.expiresAt;
    }
    if (input.ttlMs !== undefined) {
      if (!Number.isFinite(input.ttlMs)) {
        throw new SessionStoreError('ttlMs inválido. Sessão não criada.');
      }
      return this.now() + input.ttlMs;
    }
    return this.now() + this.ttlMs;
  }

  private newId(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sessionId = randomBytes(32).toString('base64url');
      if (isOpaqueSessionId(sessionId) && !this.records.has(sessionId)) {
        return sessionId;
      }
    }
    throw new SessionStoreError('Falha ao gerar id de sessão.');
  }
}

function requiredText(value: unknown, label: 'userId' | 'tenantId'): string {
  if (typeof value !== 'string') {
    throw new SessionStoreError(`${label} ausente. Sessão não criada.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new SessionStoreError(`${label} ausente. Sessão não criada.`);
  }
  return trimmed;
}

function knownRole(role: unknown): Role {
  if (typeof role !== 'string') {
    throw new SessionStoreError('Papel desconhecido. Sessão não criada.');
  }
  for (const candidate of ROLES) {
    if (role === candidate) return candidate;
  }
  throw new SessionStoreError('Papel desconhecido. Sessão não criada.');
}

function isAlreadyRevoked(revokedAt: number | null | undefined): boolean {
  return revokedAt !== null && revokedAt !== undefined;
}

function copyRecord(record: SessionRecord): SessionRecord {
  return Object.freeze({ ...record });
}
