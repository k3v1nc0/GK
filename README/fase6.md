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

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies basis variabelen zoals game.name en start zone.
- Bepaal globale editor voorkeuren voor history depth.

## Bevestigde input voor Fase 6

- `game.name`: `Eldoria`
- `start zone`: `Willowmere Workshop`
- `history depth`: 100 undo/redo acties per editor session

Deze input is bevestigd voor Fase 6. `history depth` is in Fase 6 als editor graph-history contract vastgelegd. `game.name` en `start zone` blijven contentdata uit Kevin-input/GameBible/editor-data en zijn niet als runtimecode of hard-coded worldcontent toegevoegd.

## Git-uitwerking Fase 6

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

Fase 6 is in Git voorbereid. Server-side migratie en runtime-smoke moeten nog door Codex worden uitgevoerd voordat de fase server-gevalideerd is.

## Actie voor Codex

- Draai `pnpm install`.
- Draai `pnpm build`.
- Draai `pnpm typecheck`.
- Draai `pnpm test`.
- Draai `pnpm lint`.
- Pas `db/migrations/0002_node_graph_core.sql` toe op MySQL.
- Herstart API/editor.
- Smoke test `/editor/graph/draft`, `/editor/graph/operation` en `/editor/graph/preview` met editor session.
- Bevestig dat game session geen editor graph toegang krijgt.
- Bevestig dat draft preview niets publiceert.

## Prompt voor GK Code Copiloot

```text
Git-regels:
- Werk alleen op main.
- Maak geen branches.
- Maak geen pull request.
- Gebruik zo min mogelijk commits: standaard 1 commit voor deze fase, maximaal 2 als het echt nodig is.
- Commit pas na de beschikbare checks.

Inhoudsregels:
- Voeg geen dummy assets toe.
- Verzin geen definitieve gamecontent.
- Als Kevin-input mist, stop en rapporteer exact wat mist.
- Concrete waardes moeten uit node-data, Game Bible, asset register of editor input komen.
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route of minimap-instelling hard-coded bevatten.


Je werkt aan fase 6: Node graph core met typed sockets, dropdowns en undo/redo.

Doel:
Maak nodes echt zoals een geometry-node systeem: typed sockets, meerdere poorten, dropdowns, inputs, asset/audio pickers, validators, undo/redo en draft preview.

Werk uit:
Implementeer graph tables, nodes, edges, revisions, operation log, node schemas, typed sockets, node field renderer, dropdowns, inputvelden, multi-output/multi-input, variable resolver, history engine en draft preview. Save blijft editor-only.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [x] Nodes/edges schema in migratie.
- [x] Typed sockets.
- [x] Dropdowns en inputvelden.
- [x] Meerdere poorten.
- [x] Ctrl+Z/redo contract en history engine.
- [x] Draft preview publiceert niets.
- [ ] Codex heeft migratie server-side toegepast.
- [ ] Codex heeft `pnpm install/build/typecheck/test/lint` server-side gedraaid.
- [ ] Codex heeft editor/API graph smoke server-side afgerond.

## Testplan

Maak graph met var.string, color, number, asset picker en flow ports. Test verkeerde koppeling en undo/redo.
