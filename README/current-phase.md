# Current Phase

Actieve fase: Fase 7 - auto asset/audio library uit assets-map.

Status: Fase 7 Git-basis voorbereid. De asset-library scanner core, editor-only API-contracten, editor panel state, asset-worker scan/polling contract, database-migratie en tests staan klaar in Git. Server-side migratie, echte `/var/www/gk/assets` scan, watcher/polling smoke en runtime/API smoke moeten nog door Codex/Claude op de server worden uitgevoerd.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase7.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`

Dit README-fasebestand blijft de korte fase-index. De inhoudelijke fasebeoordeling staat onder `docs/design/phase-plan/current-phase.md`.

## Gebruik

- Werk aan 1 fase tegelijk.
- Open altijd eerst deze korte fase-index en daarna `docs/design/phase-plan/current-phase.md`.
- Voor content geldt `README/GameBibleNode.json` als leidende Game Bible.
- Concrete gamecontent loopt via `Database > Editor/Node-system > Publish > Runtime Game`, niet via runtime-hardcoding.
- Pas een fase pas naar klaar aan als alle blokkerende input, Codex-taken en checks voor die fase zijn afgerond.

## Laatste status

Fase 1 is klaar.

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft hoofdwebserver, Nginx blijft inactive/candidate, en GK-services draaien via Node 22 onder `/opt/gk/node-v22`.

Fase 3 workspace, Fase 4 database/auth en Fase 5/Fase 5.3 editor-login plus GameBible browser-save zijn server-side gevalideerd.

Fase 6 is server-side afgerond. De node graph core bestaat uit typed sockets, meerdere poorten, dropdown/input field schemas, edge validation, editor graph operations, undo/redo history met 100 acties per editor session, operation log en draft preview zonder publish.

Fase 7 Git-basis is voorbereid:

- `@gk/asset-library` definieert asset records voor `glb`, `ui_image` en `audio`;
- scanner ondersteunt recursive scan, filenames met spaties, hash/metadata waar haalbaar, missing-status en validatie-issues;
- GLB krijgt alleen kandidaat-capability metadata en geen definitieve runtime-role;
- editor asset/audio panel state toont counts, missing/invalid/unassigned/candidate/assigned en houdt audio picker leeg/gated bij audio count 0;
- editor-only API-contracten bestaan voor asset library read en scan trigger;
- database-migratie `0003_asset_library_register.sql` bevat alleen schema, geen echte assetdata;
- asset scan publiceert niets naar Runtime Game en kopieert geen assets naar Git.

## Fase 6 server-side validatie

Fase 6 commit op main:

- `274bda6b90433656b6f04892dbd61cad4cf648c8`
- `feat: add phase 6 node graph core`

Claude heeft server-side bevestigd:

- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 44/44.
- `pnpm lint`: OK.
- `db/migrations/0002_node_graph_core.sql` is toegepast op MySQL.
- Alle 6 graph-tabellen bestaan.
- `gk-api` en `gk-editor-web` zijn active/enabled via `/opt/gk/node-v22/bin/node`.
- Editor admin login, graph draft/operation/preview en GameBible save werken.
- Anonymous/game session krijgt geen editor graph toegang.
- Draft preview publiceert niets naar runtime.
- Blockers: geen.

## Bevestigde grenzen

- Apache blijft voorlopig de actieve hoofdwebserver.
- Nginx blijft alleen candidate/template.
- Assetpad: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- GLB=4, UI=0, audio=0.
- GLB assets hebben nog geen definitieve runtime-role mapping.
- Geen assets, data, secrets, dummy content of concrete gamecontent toegevoegd.
- Editor-auth en game-auth zijn strikt gescheiden.
- GameBibleNode browser-save blijft beschermd via editor session en admin-gate.
- Draft preview en asset scan publiceren niets naar runtime.

## Bevestigde Fase 6-input

- `game.name = Eldoria`
- `start zone = Willowmere Workshop`
- `history depth = 100 undo/redo acties per editor session`

`game.name` en `start zone` blijven contentdata uit Kevin-input/GameBible/editor-data en zijn niet als runtimecode of hard-coded worldcontent toegevoegd.

## Open aandachtspunten

Open Fase 7 Codex/Claude-taken:

- `pnpm install` server-side draaien en workspace lockfile valideren/bijwerken indien nodig.
- `pnpm build`, `pnpm typecheck`, `pnpm test` en `pnpm lint` server-side draaien.
- `db/migrations/0003_asset_library_register.sql` toepassen op MySQL.
- `/editor/assets/library` en `/editor/assets/scan` met editor session testen.
- Anonymous/game session toegang tot asset beheer testen.
- Echte scan op `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` draaien.
- Bevestigen dat GLB=4, UI=0, audio=0 netjes rapporteert.
- Watcher/polling smoke buiten Git doen zonder permanente daemon vanuit Git te starten.

Open blijft toekomstwerk voor latere fases:

- definitieve GLB-role mapping via editor-data/Kevin-keuze;
- UI-assets, audio-assets, concrete content, economy en world settings;
- toekomstige game runtime, realtime gateway, workers en publish-services pas installeren/starten wanneer hun fase en echte build-output bestaan;
- Nginx blijft candidate; geen Nginx-migratie zonder aparte migratiefase.
