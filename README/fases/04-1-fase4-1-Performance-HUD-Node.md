# Fase 4.1 - Performance HUD Node

Regie-versie: 2026-06-25
Status: microfase-contract voor Codex-runs
Voorwaarde: Fase 4 collision-repair wordt apart gehouden of is klaar genoeg om niet door deze microfase geraakt te worden

## Doel

Maak een node-gestuurde Performance HUD waarmee Kevin in `/game/` live kan zien hoe zwaar de wereld is voor zijn laptop.

Deze microfase is bedoeld om performance zichtbaar en bespreekbaar te maken voordat er zwaardere textures, mooiere water/path visuals, chunks of meer gameplay-systemen bijkomen.

Kevin moet na Fase 4.1 kunnen:

- een performance HUD node toevoegen in de editor;
- die node verbinden met Game Output;
- Save To Game doen;
- in `/game/` een compacte performance overlay zien;
- zien of waarden groen, oranje of rood zijn;
- direct herkennen of de wereld boven Kevin's laptop-budget zit;
- zien of Fase 3/4 systemen zoals terrain visuals en collision shapes te zwaar worden.

## Belangrijkste regiegrens

Deze microfase mag **niet** de Fase 4 collision-repair doen.

Niet aanraken als hoofdwerk:

- water collision width;
- walkable_surface override;
- blocker collision behavior;
- player movement rules;
- path/water/terrain rendering quality;
- terrain deformation;
- navmesh/physics/chunk streaming.

Als Codex tijdens deze microfase merkt dat Fase 4 collision helpers traag zijn, mag hij dat rapporteren en meten, maar hij mag de collisionregels niet inhoudelijk herontwerpen tenzij Kevin daar expliciet opdracht voor geeft.

## Wat Fase 4.1 bewust niet doet

Niet doen:

- geen water/blocker/walkable collision repareren als hoofdtaak;
- geen navmesh;
- geen physics;
- geen terrain deformation;
- geen chunk compiler;
- geen chunk streaming;
- geen texture/pad/water polish;
- geen grote editor redesign;
- geen nieuw dashboardpaneel;
- geen demo content;
- geen seeded game content;
- geen external analytics service;
- geen server-side telemetry opslag;
- geen zware profiler dependency;
- geen performance HUD die zelf veel FPS kost.

Als Codex een van deze dingen toch doet, is Fase 4.1 niet akkoord.

## Waarom dit nodig is

Kevin test op een oude laptopklasse machine. Performance moet zichtbaar worden voordat het project verder groeit.

Belangrijk budget:

```text
Laptop target: Intel Pentium CPU 4417U @ 2.30GHz, 4 threads
```

De editor en game moeten op deze klasse hardware bruikbaar blijven. Daarom moet de HUD niet alleen FPS tonen, maar ook concrete oorzaken helpen aanwijzen:

- frame time;
- render calls;
- triangles;
- meshes/objects;
- textures;
- entities;
- terrain visuals;
- collision shapes;
- active/published world size waar praktisch.

## Nieuwe node type

Voeg bij voorkeur een nieuwe node toe:

```text
debug_performance_hud
```

Waarom niet alleen `ui_hud_text` uitbreiden?

- `ui_hud_text` is gewone game-UI content.
- Performance HUD is een debug/diagnostic tool met thresholds.
- Het moet later makkelijk uit/aan kunnen zonder gewone HUD content te vervuilen.

## Data type

Gebruik bij voorkeur bestaande `ui` data type.

Output:

```js
ui
```

Game Output hoeft waarschijnlijk niet uitgebreid te worden, want `game_output` heeft al:

```js
ui: { label: "UI", dataType: "ui", required: false, multiple: true }
```

Alleen als de bestaande publish-structuur `debug_performance_hud` niet via `ui` kan publiceren, mag Codex publish logic uitbreiden.

## Node fields

Voeg deze nodevelden toe in `src/shared/node-types.js` of het bestaande node-schema:

```js
{
  hudId: "perf_hud",
  label: "Performance HUD",
  enabled: true,
  anchor: "top-right",
  compact: true,
  updateIntervalMs: 500,

  showFps: true,
  showFrameMs: true,
  showRenderer: true,
  showDrawCalls: true,
  showTriangles: true,
  showGeometries: true,
  showTextures: true,
  showSceneObjects: true,
  showEntities: true,
  showTerrainVisuals: true,
  showCollisionShapes: true,
  showWorldSize: false,

  fpsTarget: 60,
  fpsWarn: 45,
  fpsDanger: 30,

  frameMsTarget: 16.7,
  frameMsWarn: 22,
  frameMsDanger: 33,

  drawCallsWarn: 80,
  drawCallsDanger: 140,

  trianglesWarn: 100000,
  trianglesDanger: 250000,

  meshesWarn: 50,
  meshesDanger: 100,

  texturesWarn: 24,
  texturesDanger: 40,

  terrainVisualsWarn: 40,
  terrainVisualsDanger: 100,

  collisionShapesWarn: 50,
  collisionShapesDanger: 150
}
```

### Field uitleg

`enabled`

- HUD zichtbaar of niet.
- Als false: geen DOM updates, minimale overhead.

`anchor`

- Mogelijke waarden:
  - `top-left`
  - `top-right`
  - `bottom-left`
  - `bottom-right`

`compact`

- Compacte vorm voor laptop/small screen.
- Geen groot debugpaneel.

`updateIntervalMs`

- Hoe vaak tekst/kleur update.
- Minimaal 250ms.
- Aanbevolen default 500ms.
- Niet elke frame DOM tekst herschrijven.

`show*`

- Bepaalt welke regels zichtbaar zijn.
- Uitgeschakelde regels moeten niet onnodig berekend worden als dat duur is.

Threshold fields

- Warn = oranje.
- Danger = rood.
- Binnen budget = groen.

## Publish read-model

De published world moet de HUD-config bevatten in bestaande UI output.

Aanbevolen shape:

```js
ui: [
  {
    id: "perf_hud",
    type: "debug_performance_hud",
    label: "Performance HUD",
    enabled: true,
    anchor: "top-right",
    compact: true,
    updateIntervalMs: 500,
    metrics: {
      showFps: true,
      showFrameMs: true,
      showRenderer: true,
      showDrawCalls: true,
      showTriangles: true,
      showGeometries: true,
      showTextures: true,
      showSceneObjects: true,
      showEntities: true,
      showTerrainVisuals: true,
      showCollisionShapes: true,
      showWorldSize: false
    },
    thresholds: {
      fpsTarget: 60,
      fpsWarn: 45,
      fpsDanger: 30,
      frameMsTarget: 16.7,
      frameMsWarn: 22,
      frameMsDanger: 33,
      drawCallsWarn: 80,
      drawCallsDanger: 140,
      trianglesWarn: 100000,
      trianglesDanger: 250000,
      meshesWarn: 50,
      meshesDanger: 100,
      texturesWarn: 24,
      texturesDanger: 40,
      terrainVisualsWarn: 40,
      terrainVisualsDanger: 100,
      collisionShapesWarn: 50,
      collisionShapesDanger: 150
    }
  }
]
```

Als bestaande `publish-service.js` al `ui_hud_text` mappt, voeg dan een aparte branch toe voor `debug_performance_hud` zonder bestaande HUD text te breken.

## Verwachte bestanden

Controleer en pas alleen aan wat nodig is:

- `src/shared/node-types.js`
- `src/server/publish-service.js`
- `apps/web/public/shared/world-runtime.js`
- eventueel `apps/web/public/shared/` of bestaande HUD helper code als die bestaat
- eventueel `apps/web/public/editor/editor.js` alleen als node inspector/dynamic UI anders niet werkt
- eventueel `apps/web/public/editor/styles.css` alleen voor kleine editor preview/status styling
- eventueel `apps/web/public/game/styles.css` of bestaande CSS als HUD styling daar hoort
- `scripts/smoke-test.js`

Niet verwacht:

- geen database migration;
- geen collision helper rewrite;
- geen movement rewrite;
- geen renderer rewrite;
- geen performance worker/thread;
- geen dependency toevoegen.

## Runtime HUD locatie

Gebruik bestaande HUD/root DOM waar mogelijk.

In `world-runtime.js` bestaat al een `hudElement` en HUD module systeem. Sluit daarop aan als dat logisch is.

Aanbevolen:

- Maak een DOM-node voor performance HUD binnen bestaande HUD container.
- Houd die node apart van gewone `.hud-prompt` en HUD text nodes.
- Cleanup bij `setWorld()` en `destroy()`.
- Update alleen als published UI-config `debug_performance_hud` enabled is.

## Metrics die getoond moeten worden

### FPS

Meet rolling FPS.

Aanbevolen:

- tel frames over tijdvenster;
- toon afgeronde waarde;
- update DOM op `updateIntervalMs`.

