# Contrato de sessão, tenant e RBAC

`requireAuth` é a única função que produz um `AuthContext`. O middleware Express é o único chamador nas rotas. Handlers leem o contexto com `readAuthContext`.

```ts
type Role = 'viewer' | 'operator' | 'admin';

interface AuthContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly sessionId: string;
}
```

O cliente apresenta só um id opaco:

- `Authorization: Bearer <id>`, ou
- cookie `b360_session=<id>`.

A emissão do cookie é `sessionCookieHeader`: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, sem `Domain` e sem `userId`, `tenantId` ou `role`. `Secure` não depende de `NODE_ENV`. Não há JWT.

`userId`, `tenantId` e `role` saem do `SessionStore`. Header, body, query e cookie legível não são fonte de identidade. `tenant_id` / `tenantId` do cliente são ignorados quando coincidem com a sessão. Se qualquer um divergir, a resposta é **403** (`tenant_mismatch`). Não há tenant default.

| Situação | HTTP | Código |
| --- | --- | --- |
| Sem credencial, sessão desconhecida, credenciais divergentes, expirada, revogada ou falha do store | 401 | `unauthenticated` |
| Sessão sem `userId`, sem `tenantId` ou sem papel conhecido | 403 | `incomplete_session` |
| `tenant_id` do cliente diverge do registro | 403 | `tenant_mismatch` |
| Papel insuficiente | 403 | `forbidden` |
| Auditor igual ao autor gravado no servidor | 403 | `self_approval` |
| Kill switch ligado em rota de mutação | 403 | `kill_switch` |

`expiresAt` e `revokedAt` são epoch em milissegundos e são revistos em todo request. `revokedAt` nulo significa sessão ativa.

## SessionStore

A interface em `sessionStore.ts` é o contrato da camada D1, que entra em outro PR:

- `create` gera o id com `crypto.randomBytes`. Não aceita id do cliente. Rejeita usuário, tenant ou papel ausentes.
- `get` devolve o registro mesmo expirado ou revogado. `null` só quando o id não existe.
- `revoke` grava `revokedAt` e mantém o registro.

`MemorySessionStore` é a implementação de dev e testes. Não é durável e não cruza processos. O prazo padrão é 8 horas.

Não há rota pública de login. A allowlist não cresce para emitir sessão. Os testes criam a sessão pelo store.

## Papel e tipo de autor

O tipo de autor sai do papel da sessão, nunca do body:

| Papel | Tipo |
| --- | --- |
| `admin` | `humano` |
| `operator` | `orquestrador` |
| `viewer` | não cria nem aprova |

O auditor de uma aprovação é `AuthContext.userId`. O autor é o gravado no servidor na criação do sujeito. Se forem iguais, **403**.

## Matriz rota × papel

Toda rota sob `/api` passa pelo guard. A allowlist pública é só as duas primeiras linhas. HEAD acompanha o GET público. `POST /api/health` não é público.

| Método | Rota | Quem entra | Mutação | Kill switch |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | público | não | — |
| GET | `/api/ready` | público | não | — |
| GET | `/api/me` | viewer, operator, admin | não | — |
| DELETE | `/api/session` | viewer, operator, admin | sim | isento (encerra a própria sessão) |
| POST | `/api/audit-subjects` | operator, admin | sim | recusa se ligado |
| GET | `/api/audit-subjects/:id` | viewer, operator, admin | não | — |
| POST | `/api/audit-subjects/:id/approval` | admin | sim | recusa se ligado |
| GET | `/api/kill-switch` | admin | não | — |
| POST | `/api/kill-switch` | admin | sim | isento (senão não desliga) |

`GET /api/audit-subjects/:id` só devolve o sujeito do próprio `userId` no `tenantId` da sessão. Outro usuário ou outro tenant recebe o mesmo **404** de recurso ausente. A aprovação não lê esse GET: um admin do mesmo tenant, diferente do autor, registra a decisão. Admin de outro tenant recebe **404**.

O kill switch nasce desligado, em memória do processo. O campo `updatedBy` é o `userId` da sessão. Enquanto `enabled` é verdadeiro, as mutações não isentas respondem **403** (`kill_switch`). Papel insuficiente continua **403** (`forbidden`), mesmo com o freio ligado.

`/api/health` e `/api/ready` não exigem sessão e não devolvem usuário, tenant, sessão nem caminho de arquivo.

## Preflight

`src/server/preflight/flags.ts` nasce `false` ou `PENDENTE`. Ausência, valor inválido ou erro de leitura viram `BLOQUEADO`. O módulo não lê ambiente. Só o literal `LIBERADO`, passado de propósito ao leitor, libera — e nenhuma flag deste módulo nasce assim. Se alguma nascer liberada, `createApp` não sobe.

| Flag | Nascimento | Significado |
| --- | --- | --- |
| `releaseAuthorized` | `false` | release não autorizado |
| `durableSessionStore` | `PENDENTE` | D1 ainda não entrou |
| `multiTenantDecision` | `PENDENTE` | isolamento completo de tenant depende do dono |
| `publicBind` | `false` | bind público não é decisão deste módulo |

O bind em loopback continua no `listen` e no HMR. O preflight não afrouxa esse bind.

## Fora deste PR

- Login, senha e emissão pública de sessão.
- Persistência D1 de sessão, do kill switch e dos sujeitos de auditoria.
- Provisionamento de tenant. Esta camada só grava e confere o `tenantId` que o servidor passou a `create`.
- Validação do header `Host`. Depende de aceite do dono e não foi implementada.
