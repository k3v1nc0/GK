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
| Actieve frontend/front door | Apache vhost/reverse proxy volgens serverconfig |
| Game/front door | Publieke game-site via de bestaande Apache front door waar server-layout dit bevestigt |

GK-services moeten via `/opt/gk/node-v22/bin/node` draaien. `/usr/bin/node` kan serverbreed een andere versie zijn en is geen GK-blocker zolang GK-services en checks via Node 22 lopen.

## Secrets en env

Bekende env/secretbestanden:

| Doel | Pad |
|---|---|
| Algemene GK env | `/etc/gk/gk.env` |
| Editor admin bootstrap secret | `/etc/gk/secrets/initial-editor-admin.env` |
| Browser-smoke users | `/etc/gk/secrets/smoke-users.env` |

Bekende variabelenamen:

- `GK_INITIAL_EDITOR_ADMIN_EMAIL`
- `GK_INITIAL_EDITOR_ADMIN_TEMP_PASSWORD`
- `GK_SMOKE_EDITOR_EMAIL`
- `GK_SMOKE_EDITOR_PASSWORD`
- `GK_SMOKE_GAME_EMAIL`
- `GK_SMOKE_GAME_PASSWORD`
- `GK_EDITOR_WEB_ORIGIN`
- `GK_GAME_FRONT_DOOR_URL`
- `GK_BROWSER_SMOKE_ARTIFACT_DIR`
- `GK_BROWSER_SMOKE_SCREENSHOT`
- `GK_BROWSER_SMOKE_TRACE`

Nooit secret values printen. Nooit secretbestanden met `cat` tonen. Nooit secretwaarden naar Git kopieren.

Veilig patroon voor login en browser-smokes:

```bash
set -euo pipefail
export PATH=/opt/gk/node-v22/bin:$PATH

set -a
source /etc/gk/secrets/initial-editor-admin.env
[ -f /etc/gk/secrets/smoke-users.env ] && source /etc/gk/secrets/smoke-users.env
set +a

# Gebruik de variabelen alleen voor login requests.
# Echo de waarden nooit.
```

Gebruik hetzelfde principe voor `/etc/gk/gk.env`: alleen sourcen waar nodig, nooit waarden printen.

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
systemctl restart gk-api gk-editor-web
systemctl is-active gk-api gk-editor-web
systemctl is-enabled gk-api gk-editor-web
```

Bevestig daarna dat de processen via Node 22 draaien:

```bash
ps -eo pid,cmd | grep -E 'gk-api|gk-editor-web|/opt/gk/node-v22/bin/node' | grep -v grep
```

Rapporteer alleen procespad/status. Print geen env of secrets uit process output als een commando ooit env zou tonen.

## Bekende auth routes en login flow

Bekende editor-auth routes:

- `POST /auth/editor/login`
- `GET /auth/editor/me`

Bekende game-auth routes:

- `POST /auth/game/login`
- `GET /auth/game/me`

Bekende session/CSRF flow:

- Login gebruikt echte editor credentials uit secret env.
- Login zet editor session cookie.
- Login zet CSRF cookie.
- State-changing editor routes gebruiken CSRF cookie plus CSRF header.
- Origin protection blijft actief voor state-changing editor routes.

Echte editor login is de voorkeursroute voor live smokes.

Smoke headers of bypass-env mogen alleen gebruikt worden waar ze expliciet zijn geactiveerd en alleen voor deny/contract-smokes. Maak live fasevalidatie niet afhankelijk van test-hacks.

## Bekende fase-smoke routes

### Fase 10 Publish Flow

- `GET /editor/publish/status`
- `POST /editor/publish/validate`
- `POST /editor/publish/snapshots`
- `GET /editor/publish/snapshots`
- `GET /editor/publish/snapshots/:id`
- `POST /editor/publish/rollback/validate`

Fase 10 route-smokes moeten bevestigen:

- editor admin access OK;
- anonymous/game/non-admin denied;
- CSRF/Origin protection op POST routes;
- no-runtime-publish;
- no-asset-mutation;
- responses blijven metadata/validation-only.

### Fase 11 Runtime Projection

Editor/admin routes:

- `GET /editor/runtime-projection/status`
- `POST /editor/runtime-projection/validate`
- `POST /editor/runtime-projection/project`
- `GET /editor/runtime-projection/manifests`
- `GET /editor/runtime-projection/manifests/:id`

Runtime read-only routes:

- `GET /runtime/projection/status`
- `GET /runtime/projection/manifest`
- `GET /runtime/projection/records`

Fase 11 route-smokes moeten bevestigen:

- editor admin access OK voor editor/admin routes;
- anonymous/game/non-admin denied voor editor/admin beheer;
- CSRF/Origin protection op POST routes;
- runtime read-only routes geven veilige empty state wanneer er nog geen projection is;
- runtime read-only routes lekken geen editor draft data;
- no-runtime-renderer;
- no-game-client;
- no-concrete-gamecontent;
- no-asset-mutation.

### GameBible

GameBible editor save route moet beschermd blijven.

Smoke-regels:

- Smoke mag GameBible content niet wijzigen.
- Gebruik hash before/after wanneer een protection-check nodig is.
- Protection-check mag alleen bevestigen dat ongeautoriseerde of onveilige save dicht blijft.
- Muterende live save-tests alleen uitvoeren als er een expliciete restore-strategie is.

## Frontend/editor checks

Standaard checks:

- `/editor` bereikbaar.
- `/editor/` bereikbaar indien trailing slash relevant is.
- `/editor/shell.json` bereikbaar.
- Shell model bevat het verwachte panel.
- `dockTabs` bevat het verwachte panel-id.
- HTML bevat login-required shell markers.
- Panelnaam is zichtbaar waar de shell/panel smoke dat verwacht.

Bekende panel IDs:

- `publish-flow-panel`
- `runtime-projection-panel`

Voor nieuwe fases: voeg het nieuwe panel-id aan dit runbook toe wanneer het een vaste server smoke wordt.

## Headless Chromium / Playwright browser smoke

Deze browser-smoke is een vaste ops-hardening stap na:

1. `pnpm build`;
2. `pnpm typecheck`;
3. `pnpm test`;
4. `pnpm lint`;
5. `systemctl restart gk-api gk-editor-web`;
6. service active/enabled en Node 22 process checks.

De browser-smoke is bewust geen onderdeel van `pnpm test`, omdat Chromium en server services nodig zijn.

### Playwright installatie

De repo bevat vaste smoke scripts, maar Playwright/Chromium moet server-side beschikbaar zijn voordat ze draaien. Als `pnpm smoke:browser` meldt dat Playwright ontbreekt, installeer server-side de Playwright package en Chromium volgens de actuele Playwright-instructies. Commit geen server-local install output, screenshots, traces of secrets naar Git.

### Env sourcen

Gebruik dit patroon:

```bash
set -euo pipefail
export PATH=/opt/gk/node-v22/bin:$PATH

