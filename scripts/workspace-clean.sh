#!/usr/bin/env bash
set -euo pipefail

dirty="$(git status --porcelain)"
ignored="$(git status --porcelain --ignored --untracked-files=all | grep -E '^!! ((.*/)?data(/.*)?|.*\.db)$' || true)"

if [ -n "$dirty" ] || [ -n "$ignored" ]; then
  printf '%s\n' "$dirty" "$ignored"
  echo "árvore suja após os testes (inclui data/ e *.db ignorados)."
  exit 1
fi
