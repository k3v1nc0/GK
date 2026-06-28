# Fase 4 - Collision, Water en Bruggen

Regie-versie: 2026-06-24
Status: actief fasecontract voor Codex-runs
Voorwaarde: Fase 1, Fase 2 en Fase 3 zijn klaar of expliciet voldoende gerepareerd voor gameplay-checks

## Doel

Maak de gepubliceerde terrain/collision intentie-data uit Fase 1 t/m 3 voor het eerst betekenisvol voor runtime movement.

Fase 4 gaat over simpele, lichte gameplay-walkability:

- `water_layer.blocksPlayer === true` maakt water niet-walkable;
- `blocker_area` maakt verboden gebieden niet-walkable;
- `walkable_surface` maakt juist een rechthoekig gebied walkable, ook boven water;
- paden en terrain layers blijven alleen visual/data en veranderen movement nog niet behalve als later expliciet gekozen;
- visuals blijven gescheiden van gameplayregels;
- GLB meshes blijven nooit automatisch collision/navmesh.

Kevin moet na Fase 4 kunnen:

- een rivier tekenen met `water_layer`;
- `blocksPlayer` aanzetten;
- Save To Game doen;
- in `/game/` merken dat de speler niet door het water kan;
- een `walkable_surface` over het water plaatsen;
- Save To Game doen;
- merken dat de speler wel over het walkable rectangle kan;
- een `blocker_area` polygon tekenen;
- merken dat de speler niet door dat gebied kan;
- controleren dat brug-GLB visuals niet automatisch gameplay zijn zonder walkable_surface;
- controleren dat rots/berg-GLB visuals niet automatisch blocker zijn zonder blocker_area.

## Wat Fase 4 bewust niet doet

Fase 4 is geen volwaardig navmesh- of physics-systeem.

Niet doen:

- geen navmesh bouwen;
- geen pathfinding bouwen;
- geen physics engine toevoegen;
- geen Rapier/Ammo/Cannon/PhysX of vergelijkbare dependency toevoegen;
- geen mesh-triangle collision uit GLB's;
- geen automatische collision uit model bounds;
- geen automatische walkable bridge uit brug-GLB;
- geen automatische blocker uit rots/berg-GLB;
- geen terrain deformation;
- geen ground mesh uitsnijden voor water;
- geen chunk compiler;
- geen chunk streaming;
- geen multiplayer/server-authoritative movement;
- geen advanced slope/heightfield movement;
- geen grote editor redesign;
- geen demo content;
- geen seeded wereld;
- geen hardcoded pad, rivier, brug of blocker.

Als Codex een van deze dingen toch bouwt, is Fase 4 niet akkoord.

## Harde architectuurregel

Niet:

```text
GLB mesh = collision/navmesh/walkable gameplay
```

Wel:

```text
Visuals = mooi beeld
Nodes/shapes = gameplay regels
Published read-model = runtime input
```

Concreet:

- Water visual blokkeert niets tenzij `water_layer.blocksPlayer === true` in published data staat.
- Rots/berg model blokkeert niets tenzij er een `blocker_area` is.
- Brug model is niet beloopbaar tenzij er een `walkable_surface` ligt.
- `walkable_surface` kan boven water lopen toestaan zonder dat de brug-GLB zelf collision heeft.

## Data waarop Fase 4 werkt

Fase 4 gebruikt published world data:

```js
world.terrain.waters
world.collision.blockers
world.collision.walkableSurfaces
```

Relevante fields:

```js
water_layer: {
  id,
  waterType,
  width,
  y,
  blocksPlayer,
  points
}

blocker_area: {
  id,
  shapeType,
  x,
  z,
  width,
  depth,
  radius,
  points,
  reason
}

walkable_surface: {
  id,
  x,
  y,
  z,
  width,
  depth,
  rotationY,
  priority
}
```

Fase 4 mag geen nieuwe source of truth maken naast deze data.

