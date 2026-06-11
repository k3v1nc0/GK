# Content Gates

## Definitie

Een content gate is een expliciete poort die bepaalt of een fase, feature, fix, refactor of content-uitwerking mag doorgaan. De gate voorkomt dat ontbrekende input wordt vervangen door aannames, dummy content of runtime-hardcoding.

Fase 1-status: gates opgezet, GameBible-bron bevestigd, serverassetscan afgerond.

## Leidende contentbron

Kevin heeft bevestigd:

- `README/GameBibleNode.json` is de leidende Game Bible voor deze nieuwe game.

Regel: concrete gamecontent mag alleen uit `README/GameBibleNode.json`, editor/node-data, registers, database of expliciete Kevin-input komen.

Niet toegestaan:

- extra definitieve content verzinnen buiten GameBible JSON;
- oude twijfelmarkeringen gebruiken om GameBible JSON te negeren;
- runtimecode vullen met concrete contentwaarden.

## Fail-fast regels

Stop direct wanneer:

- een vereiste waarde niet in `README/GameBibleNode.json` staat en Kevin die ook niet aanvullend bevestigt;
- een asset verplicht is maar niet bestaat of niet via asset library/node-data gekozen kan worden;
- UI/audio verplicht is maar de huidige telling 0 is en Kevin nog niets heeft toegevoegd;
- server/database/build/runtime context nodig is maar niet gecontroleerd kan worden;
- een oplossing concrete gamecontent in runtimecode zou plaatsen;
- een helper ontbrekende core-architectuur zou maskeren;
- checks niet kunnen draaien en het risico voor direct op `main` te hoog is.

Stoppen is correct gedrag. Niet improviseren.

## AI-regels

De AI mag niet:

- improviseren bij ontbrekende contentinput;
- placeholders of dummy content toevoegen;
- dummy assets, nepmodellen of tijdelijke vervangers gebruiken;
- definitieve contentnamen verzinnen buiten `README/GameBibleNode.json` of Kevin-input;
- runtime hard-coding gebruiken om content of waardes te laten werken.

## Afgeronde Fase 1-gates

| Gate | Status |
|---|---|
| Leidende Game Bible | Afgerond: `README/GameBibleNode.json` |
| Assetpad | Afgerond: `/var/www/gk/assets` |
| Env var | Afgerond: `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` |
| GLB telling | Afgerond: 4 |
| UI telling | Afgerond: 0 |
| Audio telling | Afgerond: 0 |
| Repo/server asset match | Afgerond: exact gelijk |
| Duplicate filenames | Afgerond: geen dubbele namen |
| Runtimecode scope | Afgerond: geen runtimecode gewijzigd |

## Open gates voor latere fases

| Input | Wanneer blokkerend |
|---|---|
| GLB role mapping | Zodra een fase player/NPC/enemy/boss/object rol nodig heeft |
| UI assets | Zodra HUD, inventory, merchant, quest tracker, scrolls of boss UI verplicht zijn |
| Audio assets | Zodra ambience, music, SFX, UI audio, NPC audio of boss audio verplicht zijn |
| Asset filename met spatie | Zodra scanner/URL/database/node IDs spaties niet veilig ondersteunen |
| Camera/lighting/minimap waarden | Zodra runtime publish concrete world presentation nodig heeft |
| Economywaarden | Zodra money, prices, rewards, merchants, XP of loot nodig zijn |
| Server/database/runtime status | Zodra een fase migraties, services of runtimechecks vereist |

## Gate-checks per domein

### Assets

- `/var/www/gk/assets` is gecontroleerd.
- `GK_ASSET_SOURCE_DIR` is bevestigd.
- GLB/UI/audio aantallen zijn bekend.
- Assetrollen zijn nog niet definitief gekozen; dat hoort via editor/node-data.
- `Blacksmit forge.glb` bevat een spatie en moet in Fase 7 als filename/ID/URL-validatiepunt worden getest.

### UI

- Huidige telling: 0 UI images.
- UI-assets moeten later worden toegevoegd of gekozen via asset library.
- HUD/panel/dock instellingen blijven node-data.

### Audio

- Huidige telling: 0 audio assets.
- Music, ambience, SFX, UI audio en voice/dialogue moeten later via audio nodes en asset library worden gekoppeld.

### Story/lore/names

- Leidende bron: `README/GameBibleNode.json`.
- Geen extra namen of lore verzinnen buiten GameBible JSON of Kevin-input.

### Quests en side quests

