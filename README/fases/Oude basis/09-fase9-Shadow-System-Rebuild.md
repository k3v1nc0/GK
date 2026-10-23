# Fase 9.0 - Shadow System Rebuild & Ghost Chunk Group Removal

## Status

Fase 8.9 is niet akkoord.

Kevin heeft live opnieuw bevestigd:

- de extra chunk/ground/debug group is nog steeds zichtbaar in de editor;
- editor shadows zijn niet overal gelijk binnen de chunk group;
- shadows mogen niet flitsen, flikkeren of veranderen op basis van waar Kevin kijkt of wat hij aanklikt;
- in `/game/` bestaan shadows wel, maar zodra chunks erbij komen of verdwijnen verschuift de schaduw achter de character naar een rare state;
- de vorige aanpak heeft veel code toegevoegd, maar de zichtbare problemen niet opgelost.

Daarom is Fase 9.0 geen extra patch op Fase 8.9.

Fase 9.0 is een volledige shadow-system rebuild voor editor en game, plus een harde verwijdering van de extra ghost chunk/debug group.

## Hoofdregel

Codex mag dit niet oplossen met:

- nog meer audits rond het oude shadow-systeem;
- een extra controller bovenop de bestaande controllers;
- extra inputvelden om foute runtime-keuzes te compenseren;
- een workaround waarbij shadows gewoon zwakker of uit worden gezet;
- een cleanup die alleen telt of rapporteert, maar het zichtbare object laat staan;
- een succesclaim omdat `npm run check` en `npm run smoke` groen zijn.

Codex moet eerst het bestaande shadow- en overlay-pad volledig in kaart brengen, daarna het oude shadow-pad verwijderen of isoleren, en daarna een nieuw enkelvoudig shadow-systeem bouwen dat editor en game delen.

## Brononderzoek dat verplicht is

Codex moet voor het bouwen eerst lezen:

- `README/fases/08-6-fase8-6-Editor-Game-Settings-Shadow-Repair.md`
- `README/fases/08-7-fase8-7-Editor-Game-World-Settings-Nodes.md`
- `README/fases/08-8-fase8-8-Stable-Sun-Shadows-Overlay-Removal.md`
- `README/fases/08-9-fase8-9-Ghost-Plane-Shadow-Caster-Repair.md`
- `README/fases/README.md`
- `src/shared/node-types.js`
- `apps/web/public/shared/node-types.js`
- `src/server/publish-service.js`
- `apps/web/public/shared/world-runtime.js`
- `scripts/smoke-test.js`
- `scripts/perf-game.js`
- alle editor UI-code die fields voor `editor_world_settings`, `game_world_settings` of shadow settings rendert

Codex moet in de repo zoeken naar en beoordelen:

- `shadowQuality`
- `shadowMapSize`
- `shadowCameraSize`
- `shadowCameraFar`
- `shadowBias`
- `shadowNormalBias`
- `shadowType`
- `shadowsEnabled`
- `staticPropCastShadows`
- `staticPropReceiveShadows`
- `scatterCastShadows`
- `scatterReceiveShadows`
- `groundReceiveShadows`
- `terrainReceiveShadows`
- `DirectionalLight`
- `DirectionalLightShadow`
- `shadow.camera`
- `shadowMap`
- `stableShadows`
- `shadowCasterAudit`
- `ghostPlaneDiagnostics`
- `removeGhostChunkPlanes`
- `setShadowProxyState`
- `chunkDebugOverlay`
- `terrainEditorOverlay`
- `selectionHelper`
- `transformGuide`
- `removeDuplicateRuntimeGroups`
- `overlayDiagnostics`
- `syncChunkDebugState`
- `renderResident`
- `shadowResident`
- `residentChunks`
- `createInstancedScatterBatch`
- `staticPropShadowOptions`
- `scatterShadowOptions`
- `groundShadowOptions`

Codex moet na dit onderzoek in het fase-resultaat kort opschrijven:

- welke oude shadow entrypoints zijn verwijderd;
- welke oude shadow fields zijn verwijderd of gemigreerd;
- welke oude debug/ghost group bron het extra vlak veroorzaakte;
- welke nieuwe single source of truth nu shadows bestuurt;
- welke live checks Kevin kan doen.

## Extern technisch uitgangspunt

Fase 9.0 volgt deze engine-regels:

- Three.js CSM gebruikt meerdere directional lights/cascades voor large-terrain sun shadows; dat is nuttig voor grote werelden, maar voor GK is Fase 9.0 eerst een stabiele single-shadow foundation tenzij CSM aantoonbaar klein en veilig kan worden toegevoegd.
- Cascaded shadow maps lossen perspective aliasing op door de camera frustum in zones te splitsen, met hogere resolutie dichtbij en lagere resolutie ver weg. Dat is later nuttig, maar verhoogt complexiteit.
- Shadow flicker/shimmer ontstaat vaak door te lage resolutie, te grote shadow frustum, of een shadow projection die per kleine camera/light beweging verschuift.
- Een stabiel directional sun shadow systeem gebruikt een vaste light direction, orthographic bounds, beperkte update-momenten en snapping/quantization van de shadow projection/focus.
- Voor Kevin's huidige probleem is de juiste eerste oplossing: stabiele single directional sun shadow met preset-gedreven parameters, niet een camera-jagende shadow camera.

Gebruikte bronnen voor Codex:

- Three.js CSM docs: `https://threejs.org/docs/pages/CSM.html`
- Three.js CSM example: `https://threejs.org/examples/webgl_shadowmap_csm.html`
- Three-csm README: `https://github.com/StrandedKitty/three-csm`
- Microsoft Learn Cascaded Shadow Maps: `https://learn.microsoft.com/en-us/windows/win32/dxtecharts/cascaded-shadow-maps`
- Three.js issue over DirectionalLight flicker and shadow map size/frustum: `https://github.com/mrdoob/three.js/issues/18521`
- GameDev discussion over texel/grid snapping of shadow projection: `https://gamedev.net/forums/topic/588182-shadow-map-flickering-when-lights-move/4879086/`

## Projectbeslissing

GK krijgt vanaf Fase 9.0 geen losse shadow inputvelden meer in World Settings nodes.

In plaats daarvan:

- `editor_world_settings` krijgt precies één shadow preset dropdown.
- `game_world_settings` krijgt precies één shadow preset dropdown.
- `world_settings` mag geen oude algemene shadow tuning fields meer tonen.
- De dropdown is zichtbaar, begrijpelijk en in gewone taal.
- De concrete getallen achter presets zitten in code als engine defaults, niet als losse nodevelden.

De presets zijn exact:

1. `geen_schaduw`
2. `lichte_schaduw`
3. `middel_schaduw`
4. `hoog_schaduw`
5. `extreem_schaduw`

UI-labels:

- `Geen schaduw`
- `Lichte schaduw`
- `Middel schaduw`
- `Hoog schaduw`
- `Extreem schaduw`

`Geen schaduw` is de enige preset die shadows volledig uitzet.

Alle andere presets zetten shadows aan en verhogen alleen kwaliteit, bereik, map size, caster-dekking en shadow-residency budget van laag naar hoog.

## Verwijderen uit nodes

Codex moet alle losse shadow tuning inputvelden uit de zichtbare node-inspector verwijderen voor:

- `world_settings`
- `editor_world_settings`
- `game_world_settings`

Deze velden mogen niet meer als losse bewerkbare inputs zichtbaar zijn:

- `shadowQuality`
- `shadowMapSize`
- `shadowCameraSize`
- `shadowCameraFar`
- `shadowBias`
- `shadowNormalBias`
- `shadowType`
- `shadowsEnabled`
- `staticPropCastShadows`
- `staticPropReceiveShadows`
- `scatterCastShadows`
- `scatterReceiveShadows`
- `groundReceiveShadows`
- `terrainReceiveShadows`

Codex mag interne read-model waarden houden, maar alleen als afgeleide waarden van de gekozen preset.

Als oude werelden deze velden nog in opgeslagen node values hebben:

- ze mogen niet meer in de inspector verschijnen;
- ze mogen niet meer leidend zijn;
- publish moet ze negeren of eenmalig migreren naar de dichtstbijzijnde preset;
- debug moet melden dat legacy shadow fields genegeerd of gemigreerd zijn.

## Nieuwe preset read-model

Published world data moet een helder shadow blok krijgen:

```js
world.performance.editor.shadow = {
  preset: "middel_schaduw",
  enabled: true,
  mapSize: 1024,
  cameraSize: 80,
  cameraNear: 1,
  cameraFar: 500,
  bias: -0.0003,
  normalBias: 0.04,
  type: "pcf_soft",
  updateMode: "stable_snapped",
  snapWorldUnits: 10,
  focusMode: "editor_world_center_or_selected",
  staticPropsCast: true,
  scatterCast: true,
  terrainReceives: true,
  shadowResidentMarginChunks: 1
}
```

