# Fase 2 - Wereldbouwer, Regions, Areas, muziek en PlayPreview

**Status:** definitief implementatiecontract, nog niet geimplementeerd  
**Datum:** 2026-10-22  
**Repo-basis:** `main` op `797431bcdb7fe406bab7a335115b87c428352af0`  
**Doelpad:** `README/fases/MMORPG-basis/2 Wereldbouwer-regions-areas-muziek-PlayPreview.md`  
**Vereiste voorganger:** `README/fases/MMORPG-basis/1 Canonieke authoringkern en node-cutover.md`  

---

## 0. Normatieve positie

Dit document erft alle invarianten, transactieregels, ID-regels, canonical-JSON-regels, concurrencyregels, buildregels en cutoverregels uit Fase 1. Bij tegenspraak wint Fase 1 voor de authoringkern en dit document voor de hier nieuw gedefinieerde werelddomeinen.

Fase 2 maakt **een zichtbare, naadloze World**. `Region`, `Area` en `Cell` zijn interne en bewerkbare structuur, geen terugkeer naar losse levels of een nodecanvas:

- Kevin ziet een doorlopende wereld in dezelfde viewport.
- Een Region is een grote, niet-overlappende wereldverdeling voor ownership, basisomgeving en streamingdiagnostiek.
- Een Area is een benoemd, eventueel overlappend volume binnen exact een Region voor sfeer, muziek, ambience, kaartbetekenis en latere gameplayregels.
- Een Cell is een door de compiler afgeleide streamingeenheid. Kevin maakt of bedraadt geen Cells.
- De Werkbank en Instellingen schrijven canonical documents; zij maken geen nodes, Groups, edges of verborgen graphpakketjes.
- PlayPreview gebruikt een immutable draftbuild en een afzonderlijke sandboxstate. Previewacties schrijven nooit authoring-, echte player-, inventory-, quest- of economystate.

### 0.1 Eerlijke grens

Deze fase levert een schaalbare wereldpartitionering, echte gestreamde worldcontent, region-/area-audio en een veilige Previewloop. Zij levert nog geen volledige MMO-serverinterest, terrain-LOD-generator, weather simulation, gevecht, quests of character select. De contracten laten die systemen later aanhaken zonder de kern te vervangen.

### 0.2 Normatieve taal

**MOET**, **MAG NIET**, **BEHOORT**, **MAG** en **OPTIONEEL** hebben dezelfde betekenis als in Fase 1. Voorbeelden zijn niet normatief tenzij er uitdrukkelijk `exact` bij staat.

---

## 1. Bewezen uitgangssituatie

Op repo-basis `797431b` is het volgende bewezen:

- `zone_definition` bewaart globale `originX/Y/Z`, `width`, `depth`, `minY` en `maxY`.
- Outdoor legacy Zones worden door de compiler nog op exact `500 x 500` afgedwongen.
- `chunk_grid_definition` is vastgezet op `14 x 14`, maximaal `81` geladen chunks en een `9 x 9` window.
- `area_definition` ondersteunt box, circle en polygon, maar polygonpunten zijn ongefilterde JSON.
- `zone_environment_settings` en `area_environment_override` bevatten muziek-/ambiencerefs, maar repositoryonderzoek vond geen bewezen Web Audio-runtimeconsumer.
- `music_track`, `music_playlist` en `audio_event` worden door de Catalog Compiler gepubliceerd; playlistweights en audio-assets zijn nog raw JSON.
- `world-runtime.js` bevat al omvangrijke chunk-residency, shadow- en world-rebuildlogica, maar geen canonieke Region/Area-authority en geen complete audiomixer.
- `setWorld()` herbouwt runtimecontent. Dat is geen veilige definitie van instant Editor -> PlayPreview -> Editor.
- Fase 1 definieert al `project_settings.startRegionRef`, canonical builds, release pointers en `placed_entity` versie 1. Fase 2 moet daarop uitbreiden, niet ernaast bouwen.

Deze legacycontracten zijn importbronnen. Zij zijn niet automatisch het nieuwe ontwerp.

---

## 2. Fasedoel, scope en niet-doelen

### 2.1 Fasedoel

Fase 2 is geslaagd wanneer Kevin zonder Nodes:

1. een World kan openen;
2. minimaal twee aangrenzende Regions kan tekenen en benoemen;
3. Areas als box, cylinder en polygon kan tekenen/bewerken;
4. echte modellen in Regions kan plaatsen en over Regiongrenzen kan lopen;
5. zichtbaar kan zien welke Cells required, prefetched en resident zijn;
6. muziek en ambience per Region en Area kan kiezen en grensovergangen kan horen;
7. met een knop dezelfde draftbuild in PlayPreview kan betreden;
8. kan bewegen, streamen en audio testen;
9. Preview kan verlaten met exact herstel van editorcamera, selectie en gereedschap;
10. kan aantonen dat Preview geen authoring- of echte spelerstate heeft gewijzigd.

### 2.2 Canonical domains

Fase 2 maakt deze domains canonical:

| Domain key | Kinds |
| --- | --- |
| `world.structure` | `world_definition`, `region_definition`, `area_definition`, `surface_patch`, `spawn_point` |
| `presentation.audio` | `music_track`, `music_playlist`, `audio_event` |
| `world.placements` | migratie van `placed_entity` versie 1 naar versie 2 met Regionownership en fixed spatial position |

### 2.3 In scope

- Een singleton World-document.
- Regions met rechthoekige worldbounds en basisomgeving.
- Areas met getypeerde 3D-volumes.
- Vlakke canonical surface patches voor zichtbare grond, materiaal en walkable collision.
- Een globale, sparse Cell-grid en compile-time spatial index.
- Cellfragmenten in immutable draft/published builds.
- Streaming scheduler, load/unload, cancellation, budgets en diagnostics.
- Fixed-point canonical spatial opslag plus floating render origin.
- Music tracks, typed playlists, audio events, ambience en spatial emitters.
- Region-/Area-membership, overlappriority, hysterese en crossfades.
- Editor World Builder voor tekenen, selecteren, verplaatsen en menselijke relaties.
- Een gepinde, geïsoleerde PlayPreview-sandbox in dezelfde applicatie/canvas.
- Legacy import, shadow parity waar semantisch mogelijk en expliciete afwijkingsrapporten waar partitionering verandert.

### 2.4 Buiten scope

- Procedurele terrain-/biomegeneratie.
- Navmesh baking en pathfinding.
- MMO-sharding, server handoff en echte network interest replication.
- Dynamisch weer en dag/nacht-simulatie; alleen refs/selectorcontext mogen voorbereid zijn.
- Combat music door gevechtsstate; de playlistref mag bestaan maar wordt pas geconsumeerd wanneer combat canonical is.
- Portals tussen afzonderlijke instances/shards.
- Spraak, lip-sync en cinematics.
- Volledige spelercharacter-authoring; Preview gebruikt de in sectie 16 vastgelegde camera/controller.
- Audio-effectchains, reverb convolution en occlusion.
- Het fysiek verwijderen van legacy graphdata.

---

## 3. Onbreekbare invarianten

| ID | Invariant |
| --- | --- |
| W-01 | Er is per project exact een actief `world_definition`. |
| W-02 | Authoring spatial values worden als veilige integer millimeters opgeslagen; de UI toont meters. |
| W-03 | Canonical worldpositie is `Region origin + lokale positie`; renderpositie is `worldpositie - renderOrigin`. |
| W-04 | Regions overlappen niet in hun XZ-interieur. Gedeelde randen zijn toegestaan. |
| W-05 | Regionbounds zijn half-open: minimum inclusief, maximum exclusief. Hierdoor heeft ieder geldig XZ-punt maximaal een Regionowner. |
| W-06 | Iedere actieve `placed_entity` versie 2 en ieder actief `spawn_point` verwijst naar exact een actieve Region en ligt binnen die Region. |
| W-07 | Areas behoren aan exact een Region, blijven binnen die Region en mogen elkaar overlappen. |
| W-08 | Cells zijn afgeleid en hebben geen authoringdocument, displaynaam of handmatige lifecycle. |
| W-09 | Een Cellkey wordt uitsluitend met integer floor division berekend; negatieve coördinaten werken symmetrisch. |
| W-10 | Compile-uitvoer en Cellfragmenten zijn deterministisch gesorteerd en afzonderlijk gehasht. |
| W-11 | De runtime activeert nooit een fragment waarvan build-ID, key of hash niet bij het actieve manifest past. |
| W-12 | De speler mag een niet-residente required Cell niet betreden. |
| W-13 | Load/unloadwerk respecteert frame- en concurrencybudgetten; geen volledige World rebuild per Cellovergang. |
| W-14 | Een asset wordt per runtimecontext eenmaal gedecodeerd en via reference counting gedeeld. |
| W-15 | Area-overlapresolutie is deterministisch en onafhankelijk van array-, DB- of loadvolgorde. |
| W-16 | Muziekkeuze volgt uitsluitend gepubliceerde refs en de selectorregels uit dit document. |
| W-17 | Een onderbroken crossfade begint vanaf de op dat moment hoorbare gains; hij springt niet terug naar 0 of 1. |
| W-18 | Er bestaat per runtimecontext exact een AudioContext en exact een listener. |
| W-19 | Browser autoplayblokkade wordt als `audio_locked` behandeld, niet als ontbrekende content. |
| W-20 | Preview is aan exact een immutable draft build-ID en source workspace revision gepind. |
| W-21 | Tijdens Preview zijn authoringcommands in die browser disabled en server-side niet via previewroutes bereikbaar. |
| W-22 | Previewstate gebruikt nooit echte player-/economy-/questtabellen. |
| W-23 | Preview teardown annuleert input, fetches, timers, audio, listeners en preview-only objects voordat Editor wordt hersteld. |
| W-24 | Editorcamera, selectie, gizmo, panels en zichtbare Cellset zijn viewstate, geen canonical content. |
| W-25 | Een compile-, stream-, audio- of previewfout laat de laatst geldige authoringstate en published build ongemoeid. |
| W-26 | Legacy en canonical zijn nooit tegelijk writer of actieve compilebron voor hetzelfde domain. |
| W-27 | Geen Fase-2-formulier vereist raw IDs, JSON, Nodes of handmatig Cellbeheer. |
| W-28 | Dezelfde Region-/Area-membershiplibrary draait in compiler tests, Editor Preview en game runtime. |
| W-29 | Dezelfde Cellmanifest-/fragmentcontracten worden door Draft Preview en published game gebruikt. |
| W-30 | Fase 2 is niet compleet met alleen schemas of een overlay; echte streaming, echte audio en de complete Previewlifecycle moeten zichtbaar werken. |
| W-31 | Een Region krijgt geen impliciete runtimegrond; iedere zichtbare/walkable surface komt uit een canonical `surface_patch`. |

---

## 4. Architectuurblueprint

