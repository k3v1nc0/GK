# GK Werkbank-plan: Fase 1 t/m 5

**Status:** ACTIEF. Kevin gaf akkoord op 26-10-2026. Dit is het **enige actieve plan**.
Het oude MMORPG-basis v2.3-plan (`README/fases/MMORPG-basis-v2/`) is gesloten: F1 t/m F4 zijn af, het F5-werk gaat hierin op, en F6/F7 komen pas na dit plan terug.
Rapport van de serverinventaris: `evidence/INVENTARIS-SERVER.md` (staat op de server; de prompt ervoor staat in `CLI-INVENTARIS-PROMPT.md`).

---

## 0. De afspraak (staat boven alles)

**Eén lijn (Kevin 26-10): Code → Werkbank → Game.** De code levert alleen de systemen (lopen, vechten, oogsten, tekenen). De Werkbank (en Instellingen) maakt alle inhoud. De game speelt wat gepubliceerd is. Alles wat daar niet in past (nodes, Canoniek, oude bouwrondes, losse scripts die content in de database zetten) gaat weg, zie §8.

**Hoofdregel (Kevin): zo kinderlijk simpel mogelijk.** Iconen, relaties en slepen in de viewport. Kan iets met een icoon of door te slepen, dan geen tekstveld of lijst. Tekst alleen voor namen en een paar getallen.

1. Bovenin de editor staan alleen nog twee tabs: **Werkbank | Instellingen**. Beide met dezelfde look: iconen, sliders, kaarten, slepen, zo min mogelijk tekst.
2. **Werkbank** = alles wat een plek in de wereld heeft (mesh, punt, lijn, vlak) of in een keten hoort (Relaties). Klik in de 3D-view, het paneel Werkbank toont alleen de paar waarden die je mag veranderen (wachttijd, mesh, rol NPC/quest/oppakken/vendor/muziek...). Relaties toont de ketting.
3. **Instellingen** = regels voor het hele spel die je niet kunt aanwijzen in de wereld (camera, licht, toetsen, HUD, spelregels). Met een live voorbeeld ernaast.
4. **Geen nodes.** De Werkbank schrijft naar de nieuwe opslag (authoring-documenten + builds, de techniek van Canoniek), nooit meer naar de node-graph. De Nodes-tab en `canoniek.html` verdwijnen.
5. **Niets gaat verloren.** Elke instelling die nu in een node kan, staat in lijst A, B of C hieronder. Een fase is pas klaar als zijn regels in die lijst afgevinkt zijn.
6. **Eén wereld, chunks.** Geen losse zones (start, test...). Gebieden maak je met point lines.
7. **De game blijft soepel.** Na elke fase meten met dezelfde scene als nu (`scripts/perf-game.js`); trager dan de meting van vóór de fase = NO-GO. Doelmachine: Kevins oude laptop (Pentium 4417U).
8. **Server beslist** (positie, hoogte, loot, quest, geld). **Geen hardcoded content**: alles komt uit de Werkbank/Instellingen.
9. **Realtime:** een wijziging is meteen zichtbaar in de editor-view. In de game pas na Publiceren.
10. **Niet afwijken.** Wil een agent iets anders bouwen dan hier staat, dan eerst Kevin vragen. Een fase die een losse pagina of node bouwt, wordt afgekeurd.

---

## 0b. Vaste werkwijze: het bouwrecept (Kevin 26-10)

Elke nieuwe mogelijkheid, nu en later, wordt op **precies deze manier** gebouwd. Zo kan alles wat de code kan vanzelf in de Werkbank beheerd worden, en hoeft er nooit meer een los scherm, node of omweg te komen.

1. **Systeem in de code.** Bijvoorbeeld "een NPC kan een deur openen". De server beslist. Er zit geen inhoud in de code: geen namen, getallen of posities.
2. **Eén beschrijving in het schema.** Elke soort (deur, vijand, gebied, camera...) staat op één plek: `src/shared/authoring/kinds.js`. Hetzelfde patroon bestaat al voor items en pickups. Per veld staat erbij:
   - soort, eenheid, standaard, min en max;
   - **icoon**;
   - **bediening**: slider, aan/uit, kleur, asset-vak (sleep een model of geluid erop), verwijzing-vak (sleep een andere kaart erop), of punt, lijn of vlak in de viewport;
   - **plek**: Werkbank-paneel, Instellingen-kaart of alleen Relaties;
   - wie het mag weten: alleen de server, of ook de game.
3. **Werkbank en Instellingen tekenen het vanzelf.** Er komt geen eigen scherm per functie. Uit het schema komen vanzelf de iconen, sliders en sleep-vakken. Een verwijzing wordt vanzelf een relatielijntje in Relaties.
4. **Build → game.** De compiler zet het in de build. De game leest alleen de build.
5. **Realtime in de editor.** De editor-view gebruikt dezelfde code als de game. Een wijziging is dus meteen te zien.
6. **Bewijs.** Een test controleert automatisch dat elk veld een icoon, plek en standaard heeft. Daarnaast een build-test en één korte handtest.
7. **Opruimen.** Wat erdoor vervangen is, gaat weg (§8).

8. **Sliders.** Elk getal krijgt in het schema een min, max en stap. Daarmee wordt het vanzelf een slider met een getalvakje ernaast (zoals "Omgevinglicht 65%"). Een getal zonder min en max mag niet: de schema-test keurt het af. Alleen ID's en namen blijven tekstvakken.
9. **Ⓘ-hulp per veld, gericht op oplossingen.** Elk veld heeft in het schema een korte hulptekst met drie regels:
   - **Waarvoor:** wat het doet in de game, in gewone taal;
   - **Goede waarden:** wat meestal goed werkt, met een voorbeeld (bijvoorbeeld "Zonsterkte 60 tot 90 %; boven 120 % wordt alles wit");
   - **Probleem → oplossing:** de meest voorkomende klacht en welke kant je de slider op schuift (bijvoorbeeld "Game hapert op de laptop → Schaduwen uit of Game chunks lager").
   Je ziet de hulp door op de Ⓘ te klikken, en kort als je met de muis over het veld gaat. De bestaande hulpteksten uit `semantic-field-help.js` worden hergebruikt en herschreven naar deze vorm. Een veld zonder hulp keurt de schema-test af.

**Niet toegestaan:** inhoud in de code, een losse pagina, een node, een veld zonder plek in het schema, of een game die iets anders leest dan de build.
**Enige uitzondering:** iets dat geen veld is maar een gereedschap, zoals het hoogtepenseel of land tekenen. Dat wordt een tool in de viewport, maar ook die schrijft naar een soort uit het schema.

## 0c. Zo ziet het eruit (ontwerp van Kevin, 26-10)

De ontwerpplaatjes staan in de map `ontwerp/` (`werkbank.jpg`, `instellingen.jpg`). Ze zijn het voorbeeld voor elke fase.

**Bovenbalk (altijd):** GK-logo · tabs **Instellingen | Werkbank** · groen bolletje (verbonden) · ↶ ↷ · "0 acties ongedaan" · **SAVE DRAFT** · **SAVE TO GAME** (= publiceren) · LOGOUT · FULLSCREEN.

