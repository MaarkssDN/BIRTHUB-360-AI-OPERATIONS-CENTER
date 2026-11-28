# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferido do despacho e de `AGENTS.md`, sem entrevista ao vivo: o orquestrador humano e os squads do B360-AOC, em uma central de operações, separando o que é demonstração, parcial, validado ou bloqueado. Silas (AG-009) audita e não executa o item.

## Product Purpose

Inferido: o repositório público é o scaffold do Birthub 360 — AI Operations Center. Esta superfície entrega o sistema de design (tokens, tema, componentes base e um guia) para os times seguintes não venderem mock como função. Sucesso aqui é uma base honesta, acessível nos dois temas, sem afirmar operação sem evidência.

## Positioning

Inferido: o estado visível nasce de evidência, e o selo padrão é demonstração. Um painel que apenas renderiza não pode se dizer operacional.

## Operating Context

Inferido: navegador, em português, com dados sintéticos. De dia e à noite (tema claro e escuro). A sonda `/api/health` e `/api/ready` já existe e continua sendo a única leitura de processo desta superfície. Sem ponte local.

## Capabilities and Constraints

Confirmado pelo despacho e pelo código em `0a5ac66ee2cef451ee3293a1792e9a4ebe845f38`:

- Stack já existente: TypeScript, Vite, Express, React. ESLint flat e `tsc` strict no CI.
- WCAG 2.2 AA nos dois temas. Foco visível, teclado, `prefers-reduced-motion`, `prefers-color-scheme`.
- Selo `demo` é o padrão. Variantes: demo, parcial, validado, bloqueado.
- Só dados sintéticos. Sem logo, marca ou trade dress de terceiros.
- Não alterar rotas `/api`, auth, persistência de banco, workflows de CI nem ponte Devin.
- Custo R$ 0. Sem serviços pagos.
- Fora deste corte: mapa de módulos, HonestyChrome, catálogo, RACI, sidebar, personagens e microinterações de tela.

## Brand Commitments

Nome: B360-AOC / BIRTHUB 360 — AI Operations Center. Voz: português direto, sem afirmar o que não foi comprovado.

Restrições visuais fixadas pelo despacho: personalidade própria; tokens em OKLCH com neutros tingidos; sem o visual genérico de IA (gradientes roxos, cards dentro de cards, glassmorphism gratuito). A paleta slate/azul do inventário antigo tinha lacunas de contraste registradas e não é a paleta deste sistema.

## Evidence on Hand

- Sonda de saúde e prontidão no scaffold (`src/ui/status.ts`), com testes.
- Fixture sintética `test/fixtures/b360-aoc-db.synthetic.json`.
- Numeração oficial de agentes em `AGENTS.md`.
- Não há parecer do Silas, nem evidência para marcar qualquer módulo como validado. O guia mostra exemplares sintéticos dos quatro selos.

## Product Principles

- Evidência antes do status.
- Demonstração é o padrão.
- Os dois temas são superfícies de trabalho, não um modo decorativo.
- O repositório público não carrega dado real.
- O sistema de design para aqui; navegação, personagens e telas ficam para os cortes seguintes.

## Accessibility & Inclusion

WCAG 2.2 AA, exigido pelo despacho: contraste de texto ≥ 4,5:1, contraste de interface ≥ 3:1, foco visível, teclado e redução de movimento.
