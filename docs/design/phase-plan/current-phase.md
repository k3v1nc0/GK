# Current Phase

## Fase

Actieve fase: Fase 8 - universal entity/component systeem voor GLB objecten en NPCs.

## Status

Fase-status: Fase 8 Git-basis voorbereid; server-side validatie staat nog open.

Fase 8 bouwt de basis voor component-gedreven entities bovenop Fase 6 typed graph sockets en Fase 7 asset library. De fase voegt schema-contracten, validators, generieke node types, editor-only API-contracten, Entity/Component panel state, database-migratie en tests toe. De fase publiceert niets naar Runtime Game.

## Doel

Maak component-gedreven entities zodat dezelfde GLB via nodes object-kandidaat, NPC-kandidaat, enemy-kandidaat, boss-kandidaat, loot-kandidaat, VFX-kandidaat of player-appearance-kandidaat kan worden.

Dit blijft data-gedreven:

- GLB role mapping blijft editor-data;
- component stacks blijven editor/node-data;
- runtime-active gedrag blijft gated;
- publish/runtime consumeert pas later expliciet gepubliceerde data.

## Bronnen gecontroleerd

Voor deze fase zijn de actuele GitHub-bronnen gebruikt:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/architecture/editor-shell.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`
- Fase 6 graph/schema code
- Fase 7 asset-library/API/editor code

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
- Entity draft, validation, asset mapping en group state publiceren niets naar runtime.

## Bevestigde Kevin-input

- Object test GLB: `Taverne.glb`.
- NPC test GLB: `Wizard.glb`.
- Ontbrekende animaties zijn geen blocker voor kandidaat-entity.
- Ontbrekende animaties geven wel validation warning.
- NPC/combat/player behavior mag pas runtime-actief worden zodra animation mapping expliciet via editor-data is ingesteld.

Deze inputs mogen alleen worden gebruikt als test/fixture-input en documenteerde Kevin-keuze. Ze zijn geen hardcoded runtimecontent.

## Fase 8 Git-output

Aangemaakt of bijgewerkt in Fase 8:

- `packages/schemas/src/entity-components.ts`
- `packages/schemas/src/entity-validation.ts`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/node-graph.ts`
- `packages/node-types/src/entity-component-nodes.ts`
- `packages/node-types/src/index.ts`
- `apps/api-server/src/editor-entity-routes.ts`
- `apps/api-server/src/auth-routes.ts`
- `apps/api-server/src/http-server.ts`
- `apps/api-server/src/index.ts`
- `apps/editor-web/src/panels.ts`
- `apps/editor-web/src/editor-shell.ts`
- `db/migrations/0004_entity_component_core.sql`
- `tests/phase8-entity-components.test.mjs`
- `tests/editor-shell.test.mjs`
- fase-documentatie

## Entity/component schema

Fase 8 definieert generieke component-contracten voor:

- `transform`
- `renderable`
- `collider`
- `interactable`
- `npc_brain`
- `audio_emitter`
- `combatant`
- `boss`
- `loot`
- `quest_target`
- `merchant`
- `player_appearance`
- `group_transform`

Een entity draft kan een `asset.reference` naar de Fase 7 asset library bevatten. Componenten hebben `candidate`, `assigned` of `invalid` status. Runtime-active gedrag gebruikt een aparte gate met editor-data confirmation en animation mapping.

## Node types

Fase 8 voegt generieke graph node types toe:

- `gk.entity.spawnFromAsset`
- `gk.entity.addComponent`
- `gk.entity.group`
- `gk.entity.groupTransform`
- `gk.component.renderable`
- `gk.component.transform`
- `gk.component.collider`
- `gk.component.interactable`
- `gk.component.audioEmitter`
- `gk.component.npcBrain`
- `gk.component.combatant`
- `gk.component.boss`
- `gk.component.loot`
- `gk.component.questTarget`
- `gk.component.merchant`
- `gk.component.playerAppearance`
- `gk.npc.makeFromAsset`

Fase 8 breidt `NODE_VALUE_SOCKET_TYPES` uit met:

