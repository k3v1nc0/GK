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

Fase 8, Fase 8.1, Fase 9, Fase 10 en Fase 11 zijn server-side afgerond en klaar.

Fase 12 Runtime Client Shell Core Git-basis is voorbereid. Fase 12 mag asset/audio/UI references alleen als runtime projection read-only metadata tonen. Fase 12 mag geen assets toevoegen, wijzigen, verwijderen, kopieren, uploaden of definitieve GLB role mapping hardcoden.

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
- publish-flow die assets kopieert, muteert of definitieve GLB roles hardcoded toewijst;
- runtime projection die assets kopieert, muteert, verwijdert of definitive GLB roles hardcoded toewijst;
- runtime client shell die assets kopieert, muteert, uploadt, verwijdert, role mapping definitief maakt of asset previews als gameplaycontent presenteert;
- UI source pixel size gebruiken als runtime/projection/client display size zonder node/editor/publish data.

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

## UI display gate

Fase 9 introduceert generieke UI asset display contracts. UI scaling validation is server-side bevestigd. Fase 10 neemt deze gate mee in publish validation. Fase 11 neemt deze gate mee in runtime projection validation. Fase 12 bewaakt dat de runtime client shell natural source size niet als display/layout hardcoding gebruikt.

Regels:

- source image natural size is metadata;
- runtime/editor/projection/client shell mag source pixel size nooit blind als display size gebruiken;
- display size moet via node-data/editor-data/publish data komen;
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

## Fase 10 publish asset gate

Fase 10 publish validation neemt asset/UI gates mee:

- asset candidates blijven references, geen hardcoded runtime roles;
- GLB roles blijven candidate/editor-data;
- UI/audio assets blijven asset-library candidates;
- generated procedural assets blijven draft/candidate input;
- snapshot metadata bevat geen asset payload;
- `assetsCopiedToGit=false` en `copiesAssetsToGit=false` blijven harde gates;
- no-asset-mutation blijft verplicht.

## Fase 11 runtime projection asset gate

Fase 11 runtime projection validation neemt asset/UI gates mee:

- projection records mogen alleen naar publish-accepted asset/audio/UI ids of snapshotmetadata verwijzen;
- raw editor draft assets en raw unpublished candidate data mogen niet uitlekken via runtime read-only routes;
- GLB roles blijven candidate/editor-data tenzij latere publish data ze expliciet accepteert;
- UI source natural size blijft metadata;
- display size, scale mode, anchor en pivot blijven node/editor/publish data;
- projection manifests/read models bevatten geen concrete asset payload of renderer instruction;
- no-asset-mutation en no-asset-copy blijven verplicht.

## Fase 12 runtime client shell asset gate

Fase 12 runtime client shell mag asset/UI/audio references alleen als read-only projection metadata tonen.

Regels:

- runtime client shell consumeert geen asset library/editor endpoints;
- runtime client shell gebruikt geen editor/admin routes;
- runtime client shell uploadt, wijzigt, kopieert of verwijdert geen assets;
- runtime client shell maakt geen GLB role mapping definitief;
- runtime client shell toont geen asset previews die concrete gameplayrollen suggereren;
- runtime client shell bouwt geen HUD/minimap runtime layout;
- runtime client shell gebruikt geen natural source pixel size als display/layout hardcoding.

## Audio assets

Status: 21 audio files aanwezig als asset-library candidates.

Audio-assets worden inhoudelijk beheerd in `docs/design/audio-register.md`. Audio mag alleen via asset library en audio nodes worden gekozen of ingesteld.

Fase 9 kan audio assets als candidates aanbieden aan latere world/HUD/minimap/audio nodes, maar wijst geen concrete music state, ambience zone, SFX event of UI-audio runtimegedrag toe. Fase 10 valideert hooguit candidate references en wijst geen concrete audio runtimecontent toe. Fase 11 projecteert audio hooguit als publish-accepted metadata/reference en speelt niets af. Fase 12 toont hooguit read-only projection metadata en speelt niets af.

## Fase 8.1 procedural asset gate

Regels:

- generated assets gebruiken Fase 7 `asset.reference`;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated placements blijven candidates totdat editor-data of publish-flow ze later expliciet accepteert;
- generated audio gebruikt `audio.reference` en blijft candidate/editor-data;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- geen procedural generator mag assets uploaden, kopieren naar Git, verwijderen of verzinnen.

## Gekoppelde nodefamilies

- world/zone/spawn assetkoppelingen op Fase 8.1 draft/candidate output;
- minimap marker assets via `gk.minimap.marker`, `gk.minimap.icon` en UI display nodes;
- HUD image candidates via `gk.ui.assetDisplay`, `gk.ui.iconDisplay`, `gk.ui.hudFrame`, `gk.ui.hudBar` en `gk.ui.nineSlice`;
- publish candidate references via Fase 10 publish-flow nodes;
- runtime projection references via Fase 11 runtime projection nodes;
- runtime client shell references via Fase 12 runtime client nodes;
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
10. Fase 10 build/typecheck/test/lint, publish smokes en no-asset-mutation bevestigd.
11. Fase 11 build/typecheck/test/lint, runtime projection smokes en no-asset-mutation bevestigd.

Open voor Fase 12:

1. Server-side bevestigen dat runtime client shell geen assets wijzigt, kopieert of uploadt.
2. Server-side bevestigen dat runtime client shell geen concrete asset/audio/UI runtimecontent hardcoded.
3. Build/typecheck/test/lint draaien.
4. Runtime client shell route/browser smokes draaien.

Open voor latere fases:

1. Definitieve GLB role mapping via editor/node-data of Kevin-input wanneer publish/runtime dat nodig maakt.
2. Definitieve UI/HUD/minimap display mappings via editor/node-data wanneer concrete runtime UI nodig wordt.
3. Nieuwe asset scan wanneer Kevin assets toevoegt, verwijdert of hernoemt.
