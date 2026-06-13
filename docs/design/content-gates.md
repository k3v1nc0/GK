# Content Gates

## Definitie

Een content gate is een expliciete poort die bepaalt of een fase, feature, fix, refactor of content-uitwerking mag doorgaan. De gate voorkomt dat ontbrekende input wordt vervangen door aannames, dummy content of runtime-hardcoding.

## Leidende contentbron

Kevin heeft bevestigd:

- `README/GameBibleNode.json` is de leidende Game Bible voor deze nieuwe game.

Regel: concrete gamecontent mag alleen uit `README/GameBibleNode.json`, editor/node-data, registers, database, procedural draft/candidate output, publish-ready metadata, runtime projection contracts of expliciete Kevin-input komen.

Niet toegestaan:

- extra definitieve content verzinnen buiten GameBible JSON;
- runtimecode vullen met concrete contentwaarden;
- procedural generation als vervanging voor ontbrekende Kevin/GameBible/editor-input gebruiken;
- asset-aanwezigheid behandelen als definitieve runtimekeuze;
- publish-flow behandelen als runtime renderer of automatische publish;
- runtime projection behandelen als renderer, gameplay of contentcompiler buiten publish-ready snapshotmetadata.

## Actuele gates

| Gate | Status |
|---|---|
| Leidende Game Bible | Afgerond: `README/GameBibleNode.json` |
| Assetpad | Afgerond: `/var/www/gk/assets` |
| Env var | Afgerond: `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` |
| GLB telling | Afgerond: 4 |
| UI image telling | Afgerond: 37 |
| Audio telling | Afgerond: 21 |
| Invalid assets | Afgerond: 0 |
| Missing assets | Afgerond: 0 |
| Fase 8.1 procedural core | Server-side afgerond en klaar |
| Fase 9 world/camera/minimap/UI display | Server-side afgerond en klaar |
| Fase 10 Publish Flow Core | Server-side afgerond en klaar |
| Fase 11 Runtime Projection Core | Git-basis voorbereid; server-side validatie open |

## Fail-fast regels

Stop direct wanneer:

- een vereiste waarde niet in GameBible JSON, editor/node-data, registers, procedural draft-output, publish data, runtime projection source metadata of Kevin-input staat;
- een asset verplicht is maar niet bestaat of niet via asset library/node-data gekozen kan worden;
- een oplossing concrete gamecontent in runtimecode zou plaatsen;
- een helper ontbrekende core-architectuur zou maskeren;
- procedural generation als shortcut voor ontbrekende contentinput wordt gebruikt;
- publish-flow runtime publish, renderer of concrete gamecontent zou uitvoeren;
- runtime projection raw drafts, procedural preview/bake, concrete gamecontent, renderer flags of assetmutatie zou bevatten;
- checks niet kunnen draaien en het risico voor direct op `main` te hoog is.

Stoppen is correct gedrag. Niet improviseren.

## Assets

Actuele scanstatus na `Assets - new`:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0.

Regels:

- GLB role mapping blijft editor-data/Kevin-keuze;
- UI images zijn asset-library candidates;
- audio files zijn asset-library candidates;
- HUD, icon en minimap marker bestanden zijn UI/image assets, geen definitieve HUD/minimap runtimecontent;
- ambience, music, SFX en UI audio zijn audio assets, geen definitieve music/ambience/SFX/UI runtimecontent;
- asset scan, entity validation, procedural preview/bake, Fase 9 validation, Fase 10 publish validation en Fase 11 runtime projection validation publiceren niets naar Runtime Game;
- Fase 10 en Fase 11 mogen geen assets toevoegen, wijzigen, verwijderen of kopieren.

## UI/HUD/minimap display gate

Fase 9 introduceert een harde UI display gate. Deze gate is server-side gevalideerd en wordt in Fase 10 publish validation en Fase 11 runtime projection validation meegenomen.

- source image natural size is metadata;
- runtime/editor/projection mag source pixel size nooit blind als display size gebruiken;
- display size moet via node-data/editor-data/publish data komen;
- `displayWidth` en `displayHeight` zijn vereist, tenzij een expliciete responsive rule display dimensions levert;
- `scaleMode`, `anchor` en `pivot` zijn node-data;
- `nineSlice` vereist slice margins uit node-data;
- grote source images zonder display size geven validation issue;
- schema defaults zijn hints, geen concrete HUD layout.

Schema hints:

- icon display: 32x32;
- minimap marker display: 24x24;
- small status icon: 24x24;
- HUD bar/frame display size blijft node-data required.

