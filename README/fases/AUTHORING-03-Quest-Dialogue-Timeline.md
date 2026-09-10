# AUTHORING-03 - Visuele Quest- en Dialoogtimeline

**Documenttype:** eindrapport voor Kevin (uitvoeringscontract stond in het opdrachtblok, niet als los bestand)
**Status:** accepted/closed on 2026-09-10
**Basis:** main na commit `39c4eac066002ac1f6fa1b2eae8fcb5a781d1a6d`
**Afhankelijkheden:** AUTHORING-01, AUTHORING-02, AUTHORING-02B (alle accepted/closed)

---

## 1. Belangrijkste bevinding vóór het bouwen

De FASE-tekst beschrijft een flow-edge-gebaseerd model ("Quest Start → Stap 1 → Stap 2 → Voltooid" met typed flow-edges, `quest_branch`, `quest_join`, `quest_parallel`, `quest_fail`, `quest_link`). De **werkelijke** node-types (`src/shared/node-types.js`, geverifieerd tegen `apps/web/public/shared/node-types.js` - identiek) implementeren een ander, eenvoudiger model:

- Er bestaat geen `flow`-datatype en geen typed flow-edges tussen quest-stappen.
- `quest_step` hangt als losse node in de multi-input-poort `quest_definition.steps`; de volgorde komt uit het veld `sequenceIndex`, niet uit edges.
- `quest_branch`, `quest_join`, `quest_parallel`, `quest_fail`, `quest_link` **bestaan niet** als node-type - nergens in `src/` of `apps/`.
- `quest_complete` bestaat wel als type, maar wordt door `campaign-compiler.js` **nooit gelezen** (geen enkele referentie) - een dode placeholder.
- Dialoog werkt wél met een vergelijkbaar "flat pool + reference-veld"-patroon: `dialogue_entry`/`dialogue_terminal` hangen in `dialogue_definition.entries`; de volgorde/vertakking loopt via de velden `nextEntryRef` (op entry én choice) en via `dialogue_choice`-nodes in `dialogue_entry.choices`. Dit bestaat wél, is volledig gecompileerd (`campaign-compiler.js`) én uitgevoerd door de runtime (`node04-quest-runtime-service.js: chooseDialogue/buildDialogueRuntime`).

Ik heb dit geverifieerd tegen de daadwerkelijke compiler (`src/server/campaign-compiler.js`) en runtime (`src/server/node04-quest-runtime-service.js`), niet alleen tegen het schema.

**Consequentie:** Bouwblok 1, 2 en 4 zijn gebouwd op basis van het echte model. Bouwblok 3 (branches/parallelle paden/joins) is een harde blocker - zie sectie 7.

---

## 2. Gebruikte bestaande node-types en ports

| Node-type | Groep | Gebruikt voor |
|---|---|---|
| `campaign_output` | Campaigns | verzamelpunt binnen de Campaigns Group (find-or-create, idempotent) |
| `quest_definition` | Quests | de quest zelf; output `questDef` → `campaign_output.quests` |
| `quest_step` | Quests | tijdlijnstap; output `questStep` → `quest_definition.steps`; volgorde via `sequenceIndex` |
| `objective_talk` / `objective_collect` / `objective_deliver` / `objective_reach` | Objectives | → `quest_step.objectives` |
| `condition_player_level` / `condition_has_item` | Conditions | → `quest_step.conditions` (en → `dialogue_choice.conditions`) |
| `action_give_currency` / `action_give_xp` / `action_unlock_ability` / `action_remove_item` / `action_start_quest` | Actions | → `quest_step.rewards` (poort `rewardEntry`) |
| `reward_bundle` | Rewards | → `quest_step.rewards`; bevat zelf weer de bovenstaande action-types via `reward_bundle.rewards` |
| `dialogue_definition` | Dialogue | de dialoog zelf; output `dialogueDef` → `campaign_output.dialogues` |
| `dialogue_entry` | Dialogue | tekstregel; output `dialogueEntry` → `dialogue_definition.entries`; vervolg via veld `nextEntryRef` |
| `dialogue_choice` | Dialogue | speler-keuze; output `dialogueChoice` → `dialogue_entry.choices`; velden `action`/`questRef`/`nextEntryRef` |
| `dialogue_terminal` | Dialogue | dialoogeinde; output `dialogueEntry` → `dialogue_definition.entries` (zelfde poort als een entry) |
| `group` (`groupKind: "campaign"`) | - | Campaigns Group workspace (bestaande, generieke special-group-actie hergebruikt) |

