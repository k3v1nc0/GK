# Fase 04 voortgang

- Start: 2026-10-25 (avond), op `main` na "Fase 03" (784a0e6). Plan: `README/fases/MMORPG-basis-v2/FASE-04-wereld-en-playpreview.md`.
- Instap: F3 is door Kevin geaccepteerd (handtest). F4 is daarna bovenop main gezet, zonder conflicten met de F3-reparaties.
- Eerste stuk (deze commit): Regions en Areas tekenen in de Werkbank, publiceren, en in de game merken dat je een grens overgaat (naam + muziek).
  Plus obstakels (colliders) die server en game hetzelfde laten botsen, en een 2D-preview van de draft. De 3D-PlayPreview-sandbox, Cell-streaming van de 3D-wereld en de volledige wereldimport zijn nog niet gebouwd.
- In de cloud alleen geïsoleerde unit-tests (geen servers, zie CLAUDE.md). Browser, server en Kevins test staan in `CLI-PROMPT.md`.

## Zo test je het (Kevin)

1. Werkbank (`/editor/canoniek.html`) -> tab **Wereld**. Grijze stippelkaders zijn je zones uit Nodes.
2. Snel begin: **Zones uit Nodes als Regions overnemen**. Elke zone wordt een Region met dezelfde grenzen (onderaan zie je per zone "gekoppeld" of niet).
   Of zelf tekenen: kies **Region (rechthoek)** en sleep. Twee Regions mogen elkaar raken, niet overlappen (dan krijg je een melding en wordt niets opgeslagen).
3. Kies **Area: rechthoek**, **Area: cirkel** (klik midden, sleep straal) en **Area: polygoon** (klik punten, klik op het eerste punt of dubbelklik). Teken ze binnen een Region.
   Met **Obstakel: rechthoek/cirkel** maak je een plek waar niemand doorheen loopt (bijv. een huis of boom zonder botsing). Rood op de kaart.
4. Klik een vorm met **Kiezen / schuiven** om naam, maten (meters), prioriteit en muziek aan te passen. Muziek kies je uit je audio-assets (eerst uploaden in de assetbibliotheek).
5. Ververs de pagina: de vormen, je selectie en het kaartbeeld blijven staan.
5b. **Preview (draft)**: sleep de groene testspeler over een grens. Je ziet welke Region/Area de server kiest en hoort de muziek, zonder te publiceren.
6. Tab **Publiceren** -> Publiceer build.
7. Game: ververs één keer. Bovenaan staat nu de Region (en Area) waar je bent. Loop over een grens: "Je bent nu in ..." en de muziek faden over.
   Loop tegen een obstakel: je stopt ertegen (de server en je eigen scherm rekenen met dezelfde vorm).
   Speelt er nog geen muziek, dan staat er "klik of druk een toets voor muziek" (de browser blokkeert geluid tot je iets doet). Op de minimap zie je de Region-randen; je huidige Region is geel.

## Kaartstatus

