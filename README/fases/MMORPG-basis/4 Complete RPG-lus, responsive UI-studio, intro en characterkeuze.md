# Fase 4 - Complete RPG-lus, responsive UI-studio, intro en characterkeuze

**Status:** definitief implementatiecontract, nog niet geimplementeerd  
**Datum:** 2026-10-23  
**Repo-basis:** `main` op `5695558b7cf9204aa697b2856cdec69a63da47cc`  
**Doelpad:** `README/fases/MMORPG-basis/4 Complete RPG-lus, responsive UI-studio, intro en characterkeuze.md`  
**Vereiste voorgangers:** Fase 1, Fase 2 en Fase 3 in deze map  

---

## 0. Normatieve positie

Dit document erft alle invarianten, transactieregels, IDs, canonical-JSON-regels, build/publishregels, spatial contracten, Preview-isolatie, actor authority, fixed-point combatmath en eventcontracten uit Fase 1 tot en met 3.

Bij tegenspraak geldt:

1. Fase 1 wint voor authoring, documents, commands, revisions, builds, publish en legacy-cutover.
2. Fase 2 wint voor World/Region/Area/Cell, spatial storage, streaming, muziek/audio en PlayPreview.
3. Fase 3 wint voor actors, stats, combat, equipment, AI, animation, action-audio, VFX en world networking.
4. Fase 4 wint voor account/characterflow, RPG-persistence, story/economy-integratie, gameboot en UI-presentatie.

Fase 4 maakt geen tweede gameplaybron in de browser:

- canonical authoringdocuments bepalen projectinhoud en UI-configuratie;
- een immutable published build bepaalt de runtimebetekenis;
- de server bezit account-, character-, quest-, inventory-, equipment-, economy- en worldprogressie;
- de client bezit alleen tijdelijke viewstate, inputintent en toegestane lokale voorkeuren;
- nodes blijven uitsluitend legacy-importbron en read-only inspectie.

### 0.1 Status van de voorgangers

Fase 1, 2 en 3 zijn op de repo-basis definitieve implementatiecontracten, geen bewijs dat zij al zijn geimplementeerd. Fase 4 mag pas worden uitgevoerd nadat hun relevante checkpoints code- en Kevin-acceptatie hebben. Dit document mag niet worden gebruikt om opnieuw een UI boven de huidige legacy graphauthority te bouwen.

### 0.2 Geen onmogelijke belofte

Deze specificatie elimineert open architectuurbeslissingen voor de afgesproken basis. Zij elimineert geen toekomstige productkeuzes, browserwijzigingen of schaaltests. Uitbreidingen moeten de vastgelegde authority-, transaction-, event- en lifecyclegrenzen behouden.

### 0.3 Normatieve taal

**MOET**, **MAG NIET**, **BEHOORT**, **MAG** en **OPTIONEEL** hebben dezelfde normatieve betekenis als in Fase 1. Voorbeelden zijn niet normatief, tenzij `exact` erbij staat.

---

## 1. Bewezen uitgangssituatie

Op repo-basis `5695558b` is bewezen:

- `player_profiles` is één rij per user door `user_id UNIQUE`; het is nog geen multi-character model.
- `player_profiles.selected_character_id` is tekst zonder volledige character-lifecycleauthority.
- `player_positions` gebruikt legacy floating-point worldcoördinaten.
- migratie 006 bevat losse player progression, stats, inventory stacks, iteminstances, equipment, currencies, abilities, idempotency, ledger, gameplay events, world entity state, resources en loot.
- migratie 007 bevat queststate, objectiveprogress, receipts, dialoguekeuzes, flags, reputation, recipe/discovery/fast-travel unlocks, timers en audit.
- migratie 008 bevat crafting jobs, vendorstock/buyback, parties, trade, reservations, market, mail en reconciliation.
- `mmo-service.js` auto-creeert een enkel player profile en combineert networking, movement, persistence en legacy worldresolutie.
- `node04-quest-runtime-service.js` en `node05-economy-runtime-service.js` hebben bruikbare transactionele consumers, maar lezen legacy node-compiled projectstructuren en player IDs.
- `game.js` is meer dan een half miljoen tekens groot en combineert boot, networking, movement, HUD, minimap, quests, economy en DOM-updates.
- `game/index.html` bevat een canvas, leeg HUD-root en generieke loading overlay; er is geen volledige intro/characterselect-state machine.
- bestaande HUD-typen en layouts zijn grotendeels node-schema's. Enkele runtimepanelen bestaan, maar schema-aanwezigheid bewijst geen complete responsive consumer.
- de viewportmeta blokkeert momenteel user scaling (`maximum-scale=1`, `user-scalable=no`), wat niet past bij de toegankelijkheidsdoelen van deze fase.

Deze code en tabellen worden gecontroleerd gemigreerd. Zij zijn geen reden om monolithische clientcode, één character per account of node-authority te behouden.

---

## 2. Fasedoel, scope en niet-doelen

### 2.1 Fasedoel

Fase 4 is geslaagd wanneer Kevin zonder Nodes:

1. een intro en hoofdmenu kan ontwerpen en publiceren;
2. character templates en charactercreatieregels kan instellen;
3. met een account meerdere characters kan maken, bekijken, kiezen, spelen, uitloggen en terugvinden;
4. een uitgerust character als echte 3D-preview in characterselect ziet;
5. de volledige bootflow betrouwbaar doorloopt tot dezelfde published wereld;
6. HUD, menu's en schermen visueel in een responsive UI-studio bouwt;
7. desktop-, smalle-, touch- en gamepadlayout kan previewen;
8. combat, loot, inventory, equipment, XP, quests, dialogue, crafting, vendor, market, death en respawn als één samenhangende lus speelt;
9. refresh, reconnect en serverrestart doorstaat zonder stateverlies of dubbele rewards;
10. kan aantonen dat iedere zichtbare UI-waarde uit serverstate of canonical content komt.

### 2.2 Canonical domains

| Domain key | Canonical kinds |
| --- | --- |
| `characters.catalog` | `character_template`, `character_creation_rules` |
| `progression.rules` | `progression_rules`, `xp_source_rule`, `inventory_rules`, `death_respawn_rules`, `interaction_rules` |
| `story.catalog` | `quest_definition`, `dialogue_definition`, `reward_bundle` |
| `economy.catalog` | `currency_definition`, `recipe_definition`, `vendor_catalog`, `market_rules` |
| `presentation.ui` | `ui_theme`, `ui_screen`, `ui_layout`, `ui_widget`, `intro_sequence`, `input_action_map` |

### 2.3 In scope

- Een robuuste bootstate machine van documentload tot IN_GAME.
- Session/authcheck, build pinning, critical preload en recovery.
- Multi-character profiles, creation/select/delete/restore en 3D-preview.
- Server-authoritative character save data en transactiegrenzen.
- Complete RPG-loop inclusief story/economyconsumers.
- HTML/CSS UI boven dezelfde Three.js-canvas, met project-native MVVM-store.
- Gesloten selector-, action-, widget- en eventregistries zonder executable content.
- Responsive UI Studio met live device/input previews.
- Keyboard, pointer, touch en standaard gamepad.
- Accessibility, focus, safe areas, reduced motion en text scaling.
- UI-, network- en persistenceperformancebudgetten.
- Legacy-import/cutover voor character, player rules, story, economy en UI.

### 2.4 Buiten scope

- Guilds, auction house bidding, guild bank en raid UI.
- PvP queues, matchmaking en cross-shard charactertransfer.
- Cash shop, payments, subscriptions en platform entitlements.
- Voice chat, cinematics editor, lip-sync en localization authoring voor meerdere talen; runtime text keys worden wel voorbereid.
- Offline gameplay of client-side save files.
- User-authored HTML, CSS, JavaScript, expressions of shaders.
- Een React-, Vue-, Svelte- of Web Components-frameworkmigratie.
- Een native mobile app; responsive browser/touch is wel verplicht.
- Volledige controllerremapping per fysiek merk; standaard Gamepad mapping plus editable logical actions is verplicht.

---

## 3. Onbreekbare invarianten

### R-01 - Server save authority

De client kan geen XP, level, items, currency, questprogress, unlocks, equipment, position of rewards als waarheid opslaan of herstellen.

### R-02 - Account en character zijn verschillend

Een user/account heeft één `player_profile` en nul of meer `player_characters`. Alle speelstate heeft exact één character als eigenaar, tenzij het schema uitdrukkelijk account-wide zegt.

### R-03 - Build pinning

Intro, UI, character templates, world join en de actorsimulatie gebruiken tijdens één sessie exact hetzelfde `buildId`. Een buildwijziging tijdens spelen verandert de actieve sessie niet stil.

### R-04 - Een bootmachine

Er is exact één code-owned applicatiestate machine. DOM-schermen, canvasscenes en networkservices mogen haar state tonen, maar niet onafhankelijk navigeren.

### R-05 - Een clientstore

Alle bedienbare UI leest uit één genormaliseerde `GameUiStore`. Widgets lezen niet rechtstreeks uit WebSocket, Three.js objects of losse globale variabelen.

### R-06 - Unidirectionele dataflow

Serverevent -> reducer -> store revision -> selector -> geplande DOM-patch. Gebruikersactie -> typed intent -> servercommand -> authoritative event. Geen two-way binding naar gameplaystate.

### R-07 - Geen polling

HUD en menu's reageren op init snapshots en events/deltas. Periodieke fetchloops voor health, inventory, quests, wallet of equipment zijn verboden.

### R-08 - DOM voor bediening

Tekst, forms, knoppen, lijsten, menu's, modals en HUD-controls zijn semantische HTML/CSS. WebGL rendert de wereld en 3D-preview, niet de toegankelijke UI.

### R-09 - Geen executable UI-content

Canonical UI-documenten bevatten alleen gesloten widgettypes, selectors, actions, tokens en layoutwaarden. Geen HTML, CSS, JS, URL, eval of vrije bindingexpressie.

### R-10 - Atomic RPG-resultaten

Een gameplayactie die meerdere slices raakt, commit alle state, receipts, ledger en outboxevents in één SQLite transaction of niets.

### R-11 - Revisions voorkomen stille regressie

Characterstate heeft één monotone globale revision en slice revisions. Client negeert oude deltas en vraagt een snapshot bij een gat.

### R-12 - Idempotente intenties

Elke persistente mutation heeft een account/charactergebonden request-ID en requesthash. Een retry geeft exact dezelfde response.

### R-13 - Published UI gebruikt echte consumers

Een scherm/widget mag alleen publishen wanneer het type, selectors en actions door de runtime zijn geregistreerd en end-to-end getest.

### R-14 - UI is niet de regelbron

Verbergen of disablen van een knop is presentatie. De server valideert bezit, kosten, range, state en permissions opnieuw.

### R-15 - Geen parallelle previewrenderer

World, PlayPreview en characterpreview delen dezelfde Three.js assetcache/rendererfoundation. Zij mogen verschillende scenes/camera's gebruiken, maar geen afwijkende model-/equipmentbetekenis.

### R-16 - Geen focusverlies

Iedere statetransitie en modal definieert initial focus, focus trap, escape/backgedrag en focusherstel.

### R-17 - Responsive betekenis blijft gelijk

Compacte layout mag informatie herschikken of achter een expliciet paneel plaatsen, maar geen gameplayactie of status stil verwijderen.

### R-18 - Last-known-good en herstel

Boot-, build-, snapshot- of assetfailure activeert een getypeerde recoverystate. Corrupte data wordt nooit geraden en overschrijft geen geldige serverstate.

---

## 4. Architectuurblueprint

```text
Canonical authoring (Fase 1)
  character/story/economy/UI documents
          |
          v
Deterministic compiler
  boot package + UI package + RPG package + Fase 2/3 packages
          |
          v
Immutable published build
          |
          +------------------------------+
          |                              |
          v                              v
Bootstrap/HTTP                       RPG server services
manifest, intro, theme              character aggregate
character list/templates            progression/quest/economy
          |                         actor/world join
          v                              |
Application State Machine                |
          |                              |
          +--------- typed intents ------+
          |                              |
          +<------ snapshots/events -----+
          v
GameUiStore (normalized immutable state)
  reducers -> revisions -> selectors -> rAF scheduler
          |
      +---+------------------+
      |                      |
      v                      v
Semantic DOM UI          Three presentation
HUD/menu/dialogue        world/character preview
```

