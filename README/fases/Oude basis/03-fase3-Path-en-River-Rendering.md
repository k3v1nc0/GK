# Fase 3 - Path en River Rendering

Regie-versie: 2026-06-24
Status: actief fasecontract voor Codex-runs
Voorwaarde: Fase 1 en Fase 2 zijn klaar en akkoord

## Doel

Maak de terrain-data uit Fase 1 en de getekende punten/shapes uit Fase 2 zichtbaar als lichte editor/game visuals.

Fase 3 gaat over visuele feedback:

- gras/steen/modder/village-square lagen zichtbaar maken als simpele terrain overlays;
- zandpaden en stenen paden zichtbaar maken als lichte vlakke ribbons over de ground;
- water/rivieren zichtbaar maken als lichte vlakke water-ribbons over/lager dan de ground;
- dezelfde published world data gebruiken in editor preview en `/game/`;
- geen gameplay collision, navmesh, terrain deformation of chunk streaming toevoegen.

Kevin moet na Fase 3 kunnen:

- een `terrain_layer` met `shapeType: "full"` zien als brede basis/overlay op de ground;
- `terrain_layer.material`, `color`, `opacity`, `priority` en `textureAssetId` als simpele visual hints terugzien;
- een `terrain_layer` met `shapeType: "polygon"` zien als simpel vlak/polygon overlay als er punten zijn;
- een `path_layer` met minimaal 2 punten zien als zandpad of stenen pad;
- `path_layer.width`, `pathType`, `edgeBlend`, `yOffset` en `slightlySunken` visueel terugzien als simpele render-hints;
- een `water_layer` met minimaal 2 punten zien als rivier/waterstrook;
- `waterType: "river"`, `waterType: "lake"` en `waterType: "pond"` als dezelfde waterfamilie zichtbaar houden;
- `water_layer.width`, `y`, `color` en `flowSpeed` als simpele visuele hints terugzien;
- de editor-paint handles uit Fase 2 bovenop of naast deze visuals blijven gebruiken;
- Save To Game doen en dezelfde visuele paden/water/terrain overlays in `/game/` zien;
- controleren dat water/blockers/walkable surfaces nog geen runtime movement-effect hebben.

## Wat Fase 3 bewust niet doet

Fase 3 maakt visuals, geen gameplayregels.

Niet doen:

- geen navmesh;
- geen pathfinding;
- geen physics engine;
- geen runtime collision;
- geen speler blokkeren door water;
- geen speler blokkeren door `blocker_area`;
- geen brug/walkable movement logic;
- geen terrain deformation;
- geen echte hoogtevervorming van de ground mesh;
- geen chunk compiler;
- geen chunk streaming;
- geen zware water shader;
- geen reflecties/refractions;
- geen postprocessing;
- geen realistische rivierstroming;
- geen triangulated GLB collision;
- geen automatische GLB blocker/walkable;
- geen demo content;
- geen seeded wereld;
- geen hardcoded pad, rivier, plein of brug;
- geen grote editor redesign;
- geen texture/material authoring systeem.

Als Codex een van deze dingen toch bouwt, is Fase 3 niet akkoord.

## Fase 1 en 2 basis waarop Fase 3 voortbouwt

Fase 1 publiceert:

```js
terrain: {
  layers: [],
  paths: [],
  waters: []
},
collision: {
  blockers: [],
  walkableSurfaces: []
}
```

Fase 2 laat Kevin deze data authoren via editor tools:

- `path_layer.points`
- `water_layer.points`
- `blocker_area.points`
- `walkable_surface.x/z`

Fase 3 mag vooral deze published world data lezen:

```js
world.terrain.layers
world.terrain.paths
world.terrain.waters
```

Fase 3 mag `world.collision.blockers` en `world.collision.walkableSurfaces` hooguit als editor/debug visual laten bestaan als dat al logisch is, maar de verplichte scope is path/water/terrain rendering. Geen collisiongedrag.

