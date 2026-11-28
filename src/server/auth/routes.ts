import type { Express, Request, RequestHandler, Response } from 'express';
import type { ActorKind } from './actor.ts';
import { ResourceError, type AuditSubject } from './auditLog.ts';
import { createApiGuard } from './guard.ts';
import { rejectMutationsWhenKilled } from './killSwitch.ts';
import { API_ROUTE_MATRIX, routeKey, type ApiRouteRule } from './matrix.ts';
import { readAuthContext, requireRole } from './middleware.ts';
import { clearSessionCookieHeader } from './sessionCookie.ts';
import type { AppSecurity } from './security.ts';

type PublicHandlers = {
  readonly health: RequestHandler;
  readonly ready: RequestHandler;
};

/**
 * Monta o guard e, em seguida, só as rotas da matriz.
 * Handler ausente ou sobrando derruba a subida.
 */
export function mountApi(app: Express, security: AppSecurity, publicHandlers: PublicHandlers): void {
  const handlers = handlerMap(security, publicHandlers);
  const expected = new Set(API_ROUTE_MATRIX.map((rule) => routeKey(rule.method, rule.path)));
  for (const key of handlers.keys()) {
    if (!expected.has(key)) {
      throw new Error(`Handler fora da matriz: ${key}`);
    }
  }

  app.use(createApiGuard(security));

  for (const rule of API_ROUTE_MATRIX) {
    const key = routeKey(rule.method, rule.path);
    const handler = handlers.get(key);
    if (!handler) throw new Error(`Handler ausente: ${key}`);
    const roleCount: number = rule.roles.length;
    if (rule.public && roleCount > 0) {
      throw new Error(`Rota pública com papel: ${key}`);
    }
    if (!rule.public && roleCount === 0) {
      throw new Error(`Rota protegida sem papel: ${key}`);
    }
    const chain: RequestHandler[] = [];
    if (!rule.public) {
      chain.push(requireRole(...rule.roles));
      if (rule.mutation && !rule.killSwitchExempt) {
        chain.push(rejectMutationsWhenKilled(security.killSwitch));
      }
    }
    chain.push(handler);
    register(app, rule, chain);
  }
}

function register(app: Express, rule: ApiRouteRule, chain: RequestHandler[]): void {
  if (rule.method === 'GET') {
    app.get(rule.path, ...chain);
    return;
  }
  if (rule.method === 'POST') {
    app.post(rule.path, ...chain);
    return;
  }
  app.delete(rule.path, ...chain);
}

function handlerMap(security: AppSecurity, publicHandlers: PublicHandlers): Map<string, RequestHandler> {
  return new Map<string, RequestHandler>([
    ['GET /api/health', publicHandlers.health],
    ['GET /api/ready', publicHandlers.ready],
    ['GET /api/me', asyncRoute((_req, res) => {
      const auth = readAuthContext(res);
      res.json({
        userId: auth.userId,
        tenantId: auth.tenantId,
        role: auth.role,
      });
    })],
    ['DELETE /api/session', asyncRoute(async (_req, res) => {
      const auth = readAuthContext(res);
      await security.sessions.revoke(auth.sessionId, security.now());
      res.setHeader('Set-Cookie', clearSessionCookieHeader());
      res.status(204).end();
    })],
    ['POST /api/audit-subjects', asyncRoute((_req, res) => {
      const auth = readAuthContext(res);
      const subject = security.audits.create(auth);
      res.status(201).json(presentSubject(subject));
    })],
    ['GET /api/audit-subjects/:id', asyncRoute((req, res) => {
      const auth = readAuthContext(res);
      const subject = security.audits.readOwn(readRouteId(req), auth);
      res.json(presentSubject(subject));
    })],
    ['POST /api/audit-subjects/:id/approval', asyncRoute((req, res) => {
      const auth = readAuthContext(res);
      const subject = security.audits.approve(readRouteId(req), auth);
      res.json(presentSubject(subject));
    })],
    ['GET /api/kill-switch', asyncRoute((_req, res) => {
      res.json(security.killSwitch.read());
    })],
    ['POST /api/kill-switch', asyncRoute((req, res) => {
      const auth = readAuthContext(res);
      const enabled = readEnabled(req.body);
      if (enabled === undefined) {
        res.status(400).json({ status: 'error', code: 'invalid_body' });
        return;
      }
      res.json(security.killSwitch.setEnabled(enabled, auth));
    })],
  ]);
}

function readEnabled(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('enabled' in body)) {
    return undefined;
  }
  return typeof body.enabled === 'boolean' ? body.enabled : undefined;
}

function readRouteId(req: Request): string {
  const raw: unknown = req.params.id;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) {
    throw new ResourceError();
  }
  return raw;
}

function presentSubject(subject: AuditSubject): {
  id: string;
  tenantId: string;
  authorUserId: string;
  authorKind: ActorKind;
  approved: boolean;
  auditorUserId: string | null;
  auditorKind: ActorKind | null;
} {
  return {
    id: subject.id,
    tenantId: subject.tenantId,
    authorUserId: subject.authorUserId,
    authorKind: subject.authorKind,
    approved: subject.approved,
    auditorUserId: subject.auditorUserId,
    auditorKind: subject.auditorKind,
  };
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void> | void,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res)).catch((error: unknown) => {
      next(error);
    });
  };
}
