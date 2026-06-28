# Fase 2 - Editor Paint Tools

Regie-versie: 2026-06-24
Status: actief fasecontract voor Codex-runs
Voorwaarde: Fase 1 - Terrain Layers Datamodel is klaar en akkoord

## Doel

Maak een simpele, lichte en controleerbare editor workflow waarmee Kevin in de 3D editor viewport punten en basis-shapes kan authoren voor de Fase 1 nodes.

Fase 2 gaat over authoring, niet over mooie terrain rendering en niet over gameplay collision.

Kevin moet na Fase 2 kunnen:

- een `path_layer` selecteren;
- punten op de grond klikken voor een pad;
- bestaande path-punten selecteren en verslepen;
- path-punten verwijderen;
- een `water_layer` selecteren;
- punten op de grond klikken voor een rivier/waterlijn;
- waterpunten selecteren en verslepen;
- waterpunten verwijderen;
- een `blocker_area` met `shapeType: "polygon"` selecteren;
- polygonpunten klikken, verslepen en verwijderen;
- vanaf minimaal 3 punten een gesloten blocker-outline zien;
- een `walkable_surface` selecteren;
- een simpele rechthoek-outline zien voor brug/platform/walkable intentie;
- die rechthoek als geheel over de grond verplaatsen door het centrum te slepen;
- width/depth/rotationY/y/priority via inspector blijven aanpassen;
- Save Draft doen;
- editor reloaden;
- de getekende punten/shapes terugzien.

## Wat Fase 2 bewust niet doet

Fase 2 maakt geen eindresultaat in de gamewereld. Het maakt editor-tools waarmee Kevin data kan maken.

Niet doen:

- geen chunk streaming;
- geen chunk compiler;
- geen path/water/terrain rendering voor game mode;
- geen realistische water shader;
- geen terrain deformation;
- geen zandpad dat de ground mesh echt verlaagt;
- geen navmesh;
- geen pathfinding;
- geen runtime collision;
- geen player movement blokkeren;
- geen walkable bridge runtime gedrag;
- geen automatische GLB collision;
- geen GLB automatisch blocker of walkable maken;
- geen mesh edit mode;
- geen vertex/face editing van GLB modellen;
- geen grote Blender-toolset;
- geen grote editor redesign;
- geen nieuw groot paneel;
- geen demo content;
- geen seeded wereld;
- geen hardcoded pad, rivier, brug of blocker.

Als Codex een van deze dingen toch bouwt, is Fase 2 niet akkoord.

## Fase 1 basis waarop Fase 2 voortbouwt

Fase 1 heeft deze node types opgeleverd:

- `terrain_layer`
- `path_layer`
- `water_layer`
- `blocker_area`
- `walkable_surface`

Fase 2 gebruikt vooral deze velden:

```js
path_layer.points
water_layer.points
blocker_area.points
blocker_area.x
blocker_area.z
walkable_surface.x
walkable_surface.y
walkable_surface.z
walkable_surface.width
walkable_surface.depth
walkable_surface.rotationY
```

Fase 2 mag deze velden bijwerken via bestaande editor save/patch-mechaniek. Fase 2 mag het Fase 1 datamodel niet opnieuw ontwerpen.

## Kernregel

De node blijft de bron van waarheid.

```text
Viewport handle beweging -> node values patch -> draft graph -> Save Draft -> reload toont dezelfde node values
```

Niet:

```text
Viewport overlay eigen losse state -> publish/game gebruikt verborgen state
```

De editor overlay mag tijdelijke drag-preview hebben, maar na click/add/delete/pointerup moet de echte data teruggeschreven zijn naar de geselecteerde node values.

## Verwachte bestanden

Controleer en pas alleen aan wat nodig is:

- `apps/web/public/editor/editor.js`
- `apps/web/public/editor/styles.css`
- `apps/web/public/shared/world-runtime.js`
- eventueel `apps/web/public/editor/index.html` als er een kleine toolbar/compacte statusregel nodig is
- `scripts/smoke-test.js` alleen als API/data regressie of nieuwe browser-onafhankelijke dataflow kan worden getest

Niet verwacht:

- geen server datamodel refactor;
- geen publish-service refactor tenzij Fase 1 incompleet blijkt;
- geen nieuwe database migration;
- geen new physics/navmesh dependency;
- geen heavy UI framework.