## Kernregel

De published world blijft de bron voor game visuals.

```text
Editor node values -> Save To Game -> /api/game/world -> shared world-runtime renders visuals
```

Niet:

```text
Editor overlay state -> game runtime visual
```

De editor mag draft preview gebruiken via bestaande editor world/draft flow, maar `/game/` mag alleen published world data renderen.

## Verwachte bestanden

Controleer en pas alleen aan wat nodig is:

- `apps/web/public/shared/world-runtime.js`
- eventueel `apps/web/public/editor/editor.js` alleen als editor preview refresh/selectie status nodig is
- eventueel `apps/web/public/editor/styles.css` alleen voor kleine debug/toggle/status styling
- eventueel `apps/web/public/game/game.js` alleen als loading/diagnostic foutafhandeling nodig is
- `scripts/smoke-test.js` alleen voor data/publish regressie; smoke kan WebGL visuals waarschijnlijk niet volledig bewijzen
- eventueel een kleine browser/manual evidence doc onder `docs/fases/evidence/fase-03-path-river-rendering/`

Niet verwacht:

- geen server datamodel refactor;
- geen database migration;
- geen publish-service refactor tenzij Fase 1 output echt ontbreekt;
- geen nieuwe heavy dependency;
- geen physics/navmesh dependency;
- geen large rendering framework.

Als Codex toch server/publish files moet aanpassen, moet hij eerst uitleggen welke bestaande bug dat noodzakelijk maakt.

## Rendering locatie

Gebruik bij voorkeur de shared runtime:

```text
apps/web/public/shared/world-runtime.js
```

Waarom:

- editor en game gebruiken dezelfde runtime;
- Fase 3 visuals moeten in editor preview en `/game/` hetzelfde voelen;
- Game Output/publish blijft leidend;
- je voorkomt dubbele renderlogica.

Aanbevolen runtime-structuur:

```js
const terrainVisualGroup = new THREE.Group();
content.add(terrainVisualGroup);

function clearTerrainVisuals() {}
function buildTerrainVisuals(world) {}
function buildTerrainLayerVisual(layer, ground) {}
function buildPathVisual(path) {}
function buildWaterVisual(water) {}
```

De exacte namen mogen afwijken, maar de verantwoordelijkheden moeten helder zijn.

## Lifecycle regels

Terrain visuals moeten schoon worden beheerd.

Regels:

- Maak een aparte group voor runtime terrain visuals.
- Clear/dispose die group bij `setWorld()` voordat nieuwe visuals worden gebouwd.
- Dispose geometries/materials/textures waar nodig.
- Terrain visuals mogen niet blijven hangen na world refresh.
- Terrain visuals moeten zowel in editor mode als game mode werken.
- Editor-only handles uit Fase 2 blijven editor-only en moeten apart blijven van runtime terrain visuals.
- Runtime terrain visuals mogen niet als editor handles behandeld worden.
- Runtime terrain visuals mogen geen GLB/entity selection verstoren.

## Render/performance regels

Fase 3 moet licht blijven.

Toegestaan:

- simpele `THREE.Mesh` vlak/ribbon geometries;
- simpele `THREE.BufferGeometry` of `THREE.ShapeGeometry`;
- simpele `MeshBasicMaterial` of lichte `MeshStandardMaterial`;
- texture map voor `terrain_layer.textureAssetId` als dat al via asset manifest beschikbaar is;
- transparantie voor water;
- render on world change / editor refresh.

Niet toegestaan:

- permanente zware animatieloop alleen voor water;
- high-poly terrain mesh;
- real-time boolean terrain cutting;
- expensive triangulation library;
- postprocessing;
- shader pipeline bouwen;
- physics/collision shapes.

Performance acceptatie:

- 10 paths met 20 punten mogen de editor niet merkbaar zwaar maken.
- 5 waters met 20 punten mogen de editor niet merkbaar zwaar maken.
- Terrain visuals worden bij `setWorld()` in een keer opgebouwd en daarna rustig gelaten.
- Fase 3 mag geen honderden draw calls veroorzaken voor simpele worlds.

