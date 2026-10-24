# Fase 02 - Speelbare verticale slice

> Status: **in uitvoering** sinds 2026-10-24. Serverbouwstenen staan in commit "Fase 02"; voortgang en het CLI-deel staan in `README/fases/evidence/MMORPG-v2/F2/VOORTGANG.md` en `CLI-PROMPT.md`.

**Doel:** Twee accounts spelen samen een kleine bestaande wereld met serverbesliste beweging, gevecht, loot en quest, met meetbare reconnect en crashherstel.

## Waarom nu
De huidige code heeft al spelers, zones en RPG-acties, maar geen bewezen veilige, begrensde MMO-simulatie. Eerst deze route echt speelbaar maken voorkomt een lange onzichtbare authoringomweg.

## Afbakening
**Wel:** Een wereldinstantie, 20 Hz serverclock, een inputprotocol, clientprediction, AOI, 1:1 characteridentiteit, exacte rewardtransacties, gemeten databasekosten en botmeting.

**Niet:** Nieuwe content-editor, navmesh, meerdere zoneservers, PvP, guilds, market, volledige actorbuilder.

## Afhankelijkheden en instap
**Afhankelijkheden:** Fase 1 volledig; voor taak F2-E2-T01 de pure movementkernel en F1-securitytests.

**Instapcriteria:** Bestaande published fixture met een speler, enemy, pickup en quest is reproduceerbaar; F1-restore en securitygates groen.

## Exit-criteria / Definition of Done
- [ ] Twee browsers tonen dezelfde speler/enemy-state; een volledige kill -> loot -> quest turn-in is na twee refreshes en serverrestart gelijk.
- [ ] 25 geisoleerde bots, 30 minuten, 1 zone: tick p95 <= 25 ms, p99 <= 40 ms, eventloopvertraging p99 <=20 ms en nul duplicate reward/quest receipt; bij falen is F2 NO-GO tot gemeten correctie.
- [ ] Clientmanipulatie van positie, hit, damage, loot, currency en questprogress levert nul servermutaties.
- [ ] Twee pakketverliesprofielen (5% verlies, 150 ms RTT) herstellen lokale positie tot <= 0,2 m van serverpositie binnen 2 s na stabiel netwerk.
- [ ] Procescrash na geackte reward verliest 0 geackte rewards; position RPO <= 5 s; geen synchrone SQLite-write binnen de simtick; DB-write p95/p99 zijn gemeten op dezelfde 25-botscene.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** Een reproduceerbare 2-account slice, protocol-schema, character-backfill, sim-loop, gemeten en begrensde persistence, AOI, bot/chaosrapport en Kevin-video.

**Testplan:** `npm test`; authority- en protocolconformance; twee echte browsers; bots 25/30 min; crashinjectie rond rewardcommit.

**Inschatting:** XL, 5-8 weken bij 1 engineer plus agents, aanname bestaande contentfixture en vaste testhost; extra tijd als client/server movement uiteenloopt.

**Met eigen ogen:** Kevin kan met twee accounts een vijand verslaan en na restart exact dezelfde beloning en queststatus terugzien.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Legacy code koppelt tick en DB | hoog | hoog | Inventariseer schrijftoegang, verplaats writes buiten de simtick en meet voor een workerbesluit. |
| 25 bots op referentiehost niet haalbaar | middel | hoog | F2 blijft NO-GO; versimpel scene/query of kies een andere vastgelegde testhost en herhaal de volledige proef. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 2-E1 - Identity en simulatie

#### F2-E1-T01 - Pure movementkernel delen

**Context:** De server importeert nu de browser-world-runtime met Three.js. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/mmo-service.js; apps/web/public/shared/world-runtime.js; nieuw: src/shared/movement-kernel.js; nieuw: tests/movement-parity.test.js.

**Concrete stappen:**

1. Extract alleen collision/walkability-math zonder DOM/Three.
2. Houd input/output-adapter voor oude wereld.
3. Voer 1000 random vectors en grensdaggevallen door oud en nieuw.

**Acceptatie:**

- [ ] Server-importgraph bevat geen Three.js
- [ ] 1000 vectors geven gelijke uitkomst binnen 1 mm
- [ ] huidige collider- en zone-tests blijven groen.

**Test:** GK_TEST_ISOLATED=1 node --test tests/movement-parity.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E1-T01.

**Grootte:** M (een agentsessie).

#### F2-E1-T02 - Player-character 1-op-1 en session lease

**Context:** Playerprofile is nu account en character tegelijk; toekomstige migratie mag bezit niet ambigu maken. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** nieuw: db/migrations/011_player_characters.sql; src/server/mmo-service.js; nieuw: src/server/character-service.js; nieuw: tests/character-backfill.test.js.

**Concrete stappen:**

