# Server Layout - Fase 2

## Status

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd.

Fase 1 t/m Fase 13 zijn afgerond.

Afgeronde server-side basis:

- Fase 7 asset library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display;
- Fase 10 Publish Flow Core;
- Fase 11 Runtime Projection Core;
- Fase 12 Runtime Client Shell Core;
- Fase 12.1 Game Web Service Deployment Core;
- Fase 13 Runtime Render Surface Core.

Fase 12.1 bevestigde:

- `gk-game-web` is een vaste `active`/`enabled` systemd service;
- `gk-game-web` draait als `gk:gk` via `/opt/gk/node-v22/bin/node`;
- Apache routeert `/game/`, `/health/game` en `/runtime/projection/` naar `127.0.0.1:3003`;
- game browser-smoke is groen en niet meer skipped;
- worktree schoon en blockers geen.

Fase 13 Runtime Render Surface Core is server-side groen bevestigd en formeel afgerond. Fase 14 is nog niet geopend of geimplementeerd.

## Vast server-verificatie runbook

Gebruik `docs/ops/server-verification-runbook.md` als vaste startplek voor Codex/Claude server-side verificatie. Dat runbook bundelt de bekende serverpaden, Node 22 PATH, env- en secret-bestandspaden zonder secret values, service/poort layout, editor login flow, smoke-routes, frontend/editor panel checks, Playwright/headless Chromium browser-smokes en standaard eindrapportage.

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Projection > Runtime Client Shell > Runtime Render Surface > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.
- Browser-smokes mogen geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.
- Fase 13 maakt alleen de runtime render-surface basis en bouwt geen volledige renderer, scene assembly, gameplay, HUD/minimap runtime of audio playback.

## Bevestigde paden

| Pad of env | Status | Opmerking |
|---|---|---|
| `/var/www/gk` | Bevestigd | Basis voor de eerste single-server omgeving. |
| `/var/www/gk/assets` | Bevestigd | Server assetbron. |
| `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` | Bevestigd | Door Codex buiten Git gezet of bevestigd. |
| `/opt/gk/node-v22/bin/node` | Bevestigd | Actieve Node runtime voor `gk-api`, `gk-editor-web` en `gk-game-web`. |
| `/tmp/gk-browser-smoke/` | Candidate/default | Server-local browser-smoke artifacts, nooit Git. |
| `ops/systemd/gk-game-web.service` | Git-template | Template voor de vaste game-web service. |
| `/etc/systemd/system/gk-game-web.service` | Bevestigd | Live `gk-game-web` systemd unit, server-side buiten Git geplaatst. |

## Poorten en services

| Service | Standaard local origin | Opmerking |
|---|---|---|
| API | `127.0.0.1:3001` | Bestaande `gk-api`, `active`/`enabled`. |
| Editor web | `127.0.0.1:3002` | Bestaande `gk-editor-web`, `active`/`enabled`. |
| Game/runtime shell | `127.0.0.1:3003` | Vaste `gk-game-web` systemd service, `active`/`enabled`, via `/opt/gk/node-v22/bin/node`. |

Game/runtime shell routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Runtime projection read-only routes via game-web proxy:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Game-web service env:

- `GK_GAME_PORT=3003` voor de local service;
- `GK_GAME_HOST=127.0.0.1` zodat game-web lokaal achter Apache draait;
- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003` voor local browser-smoke;
- `GK_GAME_FRONT_DOOR_URL=https://gk-k3v1nc0.duckdns.org/game/` voor de bevestigde Apache/front-door route.

## Assetstatus

De asset refresh na `Assets - new` heeft `/var/www/gk/assets` via `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` gevalideerd:

| Type | Aantal | Gate |
|---|---:|---|
| GLB | 4 | Feitelijk aanwezig, alleen kandidaat role mapping |
| UI images | 37 | Aanwezig als asset-library candidates; geen hardcoded HUD/minimap/UI |
| Audio | 21 | Aanwezig als asset-library candidates; geen hardcoded music/ambience/SFX/UI audio |
| Invalid | 0 | OK |
| Missing | 0 | OK |

Fase 13 laadt geen GLB, textures, UI images of audio assets en wijzigt geen assets.

## Fase 12 server-side status

Fase 12 voegt Runtime Client Shell Core contracts toe in Git en is server-side afgerond en klaar:

- runtime client shell schemas en validators;
- runtime client shell socket/node contracts;
- game-web runtime shell routes;
- projection fetch/read-only client;
- game-web proxy voor runtime projection read-only routes naar de API;
- safe empty-state shell UI;
- browser-smoke runtime shell hook;
- tests en docs.

Bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- live editor login: OK;
- `/auth/editor/me`: OK;
- runtime projection read-only route smokes: OK;
- game/runtime shell route smokes: OK;
- `/game/shell.json`: OK;
- browser smoke: OK;
- runtime shell marker: OK;
- no editor/admin route usage: OK;
- no draft leakage: OK;
- no concrete content: OK;
- no renderer/gameplay/movement/combat/audio playback: OK;
- no hardcoded HUD/minimap/world/camera/light/audio values: OK;
- no asset mutation: OK;
- GameBible save/protection: OK;
- worktree schoon: OK;
- blockers: geen.

