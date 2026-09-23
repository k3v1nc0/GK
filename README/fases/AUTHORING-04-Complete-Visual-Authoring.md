# AUTHORING-04 - Complete visuele authoring voor alle vijf hoofdroutes

**Documenttype:** eindrapport voor Kevin  
**Status:** implemented, awaiting Kevin acceptance

**Basiscommit:** `0478219ff4ce4fda2410960445df0aa4e2954395`  
**Afhankelijkheden:** AUTHORING-01, AUTHORING-02, AUTHORING-02B, AUTHORING-03, NODE-01 t/m NODE-05

---

## AUTHORING-04-FIX-01 - Zone Canvas packagepoort

**Status:** implemented, awaiting Kevin acceptance

**Basiscommit fix:** `7ac2edb999a3a3bf3a0570d187025f9f74956b9a`

Oorzaak: het gedeelde zonepreset gebruikte historisch de group-outputpoort `zonepkg`, terwijl AUTHORING-04 bij zone-aanmaak vaste edges met `zonePackage` schreef. Daardoor kon een nieuwe Zone Canvas snapshot een edge krijgen naar een inputpoort die volgens de actuele Group Interface niet bestond.

Herstel:

- Nieuwe Zone Groups publiceren via datatype `zonePackage`; de werkelijk opgeslagen group-outputnaam is in FIX-02 aangescherpt naar `zonepackage`.
- Bestaande/historische Zone Groups met `zonepkg` blijven geldig; hun data wordt niet verwijderd of hernoemd.
- Zone-publicatie leidt de geldige Group Output-poort af uit de Group Interface op basis van datatype `zonePackage`.
- Dezelfde gevonden poortnaam wordt gebruikt voor `zone_output -> Group Output` en `Group Node -> zone_registry`.
- Bestaande interne/externe package-edges worden in dezelfde graphkopie naar die gevonden poortnaam herschreven wanneer ze hetzelfde package-datatype publiceren.
- Dezelfde dynamische aanpak is statisch toegepast op Catalog, Player Rules en UI packagehelpers, zodat `catalogPackage`, `playerRules` en `uiPackage` niet opnieuw blind als grouppoort worden aangenomen bij bestaande aliassen.
- `src/shared/node-types.js` en `apps/web/public/shared/node-types.js` zijn synchroon gehouden.

Er is geen database-reset, graphopschoning, demo-zone, serverstart, smoke, Playwright of browsertest uitgevoerd.

---

## AUTHORING-04-FIX-02 - Geslugde Group Interface-poortnamen

**Status:** implemented, awaiting Kevin acceptance

Oorzaak vervolg: `normalizeGroupInterface` slaat Group Interface-poortnamen op als lowercase/slugs. Daardoor wordt een nieuwe poortnaam zoals `zonePackage` in de restore-validatie feitelijk `zonepackage`. Een snapshot-edge met `toPort: "zonePackage"` bleef daarom ongeldig voor `Group Output`, ook na de eerste fix.

Herstel:

- De canonieke opgeslagen Zone Group-outputpoort voor nieuwe zones is nu `zonepackage`.
- `zone_output.zonePackage` en `zone_registry.zonePackage` blijven de bestaande echte node-poorten; alleen de Group Interface-poort ertussen is `zonepackage`.
- Catalog, Player Rules en UI gebruiken dezelfde opgeslagen packagepoortvorm: `catalogpackage`, `playerrules` en `uipackage`.
- De browser-helper slugt de gekozen group-interfacepoort voordat hij interne en externe package-edges maakt.
- De server-restore normaliseert bestaande/cached package-boundary-edges vóór validatie naar de werkelijk aanwezige Group Interface-poort op basis van datatype. De edge wordt niet verwijderd en de gewone graph-validatie blijft daarna actief.

Er is geen database-reset, graphopschoning, demo-zone, serverstart, smoke, Playwright of browsertest uitgevoerd.

---

## AUTHORING-04-FIX-03 - Authoring convergence entity/component ownership

**Status:** implemented, awaiting Kevin acceptance

Gerichte auditketen voor de demoquest:

```text
Authoring Object of personage
-> model_entity + entity_assembly + component/quest_target_binding nodes
-> GameProjectCompiler zonePackage entities/questTargets
-> draft-world merge naar runtime-readmodel
-> editor preview via shared world-runtime
-> publish via dezelfde GameProjectCompiler/merge
-> game NODE-03/04/05 runtime targets
```

Hoofdoorzaak: `model_entity`/`entity_assembly` was al de bedoelde eigenaar van mesh en transform, maar `world-runtime.js` reconstrueerde in editor mode nog aparte runtime-targetfamilies voor quest targets, zone links, services en spawns. Voor questtargets met `linkedEntity` werd het gekoppelde model opnieuw als targetbody geladen. Daardoor kon Bram tegelijk als echte authored mesh en als questmarker/runtime-targetmesh verschijnen. Dezelfde soort naamgebaseerde portal/target-visualisatie bestond server-side in NODE-03/04.

Ownership-matrix na deze fix:

| Onderdeel | Identiteit | Mesh/asset | Transform | Naam/nameplate | Click/hit target | Gedrag | Quest-/servicerefs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bram/model | `entity_assembly.entityId` + `model_entity.nodeId` | `model_entity.modelAssetId` | `model_entity` transformvelden | label/displayName van entity/model | linked runtime target selecteert `model_entity.nodeId` | componenten op dezelfde assembly | refs blijven naar entity/component/quest nodes |
| Bram NPC/interactie | `npc_component` en `interaction_component` | geen eigen mesh | volgt Bram `model_entity` | NPC-label via dezelfde entity | hitproxy volgt attached entity | NPC/interactable component | dialogue/quest start refs |
| Questballon/statusicoon | runtime marker id | geen meshmodel | volgt attached `model_entity` | presentatie van questtarget/state | marker/hitproxy selecteert attached entity | geen contentgedrag | `quest_target_binding` + quest state |
| Dialoog | `dialogue_definition`/entries | geen mesh | n.v.t. | menselijke dialoognaam | gestart via Bram interactable/NPC | dialogue flow | gekoppeld aan NPC/interactie |
| Quest start/voortgang/rewards | `quest_definition`, steps, objectives, rewards | geen mesh | n.v.t. | questtitel/objective label | via gekoppelde targets | quest runtime state | refs naar NPC/items/enemies/services |
| Wood/Iron/Sun Crystal | catalog/spawn/target refs | expliciete catalog/spawn assetref indien beschikbaar | spawnpositie of authored entity | target/objective label | NODE-03 targetlaag | resource/pickup target | objective refs |
| Enemies | spawn entry + catalog/enemy definition | expliciete definition/spawn assetref | spawnpositie/runtime instance | enemy label | NODE-03 enemy target | enemy runtime behavior | objective refs |
| Portals | `zone_link` | geen naamgebaseerd geleend model | link-origin/spawnpositie | prompt/target zone | marker/hit target | travel behavior | `toZoneRef`/`toSpawnRef` |
| Start Forge | `crafting_station_component` + linked entity | linked `model_entity` | linked `model_entity` | service label/nameplate | attached hit target selects entity | crafting station | recipe/policy refs |
| Mira Trader | `vendor_component` + linked entity | linked `model_entity` | linked `model_entity` | service label/nameplate | attached hit target selects entity | vendor | stock/currency refs |
| Market Board | `marketplace_access_component` + linked entity | linked `model_entity` | linked `model_entity` | service label/nameplate | attached hit target selects entity | market access | market policy refs |

Herstel:

- Editor-runtime normaliseert raw `entity_assembly` en vlakke `model_entity` records naar één canonieke visible zone entity voor selectie, positie en servicekoppelingen.
- Questtarget/service editorlagen krijgen bij een gekoppelde entity `editorSelectableId` en `editorAttachedEntityId` van de echte `model_entity`; klikken op naamplaat/ring/hitproxy selecteert dus de authored mesh.
- G/transform-workflow blijft de bestaande `model_entity` patchroute gebruiken; gekoppelde editor-targetlagen volgen live via dezelfde runtime transform.
- Questmarkers met een linked entity sturen in de game geen tweede `modelAssetId` meer mee; zij blijven marker/nameplate/hit target.
- Naamgebaseerde target/portal model-fallbacks zijn verwijderd uit `world-runtime.js`, `node03-runtime-service.js` en `node04-quest-runtime-service.js`.
- NODE-05 service runtime resolveert components nu ook tegen `entity_assembly` records, niet alleen tegen losse `model_entity` records.
- Object of personage kan nu naast Interactable/NPC/Enemy/Quest Target ook Crafting Station, Vendor en Market Access als component op dezelfde assembly maken/beheren/verwijderen.
- Servicecomponenten erven hun linked entity uit de assembly wanneer er nog geen expliciete `linkedEntityId` staat; normale Authoring hoeft die ID niet handmatig te vragen.

