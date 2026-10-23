# NODE-02.5 - Ultra-Light Minimap Fog Of War

NODE-02.5 komt voor NODE-03 omdat quests, markers en later combat/loot straks op map-discovery moeten kunnen aansluiten, maar deze fase bewust klein blijft: alleen permanente minimap discovery, geen world-space visibility engine.

## Implementatie

- `Game Minimap HUD` heeft een aparte `Minimap Fog of War` config: enabled, fog color, opacity, cell size, reveal radius, save interval, movement threshold, smooth fog, feather radius, reveal shape, debug overlay en height metadata.
- `Area Definition` heeft `Reveal fog when player enters area` en `Fog reveal padding cells`.
- Serveropslag staat in `player_fog_discovery_cells` met `player_id`, `world_id`, `map_layer`, `cell_key`, `discovery_type`, `discovered_at` en optioneel `source_area_id`.
- De server merge't cells per speler; de client kan geen `playerId` kiezen en is niet de bron van waarheid.
- `/api/game/fog/discovery`:
  - `GET` haalt de eigen discovered cells op en verwerkt spawn/login discovery.
  - `POST` verwerkt discovery vanuit de huidige serverpositie en merge't alleen nieuwe cells.
- De game client tekent fog als tweede 2D canvas over de minimap. Normaal renderen discovered cells als zachte cirkels of afgeronde cells; `hardCells` blijft beschikbaar voor debug/performance-controle. De 3D wereldweergave, shaders en WebGL fog zijn niet aangepast.

## Evidence

- Minimap met fog: de overlay is `gameMinimapFogCanvas` boven de bestaande minimap canvas; onbekende cells worden met `fogColor`/`fogOpacity` gevuld en discovered cells worden met canvas-2D radial gradients of rounded rects uitgesneden.
- Rondlopen maakt cells vrij: de client detecteert nieuwe fog cells uit de spelerpositie en vraagt de server om discovery; de server rekent reveal radius vanaf de serverpositie uit.
- Reload-proof: `GET /api/game/fog/discovery` laadt de persisted set uit `player_fog_discovery_cells`.
- Area Definition proof: server-side area containment verwerkt spawn/login/teleport/movement en onthult alle cells in reveal-enabled areas met padding.
- Per-player proof: de primary key bevat `player_id`; speler A en B hebben gescheiden rows voor dezelfde `world_id/map_layer/cell_key`.
- Data-proof: `map_layer`, `discovery_type` en `source_area_id` zijn alvast geschikt voor later world map, named areas, markers, party/admin/reward flows en dungeon/interior lagen, zonder die systemen nu te bouwen.
- Performance proof: geen raycasting, line-of-sight, terrain occlusion, shader fog of 3D darkness toegevoegd; alleen een throttled 2D canvas overlay met lokale gradients/rounded rects en server-side cell merge.

## Check

- `npm run check` is groen: 35/35 bestanden syntactisch ok.
- Geen extra devserver of alternatieve poort gestart; zichtbare controle blijft op de bestaande `localhost:3001/game/`.