Display:

```text
FPS 52 / 60
```

Kleur:

- groen als `fps >= fpsWarn`;
- oranje als `fps < fpsWarn`;
- rood als `fps < fpsDanger`.

### Frame ms

Meet frame time in ms.

Display:

```text
Frame 19.4ms / 16.7ms
```

Kleur:

- groen als `frameMs <= frameMsWarn`;
- oranje als `frameMs > frameMsWarn`;
- rood als `frameMs > frameMsDanger`.

### Renderer info

Gebruik `renderer.info` van Three.js.

Belangrijke velden:

```js
renderer.info.render.calls
renderer.info.render.triangles
renderer.info.memory.geometries
renderer.info.memory.textures
```

Display voorbeelden:

```text
Draw 54 / 80
Tris 83k / 100k
Geo 22
Tex 12 / 24
```

### Meshes / scene objects

Tel lichtgewicht:

- aantal meshes in runtime content scene;
- eventueel aantal total objects;
- niet elke DOM update een dure volledige traverse als dat performance kost.

Aanbevolen:

- tel bij `setWorld()` en bij terrain visual rebuild;
- of traverse maximaal op update interval, niet per frame.

Display:

```text
Meshes 42 / 50
Objects 96
```

### Entities

Tel published/runtime entities:

```js
world.entities.length
world.interactables.length
```

Display:

```text
Entities 8
Interact 3
```

### Terrain visuals

Toon aantal terrain visual objects of items:

- terrain layers count;
- path count;
- water count;
- eventueel total terrain visual meshes.

Display:

```text
Terrain 2L 4P 1W
```

Of compact:

```text
Terrain 7 / 40
```

### Collision shapes

Toon aantal walkability shapes:

- waters blocking;
- blockers;
- walkable surfaces;
- total collision shapes.

Display:

```text
Collision 18 / 50
```

Belangrijk:

- De HUD mag collision helpers niet herberekenen per frame.
- Gebruik bestaande walkability index counts als die bestaan.

## Laptop-budget defaults

Gebruik conservatieve defaults voor Kevin's laptop.

```text
FPS target: 60
FPS warning: < 45
FPS danger: < 30

Frame target: 16.7ms
Frame warning: > 22ms
Frame danger: > 33ms

Draw calls warning: > 80
Draw calls danger: > 140

Triangles warning: > 100000
Triangles danger: > 250000

Meshes warning: > 50
Meshes danger: > 100

Textures warning: > 24
Textures danger: > 40

Terrain visuals warning: > 40
Terrain visuals danger: > 100

Collision shapes warning: > 50
Collision shapes danger: > 150
```

Deze defaults zijn geen absolute waarheid, maar ze geven Kevin een zichtbaar startpunt.

## Visuele HUD-regels

HUD moet compact en leesbaar zijn.

Style:

- klein monospace of compacte UI font;
- donkere semi-transparante achtergrond;
- geen grote kaart;
- geen fullscreen overlay;
- geen layout shift;
- max-width zodat tekst niet over het hele scherm loopt;
- pointer-events none, zodat gameplay klik/controls niet stukgaan;
- groen/oranje/rood per regel of per waarde.

Kleuren:

```text
ok: groen
warn: oranje/geel
danger: rood
neutral: lichtgrijs
```

Voorbeeld:

```text
FPS      52 / 60
Frame    19ms / 16.7ms
Draw     54 / 80
Tris     83k / 100k
Meshes   42 / 50
Tex      12 / 24
Terrain  7 / 40
Coll     18 / 50
```

## Update/overhead regels

De Performance HUD mag zelf de game niet merkbaar zwaarder maken.

Regels:

- Geen DOM update elke frame.
- DOM update maximaal elke `updateIntervalMs`.
- Geen dure scene traverse elke frame.
- Geen JSON stringify van hele world elke update.
- Geen console spam.
- Geen network calls.
- Geen persistent storage writes.
- Geen analytics.

Als HUD disabled is:

- geen zichtbare node;
- geen periodic DOM updates;
- minimale bookkeeping.

## Editor gedrag

In editor:

- Node moet zichtbaar zijn in node library.
- Inspector moet thresholds kunnen aanpassen.
- Node moet verbonden kunnen worden met Game Output input `ui`.
- Save Draft werkt.
- Save To Game werkt.

Niet verplicht:

- performance HUD live in editor viewport tonen.

Toegestaan:

