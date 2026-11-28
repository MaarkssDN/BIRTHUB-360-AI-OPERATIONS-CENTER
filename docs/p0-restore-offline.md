# P0 — restore offline

Candidato: bloqueia bypass overwriteInUse e mantém locks exclusivos durante backup/restore nos caminhos cooperantes. Recusa sidecars ativos. Requer parar todos os escritores externos, inventariar processos e preservar backup; locks de aplicação não certificam processos não cooperantes. Sem execução em banco real, sem migration/deploy. CI e revisão independente obrigatórios.