Als Codex toch server/datamodel files moet aanpassen, moet hij eerst uitleggen welke Fase 1-bug dat noodzakelijk maakt.

## Editor UX principe

Geen groot nieuw paneel.

Toon alleen compacte terrain paint/edit tools wanneer de geselecteerde node een van deze types is:

- `path_layer`
- `water_layer`
- `blocker_area`
- `walkable_surface`

Voor alle andere nodes blijft de editor zoals hij was.

De tool moet voelen als een klein contextueel hulpmiddel, niet als een nieuwe editor-app.

## Compacte toolbar

Wanneer een geschikte node geselecteerd is, toon een compacte toolbar bij de viewport of in de bestaande editor toolbar.

Naam:

```text
Terrain Tool
```

Modes:

```text
Select | Add Point | Move Point | Delete Point
```

Aanbevolen knoppen:

- Select
- Add
- Move
- Delete
- Clear Active Tool of Escape support

Gebruik geen groot zijpaneel. Gebruik geen lange uitlegtekst in de UI. Korte labels en statusregel zijn genoeg.

## Statusregel

De editor moet kort tonen wat actief is.

Voorbeelden:

```text
Path Layer - Add Point: click ground to add point
Water Layer - Move Point: drag a handle, release to save
Blocker Area - Delete Point: click a handle to remove it
Walkable Surface - Move: drag center handle, release to save
```

De statusregel moet vooral helpen als Kevin niet weet of hij in Select, Add, Move of Delete zit.

## Keyboard gedrag

Minimaal:

- `Escape` stopt de actieve terrain tool en keert terug naar Select.
- `Delete` of `Backspace` verwijdert het geselecteerde punt als een punt geselecteerd is.
- `Delete` of `Backspace` mag geen hele node verwijderen wanneer focus op een terrain handle ligt.
- Tekstinvoer in inspector mag niet worden onderbroken door terrain hotkeys.

Niet verplicht in Fase 2:

- volledige undo/redo;
- Blender-style G/R/S;
- keyboard constraints;
- snapping.

Als undo/redo al bestaat, mag Codex erop aansluiten. Als het niet bestaat, mag Fase 2 geen groot command-history systeem introduceren.

## Viewport picking

Fase 2 heeft een ground picking helper nodig.

Doel:

```text
clientX/clientY -> ground/world positie -> { x, z }
```

In `world-runtime.js` of bestaande runtime editor API:

- raycast vanuit camera door muispositie;
- snijpunt met editor ground plane of bestaande ground mesh;
- return `{ x, z }`;
- return `null` als er geen geldig snijpunt is.

Belangrijke regels:

- Picking gebruikt editor mode.
- Picking mag de game mode niet beinvloeden.
- Picking mag geen collision/navmesh gebruiken.
- Picking mag geen GLB meshes als terrain waarheid gebruiken.
- Als de grond niet bestaat, moet de editor een nette status/error geven, niet crashen.

## Editor overlays

Fase 2 gebruikt lichte Three.js editor helpers.

Toegestaan:

- `THREE.Line` voor polylines;
- `THREE.LineLoop` voor polygon/rectangle outlines;
- kleine simpele `THREE.Mesh` handles, bijvoorbeeld kleine spheres/discs;
- basic materials;
- editor-only overlay group;
- raycast tegen handles voor select/move/delete.

Niet toegestaan:

- zware terrain mesh generatie;
- DecalGeometry als terrain engine;
- water shader;
- physics bodies;
- navmesh debug geometry;
- game-mode rendering van deze handles;
- permanente scene objects die niet worden opgeruimd.

## Overlay lifecycle

Editor overlays moeten schoon worden beheerd.

Regels:

- Maak een aparte editor overlay group, bijvoorbeeld `terrainEditorOverlay`.
- Rebuild overlay wanneer de geselecteerde node of zijn values veranderen.
- Ruim overlay op bij node deselectie.
- Ruim overlay op bij `setWorld()` of world refresh.
- Ruim overlay op wanneer runtime naar game mode gaat.
- Handles mogen nooit in `/game/` zichtbaar worden.
- Overlay state mag geen publish source zijn.

