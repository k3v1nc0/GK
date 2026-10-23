# Plan: Nodes legacy → Werkbank | Instellingen

**Status:** plan, nog niet gestart  
**Datum:** 2026-10-22  
**Basis:** W3 implemented, awaiting Kevin acceptance (main op `4d0a27c` met W3 nog niet gecommit)

## Koers

Kevin heeft besloten dat de Nodes-editor en de nodetool legacy worden. Alle authoring moet via menselijke schermen kunnen.

| Moment | Tabs |
| --- | --- |
| Nu | `Nodes` \| `Werkbank` |
| Tussenstap | `Nodes (legacy)` \| `Werkbank` \| `Instellingen` |
| Eindbeeld | `Werkbank` \| `Instellingen` |

**Splitsingsregel**

- **Werkbank**: alles met een mesh, asset of content. Dat zijn contentdefinities, geplaatste objecten en hun rollen, spawns, verspreiden, quests en dialogen.
- **Instellingen**: alles wat het spel, de wereld en de zones instelt zonder eigen mesh. Dat zijn project, zones en hun basis, grond, licht, minimap, punten en gebieden, spelerregels, economie, interface, besturing, teksten en tags.
- **Automatisch**: outputs, registries, Groups en poorten maakt en verbindt de editor zelf. Ze worden nooit meer getoond.

## Uitgangssituatie

- Er zijn 186 node-types in 30 groepen (`src/shared/node-types.js`).
- **Werkbank (W1–W3)** dekt nu:
  - Items, Currencies, Resources, Recipes, Vendor Catalogs, Loot Tables, Enemies, NPC's, Abilities, Stats (definitie, Stat Block, curve alleen bekijken), Quests en Dialogen.
  - GLB plaatsen.
  - Objectrollen Enemy, Resource, NPC, Vendor en Quest Target.
- **Zonder nodes, maar binnen de Nodes-tab** (AUTHORING-04, `apps/web/public/editor/authoring-contract.js`): de routes *Wereld / Zone*, *Object of personage* (Visual Builder), *Quest / Dialoog* (timeline), *Catalog / Definities* (Catalog-hub) en *Game-instellingen / UI*. Dit is het startpunt om te verhuizen; bouw het niet opnieuw.
- **Alleen via "Meer nodes"**: de rest, zie de tabellen hieronder.

## 1. Naar Instellingen

| Onderdeel | Node-types | Nu | Wat moet er gebeuren |
| --- | --- | --- | --- |
| Zones beheren | `group` (zone), `zone_definition`, `zone_registry`/`zone_output` (automatisch) | Route Wereld/Zone: maken, buurzones, hernoemen, verwijderen, basis herstellen | Verhuizen naar Instellingen › Zones, met een zonekaart (raster met "+" op vrije kanten) |
| Zonebasis | `zone_definition` | Aangemaakt door de route, bewerken via de node-inspector | Pagina Basis: naam, rasterpositie |
| Zoneregels | `zone_gameplay_rules` | Node-inspector | Pagina Regels |
| Grond | `ground_surface`, `terrain_layer`, `surface_layer` | Grond via de route, lagen alleen via nodes | Pagina Grond: grootte en basistextuur, plus materiaalgebieden en paden/water schilderen in de viewport (zie beslispunt 1) |
| Licht en sfeer | `ambient_light`, `directional_light`, `zone_environment_settings`, `area_environment_override` | Alleen nodes | Pagina Licht & sfeer met live preview in de viewport |
| Minimap | `minimap_bake`, `editor_minimap_hud`, `game_minimap_hud` | Bake en editorkaart alleen nodes; gamekaart via de UI-route | Per zone een bake-knop met preview; de kaartweergave onder Interface |
| Punten | `spawn_point`, `player_spawn`, `checkpoint`, `location_anchor` | `spawn_point` via de route, de rest alleen nodes | Lijst met "Plaats in wereld" (klik in de viewport) |
| Gebieden | `area_definition`, `safe_rule_area`, `discovery_area`, `blocker_area`, `walkable_surface`, `area_output` (automatisch) | Alleen nodes | Lijst met "Teken in wereld" en per gebied menselijke velden |
| Kaart en markers | `map_marker_definition`, `marker_visibility_rule` | Alleen nodes | Pagina Kaart |
| Zoneverbindingen | `zone_link` | Via de Portal-rol van de Visual Builder | Overzicht per zone (welke portals waarheen); maken blijft de Portal-rol in de Werkbank |
| Project | `game_project_settings`, `world_settings`, `editor_world_settings`, `game_world_settings`, `editor_chunk_loading`, `game_chunk_loading`, `chunk_grid_definition` | Alleen nodes, gemarkeerd als "infra" | Pagina Project: wereld, laden, raster, prestaties |
| Camera | `game_camera`, `editor_camera` | Alleen nodes | Pagina Project › Camera |
| Netwerk | `mmo_network_settings` | Alleen nodes ("infra") | Pagina Project › Netwerk |
| Speler | `player_progression_rules`, `xp_source_rule`, `inventory_rules`, `equipment_rules`, `ability_loadout_rules`, `death_respawn_rules`, `unstuck_rules` | Route Game-instellingen/UI | Verhuizen naar Instellingen › Speler |
| Spelerpersonage | `playable_character_definition`, `player_character` | Alleen nodes | Speler › Personage: model kiezen uit de Asset Library, beweging, startuitrusting en start-stats |
| Economie en samenspel | `crafting_policy`, `vendor_policy`, `trade_policy`, `market_policy`, `mail_policy`, `party_rules`, `party_loot_policy` | Route Game-instellingen/UI | Verhuizen naar Instellingen › Economie |
| Belasting | `economy_tax_rule` | Alleen nodes | Toevoegen aan Economie |
| Interface (formulieren aanwezig) | `ui_hud_text`, `debug_performance_hud`, `game_minimap_hud`, `hud_layout`, `menu_layout`, `party_hud`, `vendor_hud`, `crafting_hud`, `market_hud`, `trade_hud`, `inventory_hud`, `wallet_hud`, `equipment_hud`, `quest_tracker_hud` | Route Game-instellingen/UI | Verhuizen naar Instellingen › Interface |
| Interface (alleen nodes) | `hud_bar`, `hotbar_hud`, `interaction_hud`, `xp_hud`, `death_respawn_hud`, `dialogue_hud`, `notification_hud`, `mail_hud`, `debug_mmo_hud` | Alleen nodes | Toevoegen aan Interface: per onderdeel aan/uit en plek, met preview waar de game het toont |
| Besturing | `keybind` | Alleen nodes | Pagina Besturing |
| Teksten, tags en waarden | `localization_entry`, `text_template`, `tag_definition`, `global_value_definition`, `constant_value`, `value_formula` | Alleen nodes | Eerst nagaan wat de game leest, dan pagina Teksten & tags |

