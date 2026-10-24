# Fase 04 - Wereld en PlayPreview

> Status: voorstel voor implementatie, **niet** gerealiseerd op de geauditeerde `main`-baseline. De implementatietaken zijn nog niet uitgevoerd; deze documentatiecommit verandert geen gamecode of database.

**Doel:** Kevin tekent twee aangrenzende Regions, loopt ertussen zonder herbouw en test dezelfde draft veilig in een geisoleerde PlayPreview.

## Waarom nu
Actor-navigation en AOI-uitbreiding hebben een eenduidig ruimtelijk/collision-contract nodig; Preview moet eerst bewijzen dat tests geen echte spelerstate schrijven.

## Afbakening
**Wel:** World/Region/Area/Cell, millimeterconversie, surfaces/colliders, streaming, een beperkte World Builder, travel, minimap, audio en Preview.

**Niet:** Procedurele terrain, weather, shard handoff, volledige audio-editor, generieke scatter-editor als basiseis.

## Afhankelijkheden en instap
**Afhankelijkheden:** F3 canonical kernel/builds, F2 movement en characterstate.

**Instapcriteria:** F3 drie domeinen canonical; buildloader, rollback en F2-slice groen.

## Exit-criteria / Definition of Done
- [ ] Twee aangrenzende Regions plus drie Area-vormen via editor; grenspassage heeft nul full-world `setWorld()` en geen zichtbare teleport.
- [ ] Cell attach p95 <= 4 ms, client frametime p95 <= 33,3 ms op vastgelegde referentielaptop; ontbrekende Cell stopt beweging veilig.
- [ ] Preview gebruikt draftbuild en schrijft nul rijen in authoring-, player-, quest- of economy-tabellen; exit/refresh herstelt selectie en camera.
- [ ] Gepubliceerde wereld heeft dezelfde Region/Area/collision-betekenis als Preview; twee oude zones zijn expliciet gemapt of blokkeren finalize.
- [ ] Audio-locked toestand crasht niet; Area/Regionmuziek wisselt hoorbaar na user gesture.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** World Builder, spatial schema, Cell-fragments, streaming, sandbox-preview, minimap/audio-slice en parityrapport.

**Testplan:** Spatial vectors inclusief negatieve cellen; streaming fault-tests; Preview DB-diff; laptop meting; Kevin-grens- en audiotest.

**Inschatting:** XL, 5-8 weken; aanname vlakke wereld en bestaande assets; geen navmesh of procedurale terrain.

**Met eigen ogen:** Kevin tekent Regions/Areas, wandelt over een grens, hoort muziek wisselen en keert uit Preview terug naar exact dezelfde editorview.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Legacy wereld-eenheid onduidelijk | hoog | hoog | Meet bestaande zone en verifieer 1 unit = 1 m voor conversie. |
| Preview raakt echte services | middel | hoog | PersistencePort default-deny en DB-diffgate. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 4-E1 - Spatial contract

#### F4-E1-T01 - Eenheden en coordinatenmigratie

**Context:** Bestaande posities zijn REAL-worldcoordinates, terwijl toekomstig spatial contract integer mm vereist. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** db/migrations/003_mmo_accounts_sessions_players.sql; nieuw: src/shared/spatial.js; nieuw: tests/spatial-migration.test.js.

**Concrete stappen:**

1. Meet legacy units op evidence-wereld.
2. Definieer world-mm en Region-lokaal, yaw-milligraden, half-open grenzen.
3. Schrijf eenmalige backfill met rapport en terugrolkopie.

**Acceptatie:**

- [ ] -1/0/grensvectoren correct
- [ ] bestaande posities binnen 1 mm na round-trip
- [ ] onbekende schaal blokkeert migratie
- [ ] geen tweede conversie bij rerun.

**Test:** GK_TEST_ISOLATED=1 node --test tests/spatial-migration.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E2-T02,F2-E1-T02.

**Grootte:** M (een agentsessie).

#### F4-E1-T02 - World, Region en Area kinds

**Context:** Spatial ownership moet door schema en command worden bewaakt. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/world.js; nieuw: src/server/authoring/world-commands.js; nieuw: tests/world-commands.test.js.

**Concrete stappen:**

1. Definieer singleton World, exclusieve Region-bounds en Area box/cylinder/polygon.
2. Valideer overlap, ownership en transfer in een command.

**Acceptatie:**

- [ ] Overlappende Regions blokkeren
- [ ] Area buiten eigenaar blokkeert
- [ ] objecttransfer houdt world-mm gelijk
- [ ] editorrevision CAS blijft gelden.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-commands.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F4-E1-T01,F3-E1-T02.

**Grootte:** M (een agentsessie).

#### F4-E1-T03 - Walkable en collider contract

**Context:** Navmesh in F5 mag niet opnieuw collision-authoring verzinnen. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/surface.js; src/shared/movement-kernel.js; nieuw: tests/walkable-collider.test.js.

**Concrete stappen:**

1. Maak surface_patch met walkable en statische collidercomponent.
2. Compileer collision-geometrie per Cell.
3. Verbind server movement en latere navtile-input aan exact dezelfde bron.

**Acceptatie:**

- [ ] Speler en collider-test zijn gelijk op 1000 punten
- [ ] ontbrekende collider is blocking bij publish
- [ ] F5-navtile-fixture leest zonder conversie dezelfde geometrie.

**Test:** GK_TEST_ISOLATED=1 node --test tests/walkable-collider.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F4-E1-T02.

**Grootte:** M (een agentsessie).

### 4-E2 - Streaming en tooling

#### F4-E2-T01 - Cell-fragmenten en serverresolve