```js
world.performance.game.shadow = {
  preset: "middel_schaduw",
  enabled: true,
  mapSize: 1024,
  cameraSize: 70,
  cameraNear: 1,
  cameraFar: 450,
  bias: -0.0003,
  normalBias: 0.04,
  type: "pcf_soft",
  updateMode: "stable_snapped",
  snapWorldUnits: 10,
  focusMode: "player_or_spawn",
  staticPropsCast: true,
  scatterCast: true,
  terrainReceives: true,
  shadowResidentMarginChunks: 1
}
```

Exact property names mogen aansluiten op bestaande style, maar de betekenis moet gelijk blijven.

## Presetwaarden

Codex moet de definitieve waarden zelf in code vastleggen en documenteren. Startpunt:

### Geen schaduw

Doel:
Alles uit. Snelste mode, geen shadow map, geen shadow casters.

Verplicht gedrag:

- `renderer.shadowMap.enabled = false`
- geen DirectionalLight shadows
- alle content `castShadow = false`
- alle content `receiveShadow = false`
- geen shadow proxies
- geen shadow resident chunks
- debugState meldt `enabled: false`

### Lichte schaduw

Doel:
Goedkoop, bruikbaar op oude laptop, vooral speler/huis/grond dichtbij.

Startwaarden:

- map size: `512`
- camera size editor: `90`
- camera size game: `75`
- far: `350`
- static props cast: `true`
- scatter cast: `false` of alleen dichtbij, tenzij performance goed blijft
- terrain receive: `true`
- shadow resident margin: `0` tot `1`
- update: alleen als snapped focus cell verandert

### Middel schaduw

Doel:
Default voor GK. Stabiel en zichtbaar zonder laptop te slopen.

Startwaarden:

- map size: `1024`
- camera size editor: `100`
- camera size game: `85`
- far: `450`
- static props cast: `true`
- scatter cast: `true`, maar budgeted
- terrain receive: `true`
- shadow resident margin: `1`
- snap: `10` of halve chunk-tile snap als dat stabieler is

### Hoog schaduw

Doel:
Betere vormvaste boom- en huis-schaduwen.

Startwaarden:

- map size: `2048`
- camera size editor: `120`
- camera size game: `100`
- far: `600`
- static props cast: `true`
- scatter cast: `true`
- terrain receive: `true`
- shadow resident margin: `1` tot `2`
- higher shadow caster budget

### Extreem schaduw

Doel:
Inspectie/kwaliteit, niet default voor oude laptop.

Startwaarden:

- map size: `4096` alleen als renderer/GPU dit aankan, anders clamp naar `2048` met diagnostic
- camera size editor: `140`
- camera size game: `120`
- far: `800`
- static props cast: `true`
- scatter cast: `true`
- terrain receive: `true`
- shadow resident margin: `2`
- hogere budgetten, maar nog steeds geen per-frame full rebuild

## Nieuwe runtime-architectuur

Codex moet één nieuwe runtime-eigenaar maken voor shadows, bijvoorbeeld:

- `createGkSunShadowSystem(...)`
- `createSunShadowRuntime(...)`
- of vergelijkbaar passend bij de codebase

Deze nieuwe eigenaar is de enige plek die bepaalt:

- of shadows aan staan;
- welke map size wordt gebruikt;
- welk shadow type wordt gebruikt;
- welke DirectionalLight shadows cast;
- wat de light direction is;
- waar de light target staat;
- wat de orthographic shadow camera bounds zijn;
- wanneer de shadow projection mag updaten;
- welke chunks shadow resident zijn;
- welke objectcategorieën cast/receive krijgen;
- welke debug diagnostics worden gerapporteerd.

Oude verspreide shadow-logica moet verwijderd of vervangen worden.

Niet toegestaan:

- `renderFrame()` die zelf shadow bounds herberekent;
- chunk culling die direct `castShadow` kapot zet zonder shadow system;
- editor orbit target die shadow focus frame-by-frame bepaalt;
- debug overlay of helper objecten die in shadow decisions zitten;
- meerdere helpers die elk eigen shadow presets of defaults hebben.

## Stable sun behavior

De sun direction is stabiel.

Verplicht:

- light direction komt uit preset/default/sun setting, niet uit camera rotation;
- directional light target wordt door het shadow system beheerd;
- shadow camera is orthographic en preset-gedreven;
- focuspunt wordt gesnapt naar een grid;
- kleine camera/player beweging veroorzaakt geen nieuwe shadow projection;
- chunk unload achter de speler veroorzaakt geen shadow jump;
- selectie in editor mag niet de hele wereldschaduw laten verspringen.

