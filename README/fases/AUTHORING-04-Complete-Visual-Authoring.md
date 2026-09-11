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

- Nieuwe Zone Groups gebruiken voortaan canoniek `zonePackage` als group-outputnaam.
- Bestaande/historische Zone Groups met `zonepkg` blijven geldig; hun data wordt niet verwijderd of hernoemd.
- Zone-publicatie leidt de geldige Group Output-poort af uit de Group Interface op basis van datatype `zonePackage`.
- Dezelfde gevonden poortnaam wordt gebruikt voor `zone_output -> Group Output` en `Group Node -> zone_registry`.
- Bestaande interne/externe package-edges worden in dezelfde graphkopie naar die gevonden poortnaam herschreven wanneer ze hetzelfde package-datatype publiceren.
- Dezelfde dynamische aanpak is statisch toegepast op Catalog, Player Rules en UI packagehelpers, zodat `catalogPackage`, `playerRules` en `uiPackage` niet opnieuw blind als grouppoort worden aangenomen bij bestaande aliassen.
- `src/shared/node-types.js` en `apps/web/public/shared/node-types.js` zijn synchroon gehouden.

Er is geen database-reset, graphopschoning, demo-zone, serverstart, smoke, Playwright of browsertest uitgevoerd.

---

## 1. Werkelijke contractinventaris

AUTHORING-04 is gebouwd op de node-types, ports, compilers en runtimepaden die werkelijk bestaan. Er zijn geen nieuwe schema-, compiler- of runtimecontracten verzonnen.

**Wereld / Zone**

- `group` met `groupKind: "zone"` en root-level Zone Canvas.
- `zone_definition`, `zone_environment_settings`, `zone_gameplay_rules`, `ground_surface`, `spawn_point`, `zone_output`.
- Rootkoppeling via `zone_output.zonePackage -> group_output.<werkelijke zonePackage grouppoort> -> group.<dezelfde grouppoort> -> zone_registry.zonePackage`. Voor nieuwe zones is die grouppoort `zonePackage`; historische `zonepkg`-groups blijven ondersteund.
- Gridpositie via `zoneGridX` en `zoneGridY/zoneGridZ`.

**Object of personage**

- Behoud van AUTHORING-02: `model_entity`, `entity_assembly`, `interaction_component`, `npc_component`, `enemy_component`, `quest_target_binding`.
- Entity-bound targetpolygonen blijven editor/runtime-technisch verborgen en worden niet als 3D mesh gerenderd.
- `pickup_spawn` is niet als normale visuele objectroute toegevoegd, omdat de volledige veilige zone/runtimeketen voor deze route niet als AUTHORING-04-contract is bewezen. De node blijft via Meer nodes bereikbaar wanneer parent/context geldig zijn.

**Quest / Dialoog**

- Behoud van AUTHORING-03: `campaign_output`, `quest_definition`, `quest_step`, objectives, conditions, actions/rewards, `reward_bundle`, `dialogue_definition`, `dialogue_entry`, `dialogue_choice`, `dialogue_terminal`.
- Nieuwe catalog-definities zijn direct zichtbaar in reference-pickers, omdat ze echte identityvelden krijgen en via de bestaande reference-index lopen.
- Geen branch/join/fail/parallel gebouwd; AUTHORING-03C-contracten ontbreken.

**Item / Ability / Stat**

- Normale Catalog-hub voor `item_definition`, `ability_definition`, `stat_definition`, `currency_definition`, `loot_table`.
- Lootregels gebruiken bestaande technische nodes `loot_item_entry`, `loot_currency_entry`, `loot_table_entry`, maar die zitten achter de visuele Loot Table-editor.
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
- Catalog-hub heeft zoeken, tabs, maken, bewerken, verwijderen en visuele Loot Table-regels met item/currency/table, chance, weight en min/max.
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

### Route 4 - Item / Ability / Stat

1. Open `+ Maken`.
2. Klik `Item / Ability / Stat`.
3. Maak of open een Catalog Group.
4. Zoek in de Catalog-hub.
5. Maak een Item Definition.
6. Maak een Ability Definition.
7. Maak een Stat Definition.
8. Maak een Currency Definition.
9. Maak een Loot Table.
10. Voeg een Itemregel toe.
11. Kies het item via de picker.
12. Vul chance, weight, minimum en maximum in.
13. Voeg een Currencyregel toe.
14. Bewerk een lootregel.
15. Verwijder een testdefinitie en gebruik Undo.

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
