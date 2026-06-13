# Server Verification Runbook

Dit runbook is de vaste checklist voor Codex/Claude server-side verificatie na Git-basis werk op `main`.

Doel: niet opnieuw zoeken naar serverpaden, secretlocaties, service layout, auth/login flow, smoke-routes, editor panel checks of rapportformat.

## Harde regels

- Print nooit secret values.
- Plak nooit `cat` output met secrets in rapporten.
- Schrijf nooit secrets, tokens, passwords, hashes of private keys naar Git.
- Gebruik secretbestanden alleen via `source` in een subshell of smoke-script.
- Rapporteer alleen secret-bestandspaden en variabelenamen.
- Voer geen runtime/game featurewerk uit tijdens verificatie.
- Voeg geen assets of gamecontent toe.
- Herstart services pas na succesvolle build/typecheck/test/lint.
- Browser-smoke screenshots/traces blijven buiten Git en mogen geen secrets tonen.

## Server basis

| Onderdeel | Waarde |
|---|---|
| Repo/runtime pad | `/var/www/gk` |
| Node 22 bin path | `/opt/gk/node-v22/bin` |
| Standaard PATH export | `export PATH=/opt/gk/node-v22/bin:$PATH` |
| API | `127.0.0.1:3001` |
| Editor web | `127.0.0.1:3002` |
| Game/runtime shell | `127.0.0.1:3003` default via `GK_GAME_PORT` |
| Game-web systemd template | `ops/systemd/gk-game-web.service` |
| Game-web live unit | `/etc/systemd/system/gk-game-web.service` |
| Actieve frontend/front door | Apache vhost/reverse proxy volgens serverconfig |
| Game/front door | Publieke game-site via bestaande Apache front door of Fase 12.1 game shell origin wanneer server-side geactiveerd |

GK-services moeten via `/opt/gk/node-v22/bin/node` draaien. `/usr/bin/node` kan serverbreed een andere versie zijn en is geen GK-blocker zolang GK-services en checks via Node 22 lopen.

## Secrets en env

Bekende env/secretbestanden:

| Doel | Pad |
|---|---|
| Algemene GK env | `/etc/gk/gk.env` |
| Editor admin bootstrap secret | `/etc/gk/secrets/initial-editor-admin.env` |
| Browser-smoke users | `/etc/gk/secrets/smoke-users.env` |

Bekende variabelenamen:

- `GK_INITIAL_EDITOR_ADMIN_EMAIL`;
- `GK_INITIAL_EDITOR_ADMIN_TEMP_PASSWORD`;
- `GK_SMOKE_EDITOR_EMAIL`;
- `GK_SMOKE_EDITOR_PASSWORD`;
- `GK_SMOKE_GAME_EMAIL`;
- `GK_SMOKE_GAME_PASSWORD`;
- `GK_EDITOR_WEB_ORIGIN`;
- `GK_GAME_PORT`;
- `GK_GAME_HOST`;
- `GK_GAME_FRONT_DOOR_URL`;
- `GK_GAME_WEB_ORIGIN`;
- `GK_GAME_SHELL_PATH`;
- `GK_BROWSER_SMOKE_ARTIFACT_DIR`;
- `GK_BROWSER_SMOKE_SCREENSHOT`;
- `GK_BROWSER_SMOKE_TRACE`.

Fase 12.1 server-only env:

- `GK_GAME_PORT=3003` voor de local `gk-game-web` service;
- `GK_GAME_HOST=127.0.0.1` waar server-side bevestigd of aangehouden;
- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003` voor local browser-smoke;
- `GK_GAME_FRONT_DOOR_URL` alleen instellen wanneer Apache werkelijk naar game-web routeert.

Nooit secret values printen. Nooit secretbestanden met `cat` tonen. Nooit secretwaarden naar Git kopieren. Commit nooit de inhoud van `/etc/gk/gk.env`.

Veilig patroon voor login en browser-smokes:

```bash
set -euo pipefail
export PATH=/opt/gk/node-v22/bin:$PATH

set -a
source /etc/gk/gk.env
source /etc/gk/secrets/initial-editor-admin.env
[ -f /etc/gk/secrets/smoke-users.env ] && source /etc/gk/secrets/smoke-users.env
set +a

# Gebruik de variabelen alleen voor service start, login requests en smokes.
# Echo de waarden nooit.
```

## Standaard server-check volgorde

Voer deze volgorde uit op de server:

```bash
cd /var/www/gk
git status
git pull --ff-only
git rev-parse HEAD

export PATH=/opt/gk/node-v22/bin:$PATH
node -v

pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Rapporteer start HEAD en eind HEAD. `git status` moet na verificatie schoon zijn, tenzij Codex/Claude expliciet server-side generated output heeft gemaakt die buiten Git hoort en apart is verklaard.

Browser-smokes draaien pas na bovenstaande checks en na service restart.

## Services

Services pas herstarten na succesvolle build/typecheck/test/lint.

Bestaande services:

```bash
systemctl restart gk-api gk-editor-web gk-game-web
systemctl is-active gk-api gk-editor-web gk-game-web
systemctl is-enabled gk-api gk-editor-web gk-game-web
```