## Verwachte bestanden

Controleer en pas alleen aan wat nodig is:

- `apps/web/public/shared/world-runtime.js`
- eventueel `scripts/smoke-test.js` als runtime-independent geometry helpers exporteerbaar/testbaar zijn zonder grote refactor
- eventueel `apps/web/public/editor/editor.js` alleen voor kleine debug/status/toggle als nodig
- eventueel `apps/web/public/editor/styles.css` alleen voor kleine debug UI styling
- eventueel `README/fases/04-fase4-Collision-Water-en-Bruggen.md` of evidence docs

Niet verwacht:

- geen database migration;
- geen server publish refactor tenzij Fase 1 output ontbreekt;
- geen node schema refactor tenzij een veld ontbreekt;
- geen game.js rewrite;
- geen nieuwe dependency.

Als Codex server/schema files moet aanpassen, moet hij eerst aantonen welke Fase 1/3 bug dit noodzakelijk maakt.

## Runtime locatie

Gebruik de shared runtime:

```text
apps/web/public/shared/world-runtime.js
```

Waarom:

- `/game/` gebruikt de shared runtime;
- editor preview kan dezelfde movement/debug logica later gebruiken;
- de published world blijft de enige runtime bron;
- we voorkomen dubbele gameplay code.

Aanbevolen structuur:

```js
function buildWalkabilityIndex(world) {}
function clearWalkabilityIndex() {}
function canMoveTo(position) {}
function isPointBlockedByWater(x, z) {}
function isPointBlockedByBlocker(x, z) {}
function isPointOnWalkableSurface(x, z, y) {}
function resolveMovement(start, desired) {}
```

De exacte namen mogen afwijken, maar de verantwoordelijkheden moeten duidelijk blijven.

## Walkability principe

Fase 4 gebruikt simpele punt/shape tests, geen navmesh.

Basisregel:

```text
1. Check desired player position.
2. Als desired position in walkable_surface valt: toestaan.
3. Anders als desired position in blocker_area valt: blokkeren.
4. Anders als desired position in water_layer met blocksPlayer valt: blokkeren.
5. Anders: toestaan.
```

Waarom walkable_surface eerst?

- Een brug/walkable surface moet water kunnen overrulen.
- Dit maakt het mogelijk om over een rivier te lopen als Kevin een brugdek/walkable rectangle plaatst.

Priority-regel:

- `walkable_surface.priority` mag gebruikt worden om meerdere walkable surfaces te sorteren.
- Voor Fase 4 is het genoeg dat elke matching walkable surface movement toestaat.
- Complexe layer priority voor all collision types is niet nodig.

## Player radius

De bestaande player heeft waarschijnlijk een `collisionRadius`.

Fase 4 mag minimaal alleen het spelercentrum testen.

Beter maar nog licht:

- test het centrum plus 4 of 8 samplepunten rondom de player radius;
- als een sample blocked is en niet door walkable_surface toegestaan wordt, movement blokkeren.

Aanbevolen voor Fase 4:

```text
center + four cardinal samples using player.radius
```

Niet doen:

- capsule physics;
- swept volume collision;
- continuous collision detection;
- rigid bodies.

Als alleen center getest wordt, moet Codex dit expliciet rapporteren als beperking.

## Movement-resolutie

Fase 4 hoeft geen slimme pathfinding te doen.

Minimaal acceptabel:

- Als desired movement geblokkeerd is: speler blijft op oude positie.

Beter maar nog simpel:

- Probeer X-only movement;
- probeer Z-only movement;
- als een van die twee kan, laat speler langs rand schuiven;
- anders blijf staan.

Aanbevolen:

```text
try desired -> try x-only -> try z-only -> stay
```

Niet doen:

- A*;
- navmesh path around obstacle;
- steering behavior;
- complex depenetration.

## Water collision

### Brondata

```js
world.terrain.waters[]
```

