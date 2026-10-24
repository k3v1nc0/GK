# Visual Content Workbench W3

**Status:** gesloten — legacy (Oude basis), vervangen door MMORPG-basis v2; niet meer accepteren of verder bouwen  
**Datum:** 2026-10-22  
**Basis:** W2 (`4d0a27ca39e248a879c3204ebf6280c960eb822b`, partially accepted by Kevin)

## Doel

W3 maakt NPC, Vendor, Ability, Stats/Stat Blocks, Quest en Dialoog bereikbaar via de bestaande Werkbank. Alle inhoud blijft een projectie en mutatie van de bestaande graph, typed references, child-edges, Catalog/Campaign Compilers en bestaande runtime. Er is geen tweede contentdatabase, questmodel of runtime, en er is geen demo-content gemaakt.

Gate A/UI-compaction is bewust niet opnieuw geïmplementeerd: geen generiek actiepaneel, drawer, bottom sheet, icon-only navigatie, panelenherbouw, nieuwe scrollarchitectuur, brede responsive redesign of windowmanagement. Alleen Quests en Dialogen zijn als categorie toegevoegd, volgens het W2-patroon.

## Opgeleverde route

### NPC

- **Definitie** (categorie NPC's): openen, maken, bewerken (naam, rol, model, icoon, optionele faction/animation set), Waar gebruikt, Assetgebruik, verwijderen met gebruikswaarschuwing, Toon in nodes, Toon in wereld.
- **Geplaatst**: bij een geselecteerd model `Maak NPC` / `NPC beheren`. Dat gebruikt de bestaande Visual Builder (rol NPC): een bestaande NPC-definitie kiezen of er inline één maken, plus level en persistence. Het resultaat is dezelfde `model_entity` → `entity_assembly` met maximaal één `npc_component.npcRef`. Er komt geen tweede mesh of placeholder en geen `interaction_component` bij: de NPC-route vereist die niet, want praten in de game loopt via de Quest Target.
- Het selectiepaneel toont wereldobject, NPC-definitie (klikbaar), model en icoon, level en persistence, interactie, Quest Target-status, dialogen, quests en de Vendorrol, met de bestaande knoppen Toon in wereld en Toon in nodes.
- Een NPC-kaart in de bibliotheek heeft `Gebruik voor model`.
- NPC maken maakt nooit automatisch een quest of dialoog.

### Vendor Catalog en geplaatste Vendor

- **Catalog**: de W2-route. Offers zijn echte `vendor_offer`-childnodes met Item, handel (verkoopt/koopt/beide), currency en prijs per richting, en voorraad. Een tweede offer voor hetzelfde item geeft eerst een waarschuwing met `Bestaand offer bewerken`.
- **Geplaatst**: `Maak Vendor` / `Vendor beheren` gebruikt de bestaande Visual Builder (rol Vendor) op dezelfde assembly. Je kiest een bestaande catalog met minstens één offer (`vendorCatalogRef`) en stelt interactietekst en afstand in. `linkedEntityId` komt via de bestaande route uit de assembly. Verder zijn er `Open Vendor Catalog`, een catalog op het wereldobject slepen, Toon in wereld en Toon in nodes.
- **NPC + Vendor** mogen samen op één assembly. Alleen die combinatie is toegestaan; andere rolwissels blijven exclusief.

### Abilities

- Maken en bewerken. De damage formula gebruikt hetzelfde gestructureerde `{ operator, operands }`-formaat als de bestaande formule-editor, met menselijke operatornamen.
- **Actief in de game:** naam, `range`, `damageFormula` (alleen Optellen/Vermenigvuldigen met getallen). **Nog niet actief:** cooldown, cast time, global cooldown, kosten, minimum range, area, target mode, line of sight, wapentags, heal, damage type, status effects, animatie, audio/VFX, interruptible, beweging tijdens cast, prediction en icoon.
- Enemy → Ability blijft zichtbaar via het Combat Profile, met het Combat Profile als eigenaar en het label `Nog niet actief`. Bewerken gaat via Nodes, en enemy_archetype heeft geen ability-lijst gekregen.

### Stats en Stat Blocks

- De categorie Stats toont Stat Definitions, Stat Blocks en Stat Curves. Curves zijn alleen leesbaar en gelabeld `Nog niet actief`.
- **Stat Block**: maken (start leeg, zonder het stille schemavoorbeeld `stat.health = 100`) en de regels tonen als naam + basiswaarde. Een regel toevoegen, bewerken of verwijderen gaat via een formulier met een Stat-picker op naam en een basiswaarde, zonder JSON. Een Stat-kaart op het vak Statregels slepen opent hetzelfde formulier. Dezelfde Stat tweemaal wordt geblokkeerd met `Bestaande regel bewerken`.
- **Enemy**: het vak *Stats via Stat Block* toont de blocknaam en de waarden uit het block zelf. Een Stat Block op dat vak slepen zet `enemy_archetype.statBlockRef`. Er worden geen waarden op de enemy gedupliceerd.
- **NPC**: krijgt geen statveld. `combatant_component` wordt in W3 niet gebruikt.

### Quests en queststoryboard

- De categorie Quests zit in de bibliotheek. Een nieuwe quest gebruikt de bestaande `questTimelineCommitCreateQuest` (quest, Stap 1, `startStepRef` en een edge naar de bestaande `campaign_output`) in een bestaande Campaign Group, getoond als *Campagne / Questcollectie*. Is er nog geen Campagne, dan maakt `Maak Campagne` die via de bestaande `createRootManagedGroup`.
- Bewerken: naam, samenvatting, beschrijving, questtype, minimumlevel, aanbevolen zone, startstap, inlever-target, vereiste en volgende quests, auto track en herhaling, elk met een runtimelabel.
- **Storyboard**: NPC (start/inleveren) → Dialoog → Quest → Rewards en gebruikte content, met thumbnails. Daaronder staan de bestaande timeline-waarschuwingen, de stapchips (volgorde via `sequenceIndex`, invoegen), de stapdetails (voorwaarden, objectives, beloningen), sleepvakken en de questbeloningen bij afronden. Elk gerelateerd item staat maar één keer in de samenvatting.

### Objectives, conditions en rewards

- **Objectives**: alleen Talk, Collect, Deliver en Reach. Het staptype volgt uit het objective. Defeat/kill, branch, join, parallel en fail worden niet aangeboden; het storyboard meldt dat.
- **Conditions**: Player Level en Has Item op een stap of op een dialoogkeuze. Voorwaarden op questniveau worden niet aangeboden, omdat de runtime ze niet leest. Bestaande krijgen een waarschuwing.
- **Acties/rewards** op een stap of als questbeloning bij afronden: Give Currency, Give XP, Unlock Ability, Remove Item (getoond als inleveren/verbruiken), Start Quest en Reward Bundle via de bestaande rewardEntry-route.
- **Slepen**: Item → Collect / Deliver / Remove Item; Currency → Currency reward; Ability → Ability reward; NPC → Talk / Reach / start-inleveren (via de enige Quest Target van die NPC); Dialoog → startdialoog van de quest of spreker van de NPC; Quest → inlever-NPC; Vendor Catalog → wereldobject; Stat → Stat Block; Stat Block → Enemy. Voor XP is er een knop, want XP heeft geen bibliotheekkaart. Iedere drop opent eerst het bestaande formulier, dus bedrag, aantal, rank en target bevestig je vóór de mutatie. De bestaande dubbelcontrole van de timeline blijft gelden, en een ongeldige drop verandert niets.

### Dialoog

- De categorie Dialogen zit in de bibliotheek. Een nieuwe dialoog gebruikt de bestaande `questTimelineCommitCreateDialogue` (dialoog, eerste regel, `startEntryRef` en `campaign_output`); de spreker is een Quest Target.
- Flow: NPC/wereldtarget → Dialoog → Questacties, met daaronder de bestaande regel/keuze-keten: spreker, tekst, volgende regel, sluiten na regel, keuzes met actie (none / accept_quest / turn_in_quest / close), quest, volgende regel en voorwaarden.

### NPC ↔ dialoog ↔ quest

- Bij een geselecteerde geplaatste NPC: `Maak Quest Target` / `Quest Target beheren` (bestaande objectFunction-route), `Nieuwe quest` en `Nieuwe dialoog` (vooringevuld met dit target), `Koppel bestaande quest` (zet `turnInTargetRef`) en `Koppel bestaande dialoog` (zet `targetRef`). Je kunt ook een Dialoog of Quest op het NPC-vak slepen.
- Keten: `model_entity` → `entity_assembly` → `npc_component` + `quest_target_binding` → `dialogue_definition.targetRef` / `quest_definition.turnInTargetRef` / objective `targetRef` → Campaign Compiler → questruntime (node04). Er zijn geen nieuwe velden zoals `npc_component.questRefs`.
- In de game wordt een beschikbare quest aangeboden bij het target van zijn startdialoog, anders bij `turnInTargetRef`. Accepteren gaat via een dialoogkeuze met actie `accept_quest`.

### Wereldrelaties

- **Content → wereld**: `Toon in wereld` op iedere definitie. Bij één plaatsing wordt die geselecteerd en gefocust; bij meerdere kies je op naam. Zonder plaatsing is de knop uit, met de uitleg dat het een herbruikbare definitie zonder wereldobject is. Quest en dialoog gaan via de plaatsingen van hun NPC. Er wordt nooit een mesh gemaakt.
- **Wereld → content**: een geplaatste NPC, Vendor, Enemy of Resource selecteren toont dezelfde definities en relaties. Een runtime- of spawnselectie maakt geen authored mesh (W2-gedrag).

### Contentoverzicht

- Nieuwe band *Verhaal: NPC's → Dialogen → Quests*. Stat Blocks en Curves staan in de kolom *Abilities & Stats*.
- Nieuwe relaties: Stat Block → Stat (met waarde); Quest → NPC / Item / Currency / Ability / Quest; Quest → startdialoog; Dialoog → NPC / Quest. Alleen typed references en child-edges tellen. NPC loopt via `quest_target_binding` → assembly → `npc_component`.
- Questbeloningen tekenen naar de bestaande Item-, Currency- en Abilitykaarten in de banden erboven. De Verhaal-band herhaalt die types niet, zodat de geaccepteerde W2-lijnen niet verspringen.

## Correcties op bestaande routes (W3-blokkades)

1. De Visual Builder verwijderde de `npc_component` als hetzelfde model Vendor werd (en omgekeerd). NPC + Vendor blijven nu samen bestaan.
2. Rolwijzigingen vanuit de Werkbank (NPC, Vendor, Enemy, Resource) slaan nu twee stappen van de Visual Builder over:
   - De questkoppelstap: die haalde stil de startdialoog-edges weg en verwijderde een vers, nog ongebruikt Quest Target.
   - Het herschrijven van de Vendor Catalog-offers: dat zette aanvulling, maximale voorraad en `inherit`-voorraad terug.

   Wie zo'n concept toch in de volledige Visual Builder voortzet, krijgt daar het normale gedrag terug.
3. Visual Builder NPC: `persistenceScope` komt uit het formulier (was vast `zone`). Nieuwe quest: het gekozen questtype wordt bewaard.

## Eerlijke runtimegaten (buiten scope, niet nagebootst)

1. **Questvoortgang (node04)**: alleen de laatste Deliver- of Reach-stap rondt de quest af en voert dan de beloningen van die stap en de questbeloningen uit.
   - Beloningen en Remove Item op tussenstappen worden niet uitgevoerd.
   - Een Deliver-tussenstap controleert alleen of de speler de items heeft.
   - Een Talk-startstap wordt bij accepteren overgeslagen.
   - Een Talk-objective telt direct als voltooid; er is nog geen echte gesprekscontrole.

   Het storyboard waarschuwt hiervoor.
2. Quest `minimumLevel`, `recommendedZoneRef`, `questType` en voorwaarden op questniveau worden opgeslagen en gecompileerd, maar niet gelezen.
3. Ability: de game leest alleen `range` en `damageFormula` (add/multiply); er is geen cooldown-, kosten- of castruntime.
4. Combat Profiles worden niet geconsumeerd, dus Enemy → Ability blijft `Nog niet actief`.
5. Stat Block `overrideMode`, de Stat Definition-velden behalve de naam en Stat Curves worden niet gelezen. Enemies lezen alleen `statRef` + `baseValue`.
6. NPC + Vendor op één model geeft in de game twee interactietargets op dezelfde plek: *Trade* (vendor service) en het questtarget. Dat is niet door Claude in de game getest.
7. Zolang er een actieve quest is, toont de game alleen het doel daarvan. Zonder actieve quest toont ze alleen het startpunt van de eerste beschikbare quest.
8. Defeat/kill, branch, join, parallel en fail bestaan niet als werkende keten.
9. Audio is alleen een assettype; er is geen Audio-categorie.
10. Recipe → geplaatst object (Crafting Station) zit nog niet in de Werkbank. De volledige Visual Builder ondersteunt het wel (rol Crafting Station).
11. Stats: de game (node03) leest alleen de vaste stat-ids `stat.health`, `stat.mana`, `stat.stamina`, `stat.armor` en `stat.attack_power`. Een nieuwe Stat met een eigen naam heeft in de game geen effect. Een Enemy zonder Health, Armor of Attack Power in zijn Stat Block valt terug op 50 levenspunten, 0 armor en 8 attack power. De Werkbank laat nog niet zien welke stats de game kent.

## Hergebruikte contracten

Visual Builder (`visualBuilderBegin`/`visualBuilderCommit`), objectFunction Quest Target-route, Quest/Dialoog Timeline (create, child-drafts, stap-, keuze- en rewardsecties, issues), `createRootManagedGroup`, `patchValues`, `restoreGraphObject`, `commitManagedDraft`, `buildReferencePickerField`, de W2-rij- en dropformulieren en de bestaande Undo/Redo-history. Server, runtime, node-types, assets en database zijn niet aangepast.

## Gewijzigde bestanden

- `apps/web/public/editor/content-workbench.js`: categorieën, specs, runtimelabels, eigendom van story-children, story- en Stat Block-relaties, Verhaal-band.
- `apps/web/public/editor/editor.js`: NPC/Vendor-kaart, Quest Target-kaart, story-create, storyboard, Stat Block-regels, Toon in wereld, Visual Builder-correcties.
- `apps/web/public/editor/index.html`: alleen de cacheversie van `editor.js`.
- `tests/content-workbench-contract.test.js`: W3-relatietest en runtimelabeltest.
- `README/fases/VISUAL-CONTENT-WORKBENCH-W2.md`: status *partially accepted by Kevin*.
- `README/fases/VISUAL-CONTENT-WORKBENCH-W3.md`: dit document.

## Controles

- `node --check` op `content-workbench.js` en `editor.js`.
- `node --test tests/content-workbench-contract.test.js`: 4/4 geslaagd.
- Geen server gestart, geen smoke, geen Playwright, geen brede npm-test. Browser- en gameplaybewijs komt van Kevin.

## Kevin-acceptatietest

Gebruik alleen de Werkbank: geen raw IDs, JSON, SQL, scripts, Meer nodes of gekopieerde demo-nodes. Namen zijn voorbeelden.

**NPC en Vendor**

1. Open de editor op localhost:3001, ga naar de Werkbank en klik in de viewport op een geplaatst GLB-personage.
2. Klik links `Maak NPC`, kies *Maak inline een NPC-definitie*, typ "Smid Bram" en klik `NPC maken`.
3. Kijk in de viewport: nog steeds één model, geen tweede mesh. Links staat *Geplaatst model · NPC*.
4. Kies rechts *Vendor Catalogs* → `+ Nieuwe definitie` → naam "Smidse", kies je Collectie → `Aanmaken`.
5. Klik onderaan `+ Offer`: kies een Item, *Verkoopt aan speler*, een Currency en een prijs → opslaan. Probeer hetzelfde item nog eens: je krijgt `Bestaand offer bewerken`.
6. Klik weer op het Bram-model en klik `Maak Vendor`.
7. Kies bij *Vendor Catalog* "Smidse" en klik `Vendor maken`. Links staan nu *NPC gekoppeld* en *Vendor gekoppeld*.
8. Klik Save Draft en ververs de pagina. Klik het model aan: NPC en Vendor zijn er nog.

**Ability en Stats**

9. *Abilities* → `+ Nieuwe definitie` → "Vuurslag" → `Aanmaken` → `Bewerk`: zet Bereik op 4 en de damage formula op *Optellen* met "12, 3" → opslaan.
10. Controleer: Naam, Bereik en Damage formula zijn actief; Cooldown, Cast time en kosten tonen *Nog niet actief*.
11. *Stats* → `+ Nieuwe definitie` → maak "Leven" en daarna "Schade". Let op: de game kent alleen de vaste stats Health, Mana, Stamina, Armor en Attack Power. Deze twee nieuwe stats doen in de game nog niets (runtimegat 11).
12. Weer `+ Nieuwe definitie` → kies bij Soort *Stat Block* → "Wolf stats" → `Aanmaken`. Het block is leeg.
13. Klik `+ Statregel`: kies "Leven", basiswaarde 120 → `Opslaan`. Sleep de kaart "Schade" op het vak Statregels, vul 8 in → `Opslaan`. Voeg "Leven" nog eens toe: je krijgt een waarschuwing.
14. Open een **test-Enemy**, dus niet een Enemy die je in de game gebruikt, en sleep "Wolf stats" op het vak *Stats via Stat Block*. Een Stat Block zonder Health, Armor en Attack Power geeft een Enemy in de game 50 levenspunten, 0 armor en 8 attack power.
15. Controleer bij de Enemy *Leven 120 · Schade 8*, en dezelfde waarden in het Contentoverzicht en via `Toon in nodes` bij "Wolf stats".

**Quest en dialoog**

16. Klik het Bram-model aan → `Maak Quest Target` → soort *NPC*, interactietekst "Praat" → `Opslaan`.
17. Klik `Nieuwe dialoog`: de spreker is al Bram. Naam "Bram intro", eerste regel "Ik mis mijn erts!". Kies een Campagne (of eerst `Maak Campagne`) → `Aanmaken`.
18. Voeg in de dialoogflow aan de regel een keuze "Ik help je" toe. Tekst en keuze zijn zichtbaar.
19. Klik het Bram-model aan → `Nieuwe quest` → "Erts voor Bram", vul een samenvatting in, dezelfde Campagne → `Aanmaken`.
20. Bouw de stappen in deze volgorde, want de game rondt af bij de laatste Deliver-stap: **Stap 1 Collect, Stap 2 Talk, Stap 3 Reach, Stap 4 Deliver.** Maak de stappen aan met de `+` tussen de stapchips. Selecteer Stap 2 en sleep de NPC-kaart "Smid Bram" op *Talk* → `Toevoegen` (Talk).
21. Selecteer Stap 1 en sleep een Item (bijv. "IJzererts") op *Collect*, aantal 3 → `Toevoegen` (Collect).
22. Klik bij Stap 1 *Voorwaarde toevoegen* → *Player level*, met je eigen level → `Toevoegen`.
23. Selecteer Stap 4, sleep "IJzererts" op *Deliver* (aantal 3, target Bram) en daarna op *Item inleveren / verbruiken* (aantal 3).
24. Klik een tweede geplaatst model aan (bijv. een poort) → `Maak Quest Target` → soort *Locatie / marker* → `Opslaan`. Open de quest weer, selecteer Stap 3 → `+ Reach` → kies dat target → `Toevoegen`.
25. Houd Stap 4 geselecteerd en sleep een Currency op *Currency reward*, bedrag 50.
26. Klik `+ XP`, hoeveelheid 100.
27. Sleep "Vuurslag" op *Ability reward*, rank 1.
28. Sleep de dialoog "Bram intro" op het vak *Dialoog* bovenin het storyboard. Bewerk in de dialoog de keuze "Ik help je": actie *accept_quest*, quest "Erts voor Bram".
29. Bekijk het storyboard: Bram → Bram intro → Erts voor Bram → rewards. De stappen staan op volgorde, en bij tussenstappen staat een waarschuwing.
30. Open "IJzererts" → `Waar gebruikt`: de quest staat erbij. Bij Smid Bram zie je de dialoog en de quest.

**Wereld en lifecycle**

31. Open de quest → `Toon in wereld`: de camera springt naar Bram. Doe hetzelfde bij NPC "Smid Bram" en Vendor Catalog "Smidse".
32. Klik in de viewport op hetzelfde model.
33. Links staan weer dezelfde NPC, Vendor, Quest Target, dialoog en quest.
34. Doe Undo op de laatste wijziging en daarna Redo: die wijziging verdwijnt en komt terug.
35. Klik Save Draft.
36. Ververs de pagina.
37. Controleer dat alles terug is.
38. Gebruik `Toon in nodes` bij Smid Bram, Smidse, Wolf stats, Erts voor Bram en Bram intro.
39. Controleer: één `npc_component` en één `vendor_component` op dezelfde assembly, één `quest_target_binding`, geen dubbele offers en geen tweede Campaign Output of registry.
40. Klik Save To Game.
41. Loop in de game naar Bram en praat met hem: "Ik mis mijn erts!" verschijnt.
42. Kies "Ik help je": de quest is actief.
43. Verzamel 3 erts (Collect, Player Level gehaald). Talk telt in de huidige game meteen als voltooid (runtimegat 1). Loop naar de poort (Reach) en lever in bij Bram (Deliver).
44. Controleer dat de 3 erts uit je inventaris zijn.
45. Controleer dat je 50 currency, 100 XP en de ability Vuurslag hebt gekregen.
46. Gebruik *Trade* bij Bram en controleer het aanbod. Zijn *Trade* en *Praat* niet allebei bereikbaar, meld dat dan (runtimegat 6).
47. Herlaad de editor en de game.
48. Controleer dat de plaatsing, de queststatus (voltooid) en alle definities er nog zijn.