## Render/performance

Kevin gebruikt een oude laptopklasse machine, dus Fase 2 moet licht blijven.

Regels:

- Geen zware permanente renderloop speciaal voor terrain editing.
- Render alleen wanneer nodig: selectie verandert, mode verandert, punt toegevoegd, punt bewogen, punt verwijderd, pointermove tijdens actieve drag.
- Tijdens drag mag lokaal live-previewen.
- Server patch alleen op commitmoment, niet op elke pointermove.
- Geen honderden PATCH requests tijdens slepen.
- Handles en lijnen blijven simpel en laag in count.

Performance acceptatie:

- Een path met 20 punten blijft soepel selecteerbaar en versleepbaar.
- Pointermove tijdens drag voelt direct omdat het lokaal previewt.
- Network/server save gebeurt pas bij click add/delete of pointerup.

## Data patch regels

Gebruik de bestaande editor node update-flow, bijvoorbeeld:

```js
patchValues(node.id, { points: nextPoints })
```

Voor `walkable_surface`:

```js
patchValues(node.id, { x: nextX, z: nextZ })
```

Voor Fase 2 geldt:

- Add point: 1 patch na click.
- Delete point: 1 patch na delete click/key.
- Move point: lokale preview tijdens drag, 1 patch op pointerup.
- Move walkable rectangle: lokale preview tijdens drag, 1 patch op pointerup.
- Escape tijdens drag: lokale preview terugzetten, geen patch.
- Als patch faalt: overlay terugzetten naar node values en fout tonen.

## Selectie en mode-state

De editor moet onderscheid maken tussen:

- geselecteerde graph node;
- actieve terrain tool mode;
- geselecteerde point index;
- actieve drag state.

Aanbevolen state:

```js
terrainTool: {
  mode: "select" | "add" | "move" | "delete",
  selectedPointIndex: null,
  draggingPointIndex: null,
  dragStartPoints: null,
  dragStartSurface: null
}
```

Deze state is editor-only. Hij mag niet in publish output terechtkomen.

Wanneer geselecteerde node verandert:

- reset mode naar `select` of behoud mode alleen als dat veilig is;
- clear selectedPointIndex;
- clear drag state;
- rebuild overlay voor nieuwe node;
- hide terrain toolbar als node geen supported terrain edit type is.

## `path_layer` gedrag

### Doel

Kevin kan een pad tekenen als polyline op de grond.

### Supported fields

```js
points: [ { x, z }, ... ]
width
pathType
edgeBlend
yOffset
slightlySunken
speedMultiplier
```

Fase 2 wijzigt alleen `points` via viewport. De andere velden blijven inspector-velden.

### Overlay

- Toon een lijn door alle punten.
- Toon kleine handles op elk punt.
- Gebruik zand/steen-achtige editor kleur, bijvoorbeeld warm geel/bruin.
- Toon geen echte padbreedte mesh als hoofdfeature.
- Een simpele width-hint lijn/outline mag alleen als zeer licht debughulpmiddel, maar is niet verplicht.

### Modes

Select:

- Click handle selecteert punt.
- Click lege grond doet niets.

Add Point:

- Click ground voegt `{ x, z }` toe aan einde van `points`.
- Patch direct na click.
- Status toont nieuw aantal punten.

Move Point:

- Pointer down op handle start drag.
- Pointermove verplaatst handle/lijn lokaal.
- Pointerup patcht hele `points` array een keer.
- Escape tijdens drag annuleert.

Delete Point:

- Click handle verwijdert dat punt.
- Patch direct na delete.
- Delete/Backspace verwijdert geselecteerd punt.

Validatieverwachting:

- Draft mag minder dan 2 punten hebben.
- Publish kan blijven falen tot minimaal 2 punten verbonden zijn met Game Output. Dat is correct.

## `water_layer` gedrag

### Doel

Kevin kan een rivier/waterlijn tekenen als polyline op de grond.

### Supported fields

```js
points: [ { x, z }, ... ]
width
waterType
y
color
flowSpeed
blocksPlayer
```

Fase 2 wijzigt alleen `points` via viewport. De andere velden blijven inspector-velden.

### Overlay