- `entity.reference`
- `component.reference`
- `entity.group.reference`

`asset.reference` en `audio.reference` uit Fase 6/7 blijven leidend voor asset/audio pickers.

## Validatie

Fase 8-validatie:

- `renderable` vereist een `asset.reference` naar een GLB asset met candidate/assigned editor-data status;
- `transform` en `group_transform` vereisen data-gedreven position/rotation/scale velden;
- `collider` is optional en data-gedreven;
- `npc_brain`, `combatant`, `boss`, `merchant`, `quest_target` en `player_appearance` blijven candidate totdat expliciete editor-data bestaat;
- `audio_emitter` vereist `audio.reference` wanneer audio assets bestaan;
- audio count 0 blijft geldig en gated;
- ontbrekende animation mapping geeft warning voor candidate entities;
- runtime-active NPC/combat/player behavior vereist expliciete animation mapping via editor-data;
- entity validation publiceert niets naar Runtime Game.

## API contract

Editor-only routes:

- `GET /editor/entities/draft`
- `POST /editor/entities/validate`
- `GET /editor/entities/groups`
- `GET /editor/entities/asset-mappings`
- `PATCH /editor/entities/asset-mappings/:assetId`

Game sessions en anonymous requests mogen geen editor entity beheer krijgen. State-changing routes blijven CSRF/Origin beschermd. Geen route uploadt assets, maakt runtimecontent aan of publiceert naar runtime.

## Database/schema contract

Fase 8 database/schema contract:

- `editor_entity_template_drafts`
- `editor_entity_component_definition_drafts`
- `editor_entity_group_drafts`
- `editor_entity_component_validation_issues`
- `editor_asset_entity_role_mapping_drafts`

De migratie is idempotent met `CREATE TABLE IF NOT EXISTS` en bevat geen echte assetdata, geen Taverne/Wizard records en geen concrete gamecontent.

## Editor UI contract

- Entity/Component panel state is voorbereid.
- Component list toont candidate/assigned/invalid counts.
- Renderable component toont `asset.reference`.
- NPC/combat/player component toont animation warning als mapping ontbreekt.
- Audio emitter blijft gated/leeg bij audio=0.
- Group transform state is voorbereid.
- Geen concrete NPC/object content wordt buiten Kevin-testkeuzes getoond.

## Open Kevin-input

Geen blokkerende Kevin-input voor de Git-basis van Fase 8.

Definitieve GLB-role mapping, animation mappings voor runtime-active behavior, UI-assets en audio-assets blijven latere editor/content gates. Zonder Kevin/editor-keuze mag de code geen roles of behavior activeren.

## Open Codex/Claude-taken buiten Git

- `pnpm install` draaien.
- `pnpm build`, `pnpm typecheck`, `pnpm test` en `pnpm lint` draaien.
- `db/migrations/0004_entity_component_core.sql` toepassen.
- Nieuwe Fase 8 tabellen controleren.
- Editor-only route smoke doen voor entity draft/validate/groups/asset-mappings.
- Anonymous/game session denial testen.
- Asset/entity validation check met `Taverne.glb` als object-test en `Wizard.glb` als NPC-test.
- Bevestigen dat missing animation mapping warning is voor candidate en blocker voor runtime-active behavior.
- Bevestigen dat Fase 8 niets publiceert naar runtime en geen assets naar Git kopieert.

## Fasebeoordeling

Fase 8 is nog niet volledig server-side klaar.

Afgerond in Git:

- entity/component schema;
- component validators;
- entity/component node types;
- typed entity/component/group sockets;
- editor-only API-contracten;
- Entity/Component panel state;
- database-migratie;
- tests;
- documentatie rond Kevin-testkeuzes, animation gates en role mapping.

Nog open:

- server-side install/build/typecheck/test/lint;
- MySQL migratie;
- API/editor smoke;
- asset/entity checks met echte server asset library.

Huidige status: Fase 8 Git-basis voorbereid; server-side validatie moet nog volgen.