```text
Werkbank / Instellingen / Viewport
  | canonical commands + If-Match
  v
Fase-1 AuthoringCommandService
  |
  +--> world.structure documents
  +--> world.placements documents v2
  +--> presentation.audio documents
  |
  v
CanonicalInputAdapter
  |
  v
WorldCompiler
  +--> root world manifest
  +--> deterministic Cell fragments
  +--> spatial index
  +--> audio catalog
  |
  v
Fase-1 immutable Build + atomic channel pointer
  |
  +--> Editor world projection
  +--> PlayPreview session pinned to draft build
  +--> Game pinned to published build
          |
          v
  CellStreamingCoordinator
  RegionAreaResolver
  WorldAudioDirector
  SharedWorldRuntime
```

### 4.1 Verantwoordelijkheden

| Component | Bezit | Mag niet |
| --- | --- | --- |
| `WorldSpatialKernel` | integer math, containment, polygonvalidatie, Cellkeys | DOM, DB, Three.js gebruiken |
| `WorldCompiler` | canonical docs naar manifest/fragments | state muteren of assets laden |
| `CellStreamingCoordinator` | desired sets, fetch/decode/attach/evict | authoringdata repareren |
| `RegionAreaResolver` | actuele Region/Areas en deterministic winner | audio afspelen of gameplay muteren |
| `WorldAudioDirector` | buses, selection, crossfades, emitters | Area-geometrie opnieuw interpreteren |
| `PreviewSessionService` | sandbox lifecycle en previewstate | canonical/playerstate schrijven |
| `WorldModeController` | Editor/Preview overgang in browser | een tweede renderer/canvas maken |
| `WorldBuilderStore` | queries, selectie, lokale tekendraft | serverrevision verzinnen |

---

## 5. Coördinaten, eenheden en wiskunde

### 5.1 Assen

- Rechtsdraaiend Three.js-stelsel.
- `+X` is wereld-oost/rechts.
- `+Y` is omhoog.
- `+Z` is wereld-zuid/omlaag op de 2D-wereldkaart.
- Rotatie in authoring is graden; positieve yaw draait volgens Three.js om `+Y`.
- UI toont meters met maximaal drie decimalen.
- Canonical spatial opslag gebruikt integer millimeters (`Mm`).

### 5.2 Numerieke grenzen

- Alle `*Mm`-waarden zijn JSON safe integers.
- Globale X/Z: `-1_000_000_000_000..1_000_000_000_000` mm, dus plus/min 1.000.000 km.
- Region lokale X/Z: `0..100_000_000` mm.
- Region lokale Y: `-10_000_000..10_000_000` mm.
- Een meterinput wordt met `Math.round(meters * 1000)` geschreven.
- Readback is `mm / 1000`; er vindt geen tweede rounding plaats.
- `-0` wordt `0`.

### 5.3 Region- en worldpositie

Voor Region `R` en lokale positie `L`:

```text
worldMm.x = R.originMm.x + L.xMm
worldMm.y = R.originMm.y + L.yMm
worldMm.z = R.originMm.z + L.zMm
```

Inverse:

```text
localMm = worldMm - region.originMm
```

De Region bevat een XZ-punt exact als:

```text
originX <= x < originX + widthMm
originZ <= z < originZ + depthMm
minLocalYMm <= (y - originY) < maxLocalYMm
```

De maximumranden zijn exclusief. Een punt op een gedeelde rand behoort aan de Region waarvan die rand minimum is.

### 5.4 Cell-grid

Fase 2 gebruikt exact:

```text
cellSizeMm = 64_000
cellX = floorDiv(worldXmm - gridOriginXmm, cellSizeMm)
cellZ = floorDiv(worldZmm - gridOriginZmm, cellSizeMm)
cellKey = "cell:" + cellX + ":" + cellZ
```

`floorDiv(a,b) = Math.floor(a / b)` voor `b > 0`; truncatie naar nul is verboden. Voorbeeld: `-1 / 64000` hoort bij Cell `-1`, niet `0`.

Cellbounds:

```text
minX = gridOriginXmm + cellX * cellSizeMm
maxX = minX + cellSizeMm
minZ = gridOriginZmm + cellZ * cellSizeMm
maxZ = minZ + cellSizeMm
```

Ook Cellbounds zijn half-open.

### 5.5 Render origin

Three.js ontvangt geen grote globale posities. `renderOriginMm` is de minimumhoek van de actuele focuscell:

```text
renderOriginMm.x = cellMinX
renderOriginMm.y = currentRegion.originMm.y
renderOriginMm.z = cellMinZ
renderMeters = (worldMm - renderOriginMm) / 1000
```

Wanneer de focus naar een andere Cell gaat:

1. simulatie pauzeert niet;
2. het verschil `oldOrigin - newOrigin` wordt eenmaal aan alle runtime roots toegevoegd;
3. camera, listener, physics/collision proxies en debughelpers verschuiven in dezelfde framecommit;
4. canonical positions veranderen niet;
5. de renderer doet geen volledige World rebuild.

### 5.6 Area-geometrie

Een Area is een verticale prismavorm in Region-lokale millimeters:

- `box`: half-open min/max op X/Y/Z.
- `cylinder`: cirkel in XZ plus half-open Y-range.
- `polygon_prism`: simple polygon in XZ plus half-open Y-range.

Polygonregels:

- 3..256 punten.
- Punten zijn integer `{xMm,zMm}`.
- Geen gelijke aangrenzende punten; laatste punt wordt niet als kopie van eerste opgeslagen.
- Geen zelfsnijding; alleen aangrenzende segmenten mogen een endpoint delen.
- Oppervlakte moet minimaal `1_000_000 mm²` zijn.
- Compiler normaliseert naar tegen-de-klok-in via signed shoelace area.
- Daarna roteert de lijst zodat lexicografisch kleinste `(xMm,zMm)` eerst staat.
- Containment gebruikt even-odd ray casting met exacte integer orientationtests.
- Een punt op een polygonrand telt als binnen; Y-maximum blijft exclusief.

### 5.7 Area-overlapvolgorde

Alle Areas die de listener bevatten worden gesorteerd op:

1. `priority` aflopend;
2. geometrisch XZ-oppervlak oplopend;
3. `runtimeKey` lexicografisch oplopend.

De eerste Area is `primaryArea`. Tags/reveal mogen alle memberships gebruiken; single-winner overrides zoals muziek gebruiken `primaryArea` of de eerste hogere Area die het betreffende veld niet op `inherit` heeft staan.

---

## 6. Canonical documents

Alle envelopes, IDs, revisions, lifecycle, hashing, references en Ajv-regels komen uit Fase 1.

### 6.1 `world_definition` versie 1

Exact een actief document, runtimeKey `world:main`:

```json
{
  "displayName": "Wereld",
  "gridOriginMm": { "x": 0, "z": 0 },
  "cellSizeMm": 64000,
  "streaming": {
    "requiredRadiusCells": 2,
    "prefetchRadiusCells": 3,
    "maxResidentCells": 49,
    "maxParallelFetches": 2,
    "maxParallelDecodes": 1,
    "frameAttachBudgetMs": 4,
    "frameDetachBudgetMs": 2,
    "evictionDelayMs": 5000,
    "retryDelaysMs": [250, 1000, 4000]
  },
  "audio": {
    "masterVolume": 1,
    "musicVolume": 0.8,
    "ambienceVolume": 0.8,
    "sfxVolume": 1,
    "uiVolume": 1,
    "membershipTickHz": 10,
    "regionDwellMs": 100,
    "areaExitHysteresisMm": 2000,
    "areaDwellMs": 250,
    "defaultCrossfadeMs": 1500
  },
  "preview": {
    "controller": "top_down_walk",
    "movementSpeedMetersPerSecond": 6,
    "sprintMultiplier": 1.6,
    "cameraHeightMeters": 18,
    "cameraBackMeters": 14,
    "cameraFovDegrees": 55,
    "nearMeters": 0.1,
    "farMeters": 256,
    "avatarMode": "project_player_when_available_else_camera_only"
  }
}
```

Harde regels:

- `cellSizeMm` is in versie 1 exact `64000` en locked.
- `requiredRadiusCells` exact `2`; `prefetchRadiusCells` exact `3`.
- `maxResidentCells >= (2*prefetchRadius+1)^2`, dus minimaal en standaard 49; maximum 81.
- Parallel fetch 1..4; decode 1..2.
- Attachbudget 1..8 ms; detachbudget 1..4 ms.
- Volumes 0..1.
- Audio tick 4..20 Hz.
- Region dwell 0..1.000 ms.
- Hysterese 0..10.000 mm; dwell 0..2.000 ms.
- Previewfar is maximaal prefetchdiameter in meters; compiler waarschuwt wanneer ver zicht content toont die nog niet resident kan zijn.

Cellsize wijzigen vereist later een nieuwe world-schemaversie en expliciete repartition migration; een normale Update mag dit veld niet wijzigen.

### 6.2 `region_definition` versie 1

```json
{
  "description": "",
  "tags": [],
  "originMm": { "x": 0, "y": 0, "z": 0 },
  "sizeMm": { "x": 500000, "z": 500000 },
  "minLocalYMm": -100000,
  "maxLocalYMm": 500000,
  "recommendedLevel": { "min": 1, "max": 10 },
  "environment": {
    "backgroundColor": "#101a26",
    "fog": { "enabled": false, "color": "#101a26", "density": 0 },
    "ambientLight": { "color": "#ffffff", "intensity": 0.8 },
    "sun": {
      "enabled": true,
      "color": "#ffffff",
      "intensity": 1,
      "azimuthDegrees": 135,
      "elevationDegrees": 50
    },
    "timeOfDayOffsetHours": 0,
    "shadowPreset": "inherit"
  },
  "audio": {
    "musicPlaylistRef": null,
    "ambienceRef": null,
    "crossfadeMs": null
  },
  "map": {
    "visible": true,
    "labelVisible": true
  }
}
```

Regels:

- Grootte X/Z: 1.000..100.000.000 mm.
- `minLocalYMm < maxLocalYMm`.
- Level integers 1..999 en min <= max.
- Fog density 0..1.
- Lichtintensiteiten 0..10; azimuth normaliseert naar `[0,360)`; elevation is `-90..90`.
- Time offset -24..24.
- `shadowPreset`: `inherit|geen|licht|middel|hoog|extreem`.
- Region XZ-interieurs mogen niet overlappen. Een create/resize/movecommand controleert dit transactioneel tegen alle actieve Regions.
- Een resize/move die bestaande Areas, placements of spawns buiten de nieuwe bounds zet faalt met backlinks; er is geen cascade-move.

### 6.3 `area_definition` versie 1