- Als shared runtime dit automatisch ook in editor preview toont, mag dat, zolang het niet stoort.
- Maar hoofdacceptatie is `/game/`.

## Game gedrag

In `/game/`:

- HUD verschijnt alleen als published `debug_performance_hud.enabled === true`.
- HUD verdwijnt als node disabled is of niet verbonden is met Game Output.
- HUD anchor werkt.
- HUD waarden updaten zonder merkbare hapering.
- HUD toont rood/oranje/groen volgens thresholds.

## Publish/data regels

Belangrijk:

- Alleen verbonden HUD node mag in `/game/` verschijnen.
- Ongekoppelde `debug_performance_hud` node mag niet publiceren.
- `/game/` gebruikt alleen published data.
- Geen hardcoded HUD aanzetten zonder node.
- Geen sample HUD seeden in lege database.

## Smoke/check tests

Verplicht draaien:

```bash
npm run check
npm run smoke
```

Smoke-test moet minimaal bewijzen:

1. `debug_performance_hud` node kan worden aangemaakt.
2. Node kan verbonden worden met Game Output `ui`.
3. Save Draft werkt.
4. Publish werkt.
5. `/api/game/world` bevat een UI item met `type: "debug_performance_hud"` als node verbonden en enabled is.
6. Disabled HUD publiceert disabled config of wordt correct niet getoond volgens gekozen contract.
7. Ongekoppelde HUD node verschijnt niet in `/api/game/world`.
8. Bestaande `ui_hud_text` blijft werken.

Als runtime HUD DOM niet in smoke kan worden getest, rapporteer dat handmatige browseracceptatie nodig is.

## Handmatige acceptatie - node en publish

Kevin test:

1. Open editor.
2. Voeg `debug_performance_hud` toe.
3. Controleer dat de inspector thresholds toont.
4. Verbind node met Game Output `ui`.
5. Save Draft.
6. Save To Game.
7. Open `/api/game/world`.
8. Controleer dat `ui` een item bevat met `type: "debug_performance_hud"`.
9. Maak een tweede ongekoppelde performance HUD node.
10. Save To Game.
11. Controleer dat de ongekoppelde node niet in `/api/game/world` verschijnt.

## Handmatige acceptatie - game HUD

Kevin test:

1. Open `/game/`.
2. Controleer dat HUD zichtbaar is op gekozen anchor.
3. Controleer dat FPS zichtbaar is.
4. Controleer dat frame ms zichtbaar is.
5. Controleer draw calls/triangles/meshes/textures als enabled.
6. Controleer terrain/collision counts als enabled.
7. Verlaag een threshold bewust zodat waarde rood wordt.
8. Save To Game.
9. Controleer dat HUD rood/oranje/groen reageert.
10. Zet `enabled` uit.
11. Save To Game.
12. Controleer dat HUD verdwijnt.

## Handmatige acceptatie - performance overhead

Kevin test:

1. Speel `/game/` met HUD aan.
2. Speel `/game/` met HUD uit.
3. HUD mag zelf geen duidelijke extra hapering veroorzaken.
4. HUD update mag niet flikkeren.
5. Controls blijven werken.
6. Klik/movement wordt niet geblokkeerd door HUD.

## Handmatige acceptatie - Fase 4 isolatie

Kevin controleert:

- water collision gedrag is niet inhoudelijk gewijzigd door deze HUD microfase;
- blocker behavior is niet gewijzigd;
- walkable_surface behavior is niet gewijzigd;
- path/water/terrain visuals zijn niet veranderd;
- Ground Surface texture is niet veranderd;
- geen nieuwe collision bugs zijn ontstaan.

Als collisiongedrag verandert, is Fase 4.1 te breed gegaan.

## Afkeurcriteria

Fase 4.1 is niet akkoord als:

- Codex collision/walkability logic inhoudelijk wijzigt zonder opdracht;
- Codex water/blocker/walkable repair vermengt met HUD;
- HUD altijd hardcoded zichtbaar is zonder node;
- ongekoppelde HUD node in `/game/` verschijnt;
- HUD veroorzaakt merkbare extra lag;
- HUD doet DOM updates elke frame;
- HUD breekt gewone HUD text;
- HUD breekt player controls;
- HUD voegt analytics/network logging toe;
- HUD voegt zware dependency toe;
- `npm run check` of `npm run smoke` faalt.

## Wat Kevin na Fase 4.1 nog niet moet verwachten

Nog niet verwachten:

