# Game Bible

## Status

Dit document is het levende projectcontract voor Fase 1 van het nieuwe gameproject. Het is geen definitieve lorebijbel en geen content seed. Het bepaalt welke keuzes Kevin moet aanleveren of goedkeuren voordat latere fases gamecontent mogen bouwen.

Fase 1 staat op: documentbasis opgezet, content-input gates open. De fase is niet volledig klaar zolang verplichte Kevin-input en de server-assetcontrole nog openstaan.

## Bronnen en conflictregel

Actuele repo-documentatie blijft een bron die opnieuw geopend moet worden wanneer een fase daarom vraagt. Voor Fase 1 zijn minimaal geraadpleegd:

- `README/00-index.md`
- `README/fase1.md`
- `README/kevin-maaklijst.md`
- `README/node-system-super-dynamic-contract.md`
- `README/hard-facts-to-node-panels.md`
- `README/fase7.md`, `README/fase9.md`, `README/fase13.md`, `README/fase14.md`, `README/fase15.md`, `README/fase16.md`, `README/fase17.md`
- `README/GameBibleNode.json`
- `README/story - The Staff of Eldoria.md`

Belangrijk conflict: `README/GameBibleNode.json` en `README/story - The Staff of Eldoria.md` bevatten al concrete verhaal-, naam-, zone-, boss- en progression-content. Kevin heeft nu expliciet vastgelegd dat dit een 100% nieuw project is en dat oude gamecontext, definitieve namen en definitieve verhaalcontent niet mogen worden overgenomen zonder bevestiging. Daarom geldt voor Fase 1:

- deze bestaande concrete content is niet automatisch bindend voor de nieuwe game;
- toekomstige agents moeten deze content behandelen als te verifieren of te vervangen;
- geen enkele naam, zone, quest, boss, currency of lore uit die bestanden mag stilzwijgend als definitieve nieuwe-game waarheid worden gebruikt.

## AI-regels

De AI mag niet:

- definitieve gamecontent verzinnen;
- dummy assets, nepmodellen of tijdelijke vervangers toevoegen;
- definitieve namen, lore, quests, side quests, bosses, currencies, NPC-routes, dialogen, merchants, prices, levels, audio-keuzes, camerawaarden, lightingwaarden, minimap-lagen of HUD-instellingen invullen;
- concrete content in runtimecode plaatsen;
- ontbrekende Kevin-input verbergen achter helperlogica.

Als verplichte input ontbreekt, stopt de fase of vervolgstap met een duidelijke lijst ontbrekende items.

## Bekende Kevin-input

Reeds bevestigd:

- Het project is 100% nieuw.
- Alles draait eerst op een eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- Er worden geen branches of pull requests gemaakt.
- Codex doet serverwerk buiten Git.
- Concrete gamecontent hoort niet in runtimecode.
- De hoofdketen is `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Concrete waardes moeten uit node-data, database, editorinput, Game Bible, asset register of registers komen.
- 3D wereldobjecten gebruiken bestaande of later bewust gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden via nodes gekozen en ingesteld.

## Open Kevin-input

Deze input moet nog door Kevin worden bevestigd of later samen worden uitgewerkt:

| Onderwerp | Status | Blokkeert definitieve content? |
|---|---|---|
| Assetpad | Kevin-input vereist | Ja, voor definitieve assetbron |
| Game naam | Kevin-input vereist | Ja |
| Startgebied | Kevin-input vereist | Ja |
| Sfeer | Later samen uitwerken | Ja voor sfeercontent |
| MMO-stijl | Later samen uitwerken | Ja voor camera, UI, combat en social feel |
| Bestaande GLB-assets op server | Codex-controle vereist | Ja voor definitieve assetmapping |
| Bestaande UI-assets op server | Codex-controle vereist | Ja voor UI-content |
| Bestaande audio-assets op server | Codex-controle vereist | Ja voor audio-content |
| Namen | Later samen uitwerken | Ja |
| Quests | Later samen uitwerken | Ja |
| Side quests | Later samen uitwerken | Ja |
| Boss | Later samen uitwerken | Ja |
| Currency | Later samen uitwerken | Ja |

## Game identity

### Game naam

Status: Kevin-input vereist.

Geen bestaande repo-naam of oude GameBible-naam mag als definitieve game naam worden gebruikt zonder nieuwe bevestiging.

### Startgebied

Status: Kevin-input vereist.

Het startgebied mag pas worden vastgelegd wanneer Kevin het kiest of samen met de AI uitwerkt. Tot die tijd mogen systemen alleen generieke `world.zone`, `world.spawnPoint` en asset-koppelingen ondersteunen.

### Sfeer

Status: later samen uitwerken.

Sfeer mag worden beschreven als ontwerpinput, maar mag nog geen definitieve lore, audio, lighting, weather, UI-stijl of kleurwaarden vastleggen.

### MMO-stijl

Status: later samen uitwerken.

MMO-stijl moet later vertaald worden naar editor- en node-keuzes voor camera, controls, HUD, party, presence, combat, chat of social systems. Runtimecode mag hier geen concrete stijlkeuzes hard-coden.

## Contentsecties

### Verhaal en lore

Status: Kevin-input vereist.

Er is nog geen definitieve nieuwe-game lore. Bestaande Staff of Eldoria-content in de repo is conflictcontent totdat Kevin die opnieuw bevestigt.

### Namen

Status: later samen uitwerken.

Namen voor game, zones, NPCs, enemies, bosses, items, abilities, currencies en quests mogen alleen worden toegevoegd na Kevin-keuze of expliciete samen-uitwerking.

### Quests

Status: later samen uitwerken.

Questteksten, queststappen, objectives, beloningen en questnamen mogen niet in code of docs worden ingevuld zonder Kevin-input. Fase 14 en 17 moeten deze sectie opnieuw openen voordat ze questcontent bouwen.

### Side quests

Status: later samen uitwerken.

Side quests volgen dezelfde regels als main quests. Geen side quest idee is definitief totdat Kevin het bevestigt.

### Boss

Status: later samen uitwerken.

Bossnaam, boss GLB, boss mechanics, boss audio, boss UI en loot mogen niet worden verzonnen. Fase 16 en 17 moeten blokkeren als deze input ontbreekt.

### Currency

Status: later samen uitwerken.

Currency naam, icoon, startgeld, prices, merchant stock, rewards, XP en lootkansen zijn contentdata en geen runtimecode.

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

Contentdata bevat concrete gamekeuzes zoals namen, verhaal, assets, camera-instellingen, lighting, minimap layers, quests, prices, merchant stock, levels, enemy data, boss mechanics en HUD-instellingen. Deze data hoort in database, registers, Game Bible, editorinput of node-data.

### Editor/node-data

De editor is de authoring-laag. Alle inhoudelijk instelbare gamekeuzes moeten als node-data of node-panel data beheerd kunnen worden. De bestaande node-contracten in `README/node-system-super-dynamic-contract.md` en `README/hard-facts-to-node-panels.md` zijn hierbij ondersteunende repo-bronnen die toekomstige agents opnieuw moeten openen.

### Publish/runtime gedrag

Publish vertaalt database- en node-data naar runtime-consumeerbare projections. Runtime mag alleen gepubliceerde data consumeren en generieke engine-capabilities uitvoeren. Runtime mag niet zelf beslissen welke concrete gamecontent bestaat.

## Regels voor toekomstige contenttoevoeging

Nieuwe content mag pas worden toegevoegd wanneer:

1. De relevante Fase 1-gate is geopend en gecontroleerd.
2. Kevin de concrete content heeft aangeleverd of goedgekeurd.
3. De asset of data in het juiste register is opgenomen.
4. De content via node-data of database-data kan worden beheerd.
5. Publish-validatie kan bepalen of ontbrekende input blokkerend of waarschuwend is.
6. Runtimecode alleen generieke capability gebruikt.

Als een toekomstige fase content nodig heeft maar de input ontbreekt, is stoppen het correcte gedrag.

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

Dit document helpt latere fases zo:

- Fase 7: asset/audio library mag alleen bestaande of bewust toegevoegde assets registreren; geen dummy assets.
- Fase 9: world, camera, lighting, levels/zones en minimap moeten node-data zijn.
- Fase 13: NPC assets, taken, routes, audio en schedules vereisen Kevin-input.
- Fase 15: economy, levels, money, merchants, inventory en scrolls vereisen node/database-data.
- Fase 16: combat, attacks, boss mechanics en loot vereisen assets en Kevin-keuzes.
- Fase 17: complete beginquest mag pas starten als Game Bible, registers en gates genoeg definitieve input bevatten.