## Z-fighting en hoogte

Paden/water/overlays liggen vlak bij de ground. Z-fighting moet worden voorkomen.

Aanbevolen:

- Gebruik een kleine Y offset boven de ground voor path/terrain overlays.
- Respecteer `path_layer.yOffset` als visuele offset.
- Respecteer `water_layer.y` als waterhoogte.
- Als `water_layer.y` ontbreekt, gebruik een kleine fallback onder/naast de ground zonder crash.
- Terrain layer full overlays liggen net boven ground.
- Gebruik material polygonOffset of kleine y offset als nodig.

Belangrijk:

- `slightlySunken` betekent in Fase 3 alleen een visuele hint, geen echte ground deformation.
- Water lager tonen mag visueel, maar mag de ground mesh niet werkelijk uitsnijden.

## Data normalisatie

Fase 3 moet defensief omgaan met data.

Regels:

- `points` moet array zijn.
- Ongeldige points worden genegeerd of veilig gefilterd.
- Path/water met minder dan 2 geldige punten renderen niet en crashen niet.
- Terrain polygon met minder dan 3 geldige punten rendert niet en crasht niet.
- Width <= 0 gebruikt veilige fallback of rendert niet.
- Kleuren worden gevalideerd met fallback.
- Texture asset ontbreekt: fallback color gebruiken.
- Asset loading failure: fallback color gebruiken en eventueel runtime load warning tonen.

Nooit:

- NaN in geometry stoppen;
- null points laten crashen;
- ongeldige texture het hele world renderen laten stoppen.

## `terrain_layer` rendering

### Doel

`terrain_layer` wordt zichtbaar als simpele materiaal/paint overlay bovenop `Ground Surface`.

Dit maakt duidelijk dat `terrain_layer` geen duplicaat is van `ground_surface`:

```text
Ground Surface = basis canvas/vloer
Terrain Layer = verflaag/materiaalgebied bovenop dat canvas
```

### Supported fields

```js
id
label
material
priority
opacity
color
textureAssetId
shapeType
points
```

### Material

`material` kiest een eenvoudige visuele preset voor de overlay. Het is een renderhint, geen gameplayregel.

Aanbevolen presets:

```js
grass         -> groene, natuurlijke basis
sand          -> warm beige / zandkleur
stone         -> koel grijs / steenachtig
mud           -> donkerbruin / modderig
flowers       -> iets levendiger, maar nog steeds sober
village_square -> licht steenachtig of bestrating-achtig
```

Gedrag:

- `color` blijft de primaire tint.
- `material` bepaalt de basislook of fallback-stijl wanneer er geen texture is.
- `textureAssetId` mag de preset verfijnen als de asset al beschikbaar is.
- `priority` blijft leidend voor overlap; `material` verandert geen z-order.

### `shapeType: "full"`

Gedrag:

- Toon een vlak over de ground bounds.
- Gebruik `material` als visuele preset voor de overlay.
- Gebruik `color` en `opacity`.
- Als `textureAssetId` bestaat en asset in manifest zit, mag texture worden gebruikt.
- Als texture ontbreekt of faalt, gebruik fallback color.
- Full terrain layer mag niet de ground mesh vervangen; het is een overlay.

### `shapeType: "polygon"`

Gedrag:

- Bij minimaal 3 punten: toon simpel polygon overlay.
- Gebruik `color`, `opacity`, `priority`.
- Polygon hoeft niet perfect complex/self-intersecting te ondersteunen.
- Als polygon triangulation te ingewikkeld wordt, support alleen simpele niet-kruisende polygons en documenteer dat.
- Geen brush painting in Fase 3.

### Priority

- Render layers gesorteerd op `priority` laag naar hoog.
- Hogere priority ligt visueel boven lagere priority.
- Gebruik kleine y offsets of renderOrder om overlap zichtbaar te houden.

