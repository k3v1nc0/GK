# Project Contract

This project has one hard rule that everything else follows from:

**No seeded game content. Ever.**

The engine knows *how* to do things (move a player, follow with a camera, detect
collisions, trigger interactions). It never decides *what* the game contains.
Every concrete value - a world, a ground, a model, a spawn point, a key binding -
is authored in the editor or imported as an asset. A fresh database produces a
game that returns 404 until you publish something real.

## What this means in practice

- The database seeds exactly one node: a single `game_output`. Nothing else.
- The runtime has no built-in controls. Movement and interaction only work once
  you author `keybind` nodes. Click-to-move is a pointer capability, not content.
- Assets are never generated. Image and texture assets are their own thumbnails;
  models, audio and data show a typed icon. No placeholder geometry, no proxy boxes.
- Publishing is gated by validation. You cannot publish an unplayable world.
- The smoke test asserts the 404-before-publish behaviour so a regression that
  seeds content fails CI.
- Nodes moeten een standaard waarde hebben als je ze invoegd in de node-graph, ook als je een waarde input leeg maakt moet de standaard waarde weer terug komen.

## Engine vs content boundary

| Engine (allowed in code) | Content (must come from the editor) |
| --- | --- |
| Top-down follow camera math | Camera pitch, yaw, distance, zoom range |
| Circle collision resolver | Which entities are solid and their radius |
| Click-to-move raycasting | The ground size that bounds movement |
| Key-to-action dispatch | Which key maps to which action |
| Interaction proximity check | Interactable positions, prompts, actions |
| GLB / texture loaders | The actual model and texture files |

If you add a feature, put the *capability* in the engine and expose the *content*
as node fields. Never hardcode a value a designer would want to change.

## Fase 03: canonieke authoring naast Nodes

Sinds Fase 03 zijn er twee bronnen van content. Per domein is er precies één writer. Welke dat is, staat in
de tabel `authoring_cutover` en is zichtbaar in de werkbank onder Publiceren ("Wie beheert wat").

| Domein | Vóór verhuizen | Na verhuizen (finalize) |
| --- | --- | --- |
| Projectnaam en welkomsttekst | Nodes (`game_project_settings.gameName`); nieuwe tekst kan al in de werkbank | Alleen werkbank; `gameName` in Nodes is alleen-lezen, andere projectvelden blijven in Nodes |
| Items (`item_definition`) | Nodes; nieuwe items kunnen al in de werkbank | Alleen werkbank; elk item-node is alleen-lezen, nieuwe item-nodes worden geweigerd |
| Item-pickups (`pickup_spawn` met `pickupKind: item`) | Nodes; nieuwe pickups kunnen al in de werkbank | Alleen werkbank; die nodes zijn alleen-lezen, nieuwe item-pickups in Nodes worden geweigerd |
| Regions en Areas (Fase 04, nieuw: bestaan niet in Nodes) | Alleen werkbank (tab Wereld) | Alleen werkbank. Oude zones blijven in Nodes; een Region kan er met `legacyZoneRef` naar verwijzen |
| Geld-pickups, `pickup_component`, alle andere domeinen | Nodes | Nodes (niet in Fase 03) |

- Een object dat de werkbank al beheert (ook vóór finalize, bijvoorbeeld een item met dezelfde ID) is in Nodes
  meteen alleen-lezen. De graph-repository geeft dan `409 CANONICAL_OWNED` en verwijst naar `/editor/canoniek.html`.
- Verhuizen gaat per domein, in de volgorde project, items, item-pickups. Eerst een rapport (schrijft niets) dat elk
  legacy-object vergelijkt met wat de game nu echt gebruikt. Finalize kan alleen met de graphrevisie uit dat rapport
  (`If-Match`), wordt in de transactie opnieuw gecontroleerd, en alleen bij nul afwijkingen of bewuste acceptatie.
  Er is geen "terug naar Nodes"-knop; terug kan alleen via een backup.
- Canonieke documenten zijn alleen data (schema in `src/shared/authoring/kinds.js`), nooit uitvoerbare code.
  Validatie vult niets stil aan bij het lezen.
- Elke wijziging is een command met revision (If-Match) en requestId. Een command schrijft nooit naar
  `editor_nodes` of `editor_node_edges`.
- Publiceren maakt een immutable build in `storage/builds/<buildId>/` (client.json, server.json, manifest.json)
  en zet daarna in één transactie de releasepointer. `server.json` is nooit via HTTP bereikbaar.
  Builds zitten in de backup en worden bij restore teruggezet; een backup zonder de actieve build is ongeldig.
- De game-server gebruikt altijd de actieve build (één gedeelde wereld, server-authoritative). Een open game-tab
  houdt zijn clientpakket en meldt "Nieuwe inhoud gepubliceerd" tot de speler ververst.
- Een verhuisde legacy-pickup houdt zijn instance-ID, dus wie hem al pakte, krijgt hem niet nog eens.
  Een gearchiveerd item blijft in de catalogus van de server, zodat inventarissen de naam houden.
- De oude backlog in `README/fases/Oude basis/` blijft historisch en niet-normatief.