### 4.1 UI-frameworkbesluit

GK gebruikt een kleine project-native unidirectionele MVVM-architectuur in ESM-modules:

- **Model:** server snapshots/events plus immutable published UI/RPG definitions;
- **ViewModel:** genormaliseerde `GameUiStore`, pure reducers en geregistreerde selectors;
- **View:** getypeerde DOM widget renderers en Three scene hosts;
- **Intent:** geregistreerde actions die typed commands versturen of lokale panelstate wijzigen.

Er wordt geen nieuw frontendframework toegevoegd. Redenen:

- de repository gebruikt al browser-ESM zonder buildpipeline;
- een frameworkmigratie zou de kernproblemen niet oplossen;
- Kevin moet op oude laptopklasse hardware kunnen testen;
- gesloten widgets/selectors/actions zijn beter compileerbaar dan vrije componentcode uit content.

Deze keuze verbiedt geen later intern framework, maar iedere vervanging moet dezelfde public interfaces en performance/acceptatie behouden.

### 4.2 Verantwoordelijkheden

| Laag | Doet | Mag niet |
| --- | --- | --- |
| Boot controller | states, timeouts, cancellation, screen/scene activation | gameplaystate muteren |
| Session service | auth/session status en CSRF | character kiezen zonder servervalidatie |
| Character service | list/create/select/delete/restore/join | UI layout bepalen |
| RPG services | progression, inventory, quest, dialogue, economy transactions | DOM of client vertrouwen |
| UI store | snapshots/events reduceren | fetch/poll, SQL, Three-objecten bewaren |
| Selectors | read-only afgeleide viewmodellen | side effects of Date.now gebruiken |
| Widget renderers | minimale DOM-patches | serverevents rechtstreeks verwerken |
| UI action dispatcher | local action of typed serverintent | businessregels beslissen |
| Three scene host | world/preview renderen | save data bezitten |

---

## 5. Canonical authoringdocuments

Alle documenten gebruiken de Fase-1-envelop, immutable identity, typed refs, revisions, validation en compile provenance.

### 5.1 `character_template` versie 1

```json
{
  "displayName":"Fighter",
  "actorArchetypeRef":"doc:...",
  "defaultLoadoutRef":"doc:...",
  "startRegionRef":"doc:...",
  "startSpawnRef":"doc:...",
  "portraitAssetId":"asset:...",
  "preview":{
    "cameraPreset":"full_body",
    "animationRole":"locomotion.idle",
    "environmentAssetId":null
  },
  "appearanceGroups":[
    {
      "entryId":"entry:...",
      "groupKey":"hair",
      "displayName":"Hair",
      "required":true,
      "options":[
        {
          "entryId":"entry:...",
          "optionKey":"short_01",
          "displayName":"Short",
          "attachmentAssetId":"asset:...",
          "socketKey":"head",
          "materialVariantKey":null
        }
      ]
    }
  ],
  "startingItemGrants":[],
  "startingCurrencyGrants":[],
  "startingAbilityRefs":[]
}
```

Regels:

- `actorArchetypeRef` wijst naar Fase-3 `actorKind=player`.
- Startregion/spawn moeten in dezelfde World/build bestaan en bereikbaar zijn.
- Group- en optionkeys zijn uniek binnen template en matchen `^[a-z][a-z0-9_]{0,63}$`.
- Assets/sockets moeten bij publish op het skeleton resolve'en.
- Startgrants zijn typed `{entryId,itemRef,quantity}` / `{entryId,currencyRef,amountMinor}`.
- De template is na charactercreatie een provenance-ref; bestaande characters veranderen niet automatisch van appearance/startgrants bij templatewijziging.

### 5.2 `character_creation_rules` versie 1

```json
{
  "displayName":"Character creation",
  "slotCount":3,
  "allowedTemplateRefs":["doc:..."],
  "nameMinCodePoints":3,
  "nameMaxCodePoints":24,
  "deleteGraceHours":168,
  "reservedNameKeys":["admin","moderator","system"],
  "allowRestore":true
}
```

- Exact één active document per project.
- Slotcount 1..12.
- De server normaliseert naam met Unicode NFKC, trimt en collapse't whitespace.
- Toegestaan: Unicode letters/marks, één gewone spatie, apostrof en koppelteken.
- Naam moet beginnen/eindigen met letter/mark; geen dubbele separators.
- `nameKey = normalizedName.toLowerCase()` onder de gepinde Node-runtime.
- `nameKey` is globaal uniek onder non-purged characters.
- Reserved keys matchen exact of als woordgrens; fout geeft `CHARACTER_NAME_RESERVED`.

### 5.3 `progression_rules` versie 1

```json
{
  "displayName":"Main progression",
  "maxLevel":50,
  "xpCurveRef":"doc:...",
  "baseStatBlockRef":"doc:...",
  "healthStatRef":"doc:...",
  "resourceStatRefs":["doc:..."],
  "levelUpResourcePolicy":"full",
  "levelUpRewards":[]
}
```

XP-curvepunten gebruiken integer cumulative XP per level. Level 1 heeft threshold 0; iedere volgende threshold is strikt groter; laatste punt is maxLevel.

### 5.4 `xp_source_rule` versie 1

```json
{
  "displayName":"Enemy defeat XP",
  "eventType":"enemy.defeated",
  "sourceTagQuery":{"all":[],"any":["enemy"],"none":[]},
  "baseXp":25,
  "levelDeltaBpsPerLevel":-500,
  "minimumMultiplierBps":1000,
  "maximumMultiplierBps":20000,
  "dailyCap":0
}
```

Geen vrije formula AST. Exacte berekening staat in sectie 24.

### 5.5 `inventory_rules` versie 1

```json
{
  "displayName":"Main inventory",
  "capacityMode":"slots",
  "slotCapacity":40,
  "weightCapacityMilli":0,
  "pickupOverflow":"reject",
  "allowDestroy":true,
  "allowDrop":true
}
```

`capacityMode=slots|weight|both|unlimited`; `pickupOverflow=reject|pending_delivery`. De legacyoptie `drop` wordt niet automatisch geïmporteerd zonder een veilige world-drop consumer.

### 5.6 `death_respawn_rules` versie 1

```json
{
  "displayName":"Default death",
  "respawnDelayTicks":100,
  "respawnOrder":["instance_checkpoint","character_checkpoint","region_default","project_start"],
  "healthRestoreBps":10000,
  "resourceRestoreBps":10000,
  "currencyLoss":[],
  "durabilityLossBps":0,
  "xpLoss":0,
  "dropItems":false
}
```

Iedere gekozen penalty moet een transactionele consumer hebben. `dropItems=true` blokkeert publish in Fase 4 omdat PvE corpse recovery buiten scope is.

### 5.7 `reward_bundle` versie 1

```json
{
  "displayName":"Village rescue reward",
  "entries":[
    {"entryId":"entry:...","kind":"xp","amount":500},
    {"entryId":"entry:...","kind":"currency","currencyRef":"doc:...","amountMinor":100},
    {"entryId":"entry:...","kind":"item","itemRef":"doc:...","quantity":1},
    {"entryId":"entry:...","kind":"ability","abilityRef":"doc:..."}
  ]
}
```

Kinds: `xp|currency|item|ability|reputation|recipe_unlock|flag`. Iedere entry heeft alleen zijn kindspecifieke velden. Grants zijn idempotent op `(characterId,sourceOperationId,entryId)`.

### 5.8 `quest_definition` versie 1

```json
{
  "displayName":"Help the village",
  "category":"main",
  "minimumLevel":1,
  "prerequisiteQuestRefs":[],
  "repeatPolicy":"once_per_character",
  "autoTrack":true,
  "abandonable":true,
  "steps":[
    {
      "entryId":"entry:...",
      "displayName":"Collect wood",
      "completionMode":"all",
      "objectives":[
        {"entryId":"entry:...","kind":"collect","itemRef":"doc:...","required":5,"consumeOnTurnIn":false}
      ]
    }
  ],
  "rewardBundleRef":"doc:..."
}
```

Objective kinds: `collect|deliver|defeat|reach|talk|level`. Defeat is in scope in Fase 4 en vereist Fase-3 `actor.death` events met source attribution. Branch/join/fail blijft buiten versie 1. Steps lopen sequentieel; objectives binnen step gebruiken `all|any`.

### 5.9 `dialogue_definition` versie 1

```json
{
  "displayName":"Village elder",
  "startEntryId":"entry:...",
  "entries":[
    {
      "entryId":"entry:...",
      "speakerActorRef":"doc:...",
      "textKey":"dialogue.elder.welcome",
      "fallbackText":"Welcome, traveler.",
      "choices":[
        {"entryId":"entry:...","textKey":"dialogue.accept","fallbackText":"I will help.","nextEntryId":null,"action":"offer_quest","questRef":"doc:..."}
      ]
    }
  ]
}
```

Actions zijn gesloten: `continue|close|offer_quest|turn_in_quest|open_vendor|open_crafting|open_market`. Conditions gebruiken een gesloten predicate registry, geen scripts. Graph van dialogue entries moet bereikbaar en eindig of expliciet loop-allowed zijn.

### 5.10 `ui_theme` versie 1

```json
{
  "displayName":"Main theme",
  "tokens":{
    "colorBackground":"#111318E6",
    "colorSurface":"#1B2029F2",
    "colorText":"#F5F7FA",
    "colorMuted":"#AAB2BF",
    "colorAccent":"#41C7A5",
    "colorDanger":"#E85B67",
    "colorFocus":"#FFD166",
    "fontFamily":"system-ui",
    "fontSizeBasePx":16,
    "spaceUnitPx":4,
    "radiusPx":6,
    "borderWidthPx":1,
    "motionFastMs":100,
    "motionNormalMs":180
  }
}
```

- Kleuren zijn `#RRGGBB` of `#RRGGBBAA`.
- Font family is een enum: `system-ui|serif|monospace` of een vooraf gevalideerde fontassetref; geen vrije CSS.
- Base font 14..22 px, radius 0..8 px.
- Compiler controleert text/background contrast voor standaardparen en blokkeert onder WCAG AA 4.5:1 voor normale tekst.

### 5.11 `ui_screen` versie 1

```json
{
  "displayName":"In-game HUD",
  "screenKey":"hud",
  "presentation":"overlay",
  "inputMode":"game_and_ui",
  "pausePolicy":"none",
  "rootLayoutRef":"doc:...",
  "themeRef":"doc:...",
  "initialFocusWidgetKey":null,
  "escapeAction":"open_pause"
}
```

Verplichte screen keys:

```text
boot, auth, intro, main_menu, character_select, character_create,
loading_world, hud, pause, inventory, equipment, quest_log,
dialogue, vendor, crafting, market, death, reconnect, fatal_error
```

`presentation=exclusive|overlay|modal`; `inputMode=ui_only|game_only|game_and_ui`; `pausePolicy=none|local_preview_only`. Een online published game pauzeert de server nooit via een menu.

### 5.12 `ui_layout` versie 1

```json
{
  "displayName":"HUD layout",
  "layoutKey":"hud.main",
  "variants":[
    {
      "entryId":"entry:...",
      "variantKey":"compact",
      "when":{"maxInlinePx":599,"input":"any"},
      "placements":[
        {"entryId":"entry:...","widgetRef":"doc:...","area":"top_left","order":10,"span":1}
      ]
    },
    {
      "entryId":"entry:...",
      "variantKey":"wide",
      "when":{"minInlinePx":1024,"input":"any"},
      "placements":[]
    }
  ]
}
```

Exacte widthklassen:

- compact: 0..599 CSS px;
- medium: 600..1023;
- wide: >=1024.

