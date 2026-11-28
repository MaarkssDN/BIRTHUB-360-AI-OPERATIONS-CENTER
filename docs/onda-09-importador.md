# Onda 09 — desenho do importador Drive/Sheets e stub dry-run

Este documento descreve o importador idempotente de históricos. A implementação deste PR é um stub: lê só fixture sintética local, não escreve em destino real e não declara sincronização.

Não há dado histórico real, credencial, token, ID de planilha nem ID de pasta. Não há SDK do Google, chamada de rede nem endpoint.

## Fluxo

1. O chamador entrega um envelope JSON à porta de fonte. A única implementação aceita `origin: "synthetic"`.
2. A porta recusa envelope ilegível, origem diferente de `synthetic` e qualquer campo além de `origin` e `documents`.
3. O pipeline normaliza cada documento (Unicode NFC e quebras de linha para `\n`), calcula `content_hash` e `idempotency_key`, e separa o que é planejável do que é erro.
4. O modo é sempre `dry-run`. O manifesto e o relatório de paridade são calculados em memória.
5. A porta de destino é lida para a paridade. O dry-run não chama escrita. O fake em memória só muda se o teste chamar `upsert`.
6. Apply, cutover e exclusão na origem ficam fora deste contrato.

```
fixture sintética local
        │
        ▼
porta de fonte (só origin = synthetic)
        │
        ▼
normalização + chave/hash estáveis
        │
        ├── erros (não entram no plano)
        ▼
manifesto dry-run
        │
        ▼
paridade: plano × leitura do destino
        │
        ▼
fake em memória (não é Drive nem Sheets)
```

## Contratos

### Entrada

Envelope:

| campo | regra |
| --- | --- |
| `origin` | literal `synthetic` |
| `documents` | lista de documentos sintéticos |

Documento:

| campo | regra |
| --- | --- |
| `source_id` | `SYN-` seguido de segmentos `A-Z` e `0-9` |
| `revision` | `rev-` seguido de `a-z` e `0-9` |
| `relative_path` | caminho relativo do repo, com pelo menos um `/`. Sem URL, esquema, absoluto ou `..` |
| `media_type` | `text/plain` ou `text/markdown` |
| `body` | texto. Vazio é erro. Acima de 45000 unidades UTF-16, depois da normalização, é erro |

Não existem campos para ID de planilha, ID de pasta, conta, token ou URL. Um campo extra faz a porta recusar o envelope.

### Saída

`runDryRunImport` devolve três partes:

- `manifest`: contagens, itens com chave e hash, erros e `manifest_hash`
- `parity`: comparação do plano com o que a porta de destino já contém
- `planned`: projeção em memória (corpo normalizado). Não é gravação

O manifesto é validado por Zod antes de sair. `mode` só aceita `dry-run`. `origin` só aceita `synthetic`.

### Destino

`HistoryDestinationPort.readAll()` lê registros. `createInMemoryDestination` guarda esses registros num `Map` pelo `idempotency_key`. `upsert` insere chave nova, ignora a mesma chave com o mesmo hash e reporta conflito se o hash mudou, sem substituir o corpo já guardado.

## Idempotência

- `content_hash` é SHA-256 hex do corpo já normalizado (NFC, `\r\n` e `\r` viram `\n`).
- `idempotency_key` é `source_id + "@" + revision`. A mesma revisão aponta sempre para a mesma chave.
- Duas leituras do mesmo envelope produzem o mesmo manifesto, inclusive `manifest_hash`. O hash do manifesto não usa relógio.
- Itens e erros saem ordenados pela chave, para a ordem do arquivo não mudar o hash.
- A mesma chave com o mesmo hash entra uma vez no plano. A mesma chave com hashes diferentes vira `REVISION_CONFLICT` e não é planejada.
- No fake, `upsert` repetido da mesma projeção não duplica linhas.

## Dry-run

O dry-run é o único modo deste contrato. Ele não chama `upsert` e não abre rede. Paridade contra destino vazio lista as chaves planejadas como ausentes e deixa o fake vazio.

`parity.ok` é verdadeiro só quando o manifesto não tem erros e não há ausência, sobra nem divergência de hash. `parity.ok` não autoriza apply.

## Manifesto

| campo | conteúdo |
| --- | --- |
| `schema_version` | `1` |
| `origin` | `synthetic` |
| `mode` | `dry-run` |
| `counts.documents` | documentos recebidos |
| `counts.planned` | chaves planejadas |
| `counts.errors` | erros |
| `items[]` | `source_id`, `revision`, `relative_path`, `idempotency_key`, `content_hash` |
| `errors[]` | `code`, `source_id` ou `null`, `message` |
| `manifest_hash` | SHA-256 do manifesto sem este campo, com chaves JSON ordenadas |

## Paridade

Compara o plano com `readAll()`:

| contagem | significado |
| --- | --- |
| `matched` | mesma chave e mesmo `content_hash` |
| `missing_in_destination` | chave planejada ausente no destino |
| `extra_in_destination` | chave no destino que o plano não tem |
| `hash_mismatches` | mesma chave, hash diferente |

As listas trazem as `idempotency_key` correspondentes, em ordem.

## Estados de erro

| código | quando |
| --- | --- |
| `SOURCE_UNAVAILABLE` | envelope ilegível, `documents` ausente ou campo fora do contrato |
| `SOURCE_NOT_SYNTHETIC` | `origin` diferente de `synthetic` |
| `DOCUMENT_INVALID` | documento fora do schema |
| `PATH_REJECTED` | URL, esquema, caminho absoluto ou `..` |
| `EMPTY_BODY` | corpo vazio depois da normalização |
| `BODY_TOO_LARGE` | corpo normalizado acima de 45000 unidades UTF-16 (margem abaixo de 50000 por célula) |
| `REVISION_CONFLICT` | mesma chave de idempotência com hashes diferentes |

Erro de documento não derruba o lote inteiro: o documento fica de fora do plano e entra em `errors`. Erro de porta zera o plano.

## Gates que dependem do OK do Marcelo

Enquanto estes pontos não tiverem OK escrito do Marcelo, permanecem bloqueados:

- credencial da conta Google, em qualquer forma
- escopos OAuth de Drive ou Sheets, e qualquer consentimento de acesso
- leitura de dado histórico real, ID de planilha ou ID de pasta
- escrita em Sheets ou Drive, apply, cutover e exclusão na origem
- tratar este stub, ou texto colado, como sincronização real

Sheets continua proposta intermediária. Não é fonte final e não é destino deste PR. A porta real, se existir depois, terá de ser outro adaptador. Este stub não ganha um cliente Google por configuração.

## Fora deste PR

Inventário de originais reais, preservação de bytes brutos, mapa de autoria, LockService, abas administrativas e rollback de dados reais. Nenhum desses passos é simulado como concluído.
