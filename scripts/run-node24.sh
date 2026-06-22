#!/bin/sh
set -eu

find_node24() {
  for root in "${HOME:-/root}/.npm/_npx" /tmp/.npm/_npx; do
    [ -d "$root" ] || continue
    for candidate in "$root"/*/node_modules/node/bin/node; do
      [ -x "$candidate" ] || continue
      version="$("$candidate" -v 2>/dev/null || true)"
      case "$version" in
        v24.*) printf '%s\n' "$candidate"; return 0 ;;
      esac
    done
  done
  return 1
}

NODE24="$(find_node24 || true)"
if [ -z "$NODE24" ]; then
  echo "Node 24 binary not found in npm cache. Run npm install with network access once, or install Node 24 locally." >&2
  exit 1
fi

exec "$NODE24" "$@"