Editor focus:

- default: world/content center of actieve authored world bounds;
- bij selectie: alleen gebruiken als dit niet leidt tot visible jump, of met hysteresis;
- camera aim/orbit target mag niet leidend zijn voor elke frame.

Game focus:

- player position als speler bestaat;
- anders spawn;
- anders world center.

## Shadow residency

Render-residency en shadow-residency moeten gescheiden zijn.

Codex moet expliciet modelleren:

- `renderResidentChunks`
- `collisionResidentChunks`
- `shadowResidentChunks`

Regels:

- render resident bepaalt zichtbare objecten;
- collision resident bepaalt collision/interactie;
- shadow resident bepaalt welke objecten nog shadows mogen casten;
- shadow resident mag ruimer zijn dan render resident;
- een chunk die net uit render valt mag geen rare schaduw achter de character veroorzaken;
- shadow resident chunks volgen de gesnapte shadow focus en preset margin.

Als objecten buiten render resident maar binnen shadow resident zijn:

- ze mogen onzichtbaar zijn in de normale pass;
- ze mogen wel een shadow caster/proxy hebben;
- proxies moeten echte objectvorm of goedkope objectvorm volgen, geen CircleGeometry/PlaneGeometry blob;
- proxies mogen niet selecteerbaar zijn;
- proxies mogen niet als game content in debug/object counters verwarren.

## Boom-, huis- en terrainregels

Bomen/scatter:

- `Geen schaduw`: geen scatter shadows.
- `Lichte schaduw`: scatter shadows alleen als performance veilig is of dichtbij.
- `Middel`, `Hoog`, `Extreem`: scatter/tree shadows moeten bestaan en boomachtig blijven.
- Geen ronde blob als vervanging voor boomschaduw.
- InstancedMesh scatter moet correct `castShadow` krijgen.

Huizen/static props:

- huizen/static props casten vanaf `Lichte schaduw`;
- receiveShadow blijft consistent;
- static prop unload mag de zichtbare schaduw niet laten verdwijnen zolang hij binnen shadow resident valt.

Ground/terrain:

- zichtbaar terrain ontvangt shadows bij alle presets behalve `Geen schaduw`;
- chunked terrain receiveShadow mag niet willekeurig uitgaan;
- terrain chunks mogen geen extra ghost plane of tweede full-ground plane achterlaten.

Helpers/debug:

- selection helpers casten nooit shadows;
- transform guides casten nooit shadows;
- chunk overlays casten nooit shadows;
- shadow helpers casten nooit shadows;
- debug planes krijgen `castShadow = false` en `receiveShadow = false`;
- debug objects zijn nooit child van camera.

## Ghost chunk group removal

Fase 9.0 moet de extra chunk group oplossen als root-cause, niet alleen als suspicious plane.

Codex moet bepalen welke van deze bronnen het vlak maakt:

- chunk debug overlay;
- terrain debug overlay;
- old full-ground fallback;
- stale chunked ground group;
- camera-child overlay;
- selection helper;
- transform guide;
- shadow helper;
- duplicated runtime group na `setWorld`;
- restore/rebuild path dat oude groep niet dispose't.

Verplicht:

- er mag exact één runtime content root zijn voor terrain/chunk visuals;
- debug overlay root moet apart zijn en standaard hidden/removed;
- camera mag geen world/chunk/terrain plane children hebben;
- `setWorld()` en editor restore mogen geen dubbele runtime groups achterlaten;
- cleanup moet dispose uitvoeren waar nodig;
- debugState moet de echte root names en UUIDs tonen.

Acceptatie voor ghost group:

```js
window.__GK_EDITOR_RUNTIME.debugState().world.runtimeRoots
window.__GK_EDITOR_RUNTIME.debugState().world.overlayDiagnostics
window.__GK_EDITOR_RUNTIME.debugState().world.ghostPlaneDiagnostics
```

Moet aantonen:

- `cameraChildPlanes = 0`
- `cameraChildOverlayGroups = 0`
- `visibleDebugPlanes = 0` als debug uit staat
- `duplicateRuntimeRoots = 0`
- `extraGroundPlanes = 0`

En Kevin moet met eigen ogen zien:

- in editor geen tweede geel/groen chunkvlak meer onder/achter de echte wereld;
- bij camera draaien blijft dat zo;
- bij object selecteren blijft dat zo;
- bij save/reload blijft dat zo.