## 2. Naar de Werkbank

| Onderdeel | Node-types | Nu | Wat moet er gebeuren |
| --- | --- | --- | --- |
| Crafting Station | `crafting_station_component` (+ recipes) | Visual Builder-rol | Knop "Maak Crafting Station", recipe kiezen of op het model slepen (zie beslispunt 2) |
| Pickup | `pickup_component`, `pickup_spawn` | Visual Builder-rol | Knop "Maak Pickup" (item op de grond) |
| Portal | `portal_component`, `zone_link` | Visual Builder-rol | Knop "Maak Portal" met de doelzone en het doelportal kiezen |
| Market Access | `marketplace_access_component` | Visual Builder-rol | Knop "Maak Market Access" |
| Losse interactable | `interactable` | Alleen nodes | Eerst nagaan wat de game leest, daarna een objectactie |
| Overige componenten | `lootable_component`, `destructible_component`, `nameplate_component`, `faction_component`, `combatant_component` | Alleen nodes | Eerst nagaan wat de game leest, daarna objectacties |
| Spawns | `enemy_spawn_point`, `enemy_spawn_area`, `resource_spawn`, `spawn_set`, `spawn_controller`, `encounter_controller`, `path_behavior_profile` | Alleen nodes | "Maak spawngebied": tekenen in de wereld, plus wie, hoeveel en respawntijd |
| Verspreiden | `bounded_area_scatter` | Object-route/nodes | Wereldtool: gebied tekenen en modellen kiezen |
| Contentcategorieën | `faction_definition`, `reputation_track`, `entity_variant`, `item_modifier_definition`, `equipment_slot_definition`, `damage_type_definition`, `status_effect_definition`, `ability_rank`, `combat_profile`, `ai_behavior_profile`, `difficulty_profile`, `respawn_policy_definition` | Catalog-hub/nodes | Categorieën toevoegen, alleen voor wat de game gebruikt |
| Presentatie | `animation_set`, `music_track`, `music_playlist`, `audio_event`, `vfx_definition` | Alleen nodes | Categorieën toevoegen zodra de game ze afspeelt |
| Campagnestructuur | `campaign_definition`, `chapter_definition` | Alleen nodes | Binnen de Quest-categorie: Campagne en hoofdstukken |
| Stat Curves bewerken | `stat_curve` | Alleen bekijken | Editor voor curvepunten zodra de game curves leest |
| Quest-extra's | `quest_marker_rule`, `quest_complete`, `condition_group`, `action_sequence`, `dialogue_action` | Alleen nodes | Per stuk, pas na een runtimecheck |

