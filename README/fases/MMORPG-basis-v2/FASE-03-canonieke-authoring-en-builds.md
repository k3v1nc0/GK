# Fase 03 - Canonieke authoring en builds

> Status: voorstel voor implementatie, **niet** gerealiseerd op de geauditeerde `main`-baseline. De implementatietaken zijn nog niet uitgevoerd; deze documentatiecommit verandert geen gamecode of database.

**Doel:** Kevin kan een projectinstelling, item en pickup zonder Nodes wijzigen en exact die inhoud als herleidbare immutable build publiceren en spelen.

## Waarom nu
De slice uit F2 bewijst de runtimevorm; pas nu kan een golden-master adapter de nodebron vervangen zonder een denkbeeldige compatibilitylaag te ontwerpen.

## Afbakening
**Wel:** Drie canonical kinds, command/revision/refs, legacy import, schaduwpariteit, bestandsbuilds, atomische releasepointer en een zichtbare editorroute.

**Niet:** Migratie van alle 186 node-types, graph-tabellen droppen, generieke workflow-editor, data-executable scripts.

## Afhankelijkheden en instap
**Afhankelijkheden:** F2 compleet; F1-backup/runner; F2-slice als golden-master fixture.

**Instapcriteria:** Runtime-inputcontract van F2 is bevroren in fixtures; bestaande project/item/pickup-content en graphrevision zijn geinventariseerd.

## Exit-criteria / Definition of Done
- [ ] Kevin wijzigt project, item en pickup via menselijke editorroute, publiceert, ziet pickup in game en kan haar exact eenmaal claimen.
- [ ] Voor minimaal 3 echte legacy objecten is canonical compile semantisch gelijk aan de bevroren F2-runtimevorm; afwijkingen zijn blocking of door Kevin expliciet geaccepteerd.
- [ ] Tijdens canonical acties blijven `editor_nodes` en `editor_node_edges` telling en hashes gelijk; een domein heeft nooit twee writers.
- [ ] Twee compiles van gelijke input geven dezelfde root-hash; geforceerde fout behoudt vorige releasepointer; rollback activeert vorige build binnen 5 min op testhost.
- [ ] Elke uitgebrachte build heeft file hashes, audience-split en input provenance; server-only data ontbreekt in clientpakket.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** Canonical documentservice, drie editorroutes, importer/parityrapport, immutable buildmap, pointer/rollbackroute en bewijs.

**Testplan:** `npm test`; importer rerun; golden-master diff; fault-injected publish; Kevin editor -> game -> rollback.

**Inschatting:** XL, 5-8 weken; aanname: drie gekozen legacy-objecten gebruiken ondersteunde nodevormen en F2-inputcontract is stabiel.

**Met eigen ogen:** Kevin verandert een item en pickup in Werkbank, publiceert en ziet exact die wijziging in dezelfde speelbare slice.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Bestaande node-output heeft verborgen velden | hoog | kritiek | F2-golden fixture en semantische diff per consumer. |
| Import van graph naar document verliest relaties | middel | hoog | Blocking ambiguityrapport en geen finalize bij onbekende refs. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 3-E1 - Documentkern

#### F3-E1-T01 - Projectcontract en kindregistry

**Context:** De repo zegt nog dat nodevelden leidend zijn; een nieuwe writer vraagt expliciete governance. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** README/PROJECT_CONTRACT.md; README/fases/README.md; nieuw: src/shared/authoring/kinds/; nieuw: tests/authoring-kinds.test.js.

**Concrete stappen:**

1. Leg engine/contentgrens en tijdelijke domeinstatus vast.
2. Definieer versioned schemas voor project_settings, item_definition en placed_entity/pickup.
3. Valideer zonder stil defaults bij read.

**Acceptatie:**

- [ ] Contract benoemt een writer per domein
- [ ] drie schemas hebben valid/invalid vectors
- [ ] geen executable content
- [ ] oude backlog blijft historisch en niet-normatief.