## DebugState contract

Editor en game moeten beide rapporteren:

```js
debugState().world.shadowSystem
```

Minimaal:

- `enabled`
- `mode`
- `preset`
- `legacyFieldsIgnored`
- `rendererShadowMapEnabled`
- `shadowMapType`
- `mapSize`
- `cameraSize`
- `cameraNear`
- `cameraFar`
- `bias`
- `normalBias`
- `sunDirection`
- `focusMode`
- `rawFocus`
- `snappedFocus`
- `snapWorldUnits`
- `lastProjectionUpdateReason`
- `projectionUpdateCount`
- `framesSinceProjectionUpdate`
- `renderResidentChunkCount`
- `shadowResidentChunkCount`
- `shadowResidentMarginChunks`
- `casterCounts`
- `receiverCounts`
- `helperCasterCount`
- `debugCasterCount`
- `circleOrPlaneCasterCount`
- `proxyCasterCount`
- `instancedCasterCount`
- `jumpDetected`
- `lastJumpDistance`
- `warnings`

Ook:

```js
debugState().world.runtimeRoots
debugState().world.overlayDiagnostics
debugState().world.ghostPlaneDiagnostics
```

## Editor UI contract

De node-inspector moet duidelijk zijn:

Editor World Settings:

- toont een veld: `Shadow preset`
- options: `Geen schaduw`, `Lichte schaduw`, `Middel schaduw`, `Hoog schaduw`, `Extreem schaduw`
- toont geen losse shadow technical fields

Game World Settings:

- toont een veld: `Shadow preset`
- dezelfde options
- toont geen losse shadow technical fields

World Settings:

- toont geen oude shadow tuning velden
- mag algemene wereldkleur/fog/smooth shading blijven tonen als dat buiten shadow valt

Als Kevin een preset kiest:

- Save Draft bewaart die preset;
- Save To Game publiceert die preset;
- editor runtime gebruikt editor preset;
- game runtime gebruikt game preset;
- debugState toont dezelfde preset.

## Publish/dataflow contract

Codex moet tests toevoegen voor:

- default preset bij nieuwe editor settings node;
- default preset bij nieuwe game settings node;
- legacy shadow fields worden niet zichtbaar en niet leidend;
- save draft houdt preset vast;
- publish schrijft editor/game shadow read-model;
- `Geen schaduw` zet alle shadow afgeleiden uit;
- `Lichte`, `Middel`, `Hoog`, `Extreem` zetten shadows aan en verhogen waarden monotonic;
- unconnected settings nodes worden niet gepubliceerd;
- game gebruikt niet per ongeluk editor preset.

## Runtime tests

Smoke of unit tests moeten bewijzen:

- `Geen schaduw` schakelt renderer shadowMap uit en content cast/receive uit;
- elke niet-off preset schakelt renderer shadowMap aan;
- presetwaarden lopen van licht naar extreem op zonder losse nodevelden;
- helper/debug objects kunnen nooit shadow caster zijn;
- CircleGeometry/PlaneGeometry mag niet als tree/static shadow proxy gebruikt worden;
- chunk unload verandert render-residency maar breekt shadow-residency niet;
- shadow projection update count stijgt niet bij kleine camera jitter;
- projection update gebeurt wel bij setWorld, preset change of snapped focus cell change;
- editor en game hebben aparte mode state maar delen dezelfde shadow engine.

## Browser/perf checks

Codex moet een browser-level check toevoegen of uitbreiden.

Minimaal:

- editor opent met debug overlay uit;
- screenshot of DOM/runtime check bewijst geen extra visible debug plane;
- editor preset `Geen schaduw` geeft no-shadow state;
- editor preset `Middel schaduw` geeft stable shadow state;
- game preset `Middel schaduw` blijft stabiel terwijl chunk resident count verandert;
- browser debugState wordt opgeslagen in test output of console summary.

Als Puppeteer/Chrome in de omgeving stalled:

- Codex mag dat melden;
- maar de fase is dan niet live-akkoord;
- Kevin-live check blijft verplicht.

## Kevin live acceptatie

Kevin moet na implementatie deze checks kunnen doen.

### Editor ghost group

1. Open editor.
2. Debug overlay uit.
3. Kijk vanuit top/angled view.
4. Selecteer objecten.
5. Draai camera.
6. Save/reload.

Akkoord alleen als:

- geen extra geel/groen chunkvlak zichtbaar is;
- geen tweede world/ground plane onder de echte wereld hangt;
- selectie maakt geen extra plane zichtbaar;
- debugState meldt geen camera-child planes of duplicate runtime roots.

