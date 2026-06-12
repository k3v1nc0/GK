# Fase 8 - Universal entity/component systeem voor GLB objecten en NPCs

## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- Alles draait eerst op 1 eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- GK Code Copiloot maakt geen branches en geen pull requests.
- Codex doet serverwerk buiten Git: OS, MySQL, Redis, Nginx, systemd, secrets, rechten, builds, runtime checks en lokale scans.
- Concrete gamecontent hoort niet in runtimecode.
- Alles wat Kevin maakt, speelt of instelt loopt via Database > Editor/Node-system > Publish > Runtime Game.
- De code mag alleen engine-capabilities bevatten: schemas, node types, validators, renderer/audio/protocol primitives en vaste socket types.
- Waardes zoals camera, licht, geld, prijzen, levels, NPC routes, NPC taken, dialogen, quests, minimap lagen, audio en HUD instellingen moeten node-data zijn.
- 3D wereldobjecten gebruiken bestaande of later door Kevin gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden ook via nodes gekozen en ingesteld.
- De AI mag geen dummy assets, nepmodellen, tijdelijke vervangers, definitieve namen of definitieve verhaalcontent verzinnen.
- Als verplichte Kevin-input mist, stopt de fase met een duidelijke lijst ontbrekende items.
- Maak geen losse backupbestanden, geen tijdelijke markdown-dumps en geen extra README-bestanden die niet blijvend onderhouden worden.

## Status

Fase 8 Git-basis voorbereid. Server-side migratie, install/build/typecheck/test/lint, API/editor smoke en asset/entity checks moeten nog door Codex/Claude op de server worden uitgevoerd.

## Doel van de fase

Maak component-gedreven entities zodat dezelfde GLB via nodes object-kandidaat, NPC-kandidaat, enemy-kandidaat, boss-kandidaat, loot-kandidaat, VFX-kandidaat of player-appearance-kandidaat kan worden.

## Bevestigde Kevin-input

- Object test GLB: `Taverne.glb`.
- NPC test GLB: `Wizard.glb`.
- Ontbrekende animaties zijn geen blocker voor kandidaat-entity.
- Ontbrekende animaties geven wel een validation warning.
- NPC/combat/player behavior mag pas runtime-actief worden zodra animation mapping expliciet via editor-data is ingesteld.

Deze GLB-namen zijn testkeuzes en documenteerde Kevin-input. Ze zijn geen hardcoded runtimecontent en krijgen geen definitieve runtime-role in code of migratie.

## Belangrijke grens

Fase 8 bouwt alleen capabilities, schemas, validators, node types, editor/API-contracten en database-schema.

Niet toegestaan:

- assets toevoegen aan Git;
- dummy assets of fake GLB/UI/audio toevoegen;
- concrete NPCs, quests, prijzen, camera, licht, boss, route, minimap, HUD of audio hard-coden;
- Taverne of Wizard als definitieve runtime-role in code of migratie vastleggen;
- GLB role mapping automatisch definitief maken;
- runtime publish vanuit editor draft, validation of asset/entity mapping.

Role mapping blijft editor-data. Kevin/editor kiest later definitieve rollen.

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

Components zijn data-contracten. Runtime-active gedrag blijft gated totdat editor/node-data en publish-flow dit later expliciet activeren.

## Node types

Fase 8 voegt generieke node types toe als engine-capabilities:

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

Typed sockets blijven leidend. Fase 8 breidt de socket-capabilities uit met `entity.reference`, `component.reference` en `entity.group.reference`, naast `asset.reference` en `audio.reference`.

## Validatie

Fase 8-validatie:

- `renderable` vereist een `asset.reference` naar een GLB asset met candidate/assigned editor-data status;
- `transform` en `group_transform` vereisen data-gedreven position/rotation/scale velden;
- `collider` is optional en data-gedreven;
- `npc_brain`, `combatant`, `boss`, `merchant`, `quest_target` en `player_appearance` blijven candidate totdat expliciete editor-data bestaat;
- `audio_emitter` vereist `audio.reference` wanneer audio assets bestaan, maar audio count 0 blijft geldig en gated;
- ontbrekende animation mapping geeft een warning voor candidate entities;
- runtime-active NPC/combat/player behavior vereist expliciete animation mapping via editor-data;
- editor draft validation publiceert niets naar Runtime Game.