## 3. Al in de Werkbank (W1–W3)

`model_entity` (plaatsen), `entity_assembly` en `interaction_component` (automatisch), `enemy_component`, `resource_component`, `npc_component`, `vendor_component` en `quest_target_binding`.

Definities: `item_definition`, `currency_definition`, `resource_definition`, `recipe_definition` + `recipe_ingredient`, `vendor_catalog` + `vendor_offer`, `loot_table` + drie entrytypes, `enemy_archetype`, `npc_archetype`, `ability_definition`, `stat_definition`, `stat_block` en `stat_curve` (bekijken).

Quests en dialogen: `quest_definition`, `quest_step`, de vier objectives, `condition_player_level`, `condition_has_item`, vijf actions, `reward_bundle`, `dialogue_definition`, `dialogue_entry`, `dialogue_choice` en `dialogue_terminal`.

## 4. Automatisch (nooit zichtbaar)

`game_output`, `world_assembly`, `group`, `group_input`, `group_output`, `graph_frame`, `catalog_output`, `catalog_registry`, `campaign_output`, `campaign_registry`, `zone_output`, `zone_registry`, `area_output`, `player_rules_output`, `ui_output` en `legacy_world_adapter`.

Elke Werkbank- en Instellingen-actie maakt en verbindt deze zelf, zoals de Werkbank nu al doet bij Catalog- en Campaign Output. Een Group heet voor de gebruiker "Collectie", "Campagne" of "Zone".

## 5. Toekomst (niet aanbieden zolang de game ze niet gebruikt)

`schedule_component`, `curve_lookup`, `event_trigger` en `dialogue_router`. Het schema noemt deze zelf "future-safe" of "placeholder".

## 6. Voorwaarden om Nodes echt legacy te maken

1. **Actieve zone zonder Nodes.** Plaatsen in de Werkbank volgt nu de "open group" (`currentGroupId`) van de Nodes-tab. Werkbank en Instellingen hebben een zonekeuze nodig, of de editor volgt de camera.
2. **Collecties zonder Nodes.** Catalog-, Campaign-, Player Rules- en UI-groepen moet je kunnen maken, hernoemen en verwijderen als "Collectie".
3. **Repareren zonder "Meer nodes".** Validatiefouten als leesbare lijst met uitleg en een Repareer-knop.
4. **Publiceren in elke tab.** Save Draft, Save To Game en de controlelijst moeten in elke tab zichtbaar en leesbaar zijn.
5. **Overgang.** De Nodes-tab wordt eerst alleen-lezen met het label "Legacy" en daarna verborgen achter een ontwikkelaarsschakelaar. Pas verwijderen als alle tabellen hierboven af zijn.

## 7. Ontwerp Instellingen-tab

Dezelfde opbouw als de Werkbank: links navigatie, in het midden formulieren, en rechts de live viewport bij zonepagina's. Resizers en maten werken zoals in de Werkbank.

```
 Nodes (legacy) | Werkbank | Instellingen
┌──────────────────┬─────────────────────────────┬──────────────────┐
│ Project          │ Zone: Woestijn           ▾  │                  │
│ Zones            │ Basis · Grond · Licht ·     │   3D-viewport    │
│   [zonekaart]    │ Regels · Punten · Gebieden  │   (live: grond,  │
│   Woestijn  ●    │ · Kaart · Verbindingen      │   licht, punten, │
│   Oase           │ ┌ Grond ──────────────────┐ │   gebieden)      │
│   + Nieuwe zone  │ │ Grootte    [ 200 ]      │ │                  │
│ Speler           │ │ Textuur    [▣ Zand    ] │ │                  │
│ Economie         │ └─────────────────────────┘ │                  │
│ Interface        │ ┌ Licht & sfeer ──────────┐ │                  │
│ Besturing        │ │ Zon    richting, kleur  │ │                  │
│ Teksten & tags   │ │ Mist   aan, dichtheid   │ │                  │
│ Publiceren (2 !) │ └─────────────────────────┘ │                  │
└──────────────────┴─────────────────────────────┴──────────────────┘
```

**Navigatie**

