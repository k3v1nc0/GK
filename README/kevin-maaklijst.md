# Kevin-maaklijst - Wat jij per fase moet maken, kiezen of samen uitwerken

Dit bestand is jouw eigen checklist. Alles wat hier staat, moet jij maken, kiezen of samen met de AI uitwerken voordat de bijbehorende fase echt gestart wordt.

## Hoofdregel

GK Code Copiloot bouwt systemen. Kevin levert of keurt de definitieve gamecontent.

Dat betekent:

- Als er een boss nodig is, maak of kies jij de boss `.glb`.
- Als er een NPC nodig is, kies jij welke bestaande GLB daarvoor gebruikt wordt of maak jij die.
- Als er inventory iconen nodig zijn, maak of kies jij die UI plaatjes.
- Als er een scroll leesbaar moet zijn, maak of kies jij de scroll achtergrond en tekst.
- Als er audio nodig is, maak of kies jij sfeer, NPC, UI, combat of muziek audio.
- Als er camera, licht, minimap, geld, level, merchant of NPC-routes nodig zijn, beslis jij de gewenste waardes of we verzinnen ze samen voordat de fase start.
- Als procedural generation output wordt gebaked, keur jij/editor later expliciet goed welke generated candidates echte editor/node-data mogen worden.
- Als iets ontbreekt, moet de AI stoppen en melden wat mist.

## Asset mappen op de server

Aanbevolen structuur onder `/var/www/gk/assets`:

```text
/var/www/gk/assets/
  glb/
    characters/
    npcs/
    enemies/
    bosses/
    props/
    environment/
    loot/
    vfx/
  ui/
    inventory/
    abilities/
    dialogue/
    scrolls/
    quest/
    hud/
    minimap/
    merchant/
    boss/
  audio/
    ambient/
    music/
    npc/
    footsteps/
    combat/
    ui/
    merchant/
    boss/
```

## Automatische bibliotheek regel

Als jij iets in assets zet, moet de editor het automatisch kunnen tonen na scan/watcher update:

- `.glb` als 3D asset
- `.png`, `.webp`, `.svg`, `.jpg` als UI asset
- `.ogg`, `.mp3`, `.wav` als audio asset

Elke GLB moet als object en als NPC-kandidaat gebruikt kunnen worden. De editor mag waarschuwen bij schaal, animaties of performance, maar de asset mag niet verdwijnen.

## Procedural generation regel

Fase 8.1 bouwt procedural generation als engine-capability, niet als contentbeslisser.

Kevin hoeft voor Fase 8.1 geen concrete dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps aan te leveren. Die mogen ook niet door AI worden verzonnen.

Wat later wel door Kevin/editor gekozen of goedgekeurd moet worden:

- welke generated zones of layouts als editor-data worden gebruikt;
- welke generated spawn areas blijven, worden aangepast of worden afgewezen;
- welke generated path networks mogen dienen als basis voor NPC/player/world nodes;
- welke generated resource distributions alleen candidate blijven of later content worden;
- welke generated entity placements echt worden gebruikt in publish-data.

Zelfde seed + graph + inputs moet dezelfde generated draft output geven. Preview en bake publiceren niets naar Runtime Game.

## Minimale GLB rollen voor eerste speelbare versie

| Rol | Nodig vanaf fase | Jij moet maken of kiezen |
|---|---:|---|
| player_model | 7 | Speler character GLB |
| questgiver_npc | 13 | NPC die beginquest geeft |
| friendly_npc | 13 | NPC voor uitleg of side quest |
| merchant_npc | 15 | NPC die spullen verkoopt |
| enemy_minion | 16 | Kleine vijand |
| boss_model | 16 | Eindbaas GLB |
| ground_or_terrain | 9 | Vloer, terrain of startgebied basis, eventueel gekozen uit Fase 8.1/Fase 9 draft candidates |
| gate_or_portal | 17 | Poort, deur of ingang naar boss |
| quest_object | 17 | Object voor quest objective |
| loot_chest_or_drop | 16 | Loot chest/drop GLB |
| village_prop_set | 17 | Props voor sfeer |

## Minimale UI assets

