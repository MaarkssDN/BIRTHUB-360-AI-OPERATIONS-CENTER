# Gates G4 e G7 — PENDENTE DE RATIFICAÇÃO

> **PENDENTE DE RATIFICAÇÃO DO MARCELO.** Este texto é o rascunho v2 (revisão Silas 09, 2026-11-27). Não é especificação oficial do repositório, não autoriza merge, release nem deploy, e não transfere parecer de um SHA para outro.

O corpo abaixo reproduz `gates-G4-G7-v2.md` sem alterar os critérios.

---

# Rascunho G4 e G7 — critérios verificáveis (B360-AOC)

**v2 — incorpora revisão Silas 09, 2026-11-27; pendente de ratificação do Marcelo**

- **Gerado em:** 2026-11-27 20:27 America/Sao_Paulo (UTC-3)
- **Base:** `/workspace/aoc-status/gates-G4-G7-rascunho.md` (v1 preservado, não sobrescrito)
- **Natureza:** rascunho revisado, **não** é especificação oficial do pacote nem do repo, e **não** está ratificado pelo Marcelo
- **Repo (somente leitura):** `MaarkssDN/BIRTHUB-360-AI-OPERATIONS-CENTER`, HEAD `c01501c6c0994b0c1beedb7867ab3c6ca4ac79b4`

## 1. Conclusão literal sobre o zip e o repo

**O pacote de referência não define G4 nem G7 de forma completa.** Não há, no zip, checklist de critérios, lista de evidências obrigatórias, responsável, procedimento de GO/NO-GO nem tabela de ondas cobertas para esses dois gates.

O único texto que **nomeia** G4 e G7 está em uma linha cada, mais uma regra transversal:

| Gate | Citação literal | Origem |
| :--- | :--- | :--- |
| G4 | `G4 — auditor independente no SHA exato, sem autoaprovação.` | `/workspace/aiops-zip/aoc/04_MATRIZ_DE_GATES_E_ATIVACAO.txt`, **linha 5** |
| G7 | `G7 — aprovação de release/deploy independente; NO-GO para qualquer gate obrigatório não comprovado.` | `/workspace/aiops-zip/aoc/04_MATRIZ_DE_GATES_E_ATIVACAO.txt`, **linha 8** |
| Transversal (G0–G7) | `Revisão do status após cada alteração material: invalidar evidência afetada.` | `/workspace/aiops-zip/aoc/04_MATRIZ_DE_GATES_E_ATIVACAO.txt`, **linha 9** |

O manifesto do pacote registra esse arquivo como `c756173d494451dc47708c2c01d993c0652b506bfe2c7a2ae22ed7a36ac69095  04_MATRIZ_DE_GATES_E_ATIVACAO.txt` (`aoc/MANIFESTO_SHA256.txt`, linha 25). Nenhuma outra ocorrência de `G4` ou `G7` existe no pacote (busca em todos os `.txt` de `/workspace/aiops-zip`).

**Confirmação no repo (HEAD `c01501c6`):** Silas 09 está correto. Não há documento, workflow, ruleset, check run ou proteção de branch nomeando G4 ou G7. `GOVERNANCE.md` traz princípios aparentados (proibição de autoaprovação; aprovação vinculada ao SHA; autoridade humana para merge/deploy), mas **não** define os gates. Existe tabela SQL `QualityGates` em `migrations/0001_initial_schema.sql`; isso é esquema, não definição operacional de G4/G7.

## 2. Material correlato no zip (não é definição de G4/G7)

Os trechos abaixo **não** usam os identificadores G4 ou G7. Servem só como contexto. Cobertura de ondas a partir deles é **inferida**, não declarada pelo pacote.

### 2.1 Afinidade com G4 (auditor independente no SHA exato)

A onda natural de implementação formal do mecanismo de auditoria é a **15**. O G4, como revisão independente de um SHA, também se aplica a entregas anteriores (incluindo a onda 00). Trechos:

- Objetivo: “Implantar fluxo executor → auditor separado → parecer; reprovação retorna ao coordenador.” — `aoc/ondas/ONDA_15_Central_de_auditoria_independente_vinculada_ao_SHA.txt`, **linha 12**
- Dependências: `03,04,07,10,11` — mesmo arquivo, **linha 9**
- Checklist específico: “Autoaprovação, auditor diferente mas mesmo executor, SHA trocado, evidência ausente, waiver não autorizado, reprovação e reteste, parecer parcial não vira GO global.” — **linha 19**
- Item comum: “Critérios vinculados ao SHA, evidência armazenada e revisão independente solicitada.” — **linha 20**
- Limite: “Auditoria não corrige código no mesmo ciclo nem integra; zero aprovação por resumo de outra IA.” — **linha 27**
- Entregáveis: “Audit Center, pareceres versionados, testes de conflito e trilha de retorno.” — **linha 24**

Constituição operacional (texto idêntico em todas as ondas e nos despachos; exemplo em `ONDA_15`, **linha 6**, e `aoc/00_LEIA_PRIMEIRO.txt`, **linha 10**): “Não transfira aprovação para novo SHA. Auditoria não executa correção nem integra; integração não autoaprova. […] NO-GO até comprovação e autorização.”

Handoff padrão de todas as ondas, inclusive a 15 (**linha 30**): “Entregue a Astra (00) e ao auditor independente designado. Se aprovado no escopo, encaminhar à célula Git, sem autorização implícita de merge.”

### 2.2 Afinidade com G7 (aprovação de release/deploy; NO-GO se gate obrigatório faltar)

A onda natural de aplicação é a **19**. Trechos:

- Dependências: “03,04,11,12,15,16,17,18; todos gates obrigatórios.” — `aoc/ondas/ONDA_19_Homologa_o_final_e_ativa_o_progressiva_Cloudflare.txt`, **linha 9**. O pacote **não** lista quais gates são “obrigatórios”; neste v2, por revisão do Silas 09, G0–G6 são todos obrigatórios para a onda 19, salvo waiver escrito do Marcelo.
- Objetivo: “Ativar por fases com autorização humana e reversibilidade, somente após segurança e provas.” — **linha 12**
- Checklist: “Gates de release, smoke, restauração, revogação, rollback, falha de provedor, máquina offline, prova de não exposição e de custo R$0 adicional; parecer SHA exato.” — **linha 19**
- Entregáveis: “Dossiê de homologação, registro de autorização, runbook de ativação, plano de rollback e matriz GO/NO-GO.” — **linha 24**
- Limite (NO-GO explícito): “Sem deploy público ou merge por inferência. Qualquer P0 aberto mantém NO-GO.” — **linha 27**

Saneamento P0: “Entregue PR apenas se autorizado, revisão independente e gates; NO-GO enquanto qualquer P0 aberto.” — `aoc/02_SANEAMENTO_P0_IMEDIATO.txt`, **linha 6** (trecho final da missão, após a constituição).

A onda 18 pede, como entregável, “Workflows, matriz de gates, relatórios por SHA, evidências reproduzíveis e lista de falhas” (`ONDA_18`, **linha 24**) e proíbe “transportar resultado de SHA anterior” (**linha 27**). Isso alimenta G1/G2/G7, mas **não** define G7.

## 3. Cobertura de ondas — o que se pode e o que não se pode afirmar

| Afirmação | Status |
| :--- | :--- |
| O zip lista, para G4, as ondas cobertas | **Não.** Ausente. |
| O zip lista, para G7, as ondas cobertas | **Não.** Ausente. |
| Hipótese de despacho (v2, pendente de ratificação do Marcelo) | G4 é transversal a **toda entrega que peça revisão independente** (execução já ocorrida na onda 00 sobre o SHA `c01501c6`). A implementação formal do Audit Center permanece na **Onda 15**. G7 é o gate de **release/deploy** da **Onda 19**: G0–G6 são todos obrigatórios no mesmo SHA; P0 abertos vêm da matriz de riscos da onda 00, não de uma lista fixa no gate. |