Niet opgelost of niet live bewezen:

- Er is geen nieuwe databasecontent of golden-path quest aangemaakt; dat blijft Kevins live acceptatiestap via normale Authoring.
- Enemy/resource/pickup spawns blijven runtime instances vanuit NODE-03 spawnsets, niet per stuk `model_entity` authored objects.
- Branch/join/parallel questflow blijft niet ondersteund zolang het schema/compilercontract ontbreekt.
- Ik heb geen browser, Playwright, smoke, npm check/test, serverstart of tweede poort gebruikt.

Gewijzigde bestanden in deze fix:

- `apps/web/public/shared/world-runtime.js`
- `apps/web/public/editor/editor.js`
- `apps/web/public/editor/index.html`
- `apps/web/public/game/game.js`
- `apps/web/public/game/index.html`
- `src/server/node03-runtime-service.js`
- `src/server/node04-quest-runtime-service.js`
- `src/server/node05-economy-runtime-service.js`
- `README/fases/AUTHORING-04-Complete-Visual-Authoring.md`
- `README/fases/README.md`

---

## AUTHORING-MIRROR-DEMO microfase 1 - Catalog Coverage

**Status:** implemented, awaiting Kevin acceptance

Doel: de normale Catalog-route breed genoeg maken om de definities voor een onafhankelijke Authoring Proof Demo te kunnen maken, zonder wereldplaatsingen, demo-hardcode, raw nodes of handgeschreven IDs.

Herstel:

- De Authoring-route heet nu `Catalog / Definities` en de Catalog Group toont ook NPCs, enemies, resources, recipes en vendor catalogs.
- `npc_archetype`, `enemy_archetype`, `resource_definition`, `recipe_definition` en `vendor_catalog` worden via dezelfde managed Catalog-route aangemaakt als items/currencies/loot tables.
- `recipe_ingredient` en `vendor_offer` zijn geen losse catalogdefinities gemaakt; ze worden als child-regels beheerd onder respectievelijk `recipe_definition.ingredients` en `vendor_catalog.offers`, conform het bestaande compilercontract.
- Recipe outputs gebruiken de bestaande `outputItems` en `outputCurrencies` velden, maar krijgen in de normale Catalog-form typed item/currency pickers in plaats van ruwe JSON-invoer.
- Catalogregels tonen waar een definitie wordt gebruikt, met menselijke labels. Verwijderen van gebruikte definities toont een waarschuwing met de gekoppelde gebruikers.
- De Catalog-intro zegt expliciet dat een definitie nog geen geplaatst wereldobject is; world placement en G-verplaatsen blijven voor latere microfasen.

Gebruikte bestaande contracten:

- `catalog-compiler.js`: `npcs`, `enemies`, `resources`, `recipes`, `vendorCatalogs`, `items`, `currencies`, `lootTables`.
- `symbol-index-service.js`: typed reference kinds `npc`, `enemy`, `resource`, `recipe`, `vendor_catalog`, `item`, `currency`, `loot_table`.
- NODE-03 runtime: enemy/resource/item/currency/loot catalog consumers.
- NODE-05 runtime: recipe en vendor catalog consumers.

Niet opgelost of niet live bewezen:

- Deze microfase plaatst nog geen resources, pickups, enemies, portals of services in de wereld.
- G-verplaatsen van bomen/items/enemies/iron/portals hoort bij latere placement-microfasen.
- `vendor_offer` en `recipe_ingredient` zijn child-records, geen zelfstandig publiceerbare definities.
- Er is geen browser, Playwright, smoke, npm check/test, serverstart of tweede poort gebruikt.

