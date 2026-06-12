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
- procedural generation als vervanging voor ontbrekende Kevin/GameBible/editor-input wordt gebruikt;
- checks niet kunnen draaien en het risico voor direct op `main` te hoog is.

Stoppen is correct gedrag. Niet improviseren.

## AI-regels

De AI mag niet:

- improviseren bij ontbrekende contentinput;
- placeholders of dummy content toevoegen;
- dummy assets, nepmodellen of tijdelijke vervangers gebruiken;
- definitieve contentnamen verzinnen buiten `README/GameBibleNode.json` of Kevin-input;
- runtime hard-coding gebruiken om content of waardes te laten werken;
- procedural generators concrete dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps laten hard-coden.

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
| GLB role mapping | Zodra publish/runtime een concrete player/NPC/enemy/boss/object rol wil gebruiken |
| Animation mapping | Zodra NPC/combat/player behavior runtime-active wordt |
| UI assets | Zodra HUD, inventory, merchant, quest tracker, scrolls of boss UI verplicht zijn |
| Audio assets | Zodra ambience, music, SFX, UI audio, NPC audio of boss audio verplicht zijn |
| Asset filename met spatie | Afgerond voor Fase 7 scan; opnieuw controleren wanneer URLs/runtime serving worden gebouwd |
| Procedural generation core | Afgerond: Fase 8.1 server-side bevestigd; Fase 9 bouwt hier later op |
| Procedural determinism | Afgerond: server-side smoke bevestigd |
| Camera/lighting/minimap waarden | Zodra runtime publish concrete world presentation nodig heeft |
| Economywaarden | Zodra money, prices, rewards, merchants, XP of loot nodig zijn |
| Server/database/runtime status | Zodra een fase migraties, services of runtimechecks vereist zijn |

## Gate-checks per domein

### Assets

- `/var/www/gk/assets` is gecontroleerd.
- `GK_ASSET_SOURCE_DIR` is bevestigd.
- GLB/UI/audio aantallen zijn bekend.
- Assetrollen zijn nog niet definitief gekozen; dat hoort via editor/node-data.
- `Blacksmit forge.glb` bevat een spatie en is in Fase 7 scanner/library gevalideerd.
- Fase 8 gebruikt `Taverne.glb` en `Wizard.glb` alleen als Kevin-testkeuzes voor candidate entity/component validation.
- Fase 8 mag Taverne/Wizard niet als definitieve object/NPC runtime-role in code of migratie vastleggen.
- Fase 8 server-side is afgerond; geen Fase 8 blockers open.
- Fase 8.1 generated assets gebruiken alleen `asset.reference` naar Fase 7 asset library records.

### UI

- Huidige telling: 0 UI images.
- UI-assets moeten later worden toegevoegd of gekozen via asset library.
- HUD/panel/dock instellingen blijven node-data.

### Audio

- Huidige telling: 0 audio assets.
- Music, ambience, SFX, UI audio en voice/dialogue moeten later via audio nodes en asset library worden gekoppeld.
- Fase 8 audio emitter blijft gated/leeg bij audio count 0.
- Fase 8.1 generated audio mag alleen via `audio.reference` en blijft gated bij audio count 0.

### Procedural generation

Fase 8.1 is de verplichte core-basis voor procedural generation. De core is server-side gevalideerd.

Regels:

- Procedural generation is een engine-capability, geen contentlaag.
- Generatoren moeten data-driven en deterministic zijn.
- Zelfde seed + zelfde graph + zelfde inputs geeft dezelfde output.
- Andere seed mag andere output geven.
- Procedural preview publiceert niets naar Runtime Game.
- Procedural bake maakt alleen editor draft data of bake draft result.
- Procedural output blijft draft/candidate totdat de normale publish-flow later expliciet publiceert.
- Generated entities gebruiken Fase 8 entity/component contracts.
- Generated assets gebruiken Fase 7 `asset.reference`.
- Generated audio gebruikt `audio.reference` en blijft gated bij audio count 0.
- Anonymous/game sessions krijgen geen procedural editor beheer.

Niet toegestaan:

- procedural output gebruiken als shortcut voor ontbrekende Kevin-input;
- vaste world maps, dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes of lighting presets hard-coden;
- Fase 9 of latere fases de procedural core opnieuw laten bouwen;
- client-side MMO-state verzinnen op basis van procedural output.

### Story/lore/names

- Leidende bron: `README/GameBibleNode.json`.
- Geen extra namen of lore verzinnen buiten GameBible JSON of Kevin-input.

### Quests en side quests

- Leidende bron: `README/GameBibleNode.json`.
- Quest runtimecode blijft generiek.
- Ontbrekende concrete questvelden blijven content gates.
- Procedural placement/path candidates mogen quest authoring ondersteunen, maar mogen geen questcontent verzinnen.

### Boss en combat

- Leidende bron: `README/GameBibleNode.json`.
- Boss GLB, UI/audio en combatwaarden moeten via assets/registers/nodes worden gekoppeld.
- Fase 8 `combatant` en `boss` components zijn candidate schemas; runtime-active combat/boss behavior vereist editor-data en animation mapping.
- Procedural spawn/resource candidates mogen combat authoring ondersteunen, maar mogen geen boss, loot table, damage, cooldown of phase content hard-coden.

### Currency en economy

