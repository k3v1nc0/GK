# Game Bible

## Status

Dit document is het levende Fase 1-contract voor de nieuwe game. Kevin heeft bevestigd dat `README/GameBibleNode.json` de actuele leidende Game Bible is voor deze nieuwe game.

Fase 1-status: klaar voor Fase 2, met asset- en content-gates voor latere fases.

Fase 8-status: server-side afgerond en klaar.

Fase 8.1-status: toegevoegd als volgende faseplanning voor Procedural Generation Core; nog niet geimplementeerd.

## Leidende bron

Leidend:

- `README/GameBibleNode.json`
  - schema: `gamebible-node-system-v6.23`
  - versie: `6.23`
  - updatedAt: `2026-06-10T07:35:24.409Z`

Regel: concrete gamecontent mag alleen worden overgenomen uit `README/GameBibleNode.json` of uit latere expliciete Kevin-input. De AI mag geen extra definitieve content verzinnen buiten deze bron.

Ondersteunende repo-documenten die toekomstige agents opnieuw moeten openen wanneer relevant:

- `README/00-index.md`
- `README/fase1.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/kevin-maaklijst.md`
- `README/node-system-super-dynamic-contract.md`
- `README/hard-facts-to-node-panels.md`
- relevante fasebestanden, vooral Fase 7, 8, 8.1, 9, 13, 14, 15, 16 en 17

`README/story - The Staff of Eldoria.md` mag alleen als ondersteunende narratieve bron worden gebruikt wanneer dat consistent is met `README/GameBibleNode.json`. Bij conflict is `README/GameBibleNode.json` leidend.

## AI-regels

De AI mag niet:

- definitieve gamecontent verzinnen buiten `README/GameBibleNode.json` of expliciete Kevin-input;
- dummy assets, nepmodellen of tijdelijke vervangers toevoegen;
- ontbrekende UI/audio/currency/economy/camera/light/minimap/merchant/boss/quest-waarden invullen als gok;
- concrete content in runtimecode plaatsen;
- ontbrekende Kevin-input verbergen achter helperlogica;
- procedural generation gebruiken als shortcut om ontbrekende GameBible/editor/Kevin-content te verzinnen.

Als benodigde content niet in `README/GameBibleNode.json` staat en Kevin die niet aanvullend bevestigt, dan blijft het een content gate voor de betreffende latere fase.

## Bekende Fase 1-feiten

Bevestigd:

- Het project is 100% nieuw.
- `README/GameBibleNode.json` is de leidende Game Bible.
- Alles draait eerst op een eigen server onder `/var/www/gk`.
- `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` is door Codex gezet of bevestigd.
- Codex heeft `/var/www/gk/assets` gecontroleerd.
- Serverassets en repo-assets komen overeen voor de vier aanwezige GLB-bestanden.
- Concrete gamecontent hoort niet in runtimecode.
- De hoofdketen is `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Procedural generation output blijft draft/preview/bake data totdat publish later expliciet publiceert.

## Assetfeiten

Codex heeft bevestigd:

| Type | Aantal |
|---|---:|
| GLB | 4 |
| UI images | 0 |
| Audio | 0 |

Aanwezige GLB-bestanden:

- `Blacksmit forge.glb`
- `Blacksmit.glb`
- `Taverne.glb`
- `Wizard.glb`

Er zijn geen submappen en geen dubbele bestandsnamen. `Blacksmit forge.glb` bevat een spatie; toekomstige asset tooling moet dit correct ondersteunen of expliciet valideren.

Deze assets zijn feitelijk geregistreerd. Ze zijn nog geen definitieve runtime-keuze voor player, NPC, merchant, boss, prop, environment of quest object.

Fase 8 heeft `Taverne.glb` en `Wizard.glb` server-side als Kevin-testkeuzes gevalideerd. Dat blijft testinput, geen hardcoded runtimecontent.

## Procedural generation contract

Fase 8.1 maakt procedural generation een engine-capability in het node-system.

Regels:

- procedural generators zijn data-driven en deterministic;
- zelfde seed + graph + inputs geeft dezelfde output;
- andere seed mag andere output geven;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated assets gebruiken Fase 7 `asset.reference`;
- preview en bake publiceren niets naar Runtime Game;
- bake maakt alleen editor draft data;
- server/runtime blijft later authoritative;
- client mag geen eigen MMO-state verzinnen.

Procedural generation mag geen vaste gamecontent verzinnen. Geen vaste dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps hard-coden.

## Contentsecties

### Game naam, lore, namen en progression

Bron: `README/GameBibleNode.json`.

Geen extra namen, lore of progression buiten deze bron verzinnen. Als een latere fase een waarde nodig heeft die niet duidelijk uit de GameBible JSON komt, moet die fase stoppen en Kevin-input vragen.

### Quests en side quests

Bron: `README/GameBibleNode.json`.

Fase 14 en Fase 17 mogen questcontent alleen uit de GameBible JSON, editor/node-data of expliciete Kevin-input halen. Quest runtimecode blijft generiek. Procedural placement/path candidates mogen quest authoring ondersteunen, maar mogen geen questnamen, questtekst of objectives verzinnen.

### Bosses en combat content

Bron: `README/GameBibleNode.json` plus latere asset/role mappings.

Fase 16 en Fase 17 moeten boss GLB, UI/audio en combatwaarden via nodes/registers koppelen. Geen damage, cooldown, boss phase, loot of audio hard-coden. Procedural spawn/resource candidates mogen ondersteunen, maar niet beslissen welke boss of loot bestaat.

### Currency en economy

Bron: GameBible JSON wanneer aanwezig, anders latere Kevin-input.

Economywaarden, prices, rewards, merchants, itemwaarden, XP en lootkansen blijven node/editor/database-data. Procedural resource distributions blijven candidates en mogen geen economywaarden invullen.

### World, camera, lighting en minimap

Fase 9 blijft verantwoordelijk voor world/camera/lighting/levels/zones/minimap nodes, maar moet vanaf nu bouwen op Fase 8.1 procedural generation core.

World/zone/minimap mag generated zones, spawn areas, path networks, resource distributions en entity placements als draft/candidate input gebruiken. Camera, light, fog, sky en minimap blijven editor/node-data of expliciete GameBible/Kevin-input. Geen runtime-hardcoded values.

### UI en audio

Huidige assetstatus: 0 UI images en 0 audio aanwezig.

UI/audio mogen later worden toegevoegd of gekozen via asset library en nodes. Totdat ze bestaan, blokkeren ze alleen fases die concrete UI/audio nodig hebben.

## Scheiding van verantwoordelijkheden

### Engine-capabilities

Runtime- en enginecode mag vaste capabilities bevatten:

- schemas;
- node types;
- validators;
- deterministic random stream primitives;
- procedural graph/preview/bake primitives;
- renderer primitives;
- audio primitives;
- protocol primitives;
- vaste socket types;
- database- en publish-mechaniek;
- generieke runtime readers voor gepubliceerde data.

### Contentdata

Contentdata bevat concrete gamekeuzes uit GameBible JSON, database, registers, editorinput of node-data. Runtimecode beslist niet zelf welke concrete content bestaat. Procedural output blijft draft/candidate totdat editor/publish dit later expliciet omzet naar runtime projections.

### Editor/node-data

Alle inhoudelijk instelbare gamekeuzes moeten via editor/node-data beheerd kunnen worden. De node-contracten in `README/node-system-super-dynamic-contract.md` en `README/hard-facts-to-node-panels.md` blijven hiervoor verplichte ondersteunende bronnen.

### Publish/runtime gedrag

Publish vertaalt database- en node-data naar runtime-consumeerbare projections. Runtime mag alleen gepubliceerde data consumeren en generieke engine-capabilities uitvoeren.

Preview, asset scan, entity validation en procedural bake zijn geen publishstap.

## Regels voor toekomstige contenttoevoeging

Nieuwe content mag pas worden toegevoegd wanneer:

1. De relevante gate is gecontroleerd.
2. De content in `README/GameBibleNode.json` staat of Kevin die expliciet aanlevert/goedkeurt.
3. De asset of data in het juiste register is opgenomen.
4. De content via node-data of database-data kan worden beheerd.
5. Publish-validatie ontbrekende verplichte input kan blokkeren.
6. Runtimecode alleen generieke capability gebruikt.

## Waarschuwing voor runtimecode

Runtimecode mag geen concrete gamecontent bevatten. Niet toestaan:

- hard-coded camera distance, camera mode of zoom;
- hard-coded sun color, light intensity, fog, sky of day/night keuzes;
- hard-coded minimap zoom, markers of layers;
- hard-coded world maps, zones, routes, spawnpoints of resource distributions;
- hard-coded NPC namen, routes, taken, dialogen of geluiden;
- hard-coded questtekst, side quest tekst of boss mechanics;
- hard-coded currency, prices, rewards, merchant stock, XP of lootkansen;
- hard-coded HUD layout of audio-keuzes.

Als code zulke waarden nodig lijkt te hebben, moet eerst een node type, schema, register, procedural draft contract of editorveld worden ontworpen.

## Latere fasehulp

- Fase 7: asset/audio library kan starten met bevestigd assetpad en 4 GLB-assets; UI/audio staan op 0 en vereisen latere toevoeging voor UI/audio-testflows.
- Fase 8: entity/component core is server-side afgerond en gebruikt Taverne/Wizard alleen als Kevin-testkeuzes.
- Fase 8.1: procedural generation core moet vóór Fase 9 worden geopend en mag alleen deterministic draft/preview/bake output maken.
- Fase 9: world, camera, lighting, levels/zones en minimap blijven node-data en gebruiken Fase 8.1 outputs als draft/candidate basis.
- Fase 13: NPC assets, taken, routes, audio en schedules vereisen GameBible JSON plus asset/role mappings; generated paths/spawn areas blijven candidates.
- Fase 15: economy, levels, money, merchants, inventory en scrolls vereisen node/database-data; generated resources blijven candidates.
- Fase 16: combat, attacks, boss mechanics en loot vereisen GameBible JSON plus asset/UI/audio gates; generated spawn/resource candidates mogen geen combatcontent verzinnen.
- Fase 17: complete beginquest mag pas seeden wanneer GameBible JSON, registers en node-data genoeg concrete input bevatten; procedural output mag alleen als editor/node-data basis dienen.
