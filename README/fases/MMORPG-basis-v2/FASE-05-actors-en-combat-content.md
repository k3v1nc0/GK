# Fase 05 - Actors en combatcontent

> Status: voorstel voor implementatie, **niet** gerealiseerd op de geauditeerde `main`-baseline. De implementatietaken zijn nog niet uitgevoerd; deze documentatiecommit verandert geen gamecode of database.

**Doel:** Kevin maakt een enemy en resource in de Werkbank en speelt een reproduceerbare actor-, combat-, loot- en equipmentlus in Preview en published game.

## Waarom nu
F2 heeft authority bewezen, F4 levert collision en Cells; nu pas kan navmesh en data-gedreven actorcontent op een bewezen runtime worden aangesloten.

## Afbakening
**Wel:** Beperkte actor/ability/stat/loot kinds, navmeshspike en baking, eenvoudige AI, server hit/cooldown, equipment, feedback en parity.

**Niet:** Generieke behavior tree, volledige physics, raids, PvP, motion matching, willekeurige shaders/formules.

## Afhankelijkheden en instap
**Afhankelijkheden:** F4 walkable/collider en builds; F2 sim/operation receipts.

**Instapcriteria:** F4 World Builder en Preview zijn geaccepteerd; 20 Hz sim en F2-crashtest groen.

## Exit-criteria / Definition of Done
- [ ] Kevin maakt een enemy en resource, plaatst ze, loopt een patrol, verslaat enemy, ontvangt loot en ziet respawn in Preview en published build.
- [ ] 1000 gelijke combat seeds en inputs geven identieke hit/damage/loot-outputs; twee clients verschillen <=0,2 m voor dezelfde actor na stabiel netwerk.
- [ ] Navtile hash is gelijk bij herbouw; speler-collision en navmesh hebben 0 onverklaarde bereikbaarheidstegenstrijdigheden in de referentiescene.
- [ ] Na 20 Cell unload/reload en 100 death/respawncycli zijn er nul dubbele actorIDs, claims of renderresources; tickgate F2 blijft gehaald.
- [ ] Canonical actor-/combatdomeinen hebben shadow/parityrapport; legacy acties voor die domeinen zijn uitgeschakeld.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** Actor Builder, navtiles, typed AI/combat/loot, equipment/animation feedback, parity- en leakrapport.

**Testplan:** Navtile spike, deterministic golden vectors, security-negative tests, 100 respawns, 20 unloadcycli, Kevin-playthrough.

**Inschatting:** XL, 6-10 weken; aanname 1 humanoid rig, 1 enemy, 1 resource en eenvoudige vlakke navigatie.

**Met eigen ogen:** Kevin bouwt en plaatst de enemy en ziet dezelfde hit, loot en respawn in Preview en game.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Node Recast/GLB analyse werkt niet op echte assets | middel | hoog | Spikes vooraf, fallback waypoint-AI met expliciete beperking. |
| Twee combatpaden blijven actief | hoog | hoog | Domeinwriter/routeguard en golden replay. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 5-E1 - Actorcontent en navigatie

#### F5-E1-T01 - GLB en navmesh technische spikes

**Context:** Rig/clip- en Recast-aannames mogen geen verborgen blokkade worden. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** assets/; nieuw: scripts/spike-glb.js; nieuw: scripts/spike-navtile.js; nieuw: README/fases/evidence/MMORPG-v2/F5/spikes.md.

**Concrete stappen:**

1. Test echte GK-modellen op bone/clip/socket/upright.
2. Bake dezelfde 64 m tile tweemaal in Node 24.
3. Meet duur en hash.
4. Documenteer alternatief bij fail.

**Acceptatie:**

- [ ] Per representatief model assen/schaal/clips vastgelegd
- [ ] navtile twee keer gelijke hash
- [ ] versie exact gepind na ADR
- [ ] bij fail taak F5-E1-T03 kiest waypointfallback.

**Test:** node scripts/spike-glb.js --fixture; node scripts/spike-navtile.js --fixture.

**Afhankelijkheden:** F4-E1-T03.

**Grootte:** S (een agentsessie).

#### F5-E1-T02 - Actor- en spawnkinds

**Context:** Actor definitions moeten gescheiden zijn van runtime-instances. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/actor.js; nieuw: src/server/authoring/actor-compiler.js; nieuw: tests/actor-compiler.test.js.

**Concrete stappen:**

1. Definieer actor_archetype, actor_spawn, stat_block, faction en animation_set met typed refs.
2. Compileer naar per-Cell actorpackage met stabiele runtimeKeys.

