import type { Role } from './requireAuth.ts';

export type ApiRouteRule = {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly public: boolean;
  readonly roles: readonly Role[];
  readonly mutation: boolean;
  /** Mutação que continua disponível com o kill switch ligado. */
  readonly killSwitchExempt: boolean;
};

/**
 * Única allowlist e única matriz. Rota nova entra aqui.
 * `assertApiRoutesGuarded` recusa allowlist diferente de health e ready.
 */
export const API_ROUTE_MATRIX = [
  {
    method: 'GET',
    path: '/api/health',
    public: true,
    roles: [],
    mutation: false,
    killSwitchExempt: false,
  },
  {
    method: 'GET',
    path: '/api/ready',
    public: true,
    roles: [],
    mutation: false,
    killSwitchExempt: false,
  },
  {
    method: 'GET',
    path: '/api/me',
    public: false,
    roles: ['viewer', 'operator', 'admin'],
    mutation: false,
    killSwitchExempt: false,
  },
  {
    method: 'DELETE',
    path: '/api/session',
    public: false,
    roles: ['viewer', 'operator', 'admin'],
    mutation: true,
    killSwitchExempt: true,
  },
  {
    method: 'POST',
    path: '/api/audit-subjects',
    public: false,
    roles: ['operator', 'admin'],
    mutation: true,
    killSwitchExempt: false,
  },
  {
    method: 'GET',
    path: '/api/audit-subjects/:id',
    public: false,
    roles: ['viewer', 'operator', 'admin'],
    mutation: false,
    killSwitchExempt: false,
  },
  {
    method: 'POST',
    path: '/api/audit-subjects/:id/approval',
    public: false,
    roles: ['admin'],
    mutation: true,
    killSwitchExempt: false,
  },
  {
    method: 'GET',
    path: '/api/kill-switch',
    public: false,
    roles: ['admin'],
    mutation: false,
    killSwitchExempt: false,
  },
  {
    method: 'POST',
    path: '/api/kill-switch',
    public: false,
    roles: ['admin'],
    mutation: true,
    killSwitchExempt: true,
  },
] as const satisfies readonly ApiRouteRule[];

export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** Caminho canônico da política: minúsculas e sem uma barra final. */
export function canonicalApiPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.length > 1 && lower.endsWith('/')) return lower.slice(0, -1);
  return lower;
}

export function isApiPath(path: string): boolean {
  const canonical = canonicalApiPath(path);
  return canonical === '/api' || canonical.startsWith('/api/');
}

/**
 * HEAD segue o GET público correspondente.
 * POST /api/health não é público.
 */
export function isPublicApiRoute(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const normalizedPath = canonicalApiPath(path);
  return API_ROUTE_MATRIX.some(
    (rule) => rule.public && rule.method === normalizedMethod && rule.path === normalizedPath,
  );
}
