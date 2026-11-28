/**
 * Ponto de extensão do multi-tenant.
 *
 * Nenhuma tabela tem `tenant_id`. Enquanto `TENANT_ISOLATION` for `pending`,
 * o repositório não filtra por inquilino e não aceita tenant fora do
 * `AuthContext`. Quando a decisão sair, uma migration adiciona a coluna e
 * este módulo passa a exigir o filtro usando somente `auth.tenantId`.
 */
export const TENANT_ISOLATION = 'pending' as const;

export function assertTenantIsolationConfigured(): void {
  if (TENANT_ISOLATION !== 'pending') {
    throw new Error(
      'tenant_id foi marcado como ativo, mas o filtro ainda não está nesta camada. A chamada foi recusada.',
    );
  }
}