- **Project**: Wereld, Laden & prestaties, Raster, Camera, Netwerk.
- **Zones**: zonekaart en zonelijst. Per zone de tabs Basis · Grond · Licht & sfeer · Regels · Punten · Gebieden · Kaart & minimap · Verbindingen.
- **Speler**: Personage, Progressie & XP, Inventaris & uitrusting, Abilities, Dood & respawn, Unstuck.
- **Economie**: Vendors, Crafting, Handel, Markt, Post, Party & loot, Belasting.
- **Interface**: alle HUD-onderdelen en menu's, met aan/uit, plek en preview.
- **Besturing**: toetsen.
- **Teksten & tags**: vertalingen, tekstsjablonen, tags.
- **Publiceren**: het aantal problemen, een leesbare lijst met Repareer, Save Draft en Save To Game.

**Regels per pagina** (gelijk aan de Werkbank)

- Menselijke namen met semantische hulp (`semantic-field-help.js`), zonder ID's of JSON.
- "Nog niet actief in de game" bij velden die de runtime niet leest.
- Elke wijziging is één Undo-stap via de bestaande graphmutaties.
- Outputs, registries en poorten worden automatisch verbonden.
- Bij Project, Speler en Interface wordt de viewport kleiner of toont hij een HUD-preview.

## 8. Fasering

| Fase | Inhoud |
| --- | --- |
| **I1** | Instellingen-tab en navigatie; Zones (route Wereld/Zone verhuizen, plus zonekaart); actieve zone voor de Werkbank; Grond; Licht & sfeer; Minimap |
| **I2** | Speler, Economie, Interface (route Game-instellingen/UI verhuizen, plus de ontbrekende types) en Besturing |
| **I3** | Project, Camera, Netwerk; Punten en Gebieden (plaatsen/tekenen in de wereld); Kaart & markers; Teksten & tags |
| **W4** | Werkbank-objectrollen Crafting Station, Pickup, Portal en Market Access; spawngebieden; verspreiden |
| **W5** | Overige contentcategorieën en presentatie, zodra de game ze gebruikt |
| **L1** | Collecties zonder Nodes; repareren zonder Nodes; Nodes-tab eerst alleen-lezen, daarna verbergen |

Elke fase eindigt met één kinderlijk genummerde acceptatietest voor Kevin.

## 9. Vaste regels voor elke fase

- Werk via de bestaande graph, node-types, typed references, graphmutaties, Undo/Redo, compilers en publishflow. Maak geen tweede database, runtime of nepdata.
- Hergebruik bestaande routes: Authoring-routes, Visual Builder, Catalog-hub, timeline en Werkbank-patronen.
- Maak geen demo-, test- of Spiegel-content. Kevin maakt zelf alle acceptatiecontent.
- Labels zijn eerlijk: velden die de game niet leest heten "Nog niet actief in de game".
- Start geen eigen server en gebruik geen andere poort; Kevin test op localhost:3001.
- Alleen gerichte syntaxchecks en contracttests. Geen smoke, Playwright of brede npm-test.
- Wijzig `package-lock.json`, assets en databasecontent niet. Commit alleen als Kevin dat vraagt.

## 10. Beslispunten voor Kevin

1. **Terrein schilderen** (materiaalgebieden, paden, water): onder Instellingen › Zone › Grond (advies: alles over de grond op één plek), of als wereldtool in de Werkbank.
Kevin: dit moet in de Werkbank/Tools hier onder moet alles wat te maken heeft met de line points.
Nog beter zones er uit en 1 zone en dan elke keer een grond gebied er bij teken. met een tool in Werkbank/Tools. en dan zones wel met line points een dorp afzetten als je in die line point komt krijg je de dorp naam in de minimap midden in en minimap fog of ware helemaal wel bij het hele dorp ect... dit zijn allemaal mooie tools ook de Bounded area scatters echt alle point lines die er nu zijn walkebals ect...

2. **Crafting Station op hetzelfde model als NPC/Vendor**: mag dat? De Visual Builder vervangt die rol nu. 
Kevin: dit mag gewoon op de NPC op het zelfde model.
3. **Camera**: één instelling voor het hele project, of per zone?
Kevin: ik wil van de zones af het moet langzaam groter getekend worden, dus 1 gebied/zone.
4. **Nodes-tab**: wanneer wordt hij alleen-lezen, en wanneer verborgen?
Kevin: Eigenlijk direct legacy dan weten we wat er kapot is en kunnen we dit maken. ook dat De werkbank false onderliggende code heeft dat dan nog via de nodes werkte kom je dan achter.
5. **Teksten, tags en waarden**: in I3, of pas als de game ze echt gebruikt?
Kevin: ik weet niet waar voor dit diend en waar het voor nodig zal zijn. of hebben we dit nodig?

6. **Switch tussen game en editor view** dat ik niet op een appart scherm elke keer hoef in te loggen en meerder tabs heb open staan. is ook lichter de swits ander heb ik en de editor en de game open staan dat vercht meer van de laptop.
