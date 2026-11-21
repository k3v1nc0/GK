#!/bin/bash
set -Eeuo pipefail

EDITOR_SERVICE="gk-real-node-editor.service"
TARGET_USER="${TARGET_USER:-${SUDO_USER:-$(id -un)}}"
CLEAN_CODE_SERVER="${CLEAN_CODE_SERVER:-1}"
RESTART_CODE_SERVER="${RESTART_CODE_SERVER:-0}"
DROP_OS_CACHE="${DROP_OS_CACHE:-0}"
RESET_SWAP="${RESET_SWAP:-0}"

# Werk altijd vanuit het project, ook wanneer het script elders wordt aangeroepen.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

# Controleer dit voordat de editor wordt gestopt of processen worden opgeruimd.
available_kb=$(df -Pk . | awk 'END { print $4 }')
if [ "$available_kb" -lt 1048576 ]; then
  echo "Fout: minder dan 1 GiB vrije schijfruimte. Reset afgebroken vóór het stoppen van de editor." >&2
  echo "Maak eerst schijfruimte vrij; npm kan anders mislukken met ENOSPC." >&2
  df -h . >&2
  exit 1
fi

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

systemd_unit_exists() {
  local unit="$1"
  run_root systemctl cat "$unit" >/dev/null 2>&1
}

start_unit_if_exists() {
  local unit="$1"

  if systemd_unit_exists "$unit"; then
    echo "- ${unit} starten/controleren"
    run_root systemctl start "$unit" >/dev/null 2>&1 || true
  fi
}

restart_unit_if_exists() {
  local unit="$1"

  if systemd_unit_exists "$unit"; then
    echo "- ${unit} herstarten"
    run_root systemctl restart "$unit" >/dev/null 2>&1 || true
  fi
}

show_memory() {
  echo ""
  echo "--- RAM status ---"
  free -h || true
  echo ""
  echo "--- Grootste RAM processen ---"
  ps -eo pid,user,comm,rss,args --sort=-rss | head -n 15 || true
  echo ""
}

kill_pattern() {
  local label="$1"
  local pattern="$2"

  echo "- ${label} opruimen"

  if pgrep -u "$TARGET_USER" -f "$pattern" >/dev/null 2>&1; then
    pkill -TERM -u "$TARGET_USER" -f "$pattern" >/dev/null 2>&1 || true
    sleep 2

    if pgrep -u "$TARGET_USER" -f "$pattern" >/dev/null 2>&1; then
      pkill -KILL -u "$TARGET_USER" -f "$pattern" >/dev/null 2>&1 || true
    fi

    echo "  klaar"
  else
    echo "  niets gevonden"
  fi
}

cleanup_tmp_profiles() {
  echo "- Tijdelijke Chrome/Puppeteer/Playwright profielen opruimen"

  find /tmp -maxdepth 1 -user "$TARGET_USER" \
    \( -name 'puppeteer-*' \
    -o -name 'puppeteer_dev_chrome_profile-*' \
    -o -name 'playwright-*' \
    -o -name 'chrome-*' \
    -o -name '.com.google.Chrome.*' \
    -o -name '.org.chromium.Chromium.*' \) \
    -exec rm -rf {} + 2>/dev/null || true

  echo "  klaar"
}

cleanup_code_server_safe() {
  echo "- code-server RAM cleanup zonder code-server zelf te stoppen"

  # Deze processen mogen weg; code-server start ze vanzelf opnieuw wanneer nodig.
  kill_pattern "TypeScript/JS language servers" 'typescript-language-server|tsserver|tsserver.js'
  kill_pattern "ESLint/Prettier servers" 'eslint.*server|prettier.*server'
  kill_pattern "VS Code extension hosts" 'vscode.*extensionHost|extensionHost.*vscode|bootstrap-fork.*extensionHost'
  kill_pattern "VS Code file watchers" 'vscode.*watcherService|watcherService.*vscode|rg.*vscode'

  echo "  code-server hoofdproces blijft aan"
}

