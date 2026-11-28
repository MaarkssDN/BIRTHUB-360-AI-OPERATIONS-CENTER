import type { HealthResponse, ReadyResponse } from '../shared/contracts.ts';

export function describeHealth(body: HealthResponse | null, error: string | null): string {
  if (error) {
    return `Indisponível · ${error}`;
  }
  if (!body) {
    return 'Consultando /api/health…';
  }
  return 'Operacional';
}

export function describeReady(
  httpStatus: number,
  body: ReadyResponse | null,
  error: string | null,
): string {
  if (error) {
    return `Indisponível · ${error}`;
  }
  if (!body) {
    return 'Consultando /api/ready…';
  }
  if (httpStatus === 200 && body.status === 'ready') {
    return `Pronto · schema ${body.schemaVersion ?? 'desconhecido'} · seed ${body.seed ?? 'ausente'}`;
  }
  return `Fail-closed · ${body.error ?? 'banco indisponível'}`;
}