**Werkbank-tab:**
- links het paneel **Werkbank**, met bovenaan "Verander in" en grote rol-knoppen met icoon: NPC, Vendor, Quest, Enemy, Dialoog, Resource (en later meer uit het schema). Daaronder alleen de paar velden van die rol, zoals naam, animatie, blokkeert speler en botsstraal;
- in het midden de **3D-view**, die op de game lijkt, met knoppen A, kubus, F en Ⓘ en het Move/Rot/Scale-blok met X, Y, Z, OK, Del en Esc;
- rechts de **Bibliotheek**: filterknoppen (Assets, Alles, NPC's, Items, Wereld, Props, Wapens, Voedsel), een zoekbalk en tegels met plaatjes. Je sleept een tegel de 3D-view in of op een relatievak;
- onderaan **Relaties**: de ketting als grote plaatjes met pijlen (wereldobject → dialoog → item). Een gestippeld vak betekent: sleep hier iets op.

**Instellingen-tab:**
- links het **Menu** met icoon per groep (Licht, Game chunks, Editor chunks, Netwerk, Keys, Audio, en de rest uit lijst B);
- in het midden **Instellingen**: sliders met een getal of percentage, kleurvak met pipet, vinkjes en een keuzelijst;
- rechts de **3D Preview**, die live meeverandert.

Alle panelen kun je breder of hoger maken en sluiten (↔ ↕ ✕), net als nu.

## 0d. De game-UI (ontwerp van Kevin, 26-10)

Voorbeeld: `ontwerp/game-ui.jpg`. **Eén ontwerp dat vanzelf past op desktop (liggend) én mobiel (staand).** Dit is geen tweede losse HUD.

- **Linksboven:** portret van je character met level-rondje, en levensbalk ❤️ en manabalk 💧 met getallen (87/140).
- **Onderaan:** drie grote rondjes voor aanvallen en vaardigheden (de hotbar), duimvriendelijk op mobiel.
- **Paneel Tas** (rechts op desktop, onderaan op mobiel):
  - links een rij iconen voor alle panelen: tas, uitrusting, vaardigheden, quests, kaart, geld, craften, verzamelen, groep, instellingen, uitloggen;
  - bovenaan filtertabs: alles, wapens, drankjes, planten, erts, sleutels;
  - een raster met vakjes en het aantal rechtsonder.
- **De plaatjes in de vakjes zijn de thumbnails van de 3D-modellen** (het brood is het brood-model). Ze worden automatisch gemaakt bij uploaden; een eigen icoon mag als je dat wilt.

### Eén tas-paneel in plaats van losse panelen (Kevin 26-10)
In de game staan nu te veel losse panelen. Dat is te moeilijk en past niet op een klein scherm. Daarom:
- **Altijd in beeld, en niet meer dan dit:** portret met level en levens- en manabalk linksboven, de drie vaardigheidsknoppen onderaan, de minimap als klein rondje (uit te zetten), korte meldingen die vanzelf verdwijnen, en de knop 🎒 om het tas-paneel te openen.
- **Al het andere zit in één tas-paneel met een icoontjesmenu, zonder woorden.**

| Icoon | Wordt (nu een los paneel) |
| --- | --- |
| 🎒 | tas (`inventory_hud`) |
| ⛑️ | uitrusting (`equipment_hud`) |
| 📖 | vaardigheden en hotbar indelen (`hotbar_hud`, loadout) |
| 📜 | quests (`quest_tracker_hud`); de actieve quest staat ook als één regel in beeld |
| 🗺️ | grote kaart |
| 🪙 | geld en gevolgde items (`wallet_hud`) |
| 🔨 | craften (`crafting_hud`) |
| 🌿 | verzamelen en grondstoffen |
| 👥 | groep (`party_hud`) |
| ✉️ | post (`mail_hud`) |
| ⚙️ | speler-instellingen (volume, grafiek, toetsen) |
| 🚪 | uitloggen |

- **Dichtklappen, in drie standen.** Je wisselt door op het handvat te tikken of te vegen:
  1. **dicht:** alleen de 🎒-knop, zodat je het meeste ziet;
  2. **smal:** alleen de icoonrij, dus één tik naar tas, quest of kaart;
  3. **open:** het hele paneel.

  Optie in Instellingen: het paneel klapt vanzelf naar *smal* zodra je gaat lopen of vechten.
- **Praten met een NPC: de praatstrook.** Een brede strook onderaan het scherm, boven de vaardigheidsknoppen. Links staat het gezicht van de NPC (de thumbnail van het model), dan de tekst, en daaronder grote keuzeknoppen. Boven de NPC staat een 💬, zodat je ziet met wie je praat. De camera zoomt iets naar de NPC toe. Het tas-paneel klapt zolang naar *smal*. Een losse tekstballon in de wereld is op een klein scherm slecht leesbaar, daarom deze strook. Later komt de chat ook in deze strook.
- **Vendor, forge of markt: het tas-paneel splitst.** Bovenin staat wat de NPC heeft (🛒 waren met prijs, 🔨 recepten, ⚖️ marktaanbod), met zijn gezicht en naam. Onderin staat je eigen tas.
  - **Kopen en verkopen** gaat door een vakje van boven naar onder te slepen, of andersom.
  - **Craften:** je tikt een recept aan. De ingrediënten krijgen een ✓ of ✗, en een grote 🔨-knop met een voortgangsbalk maakt het.
  - Op mobiel schuift het paneel half omhoog. Loop je weg, dan klapt het vanzelf terug.
  - Er komt dus geen extra paneel bij.
- Een icoon zonder inhoud verdwijnt vanzelf. Zonder groep zie je dus geen 👥.
- De XP-balk wordt een dun lijntje onder de levensbalk. Je ziet het level in het rondje.
- De debug-HUD's (prestatie, MMO) zijn alleen zichtbaar voor jouw maker-account.

**Richting voor alle standen (Kevin 26-10).** Dit is nog geen eindontwerp: de iconen en de precieze inhoud van elk paneel worden aan het begin van Fase 4 samen met Kevin ontworpen (welke iconen we echt nodig hebben, wat er per icoon in het paneel staat). Pas na zijn akkoord op dat ontwerp wordt het gebouwd. Plaatje: `ontwerp/game-ui-standen.jpg`. Liggend: dicht, smal (icoonrij rechts) en open. Staand: dicht, smal (icoonrij onder) en open (onderin). Daarnaast de praatstrook, vendor (boven waren met prijs, onder je tas) en crafting (ingrediënten met ✓, dan resultaat, dan een groene knop).

### UI-ontwerper in Instellingen → Game-UI
Hier stel je zelf in hoe de game-panelen eruitzien, met live voorbeeld en een knop 🖥️/📱 om te wisselen:
- **Iconen** van de panelen en tabs wijzigen: sleep een plaatje of model uit de Bibliotheek op het icoon.
- **Volgorde** door de iconen te verslepen. Een paneel aan of uit zetten gaat met een vinkje.
- **Lettertype** kiezen uit een paar game-lettertypes, met sliders voor grootte en dikte.
- **Opbouw in een paneel:** sliders voor het aantal kolommen, de vakgrootte en de tussenruimte; welke filtertabs er zijn; waar het paneel staat (rechts of onder, of automatisch).
- **Kleuren en stijl:** randkleur, gloed bij het gekozen vak, en doorzichtigheid.

Dit volgt het bouwrecept (§0b): elk paneel is een soort in het schema, met icoon, volgorde, lettertype en opbouw als velden. Nieuwe panelen krijgen deze instellingen dus vanzelf. Dezelfde instellingen voor de iconen, volgorde en het lettertype van de **editor-panelen** zelf komen in Instellingen → Editor.

**Fase:** de thumbnails komen in Fase 1. Het nieuwe tas-paneel met portret en hotbar, plus de UI-ontwerper, komen in Fase 4 (samen met de HUD live view). Ze vervangen de huidige HUD-modules en hun opgeslagen indeling (`game_hud_layout_defaults`). Je huidige plekken en maten worden overgenomen als startpunt.

## 1. Hoe het nu werkt (waarom alles nog via nodes gaat)

Er zijn nu twee systemen naast elkaar:

| | Oud: node-graph | Nieuw: documenten (Canoniek) |
| --- | --- | --- |
| Opslag | `graph-repository.js`, publish via `publish-service.js` | `authoring_documents` + builds in `storage/builds/` |
| Wie leest het in de game | `node03/04/05-runtime-service.js`, `game-project-compiler.js` | `runtime-overlay.js`, `actor-compiler.js`, `world-compiler.js` |
| Scherm | Nodes-tab **én de Werkbank-tab** | alleen `canoniek.html` |
| Soorten | 186 nodesoorten | 12 soorten: project, item, pickup, region, area, collider, ability, loot_table, resource_definition, resource_spawn, actor_archetype, actor_spawn |

**De Werkbank is nu een mooi gezicht op de node-graph.** Elke opslag in de Werkbank (`workbenchPatchNode` in `editor.js`) schrijft gewoon een node. Daarom voelt het of "alles via de nodes gaat": dat klopt.

**Canoniek heeft de goede techniek maar het verkeerde scherm.** Het werk van F3/F4/F5 is dus niet voor niets: de opslag, builds, publiceren, rollback, regions/areas, colliders en vijanden blijven. Alleen het scherm verhuist naar de Werkbank.

### Waarom `node_resource_spawn_8f1f34c3` alleen in Nodes te bewerken is

- Dat is de **ID van een node** van soort `resource_spawn` in een zone-graph (de server maakt zulke ID's als `"node_" + soort + "_" + 8 tekens`, `graph-repository.js:756`).
- In de game maakt `node03-runtime-service.js` er grondstof-exemplaren van. Je kunt ze aanklikken, maar de Werkbank kan alleen **geplaatste GLB-modellen** (`model_entity`) selecteren (`editor.js:17073`). Een spawn-node is geen model, dus de Werkbank weet niet wat het is en je moet naar Nodes.
- Hetzelfde geldt voor `enemy_spawn_point`, `enemy_spawn_area`, `pickup_spawn`, `interactable`, `spawn_point`, `checkpoint`, `location_anchor`, `quest_target_binding`, `zone_link`, `blocker_area`, `walkable_surface` en `area_definition`.
- **Oplossing (Fase 3):** alles wat in de wereld staat krijgt een document met een eigen pictogram in de 3D-view. Klikken = Werkbank-paneel open. De oude node wordt bij het verhuizen omgezet naar een document (met `legacyRef`, zodat je kunt zien waar het vandaan kwam) en is daarna in Nodes alleen-lezen.

---

## 2. Lijst A: naar de Werkbank (visueel)

Legenda: ✅ = bestaat al als document (Canoniek), 🟡 = bestaat al in de Werkbank maar via nodes, ⬜ = nog nergens zonder nodes.
Fase = in welke fase het verhuist.

### A1. Wereld en grond (Fase 2)

| Wat | Nu in node | Belangrijkste instellingen | Stand | Fase |
| --- | --- | --- | --- | --- |
| Grond/land tekenen met texture | `ground_surface`, `terrain_layer`, `surface_layer` | breedte/diepte, hoogte, kleur, texture + schaal, tweede texture + sterkte, randvervaging, vorm/punten, prioriteit, paden/water | 🟡 | 2 |
| **Hoogtes en laagtes** | (bestaat niet) | penseel omhoog/omlaag/glad/plat, grootte, sterkte | ⬜ nieuw | 2 |
| Chunks (raster) | `chunk_grid_definition` | chunkbreedte/-diepte, tegelgrootte, oorsprong, randgedrag | 🟡 | 2 (vast, zie B) |
| Begaanbaar vlak (brug, verhoging) | `walkable_surface` | x/y/z, breedte, diepte, draaiing, prioriteit | 🟡 | 2 |
| Obstakel / muur | `blocker_area` | vorm (rechthoek/cirkel/punten), reden | ✅ `collider` | 3 |
| Begroeiing / verspreide objecten | `bounded_area_scatter` (31 velden) | gebied, aantal, modellen, willekeurig, tussenruimte, patroon, grondkleur, randvervaging, botsing | 🟡 | 3 |

### A2. Gebieden via point lines (Fase 3)

| Wat | Nu in node | Belangrijkste instellingen | Stand |
| --- | --- | --- | --- |
| Gebied (vroeger zone) | `zone_definition` + `region` | naam, grens (punten), level min/max, tags, snel reizen, respawn | ✅ `region` (alleen rechthoek) → point line |
| Deelgebied | `area_definition` | naam, vorm/punten, prioriteit, level, kaart onthullen, fog onthullen | ✅ `area` |
| Muziek per gebied | `area_environment_override`, `zone_environment_settings`, `music_track`, `music_playlist` | track/afspeellijst, volume, fade in/uit, crossfade, loop, gevecht/dag/nacht-lijst | ✅ deels (`musicAssetId`) |
| Sfeer per gebied | idem | fog kleur/dichtheid, achtergrond, licht ×, weer, ambience | ⬜ |
| Spelregels per gebied | `safe_rule_area`, `zone_gameplay_rules` | veilig, gevecht/pvp/handel/markt/unstuck/mount/respawn toegestaan, multipliers (vijand HP/schade, loot, xp, grondstof) | ✅ deels (`safe`) |
| Ontdekken | `discovery_area` | kaart onthullen, xp, melding, 1× per character | ⬜ |
| Kaartmarkering | `map_marker_definition`, `marker_visibility_rule` | icoon, minimap/wereldkaart/kompas, afstand, grootte | ⬜ |

### A3. Dingen die in de wereld staan (Fase 3)

| Wat | Nu in node | Belangrijkste instellingen | Stand |
| --- | --- | --- | --- |
| Geplaatst model | `model_entity` | model, x/y/z, draaiing, schaal, solide, begaanbaar, botsstraal, animaties idle/walk/run, minimapcategorie | 🟡 |
| Pickup | `pickup_spawn`, `pickup_component` | item of geld, aantal/min/max, respawnbeleid, eigendom, geluid/effect | ✅ `pickup` (item), ⬜ geld |
| Grondstof plaatsen | `resource_spawn`, `resource_component` | grondstof, aantal, straal, tussenruimte, verdeling, respawn, opbrengst × | ✅ `resource_spawn` |
| Vijand plaatsen | `enemy_spawn_point`, `enemy_spawn_area`, `enemy_component` | vijand, variant, moeilijkheid, level, aantal min/max, max levend, pad, activatieafstand, respawn | ✅ `actor_spawn` |
| NPC plaatsen | `npc_component`, `nameplate_component`, `schedule_component` | NPC, variant, level, naambord (level/HP/factie/questicoon), dagschema | 🟡 |
| Vendor / werkbank / markt | `vendor_component`, `crafting_station_component`, `marketplace_access_component` | catalogus/recepten, tekst, afstand | 🟡 |
| Interactie / teleport | `interactable`, `interaction_component` | tekst, straal, model, actie (bericht/teleport x,z) | 🟡 |
| Portal (wordt teleport binnen 1 wereld) | `portal_component`, `zone_link` | doelpunt, tekst, afstand, automatisch, één/twee kanten | 🟡 |
| Lootkist / breekbaar | `lootable_component`, `destructible_component` | loottabel, eenmalig, respawn | ⬜ |
| Startpunt speler / respawnpunt | `player_spawn`, `spawn_point` | x/z, kijkrichting, veilige straal, op grond zetten, rol | 🟡 |
| Checkpoint | `checkpoint` | activatie, opslaan, respawn, snel reizen, genezen | ⬜ |
| Ankerpunt / questdoel | `location_anchor`, `quest_target_binding` | positie, vorm, zichtbaar in editor/game, actie, tekst | 🟡 |
| Spawngroep | `spawn_set`, `spawn_controller`, `encounter_controller` | max levend totaal, activatie, slapen buiten bereik, golven | ⬜ |

### A4. Definities en ketens (kaarten in de Bibliotheek + Relaties) (Fase 4)

Deze hebben geen vaste plek in de wereld maar zitten in een ketting (vijand → loot → item → vendor). Ze worden kaarten met icoon in de Bibliotheek; slepen = koppelen; Relaties toont de ketting.

| Kaart | Nu in node | Stand |
| --- | --- | --- |
| Item | `item_definition` (31 velden), `item_modifier_definition` | ✅ (16 velden; rest erbij in F4) |
| Vijand | `enemy_archetype` (28), `entity_variant`, `combat_profile`, `ai_behavior_profile`, `difficulty_profile` | ✅ `actor_archetype` deels |
| NPC | `npc_archetype` | 🟡 |
| Grondstof | `resource_definition` (24) | ✅ |
| Loottabel | `loot_table`, `loot_item_entry`, `loot_currency_entry`, `loot_table_entry` | ✅ |
| Aanval / vaardigheid | `ability_definition` (35), `ability_rank` | ✅ deels |
| Statuseffect | `status_effect_definition` | ⬜ |
| Recept | `recipe_definition`, `recipe_ingredient` | 🟡 |
| Vendorcatalogus | `vendor_catalog`, `vendor_offer` | 🟡 |
| Valuta | `currency_definition` | 🟡 |
| Stats | `stat_definition`, `stat_block`, `stat_curve` | 🟡 |
| Factie / reputatie | `faction_definition`, `faction_component`, `reputation_track` | ⬜ |
| Schadesoort | `damage_type_definition` | ⬜ |
| Respawnbeleid | `respawn_policy_definition` (wachttijd min/max, max levend, lijk-duur, eenmalig) | 🟡 (alleen kiezen) |
| Quest | `quest_definition`, `quest_step`, `objective_talk/collect/deliver/reach`, `quest_complete`, `quest_marker_rule` | 🟡 (Questtimeline) |
| Voorwaarden/acties/beloning | `condition_*`, `action_*`, `reward_bundle`, `event_trigger` | 🟡 |
| Dialoog | `dialogue_definition`, `dialogue_entry`, `dialogue_choice`, `dialogue_action`, `dialogue_router`, `dialogue_terminal` | 🟡 (Dialoogtimeline) |
| Campagne / hoofdstuk | `campaign_definition`, `chapter_definition` | 🟡 |
| Speelbaar character | `playable_character_definition`, `player_character` | 🟡 |
| Animatieset | `animation_set` | 🟡 (Preview animations) |
| Geluid / effect | `audio_event`, `vfx_definition` | ⬜ |

### A5. Uit de Tools/Authoring-pagina (moet mee)

| Wat | Waar nu | Naar |
| --- | --- | --- |
| Routes "Wereld / Zone", "Object of personage", "Quest / Dialoog", "Catalog / Definities", "Game-instellingen / UI" | Tools → Authoring (`authoring-contract.js`) | vervalt als menu; wordt de icoonbalk van de Werkbank (Wereld, Objecten, Verhalen, Bibliotheek) en de Instellingen-tab |
| Visual Builder (rol geven aan model: NPC, vijand, grondstof, pickup, portal, vendor, crafting, markt, questdoel) | Tools | Werkbank-paneel: rol-iconen boven het geselecteerde model |
| Questtimeline, Dialoogtimeline | Tools | Werkbank → Verhalen (kaarten op een tijdlijn, slepen) |
| Bouw-overzicht, Validation | Tools | Werkbank: waarschuwings-icoontjes op kaarten + één lijst bij Publiceren |
| Minimap bake | Tools | Automatisch bij Publiceren; knop in Instellingen → Minimap |
| Asset-bibliotheek (upload, sorteren, vervangen, "waar gebruikt") | Assets-paneel | blijft, wordt Bibliotheek-paneel van de Werkbank |
| Toets vastleggen ("Druk toets...") | Inspector | Instellingen → Besturing |
| Snap (uit/raster/grond), verplaatsen/draaien/schalen, point-edit (punten toevoegen, extruden, box select), dupliceren, focus | 3D-view | blijft in de Werkbank-view |
| Contentoverzicht, Wereld-overzicht | Werkbank | blijft |
| Publiceren, builds, rollback | Canoniek + Werkbank | Werkbank: één knop Publiceren met icoon; rollback in Instellingen → Builds |

### A6. Uit Canoniek (moet mee, techniek blijft)

Project, Items (alle velden), Pickups 2D/3D, Wereld (regions/areas/colliders overnemen, preview), Vijanden (aanval, loottabel, grondstof, vijand, plaatsen), Publiceren (build, rollback, geschiedenis), verhuizen uit Nodes per domein. **Alles verhuist in Fase 1.**

---

## 3. Lijst B: naar Instellingen (niet visueel, met live voorbeeld)

Elke groep is een kaart met sliders. Rechts een live voorbeeld (de echte game-view of de HUD).

| Groep | Nu in node | Instellingen | Live voorbeeld |
| --- | --- | --- | --- |
| **Project** | `game_project_settings`, project (Canoniek) | gamenaam, taal, motd, startpunt, contentversie, standaard spelersaanval | – |
| **Game-camera** | `game_camera` | pitch, yaw, start-/min-/max-zoom, FOV, doelhoogte, volgen, draaisnelheid | game-view |
| **Editor-camera** | `editor_camera` | idem + doel x/y/z | editor-view |
| **Licht** | `ambient_light`, `directional_light` | kleur, sterkte, richting zon (x/y/z) | game-view |
| **Lucht en fog** | `world_settings` | achtergrond, fog kleur/dichtheid, smooth shading | game-view |
| **Grafiek game** | `game_world_settings` (19) | preset (geen..extreem schaduw), pixelratio min/max, AA, fog aan, max FPS, schaduw (map, camera, snap, focus) | game-view + FPS |
| **Grafiek editor** | `editor_world_settings` (18) | idem voor de editor | editor-view + FPS |
| **Chunks laden** | `game_chunk_loading`, `editor_chunk_loading`, `chunk_grid_definition` | chunkmaat, preload/unload-marge, max geladen, budgetten (entities/objecten/scatter/bouwen per frame), kijkradius editor | chunkraster in view |
| **Netwerk** | `mmo_network_settings` (24) | preset, tick-/snapshot-/inputrate, interpolatie, voorspelling, correctie | debug-HUD |
| **Besturing** | `keybind` | per actie een toets (klik + druk toets) | toetsenbordplaatje |
| **HUD** | `ui_hud_text`, `hud_bar`, `hotbar_hud`, `xp_hud`, `interaction_hud`, `inventory_hud`, `equipment_hud`, `wallet_hud`, `quest_tracker_hud`, `dialogue_hud`, `notification_hud`, `death_respawn_hud`, `party_hud`, `vendor_hud`, `crafting_hud`, `trade_hud`, `market_hud`, `mail_hud`, `hud_layout`, `menu_layout` | per onderdeel aan/uit, plek (9 ankers, slepen), grootte, kleur, wat tonen; UI-schaal, safe area | **live HUD-view** (slepen op het scherm) |
| **Minimap** | `game_minimap_hud` (37), `editor_minimap_hud` (26), `minimap_bake` | plek, grootte, rand, fog of war, markercategorieën, bake-kwaliteit | minimap live |
| **Debug** | `debug_performance_hud` (41), `debug_mmo_hud` (42) | aan/uit, plek, welke regels | HUD live |
| **Speler** | `player_character`, `playable_character_definition` | loopsnelheid, sprint ×, draaisnelheid, botsstraal, schaal, naambord, startitems/-geld/-aanvallen | game-view |
| **Spelregels: groeien** | `player_progression_rules`, `xp_source_rule`, `stat_curve` (xp-curve) | max level, xp-curve, basisstats, level-up genezen | grafiekje |
| **Spelregels: tas/uitrusting** | `inventory_rules`, `equipment_rules`, `equipment_slot_definition`, `ability_loadout_rules` | vakken, gewicht, stapelen, slots, wisselen in gevecht | tas-HUD |
| **Spelregels: dood/unstuck** | `death_respawn_rules`, `unstuck_rules` | wachttijd, herstel %, verlies, cooldown | – |
| **Spelregels: samen/economie** | `party_rules`, `party_loot_policy`, `trade_policy`, `market_policy`, `mail_policy`, `vendor_policy`, `crafting_policy`, `economy_tax_rule` | groepsgrootte, lootverdeling, handel/markt/post aan, belasting | – |
| **Waarden en teksten** | `global_value_definition`, `constant_value`, `tag_definition`, `text_template`, `localization_entry`, `value_formula`, `curve_lookup` | vaste waarden, tags, teksten, vertalingen, formules | tekstvoorbeeld |
| **Builds** | (Canoniek) | geschiedenis, rollback | – |

---

## 4. Lijst C: verdwijnt, want het was alleen node-loodgieterij

Deze nodes bevatten geen spelinstelling, alleen "draadjes". Ze worden automatisch: de build zet alles zelf in elkaar.

`game_output`, `world_assembly`, `zone_output`, `area_output`, `catalog_output`, `catalog_registry`, `zone_registry`, `campaign_registry`, `campaign_output`, `player_rules_output`, `ui_output`, `legacy_world_adapter`, `group_input`, `group_output`.

**Let op, niet zomaar weg (uit de serverinventaris):**
- `group` (13 op de server): de groepnamen zoals "NODE-05 Economy Catalog" en "Catalog" zijn nu de **collecties** in de Werkbank-bibliotheek. Ze worden mappen met een icoon. De velden `zoneGridX/zoneGridZ` en zone-origins zeggen waar elke zone ligt; die zijn nodig om de zones in Fase 2 tot één wereld samen te voegen.
- `graph_frame` (14 op de server): dit zijn jouw eigen notities (titel + tekst). Ze gaan als notitie mee in het verhuisrapport, zodat je ze terug kunt lezen.
- `entity_assembly` (20): naam en tags gaan mee op het object zelf.

Velden die toch iets betekenen gaan mee: `publishTarget`, `packageVersion`/`contentVersion` (→ build-versie), `includeEditorDiagnostics` (→ Instellingen → Debug), `duplicatePolicy`/`missingOptionalPolicy` (→ validatie bij Publiceren), `entityTags`/`label` (→ op het object zelf).

**Controle:** 186 nodesoorten = A + B + C. Vóór Fase 5 draait een script dat elke nodesoort en elk veld afvinkt tegen deze lijst, **ook de verborgen velden** (bijvoorbeeld `cameraOnly`, `cameraOffsetZChunks`, `fixedCameraPaddingTiles`, `loadBudgetPerFrame` in Chunks laden, en de gebakken minimapvelden). Het script draait op de echte serverdata, niet alleen op de code. Eén veld zonder plek = Fase 5 niet klaar.

---

## 5. Wat er volgens mij nog mist (meegedacht)

1. **Ctrl+Z houden zoals hij nu is.** De huidige Ctrl+Z werkt goed, maar loopt via de node-geschiedenis. Hij moet precies zo blijven werken als de Werkbank naar documenten schrijft (vanaf Fase 1). Geen nieuwe undo-functie, alleen dezelfde overzetten.
2. **Concept vs. gepubliceerd** duidelijk zichtbaar (stipje op elk gewijzigd object, teller op Publiceren).
3. **Kopiëren/plakken en stempels:** een ingerichte vijand of boom als sjabloon opslaan en neerzetten.
4. **Zoeken** in wereld en bibliotheek (op naam, icoon-filter).
5. **Spelen in de editor** (de PlayPreview uit F4 afmaken): knop ▶, je loopt rond met dezelfde camera/HUD als de game, zonder te publiceren.
6. **Editor-view = game-view:** zelfde renderer, licht, fog, schaduw, texture, HUD-overlay aan/uit. Editor-hulpjes (rasters, iconen) los aan/uit.
7. **Heightmap ook op de server:** de server moet dezelfde hoogte gebruiken (loopkernel `movement-kernel.js`), anders zweven spelers of zakken ze weg. Dit is het grootste technische risico van Fase 2.
8. **Paden en water** tekenen (bestaat in `surface_layer`) met hetzelfde penseel.
9. **Dag/nacht** (er is `world-clock.js`, nodes noemen dag/nacht-afspeellijsten): in Instellingen → Licht.
10. **Verhuisrapport** bij elke verhuizing uit Nodes (zoals F3), zodat er echt niets verloren gaat. Backups regelt Kevin zelf (NAS thuis via ssh vanaf de server); de agents bouwen daar niets voor.
11. **Prestatiebewaking in de editor:** FPS + chunkteller altijd klein in beeld, waarschuwing als een chunk te vol wordt.
12. **Iconenset:** één vaste set (SVG) voor alle rollen en kaarten, zodat het overal hetzelfde is.

---

## 6. Fase 1 t/m 5

> **Let op (26-10):** de volgorde en werkwijze van §13 (ombouw per onderdeel, Area tool, grond leeg beginnen, geen hardcoded inhoud) gaan boven deze fases.

Elke fase eindigt met: één commit op main ("Werkbank Fase N"), de lijst-regels afgevinkt, perf-meting niet slechter, **de opruimregels uit §8 voor die fase gedaan (laadgrootte niet groter)**, en een korte handtest die Kevin zelf filmt.

### Fase 1 — Werkbank | Instellingen, Canoniek weg

**Doel:** de bovenbalk wordt `Werkbank | Instellingen`; alles uit Canoniek zit in de Werkbank; de Instellingen-tab bestaat met de eerste kaarten.
**Bouw:**
- **Eerst het fundament van §0b:** schema uitbreiden met icoon, bediening, plek, min/max/stap en Ⓘ-hulp per veld, en één Werkbank-paneel + één Instellingen-kaart die zichzelf uit het schema tekenen. Alles hierna gebruikt dat.
- Bovenbalk: Werkbank, Instellingen (Nodes nog verborgen achter een klein "oud"-knopje tot Fase 5, zodat er niets kwijt is).
- Werkbank schrijft voor items, pickups, regions/areas/colliders, vijanden, grondstoffen, aanvallen en loot **naar documenten** (de Canoniek-techniek), niet meer naar nodes.
- Pickups, vijanden, grondstof-spawns, areas en colliders als icoon in de 3D-view, klik = Werkbank-paneel.
- Instellingen-tab met kaarten: Project, Game-camera, Licht, Lucht en fog, Grafiek, Besturing, Builds. Live voorbeeld.
- `canoniek.html` en `canonical-slice.js` weg.
**Kevin ziet:** geen Canoniek-link meer; item maken, pickup slepen, vijand plaatsen, camera-slider schuiven en het meteen zien; publiceren en in de game spelen.
**Klaar als:** A6 + B (Project, camera, licht, fog, grafiek, besturing, builds) afgevinkt; Ctrl+Z werkt in de Werkbank net als nu; F5-tests blijven groen; perf niet slechter.
**Risico:** camera/licht staan nu in nodes die de game leest. Overgang per domein met de bestaande cutover-guard (één schrijver).

### Fase 2 — Eén wereld met chunks, land tekenen, hoogtes

**Doel:** één wereld in plaats van start/test/andere zones; grond tekenen met texture; hoogtes en laagtes.
**Bouw:**
- Alle huidige zones samenvoegen tot één wereld (elke zone op een eigen plek, met verhuisrapport). Oude zones worden gebieden (point line) in Fase 3.
- Terrein per chunk (64 m cel, past bij `spatial.js`): hoogtekaart + textuurlagen (verfpenseel met 2-4 textures per chunk).
- Penselen: land erbij/eraf, texture verven, omhoog, omlaag, glad, plat. Grootte en sterkte als slider.
- Game en editor laden alleen chunks rond de camera/speler.
- Server gebruikt dezelfde hoogtekaart voor lopen en spawnen.
**Kevin ziet:** in de editor een heuvel maken en een stuk gras/zand bij tekenen, publiceren, er in de game overheen lopen.
**Klaar als:** A1 afgevinkt; geen zonewissel meer nodig om rond te lopen; perf op de laptop niet slechter dan nu; twee spelers zien elkaar op dezelfde hoogte.
**Risico:** grootste fase. Hoogte op de server (zie §5.7) en geheugen per chunk. Eerst één chunk bewijzen, dan schalen.

### Fase 3 — Alles in de wereld via de Werkbank

**Doel:** alles wat in de wereld staat bewerk je door het aan te klikken. Ook `node_resource_spawn_...`.
**Bouw:**
- Gebieden en deelgebieden met point lines; per gebied iconen voor muziek, sfeer, veilig, regels, ontdekken.
- Alle A2- en A3-regels als document; verhuizen uit Nodes per domein (met verhuisrapport).
- Rol-iconen boven een geselecteerd model (NPC, vijand, grondstof, pickup, vendor, teleport, questdoel...). Paneel Werkbank toont alleen de paar inputs van die rol.
- Begroeiing (scatter), paden/water, kaartmarkeringen.
- Spelen in de editor (▶).
**Kevin ziet:** gebied tekenen, muziek erop slepen, erin lopen en de muziek horen; een grondstof aanklikken en de wachttijd veranderen zonder Nodes.
**Klaar als:** A2 + A3 afgevinkt; geen wereldobject meer dat alleen in Nodes kan.

### Fase 4 — Ketens en verhalen: Bibliotheek + Relaties

**Doel:** alle definities als kaarten met icoon; koppelen door te slepen; Relaties toont de hele ketting.
**Bouw:**
- Alle A4-kaarten als document. Slepen: item op loottabel, loottabel op vijand, item op vendor, NPC op quest.
- Quests en dialogen als tijdlijn met kaarten (geen nodes). Quests tellen ook verslagen vijanden (open uit F5).
- Rest van Instellingen: HUD met live view (slepen op het scherm), minimap, debug, speler, alle spelregels, waarden/teksten.
**Kevin ziet:** een vijand aanklikken en in Relaties zien: vijand → loot → item → vendor → quest. Een HUD-balk verslepen en het in het voorbeeld zien.
**Klaar als:** A4 + A5 + heel B afgevinkt.

### Fase 5 — Nodes weg en een speelbaar stuk spel

**Doel:** de Nodes-tab is weg en het spel is echt speelbaar, helemaal gebouwd in de Werkbank.
**Bouw:**
- Afvink-script: elke nodesoort en elk veld heeft een plek (§4). Laatste verhuizing met verhuisrapport.
- Nodes-tab, node-bibliotheek, graph-panelen weg. De game leest alleen nog builds. De oude graph wordt niet gewist, alleen niet meer gebruikt (blijft in Kevins eigen backups).
- Kevin bouwt in de Werkbank een klein speelbaar gebied: start → NPC met quest → vijanden → loot → vendor → level omhoog → tweede gebied.
- Speelbaarheidsfixes die daarbij opvallen (knop Uitrusten in de tas, duidelijke questmarkering, dood/respawn).
**Kevin ziet:** alleen nog `Werkbank | Instellingen`; met een tweede account de hele lus spelen.
**Klaar als:** afvink-script 100 %; lus gespeeld met 2 accounts; perf niet slechter dan bij de start van Fase 1.

---

## 7. Wat de serverinventaris toevoegde (26-10)

Codex heeft de echte database alleen-lezen bekeken. Rapport: `README/fases/Werkbank-plan/evidence/INVENTARIS-SERVER.md` op de server.

**Goed nieuws:** 486 nodes in 159 soorten, allemaal bekend in de code; geen onbekende soorten of velden. Lijst A/B/C dekt ze dus.

**Belangrijk voor het plan:**

1. **Bijna alles zit nog in nodes.** In Canoniek staan maar 11 actieve documenten (1 item, 3 pickups, 4 regions, 2 areas, project). Er is nog geen enkel domein echt overgezet. Dus 21 items, 11 grondstoffen, 4 vijanden, 4 quests, 2 dialogen, 3 vendorcatalogi, 2 recepten, 47 modellen, 4 begroeiingsgebieden en 5 grond-/waterlagen moeten nog verhuizen. Dat gebeurt per domein met een verhuisrapport (Fase 1 t/m 4).
2. **Vier zones:** Sunny Meadow1 (start), Desert, Peaks, test, met 9 zone-links en 4 portals. In Fase 2 worden ze één wereld, elk op de plek die hun zone-origin/raster nu aangeeft. **Portals blijven als teleport** binnen de wereld (jij kunt ze daarna weghalen of vervangen door een pad). Minimap wordt per chunk gebakken in plaats van per zone.
3. **HUD-indeling desktop en mobiel** staat apart in de database (`game_hud_layout_defaults`: 18 en 8 modules). Instellingen → HUD krijgt daarom twee knoppen: 🖥️ desktop en 📱 mobiel, allebei met live view en slepen.
4. **Velden die ik nog niet noemde** en die jij wel gebruikt, gaan mee: bij items `inventoryTags`, `equipmentSlotRef`, `durabilityMax`, `statModifierRefs`, pickupgeluid/-effect; bij grondstoffen oogstgeluid/-effect, `scope`, `ownershipClaimMs`; bij vijanden lijk-duur, naambordmodus, bestiarium; bij water/paden `animated`, `flowSpeed`, `blocksPlayer` (stromend water).
5. **Muziek:** er hangt nu geen muziek aan een zone via nodes. Muziek per gebied komt alleen uit Canoniek-areas (F4). Er gaat dus niets verloren, maar de Desert-afspeellijst moet je zelf weer aan een gebied slepen.
6. **Bestanden (20 assets)** blijven in de asset-bibliotheek. Zes ervan worden nergens in de code genoemd (Archer, monumental_portal, woodpile, poliigon grass, twee muziekstukken); die blijven gewoon staan.
7. **ID-aliassen** (`target.new_target` → `target.new_target_3`) gaan mee bij het verhuizen van questdoelen.
8. **Serverconfig (`.env`, tick-rate, AOI)** blijft op de server en komt **niet** in Instellingen. Dat zijn wachtwoorden en serverwaarden; die horen niet in de editor.
9. **Editor-paneelindeling** (`editor_user_layouts`): jouw Werkbank-indeling blijft, de Nodes-indeling vervalt in Fase 5.

---

## 8. Schoon schip (Kevin 26-10)

Er zijn drie eerdere bouwrondes geweest. Daardoor laadt de game en de editor veel code die niet meer gebruikt wordt. Bijvoorbeeld: de game laadt `node-types.js` (5.700 regels nodedefinities), de editor laadt `editor.js` (32.500 regels, grotendeels Nodes), en `world-runtime.js` is 18.500 regels.

**Regel:** elke fase haalt weg wat hij vervangt. Niets blijft "voor de zekerheid" staan.

| Fase | Wat weg mag (als niets het meer gebruikt) |
| --- | --- |
| 1 | `canoniek.html`, `canonical-slice.js`, de Canoniek-schermcode die naar de Werkbank is verhuisd; losse logbestanden in de root (`bots30.log`, `crash.log`) |
| 2 | zone-wissel-code (setWorld per zone, zone-links laden), oude grond per zone, minimap-bake per zone |
| 3 | Visual Builder en object-rol-code in `editor.js` die via nodes werkt; legacy-spawnpaden in `node03-runtime-service.js` per verhuisd domein |
| 4 | Questtimeline/Dialoogtimeline op nodes, `authoring-contract.js` (Tools/Authoring-routes), oude catalog-compilers per verhuisd domein |
| 5 | Nodes-tab, node-bibliotheek, graph-panelen, `node-types.js` uit de game, `game-project-compiler.js`/`graph-repository.js` als niets ze meer leest, `node03/04/05`-runtime-delen die door documenten vervangen zijn, oude `apply-node0x-*.js`-scripts, `README/fases/Oude basis/` en het oude v2.3-plan naar één archiefmap |

**Hoe veilig:**
- Eerst bewijzen dat niets het nog gebruikt (zoeken naar imports en aanroepen), dan pas weghalen.
- Tests blijven groen; testen die alleen oude code testten gaan mee weg (niet uitzetten maar verwijderen, met uitleg in de commit).
- De oude database-tabellen van nodes blijven staan tot jij zegt dat het weg mag. Code weghalen kan terug via git, data niet.
- Per fase meten we wat de game en editor laden (aantal KB en laadtijd). Doel: elke fase kleiner of gelijk, nooit groter.

---

## 9. Wat er gebeurt met het lopende werk

- **Fase 05 (oud plan, commit 4671158):** blijft op main staan. Wat erin zit (vijanden, gevechten, loot, navigatie, grondstoffen als documenten) is precies de techniek die dit plan gebruikt. Er wordt niet verder op `canoniek.html` gebouwd; het scherm "Vijanden" verhuist in Fase 1 naar de Werkbank. De openstaande punten (quests tellen vijanden, knop Uitrusten) zitten in Fase 4 en 5.
- **Oud plan F6/F7** (characters, gesloten test): pas na Fase 5 opnieuw bekijken.
- **Effect op de game:** de soepelheid (netcode, chunks, 20 Hz) blijft zoals hij is. Dat werk wordt niet aangeraakt behalve waar Fase 2 de hoogte toevoegt.

---

## 10. Wat kan er nog misgaan (eerlijk)

| # | Risico | Waarom | Wat we doen |
| --- | --- | --- | --- |
| 1 | **Fase 2 is te groot** | Vier zones samenvoegen, hoogtekaart, land tekenen én de server laten meedoen in één fase. | Fase 2 in drie zichtbare stukken: (a) één chunk met hoogte, waar jij op loopt, (b) penselen, (c) zones samenvoegen. Elk stuk eigen handtest. |
| 2 | **Verhuisvolgorde** | Alles verwijst naar elkaar: een vijand gebruikt een loottabel, die een item gebruikt. In F3 ging het daarom al eens mis (pickups vóór items). | Vaste volgorde: waarden en stats → items en valuta → loot → grondstoffen, vijanden en NPC's → vendors en recepten → quests en dialogen → wereldobjecten. Het verhuisrapport zegt per stap GO of NO-GO. |
| 3 | **Tussentijd met twee systemen** | Tot Fase 5 staat een deel in nodes en een deel in documenten. | Per domein is er maar één schrijver (de bestaande cutover-guard). In de Werkbank laat een klein slotje 🔒 zien wat nog niet verhuisd is. |
| 4 | **Het schema maakt alles saai** | Schermen die automatisch uit het schema komen, worden snel een lange lijst velden, en dat is niet "kinderlijk". | Per rol tonen we maximaal ±6 velden. De rest zit onder een ⚙️-knop "meer". Viewport-tools (punt, lijn, penseel, slepen) gaan altijd vóór velden. |
| 5 | **`editor.js` is 32.500 regels** | De Werkbank zit verweven met de Nodes-code. Ombouwen kan dingen breken die nu werken, zoals Ctrl+Z en slepen. | De nieuwe Werkbank-delen komen in losse bestanden. Oude delen gaan per fase weg (§8). Na elke fase volgt jouw handtest van wat al werkte. |
| 6 | **Zware bestanden** | Sommige modellen zijn 4 MB (woodpile, stone_bridge) en textures zijn 1-2 MB. Op de oude laptop telt dat op. | In de Bibliotheek krijgt elke tegel een gewicht-stip (🟢🟡🔴). In Instellingen komt een budget per chunk ("objecten 120/200"). |
| 7 | **Save draft vs. Save to game** | Het moet altijd duidelijk zijn wat spelers al zien. | SAVE DRAFT bewaart alleen voor de editor. SAVE TO GAME maakt een build en zet die live (met rollback). De teller laat zien hoeveel wijzigingen nog niet live staan. |
| 8 | **Credits en tijd** | Elke fase is groot. | Elke fase levert eerst één zichtbaar stuk dat jij test. Daarna pas de rest. Geen dubbele testrondes (CLAUDE.md). |
| 9 | **Plan loopt weer weg** | Dat gebeurde eerder met ChatGPT en de fases. | Dit document is het enige plan. Een afwijking kan alleen met jouw akkoord, en wordt dan hier opgeschreven met datum. |

---

## 11. Wat een echt spel nog nodig heeft (meegedacht)

Wat er al is (✅), wat in dit plan zit (📋), en wat nog nergens zit (❗). Bij ❗ staat in welke fase het komt, mits jij akkoord gaat.

### De speler
| Onderdeel | Stand | Waar |
| --- | --- | --- |
| Inloggen, account | ✅ | – |
| **Character maken** (naam, uiterlijk kiezen) | ❗ | Fase 5. Instellingen → Speler: welke modellen kiesbaar zijn |
| Lopen (WASD en klik-om-te-lopen), sprinten, camera | ✅ | Instellingen → Keys / Camera |
| **Speler-instellingen in de game** (volume, grafiek laag/hoog, toetsen) | ❗ | Fase 4. Het menu in de game zelf, niet de editor |
| Tas, uitrusting, geld, XP/level | ✅ (Uitrusten-knop ontbreekt) | Fase 5 |
| Dood en respawn | ✅ | Instellingen → Spelregels |

### Het spelen
| Onderdeel | Stand | Waar |
| --- | --- | --- |
| **De kernlus:** wat doet de speler in de eerste 15 minuten? | ❗ | **Jouw keuze, zie hieronder** |
| Vechten: doel kiezen, schade-getallen, raak-effect, levensbalk | ✅ deels | Fase 4: schadegetal en raak-effect als vinkje plus slider |
| Vijanden die patrouilleren | 📋 (`path_behavior_profile` bestaat) | Fase 3: **pad tekenen met een point line** en de vijand erop slepen |
| Grondstoffen, craften, vendor | ✅ | Fase 3/4 |
| Quests en dialogen | ✅ | Fase 4 (tijdlijn) |
| **Uitleg voor nieuwe spelers** (eerste quest legt de toetsen uit) | ❗ | Fase 5, als quest gemaakt in de Werkbank |
| Deuren, kisten, hendels | 📋 (interactable, lootable) | Fase 3 |

### De wereld
| Onderdeel | Stand | Waar |
| --- | --- | --- |
| Land, hoogte, water, paden, bomen | 📋 | Fase 2/3 |
| Licht, fog, dag en nacht | 📋 | Instellingen → Licht (Tijdstip-slider uit jouw ontwerp) |
| **Weer** (regen, mist) | ❗ (veld bestaat, systeem niet) | Na Fase 5 |
| Muziek per gebied, geluid bij acties | ✅ deels | Fase 3/4 |
| **Geluid van voetstappen en UI-klikjes** | ❗ | Fase 4, Instellingen → Audio |
| **Stempels** (een ingericht kamp of bos opslaan en opnieuw neerzetten) | 📋 §5 | Fase 3 |

### Samen spelen (het is een MMO)
| Onderdeel | Stand | Waar |
| --- | --- | --- |
| Elkaar zien en samen vechten | ✅ | – |
| **Chat** | ❗ bestaat nog niet | Fase 5 (simpele chat), Instellingen → Chat (aan/uit, filter) |
| Party, handel, markt, post | ✅ in code | Instellingen → Spelregels |
| **Moderatie** (iemand muten of kicken) | ❗ | Na Fase 5, vóór er vreemden meespelen |

### Voor jou als maker
| Onderdeel | Stand | Waar |
| --- | --- | --- |
| **Spel-check** ✔️: één scherm met groene en grijze icoontjes. Is er een startpunt, minstens 1 quest, 1 vendor, en is elke vijand gekoppeld aan loot? | ❗ | Fase 1 begin, Fase 5 compleet. Naast SAVE TO GAME |
| ▶ Spelen in de editor | 📋 §5 | Fase 3 |
| **Balans-overzicht**: hoeveel geld en XP levert een uur spelen op | ❗ | Fase 4, als grafiekje in Instellingen → Spelregels |
| FPS en chunk-teller in beeld | 📋 §5 | Fase 1 |

### Drie keuzes die alleen jij kunt maken
1. **De kernlus.** Wat doet een speler in de eerste 15 minuten? Bijvoorbeeld: spawnen in Sunny Meadow → de smid geeft een quest → hout hakken → een zwaard craften → Sand Raiders verslaan in de Desert → level 3 → de Peaks gaan open. Dit wordt de testroute voor Fase 5.
2. **Chat in Fase 5**, of pas later?
3. **Character maken:** alleen een naam, of ook kiezen tussen een paar modellen?

---

## 12. Nog meer dat vaak vergeten wordt (tweede ronde)

### Belangrijkst (zou ik zeker in het plan zetten)
| Onderdeel | Waarom | Waar |
| --- | --- | --- |
| **Veilig verwijderen** | Als je een item weghaalt dat spelers al in hun tas hebben, breekt hun opslag. | Fase 1: verwijderen = archiveren. De Werkbank waarschuwt eerst: "⚠️ 3 spelers hebben dit". |
| **Bestanden automatisch lichter maken bij uploaden** | Een model van 4 MB en textures van 2 MB maken de laptop traag. | Fase 1/2: bij upload worden textures verkleind (max 1K) en modellen ingepakt. De gewicht-stip laat zien hoeveel het scheelt. |
| **Maker-gereedschap in de game** | Om te testen moet je nu alles echt spelen. | Fase 3: alleen voor jouw account een klein menu 🛠️ met teleport, item geven, level zetten, onsterfelijk en vijanden resetten. |
| **Automatische botsing** | Nu stel je per model zelf een botsstraal in. | Fase 3: de botsvorm wordt automatisch uit het model gehaald; met een slider pas je hem aan. |
| **Veel dezelfde bomen snel tekenen** | Honderden losse bomen maken de laptop traag. | Fase 2/3: gelijke modellen worden één tekenopdracht (instancing), en verre bomen worden simpeler (LOD). |

### Voor de speler
| Onderdeel | Waar |
| --- | --- |
| **Grote wereldkaart** (toets M) met questmarkeringen | Fase 4, Instellingen → Minimap |
| **"!" en "?" boven NPC's** (quest beschikbaar of inleveren) | Fase 4 (het veld bestaat al, het moet nog zichtbaar worden) |
| **Uitleg bij items** in de tas (tooltip met stats en zeldzaamheidskleur) | Fase 4 |
| **Loot op de grond** (zakje of glinstering, kleur per zeldzaamheid) | Fase 4 |
| **Gevoel bij raken:** klein schokje, flits, geluid | Fase 4, als sliders in Instellingen → Gevecht |
| **Laadscherm** met voortgang bij de eerste keer laden | Fase 2 |
| **Mobiel: joystick op het scherm** (een mobiele HUD bestaat al) | Na Fase 5, of eerder als je mobiel belangrijk vindt |
| **Taal** Nederlands/Engels (de node bestaat al) | Na Fase 5 |

### Voor jou als maker
| Onderdeel | Waar |
| --- | --- |
| **Model zonder animaties** krijgt een waarschuwing in de Bibliotheek ("kan niet lopen of aanvallen") | Fase 1 |
| **Icoontjes automatisch** uit het 3D-model maken (dat bestaat al voor GLB-plaatjes) | Fase 1 |
| **Melding "server gaat herstarten"** voor spelers | Fase 5, Instellingen → Project |
| **Foutmeldingen uit de game** die jij in de editor ziet (wie liep vast, waar) | Na Fase 5 |
| **Statistieken:** waar gaan spelers dood, hoe lang duurt een quest | Na Fase 5 |

### Bewust nog niet (later, als het spel staat)
Gilden, mounts en huisdieren, PvP-arena's, dungeons per groep (instances), seizoenen en events, en betalen in de game. Die zijn leuk, maar maken de basis nu alleen zwaarder.

---

## 13. Ombouw op de bestaande Werkbank (Kevin 26-10, na Fase 1 stuk 2)

**Deze paragraaf gaat boven §6.** Kevins keuze: **ombouwen, inhoud meenemen.** Kevin: "eerst het nodeprobleem omzetten naar de future-proof manier en daar alles op bouwen wat nodes had, plus wat we gepland hadden. Hoe eerder hoe beter."

### Wat er mis ging

Stuk 1 en 2 bouwden een tweede systeem naast de bestaande Werkbank:
- eigen kaart-tabs naast de bestaande tabs in de Bibliotheek (de 🔒-tabs);
- een 2D-laag met iconen en lijnen over de 3D-view;
- documenten naast nodes.

Dat is "systeem 4". Het plan zei "pictogram in de 3D-view". Kevin bedoelde echte 3D, met het gereedschap dat er al is.

### De regels (gaan boven §6)

1. **Eén scherm en één opslag per onderdeel.** Nooit meer een tweede tab, lijst of gereedschap naast een bestaand scherm.
2. **Omzetten per onderdeel, in één stap:**
   - verhuisrapport, en de inhoud uit nodes wordt documenten (met `legacyRef`);
   - de bestaande Werkbank-tab en het bestaande 3D-gereedschap lezen en schrijven documenten;
   - de game leest dat onderdeel uit de build;
   - de nodesoort verdwijnt uit de editor (Nodes-bibliotheek, Werkbank, klikken in 3D), en de oude servercode voor dat onderdeel gaat weg.
   - De oude nodetabellen blijven bewaard tot Kevin zegt dat ze weg mogen.
3. **Echt 3D, zoals in de game.**
   - Een pickup, vijand of grondstof staat in de editor met zijn eigen mesh. Zonder mesh krijgt hij een tijdelijke 3D-vorm, zoals de F3-steen nu.
   - Verplaatsen gaat met het bestaande 3D-gereedschap (G/R/T).
   - Gebieden, deelgebieden en obstakels zijn een lijn in de 3D-wereld en worden bewerkt met het punten-gereedschap van scatter: punten slepen, F extrude, Del, Shift voor meer punten.
   - Geen 2D-iconen of HTML-lagen over de view.
4. **Editor = game.** De editor-view laat de opgeslagen documenten meteen zien via dezelfde laag als de game (`runtime-overlay`). In de game staan ze pas na SAVE TO GAME.
5. **Het paneel.** De manier van stuk 1 blijft: iconen, sliders, ⓘ met waarvoor / goed / probleem, en slepen op vakken. Dat wordt het enige paneel van de bestaande Werkbank.
6. **Eén Area tool voor alle vlakken en lijnen.**
   - Het punten-gereedschap van scatter (punten slepen, G/R/T, F extrude, Del, Shift) wordt dé Area tool.
   - Alle soorten uit de oude nodes blijven bestaan en worden één tool: Begroeiing (Bounded Area Scatter), Pad/oppervlak (Surface Layer path), Gebiedsdefinitie (Area Definition), Locatie-anker (Location Anchor), Blokkade (Blocker Area), Loopvlak (Walkable Surface), Gebied, Deelgebied en Obstakel. Wat nog nooit was overgezet hoort er ook bij.
   - In het Werkbank-paneel kies je de soort met iconen. Een vlak omzetten naar een andere soort houdt de punten, bijvoorbeeld een begroeiingsvlak dat een blokkade wordt.
   - In het schema is het één soort `area` met een veld "soort". Elke soort heeft zijn eigen paar velden; het schema-recept (§0b) tekent het paneel.
7. **Geen hardcoded inhoud.**
   - Wat met scripts in de database is gezet, wordt bij het verhuizen een gewoon document dat je kunt veranderen of archiveren. Dat geldt voor de Desert-demo, de demo-quest, de economie-slice en de F2-handtest (`apply-node03-desert-demo.js`, `apply-node04-…`, `apply-node05-…`, `apply-f2-…`).
   - Die scripts en de `reset_demo`-knop gaan daarna weg.
   - Elke stap zoekt in de code naar vaste meshes, namen of posities voor zijn onderdeel. Die gaan naar documenten of weg.
   - Niets in de game mag nog bestaan dat je niet in de editor kunt aanpassen.

### Wat uit stuk 1 en 2 blijft, en wat weggaat

- **Blijft:**
  - het schema (`kinds.js`, met icoon, bediening en hulp per veld);
  - de documentopslag, builds, SAVE TO GAME met teller, en terugzetten;
  - de Instellingen-tab (Project, Builds);
  - de paneel-tekenaar (`werkbank-docs.js`);
  - Canoniek blijft weg.
- **Gaat weg:**
  - de 2D-laag (`werkbank-places.js`);
  - de aparte kaart-tabs (de bestaande tabs nemen hun plek in zodra hun onderdeel is omgezet);
  - de 🔒-tekens.

### Volgorde

Elke stap is één commit "Ombouw N". De proef is licht (tests, smoke, browsercheck). Alleen als game- of servercode verandert, komen de snelheidsmeting en de bots erbij.

| Stap | Onderdeel | Kevin ziet |
| --- | --- | --- |
| 1 | **Items + pickups.** De 21 items worden documenten. De Items-tab werkt op documenten. Een pickup staat als de mesh van het item in 3D en verplaats je met G. 2D-laag en dubbele tabs weg. | één Items-tab; een pickup verslepen zoals een model |
| 2 | **Area tool.** Alle vlak- en lijnsoorten (regel 6) als één tool op documenten. Bestaande scatter, paden, blokkades, loopvlakken, ankers en gebieden gaan mee. | een vlak tekenen met punten, de soort wisselen met een icoon, muziek erop slepen |
| 3 | **Grond: één wereld, leeg beginnen.** Geen zones meer. De grond begint leeg en vlak. Wat in de zones stond, komt op zijn plek in de ene wereld. Land tekenen met een texture-penseel; textures lopen in elkaar over. Hoogte + en −, glad strijken, plat. De server gebruikt dezelfde hoogte (was Fase 2). | een heuvel en een zandpad tekenen en er in de game overheen lopen |
| 4 | **Aanvallen, loottabellen, vijanden en vijandplekken.** `enemy_archetype` en spawn-nodes worden documenten; oude vijandcode op nodes weg. | vijand aanklikken, Relaties: vijand → loot → item |
| 5 | **Grondstoffen en grondstofplekken** (ook `node_resource_spawn_…`) | grondstof aanklikken en de wachttijd veranderen |
| 6 | **Instellingen:** camera, licht, lucht/fog, grafiek, besturing (was "stuk 3") | slider schuiven en het meteen zien |
| 7+ | Modellen (`model_entity`), NPC's, vendors, quests, dialogen, recepten, stats en valuta; daarna Nodes weg (Fase 5) | |

Na elke stap staat er per onderdeel nog maar één systeem: precies de vroege scheiding die Kevin vraagt.

Stap 3 is de grootste. Eerst één stuk grond bewijzen op de oude laptop, dan pas de hele wereld.

### Stand stap 2 (Area tool, 27-10)

- **Gedaan:** één document `area` met een veld `soort`: begroeiing, pad, blokkade, loopvlak en deelgebied. De Werkbank heeft een tab 🧩 Vlakken met een knop per soort. Het bestaande puntengereedschap (punten slepen, G/R/T, F, Del) bewerkt het document. Soort wisselen houdt de punten. De game tekent een vlak met dezelfde code als de oude node.
- **Verhuizen:** Instellingen → Builds → "Vlakken en paden". Oude vlak-nodes die niet in de wereld stonden, komen gearchiveerd mee. Daarna zijn die nodesoorten in Nodes alleen-lezen en uit de 3D-view weg.
- **Nog niet in de Area tool, en waarom:**
  - Gebied (region) en het oude obstakel-document (collider): die horen bij stap 3 (één wereld), omdat gebieden de zones gaan vervangen.
  - Locatie-anker en Gebiedsdefinitie-nodes: spawnpunten en zone-pakketten hangen er nog aan. Ze gaan mee met de stap van hun gebruikers (spawns in stap 4/7, zones in stap 3).