### Niet doen

- Geen terrain deformation.
- Geen echte material blending shader.
- Geen texture painting UI.
- Geen brush tool.

## `path_layer` rendering

### Doel

`path_layer` wordt zichtbaar als simpele vlakke ribbon langs de getekende punten.

### Supported fields

```js
id
label
pathType
width
edgeBlend
yOffset
slightlySunken
speedMultiplier
points
```

### Visual per pathType

Aanbevolen defaults:

```js
sand  -> zandkleur, bijvoorbeeld #c8a968
stone -> grijs/steen kleur, bijvoorbeeld #8f9296
```

Gedrag:

- Minimaal 2 punten nodig.
- Maak een vlakke ribbon langs de polyline.
- Gebruik `width` als breedte.
- Gebruik `yOffset` als hoogte-offset boven ground.
- `slightlySunken` mag visueel worden aangeduid door lagere yOffset, donkerder rand of subtiele tint, maar niet door echte terrain deformation.
- `edgeBlend` mag in Fase 3 simpel blijven: bijvoorbeeld opacity/tint/geen effect. Geen zware shader nodig.
- `speedMultiplier` blijft data; geen movement effect.

### Geometry eenvoud

Voldoende voor Fase 3:

- Per segment een rechthoek/quad maken tussen twee punten.
- Segment joins hoeven niet perfect rond of professioneel te zijn.
- Overlap bij bochten is acceptabel zolang het pad zichtbaar en bruikbaar is.
- Later polish kan joins/randen verbeteren.

Niet verplicht:

- perfecte miter joins;
- rounded caps;
- decals;
- splinesmoothing;
- blending met terrain material.

### Editor interactie

- Fase 2 handles moeten zichtbaar/bruikbaar blijven boven het path visual.
- Het path visual mag handle-picking niet blokkeren.
- Het path visual mag model selection niet verstoren.

## `water_layer` rendering

### Doel

`water_layer` wordt zichtbaar als simpele rivier/waterstrook langs de getekende punten.

### Supported fields

```js
id
label
waterType
width
y
color
flowSpeed
blocksPlayer
points
```

### Visual

Gedrag:

- Minimaal 2 punten nodig voor `waterType: "river"`.
- `waterType: "lake"` en `waterType: "pond"` mogen dezelfde lichte waterrenderer gebruiken zolang het visueel duidelijk water blijft.
- `waterType` mag hooguit subtiele verschillen aanbrengen in breedte, opacity of randtint; geen extra gameplaylogica.
- Maak een vlakke water ribbon langs de polyline.
- Gebruik `width` als breedte.
- Gebruik `y` als hoogte.
- Gebruik `color` als waterkleur.
- Gebruik transparantie, bijvoorbeeld opacity 0.55-0.75.
- `flowSpeed` mag in Fase 3 alleen subtiel data/visual hint zijn; animatie is optioneel en mag geen zware renderloop forceren.
- `blocksPlayer` blijft data; geen runtime movement/collision.
- Geen water dat stilletjes uit de render valt alleen omdat `blocksPlayer` of `waterType` anders is dan `river`.

### Geen zware water shader

Niet doen:

- reflecties;
- refractions;
- screen-space effects;
- normals/waves shader als nieuw systeem;
- animated flow textures als dat zware loop of dependency vraagt.

Een simpele blauwe transparante ribbon is voldoende voor Fase 3.

## `blocker_area` en `walkable_surface` in Fase 3

Fase 3 hoeft geen gameplay collision te maken.

Aanbevolen:

- Laat Fase 2 editor-only outlines bestaan in editor mode.
- In game mode hoeven blockers/walkable surfaces niet zichtbaar te zijn, tenzij Codex een debug-only toggle toevoegt.
- Geen visible debug overlays standaard in `/game/`, want Kevin wil fantasy world visuals, geen permanent debugbeeld.

Als Codex toch debug visuals toevoegt:

- default uit in game mode;
- duidelijk debug-only;
- geen movement/collision effect;
- geen styling alsof het final art is.

## Asset/texture gebruik

`terrain_layer.textureAssetId` mag gebruikt worden als texture overlay als:

- de asset in `world.assets` manifest zit;
- het asset type image/texture is;
- de bestaande texture loader gebruikt kan worden zonder nieuwe zware systemen.

Regels:

- Texture ontbreekt: fallback color.
- Texture loading faalt: fallback color + load warning, geen crash.
- Texture repeat mag simpel zijn of default.
- Geen texture painter bouwen.
- Geen material editor bouwen.

Path/water hoeven in Fase 3 nog geen texture assets te gebruiken, want hun Fase 1 schema heeft geen textureAssetId.

## Editor/game verschil

De runtime visual van terrain/path/water mag in beide modes verschijnen.

Editor mode:

- toont terrain/path/water runtime visuals;
- toont daarnaast Fase 2 editor handles voor geselecteerde node;
- handles moeten boven/naast visuals bruikbaar blijven.

Game mode:

- toont terrain/path/water runtime visuals;
- toont geen Fase 2 handles;
- toont geen authoring toolbar;
- gebruikt alleen published world data.

## Publish/data regels

Fase 3 mag publish niet omzeilen.

Regels:

- Editor draft preview mag draft world gebruiken zoals bestaande editor flow dat doet.
- Game mode gebruikt alleen `/api/game/world`.
- Visuals worden gebouwd uit `world.terrain`.
- Losse unconnected nodes mogen niet in game visuals verschijnen, want ze horen niet in published world.
- Geen hardcoded fallback rivier/pad toevoegen als er geen terrain data is.
- Als `world.terrain` leeg is, render gewoon geen terrain overlays.

## Error handling

Fase 3 moet stil en veilig falen.

Voorbeelden:

- Geen `world.terrain`: geen overlays, geen crash.
- `terrain.paths` ontbreekt: geen paden, geen crash.
- Path met 1 punt: niet renderen, geen crash.
- Water met ongeldige color: fallback kleur.
- Texture asset ontbreekt: fallback kleur.
- Geometry build krijgt NaN: item overslaan en waarschuwing/log alleen als bestaande runtime dat patroon heeft.

## Smoke/check tests

Verplicht draaien:

```bash
npm run check
npm run smoke
```

Smoke kan WebGL visual output waarschijnlijk niet volledig bewijzen. Toch moet smoke minimaal blijven bewijzen:

- terrain/path/water data publiceert correct;
- `/api/game/world` bevat terrain arrays;
- lege worlds zonder terrain blijven werken;
- bestaande asset manifest blijft werken wanneer terrain_layer textureAssetId gebruikt wordt;
- geen regressie in publish.

Als er al een lichte browser/screenshot test bestaat, mag Codex een beperkte visual smoke toevoegen. Niet eerst een groot testframework introduceren.

## Handmatige acceptatie - Terrain Layer

Kevin test:

1. Maak of selecteer `terrain_layer`.
2. Zet `shapeType` op `full`.
3. Kies een opvallende `color`, bijvoorbeeld groen of grijs.
4. Save Draft.
5. Save To Game.
6. Controleer editor preview: de ground krijgt een duidelijke overlay/tint.
7. Open `/game/`.
8. Controleer dat dezelfde tint/laag zichtbaar is.
9. Verander `opacity`.
10. Save To Game.
11. Controleer dat opacity zichtbaar verandert.
12. Verander `material`, bijvoorbeeld van `grass` naar `stone` of `sand`.
13. Controleer dat de overlay nog steeds rendert en een andere visuele preset krijgt.
14. Maak desnoods een tweede `terrain_layer` met hogere `priority` en controleer dat die boven de lagere laag ligt.

Optioneel polygon-test als ondersteund:

1. Zet `shapeType` op `polygon`.
2. Zorg dat `points` minimaal 3 punten bevat.
3. Save To Game.
4. Controleer dat alleen het polygongebied zichtbaar is.

