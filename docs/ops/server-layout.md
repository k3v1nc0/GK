# Server Layout - Fase 2

## Status

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd.

Fase 7 asset library is server-side gevalideerd.

Fase 8 entity/component core is server-side gevalideerd.

Fase 8.1 procedural generation core is server-side gevalideerd en klaar.

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) is de asset refresh server-side uitgevoerd en is de asset scan OK met GLB=4, UI images=37, audio files=21, invalid=0 en missing=0.

Fase 9 world/camera/lighting/minimap/UI display is server-side afgerond en klaar. Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

Fase 10 Publish Flow Core is server-side afgerond en klaar. Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core is server-side afgerond en klaar. Browser smoke en ops/docs-hardening staan ook op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36` (`Codex/Claude - browser en ops/docs-hardining`).

Fase 12 Runtime Client Shell Core is server-side afgerond en klaar. Server-side fix commit: `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Docs-final/fix commit: `199df8642cfa6f20ce518742a0ea0e35ec5fb2fe` (`fase 12 fix`).

Fase 1 t/m Fase 12.1 zijn afgerond. Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd. `gk-game-web` is nu een vaste `active`/`enabled` systemd service via Node 22, Apache routeert `/game/` naar de game-web service, en de game browser-smoke is groen en niet meer skipped. Fase 13 is nog niet geopend en niet geimplementeerd.

## Vast server-verificatie runbook

Gebruik `docs/ops/server-verification-runbook.md` als vaste startplek voor Codex/Claude server-side verificatie. Dat runbook bundelt de bekende serverpaden, Node 22 PATH, env- en secret-bestandspaden zonder secret values, service/poort layout, editor login flow, smoke-routes, frontend/editor panel checks, Playwright/headless Chromium browser-smokes en standaard eindrapportage.

De runbook is leidend voor terugkerende serverchecks. Deze layoutdoc blijft de structurele serverkaart, maar Codex/Claude hoeft voor fase-smokes niet opnieuw te zoeken naar secretlocaties, routefamilies, panel IDs of browser-smoke artifactregels.

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Projection > Runtime Client Shell > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.
- Procedural generation output blijft draft/preview/bake data totdat publish-flow expliciet publiceert in een daarvoor geopende fase.
- UI/audio assets blijven asset-library candidates totdat editor/node-data of Kevin-input ze expliciet kiest.
- Fase 9 publiceert niets naar runtime.
- Fase 10 publiceert niets naar runtime en maakt alleen publish validation/snapshot metadata contracts.
- Fase 11 maakt alleen runtime projection contracts/read-model metadata en bouwt geen Runtime Game renderer/client.
- Fase 12 maakt alleen een runtime client shell voor read-only projection metadata en bouwt geen renderer, gameplay, HUD/minimap runtime of audio playback.
- Fase 12.1 maakt alleen de vaste game-web deployment/service-basis en bouwt geen nieuwe runtime/game feature.
- Browser-smokes mogen geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.

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
| Game/runtime shell | `127.0.0.1:3003` | Vaste `gk-game-web` systemd service, `active`/`enabled`, via `/opt/gk/node-v22/bin/node`. Tijdelijke handmatige Node 22 game-shell is niet meer nodig. |

Game/runtime shell routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

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

Bevestigd:

- `Blacksmit forge.glb` bevat een spatie en werkt in scanner/library.
- Alle 4 GLB records blijven candidate totdat editor-data/Kevin anders kiest.
- `Taverne.glb` blijft candidate.
- `Wizard.glb` blijft candidate.
- HUD-bestanden worden als UI/image assets gezien.
- Icon-bestanden worden als UI/image assets gezien.
- Minimap marker-bestanden worden als UI/image assets gezien.
- Ambience, music, SFX en UI audio worden als audio assets gezien.
- `assetsCopiedToGit=false`.
- `assignsDefinitiveRuntimeRoles=false`.
- `publishesRuntimeOutput=false`.

## Fase 9 server-side status

Fase 9 voegt world/camera/lighting/minimap/UI display contracts toe in Git en is server-side afgerond en klaar.

Bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api` herstart: OK;
- `gk-editor-web` herstart: OK;
- services active/enabled: OK;
- editor login: OK;
- Fase 9 route smokes: OK;
- anonymous/game denied: OK;
- editor panels: OK;
- UI scaling validation: OK;
- no-runtime-publish: OK;
- no-asset-mutation: OK;
- blockers: geen.

## Fase 10 server-side status

Fase 10 voegt Publish Flow Core contracts toe in Git en is server-side afgerond en klaar.

Route contracts:

- `GET /editor/publish/status`;
- `POST /editor/publish/validate`;
- `POST /editor/publish/snapshots`;
- `GET /editor/publish/snapshots`;
- `GET /editor/publish/snapshots/:id`;
- `POST /editor/publish/rollback/validate`.

Bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- publish route smokes: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin smokes: OK;
- Publish Flow panel smoke: OK;
- no-runtime-publish/no-asset-mutation: OK;
- blockers: geen.

Fase 10 voert geen runtime publish uit en wijzigt geen assets.

## Fase 11 server-side status

Fase 11 voegt Runtime Projection Core contracts toe in Git en is server-side afgerond en klaar.

Editor/admin route contracts:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Runtime read-only route contracts:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 111 tests / 55 suites / 0 fail;
- `pnpm lint`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- beide services via `/opt/gk/node-v22/bin/node`: OK;
- editor login: OK;
- `/auth/editor/me` geeft `editor_admin`: OK;
- `/editor` bereikbaar: OK;
- Runtime Projection panel smoke: OK;
- editor/runtime projection route smokes: OK;
- runtime read-only projection route smokes: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin protection: OK;
- no-runtime-renderer: OK;
- no-game-client: OK;
- no-runtime-gameplay: OK;
- no-asset-mutation: OK;
- no hardcoded content: OK;
- GameBible save/protection: OK, content ongewijzigd;
- game-site reachable: OK;
- worktree schoon: OK;
- blockers: geen.

Fase 11 bouwt geen Runtime Game renderer/client, voert geen automatic projection uit en wijzigt geen assets.

Browser smoke en ops/docs-hardening zijn beschikbaar via `docs/ops/server-verification-runbook.md`. Editor browser-smoke is groen. De game browser-smoke is vanaf Fase 12.1 groen en niet meer skipped.

## Fase 12 server-side status

Fase 12 voegt Runtime Client Shell Core contracts toe in Git en is server-side afgerond en klaar:

- runtime client shell schemas en validators;
- runtime client shell socket/node contracts;
- game-web runtime shell routes;
- projection fetch/read-only client;
- game-web proxy voor runtime projection read-only routes naar de API, zodat de shell same-origin kan booten zonder console errors;
- safe empty-state shell UI;
- browser-smoke runtime shell hook;
- tests, inclusief async handler en proxy-route test;
- docs.

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

Server/runtime status bij Fase 12-afsluiting:

- apache2 actief;
- `gk-api` actief/enabled;
- `gk-editor-web` actief/enabled;
- Fase 12 was geverifieerd via tijdelijke Node 22 game-shell op `127.0.0.1:3003`.

Die tijdelijke situatie is in Fase 12.1 opgeheven: `gk-game-web` is nu een vaste `active`/`enabled` systemd service.

Fase 12 bouwt geen Runtime Game renderer, gameplay, movement, combat, HUD/minimap runtime of audio playback en wijzigt geen assets. Fase 13 is nog niet geimplementeerd.

## Fase 12.1 server-side status

Fase 12.1 Game Web Service Deployment Core is server-side afgerond en klaar.

Git-basis commit:

- `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Git-basis en docs:

- `ops/systemd/gk-game-web.service` als systemd unit template;
- `README/fase12.1.md` als fasecontract;
- current-phase docs;
- dit server-layout document;
- `docs/ops/server-verification-runbook.md` met vaste Fase 12.1 servicechecks.

Server-side bevestigd:

- live unit geinstalleerd in `/etc/systemd/system/gk-game-web.service`;
- `gk-game-web` draait als `gk:gk`;
- `gk-game-web` draait via `/opt/gk/node-v22/bin/node`;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- `gk-game-web` active/enabled: OK;
- Apache configtest: OK;
- Apache reload: OK;
- worktree schoon: OK;
- Git HEAD bleef `70808b7ac2aa50671fbf4369ef1158a5e5f13736` tijdens server-side verificatie.

Server-only env is buiten Git aangevuld in `/etc/gk/gk.env` met niet-secret waarden:

- `GK_GAME_PORT=3003`;
- `GK_GAME_HOST=127.0.0.1`;
- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- `GK_GAME_FRONT_DOOR_URL=https://gk-k3v1nc0.duckdns.org/game/`.

Apache front-door `gk-k3v1nc0.duckdns.org` proxyt naar `127.0.0.1:3003` voor:

- `/game/`;
- `/health/game`;
- `/runtime/projection/`.

Local route smokes groen bevestigd:

- `GET http://127.0.0.1:3003/health/game`;
- `GET http://127.0.0.1:3003/game/shell.json`;
- `GET http://127.0.0.1:3003/runtime/projection/status`;
- `GET http://127.0.0.1:3003/runtime/projection/manifest`;
- `GET http://127.0.0.1:3003/runtime/projection/records`.

Front-door GET-checks groen bevestigd:

- `GET https://gk-k3v1nc0.duckdns.org/game/`;
- `GET https://gk-k3v1nc0.duckdns.org/game/shell.json`;
- `GET https://gk-k3v1nc0.duckdns.org/runtime/projection/status`.

Browser-smokes groen bevestigd:

- `pnpm smoke:browser:game` met `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser`.

Game-smoke is groen en niet meer skipped.

Bevestigde grenzen:

- geen secrets geprint;
- geen artifacts naar Git;
- geen repo-bestanden gewijzigd door server-side verificatie;
- geen runtime renderer/gameplay/movement/combat/audio playback toegevoegd;
- geen concrete gamecontent toegevoegd;
- geen hardcoded world/camera/light/minimap/HUD/audio values toegevoegd;
- geen assetmutatie;
- geen Fase 13 geimplementeerd.

Fase 12.1 bouwt geen Runtime Game renderer, gameplay, movement, combat, HUD/minimap runtime of audio playback en wijzigt geen assets. Fase 13 is nog niet geopend.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Fase 12.1 bevestigt deze policy voor game-web:

- `gk-game-web` draait lokaal achter Apache reverse proxy op `127.0.0.1:3003`.
- Apache routeert `/game/`, `/health/game` en `/runtime/projection/` naar `127.0.0.1:3003`.
- Apache configtest en reload zijn groen bevestigd.
- Nginx is niet live geactiveerd.
- Poort 80/443 is niet gemigreerd.

Assets mogen alleen via een gecontroleerd publiek pad worden geserveerd dat naar `/var/www/gk/assets` wijst. Procedural generated draft/bake data, Fase 9 world/minimap/UI display drafts, Fase 10 publish validation/snapshot metadata en Fase 11 runtime projection source/manifest/read-model metadata mogen niet publiek worden geserveerd alsof het concrete runtimecontent of editor draft data is. Fase 12 runtime client shell mag alleen de read-only runtime projection routes tonen.

## Runtime directory layout

| Directory | Doel | Publiek via Apache? |
|---|---|---|
| `/var/www/gk/assets` | Feitelijke assetbron voor asset library/scanner | Alleen via gecontroleerd assetpad |
| `/var/www/gk/releases` | Releasebuilds per deploy | Nee |
| `/var/www/gk/current` | Actieve release of werkdirectory voor systemd services | Nee |
| `/var/www/gk/shared` | Gedeelde runtimebestanden die niet in Git horen | Nee |
| `/var/www/gk/shared/config` | Niet-publieke serverconfig, zonder Git-secrets | Nee |
| `/var/www/gk/data` | Runtime data, uploads, database dumps of generated data indien later nodig | Nee |
| `/var/www/gk/logs` | Applicatie- en workerlogs | Nee |
| `/var/www/gk/tmp` | Tijdelijke runtimebestanden | Nee |
| `/tmp/gk-browser-smoke` | Tijdelijke Playwright screenshots/traces indien expliciet aangezet | Nee |

## Secrets en env

Echte serverwaarden horen buiten Git, bijvoorbeeld in:

- `/etc/gk/gk.env`;
- `/etc/gk/secrets/initial-editor-admin.env`;
- `/etc/gk/secrets/smoke-users.env`;
- een door Codex beheerde secret store of serverconfig.

`/etc/gk/gk.env` bevat server-side niet-secret waarden voor Fase 12.1:

- `GK_GAME_PORT=3003`;
- `GK_GAME_HOST=127.0.0.1`;
- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- `GK_GAME_FRONT_DOOR_URL=https://gk-k3v1nc0.duckdns.org/game/`.

`/etc/gk/secrets/smoke-users.env` is server-only en mag optioneel deze variabelen bevatten:

- `GK_SMOKE_EDITOR_EMAIL`;
- `GK_SMOKE_EDITOR_PASSWORD`;
- `GK_SMOKE_GAME_EMAIL`;
- `GK_SMOKE_GAME_PASSWORD`.

De vaste secret-bestandspaden en variabelenamen staan in `docs/ops/server-verification-runbook.md`. Print nooit secret values, plak geen `cat` output met secrets in rapporten en commit nooit secret values naar Git.

Git mag alleen veilige examples bevatten. Geen Fase 12.1 wijziging mag secrets toevoegen.

## Browser-smoke tooling

`package.json` bevat expliciete browser-smoke scripts:

- `pnpm smoke:browser`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser:game`.

Deze scripts draaien pas na build/typecheck/test/lint en service restart. Ze mogen artifacts alleen in een tijdelijke server-local map zetten, standaard onder `/tmp/gk-browser-smoke/`, en nooit in Git.

Fase 12.1 game smoke gebruikt:

- `GK_GAME_FRONT_DOOR_URL` als volledige URL wanneer Apache/front-door naar game-web routeert;
- anders `GK_GAME_WEB_ORIGIN` plus `GK_GAME_SHELL_PATH`, default `/game/`;
- voor local smoke mag `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003` worden gezet.

Fase 12.1 game browser-smoke is groen bevestigd en niet meer skipped.

## Codex/Claude serverchecks

Afgerond:

1. Runtime directories, user/group, env, MySQL, Redis, Apache-hardening en systemd templates server-side gevalideerd.
2. Fase 7 install/build/typecheck/test/lint, migratie, asset scan en route smoke afgerond.
3. Fase 8 install/build/typecheck/test/lint, migratie, entity routes en runtime gates afgerond.
4. Fase 8.1 install/build/typecheck/test/lint, migratie, procedural smoke en no-runtime-publish/no-asset-copy checks afgerond.
5. Asset refresh na `Assets - new` uitgevoerd en scan OK met GLB=4, UI images=37, audio files=21, invalid=0, missing=0.
6. Fase 9 build/typecheck/test/lint, editor/API smokes en no-runtime-publish/no-asset-mutation afgerond.
7. Fase 10 build/typecheck/test/lint, publish route smokes, auth/CSRF smokes, panel smoke en no-runtime-publish/no-asset-mutation afgerond.
8. Fase 11 build/typecheck/test/lint, runtime projection route smokes, runtime read-only route smokes, auth/CSRF smokes, panel smoke, browser smoke ops-hardening, no-runtime-renderer/no-game-client/no-runtime-gameplay/no-asset-mutation/no-hardcoded-content afgerond.
9. Fase 12 build/typecheck/test/lint, live editor login, `/auth/editor/me`, runtime projection read-only route smokes, game/runtime shell route smokes, `/game/shell.json`, browser smoke, runtime shell marker, no editor/admin route usage, no draft leakage, no concrete content, no renderer/gameplay/movement/combat/audio playback, no hardcoded HUD/minimap/world/camera/light/audio values, no asset mutation, GameBible save/protection en tijdelijke Node 22 game-shell verificatie op `127.0.0.1:3003` afgerond.
10. Fase 12.1 vaste `gk-game-web` systemd service-installatie, `active`/`enabled` checks, Node 22 process check, local route smokes, Apache/front-door route checks, game/editor/full browser-smokes, no renderer/gameplay/content/asset/secrets regressiechecks en schone worktree bevestigd.

Gebruik voor nieuwe server-side verificatie `docs/ops/server-verification-runbook.md`; die legt de standaard checkvolgorde, smoke routes, browser-smokes, frontend checks en rapportvelden vast.

Nog open voor latere fases:

- Fase 13 openen wanneer Kevin dat expliciet doet;
- game runtime renderer/gameplay wanneer Kevin die expliciet opent;
- realtime gateway;
- workers;
- runtime publish-services;
- Nginx live-migratie alleen in aparte migratiefase.
