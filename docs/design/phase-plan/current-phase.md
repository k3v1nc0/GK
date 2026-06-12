# Current Phase

## Fase

Actieve status: Fase 8.1 server-side afgerond en klaar.

Volgende stap: Fase 9 blijft de volgende implementatiefase wanneer Kevin die later opent.

Fase 9 blijft Fase 9 en moet blijven bouwen op de Fase 8.1 procedural generation core zonder die core opnieuw te definieren.

## Status

Fase-status: Fase 8 is server-side afgerond en klaar. Fase 8.1 is server-side afgerond en klaar.

Fase 8.1 publiceert niets naar Runtime Game. Procedural output blijft editor draft/preview/bake data totdat een latere publish-flow expliciet publiceert.

Commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) staat op `main`. De asset refresh is server-side uitgevoerd en de asset scan is OK met GLB=4, UI images=37, audio files=21, invalid=0 en missing=0.

## Fase 8 server-side resultaat

Fase 8 is server-side afgerond op HEAD `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`).

Bevestigd:

- `pnpm install`: OK;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- migratie `0004_entity_component_core.sql`: OK;
- nieuwe Fase 8 tabellen: OK;
- entity routes: OK;
- anonymous/game denied: OK;
- `Taverne.glb` object-test: OK;
- `Wizard.glb` NPC-test: OK;
- animation warning/blocker: OK;
- GameBible save: OK;
- game-site reachable: OK;
- runtime publish: nee bevestigd;
- assets niet naar Git: bevestigd;
- blockers: geen;
- `gk-api` en `gk-editor-web` zijn herstart om de huidige build live te laden.

## Fase 8.1 server-side resultaat

Fase 8.1 is server-side afgerond op HEAD `173076db0348ed7043fde682c978b8b45afb3fcf` met latere codex-fix op `b3cd38fb7a5a4a3da50d4a773c99aa56a348e4e5`.

Bevestigd:

- `pnpm install`: OK;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- migratie `0005_procedural_generation_core.sql`: OK;
- nieuwe Fase 8.1 tabellen: OK;
- procedural API/editor smoke: OK;
- same-seed determinism: OK;
- different-seed smoke: OK;
- no runtime publish: OK;
- no asset copy to Git: OK;
- anonymous/game denied: OK;
- GameBible save: OK;
- game-site reachable: OK;
- `gk-api` en `gk-editor-web` draaien via Node 22 en zijn actief/herstart.

## Asset refresh na Assets - new

De asset refresh na commit `44defc0f79f032cabc07eba43573a40c5f629b97` is server-side afgerond.

Bevestigd:

- commit `Assets - new` staat op `main`;
- `git pull`: up to date;
- `git status`: clean;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- asset scan: OK;
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`;
- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`;
- blockers: geen.

Interpretatie:

- HUD-bestanden zijn UI/image assets.
- Icon-bestanden zijn UI/image assets.
- Minimap marker-bestanden zijn UI/image assets.
- Ambience, music, SFX en UI-audio zijn audio assets.
- UI/audio assets zijn beschikbaar als asset-library candidates, niet als hardcoded HUD/audio runtimecontent.
- Bestaande GLB's blijven actief als geregistreerde candidate assets.
- `Taverne.glb` blijft candidate.
- `Wizard.glb` blijft candidate.
- Definitieve runtime roles zijn niet toegekend.

## Fase 8.1 Git-basis

Fase 8.1 legt de procedural generation foundation vast in het node-system voordat wereld-, zone-, camera-, lighting- en minimapnodes worden gebouwd.

Toegevoegd in Git:

- procedural graph, generator node en seed contracts;
- world seed, zone seed en local seed contracts;
- deterministic random stream contract en utility;
- generation input/output contracts;
- generated draft entity/group contracts;
- generated placement, spawn area, path network, resource distribution en audio candidate contracts;
- generation validation issue, preview result en bake draft result contracts;
- procedural node families op Fase 6 typed sockets;
- editor-only procedural route contracts;
- Procedural Generation Panel state;
- migratie `0005_procedural_generation_core.sql`;
- tests voor determinism, gates, editor-only access, no-runtime-publish en no-asset-copy.

Fase 8.1 sluit aan op:

- Fase 6 typed node graph core;
- Fase 7 asset library;
- Fase 8 entity/component core.