```json
{
  "regionRef": "doc:<region>",
  "description": "",
  "tags": [],
  "priority": 0,
  "geometry": {
    "type": "box",
    "minMm": { "x": 0, "y": -100000, "z": 0 },
    "maxMm": { "x": 50000, "y": 500000, "z": 50000 }
  },
  "environmentOverride": {
    "background": { "mode": "inherit", "color": "#101a26" },
    "fog": { "mode": "inherit", "color": "#101a26", "density": 0 },
    "lightIntensityMultiplier": 1
  },
  "audioOverride": {
    "music": { "mode": "inherit", "playlistRef": null },
    "ambience": { "mode": "inherit", "audioEventRef": null },
    "crossfadeMs": null
  },
  "map": {
    "revealMode": "outline",
    "revealOnEnter": false,
    "revealPaddingCells": 0
  }
}
```

Geometry-unions:

```json
{ "type": "box", "minMm": {"x":0,"y":0,"z":0}, "maxMm": {"x":1,"y":1,"z":1} }
```

```json
{ "type": "cylinder", "centerMm": {"x":0,"z":0}, "radiusMm": 1000, "minYMm": 0, "maxYMm": 2000 }
```

```json
{ "type": "polygon_prism", "points": [{"xMm":0,"zMm":0},{"xMm":1000,"zMm":0},{"xMm":0,"zMm":1000}], "minYMm": 0, "maxYMm": 2000 }
```

Regels:

- `priority` safe integer -1.000.000..1.000.000.
- Iedere dimensie/radius is minimaal 1 mm.
- Complete geometrie ligt binnen de Region XZ-bounds en Y-range.
- Override mode is `inherit|set|clear`. Bij `set` is de ref/waarde verplicht; bij `clear` moet de ref null zijn.
- `crossfadeMs` null of integer 0..60.000.
- Reveal padding 0..32.

### 6.4 `surface_patch` versie 1

Fase 2 ondersteunt doelbewust vlakke, polygonale grondpatches. Hoogtevelden, caves en sculpting zijn geen half-ingebouwde uitbreiding van dit schema.

```json
{
  "regionRef": "doc:<region>",
  "geometry": {
    "points": [
      { "xMm": 0, "zMm": 0 },
      { "xMm": 500000, "zMm": 0 },
      { "xMm": 500000, "zMm": 500000 },
      { "xMm": 0, "zMm": 500000 }
    ],
    "elevationMm": 0
  },
  "material": {
    "baseColor": "#4f6b45",
    "colorTextureAssetId": null,
    "textureRepeatMeters": 8,
    "roughness": 1,
    "metalness": 0
  },
  "walkable": true,
  "receiveShadows": true,
  "renderOrder": 0,
  "tags": []
}
```

Regels:

- Polygon volgt exact de normalization/validatie uit 5.6, met 3..256 punten.
- Alle punten liggen binnen de owning Region; gaten zijn in versie 1 niet ondersteund.
- Elevation ligt binnen Region Y-range.
- Textureasset is null of `asset_type='texture'`/`image` volgens het bestaande assetcontract.
- Repeat 0,01..10.000 meter; roughness/metalness 0..1.
- `renderOrder` integer -1000..1000. Overlappende surfaces met dezelfde elevation en renderOrder geven blocking `SURFACE_Z_FIGHT_RISK`; de gebruiker moet geometry, elevation of order corrigeren.
- Walkable collision is de getrianguleerde bovenzijde. `visual_only` ontstaat door `walkable=false`; blockerwanden worden in Fase 2 als placed entities/colliders authored.
- Compiler trianguleert de genormaliseerde simple polygon deterministisch met ear clipping: start bij de lexicografisch kleinste geldige ear; tie-break op oorspronkelijke genormaliseerde puntindex. Falen blokkeert compile.
- Compiler clipt render- en collisiontriangles tegen iedere overlappende Cellboundary, zodat een Surface niet door zijn centroid aan één Cell wordt gehangen.

`CreateRegionWithGround` mag als één atomic command een Region plus een rechthoekige Surface over de volledige Region maken. Dit is canonical multi-documentauthoring, geen runtimefallback.

### 6.5 `spawn_point` versie 1

```json
{
  "regionRef": "doc:<region>",
  "spawnType": "player_start",
  "positionMm": { "x": 10000, "y": 0, "z": 10000 },
  "yawDegrees": 0,
  "enabled": true,
  "tags": []
}
```

- `spawnType`: `player_start|respawn|travel_arrival|preview`.
- Positie is Region-lokaal en moet binnen Region vallen.
- Yaw wordt naar `[-180,180)` op 0,001 graad genormaliseerd.
- `project_settings.startSpawnRef` verwijst naar een enabled spawn waarvan Region gelijk is aan `startRegionRef`.
- Preview gebruikt eerst een expliciet gekozen enabled `preview` spawn, anders `project_settings.startSpawnRef`. Zonder geldige spawn blokkeert Preview met `PREVIEW_SPAWN_REQUIRED`; er wordt geen positie boven Regionorigin gegokt.
- Ontbreken van geldige startRegion/startSpawn blokkeert published game zodra Fase 2 canonical is.

### 6.6 `placed_entity` versie 2

Versie 2 vervangt alleen spatial ownership/positie van versie 1:

```json
{
  "regionRef": "doc:<region>",
  "label": "IJzererts pickup",
  "modelAssetId": "asset_<id>",
  "transform": {
    "positionMm": { "x": 10000, "y": 0, "z": 10000 },
    "rotationDegrees": { "x": 0, "y": 0, "z": 0 },
    "scale": { "x": 1, "y": 1, "z": 1 }
  },
  "solid": false,
  "walkable": false,
  "collisionRadiusMm": 1000,
  "minimapCategory": null,
  "animation": { "defaultClip": null, "idleClip": null, "walkClip": null, "runClip": null },
  "entityTags": [],
  "components": []
}
```

Aanvullend componenttype voor Fase 2:

```json
{
  "componentId": "cmp:<uuid>",
  "type": "audio_emitter",
  "audioEventRef": "doc:<audio-event>",
  "offsetMm": { "x": 0, "y": 0, "z": 0 },
  "autoplay": true,
  "enabled": true
}
```

`audio_emitter` erft distance/concurrency/loopinstellingen van het Audio Event. Een niet-loopend autoplayevent is semantic invalid; autoplay is alleen voor loopende ambiencebronnen.

Migratie v1 -> v2:

1. Rond meterpositie eenmaal naar millimeters.
2. Zoek actieve Region die de oude globale positie bevat.
3. Exact een match: schrijf `regionRef` en Region-lokale `positionMm`.
4. Nul of meer dan een match: migration blocker; geen gok op dichtstbijzijnde Region.
5. `collisionRadius` wordt `Math.round(radius * 1000)`.

### 6.7 `music_track` versie 1

```json
{
  "audioAssetId": "asset_<audio>",
  "loop": true,
  "loopStartMs": 0,
  "loopEndMs": null,
  "gain": 1,
  "fadeInMs": 1000,
  "fadeOutMs": 1000,
  "moodTags": [],
  "bpm": null,
  "priority": 0,
  "preloadPolicy": "on_region_prefetch"
}
```

- Asset is verplicht en `asset_type='audio'`.
- Assetimport/probe schrijft server-owned `durationMs`, `sampleRate`, `channelCount` en bewezen container/codec in `asset_library.metadata_json`; onbekende metadata blokkeert publish en wordt niet uit browserclaims overgenomen.
- Audio metadata moet een positieve durationMs, sampleRate en channelCount leveren voordat publish slaagt.
- Loop start 0..duration-1; loop end null of groter dan start en <= duration.
- Gain 0..1; fades 0..60.000.
- BPM null of 20..400. Fase 2 gebruikt BPM niet voor beatmatching.
- Preload `on_region_prefetch|on_demand`.

### 6.8 `music_playlist` versie 1

```json
{
  "playMode": "shuffle",
  "crossfadeMs": 1500,
  "avoidImmediateRepeat": true,
  "entries": [
    { "entryId": "entry:<uuid>", "trackRef": "doc:<track>", "weight": 1 }
  ],
  "selectors": {
    "dayPlaylistRef": null,
    "nightPlaylistRef": null,
    "combatPlaylistRef": null
  }
}
```

- Playmode `sequential|shuffle|weighted`.
- 1..256 unieke entries; dezelfde track mag maximaal eenmaal voorkomen.
- Weight integer 1..1.000.000 en alleen semantisch gebruikt bij `weighted`.
- Selectors mogen niet direct of indirect cyclisch verwijzen; depth maximaal 8.
- `combatPlaylistRef` wordt in Fase 2 niet gekozen en staat verborgen in normale UI.

### 6.9 `audio_event` versie 1

```json
{
  "variants": [
    { "entryId": "entry:<uuid>", "audioAssetId": "asset_<audio>", "weight": 1 }
  ],
  "selectionMode": "random",
  "gainRange": { "min": 1, "max": 1 },
  "playbackRateRange": { "min": 1, "max": 1 },
  "spatial": true,
  "distance": {
    "model": "inverse",
    "refDistanceMeters": 1,
    "maxDistanceMeters": 30,
    "rolloffFactor": 1
  },
  "cooldownMs": 0,
  "maxConcurrent": 8,
  "loop": false,
  "priority": 0,
  "bus": "sfx"
}
```

- 1..64 variants met audio-assets.
- Selection `random|sequential|weighted`.
- Gain 0..2 en min <= max.
- Playback rate 0.25..4 en min <= max.
- Distance model `inverse|linear|exponential`; ref > 0, max >= ref, rolloff 0..10.
- Bus `ambience|sfx|ui`; spatial UI is verboden.
- Loopende Events moeten maxConcurrent 1..4 hebben.

---

## 7. Commands, references en delete

### 7.1 Commands

Deze semantische commands lopen door de Fase-1-commandservice:

| Command | Atomic effect |
| --- | --- |
| `CreateWorld` | Maakt singleton en defaults; faalt als die bestaat. |
| `CreateRegion` | Maakt Region na overlapcontrole. |
| `CreateRegionWithGround` | Maakt Region plus full-bounds Surface in een transaction. |
| `MoveRegion` | Wijzigt origin als alle owned content geldig blijft. |
| `ResizeRegion` | Wijzigt bounds als alle owned content geldig blijft. |
| `CreateArea` | Maakt getypeerde Area in Region. |
| `ReplaceAreaGeometry` | Vervangt complete geometry na normalisatie. |
| `SetRegionEnvironment` | Vervangt environment/audio als een geheel. |
| `SetAreaOverrides` | Vervangt overrides als een geheel. |
| `CreateSurfacePatch` | Maakt getypeerde vlakke ground/material patch. |
| `ReplaceSurfaceGeometry` | Vervangt en normaliseert polygon/elevation atomisch. |
| `CreateSpawnPoint` | Maakt Region-lokale spawn. |
| `MoveSpatialDocument` | Verplaatst placement/spawn binnen huidige Region. |
| `TransferSpatialDocument` | Berekent nieuwe lokale positie uit vaste worldpositie en wisselt Region atomisch. |
| `CreateMusicTrack` | Maakt track met bestaand audioasset. |
| `ReplacePlaylistEntries` | Vervangt typed entries atomisch. |
| `CreateAudioEvent` | Maakt typed variants/event. |

