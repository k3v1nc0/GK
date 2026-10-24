# Testafspraak GK: smoke- en browsertest als vaste basis

Afgesproken met Kevin op 2026-10-23. Doel: als er iets in de code verandert en ergens anders iets omvalt, vangen deze tests dat op. Dan hoeft niet elke keer opnieuw uitgezocht te worden hoe je de game test.

## Wat er is

| Commando | Bestand | Wat het test |
| --- | --- | --- |
| `GK_TEST_ISOLATED=1 npm test` | `tests/*.test.js` | Unittests, zonder server. |
| `GK_TEST_ISOLATED=1 npm run smoke` | `scripts/smoke-test.js` | Server- en API-regressie, ~945 checks: gedeelde runtimefuncties, auth en security (Fase 01), assets, authoring via de normale route (foundation, World Assembly, zones), draft en publish, MMO (accounts, WebSocket-sync, persistentie) en scatter. |
| `GK_TEST_ISOLATED=1 npm run game:browser-check` | `scripts/game-browser-check.js` | Echte Chromium via Puppeteer: login, HUD, beweging en collision, camera, chunk-residency, klik/drag-to-move, een korte klik zonder heen-en-weer lopen, een portal aanklikken en naar de doelzone reizen, en twee spelers die elkaar zien. Bewaakt ook de inlogtijd: "MMO online" binnen 20 s na het laden (normaal ~1,5 s). Bewaart screenshots en een eventlog. |
| `GK_TEST_ISOLATED=1 npm run perf:game` | `scripts/perf-game.js` | Frametime-meting in Chromium op een vaste benchmarkwereld. |
| `GK_TEST_ISOLATED=1 GK_WORLD_SOURCE_DB=… npm run feel:world-copy` | `scripts/feel-world-copy.js` | Speelgevoel in een **kopie** van een echte wereld, met nep-spelers. Speler C loopt ook een bosroute in de Test-zone, met "hoe ver wijkt de server af van de gelopen route" (padvolgen). Meet per frame: terugbewegingen en drift na een klik, verschuiven na loslaten, portal aanklikken en reizen, over een zonegrens lopen (aantal wereld-herbouwen), medespelers die "vliegen", renderkosten en servertick. Alleen na Kevins toestemming. |
| `GK_TEST_ISOLATED=1 GK_WORLD_SOURCE_DB=… npm run perf:world-copy` | `scripts/profile-world-copy.js` | CPU-profiel (of met `GK_PROFILE_MODE=trace` een browsertrace) tijdens lopen in een **kopie** van een echte wereld. Alleen na Kevins toestemming, zie hieronder. |

Alle server-tests starten een eigen, tijdelijke server: tijdelijke database, tijdelijke assets, een willekeurige loopbackpoort en opruimen na afloop. Ze raken de live service (`gk-real-node-editor`, poort 3001), de normale `storage/` en de `.env` nooit.

Gedeelde bouwstenen voor nieuwe tests:

- `scripts/lib/test-isolation.js`: verplichte isolatie (DB, assets, poort, opruimen).
- `scripts/lib/test-world.js`: testwereld via de normale route. `applyFoundation`, `createStartZone` en `ROUTES` zeggen waar elk soort node aansluit. Game Output accepteert sinds NODE-01 alleen `gameProject`.

## De afspraak

1. **Elke gedragswijziging werkt de tests bij, in dezelfde commit.** Bij een nieuwe feature komt er een check bij. Bij bewust veranderd gedrag pas je de verwachting aan en zet je de reden in de commit.
2. **Nooit een check weghalen of versoepelen om groen te krijgen.** Zoek eerst uit of het product fout is of de test verouderd. Een productfout repareer je; een verouderde test zet je gelijk met het bewuste besluit.
3. **Draaien bij grote wijzigingen**: een nieuwe fase, of een refactor van server, publish, netcode, authoring of de gameclient. Draai ook vóór elke fase-oplevering. Niet bij elke kleine wijziging, vanwege kosten en geheugen.
4. **Altijd geïsoleerd** met `GK_TEST_ISOLATED=1`. Nooit tegen de live service of de normale opslag.
5. **Eén tegelijk.** De server heeft 4 GB RAM zonder swap. Is het geheugen krap (`free -m`), stop dan eerst de TypeScript-server van de editor: `pkill -f 'typescript/lib/tsserve[r]'`. De editor start hem vanzelf opnieuw.
6. **Bewijs bij een fase-oplevering**: zet de ruwe uitvoer in `README/fases/evidence/<fase>/`. Let op: Apache serveert `README/` publiek, dus geen wachtwoorden, cookies of privégegevens.

