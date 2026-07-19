# NODE-02 Evidence - Zones Composition

Datum: 2026-07-19

## Geimplementeerd

- NODE-02 authoring datatypes en nodes toegevoegd: Zone Definition, Zone Environment Settings, Zone Gameplay Rules, Area Definition/Output, Location Anchor, Spawn Point, Checkpoint, Zone Link, Discovery Area, Safe Rule Area, Map Marker Definition, Marker Visibility Rule, Entity Assembly, Interaction Component, Quest Target Binding en Zone Output.
- `minimap_bake` ondersteunt zone/ground-inputs, `zoneRef`, zone-bounds source mode en per-zone WebP metadata.
- `game_minimap_hud` ondersteunt `active_zone_registry` naast legacy fixed minimap.
- Symbolindex kent nu zones, areas, spawns, checkpoints, zone links, minimaps, entities en entity components.
- GameProjectCompiler bouwt echte `zones.packages`, `zones.byId`, `runtime.activeZoneId` en `runtime.startSpawnId`.
- Compiler-validatie controleert onder andere 500x500 outdoor zonebounds, exact een `zone_default` spawn per Zone Output, spawn binnen bounds en Area Group parentage.
- Published game readmodel projecteert actieve zone, spawn, ground en minimap uit het GameProject manifest naar `/game/`.
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
SMOKE TEST MISLUKT: ASSERT: forward lookahead bevat de volgende chunk voordat de speler de grens oversteekt
```

Analyse: deze smoke-fail zit in `scripts/smoke-test.js` rond de chunk-streaming helper en raakt files die in NODE-02 niet zijn aangepast. De test verwacht bij x=85 dat chunk `1,0` nog niet actief is, terwijl de huidige `chunkCoordForPosition` x=60 en x=85 al als chunk `1,0` berekent. Dit moet als aparte runtime/chunk-smoke fix worden opgepakt voordat de volledige fase smoke-groen genoemd kan worden.

## Fysieke Controle

- Open `/editor/` en controleer dat de nieuwe Zone/Area/Spawn/Travel/Marker/Entity Assembly nodes in de node library zichtbaar zijn.
- Maak een Zone Definition van 500x500, verbind Environment, Ground, een `zone_default` Spawn Point, Minimap Bake en Zone Output naar Zone Registry.
- Publish en open `/api/game/world`; controleer `gameProject.zones.packages`, `gameProject.zones.byId`, `gameProject.runtime.activeZoneId` en `gameProject.runtime.startSpawnId`.
- Open `/game/`; controleer dat de player spawn uit de zonepackage komt en dat de actieve minimap uit de zone wordt gebruikt wanneer een bake aanwezig is.
- Maak een tweede zone met target spawn en een Zone Link; test `POST /api/game/travel/zone-link` met de link-id en controleer dat `position.zoneId` en `position.spawnId` wijzigen.