Geen command accepteert door de client berekende runtimeKey, hash, Cellkey of worldrevision.

### 7.2 Transfer over Regiongrens

Tijdens een viewportdrag blijft de lokale preview vrij bewegen. Op pointerup:

1. Client stuurt gewenste globale `worldPositionMm` en huidige documentId.
2. Server zoekt via Regionindex exact een owner.
3. Zelfde Region: `MoveSpatialDocument`.
4. Andere Region: `TransferSpatialDocument` met nieuwe lokale positie.
5. Geen Region: 422 en object springt terug naar bevestigde positie.

Daarmee kan Kevin natuurlijk door een naadloze wereld slepen zonder Regionrefs te beheren.

### 7.3 Delete

- Regiondelete is `restrict` zolang Areas, Surface Patches, placements, spawns of projectrefs bestaan.
- Areadelete is toegestaan na menselijke usagebevestiging; owned overrides verdwijnen mee.
- Trackdelete is restricted door playlists.
- Playlistdelete is restricted door Regions, Areas en selectors.
- Audio Eventdelete is restricted door Regions, Areas en emitters.
- Cellfragmenten zijn buildoutput en worden uitsluitend met buildretention verwijderd.

---

## 8. Compile-output en opslag

### 8.1 Root manifest

```json
{
  "schemaVersion": "gk-world-v1",
  "buildId": "build:<uuid>",
  "contentHash": "<root-hash>",
  "world": {
    "runtimeKey": "world:main",
    "gridOriginMm": { "x": 0, "z": 0 },
    "cellSizeMm": 64000,
    "streaming": {},
    "preview": {}
  },
  "project": {
    "startRegionKey": "zone.start",
    "startSpawnKey": "spawn:start"
  },
  "regions": [],
  "areas": [],
  "audioCatalog": {
    "tracks": {},
    "playlists": {},
    "events": {}
  },
  "cells": {
    "cell:0:0": {
      "hash": "<sha256>",
      "byteLength": 1234,
      "regions": ["zone.start"],
      "assets": ["asset_..."]
    }
  }
}
```

Root bevat Region-/Area-resolvers en audio metadata, maar geen volledige mesh/entitypayloads.

### 8.2 Region runtime record

```json
{
  "key": "zone.start",
  "name": "Start",
  "originMm": {"x":0,"y":0,"z":0},
  "sizeMm": {"x":500000,"z":500000},
  "minLocalYMm": -100000,
  "maxLocalYMm": 500000,
  "environment": {},
  "audio": {},
  "coveredCellBounds": {"minX":0,"maxX":7,"minZ":0,"maxZ":7}
}
```

`coveredCellBounds.max*` is inclusief als indexrange, afgeleid uit de exclusieve Regionmaximumwaarde met `floorDiv(max-1-origin, size)`.

### 8.3 Cellfragment

```json
{
  "schemaVersion": "gk-world-cell-v1",
  "buildId": "build:<uuid>",
  "cellKey": "cell:0:0",
  "boundsMm": {"minX":0,"maxX":64000,"minZ":0,"maxZ":64000},
  "entities": [],
  "surfaces": [],
  "colliders": [],
  "spawnMarkers": [],
  "audioEmitters": [],
  "assetIds": [],
  "contentHash": "<fragment-hash>"
}
```

Een spatial record wordt toegewezen aan de Cell die zijn canonical anchorpositie bevat. Grote surfaces/colliders worden deterministisch per overlappende Cell geclipt of als immutable shared record gerefereerd; zij worden nooit willekeurig alleen aan hun centroid toegewezen.

### 8.4 Determinisme

- Region/Area records sorteren op runtimeKey.
- Cellkeys sorteren numeriek op `cellX`, daarna `cellZ`.
- Entity/surface/collider/emitter sorteren op runtimeKey, daarna componentId.
- Asset IDs sorteren lexicografisch en zijn uniek.
- Ieder fragment wordt RFC-8785 gecanonicaliseerd en gehasht.
- Root `contentHash` is SHA-256 over canonical root zonder zijn eigen `contentHash`, inclusief fragmentkeys/hashes.
- Een gewijzigde Cell verandert alleen zijn fragmenthash en de roothash.

### 8.5 SQL-uitbreiding

```sql
CREATE TABLE IF NOT EXISTS authoring_build_fragments (
  build_id TEXT NOT NULL,
  fragment_key TEXT NOT NULL,
  fragment_kind TEXT NOT NULL CHECK (fragment_kind IN ('world_cell')),
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  artifact_json TEXT NOT NULL CHECK (json_valid(artifact_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (build_id, fragment_key),
  FOREIGN KEY (build_id) REFERENCES authoring_builds(build_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_authoring_build_fragments_hash
  ON authoring_build_fragments(content_hash);

CREATE TABLE IF NOT EXISTS authoring_preview_sessions (
  preview_session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  build_id TEXT NOT NULL,
  source_workspace_revision INTEGER NOT NULL,
  state_revision INTEGER NOT NULL DEFAULT 0 CHECK (state_revision >= 0),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  state_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'running', 'paused', 'closing', 'closed', 'expired', 'failed')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  closed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (build_id) REFERENCES authoring_builds(build_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_authoring_preview_sessions_expiry
  ON authoring_preview_sessions(status, expires_at);

CREATE TABLE IF NOT EXISTS authoring_preview_operations (
  preview_operation_id TEXT PRIMARY KEY,
  preview_session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  command_type TEXT NOT NULL,
  base_state_revision INTEGER NOT NULL,
  result_state_revision INTEGER NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL,
  UNIQUE (preview_session_id, request_id),
  UNIQUE (preview_session_id, result_state_revision),
  FOREIGN KEY (preview_session_id)
    REFERENCES authoring_preview_sessions(preview_session_id) ON DELETE CASCADE
);
```

- Fragmentinsert, buildinsert en release-pointerupdate zitten in dezelfde buildtransaction.
- Een buildretentiondelete cascades naar fragmenten, maar wordt geblokkeerd zolang een niet-verlopen Previewsession die build gebruikt.
- Previewstate is canonical JSON maar geen authoringdocument en geen published game state.
- Previewoperations volgen dezelfde requestId/requestHash-retrysemantiek als Fase-1-authoringoperations, maar verhogen alleen `state_revision` en nooit workspace revision.
- Cleanup markeert sessions na 30 minuten zonder heartbeat `expired`; gesloten/verlopen records worden na 24 uur verwijderd.

---

## 9. Spatial index en boundary checks

### 9.1 Compile-time indexes

Rootmanifest bevat:

- `regionCandidatesByCell[cellKey] -> sorted region keys`;
- `areaCandidatesByCell[cellKey] -> sorted area keys`;
- `globalAreaKeys` alleen voor een Area die meer dan 4096 Cells raakt.

Normale Areas die meer dan 4096 Cells raken leveren een warning; meer dan 65.536 Cells blokkeert publish. Runtime test alleen candidates van de listenercell plus `globalAreaKeys`.

### 9.2 Region resolve

1. Bereken listener Cellkey met integer math.
2. Lees Regioncandidates.
3. Test half-open bounds.
4. Nul matches: `outside_authored_world`.
5. Een match: current Region.
6. Meer dan een: corrupte build; behoud vorige Region en rapporteer `REGION_RUNTIME_OVERLAP`.

### 9.3 Area resolve en hysterese

Membership wordt exact `membershipTickHz` keer per seconde getest, niet iedere renderframe.

Voor iedere Area wordt signed XZ-distance `dMm` bepaald: positief binnen, nul op rand, negatief buiten. Y moet apart binnen de half-open range liggen.

Exacte signed-distancefuncties:

- Box: binnen is het minimum van de vier afstanden tot de XZ-randen; buiten is minus de Euclidische afstand tot het dichtstbijzijnde punt op de rechthoek.
- Cylinder: `radiusMm - hypot(x-centerX, z-centerZ)`.
- Polygon: bepaal binnen/buiten met 5.6; neem de minimum Euclidische point-to-segmentafstand over alle randen, positief binnen, negatief buiten en exact 0 wanneer een integer orientation/on-segmenttest boundary bevestigt.
- `Math.hypot` wordt alleen voor hystereseafstand gebruikt, niet voor canonical containment of hashing.

- Nieuwe membershipcandidate: Y binnen en `dMm >= 0` gedurende onafgebroken `areaDwellMs`.
- Bestaande membership blijft totdat Y buiten is of `dMm < -areaExitHysteresisMm` gedurende `areaDwellMs`.
- Bij teleports groter dan een Cell wordt dwell overgeslagen en membership atomisch opnieuw berekend.
- Na iedere membershipwijziging wordt de volledige winner-sortering uit 5.7 opnieuw uitgevoerd.

### 9.4 Regionovergang

Regions hebben geen geometrische overlap-hysterese. De resolver onderscheidt `geometricRegion` en `confirmedRegion`: een nieuwe aangrenzende kandidaat moet onafgebroken `regionDwellMs` geometrische owner zijn voordat presentation/audio wisselt. Teleport/travel bevestigt direct. De nieuwe Region en required Cells moeten resident zijn voordat movementcommit over de rand plaatsvindt. Authoritative positie gebruikt altijd de geometrische owner; alleen presentation houdt de korte dwell vast.

### 9.5 Environment resolve

Basis is de confirmed Regionenvironment. Daarna wordt per overridegroep de eerste Area in 5.7-volgorde gekozen die niet `inherit` is:

- background `set` kiest kleur; `clear` zet `scene.background=null`;
- fog `set` kiest kleur/density en activeert fog; `clear` verwijdert fog;
- `lightIntensityMultiplier` komt van primary Area en vermenigvuldigt Region ambient/sun intensiteit.

Bij membershipwissel interpolateert environment gedurende dezelfde resolved transitionduur als muziek. Kleuren worden eerst van sRGB naar linear RGB geconverteerd, lineair gemengd en voor display terug naar sRGB gezet. Density en lichtintensiteit worden lineair gemengd. Een onderbroken transition begint bij de actuele gemengde waarden. `clear` fade density/intensity naar 0; een null background wisselt pas op de helft van de transition om een ongedefinieerde kleurmix te vermijden.

---

## 10. Cell streaming

### 10.1 Desired sets

Voor focuscell `(cx,cz)` en Chebyshevafstand `D=max(abs(dx),abs(dz))`:

- `required`: D <= 2, maximaal 25 Cells.
- `prefetch`: 2 < D <= 3, maximaal 24 extra Cells.
- `desiredResident = required union prefetch`, maximaal 49.

Alleen Cellkeys die in het manifest bestaan worden aangevraagd.

### 10.2 Prioriteit

Loadqueue sorteert op deze tuple:

