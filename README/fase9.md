# Fase 9 - World, camera, lighting, levels/zones en minimap nodes

## Status

Fase 9 Git-basis is voorbereid op `main`.

Fase 9 is nog niet server-side afgerond. Codex/Claude moet de huidige Git-basis nog valideren met build/typecheck/test/lint en editor/API smoke.

Fase 9 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core.

Na `Assets - new` is de asset scan OK:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0.

UI/HUD/minimap/audio assets zijn asset-library candidates, geen hardcoded runtimecontent.

## Vaste regels voor deze fase

- Werk alleen op `main`.
- Geen branch en geen pull request.
- Geen assets toevoegen, wijzigen of kopieren.
- Geen dummy assets of placeholder-content.
- Geen concrete gamecontent hardcoden.
- Geen vaste camera waardes hardcoden.
- Geen vaste light/fog/sky waardes hardcoden.
- Geen vaste minimap layout hardcoden.
- Geen vaste world map hardcoden.
- Geen runtime publish vanuit deze Git-basis.
- Alles loopt via `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode mag alleen engine-capabilities bevatten.

## Doel

Maak world settings volledig node-driven:

- levels/zones;
- spawnpoints;
- camera;
- lighting;
- fog;
- sky;
- day/night;
- minimap layers;
- HUD/minimap asset display rules.

Fase 9 mag Fase 8.1 generated output gebruiken als draft/candidate input, maar mag de procedural core niet opnieuw definieren.

## Git-basis toegevoegd

### World/zone schemas

Engine-contracten zijn toegevoegd voor:

- world settings;
- level;
- zone;
- spawnpoint;
- zone bounds;
- zone transition;
- generated zone reference;
- generated placement reference;
- generated path network reference;
- generated resource distribution reference.

Er is geen echte map data of vaste zone hardcoded. Willowmere Workshop mag alleen als bestaande Kevin/GameBible input worden behandeld, niet als runtimecode.

### Camera schemas/nodes

Node contracts zijn toegevoegd voor:

- `camera.mode`;
- `camera.followTarget`;
- `camera.orbit`;
- `camera.zoom`;
- `camera.bounds`;
- `camera.collision`;
- `camera.transition`.

Camera values moeten uit node-data komen. Runtime mag geen vaste gamecamera afdwingen zonder node-data.

### Lighting/fog/sky schemas/nodes

Node contracts zijn toegevoegd voor:

- `lighting.directional`;
- `lighting.ambient`;
- `lighting.fog`;
- `lighting.sky`;
- `lighting.dayNightCycle`.

Er zijn geen concrete lighting presets toegevoegd.

### Minimap schemas/nodes

Node contracts zijn toegevoegd voor:

- `minimap.view`;
- `minimap.layer`;
- `minimap.marker`;
- `minimap.icon`;
- `minimap.zoneBounds`;
- `minimap.generatedPathLayer`;
- `minimap.generatedResourceLayer`;
- `minimap.generatedSpawnLayer`.

Editor minimap en game minimap mogen verschillen via node-data.

### HUD/UI asset display schemas

Generieke UI asset display contracts zijn toegevoegd voor:

- `asset.reference`;
- natural width/height metadata;
- `displayWidth`;
- `displayHeight`;
- optional min/max width/height;
- `scaleMode`;
- `anchor`;
- `pivot`;
- `opacity`;
- `zIndex`;
- responsive rules;
- `nineSlice` margins.

Belangrijke schaalregel:

- source image natural size mag groot zijn;
- natural size is metadata;
- runtime/editor mag natural size nooit blind als display size gebruiken;
- display size moet via node-data/editor-data komen;
- default values zijn schema/editor hints, geen concrete HUD layout.

Schema hints:

- icon display default: 32x32;
- minimap marker display default: 24x24;
- small status icon default: 24x24;
- HUD bar/frame display size blijft node-data required;
- `nineSlice` is alleen geldig met slice margins uit node-data.

## Node types

Toegevoegd aan de core node registry:

- `gk.world.settings`;
- `gk.world.level`;
- `gk.world.zone`;
- `gk.world.spawnpoint`;
- `gk.world.generatedZoneReference`;
- `gk.world.generatedPlacementReference`;
- `gk.camera.mode`;
- `gk.camera.followTarget`;
- `gk.camera.orbit`;
- `gk.camera.zoom`;
- `gk.camera.bounds`;
- `gk.camera.collision`;
- `gk.camera.transition`;
- `gk.lighting.directional`;
- `gk.lighting.ambient`;
- `gk.lighting.fog`;
- `gk.lighting.sky`;
- `gk.lighting.dayNightCycle`;
- `gk.minimap.view`;
- `gk.minimap.layer`;
- `gk.minimap.marker`;
- `gk.minimap.icon`;
- `gk.minimap.zoneBounds`;
- `gk.minimap.generatedPathLayer`;
- `gk.minimap.generatedResourceLayer`;
- `gk.minimap.generatedSpawnLayer`;
- `gk.ui.assetDisplay`;
- `gk.ui.iconDisplay`;
- `gk.ui.hudFrame`;
- `gk.ui.hudBar`;
- `gk.ui.nineSlice`.

## Editor/API contracts

Editor panel state is voorbereid voor:

- World Panel;
- Zone Panel;
- Camera Panel;
- Lighting Panel;
- Minimap Panel;
- UI Display Inspector.

Editor-only route contracts zijn voorbereid voor:

- `GET /editor/world/settings`;
- `POST /editor/world/validate`;
- `GET /editor/minimap/settings`;
- `POST /editor/minimap/validate`;
- `GET /editor/ui-display/assets`;
- `POST /editor/ui-display/validate`.

State-changing routes vereisen CSRF/Origin protection. Anonymous/game sessions worden geweigerd. De route contracts publiceren niets naar runtime en wijzigen geen assets.

## Validators

Toegevoegd voor:

- data-driven world/zone ids;
- camera, lighting en minimap node-data;
- generated world data die draft/candidate blijft;
- minimap marker source via UI asset.reference of procedural marker source;
- UI display node met displayWidth/displayHeight of responsive rule;
- warning/error wanneer grote source natural size bestaat maar display size ontbreekt;
- `nineSlice` met verplichte slice margins;
- no-runtime-publish gates.

## Tests

Toegevoegd: `tests/phase9-world-camera-minimap.test.mjs`.

Testdekking:

- world/camera/light/minimap/UI node types bestaan;
- values zijn node-data, niet hardcoded runtimecontent;
- Fase 8.1 generated zone/path/resource/placement references blijven candidate input;
- UI display node schaalt grote source images via displayWidth/displayHeight;
- minimap marker display hint is klein en overrideable via node-data;
- missing display size geeft validation issue;
- `nineSlice` zonder margins geeft validation issue;
- editor/game minimap views kunnen verschillen via node-data;
- anonymous/game denied voor editor world/minimap beheer;
- geen runtime publish.

## Open Codex/Claude-taken

Nog server-side valideren:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- editor/API smoke voor world/minimap/UI display contracts;
- bevestigen dat er geen runtime publish of assetmutatie is;
- bevestigen dat anonymous/game sessions geen editor world/minimap beheer krijgen.

## Acceptatiechecklist

- [x] Fase 9 Git-basis gebruikt Fase 8.1 procedural outputs als draft/candidate input waar relevant.
- [x] Camera settings via node contracts.
- [x] Wereldbelichting via node contracts.
- [x] Fog/sky via node contracts.
- [x] Level/zone beheer via node contracts.
- [x] Generated zones kunnen als candidate reference worden gemodelleerd.
- [x] Generated spawn areas kunnen als candidate input worden gemodelleerd.
- [x] Generated path networks kunnen als candidate input worden gemodelleerd.
- [x] Generated resource distributions kunnen als candidate input worden gemodelleerd.
- [x] Generated entity placements kunnen als candidate input worden gemodelleerd.
- [x] Editor minimap en game minimap kunnen verschillen via node-data.
- [x] HUD/UI image candidates blijven node/editor-data.
- [x] Audio candidates blijven node/editor-data.
- [x] Geen hardcoded camera/light/minimap/world/HUD/audio values in Fase 9 Git-basis.
- [x] Geen procedural core opnieuw gedefinieerd.
- [x] Geen runtime publish vanuit draft/preview contracts.
- [ ] Server-side build/typecheck/test/lint bevestigd.
- [ ] Server-side editor/API smoke bevestigd.

## Fasebeoordeling

Fase 9 Git-basis is voorbereid.

Fase 9 is nog niet server-side klaar totdat Codex/Claude de open checks bevestigt.