| UI asset | Nodig vanaf fase | Jij moet maken of kiezen |
|---|---:|---|
| dialogue_panel | 13 | Dialoog achtergrond |
| quest_tracker_panel | 14 | Quest tracker |
| inventory_panel | 15 | Inventory scherm |
| inventory_slot | 15 | Inventory slot |
| merchant_panel | 15 | Merchant scherm |
| currency_icon | 15 | Geld icoon |
| item_icon_basic_reward | 15 | Reward item icoon |
| scroll_background | 15 | Leesbare scroll achtergrond |
| ability_attack_basic | 16 | Basis aanval icoon |
| ability_special | 16 | Speciale aanval icoon |
| boss_health_frame | 16 | Boss health UI |
| minimap_frame_editor | 9 | Editor minimap frame, als gewenst |
| minimap_frame_game | 10 | Game minimap frame, als gewenst |
| loot_popup_frame | 16 | Loot popup |

## Minimale audio assets

| Audio asset | Nodig vanaf fase | Jij moet maken of kiezen |
|---|---:|---|
| ambient_start_zone | 9 | Sfeer voor startgebied |
| music_start_zone | 10 | Rustige muziekloop |
| npc_greeting | 13 | NPC begroeting of korte sound |
| npc_work_sound | 13 | Geluid bij NPC taak, bijvoorbeeld smid/merchant |
| footsteps_default | 10 | Voetstappen basis |
| ui_click | 10 | UI klik sound |
| quest_accept | 14 | Quest accepted sound |
| item_pickup | 15 | Item pickup sound |
| merchant_open | 15 | Merchant open sound |
| basic_attack | 16 | Basis attack sound |
| boss_music | 16 | Boss muziek |
| boss_attack | 16 | Boss attack sound |
| loot_drop | 16 | Loot drop sound |

## Verhaal, namen en keuzes

Voor fase 17 moet dit definitief zijn:

- Game naam
- Startgebied naam
- Naam questgever NPC
- Naam friendly NPC
- Naam merchant NPC
- Naam enemy minion
- Naam boss
- Naam eerste quest
- Naam eerste side quest
- Naam currency/geld
- Naam eerste reward item
- Naam eerste weapon/ability
- Naam eerste readable scroll
- Waarom de speler begint
- Waarom de boss verslagen moet worden
- Wat de reward betekent
- Wat de side quest toevoegt aan de wereld

## World, camera, lighting en minimap keuzes

Voor fase 9 en 10 moet jij kiezen, goedkeuren of samen uitwerken:

- welke Fase 8.1 generated zones/spawn areas/path networks/resource distributions/entity placements als draftbasis mogen dienen
- camera stijl: third-person, MMO camera, top-down, isometric of hybrid
- camera afstand, hoogte, zoom limits en smoothing
- startgebied licht: zonkleur, intensiteit, ambient, fog, sky kleur
- dag/nacht wel of niet in eerste versie
- minimap vorm: rond, vierkant of dockable panel
- minimap zoom
- verschil editor minimap en game minimap:
  - editor toont node/debug/selection layers
  - game toont alleen speler, party, quest markers en ontdekte gebieden
- welke layers zichtbaar zijn per mode

Alle concrete waarden blijven editor/node-data en mogen niet in runtimecode worden ingevuld.

## Levels, geld en merchants

Voor fase 15 moet jij kiezen of samen uitwerken:

- currency naam en icoon
- startgeld
- item prijzen
- merchant stock
- merchant buy/sell regels
- player level curve of voorlopig level 1 t/m 5
- enemy levels
- boss level
- XP reward waardes
- loot drop kansen

Generated resource distributions uit Fase 8.1 kunnen later helpen als draft/candidate input, maar mogen geen economywaarden of lootkansen verzinnen.

## NPC taken en routes

Voor fase 13 moet jij kiezen of samen uitwerken:

- welke NPC staat stil
- welke NPC loopt rond
- welke NPC heeft werkplek
- welke NPC heeft merchant taak
- welke NPC heeft patrouille
- welke NPC maakt geluid bij taak
- dag/nacht schema, als gebruikt
- spawn gebied voor wilde NPC/enemy groepen
- respawn timing

Generated path networks en spawn areas uit Fase 8.1/Fase 9 kunnen als draft/candidate input dienen, maar Kevin/editor kiest later wat echt wordt gebruikt.