Alleen water met:

```js
blocksPlayer === true
```

mag movement blokkeren.

### Shape

Voor `waterType: "river"`:

- gebruik `points` als polyline;
- gebruik `width` als collisionbreedte;
- punt is in water als afstand tot polyline-segment <= width / 2.

Voor `waterType: "lake"` en `"pond"`:

- als er 3+ points zijn, mag Codex ze als polygon behandelen;
- als er maar 2 points zijn, behandel als ribbon zoals river;
- als er onvoldoende points zijn, blokkeer niets en crash niet.

### Belangrijk

- Water visual en water collision mogen dezelfde shape-data gebruiken, maar blijven gescheiden functies.
- `water_layer.y` is visual/height data; Fase 4 movement is top-down x/z en hoeft y niet complex te gebruiken.
- Water blokkeert alleen game movement, niet editor camera/selection.

## Blocker collision

### Brondata

```js
world.collision.blockers[]
```

### `shapeType: "polygon"`

- Gebruik `points` als polygon.
- Punt-in-polygon test.
- 3+ geldige punten nodig.
- Ongeldige polygon: overslaan, geen crash.

### `shapeType: "box"`

- Gebruik `x`, `z`, `width`, `depth`.
- Axis-aligned box is genoeg in Fase 4.
- Rotation is niet in Fase 1 schema voor blocker_area, dus niet verzinnen.

### `shapeType: "circle"`

- Gebruik `x`, `z`, `radius`.
- Punt is blocked als afstand <= radius.

### Reason

`reason` is debug/meta data:

- mountain;
- gap;
- wall;
- cliff;
- forbidden.

Fase 4 hoeft per reason geen ander gedrag te bouwen.

## Walkable surface override

### Brondata

```js
world.collision.walkableSurfaces[]
```

### Shape

- Rechthoek gecentreerd op `x`, `z`.
- Afmetingen: `width`, `depth`.
- Rotatie: `rotationY`.
- Punt-in-rotated-rectangle test.

### Override gedrag

Als desired player position binnen een walkable_surface valt:

- movement toestaan;
- ook als dezelfde x/z binnen water valt;
- ook als dezelfde x/z binnen blocker valt, tenzij later anders ontworpen.

Voor Fase 4 is dit simpel:

```text
walkable_surface wint boven water/blocker
```

Waarom:

- Een brugdek moet boven een rivier kunnen werken.
- Een platform moet boven een verboden/lagere zone kunnen werken.

### Y/hoogte

Fase 4 mag y simpel houden:

- use x/z rectangle match only;
- `y` blijft vooral visual/height intentie.

Niet doen:

- echte multi-level collision;
- jump/fall/height transitions;
- slope walking.

Rapporteer deze beperking duidelijk.

## Editor/debug feedback

Fase 4 hoeft geen grote UI te bouwen.

Toegestaan:

- kleine debug toggle in editor/game alleen als al logisch aanwezig;
- console/debug info tijdens development;
- status text als movement geblokkeerd wordt, alleen als niet storend.

Niet toegestaan:

- groot collision debug paneel;
- editor redesign;
- permanent debug overlays in `/game/`;
- blocker/walkable visuals als final art.

Belangrijk:

- Fase 2 editor outlines blijven handig voor authoring.
- Fase 4 gameplay collision hoeft niet zichtbaar te zijn in game mode.
- Kevin test collision door ertegenaan te lopen.

## Data normalisatie en veiligheid

Fase 4 moet defensief zijn.

Regels:

- Ontbrekende `world.terrain`: geen water blockers, geen crash.
- Ontbrekende `world.collision`: geen blockers/walkables, geen crash.
- Ongeldige points: item overslaan.
- Width/depth/radius <= 0: item overslaan.
- NaN nooit in geometry of collision math gebruiken.
- Empty arrays: geen crash.
- Als published world oude schema heeft zonder collision/terrain, game blijft werken.