- Chrome DevTools profiler vervangen;
- exacte GPU timing;
- memory leak detector;
- per-mesh inspector;
- automatic optimization;
- performance fix zelf.

Wel verwachten:

- snelle zichtbare indicatie of game boven laptop-budget zit;
- concrete rood/oranje/groen signalen;
- genoeg info om te beslissen of path/water/textures/collision te zwaar worden;
- node-gestuurde debug HUD die via Game Output naar `/game/` gaat.

---

# Complete Codex Prompt Voor Fase 4.1

Gebruik onderstaande prompt letterlijk voor de worker-run.

```text
Codex, voer alleen Fase 4.1 - Performance HUD Node uit.

Belangrijk:
Dit is een aparte microfase. Repareer nu niet de Fase 4 water/walkable collision bugs. Raak collision/walkability logic alleen aan als dat strikt nodig is om bestaande counts uit te lezen, en verander geen gedrag.

Lees eerst:
- README/fases/04-1-fase4-1-Performance-HUD-Node.md
- src/shared/node-types.js
- src/server/publish-service.js
- apps/web/public/shared/world-runtime.js
- apps/web/public/game/game.js
- scripts/smoke-test.js

Doel:
Voeg een node-gestuurde Performance HUD toe die in /game/ live laptop-budget statistieken toont met groen/oranje/rood thresholds.

Niet doen:
- geen water collision repair;
- geen walkable_surface override repair;
- geen blocker behavior wijzigen;
- geen player movement wijzigen;
- geen navmesh;
- geen physics;
- geen terrain deformation;
- geen chunk streaming;
- geen path/water/terrain visual polish;
- geen demo content;
- geen analytics/network telemetry;
- geen zware dependency.

Taken:
1. Voeg node type `debug_performance_hud` toe met output dataType `ui`.
2. Voeg velden toe voor enabled, anchor, compact, updateIntervalMs, show toggles en thresholds.
3. Breid publish-service uit zodat verbonden `debug_performance_hud` nodes in `world.ui` publiceren met `type: "debug_performance_hud"`.
4. Zorg dat ongekoppelde HUD nodes niet publiceren.
5. Voeg runtime HUD rendering toe in de bestaande HUD container of shared runtime HUD flow.
6. Toon minimaal:
   - FPS
   - frame ms
   - draw calls
   - triangles
   - geometries
   - textures
   - meshes/objects waar praktisch
   - entities/interactables
   - terrain visual count waar praktisch
   - collision shape count waar praktisch
7. Gebruik groen/oranje/rood thresholds.
8. Update DOM niet elke frame maar op updateIntervalMs.
9. Als enabled false is: verberg HUD en minimaliseer overhead.
10. Houd player controls en gewone HUD text werkend.
11. Breid smoke-test uit voor node creation, Game Output ui connectie, publish, enabled/disabled of config, unconnected node niet publiceren, en bestaande ui_hud_text regressie.
12. Draai npm run check en npm run smoke.

Acceptatie:
- debug_performance_hud staat in node library.
- Node kan aan Game Output ui gekoppeld worden.
- /api/game/world bevat type debug_performance_hud wanneer verbonden.
- Ongekoppelde performance HUD publiceert niet.
- /game/ toont de HUD wanneer enabled.
- HUD verdwijnt wanneer disabled of niet verbonden.
- FPS en frame ms zijn zichtbaar.
- Draw calls/triangles/geometries/textures zijn zichtbaar als enabled.
- Waarden kleuren groen/oranje/rood volgens thresholds.
- HUD update veroorzaakt geen merkbare extra lag.
- Gewone ui_hud_text blijft werken.
- Collision/walkability behavior is niet gewijzigd.
- npm run check groen.
- npm run smoke groen.

Oplevering:
Leg exact uit:
1. Welke bestanden zijn aangepast.
2. Welke node fields zijn toegevoegd.
3. Hoe publish read-model eruitziet.
4. Hoe runtime metrics worden verzameld.
5. Hoe updateIntervalMs overhead beperkt.
6. Welke thresholds standaard zijn voor Kevin's laptop.
7. Hoe Kevin de HUD aan/uit zet.
8. Hoe Kevin rood/oranje/groen kan testen.
9. Bewijs dat Fase 4 collision logic niet inhoudelijk is gewijzigd.
10. Resultaat van npm run check.
11. Resultaat van npm run smoke.

Stop en meld het als dit niet netjes kan zonder bestaande HUD/publish of runtime lifecycle eerst te repareren.
```
