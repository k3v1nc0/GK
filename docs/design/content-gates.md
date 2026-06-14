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
- runtime render surface behandelen als volledige renderer, scene assembly, gameplay, asset-loader, HUD/minimap/audio runtime of contentbron;
- runtime scene assembly behandelen als renderer, asset-loader, gameplay, HUD/minimap/audio runtime of contentbron;
- runtime asset reference planning behandelen als asset loader, definitive role mapping, renderer, gameplay, HUD/minimap/audio runtime of contentbron.

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
| Fase 13 Runtime Render Surface Core | Server-side afgerond en klaar |
| Fase 14 Projection-driven Scene Assembly Core | Server-side afgerond en klaar |
| Fase 15 Runtime Asset Reference Planning Core | Git-basis toegevoegd; server-side verificatie open |

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
- runtime scene assembly editor/admin routes, raw draft data, concrete gamecontent, asset loads, final role mapping, renderer draw calls, gameplay/audio playback, hardcoded runtime values of assetmutatie zou bevatten;
- runtime asset reference planning editor/admin routes, raw draft data, concrete gamecontent, asset loads, asset byte fetch, final role mapping, renderer draw calls, gameplay/audio playback, hardcoded runtime values of assetmutatie zou bevatten;
- checks niet kunnen draaien en het risico voor direct op `main` te hoog is.

Stoppen is correct gedrag. Niet improviseren.

## Runtime Asset Reference Planning Core gate

Fase 15 is een metadata-only asset-reference planning contractlaag. Git-basis is toegevoegd; server-side verificatie staat open.

Runtime asset reference planning validation bewaakt:

- asset reference planning consumeert alleen runtime scene-plan metadata;
- asset reference planning produceert alleen asset-reference plan metadata;
- empty asset reference plan is geldig wanneer scene descriptors leeg zijn;
- geen editor/admin routes;
- geen editor draft/candidate leakage;
- geen asset load requests;
- geen asset byte fetch;
- geen GLB, texture, UI image of audio load;
- geen definitive asset/GLB role mapping;
- geen concrete world/entity/NPC/quest/economy payload;
- geen renderer scene draw calls;
- geen gameplay, movement, combat of audio playback;
- geen hardcoded world/camera/light/HUD/minimap/audio values;
- geen asset mutation/copy;
- geen secrets.

Safety flags:

- `consumesRuntimeScenePlan=true`;
- `producesAssetReferencePlan=true`;
- `usesAssetMetadataOnly=true`;
- `loadsAssets=false`;
- `fetchesAssetBytes=false`;
- `resolvesFinalAssetRoles=false`;
- `rendersScene=false`;
- `rendererDrawCalls=false`;
- `implementsGameplay=false`;
- `implementsMovement=false`;
- `implementsCombat=false`;
- `implementsAudioPlayback=false`;
- `hardcodesWorld=false`;
- `hardcodesCamera=false`;
- `hardcodesLighting=false`;
- `hardcodesHud=false`;
- `hardcodesMinimap=false`;
- `hardcodesContent=false`;
- `mutatesAssets=false`;
- `usesEditorDraftData=false`;
- `usesEditorAdminRoutes=false`.

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
- asset scan, entity validation, procedural preview/bake, Fase 9 validation, Fase 10 publish validation, Fase 11 runtime projection validation, Fase 12 runtime client shell validation, Fase 13 runtime render surface validation, Fase 14 runtime scene assembly validation en Fase 15 runtime asset reference planning validation publiceren niets naar Runtime Game;
- Fase 10 t/m Fase 15 mogen geen assets toevoegen, wijzigen, verwijderen of kopieren;
- Fase 15 mag geen GLB, texture, UI image of audio asset laden en mag geen asset bytes fetchen.

## Open gates voor latere fases

| Input | Wanneer blokkerend |
|---|---|
| GLB role mapping | Zodra publish/runtime een concrete player/NPC/enemy/boss/object rol wil gebruiken |
| Animation mapping | Zodra NPC/combat/player behavior runtime-active wordt |
| UI display mapping | Zodra HUD, inventory, merchant, quest tracker, scrolls, boss UI of minimap display runtime verplicht wordt |
| Audio mapping | Zodra ambience, music, SFX, UI audio, NPC audio of boss audio runtime verplicht wordt |
| Camera/lighting/minimap waarden | Zodra runtime publish concrete world presentation nodig heeft |
| Economywaarden | Zodra money, prices, rewards, merchants, XP of loot nodig zijn |
| Asset loading | Zodra Kevin een expliciete asset-loading/renderer fase opent |
| Runtime renderer/gameplay client | Zodra een expliciete latere Runtime Game fase wordt geopend |
| Server/database/runtime status | Zodra een fase migraties, services of runtimechecks vereist zijn |

## Te verifieren fase-input voor volgende fases

Nieuwe agents moeten openen:

- `README/current-phase.md`;
- `docs/design/phase-plan/current-phase.md`;
- de actuele fase-README, nu `README/fase15.md`;
- `README/fase14.md`;
- `README/node-system-super-dynamic-contract.md`;
- `docs/design/asset-register.md`;
- `docs/design/audio-register.md`;
- `docs/architecture/auth-boundaries.md`;
- `docs/ops/server-layout.md`;
- `docs/ops/server-verification-runbook.md`;
- `README/GameBibleNode.json`.

Fase 15 server-side validatie staat nog open. Geen Fase 16 of runtime asset-loading/renderer/gameplay openen voordat Fase 15 is bevestigd en Kevin die fase opent.