1. required voor prefetch;
2. Chebyshevafstand oplopend;
3. bewegingbias aflopend, berekend als genormaliseerde dotproduct van Cellrichting en huidige XZ-snelheid; bij snelheid <0,1 m/s is bias 0;
4. Manhattanafstand oplopend;
5. cellX numeriek;
6. cellZ numeriek.

DB-/objectvolgorde speelt geen rol.

### 10.3 Cell-state machine

```text
absent
  -> queued
  -> fetching
  -> verifying
  -> decoded
  -> attaching
  -> resident
  -> evict_pending
  -> detaching
  -> absent

fetching/verifying/decoded/attaching -> failed -> queued | absent
```

Iedere transition controleert `buildId` en een monotonic `streamGeneration`. Resultaten van een oude generation worden weggegooid en niet aangehecht.

### 10.4 Fetch en verificatie

- Maximaal twee fetches en een decode tegelijk volgens world settings.
- Iedere request heeft een `AbortController`.
- Een in-flight prefetch zonder consumers wordt geaborteerd zodra hij buiten desired valt.
- Required fetches worden niet door prefetches verdrongen; queued prefetch geeft zijn slot af.
- Response moet 200 zijn, correcte content type hebben en maximaal 4 MiB uncompressed JSON per Cell zijn.
- Runtime controleert schemaVersion, buildId, cellKey en SHA-256 voor decode/attach.
- Published fragmentresponse gebruikt `Cache-Control: public, max-age=31536000, immutable`; draft/Previewfragmenten gebruiken `private, max-age=31536000, immutable`. ETag is in beide gevallen gelijk aan contenthash.

### 10.5 Attachbudget

- Parsing/verificatie gebeurt buiten renderloop waar mogelijk; JSON parse blijft gemeten.
- Scene attach gebruikt een jobqueue.
- Per frame maximaal `frameAttachBudgetMs` en maximaal een nieuwe GLB GPU-upload.
- Colliders worden pas active wanneer de visuele/collisionbatch compleet is; een halve Cell wordt nooit `resident`.
- Cellroot is een `THREE.Group` met metadata buildId/cellKey/generation.
- Attach commit voegt precies een root toe en zet state daarna resident.

### 10.6 Assets

Assetcachekey is `(assetId, sha256)`.

- Fetch/decode promise wordt gedeeld.
- Iedere resident Cell houdt een reference.
- Eviction verlaagt refs.
- GLTF template blijft cached zolang refs >0 of binnen een 30-seconden warm cachewindow.
- Instanceobjects worden met `SkeletonUtils.clone` gemaakt wanneer skins aanwezig zijn.
- Geometry/material/texture wordt alleen disposed wanneer geen template/instance/reference hem gebruikt.
- Audiobuffers volgen dezelfde refregels per AudioContext.

### 10.7 Eviction

- Buiten desired -> `evict_pending` met deadline `now + evictionDelayMs`.
- Komt Cell terug voor deadline, dan terug naar resident zonder detach.
- Na deadline sorteert eviction op grootste afstand, oudste `lastRequiredAt`, daarna Cellkey.
- Required Cells worden nooit geevict.
- Detach respecteert frameDetachBudget.
- Eventlisteners, mixers, emitters, colliders, hit targets en sceneobjects van de Cell worden allemaal via een Cell-owned disposable registry opgeruimd.

### 10.8 Movement gate en failure

- Playercollision/movement mag alleen committen naar een resident required Cell.
- Bij niet-resident target wordt positie op de laatste geldige grens minus 1 mm gehouden.
- Na 250 ms verschijnt een niet-blokkerende `Wereld laden`-indicator.
- Fetch retryt na 250, 1000 en 4000 ms.
- Na drie failures wordt Cell `failed`; automatische retry stopt tot focus/manifest/build verandert of gebruiker Retry kiest.
- Published runtime behoudt huidige speelbare Cells; Preview biedt `Stop preview` en diagnostic.
- Er verschijnt nooit een onzichtbare valruimte als fallback.

### 10.9 Visibility en achtergrondtab

Bij `document.hidden`:

- renderer/physics worden gepauzeerd;
- geen nieuwe prefetch start;
- in-flight required fetch mag afronden;
- Preview heartbeat gaat maximaal eens per 60 seconden door;
- audio wordt suspended en onthoudt gewenste toestand.

Bij zichtbaar worden worden membership, desired Cells en listenertransform direct opnieuw berekend voordat simulatie hervat.

---

## 11. Audio- en muzieksysteem

### 11.1 Audio graph

Per browserruntimecontext exact:

```text
music sources ----> musicGain -----+
ambience beds ----> ambienceGain --+
spatial/SFX ------> sfxGain -------+--> masterGain --> AudioContext.destination
UI sounds --------> uiGain --------+
```

Three.js krijgt exact een `AudioListener` aan de actieve gameplaycamera. Editor-orbitcamera heeft geen tweede listener. Bij camerawissel wordt dezelfde listener verplaatst.

### 11.2 Unlock

- AudioContext wordt uiterlijk bij eerste expliciete `Start Preview`/`Speel`-klik gemaakt of resumed.
- `resume()` wordt awaited.
- Bij `suspended` blijft desired audioselectie queued en UI toont `Geluid inschakelen`.
- Dezelfde gebruikersklik mag opnieuw resume proberen.
- `closed` maakt een nieuwe context pas na user gesture; oude nodes worden nooit hergebruikt.

### 11.3 Music source

Lange muziektracks gebruiken standaard `HTMLAudioElement` + `MediaElementAudioSourceNode` om volledige bestanden niet als decoded buffer in RAM te houden. Korte Audio Events gebruiken fetch + `decodeAudioData`/Three `AudioLoader`.

- `loop=true` met `loopStartMs=0` en `loopEndMs=null` gebruikt native media-element looping.
- Een track met custom loopStart/loopEnd gebruikt een decoded `AudioBufferSourceNode`, omdat media-element time events geen exact looppuntcontract leveren.
- Custom-loop tracks groter dan 20 MiB decoded geschat formaat blokkeren publish met `MUSIC_CUSTOM_LOOP_MEMORY_BUDGET`; de editor vraagt dan volledige-trackloop of een korter asset.
- Geschat decoded formaat is `durationSeconds * sampleRate * channelCount * 4`; importmetadata moet duration, sampleRate en channelCount bevatten.

Er bestaan maximaal twee gelijktijdige music decks, A en B, voor crossfade. Een derde transitie hergebruikt het deck met de laagste actuele gain nadat diens automation correct is afgebroken.

### 11.4 Playlistresolve

Selectorcontext in Fase 2 is alleen `base`, `day` of `night`. Dag/nachtcontext komt pas uit een bewezen world-clockconsumer; zonder die consumer is context `base`. Combatref wordt genegeerd met diagnostic `inactive_selector`, niet stil afgespeeld.

Trackselectie:

- `sequential`: volgende entryindex modulo lengte.
- `shuffle`: Fisher-Yates permutation per cycle; eerste van nieuwe cycle mag niet vorige track zijn wanneer avoidRepeat en lengte >1.
- `weighted`: integer cumulative weights; random integer in `[1,totalWeight]`.

PRNG is `xorshift32`; initial seed is de eerste 32 bits van SHA-256 over `buildId + "|" + preview/game session id + "|" + playlist runtimeKey`. Seed 0 wordt `0x6d2b79f5`. Daardoor is een Previewrun reproduceerbaar zonder globale `Math.random()`.

### 11.5 Welke muziek wint

1. Neem primary Area en daarna overige Areas in overlapvolgorde.
2. Eerste `music.mode=set` kiest playlist.
3. Eerste `music.mode=clear` kiest stilte.
4. Anders Regionplaylist.
5. Null Regionplaylist kiest stilte.

Zelfde resolved playlist verandert niets. Een nieuw playlistobject met dezelfde runtimeKey maar ander buildId wordt na buildwissel opnieuw geladen.

### 11.6 Crossfade

Transitionduur:

1. Area `crossfadeMs` indien niet-null;
2. target playlist `crossfadeMs`;
3. world default.

Voor duur `T > 0`, genormaliseerde tijd `u in [0,1]`:

```text
outGain(u) = startOutGain * cos(u * PI/2)
inGain(u)  = targetGain   * sin(u * PI/2)
```

Er worden 128 samples via `AudioParam.setValueCurveAtTime()` gepland. Voor planning:

1. `cancelAndHoldAtTime(now)` indien beschikbaar; anders `cancelScheduledValues(now)` plus de door de director bijgehouden actuele curvewaarde.
2. Zet de held value op `now`.
3. Plan curve vanaf `now + 0.01` seconden.
4. Stop en reset outgoing media pas na einde plus 50 ms.

Bij `T=0` worden gains atomisch op de volgende audiotick gezet. Trackgain, playlisttransition en busgain worden vermenigvuldigd; geen gain wordt boven 2 gezet.

### 11.7 Ambience

Region/Area ambience is een niet-positionele loop op de ambiencebus en volgt dezelfde winner-/hystereselogica. Wissel gebruikt dezelfde equal-powercurve. `clear` fade naar stilte.

### 11.8 Spatial Audio Events

- Spatial emitters bestaan alleen als owned component van een resident `placed_entity`.
- Positie volgt entity worldposition plus rotated local offset en render-originverschuiving.
- Three `PositionalAudio`/PannerNode gebruikt het gepubliceerde distance model, ref/max/rolloff.
- Omdat Web Audio `maxDistance` bij het inverse/exponential model geen harde stiltegarantie is, past GK daarnaast een deterministic max-distance voice gate toe: buiten maxDistance gain 0 en geen nieuwe voice; binnenkomst fade 50 ms in, vertrek fade 50 ms uit.
- Emitter activeert pas wanneer Cell resident en audio unlocked is.
- Bij Cell eviction fade een loop in 100 ms uit voordat dispose plaatsvindt.
- `maxConcurrent` geldt per Audio Event per runtimecontext.
- Bij limiet wint hogere eventpriority, daarna kleinste listenerafstand, daarna oudste starttijd; geweigerde events queueen niet.
- Cooldown is per emitter+event; Previewstate only.

### 11.9 Audiofouten

- Ontbrekend/ongeldig audioasset blokkeert publish.
- Netwerk/decodefailure mute alleen het betrokken event/track, rapporteert diagnostic en crasht world niet.
- Music failure probeert eenmaal volgende playlisttrack; als alle entries falen wordt playlist stil en niet oneindig geretryd.
- Mute/volume zijn lokale gebruikersvoorkeuren en geen authoringmutation.

---

## 12. World Builder UX

### 12.1 Hoofdroute

`Werkbank | Wereld` toont dezelfde viewport met:

- een compacte World/Region/Area-breadcrumb;
- modeknoppen `Object`, `Region`, `Area`, `Spawn`, `Preview`;
- een optionele 2D-overzichtskaart;
- een compacte propertieskolom;
- streamingdiagnostics als uitklapbare overlay.

Geen nodecanvas is nodig.

### 12.2 Region maken

