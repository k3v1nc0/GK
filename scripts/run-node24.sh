#!/bin/sh
set -eu

is_node24() {
  [ -x "$1" ] || return 1
  version="$("$1" -v 2>/dev/null || true)"
  case "$version" in
    v24.*) return 0 ;;
  esac
  return 1
}

find_node24() {
  if is_node24 /usr/bin/node; then
    printf '%s\n' /usr/bin/node
    return 0
  fi
  path_node="$(command -v node 2>/dev/null || true)"
  if [ -n "$path_node" ] && is_node24 "$path_node"; then
    printf '%s\n' "$path_node"
    return 0
  fi
  for root in "${HOME:-/root}/.npm/_npx" /tmp/.npm/_npx; do
    [ -d "$root" ] || continue
    for candidate in "$root"/*/node_modules/node/bin/node; do
      is_node24 "$candidate" || continue
      printf '%s\n' "$candidate"
      return 0
    done
  done
  return 1
}

NODE24="$(find_node24 || true)"
if [ -z "$NODE24" ]; then
  echo "Node 24 binary not found at /usr/bin/node, in PATH, or in the npm _npx fallback cache." >&2
  exit 1
fi

exec "$NODE24" "$@"