| Kaart | Status | Wat er staat | Nog nodig |
| --- | --- | --- | --- |
| F4-E1-T01 eenheden | code + test | `apps/web/public/shared/spatial.js` (gedeeld door server, editor, game): integer mm, Cells van 64 m met `floor` (ook negatief), half-open grenzen, `convertLegacyPoint` blokkeert bij onbekende schaal. Aanname **1 legacy-unit = 1 m** | meting op de echte wereld (CLI stap 2). Bestaande `player_positions` blijven REAL meters: de server rekent per tick om, er is geen backfill nodig zolang de schaal 1 is |
| F4-E1-T02 World/Region/Area | code + test | kinds `region` (rechthoek) en `area` (box/cylinder/polygon, prioriteit server-only); `world-compiler.js`: overlap en "Area buiten Region" blokkeren bij elk command én bij publish; CAS/If-Match zoals F3. World = de ene gepubliceerde wereld (geen apart singleton-document) | verhuizen van een Area door een grens te verschuiven vraagt een batch-command (nu: Area verwijderen en opnieuw tekenen) |
| F4-E1-T03 walkable/collider | code + test | kind `collider` (obstakel: rechthoek/cirkel/polygoon, binnen een Region). In de build als mm-geometrie + per Cell; `applyCanonicalBuild` zet ze bij `world.collision.blockers`, waaruit server-movement én game-prediction dezelfde walkability-index bouwen. Test: kernel-blokkade = authored vorm op 1000 punten; obstakel zonder vorm kan niet bestaan | walkable `surface_patch` (loopvlak/hoogte) en de F5-navtile-bake; een open tab ziet nieuwe obstakels pas na verversen |
| F4-E2-T01 Cells + serverresolve | code + test | Cell-index (`cells` per `x_z`) in client.json en server.json, bytegelijk bij gelijke input; server bepaalt Region/Area per tick met 0,5 m hysteresis en stuurt `world:membership` bij elke wissel en bij verbinden. AOI (`interest.js`) en Cells delen hetzelfde 64 m-grid (test op 1000 punten) | losse Cell-fragmentbestanden (nu één index in de build) |
| F4-E2-T02 client streaming | open | Region- en Area-grenzen geven al nul `setWorld()`: ze liggen in dezelfde wereld. Een oude zonegrens geeft nog wel een herbouw | volgende stap: zonewissel zonder `setWorld` |
| F4-E2-T03 World Builder | code | `world-builder-view.js`: tab Wereld met Region en drie Area-vormen, kiezen, maten, muziek, Cells-overlay, kaartbeeld en selectie blijven na verversen | browsercheck (CLI) en Kevin-test; travel-link door de server: open |
| F4-E3-T01 Preview-sandbox | begin | 2D draft-preview: tab Wereld -> **Preview (draft)**. `src/server/preview/preview-service.js` compileert de opgeslagen vormen in het geheugen (zelfde compiler als publish) en geeft per punt Region/Area/Cell/muziek. Schrijft niets (test: hele DB bytegelijk, geen build). Je blijft op dezelfde pagina, dus kaartbeeld en selectie blijven staan | 3D-PlayPreview met eigen server-instance, default-deny PersistencePort en sessie-expiry |
| F4-E3-T02 audio + minimap | code + test | `game/world-audio.js`: crossfade met twee `<audio>`-elementen (licht), `audio_locked` zonder crash, klik ontgrendelt. Region-randen op de minimap uit de build | Kevin hoort de wissel; minimap-bake uit surfaces: open |
| F4-E3-T03 wereldimport | begin | knop "Zones uit Nodes als Regions overnemen" + lijst per zone: gekoppeld of niet (`legacyZoneRef`, server-only) | paritygate die finalize blokkeert, camera/licht/travel/scatter-inventaris |

## Bewuste keuzes en grenzen

- `spatial.js` staat in `apps/web/public/shared/` (niet `src/shared/`), omdat server, editor en game exact dezelfde code moeten draaien (zoals `movement-kernel.js`).
- Region/Area-membership leeft alleen in het geheugen van de server (niet in `player_positions`). Na een herstart rekent de eerste beweging het opnieuw uit; bij verbinden stuurt de server het meteen.
- De Cell-index staat in de build. Zonder Regions/Areas ontbreekt de `world`-sleutel, zodat F3-builds bytegelijk blijven en rollback naar een F3-build blijft werken (compilerversie ongewijzigd).
- Muziek-URL komt uit de assetlijst op het moment van publiceren. Verplaats je een asset, publiceer dan opnieuw.

## Bewijslog

- Cloud, Node 22, `GK_TEST_ISOLATED=1 node --test`: nieuw spatial-migration, world-commands, world-membership, world-audio-map, preview-isolation, walkable-collider;
  plus F2/F3 authoring-commands, build-atomic, authoring-api, authoring-lifecycle, mmo-service-f2, interest-backpressure, migrations, backup-restore, portal-arrival: 43/43 groen.
  `tests/mmo-service.test.js` en `tests/movement-parity.test.js` draaien in de cloud niet (pakket `three` ontbreekt hier); dat was vóór deze fase al zo. De CLI draait ze in stap 0.
- `node --check` op alle gewijzigde bestanden: ok.

## CLI-controle op de server (2026-10-25, avond)

Kort: unit-tests en check groen, schaal klopt (1 unit = 1 m), alle 36 F4-browserchecks groen, server op :3001 herstart met F4.
Eén browsercheck buiten F4 is rood (portal, zie onder).

