# Server Layout - Fase 2

## Status

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd.

Fase 7 asset library is server-side gevalideerd.

Fase 8 entity/component core is server-side gevalideerd.

Fase 8.1 procedural generation core is server-side gevalideerd en klaar.

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) is de asset refresh server-side uitgevoerd en is de asset scan OK met GLB=4, UI images=37, audio files=21, invalid=0 en missing=0.

Fase 9 world/camera/lighting/minimap/UI display is server-side afgerond en klaar. Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.
- Procedural generation output blijft draft/preview/bake data totdat een latere publish-flow expliciet publiceert.
- UI/audio assets blijven asset-library candidates totdat editor/node-data of Kevin-input ze expliciet kiest.
- Fase 9 publiceert niets naar runtime.

## Bevestigde paden

| Pad of env | Status | Opmerking |
|---|---|---|
| `/var/www/gk` | Bevestigd | Basis voor de eerste single-server omgeving. |
| `/var/www/gk/assets` | Bevestigd | Server assetbron. |
| `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` | Bevestigd | Door Codex buiten Git gezet of bevestigd. |
| `/opt/gk/node-v22/bin/node` | Bevestigd | Actieve Node runtime voor `gk-api` en `gk-editor-web`. |

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

## Procedural generation status

Fase 8.1 server-side verificatie is afgerond:

- procedural contracts en validators;
- deterministic random utility;
- procedural node types;
- editor-only procedural API contracts;
- Procedural Generation Panel state;
- migratie `0005_procedural_generation_core.sql`;
- determinism, draft-only output, generated entity/asset/audio gates en editor-only access.

Bevestigd:

- `pnpm install/build/typecheck/test/lint`;
- migratie `0005_procedural_generation_core.sql` toegepast;
- procedural API/editor smoke;
- no runtime publish;
- no asset copy to Git;
- anonymous/game session krijgt geen procedural editor beheer.

## Fase 9 server-side status

Fase 9 voegt world/camera/lighting/minimap/UI display contracts toe in Git:

- schema contracts;
- validators;
- typed sockets;
- node types;
- editor panel state;
- editor-only route contracts;
- tests;
- docs.

Server-side verificatie is afgerond en klaar.

Bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 86/86 tests pass;
- `pnpm lint`: OK;
- `gk-api` herstart: OK;
- `gk-editor-web` herstart: OK;
- services active/enabled: OK;
- beide services draaien via `/opt/gk/node-v22/bin/node`;
- `/editor`: OK;
- editor login: OK;
- `/auth/editor/me`: OK, `editor_admin`;
- Fase 9 route smokes: OK;
- anonymous denied: OK, 401 en niet 404;
- game smoke-scope denied: OK, 403 en niet 404;
- editor panels: OK, inclusief World Panel, Zone Panel, Camera Panel, Lighting Panel, Minimap Panel en UI Display Inspector;
- UI scaling validation: OK;
- no-runtime-publish: OK;
- no-asset-mutation: OK;
- GameBible save: OK via testdekking;
- game-site reachable: OK;
- worktree schoon;
- blockers: geen.

Fase 9 route contracts:

- `GET /editor/world/settings`;
- `POST /editor/world/validate`;
- `GET /editor/minimap/settings`;
- `POST /editor/minimap/validate`;
- `GET /editor/ui-display/assets`;
- `POST /editor/ui-display/validate`.

State-changing route contracts blijven CSRF/Origin beschermd. Anonymous/game sessions moeten denied blijven.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Assets mogen alleen via een gecontroleerd publiek pad worden geserveerd dat naar `/var/www/gk/assets` wijst. Procedural generated draft/bake data en Fase 9 world/minimap/UI display drafts mogen niet publiek worden geserveerd alsof het runtimecontent is.

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

## Secrets en env

Echte serverwaarden horen buiten Git, bijvoorbeeld in:

- `/etc/gk/gk.env`;
- een door Codex beheerde secret store of serverconfig.

Git mag alleen veilige examples bevatten. Geen Fase 9 wijziging mag secrets toevoegen.

## Codex/Claude serverchecks

Afgerond:

1. Runtime directories, user/group, env, MySQL, Redis, Apache-hardening en systemd templates server-side gevalideerd.
2. Fase 7 install/build/typecheck/test/lint, migratie, asset scan en route smoke afgerond.
3. Fase 8 install/build/typecheck/test/lint, migratie, entity routes en runtime gates afgerond.
4. Fase 8.1 install/build/typecheck/test/lint, migratie, procedural smoke en no-runtime-publish/no-asset-copy checks afgerond.
5. Asset refresh na `Assets - new` uitgevoerd en scan OK met GLB=4, UI images=37, audio files=21, invalid=0, missing=0.
6. Fase 9 build/typecheck/test/lint afgerond.
7. Fase 9 editor/API smoke, panel smoke, auth-deny smoke, UI scaling validation, no-runtime-publish en no-asset-mutation afgerond.

Nog open voor latere fases:

- game runtime;
- realtime gateway;
- workers;
- publish-services;
- Nginx live-migratie alleen in aparte migratiefase;
- Fase 10 pas openen wanneer Kevin die fase start.