**Context:** Een afgeleid 64 m grid geeft streaming en AOI dezelfde betekenis. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** nieuw: src/server/authoring/world-compiler.js; src/server/runtime/interest.js; nieuw: tests/cell-compiler.test.js.

**Concrete stappen:**

1. Compileer world/cells/<x>_<z>.json uit authored data.
2. Indexeer Region/Area kandidaten.
3. Hash elk fragment.
4. Voeg server-side membership/hysteresis toe.

**Acceptatie:**

- [ ] Zelfde input geeft bytegelijke cellen
- [ ] negatieve cellen en shared edge correct
- [ ] AOI en Cell-loader gebruiken dezelfde key
- [ ] geen server-only informatie in clientfragment.

**Test:** GK_TEST_ISOLATED=1 node --test tests/cell-compiler.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F4-E1-T03,F3-E2-T02.

**Grootte:** M (een agentsessie).

#### F4-E2-T02 - Client streaming zonder full rebuild

**Context:** De huidige world-runtime heeft chunkresidency maar zet bij worldwissel opnieuw op. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** apps/web/public/shared/world-runtime.js; apps/web/public/game/game.js; nieuw: tests/cell-streaming.test.js.

**Concrete stappen:**

1. Maak required/prefetch/resident/evict toestanden en cancellation.
2. Attach/detach per Cell.
3. Behoud interactie-IDs.
4. Stop veilig voor ontbrekende required Cell.

**Acceptatie:**

- [ ] Geen setWorld bij Cellgrens
- [ ] nul dubbele collider of hit target na 20 in/uit-cycli
- [ ] attach p95 <=4 ms op referentiehardware
- [ ] missende Cell stopt doorgang.

**Test:** GK_TEST_ISOLATED=1 node --test tests/cell-streaming.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F4-E2-T01.

**Grootte:** M (een agentsessie).

#### F4-E2-T03 - World Builder en travel

**Context:** Kevin moet ruimtelijke structuur kunnen maken zonder nodecanvas. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** apps/web/public/editor/editor.js; nieuw: apps/web/public/editor/world-builder.js; src/server/mmo-service.js; nieuw: tests/world-builder.test.js.

**Concrete stappen:**

1. Maak Region/Area/surface/spawn tools met menselijke selectie.
2. Server voert travel_link uit.
3. Toon Cell status in ontwikkeloverlay.

**Acceptatie:**

- [ ] Kevin tekent twee Regions en drie Areas
- [ ] Save/refresh behoudt vormen
- [ ] travel-link wordt door server gepositioneerd
- [ ] geen node CRUD voor canonical world.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-builder.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check; Kevin-test.

**Afhankelijkheden:** F4-E1-T02,F4-E2-T02.

**Grootte:** M (een agentsessie).

### 4-E3 - Preview en audio

#### F4-E3-T01 - Server-side Preview-sandbox

**Context:** Client-only Preview is geen bewijs tegen echte playerwrites. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** nieuw: src/server/preview/preview-service.js; nieuw: db/migrations/014_preview.sql; apps/web/public/editor/editor.js; nieuw: tests/preview-isolation.test.js.

**Concrete stappen:**

1. Pin draftbuild.
2. Maak ephemeral preview instance met PersistencePort die player/economy/questwrites weigert.
3. Stuur intents.
4. Herstel editorcamera/selectie bij exit en refresh.

**Acceptatie:**

- [ ] DB-snapshot voor/na bytegelijk voor genoemde tabellen
- [ ] Preview command kan geen live reward geven
- [ ] refresh herstelt editorview
- [ ] sessie-expiry ruimt instance op.

**Test:** GK_TEST_ISOLATED=1 node --test tests/preview-isolation.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F4-E2-T02,F3-E2-T02.

**Grootte:** M (een agentsessie).

#### F4-E3-T02 - Audio en minimap als buildconsumers

**Context:** Muziek en kaart mogen geen configuratie zonder zichtbare runtimeconsument blijven. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/audio.js; apps/web/public/shared/world-runtime.js; nieuw: src/server/authoring/minimap-compiler.js; nieuw: tests/world-audio-map.test.js.

**Concrete stappen:**

1. Definieer track/playlist/audio-event.
2. Kies metadata-probe via ADR.
3. Maak Region/Area crossfade met unlock-fallback.
4. Bake minimap uit authored surfaces en sla fog per character op.

**Acceptatie:**

- [ ] AudioContext-denial toont audio_locked zonder crash
- [ ] crossfade bij grens
- [ ] minimap klopt met world build
- [ ] fog blijft na refresh.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-audio-map.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F4-E2-T01,F4-E3-T01.

**Grootte:** M (een agentsessie).

#### F4-E3-T03 - World import en paritygate

**Context:** Oude zone-, camera-, licht- en travelwaarden mogen niet stil verdwijnen. Deze kaart draagt direct bij aan het doel van Fase 04.

**Betrokken paden:** src/server/graph-repository.js; nieuw: src/server/authoring/world-import.js; README/fases/evidence/MMORPG-v2/F4/.

**Concrete stappen:**

1. Inventariseer zone/surface/light/camera/travel/scatter/minimap in gebruikte graphs.
2. Importeer ondersteunde vormen.
3. Rapporteer iedere onbekende waarde en blokkeer finalize.
4. Test preview vs published.

**Acceptatie:**

- [ ] Iedere gebruikte legacy world-node heeft mapping/expliciete beslissing
- [ ] graphhash blijft gelijk na cutover
- [ ] twee zones visueel en collisionmatig vergeleken
- [ ] Kevin accepteert verschillen.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-import.test.js; GK_TEST_ISOLATED=1 npm test; Kevin-vergelijking.

**Afhankelijkheden:** F4-E2-T03,F4-E3-T02.

**Grootte:** M (een agentsessie).