Alle portnamen hierboven zijn 1-op-1 overgenomen uit `src/shared/node-types.js`; ik heb ze niet verzonnen en losstaand geverifieerd tegen `campaign-compiler.js` (welke poort de compiler daadwerkelijk leest).

---

## 3. Bouwblok 1 - Queststarter en lineaire tijdlijn

Binnen de route **Quest / Dialoog** (bestaand, ongewijzigd qua routing):

- De bestaande generieke workspace-lijst (Campaigns Groups) blijft ongewijzigd zichtbaar.
- **Ontbreekt er nog geen Campaigns Group?** Dan toont het paneel dat duidelijk, met één knop "Nieuwe Campaigns Group" die rootniveau opent en daarna de al bestaande, generieke `addSpecialGroup({kind:"campaign"})`-actie hergebruikt (dezelfde actie als de "Specialized Groups"-bibliotheek al jaren aanbiedt voor Zone Canvas/Catalog/Player Rules/UI). Er wordt geen nieuwe campaign-architectuur verzonnen en er wordt geen Campaign Group in een Zone Canvas genest.
- Zodra Kevin een Campaigns Group opent, verschijnt de nieuwe Quest/Dialoog-hub in het zijpaneel (tabs "Questtimeline" / "Dialoogtimeline" - geen tweede editorpagina, gewoon een extra paneel binnen dezelfde graph/canvas).
- **Questtimeline (geen quest geselecteerd):** menselijke lijst van bestaande quests (naam + stapaantal) + knop "Nieuwe Quest". Klikken op een bestaande quest opent alleen de tijdlijn - er wordt niets aangemaakt of gewijzigd.
- **Nieuwe Quest**-formulier vraagt: Questnaam (verplicht), korte omschrijving (verplicht), Quest Target (optioneel, echte reference-picker op `turnInTargetRef`, kinds=`target`), aanbevolen/minimum level (optioneel, `minimumLevel`). Bevestigen doet **één** atomaire mutatie:
  1. `campaign_output` find-or-create binnen de Campaigns Group.
  2. `campaign_output.campaignPackage → Group Output.campaignPackage` find-or-create zodat bestaande rootverbindingen via de Campaign Group blijven publiceren.
  3. één `quest_definition` (met gegenereerde `questId`).
  4. één `quest_step` ("Stap 1", `sequenceIndex: 10`).
  5. edge `quest_step.questStep → quest_definition.steps`.
  6. edge `quest_definition.questDef → campaign_output.quests`.
  7. `quest_definition.startStepRef` gezet naar de nieuwe stap.
  - Layout: quest-node links, eerste stap één kolom rechts ervan (vaste kolombreedte = bestaande nodebreedte + gap, dezelfde constante als AUTHORING-02).