- Toon blauwe lijn door alle punten.
- Toon blauwe/cyaan handles op elk punt.
- Toon geen water shader.
- Toon geen echte watermesh.
- Toon geen runtime blocking.

### Modes

Zelfde als `path_layer`:

- Select handle;
- Add point op ground click;
- Move point met drag;
- Delete point via click/key.

Belangrijke waarschuwing:

- `blocksPlayer: true` blijft in Fase 2 alleen data. De speler mag nog niet geblokkeerd worden door de rivier.

## `blocker_area` gedrag

### Doel

Kevin kan een verboden/blokkerend gebied tekenen als polygon-intentie.

### Supported fields

```js
shapeType
points
x
z
width
depth
radius
reason
```

Fase 2 ondersteunt viewport point editing alleen voor:

```js
shapeType: "polygon"
```

Voor `box` en `circle` mag Fase 2 simpele outlines tonen op basis van x/z/width/depth/radius, maar polygon editing hoeft alleen voor polygon.

### Overlay voor polygon

- Toon punt-handles.
- Toon lijn tussen punten.
- Vanaf 3 punten: toon gesloten polygon outline met `LineLoop`.
- Gebruik oranje/amber debugkleur.
- Toon eventueel lichte transparante fill alleen als het goedkoop en netjes is; niet verplicht.

### Modes

Select:

- Click handle selecteert punt.

Add Point:

- Click ground voegt polygonpunt toe aan einde van `points`.
- Patch direct na click.

Move Point:

- Drag handle verplaatst punt lokaal.
- Patch op pointerup.

Delete Point:

- Click handle verwijdert punt.
- Delete/Backspace verwijdert geselecteerd punt.

Validatieverwachting:

- Draft mag 0, 1 of 2 punten hebben.
- Publish van verbonden polygon blocker mag falen tot er minimaal 3 punten zijn. Dat is correct.

Belangrijk:

- Blocker polygon blokkeert in Fase 2 nog geen speler.
- Geen physics body.
- Geen navmesh obstacle.

## `walkable_surface` gedrag

### Doel

Kevin kan een walkable intentie-rectangle zien en als geheel plaatsen, bijvoorbeeld voor een brugdek.

### Supported fields

```js
x
y
z
width
depth
rotationY
priority
```

### Overlay

- Toon rectangle outline op basis van x/z/width/depth/rotationY.
- Toon center handle.
- Gebruik collision/walkable kleur, bijvoorbeeld licht amber of groen-amber.
- Toon geen mesh-platform.
- Toon geen echte walkable/collision runtime.

### Modes

Select:

- Click center handle selecteert walkable surface.

Move Point:

- Drag center handle verplaatst `x` en `z` lokaal.
- Pointerup patcht `{ x, z }` een keer.

Add Point:

- Voor walkable_surface betekent Add Point niet echt een punt toevoegen.
- Aanbevolen gedrag: click ground plaatst/centreert de rectangle op die `{ x, z }` en patcht `{ x, z }`.

Delete Point:

- Niet van toepassing op walkable_surface.
- Delete mag geen node verwijderen.
- Status moet zeggen dat walkable_surface geen punten heeft; gebruik inspector of selecteer node om te verwijderen.

Resize:

- Niet verplicht in Fase 2.
- Width/depth/rotationY blijven via inspector.

## `terrain_layer` gedrag in Fase 2

Fase 2 hoeft `terrain_layer` nog niet volledig te painten.

Minimale regel:

- `terrain_layer` mag alleen een eenvoudige polygon outline/points overlay krijgen als `shapeType === "polygon"` en dit zonder extra complexiteit kan.
- Maar de verplichte scope van Fase 2 is `path_layer`, `water_layer`, `blocker_area`, `walkable_surface`.

Waarom:

- Terrain painting/brush voor gras/steen-vlakken kan snel te groot worden.
- Fase 2 moet eerst het point/shape authoring fundament bewijzen.

Als Codex `terrain_layer` polygon editing meeneemt, moet het dezelfde lichte point-tool gebruiken en geen brush/texture painting bouwen.

## Conflict met bestaande viewport tools

Fase 2 moet bestaande model selection/transform zo veel mogelijk met rust laten.

Regels:

- Terrain editing activeert alleen wanneer een supported terrain/collision node geselecteerd is.
- Als een `model_entity` geselecteerd is, blijven bestaande transform controls leidend.
- Terrain handles moeten pointer events kunnen afvangen zonder model transform te breken.
- Tijdens terrain drag moeten OrbitControls/viewport camera controls tijdelijk uit of genegeerd worden, zodat de camera niet meesleept.
- Na pointerup/cancel moeten camera controls terug aan.
- Terrain overlay mag geen GLB object selecteren.
- GLB object selectie mag geen terrain point verslepen.

## Error handling

Fase 2 moet helder falen.

Voorbeelden:

- Geen ground/pick target: status toont `No ground hit` of Nederlandse variant.
- Ongeldige points JSON in inspector: overlay toont niets of veilige fallback, editor crasht niet.
- Patch faalt: status toont fout, overlay reset naar laatste node values.
- Node wordt verwijderd tijdens edit: overlay cleanup, tool hidden.
- Editor refresh tijdens drag: drag cancel, overlay rebuild.

## Data normalisatie

Points blijven simpele data:

```js
{ x: number, z: number }
```

Regels:

- Geen y in points voor path/water/blocker polygon in Fase 2.
- Rond niet agressief af. Kleine decimalen zijn ok.
- Geen `THREE.Vector3` objecten in node values opslaan.
- Geen circular/complex JS objects in JSON fields.
- Geen viewport-only metadata in points opslaan.

## Save/reload gedrag

Fase 2 is pas nuttig als data na reload terugkomt.

Voor elke supported node:

- teken of verplaats data;
- Save Draft;
- reload editor;
- selecteer node opnieuw;
- overlay moet overeenkomen met node values;
- Save To Game moet nog steeds werken als node voldoet aan Fase 1 validatie.

## Smoke/check tests

Verplicht draaien:

```bash
npm run check
npm run smoke
```

Omdat Fase 2 vooral browser/viewport-interactie is, kan smoke-test mogelijk niet alles bewijzen. Toch moet Codex minimaal zorgen dat bestaande API/publish flow niet breekt.

Als er al een browser test framework aanwezig is, mag Codex een kleine browser smoke toevoegen voor:

- selected path node toont terrain toolbar;
- add point via helper/callback wijzigt points;
- move point commit patcht pas op pointerup.

Als er geen browser test framework is, niet eerst een groot testframework introduceren. Rapporteer dan dat handmatige viewport acceptance nodig is.

## Handmatige acceptatie - Path Layer

Kevin test:

1. Maak of selecteer `path_layer`.
2. Controleer dat compacte Terrain Tool verschijnt.
3. Kies `Add Point`.
4. Klik drie punten op de grond.
5. Controleer dat je drie handles en een lijn ziet.
6. Controleer inspector JSON: `points` bevat drie `{ x, z }` punten.
7. Kies `Move Point`.
8. Sleep het middelste punt.
9. Laat muis los.
10. Controleer dat de lijn is aangepast.
11. Save Draft.
12. Reload editor.
13. Selecteer dezelfde path node.
14. Controleer dat de drie punten terugkomen op de juiste plek.
15. Save To Game.
16. Controleer dat `/api/game/world.terrain.paths[0].points` klopt.

## Handmatige acceptatie - Water Layer

Kevin test:

1. Maak of selecteer `water_layer`.
2. Kies `Add Point`.
3. Klik minimaal twee punten op de grond.
4. Controleer dat je blauwe/cyaan handles en lijn ziet.
5. Versleep een punt.
6. Save Draft.
7. Reload editor.
8. Controleer dat de punten terugkomen.
9. Save To Game.
10. Controleer dat `/api/game/world.terrain.waters[0].points` klopt.
11. Controleer dat de speler nog niet wordt geblokkeerd door water.

## Handmatige acceptatie - Blocker Area

Kevin test:

1. Maak of selecteer `blocker_area`.
2. Zet `shapeType` op `polygon`.
3. Kies `Add Point`.
4. Klik drie punten op de grond.
5. Controleer dat de polygon sluit vanaf punt 3.
6. Versleep een punt.
7. Verwijder een punt.
8. Voeg opnieuw een punt toe.
9. Save Draft.
10. Reload editor.
11. Controleer dat polygonpunten terugkomen.
12. Save To Game.
13. Controleer dat `/api/game/world.collision.blockers[0].points` klopt.
14. Controleer dat de speler nog niet echt wordt geblokkeerd.

