import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthError, isAuthError, requireAuth, type AuthContext, type Role } from './requireAuth.ts';
import type { SessionStore } from './sessionStore.ts';

const contexts = new WeakMap<Response, AuthContext>();

export type AuthMiddlewareDeps = {
  readonly sessions: SessionStore;
  readonly now: () => number;
};

function storeAuthContext(res: Response, auth: AuthContext): void {
  contexts.set(res, auth);
}

/** Lê o contexto gravado pelo middleware. Fora disso, 401. */
export function readAuthContext(res: Response): AuthContext {
  const auth = contexts.get(res);
  if (!auth) {
    throw new AuthError(401, 'unauthenticated', 'Sessão ausente ou inválida.');
  }
  return auth;
}

/**
 * Middleware Express. Única porta de `AuthContext` nas rotas:
 * chama `requireAuth` e congela o resultado fora do alcance do body.
 * Falha do store vira 401, sem vazar a causa.
 */
export function requireAuthMiddleware(deps: AuthMiddlewareDeps): RequestHandler {
  return (req, res, next) => {
    void authenticate(req, res, next);
  };

  async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = await requireAuth(req, {
        now: deps.now,
        getSession: (sessionId) => deps.sessions.get(sessionId),
      });
      storeAuthContext(res, auth);
      next();
    } catch (error) {
      if (isAuthError(error)) {
        next(error);
        return;
      }
      next(new AuthError(401, 'unauthenticated', 'Sessão ausente ou inválida.'));
    }
  }
}

export function requireRole(...allowed: readonly Role[]): RequestHandler {
  const permitted = new Set<Role>(allowed);
  return (_req, res, next) => {
    try {
      const auth = readAuthContext(res);
      if (!permitted.has(auth.role)) {
        next(new AuthError(403, 'forbidden', 'Papel insuficiente.'));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