1. Maak tabel player_characters met per bestaand profiel exact een standaardcharacter.
2. Bewaar legacy profiel-ID mapping.
3. Voeg lease epoch toe zonder bestaande selected_character_id-semantiek voortijdig te veranderen.

**Acceptatie:**

- [ ] Bestaande profile- en player_*-telling matcht de mapping
- [ ] tweede login fencet oude lease
- [ ] node03/04/05 blijven werken
- [ ] migratie idempotent op kopie.

**Test:** GK_TEST_ISOLATED=1 node --test tests/character-backfill.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E2-T02.

**Grootte:** M (een agentsessie).

#### F2-E1-T03 - 20 Hz klok als pure module

**Context:** De bestaande 50 Hz-loop mag niet in een grote wijziging worden omgebouwd. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** nieuw: src/server/runtime/world-clock.js; nieuw: tests/world-clock.test.js.

**Concrete stappen:**

1. Maak monotone vaste 50 ms stap, gesorteerde inputqueue, max drie inhaalticks en meetbare DEGRADED-status zonder DB-, WS- of actorcode.

**Acceptatie:**

- [ ] 1000 stappen simuleren exact 50 s
- [ ] identieke inputs geven identieke volgorde
- [ ] vijf overschrijdingen zetten DEGRADED
- [ ] module heeft geen DB- of WS-import.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-clock.test.js.

**Afhankelijkheden:** F2-E1-T01.

**Grootte:** S (een agentsessie).

#### F2-E1-T04 - Een world-owner adapter

**Context:** De klok moet de bestaande beweging overnemen zonder de grote mmo-service volledig te herschrijven. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/mmo-service.js; nieuw: src/server/runtime/world-sim.js; nieuw: tests/world-owner.test.js.

**Concrete stappen:**

1. Verplaats een movement-updatepad naar world-sim.
2. Laat slechts een owner de instance-state muteren.
3. Laat het oude 50 Hz-pad achter een testbare uitschakelgrens.

**Acceptatie:**

- [ ] Per instance precies een muterende loop
- [ ] bestaande zone-/collisionfixture speelt door
- [ ] 50 Hz-pad kan niet tegelijk met 20 Hz draaien.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-owner.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F2-E1-T02,F2-E1-T03.

**Grootte:** M (een agentsessie).

#### F2-E1-T05 - Timing-consumers en replayparity

**Context:** Snapshot, cooldown en reconnect mogen niet ongemerkt een 50 Hz-aanname behouden. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/mmo-service.js; src/server/node03-runtime-service.js; nieuw: tests/world-timing-parity.test.js.

**Concrete stappen:**

1. Inventariseer WORLD_TICK_HZ-consumers.
2. Converteer timers en cooldowns naar tijd of 20 Hz ticks.
3. Replay een bestaande twee-accountfixture en leg voor/na verschillen vast.

**Acceptatie:**

- [ ] Geen actieve tweede 50 Hz-loop
- [ ] cooldown/reconnect duren binnen 50 ms van het contract
- [ ] tickduur en achterstand hebben ruwe samples
- [ ] gameplayafwijking is verklaard.

**Test:** GK_TEST_ISOLATED=1 node --test tests/world-timing-parity.test.js; GK_TEST_ISOLATED=1 npm run smoke.

**Afhankelijkheden:** F2-E1-T04.

**Grootte:** M (een agentsessie).

### 2-E2 - Netwerk en persistentie

#### F2-E2-T01 - Versiebeheerd WS-protocol en join

**Context:** De huidige `/api/game/live`-events hebben geen expliciete compatibiliteitsgrens. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/server.js; src/server/mmo-service.js; nieuw: src/shared/protocol/v1.js; nieuw: tests/protocol-v1.test.js.

**Concrete stappen:**

1. Voeg same-origin `/ws/game`, subprotocol gk-mmo-v1 en gedeeld JSON-schema toe.
2. Vereis cookie, exacte Origin en AUTH met single-use join-ticket binnen 5 s.
3. Laat legacy endpoint tijdelijk intact.

**Acceptatie:**

- [ ] Zonder ticket/Origin/session geen join
- [ ] onbekende versie sluit met gedocumenteerde code
- [ ] payload >64 KiB sluit
- [ ] legacyclient blijft tot F6 op oude route werken.

**Test:** GK_TEST_ISOLATED=1 node --test tests/protocol-v1.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E1-T04,F2-E1-T02.

**Grootte:** M (een agentsessie).

#### F2-E2-T02 - Prediction en interpolatie

**Context:** Lokale respons en remote vloeiendheid moeten volgen op dezelfde servermath. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** apps/web/public/game/game.js; nieuw: apps/web/public/game/netcode.js; src/shared/movement-kernel.js; nieuw: tests/reconciliation.test.js.

**Concrete stappen:**