Essa cobertura **não** é regra do pacote. Só vira regra de despacho após ratificação do Marcelo.

## 4. Critérios verificáveis — G4 (revisão Silas 09)

Vocabulário fechado do veredito, sempre no SHA exato: **APROVADO** / **CONDICIONADO** / **BLOQUEADO**. Não usar PASS, FAIL, GO, NÃO EXECUTADO nem equivalentes.

**CONDICIONADO nunca autoriza merge.** Condições só se cumprem com commit novo; SHA novo exige parecer novo (constituição: “Não transfira aprovação para novo SHA”; matriz, linha 9).

### 4.1 Identidade do parecer e dos SHAs

1. Existe parecer escrito (não resumo oral, não comentário genérico) que cita o **head SHA** e o **base SHA**, ambos com 40 hexas. Mudança da base por rebase ou force push **invalida** o parecer.
2. Em merge com squash ou rebase, o parecer só permanece válido se o **tree hash** do commit mesclado for igual ao tree do head revisado. Se for diferente, nova revisão no SHA novo.
3. `executor ≠ auditor` é verificável por **registro não autodeclarado**: autores dos commits e abridor do PR no GitHub, mais o registro de despacho da Astra. Nunca por campo vindo do corpo de uma requisição. Auditor “diferente” mas, na prática, o mesmo executor é **BLOQUEADO** (checklist da Onda 15, linha 19).
4. O parecer não se apoia só em resumo produzido por outra IA (Onda 15, linha 27).

### 4.2 Evidência reproduzida pelo auditor

5. O auditor **reproduz** a evidência no SHA citado (comandos e saídas). Ler o relatório do executor **não basta**.
6. O parecer lista o escopo (paths, onda, critérios) e as evidências reproduzidas (comandos, exit codes, logs, artefatos) ligadas àquele par base/head.
7. Evidência ausente, evidência só narrativa, ou waiver sem autorização escrita do Marcelo = **BLOQUEADO**.
8. Parecer parcial não vira APROVADO global nem autoriza merge (Onda 15, linha 19; saída obrigatória das ondas: “Não use GO global por conclusão parcial”).

### 4.3 Local do parecer e escrita externa

9. Local canônico: `/workspace/aoc-status/pareceres/<sha>.md`, usando o head SHA de 40 hexas, **mais** a devolução à Astra (00).
10. Review no GitHub é **escrita externa** e só ocorre com OK escrito do Marcelo. Sem esse OK, o parecer não é publicado no repositório.

### 4.4 Invalidação e handoff

11. Qualquer commit posterior, mudança da base (rebase/force push) ou tree hash divergente após squash/rebase invalida o parecer (matriz, linha 9; constituição: “Não transfira aprovação para novo SHA”).
12. Veredito **BLOQUEADO** (e também **CONDICIONADO**, quanto ao merge) devolve à Astra 00. Auditoria não corrige código nem integra no mesmo ciclo (Onda 15, linhas 12 e 27).

### 4.5 Estado observado

G4 **executado** na onda 00 sobre o SHA `c01501c6c0994b0c1beedb7867ab3c6ca4ac79b4`. Veredito: **BLOQUEADO**.

(O v1 registrava o gate como não executado. Este v2 corrige: a revisão Silas 09 da onda 00 no HEAD ocorreu; o resultado é bloqueio, não ausência de parecer.)

## 5. Critérios verificáveis — G7 (revisão Silas 09)

G7 é aprovação de release ou deploy. Vocabulário do dossiê e da matriz GO/NO-GO permanece alinhado ao G4 quando houver parecer de auditoria, mas **autorização de release não é um veredito do Silas**.

### 5.1 Quem aprova

1. Quem aprova release ou deploy é **somente o Marcelo**, por escrito, citando o SHA (40 hexas). Nenhum agente satisfaz G7. O **APROVADO** do Silas 09 é insumo para o Marcelo, **não** autorização de release, merge ou deploy (Onda 19, linha 27: “Sem deploy público ou merge por inferência”; constituição: integração não autoaprova).