- **Tijdlijn van een bestaande quest:** Start-chip → stappen links-naar-rechts (horizontale rij, elk stapblokje toont naam + aantal objectives/conditions/beloningen) → een compact "Voltooid"-chipje. Dat chipje is bewust geen `quest_complete`-node: het is een runtime-indicator. Het waarschuwt wanneer de laatste stap nog geen ondersteund `deliver`- of `reach`-einde is, want de bestaande runtime voltooit quests alleen via die routes.
- **Inline plus** tussen élk paar geldige punten (vóór stap 1, tussen elke twee stappen, na de laatste stap). Klikken opent een compact invoerveld (stapnaam) → bevestigen maakt **één** nieuwe `quest_step`, verbindt hem naar `quest_definition.steps`, en plaatst hem lokaal (x = midden tussen buren, of één kolom voor/na de rand). Bestaande stap-nodes worden nooit verplaatst. De volgorde komt uit `sequenceIndex`; bij een invoeging zonder rekenruimte tussen twee opeenvolgende waarden herwaardeert de mutatie **alleen de sequenceIndex-velden** van de bestaande stappen van díe quest. Wanneer er een veilige bestaande `nextStepRef`-keten is, zet de mutatie de vorige stap naar de nieuwe stap en de nieuwe stap naar de volgende stap; invoegen vóór stap 1 werkt `startStepRef` bij.
- Elke stap heeft een "Verwijder stap"-knop (verwijdert alleen die node + zijn edges, geen cascade naar losgekoppelde objectives/conditions/rewards - zie sectie 8).

---

## 4. Bouwblok 2 - Objectives, conditions, actions, rewards

Bij een geselecteerde stap verschijnen drie compacte secties:

- **Voorwaarden** (boven de stap gelayout): Player level, Heeft item.
- **Objectives** (onder de stap): Praat met target, Verzamel item, Lever item in, Bereik locatie.
- **Beloningen & acties** (verder onder de stap, zelfde poort `rewards`): twee knoppen -
  - "Actie toevoegen" → Geef currency, Geef XP, Ontgrendel ability, Verwijder item, Start quest.
  - "Beloning toevoegen" → Reward Bundle (met eigen "Beloning toevoegen in bundel"-subactie voor dezelfde 5 action-types, geneste weergave rechts van de bundel).

Elke keuze toont een formulier dat **automatisch** wordt opgebouwd uit het echte schema van dat node-type (labels, select-opties, reference-picker met `referenceKinds`, nummer/tekst/boolean-velden) - dus geen handmatig uitgeschreven formulier per type, en geen verzonnen velden. Reference-velden gebruiken de bestaande zoekbare, type-gefilterde picker (`/api/editor/symbols`); Kevin typt nooit een canonical ID. Bij ontbrekende references toont de picker een echte navigatieactie naar Catalog, Zone, Object of Campaign, afhankelijk van het gevraagde reference-kind.

- **Klikken op een bestaand chip** ("Beheren") opent hetzelfde formulier, voorgevuld met de huidige waarden, en **wijzigt de bestaande node in-place** (geen duplicaat).
- **"+ Toevoegen"** maakt een nieuwe node wanneer er nog geen equivalent onderdeel met dezelfde waarden aan dezelfde stap/keuze hangt. Bestaat zo'n equivalent al, dan wordt het bestaande onderdeel geopend in plaats van stil gedupliceerd.
- Wanneer Kevin een objective toevoegt, zet AUTHORING-03 de stap veilig op het bijbehorende runtime-type (`talk`, `collect`, `deliver` of `reach`) en vult `targetRef`/`zoneRef` over wanneer dat uit de objective volgt. Bij gemengde objective-types laat de mutatie bestaande expliciete stepinstellingen ongemoeid.
- **Verwijderen** verwijdert alleen die ene node + zijn edges (`objectFunctionRemoveNodeAndEdges`, hergebruikt uit AUTHORING-02). Undo herstelt node, waarden én edges in één stap (generieke undo-stack, ongewijzigd).
- Layout: conditions-kolom boven de stap, objectives + rewards gestapeld in dezelfde kolom onder de stap, bundle-inhoud in een aparte kolom rechts van de bundel. Korte lokale edges, geen overlap met andere questlijnen (elke quest krijgt een eigen rij met vaste verticale afstand).

---

## 5. Bouwblok 4 - Dialoogtimeline

Tab "Dialoogtimeline" binnen dezelfde hub (geen tweede editorpagina):