Input filter: `any|pointer_fine|touch|gamepad`. Per size/inputcombinatie mag exact één variant winnen. Specificiteit: input-specifiek boven any; daarna smalste interval; daarna variantKey ascending. Compiler blokkeert gaten voor verplichte screens.

### 5.13 `ui_widget` versie 1

```json
{
  "displayName":"Player health",
  "widgetKey":"hud.player_health",
  "widgetType":"progress_bar",
  "bindings":{
    "value":"player.health.current",
    "maximum":"player.health.maximum",
    "label":"player.health.label"
  },
  "actions":{},
  "props":{
    "orientation":"horizontal",
    "showValue":true,
    "tone":"health"
  },
  "visibilitySelector":"session.in_game"
}
```

Widgettype, binding slots, selectors, actions en props worden door de registries in sectie 18 bepaald. Onbekende key blokkeert publish.

### 5.14 `intro_sequence` versie 1

```json
{
  "displayName":"Main intro",
  "playPolicy":"once_per_build_per_account",
  "skippableAfterMs":500,
  "maxTotalDurationMs":30000,
  "steps":[
    {
      "entryId":"entry:...",
      "kind":"logo",
      "assetId":"asset:...",
      "durationMs":2500,
      "transition":"fade",
      "transitionMs":300,
      "textKey":null,
      "fallbackText":null
    }
  ],
  "musicTrackRef":null
}
```

Step kinds: `logo|image|video|model_preview|text`. Video is muted tot usergesture; intro-muziek gebruikt Fase-2-audio en start pas na audio-unlock. Step 250..15000 ms; total <=30000. `prefers-reduced-motion` vervangt movement transitions door 0/100 ms opacity en video autoplay door poster + continue.

### 5.15 `input_action_map` versie 1

Logical actions:

```text
move_x, move_y, camera_x, camera_y, interact, primary,
ability_1..ability_12, inventory, quest_log, map, pause,
ui_up, ui_down, ui_left, ui_right, ui_accept, ui_back,
next_tab, previous_tab
```

Bindings zijn typed keyboard code, pointer button, touch control of standard gamepad button/axis. Reserved browser/system shortcuts mogen niet worden gekaapt. Iedere UI action heeft altijd keyboardbinding; drag-only interactions zijn verboden.

---

## 6. Account-, character- en savearchitectuur

### 6.1 Begrippen

- `users`: authentication/account identity uit bestaande auth.
- `player_profiles`: één game-accountprofiel per user; account-wide selectie en voorkeuren.
- `player_characters`: meerdere speelbare characters per profile.
- character state tables: progression, inventory, equipment, quest, world en economy per character.
- world instance state: ephemeral authoritative Fase-3-runtime.

### 6.2 `player_profiles` versie 2

De bestaande `player_profiles` blijft de accounttabel. Zij wordt niet hernoemd of vervangen, omdat bestaande tabellen er al met foreign keys naar verwijzen. De migration inspecteert eerst met `PRAGMA table_info('player_profiles')` of iedere kolom ontbreekt en voert daarna binnen `BEGIN IMMEDIATE` alleen de ontbrekende `ALTER TABLE`-stappen uit:

```sql
ALTER TABLE player_profiles
  ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(settings_json));

ALTER TABLE player_profiles
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision >= 1);
```

De bestaande kolommen `id`, `user_id`, `display_name`, `selected_character_id`, `created_at` en `updated_at` blijven ongewijzigd. `selected_character_id` krijgt bewust geen circulaire foreign key. Nadat `player_characters` uit 6.3 bestaat, dwingt deze trigger dezelfde ownership- en lifecycleregel af:

```sql
CREATE TRIGGER trg_profile_selected_character_guard
BEFORE UPDATE OF selected_character_id ON player_profiles
WHEN NEW.selected_character_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM player_characters c
   WHERE c.id = NEW.selected_character_id
     AND c.profile_id = NEW.id
     AND c.status IN ('active','deletion_pending')
 )
BEGIN
  SELECT RAISE(ABORT, 'PROFILE_SELECTED_CHARACTER_INVALID');
END;
```

De characterselect-service controleert dezelfde regel voor de transactie. De trigger is de laatste databasebarriere tegen een programmeerfout of cross-account-selectie. Bij characterpurge zet dezelfde transactie eerst `selected_character_id = NULL`, verwijdert daarna het character en verhoogt de profielrevision. Na de migration zijn `PRAGMA foreign_key_check`, `PRAGMA integrity_check` en een rollbacktest verplicht.

### 6.3 `player_characters`

```sql
CREATE TABLE player_characters (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 0 AND 11),
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  template_runtime_key TEXT NOT NULL,
  template_document_id TEXT NOT NULL,
  appearance_json TEXT NOT NULL CHECK (json_valid(appearance_json)),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('creating','active','deletion_pending','deleted')),
  created_build_id TEXT NOT NULL,
  last_played_build_id TEXT,
  last_played_at TEXT,
  deletion_requested_at TEXT,
  purge_after TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  UNIQUE (profile_id, slot_index)
);

CREATE UNIQUE INDEX idx_player_characters_name_key_live
ON player_characters(name_key)
WHERE status IN ('creating','active','deletion_pending');

CREATE INDEX idx_player_characters_profile_status
ON player_characters(profile_id, status, slot_index);
```

`appearance_json` is exact:

```ts
interface CharacterAppearanceV1 {
  schemaVersion: 1;
  selections: Array<{ groupKey: string; optionKey: string }>;
}
```

Array is groupKey ascending, ieder group exact eenmaal.

### 6.4 Character state head

```sql
CREATE TABLE character_state_heads (
  character_id TEXT PRIMARY KEY,
  global_revision INTEGER NOT NULL DEFAULT 1 CHECK (global_revision >= 1),
  last_persisted_tick INTEGER NOT NULL DEFAULT 0 CHECK (last_persisted_tick >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);

CREATE TABLE character_slice_revisions (
  character_id TEXT NOT NULL,
  slice_key TEXT NOT NULL CHECK (slice_key IN (
    'identity','position','progression','stats','inventory','equipment',
    'abilities','wallet','quests','dialogue','unlocks','world','economy'
  )),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  PRIMARY KEY (character_id, slice_key),
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);
```

Iedere state transaction verhoogt `global_revision` exact eenmaal en zet alle gewijzigde slicerevisions op die nieuwe waarde.

### 6.5 Position/checkpoint

```sql
CREATE TABLE character_positions (
  character_id TEXT PRIMARY KEY,
  world_runtime_key TEXT NOT NULL,
  region_runtime_key TEXT NOT NULL,
  x_mm INTEGER NOT NULL,
  y_mm INTEGER NOT NULL,
  z_mm INTEGER NOT NULL,
  yaw_millideg INTEGER NOT NULL,
  safe_spawn_runtime_key TEXT,
  build_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);

CREATE TABLE character_checkpoints (
  character_id TEXT NOT NULL,
  checkpoint_kind TEXT NOT NULL
    CHECK (checkpoint_kind IN ('character','instance','region')),
  checkpoint_runtime_key TEXT NOT NULL,
  world_runtime_key TEXT NOT NULL,
  region_runtime_key TEXT NOT NULL,
  x_mm INTEGER NOT NULL,
  y_mm INTEGER NOT NULL,
  z_mm INTEGER NOT NULL,
  yaw_millideg INTEGER NOT NULL,
  activated_at TEXT NOT NULL,
  PRIMARY KEY (character_id, checkpoint_kind),
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);
```

### 6.6 Canonical state tablefamilies

Legacy tabellen krijgen nieuwe character-authoritytabellen; zij worden niet permanent dual-written:

| Legacy player table | Canonical character table | Kernkey |
| --- | --- | --- |
| `player_progression` | `character_progression` | character_id |
| `player_stats` | `character_stats` | character_id, stat_runtime_key |
| `player_inventory_stacks` | `character_inventory_stacks` | stack_id; unique character/item/bind |
| `player_item_instances` | `character_item_instances` | id |
| `player_equipment` | `character_equipment` | character_id, slot_runtime_key |
| `player_currencies` | `character_currencies` | character_id, currency_runtime_key |
| `player_abilities` | `character_abilities` | character_id, ability_runtime_key |
| `player_ability_loadouts` | `character_ability_loadouts` | character_id, loadout, slot |
| `player_quest_states` | `character_quest_states` | character_id, quest_runtime_key |
| `player_objective_progress` | `character_objective_progress` | character/quest/step/objective |
| dialogue/flags/reputation/unlocks/discoveries | zelfde prefix `character_` | character + semantic key |
| crafting/vendor buyback/mail/party/trade/market ownership | bestaande tabel gerebuild met `character_id` | feature-specific |

Nieuwe state gebruikt runtimeKeys uit de pinned build plus waar nodig provenance. Geen canonical authoring `documentId` wordt als gameplayprimary key gebruikt.

### 6.7 Operations en outbox

```sql
CREATE TABLE character_operations (
  character_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed','rejected')),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  resulting_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (character_id, request_id),
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);

CREATE TABLE character_event_outbox (
  event_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  global_revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);

CREATE INDEX idx_character_outbox_pending
ON character_event_outbox(delivered_at, created_at);
```

Outboxdelivery mag retryen; client dedupliceert `eventId`.

---

## 7. Save-aggregate en transactionregels

### 7.1 Character aggregate

Een `CharacterAggregate` snapshot bevat:

```ts
interface CharacterAggregateV1 {
  schemaVersion: 1;
  characterId: string;
  profileId: string;
  globalRevision: number;
  buildId: string;
  identity: CharacterIdentitySnapshot;
  position: CharacterPositionSnapshot;
  progression: ProgressionSnapshot;
  stats: StatsSnapshot;
  inventory: InventorySnapshot;
  equipment: EquipmentSnapshot;
  abilities: AbilityLoadoutSnapshot;
  wallet: WalletSnapshot;
  quests: QuestSnapshot;
  unlocks: UnlockSnapshot;
  world: PersonalWorldSnapshot;
  economy: EconomySnapshot;
  sliceRevisions: Record<SliceKey, number>;
}
```

Dit is een querysnapshot, geen JSON-blob authority. Tabellen blijven genormaliseerd.

### 7.2 Transactiontemplate

Iedere persistente RPG-commandhandler doet exact:

1. authenticate en character ownership;
2. validate build/world/session;
3. canonical requesthash berekenen;
4. `BEGIN IMMEDIATE`;
5. bestaande operation op `(characterId,requestId)` controleren;
6. relevante rows lezen en revisions controleren;
7. command opnieuw server-side valideren;
8. alle state/ledger/receipts muteren;
9. global revision eenmaal verhogen;
10. slice revisions zetten;
11. outboxevents toevoegen;
12. operationresponse toevoegen;
13. `COMMIT`;
14. gecommitte events naar actieve session publiceren.

Bij exception: `ROLLBACK`; geen event wordt verstuurd.

### 7.3 Savefrequentie

- Inventory/equipment/wallet/quest/reward/economy: onmiddellijk per transaction.
- Position: maximaal iedere 5 s, plus Regionovergang, checkpoint, safe logout en disconnect.
- Current combat resources: authoritative in memory; checkpoint iedere 10 s en bij safe logout/death. Crash kan maximaal 10 s transient HP/resource verliezen, nooit durable items/rewards.
- Cooldowns/effects: ephemeral volgens Fase 3, niet over normale langere logout bewaren.
- UI panelstate: local/session, geen gameplay save.

### 7.4 Recovery

Bij join:

- DB transaction leest aggregate op één consistente snapshot;
- unknown runtimeKeys worden vergeleken met build migrations/aliases;
- ontbrekende vereiste definition geeft `CHARACTER_CONTENT_INCOMPATIBLE` en blokkeert join zonder state te wijzigen;
- invalid position valt via gecontroleerde respawnorder terug, met audit event;
- inventory/economyledger wordt nooit stil gerepareerd; reconciliation levert expliciet report/repair transaction.

---

## 8. Runtime buildpackages voor Fase 4

### 8.1 Manifestuitbreiding

