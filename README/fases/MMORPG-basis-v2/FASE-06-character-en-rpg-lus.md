# Fase 06 - Character en RPG-lus

> Status: voorstel voor implementatie, **niet** gerealiseerd op de geauditeerde `main`-baseline. De implementatietaken zijn nog niet uitgevoerd; deze documentatiecommit verandert geen gamecode of database.

**Doel:** Twee characters per account kunnen een volledige quest-, combat-, loot-, XP-, equipment- en beperkte crafting/vendorlus spelen en na restart terugvinden.

## Waarom nu
De basis heeft nu actors en content; een RPG-loop zonder expliciet characterbezit en atomaire economie zou data of beloningen dupliceren.

## Afbakening
**Wel:** Multi-character, boot/select, compacte toegankelijke HUD, canonical quests/progression, inventory/currency-ledger, crafting/vendor en reconciliatie.

**Niet:** Volledige UI Studio, cinematic intro, market, direct trade, auction, mail als gameplayfeature, cash shop, meerdere talen.

## Afhankelijkheden en instap
**Afhankelijkheden:** F5 actor/combat en F3 canonical builds; F2 character 1:1 map.

**Instapcriteria:** F5 actorplaythrough en equipmentcompatibiliteit geslaagd; terugzetpunt van spelerdata gemaakt; oude mutatieroutes geinventariseerd.

## Exit-criteria / Definition of Done
- [ ] Account maakt twee characters, speelt met beide en heeft na refresh/restart gescheiden inventory, quest, currency en positie.
- [ ] Quest -> combat -> loot -> XP -> equip -> craft/vendor -> turn-in doorloopt 10 maal zonder duplicatie; ieder critical event heeft precies een receipt en ledgerregel.
- [ ] Reconciliatie vindt nul onverklaarde owner/saldoafwijkingen op testdata; geinjecteerde afwijking geeft alarm zonder stille reparatie.
- [ ] Alle verplichte schermen werken met toetsenbord op 360/768/1440 px, browserzoom 200% en reduced-motion; geen user-scalable=no.
- [ ] De game gebruikt /ws/game; /api/game/live en oude HTTP-gameacties weigeren nieuwe mutaties met 410 of expliciete versiecode; er is geen tweede authoritypad.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** Characterselect, save-aggregate, RPG authoringconsumers, HUD, quest/XP/economy transacties, reconciliation en migratierapport.

**Testplan:** Multi-character migratie; property tests voor ledger; 10 loops; browser a11y/viewport; crash/retry rond turn-in.

**Inschatting:** XL, 6-10 weken; aanname slechts een questlijn, een recipe en een vendor als basiscontent.

**Met eigen ogen:** Kevin kiest twee characters en ziet dat hun afzonderlijke progressie na restart terugkomt; hij doorloopt zelf de RPG-lus.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Profiel- naar character-FK raakt veel tabellen | hoog | kritiek | Backfill in delen, paritytellingen, restore-oefening. |
| RPG-scope groeit door market/UI Studio | middel | hoog | Definitie sluit die features expliciet uit. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 6-E1 - Character en client

#### F6-E1-T01 - Characterstate schrijfpadinventaris

**Context:** F2 heeft een 1:1 map; vóór migratie moet bekend zijn welke oude services per domein nog schrijven. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/mmo-service.js; src/server/node03-runtime-service.js; src/server/node04-quest-runtime-service.js; src/server/node05-economy-runtime-service.js; db/migrations/006_*.sql; db/migrations/007_*.sql; db/migrations/008_*.sql; nieuw: tests/character-write-paths.test.js.

**Concrete stappen:**

1. Maak per tabel/domein een lijst van readers/writers, actuele FK, operationId en legacy route.
2. Kies per domein een fence en kopieer de DB met F1-backup.

**Acceptatie:**

- [ ] Inventory/equipment/currency/quest/fog/position hebben elk een eigenaar en oude endpointlijst
- [ ] geen onbekend schrijfpad op cutoverlijst
- [ ] backupmanifest is verifieerbaar.