- **Nieuwe Dialoog**: naam, spreker/Quest Target (verplichte reference-picker op `targetRef`), eerste tekstregel. Bevestigen maakt in één atomaire mutatie: `campaign_output` (find-or-create) → `dialogue_definition` → eerste `dialogue_entry` → edges (`dialogueEntry → entries`, `dialogueDef → dialogues`) → `startEntryRef` gezet.
- **Tijdlijn**: Start-chip → hoofdketen van regels links naar rechts (volgt `nextEntryRef` zolang een regel geen keuzes heeft). Zodra een regel keuzes heeft, stopt de hoofdrij en verschijnen de keuzes als verticale stack direct onder die regel.
- **Inline acties** per doodlopende regel: "Tekstregel toevoegen" maakt een nieuwe `dialogue_entry` én een echte "Verder"-`dialogue_choice`, omdat de bestaande gameclient alleen via keuzes naar een volgende regel kan gaan. "Keuze toevoegen" maakt een nieuwe `dialogue_choice` in `dialogue_entry.choices`. "Dialoog beëindigen" maakt een `dialogue_terminal` en een sluitende `dialogue_choice` (`action: close`, `closeAfterSelect: true`), zodat het einde ook werkelijk door de runtime sluit.
- **Dialoogkeuze** kan: naar een volgende regel gaan (nextEntryRef, via "Vervolgregel toevoegen"), dialoog sluiten (`action: close`), een bestaande quest accepteren/inleveren (`action: accept_quest`/`turn_in_quest` + `questRef`-picker, geen ruwe questRef-invoer), of een voorwaarde krijgen (`+ Voorwaarde` op de keuze, zelfde generieke mechanisme als bij quest-stappen). Dit dekt precies de door de runtime uitgevoerde keuzelogica (`chooseDialogue` in `node04-quest-runtime-service.js`).
- Cirkelverwijzingen (een keuze die terugverwijst naar een eerder getoonde regel) worden gedetecteerd en tonen een duidelijke "verwijst terug naar..."-notitie in plaats van oneindig te renderen; een dieptelimiet (24) voorkomt een hang bij zeer lange ketens.
- Layout: hoofdketen horizontaal, keuzes + hun vervolg verticaal onder hun regel, geen verplaatsing van bestaande nodes.

---

## 6. Geselecteerde Quest Target integratie (Fase 2 → AUTHORING-03)

Wanneer in de route "Object of personage" een `quest_target_binding` bestaat voor het geselecteerde model, tonen twee extra knoppen: "Nieuwe Quest voor <naam>" en "Nieuwe Dialoog voor <naam>". Klikken navigeert naar de route Quest / Dialoog **zonder** zelf een Campaigns Group te kiezen (Kevin kiest die zelf, zoals de FASE-tekst vraagt); zodra Kevin daar "Nieuwe Quest"/"Nieuwe Dialoog" klikt, wordt de targetreference automatisch voorgevuld uit de bestaande `quest_target_binding.targetId`. Er wordt geen cross-group edge gemaakt, geen nieuwe NPC/Enemy-definitie, en het 3D-object wordt niet aangeraakt - alleen een canonical-ID-string wordt client-side doorgegeven.

Bestaat er nog geen `quest_target_binding`? Dan tonen de knoppen niet; in plaats daarvan wijst een hint terug naar de al bestaande "Maak Quest Target"-actie in hetzelfde paneel (AUTHORING-02, ongewijzigd).

---

## 7. STOPVOORWAARDE: Bouwblok 3 (branches, parallelle paden, joins) - niet gebouwd

`quest_branch`, `quest_parallel`, `quest_join`, `quest_fail`, `quest_link` bestaan niet in `src/shared/node-types.js` (en dus ook niet in de browser-kopie, niet in de compiler, niet in de runtime). Dit is geverifieerd met exhaustieve grep over `src/` en `apps/` - geen enkele vindplaats. `quest_complete` bestaat wel als node-type, maar `campaign-compiler.js` leest hem nergens; hij is een niet-gecompileerde placeholder.