## Hoe draaien

```sh
cd /var/www/gk
GK_TEST_ISOLATED=1 npm test
GK_TEST_ISOLATED=1 npm run smoke
GK_TEST_ISOLATED=1 GK_BROWSER_EVIDENCE_DIR=/tmp/gk-browser-evidence npm run game:browser-check
GK_TEST_ISOLATED=1 npm run perf:game
```

`npm run smoke` eindigt met `SMOKE TEST GESLAAGD` of met `SMOKE TEST MISLUKT: <eerste mislukte check>`. De smoke stopt bij de eerste fout; repareer die en draai opnieuw.

### Profiel en speelgevoel op een kopie van een echte wereld

`perf:world-copy` en `feel:world-copy` (gedeelde opzet: `scripts/lib/world-copy.js`) zijn bedoeld voor prestatieproblemen die alleen in Kevins eigen wereld optreden. Het script opent de bron-database **alleen-lezen** en kopieert uitsluitend wereldtabellen (`editor_nodes`, `editor_node_edges`, `asset_library`, `published_world_state`, `editor_graph_meta`, `content_id_aliases`, `game_hud_layout_defaults`) plus de assetbestanden naar een tijdelijke testmap. Accounts, sessies en spelergegevens gaan nooit mee; verwijzingen naar gebruikers worden leeggemaakt. De testserver krijgt nep-accounts en wordt na afloop opgeruimd. Gebruik dit alleen met Kevins toestemming.

Met `GK_WORLD_COPY_NETWORK_PRESET=fast` (of een andere preset uit `src/shared/node-types.js`) past `feel:world-copy` alleen in de tijdelijke kopie een andere netwerkpreset toe, om die te vergelijken zonder de echte wereld te raken. De meting "Vertraging medespeler" vergelijkt via de klok wanneer B speler A op een plek ziet met wanneer A daar zelf was.

Let op: op deze server zonder GPU is de rendertijd niet representatief, en de headless browser haalt maar ongeveer 4 fps. `feel:world-copy` verlaagt daarom de CPU-prioriteit van Chrome, zodat de testserver bijblijft, en zet de achtergrondafremming van Chrome uit. Bij 4 fps zijn de framesprongen groot (2–3 eenheden per frame); kijk vooral naar terugbewegingen, drift, client-server-verschil en zonewissels. De software-renderer kopieert elk frame terug (`ReadPixels` in de trace). Gebruik het profiel voor JavaScript-kosten; frametime op echte hardware meet Kevin zelf.

## Bekende aandachtspunten

- `zone_environment_settings` (achtergrond en mist per zone) wordt gepubliceerd, maar de client tekent achtergrond en mist nog uit `world.world.*`. In de nieuwe route zijn dat dus de standaardwaarden. Dit is een productgat; de smoke controleert de gepubliceerde zone-omgeving.
- De vergelijking "dense_fill dekt beter dan random" gebruikt het gemiddelde over vaste seeds, omdat asset-id's (en dus de scatter-seed) per run verschillen.
- "GLB upload response komt snel terug" (< 10 s) is gevoelig voor een zwaar belaste server. Faalt alleen die check, kijk dan eerst naar `uptime` en `free -m`.
- **Open bevinding browsertest (2026-10-24):** twee residency-checks falen bewust zichtbaar: "grensoscillatie veroorzaakt geen herhaald flikkeren" en "er zijn geen herhaalde visibility-toggle warnings". Loopt de speler heen en weer rond een chunkgrens, dan ontlaadt de client een object aan de rand van het camera-venster na 350 ms (`OBJECT_VISIBILITY_HOLD_MS`). Bij terugkomst laadt hij het opnieuw: 3 wissels, en de client waarschuwt daar zelf over. Het camera-venster (`cameraOnly` + `strictUnloadOutsideCamera`) gebruikt daarbij geen preload-ring. Dit is een streamingkeuze voor Kevin: een langere hold of een preload-marge in cameraOnly. De test is hier niet op aangepast.