## Handmatige acceptatie - Path Layer

Kevin test:

1. Maak of selecteer `path_layer`.
2. Teken minimaal 3 punten met Fase 2 tools.
3. Zet `pathType` op `sand`.
4. Zet `width` duidelijk zichtbaar, bijvoorbeeld 3 of 5.
5. Save Draft.
6. Save To Game.
7. Controleer editor preview: zandpad/ribbon zichtbaar langs punten.
8. Open `/game/`.
9. Controleer dat hetzelfde pad zichtbaar is.
10. Verander `pathType` naar `stone`.
11. Save To Game.
12. Controleer dat de kleur/stijl verandert naar steenachtig.
13. Verander `width`.
14. Controleer dat de padbreedte verandert.
15. Verander `yOffset` en controleer dat de ribbon iets hoger/lager ligt zonder z-fighting.
16. Verander `slightlySunken` of `edgeBlend`.
17. Controleer dat de ribbon subtiel anders oogt of in elk geval netjes blijft zonder crash.
18. Controleer dat speler niet sneller/langzamer beweegt door `speedMultiplier`.

## Handmatige acceptatie - Water Layer

Kevin test:

1. Maak of selecteer `water_layer`.
2. Teken minimaal 3 punten met Fase 2 tools.
3. Zet `width` duidelijk zichtbaar, bijvoorbeeld 5 of 8.
4. Kies `color`, bijvoorbeeld blauw.
5. Zet `y` lager dan ground, bijvoorbeeld -0.15.
6. Save Draft.
7. Save To Game.
8. Controleer editor preview: water/rivierstrook zichtbaar langs punten.
9. Open `/game/`.
10. Controleer dat dezelfde waterstrook zichtbaar is.
11. Verander `color`.
12. Save To Game.
13. Controleer dat waterkleur verandert.
14. Controleer dat speler nog niet wordt geblokkeerd door water, ook niet als `blocksPlayer: true` staat.
15. Verander `waterType` naar `lake` of `pond`.
16. Controleer dat het nog steeds als water zichtbaar blijft.
17. Verander `flowSpeed`.
18. Controleer dat er geen zware animatieloop ontstaat en dat de watervisual stabiel blijft.

## Handmatige acceptatie - Editor handles blijven werken

Kevin test na rendering:

1. Selecteer een `path_layer` met zichtbaar pad.
2. Gebruik Fase 2 handles om een punt te verplaatsen.
3. Controleer dat de zichtbare path ribbon meebeweegt of na commit/refresh correct update.
4. Selecteer `water_layer` en verplaats een punt.
5. Controleer dat water visual update.
6. Controleer dat de handles nog klikbaar zijn en niet verstopt zitten onder het visual mesh.
7. Controleer dat model_entity selectie/transform nog werkt.

## Handmatige acceptatie - Geen gameplay effect

Kevin test:

1. Zet een water_layer over de spelerroute.
2. Publiceer.
3. Open `/game/`.
4. Loop door het water.
5. Speler mag niet geblokkeerd worden.
6. Zet een blocker_area rond de spelerroute.
7. Publiceer.
8. Speler mag nog niet geblokkeerd worden.
9. Zet walkable_surface over water.
10. Publiceer.
11. Er mag nog geen speciale brug/walkable gameplay zijn.

Als movement al verandert, is Fase 3 buiten scope gegaan.

## Algemene acceptatie

Kevin mag Fase 3 pas akkoord geven als:

