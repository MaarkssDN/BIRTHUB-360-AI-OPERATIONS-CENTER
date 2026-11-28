/**
 * Flags de preflight. Nascem `false` ou `PENDENTE`.
 * Ausência, valor inválido ou erro de leitura → BLOQUEADO.
 * Só o literal `LIBERADO`, passado de propósito a `resolvePreflight`, libera.
 * O estado deste módulo nunca usa esse literal. Não lê ambiente.
 */

export const PREFLIGHT_FLAG_NAMES = [
  'releaseAuthorized',
  'durableSessionStore',
  'multiTenantDecision',
  'publicBind',
] as const;

export type PreflightFlagName = (typeof PREFLIGHT_FLAG_NAMES)[number];

export type PreflightBirth = false | 'PENDENTE';

export type PreflightDecision = 'BLOQUEADO' | 'PENDENTE' | 'LIBERADO';

export const PREFLIGHT_FLAGS: { readonly [K in PreflightFlagName]: PreflightBirth } = Object.freeze({
  releaseAuthorized: false,
  durableSessionStore: 'PENDENTE',
  multiTenantDecision: 'PENDENTE',
  publicBind: false,
});

export function resolvePreflight(
  name: string,
  read?: (flag: PreflightFlagName) => unknown,
): PreflightDecision {
  if (!isFlagName(name)) return 'BLOQUEADO';
  try {
    const value = read ? read(name) : PREFLIGHT_FLAGS[name];
    if (value === 'PENDENTE') return 'PENDENTE';
    if (value === 'LIBERADO') return 'LIBERADO';
    return 'BLOQUEADO';
  } catch {
    return 'BLOQUEADO';
  }
}

export function preflightAllows(
  name: string,
  read?: (flag: PreflightFlagName) => unknown,
): boolean {
  return resolvePreflight(name, read) === 'LIBERADO';
}

/** Recusa subir o processo se alguma flag nascer liberada. */
export function assertPreflightBirthClosed(): void {
  for (const name of PREFLIGHT_FLAG_NAMES) {
    if (preflightAllows(name)) {
      throw new Error(`Preflight ${name} nasceu liberado.`);
    }
  }
}

function isFlagName(name: string): name is PreflightFlagName {
  return (PREFLIGHT_FLAG_NAMES as readonly string[]).includes(name);
}