```json
{
  "rpgSchemaVersion":1,
  "uiSchemaVersion":1,
  "characterSchemaVersion":1,
  "packages":{
    "boot":"packages/boot.json",
    "characters":"packages/characters.json",
    "rpg":"packages/rpg.json",
    "ui":"packages/ui.json"
  }
}
```

### 8.2 Bootpackage

```ts
interface BootPackageV1 {
  schemaVersion: 1;
  buildId: string;
  projectDisplayName: string;
  themeIndex: number;
  introIndex: number|null;
  screenIndexes: Record<RequiredScreenKey, number>;
  criticalAssets: Array<{
    assetId: string;
    url: string;
    sha256: string;
    mediaType: string;
    byteLength: number;
    purpose: "theme"|"intro"|"menu"|"error";
  }>;
  minimumClientProtocol: 1;
}
```

### 8.3 Critical preloadbudget

- Boot JSON totaal <= 512 KiB ongecomprimeerd.
- Critical assets vóór eerste menu <= 8 MiB compressed.
- Intro video telt niet critical; poster/logo wel.
- Character model/equipment laadt on demand na list response.
- Preload concurrency 4 desktop, 2 bij `navigator.connection.saveData===true` waar beschikbaar.
- Hash mismatch retry exact eenmaal met `cache: no-store`, daarna recoverable error.

---

## 9. Applicatie-bootstate machine

### 9.1 States

```text
COLD
-> SHELL_READY
-> CAPABILITY_CHECK
-> BOOTSTRAP_LOADING
-> BOOTSTRAP_VALIDATING
-> SESSION_CHECK
-> CORE_PRELOAD
-> AUDIO_UNLOCK_PENDING
-> INTRO
-> MAIN_MENU
-> AUTH_REQUIRED
-> CHARACTER_SELECT
-> CHARACTER_CREATE
-> WORLD_JOIN_REQUEST
-> WORLD_CONNECTING
-> WORLD_PRELOADING
-> ACTOR_SPAWNING
-> IN_GAME
-> RECONNECTING
-> RETURNING_TO_MENU
-> RECOVERABLE_ERROR
-> FATAL_ERROR
```

`AUDIO_UNLOCK_PENDING` is een subgate: intro/menu kan visueel verschijnen; audio start pas na usergesture.

### 9.2 Transitionrecord

```ts
interface AppTransition {
  transitionId: string;
  from: AppState;
  to: AppState;
  reason: string;
  startedAtMonotonicMs: number;
  abortController: AbortController;
}
```

Exact één transition mag actief zijn. Nieuwe navigation annuleert fetch/loaders/listeners van de vorige state. Iedere async completion controleert transitionId vóór commit.

### 9.3 Transitiontable

| State | Entry action | Success | Timeout/failure |
| --- | --- | --- | --- |
| COLD | DOM refs en global error boundary | SHELL_READY | FATAL_ERROR |
| SHELL_READY | boot screen mount, renderer lazy init | CAPABILITY_CHECK | FATAL_ERROR |
| CAPABILITY_CHECK | WebGL2/ESM/WebSocket/storage/cookies testen | BOOTSTRAP_LOADING | FATAL_ERROR met eisen |
| BOOTSTRAP_LOADING | GET `/api/game/bootstrap` | VALIDATING | 10 s -> RECOVERABLE |
| VALIDATING | schema/build/hash/required screens | SESSION_CHECK | FATAL_ERROR |
| SESSION_CHECK | GET `/api/auth/session` | CORE_PRELOAD | network -> RECOVERABLE |
| CORE_PRELOAD | critical assets en theme | INTRO of MAIN_MENU | 20 s -> RECOVERABLE |
| INTRO | sequence; skip policy | MAIN_MENU | asset skip/fallback |
| MAIN_MENU | menu screen | AUTH_REQUIRED/CHARACTER_SELECT | geen timeout |
| AUTH_REQUIRED | login/register | CHARACTER_SELECT | typed auth error |
| CHARACTER_SELECT | list + selected preview | CREATE of JOIN | preview failure blijft selectable |
| CHARACTER_CREATE | validate/create transaction | CHARACTER_SELECT | field/server error |
| WORLD_JOIN_REQUEST | POST join ticket | WORLD_CONNECTING | reject -> SELECT |
| WORLD_CONNECTING | WS subprotocol + ticket | WORLD_PRELOADING | 12 s -> RECONNECT/SELECT |
| WORLD_PRELOADING | required Cells/nav/assets/snapshot | ACTOR_SPAWNING | 30 s -> RECOVERABLE |
| ACTOR_SPAWNING | server spawn confirmation | IN_GAME | 10 s -> RECONNECT |
| IN_GAME | world/HUD/input | RECONNECTING/RETURNING | runtime policy |
| RECONNECTING | exponential reconnect/resync | IN_GAME/SELECT | max 30 s -> SELECT |
| RETURNING_TO_MENU | flush safe state, teardown world | CHARACTER_SELECT | 15 s -> forced disconnect/select |

### 9.4 Legal transitions

Een transition buiten de table gooit development error `APP_TRANSITION_ILLEGAL`; production logt en blijft in huidige state. DOM-knoppen dispatchen events naar de controller en stellen geen state rechtstreeks in.

### 9.5 History en back

- Browser history gebruikt `replaceState/pushState` met alleen screen key en characterId, nooit save data.
- Back sluit bovenste modal/panel, daarna gaat van character create naar select, select naar main menu.
- Back vanuit IN_GAME opent pause; verlaat world nooit zonder confirm.
- Reload in IN_GAME start opnieuw bij bootstrap en mag een geldige reconnect intent uit sessioncookie/last character gebruiken, maar vraagt serverauthority.

---

## 10. Engine boot en intro

### 10.1 HTML shell

De eerste HTML bevat alleen:

- een canvas;
- `#uiRoot` met live region en boot status;
- een no-script melding;
- import map naar lokale locked dependencies;
- viewport `width=device-width, initial-scale=1, viewport-fit=cover` zonder maximum-scale/user-scalable blokkade.

### 10.2 Bootstrapendpoint

```text
GET /api/game/bootstrap
Cache-Control: no-store
```

Response:

```json
{
  "protocolVersion":1,
  "buildId":"build:...",
  "manifestUrl":"/api/game/builds/build:.../manifest",
  "bootPackage":{...},
  "sessionHint":{"authenticated":true},
  "serverTime":"..."
}
```

Endpoint geeft geen private characterdata zonder auth. Build ID wordt vanaf deze response gepind.

### 10.3 Capabilitycheck

Hard vereist:

- ES modules;
- WebGL2 of Fase-2-geaccepteerde WebGL fallback;
- WebSocket;
- cookies/session;
- `crypto.getRandomValues`;
- `AbortController`;
- CSS Grid/Flex en custom properties.

Container queries, ResizeObserver en Gamepad hebben geteste fallbacks. Failuretekst is menselijk en biedt retry/reload, geen stacktrace.

### 10.4 Intro lifecycle

- Mount intro DOM/scene pas na bootpackagevalidatie.
- Assetload is abortable.
- Iedere step heeft monotone starttime en exact één completion.
- Skipbutton verschijnt na `skippableAfterMs`, is keyboard/touch bereikbaar en 44x44 CSS px.
- `once_per_build_per_account` wordt server-side account preference na completion/skip opgeslagen; localStorage is slechts snelle hint.
- Visibility hidden pauzeert visuele timer; server/session timeouts niet.
- Teardown stopt video/audio, verwijdert listeners, releases previewobjects en herstelt focus naar menu.

---

## 11. Characterlist, creatie, deletion en selectie

### 11.1 Characterlistsnapshot

```ts
interface CharacterListSnapshotV1 {
  schemaVersion: 1;
  profileRevision: number;
  selectedCharacterId: string|null;
  slotCount: number;
  characters: Array<{
    characterId: string;
    slotIndex: number;
    displayName: string;
    templateRuntimeKey: string;
    level: number;
    appearance: CharacterAppearanceV1;
    equipmentVisuals: EquipmentVisualSnapshot[];
    lastRegionDisplayName: string|null;
    lastPlayedAt: string|null;
    status: "active"|"deletion_pending";
    restoreUntil: string|null;
    revision: number;
  }>;
}
```

Sortering is slotIndex, daarna characterId.

### 11.2 Create command

```json
{
  "requestId":"uuid",
  "expectedProfileRevision":4,
  "slotIndex":1,
  "displayName":"Ayla Stone",
  "templateRuntimeKey":"character.fighter",
  "appearance":{"schemaVersion":1,"selections":[...]},
  "buildId":"build:..."
}
```

Server transaction:

1. auth/profile/revision/slot/name/build/template controleren;
2. character row `creating` toevoegen;
3. state head/slices/position/progression/stats aanmaken;
4. startgrants via ledger/idempotent grant engine;
5. equipment/loadout/abilities aanmaken;
6. `status=active` en profile revision verhogen;
7. outbox `character.created`;
8. commit.

Nooit bestaat een zichtbaar half character. `creating` rows van een gecrashte uncommitted transaction bestaan niet.

### 11.3 Delete en restore

- Delete vereist een server-issued nonce, exact overgetypte displayName en recente re-auth wanneer session ouder dan 30 minuten is.
- Transaction zet `deletion_pending`, `deletion_requested_at`, `purge_after=+168h`, wist selectie indien nodig en disconnect actieve actor.
- Character kan tot purge worden restored naar een vrije slot; naam blijft gereserveerd.
- Purgejob hard-deletet via cascades in batches van maximaal 10 en schrijft accountaudit zonder savepayload.
- De laatste character mag worden verwijderd; select toont daarna Create.

### 11.4 Select

Selectie is accountvoorkeur, geen world join. `SelectCharacter` controleert ownership/status en zet `player_profiles.selected_character_id` + revision. Client toont pas geselecteerd na serverresponse.

---

## 12. Character 3D-preview

### 12.1 Renderer

- Exact één `WebGLRenderer` voor menu/preview/world per tab.
- App state wisselt scene/camera en renderpipeline; geen tweede WebGL context.
- Characterpreview gebruikt dezelfde Fase-3 actor/equipment render factories en assetcache.
- Preview heeft geen ActorSim, collision, AI of save state.

### 12.2 Scene

```text
Scene root
  neutral environment
  key light + fill light + contact shadow plane
  character render proxy
    skeleton
    appearance attachments
    equipment attachments
```

- Camera preset `full_body`: perspective 30 deg, frame actor bounding box met 10% marge.
- Orbit yaw maximaal +/-35 graden, pitch -10..20; drag en keyboard arrows; resetbutton.
- Idle animation uit template; ontbrekende optional clip toont bind pose alleen als development diagnostic, production gebruikt gevalideerde fallback idle uit actor set.
- Preview rerendert op appearance/equipmentwijziging, maar serverstate verandert pas bij Create/Equip commands.

### 12.3 Performance

- Max één previewactor actief.
- Renderer stopt bij hidden page en wanneer preview niet zichtbaar is.
- Modelload abort bij andere characterselectie.
- Async result controleert characterId + transitionId.
- Assetrelease volgt Fase-3 reference count/disposal.

---

## 13. World join en characteroverdracht

### 13.1 Join request

```text
POST /api/game/world/join
```

```json
{
  "requestId":"uuid",
  "characterId":"char:...",
  "buildId":"build:...",
  "clientProtocolVersion":1
}
```

Server valideert session, ownership, status, buildcompatibility en geen conflicterende active lease. Response:

```json
{
  "joinTicket":"opaque-256-bit-token",
  "expiresAt":"...",
  "worldInstanceId":"worldinst:...",
  "buildId":"build:...",
  "webSocketPath":"/api/game/world/socket",
  "requiredCellKeys":["..."]
}
```

Ticket:

- random 256 bit, alleen hash server-side;
- single use;
- 30 s geldig;
- gebonden aan session, character, build en world instance.

### 13.2 WebSocket handshake

Client opent dezelfde-origin WebSocket met subprotocol uit Fase 3 en stuurt `world.join` ticket. Server:

1. consumeert ticket atomic;
2. verkrijgt character lease;
3. laadt consistente aggregate;
4. maakt Fase-3 player actor;
5. past stats/equipment/abilities/appearance toe;
6. resolveert safe position;
7. stuurt `world.join.accepted` en full snapshots;
8. activeert input pas na client `world.ready`.

### 13.3 Character lease

```sql
CREATE TABLE character_session_leases (
  character_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  world_instance_id TEXT NOT NULL,
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);
```

Lease heartbeat iedere 5 s, expiry 20 s. Nieuwe join kan verlopen lease overnemen met epoch+1. Events/commands met oude epoch worden geweigerd.

### 13.4 Ready gate

Client stuurt ready pas wanneer:

- full character/UI snapshot toegepast;
- required Fase-2-Cells/navtiles active;
- player model en collision ready;
- HUD root gemount;
- input listeners klaar maar nog disabled.

Server bevestigt spawn tick; daarna state `IN_GAME` en input enabled.

---

## 14. GameUiStore

### 14.1 State shape

```ts
interface GameUiStateV1 {
  schemaVersion: 1;
  app: AppUiSlice;
  session: SessionUiSlice;
  characters: CharacterUiSlice;
  world: WorldUiSlice;
  player: PlayerUiSlice;
  target: TargetUiSlice;
  inventory: InventoryUiSlice;
  equipment: EquipmentUiSlice;
  abilities: AbilityUiSlice;
  wallet: WalletUiSlice;
  quests: QuestUiSlice;
  dialogue: DialogueUiSlice;
  interaction: InteractionUiSlice;
  crafting: CraftingUiSlice;
  vendor: VendorUiSlice;
  market: MarketUiSlice;
  minimap: MinimapUiSlice;
  notifications: NotificationUiSlice;
  panels: PanelUiSlice;
  network: NetworkUiSlice;
  preferences: PreferenceUiSlice;
  revisions: Record<string, number>;
}
```

State bevat JSON-compatible data, geen DOM nodes, Three objects, AudioNodes, functions, promises of mutable Maps. Runtime mag intern normalized maps gebruiken, maar public snapshots zijn readonly.

### 14.2 Store interface

```ts
interface GameUiStore {
  getState(): Readonly<GameUiStateV1>;
  dispatch(event: UiDomainEvent): void;
  subscribe<T>(
    selector: (state: Readonly<GameUiStateV1>) => T,
    listener: (next: T, previous: T) => void,
    equals?: (a: T, b: T) => boolean
  ): () => void;
  replaceFromSnapshot(snapshot: GameUiSnapshotV1): void;
  destroy(): void;
}
```

### 14.3 Dispatch

- Events worden synchroon gevalideerd en door pure reducer verwerkt.
- Meerdere events in dezelfde task veranderen store direct, maar notifications naar views worden per selector gecoalesced.
- Eén `requestAnimationFrame` patcht alle dirty views.
- Critical accessible live text mag via microtask worden gezet, maximaal één samengevoegde boodschap per 250 ms.
- Reducers muteren previous state niet; unchanged slices behouden referentie-identiteit.

### 14.4 Revisionregels

Een authoritative event heeft `globalRevision` en `sliceRevision`:

- `< current`: duplicate/oud, negeren;
- `== current` met bekend eventId: duplicate, negeren;
- `== current+1` of slice-consistent transaction bundle: toepassen;
- gat: zet slice `stale`, disable muterende UI ervoor en vraag `state.resync`;
- full snapshot vervangt alleen bij `globalRevision >= current`.

Ephemeral combat/world events gebruiken serverTick/eventSequence, niet character global revision, tenzij zij persistence wijzigen.

### 14.5 Selectorregels

- Selectors zijn pure named functions in code.
- Canonical UI bindings gebruiken selector keys, geen property paths of expressions.
- Selectoroutput is primitive of stable readonly viewmodel.
- Expensive lists memoizen op relevante slice identity/revision.
- Een selector leest nooit `Date.now`; tijdafhankelijke UI gebruikt één ClockService-event maximaal 4 Hz, countdowns in gameframe alleen wanneer zichtbaar.

---

## 15. UI domain events

### 15.1 Envelope

```ts
interface UiDomainEvent<T> {
  schemaVersion: 1;
  eventId: string;
  type: UiEventType;
  source: "server"|"client_local"|"boot";
  characterId: string|null;
  buildId: string;
  serverTick: number|null;
  globalRevision: number|null;
  sliceRevision: number|null;
  transactionId: string|null;
  payload: T;
}
```

### 15.2 Eventregistry

Minimaal:

```text
app.state_changed
app.progress_changed
session.changed
characters.snapshot
character.created
character.updated
character.deletion_changed
world.join_progress
world.snapshot
world.connection_changed
player.stats_changed
player.progression_changed
player.death_changed
target.changed
inventory.snapshot
inventory.changed
equipment.changed
abilities.changed
wallet.changed
quest.snapshot
quest.changed
objective.changed
dialogue.opened
dialogue.changed
dialogue.closed
interaction.changed
crafting.changed
vendor.changed
market.changed
minimap.changed
notification.added
panel.changed
preferences.changed
state.resync_required
```

### 15.3 Healthbarvoorbeeld

Fase-3 combat commit:

1. server wijzigt authoritative HP;
2. replication maakt `player.stats_changed`/actor stat event met tick en current/max;
3. network adapter valideert en dispatcht;
4. player reducer vervangt alleen health viewmodel;
5. selector `player.health` verandert;
6. scheduler patcht `aria-valuenow`, labeltekst en CSS custom property in volgende animation frame;
7. geen fetch, interval of DOM-meeting.

Doel: event ontvangst tot zichtbare patch <= één weergegeven frame in foreground.

---

## 16. Selectorregistry

Verplichte selector keys en outputtypes:

| Key | Output |
| --- | --- |
| `app.state` | AppState |
| `app.loading_progress` | `{phase,label,current,total,ratioBps}` |
| `session.authenticated` | boolean |
| `characters.list` | CharacterCardVm[] |
| `characters.selected` | CharacterCardVm/null |
| `player.identity` | name/level/portrait |
| `player.health.current` | Milli |
| `player.health.maximum` | Milli |
| `player.health.ratio_bps` | BasisPoints |
| `player.resources` | ResourceBarVm[] |
| `player.xp` | XpBarVm |
| `target.summary` | TargetVm/null |
| `inventory.items` | ItemStackVm[] |
| `inventory.capacity` | CapacityVm |
| `equipment.slots` | EquipmentSlotVm[] |
| `abilities.hotbar` | AbilitySlotVm[] |
| `wallet.entries` | CurrencyVm[] |
| `quests.tracked` | TrackedQuestVm[] |
| `quests.log` | QuestVm[] |
| `dialogue.session` | DialogueVm/null |
| `interaction.prompt` | InteractionPromptVm/null |
| `crafting.session` | CraftingVm/null |
| `vendor.session` | VendorVm/null |
| `market.session` | MarketVm/null |
| `minimap.model` | MinimapVm |
| `notifications.visible` | NotificationVm[] |
| `network.status` | NetworkVm |
| `session.in_game` | boolean |

Widgetbindings mogen alleen een selector gebruiken die het vereiste slottype levert.

---

## 17. UI actionregistry

### 17.1 Actioninterface

```ts
interface UiActionInvocation {
  actionKey: UiActionKey;
  widgetKey: string;
  input: "pointer"|"keyboard"|"touch"|"gamepad";
  payload: Record<string, string|number|boolean|null>;
  localSequence: number;
}
```

### 17.2 Actions

Local:

```text
open_panel, close_panel, toggle_panel, select_tab, set_filter,
select_character_preview, intro_skip, focus_widget, dismiss_notification
```

Server intents:

```text
login, logout, character_create, character_select,
character_delete, character_restore, enter_world, leave_world,
ability_use, interact, item_use, item_destroy, item_split,
equipment_equip, equipment_unequip, equipment_swap,
quest_accept, quest_abandon, quest_track, quest_turn_in,
dialogue_choose, craft_start, vendor_buy, vendor_sell,
market_buy, market_list, respawn, unstuck
```

Iedere server action heeft code-owned payloadschema en endpoint/message mapping. UI content mag endpoint, actorId, prijs, quantitylimit of permission niet vervangen.

### 17.3 Pending state

Muterende action krijgt `requestId`, zet alleen de betrokken control pending en voorkomt dubbel submit. Timeout toont onbekende status en vraagt operationstatus/resync; hij probeert niet met nieuw requestId opnieuw.

---

## 18. Widgetregistry

### 18.1 Verplichte widgettypes

```text
text, rich_text_safe, icon, image, progress_bar, button,
input_text, select, toggle, list, virtual_list, item_grid,
equipment_slots, ability_bar, currency_list, quest_tracker,
quest_log, dialogue_panel, interaction_prompt, minimap_host,
character_carousel, character_preview_host, loading_progress,
tabs, panel, modal, toast_stack, network_status, spacer, divider
```

### 18.2 Registrycontract

```ts
interface WidgetDefinition<P, B, A> {
  type: string;
  propsSchema: ClosedSchema<P>;
  bindingSlots: Record<keyof B, SelectorOutputType>;
  actionSlots: Record<keyof A, AllowedActionKey[]>;
  create(ctx: WidgetCreateContext<P>): WidgetInstance<B,A>;
}

interface WidgetInstance<B,A> {
  element: HTMLElement;
  update(bindings: Readonly<B>, changed: ReadonlySet<keyof B>): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}
```

### 18.3 DOM-regels

- Native elements eerst: `button`, `input`, `select`, `progress`, headings/lists.
- Geen `innerHTML` met contenttekst; gebruik `textContent`.
- `rich_text_safe` ondersteunt alleen compiler-tokens `text|emphasis|strong|line_break|icon`; runtime maakt nodes.
- Event delegation per screenroot, niet listeners op duizenden rows.
- Lists boven 50 rows gebruiken virtualisatie met vaste/meetbaar gecachte rowhoogte.
- Update verandert alleen dirty attributes/text/styles; geen screenroot rebuild.
- `destroy()` verwijdert subscriptions, observers, listeners en timers.

---

## 19. Responsive layout

### 19.1 CSS-strategie

- CSS Grid/Flex voor structuur.
- Named container `ui-screen` met `container-type:inline-size`.
- Canonical variants worden naar vaste class/data attributes gecompileerd; content levert geen CSS.
- Media queries alleen voor OS voorkeuren en viewport safe fallback; componenten gebruiken container queries.
- Geen font-size op basis van `vw`; discrete tokens en user text scale.

### 19.2 Root

```css
#uiRoot {
  position: fixed;
  inset: 0;
  padding:
    max(var(--safe-top), env(safe-area-inset-top))
    max(var(--safe-right), env(safe-area-inset-right))
    max(var(--safe-bottom), env(safe-area-inset-bottom))
    max(var(--safe-left), env(safe-area-inset-left));
  pointer-events: none;
  container: ui-screen / inline-size;
}
```

Interactive subtree zet pointer-events auto. Canvas/input routing gebruikt explicit hit regions, niet z-indexgokwerk.

### 19.3 Sizegedrag

- Compact: maximaal één modal/panel full-height; HUD toont kernstatus, hotbar en interactprompt; secundaire info via expliciete knoppen.
- Medium: maximaal twee panelkolommen.
- Wide: maximaal drie functionele zones, zonder card-in-card nesting.
- Landscape met block-size <500 px gebruikt low-height variant: compacte bars en bottom sheets.
- Text scale 200% mag horizontal scroll alleen in data tables veroorzaken; hoofdacties blijven zichtbaar.

### 19.4 Safe interaction sizes

- Alle primaire touch/gamepad controls minimaal 44x44 CSS px.
- Muis-only compacte iconbuttons minimaal 32x32, maar krijgen 44x44 variant bij touchinput.
- Minimaal 8 px tussen naastliggende touch targets.
- Geen hover-only informatie/action.

### 19.5 ResizeObserver

