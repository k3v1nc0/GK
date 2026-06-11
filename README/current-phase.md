# Current Phase

Actieve fase: Fase 6 - node graph core met typed sockets, dropdowns en undo/redo.

Status: Fase 6 server-side afgerond; klaar voor de volgende fase wanneer Kevin die opent.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase6.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/gamebible-node-access.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
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
- `gk-api` is active/enabled via `/opt/gk/node-v22/bin/node`.
- `gk-editor-web` is active/enabled via `/opt/gk/node-v22/bin/node`.
- Editor admin login werkt.
- `/auth/editor/me` geeft `editor_admin`.
- `/editor/graph/draft` werkt met editor session.
- `/editor/graph/operation` werkt met editor session.
- `/editor/graph/preview` werkt met editor session.
- Anonymous/game session krijgt geen editor graph toegang.
- Draft preview publiceert niets naar runtime.
- GameBible save blijft werken.
- Bestaande game-site blijft bereikbaar.
- Blockers: geen.

Graph-tabellen:

- `editor_node_graphs`
- `editor_node_graph_nodes`
- `editor_node_graph_edges`
- `editor_node_graph_revisions`
- `editor_node_graph_operation_log`
- `editor_node_graph_draft_state`

## Bevestigde grenzen

- Apache blijft voorlopig de actieve hoofdwebserver.
- Nginx blijft alleen candidate/template.
- Assetpad: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- GLB=4, UI=0, audio=0.
- Geen assets, data, secrets, dummy content of concrete gamecontent toegevoegd.
- Editor-auth en game-auth zijn strikt gescheiden.
- GameBibleNode browser-save blijft beschermd via editor session en admin-gate.
- Draft preview publiceert niets naar runtime.

## Bevestigde Fase 6-input

- `game.name = Eldoria`
- `start zone = Willowmere Workshop`
- `history depth = 100 undo/redo acties per editor session`

`history depth` is als editor graph-history contract vastgelegd. `game.name` en `start zone` blijven contentdata uit Kevin-input/GameBible/editor-data en zijn niet als runtimecode of hard-coded worldcontent toegevoegd.

## Open aandachtspunten

Geen Fase 6-blockers open.

Open blijft toekomstwerk voor latere fases:

- toekomstige game runtime, realtime gateway, workers en publish-services pas installeren/starten wanneer hun fase en echte build-output bestaan;
- GLB-role mapping, UI-assets, audio-assets, concrete content, economy en world settings blijven latere content gates;
- Nginx blijft candidate; geen Nginx-migratie zonder aparte migratiefase;
- `/usr/bin/node` blijft serverbreed `v18.19.1`; dit is geen GK-blocker zolang GK via `/opt/gk/node-v22` draait.

Fase 7 is nog niet geimplementeerd. Fase 7 mag pas starten wanneer Kevin die fase expliciet opent of een bestaand faseplan die volgende stap aanwijst.
