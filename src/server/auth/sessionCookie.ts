import { SESSION_COOKIE_NAME, isOpaqueSessionId } from './requireAuth.ts';

const COOKIE_FLAGS = 'HttpOnly; Secure; SameSite=Strict; Path=/';

/**
 * Emissão do cookie de sessão. Só o id opaco entra no valor.
 * Sem `Domain` (host-only). `Secure` vale também em dev: o bind é HTTP
 * em loopback, então o cliente de navegador usa Bearer; o cookie não
 * perde `Secure` por causa do ambiente.
 */
export function sessionCookieHeader(sessionId: string, maxAgeSeconds: number): string {
  if (!isOpaqueSessionId(sessionId)) {
    throw new Error('Id de sessão recusado.');
  }
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new Error('Max-Age inválido.');
  }
  return `${SESSION_COOKIE_NAME}=${sessionId}; ${COOKIE_FLAGS}; Max-Age=${String(maxAgeSeconds)}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; ${COOKIE_FLAGS}; Max-Age=0`;
}