**Test:** GK_TEST_ISOLATED=1 node --test tests/authoring-kinds.test.js; documentreview.

**Afhankelijkheden:** F2-E3-T03,F1-E0-T03.

**Grootte:** M (een agentsessie).

#### F3-E1-T02 - Documenten en commands transactioneel

**Context:** Een editorcommand moet revision, refs en idempotency als een atomaire mutatie behandelen. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** nieuw: db/migrations/012_authoring_core.sql; nieuw: src/server/authoring/document-repository.js; nieuw: src/server/authoring/command-service.js; nieuw: tests/authoring-commands.test.js.

**Concrete stappen:**

1. Maak documents, revisions, operations, refs en cutover state.
2. CAS via If-Match.
3. Tombstones en verwijderblokkade op backlinks.
4. Retry geeft bestaande respons.

**Acceptatie:**

- [ ] Stale revision geeft 409 zonder write
- [ ] zelfde requestId plus andere payload 409
- [ ] failed command wijzigt nul rijen
- [ ] ref naar ontbrekend document blokkeert.

**Test:** GK_TEST_ISOLATED=1 node --test tests/authoring-commands.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E1-T01,F1-E2-T02.

**Grootte:** M (een agentsessie).

#### F3-E1-T03 - Authoring API en CSRF

**Context:** De nieuwe editor moet de F1-securitygrens hergebruiken. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** src/server/server.js; nieuw: src/server/authoring/routes.js; nieuw: tests/authoring-api.test.js.

**Concrete stappen:**

1. Voeg GET workspace/docs en POST command toe.
2. Haal project en actor uit sessie.
3. Gebruik If-Match, CSRF en fout-envelop.
4. Beperk payload en pagineer lijsten.

**Acceptatie:**

- [ ] Zonder editorrol/CSRF geen write
- [ ] requestbody kan actor/project niet overschrijven
- [ ] 1 MiB request krijgt 413
- [ ] respons bevat nieuwe revision en operationId.

**Test:** GK_TEST_ISOLATED=1 node --test tests/authoring-api.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E1-T02.

**Grootte:** S (een agentsessie).

### 3-E2 - Build en compatibiliteit

#### F3-E2-T01 - Runtime compatibility manifest

**Context:** De F2-slice mag geen onbedoelde vormwijziging krijgen bij compilerwissel. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** src/server/game-project-compiler.js; src/server/publish-service.js; nieuw: tests/fixtures/runtime-compat.json; nieuw: tests/runtime-compat.test.js.

**Concrete stappen:**

1. Leg alle door game, mmo, node03/04/05 gelezen keys vast.
2. Schrijf legacy en canonical adapters naar dezelfde typed input.
3. Diff semantisch per consumer en label niet-gematchte velden.

**Acceptatie:**

- [ ] Voor drie echte objecten geen onverklaarde diff
- [ ] runtime test leest canonical output
- [ ] onbekende key of onopgeloste legacyRef blokkeert publish.

**Test:** GK_TEST_ISOLATED=1 node --test tests/runtime-compat.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E1-T02.

**Grootte:** M (een agentsessie).

#### F3-E2-T02 - Immutable build en releasepointer

**Context:** Huidige publish bewaart volledige wereld-JSON in DB; safe rollout vraagt gehashte bestanden en atomische activatie. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** src/server/publish-service.js; src/server/graph-repository.js; nieuw: src/server/authoring/build-service.js; nieuw: db/migrations/013_builds.sql; nieuw: tests/build-atomic.test.js.

**Concrete stappen:**

1. Compileer naar tijdelijke buildmap.
2. Hash client/server files.
3. Fsync, rename en commit metadata plus pointer in een transactie.
4. Serveer pinned builds.
5. Laat compatibility mirror voorlopig staan.

**Acceptatie:**

- [ ] Zelfde input/compiler -> zelfde rootSha256
- [ ] crash vóór pointer behoudt vorige release
- [ ] server-only file niet via clientroute
- [ ] actieve sessie houdt haar build.