- Leidende bron: `README/GameBibleNode.json`.
- Quest runtimecode blijft generiek.
- Ontbrekende concrete questvelden blijven content gates.

### Boss en combat

- Leidende bron: `README/GameBibleNode.json`.
- Boss GLB, UI/audio en combatwaarden moeten via assets/registers/nodes worden gekoppeld.

### Currency en economy

- Leidende bron: GameBible JSON wanneer aanwezig, anders Kevin-input.
- Geen economywaarden hard-coden.

### Node-data

- Alle concrete content moet beheerbaar zijn via editor/node-system.
- Validators moeten verplichte velden kunnen blokkeren.
- Defaults mogen alleen generiek zijn, niet concrete gamecontent.
- Fase 6 graph operations blijven editor draft-data totdat een latere publishfase ze expliciet publiceert.
- Typed sockets en field schemas zijn engine-capabilities; concrete waardes moeten uit node-data, GameBible, registers, database of expliciete Kevin-input komen.
- Audio picker blijft gated zolang audio count 0 is.
- Draft preview mag valideren en tonen, maar niets publiceren naar Runtime Game.

### Publish/runtime

- Runtime consumeert alleen gepubliceerde data.
- Publish blokkeert ontbrekende verplichte data.
- Publish mag waarschuwingen geven voor optionele of kwaliteitsproblemen.
- Draft preview is geen publishstap.

## Te verifieren fase-input voor latere fases

Nieuwe agents moeten altijd eerst `README/current-phase.md`, `docs/design/phase-plan/current-phase.md`, het relevante fasebestand, deze gates, de registers, `README/GameBibleNode.json` en het node-contract openen.

### Fase 7

Bronnen eerst openen:

- `README/fase7.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `README/node-system-super-dynamic-contract.md`

Input/status vooraf:

- assetpad bevestigd;
- `/var/www/gk/assets` gecontroleerd;
- `GK_ASSET_SOURCE_DIR` gezet;
- GLB/UI/audio telling beschikbaar;
- GLB=4, UI=0, audio=0;
- spatie in `Blacksmit forge.glb` testen in scanner/URL/database/node IDs;
- geen assets in Git toevoegen als server-assetflow leidend is.

### Fase 9

Bronnen eerst openen:

- `README/fase9.md`
- `docs/design/world-settings-plan.md`
- `docs/design/asset-register.md`
- `README/GameBibleNode.json`

Input vooraf:

- world/camera/light/minimap waarden uit GameBible JSON, editor-data of Kevin-input;
- startgebied en zones uit GameBible JSON of Kevin-input;
- alle waarden als node-data, niet runtimecode.

### Fase 13

Bronnen eerst openen:

- `README/fase13.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

Input vooraf:

- NPC content uit GameBible JSON;
- GLB role mappings via editor;
- audio staat nu op 0 en blokkeert verplichte NPC-audio totdat Kevin audio toevoegt;
- routes, werkplekken, spawngebieden en respawn timings blijven node-data.

### Fase 15

Bronnen eerst openen:

- `README/fase15.md`
- `docs/design/economy-plan.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `README/GameBibleNode.json`

Input vooraf:

- currency/economy uit GameBible JSON of Kevin-input;
- UI assets staan nu op 0 en blokkeren verplichte inventory/merchant/scroll UI totdat Kevin UI toevoegt;
- geen economywaarden hard-coded.

### Fase 16

Bronnen eerst openen:

- `README/fase16.md`
- `docs/design/economy-plan.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

Input vooraf:

- boss/enemy/combat content uit GameBible JSON;
- GLB role mappings via editor;
- audio/UI staan nu op 0 en blokkeren verplichte boss/combat audio/UI totdat Kevin assets toevoegt;
- damage, cooldowns, loot en phases als node-data.

### Fase 17

Bronnen eerst openen:

- `README/fase17.md`
- `README/GameBibleNode.json`
- `docs/design/game-bible.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/world-settings-plan.md`
- `docs/design/economy-plan.md`
- `docs/design/content-gates.md`

Input vooraf:

- GameBible JSON is leidend voor beginquest-content;
- alle required GLB/UI/audio roles gemapt;
- UI/audio staan nu op 0 en blokkeren complete content als die assets verplicht zijn;
- content seed alleen via node-data en publish.

## Fase 14 tussenpoort

Fase 14 beheert quests, story, side quests en party sharing. Nieuwe agents moeten `README/fase14.md` en `README/GameBibleNode.json` openen voordat questcontent wordt gebouwd.