1. Kies Region.
2. Sleep een rechthoek op XZ of voer breedte/diepte in meters in.
3. Snapping staat standaard op 1 meter; Alt houdt vrij op 1 mm.
4. Geef menselijke naam.
5. Server maakt ID/ref en controleert overlap.
6. Region verschijnt direct als subtiele boundary met naam.

### 12.3 Area maken

- Box: sleep rechthoek, stel Y-range compact in.
- Cylinder: klik center, sleep radius.
- Polygon: klik punten, Enter/dubbelklik sluit; Backspace verwijdert laatste punt; Esc annuleert.
- Zelfsnijding wordt tijdens tekenen rood aangegeven en kan niet bevestigen.
- Area properties tonen naam, priority, sfeer, muziek, ambience en kaartreveal zonder raw JSON.

### 12.4 Grond maken

- Bij nieuwe Region staat `Maak direct grond` standaard aan en gebruikt `CreateRegionWithGround`.
- De Surface-tool tekent of bewerkt een vlak polygon in de viewport.
- Materiaalvelden zijn kleur, optionele texturepicker, repeat, roughness en metalness.
- `Walkable` is een duidelijke checkbox; er verschijnt geen raw colliderconfiguratie.
- Cell-clipping blijft compile/runtime-intern en verandert de zichtbare polygon niet.

### 12.5 Selectie en relaties

Bij een object toont de tool boven de fold:

- naam/type/model;
- Region en actuele Areas;
- transform;
- componenten waaronder audio emitter;
- `Waar gebruikt`.

Region/Area-keuzes gebruiken menselijke searchable pickers. Cellkey staat uitsluitend onder Diagnostics.

### 12.6 Diagnostics

Streamingoverlay gebruikt vaste kleuren en legenda:

- required: groen;
- prefetch: blauw;
- queued/fetching: geel;
- failed: rood;
- resident buiten desired tijdens evictiondelay: grijs.

Overlay toont focuscell, resident/desired counts, queue, fetch/decode, attach ms, build ID en fouten. Hij is standaard uit en wordt nooit in published game getoond.

---

## 13. HTTP/API-contract

### 13.1 Authoring

Generieke Fase-1-documentroutes blijven bestaan. Semantische commands gebruiken:

```text
POST /api/authoring/projects/:projectId/world/commands
If-Match: "ws:<revision>"
Content-Type: application/json
```

Response bevat operation, nieuwe workspace ETag, gewijzigde projections en diagnostics.

Readroutes:

```text
GET /api/authoring/projects/:projectId/world
GET /api/authoring/projects/:projectId/regions?cursor=&limit=100
GET /api/authoring/projects/:projectId/regions/:documentId
GET /api/authoring/projects/:projectId/regions/:documentId/areas
GET /api/authoring/projects/:projectId/spatial/resolve?xMm=&yMm=&zMm=
```

Resolve is diagnostic/read-only; commands voeren hun eigen resolve opnieuw server-side uit.

### 13.2 Build/runtime

```text
GET /api/runtime/channels/draft/manifest
GET /api/runtime/channels/published/manifest
GET /api/runtime/builds/:buildId/cells/:cellX/:cellZ
```

- Channelmanifest: `Cache-Control: no-cache`, ETag build/content hash.
- Build/cell: immutable caching.
- Cellroute valideert signed decimal integers en canonicaliseert naar exacte Cellkey.
- Een Cell die niet in manifest staat geeft 404 `CELL_NOT_IN_BUILD`.

### 13.3 Preview

```text
POST   /api/preview/sessions
GET    /api/preview/sessions/:id
PATCH  /api/preview/sessions/:id/state
POST   /api/preview/sessions/:id/heartbeat
DELETE /api/preview/sessions/:id
```

Createbody:

```json
{
  "requestId": "req:<uuid>",
  "draftBuildId": "build:<uuid>",
  "start": { "regionDocumentId": null, "spawnDocumentId": null }
}
```

Server controleert user, project, draftchannelpointer en build. Response bevat previewSessionId, pinned manifest URL, expiresAt en initial state. PATCH gebruikt `If-Match: "preview:<stateRevision>"` en eigen idempotent requestId.

Previewroutes accepteren uitsluitend preview-domainacties. Een previewtoken/session-ID geeft geen authoringrechten.

---

## 14. PlayPreview state machine

```text
EDITOR_READY
  -> PREPARING_BUILD
  -> CREATING_SESSION
  -> ENTERING_PREVIEW
  -> PREVIEW_RUNNING
  <-> PREVIEW_PAUSED
  -> STOPPING_PREVIEW
  -> RESTORING_EDITOR
  -> EDITOR_READY

Iedere transition kan -> PREVIEW_ERROR -> RESTORING_EDITOR
```

Een lokale niet-opgeslagen formulierdraft geeft `EDITOR_DIRTY` en blokkeert Start Preview tot Kevin `Opslaan en testen` of `Annuleren` kiest. Er is geen stille discard.

---

## 15. Editor view snapshot

Voor Preview wordt in memory en `sessionStorage` onder project+tab-ID opgeslagen:

```json
{
  "version": 1,
  "projectId": "project:main",
  "capturedWorkspaceRevision": 42,
  "draftBuildId": "build:<uuid>",
  "camera": {
    "position": {"x":0,"y":20,"z":20},
    "target": {"x":0,"y":0,"z":0},
    "zoom": 1
  },
  "selection": { "documentId": "doc:<uuid>", "subId": null },
  "tool": "object_select",
  "gizmo": { "mode": "translate", "space": "world", "snapMeters": 1 },
  "viewport": { "regionDocumentId": "doc:<region>", "visibleLayerIds": [] },
  "panels": { "leftWidthPx": 320, "rightWidthPx": 340, "openPanelIds": [] },
  "residentCellKeys": ["cell:0:0"]
}
```

Dit is niet canonical, wordt niet naar SQLite geschreven en mag zonder gameplayverlies verdwijnen. sessionStorage bestaat alleen voor herstel na browserrefresh in dezelfde tab.

---

## 16. Exact Preview entry protocol

1. `Start Preview` komt uit een expliciete user gesture en roept vóór de eerste `await` `ensureAudioContext()`/`resume()` aan; een afwijzing zet alleen `audio_locked`.
2. Blokkeer als een formulierdraft niet bevestigd is.
3. Wacht tot actieve authoringcommandqueue leeg is.
4. Vraag Save Draft/compile aan met actuele strong workspace ETag.
5. Vereis nul blocking diagnostics en ontvang immutable draft build-ID.
6. Capture EditorViewSnapshot.
7. Maak server Previewsession gepind aan dat build-ID.
8. Zet authoring UI read-only; unregister editor keymaps en TransformControls listeners.
9. Behoud bestaande WebGLRenderer, canvas, assetcache en reeds identieke Cellresources.
10. Stop editor animation owner voordat Previewloop owner start; er is exact een animationloop.
11. Laad rootmanifest en required Cells rond gekozen spawn.
12. Verifieer hashes en attach Previewruntime roots.
13. Installeer Preview input/controller en dezelfde active gameplaycamera.
14. Controleer de bij stap 1 gestarte AudioContext; toon bij `suspended` een expliciete unlockknop en behoud desired audiostate.
15. Markeer session running en begin heartbeat om de 60 seconden.
16. Verberg laadcover pas wanneer focuscell, required colliders, camera en controller compleet zijn.

### 16.1 Instantdoel

- Als manifest en required Cells al resident/cached zijn: input-ready binnen 250 ms op doelhardware.
- Bij noodzakelijke assetfetch is er geen vaste tijdgarantie; binnen 100 ms verschijnt voortgang en cancelknop.
- “Instant” wordt nooit gerealiseerd door een tweede verborgen renderer/world permanent actief te houden.

### 16.2 Previewcontroller

Fase 2 gebruikt `top_down_walk`:

- WASD/arrow movement op XZ.
- Snelheid en sprint uit world previewsettings.
- Cameraoffset/FOV/near/far exact uit worldsettings.
- Collision tegen resident canonical colliders.
- Avatar: bestaand projectplayermodel wanneer runtimeartifact dat al geldig levert; anders geen fake mesh, maar een camera-only controller met zichtbare grondcursor uitsluitend in Previewdiagnostics.
- Previewspawnvolgorde volgt sectie 6.4.

---

## 17. Preview sandboxstate

Initial state:

```json
{
  "position": { "regionKey": "zone.start", "xMm": 10000, "yMm": 0, "zMm": 10000 },
  "yawDegrees": 0,
  "activeAreaKeys": [],
  "inventory": {},
  "currencies": {},
  "quests": {},
  "flags": {},
  "worldEphemeral": {},
  "clock": { "elapsedMs": 0, "timeOfDayHours": 12 }
}
```

- Future systems schrijven via een `PreviewStateAdapter`, nooit hun echte repository.
- Preview servermutations zijn scoped door previewSessionId+userId+buildId.
- State update is transactioneel, revision-guarded en canonical hashed.
- State maximum 1 MiB in Fase 2; groter geeft 413.
- Client mag movement lokaal voorspellen; server-previewstate is autoriteit voor blijvende previewacties.
- Stop/expiry verwijdert sandboxstate volgens retention en kopieert niets naar game/playerstate.

---

## 18. Exact Preview exit en herstel

1. Zet mode `STOPPING_PREVIEW`; blokkeer nieuwe inputacties.
2. Stop heartbeat en Preview netwerkrequests.
3. Abort alle preview-only Cell-/assetfetches zonder Editorconsumer.
4. Stop musicdecks, ambience en emitters met maximaal 100 ms teardownfade; suspend context niet als Editor-audiopreview hem gebruikt.
5. Unregister Preview input, timers, physics, membershipticks en eventbusabonnementen.
6. Detach/dispose preview-only roots via ownershipregistry.
7. Sluit Previewsession idempotent; netwerkfailure blokkeert lokaal herstel niet.
8. Lees actuele workspace revision. Indien anders dan snapshotrevision: refresh canonical projections voordat selectie wordt hersteld.
9. Herstel Editor runtime van de huidige draftbuild, niet blind van de oude Previewbuild.
10. Hergebruik identieke cached assets/Cellfragments op hash.
11. Herstel camera, target, tool, gizmo, panels en selectie wanneer document nog bestaat.
12. Als selectie verwijderd is: selection null en menselijke melding.
13. Registreer Editor keymaps/TransformControls exact eenmaal.
14. Start exact een Editor animationloop.
15. Verwijder sessionStorage snapshot en zet `EDITOR_READY`.

Teardown is herhaalbaar. Tweemaal Stop, refresh tijdens Stop of een mislukte serverclose mag geen dubbele listeners/loops/scene roots achterlaten.

### 18.1 Refresh/crash

- Bij refresh met open snapshot/session vraagt de UI `Preview hervatten` of `Terug naar editor`.
- Hervatten vereist geldige niet-verlopen session en nog bestaande build.
- Anders wordt lokaal herstel uitgevoerd en session best-effort gesloten.
- Een serverrestart mag Preview verliezen; canonical authoring en published state blijven onaangetast.

