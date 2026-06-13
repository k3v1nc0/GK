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

Fase 8 t/m Fase 13 zijn server-side afgerond en klaar.

Fase 14 Projection-driven Scene Assembly Core Git-basis is toegevoegd. Fase 14 mag asset/audio/UI references alleen als runtime projection metadata kennen en mag geen assets laden, toevoegen, wijzigen, verwijderen, kopieren of definitieve GLB/asset role mapping hardcoden.

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
- runtime render surface die GLB, textures, UI images of audio assets laadt;
- runtime scene assembly die GLB, textures, UI images of audio assets laadt;
- runtime scene assembly die asset URLs aanvraagt;
- runtime scene assembly die definitive GLB of asset role mapping maakt;
- runtime scene assembly die asset previews of concrete gameplayrollen toont;
- UI source pixel size gebruiken als runtime/projection/client/render/scene display size zonder node/editor/publish data.

## Assetpaden

| Pad | Status | Eigenaar controle | Opmerking |
|---|---|---|
| `assets/` in repo | Bevestigd | GK Code Copiloot via GitHub | Asset package bevat 4 GLB, 37 UI images en 21 audio files. |
| `/var/www/gk/assets` | Bevestigd | Codex buiten Git | Server assetbron voor de scanner. |
| `GK_ASSET_SOURCE_DIR` | Bevestigd | Codex buiten Git | `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` |

## GLB assets

GLB's bestaan als geregistreerde assets. Hun gameplayrol is nog niet definitief.

Een assetnaam bepaalt nog niet of iets player, NPC, merchant, enemy, boss, prop, environment of quest object is.

Fase 14 laadt geen GLB en maakt geen GLB role mapping definitief. GLB loading hoort pas bij een latere expliciet geopende asset-loading/renderer fase.

## UI image assets

Status: 37 UI images aanwezig als asset-library candidates.

HUD-bestanden, icon-bestanden en minimap marker-bestanden worden door de asset scan als UI/image assets gezien. Ze zijn beschikbaar als library candidates, maar zijn geen definitieve HUD-layout, minimapconfiguratie, itemdata, combatdata of runtime UI.

Fase 14 gebruikt geen UI image assets en bouwt geen HUD/minimap runtime layout. Scene assembly maakt alleen neutrale scene plan metadata.

## Fase 14 runtime scene assembly asset gate

Fase 14 runtime scene assembly is een metadata assembly laag, geen asset consumer.

Regels:

- scene assembly consumeert alleen runtime projection read-only records;
- scene assembly produceert alleen scene plan metadata;
- scene assembly laadt geen GLB;
- scene assembly laadt geen texture, UI image of audio asset;
- scene assembly vraagt geen asset URLs aan;
- scene assembly bouwt geen asset-loader node;
- scene assembly maakt geen GLB of asset role mapping definitief;
- scene assembly rendert geen asset preview of scene;
- scene assembly toont geen concrete world/entity/NPC/quest/economy payload;
- scene assembly wijzigt, kopieert, uploadt of verwijdert geen assets.

## Audio assets

Status: 21 audio files aanwezig als asset-library candidates.

Audio-assets worden inhoudelijk beheerd in `docs/design/audio-register.md`. Audio mag alleen via asset library en audio nodes worden gekozen of ingesteld.

Fase 14 speelt geen audio af, laadt geen audio assets en wijst geen concrete audio runtime mapping toe.

## Gekoppelde nodefamilies

- publish candidate references via Fase 10 publish-flow nodes;
- runtime projection references via Fase 11 runtime projection nodes;
- runtime client shell references via Fase 12 runtime client nodes;
- runtime render surface references via Fase 13 runtime render nodes;
- runtime scene assembly references via Fase 14 runtime scene assembly nodes;
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
9. Fase 10 build/typecheck/test/lint, publish smokes en no-asset-mutation bevestigd.
10. Fase 11 build/typecheck/test/lint, runtime projection smokes en no-asset-mutation bevestigd.
11. Fase 12 build/typecheck/test/lint, runtime shell smokes en no-asset-mutation bevestigd.
12. Fase 12.1 `gk-game-web` service, route smokes, browser smokes en no-asset-mutation bevestigd.
13. Fase 13 runtime render surface build/typecheck/test/lint, route/browser smokes en no-asset-mutation bevestigd.

Open voor Fase 14:

1. Server-side bevestigen dat runtime scene assembly geen assets laadt, wijzigt, kopieert of uploadt.
2. Server-side bevestigen dat runtime scene assembly geen GLB loading of definitive role mapping toevoegt.
3. Server-side bevestigen dat runtime scene assembly geen concrete asset/audio/UI runtimecontent hardcoded.
4. Build/typecheck/test/lint draaien.
5. Runtime scene assembly route/browser smokes draaien.

Open voor latere fases:

1. Definitieve GLB role mapping via editor/node-data of Kevin-input wanneer publish/runtime dat nodig maakt.
2. Definitieve UI/HUD/minimap display mappings via editor/node-data wanneer concrete runtime UI nodig wordt.
3. Asset loading alleen in een expliciet geopende asset-loading/renderer fase.
4. Nieuwe asset scan wanneer Kevin assets toevoegt, verwijdert of hernoemt.