Bevestig daarna dat de processen via Node 22 draaien:

```bash
ps -eo pid,cmd | grep -E 'gk-api|gk-editor-web|gk-game-web|/opt/gk/node-v22/bin/node' | grep -v grep
```

Rapporteer alleen procespad/status. Print geen env of secrets uit process output als een commando ooit env zou tonen.

## Bekende auth routes en login flow

Bekende editor-auth routes:

- `POST /auth/editor/login`;
- `GET /auth/editor/me`.

Bekende game-auth routes:

- `POST /auth/game/login`;
- `GET /auth/game/me`.

Fase 12 runtime client shell gebruikt geen editor login, geen editor/admin routes, geen editor CSRF en geen editor draft data. De shell mag alleen Fase 11 runtime projection read-only routes fetchen.

Fase 12.1 verandert de auth-contracten niet en voegt geen game login requirement toe.

Fase 13 runtime render surface gebruikt geen editor login, geen editor/admin routes, geen editor CSRF, geen game login requirement en geen editor draft data. De render surface mag alleen runtime projection metadata/read-only state consumeren.

## Bekende fase-smoke routes

### Fase 11 Runtime Projection

Editor/admin routes:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Runtime read-only routes:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

### Fase 12 Runtime Client Shell

Game/runtime shell routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Fase 12 route-smokes moeten bevestigen:

- shell HTML bevat `data-runtime-client-shell="phase-12"`;
- shell JSON bevat Fase 12 runtime client shell contract/status;
- shell noemt alleen runtime projection read-only routes;
- shell response bevat geen `/editor/` of `/auth/editor` routegebruik;
- runtime projection read-only routes blijven bereikbaar of geven veilige empty state;
- no-runtime-renderer;
- no-gameplay/no-movement/no-combat;
- no-audio-playback;
- no-concrete-gamecontent;
- no-asset-mutation.

### Fase 12.1 Game Web Service Deployment

Service checks:

- `systemctl daemon-reload`;
- `systemctl enable gk-game-web`;
- `systemctl restart gk-game-web`;
- `systemctl is-active gk-game-web`;
- `systemctl is-enabled gk-game-web`;
- Node 22 process check via `/opt/gk/node-v22/bin/node`.

Local route smokes:

- `curl http://127.0.0.1:3003/health/game`;
- `curl http://127.0.0.1:3003/game/shell.json`;
- `curl http://127.0.0.1:3003/runtime/projection/status`.

Browser smokes:

- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003 pnpm smoke:browser:game` for local service smoke;
- `GK_GAME_FRONT_DOOR_URL=<server-confirmed-game-url> pnpm smoke:browser:game` only after Apache/front-door route is confirmed;
- `pnpm smoke:browser` after editor and game smoke env are ready.

### Fase 13 Runtime Render Surface

Contract checks:

- `GET http://127.0.0.1:3003/health/game` bevat `runtimeRenderSurface=phase-13` en veilige flags;
- `GET http://127.0.0.1:3003/game/shell.json` bevat render surface state/contract;
- `GET http://127.0.0.1:3003/game/` bevat `data-runtime-render-surface="phase-13"`;
- shell HTML bevat `data-runtime-render-safe-empty-state`;
- shell HTML bevat `data-runtime-render-canvas`;
- shell HTML bevat geen `/editor/` of `/auth/editor` routegebruik;
- shell HTML bevat geen `/assets/` routegebruik;
- shell HTML laadt geen GLB, texture, UI image of audio asset.

Local route smokes:

- `curl http://127.0.0.1:3003/health/game`;
- `curl http://127.0.0.1:3003/game/shell.json`;
- `curl http://127.0.0.1:3003/game/`;
- `curl http://127.0.0.1:3003/runtime/projection/status`;
- `curl http://127.0.0.1:3003/runtime/projection/manifest`;
- `curl http://127.0.0.1:3003/runtime/projection/records`.

Browser smokes:

- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003 pnpm smoke:browser:game`;
- `pnpm smoke:browser`.

Fase 13 checks moeten bevestigen:

- runtime shell marker OK;
- render surface marker OK;
- safe empty render state OK;
- canvas/WebGL capability probe loopt zonder scene/content te renderen;
- console/page errors count OK;
- no editor/admin route usage;
- no editor draft/candidate leakage;
- no GLB loading;
- no asset load requests;
- no concrete gamecontent;
- no projection-driven scene assembly;
- no gameplay/movement/combat/audio playback;
- no hardcoded HUD/minimap/world/camera/light/audio values;
- no asset mutation;
- no secrets committed;
- GameBible save/protection blijft OK.

### GameBible

GameBible editor save route moet beschermd blijven.

Smoke-regels:

- Smoke mag GameBible content niet wijzigen.
- Gebruik hash before/after wanneer een protection-check nodig is.
- Protection-check mag alleen bevestigen dat ongeautoriseerde of onveilige save dicht blijft.
- Muterende live save-tests alleen uitvoeren als er een expliciete restore-strategie is.

## Headless Chromium / Playwright browser smoke

Deze browser-smoke is een vaste ops-hardening stap na:

1. `pnpm build`;
2. `pnpm typecheck`;
3. `pnpm test`;
4. `pnpm lint`;
5. service restart;
6. service active/enabled en Node 22 process checks.

### Env sourcen

Gebruik dit patroon:

```bash
set -euo pipefail
export PATH=/opt/gk/node-v22/bin:$PATH