### Stap 0 - basis (geïsoleerd)
- `npm run check`: 110/110 ok.
- `GK_TEST_ISOLATED=1 npm test`: eerst 126/133. 7 tests in `path-follow` en `pointer-stall` faalden met `this.assignSpatialMembership is not a function`.
  - Oorzaak: in F4 bepaalt de servertick ook Region/Area. Deze twee tests draaien de tick op een nep-server zonder die methode. In de cloud draaiden ze niet (`three` ontbrak), daarom viel het daar niet op. De servercode is goed.
  - Reparatie: de nep-server krijgt de echte `spatialIndex` en `assignSpatialMembership` uit `MmoService` (zonder build blijft Region/Area leeg). Er is geen controle verzwakt.
- Daarna 133/133 groen. Alle zes nieuwe F4-bestanden draaiden mee: spatial-migration 5, world-commands 3, world-membership 2, world-audio-map 2, preview-isolation 1, walkable-collider 2.

### Stap 1 - schaalmeting (F4-E1-T01)
Alleen gelezen uit `published_world_state` (build gk-51bc2239dd3e).
- Speler: `collisionRadius` 0,5 en `scale` 1. Model Wizard (`wizard.glb`): 1,75 hoog, 0,65 diep. De breedte van 1,49 komt van armen en staf in de rustpose.
- Zones zijn 500 x 500. Sunny Meadow1 ligt op x -250..250 en z -250..250. Desert ligt op x -250..250 en z 250..750; samen hebben ze een gedeelde rand op z = 250. Peaks en test zijn ook 500 x 500.
- **1 legacy-unit = 1 meter klopt**: straal 0,5 valt binnen 0,3-0,6 en hoogte 1,75 binnen 1,6-2. `LEGACY_UNITS_PER_METER` blijft 1.

### Stap 2 - browsercheck "F4 wereld" (`scripts/game-browser-check.js`, `runWorldBuilderFlow`)
Het stuk staat na het F3-3D-stuk. Pagina B is dan dicht, dus er hoeven minder WebGL-werelden tegelijk te draaien. Aan het eind zet de check de build van vóór F4 terug en loopt A terug naar zijn startplek, zodat de latere checks niets van F4 merken.

Laatste run (`stap2-browser-check-rerun3`): **alle 36 F4-checks groen**.
- **Tekenen**: twee Regions rond de spawn met een gedeelde rand op x = 0, plus een rechthoek, een cirkel en een polygoon, allemaal met de muis.
  - Een overlappende Region geeft een melding en wordt niet opgeslagen.
  - Na verversen staan de vormen, de selectie en het kaartbeeld er nog (0,004% pixels anders).
- **Grens**: A loopt met toets D van (-6,3; -13,3) naar (1,8; -15,5).
  - Het label wisselt van F4 West naar F4 Oost en de banner toont "Je bent nu in F4 Oost".
  - `worldRebuilds` blijft 1 -> 1 en er zijn geen console-errors.
- **Muziek**: korte .ogg (`tests/fixtures/f4-muziek.ogg`) op de rechthoek gezet en gepubliceerd.
  - A loopt de rechthoek in zonder klik: het label toont "· klik of druk een toets voor muziek" met `data-audio=audio_locked`, zonder crash.
  - Na een klik: `playing`.
- **Obstakel** (vlak op x = 22, stoplijn 21,5), gemeten bij stilstand:
  - server (21,403; -16,594) en scherm (21,403; -16,594): verschil 0,000 m;
  - verste getoonde x tijdens het lopen was 21,403, dus geen rubberband.
- **Draft-preview**: de cirkel is verplaatst en opgeslagen, niet gepubliceerd. De preview toont "Area: F4 Cirkel verplaatst".
  - Rijen voor en na zijn gelijk: player_positions 4, authoring_builds 5, authoring_release 1, authoring_release_audit 6.
  - De actieve build bleef gelijk.