**Acceptatie:**

- [ ] Ontbrekende rig/ref blokkeert publish
- [ ] zelfde input geeft gelijke hash
- [ ] spawn occurrence krijgt nieuwe instanceId per respawn
- [ ] geen authored actor in verse DB.

**Test:** GK_TEST_ISOLATED=1 node --test tests/actor-compiler.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F5-E1-T01,F3-E1-T02.

**Grootte:** M (een agentsessie).

#### F5-E1-T03 - Navtiles, patrol en AI-state

**Context:** De server moet NPCs binnen walkable grenzen kunnen bewegen zonder clientsturing. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** nieuw: src/server/runtime/navigation.js; nieuw: src/server/runtime/actor-ai.js; nieuw: tests/navigation-ai.test.js.

**Concrete stappen:**

1. Gebruik F4 collision-input.
2. Bake/load per Cell.
3. Implementeer idle/patrol/engage/return/dead, bounded path queries en sleep buiten interest.
4. Gebruik waypointfallback alleen met ADR.

**Acceptatie:**

- [ ] Patrol bereikt 5 waypoints binnen tolerantie
- [ ] geen pad door blocker
- [ ] tilegrens geeft geen stuck actor
- [ ] path query-budget en fail-state meetbaar.

**Test:** GK_TEST_ISOLATED=1 node --test tests/navigation-ai.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F5-E1-T02,F4-E2-T01.

**Grootte:** M (een agentsessie).

### 5-E2 - Combat en bezittingen

#### F5-E2-T01 - Fixed-point stats, abilities en combat

**Context:** Huidige basic attack bevat content-ID en floatberekening in code. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** src/server/node03-runtime-service.js; nieuw: src/shared/combat-math.js; nieuw: src/shared/authoring/kinds/combat.js; nieuw: tests/combat-vectors.test.js.

**Concrete stappen:**

1. Definieer integer milli-stats, basispunten, rounding, typed ability/cooldown.
2. Haal waarden uit pinned build.
3. Valideer server range, target en safe Area.
4. Maak golden vectors.

**Acceptatie:**

- [ ] 1000 replays byte-identiek
- [ ] geen hardcoded ability.basic_attack als regelbron
- [ ] safe Area weigert hostile action
- [ ] overflow/negatief-rondingvectors slagen.

**Test:** GK_TEST_ISOLATED=1 node --test tests/combat-vectors.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F5-E1-T02,F2-E3-T01.

**Grootte:** M (een agentsessie).

#### F5-E2-T02 - Serverhitdetectie en latencytest

**Context:** Client mag geen hit sturen; netwerkvertraging mag niet willekeurig voordeel opleveren. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** nieuw: src/server/runtime/hit-resolution.js; nieuw: tests/hit-resolution.test.js.

**Concrete stappen:**

1. Maak serverbroadphase per Cell en swept shape tegen hurtbox.
2. Valideer target op huidige servertick, clamp inputtimestamps, log afgewezen hits en meet PvE-uitkomst bij 0/150/250 ms RTT. Geen historische rewind zonder apart fairness-ADR.

**Acceptatie:**

- [ ] Vervalste target/hit wordt genegeerd
- [ ] dezelfde tick/input geeft dezelfde hit
- [ ] geen target buiten interest of range
- [ ] 0/150/250 ms RTT heeft ruwe hit/missdata
- [ ] rewind staat uit.

**Test:** GK_TEST_ISOLATED=1 node --test tests/hit-resolution.test.js; GK_TEST_ISOLATED=1 npm test; latency-proxy scenario.

**Afhankelijkheden:** F5-E2-T01,F5-E1-T03.

**Grootte:** M (een agentsessie).

#### F5-E2-T03 - Loottabel en resource-definities

**Context:** Legacy gather/loot moet als getypeerde buildcontent dezelfde exact-once engine als F2 gebruiken. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/loot.js; nieuw: src/server/runtime/loot-resource.js; nieuw: tests/loot-resource.test.js.

**Concrete stappen:**

1. Definieer loot_table, resource_definition en respawn_policy.
2. Seed server-RNG per event.
3. Valideer refs en gebruik F2 operation receipt voor grants.

**Acceptatie:**

- [ ] Zelfde seed geeft gelijke drops
- [ ] loot-tablecyclus blokkeert publish
- [ ] twee gelijktijdige claims geven een grant
- [ ] geen clientgestuurde lootuitkomst.

**Test:** GK_TEST_ISOLATED=1 node --test tests/loot-resource.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F5-E2-T01,F2-E3-T02.