1. Buffer inputseq.
2. Voorspel alleen eigen locomotion.
3. Reconcile op ack en replay.
4. Interpoleer remote snapshots met bounded buffer.
5. Toon debugcorrecties alleen in dev.

**Acceptatie:**

- [ ] Na 5% verlies/150 ms RTT convergeert <=0,2 m in 2 s
- [ ] damage/loot wordt nooit voorspeld
- [ ] remote verdwijnt na despawn.

**Test:** GK_TEST_ISOLATED=1 node --test tests/reconciliation.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F2-E2-T01,F2-E1-T05.

**Grootte:** M (een agentsessie).

#### F2-E2-T03 - Cell-AOI en backpressure

**Context:** Globale broadcasts en onbegrensde sendqueues zullen elke CCU-test vertekenen. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/mmo-service.js; nieuw: src/server/runtime/interest.js; nieuw: tests/interest-backpressure.test.js.

**Concrete stappen:**

1. Indexeer actors per 64 m cell.
2. Self 20 Hz, near 10 Hz, far 2 Hz.
3. Visibility per actor.
4. Coalesce movement in bounded queue en disconnect trage clients zonder critical events te verliezen.

**Acceptatie:**

- [ ] Buiten AOI geen entity payload
- [ ] langzame socket groeit niet boven 512 KiB
- [ ] normale socket mist geen spawn/despawn
- [ ] privacyvelden ontbreken.

**Test:** GK_TEST_ISOLATED=1 node --test tests/interest-backpressure.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F2-E2-T01,F2-E1-T05.

**Grootte:** M (een agentsessie).

#### F2-E2-T04 - DB-schrijfkosten en callgraph meten

**Context:** Een worker is pas gerechtvaardigd als bestaande synchrone writes de F2-gates daadwerkelijk breken. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/db.js; src/server/mmo-service.js; src/server/node03-runtime-service.js; src/server/node04-quest-runtime-service.js; src/server/node05-economy-runtime-service.js; nieuw: scripts/perf-db-writes.js.

**Concrete stappen:**

1. Instrumenteer bestaande schrijfoperaties en eventloopdelay.
2. Label simtick, node03, node04 en node05.
3. Meet NORMAL op 1/10/25 bots en optioneel FULL op een wegwerp-DB.

**Acceptatie:**

- [ ] Ruwe p50/p95/p99 per operatie en tick/eventloop opgeslagen
- [ ] elk schrijfpad heeft owner en transactiegrens
- [ ] geen productie-DB geraakt
- [ ] expliciet besluit: huidige pad of worker-contingency.

**Test:** GK_TEST_ISOLATED=1 node scripts/perf-db-writes.js --users=25; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F2-E1-T05,F1-E3-T02.

**Grootte:** S (een agentsessie).

#### F2-E2-T05 - Posities buiten simtick bewaren

**Context:** Posities mogen checkpointdata zijn zonder iedere simstap met SQLite te blokkeren. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/mmo-service.js; nieuw: src/server/persistence/position-checkpoint.js; nieuw: tests/position-checkpoint.test.js.

**Concrete stappen:**

1. Bewaar nieuwste positie in geheugen.
2. Flush op interval maximaal 5 s en op zone/logout.
3. Plan flush buiten world-sim en begrens pending jobs.
4. Bij fout markeer dirty en weiger stil verlies.

**Acceptatie:**

- [ ] world-sim roept geen DatabaseSync aan
- [ ] 30 min/25 bots tickgate blijft gehaald
- [ ] procescrash geeft positie-RPO <=5 s
- [ ] overflow/fout is zichtbaar en blokkeert nieuwe joins.

**Test:** GK_TEST_ISOLATED=1 node --test tests/position-checkpoint.test.js; GK_TEST_ISOLATED=1 node scripts/load-bots.js --users=25 --minutes=30.

**Afhankelijkheden:** F2-E2-T04.

**Grootte:** M (een agentsessie).

#### F2-E2-T06 - Kritieke operatiecontract

**Context:** Een reward-ACK mag pas volgen op een volledige SQLite-transactie met een herhaalbaar operationId. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/db.js; nieuw: src/server/persistence/operation-contract.js; nieuw: tests/operation-contract.test.js.

**Concrete stappen:**

1. Leg operationId, genormaliseerde payload-hash, receiptstatus en foutcodes vast.
2. Maak een helper die alleen binnen de bestaande transactiecallback wordt aangeroepen.

**Acceptatie:**

- [ ] Gelijke ID/payload retourneert hetzelfde receipt
- [ ] gelijke ID/andere payload geeft 409
- [ ] helper heeft geen async of workervereiste
- [ ] rollback laat nul receipts.

**Test:** GK_TEST_ISOLATED=1 node --test tests/operation-contract.test.js.

**Afhankelijkheden:** F2-E2-T04.

**Grootte:** S (een agentsessie).

#### F2-E2-T07 - Node03 grant en loot atomair