**Test:** GK_TEST_ISOLATED=1 node --test tests/character-write-paths.test.js; documentreview.

**Afhankelijkheden:** F5-E3-T02,F5-E2-T04.

**Grootte:** S (een agentsessie).

#### F6-E1-T04 - Additief characterstate-schema

**Context:** Nieuwe tabellen moeten bestaan vóór een enkele writer wordt omgezet. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** nieuw: db/migrations/016_character_state.sql; src/server/db.js; nieuw: tests/character-schema.test.js.

**Concrete stappen:**

1. Definieer charactereigen FK-, unique- en revisionconstraints voor inventory/equipment/currency plus ledger/quest/fog/position zonder oude tabellen te verwijderen.
2. Voer migratie op een kopie uit.

**Acceptatie:**

- [ ] Oude runtime start nog tegen nieuw schema
- [ ] FK-check leeg
- [ ] oude rijtellingen gelijk
- [ ] migratiehead en backupmanifest vastgelegd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/character-schema.test.js.

**Afhankelijkheden:** F6-E1-T01,F1-E2-T02.

**Grootte:** M (een agentsessie).

#### F6-E1-T05 - Inventory/equipment backfill

**Context:** Bestaande items mogen bij de 1:1 conversie niet van eigenaar wisselen. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** db/migrations/006_catalog_player_state_combat_loot.sql; nieuw: src/server/migrations/backfill-items.js; nieuw: tests/backfill-items.test.js.

**Concrete stappen:**

1. Kopieer iteminstances, stacks en equipment via de F2 map naar character-tabellen terwijl de legacy writer actief blijft.
2. Schrijf parityrapport, zonder nieuwe writer te activeren.

**Acceptatie:**

- [ ] Aantallen, instance-IDs en owners gelijk
- [ ] nul dubbele/ownerloze items
- [ ] herstart van backfill is idempotent
- [ ] graph/gameplay blijft op legacy writer.

**Test:** GK_TEST_ISOLATED=1 node --test tests/backfill-items.test.js.

**Afhankelijkheden:** F6-E1-T04.

**Grootte:** M (een agentsessie).

#### F6-E1-T06 - Inventory/equipment writerfence

**Context:** Na parity mag voor items nog maar een character-writer bestaan. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/node03-runtime-service.js; src/server/character-equipment.js; nieuw: tests/item-writer-fence.test.js.

**Concrete stappen:**

1. Pauzeer itemmutaties.
2. Controleer finale delta.
3. Wissel item/equipment commands naar character-tabellen in een korte transactie.
4. Weiger legacy itemwrites.
5. Hervat na healthcheck.

**Acceptatie:**

- [ ] Nul itemwrites via oud pad na switch
- [ ] dezelfde instance nooit in twee owners/slots
- [ ] geforceerde cutoverfout laat oude writer als enige actief
- [ ] restoreprocedure geoefend.

**Test:** GK_TEST_ISOLATED=1 node --test tests/item-writer-fence.test.js.

**Afhankelijkheden:** F6-E1-T05.

**Grootte:** M (een agentsessie).

#### F6-E1-T07 - Currency backfill en writerfence

**Context:** Saldo en ledger moeten samen naar de characterowner volgen. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/node05-economy-runtime-service.js; db/migrations/006_catalog_player_state_combat_loot.sql; nieuw: tests/currency-cutover.test.js.

**Concrete stappen:**

1. Backfill saldo/ledger via 1:1 map.
2. Vergelijk sommen.
3. Pauzeer currencyacties.
4. Zet writer met featurefence om en weiger oude grants.

**Acceptatie:**

- [ ] Saldo en ledgersom per character gelijk
- [ ] dubbele operatie na switch geeft een receipt
- [ ] oud currency-endpoint schrijft niets
- [ ] fout herstelt oude writer zonder dual-write.

**Test:** GK_TEST_ISOLATED=1 node --test tests/currency-cutover.test.js.

**Afhankelijkheden:** F6-E1-T04,F6-E1-T06.