Volgens de STOPVOORWAARDEN van dit fasecontract ("bestaande node-types/ports onvoldoende blijken" → "Stop zonder door te bouwen... Verzin geen workaround") heb ik Bouwblok 3 **niet** gebouwd. Er zijn geen quest-branch/join/parallel-knoppen toegevoegd aan de inline plus, en `quest_complete`/`quest_fail` zijn niet als normale keuzes getoond (Honeste Runtime-regel).

Dit is een echte functionele beperking, geen cosmetische: Kevin kan momenteel geen vertakte questlijnen bouwen. Dat vereist een aparte, expliciet goedgekeurde vervolgfase die nieuwe node-types + compiler-/runtimesupport toevoegt (buiten de scope die dit contract toestaat: "wijzig shared node-types/compiler/runtime alleen bij bewezen noodzaak" en "geen nieuwe questengine bouwen").

**Wat wél al vertakking-achtig gedrag geeft, en al is meegenomen:** dialoogkeuzes (`dialogue_choice`) zijn een volwaardig, al bestaand vertakkingsmechanisme en zijn volledig geïmplementeerd in Bouwblok 4 (zie sectie 5). "Parallel pad" en "Join" voor dialoog zijn niet gebouwd omdat het bestaande contract (`dialogue_router` is net als `quest_complete` gedefinieerd maar nooit gecompileerd) dat niet ondersteunt - conform de eigen conditionele gate van de FASE-tekst ("alleen wanneer bestaand contract dit ondersteunt").

---

## 8. Bewust verborgen / niet aangeboden (Honeste Runtime)

- `quest_complete`, `quest_branch`, `quest_join`, `quest_parallel`, `quest_fail`, `quest_link` - zie sectie 7.
- `dialogue_router`, `dialogue_action` - bestaan als node-type, maar worden nergens door `campaign-compiler.js` of `node04-quest-runtime-service.js` gelezen. Niet aangeboden als normale keuze.
- Van de FASE-tekst's "minimale" lijsten ontbreken deze node-types daadwerkelijk in het schema en zijn dus niet gebouwd (geen verzonnen namen):
  - Objectives: "Interacteer met target" (`objective_interact`), "Versla enemy" (`objective_defeat`), "Ontdek gebied" (`objective_discover`).
  - Conditions: "Heeft currency" (`condition_has_currency`), "Queststatus" (`condition_quest_state`), "Flag/tag" (`condition_tag_or_flag`).
  - Actions/rewards: "Geef item" (`action_give_item` - bestaat niet als apart type), "Zet flag" (`action_set_tag_flag`), "Toon/verberg marker" (`action_show_hide_marker`).
- `quest_step.rewards` en `reward_bundle.rewards` zijn dezelfde onderliggende poort als de vijf `action_*`-types (die output zowel `action` als `rewardEntry`). "Actie toevoegen" en "Beloning toevoegen" zijn daarom twee UI-ingangen naar hetzelfde mechanisme, niet twee aparte databronnen - dat is geen bug, maar een eerlijke weergave van het schema.

---

## 9. Atomaire mutaties, Undo en liveness

Elke create/edit/delete-actie in dit bouwblok volgt exact hetzelfde patroon als AUTHORING-02's `objectFunctionCommitDraft`/`objectFunctionDeleteKind`:

1. `cloneGraphForRestore(state.graph)` - werk op één kopie.
2. Muteer alleen die kopie (nodes/edges toevoegen, sequenceIndex/nextEntryRef-velden zetten).
3. Precies één `restoreGraphObject(...)`-call (die zelf via `applyGraphMutation` één server-roundtrip + één history-snapshot doet).
4. `try/finally` rond de call; `afterApply` ruimt de lokale draft-state op en herstelt focus/selectie.
5. Geen geneste `applyGraphMutation`/`restoreGraphObject`-ketens - elke gebruikersactie in dit bouwblok is precies één zo'n call.

