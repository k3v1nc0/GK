# Fase 6 - Node graph core met typed sockets, dropdowns en undo/redo

## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- Alles draait eerst op 1 eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- GK Code Copiloot maakt geen branches en geen pull requests.
- GK Code Copiloot gebruikt zo min mogelijk commits: standaard 1 commit per fase, maximaal 2 als het echt nodig is.
- Codex doet serverwerk buiten Git: OS, MySQL, Redis, Nginx, systemd, secrets, rechten, builds, runtime checks en lokale scans.
- Concrete gamecontent hoort niet in runtimecode.
- Alles wat jij maakt, speelt of instelt loopt via Database > Editor/Node-system > Publish > Runtime Game.
- De code mag alleen engine-capabilities bevatten: schemas, node types, validators, renderer/audio/protocol primitives en vaste socket types.
- Waardes zoals camera, licht, geld, prijzen, levels, NPC routes, NPC taken, dialogen, quests, minimap lagen, audio en HUD instellingen moeten node-data zijn.
- 3D wereldobjecten gebruiken jouw eigen bestaande of door jou gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden ook via nodes gekozen en ingesteld.
- De AI mag geen dummy assets, nepmodellen, tijdelijke vervangers, definitieve namen of definitieve verhaalcontent verzinnen.
- Als verplichte Kevin-input mist, stopt de fase met een duidelijke lijst ontbrekende items.
- Maak geen losse backupbestanden, geen tijdelijke markdown-dumps en geen extra README-bestanden die niet blijvend onderhouden worden.

## Doel van de fase

Maak nodes echt zoals een geometry-node systeem: typed sockets, meerdere poorten, dropdowns, inputs, asset/audio pickers, validators, undo/redo en draft preview.

## Bevestigde input voor Fase 6

- `game.name`: `Eldoria`
- `start zone`: `Willowmere Workshop`
- `history depth`: 100 undo/redo acties per editor session

Deze input is bevestigd voor Fase 6. `history depth` is in Fase 6 als editor graph-history contract vastgelegd. `game.name` en `start zone` blijven contentdata uit Kevin-input/GameBible/editor-data en zijn niet als runtimecode of hard-coded worldcontent toegevoegd.

## Git-uitwerking Fase 6

Fase 6 commit op main:

- `274bda6b90433656b6f04892dbd61cad4cf648c8`
- `feat: add phase 6 node graph core`

Aangemaakt of bijgewerkt:

- graph database schema voor graphs, nodes, edges, revisions, operation log en editor draft state;
- typed socket schemas voor flow en value sockets;
- value socket types: `var.string`, `number`, `color`, `asset.reference`, `audio.reference`;
- field schemas voor dropdown, text, number, color, asset picker en audio picker;
- generieke graph node types zonder concrete gamecontent;
- edge validation voor richting, socket type matching, value compatibility en max-connection gates;
- graph operations voor add/remove/move/update/connect/disconnect/select;
- undo/redo met `history depth = 100`;
- operation log;
- draft preview met `publishesRuntimeOutput = false`;
- editor-only API routecontracten voor graph draft, operation en preview;
- Node Canvas contract gekoppeld aan graph state;
- tests voor graph core, validation, history, draft preview en auth boundary.

Fase 6 is in Git voorbereid en server-side gevalideerd. Claude heeft de database migration, pnpm checks en editor/API graph smoke afgerond.

## Server-side validatie

- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 44/44.
- `pnpm lint`: OK.
- `db/migrations/0002_node_graph_core.sql` toegepast op MySQL.
- Alle 6 graph-tabellen bestaan.
- `gk-api` en `gk-editor-web` zijn active/enabled via `/opt/gk/node-v22/bin/node`.
- Editor admin login werkt.
- `/auth/editor/me` geeft `editor_admin`.
- `/editor/graph/draft` werkt met editor session.
- `/editor/graph/operation` werkt met editor session.
- `/editor/graph/preview` werkt met editor session.
- Anonymous/game session krijgt geen editor graph toegang.
- Draft preview publiceert niets.
- GameBible save blijft werken.
- Bestaande game-site blijft bereikbaar.
- Blockers: geen.

## Acceptatiechecklist

- [x] Nodes/edges schema in migratie.
- [x] Typed sockets.
- [x] Dropdowns en inputvelden.
- [x] Meerdere poorten.
- [x] Ctrl+Z/redo contract en history engine.
- [x] Draft preview publiceert niets.
- [x] Codex heeft migratie server-side toegepast.
- [x] Codex heeft `pnpm install/build/typecheck/test/lint` server-side gedraaid.
- [x] Codex heeft editor/API graph smoke server-side afgerond.

## Status

Fase 6 is klaar. Fase 7 is nog niet geimplementeerd en mag pas starten wanneer Kevin die fase expliciet opent of een bestaand faseplan die volgende stap aanwijst.

## Testplan voor regressies

Maak graph met var.string, color, number, asset picker en flow ports. Test verkeerde koppeling, undo/redo, editor-only graph routes en dat draft preview niets publiceert.