Gewijzigde bestanden in deze microfase:

- `apps/web/public/editor/editor.js`
- `apps/web/public/editor/authoring-contract.js`
- `apps/web/public/editor/index.html`
- `README/fases/AUTHORING-04-Complete-Visual-Authoring.md`
- `README/fases/README.md`

---

## 1. Werkelijke contractinventaris

AUTHORING-04 is gebouwd op de node-types, ports, compilers en runtimepaden die werkelijk bestaan. Er zijn geen nieuwe schema-, compiler- of runtimecontracten verzonnen.

**Wereld / Zone**

- `group` met `groupKind: "zone"` en root-level Zone Canvas.
- `zone_definition`, `zone_environment_settings`, `zone_gameplay_rules`, `ground_surface`, `spawn_point`, `zone_output`.
- Rootkoppeling via `zone_output.zonePackage -> group_output.<werkelijke zonePackage grouppoort> -> group.<dezelfde grouppoort> -> zone_registry.zonePackage`. Voor nieuwe zones is die opgeslagen grouppoort `zonepackage`; historische `zonepkg`-groups blijven ondersteund.
- Gridpositie via `zoneGridX` en `zoneGridY/zoneGridZ`.

**Object of personage**

- Behoud van AUTHORING-02: `model_entity`, `entity_assembly`, `interaction_component`, `npc_component`, `enemy_component`, `quest_target_binding`.
- Entity-bound targetpolygonen blijven editor/runtime-technisch verborgen en worden niet als 3D mesh gerenderd.
- `pickup_spawn` is niet als normale visuele objectroute toegevoegd, omdat de volledige veilige zone/runtimeketen voor deze route niet als AUTHORING-04-contract is bewezen. De node blijft via Meer nodes bereikbaar wanneer parent/context geldig zijn.

**Quest / Dialoog**

- Behoud van AUTHORING-03: `campaign_output`, `quest_definition`, `quest_step`, objectives, conditions, actions/rewards, `reward_bundle`, `dialogue_definition`, `dialogue_entry`, `dialogue_choice`, `dialogue_terminal`.
- Nieuwe catalog-definities zijn direct zichtbaar in reference-pickers, omdat ze echte identityvelden krijgen en via de bestaande reference-index lopen.
- Geen branch/join/fail/parallel gebouwd; AUTHORING-03C-contracten ontbreken.

**Catalog / Definities**

- Normale Catalog-hub voor `npc_archetype`, `enemy_archetype`, `resource_definition`, `item_definition`, `recipe_definition`, `vendor_catalog`, `ability_definition`, `stat_definition`, `currency_definition`, `loot_table`.
- Lootregels gebruiken bestaande technische nodes `loot_item_entry`, `loot_currency_entry`, `loot_table_entry`, maar die zitten achter de visuele Loot Table-editor.
- Recipe ingredienten gebruiken bestaande technische nodes `recipe_ingredient`, maar die zitten achter de visuele Recipe-editor.
- Vendor offers gebruiken bestaande technische nodes `vendor_offer`, maar die zitten achter de visuele Vendor Catalog-editor.
- Automatische route: definitie `catalogDefinition -> catalog_output.definitions -> group_output.catalogPackage -> group.catalogPackage -> catalog_registry.catalogPackage -> world_assembly.catalogs`.

**Game-instellingen / UI**

- Player Rules: `player_progression_rules`, `inventory_rules`, `equipment_rules`, `ability_loadout_rules`, `death_respawn_rules`, `unstuck_rules`, `xp_source_rule`, `crafting_policy`, `vendor_policy`, `party_loot_policy`, `party_rules`, `trade_policy`, `market_policy`, `mail_policy`.
- UI: `ui_hud_text`, `debug_performance_hud`, `game_minimap_hud`, `hud_layout`, `menu_layout`, `party_hud`, `vendor_hud`, `crafting_hud`, `market_hud`, `trade_hud`, `inventory_hud`, `wallet_hud`, `equipment_hud`, `ability_bar_hud`, `quest_tracker_hud`.
- Automatische route: policies/modules/layouts naar `player_rules_output`/`ui_output`, dan via group output naar `world_assembly`.
- Preview is alleen getoond voor bestaande runtime-ondersteunde UI: HUD Text, Performance HUD, Game Minimap HUD. Voor andere UI-types staat eerlijk dat er geen bestaande runtime-preview is.

