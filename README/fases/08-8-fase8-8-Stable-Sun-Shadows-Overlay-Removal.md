# Fase 8.8 - Stable Sun Shadows & Debug Overlay Removal

## Waarom 8.7 niet genoeg was

Fase 8.7 splitste de settings wel netjes in `world_settings`, `editor_world_settings` en
`game_world_settings`, maar Kevin liet live zien dat drie zichtbare problemen nog steeds niet
akkoord waren:

- er was nog steeds een extra chunk/debug vlak zichtbaar dat met de camera leek mee te bewegen;
- editor- en game-shadows sprongen zodra de camera, speler of chunk-culling veranderde;
- boomschaduwen en static-prop shadows waren nog niet stabiel genoeg om als eindstaat te gelden.

De conclusie was dus niet dat de settings verkeerd waren, maar dat de runtime nog te veel op
de actuele camera/chunk-situatie leunde.

## Root cause

De oude shadow-aanpak liet de directional shadow state te dicht tegen de camera of het actuele
chunk-venster aan liggen. Daardoor kon een kleine camera- of streamingbeweging leiden tot:

- een andere shadow camera frustum;
- andere zichtbare shadow casters doordat chunks net unloaded waren;
- een debug/chunk overlay die in de scene bleef hangen of camera-child werd;
- blur/blobs bij boomkronen omdat de shadow window te breed en te onstabiel was.

## Stable sun shadow model

Fase 8.8 introduceert één stabiele zon/shadow-controller voor editor én game:

- vaste sun direction uit de bestaande mode-settings;
- een stabiel focuspunt dat niet per frame op de camera blijft jagen;
- focus-snapping op wereldgrid zodat kleine bewegingen geen shadow jump veroorzaken;
- een orthographic shadow window met vaste radius per mode;
- update alleen bij relevante changes, niet bij elke micro camera movement.

De controller werkt met een gesnapte focus en bewaakt daarbij:

- `stableSnapCell`
- `snappedFocus`
- `shadowCameraBounds`
- `shadowResidentChunkKeys`
- `renderResidentChunkKeys`
- `jumpDetected` en `lastJumpDistance`

## Overlay removal

Alle debug/helper meshes krijgen nu expliciete debug-overlay flags en mogen geen shadows casten.
Daarmee zijn onder meer afgedekt:

- chunk debug overlay
- terrain editor overlay
- scatter editor overlay
- selection helper
- transform guide

Daarnaast verwijdert de runtime nu camera-child debug overlays hard uit de camera-subtree en houdt
`overlayDiagnostics` bij hoeveel overlays nog bestaan of zijn verwijderd.

Belangrijk:

- standaard staat de chunk/debug overlay uit;
- alleen bij expliciete debug-vlaggen mag die zichtbaar worden;
- geen overlay mesh mag shadow caster zijn.

## Shadow resident vs render resident

Fase 8.8 splitst het chunk-denken verder op:

- `renderResidentChunks` zijn wat echt nodig is om te renderen;
- `collisionResidentChunks` zijn wat nodig is voor collision/interaction;
- `shadowResidentChunks` zijn wat nodig is om stabiele shadows te houden.

De shadow resident window is dus bewust ruimer dan de render window. Daardoor kan een chunk al
uit de render-resident vallen zonder dat de shadow caster meteen verdwijnt uit het zichtbare
gebied.

Dat is precies de repair voor:

- bomen die shadow coverage verliezen zodra de camera door de wereld beweegt;
- huizen/static props die soms geen schaduw meer hadden;
- editor shadows die alleen correct waren in het gebied waar de camera toevallig naar keek.

## Voor bomen en static props

De runtime houdt de bestaande mode-specifieke shadow flags aan voor:

- static props
- scatter/bomen
- ground/terrain receive shadows

Extra diagnostics melden nu ook:

- `scatterShadowFallbacks`
- `nonInstancedShadowCasters`
- `overlayShadowCasterCount`
- `debugShadowCasterCount`

Daarmee kan Kevin zien of een blob uit echte content komt of uit een helper/debug pad.

## Kevin checks

### Editor

1. Open de editor.
2. Zorg dat debug overlay uit staat.
3. Controleer dat het extra chunkvlak weg is.
4. Zet Editor World Settings op quality.
5. Plaats bomen en een huis.
6. Orbit de camera.
7. Schaduwen mogen niet springen.
8. Richt de camera op een andere plek.
9. De schaduw op de vorige plek mag niet wegvallen zolang die binnen de shadow radius zit.
10. Controleer in de console:

```js
window.__GK_EDITOR_RUNTIME.debugState().world.stableShadows
window.__GK_EDITOR_RUNTIME.debugState().world.overlayDiagnostics
```

Moet minimaal tonen:

- `cameraChildOverlayGroups = 0`
- `overlayShadowCasterCount = 0`
- `jumpDetected = false`

### Game

1. Open `/game/`.
2. Loop naar bomen en een huis.
3. Schaduwen mogen niet plots veranderen omdat chunks achter je unloaden.
4. Boomschaduw moet boomachtig blijven, niet alleen een ronde blob.
5. Huis/static prop moet schaduw hebben als static prop shadows aan staan.
6. Controleer in de console:

```js
window.__GK_GAME_RUNTIME.debugState().world.stableShadows
```

## Wat bewust niet is gedaan

- Geen nieuwe minimap.
- Geen terrain rewrite.
- Geen nieuwe profilerfase.
- Geen aparte CSM-library toegevoegd.
- Geen extra settings-node alleen voor shadows gemaakt.
- Geen succesclaim op basis van alleen `npm run check`.

## Validatie

Verplicht draaien:

- `npm run check`
- `npm run smoke`

Als browser/debug checks beschikbaar zijn, worden die ook gebruikt om de stabiele shadow-state en
overlay-invariants te bewijzen. Als de renderer softwarematig blijkt, blijft de debugState-check
wel verplicht, maar de performance-meting zelf is dan niet representatief.

## Acceptatie

Fase 8.8 is pas akkoord als:

- de extra camera-meebewegende chunk/debug-vlak standaard weg is;
- debug overlay alleen zichtbaar is bij expliciete aanzet;
- editor shadows niet meer springen bij camera- of focusbeweging;
- game shadows niet meer springen bij chunk unloads achter de speler;
- bomen stabiel en vormvast schaduwen werpen;
- huizen/static props schaduw hebben als die optie aan staat;
- `stableShadows` en `overlayDiagnostics` de invariants zichtbaar bewijzen;
- `npm run check` en `npm run smoke` groen zijn.
