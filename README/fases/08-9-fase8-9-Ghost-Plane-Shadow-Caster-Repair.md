# Fase 8.9 - Kill Ghost Chunk Plane & Shadow Caster Residency Repair

## Waarom 8.8 niet akkoord was

Fase 8.8 verbeterde het shadow-jumping al, maar Kevin zag live nog steeds twee echte bugs:

- er was nog steeds een tweede chunk/terrain vlak dat met de editorcamera meebeweegt;
- boomschaduwen bleven ronde blobs, en huizen/static props konden hun schaduw verliezen zodra chunks unloaden.

Daarom is 8.8 niet akkoord verklaard. Deze fase corrigeert de runtime zelf.

## Root cause

De oude detectie vertrouwde te veel op bekende namen en userData-markers. Daardoor konden anonieme of half-gedumpte `Mesh`/`PlaneGeometry` objecten blijven bestaan, inclusief:

- camera-child overlay planes;
- debug/terrain/chunk overlay planes met onvolledige markers;
- een stale full-ground plane wanneer chunked ground al actief was.

Voor shadows was het tweede probleem anders:

- shadow casters waren nog te strak gekoppeld aan render-residency;
- als render chunks unloaden, verdwenen static prop en scatter/tree shadow bronnen te vroeg;
- boomshadows werden daardoor vervangen door helper/circle/plane-achtige fallback casters.

De live audit geeft nu per verdachte node exact de objectinformatie terug via `ghostPlaneDiagnostics.suspiciousPlanes`:

- `name`
- `uuid`
- `parentName`
- `parentType`
- `geometryType`
- `materialType`
- `materialColor`
- `worldPosition`
- `worldScale`
- `boundingSize`
- `reason`

## Wat er is toegevoegd

### Ghost plane audit en cleanup

De runtime heeft nu twee debug commands:

- `window.__GK_EDITOR_RUNTIME.debugFindGhostPlanes()`
- `window.__GK_EDITOR_RUNTIME.debugRemoveGhostPlanes()`

De cleanup gebruikt `removeGhostChunkPlanes(reason)` en:

- zoekt camera-child meshes/planes;
- zoekt overlay/chunk/terrain/debug planes;
- verwijdert suspicious objecten echt uit de scene;
- zet `castShadow` en `receiveShadow` uit vóór dispose;
- laat debug overlays alleen staan als debug expliciet aan staat, en dan nooit als camera child.

De live debug state bevat nu:

- `window.__GK_EDITOR_RUNTIME.debugState().world.ghostPlaneDiagnostics`
- `window.__GK_GAME_RUNTIME.debugState().world.shadowCasterAudit`

### Shadow residency repair

Static props en scatter/tree content hebben nu een expliciet verschil tussen:

- render resident;
- shadow resident;
- visible object;
- hidden-but-shadow-casting proxy.

Daarvoor gebruikt de runtime shadow proxies met:

- `castShadow = true`
- `receiveShadow = false`
- `material.colorWrite = false`
- `material.depthWrite = true`
- `visible = true`
- `userData.shadowProxy = true`

Belangrijk:

- geen `CircleGeometry` of `PlaneGeometry` als tree/shadow proxy;
- geen helper/selectie/debug object mag shadow caster zijn;
- huizen/static props blijven shadow caster als `staticPropCastShadows` aan staat;
- render unload mag shadow residency niet voortijdig weggooien.

### Stable shadow focus

Het editor shadow focus punt volgt nu niet meer de orbit target van de camera. De editor gebruikt een stabiele focus op:

- geselecteerd object, als er één geselecteerd is;
- anders world/content center;
- anders spawn/player fallback.

Game blijft de player/chunk-coverage gebruiken. Daarmee blijft de 8.8 jump-fix intact.

## Debug commands

Editor:

```js
window.__GK_EDITOR_RUNTIME.debugFindGhostPlanes()
window.__GK_EDITOR_RUNTIME.debugRemoveGhostPlanes()
window.__GK_EDITOR_RUNTIME.debugState().world.ghostPlaneDiagnostics
window.__GK_EDITOR_RUNTIME.debugState().world.shadowCasterAudit
```

Game:

```js
window.__GK_GAME_RUNTIME.debugState().world.shadowCasterAudit
window.__GK_GAME_RUNTIME.debugState().world.ghostPlaneDiagnostics
```

## Kevin check

### Editor

1. Open de editor.
2. Zet debug overlay uit.
3. Controleer dat het tweede/onderste chunkvlak weg is.
4. Console:

```js
window.__GK_EDITOR_RUNTIME.debugState().world.ghostPlaneDiagnostics
```

5. Verwacht:

- `suspiciousPlanes.length = 0`
- `cameraChildPlanes = 0`
- `removedSuspiciousPlanes >= 1` als er een ghost plane gevonden was

6. Zet Editor World Settings shadows high.
7. Kijk naar een huis en bomen.
8. Console:

```js
window.__GK_EDITOR_RUNTIME.debugState().world.shadowCasterAudit
```

9. Verwacht:

- `helperCasterCount = 0`
- `circleOrPlaneCasterCount = 0`
- `staticProp` caster groter dan 0 als er een huis in beeld staat en static prop shadows aan staan

10. Draai de camera.
11. Shadows mogen niet springen.

### Game

1. Open `/game/`.
2. Loop richting bomen en een huis.
3. Chunks achter/naast je mogen unloaden, maar huis/boom shadows mogen niet plots verdwijnen.
4. Boomschaduw moet geen ronde debug/blob circle zijn.
5. Console:

```js
window.__GK_GAME_RUNTIME.debugState().world.shadowCasterAudit
```

6. Verwacht:

- helper/debug/overlay casters = 0
- static/scatter casters aanwezig wanneer de instellingen aan staan

## Tests

- `npm run check`
- `npm run smoke`
- `npm run perf:game` best effort

SwiftShader/software renderer is geen acceptatiegrond op zichzelf. De debug-state checks blijven dan wel verplicht.

## Niet gedaan

- geen nieuwe settings nodes;
- geen minimap;
- geen terrain rewrite;
- geen path/water/surface segmentatie;
- geen nieuwe profilerfase;
- geen workaround om shadows uit te zetten;
- geen succesclaim zonder live cleanup en runtime-audit.

## Acceptatie

Fase 8.9 is pas akkoord als:

- het extra camera-meebewegende chunkvlak echt weg is;
- `ghostPlaneDiagnostics` geen suspicious camera-child planes meer toont;
- huizen/static props schaduw hebben als static prop shadows aan staan;
- boomschaduwen niet meer door CircleGeometry/PlaneGeometry/debug/helper casters komen;
- shadow casters beschikbaar blijven binnen shadowResidentChunks als render chunks unloaden;
- de stabiele shadow jumping fix uit 8.8 intact blijft;
- `npm run check` groen is;
- `npm run smoke` groen is;
- Kevin live ziet dat punt 1 en 2 opgelost zijn.