## Handmatige acceptatie - Walkable Surface

Kevin test:

1. Maak of selecteer `walkable_surface`.
2. Controleer dat een rectangle outline zichtbaar is.
3. Pas `width`, `depth` en `rotationY` aan in inspector.
4. Controleer dat rectangle outline meeverandert.
5. Kies `Move Point` of `Add Point` volgens implementatie.
6. Sleep center handle of klik ground om centrum te verplaatsen.
7. Controleer dat inspector `x` en `z` wijzigen.
8. Save Draft.
9. Reload editor.
10. Controleer dat de rectangle op dezelfde plek terugkomt.
11. Save To Game.
12. Controleer dat `/api/game/world.collision.walkableSurfaces[0]` klopt.
13. Controleer dat de brug/walkable surface nog geen runtime movement-effect heeft.

## Algemene handmatige acceptatie

Kevin mag Fase 2 pas akkoord geven als:

- de Terrain Tool alleen verschijnt bij supported terrain/collision nodes;
- path points tekenen werkt;
- water points tekenen werkt;
- blocker polygon tekenen werkt;
- walkable surface outline zichtbaar en plaatsbaar is;
- handles niet in game mode zichtbaar zijn;
- Save Draft werkt;
- reload de data terugbrengt;
- Save To Game werkt;
- `/api/game/world` de aangepaste points/positions bevat;
- bestaande model selection/transform niet kapot is;
- camera/orbit controls na terrain editing nog werken;
- er geen demo-content is toegevoegd;
- er geen runtime collision is toegevoegd;
- er geen water/path/terrain rendering als game feature is toegevoegd;
- `npm run check` groen is;
- `npm run smoke` groen is.

## Afkeurcriteria

Fase 2 is niet akkoord als:

- Codex een grote nieuwe editor layout maakt;
- Codex een brush/paint systeem voor materials bouwt in plaats van simpele point tools;
- Codex water/path/terrain meshes als game rendering toevoegt;
- Codex navmesh, physics of movement collision toevoegt;
- Codex GLB geometry gebruikt als collision source;
- Codex Game Output/publish omzeilt;
- Codex viewport-only data opslaat die niet in node values zit;
- Codex patcht op elke pointermove;
- Codex handles zichtbaar laat in game mode;
- Codex bestaande model transform/selection breekt;
- Save Draft/reload de punten verliest;
- Save To Game faalt voor geldige Fase 1 data;
- `npm run check` of `npm run smoke` faalt.

## Wat Kevin na Fase 2 nog niet moet verwachten

Nog niet verwachten:

- mooi zandpad in de game;
- mooie rivier in de game;
- terrain dat echt lager/hoger wordt;
- water dat speler blokkeert;
- blocker area die speler tegenhoudt;
- brug die speler echt laat oversteken;
- streaming/chunks;
- performance counters;
- polished final terrain UI.

Wel verwachten:

- Kevin kan terrain/path/water/collision-intentie in de viewport tekenen en aanpassen;
- die intentie blijft bewaard in node values;
- publish bevat de juiste data;
- Fase 3 kan deze data gebruiken voor visuals;
- Fase 4 kan deze data gebruiken voor gameplay/collision.

---

# Complete Codex Prompt Voor Fase 2

Gebruik onderstaande prompt letterlijk voor de worker-run.