## API/editor contracts

Editor-only routes:

- `GET /editor/entities/draft`
- `POST /editor/entities/validate`
- `GET /editor/entities/groups`
- `GET /editor/entities/asset-mappings`
- `PATCH /editor/entities/asset-mappings/:assetId`

Anonymous en game sessions krijgen geen editor entity beheer. State-changing routes blijven CSRF/Origin beschermd. Deze routes uploaden geen assets, maken geen runtimecontent aan en publiceren niets.

Editor UI:

- Entity/Component panel state voorbereid;
- component list toont candidate/assigned/invalid counts;
- renderable component kan `asset.reference` tonen;
- NPC/combat/player component toont animation warning als mapping ontbreekt;
- audio emitter blijft gated/leeg bij audio=0;
- group transform state voorbereid.

## Database/schema contract

Fase 8 voegt schema-only migratie toe:

- `editor_entity_template_drafts`
- `editor_entity_component_definition_drafts`
- `editor_entity_group_drafts`
- `editor_entity_component_validation_issues`
- `editor_asset_entity_role_mapping_drafts`

De migratie bevat geen echte assetdata, geen Taverne/Wizard records en geen concrete gamecontent.

## Acceptatiechecklist

- [x] Entity/component schema bestaat.
- [x] Entity kan verwijzen naar `asset.reference` uit Fase 7.
- [x] Dezelfde GLB kan object-candidate en NPC-candidate zijn via data/components.
- [x] Taverne/Wizard zijn alleen testinput/docs, geen runtime hardcode.
- [x] Missing animation mapping is warning voor candidate.
- [x] Runtime-active NPC/combat/player behavior vereist expliciete animation mapping.
- [x] Audio emitter blijft gated bij audio count 0.
- [x] Entity/component node types bestaan.
- [x] Group transform contract bestaat.
- [x] Editor-only API-contracten zijn voorbereid.
- [x] Entity/Component panel state is voorbereid.
- [x] Database-migratie bevat alleen schema.
- [x] Tests toegevoegd.
- [ ] Server-side `pnpm install/build/typecheck/test/lint` groen.
- [ ] MySQL migratie `0004_entity_component_core.sql` toegepast.
- [ ] API/editor smoke voor entity routes bevestigd.
- [ ] Asset/entity checks met Taverne/Wizard bevestigd.

## Codex/Claude-taken buiten Git

Na deze Git-basis moet Codex/Claude server-side uitvoeren:

1. `pnpm install`.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.
6. MySQL migratie `db/migrations/0004_entity_component_core.sql` toepassen.
7. Controleren dat de nieuwe Fase 8 tabellen bestaan.
8. Editor admin login smoke.
9. `GET /editor/entities/draft` smoke.
10. `POST /editor/entities/validate` smoke met editor session en CSRF.
11. `GET /editor/entities/groups` smoke.
12. `GET /editor/entities/asset-mappings` smoke.
13. `PATCH /editor/entities/asset-mappings/:assetId` smoke met editor session en CSRF.
14. Anonymous/game session denial voor entity beheer testen.
15. Asset/entity validation check met `Taverne.glb` als object-test en `Wizard.glb` als NPC-test.
16. Bevestigen dat missing animation mapping warning is voor candidate en blocker voor runtime-active behavior.
17. Bevestigen dat Fase 8 niets publiceert naar runtime en geen assets naar Git kopieert.

## Testplan

Gebruik de server asset library als bron:

1. Kies `Taverne.glb` als object-test via editor-data.
2. Kies `Wizard.glb` als NPC-test via editor-data.
3. Maak beide alleen candidate entity/component drafts.
4. Controleer dat renderable via `asset.reference` loopt.
5. Controleer dat `npc_brain` zonder animation mapping warning geeft.
6. Controleer dat runtime-active NPC/combat/player behavior zonder animation mapping blokkeert.
7. Controleer dat audio emitter gated blijft bij audio=0.
8. Controleer dat anonymous/game session geen editor entity beheer krijgt.
9. Controleer dat draft/validation geen runtime publish uitvoert.