Maximaal één observer per mounted screenroot en een gedeelde observer voor previewhost/canvas. Callback leest sizes, schrijft niets dat dezelfde size cyclisch verandert; layoutstatewijziging wordt naar volgende rAF gedeferd. Destroy disconnectt observer.

---

## 20. UI Studio

### 20.1 Doel

Kevin bouwt echte runtime-UI visueel in Werkbank/Instellingen. De Studio schrijft canonical `ui_*` documenten; zij maakt geen nodes of losse HTML.

### 20.2 Schermindeling

```text
Links: Screens + widgettree
Midden: live canvas/DOM preview
Rechts: geselecteerde widget, binding, action en layout
Boven: compact/medium/wide + pointer/touch/gamepad + state scenario
Onder: validation, focus order en performance diagnostics
```

Panelen zijn resizable binnen grenzen en onthouden alleen lokale editorvoorkeur.

### 20.3 Handelingen

- Screen toevoegen uit verplichte screen keys.
- Widget uit registered types slepen of via Add kiezen.
- Widget in named area plaatsen, order/span aanpassen.
- Binding kiezen uit type-filtered menselijke selector picker.
- Action kiezen uit allowed actions voor die widgetslot.
- Previewstate kiezen: normal, low health, inventory full, quest update, dialogue, reconnect, gamepad focus.
- Live theme tokens aanpassen met contrastwaarschuwing.
- Focus order en keyboard/gamepadnavigatie afspelen.
- `Validate screen`, `PlayPreview` en backlinks.

### 20.4 Geen vrije pixels als basis

HUD widgets gebruiken areas/anchors/grid en bounded offsets (-64..64 px). Menu's gebruiken flow/grid. Absolute x/y-positionering is alleen toegestaan voor non-interactive decorative overlay en wordt niet aangeboden in normale UI.

### 20.5 Preview parity

Studio gebruikt exact dezelfde widgetregistry, selectorschemas, compiled theme en layout CSS als game. Alleen de stateprovider is een getypeerde previewfixture. Een fixtureaction schrijft nooit naar echte game/serverstate.

### 20.6 Publishgate

Per screen:

- required selectors/actions bestaan;
- alle size/inputvarianten resolve'en;
- focus graph heeft geen trap behalve modal;
- initial focus bestaat voor exclusive/modal;
- text overflow test met 200% schaal;
- contrast en target size;
- geen unsupported widget;
- scenario render zonder exception.

---

## 21. Input, focus en accessibility

### 21.1 Input arbitration

```text
UI modal/exclusive open -> UI actionmap bezit keyboard/gamepad/pointer
HUD overlay -> canvas bezit movement/camera; interactive HUD hit regions bezitten pointer
text input focused -> gameplay keyboard geblokkeerd behalve emergency escape
gamepad UI focus -> left stick/d-pad UI; world movement geblokkeerd
```

Laatste actieve inputmodus wordt na een echte input veranderd; muisbeweging alleen verandert hem niet.

### 21.2 Focus

- Exclusive screen: focus initial widget na mount.
- Modal: bewaar opener; trap Tab binnen modal; Escape/ui_back sluit indien toegestaan; herstel opener of logische fallback.
- Screen unmount: geen focus op detached element.
- Gamepad gebruikt roving `tabindex` over dezelfde DOM-controls.
- Focusindicator minimaal 2 px en 3:1 change/adjacent contrast.
- Focus mag niet door sticky HUD/footer volledig verborgen worden.

### 21.3 Accessible names/status

- Icon-only buttons hebben authored label/text key.
- Progressbar heeft role/value min/max/now en naam.
- Damage spam gaat niet naar live region; alleen belangrijke status/quest/inventory feedback.
- Live region `polite`, critical disconnect `assertive`, max één message per 250 ms.
- Canvas heeft korte fallbackomschrijving; gameplaystatus is ook via DOM beschikbaar waar nodig.

### 21.4 Motion en audio

- `prefers-reduced-motion`: camera/menu motion uit, fades <=100 ms, geen pulsing/flashing.
- Geen meer dan drie flashes/s.
- UI audio volgt master/UI bus en uservolume; belangrijke errors hebben ook tekst/visueel signaal.

---

## 22. Complete RPG-lus

### 22.1 Lus

```text
character kiezen
-> wereld betreden
-> verkennen / NPC of encounter vinden
-> dialogue / quest accepteren
-> bewegen / verzamelen / bevechten
-> loot, currency en XP ontvangen
-> objectiveprogress en unlocks
-> inventory/equipment/abilities verbeteren
-> leveren / craften / vendor / market
-> quest turn-in en rewards
-> nieuwe content/gebieden vrijspelen
-> veilige persistence
-> verder spelen / logout / hervatten
```

Iedere pijl heeft een serverconsumer, storeevent en zichtbaar UI-resultaat. Een authored feature zonder een van deze drie blokkeert de Definition of Done.

### 22.2 Eventrouter

Fase-3/world services publiceren immutable semantic events naar de RPG eventrouter:

```text
actor.defeated, item.acquired, item.removed, currency.changed,
area.entered, npc.talked, resource.gathered, level.changed,
craft.completed, vendor.transaction, market.transaction,
checkpoint.activated
```

Router matcht canonical quest/XP rules uit pinned build, maakt één transactionplan en voert dit via character transactionservice uit. UI luistert niet rechtstreeks om progressie te beslissen.

---

## 23. Progression en XP

### 23.1 XP grant

Voor source rule:

```text
delta = clamp(sourceLevel - characterLevel, -10, 10)
multiplierBps = clamp(
  10000 + delta * levelDeltaBpsPerLevel,
  minimumMultiplierBps,
  maximumMultiplierBps
)
grantXp = max(0, mulBps(baseXp, multiplierBps))
```

`baseXp` is integer XP, `mulBps` gebruikt Fase-3-rounding. Daily cap 0 betekent geen cap; anders grant = min(grant, cap-used).

### 23.2 Levelberekening

Na XP grant:

1. `xp_total += grant` met safe integercheck;
2. binary search hoogste level waarvan cumulative threshold <= xp_total;
3. clamp maxLevel;
4. voor ieder nieuw level ordered level-up rewards toepassen;
5. stats dirty/rebuild volgens Fase 3;
6. resource policy toepassen;
7. één transactionevent met oude/nieuwe level, XP en grants.

Level daalt niet door XP penalty in Fase 4. XP loss clamped tot huidige levelthreshold.

### 23.3 UI

XP bar toont progress binnen huidig level:

```text
current = xpTotal - threshold(level)
maximum = threshold(level+1) - threshold(level)
```

Max level toont `current=maximum=1` en label `Max level`.

---

## 24. Inventory, equipment, abilities en wallet

### 24.1 Inventory transactionplan

Grant engine:

1. resolve item definition/build;
2. split stackable quantity over bestaande compatible stacks;
3. bereken nieuwe slots/weight;
4. capacity controleren;
5. overflow policy toepassen of volledig reject;
6. rows/ledger/revisions/outbox atomic schrijven.

Geen gedeeltelijke questreward tenzij rewardbundle entry expliciet `optionalOnCapacity=true`; default false.

### 24.2 Optimistic UI

Inventory/equipment/economy wordt niet optimistisch gemuteerd. Drag/drop toont intentghost en pending, maar echte slot/itemverplaatsing volgt serverevent. Dit voorkomt duplicatie en rollbackcomplexiteit.

### 24.3 Equipment

Gebruikt Fase-3 `EquipItem`/`UnequipItem`/swap transaction en events. UI vergelijkt items met derived statdelta uit server previewendpoint of pure shared math; de client commit geen stats.

### 24.4 Abilities

Hotbar bevat granted ability runtimeKeys en slotrevisions. Cooldownvisual gebruikt server start/end tick plus gesynchroniseerde servertijd. Bij resync corrigeert de radial/progressbar; client kan cooldown nooit verkorten.

### 24.5 Wallet

Currency gebruikt integer minor units. Iedere wijziging heeft ledgerentry:

```text
ledgerId, characterId, currencyKey, deltaMinor, balanceAfterMinor,
sourceType, sourceOperationId, createdAt
```

Server weigert een transaction die saldo negatief maakt, behalve een expliciet currencydefinition overdraftbeleid; Fase 4 biedt dat niet, dus minimum 0.

---

## 25. Quests, objectives, dialogue en rewards

### 25.1 Queststate machine

```text
locked -> available -> active -> ready_to_turn_in -> completed
                       \-> abandoned -> available (indien policy)
```

Version 1 heeft geen failed state in normale authoring; legacy failed rows importeren als manual review. Repeat `once_per_character|repeatable`; repeatable reset objectives/receipts met nieuwe `questRunId`.

### 25.2 Objective consumption

- collect: inventory count observer, niet item automatisch verwijderen;
- deliver: turn-in transaction verwijdert exact vereiste items;
- defeat: Fase-3 death event, source character/party attribution;
- reach: authoritative Area/target entry;
- talk: geldige dialogue session/entry;
- level: progression state.

Event receipt key `(characterId,questRunId,eventId,objectiveEntryId)` voorkomt dubbel progress.

### 25.3 Turn-in transaction

In één transaction:

1. quest active/ready en revision;
2. alle objectivewaarden/conditions;
3. deliver-items/currencykosten verwijderen;
4. reward capacity/requirements plannen;
5. rewards/XP/unlocks verlenen;
6. quest completed/claimed;
7. next quest availability afleiden;
8. revisions, audit, receipt, ledger en outbox;
9. commit.

Een crash kan nooit kosten verwijderen zonder rewards of rewards dubbelen.

### 25.4 Dialogue sessions

Dialogue is server-owned session:

```ts
interface DialogueSession {
  dialogueSessionId: string;
  characterId: string;
  sourceActorId: string;
  dialogueRuntimeKey: string;
  currentEntryId: string;
  allowedChoiceEntryIds: string[];
  revision: number;
  expiresAtTick: number;
}
```

Choicecommand bevat sessionId, revision en choiceEntryId. Server controleert range/LOS/actor/state/conditions opnieuw. Client kan geen verborgen choice sturen.

---

## 26. Crafting, vendor en market

### 26.1 Crafting

- Open session valideert stationinteraction.
- Recipe list komt uit published definitions plus character unlocks.
- Startcommand valideert session, ingredients, currency, capacity en batch.
- Inputs worden atomic gereserveerd/verwijderd; job of instant result ontstaat.
- Completion grant via operationId; volle inventory naar `pending_delivery` alleen als policy dat toestaat.
- UI timer is afgeleid, server completion authority.

### 26.2 Vendor

- Vendor session gebonden aan actor, catalog, character, range en expiry.
- Buy/sellcommand bevat offer/item, quantity, expected stockrevision en requestId.
- Price komt van servercatalog, nooit UI.
- Currency/item/stock/buyback/ledger/outbox in één transaction.

### 26.3 Market

Fase 4 ondersteunt bestaande fixed-price listings:

- listing create reserveert iteminstance/quantity atomic;
- buy verplaatst currency/item en fees atomic;
- offline/full inventory delivery via canonical pending delivery/mailtable;
- geen client-authoritative price totals;
- pagination cursor server-side; UI virtualiseert resultaten.

### 26.4 Panelintegratie

Dialogue action opent server session en daarna het relevante panel. Panel close sluit lokale view en stuurt best-effort session close; server expiry voorkomt stale use.

---

## 27. Death, respawn, reconnect en logout

### 27.1 Player death UI

Fase-3 deathevent zet player death slice. HUD input sluit, death screen opent na serverstate. Respawnbutton activeert pas op server `respawnAvailableTick`. Countdown is presentatie.

### 27.2 Respawn transaction

1. actor dead en timer klaar;
2. resolve checkpoint order;
3. validate nav/world/build;
4. penalties atomic met ledger;
5. persisted position/checkpoint/revisions/outbox;
6. ActorSim maakt/revive actor volgens Fase 3;
7. full player stat/position event.

### 27.3 Reconnect