- Leidende bron: GameBible JSON wanneer aanwezig, anders Kevin-input.
- Geen economywaarden hard-coden.
- Procedural resource distributions blijven candidates en mogen geen prices, rewards of lootkansen invullen.

### Node-data

- Alle concrete content moet beheerbaar zijn via editor/node-system.
- Validators moeten verplichte velden kunnen blokkeren.
- Defaults mogen alleen generiek zijn, niet concrete gamecontent.
- Fase 6 graph operations blijven editor draft-data totdat een latere publishfase ze expliciet publiceert.
- Typed sockets en field schemas zijn engine-capabilities; concrete waardes moeten uit node-data, GameBible, registers, database of expliciete Kevin-input komen.
- Audio picker blijft gated zolang audio count 0 is.
- Draft preview mag valideren en tonen, maar niets publiceren naar Runtime Game.
- Fase 8 entity/component validation mag candidate data valideren, maar niets publiceren naar Runtime Game.
- Fase 8.1 procedural preview/bake mag candidate data tonen of als editor draft opslaan, maar niets publiceren naar Runtime Game.

### Publish/runtime

- Runtime consumeert alleen gepubliceerde data.
- Publish blokkeert ontbrekende verplichte data.
- Publish mag waarschuwingen geven voor optionele of kwaliteitsproblemen.
- Draft preview is geen publishstap.
- Asset scan, entity validation, procedural preview en procedural bake zijn geen publishstap.

## Te verifieren fase-input voor latere fases

Nieuwe agents moeten altijd eerst `README/current-phase.md`, `docs/design/phase-plan/current-phase.md`, het relevante fasebestand, deze gates, de registers, `README/GameBibleNode.json` en het node-contract openen.

### Fase 8.1

Bronnen eerst openen:

- `README/fase8.1.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/game-bible.md`
- `docs/architecture/editor-shell.md`

Input/status vooraf:

- Fase 8 server-side klaar;
- Fase 8.1 server-side klaar;
- procedural generation blijft engine-capability;
- generator output blijft draft-only;
- preview/bake publiceert niets naar runtime;
- zelfde seed + graph + inputs moet dezelfde output geven;
- generated entities gebruiken Fase 8 contracts;
- generated assets gebruiken Fase 7 `asset.reference`;
- anonymous/game sessions krijgen geen procedural editor beheer;
- server-side build/typecheck/test/lint/migratie/smoke bevestigd.

### Fase 9

Bronnen eerst openen:

- `README/fase9.md`
- `README/fase8.1.md`
- `docs/design/world-settings-plan.md`
- `docs/design/asset-register.md`
- `README/GameBibleNode.json`

Input vooraf:

- Fase 8.1 procedural generation core moet server-side gevalideerd zijn of Kevin moet expliciet beslissen dat Fase 9 toch start;
- world/camera/light/minimap waarden uit GameBible JSON, editor-data of Kevin-input;
- generated zones, spawn areas, path networks, resource distributions en entity placements uit Fase 8.1 mogen alleen als draft/candidate input worden gebruikt;
- startgebied en zones uit GameBible JSON, editor-data, procedural draft output of Kevin-input;
- alle waarden als node-data, niet runtimecode.

### Fase 13

Bronnen eerst openen:

- `README/fase13.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

Input vooraf:

- NPC content uit GameBible JSON;
- GLB role mappings via editor;
- audio staat nu op 0 en blokkeert verplichte NPC-audio totdat Kevin audio toevoegt;
- routes, werkplekken, spawngebieden en respawn timings blijven node-data;
- generated path networks en spawn areas uit Fase 8.1/Fase 9 mogen alleen draft/candidate input zijn.

### Fase 15

Bronnen eerst openen:

- `README/fase15.md`
- `README/fase8.1.md`
- `docs/design/economy-plan.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `README/GameBibleNode.json`

Input vooraf:

- currency/economy uit GameBible JSON of Kevin-input;
- UI assets staan nu op 0 en blokkeren verplichte inventory/merchant/scroll UI totdat Kevin UI toevoegt;
- generated resource distributions blijven candidate data;
- geen economywaarden hard-coded.

### Fase 16

Bronnen eerst openen:

- `README/fase16.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `docs/design/economy-plan.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

Input vooraf:

- boss/enemy/combat content uit GameBible JSON;
- GLB role mappings via editor;
- audio/UI staan nu op 0 en blokkeren verplichte boss/combat audio/UI totdat Kevin assets toevoegt;
- generated spawn/resource/path candidates mogen combat authoring ondersteunen, maar geen combatcontent verzinnen;
- damage, cooldowns, loot en phases als node-data.

### Fase 17

Bronnen eerst openen:

- `README/fase17.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/GameBibleNode.json`
- `docs/design/game-bible.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/world-settings-plan.md`
- `docs/design/economy-plan.md`
- `docs/design/content-gates.md`

Input vooraf:

- GameBible JSON is leidend voor beginquest-content;
- Fase 8.1/Fase 9 generated world candidates mogen alleen als editor/node-data basis dienen;
- alle required GLB/UI/audio roles gemapt;
- UI/audio staan nu op 0 en blokkeren complete content als die assets verplicht zijn;
- content seed alleen via node-data en publish.

## Fase 14 tussenpoort

Fase 14 beheert quests, story, side quests en party sharing. Nieuwe agents moeten `README/fase14.md`, `README/fase8.1.md` en `README/GameBibleNode.json` openen voordat questcontent wordt gebouwd.