set -a
source /etc/gk/secrets/initial-editor-admin.env
[ -f /etc/gk/secrets/smoke-users.env ] && source /etc/gk/secrets/smoke-users.env
set +a

pnpm smoke:browser
```

`/etc/gk/secrets/smoke-users.env` blijft server-only en komt nooit in Git.

### Scripts

- `pnpm smoke:browser`: editor plus game smoke.
- `pnpm smoke:browser:editor`: alleen editor browser-smoke.
- `pnpm smoke:browser:game`: alleen game browser-smoke.

### Editor browser-smoke

De editor smoke:

- opent `http://127.0.0.1:3002/editor/`, tenzij `GK_EDITOR_WEB_ORIGIN` of `GK_EDITOR_PATH` anders is gezet;
- bevestigt de login-required shell marker;
- logt in met `GK_SMOKE_EDITOR_EMAIL`/`GK_SMOKE_EDITOR_PASSWORD` of de initial admin env fallback;
- bevestigt `/auth/editor/me` en `editor_admin`;
- bevestigt `/editor/shell.json`;
- bevestigt panel IDs `publish-flow-panel` en `runtime-projection-panel` in `dockTabs`;
- bevestigt zichtbare panelnamen `Publish Flow` en `Runtime Projection`;
- telt console/page errors;
- wist login-form values voordat optionele screenshots/traces worden gemaakt.

### Game browser-smoke

De game smoke:

- gebruikt `GK_GAME_FRONT_DOOR_URL` of `GK_GAME_WEB_ORIGIN`;
- slaat netjes over als er geen game front door URL is gezet;
- doet reachability/read-only smoke;
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
- `console errors count`;
- `page errors count`;
- screenshot/trace path indien gemaakt.

`ok` betekent dat de gevraagde smoke groen is. `fail` is een blocker voor server-side klaar. `skipped` is toegestaan wanneer een optionele game front door of game-smoke user nog niet bestaat, maar moet als open taak worden gerapporteerd.

## Standaard frontend-verificatie

### Niveau 1: HTTP/HTML/shell.json smoke

Verplicht per serverfase.

Gebruik Node fetch of vergelijkbare HTTP-smoke om te controleren:

- editor HTML route;
- editor shell JSON route;
- vereiste panel IDs;
- login-required markers;
- fase-route statusresponses.

### Niveau 2: Headless browser smoke via Playwright

Verplicht als ops-hardening stap zodra Playwright/Chromium server-side beschikbaar is. Gebruik de scripts uit de sectie `Headless Chromium / Playwright browser smoke`.

### Niveau 3: Handmatige browser

Handmatige browser via publieke editor URL of code-server/browser is handig voor visuele controle, maar niet de primaire gate.

Primaire gate blijft reproduceerbare Playwright/HTTP smoke.

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
Node 22 process OK:

editor login OK:
/auth/editor/me OK:

relevante fase-routes OK:
anonymous/game/non-admin denied OK:
CSRF/Origin OK:
frontend panel smoke OK:
browser smoke OK/fail/skipped:

no-runtime-publish/no-runtime-renderer waar relevant:
no-asset-mutation:

GameBible save/protection:
game-site reachable:
worktree schoon:

blockers:
fase server-side klaar: ja/nee
```

Als een check niet kan draaien, rapporteer exact waarom en welke kleinste volgende stap nodig is. Claim nooit server-side klaar zonder build/typecheck/test/lint en de relevante live smokes.