**Test:** GK_TEST_ISOLATED=1 node --test tests/build-atomic.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E2-T01,F1-E2-T03.

**Grootte:** M (een agentsessie).

#### F3-E2-T03 - Release rollback en provenance

**Context:** Een release mag herstelbaar zijn zonder directe SQL-ingreep. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** nieuw: src/server/authoring/release-routes.js; nieuw: tests/release-rollback.test.js; README/fases/evidence/MMORPG-v2/F3/.

**Concrete stappen:**

1. Voeg admin-rollback met If-Match toe.
2. Valideer target hashes en compatibiliteit.
3. Log actor/tijd/reden.
4. Houd oude build immutable en beschikbaar.

**Acceptatie:**

- [ ] Rollback binnen 5 min op testhost
- [ ] bad target verandert pointer niet
- [ ] auditregel verwijst naar van/naar build
- [ ] geen characterstate teruggedraaid.

**Test:** GK_TEST_ISOLATED=1 node --test tests/release-rollback.test.js; oefen rollback.

**Afhankelijkheden:** F3-E2-T02.

**Grootte:** S (een agentsessie).

### 3-E3 - Editor en cutover

#### F3-E3-T01 - Legacy import en per-domein guard

**Context:** Shadow, parity en finalize mogen nooit impliciet dual-write worden. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** nieuw: src/server/authoring/legacy-import.js; src/server/graph-repository.js; nieuw: tests/cutover.test.js.

**Concrete stappen:**

1. Maak inventory, shadow import en map runtimeKeys.
2. Ondersteun expliciet legacyRef.
3. Bevries graphrevision bij finalize.
4. Blokkeer graphwrites voor canonical domein.
5. Bewaar importbesluit.

**Acceptatie:**

- [ ] Herimport is idempotent
- [ ] graphrevision race blokkeert finalize
- [ ] canonical acties wijzigen graphhash niet
- [ ] elke onzekere mapping staat in blocking rapport.

**Test:** GK_TEST_ISOLATED=1 node --test tests/cutover.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F3-E1-T02,F3-E2-T01.

**Grootte:** M (een agentsessie).

#### F3-E3-T02 - Canonical editor-shell

**Context:** Een editor.js van ongeveer 1,49 MB is geen veilige plek voor drie flows in een kaart; eerst een kleine modulegrens. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** apps/web/public/editor/editor.js; nieuw: apps/web/public/editor/canonical-slice.js; nieuw: tests/canonical-shell.test.js.

**Concrete stappen:**

1. Voeg een route en mount/unmount lifecycle voor canonical-slice toe zonder bestaande Nodes-tab te wijzigen.
2. Laad alleen project/item/pickup API-clients.

**Acceptatie:**

- [ ] Bestaande editorstart en Nodes-tab werken
- [ ] canonical view mount/unmount lekt geen listener
- [ ] geen inhoudelijke authoringflow in deze kaart.

**Test:** GK_TEST_ISOLATED=1 node --test tests/canonical-shell.test.js; npm run check.

**Afhankelijkheden:** F3-E1-T03,F3-E3-T01.

**Grootte:** S (een agentsessie).

#### F3-E3-T04 - Projectinstellingenformulier

**Context:** Kevin moet de eerste canonical kind zonder raw JSON kunnen wijzigen. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** nieuw: apps/web/public/editor/project-settings-view.js; apps/web/public/editor/canonical-slice.js; nieuw: tests/project-settings-view.test.js.

**Concrete stappen:**

1. Maak menselijk formulier voor project_settings met validatiefouten, dirty state, opslaan en stale-revision melding.

**Acceptatie:**

- [ ] Opslaan en refresh behouden waarden
- [ ] stale tab geeft 409 zonder overschrijven
- [ ] ontbrekende ref toont begrijpelijke fout.

**Test:** GK_TEST_ISOLATED=1 node --test tests/project-settings-view.test.js; browserhandtest.

**Afhankelijkheden:** F3-E3-T02.

**Grootte:** S (een agentsessie).

#### F3-E3-T05 - Itemformulier