## Blijvende fasecontracten

- `README/GameBibleNode.json` is de leidende Game Bible.
- Concrete gamecontent mag alleen uit GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.
- Geen concrete gamecontent in runtimecode.
- Hoofdketen: `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` is bevestigd.
- Actuele asset scan: GLB=4, UI images=37, audio files=21, invalid=0, missing=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- GLB role mapping blijft editor-data/Kevin-keuze.
- UI/audio assets zijn asset-library candidates totdat editor/node-data of Kevin-input ze expliciet kiest.
- Entity draft, validation, asset mapping, group state, procedural preview en procedural bake publiceren niets naar runtime.
- Procedural output blijft editor draft/preview/bake data totdat een latere publish-flow expliciet publiceert.
- Server/runtime blijft later authoritative; client mag geen eigen MMO-state verzinnen.

## Fase 8 blijvende output

Fase 8 heeft de basis gelegd voor component-gedreven entities zodat dezelfde GLB via data object-kandidaat, NPC-kandidaat, enemy-kandidaat, boss-kandidaat, loot-kandidaat, VFX-kandidaat of player-appearance-kandidaat kan worden.

Dit blijft data-gedreven:

- GLB role mapping blijft editor-data;
- component stacks blijven editor/node-data;
- runtime-active gedrag blijft gated;
- publish/runtime consumeert pas later expliciet gepubliceerde data.

## Bevestigde Kevin-input voor Fase 8

- Object test GLB: `Taverne.glb`.
- NPC test GLB: `Wizard.glb`.
- Ontbrekende animaties zijn geen blocker voor kandidaat-entity.
- Ontbrekende animaties geven wel validation warning.
- NPC/combat/player behavior mag pas runtime-actief worden zodra animation mapping expliciet via editor-data is ingesteld.

Deze inputs zijn test/fixture-input en documenteerde Kevin-keuze. Ze zijn geen hardcoded runtimecontent.

## Fase 8.1 contract

Belangrijkste grenzen:

- Procedural generation is een engine-capability in de core.
- Procedural output mag geen hardcoded gamecontent zijn.
- Generatoren moeten data-driven en deterministic zijn.
- Zelfde seed + zelfde graph + zelfde inputs = zelfde output.
- Fase 8.1 publiceert niets naar Runtime Game.
- Bake maakt alleen editor draft data of bake draft result, geen runtime publish.
- Generated entities gebruiken Fase 8 entity/component contracts.
- Generated assets gebruiken Fase 7 `asset.reference`.
- Anonymous/game session krijgt geen procedural editor beheer.

## Fase 9 afhankelijkheid

Fase 9 blijft `World, camera, lighting, levels/zones en minimap nodes`, maar wordt afhankelijk van Fase 8.1.

Fase 9 mag worden geopend wanneer Kevin dat doet. De vereiste Fase 8.1 server-side validatie en asset refresh zijn afgerond, maar Fase 9 is nog niet geimplementeerd.

Fase 9 mag:

- generated zones gebruiken;
- generated spawn areas gebruiken;
- generated path networks gebruiken;
- generated resource distributions gebruiken;
- generated entity placements gebruiken;
- camera, lighting, fog, sky en minimap als editor/node-data modelleren;
- UI images en audio files als asset-library candidates aanbieden aan world/HUD/minimap/audio nodes.

Fase 9 mag niet:

- world/zone/minimap als losse hardcoded world settings bouwen;
- camera/light/minimap waarden hard-coden;
- HUD-, icon-, minimap- of audio-assets als definitieve runtimecontent hard-coden;
- procedural generation core opnieuw definieren;
- procedural output direct naar runtime publiceren.

## Open Kevin-input

Geen blokkerende Kevin-input voor de Fase 8.1 Git-basis of de nieuwe asset scan.

Voor Fase 9 kan Kevin-input later blokkerend worden zodra concrete camera, lighting, minimap, HUD of audio-keuzes nodig zijn die niet uit GameBible/editor-data/registries/procedural draft-output komen.

## Fasebeoordeling

Fase 8 is klaar.

Fase 8.1 server-side is afgerond en klaar.

Huidige status: Fase 8.1 is server-side gevalideerd en de asset scan na `Assets - new` is OK.

Volgende fase: Fase 9 mag worden geopend wanneer Kevin dat doet, maar is nog niet geimplementeerd.