Aangepaste grenzen in mijn eigen testcode. Het gedrag klopte telkens; de test was te streng of nam iets verkeerds aan.
1. **Startpunt van A**: tijdsbudget van 15 s naar 45 s. Na de eerdere checks staat A ~117 m verderop en haalde het startpunt niet. Daardoor begon run 1 op de verkeerde plek: label F4 Oost in plaats van F4 West, en het obstakel werd gemist.
2. **Kaartbeeld na verversen**: niet pixel-exact maar maximaal 1% andere pixels. Gemeten is 0,004%, en verdwenen vormen of een andere zoom veranderen een groot deel van de kaart.
3. **Grens**: de toets wordt vastgehouden tot het label wisselt (max 5 s) in plaats van een vaste 1,1 s. A bleef anders net vóór de rand plus 0,5 m hysteresis.
4. **Obstakel**: een lange muur (z -24..0). Toets D loopt niet exact naar +x (cos 0,97), dus A gleed langs de korte muur eromheen. Dat glijden is correct gedrag.
5. **Autoplay**: headless Chromium speelt geluid ook zonder gebaar af, ook met `--autoplay-policy` en ook in een vers tabblad. De test gebruikt daarom een vers tabblad van A en bootst de regel van gewone Chrome na: `play()` weigert tot er een echte (isTrusted) klik of toets was. Zo is de gamelogica getest (label, `audio_locked`, ontgrendelen bij klik). Het echte geluid hoort Kevin zelf.
6. **Draft-preview**: eerst één klik, daarna slepen. Het resultaatvak boven de kaart groeit bij het eerste resultaat, waardoor de kaart tijdens het slepen ~20 px zakt.

Rood buiten F4:
- **"het portal is aanklikbaar in beeld"** (in alle runs).
  - De portaltest loopt maximaal 8 x 8 m = 64 m, maar A staat na de eerdere bomen-checks ~130 m van het portal.
  - F4 zet A terug op die plek (binnen 1,3 m) en verandert hier dus niets.
  - Mogelijke oplossing: A eerst naar het portal laten lopen in die test. Niet gedaan, want dat valt buiten F4.
- In runs 1 en 2 waren ook residency, remote avatars en een B-afstand rood. In de laatste run waren die groen; het lijken timing-wisselaars van vóór F4.

Opmerkingen voor Kevin (niet aangepast):
- `f4-minimap.png` is een opname van het hele scherm. De testwereld heeft geen minimap, dus de Region-rand op de minimap is hier niet getest; dat zie je zelf in je eigen wereld.
- Het Region-label staat midden bovenin over de levensbalk/target-HUD heen (zie `f4-grens.png`).
- Preview (draft): de kaart verspringt als het resultaatvak bij het eerste resultaat groter wordt (punt 6).

### Stap 3 - :3001
- `git pull`: al up-to-date (ec60ca4 "Fase 04").
- Backup: `/root/gk-backups/f4-pre-restart-2026-10-25`, integriteit ok.
- Herstart: `systemctl restart gk-real-node-editor` om 21:50; health 200 na 2 s; geen migraties en geen fouten in de log.
- Tab Wereld zelf openen kon ik niet: daarvoor is Kevins admin-login nodig.
  - Wat je moet zien (alleen gelezen uit de database): 4 grijze zonekaders en "Oude zones (4): 4 nog niet gekoppeld". De zones zijn Desert (zone.canvas.x0.zm1), Peaks (zone.canvas.x0.zm1.2), test (zone.canvas.x1.z0) en Sunny Meadow1 (zone.node02.live_demo).
  - Er zijn nog geen Regions, Areas of obstakels in je draft.
- Er is niets getekend of gepubliceerd.

### Evidence
- Stap 0: `stap0-npm-test-2026-10-25.log` (rood), `stap0-npm-test-rerun-2026-10-25.log` (groen), `stap0-npm-check-2026-10-25.log`.
- Stap 1: `stap1-schaalmeting-2026-10-25.json`.
- Stap 2: `stap2-browser-check-2026-10-25.log` (run 1, 11 rood), `-rerun-` (6 rood), `-rerun2-` (2 rood), `-rerun3-` (alleen portal rood), plus `f4-wereld.png`, `f4-grens.png`, `f4-minimap.png`, `f4-obstakel.png` en `f4-preview.png`.
- Stap 3: `stap3-git-pull-2026-10-25.log`, `stap3-backup-voor-herstart-2026-10-25.log`, `stap3-herstart-2026-10-25.log`.

Kevin test nu zelf: twee Regions en drie Areas tekenen, publiceren, over de grens lopen en de muziek horen wisselen.