**Grootte:** M (een agentsessie).

#### F6-E1-T08 - Quest/fog backfill

**Context:** Quest en ontdekte cellen mogen niet tussen characters lekken. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** db/migrations/006_minimap_fog_discovery.sql; db/migrations/007_campaign_quest_dialogue_progress.sql; nieuw: tests/quest-fog-backfill.test.js.

**Concrete stappen:**

1. Kopieer quest/objective/flag en fog per 1:1 map.
2. Vergelijk tellingen en status-hashes.
3. Maak rerun idempotent zonder authoringcontent te muteren.

**Acceptatie:**

- [ ] Elke oude rij heeft precies een character
- [ ] objectivestatus en foghash gelijk
- [ ] nul orphan FK
- [ ] geen writer switch in deze kaart.

**Test:** GK_TEST_ISOLATED=1 node --test tests/quest-fog-backfill.test.js.

**Afhankelijkheden:** F6-E1-T04.

**Grootte:** M (een agentsessie).

#### F6-E1-T09 - Quest/fog writerfence

**Context:** Na backfill mogen oude node04 en fogroutes niet langer profielstate schrijven. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/node04-quest-runtime-service.js; src/server/mmo-service.js; nieuw: tests/quest-fog-cutover.test.js.

**Concrete stappen:**

1. Pauzeer quest/fogmutaties, pas finale delta toe, activeer character-writer en weiger legacy profielwrites.
2. Valideer turn-in/refresh.

**Acceptatie:**

- [ ] Oude quest/fogroute geeft geen write
- [ ] turn-in op character A wijzigt B niet
- [ ] rollback van mislukte switch laat een writer actief.

**Test:** GK_TEST_ISOLATED=1 node --test tests/quest-fog-cutover.test.js.

**Afhankelijkheden:** F6-E1-T08,F6-E1-T07.

**Grootte:** M (een agentsessie).

#### F6-E1-T10 - Positie backfill en writerfence

**Context:** Positie en zone moeten met hetzelfde character meeverhuizen. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/mmo-service.js; db/migrations/003_mmo_accounts_sessions_players.sql; nieuw: tests/position-cutover.test.js.

**Concrete stappen:**

1. Backfill posities/zone via map.
2. Pauzeer checkpoints, neem finale positie over, schakel writer om en test reconnect na procesrestart.

**Acceptatie:**

- [ ] Positieverschil <=1 mm na conversie
- [ ] oude profielpositie krijgt geen writes
- [ ] reconnect kiest juiste characterzone
- [ ] cutoverfout behoudt een writer.

**Test:** GK_TEST_ISOLATED=1 node --test tests/position-cutover.test.js.

**Afhankelijkheden:** F6-E1-T04,F6-E1-T09.

**Grootte:** M (een agentsessie).

#### F6-E1-T11 - Tweede character en selectie

**Context:** De legacy selected_character_id-kolom heeft al een catalogbetekenis en mag niet stil hergebruikt worden. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/character-service.js; db/migrations/016_character_state.sql; nieuw: tests/second-character.test.js.

**Concrete stappen:**

1. Maak slot 1 met lege progressie.
2. Gebruik een nieuw active_player_character_id-veld voor selectie en lease epoch.
3. Test twee parallelle sessies en behoud oude catalogselectie.

**Acceptatie:**

- [ ] Tweede character heeft geen items/quest/currency van eerste
- [ ] wissel en restart behouden afzonderlijke state
- [ ] oude selected_character_id blijft exact zijn bestaande betekenis houden.

**Test:** GK_TEST_ISOLATED=1 node --test tests/second-character.test.js.

**Afhankelijkheden:** F6-E1-T06,F6-E1-T07,F6-E1-T09,F6-E1-T10.

**Grootte:** M (een agentsessie).

#### F6-E1-T12 - Boot- en characterselectflow

**Context:** De client kan characterkeuze niet als losse UI-stap bovenop een oude playerflow plakken. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** apps/web/public/game/index.html; apps/web/public/game/game.js; nieuw: apps/web/public/game/boot-state.js; nieuw: tests/boot-state.test.js.