## Procedural generation

Fase 8.1 is de verplichte core-basis voor procedural generation. De core is server-side gevalideerd.

Regels:

- procedural generation is een engine-capability, geen contentlaag;
- generatoren moeten data-driven en deterministic zijn;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- procedural output blijft draft/candidate totdat publish-flow expliciet publiceert;
- Fase 9 gebruikt generated zones, placements, spawn areas, path networks en resource distributions alleen als draft/candidate input;
- Fase 10 valideert generated refs als candidate input, maar publiceert ze niet automatisch;
- Fase 11 mag generated refs alleen projecteren wanneer Fase 10 publish validation ze heeft geaccepteerd.

## World/camera/lighting/minimap gate

Fase 9 is server-side afgerond en klaar als node-data contractlaag.

Niet toegestaan:

- hardcoded world maps;
- hardcoded zones;
- hardcoded spawnpoints;
- hardcoded camera values;
- hardcoded light/fog/sky/day-night presets;
- hardcoded minimap layout, marker sizes of layers;
- hardcoded HUD layout;
- hardcoded audio behavior;
- runtime publish buiten publish-flow.

Willowmere Workshop mag alleen als bestaande Kevin/GameBible input of editor/procedural data worden gebruikt, niet als runtimecode.

## Publish Flow Core gate

Fase 10 is een publish-boundary contractlaag en is server-side afgerond.

Publish validation bewaakt:

- node graph completeness;
- asset candidates zonder definitive runtime role mapping;
- entity/component validity;
- procedural generated refs als draft/candidate input;
- world/zone/camera/lighting/minimap/UI display validity;
- UI display sizing uit node/editor data;
- no-runtime-publish;
- no-asset-mutation/copy;
- no-hardcoded-content.

Fase 10 mag alleen metadata en validation responses voorbereiden. Snapshot metadata bevat geen runtime payload en geen concrete gamecontent.

## Runtime Projection Core gate

Fase 11 is een runtime projection contractlaag. Server-side validatie staat nog open.

Runtime projection validation bewaakt:

- projection source moet Fase 10 publish snapshotmetadata en publish-ready validation gebruiken;
- raw editor drafts mogen niet direct worden geprojecteerd;
- procedural preview/bake mag niet direct worden geprojecteerd zonder publish acceptatie;
- generated refs blijven draft/candidate totdat publish validation ze accepteert;
- manifest en read model bevatten geen concrete gamecontent;
- projection records zijn references/metadata, geen renderer instructions;
- runtime read-only routes lekken geen editor draft data;
- no-asset-mutation/copy;
- no-hardcoded-content;
- no-runtime-renderer/no-game-client;
- safety flags: `publishesRuntimeProjection=true`, `implementsRuntimeRenderer=false`, `mutatesAssets=false`, `containsConcreteGameContent=false`, `usesHardcodedContent=false`.

## Open gates voor latere fases

| Input | Wanneer blokkerend |
|---|---|
| GLB role mapping | Zodra publish/runtime een concrete player/NPC/enemy/boss/object rol wil gebruiken |
| Animation mapping | Zodra NPC/combat/player behavior runtime-active wordt |
| UI display mapping | Zodra HUD, inventory, merchant, quest tracker, scrolls, boss UI of minimap display runtime verplicht wordt |
| Audio mapping | Zodra ambience, music, SFX, UI audio, NPC audio of boss audio runtime verplicht wordt |
| Camera/lighting/minimap waarden | Zodra runtime publish concrete world presentation nodig heeft |
| Economywaarden | Zodra money, prices, rewards, merchants, XP of loot nodig zijn |
| Runtime renderer/client | Zodra een expliciete latere Runtime Game fase wordt geopend |
| Server/database/runtime status | Zodra een fase migraties, services of runtimechecks vereist zijn |

## Te verifieren fase-input voor volgende fases

Nieuwe agents moeten openen:

- `README/current-phase.md`;
- `docs/design/phase-plan/current-phase.md`;
- de actuele fase-README, nu `README/fase11.md`;
- `README/fase8.1.md`;
- `README/fase9.md`;
- `README/fase10.md`;
- `README/node-system-super-dynamic-contract.md`;
- `docs/design/asset-register.md`;
- `docs/design/audio-register.md`;
- `docs/architecture/editor-shell.md`;
- `docs/architecture/auth-boundaries.md`;
- `README/GameBibleNode.json`.

Fase 11 server-side validatie staat nog open. Geen Fase 12 openen voordat Fase 11 is bevestigd en Kevin die fase opent.