**Context:** De tweede canonical kind heeft eigen velden en referenties. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** nieuw: apps/web/public/editor/item-definition-view.js; apps/web/public/editor/canonical-slice.js; nieuw: tests/item-definition-view.test.js.

**Concrete stappen:**

1. Maak itemlijst, bewerken, aanmaken en archiveren met menselijke refkiezer en revisionmeldingen.
2. Raak pickupplaatsing niet aan.

**Acceptatie:**

- [ ] Item kan zonder ID-invoer worden gemaakt/bewerkt/gearchiveerd
- [ ] ongeldige ref blokkeert save
- [ ] refresh toont dezelfde data.

**Test:** GK_TEST_ISOLATED=1 node --test tests/item-definition-view.test.js; browserhandtest.

**Afhankelijkheden:** F3-E3-T02,F3-E3-T04.

**Grootte:** S (een agentsessie).

#### F3-E3-T06 - Pickupplaatsing in viewport

**Context:** De derde flow verbindt canonical content aan zichtbaar spel. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** nieuw: apps/web/public/editor/pickup-placement-view.js; apps/web/public/editor/canonical-slice.js; nieuw: tests/pickup-placement-view.test.js.

**Concrete stappen:**

1. Kies item via refkiezer, plaats en verplaats een pickup in de bestaande viewportadapter.
2. Behandel stale revision en verwijdering.

**Acceptatie:**

- [ ] Pickup kan zonder Nodes of ID-invoer worden geplaatst/verplaatst/verwijderd
- [ ] positie blijft na refresh gelijk
- [ ] stale update overschrijft niets.

**Test:** GK_TEST_ISOLATED=1 node --test tests/pickup-placement-view.test.js; browserhandtest.

**Afhankelijkheden:** F3-E3-T05.

**Grootte:** M (een agentsessie).

#### F3-E3-T07 - Editor naar game integratie

**Context:** De drie losse editorflows bewijzen pas iets als de gepubliceerde pickup in F2-gameplay verschijnt. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** apps/web/public/editor/canonical-slice.js; scripts/game-browser-check.js; nieuw: tests/canonical-ui.test.js.

**Concrete stappen:**

1. Maak gemigreerde Nodes read-only voor de drie domeinen.
2. Voer project->item->pickup->publish->claim in twee browsers uit.
3. Meet graphhash voor/na.

**Acceptatie:**

- [ ] Kevin maakt/bewerkt item en pickup zonder Nodes
- [ ] graphhash blijft gelijk
- [ ] na publish claimt speler pickup eenmaal
- [ ] herstel/rollback werkt.

**Test:** GK_TEST_ISOLATED=1 node --test tests/canonical-ui.test.js; GK_TEST_ISOLATED=1 npm run game:browser-check; Kevin-test.

**Afhankelijkheden:** F3-E3-T04,F3-E3-T05,F3-E3-T06,F3-E2-T02.

**Grootte:** M (een agentsessie).

#### F3-E3-T08 - Cutover-evidence en hersteltest

**Context:** Een domein is pas canonical als oude en nieuwe route bij dezelfde content overeenkomen. Deze kaart draagt direct bij aan het doel van Fase 03.

**Betrokken paden:** README/fases/evidence/MMORPG-v2/F3/; scripts/smoke-test.js; nieuw: tests/authoring-lifecycle.test.js.

**Concrete stappen:**

1. Voer backup, shadow/parity, finalize, editor->draft->publish->play, mislukte publish en rollback uit.
2. Archiveer JSON-diffs, graphhashes en Kevin-video.

**Acceptatie:**

- [ ] Drie domeinen hebben ieder import- en parityrapport
- [ ] nul graphwrites in acceptatieroute
- [ ] restore en rollback geoefend
- [ ] Kevin akkoord vastgelegd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/authoring-lifecycle.test.js; GK_TEST_ISOLATED=1 npm test; handtest.

**Afhankelijkheden:** F3-E3-T07,F3-E2-T03.

**Grootte:** S (een agentsessie).