### Editor shadows

1. Kies `Geen schaduw`.
2. Controleer dat alles shadowloos is.
3. Kies `Lichte schaduw`.
4. Kies `Middel schaduw`.
5. Kies `Hoog schaduw`.
6. Kies `Extreem schaduw`.
7. Kijk naar dezelfde bomen/huizen vanuit verschillende camera-richtingen.
8. Klik verschillende objecten aan.

Akkoord alleen als:

- dezelfde chunk group consistent shadow coverage houdt;
- shadows niet flitsen of flikkeren bij klikken;
- shadows niet veranderen omdat de camera ergens anders naar kijkt;
- hogere presets zichtbaar betere of ruimere schaduw geven;
- `Geen schaduw` echt alles uitzet.

### Game shadows

1. Open `/game/`.
2. Loop door chunkgrenzen.
3. Kijk naar schaduwen achter/naast de character.
4. Laat chunks erbij komen en verdwijnen.

Akkoord alleen als:

- schaduw achter de character niet ineens rare vormen krijgt;
- chunk unload/load geen zichtbare shadow jump veroorzaakt;
- bomen houden boomachtige shadows;
- huizen/static props houden shadows binnen shadow resident range;
- performance blijft acceptabel op middel preset.

## Niet akkoord als

Fase 9.0 is niet akkoord als:

- het extra chunkvlak nog zichtbaar is;
- er nog losse shadow inputvelden in nodes zichtbaar zijn;
- Codex alleen oude 8.9 helpers uitbreidt;
- shadows nog afhangen van camera aim;
- shadows flikkeren bij objectselectie;
- shadows verspringen bij chunk unload/load;
- boomschaduwen ronde blob/circle shadows blijven;
- game en editor ieder een ander shadow-systeem hebben;
- `Geen schaduw` niet echt alles uitzet;
- `Middel` of hoger geen huizen/static prop shadows geeft;
- browser/live check ontbreekt en Kevin het probleem nog ziet.

## Verwachte bestandswijzigingen

Waarschijnlijk geraakt:

- `src/shared/node-types.js`
- `apps/web/public/shared/node-types.js`
- `src/server/publish-service.js`
- editor inspector/UI code
- `apps/web/public/shared/world-runtime.js`
- `scripts/smoke-test.js`
- `scripts/perf-game.js`
- `README/fases/09-fase9-Shadow-System-Rebuild.md`
- `README/fases/README.md`

Codex mag meer bestanden raken als het onderzoek bewijst dat de shadow fields of overlay roots elders zitten, maar moet dat uitleggen.

## Implementatievolgorde

1. Onderzoek en map alle huidige shadow/overlay entrypoints.
2. Schrijf in de fase-output welke oude paden verwijderd worden.
3. Verwijder zichtbare losse shadow inputvelden uit node schema/UI.
4. Voeg de nieuwe shadow preset enum toe.
5. Bouw publish/read-model uit presets.
6. Verwijder of neutraliseer oude runtime shadow controllers/helpers.
7. Bouw één nieuw shared editor/game sun shadow system.
8. Bouw shadow-residency opnieuw op vanuit dit systeem.
9. Los ghost chunk group root-cause op.
10. Voeg debugState contract toe.
11. Voeg smoke/publish/runtime tests toe.
12. Voeg browser/perf checks toe.
13. Documenteer exact wat Kevin live moet controleren.

## Eindrapport dat Codex moet geven

Codex moet in het eindantwoord melden:

- welke oude shadow velden zijn verwijderd;
- welke nieuwe preset dropdowns bestaan;
- welke oude runtime shadow paden zijn verwijderd;
- waar de nieuwe single shadow system eigenaar staat;
- hoe ghost chunk group root-cause is opgelost;
- welke tests groen zijn;
- of browser/perf check echt gelukt is;
- welke Kevin live checks nog verplicht zijn;
- waarom dit geen pleister bovenop 8.9 is.

## Regie-oordeel

Deze fase is pas inhoudelijk gezond als Kevin visueel kan bevestigen:

- editor heeft geen extra chunk group meer;
- editor shadows blijven gelijk binnen de chunk group;
- game shadows blijven stabiel bij chunk load/unload;
- de node UI is simpeler en begrijpelijker;
- presets werken zoals gewone software: uit, licht, middel, hoog, extreem.

Als één van deze punten faalt, is Fase 9.0 niet akkoord, ook niet met groene checks.