**Grootte:** M (een agentsessie).

#### F5-E2-T04 - Equipment met enkel legacy-schrijfpad

**Context:** Legacy equipment hangt nog aan profiel-ID; te vroege character-migratie zou twee writers openen. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** db/migrations/006_catalog_player_state_combat_loot.sql; src/server/node03-runtime-service.js; nieuw: src/server/character-equipment.js; nieuw: tests/equipment-compat.test.js.

**Concrete stappen:**

1. Routeer nieuw equipcommando via de bestaande instance/equipment-tabellen en F2 1:1 charactermap.
2. Valideer ownership/slot/revision in een transactie.
3. Maak alleen een read-only shadowexport voor latere migratie.

**Acceptatie:**

- [ ] Exact een schrijver voor equipment en item-instances
- [ ] geen nieuwe character-itemrijen in F5
- [ ] dezelfde instance past niet in twee slots
- [ ] shadowtellingen en owners zijn gelijk na refresh.

**Test:** GK_TEST_ISOLATED=1 node --test tests/equipment-compat.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F2-E1-T02,F5-E2-T01.

**Grootte:** M (een agentsessie).

#### F5-E2-T05 - Lootclaim en respawnstate-schema

**Context:** Zonder expliciete migratie zijn claim en expiry na restart niet herleidbaar. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** nieuw: db/migrations/015_actor_runtime_state.sql; src/server/runtime/loot-resource.js; nieuw: tests/actor-runtime-state.test.js.

**Concrete stappen:**

1. Voeg unique claims toe: gedeelde wereldpickup per instance/spawnOccurrence, persoonlijke loot per instance/spawnOccurrence/character.
2. Bewaar respawn expiry.
3. Commit claim, grantreceipt en expiry samen.
4. Herstel resources na restart.

**Acceptatie:**

- [ ] Migratie draait tweemaal idempotent op kopie
- [ ] twee characters claimen dezelfde gedeelde pickup slechts eenmaal
- [ ] persoonlijke loot blijft per character afgeschermd
- [ ] restart voor/na expiry spawnt precies eenmaal
- [ ] FK- en integrity_check groen.

**Test:** GK_TEST_ISOLATED=1 node --test tests/actor-runtime-state.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F5-E2-T03,F1-E2-T02.

**Grootte:** M (een agentsessie).

### 5-E3 - Presentatie en cutover

#### F5-E3-T01 - Animatie, audio en VFX uit events

**Context:** Presentatie moet serverevents volgen zonder gameplaybesluiten te sturen. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** apps/web/public/shared/world-runtime.js; nieuw: apps/web/public/game/actor-presentation.js; nieuw: tests/actor-lifecycle.test.js.

**Concrete stappen:**

1. Maak animation mixer per visible actor.
2. Trigger action audio/VFX op eventId.
3. Pool en dispose bij Cell-evict, respawn en buildwissel.
4. Audio-locked blijft veilig.

**Acceptatie:**

- [ ] 20 unloadcycli laten actor/mixer/audio/VFX-telling terugkeren naar baseline
- [ ] dubbele eventId toont effect eenmaal
- [ ] geen client-side hit/damagebesluit.

**Test:** GK_TEST_ISOLATED=1 node --test tests/actor-lifecycle.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F5-E2-T02,F5-E2-T03,F4-E3-T02.

**Grootte:** M (een agentsessie).

#### F5-E3-T02 - Actor Builder en cutoverbewijs

**Context:** Kevin moet archetype, patrol, ability en loot zonder Nodes kunnen wijzigen. Deze kaart draagt direct bij aan het doel van Fase 05.

**Betrokken paden:** apps/web/public/editor/editor.js; nieuw: apps/web/public/editor/actor-builder.js; nieuw: src/server/authoring/actor-import.js; README/fases/evidence/MMORPG-v2/F5/.

**Concrete stappen:**

1. Bouw compacte actorflow, importeer gebruikte legacy actor/combatnodes, draai shadowparity en schakel node03 attack/gather/pickup per canonical domein uit.

**Acceptatie:**

- [ ] Kevin-playthrough van create->place->fight->loot->respawn
- [ ] graphhash onveranderd
- [ ] oude actie kan geen tweede authoritypad openen
- [ ] parityrapport per gebruikt type.

**Test:** GK_TEST_ISOLATED=1 node --test tests/actor-cutover.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check; Kevin-test.

**Afhankelijkheden:** F5-E1-T03,F5-E2-T04,F5-E2-T05,F5-E3-T01.

**Grootte:** M (een agentsessie).