Geen enkele mutatie start een timer of wacht oneindig: de bestaande `EDITOR_API_TIMEOUT_MS`/`enqueueGraphMutation`-serialisatie (ongewijzigd) blijft van toepassing. Save Draft, Save To Game, Undo en Redo zijn niet aangeraakt en blijven de bestaande, ongewijzigde routes gebruiken. AUTHORING-03-mutaties vragen geen 3D-viewport-refresh aan, omdat ze geen viewportdata wijzigen; graph/inspector/validatie verversen wel.

**Idempotentie:** "Nieuwe Quest"/"Nieuwe Dialoog" maakt na bevestiging precies één quest/dialoog. Opnieuw openen van een bestaande quest/dialoog creëert niets. "Beheren" op een bestaand objective/conditie/actie/keuze wijzigt in-place, geen duplicaat. Herhaald opslaan zonder wijziging blijft mogelijk (bestaande unsaved-detectie ongewijzigd). Navigatie (tab wisselen, quest/dialoog selecteren, terug-knoppen) muteert nooit de graph.

---

## 10. Publishroute

Geen wijziging aan de compiler, runtime, database of publishroute. "Save To Game" gebruikt uitsluitend de bestaande `POST /api/editor/publish` → `GameProjectCompiler` → `compileCampaignRegistry`-route. AUTHORING-03 zorgt er alleen voor dat nieuwe quests/dialogen een edge krijgen naar een (indien nodig aangemaakte) `campaign_output`-node **binnen** de gekozen Campaigns Group - conform "Campaignpackageverbindingen blijven binnen bestaande Groups".

AUTHORING-03 koppelt `campaign_output.campaignPackage` naar de bestaande `Group Output.campaignPackage` binnen de Campaigns Group. De buitenste rootverbinding van die Campaign Group naar `campaign_registry` → `World Assembly` → `Game Output` blijft bestaande root-infrastructuur en wordt niet automatisch aangelegd. Als een Campaigns Group die rootverbinding nog niet had, publiceert een nieuwe quest niet vanzelf mee totdat die bestaande verbinding er is. Kevin's acceptatiestap 25-26 (Save To Game + controleren in de game) toont dit direct.

---

## 11. Gewijzigde bestanden

- `apps/web/public/editor/editor.js` - nieuwe `questTimeline*`-sectie (state, data-helpers, layout-helpers, mutaties, rendering) + twee kleine hooks in bestaande functies (`renderAuthoringSection` voor de Campaign-Group-hub en de "geen Campaign Group"-melding, `renderObjectFunctionSection` voor de Fase-2-snelkoppelingen).
- `apps/web/public/editor/styles.css` - nieuwe, bij de bestaande `objectFunction*`-stijl aansluitende classes voor tabs, tijdlijn, inline-plus en stapblokjes.
- `apps/web/public/editor/index.html` - cacheversie van `editor.js` en `styles.css` opgehoogd.
- `README/fases/AUTHORING-03-Quest-Dialogue-Timeline.md` - dit document (nieuw).
- `README/fases/README.md` - regel toegevoegd onder de backlog-lijst.

**Niet gewijzigd:** `apps/web/public/editor/authoring-contract.js` (bestaande route/workspace-logica bleek al voldoende - `quest_dialogue`-route en `campaign`-workspaceKind bestonden al), `src/shared/node-types.js`, `apps/web/public/shared/node-types.js`, elke server-side compiler-/runtimebestand, elke databasemigratie.

---

## 12. Resterende beperkingen (samenvatting)