- terrain_layer full overlay zichtbaar is of bewust als niet-verplicht/uitgesteld is gerapporteerd;
- terrain_layer.material geeft een herkenbaar andere preset of tint wanneer je tussen bijvoorbeeld grass, sand, stone en mud wisselt;
- path_layer zichtbaar wordt als eenvoudige ribbon;
- water_layer zichtbaar wordt als eenvoudige water ribbon;
- waterType river/lake/pond blijft zichtbaar als water en verdwijnt niet uit de render;
- visuals zichtbaar zijn in editor preview;
- visuals zichtbaar zijn in `/game/` na Save To Game;
- visuals verdwijnen of updaten wanneer points/data veranderen;
- Fase 2 handles blijven werken;
- game mode toont geen editor handles;
- speler wordt niet geblokkeerd door water/blockers;
- walkable surface heeft nog geen gameplay effect;
- bestaande GLB assets blijven renderen;
- bestaande model transform/selectie blijft werken;
- geen demo content is toegevoegd;
- geen chunking/streaming/navmesh/physics is toegevoegd;
- `npm run check` groen is;
- `npm run smoke` groen is.

## Afkeurcriteria

Fase 3 is niet akkoord als:

- Codex terrain/path/water visuals hardcoded maakt in plaats van uit `world.terrain` te lezen;
- Codex demo content toevoegt;
- Codex `/game/` draft data laat lezen;
- Codex runtime collision toevoegt;
- Codex navmesh/pathfinding toevoegt;
- Codex physics toevoegt;
- Codex terrain deformation toevoegt;
- Codex chunk compiler/streaming toevoegt;
- Codex GLB mesh collision toevoegt;
- Codex water/path visuals alleen in editor toont maar niet in `/game/` na publish;
- Codex editor handles zichtbaar laat in `/game/`;
- Codex Fase 2 point editing breekt;
- Codex model selection/transform breekt;
- Codex zware shaders/postprocessing toevoegt;
- `npm run check` of `npm run smoke` faalt.

## Wat Kevin na Fase 3 nog niet moet verwachten

Nog niet verwachten:

- perfecte padranden;
- zachte material blending;
- echt verzonken terrein;
- water physics;
- speler collision met water;
- speler collision met blockers;
- bruggen die echt movement overrulen;
- chunk streaming;
- performance counters;
- final art kwaliteit.

Wel verwachten:

- getekende paden zijn zichtbaar;
- getekende rivieren/waterlijnen zijn zichtbaar;
- terrain layers beginnen visueel betekenis te krijgen;
- editor en game tonen dezelfde published terrain visuals;
- de projectrichting blijft data-driven via nodes en Game Output.

---

# Complete Codex Prompt Voor Fase 3

Gebruik onderstaande prompt letterlijk voor de worker-run.

