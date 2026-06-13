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

Nooit secret values printen. Commit nooit de inhoud van `/etc/gk/gk.env`.

Veilig patroon voor login en browser-smokes:

```bash
set -euo pipefail
export PATH=/opt/gk/node-v22/bin:$PATH

set -a
source /etc/gk/gk.env
source /etc/gk/secrets/initial-editor-admin.env
[ -f /etc/gk/secrets/smoke-users.env ] && source /etc/gk/secrets/smoke-users.env
set +a
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

```bash
systemctl restart gk-api gk-editor-web gk-game-web
systemctl is-active gk-api gk-editor-web gk-game-web
systemctl is-enabled gk-api gk-editor-web gk-game-web
ps -eo pid,cmd | grep -E 'gk-api|gk-editor-web|gk-game-web|/opt/gk/node-v22/bin/node' | grep -v grep
```

Rapporteer alleen procespad/status. Print geen env of secrets uit process output als een commando ooit env zou tonen.

## Bekende fase-smoke routes

### Fase 11 Runtime Projection

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
- no-runtime-renderer;
- no-gameplay/no-movement/no-combat;
- no-audio-playback;
- no-concrete-gamecontent;
- no-asset-mutation.

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

### Fase 14 Projection-driven Scene Assembly

Contract checks:

- `GET http://127.0.0.1:3003/health/game` bevat `runtimeSceneAssembly=phase-14`, `producesScenePlan=true`, `loadsAssets=false`, `resolvesFinalAssetRoles=false`, `rendersScene=false` en `rendererDrawCalls=false`;
- `GET http://127.0.0.1:3003/game/shell.json` bevat scene assembly state/contract;
- `GET http://127.0.0.1:3003/game/` bevat `data-runtime-scene-assembly="phase-14"`;
- shell HTML bevat `data-runtime-empty-scene-plan`;
- shell HTML bevat geen `/editor/` of `/auth/editor` routegebruik;
- shell HTML bevat geen `/assets/` routegebruik;
- shell HTML laadt geen GLB, texture, UI image of audio asset;
- shell HTML bevat geen renderer draw calls of gameplay controls.

Local route smokes:

```bash
curl -fsS http://127.0.0.1:3003/health/game
curl -fsS http://127.0.0.1:3003/game/shell.json
curl -fsS http://127.0.0.1:3003/game/
curl -fsS http://127.0.0.1:3003/runtime/projection/status
curl -fsS http://127.0.0.1:3003/runtime/projection/manifest
curl -fsS http://127.0.0.1:3003/runtime/projection/records
```

Browser smokes:

```bash
GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003 pnpm smoke:browser:game
pnpm smoke:browser:editor
pnpm smoke:browser
```

Als Apache/front-door route bevestigd is:

```bash
GK_GAME_FRONT_DOOR_URL=<server-confirmed-game-url> pnpm smoke:browser:game
```

Fase 14 checks moeten bevestigen:

- runtime shell marker OK;
- render surface marker OK;
- scene assembly marker OK;
- empty scene plan OK;
- console/page errors count OK;
- no editor/admin route usage;
- no editor draft/candidate leakage;
- no GLB loading;
- no texture/audio loading;
- no asset load requests;
- no definitive asset role mapping;
- no concrete gamecontent;
- no renderer scene draw calls;
- no gameplay/movement/combat/audio playback;
- no hardcoded HUD/minimap/world/camera/light/audio values;
- no asset mutation;
- no secrets committed;
- GameBible save/protection blijft OK.

## Headless Chromium / Playwright browser smoke

Deze browser-smoke is een vaste ops-hardening stap na:

1. `pnpm build`;
2. `pnpm typecheck`;
3. `pnpm test`;
4. `pnpm lint`;
5. service restart;
6. service active/enabled en Node 22 process checks.

### Env sourcen

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
- checkt de Fase 14 runtime scene assembly marker;
- checkt de Fase 14 empty scene plan;
- checkt dat Fase 14 geen asset/GLB/audio-load requests doet;
- probeert alleen game login wanneer `GK_SMOKE_GAME_EMAIL` en `GK_SMOKE_GAME_PASSWORD` bestaan en de game auth route bereikbaar is;
- maakt geen account aan;
- voert geen gameplay of dummy content in;
- muteert geen GameBible en uploadt geen assets.

### Outputbetekenis

De smoke rapporteert kort:

- `editor browser smoke: ok/fail/skipped`;
- `game browser smoke: ok/fail/skipped`;
- `url checks: ok/fail/skipped`;
- `panels: ok/fail/skipped`;
- `runtime shell: ok/fail/skipped`;
- `render surface: ok/fail/skipped`;
- `scene assembly: ok/fail/skipped`;
- `asset load requests: 0` voor Fase 14;
- `console errors count`;
- `page errors count`;
- screenshot/trace path indien gemaakt.

`ok` betekent dat de gevraagde smoke groen is. `fail` is een blocker voor server-side klaar. `skipped` is toegestaan wanneer een optionele game front door, game shell origin of game-smoke user nog niet bestaat, maar Fase 14 scene assembly checks mogen niet worden overgeslagen wanneer game shell bereikbaar is.

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
scene assembly smoke OK/fail/skipped:
game browser smoke OK/fail/skipped:
asset load requests: 0/nummer:

no-runtime-publish/no-runtime-renderer waar relevant:
no-renderer-scene-draw-calls:
no-GLB-loading/no-texture-audio-loading/no-asset-loads:
no-definitive-asset-role-mapping:
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
