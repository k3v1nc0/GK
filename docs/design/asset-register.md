# Asset Register

## Status

Dit register is de poort voor GLB-, UI- en assetgebruik. Fase 7 heeft de asset library server-side gevalideerd. Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) is de asset refresh server-side uitgevoerd en is de asset scan OK.

Actuele scanstatus:

| Type | Aantal | Status |
|---|---:|---|
| GLB | 4 | Aanwezig; role mapping blijft `candidate` |
| UI image | 37 | Aanwezig als asset-library candidates |
| Audio | 21 | Aanwezig als asset-library candidates; zie `docs/design/audio-register.md` |
| Invalid | 0 | Geen invalid assets |
| Missing | 0 | Geen missing assets |

Fase 8 is server-side afgerond en klaar. `Taverne.glb` is Kevin-testkeuze voor object-candidate validation en `Wizard.glb` is Kevin-testkeuze voor NPC-candidate validation. Dit zijn geen definitieve runtime-role mappings.

Fase 8.1 is server-side afgerond en klaar. Procedural generated assets mogen uitsluitend via Fase 7 `asset.reference` verwijzen naar geregistreerde assets.

Fase 9 is server-side afgerond en klaar. Fase 9 gebruikt assets alleen als asset-library references in node/editor-data. Er is geen runtime publish en er zijn geen assets toegevoegd of gewijzigd. No-asset-mutation is server-side bevestigd.

## Asset source policy

Assets mogen alleen worden gebruikt wanneer hun bron is bevestigd:

- repo-assets: bestanden die in de repository staan;
- server-assets: bestanden onder `/var/www/gk/assets`;
- later bewust gemaakte assets: assets die Kevin later toevoegt, kiest of goedkeurt.

Niet toegestaan:

- dummy assets;
- nepmodellen;
- tijdelijke vervangers;
- definitieve runtime-roltoewijzing zonder node/editor-data;
- runtime-hardcoding van concrete assetkeuzes;
- procedural generators die assets verzinnen of naar Git kopieren;
- UI source pixel size gebruiken als runtime display size zonder node-data.

## Assetpaden

| Pad | Status | Eigenaar controle | Opmerking |
|---|---|---|---|
| `assets/` in repo | Bevestigd | GK Code Copiloot via GitHub | Asset package bevat 4 GLB, 37 UI images en 21 audio files. |
| `/var/www/gk/assets` | Bevestigd | Codex buiten Git | Server assetbron voor de scanner. |
| `GK_ASSET_SOURCE_DIR` | Bevestigd | Codex buiten Git | `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` |

## GLB assets

Deze GLB's bestaan als geregistreerde assets. Hun gameplayrol is nog niet definitief.

| Assetpad | Status | Toegestaan gebruik | Open gate |
|---|---|---|---|
| `assets/glb/buildings/Blacksmit forge.glb` | Candidate GLB | Kandidaat GLB asset; geen definitieve rol | Role/capability-keuze via editor |
| `assets/glb/characters/Blacksmit.glb` | Candidate GLB | Kandidaat GLB asset; geen definitieve rol | Role/capability-keuze via editor |
| `assets/glb/buildings/Taverne.glb` | Candidate GLB; Fase 8 object-test | Kevin-testkeuze voor object-candidate validation; geen definitieve rol | Definitieve role mapping via editor |
| `assets/glb/characters/Wizard.glb` | Candidate GLB; Fase 8 NPC-test | Kevin-testkeuze voor NPC-candidate validation; geen definitieve rol | Definitieve role mapping en animation mapping via editor |

Een assetnaam bepaalt nog niet of iets player, NPC, merchant, enemy, boss, prop, environment of quest object is.

## UI image assets

Status: 37 UI images aanwezig als asset-library candidates.

| Groep | Aantal | Gate |
|---|---:|---|
| HUD frames/fills | 11 | Alleen via HUD/UI display nodes kiezen |
| Action icons | 6 | Alleen via UI/action nodes kiezen |
| Item icons | 8 | Alleen via item/UI nodes kiezen |
| Status icons | 6 | Alleen via status/combat/UI nodes kiezen |
| Minimap markers | 6 | Alleen via minimap/UI display nodes kiezen |

HUD-bestanden, icon-bestanden en minimap marker-bestanden worden door de asset scan als UI/image assets gezien. Ze zijn beschikbaar als library candidates, maar zijn geen definitieve HUD-layout, minimapconfiguratie, itemdata, combatdata of runtime UI.

## Fase 9 UI display gate

Fase 9 introduceert generieke UI asset display contracts. UI scaling validation is server-side bevestigd.

Regels:

- source image natural size is metadata;
- runtime/editor mag source pixel size nooit blind als display size gebruiken;
- display size moet via node-data/editor-data komen;
- `displayWidth` en `displayHeight` zijn vereist, tenzij responsive rules expliciet dimensions leveren;
- `scaleMode`, `anchor`, `pivot`, `opacity` en `zIndex` zijn node-data;
- `nineSlice` vereist slice margins uit node-data;
- grote source images zonder display size geven validation issue;
- schema defaults zijn hints, geen concrete HUD layout.

Schema hints:

- icon display: 32x32;
- minimap marker display: 24x24;
- small status icon: 24x24;
- HUD bar/frame display size blijft node-data required.

## Audio assets

Status: 21 audio files aanwezig als asset-library candidates.

Audio-assets worden inhoudelijk beheerd in `docs/design/audio-register.md`. Audio mag alleen via asset library en audio nodes worden gekozen of ingesteld.

Fase 9 kan audio assets als candidates aanbieden aan latere world/HUD/minimap/audio nodes, maar wijst geen concrete music state, ambience zone, SFX event of UI-audio runtimegedrag toe.

## Fase 8.1 procedural asset gate

Regels:

- generated assets gebruiken Fase 7 `asset.reference`;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated placements blijven candidates totdat editor-data of publish-flow ze later expliciet accepteert;
- generated audio gebruikt `audio.reference` en blijft candidate/editor-data;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- geen procedural generator mag assets uploaden, kopieren naar Git, verwijderen of verzinnen.

## Fase 9 gekoppelde nodefamilies

- world/zone/spawn assetkoppelingen op Fase 8.1 draft/candidate output;
- minimap marker assets via `gk.minimap.marker`, `gk.minimap.icon` en UI display nodes;
- HUD image candidates via `gk.ui.assetDisplay`, `gk.ui.iconDisplay`, `gk.ui.hudFrame`, `gk.ui.hudBar` en `gk.ui.nineSlice`;
- audio blijft candidate/editor-data voor latere audio nodefamilies.

## Codex-taken buiten Git

Afgerond:

1. `/var/www/gk/assets` gecontroleerd.
2. GLB-, UI- en audiobestanden geteld.
3. `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
4. Fase 7 asset library scan server-side gevalideerd.
5. Fase 8 entity/component migratie toegepast.
6. Fase 8.1 build/typecheck/test/lint en migratie bevestigd.
7. Asset refresh na `Assets - new` uitgevoerd met GLB=4, UI images=37, audio files=21, invalid=0, missing=0.
8. Fase 9 build/typecheck/test/lint en route/panel smoke bevestigd.
9. Fase 9 no-asset-mutation en UI display validation bevestigd.

Open voor latere fases:

1. Definitieve GLB role mapping via editor/node-data of Kevin-input wanneer publish/runtime dat nodig maakt.
2. Definitieve UI/HUD/minimap display mappings via editor/node-data wanneer concrete runtime UI nodig wordt.
3. Nieuwe asset scan wanneer Kevin assets toevoegt, verwijdert of hernoemt.