set -a
source /etc/gk/gk.env
source /etc/gk/secrets/initial-editor-admin.env
[ -f /etc/gk/secrets/smoke-users.env ] && source /etc/gk/secrets/smoke-users.env
set +a

pnpm smoke:browser
```

`/etc/gk/gk.env` en `/etc/gk/secrets/smoke-users.env` blijven server-only en komen nooit in Git.

### Scripts

- `pnpm smoke:browser`: editor plus game smoke.
- `pnpm smoke:browser:editor`: alleen editor browser-smoke.
- `pnpm smoke:browser:game`: alleen game browser-smoke.

### Game/runtime browser-smoke

De game smoke:

- gebruikt `GK_GAME_FRONT_DOOR_URL` als volledige URL wanneer die is gezet;
- gebruikt anders `GK_GAME_WEB_ORIGIN` plus `GK_GAME_SHELL_PATH`, default `/game/`;
- gebruikt voor local service smoke `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- checkt de Fase 12 runtime shell marker;
- checkt de Fase 13 runtime render surface marker;
- checkt de Fase 13 safe empty render state;
- checkt dat Fase 13 geen asset-load requests doet;
- probeert alleen game login wanneer `GK_SMOKE_GAME_EMAIL` en `GK_SMOKE_GAME_PASSWORD` bestaan en de game auth route bereikbaar is;
- maakt geen account aan;
- voert geen gameplay of dummy content in;
- muteert geen GameBible en uploadt geen assets.

### Artifacts

Standaard worden geen screenshots of traces gemaakt.

Opt-in:

- `GK_BROWSER_SMOKE_SCREENSHOT=1` maakt screenshots na veilige login/reachability checks.
- `GK_BROWSER_SMOKE_TRACE=1` maakt beperkte traces na veilige login/reachability checks.
- `GK_BROWSER_SMOKE_ARTIFACT_DIR` mag naar een server-local tijdelijke map wijzen.
- Zonder expliciete artifact dir gebruikt de smoke een map onder `/tmp/gk-browser-smoke/`.

Artifacts blijven buiten Git. Screenshots/traces mogen geen secrets tonen en mogen niet worden gedeeld als ze loginvelden, cookies, tokens of gevoelige browserstate bevatten.

### Outputbetekenis

De smoke rapporteert kort:

- `editor browser smoke: ok/fail/skipped`;
- `game browser smoke: ok/fail/skipped`;
- `url checks: ok/fail/skipped`;
- `panels: ok/fail/skipped`;
- `runtime shell: ok/fail/skipped`;
- `render surface: ok/fail/skipped`;
- `asset load requests: 0` voor Fase 13;
- `console errors count`;
- `page errors count`;
- screenshot/trace path indien gemaakt.

`ok` betekent dat de gevraagde smoke groen is. `fail` is een blocker voor server-side klaar. `skipped` is toegestaan wanneer een optionele game front door, game shell origin of game-smoke user nog niet bestaat, maar Fase 13 render surface checks mogen niet worden overgeslagen wanneer game shell bereikbaar is.

## Standaard eindrapport voor Codex/Claude

Gebruik dit rapportformat:

```text
start HEAD:
eind HEAD:

build:
typecheck:
test:
lint:

services active/enabled:
gk-api active/enabled:
gk-editor-web active/enabled:
gk-game-web active/enabled:
Node 22 process OK:

editor login OK:
/auth/editor/me OK:

relevante fase-routes OK:
game-web local /health/game OK:
game-web local /game/shell.json OK:
game-web local /game/ OK:
game-web local /runtime/projection/status OK:
game-web local /runtime/projection/manifest OK:
game-web local /runtime/projection/records OK:
Apache/front-door /game/ OK/minimal config applied/not configured:
anonymous/game/non-admin denied OK:
CSRF/Origin OK:
frontend panel smoke OK:
browser smoke OK/fail/skipped:
runtime shell smoke OK/fail/skipped:
render surface smoke OK/fail/skipped:
game browser smoke OK/fail/skipped:
asset load requests: 0/nummer:

no-runtime-publish/no-runtime-renderer waar relevant:
no-renderer-scene-assembly:
no-GLB-loading/no-asset-loads:
no-runtime-gameplay/no-movement/no-combat/no-audio-playback waar relevant:
no-hardcoded HUD/minimap/world/camera/light/audio values:
no-asset-mutation:
no-secrets-committed:

GameBible save/protection:
game-site reachable:
worktree schoon:

blockers:
fase server-side klaar: ja/nee
```

Als een check niet kan draaien, rapporteer exact waarom en welke kleinste volgende stap nodig is. Claim nooit server-side klaar zonder build/typecheck/test/lint en de relevante live smokes.
