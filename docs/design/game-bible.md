# Game Bible

## Status

Dit document is het levende Fase 1-contract voor de nieuwe game. Kevin heeft bevestigd dat `README/GameBibleNode.json` de actuele leidende Game Bible is voor deze nieuwe game.

Fase 1-status: klaar voor Fase 2, met asset- en content-gates voor latere fases.

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
- `README/kevin-maaklijst.md`
- `README/node-system-super-dynamic-contract.md`
- `README/hard-facts-to-node-panels.md`
- relevante fasebestanden, vooral Fase 7, 9, 13, 14, 15, 16 en 17

`README/story - The Staff of Eldoria.md` mag alleen als ondersteunende narratieve bron worden gebruikt wanneer dat consistent is met `README/GameBibleNode.json`. Bij conflict is `README/GameBibleNode.json` leidend.

## AI-regels

De AI mag niet:

- definitieve gamecontent verzinnen buiten `README/GameBibleNode.json` of expliciete Kevin-input;
- dummy assets, nepmodellen of tijdelijke vervangers toevoegen;
- ontbrekende UI/audio/currency/economy/camera/light/minimap/merchant/boss/quest-waarden invullen als gok;
- concrete content in runtimecode plaatsen;
- ontbrekende Kevin-input verbergen achter helperlogica.

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

## Contentsecties

### Game naam, lore, namen en progression

Bron: `README/GameBibleNode.json`.

Geen extra namen, lore of progression buiten deze bron verzinnen. Als een latere fase een waarde nodig heeft die niet duidelijk uit de GameBible JSON komt, moet die fase stoppen en Kevin-input vragen.

### Quests en side quests

Bron: `README/GameBibleNode.json`.

Fase 14 en Fase 17 mogen questcontent alleen uit de GameBible JSON, editor/node-data of expliciete Kevin-input halen. Quest runtimecode blijft generiek.

### Bosses en combat content

Bron: `README/GameBibleNode.json` plus latere asset/role mappings.

Fase 16 en Fase 17 moeten boss GLB, UI/audio en combatwaarden via nodes/registers koppelen. Geen damage, cooldown, boss phase, loot of audio hard-coden.

### Currency en economy

Bron: GameBible JSON wanneer aanwezig, anders latere Kevin-input.

Economywaarden, prices, rewards, merchants, itemwaarden, XP en lootkansen blijven node/editor/database-data.

### UI en audio

Huidige assetstatus: 0 UI images en 0 audio aanwezig.

UI/audio mogen later worden toegevoegd of gekozen via asset library en nodes. Totdat ze bestaan, blokkeren ze alleen fases die concrete UI/audio nodig hebben.

## Scheiding van verantwoordelijkheden

### Engine-capabilities

Runtime- en enginecode mag vaste capabilities bevatten:

- schemas;
- node types;
- validators;
- renderer primitives;
- audio primitives;
- protocol primitives;
- vaste socket types;
- database- en publish-mechaniek;
- generieke runtime readers voor gepubliceerde data.

### Contentdata

Contentdata bevat concrete gamekeuzes uit GameBible JSON, database, registers, editorinput of node-data. Runtimecode beslist niet zelf welke concrete content bestaat.

### Editor/node-data

Alle inhoudelijk instelbare gamekeuzes moeten via editor/node-data beheerd kunnen worden. De node-contracten in `README/node-system-super-dynamic-contract.md` en `README/hard-facts-to-node-panels.md` blijven hiervoor verplichte ondersteunende bronnen.

### Publish/runtime gedrag

Publish vertaalt database- en node-data naar runtime-consumeerbare projections. Runtime mag alleen gepubliceerde data consumeren en generieke engine-capabilities uitvoeren.

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
- hard-coded NPC namen, routes, taken, dialogen of geluiden;
- hard-coded questtekst, side quest tekst of boss mechanics;
- hard-coded currency, prices, rewards, merchant stock, XP of lootkansen;
- hard-coded HUD layout of audio-keuzes.

Als code zulke waarden nodig lijkt te hebben, moet eerst een node type, schema, register of editorveld worden ontworpen.

## Latere fasehulp

- Fase 7: asset/audio library kan starten met bevestigd assetpad en 4 GLB-assets; UI/audio staan op 0 en vereisen latere toevoeging voor UI/audio-testflows.
- Fase 9: world, camera, lighting, levels/zones en minimap blijven node-data.
- Fase 13: NPC assets, taken, routes, audio en schedules vereisen GameBible JSON plus asset/role mappings.
- Fase 15: economy, levels, money, merchants, inventory en scrolls vereisen node/database-data.
- Fase 16: combat, attacks, boss mechanics en loot vereisen GameBible JSON plus asset/UI/audio gates.
- Fase 17: complete beginquest mag pas seeden wanneer GameBible JSON, registers en node-data genoeg concrete input bevatten.
