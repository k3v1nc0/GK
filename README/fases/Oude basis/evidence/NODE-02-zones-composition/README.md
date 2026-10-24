# NODE-02 Evidence - Zones Composition

Datum: 2026-07-19

## Geimplementeerd

- NODE-02 authoring datatypes en nodes toegevoegd: Zone Definition, Zone Environment Settings, Zone Gameplay Rules, Area Definition/Output, Location Anchor, Spawn Point, Checkpoint, Zone Link, Discovery Area, Safe Rule Area, Map Marker Definition, Marker Visibility Rule, Entity Assembly, Interaction Component, Quest Target Binding en Zone Output.
- `minimap_bake` ondersteunt zone/ground-inputs, `zoneRef`, zone-bounds source mode en per-zone WebP metadata.
- `game_minimap_hud` ondersteunt `active_zone_registry` naast legacy fixed minimap.
- Symbolindex kent nu zones, areas, spawns, checkpoints, zone links, minimaps, entities en entity components.
- GameProjectCompiler bouwt echte `zones.packages`, `zones.byId`, `runtime.activeZoneId` en `runtime.startSpawnId`.
- Compiler-validatie controleert onder andere 500x500 outdoor zonebounds, exact een `zone_default` spawn per Zone Output, spawn binnen bounds en Area Group parentage.
- Published game readmodel projecteert actieve zone, spawn, ground, minimap, camera, player, lights en GLB model entities uit het GameProject manifest naar `/game/`.
- Zone Group editing toont `Group Output` nu fysiek in de group, zodat `Zone Output.zonePackage -> Group Output.zonePkg -> Zone Registry.zonePackage` controleerbaar te verbinden is.
- MMO/player state heeft persistente `current_zone_id`, `current_spawn_id` en `active_checkpoint_id`.
- Server-authoritative travel endpoint toegevoegd: `POST /api/game/travel/zone-link`.

## Verificatie

Groen:

```text
npm test
15 tests passed
```

```text
npm run check
35/35 bestanden syntactisch ok
```

Rood / open:

```text
npm run smoke
EDGE FAIL {
  fromNodeId: 'node_keybind_da392f6f',
  fromPort: 'keybind',
  toNodeId: 'node_output',
  toPort: 'keybinds',
  status: 400,
  body: '{"ok":false,"message":"Game Output publiceert alleen Game Project. Verbind World Assembly.gameProject naar Game Output.gameProject; routeer keybinds eerst naar World Assembly of de passende gespecialiseerde output."}'
}
SMOKE TEST MISLUKT: ASSERT: edge keybind -> keybinds
```

Analyse: de eerdere chunk-smoke verwachtingen zijn aangepast aan de actuele `chunkWorldWidth` berekening, en de oude `model_entity -> Game Output.entities` assert is vervangen door het NODE-01 gedrag. De resterende rode smoke is een oude smoke-route: `scripts/smoke-test.js` probeert nog direct naar deprecated `Game Output.keybinds` te verbinden. De backend weigert dat terecht sinds de NODE-01 hard cutover: normale authoring mag alleen `World Assembly.gameProject -> Game Output.gameProject`. De latere smoke-sectie bevat meer van zulke legacy directe `Game Output` aansluitingen voor world/ground/camera/lights/player/spawn/entities/terrain/collision/ui/chunkLoading/minimap. Dus: runtime smoke is nog niet groen; NODE-03 blijft geblokkeerd totdat die smoke-flow volledig naar de Game Project route is omgezet.

## Fysieke Controle

- `editor-api-proof.json`: API-seed via live editor endpoints, met Zone Group, Area Group, 500x500 Zone, `spawn.node02.default`, `zone_output -> group_output -> zone_registry`, publish-resultaat en drag position proof.
- `editor-native-drag-node02-proof.json`: native Puppeteer mouse-drag in de live editor; Zone Group card bewoog van `left: 500, top: 429` naar `left: 580, top: 481`, met `pageErrors: []`.
- `api-game-world.json`: volledige `/api/game/world` response na publish. Bevat `gameProject.zones.packages`, `gameProject.zones.byId`, `runtime.activeZoneId`, `runtime.startSpawnId`, `ground`, `camera`, `player`, `lights`, `entities` en GLB assets.
- `browser-proof-node02-demo.json`: Puppeteer bewijs voor `/editor/` en `/game/`. `pageErrors: []`; node library vindt Zone/Spawn/Entity/Minimap nodes; Zone Group toont `Group Output`; `/game/` start met `activeZoneId: zone.node02.demo` en `spawn.node02.default`.
- Screenshots:
  - `editor-open-node02-demo.png`
  - `editor-zone-group-open-node02-demo.png`
  - `editor-native-drag-node02-demo.png`
  - `game-open-node02-demo.png`
