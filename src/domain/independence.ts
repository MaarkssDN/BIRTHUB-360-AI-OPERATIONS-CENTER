export type AuditPair = {
  executorAgentId: string;
  auditorAgentId: string;
};

export type IndependenceVerdict =
  | { ok: true }
  | { ok: false; reason: 'AUTOAPROVACAO' | 'IDENTIDADE_AUSENTE' };

/**
 * Checagem pura. Não há rota que aceite `auditorAgentId` do corpo como autoridade.
 */
export function evaluateAuditorIndependence(pair: AuditPair): IndependenceVerdict {
  const executor = pair.executorAgentId.trim();
  const auditor = pair.auditorAgentId.trim();
  if (executor.length === 0 || auditor.length === 0) {
    return { ok: false, reason: 'IDENTIDADE_AUSENTE' };
  }
  if (executor === auditor) {
    return { ok: false, reason: 'AUTOAPROVACAO' };
  }
  return { ok: true };
}