**Concrete stappen:**

1. Maak cold/auth/select/loading/in-game/recover states.
2. Join-ticket en lease-epoch.
3. Kies/create/restore tot twee slots.
4. Migreer de actieve client naar /ws/game.
5. Herstel bij build mismatch of verlopen sessie.

**Acceptatie:**

- [ ] Twee characters maak/kies/speel/refresh
- [ ] verlopen ticket gaat terug naar select zonder dubbele actor
- [ ] nieuwe client opent geen /api/game/live
- [ ] geen tweede WebGL-context.

**Test:** GK_TEST_ISOLATED=1 node --test tests/boot-state.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F6-E1-T11,F2-E2-T01.

**Grootte:** M (een agentsessie).

#### F6-E1-T13 - Compacte toegankelijke HUD

**Context:** De bestaande game.js en viewport-blokkade maken gewone acties onnodig moeilijk. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** apps/web/public/game/game.js; apps/web/public/game/index.html; apps/web/public/game/styles.css; nieuw: apps/web/public/game/ui-store.js; nieuw: tests/game-ui.test.js.

**Concrete stappen:**

1. Verplaats health, target, inventory, quest en notifications naar een kleine eventgedreven store.
2. Herstel zoom.
3. Voeg focus, reduced motion en toetsenbordacties toe zonder volledige UI Studio.

**Acceptatie:**

- [ ] 360/768/1440 px en 200% zoom zonder overlap
- [ ] geen user-scalable=no
- [ ] screenreaderstatus bij reward
- [ ] geen polling voor health/quest.

**Test:** GK_TEST_ISOLATED=1 node --test tests/game-ui.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check; a11y-scan.

**Afhankelijkheden:** F6-E1-T12.

**Grootte:** M (een agentsessie).

### 6-E2 - Story en progression

#### F6-E2-T01 - Canonical quest en dialogue

**Context:** De bestaande node04-quest moet in een build zitten zonder tweede writer. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/story.js; nieuw: src/server/authoring/story-compiler.js; nieuw: tests/story-compiler.test.js.

**Concrete stappen:**

1. Definieer quest_definition, dialogue_definition en reward_bundle met gesloten predicates/actions.
2. Importeer gebruikte legacy quests.
3. Compileer deterministic objective IDs.

**Acceptatie:**

- [ ] Onbekende ref/predicate blokkeert publish
- [ ] legacy quest met huidige volgorde heeft parityrapport
- [ ] server leest gepinde build
- [ ] geen client-eval.

**Test:** GK_TEST_ISOLATED=1 node --test tests/story-compiler.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E1-T02,F6-E1-T11.

**Grootte:** M (een agentsessie).

#### F6-E2-T02 - XP, level en questturn-in

**Context:** Progression en rewards moeten op dezelfde characteroperatie volgen. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** nieuw: src/server/character-progression.js; src/server/node04-quest-runtime-service.js; nieuw: tests/progression-turnin.test.js.

**Concrete stappen:**

1. Maak integer XP thresholds en levelselectie.
2. Consumeer serverevents.
3. Commit queststate, XP, items, currency en receipt in een transactie.
4. Schakel legacy node04-route uit na parity.

**Acceptatie:**

- [ ] Dubbele turn-in geeft exact een reward
- [ ] XP boundary vectors kloppen
- [ ] crashreplay geen dubbele level
- [ ] questlog toont serverstate.

**Test:** GK_TEST_ISOLATED=1 node --test tests/progression-turnin.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F6-E2-T01,F2-E3-T02.

**Grootte:** M (een agentsessie).

### 6-E3 - Economie en bewijs

#### F6-E3-T01 - Economy-invarianten op characterstate

**Context:** Itemownership en saldo uit F6-E1-T06/T07 zijn de economische waarheid, niet de client-HUD. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** nieuw: src/server/character-economy.js; nieuw: db/migrations/017_character_economy_constraints.sql; nieuw: tests/economy-ledger.test.js.