## Fase 12.1 server-side status

Fase 12.1 Game Web Service Deployment Core is server-side afgerond en klaar.

Server-side bevestigd:

- live unit geinstalleerd in `/etc/systemd/system/gk-game-web.service`;
- `gk-game-web` draait als `gk:gk`;
- `gk-game-web` draait via `/opt/gk/node-v22/bin/node`;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- `gk-game-web` active/enabled: OK;
- Apache routeert `/game/`, `/health/game` en `/runtime/projection/` naar `127.0.0.1:3003`;
- local route smokes: OK;
- front-door GET-checks: OK;
- `pnpm smoke:browser:game`: OK;
- `pnpm smoke:browser:editor`: OK;
- `pnpm smoke:browser`: OK;
- game-smoke niet skipped: OK;
- geen renderer/gameplay/content/asset/secrets regressie;
- worktree schoon: OK;
- blockers: geen.

## Fase 13 server-side status

Fase 13 Runtime Render Surface Core is server-side afgerond en klaar.

Toegevoegd of bijgewerkt:

- runtime render surface schemas en validators;
- runtime render surface socket/node contracts;
- game-web render surface helper;
- canvas/render host in de runtime shell;
- marker `data-runtime-render-surface="phase-13"`;
- WebGL/canvas capability probe zonder scene/content te renderen;
- safe empty render state;
- browser-smoke render surface checks;
- tests en docs.

Server-side bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- `gk-game-web` active/enabled: OK;
- Node 22 process check via `/opt/gk/node-v22/bin/node`: OK;
- local route-smokes op `127.0.0.1:3003`: OK;
- Apache/front-door smokes: OK;
- `pnpm smoke:browser:game`: OK;
- `pnpm smoke:browser:editor`: OK;
- `pnpm smoke:browser`: OK;
- runtime shell marker: OK;
- render surface marker: OK;
- safe empty render state: OK;
- no editor/admin route usage: OK;
- no editor draft/candidate leakage: OK;
- no GLB loading: OK;
- no asset load requests: OK;
- no concrete gamecontent: OK;
- no full 3D renderer: OK;
- no projection-driven scene assembly: OK;
- no gameplay/movement/combat/audio playback: OK;
- no hardcoded HUD/minimap/world/camera/light/audio values: OK;
- no asset mutation: OK;
- worktree schoon: OK;
- blockers: geen.

Fase 13 bouwde niet:

- volledige 3D renderer;
- projection-driven scene assembly;
- GLB loading;
- concrete gamewereld;
- definitive GLB role mapping;
- gameplay, movement, combat of player runtime;
- audio playback;
- HUD/minimap runtime layout;
- hardcoded world/camera/light/minimap/HUD/audio values;
- assetmutatie;
- Fase 14.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Fase 13 verandert deze policy niet.

## Secrets en env

Echte serverwaarden horen buiten Git, bijvoorbeeld in:

- `/etc/gk/gk.env`;
- `/etc/gk/secrets/initial-editor-admin.env`;
- `/etc/gk/secrets/smoke-users.env`;
- een door Codex beheerde secret store of serverconfig.

Git mag alleen veilige examples bevatten. Geen Fase 13 wijziging mag secrets toevoegen.

## Browser-smoke tooling

`package.json` bevat expliciete browser-smoke scripts:

- `pnpm smoke:browser`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser:game`.

Fase 13 game smoke gebruikt:

- `GK_GAME_FRONT_DOOR_URL` als volledige URL wanneer Apache/front-door naar game-web routeert;
- anders `GK_GAME_WEB_ORIGIN` plus `GK_GAME_SHELL_PATH`, default `/game/`;
- voor local smoke mag `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003` worden gezet.

Fase 13 browser-smoke moet `runtime shell: ok`, `render surface: ok`, `asset load requests: 0`, console errors `0` en page errors `0` bevestigen.

## Codex/Claude serverchecks

Afgerond:

1. Runtime directories, user/group, env, MySQL, Redis, Apache-hardening en systemd templates server-side gevalideerd.
2. Fase 7 t/m Fase 13 server-side afgerond volgens de fase-README's en dit layoutdocument.

Gebruik voor nieuwe server-side verificatie `docs/ops/server-verification-runbook.md`; die legt de standaard checkvolgorde, smoke routes, browser-smokes, frontend checks en rapportvelden vast.

Nog open voor latere fases:

- Fase 14 alleen openen wanneer Kevin dat expliciet doet;
- projection-driven scene assembly;
- game runtime renderer/gameplay;
- realtime gateway;
- workers;
- runtime publish-services;
- Nginx live-migratie alleen in aparte migratiefase.