## Performance

Fase 4 blijft klein.

Aanbevolen:

- Bouw bij `setWorld()` een lichte walkability index/list.
- Per movement tick test alleen relevante arrays.
- Geen spatial index nodig in Fase 4 tenzij worlds groot worden.
- Geen per-frame geometry rebuild.
- Geen heap-spam met veel nieuwe objecten per movement tick als makkelijk te vermijden.

Acceptabel voor Fase 4:

- 10 waters met 20 punten;
- 20 blockers;
- 10 walkable surfaces;
- zonder merkbare hapering op oude laptopklasse machine.

## Relatie met Fase 3 visuals

Fase 4 mag Fase 3 visuals niet stukmaken.

Regels:

- Path visuals blijven zichtbaar.
- Water visuals blijven zichtbaar.
- Terrain layer overlays blijven zichtbaar.
- Ground Surface texture mag niet verdwijnen/knipperen.
- Collision logic mag Fase 3 visual groups niet disposen.
- Visual material cleanup mag collision data niet raken.

## Handmatige acceptatie - water blocks player

Kevin test:

1. Maak of selecteer `water_layer`.
2. Teken een waterlijn dwars over de spelerroute.
3. Zet `width` duidelijk, bijvoorbeeld 5 of 8.
4. Zet `blocksPlayer` aan.
5. Save Draft.
6. Save To Game.
7. Open `/game/`.
8. Loop met de speler richting water.
9. Speler mag niet door het water heen.
10. Zet `blocksPlayer` uit.
11. Save To Game.
12. Speler mag nu wel door hetzelfde water.

## Handmatige acceptatie - blocker polygon

Kevin test:

1. Maak of selecteer `blocker_area`.
2. Zet `shapeType` op `polygon`.
3. Teken minimaal 3 punten als gebied voor de speler.
4. Save To Game.
5. Open `/game/`.
6. Loop richting het polygongebied.
7. Speler mag het gebied niet in.
8. Verplaats een polygonpunt in editor.
9. Save To Game.
10. Controleer dat de blockergrens verandert.

## Handmatige acceptatie - blocker box/circle

Kevin test indien UI/schema dit ondersteunt:

1. Maak `blocker_area`.
2. Zet `shapeType` op `box`.
3. Stel `x`, `z`, `width`, `depth` in.
4. Save To Game.
5. Speler mag boxgebied niet in.
6. Zet `shapeType` op `circle`.
7. Stel `x`, `z`, `radius` in.
8. Save To Game.
9. Speler mag cirkelgebied niet in.

## Handmatige acceptatie - walkable bridge over water

Kevin test:

1. Maak een `water_layer` dwars over de spelerroute.
2. Zet `blocksPlayer` aan.
3. Publiceer en controleer dat speler niet door water kan.
4. Maak of selecteer `walkable_surface`.
5. Plaats het rectangle precies over een stuk water.
6. Stel `width` en `depth` in als brugdek.
7. Save To Game.
8. Open `/game/`.
9. Loop naar het water buiten de walkable surface: speler wordt geblokkeerd.
10. Loop over de walkable surface: speler kan passeren.
11. Verplaats walkable surface naast de rivier.
12. Save To Game.
13. De oude brugplek mag niet meer passeren.

## Handmatige acceptatie - GLB visuals blijven los

Kevin test:

1. Plaats een brug-GLB over water zonder `walkable_surface`.
2. Save To Game.
3. Speler mag niet automatisch over het water kunnen alleen door de GLB.
4. Voeg `walkable_surface` toe onder/op de brug.
5. Save To Game.
6. Speler mag nu wel over die surface.
7. Plaats een rots/berg-GLB.
8. Zonder `blocker_area` mag deze niet automatisch movement blokkeren.
9. Voeg `blocker_area` toe.
10. Speler wordt pas dan geblokkeerd.

## Handmatige acceptatie - regressies

