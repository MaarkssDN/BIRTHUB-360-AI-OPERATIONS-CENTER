/**
 * Contrato de sessão e tenant.
 *
 * `requireAuth` é a única função que produz um `AuthContext`.
 * O middleware Express chama esta função e guarda o resultado.
 * Handlers não leem `userId`, `tenantId` ou `role` de header, body, query
 * ou cookie. Não há tenant default.
 */

export const ROLES = ['viewer', 'operator', 'admin'] as const;

export type Role = (typeof ROLES)[number];
export type ActorKind = 'humano' | 'orquestrador' | 'runner';

export function verifiedActorKind(value: unknown): ActorKind | undefined {
  return value === 'humano' || value === 'orquestrador' || value === 'runner' ? value : undefined;
}

export interface AuthContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly actorKind?: ActorKind;
  readonly sessionId: string;
}

/**
 * Registro de sessão guardado no servidor.
 * `expiresAt` e `revokedAt` são epoch em milissegundos.
 * `role` é string para que um papel desconhecido falhe fechado.
 */
export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly role: string;
  readonly actorKind?: string;
  readonly expiresAt: number;
  readonly revokedAt?: number | null;
}

export interface AuthEnv {
  /** Relógio injetável. Padrão: `Date.now`. */
  readonly now?: () => number;
  /** Única fonte de identidade. Devolve o registro do servidor ou null. */
  readonly getSession: (
    sessionId: string,
  ) => Promise<SessionRecord | null | undefined> | SessionRecord | null | undefined;
}

/** Pedido mínimo. Compatível com `express.Request`. */
export interface RequireAuthRequest {
  readonly headers?: object | null;
  readonly query?: object | null;
  readonly body?: unknown;
}

export type AuthFailureCode =
  | 'unauthenticated'
  | 'tenant_mismatch'
  | 'incomplete_session'
  | 'forbidden'
  | 'self_approval'
  | 'kill_switch';

export class AuthError extends Error {
  readonly status: 401 | 403;
  readonly code: AuthFailureCode;

  constructor(status: 401 | 403, code: AuthFailureCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/** Cookie que carrega só o id opaco da sessão. */
export const SESSION_COOKIE_NAME = 'b360_session';

const OPAQUE_SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/;

const TENANT_HEADER_NAMES = ['x-tenant-id', 'x-tenant_id', 'tenant-id', 'tenant_id'];

export function isOpaqueSessionId(value: string): boolean {
  return OPAQUE_SESSION_ID.test(value);
}

/**
 * Resolve a sessão e devolve o contexto autenticado.
 *
 * @throws {AuthError} 401 sem credencial, sessão desconhecida, credenciais
 * divergentes, expirada, revogada ou cookie ilegível.
 * @throws {AuthError} 403 quando o tenant enviado pelo cliente diverge do
 * registro, ou quando faltam usuário, tenant ou um papel conhecido.
 */
export async function requireAuth(
  request: RequireAuthRequest,
  env: AuthEnv,
): Promise<AuthContext> {
  const now = env.now ? env.now() : Date.now();
  const headers = asRecord(request.headers);
  const sessionId = resolveOpaqueSessionId(headers);
  const record = await env.getSession(sessionId);

  if (!record || record.sessionId !== sessionId) {
    throw new AuthError(401, 'unauthenticated', 'Sessão ausente ou inválida.');
  }

  if (isRevoked(record.revokedAt)) {
    throw new AuthError(401, 'unauthenticated', 'Sessão revogada.');
  }

  if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now) {
    throw new AuthError(401, 'unauthenticated', 'Sessão expirada.');
  }

  const userId = requiredIdentity(record.userId);
  const tenantId = requiredIdentity(record.tenantId);
  const role = knownRole(record.role);

  if (!userId || !tenantId || !role) {
    throw new AuthError(
      403,
      'incomplete_session',
      'Sessão sem tenant, usuário ou papel. Acesso negado.',
    );
  }

  const clientTenants = collectClientTenants(request);
  if (clientTenants.some((claim) => claim.kind === 'unreadable' || claim.value !== tenantId)) {
    throw new AuthError(403, 'tenant_mismatch', 'tenant_id do cliente diverge da sessão.');
  }

  const actorKind = verifiedActorKind(record.actorKind);
  return Object.freeze({
    ...(actorKind === undefined ? {} : { actorKind }),
    userId,
    tenantId,
    role,
    sessionId: record.sessionId,
  });
}

type ClientTenantClaim =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'unreadable' };

function requiredIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function knownRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null;
  for (const role of ROLES) {
    if (value === role) return role;
  }
  return null;
}

function isRevoked(revokedAt: number | null | undefined): boolean {
  return revokedAt !== null && revokedAt !== undefined;
}

function resolveOpaqueSessionId(headers: { readonly [key: string]: unknown }): string {
  const bearer = parseBearer(headerValue(headers, 'authorization'));
  const cookies = parseCookieHeader(headerValue(headers, 'cookie'));
  const cookie = cookies[SESSION_COOKIE_NAME] ?? null;

  if (bearer && cookie && bearer !== cookie) {
    throw new AuthError(401, 'unauthenticated', 'Credenciais de sessão divergentes.');
  }

  const candidate = bearer ?? cookie;
  if (!candidate || !isOpaqueSessionId(candidate)) {
    throw new AuthError(401, 'unauthenticated', 'Sessão ausente ou inválida.');
  }

  return candidate;
}

function parseBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  return match ? match[1] : null;
}

function headerValue(
  headers: { readonly [key: string]: unknown },
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      const first = raw.find((item) => typeof item === 'string');
      return typeof first === 'string' ? first : undefined;
    }
  }
  return undefined;
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      throw new AuthError(401, 'unauthenticated', 'Cookie de sessão ilegível.');
    }
  }
  return cookies;
}

function collectClientTenants(request: RequireAuthRequest): ClientTenantClaim[] {
  const claims: ClientTenantClaim[] = [];
  const push = (raw: unknown): void => {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length > 0) claims.push({ kind: 'value', value: trimmed });
      return;
    }
    if (Array.isArray(raw)) {
      for (const item of raw) push(item);
      return;
    }
    if (raw !== undefined && raw !== null) {
      claims.push({ kind: 'unreadable' });
    }
  };

  const headers = asRecord(request.headers);
  for (const name of TENANT_HEADER_NAMES) push(headerValue(headers, name));

  const query = asRecord(request.query);
  push(query.tenant_id);
  push(query.tenantId);

  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    const body = asRecord(request.body);
    push(body.tenant_id);
    push(body.tenantId);
  }

  const cookies = parseCookieHeader(headerValue(headers, 'cookie'));
  push(cookies.tenant_id);
  push(cookies.tenantId);

  return claims;
}

function asRecord(value: object | null | undefined): { readonly [key: string]: unknown } {
  if (value === null || value === undefined || Array.isArray(value)) return {};
  const record: { [key: string]: unknown } = {};
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry as unknown;
  }
  return record;
}