---

## 2. Geimplementeerd

- Het authoringmenu heeft nu vijf volledige menselijke routes.
- Wereld / Zone toont alle root-level zones, maakt een startzone, maakt buren links/rechts/boven/onder, blokkeert bezette zijden, vraagt naam en basis, en kan openen/hernoemen/basis herstellen/verwijderen.
- Object of personage behoudt AUTHORING-02 en toont read-only onderdelen plus quests/dialogen die naar de selectie verwijzen.
- Quest / Dialoog behoudt AUTHORING-03 en gebruikt nieuwe catalog-content direct via bestaande reference-pickers.
- Catalog-hub heeft zoeken, tabs, maken, bewerken, verwijderen, gebruiksbacklinks, delete-waarschuwingen en visuele child-regels voor Loot Tables, Recipes en Vendor Catalogs.
- Player Rules/UI-hub heeft root-only groepaanmaak, categorieknoppen, zoeken, bewerken, verwijderen, duplicatebescherming en automatische outputs/koppelingen.
- Meer nodes is altijd bruikbaar, met contextweergave en schakelaar Alle nodes / Geavanceerd. Alle geregistreerde node-types zijn vindbaar met statusbadges voor ok, buiten route, infra, system, internal, deprecated, future en unsupported.
- Route- en workspaceknoppen hebben read-only aantalbadges. Zonder 3D-selectie tonen ze totalen; met selectie tonen ze gekoppelde/verwijzende onderdelen.
- De 3D-view heeft een toggle Authoring-indicatoren. Per model verschijnen read-only indicatoren voor Wereld/Zone, Object, Quest, Catalog en Instellingen/UI.

---

## 3. Niet gebouwd

- Geen branch/join/fail/parallel-questfunctionaliteit: de vereiste AUTHORING-03C-contracten bestaan niet.
- Geen gefakete UI-preview voor types die runtime niet ondersteunt.
- Geen pickup-normal-route zolang `pickup_spawn` plus de volledige veilige zone/runtimeketen niet als contract bewezen is.
- Geen nieuwe node-types, ports, compilerpaden of runtimegedrag.

---

## 4. Gewijzigde bestanden

- `apps/web/public/editor/editor.js`
- `apps/web/public/editor/authoring-contract.js`
- `apps/web/public/editor/index.html`
- `apps/web/public/editor/styles.css`
- `apps/web/public/shared/node-types.js`
- `src/shared/node-types.js`
- `README/fases/AUTHORING-04-Complete-Visual-Authoring.md`
- `README/fases/README.md`

Er zijn geen tests, smokechecks, Playwright-checks, performancechecks, serverstarts of andere poorten gebruikt.

---

## 5. Kevins kinderlijk genummerde testvolgorde

### Route 1 - Wereld / Zone

1. Open `+ Maken`.
2. Klik `Wereld / Zone`.
3. Kijk of bestaande zones in de lijst staan.
4. Als er geen zone is: klik `Nieuwe startzone`.
5. Vul een naam in.
6. Kies `Lege zone`.
7. Klik `Zone maken`.
8. Open de zone.
9. Ga terug naar `Wereld / Zone`.
10. Klik bij die zone `+ Rechts`.
11. Vul een naam in.
12. Kies eventueel `Veilige basisinstellingen overnemen`.
13. Klik `Zone maken`.
14. Controleer dat dezelfde zijde daarna niet nog eens kan.
15. Hernoem een zone.
16. Klik `Basis beheren`.
17. Verwijder een testzone en gebruik daarna Undo.

### Route 2 - Object of personage

1. Selecteer een 3D-model.
2. Open `+ Maken`.
3. Klik `Object of personage`.
4. Controleer de read-only lijst met bestaande onderdelen.
5. Maak of beheer Interactable.
6. Maak of beheer NPC.
7. Maak of beheer Enemy.
8. Maak of beheer Quest Target.
9. Controleer dat het model niet dupliceert en zijn transform houdt.
10. Controleer dat targetpolygonen niet als model zichtbaar worden.
11. Kijk of quests/dialogen die naar deze entity verwijzen zichtbaar zijn.

