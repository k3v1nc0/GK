# Current Phase

## Fase

Actieve status: Fase 8.1 Git-basis voorbereid; server-side validatie nog open.

Volgende stap: Fase 8.1 server-side verificatie door Codex/Claude.

Fase 9 blijft Fase 9 en mag pas als implementatiefase starten wanneer Kevin die later opent. Fase 9 moet dan bouwen op de Fase 8.1 procedural generation core en mag die core niet opnieuw definieren.

## Status

Fase-status: Fase 8 is server-side afgerond en klaar. Fase 8.1 heeft Git/code/docs/tests voorbereid voor Procedural Generation Core, maar is nog niet server-side afgerond.

Fase 8.1 publiceert niets naar Runtime Game. Procedural output blijft editor draft/preview/bake data totdat een latere publish-flow expliciet publiceert.

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
- GLB=4, UI images=0, audio=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- GLB role mapping blijft editor-data/Kevin-keuze.
- UI/audio count 0 is geldig en mag geen dummy assets veroorzaken.
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

Fase 9 mag:

- generated zones gebruiken;
- generated spawn areas gebruiken;
- generated path networks gebruiken;
- generated resource distributions gebruiken;
- generated entity placements gebruiken;
- camera, lighting, fog, sky en minimap als editor/node-data modelleren.

Fase 9 mag niet:

- world/zone/minimap als losse hardcoded world settings bouwen;
- camera/light/minimap waarden hard-coden;
- procedural generation core opnieuw definieren;
- procedural output direct naar runtime publiceren.

## Open Kevin-input

Geen blokkerende Kevin-input voor de Fase 8.1 Git-basis.

Voor server-side validatie is geen nieuwe Kevin-input nodig. Voor latere concrete generatorgedrag, editorervaring of testgraphs kan Kevin-input later blokkerend worden wanneer zulke keuzes niet uit GameBible/editor-data/registries komen.

## Open Codex/Claude-taken buiten Git

Open voor Fase 8.1:

- `pnpm install/build/typecheck/test/lint` draaien;
- migratie `db/migrations/0005_procedural_generation_core.sql` toepassen;
- Procedural API/editor smoke uitvoeren;
- determinism smoke: zelfde seed geeft dezelfde output;
- different-seed smoke: andere seed mag andere output geven;
- bevestigen dat procedural preview/bake niets naar runtime publiceert;
- bevestigen dat procedural generation geen assets naar Git kopieert;
- bevestigen dat anonymous/game sessions geen procedural editor beheer krijgen.

## Fasebeoordeling

Fase 8 is klaar.

Fase 8.1 Git-basis is voorbereid, maar Fase 8.1 is nog niet server-side klaar.

Huidige status: Fase 8.1 wacht op server-side validatie.