- WebSocketverlies toont overlay, gameplay input stopt.
- Pogingen op 0.5, 1, 2, 4, 8 s plus 0..250 ms jitter, max 30 s.
- Reconnect gebruikt session + character lease epoch, nooit oud join ticket.
- Server stuurt full snapshot; client vervangt ephemeral world/UI state en behoudt alleen lokale preferences/panel intent die nog geldig is.
- Na lease/grace expiry terug naar character select met duidelijke status.

### 27.4 Safe logout

Logout/world leave:

1. client `world.leave.request`;
2. server stopt nieuwe combat/economy intents;
3. immediate durable flush position/resources;
4. actor despawn/lease release;
5. `world.leave.accepted`;
6. client teardown naar select;
7. account logout verwijdert sessioncookie en sluit sockets.

Tab close gebruikt geen onbetrouwbare client save; server disconnect/grace handelt persistence af.

---

## 28. World- en persoonlijke state

### 28.1 Drie scopes

| Scope | Voorbeeld | Authority |
| --- | --- | --- |
| Authored build | questdefinition, spawn, UI | immutable published build |
| Shared runtime | enemy occurrence, vendor world stock | world instance/server |
| Character | position, discoveries, quest, loot claim | character DB state |

Geen tabel mag dezelfde state in twee scopes bezitten.

### 28.2 Personal world state

Character-specific flags/discoveries/one-time interactions gebruiken semantic runtime keys plus build provenance. Een world entity renderer combineert authored definition, shared state en personal visibility projection, maar verandert authored world nooit.

### 28.3 Build upgrade

Nieuwe session gebruikt active published build. Bestaande characters worden bij join door `CharacterBuildMigrator` gecontroleerd:

- runtimeKey bestaat: direct;
- exact alias uit Fase 1: migratie transaction;
- optional removed cosmetic: remove + audit;
- required item/quest/region ontbreekt: join blokkeren met compatibility report;
- nooit displayName-matchen of stil vervangen.

---

## 29. HTTP- en WebSocketcontract

### 29.1 HTTP

```text
GET  /api/game/bootstrap
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
GET  /api/game/characters
POST /api/game/characters
POST /api/game/characters/:id/select
POST /api/game/characters/:id/delete
POST /api/game/characters/:id/restore
GET  /api/game/characters/:id/preview
POST /api/game/world/join
GET  /api/game/operations/:requestId
GET  /api/game/state/snapshot?characterId=...
```

Mutations vereisen sessioncookie, CSRF-header, requestId en relevante expected revision.

### 29.2 Characterpreview response

Bevat alleen gevalideerde runtime indexes/asset URLs uit pinned build, appearance en equipment visuals. Geen raw DB rows of private inventory.

### 29.3 WebSocket

Fase-3 wire envelope blijft. Fase 4 voegt channels toe:

```text
ui.snapshot
character.delta
inventory.delta
equipment.delta
wallet.delta
quest.delta
dialogue.state
economy.state
operation.result
state.resync
```

Server bundelt dezelfde transactionId/revision events zodat client ze atomic in één store dispatchbatch toepast.

### 29.4 Backpressure

- Durable operation results en critical RPG deltas zijn reliable/coalescen niet.
- Repeated slice deltas mogen naar laatste complete slicestate coalescen als transaction ordering behouden blijft.
- Bij soft queue limit vraagt server/client full resync in plaats van duizenden deltas.
- Bij hard limit sluit server slow consumer volgens Fase 3.

---

## 30. Foutafhandeling

### 30.1 Error envelope

```ts
interface GameError {
  code: string;
  message: string;
  recoverability: "retry"|"return_to_select"|"reload"|"support";
  fieldErrors?: Record<string,string>;
  requestId?: string;
  correlationId: string;
}
```

### 30.2 Codes

Minimaal:

```text
BOOTSTRAP_UNAVAILABLE
BOOTSTRAP_SCHEMA_UNSUPPORTED
BUILD_CHANGED_RELOAD_REQUIRED
CRITICAL_ASSET_FAILED
SESSION_REQUIRED
SESSION_EXPIRED
CHARACTER_SLOT_OCCUPIED
CHARACTER_NAME_INVALID
CHARACTER_NAME_TAKEN
CHARACTER_NAME_RESERVED
CHARACTER_TEMPLATE_INVALID
CHARACTER_REVISION_CONFLICT
CHARACTER_DELETION_PENDING
CHARACTER_CONTENT_INCOMPATIBLE
WORLD_JOIN_TICKET_INVALID
WORLD_JOIN_TIMEOUT
WORLD_SNAPSHOT_GAP
UI_SCREEN_MISSING
UI_WIDGET_UNSUPPORTED
UI_SELECTOR_UNSUPPORTED
UI_ACTION_UNSUPPORTED
INVENTORY_CAPACITY_EXCEEDED
OPERATION_STATUS_UNKNOWN
QUEST_STATE_CONFLICT
DIALOGUE_SESSION_EXPIRED
ECONOMY_REVISION_CONFLICT
STATE_RESYNC_REQUIRED
```

### 30.3 Error UI

- Inline fielderror bij create/forms.
- Toast voor nonblocking result.
- Modal voor destructive confirmation.
- Full recoverable screen voor boot/build/world failures.
- Fatal screen toont menselijke actie, correlationId en terug/retry waar veilig.
- Geen raw exception/SQL/path/token.

### 30.4 Global boundaries

`window.error`/`unhandledrejection` logt sanitized diagnostic. Een widgetexception wordt geïsoleerd: widget toont development errorplaceholder of production fallback, screenroot blijft. Boot/store corruption gaat naar FATAL_ERROR.

---

## 31. Security en privacy

- Sessioncookie `HttpOnly`, `Secure` in HTTPS, `SameSite=Lax`, rotation na login.
- Mutating HTTP gebruikt CSRF-token gebonden aan session.
- WebSocket upgrade verifieert Origin en session; join ticket is single-use.
- Iedere charactercommand controleert user -> profile -> character ownership.
- Name/text wordt server-side genormaliseerd en UI via `textContent` gerenderd.
- UI assets komen alleen uit asset library/build manifest; geen authored externe URLs.
- Character delete vereist nonce + naam + recente auth.
- Save data wordt niet in localStorage/IndexedDB gecached. Alleen niet-gevoelige UI preferences en intro hint mogen lokaal, onder versioned key.
- Logs bevatten geen sessioncookie, join ticket, password, full inventory/save snapshot of private mailtekst.
- Rate limits: character create/delete 3/min, join 6/min, RPG mutations per feature volgens consumer, login bestaande authpolicy.
- CSP moet scripts tot same-origin ESM en assets tot goedgekeurde origins beperken; geen inline eval.

---

## 32. Performance en layout-thrashingcontract

### 32.1 Referentiehardware

Acceptatie wordt minimaal uitgevoerd op Kevins laptopklasse: Intel Pentium 4417U, 4 threads, met de daadwerkelijk gebruikte browser en resolutie vastgelegd. Een snelle ontwikkelmachine alleen is onvoldoende.

### 32.2 UI framebudget foreground

Bij 30 FPS minimumdoel op reference laptop:

| UI-stage | P95 budget |
| --- | ---: |
| event validation + reducers | 1.0 ms per server batch |
| selector evaluation | 1.0 ms per frame |
| DOM patches | 2.0 ms per frame |
| style/layout door UI | 2.0 ms per frame |
| total UI scripting/layout | 5.0 ms per frame |

Geen UI long task >50 ms tijdens normaal combat/inventory/questgebruik.

### 32.3 Batchingregels

- Alle DOM writes in één scheduled writephase per rAF.
- Geen layout read na write in dezelfde framephase.
- Metingen alleen in readphase, gecached tot resize/content mutation.
- Health/cooldown animation via `transform:scaleX`, opacity of CSS variable; geen width-meetloop.
- `contain: layout paint style` waar panelisolatie correct is.
- `content-visibility:auto` alleen voor lange niet-interactieve offscreen sections, niet focused/modal content.
- Max één store render callback per widget per frame.

### 32.4 Network/storebudgets

- UI event payload <=64 KiB; grotere initial data via paginated snapshot.
- Inventory visible page max 200 entries; virtualize >50.
- Quest tracker max 5 zichtbaar; volledige log virtualized.
- Notifications max 5 DOM nodes, queue max 50; overflow samenvatten.
- Event dedupe cache max 4096 IDs of 60 s, wat eerst komt.

### 32.5 Hidden page

Page Visibility hidden:

- world rendering/preview rAF stopt;
- UI countdownrAF stopt;
- WebSocket heartbeat en serverauthority blijven;
- bij visible full time/network reconcile en indien nodig resync;
- geen gameplaytimer wordt client-side gepauzeerd.

### 32.6 Diagnostics

Development overlay meet store events/s, dirty widgets, render ms, layout shifts, DOM nodecount, subscriptions, observers en detached roots. Publish game verbergt overlay tenzij expliciete developerpermission.

---

## 33. Persistence- en UI-lifecycle

### 33.1 Mountprotocol

```text
compile screen VM
-> create screen root
-> create widgets
-> subscribe selectors
-> initial update
-> attach root once
-> set initial focus
```

### 33.2 Unmountprotocol

```text
block new actions
-> abort pending local loads
-> close feature sessions best-effort
-> unsubscribe all selectors
-> disconnect observers
-> remove delegated listeners
-> destroy widgets/Three host
-> remove root
-> restore focus
```

### 33.3 Leakgate

Na 50 cycli inventory/quest/dialogue/vendor openen/sluiten en 20 world enter/leave/reconnectcycli:

- store subscribercount terug baseline;
- ResizeObservers/listeners/timers terug baseline;
- geen detached screenroots;
- DOM nodecount binnen 5% van warmed baseline;
- JS heaptrend laatste 10 cycli binnen 10% band onder dezelfde meetcondities;
- renderer/audio/actor pools voldoen Fase 3;
- geen dubbele operation/events/rewards.

---

## 34. Legacy import en cutover

### 34.1 Volgorde

1. databasebackup en schema-introspectie;
2. character templates/creation rules import;
3. profile -> default character migration;
4. character state tables en parity snapshot;
5. progression/inventory/equipment/wallet cutover;
6. story/dialogue cutover;
7. crafting/vendor/market cutover;
8. UI theme/screens/layout/widgets import;
9. boot/intro/characterselect activeren;
10. legacy node domains naar canonical/retired volgens Fase 1.

### 34.2 Bestaande accountmigratie

Voor ieder legacy `player_profiles` record:

- maak exact één character in slot 0;
- displayName uit legacy profile, genormaliseerd; collision wordt manual report, niet auto suffix;
- template uit bewezen selected character/default playerdefinition;
- copy alle legacy `player_id` state naar nieuwe character tables;
- convert position world units naar Fase-2-mm via exact documented legacy scale;
- preserve timestamps/revisions in provenance;
- zet selected character na volledige parity.

Een ontbrekende character/template/position mapping is `manual_required`; het account blijft legacy read-only en wordt niet half omgezet.

### 34.3 UI mapping

| Legacy | Canonical |
| --- | --- |
| `hud_layout` | `ui_layout` variants/placements |
| `menu_layout` | screen + layout navigation policy |
| `hud_bar` | `progress_bar` widget + selector |
| inventory/equipment/wallet/ability/quest HUD | registered typed widgets |
| dialogue/vendor/crafting/market HUD | modal/exclusive screen + typed widget |
| minimap HUD | `minimap_host` |
| debug HUD | development-only registered screen, niet normale published UI |

Raw anchors/safeArea/breakpoints worden deterministisch naar layoutvariant geconverteerd. Onbewezen fields krijgen `unsupported`, niet stille fallback.

### 34.4 Shadow parity

Per migrated account/character vergelijkt een read-only parityrun:

- identity/selected character;
- position;
- level/XP/stats;
- inventory instances/stacks;
- equipment/abilities/wallet;
- quests/objectives/flags/unlocks;
- crafting/vendor/mail/market ownership;
- visible UI modules en bindings.

Cutover vereist exact value parity of een goedgekeurd typed conversionreport.

### 34.5 Geen dual-write