**Concrete stappen:**

1. Voeg ontbrekende unieke constraints/indexen en admin-audit toe aan de reeds gemigreerde 016-tabellen.
2. Valideer stackgrenzen, integer-minor saldo en ledger.
3. OperationId bindt volledige request en reservering/grant blijven een transactie.

**Acceptatie:**

- [ ] Geen tweede currency- of ledgertabel naast 016
- [ ] negatief saldo onmogelijk
- [ ] zelfde operationId met andere payload 409
- [ ] som ledger = saldo na 1000 random operaties.

**Test:** GK_TEST_ISOLATED=1 node --test tests/economy-ledger.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F6-E1-T11,F5-E2-T05.

**Grootte:** M (een agentsessie).

#### F6-E3-T02 - Een recipe en vendor consumer

**Context:** Crafting en vendor bewijzen dat economie buiten loot ook transactioneel blijft. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** nieuw: src/shared/authoring/kinds/economy.js; src/server/node05-economy-runtime-service.js; nieuw: tests/craft-vendor.test.js.

**Concrete stappen:**

1. Definieer een recipe en vendor_catalog.
2. Validateer station/range/stock.
3. Consumeer input en grant output in een transactie.
4. Retire bijbehorende node05-acties na parity.

**Acceptatie:**

- [ ] Concurrente craft koopt niet meer dan bezit/stock
- [ ] retry geeft geen tweede output
- [ ] prijs/tax uit build
- [ ] Kevin craft en koopt met echte UI.

**Test:** GK_TEST_ISOLATED=1 node --test tests/craft-vendor.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F6-E3-T01,F6-E1-T13.

**Grootte:** M (een agentsessie).

#### F6-E3-T03 - Reconciliatie en volledige RPG-test

**Context:** Databaseschema en afzonderlijke unit-tests bewijzen geen hele lus. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** nieuw: scripts/reconcile-economy.js; nieuw: tests/rpg-e2e.test.js; README/fases/evidence/MMORPG-v2/F6/.

**Concrete stappen:**

1. Controleer saldo tegen ledger en elke item-instance op een owner.
2. Alarmeer zonder auto-repair.
3. Speel 10 loops met twee characters en injecteer crash rond commits.

**Acceptatie:**

- [ ] Nul afwijkingen in normale run
- [ ] geinjecteerde afwijking verschijnt in rapport
- [ ] 10 loops/restarts zonder dubbele reward
- [ ] Kevin-video en akkoord.

**Test:** GK_TEST_ISOLATED=1 node scripts/reconcile-economy.js; GK_TEST_ISOLATED=1 node --test tests/rpg-e2e.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F6-E2-T02,F6-E3-T02.

**Grootte:** M (een agentsessie).

#### F6-E3-T04 - Legacy game-ingangen afsluiten bij F6-exit

**Context:** Een blijvend /api/game/live- of HTTP-mutatiepad kan de nieuwe authority alsnog omzeilen. Deze kaart draagt direct bij aan het doel van Fase 06.

**Betrokken paden:** src/server/server.js; src/server/mmo-service.js; apps/web/public/game/game.js; nieuw: tests/legacy-endpoints-closed.test.js.

**Concrete stappen:**

1. Inventariseer alle oude game-POST-routes en WS-upgrade.
2. Migreer resterende clientcalls naar /ws/game.
3. Laat oude mutaties en /api/game/live na de F6-cutover met 410 of versiecode sluiten.
4. Behoud alleen expliciet read-only compatibility waar nodig.

**Acceptatie:**

- [ ] Nieuwe client voert 10 RPG-loops uit zonder legacy endpoint
- [ ] oude WS-join en elke oude game-mutatie schrijven nul rijen
- [ ] statuscode en updatebericht zijn getest
- [ ] R-29 is met route-inventaris afgesloten.

**Test:** GK_TEST_ISOLATED=1 node --test tests/legacy-endpoints-closed.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F6-E3-T03,F6-E1-T12,F6-E1-T11.

**Grootte:** M (een agentsessie).