**Context:** Combatloot is de eerste kritieke consumer van het operatiecontract. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/node03-runtime-service.js; nieuw: tests/node03-atomic-grant.test.js.

**Concrete stappen:**

1. Bind attack/loot/grant aan F2-E2-T06.
2. Schrijf death, iteminstance, ledger en receipt in een transactie.
3. ACK pas na commit.

**Acceptatie:**

- [ ] Twee gelijktijdige claims geven een grant
- [ ] crash voor/na commit geeft nul of een grant
- [ ] dezelfde operatie na reconnect dupliceert niets.

**Test:** GK_TEST_ISOLATED=1 node --test tests/node03-atomic-grant.test.js.

**Afhankelijkheden:** F2-E2-T06.

**Grootte:** M (een agentsessie).

#### F2-E2-T08 - Node04 turn-in atomair

**Context:** Questbeloning moet dezelfde receiptsemantiek krijgen zonder een brede databaseherbouw. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/node04-quest-runtime-service.js; nieuw: tests/node04-atomic-turnin.test.js.

**Concrete stappen:**

1. Bind quest-objective en turn-in aan F2-E2-T06.
2. Commit queststate, beloning en receipt samen.
3. ACK pas na commit.

**Acceptatie:**

- [ ] Duplicaat event en turn-in veranderen status/beloning eenmaal
- [ ] crash rond commit geeft nul of een receipt
- [ ] queststatus na restart matcht receipt.

**Test:** GK_TEST_ISOLATED=1 node --test tests/node04-atomic-turnin.test.js.

**Afhankelijkheden:** F2-E2-T06.

**Grootte:** M (een agentsessie).

### 2-E3 - RPG-slice en meting

#### F2-E3-T01 - Combat en loot uit legacy build

**Context:** Bestaande node03-acties moeten als intenties door de nieuwe authority lopen zonder twee combatwaarheden. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/node03-runtime-service.js; src/server/mmo-service.js; nieuw: src/server/runtime/combat-adapter.js; nieuw: tests/combat-authority.test.js.

**Concrete stappen:**

1. Routeer attack/gather/pickup via sim-command.
2. Valideer range, cooldown en target op servertick.
3. Laat bestaande buildcontent definieren.
4. Gebruik de atomaire node03-receipt van F2-E2-T07.

**Acceptatie:**

- [ ] Vervalste damage/targetpositie verandert niets
- [ ] gelijktijdige kill kent loot eenmaal toe
- [ ] reconnect herhaalt geen grant
- [ ] legacy HTTP-acties zijn compatibel of expliciet geweigerd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/combat-authority.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F2-E2-T07,F2-E1-T05.

**Grootte:** M (een agentsessie).

#### F2-E3-T02 - Questturn-in exact eenmaal

**Context:** Quest/rewardflow moet end-to-end bewezen zijn voordat de authoringbron verhuist. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** src/server/node04-quest-runtime-service.js; db/migrations/007_campaign_quest_dialogue_progress.sql; nieuw: tests/quest-receipt.test.js.

**Concrete stappen:**

1. Bind eventId, characterId en operationId.
2. Valideer serverevent en queststatus.
3. Gebruik de atomaire node04-turn-in van F2-E2-T08.

**Acceptatie:**

- [ ] Dubbele event/turn-in geeft dezelfde respons zonder tweede reward
- [ ] crashreplay eindigt in exact een status
- [ ] player kan objective niet via browser verhogen.

**Test:** GK_TEST_ISOLATED=1 node --test tests/quest-receipt.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F2-E3-T01,F2-E2-T08.

**Grootte:** M (een agentsessie).

#### F2-E3-T03 - Zichtbare slice en botladder

**Context:** De fase telt pas als Kevin gameplay kan inspecteren en dezelfde route onder last houdt. Deze kaart draagt direct bij aan het doel van Fase 02.

**Betrokken paden:** apps/web/public/game/game.js; scripts/game-browser-check.js; nieuw: scripts/load-bots.js; README/fases/evidence/MMORPG-v2/F2/.

**Concrete stappen:**

1. Maak compacte health/target/loot/quest HUD op bestaande stijl.
2. Laat bots inloggen, bewegen, aanvallen en turn-in doen.
3. Leg 1/10/25 bots en 30 min soak vast.

**Acceptatie:**

- [ ] Kevin-video van twee accounts
- [ ] 25 bots/30 min halen fasebudgetten
- [ ] nul desyncs >0,2 m na herstel en nul dubbele receipts
- [ ] rauwe meetdata bijgevoegd.

**Test:** node scripts/load-bots.js --users=25 --minutes=30 --isolated; GK_TEST_ISOLATED=1 npm run game:browser-check.

**Afhankelijkheden:** F2-E2-T02,F2-E2-T03,F2-E3-T02.

**Grootte:** M (een agentsessie).

