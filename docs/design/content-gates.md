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
- runtime projection behandelen als renderer, gameplay of contentcompiler buiten publish-ready snapshotmetadata;
- runtime client shell behandelen als renderer, gameplay, HUD/minimap/audio runtime of contentbron;
- runtime render surface behandelen als volledige renderer, scene assembly, gameplay, asset-loader, HUD/minimap/audio runtime of contentbron.

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
| Fase 11 Runtime Projection Core | Server-side afgerond en klaar |
| Fase 12 Runtime Client Shell Core | Server-side afgerond en klaar |
| Fase 12.1 Game Web Service Deployment Core | Server-side afgerond en klaar |
| Fase 13 Runtime Render Surface Core | Git-basis toegevoegd; server-side verificatie open |

## Fail-fast regels

Stop direct wanneer:

- een vereiste waarde niet in GameBible JSON, editor/node-data, registers, procedural draft-output, publish data, runtime projection source metadata of Kevin-input staat;
- een asset verplicht is maar niet bestaat of niet via asset library/node-data gekozen kan worden;
- een oplossing concrete gamecontent in runtimecode zou plaatsen;
- een helper ontbrekende core-architectuur zou maskeren;
- procedural generation als shortcut voor ontbrekende contentinput wordt gebruikt;
- publish-flow runtime publish, renderer of concrete gamecontent zou uitvoeren;
- runtime projection raw drafts, procedural preview/bake, concrete gamecontent, renderer flags of assetmutatie zou bevatten;
- runtime client shell editor/admin routes, raw draft data, concrete gamecontent, renderer/gameplay/audio playback of assetmutatie zou bevatten;
- runtime render surface editor/admin routes, raw draft data, concrete gamecontent, asset loads, scene assembly, gameplay/audio playback, hardcoded runtime values of assetmutatie zou bevatten;
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
- asset scan, entity validation, procedural preview/bake, Fase 9 validation, Fase 10 publish validation, Fase 11 runtime projection validation, Fase 12 runtime client shell validation en Fase 13 runtime render surface validation publiceren niets naar Runtime Game;
- Fase 10, Fase 11, Fase 12, Fase 12.1 en Fase 13 mogen geen assets toevoegen, wijzigen, verwijderen of kopieren;
- Fase 13 mag geen GLB, texture, UI image of audio asset laden.

## UI/HUD/minimap display gate

Fase 9 introduceert een harde UI display gate. Deze gate is server-side gevalideerd en wordt in Fase 10 publish validation, Fase 11 runtime projection validation, Fase 12 runtime client shell safety checks en Fase 13 runtime render surface safety checks meegenomen.

- source image natural size is metadata;
- runtime/editor/projection/client shell/render surface mag source pixel size nooit blind als display size gebruiken;
- display size moet via node-data/editor-data/publish data komen;
- `displayWidth` en `displayHeight` zijn vereist, tenzij een expliciete responsive rule display dimensions levert;
- `scaleMode`, `anchor` en `pivot` zijn node-data;
- `nineSlice` vereist slice margins uit node-data;
- grote source images zonder display size geven validation issue;
- schema defaults zijn hints, geen concrete HUD layout.

## Procedural generation

Fase 8.1 is de verplichte core-basis voor procedural generation.

Regels:

- procedural generation is een engine-capability, geen contentlaag;
- generatoren moeten data-driven en deterministic zijn;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- procedural output blijft draft/candidate totdat publish-flow expliciet publiceert;
- Fase 13 mag procedural output niet als renderbare concrete wereld gebruiken.

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

Fase 13 mag alleen capability/status tonen en mag geen camera, light, HUD, minimap, world of audio values hardcoden.

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

Fase 11 is een runtime projection contractlaag en is server-side afgerond.

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
- no-runtime-renderer/no-game-client.

## Runtime Client Shell Core gate

Fase 12 is een runtime client shell contractlaag en is server-side afgerond.

Runtime client shell validation bewaakt:

- shell gebruikt alleen runtime projection read-only routes;
- shell gebruikt geen editor/admin routes;
- shell gebruikt of lekt geen editor draft/candidate data;
- shell toont veilige loading/empty/error/status states;
- shell mag projection manifest/records alleen als metadata tonen;
- no 3D renderer;
- no gameplay;
- no movement/combat;
- no audio playback;
- no HUD/minimap hardcoded layout;
- no-asset-mutation/copy;
- no-hardcoded-content.

## Game Web Service Deployment gate

Fase 12.1 is een vaste deployment/service-basis en is server-side afgerond.

Deze gate bevestigt:

- `gk-game-web` active/enabled;
- `gk-game-web` draait via Node 22;
- Apache `/game/`, `/health/game` en `/runtime/projection/` routeert naar `127.0.0.1:3003`;
- game browser-smoke is groen en niet meer skipped;
- geen renderer/gameplay/content/assetmutatie.

## Runtime Render Surface Core gate

Fase 13 is een runtime render surface contractlaag. Git-basis is toegevoegd; server-side verificatie staat open.

Runtime render surface validation bewaakt:

- render surface mag een canvas/render host maken;
- render surface mag canvas/WebGL/WebGL2 capability proben;
- render surface consumeert alleen runtime projection metadata/read-only state;
- render surface gebruikt geen editor/admin routes;
- render surface gebruikt of lekt geen editor draft/candidate data;
- render surface heeft veilige empty state wanneer er geen renderbare projection payload is;
- render lifecycle mag `booting`, `ready`, `empty` en `error` zijn;
- no GLB loading;
- no texture/UI/audio asset loading;
- no concrete world/entity/NPC/quest/economy payload;
- no projection-driven scene assembly;
- no gameplay;
- no movement/combat;
- no audio playback;
- no hardcoded camera/light/HUD/minimap/audio values;
- no-asset-mutation/copy;
- no secrets.

Safety flags:

- `createsRenderSurface=true`;
- `consumesRuntimeProjectionMetadata=true`;
- `loadsAssets=false`;
- `rendersConcreteWorld=false`;
- `implementsGameplay=false`;
- `implementsMovement=false`;
- `implementsCombat=false`;
- `implementsAudioPlayback=false`;
- `hardcodesCamera=false`;
- `hardcodesLighting=false`;
- `hardcodesHud=false`;
- `hardcodesMinimap=false`;
- `hardcodesContent=false`;
- `mutatesAssets=false`;
- `usesEditorDraftData=false`.

## Open gates voor latere fases

| Input | Wanneer blokkerend |
|---|---|
| GLB role mapping | Zodra publish/runtime een concrete player/NPC/enemy/boss/object rol wil gebruiken |
| Animation mapping | Zodra NPC/combat/player behavior runtime-active wordt |
| UI display mapping | Zodra HUD, inventory, merchant, quest tracker, scrolls, boss UI of minimap display runtime verplicht wordt |
| Audio mapping | Zodra ambience, music, SFX, UI audio, NPC audio of boss audio runtime verplicht wordt |
| Camera/lighting/minimap waarden | Zodra runtime publish concrete world presentation nodig heeft |
| Economywaarden | Zodra money, prices, rewards, merchants, XP of loot nodig zijn |
| Projection-driven scene assembly | Zodra Kevin Fase 14 of een expliciete renderer/scene fase opent |
| Runtime renderer/gameplay client | Zodra een expliciete latere Runtime Game fase wordt geopend |
| Server/database/runtime status | Zodra een fase migraties, services of runtimechecks vereist zijn |

## Te verifieren fase-input voor volgende fases

Nieuwe agents moeten openen:

- `README/current-phase.md`;
- `docs/design/phase-plan/current-phase.md`;
- de actuele fase-README, nu `README/fase13.md`;
- `README/fase12.1.md`;
- `README/node-system-super-dynamic-contract.md`;
- `docs/design/asset-register.md`;
- `docs/design/audio-register.md`;
- `docs/architecture/editor-shell.md`;
- `docs/architecture/auth-boundaries.md`;
- `docs/ops/server-layout.md`;
- `docs/ops/server-verification-runbook.md`;
- `README/GameBibleNode.json`.

Fase 13 server-side validatie staat nog open. Geen Fase 14 of runtime renderer/scene assembly openen voordat Fase 13 is bevestigd en Kevin die fase opent.
