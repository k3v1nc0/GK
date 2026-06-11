# Current Phase

## Fase

Actieve fase: Fase 6 - node graph core met typed sockets, dropdowns en undo/redo.

## Status

Fase-status: Fase 6 server-side afgerond; klaar voor de volgende fase wanneer Kevin die opent.

Fase 6 bouwt de eerste echte node graph core voor de editor: typed sockets, meerdere input/output poorten, dropdowns, inputvelden, asset/audio picker capabilities, validators, undo/redo, operation history en draft preview. Draft preview publiceert niets naar runtime.

Claude heeft de Fase 6 server-side database/API/editor smoke afgerond. Er zijn geen Fase 6-blockers open.

## Doel

Fase 6 maakt het node canvas inhoudelijk bruikbaar als typed graph editor core zonder concrete gamecontent in runtimecode te zetten.

De fase legt generieke graph-capabilities vast voor:

- graph database/schema contracten;
- typed flow/value sockets;
- `var.string`, `number`, `color`, `asset.reference` en `audio.reference`;
- dropdown, text, number, color, asset-picker en audio-picker field schemas;
- edge validation en editor-readable validation errors;
- graph operations voor add/remove/move/update/connect/disconnect/select;
- undo/redo met history depth 100 per editor session;
- operation log;
- draft preview zonder publish;
- editor-only graph access.

## Bronnen gecontroleerd

Voor deze statusupdate zijn de actuele GitHub-bronnen gebruikt:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase6.md`

Relevante contractbronnen voor latere fases blijven:

- `README/GameBibleNode.json`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/ops/server-layout.md`

## Blijvende fasecontracten

- `README/GameBibleNode.json` is de leidende Game Bible.
- Concrete gamecontent mag alleen uit GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.
- Geen concrete gamecontent in runtimecode.
- Hoofdketen: `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` is bevestigd.
- GLB=4, UI images=0, audio=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- UI/audio blijven latere asset/content gates.
- Apache blijft voorlopig hoofdwebserver.
- Nginx blijft alleen candidate/template voor een aparte latere migratiefase.

## Fase 6 Git-output

Fase 6 commit op main:

- `274bda6b90433656b6f04892dbd61cad4cf648c8`
- `feat: add phase 6 node graph core`

Aangemaakt of bijgewerkt in Fase 6:

- `db/migrations/0002_node_graph_core.sql`
- `packages/schemas/src/node-graph.ts`
- `packages/node-types/src/index.ts`
- `packages/node-engine/src/graph-validation.ts`
- `packages/node-engine/src/graph-history.ts`
- `packages/node-engine/src/draft-preview.ts`
- `apps/api-server/src/editor-graph-routes.ts`
- editor shell/canvas/panels updates
- shared UI contract updates
- `tests/node-graph-core.test.mjs`
- fase-documentatie

## Database/schema contract

Fase 6 database/schema contract:

- `editor_node_graphs`
- `editor_node_graph_nodes`
- `editor_node_graph_edges`
- `editor_node_graph_revisions`
- `editor_node_graph_operation_log`
- `editor_node_graph_draft_state`

Draft-state is per editor session en heeft `history_depth = 100`. Revisions in deze fase zijn draft/editor revisions en hebben `publishes_runtime_output = 0`; draft preview mag niets naar runtime publishen.

## Node graph contract

Fase 6 bevat:

- typed flow sockets;
- typed value sockets;
- value socket types `var.string`, `number`, `color`, `asset.reference` en `audio.reference`;
- dropdown, text, number, color, asset-picker en audio-picker field schemas;
- generieke graph node types zonder concrete gamecontent;
- edge validation voor richting, flow/value matching, value compatibility en max-connections;
- graph operations voor add/remove/move/update/connect/disconnect/select;
- undo/redo met `history depth = 100`;
- operation log;
- draft preview met `publishesRuntimeOutput = false`;
- editor-only graph routecontracten voor graph draft, operation en preview.

## Fase 6 server-side validatie

Claude heeft Fase 6 server-side gevalideerd:

- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 44/44.
- `pnpm lint`: OK.
- `db/migrations/0002_node_graph_core.sql` toegepast op MySQL.
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

## Content- en assetgrens

Niet toegevoegd:

- assets;
- data;
- secrets;
- dummy content;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

Bevestigde Fase 6-input:

- `game.name = Eldoria`: blijft GameBible/contentdata en is niet in runtimecode hard-coded.
- `start zone = Willowmere Workshop`: blijft GameBible/contentdata en is niet in runtimecode hard-coded.
- `history depth = 100 undo/redo acties per editor session`: vastgelegd in het node graph history-contract.

## Open Kevin-input

Geen blokkerende Fase 6-input open.

Latere fases houden hun eigen gates voor GLB-role mapping, UI-assets, audio-assets, concrete content, economy, world settings en runtime services.

## Open Codex-taken buiten Git

Geen Fase 6 Codex-taken open.

Open blijft toekomstwerk voor latere fases:

- toekomstige game runtime, realtime gateway, workers en publish-services pas installeren/starten wanneer hun fase en echte build-output bestaan;
- Nginx blijft candidate; geen Nginx-migratie zonder aparte migratiefase;
- `/usr/bin/node` blijft serverbreed `v18.19.1`; dit is bewust ongemoeid en geen GK-blocker zolang GK via `/opt/gk/node-v22` draait.

## Fasebeoordeling

Fase 6 is klaar.

Afgerond voor deze fase:

- graph schema/migratie bestaat en is toegepast;
- typed sockets en field schemas bestaan;
- graph validation, history en draft preview bestaan;
- editor-only graph routecontracten bestaan;
- Node Canvas is gekoppeld aan graph state en history depth 100;
- tests voor Fase 6 graph core zijn toegevoegd en server-side groen;
- geen generated `dist`, `node_modules`, secrets, assets of data zijn in Git beland;
- geen runtimecode bevat nieuwe concrete gamecontent.

Niet verwarren met volledige toekomstige game-runtime voltooiing: realtime gateway, workers, publish-services en latere game runtime krijgen hun eigen fasegates.

Huidige status: Fase 6 server-side afgerond; klaar voor de volgende fase wanneer Kevin die opent. Fase 7 is nog niet geimplementeerd.