1. **Bouwblok 3 (branches/parallel/join) is niet gebouwd** - vereiste node-types bestaan niet (sectie 7).
2. `quest_step`/`quest_definition` hebben meer velden dan dit bouwblok aan de UI blootlegt (bv. `questType`, `repeatMode`) - die blijven bereikbaar via de bestaande generieke inspector door de node in de graph te selecteren. `stepType` wordt automatisch gezet vanuit de toegevoegde objective wanneer dat veilig kan.
3. Het verwijderen van een `quest_step` cascadeert niet naar zijn objectives/conditions/rewards (blijven als losgekoppelde nodes staan) - bewust, geen destructieve cascade zonder bevestiging, net als AUTHORING-02's patroon elders in de editor.
4. Het verwijderen van een dialoogkeuze focust niet automatisch de bijbehorende regel na afloop (kleine UX-imperfectie, geen datafout).
5. Enkele minimaal-gevraagde node-types uit de FASE-tekst bestaan niet in het echte schema (sectie 8) en zijn dus niet aangeboden.
6. De publishroute naar `campaign_registry` is bestaande root-infrastructuur buiten dit contract (sectie 10).

---

## 13. Kevins handmatige controleroute

Er zijn géén tests, geen smoke, geen Playwright en geen browserchecks door mij uitgevoerd (conform opdracht). Alleen `node --check apps/web/public/editor/editor.js` (pure syntax-parse, geen server/poort) is uitgevoerd en slaagt.

1. Open de editor op localhost:3001.
2. Ga naar `+ Maken` → `Quest / Dialoog`. Is er nog geen Campaigns Group: klik "Nieuwe Campaigns Group" en open hem.
3. Klik "Nieuwe Quest". Vul naam en omschrijving in. Bevestig.
4. Controleer: Start → Stap 1 → Voltooid-indicator, links-naar-rechts. Verwacht dat de indicator waarschuwt zolang de laatste stap nog geen ondersteund `deliver`- of `reach`-einde heeft.
5. Voeg met de inline `+` na Stap 1 een tweede stap toe. Controleer links-naar-rechts layout en dat Stap 1 niet is verplaatst.
6. Klik Stap 1. Voeg "Praat met target" toe via de picker (geen ID typen).
7. Voeg "Verzamel item" toe via de itempicker.
8. Voeg een "Player level"-voorwaarde toe.
9. Voeg een "Reward Bundle" toe en daarbinnen een "Geef currency"-beloning.
10. Save Draft, ververs de pagina, open dezelfde quest opnieuw. Controleer dat niets gedupliceerd is en dat 3D-objecten elders gewoon nog zichtbaar zijn.
11. Verwijder de objective van stap 1; gebruik Undo, dan Redo. Controleer dat waarden/node/edge exact terugkomen.
12. Ga naar tab "Dialoogtimeline". Maak een nieuwe dialoog met een spreker (Quest Target-picker) en een eerste regel.
13. Voeg een tweede tekstregel toe; voeg daarna op een regel twee keuzes toe.
14. Koppel één keuze aan `accept_quest` met een bestaande quest via de questpicker (geen ruwe ID).
15. Voeg bij de andere keuze "Dialoog beëindigen" toe.
16. Save Draft, ververs binnen de dialoog. Controleer dat structuur en selectie herstellen.
17. Selecteer in Fase 2 (route "Object of personage") een object dat al Quest Target is. Klik "Nieuwe Quest voor <naam>", kies een Campaign, en controleer dat de Quest Target-picker automatisch is ingevuld.
18. Save To Game.
19. Controleer in de game alleen het bestaand ondersteunde gedrag (talk/collect/deliver/reach-objectives, de twee conditions, de vijf actions, reward bundle, dialoogkeuzes met accept/turn-in/close). Verwacht geen vertakte questlogica (sectie 7) en geen gedrag van `quest_complete`/`dialogue_router`/`dialogue_action` (sectie 8).
20. Controleer dat Save, Undo, refresh en 3D-objecten overal in de editor blijven werken zoals voorheen, en dat rootgraph, zones, catalogs en bestaande quests niet onverwacht zijn gewijzigd.

Kevin heeft AUTHORING-03 op 2026-09-10 geaccepteerd. De fase is gesloten met de expliciete beperking dat Bouwblok 3 (branches/parallel/join) niet gebouwd is omdat het bestaande schema daar geen node-types/ports voor heeft.