Tijdens shadow leest canonical een copy/snapshot en legacy blijft writer. Bij cutover in maintenancegate: laatste sync, parity, mode atomic naar canonical, services switch, legacy writes blokkeren. Terugrollen mag alleen vóór nieuwe canonical mutations of via expliciete reverse migration.

---

## 35. Verplichte bestandsarchitectuur

```text
src/server/authoring/domains/characters/
src/server/authoring/domains/progression/
src/server/authoring/domains/story/
src/server/authoring/domains/economy/
src/server/authoring/domains/ui/

src/server/runtime/characters/
  character-service.js
  character-aggregate-repository.js
  character-migrator.js
  character-lease-service.js

src/server/runtime/rpg/
  rpg-event-router.js
  progression-service.js
  inventory-service.js
  reward-service.js
  quest-service.js
  dialogue-service.js
  crafting-service.js
  vendor-service.js
  market-service.js
  character-transaction-service.js

src/server/runtime/ui/
  bootstrap-service.js
  ui-package-compiler.js
  selector-contracts.js
  action-contracts.js

apps/web/public/game/app/
  app-controller.js
  app-state-machine.js
  bootstrap-client.js
  session-client.js
  character-client.js
  world-client.js

apps/web/public/game/ui/
  game-ui-store.js
  reducers/
  selectors/
  action-dispatcher.js
  render-scheduler.js
  screen-host.js
  focus-manager.js
  input-router.js
  widget-registry.js
  widgets/

apps/web/public/game/scenes/
  character-preview-scene.js
  world-scene-host.js

apps/web/public/editor/ui-studio/
  ui-studio.js
  screen-tree.js
  responsive-preview.js
  binding-picker.js
  focus-preview.js
```

`game.js` wordt een kleine composition root. Oude functies worden per consumer gemigreerd; geen big-bang copy naar een tweede monoliet.

---

## 36. Implementatiecheckpoints

### Checkpoint 4A - Character/save kernel en zichtbare select

- Canonical templates/rules.
- Nieuwe profile/character/state schema's en importer/parity.
- Character list/create/select/delete/restore API.
- Gedeelde 3D characterpreview met equipment.
- Zichtbaar bewijs: Kevin maakt twee characters, refresh/restart, kiest en ziet juiste preview.

### Checkpoint 4B - Boot, intro en world join

- Bootpackage/bootstrapendpoint.
- App state machine, intro/main/auth/select/loading/error screens.
- Join ticket, lease, aggregate load, world ready gate.
- Zichtbaar bewijs: cold start -> intro -> menu -> character -> published world en veilig terug.

### Checkpoint 4C - UI runtime en responsive Studio

- Store/reducers/selectors/actions/widgetregistry/scheduler.
- Canonical UI docs/compiler.
- UI Studio met compact/medium/wide en input previews.
- Health/resources/hotbar/minimap/pause/inventory/equipment.
- Zichtbaar bewijs: damage update zonder polling, edit/publish parity op desktop en smal/touch.

### Checkpoint 4D - Story en progressionlus

- Canonical progression/rewards/quests/dialogue.
- Eventrouter, XP/level, objectives, atomic turn-in.
- Quest tracker/log/dialogue/notifications.
- Zichtbaar bewijs: accept -> collect/defeat/reach/talk/deliver -> turn-in -> XP/item/currency/ability, refresh/reconnect parity.

### Checkpoint 4E - Economy, lifecycle en volledige cutover

- Crafting/vendor/market sessions en UI.
- Death/respawn/logout/reconnect/build compatibility.
- Legacy story/economy/UI cutover.
- Performance/accessibility/leak/securitygates.
- Volledige published RPG playthrough en Kevinacceptatie.

Geen checkpoint mag als voltooid gelden door alleen schemas, mockdata of editorpreview.

---

## 37. Verplichte testmatrix

### 37.1 Boot

- cold/warm cache;
- missing/corrupt bootstrap/manifest/asset;
- session valid/expired/offline;
- intro skip/reduced motion/hidden tab;
- cancellation tijdens iedere async state;
- illegal/stale transition completion;
- build verandert vóór/na join.

### 37.2 Characters

- 0/1/max slots;
- Unicode normalization, invalid/reserved/duplicate names;
- simultaneous create same slot/name;
- startgrants exactly once;
- delete nonce/reauth/grace/restore/purge;
- selected deleted character;
- wrong account/character/build;
- preview rapid selection en asset abort.

### 37.3 Persistence

- idempotent retry same/different hash;
- stale revisions;
- crash op iedere transactionstap;
- outbox retry/order/dedupe;
- global/slice revision gap en resync;
- serverrestart/reconnect;
- position safe fallback;
- build alias/missing content.

### 37.4 UI store/render

- reducer immutability;
- selector memoization/equality;
- 100 events in task -> een viewpatch/frame;
- health event -> <=1 frame;
- screen mount/unmount/focusrestore;
- unsupported selector/action/widget publishfail;
- list virtualisatie en stable keys;
- ResizeObserver no loop;
- 200% text/no clipping.

### 37.5 Responsive/input/accessibility

- widths 320, 375, 600, 768, 1024, 1440 CSS px;
- portrait/landscape en safe-area emulation;
- keyboard-only complete flow;
- touch targets en drag alternatives;
- standard gamepad connect/disconnect/focus/navigation;
- screenreader names/roles/live regions;
- reduced motion/contrast/focus visible/not obscured;
- zoom 200% en browser text scaling.

### 37.6 RPG loop

- each objective kind en duplicate event;
- party/source attribution;
- reward capacity failure atomic;
- XP multi-level/max level;
- delivery removes exact quantity;
- dialogue hidden choice spoof;
- craft/vendor/market duplicate submit;
- wallet never negative;
- death penalty + respawn exactly once;
- logout/relogin/restart retains all durable state.

### 37.7 Security/fuzz

- CSRF/origin/session/join ticket;
- character ownership spoof;
- oversized/malformed UI/WS payload;
- authored text injection;
- selector/action injection;
- request replay/rate limits;
- delete without recent auth;
- logs contain no secrets/save dumps.

### 37.8 Performance/leaks

- reference laptop recorded;
- combat event burst;
- 200 inventory/market rows;
- open/close 50 cycles;
- world enter/leave/reconnect 20 cycles;
- DOM/subscriber/observer/timer/heap baseline;
- no long task/layout shift from UI.

---

## 38. Kevin-acceptatietest

Kevin levert zichtbaar browserbewijs op de echte omgeving; tests alleen sluiten de fase niet.

### A. Boot en intro

1. Open de game als uitgelogde gebruiker.
2. Zie bootstatus, intro en hoofdmenu zonder lege/flitsende UI.
3. Skip intro met muis, toetsenbord en touch.
4. Herlaad: policy en audio-unlock gedragen zich correct.
5. Log in en kom zonder handmatige URL bij characterselect.

### B. Characters

1. Maak twee verschillende characters via menselijke template/appearancekeuzes.
2. Zie bij selectie echte modellen, idle animation en equipment.
3. Refresh en serverrestart: beide blijven exact terugkomen.
4. Verwijder één, herstel hem binnen grace en controleer slot/naam.
5. Kies het andere character en betreed de wereld.

### C. Responsive UI

1. Open UI Studio en bewerk theme, HUD en inventoryscreen.
2. Controleer compact, medium, wide, touch en gamepad preview.
3. Publish en vergelijk editorpreview met game.
4. Zoom tekst tot 200%; hoofdacties blijven zichtbaar.
5. Doorloop HUD/menu met alleen toetsenbord en daarna gamepad.

### D. Combat en inventory

1. Laat player damage krijgen; healthbar verandert meteen zonder refresh.
2. Gebruik abilities en zie resources/cooldowns.
3. Versla enemy, ontvang exact één loot/XP/currencyresultaat.
4. Open inventory, equip/swap item; model/stats/ability veranderen.
5. Reconnect; state blijft gelijk en reward is niet dubbel.

### E. Quest en dialogue

1. Praat met NPC en accepteer quest.
2. Doorloop collect, defeat, reach, talk en deliver.
3. Tracker/log/dialogue tonen dezelfde progressie.
4. Turn in: kosten, XP, item, currency en ability atomic.
5. Refresh/relogin/restart: completed/unlocks/rewards blijven.

### F. Economy

1. Craft een recipe met echte ingredients/output.
2. Koop en verkoop bij vendor.
3. Maak/koop een marketlisting met tweede character/account waar testomgeving dat ondersteunt.
4. Test dubbele klik/retry en volle inventory.
5. Geen dubbele/verdwenen assets of negatief saldo.

### G. Death, lifecycle en persistence

1. Sterf, wacht serverrespawn, kies respawn en controleer checkpoint/penalties.
2. Verlaat en betreed wereld twintig keer met panels/audio/VFX.
3. Controleer diagnostics terug baseline.
4. Doe safe logout, login en serverrestart.
5. Character, position, level, stats, inventory, equipment, wallet, quests, unlocks en economy zijn correct.

### H. Published parity

1. Editor en game gebruiken hetzelfde buildId.
2. Intro, character, UI, world, actors en content zijn gelijk in betekenis.
3. Geen normale handeling gebruikt Nodes, raw IDs, JSON, SQL of scripts.
4. Nodes blijven read-only en canonical edits veroorzaken geen graphwrites.

---

## 39. Definition of Done

Fase 4 is alleen complete wanneer:

- bootstate machine en alle recoverypaden geimplementeerd zijn;
- multi-character save schema/migration/parity/cutover voltooid is;
- characterselect en 3D equipmentpreview zichtbaar werken;
- world join dezelfde build en server-authoritative aggregate gebruikt;
- UI store/selectors/actions/widgets eventgedreven werken zonder polling;
- UI Studio echte runtime-UI compileert en previewt;
- required screens responsive, keyboard/touch/gamepad bruikbaar en toegankelijk zijn;
- de volledige RPG-lus story/combat/economy/persistence end-to-end werkt;
- atomic/idempotent/revision/reconnect/restarttests slagen;
- performance- en leakgates op reference laptop slagen;
- legacy domains canonical/retired zijn zonder dual-write;
- Kevin sectie 38 expliciet heeft geaccepteerd;
- fase- en projectdocumentatie de werkelijke implementatiestatus tonen.

Een mooie intro, losse characterpreview, HUD mock, database-schema of werkende deelservice zonder de volledige keten telt niet als voltooid.

---

## 40. Bronnen en technische onderbouwing

Deze bronnen onderbouwen browsergedrag en toegankelijkheidsgrenzen; het GK-contract hierboven blijft normatief:

- `requestAnimationFrame` voor framegebonden rendering/DOM-patches: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- ResizeObserver voor element-size notifications en bekende looprisico's: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
- CSS container queries en containment: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- Page Visibility voor foreground/background lifecycle: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- Gamepad API en standard mapping/input polling: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- Browser WebSocket mist automatische backpressure, dus GK begrenst/coalescet queues: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- WCAG 2.2 voor focus, target size, reflow, input en motion: https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices voor keyboard/focuspatronen: https://www.w3.org/WAI/ARIA/apg/
- SQLite transactions/isolation voor atomic character/RPGmutaties: https://www.sqlite.org/lang_transaction.html en https://www.sqlite.org/isolation.html

---

## 41. Eindstatement

Na Fase 4 bestaat de productketen uit één samenhangend geheel:

```text
canonical character/story/economy/UI authoring
-> deterministic published build
-> robuuste boot + intro + characterselect
-> server-authoritative character aggregate en world actor
-> immutable RPG snapshots/events
-> een responsive, toegankelijke, eventgedreven UI
-> atomic persistence en hervatbare complete RPG-lus
```

De harde grenzen blijven staan: account is niet character, builddata is niet save data, UI is niet gameplayauthority, WebGL is niet de bedienbare DOM, events zijn niet polling, en nodes zijn geen nieuwe authoringroute. Daarmee wordt de techniek uit Fase 1-3 een speelbaar product zonder een vierde verborgen bron van waarheid te introduceren.
