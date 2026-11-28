/** Somente o repository de missões tem escopo por tenant nesta entrega.
 * Outros domínios permanecem bloqueados até implementação e homologação.
 */
export const TENANT_ISOLATION: string = 'mission-scoped';
export function assertTenantIsolationConfigured(): void {
  if (TENANT_ISOLATION !== 'mission-scoped') {
    throw new Error('Isolamento de missões não configurado.');
  }
}
