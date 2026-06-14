# Server Layout - Fase 2

## Status

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd.

Fase 1 t/m Fase 14 zijn afgerond. Fase 15 Runtime Asset Reference Planning Core is geopend met Git-basis op `main`; server-side verificatie door Codex/Claude is nog nodig.

Afgeronde server-side basis:

- Fase 7 asset library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display;
- Fase 10 Publish Flow Core;
- Fase 11 Runtime Projection Core;
- Fase 12 Runtime Client Shell Core;
- Fase 12.1 Game Web Service Deployment Core;
- Fase 13 Runtime Render Surface Core;
- Fase 14 Projection-driven Scene Assembly Core.

Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd en formeel afgerond via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`).

Fase 15 is geopend maar nog niet server-side bevestigd. Fase 16 is nog niet geopend of geimplementeerd.

## Vast server-verificatie runbook

Gebruik `docs/ops/server-verification-runbook.md` als vaste startplek voor Codex/Claude server-side verificatie. Dat runbook bundelt de bekende serverpaden, Node 22 PATH, env- en secret-bestandspaden zonder secret values, service/poort layout, editor login flow, smoke-routes, frontend/editor panel checks, Playwright/headless Chromium browser-smokes en standaard eindrapportage.

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Projection > Runtime Client Shell > Runtime Render Surface > Runtime Scene Assembly > Runtime Asset Reference Planning > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.
- Browser-smokes mogen geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.
- Fase 15 maakt alleen de runtime asset-reference planning metadata-basis en bouwt geen asset-loader, renderer, gameplay, HUD/minimap runtime of audio playback.

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

## Fase 15 server-side status

Fase 15 Runtime Asset Reference Planning Core is geopend en heeft een Git-basis. Server-side verificatie is nog open.

Fase 15 voegt alleen runtime asset-reference planning metadata/contracts toe:

- runtime asset reference planning schemas en validators;
- runtime asset reference socket/node contracts;
- game-web asset reference planning helper;
- asset reference planning statuszone in de runtime shell;
- marker `data-runtime-asset-reference-planning="phase-15"`;
- empty asset reference plan output;
- browser-smoke asset reference planning checks;
- tests en docs.

Nog open voor Codex/Claude:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- `gk-api`, `gk-editor-web` en `gk-game-web` active/enabled bevestigen;
- local route-smokes;
- Apache/front-door smokes;
- `pnpm smoke:browser:game`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser`;
- asset reference planning marker bevestigen;
- empty asset reference plan bevestigen;
- no editor/admin route usage;
- no draft leakage;
- no GLB/texture/audio loading;
- no asset byte fetch;
- no asset load requests;
- no definitive asset role mapping;
- no concrete content;
- no renderer draw calls;
- no gameplay/movement/combat/audio playback;
- no hardcoded runtime values;
- no asset mutation;
- worktree schoon;
- blockers geen.

Fase 15 bouwt niet:

- asset-loader;
- GLB/texture/audio loading;
- asset byte fetch;
- definitive asset role mapping;
- concrete gamewereld;
- dummy world, NPC, quest of economy;
- renderer scene draw calls;
- gameplay, movement, combat of player runtime;
- audio playback;
- HUD/minimap runtime layout;
- hardcoded world/camera/light/minimap/HUD/audio values;
- assetmutatie;
- Fase 16.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Fase 15 verandert deze policy niet.

## Browser-smoke tooling

`package.json` bevat expliciete browser-smoke scripts:

- `pnpm smoke:browser`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser:game`.

Fase 15 game smoke gebruikt:

- `GK_GAME_FRONT_DOOR_URL` als volledige URL wanneer Apache/front-door naar game-web routeert;
- anders `GK_GAME_WEB_ORIGIN` plus `GK_GAME_SHELL_PATH`, default `/game/`;
- voor local smoke mag `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003` worden gezet.

Fase 15 browser-smoke moet `runtime shell: ok`, `render surface: ok`, `scene assembly: ok`, `asset reference planning: ok`, `asset load requests: 0`, console errors `0` en page errors `0` bevestigen.

Voor de formele Fase 15 afronding zijn deze browser-smoke checks nog niet server-side bevestigd.

## Codex/Claude serverchecks

Afgerond:

1. Runtime directories, user/group, env, MySQL, Redis, Apache-hardening en systemd templates server-side gevalideerd.
2. Fase 7 t/m Fase 14 server-side afgerond volgens de fase-README's en dit layoutdocument.

Gebruik voor Fase 15 server-side verificatie `docs/ops/server-verification-runbook.md`; die legt de standaard checkvolgorde, smoke routes, browser-smokes, frontend checks en rapportvelden vast.

Nog open voor latere fases:

- Fase 15 server-side verificatie en docs-final;
- asset loading;
- game runtime renderer/gameplay;
- realtime gateway;
- workers;
- runtime publish-services;
- Nginx live-migratie alleen in aparte migratiefase.