```text
Codex, voer alleen Fase 2 - Editor Paint Tools uit.

Voorwaarde:
Fase 1 Terrain Layers Datamodel bestaat al en is akkoord.
De bestaande node types zijn:
- terrain_layer
- path_layer
- water_layer
- blocker_area
- walkable_surface

Lees eerst:
- README/fases/02-fase2-Editor-Paint-Tools.md
- apps/web/public/editor/editor.js
- apps/web/public/editor/styles.css
- apps/web/public/shared/world-runtime.js
- src/shared/node-types.js
- src/server/publish-service.js
- scripts/smoke-test.js

Doel:
Kevin moet in de editor viewport punten en simpele shapes kunnen tekenen en aanpassen voor:
- path_layer
- water_layer
- blocker_area
- walkable_surface

Werk alleen aan Fase 2.
Fase 3 t/m 6 zijn alleen context en mogen nu niet worden gebouwd.

Niet doen:
- geen chunk streaming;
- geen chunk compiler;
- geen water shader;
- geen path/water/terrain game rendering;
- geen terrain deformation;
- geen navmesh;
- geen pathfinding;
- geen physics engine;
- geen runtime movement/collision gedrag;
- geen automatische GLB collision;
- geen GLB automatisch blocker/walkable maken;
- geen mesh edit mode;
- geen grote Blender-toolset;
- geen grote UI redesign;
- geen demo content;
- geen seeded game content;
- geen server datamodel refactor tenzij Fase 1 incompleet blijkt.

Taken:
1. Detecteer selected node type:
   - path_layer
   - water_layer
   - blocker_area
   - walkable_surface
2. Toon alleen voor deze nodes een compacte Terrain Tool.
3. Voeg tool modes toe:
   - Select
   - Add Point
   - Move Point
   - Delete Point
4. Voeg in editor/runtime editor mode een ground picking helper toe:
   - clientX/clientY naar { x, z }
   - return null als geen ground hit
5. Voeg editor-only overlays toe:
   - polyline + handles voor path_layer
   - blauwe/cyaan polyline + handles voor water_layer
   - polygon outline + handles voor blocker_area shapeType polygon
   - rectangle outline + center handle voor walkable_surface
6. Zorg dat overlays en handles alleen in editor mode zichtbaar zijn, nooit in game mode.
7. Zorg dat overlays worden opgeruimd bij selected node change, setWorld/refresh, deselect en game mode.
8. Klikgedrag:
   - Add Point op path/water/blocker voegt punt toe aan points
   - Move Point sleept lokaal en patcht pas op pointerup
   - Delete Point verwijdert punt met 1 patch
   - Escape annuleert actieve tool/drag
   - Delete/Backspace verwijdert geselecteerd punt, niet per ongeluk de node
9. Walkable surface gedrag:
   - toon rectangle outline op basis van x/y/z/width/depth/rotationY
   - center handle slepen wijzigt x/z
   - patch alleen op pointerup
   - width/depth/rotationY blijven via inspector
10. Performance:
   - niet patchen op elke pointermove
   - live preview lokaal
   - render alleen on change/drag
   - geen zware renderloop
11. Houd bestaande mesh selection/transform zoveel mogelijk intact.
12. Zorg dat Save Draft/reload de gemaakte points/shapes terugbrengt.
13. Draai npm run check en npm run smoke.

Acceptatie:
- Path node selecteren en punten tekenen werkt.
- Path punt verslepen werkt en patcht pas op pointerup.
- Path punt verwijderen werkt.
- Water node selecteren en punten tekenen werkt.
- Water punt verslepen/verwijderen werkt.
- Blocker polygon tekenen werkt en sluit visueel vanaf 3 punten.
- Walkable surface outline is zichtbaar en center kan worden verplaatst.
- Save Draft werkt.
- Reload behoudt points en walkable x/z.
- Save To Game werkt.
- /api/game/world bevat de gewijzigde points/positions na publish.
- Editor handles verschijnen niet in /game/.
- Bestaande model selection/transform is niet kapot.
- Geen runtime collision/navmesh/physics toegevoegd.
- Geen path/water/terrain game rendering toegevoegd.
- Geen demo content toegevoegd.
- npm run check groen.
- npm run smoke groen.

Oplevering:
Leg exact uit:
1. Welke bestanden zijn aangepast.
2. Welke editor/runtime callbacks zijn toegevoegd.
3. Hoe ground picking werkt.
4. Hoe overlay cleanup werkt.
5. Hoe patch-on-pointerup werkt.
6. Hoe Kevin path_layer test.
7. Hoe Kevin water_layer test.
8. Hoe Kevin blocker_area test.
9. Hoe Kevin walkable_surface test.
10. Bewijs dat geen Fase 3/4/5/6 werk is meegenomen.
11. Resultaat van npm run check.
12. Resultaat van npm run smoke.

Stop en meld het als Fase 2 niet netjes kan worden gedaan zonder eerst een bestaande bug in selectie, viewport controls, patchValues of Fase 1 datamodel te repareren.
```
