import type { Express, RequestHandler } from 'express';
import { requireAuthMiddleware, type AuthMiddlewareDeps } from './middleware.ts';
import { API_ROUTE_MATRIX, isApiPath, isPublicApiRoute, routeKey } from './matrix.ts';

const API_GUARD = Symbol('b360.apiGuard');

export type ListedApiRoute = {
  readonly method: string;
  readonly path: string;
  readonly guarded: boolean;
};

export function createApiGuard(deps: AuthMiddlewareDeps): RequestHandler {
  const authenticate = requireAuthMiddleware(deps);

  function apiGuard(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]): void {
    if (!isApiPath(req.path)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (isPublicApiRoute(req.method, req.path)) {
      next();
      return;
    }
    authenticate(req, res, next);
  }

  Object.defineProperty(apiGuard, API_GUARD, { value: true });
  return apiGuard;
}

export function listApiRoutes(app: Express): ListedApiRoute[] {
  const listed: ListedApiRoute[] = [];
  walk(readStack(app), '', false, listed);
  return listed;
}

/**
 * Falha se alguma rota `/api` estiver registrada antes do guard,
 * ou se a allowlist deixar de ser só GET /api/health e GET /api/ready.
 */
export function assertApiRoutesGuarded(app: Express): void {
  const problems: string[] = [];
  const publics = API_ROUTE_MATRIX.filter((rule) => rule.public).map((rule) => routeKey(rule.method, rule.path));
  const expected = ['GET /api/health', 'GET /api/ready'];
  if (publics.join('\n') !== expected.join('\n')) {
    problems.push(
      `Allowlist pública deve ser só ${expected.join(', ')}. Atual: ${publics.join(', ') || '(vazia)'}.`,
    );
  }
  for (const route of listApiRoutes(app)) {
    if (!route.path.startsWith('/api')) continue;
    if (!route.guarded) {
      problems.push(`Rota /api sem guard: ${route.method} ${route.path}.`);
    }
  }
  if (problems.length > 0) {
    throw new Error(problems.join(' '));
  }
}

/** Falha se o que está montado divergir da matriz (HEAD implícito do GET fica de fora). */
export function assertApiRouteMatrix(app: Express): void {
  const actual = listApiRoutes(app)
    .filter((route) => route.path.startsWith('/api') && route.method !== 'HEAD')
    .map((route) => routeKey(route.method, route.path))
    .sort();
  const expected = API_ROUTE_MATRIX.map((rule) => routeKey(rule.method, rule.path)).sort();
  if (actual.join('\n') !== expected.join('\n')) {
    throw new Error(
      `Matriz de rotas divergente.\nRegistradas:\n${actual.join('\n')}\nEsperadas:\n${expected.join('\n')}`,
    );
  }
}

type Layer = {
  handle?: object;
  rawPath?: unknown;
  route?: {
    path?: unknown;
    methods?: Record<string, boolean | undefined>;
  } | null;
};

function walk(stack: Layer[], prefix: string, guardSeen: boolean, out: ListedApiRoute[]): void {
  let seen = guardSeen;
  for (const layer of stack) {
    if (layer.handle && isApiGuard(layer.handle)) seen = true;
    if (layer.route) {
      const path = joinPaths(prefix, routePath(layer.route.path));
      const methods = layer.route.methods ?? {};
      for (const [method, enabled] of Object.entries(methods)) {
        if (enabled !== true || method === '_all') continue;
        out.push({ method: method.toUpperCase(), path, guarded: seen });
      }
      continue;
    }
    const nested = nestedStack(layer.handle);
    if (nested) {
      const mount = typeof layer.rawPath === 'string' ? layer.rawPath : '';
      walk(nested, joinPaths(prefix, mount), seen, out);
    }
  }
}

function readStack(app: Express): Layer[] {
  const router: unknown = Reflect.get(app, 'router');
  if (router === null || (typeof router !== 'object' && typeof router !== 'function')) {
    throw new Error('Pilha do router Express indisponível.');
  }
  const stack: unknown = Reflect.get(router, 'stack');
  if (!Array.isArray(stack)) {
    throw new Error('Pilha do router Express indisponível.');
  }
  return stack as Layer[];
}

function nestedStack(handle: object | undefined): Layer[] | null {
  if (!handle) return null;
  const stack: unknown = Reflect.get(handle, 'stack');
  return Array.isArray(stack) ? (stack as Layer[]) : null;
}

function isApiGuard(handle: object): boolean {
  return Reflect.get(handle, API_GUARD) === true;
}

function routePath(path: unknown): string {
  if (typeof path === 'string') return path;
  throw new Error('Caminho de rota inesperado.');
}

function joinPaths(prefix: string, path: string): string {
  if (prefix === '' || prefix === '/') {
    return path.startsWith('/') ? path : `/${path}`;
  }
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (path === '' || path === '/') return left === '' ? '/' : left;
  const right = path.startsWith('/') ? path : `/${path}`;
  return `${left}${right}`;
}