---

## 19. Cutover en legacy import

### 19.1 Volgorde

1. `world.structure` inventory/import/shadow.
2. `presentation.audio` inventory/import/shadow.
3. `world.placements` v1->v2 schema migration nadat Regions shadow bestaan.
4. Canonical compile + semantic parity/afwijkingsrapport.
5. Fase-2 runtime leest fragmented worldbuild.
6. Draft lifecycleacceptatie.
7. Domains atomisch canonical volgens Fase-1-protocol.
8. Published lifecycleacceptatie.

### 19.2 Legacy mapping

| Legacy | Canonical |
| --- | --- |
| project chunk grid/world settings | `world_definition` defaults + expliciet importreport |
| `zone_definition` | `region_definition`; legacy runtimeKey blijft behouden |
| `zone_environment_settings` | embedded Region environment/audio |
| `area_definition` | `area_definition` typed geometry |
| `area_environment_override` | embedded Area overrides |
| `ground_surface`, `terrain_layer`, `surface_layer` | `surface_patch` voor bewezen vlakke polygonen; niet-representeerbare hoogte-/shaderdata blokkeert of blijft eerlijk legacy |
| `spawn_point` | `spawn_point` document |
| `music_track` | `music_track` document |
| `music_playlist` + track edges | typed playlist entries |
| `audio_event` | typed variants |
| `model_entity`/assembly placements | Fase-1 placementdocument, daarna v2 spatial migration |

### 19.3 Geen valse parity

Legacy 14m chunks en nieuwe 64m Cells hoeven niet dezelfde partitionhash te hebben. Parity vergelijkt:

- Region/Area bounds en membership op vaste boundarytestvectors;
- worldpositie van iedere entity/spawn;
- assets, collision, environment en audiorefs;
- zichtbare semantic runtimecontent.

Partitionkeys, fragmentgrenzen, provenance en diagnosticvolgorde zijn niet-semantisch. Een verschil in objectpositie, Regionowner, Area membership of muziekselectie is wel blocking.

### 19.4 Onzekere import

- Legacy polygon JSON parsefout, zelfsnijding of buiten-zonepunt blokkeert.
- Legacy surface zonder deterministisch vlak polygon/material blokkeert; importer maakt geen vlakke benadering van onbekende terreingeometrie.
- Zone-overlap blokkeert.
- Placement zonder unieke Region blokkeert.
- Playlist edge/weight ambiguity blokkeert.
- Ontbrekend audioasset blokkeert presentation-audiocutover.
- Importer verzint geen Region, punt, trackvolgorde of nearest owner.

---

## 20. Validatie en foutafhandeling

### 20.1 Lagen

1. JSON/Ajv schema.
2. Numeric/fixed-point normalization.
3. Geometry validation.
4. Reference/asset validation.
5. Cross-document spatial validation.
6. Compile/partition validation.
7. Fragment size/hash validation.
8. Runtime construction validation.

### 20.2 Stabiele errorcodes

Minimaal:

```text
WORLD_SINGLETON_EXISTS
WORLD_MISSING
WORLD_GRID_IMMUTABLE
REGION_OVERLAP
REGION_BOUNDS_INVALID
REGION_CONTENT_OUTSIDE_BOUNDS
REGION_NOT_FOUND_AT_POSITION
AREA_GEOMETRY_INVALID
AREA_POLYGON_SELF_INTERSECTS
AREA_OUTSIDE_REGION
SURFACE_GEOMETRY_INVALID
SURFACE_OUTSIDE_REGION
SURFACE_Z_FIGHT_RISK
SURFACE_TRIANGULATION_FAILED
SPATIAL_OWNER_REQUIRED
SPATIAL_POSITION_OUTSIDE_REGION
START_REGION_INVALID
START_SPAWN_INVALID
MUSIC_TRACK_ASSET_REQUIRED
MUSIC_LOOP_RANGE_INVALID
PLAYLIST_EMPTY
PLAYLIST_REFERENCE_CYCLE
AUDIO_VARIANT_REQUIRED
AUDIO_DISTANCE_INVALID
CELL_FRAGMENT_TOO_LARGE
CELL_HASH_MISMATCH
CELL_BUILD_MISMATCH
CELL_LOAD_FAILED
REGION_RUNTIME_OVERLAP
AUDIO_LOCKED
AUDIO_DECODE_FAILED
PREVIEW_DIRTY_EDITOR
PREVIEW_SPAWN_REQUIRED
PREVIEW_BUILD_STALE
PREVIEW_SESSION_EXPIRED
PREVIEW_STATE_CONFLICT
PREVIEW_RESTORE_FAILED
```

Iedere issue bevat documentId/kind, JSON Pointer path, errorcode, menselijke Nederlandse tekst en relevante target/backlink. Geen stack/SQL/raw payload naar browser.

### 20.3 Last-known-good

- Failed compile maakt geen build/pointer.
- Failed Cell blijft buiten scene/collision.
- Failed audio mute alleen betrokken bron.
- Failed Preview entry keert terug naar herstelde Editor.
- Failed Preview exit probeert lokaal herstel door en biedt `Editor opnieuw laden` vanaf canonical draft, nooit `data weggooien`.

---

## 21. Security en resourcegrenzen

- Alle authoringmutations vereisen bestaande editorauth en Fase-1 concurrency.
- Runtime Cellroutes leveren alleen fragmenten van actieve of door dezelfde user gepinde Previewbuilds; ongepubliceerde builds zijn niet publiek raadbaar.
- Previewsession is minstens 128 bits random, user/project-bound en niet in URL-logs buiten route-ID.
- Audioasset URLs komen alleen uit `asset_library`.
- Geen payload levert arbitrary URL, shader, script of DOM HTML.
- Area polygon max 256 punten; Region/Area/document/API limits worden server-side afgedwongen.
- Max rootmanifest 8 MiB; max Cell 4 MiB; max Previewstate 1 MiB.
- Max 49 desired Cells en 81 resident hard cap.
- Max 64 actieve positional voices, 16 ambience/SFX voices per busprioriteitsgroep en 2 musicdecks.

---

## 22. Performancecontract

Doelhardware blijft Pentium 4417U/4 threads.

- Een streamingtick draait maximaal 10 Hz; renderloop niet blokkeren met spatial full scans.
- Region/Area lookup is O(candidates in Cell), niet O(alle Areas).
- Geen full-world JSON/download bij normale movement.
- Geen full scene clear/rebuild bij Cellwisseling.
- Max een GLB upload per frame.
- Attach p95 <=4 ms en detach p95 <=2 ms op acceptatieworld; overschrijdingen worden gemeten en job wordt vervolgd volgende frame.
- Resident Cells <=49 normaal en <=81 absolute cap.
- Debugoverlay uit heeft nagenoeg nul per-frame DOM writes.
- Hidden tab pauzeert render/physics/preload.
- Editor en Preview delen renderer/cache maar nooit twee actieve worlds/loops.

Deze doelen zijn acceptatiebudgets, geen belofte dat elk willekeurig zwaar asset 60 FPS haalt. Assetbudgetwarnings moeten het echte probleem zichtbaar maken.

---

## 23. Verplichte bestandsarchitectuur

```text
db/migrations/
  <next>_world_fragments_preview_sessions.sql

src/shared/authoring/kinds/
  world-definition-v1.js
  region-definition-v1.js
  area-definition-v1.js
  surface-patch-v1.js
  spawn-point-v1.js
  music-track-v1.js
  music-playlist-v1.js
  audio-event-v1.js
  placed-entity-v2.js

src/shared/world/
  fixed-spatial.js
  geometry.js
  region-area-resolver.js
  cell-grid.js
  world-runtime-contract.js

src/server/world/
  world-command-service.js
  world-query-service.js
  world-compiler.js
  world-fragment-repository.js
  legacy-world-importer.js
  preview-session-repository.js
  preview-session-service.js

apps/web/public/shared/world/
  cell-streaming-coordinator.js
  asset-residency-cache.js
  world-audio-director.js
  world-mode-controller.js
  preview-state-adapter.js

apps/web/public/editor/world-builder/
  world-builder-store.js
  world-builder-panel.js
  region-tool.js
  area-tool.js
  streaming-overlay.js

tests/
  fixed-spatial.test.js
  world-geometry.test.js
  region-area-resolver.test.js
  world-compiler.test.js
  world-streaming.test.js
  world-audio-director.test.js
  preview-session.test.js
  world-mode-controller.test.js
  world-cutover-integration.test.js
```

Browser/server duplicated math is verboden. De shared modules moeten browser-compatible pure ESM zijn en worden door servertests en browsercode daadwerkelijk uit dezelfde bron geleverd/bundled.

`world-runtime.js` wordt een coordinator/facade; nieuwe Region, streaming, audio en mode-state mogen niet opnieuw als duizenden regels inline worden toegevoegd.

---

## 24. Implementatiecheckpoints

### Checkpoint 2A - Spatial kernel en canonical documents

Levert:

- schemas/kinds, inclusief Surface Patch;
- fixed millimeter math;
- geometry normalization/containment;
- Region/Area commands en indexes;
- placed entity v2 migration;
- unit/repositorytests.

Gate:

- negative Cell math, half-open boundaries en polygons slagen;
- overlapping Regions kunnen niet committen;
- transfer over een Regionrand houdt exact dezelfde worldpositie;
- failed spatial command verandert revision/tables niet.

### Checkpoint 2B - Zichtbare Wereldbouwer

Levert:

- World-route;
- Region/Area/Surface/spawn tools;
- menselijke compact panels;
- boundary/label/selectie;
- object Region/Area-relaties;
- Save Draft/reload.

Kevinbewijs:

- twee Regions met echte grond en drie Areashapes tekenen;
- object over grens slepen;
- herladen behoudt exact vorm/positie;
- geen Nodes/raw IDs/JSON gebruikt.

### Checkpoint 2C - Fragmentcompile en streaming runtime

Levert:

- rootmanifest/Cellfragmenten/SQL/routes;
- scheduler/cache/budgets/render origin;
- streamingoverlay;
- draft en published runtimeconsumer.

Kevinbewijs:

- door meerdere Cells lopen;
- objecten verschijnen voor aankomst en verdwijnen vertraagd achter speler;
- geen dubbele roots/colliders/hit targets;
- failed Cell toont veilige loadinggrens.

### Checkpoint 2D - Muziek, ambience en spatial audio

Levert:

- canonical audio docs/editor;
- mixer/unlock/decks/PRNG;
- Region-/Area-resolve/hysterese/crossfade;
- audio emitter component;
- lifecycle/dispose.

Kevinbewijs:

- hoorbare Regionwissel;
- Area override/clear;
- snel grenspendelen zonder fladderen;
- spatial loop verandert met afstand en stopt na eviction;
- volume/mute en autoplay unlock werken.