### Route 3 - Quest / Dialoog

1. Open `+ Maken`.
2. Klik `Quest / Dialoog`.
3. Open een Campaigns Group of maak er een.
4. Maak een nieuwe quest.
5. Voeg een stap toe met de plus.
6. Voeg een objective toe.
7. Voeg een condition toe.
8. Voeg een reward/action toe.
9. Maak een dialoog.
10. Voeg een tekstregel toe.
11. Voeg een keuze toe.
12. Koppel een keuze aan een bestaande quest via de picker.
13. Controleer dat nieuwe items/currencies/abilities uit de Catalog-pickers verschijnen.
14. Controleer dat er geen branch/join/fail-knoppen als normale workflow verschijnen.

### Route 4 - Catalog / Definities

1. Open `+ Maken`.
2. Klik `Catalog / Definities`.
3. Maak of open een Catalog Group.
4. Zoek in de Catalog-hub.
5. Maak een NPC Definition.
6. Maak een Enemy Definition.
7. Maak een Resource Definition.
8. Maak een Item Definition.
9. Maak een Recipe Definition.
10. Voeg een ingredient toe via de Recipe-editor.
11. Voeg een item-output of currency-output toe via de typed picker.
12. Maak een Vendor Catalog.
13. Voeg een Vendor Offer toe via de Vendor Catalog-editor.
14. Maak of controleer Ability, Stat, Currency en Loot Table waar nodig.
15. Controleer bij een gebruikte definitie `Gebruikt door`.
16. Probeer een gebruikte testdefinitie te verwijderen en controleer de waarschuwing.
17. Save Draft, refresh en controleer dat de definities en child-regels terugkomen.

### Route 5 - Game-instellingen / UI

1. Open `+ Maken`.
2. Klik `Game-instellingen / UI`.
3. Maak een Player Rules Group als die ontbreekt.
4. Maak een UI Group als die ontbreekt.
5. Open Player Rules.
6. Klik een rule-categorie.
7. Wijzig een nummer, toggle of picker.
8. Sla de wijziging op.
9. Open UI.
10. Maak HUD Text.
11. Controleer dat de preview verschijnt.
12. Maak Game Minimap HUD.
13. Controleer de minimap-previewtekst.
14. Open een UI-type zonder runtime-preview.
15. Controleer dat de editor eerlijk meldt dat er geen preview is.

---

## 6. Meer nodes, tellers en overlay

1. Open Meer nodes zonder route.
2. Zoek een bekende node.
3. Zet `Alle nodes / Geavanceerd` aan.
4. Zoek `group_output`, `catalog_registry`, `legacy_world_adapter` en `top_down_camera`.
5. Controleer de badges en uitleg.
6. Probeer een Catalog-node buiten een Catalog Group toe te voegen.
7. Controleer dat de editor een menselijke reden toont.
8. Selecteer geen 3D-model en kijk naar routebadges: dit zijn totalen.
9. Selecteer een 3D-model en kijk opnieuw: dit zijn selectie-aantallen.
10. Zet `Authoring-indicatoren` aan in de 3D-view.
11. Controleer de vijf kleine indicatoren boven relevante models.
12. Hover een indicator en lees categorie plus betekenis.
13. Zet de toggle weer uit.

---

## 7. Regressie- en publishcontrole

1. Save Draft.
2. Refresh de editor.
3. Controleer zones, modeltransforms, quests, dialogen, catalog-definities en UI/rules.
4. Gebruik Undo.
5. Gebruik Redo.
6. Controleer dat het groene/oranje/rode serverlampje blijft reageren zoals eerder.
7. Maak nog een kleine wijziging in een route.
8. Save Draft opnieuw.
9. Klik Save To Game.
10. Open de game.
11. Controleer alleen bestaand ondersteund gedrag.
12. Verwacht geen branch/join/fail-questgedrag en geen gefakete UI-preview.

Kevin zet AUTHORING-04 pas zelf op accepted/closed na live acceptatie.
