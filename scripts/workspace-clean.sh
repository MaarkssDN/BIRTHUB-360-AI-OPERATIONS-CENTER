#!/usr/bin/env bash
set -euo pipefail

dirty="$(git status --porcelain)"
ignored="$(
  git status --porcelain --ignored --untracked-files=all | awk '
    $1 == "!!" {
      path = substr($0, 4)
      if (path == "data" || index(path, "data/") == 1) {
        print
      } else if (path ~ /\.db$/ && index(path, "node_modules/") != 1) {
        print
      }
    }
  '
)"

if [ -n "$dirty" ] || [ -n "$ignored" ]; then
  printf '%s\n' "$dirty" "$ignored"
  echo "árvore suja após os testes (inclui data/ e *.db ignorados)."
  exit 1
fi