### Checkpoint 2E - Geïsoleerde PlayPreview en cutover

Levert:

- preview session SQL/API;
- modecontroller/snapshot/entry/exit/recovery;
- sandbox adapters;
- legacy imports/shadow/parity/canonical guards;
- volledige lifecycle.

Kevinbewijs:

- instant Preview wanneer cached;
- bewegen/streaming/audio;
- Previewactie verandert echte state niet;
- exit herstelt camera/selectie/panels;
- refresh/recovery;
- published game toont dezelfde wereldbetekenis.

---

## 25. Verplichte testmatrix

### 25.1 Spatial math

- floorDiv voor `-64001,-64000,-1,0,63999,64000`.
- Region minimum/maximum/shared boundary.
- World<->local roundtrip exact in mm.
- Render-origin shift verandert worldposition niet.
- Box/cylinder/polygon boundary/y-max.
- Surface polygon triangulation/clipping en z-fight guard.
- CW polygon normaliseert gelijk aan CCW.
- Zelfsnijding/zero area/duplicate points rejected.

### 25.2 Commands/concurrency

- Region create/move/resize success en rollback.
- Concurrent overlapcreates: exact een success.
- Area replace invalid rollback.
- Placement transfer stale ETag faalt zonder move.
- Delete backlinks.
- Undo/Redo voor Region/Area geometry en transfer.

### 25.3 Compile/fragments

- Gelijke input -> gelijke root/fragmenthashes.
- Een Cellwijziging verandert alleen betrokken fragment(en) en root.
- Grote collider clipping.
- Iedere placement exact eenmaal owner/anchor Cell.
- Assetmanifest per Cell volledig.
- Fragment size gate.
- SQL build/pointer/fragments atomic rollback.

### 25.4 Streaming

- Desired 25+24 rond focus.
- Prioritytuple exact.
- Generation race kan oude Cell niet attachen.
- Abort prefetch.
- Retry/backoff/failed movement gate.
- Evictiondelay en re-entry.
- Shared asset refcount/dispose.
- Max concurrency/resident hard cap.
- Eén scene root per Cell.

### 25.5 Membership/audio

- Overlap priority/area/tie key.
- Dwell en exit hysterese.
- Teleport immediate resolve.
- Playlist sequential/shuffle/weighted deterministic vectors.
- Avoid immediate repeat.
- Selector cycle rejected.
- Crossfade curves begin/eind/interruption.
- Autoplay suspended/resume.
- Voice stealing/cooldown.
- Cell eviction stopt emitter en listeners.

### 25.6 Preview

- Dirty editor blokkeert.
- Pinned build blijft gelijk bij externe authoringedit.
- Previewmutation raakt geen player/authoringtables.
- State revision conflict.
- Double start/stop idempotent.
- Entryfailure herstelt Editor.
- Exit met workspacewijziging refresht en herstelt geldige selectie.
- Refresh resume/close.
- Expiry/cleanup/buildretention.
- Exact een renderer, loop, listener en keymapset.

### 25.7 Cutover

- Legacy zone/area/audio import idempotent.
- Placement unique owner blocker.
- Boundary semantic vectors gelijk.
- Graph revision race blokkeert finalize.
- Canonical mode blokkeert legacy mutations.
- Geen nieuwe graphrows door alle Kevin-acties.

---

## 26. Kevin-acceptatietest

Kevin gebruikt uitsluitend Werkbank, Instellingen, viewport en PlayPreview.

### A. World en Regions

1. Open `Werkbank | Wereld`.
2. Maak Region `Dorp` van 500 x 500 meter.
3. Maak aangrenzend Region `Bos` van 500 x 500 meter.
4. Laat bij beide Regions `Maak direct grond` aan en kies zichtbaar verschillende kleuren/textures.
5. Probeer ze te overlappen; bevestiging moet blokkeren en beide bestaande Regions blijven gelijk.
6. Save Draft en volledige refresh.
7. Controleer namen, grenzen, grond, walkable collision en aansluiting.

### B. Areas en objecten

8. Maak in Dorp een box `Dorpsplein`.
9. Maak een cylinder `Fontein`.
10. Maak een polygon `Markt`.
11. Probeer een zelfsnijdend polygon; bevestiging moet blokkeren.
12. Plaats echte GLB-objecten aan beide kanten van de Regiongrens.
13. Sleep één object van Dorp naar Bos en bevestig.
14. Refresh en controleer exact dezelfde wereldpositie en nieuwe menselijke Regionrelatie.

### C. Streaming

15. Zet Streamingdiagnostics aan.
16. Start Draft PlayPreview.
17. Loop minstens vier Cells in een richting.
18. Controleer required, prefetch en vertraagde eviction.
19. Loop terug; controleer geen dubbele modellen/collision/hit targets.
20. Controleer dat er nergens een leeg valgat verschijnt.

### D. Audio

21. Importeer twee echte audioassets.
22. Maak twee Music Tracks en twee Playlists.
23. Geef Dorp en Bos elk een playlist.
24. Geef Markt een Area-override en Fontein `clear` of eigen ambience.
25. Loop langzaam en snel over grenzen; hoor smooth crossfade zonder volumeklapperen.
26. Blijf rond een Arearand bewegen; muziek mag niet voortdurend herstarten.
27. Voeg een looping spatial Audio Event aan een object toe.
28. Loop ernaartoe en weg; afstand en Cell eviction moeten hoorbaar correct zijn.

### E. Preview-isolatie

29. Noteer editorcamera, selectie en objectpositie.
30. Start Preview, beweeg en activeer beschikbare sandboxinteractie.
31. Stop Preview.
32. Controleer camera, selectie, tool en panelen.
33. Controleer dat objectpositie en echte spelerstate niet door Preview zijn veranderd.
34. Start Preview opnieuw, refresh browser en kies Terug naar editor.
35. Controleer opnieuw herstel zonder dubbel geluid/input/worldroots.

### F. Publish

36. Publish.
37. Open published game en loop dezelfde route.
38. Controleer dezelfde Region-/Area-overgangen, modellen, collisions, streaming en audio.
39. Verwijder een ongebruikt Area en een audio emitter, publish opnieuw.
40. Controleer dat helper, emitter, audio en runtimeobject volledig weg zijn.
41. Controleer Legacy Nodes read-only en dat de acties geen graphnodes/edges hebben gemaakt.

---

## 27. Definition of Done

- [ ] Alle W-01..W-31 hebben geautomatiseerd of zichtbaar bewijs.
- [ ] Fase-1 authoringkern is daadwerkelijk aanwezig; Fase 2 bouwt niet tijdelijk terug op graphwrites.
- [ ] World/Region/Area/Surface/Spawn/audio schemas en commands zijn canonical.
- [ ] Spatial opslag is integer mm; render origin werkt.
- [ ] Regions zijn exclusief, Areas typed en boundarytests gedeeld.
- [ ] Rootmanifest/Cellfragmenten zijn deterministic en immutable.
- [ ] Streaming laadt/unloadt zonder full rebuild en respecteert budgets/caps.
- [ ] Movement kan geen ontbrekende Cell betreden.
- [ ] Echte Region-/Area-muziek, ambience en positional audio werken.
- [ ] Crossfades, hysterese, unlock en teardown zijn getest.
- [ ] PlayPreview is build-pinned en volledig van authoring/echte playerstate geïsoleerd.
- [ ] Editorrestore werkt bij normaal stoppen, fout en refresh.
- [ ] Legacy import/parity/afwijkingen zijn vastgelegd en domains canonical.
- [ ] Graph node/edge counts blijven gelijk tijdens canonical acceptatie.
- [ ] Draft en published runtime gebruiken dezelfde contracts.
- [ ] Kevin heeft sectie 26 volledig uitgevoerd en expliciet geaccepteerd.
- [ ] Fasedocument bevat implementatiecommit, checks, afwijkingen en acceptatiedatum.

Niet toegestaan als open eind:

- muziekrefs zonder hoorbare consumer;
- Areas als raw JSON;
- “Preview” als aparte pagina met tweede permanente world;
- volledige World reload bij iedere Cellgrens;
- objecten zonder Regionowner;
- stille nearest-Regionimport;
- Preview die echte inventory/quest/economy muteert;
- alleen localhost-/testbewijs zonder Kevins live bewijs;
- nieuwe node-types of verborgen graphwrites.

---

## 28. Bronnen en technische onderbouwing

Repositorybasis:

- Fase 1: `README/fases/MMORPG-basis/1 Canonieke authoringkern en node-cutover.md`
- `src/shared/node-types.js`
- `src/server/game-project-compiler.js`
- `src/server/catalog-compiler.js`
- `src/server/graph-repository.js`
- `src/server/publish-service.js`
- `apps/web/public/shared/world-runtime.js`
- `apps/web/public/editor/editor.js`
- `README/fases/NODE-02-Zones-Areas-Entity-Composition-Spawns-Travel-Minimap.md`
- `README/fases/NODES-LEGACY-WERKBANK-INSTELLINGEN-PLAN.md`

Normatieve/externe bronnen:

- Web Audio API 1.1: <https://www.w3.org/TR/webaudio/>
- MDN Web Audio best practices/autoplay: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices>
- MDN `AudioContext.resume()`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume>
- MDN `AudioParam`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioParam>
- Three.js `AudioListener`: <https://threejs.org/docs/pages/AudioListener.html>
- Three.js `PositionalAudio`: <https://threejs.org/docs/pages/PositionalAudio.html>
- Three.js `AudioLoader`: <https://threejs.org/docs/pages/AudioLoader>
- Three.js `WebGLRenderer`: <https://threejs.org/docs/pages/WebGLRenderer.html>
- MDN AbortController: <https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort>
- MDN Page Visibility API: <https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API>

SQLite-, canonical JSON-, JSON Schema-, JSON Pointer- en HTTP-concurrencynormen worden geërfd uit Fase 1.

---

## 29. Eindstatement

Na acceptatie van Fase 2 bestaat GK uit één zichtbaar authored World met exact bepaalde Regions, overlappende betekenisvolle Areas en afgeleide gestreamde Cells. Spatial data blijft op grote afstanden exact doordat canonical posities fixed-point zijn en de renderer rond een verschuivende origin werkt. Muziek en ambience zijn geen dode catalogvelden meer, maar hoorbare deterministische runtimecontent. PlayPreview is geen kopie van de editor en geen gevaarlijke gameverbinding: het is een build-pinned sandbox die dezelfde renderer, worldcontracts en Cellruntime gebruikt en daarna de Editor aantoonbaar schoon herstelt.

Een latere feature mag Regions, Areas, Cells, audio of Preview uitsluitend via deze canonical documents, compilerfragmenten en runtimecoordinators uitbreiden. Zij mag geen tweede wereldkaart, eigen spatial math, verborgen nodeketen, losse audioplayer of alternatieve Previewstate invoeren.