```text
Codex, voer alleen Fase 3 - Path en River Rendering uit.

Voorwaarde:
Fase 1 Terrain Layers Datamodel bestaat en is akkoord.
Fase 2 Editor Paint Tools bestaat en is akkoord.
De bestaande node types zijn:
- terrain_layer
- path_layer
- water_layer
- blocker_area
- walkable_surface

Lees eerst:
- README/fases/03-fase3-Path-en-River-Rendering.md
- apps/web/public/shared/world-runtime.js
- apps/web/public/editor/editor.js
- apps/web/public/game/game.js
- src/shared/node-types.js
- src/server/publish-service.js
- scripts/smoke-test.js

Doel:
Maak de gepubliceerde terrain-data zichtbaar als lichte runtime visuals in editor preview en /game/:
- terrain_layer als simpele ground overlay/material layer;
- path_layer als vlakke path ribbon;
- water_layer als vlakke water/rivier ribbon.

Werk alleen aan Fase 3.
Fase 4 t/m 6 zijn alleen context en mogen nu niet worden gebouwd.

Niet doen:
- geen navmesh;
- geen pathfinding;
- geen physics engine;
- geen runtime movement/collision gedrag;
- geen speler blokkeren door water;
- geen blocker_area gameplay collision;
- geen walkable_surface gameplay logic;
- geen terrain deformation;
- geen chunk compiler;
- geen chunk streaming;
- geen zware water shader;
- geen reflecties/refractions/postprocessing;
- geen GLB mesh collision;
- geen GLB automatisch blocker/walkable maken;
- geen demo content;
- geen seeded game content;
- geen grote editor redesign;
- geen server datamodel refactor tenzij een bestaande Fase 1 bug dat noodzakelijk maakt.

Taken:
1. Voeg in de shared world-runtime een aparte terrain visual group toe.
2. Bouw/clear/dispose terrain visuals bij setWorld()/refresh.
3. Render terrain_layer:
   - shapeType full als simpele overlay over ground bounds;
   - shapeType polygon als simpele polygon overlay bij minimaal 3 geldige punten, als dit licht kan;
   - gebruik material als simpele visuele preset;
   - gebruik color/opacity/priority/textureAssetId met fallback color.
4. Render path_layer:
   - minimaal 2 punten;
   - simpele flat ribbon langs points;
   - width bepaalt breedte;
   - pathType sand/stone bepaalt kleur/stijl;
   - yOffset voorkomt z-fighting;
   - speedMultiplier blijft data, geen movement effect.
5. Render water_layer:
   - minimaal 2 punten;
   - simpele transparante flat ribbon langs points;
   - river is de hoofdcase, lake/pond blijven dezelfde lichte waterfamilie;
   - width bepaalt breedte;
   - y bepaalt hoogte;
   - color bepaalt kleur;
   - blocksPlayer blijft data, geen movement effect.
6. Zorg dat visuals zichtbaar zijn in editor mode en game mode omdat beide shared runtime gebruiken.
7. Zorg dat Fase 2 editor handles editor-only blijven en niet in /game/ verschijnen.
8. Zorg dat terrain/path/water visuals handle picking en model selection niet breken.
9. Zorg dat invalid/empty terrain data niet crasht.
10. Geen hardcoded fallback pad/rivier/terrain toevoegen als world.terrain leeg is.
11. Draai npm run check en npm run smoke.

Acceptatie:
- terrain_layer full overlay is zichtbaar of expliciet gerapporteerd als bewust minimale/fallback support.
- terrain_layer.material geeft een herkenbaar andere preset of tint wanneer je tussen bijvoorbeeld grass, sand, stone en mud wisselt.
- path_layer met 2+ punten rendert als zichtbare ribbon in editor preview.
- path_layer rendert na Save To Game ook in /game/.
- pathType sand/stone geeft onderscheidbare kleur/stijl.
- width verandert zichtbare breedte.
- water_layer met 2+ punten rendert als transparante water ribbon in editor preview.
- water_layer rendert na Save To Game ook in /game/.
- waterType river/lake/pond blijft zichtbaar als water en verdwijnt niet uit de render.
- water color en width zijn zichtbaar.
- Fase 2 handles blijven bruikbaar boven/naast visuals.
- Editor handles verschijnen niet in /game/.
- Speler wordt niet geblokkeerd door water/blocker.
- walkable_surface heeft nog geen movement effect.
- Geen chunking/navmesh/physics/terrain deformation toegevoegd.
- Geen demo content toegevoegd.
- npm run check groen.
- npm run smoke groen.

Oplevering:
Leg exact uit:
1. Welke bestanden zijn aangepast.
2. Welke runtime functions/groups zijn toegevoegd.
3. Hoe terrain visuals worden opgebouwd en opgeruimd.
4. Hoe path ribbon geometry werkt.
5. Hoe water ribbon geometry werkt.
6. Hoe terrain_layer overlay werkt.
7. Hoe z-fighting wordt voorkomen.
8. Hoe invalid/empty data veilig wordt genegeerd.
9. Wat Kevin in de editor moet controleren.
10. Wat Kevin in /game/ moet controleren.
11. Bewijs dat geen Fase 4/5/6 werk is meegenomen.
12. Resultaat van npm run check.
13. Resultaat van npm run smoke.

Stop en meld het als Fase 3 niet netjes kan worden gedaan zonder eerst een bestaande bug in Fase 1 publish, Fase 2 handles, setWorld lifecycle of shared runtime te repareren.
```