### 5.2 Pré-condições obrigatórias (meta-gate)

2. Para a onda 19, **G0–G6 são todos obrigatórios** no mesmo SHA, com evidência viva (não herdada de SHA anterior — Onda 18, linha 27; matriz, linha 9). Waiver de qualquer um desses gates só com OK escrito do Marcelo, registrado na matriz de status.
3. A fonte dos P0 é a **matriz de riscos da onda 00**, versionada. O gate G7 **não** carrega lista fixa de P0. Qualquer P0 aberto nessa matriz mantém NO-GO (Onda 19, linha 27; `02_SANEAMENTO_P0_IMEDIATO.txt`, linha 6).
4. Rollback e restore têm de ter sido **executados em staging**, com log vinculado ao SHA. Plano escrito, runbook ou intenção **não contam**.
5. O custo incremental R$ 0,00 se prova com evidência **datada** dos planos vigentes e da cobrança (não com declaração no README).

### 5.3 Condições novas (decisão do Marcelo, registradas neste v2)

6. Provar no SHA que a **ponte Devin está removida ou desligada por padrão**: o endpoint correspondente e as flags `devinBridgeEnabled` e `devinContractVerified` não podem habilitar a ponte por omissão ou por chamada sem autorização. A ponte saiu do escopo por decisão do Marcelo. Este preflight **não** aciona a ponte e **não** a altera no repo.
7. Antes de qualquer GO, o repositório público não pode expor PII nem IDs reais — inclusive no **histórico** Git — ou deve haver registro de risco aceito por escrito pelo Marcelo. Exemplos já observados no HEAD (valores **não** reproduzidos aqui): e-mail pessoal no seed da migration `0002` e identificador de pasta do Drive em seeds/documentação. Este preflight não altera visibilidade nem reescreve histórico.

### 5.4 Artefatos

8. Dossiê de homologação, registro da autorização **do Marcelo**, runbook de ativação, evidência de rollback/restore **executados** em staging, e matriz GO/NO-GO (Onda 19, linha 24, com o rigor das regras 4 e 5 acima).
9. Staging/homologação identificado (G6). Produção ou publicação só depois do GO escrito do Marcelo no G7.

### 5.5 Estado observado

G7 permanece **NO-GO** no SHA `c01501c6c0994b0c1beedb7867ab3c6ca4ac79b4`. Não há autorização escrita do Marcelo para release; a onda 19 não foi iniciada; P0 constam da matriz de riscos da onda 00 (77 Segurança e 45 Persistência, entre outros a revalidar nessa matriz); rollback/restore em staging não foram executados neste preflight; a ponte Devin ainda aparece no código do HEAD; o repo público ainda precisa da prova de ausência de PII/IDs reais no histórico, ou de aceite formal de risco.

## 6. O que este rascunho não é

- Não é regra ratificada: incorpora a revisão do Silas 09 (2026-11-27), mas **permanece pendente de ratificação do Marcelo**.
- Não formaliza G4/G7 no repositório (somente leitura; o v1 e o v2 vivem em `/workspace/aoc-status/`; nada foi commitado, e review no GitHub exigiria OK escrito do Marcelo).
- Não inventa uma tabela oficial de cobertura de ondas no zip — a cobertura da seção 3 é hipótese de despacho, ainda não ratificada.
- Não autoriza merge, deploy, mudança de visibilidade, reescrita de histórico nem acionamento da ponte Devin.
- **CONDICIONADO** no G4 não autoriza merge; condições só se fecham com commit novo e parecer novo.
- **APROVADO** do Silas no G4 é insumo, não satisfaz G7; nenhum agente aprova release ou deploy.
- Não substitui a matriz de riscos versionada da onda 00 por uma lista fixa de P0 dentro do G7.
- Não reproduz PII, e-mails, identificadores de Drive nem dados reais neste arquivo.
- Não transfere parecer, evidência ou autorização de um SHA para outro.