Kevin controleert:

- path_layer visuals werken nog;
- water visuals werken nog;
- terrain_layer overlay werkt nog;
- Ground Surface texture blijft zichtbaar en knippert niet;
- Fase 2 handles werken nog in editor;
- `/game/` toont geen editor handles;
- bestaande player movement werkt buiten blockers/water normaal;
- click-to-move of keyboard movement blijft werken volgens bestaande controls;
- Save Draft en Save To Game blijven werken.

## Smoke/check tests

Verplicht draaien:

```bash
npm run check
npm run smoke
```

Smoke-test moet minimaal blijven slagen.

Als praktisch zonder groot browserframework:

- voeg pure helper tests toe voor point-in-polygon, point-in-river-ribbon, point-in-rotated-rectangle als deze helpers exporteerbaar zijn zonder rommel;
- of voeg runtime-independent assertions toe in bestaande smoke als projectstijl dit toelaat.

Niet doen:

- groot browser test framework introduceren alleen voor Fase 4.

## Algemene acceptatie

Kevin mag Fase 4 pas akkoord geven als:

- water met `blocksPlayer: true` speler blokkeert;
- water met `blocksPlayer: false` speler niet blokkeert;
- blocker polygon speler blokkeert;
- blocker box/circle werkt als shapeType gebruikt wordt;
- walkable_surface movement toestaat boven water/blocker;
- GLB brug niet automatisch walkable is;
- GLB rots/berg niet automatisch blocker is;
- path/water/terrain visuals uit Fase 3 blijven werken;
- Ground Surface texture blijft stabiel;
- Fase 2 editor tools blijven werken;
- geen navmesh/physics/chunking is toegevoegd;
- `npm run check` groen is;
- `npm run smoke` groen is.

## Afkeurcriteria

Fase 4 is niet akkoord als:

- Codex GLB mesh collision toevoegt;
- Codex physics/navmesh/pathfinding toevoegt;
- Codex terrain deformation toevoegt;
- Codex chunk compiler/streaming toevoegt;
- Codex bridge GLB automatisch walkable maakt;
- Codex rots/berg GLB automatisch blocker maakt;
- Codex Game Output/publish omzeilt;
- Codex draft data in `/game/` gebruikt;
- Codex demo content toevoegt;
- Codex Fase 2 tools breekt;
- Codex Fase 3 visuals breekt;
- Ground Surface texture opnieuw knippert/verdwijnt;
- `npm run check` of `npm run smoke` faalt.

## Wat Kevin na Fase 4 nog niet moet verwachten

Nog niet verwachten:

- slimme route om water heen;
- navmesh pathfinding;
- mooie brug animaties;
- hoogteverschillen/jump/fall;
- echte terrain carving;
- water physics;
- perfecte glij-collision langs alle randen;
- chunk streaming;
- performance counters;
- final collision debug UI.

Wel verwachten:

- simpele top-down movement blocking;
- water kan blokkeren;
- blocker areas kunnen blokkeren;
- walkable surfaces kunnen water/blockers overrulen;
- GLB visuals blijven gescheiden van gameplay rules;
- de basis voor bruggen over water is gelegd.

---

# Complete Codex Prompt Voor Fase 4

Gebruik onderstaande prompt letterlijk voor de worker-run.