ensure_services_running() {
  echo "=== 5. Services Controleren/Starten ==="

  start_unit_if_exists "$EDITOR_SERVICE"

  if [ "$RESTART_CODE_SERVER" = "1" ]; then
    echo "- code-server bewust herstarten aangezet"
    restart_unit_if_exists "code-server.service"
    restart_unit_if_exists "code-server@${TARGET_USER}.service"
    restart_unit_if_exists "code-server@${USER}.service"
  else
    echo "- code-server aan laten en alleen starten als service bestaat"
    start_unit_if_exists "code-server.service"
    start_unit_if_exists "code-server@${TARGET_USER}.service"
    start_unit_if_exists "code-server@${USER}.service"
  fi
}

cleanup_ram_hogs() {
  echo "=== 2. Server RAM Opruimen ==="
  echo "Target user: ${TARGET_USER}"
  echo ""

  # AI/agent processen die vaak blijven hangen.
  kill_pattern "Codex" '(^|/|[[:space:]])codex([[:space:]]|$|/)'
  kill_pattern "Claude" '(^|/|[[:space:]])claude([[:space:]]|$|/)|claude-code|anthropic'

  # Headless browsers van Puppeteer/Playwright.
  kill_pattern "Puppeteer/Playwright" 'puppeteer|playwright'
  kill_pattern "Headless Chrome/Chromium" '(chrome|chromium|google-chrome|chrome_crashpad_handler).*(--headless|puppeteer|playwright|remote-debugging-port)'

  if [ "$CLEAN_CODE_SERVER" = "1" ]; then
    cleanup_code_server_safe
  else
    echo "- code-server cleanup overslaan"
  fi

  cleanup_tmp_profiles

  if [ "$DROP_OS_CACHE" = "1" ]; then
    echo "- Linux filesystem cache legen"
    sync || true
    if run_root sh -c 'echo 3 > /proc/sys/vm/drop_caches' 2>/dev/null; then
      echo "  klaar"
    else
      echo "  overgeslagen: de host staat het legen van de filesystem cache niet toe"
    fi
  else
    echo "- Linux filesystem cache behouden (DROP_OS_CACHE=1 om te legen)"
  fi

  if [ "$RESET_SWAP" = "1" ]; then
    echo "- Swap resetten"
    run_root swapoff -a || true
    run_root swapon -a || true
    echo "  klaar"
  else
    echo "- Swap reset overslaan"
    echo "  Zet RESET_SWAP=1 als je swap ook bewust wilt legen."
  fi
}

echo "=== 1. Editor Service Stoppen ==="
# Ook als systemd zelf vastloopt mag deze stap niet onbeperkt blijven wachten.
# Ga bij een fout niet door met opruimen/installeren: de editor kan nog draaien.
if run_root timeout --kill-after=5s 30s systemctl stop "$EDITOR_SERVICE"; then
  echo "- Editor service gestopt"
else
  stop_status=$?
  if [ "$stop_status" -eq 124 ] || [ "$stop_status" -eq 137 ]; then
    echo "Fout: systemd heeft het stoppen niet binnen 30 seconden bevestigd." >&2
    echo "Reset afgebroken; controleer systemd/de server voordat je opnieuw probeert." >&2
  else
    echo "Fout: editor service stoppen mislukt (exitcode ${stop_status}). Reset afgebroken." >&2
  fi
  exit "$stop_status"
fi

show_memory
cleanup_ram_hogs
show_memory

echo "=== 3. NPM Dependencies Bijwerken ==="
# Behoud node_modules en package-lock.json: npm herstelt ontbrekende packages
# zonder bij iedere reset alles te verwijderen en versies opnieuw te bepalen.

# Optioneel: Node 24 inladen
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use 24 || echo "Node 24 niet gevonden via nvm; ga door met huidige Node versie."
fi

if ! npm install --no-audit --no-fund; then
  echo "Fout: npm install mislukt. De editor blijft gestopt omdat dependencies mogelijk incompleet zijn." >&2
  echo "Los de npm-fout op en voer daarna scripts/reset.sh opnieuw uit." >&2
  exit 1
fi

echo "=== 4. Editor Service Starten ==="
run_root systemctl start "$EDITOR_SERVICE"

ensure_services_running
show_memory

echo "Klaar! De editor draait weer netjes op de achtergrond."
