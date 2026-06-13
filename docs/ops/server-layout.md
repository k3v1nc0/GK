# Server Layout - Fase 2

## Status

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd.

Fase 7 asset library is server-side gevalideerd.

Fase 8 entity/component core is server-side gevalideerd.

Fase 8.1 procedural generation core is server-side gevalideerd en klaar.

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) is de asset refresh server-side uitgevoerd en is de asset scan OK met GLB=4, UI images=37, audio files=21, invalid=0 en missing=0.

Fase 9 world/camera/lighting/minimap/UI display is server-side afgerond en klaar. Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

Fase 10 Publish Flow Core is server-side afgerond en klaar. Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core Git-basis is voorbereid op `main`. Server-side validatie staat nog open.

## Vast server-verificatie runbook

Gebruik `docs/ops/server-verification-runbook.md` als vaste startplek voor Codex/Claude server-side verificatie. Dat runbook bundelt de bekende serverpaden, Node 22 PATH, env- en secret-bestandspaden zonder secret values, service/poort layout, editor login flow, smoke-routes, frontend/editor panel checks, Playwright/headless Chromium browser-smokes en standaard eindrapportage.

De runbook is leidend voor terugkerende serverchecks. Deze layoutdoc blijft de structurele serverkaart, maar Codex/Claude hoeft voor fase-smokes niet opnieuw te zoeken naar secretlocaties, routefamilies, panel IDs of browser-smoke artifactregels.

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Projection > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.
- Procedural generation output blijft draft/preview/bake data totdat publish-flow expliciet publiceert in een daarvoor geopende fase.
- UI/audio assets blijven asset-library candidates totdat editor/node-data of Kevin-input ze expliciet kiest.
- Fase 9 publiceert niets naar runtime.
- Fase 10 publiceert niets naar runtime en maakt alleen publish validation/snapshot metadata contracts.
- Fase 11 maakt alleen runtime projection contracts/read-model metadata en bouwt geen Runtime Game renderer/client.
- Browser-smokes mogen geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.

## Bevestigde paden

| Pad of env | Status | Opmerking |
|---|---|---|
| `/var/www/gk` | Bevestigd | Basis voor de eerste single-server omgeving. |
| `/var/www/gk/assets` | Bevestigd | Server assetbron. |
| `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` | Bevestigd | Door Codex buiten Git gezet of bevestigd. |
| `/opt/gk/node-v22/bin/node` | Bevestigd | Actieve Node runtime voor `gk-api` en `gk-editor-web`. |
| `/tmp/gk-browser-smoke/` | Candidate/default | Server-local browser-smoke artifacts, nooit Git. |

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

## Fase 11 Git-basis status

Fase 11 voegt Runtime Projection Core contracts toe in Git:

- runtime projection schemas en validators;
- runtime projection socket/node contracts;
- editor/admin runtime projection route contracts;
- runtime read-only route contracts;
- Runtime Projection panel state;
- tests;
- docs.

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

Server-side verificatie staat open. Geen server runtime, database migratie, service restart of live smoke is door deze GitHub-only update geclaimd.

Fase 11 bouwt geen Runtime Game renderer/client, voert geen automatic projection uit en wijzigt geen assets.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Assets mogen alleen via een gecontroleerd publiek pad worden geserveerd dat naar `/var/www/gk/assets` wijst. Procedural generated draft/bake data, Fase 9 world/minimap/UI display drafts, Fase 10 publish validation/snapshot metadata en Fase 11 runtime projection source/manifest/read-model metadata mogen niet publiek worden geserveerd alsof het concrete runtimecontent of editor draft data is.

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

`/etc/gk/secrets/smoke-users.env` is server-only en mag optioneel deze variabelen bevatten:

- `GK_SMOKE_EDITOR_EMAIL`;
- `GK_SMOKE_EDITOR_PASSWORD`;
- `GK_SMOKE_GAME_EMAIL`;
- `GK_SMOKE_GAME_PASSWORD`.

De vaste secret-bestandspaden en variabelenamen staan in `docs/ops/server-verification-runbook.md`. Print nooit secret values, plak geen `cat` output met secrets in rapporten en commit nooit secret values naar Git.

Git mag alleen veilige examples bevatten. Geen Fase 11 wijziging mag secrets toevoegen.

## Browser-smoke tooling

`package.json` bevat expliciete browser-smoke scripts:

- `pnpm smoke:browser`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser:game`.

Deze scripts draaien pas na build/typecheck/test/lint en service restart. Ze vereisen server-side Playwright/Chromium installatie indien die nog niet aanwezig is. Ze mogen artifacts alleen in een tijdelijke server-local map zetten, standaard onder `/tmp/gk-browser-smoke/`, en nooit in Git.

## Codex/Claude serverchecks

Afgerond:

1. Runtime directories, user/group, env, MySQL, Redis, Apache-hardening en systemd templates server-side gevalideerd.
2. Fase 7 install/build/typecheck/test/lint, migratie, asset scan en route smoke afgerond.
3. Fase 8 install/build/typecheck/test/lint, migratie, entity routes en runtime gates afgerond.
4. Fase 8.1 install/build/typecheck/test/lint, migratie, procedural smoke en no-runtime-publish/no-asset-copy checks afgerond.
5. Asset refresh na `Assets - new` uitgevoerd en scan OK met GLB=4, UI images=37, audio files=21, invalid=0, missing=0.
6. Fase 9 build/typecheck/test/lint, editor/API smokes en no-runtime-publish/no-asset-mutation afgerond.
7. Fase 10 build/typecheck/test/lint, publish route smokes, auth/CSRF smokes, panel smoke en no-runtime-publish/no-asset-mutation afgerond.

Gebruik voor nieuwe server-side verificatie `docs/ops/server-verification-runbook.md`; die legt de standaard checkvolgorde, smoke routes, browser-smokes, frontend checks en rapportvelden vast.

Open voor Fase 11:

1. `pnpm build`.
2. `pnpm typecheck`.
3. `pnpm test`.
4. `pnpm lint`.
5. Runtime projection editor/admin route smokes.
6. Runtime projection read-only route smokes.
7. Anonymous/game/non-admin denied smokes.
8. CSRF/Origin smokes voor state-changing projection routes.
9. Runtime Projection panel smoke.
10. `pnpm smoke:browser` zodra Playwright/Chromium server-side beschikbaar is.
11. Bevestigen dat geen runtime renderer/game client, concrete gamecontent of assetmutatie plaatsvindt.

Nog open voor latere fases:

- game runtime;
- realtime gateway;
- workers;
- runtime publish-services;
- Nginx live-migratie alleen in aparte migratiefase.