```text
Codex, voer alleen Fase 4 - Collision, Water en Bruggen uit.

Voorwaarde:
Fase 1 Terrain Layers Datamodel bestaat en is akkoord.
Fase 2 Editor Paint Tools bestaat en is akkoord.
Fase 3 Path en River Rendering bestaat of is voldoende gerepareerd voor deze gameplay-check.

Lees eerst:
- README/fases/04-fase4-Collision-Water-en-Bruggen.md
- apps/web/public/shared/world-runtime.js
- apps/web/public/game/game.js
- apps/web/public/editor/editor.js
- src/shared/node-types.js
- src/server/publish-service.js
- scripts/smoke-test.js

Doel:
Maak published water/blocker/walkable intentie-data betekenisvol voor runtime movement:
- water_layer.blocksPlayer true blokkeert speler;
- blocker_area blokkeert speler;
- walkable_surface laat speler lopen boven water/blockers;
- GLB visuals blijven los van gameplay collision.

Werk alleen aan Fase 4.
Fase 5 en 6 zijn alleen context en mogen nu niet worden gebouwd.

Niet doen:
- geen navmesh;
- geen pathfinding;
- geen physics engine;
- geen nieuwe physics dependency;
- geen GLB mesh collision;
- geen GLB automatisch blocker/walkable maken;
- geen terrain deformation;
- geen ground cutting;
- geen chunk compiler;
- geen chunk streaming;
- geen demo content;
- geen seeded game content;
- geen grote editor redesign.

Taken:
1. Bouw in de shared runtime een lichte walkability/collision index uit published world data:
   - world.terrain.waters
   - world.collision.blockers
   - world.collision.walkableSurfaces
2. Voeg shape tests toe:
   - point/segment distance voor water ribbons;
   - point-in-polygon voor blocker polygon;
   - axis-aligned box test voor blocker box;
   - circle radius test voor blocker circle;
   - rotated rectangle test voor walkable_surface.
3. Integreer movement check in bestaande player movement:
   - desired move toegestaan als walkable_surface matcht;
   - anders blokkeren bij blocker_area;
   - anders blokkeren bij water_layer blocksPlayer true;
   - anders toestaan.
4. Gebruik player radius minimaal met center + cardinal samples, of rapporteer expliciet als alleen center getest wordt.
5. Movement-resolutie:
   - probeer desired movement;
   - probeer x-only;
   - probeer z-only;
   - anders blijf staan.
6. Zorg dat blocksPlayer false water niet blokkeert.
7. Zorg dat walkable_surface water/blocker kan overrulen.
8. Zorg dat GLB bruggen/rotsen niets automatisch blokkeren of walkable maken.
9. Houd Fase 3 visuals intact.
10. Houd Fase 2 editor handles intact.
11. Draai npm run check en npm run smoke.

Acceptatie:
- Water met blocksPlayer true blokkeert speler.
- Water met blocksPlayer false blokkeert speler niet.
- Blocker polygon blokkeert speler.
- Blocker box/circle werken als shapeType gebruikt wordt.
- Walkable surface over water laat speler passeren.
- Buiten walkable surface blijft water blokkeren.
- Brug-GLB zonder walkable_surface is niet automatisch walkable.
- Rots/berg-GLB zonder blocker_area blokkeert niet automatisch.
- Path/water/terrain visuals blijven zichtbaar.
- Ground Surface texture knippert/verdwijnt niet.
- Geen navmesh/physics/pathfinding/chunking toegevoegd.
- Geen demo content toegevoegd.
- npm run check groen.
- npm run smoke groen.

Oplevering:
Leg exact uit:
1. Welke bestanden zijn aangepast.
2. Welke walkability/collision helpers zijn toegevoegd.
3. Hoe water collision werkt.
4. Hoe blocker_area collision werkt.
5. Hoe walkable_surface override werkt.
6. Hoe player radius wordt getest.
7. Hoe movement wordt geblokkeerd of langs randen schuift.
8. Hoe GLB visuals gescheiden blijven van collision.
9. Wat Kevin in editor moet controleren.
10. Wat Kevin in /game/ moet controleren.
11. Bewijs dat geen Fase 5/6 werk is meegenomen.
12. Resultaat van npm run check.
13. Resultaat van npm run smoke.

Stop en meld het als Fase 4 niet netjes kan worden gedaan zonder eerst een bestaande bug in Fase 1 publish, Fase 2 handles, Fase 3 visuals, Ground Surface texture lifecycle of player movement te repareren.
```
