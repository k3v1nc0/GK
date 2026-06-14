# Fase 18 - Generieke quest- en dialoogslice

## Status

Server-side groen geverifieerd op 2026-06-15 en formeel afgerond als generieke non-visual blocked runtime quest-slice contractlaag.

Fase 17 Runtime Game Core is server-side groen en formeel afgerond. Kevin heeft op 2026-06-14 verduidelijkt dat Fase 18 eerst alleen de generieke quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role laag mag bouwen. Concrete Quest 00-content is later node-data/editor-data en mag niet in runtimecode of als runtime fallback terechtkomen.

Fase 18 is formeel afgerond als contractlaag. De repo bevat de generieke quest-slice contractlaag, runtime shell metadata, tests en browser-smoke; de slice blijft non-visual blocked totdat latere published node/editor-data concrete content levert.

## Bronbasis

Gecontroleerde bronnen:

- `docs/fases/fase-17-runtime-game-core.md`
- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/GameBibleNode.json`
- `docs/design/game-bible.md`
- `docs/design/quest-00-slice-input.md`
- `README/node-system-super-dynamic-contract.md`
- `README/hard-facts-to-node-panels.md`
- `packages/schemas/src/runtime-projection.ts`
- `packages/schemas/src/runtime-game-core.ts`
- `packages/schemas/src/runtime-quest-slice.ts`
- `packages/schemas/src/runtime-quest-slice-validation.ts`
- `packages/node-types/src/runtime-quest-slice-nodes.ts`
- `apps/game-web/src/runtime-quest-slice.ts`

## Echt doel

Bouw eerst de generieke runtime-questlaag bovenop published read-model data:

- quest node types en schemas;
- dialogue node types en schemas;
- objective node types en schemas;
- interactable node types en schemas;
- reward en unlock node types en schemas;
- checkpoint node types en schemas;
- asset-role node types en schemas;
- sockets;
- validators;
- publish/read-model contracts;
- runtime read-model shape;
- generieke executors;
- visible blockers voor ontbrekende published data en unresolved asset roles.

## Contentregel

Quest 00 is geen runtimecode en geen hardcoded fallback.

Toegestaan:

- Quest 00 als latere node-data/editor-data;
- Quest 00 als aparte content-input/backlog in documentatie;
- neutrale testfixtures om de generieke executor en validators te testen;
- tests die bewijzen dat runtime geen concrete content serveert.

Niet toegestaan:

- Quest 00-dialogue, objectives, rewards, unlocks, checkpoints of asset roles in runtime source;
- runtime fallback content wanneer published data ontbreekt;
- dummy assets of dummy published data;
- hardcoded unlocks, item grants, flags, NPCs, locations, camera, lighting, minimap of HUD;
- asset-role resolving in runtimecode.

## Gebouwd in Fase 18 codebasis

- Runtime quest slice schema contracts.
- Runtime quest slice validation.
- Runtime projection record types voor:
  - `quest.reference`
  - `dialogue.reference`
  - `objective.reference`
  - `interactable.reference`
  - `reward.reference`
  - `unlock.reference`
  - `checkpoint.reference`
  - `asset-role.reference`
- Runtime quest socket types.
- Runtime quest node contracts voor source, state machine, dialogue executor, objective evaluator, reward applicator, checkpoint flow en asset-role blockers.
- Game-web Runtime Quest Slice section met `data-runtime-quest-slice="phase-18"`.
- `/health/game` en `/game/shell.json` Fase 18 status/contract payloads.
- Visible non-visual blocked asset-role diagnostics.
- Runtime-state only quest/dialogue/checkpoint save-load envelope.
- Fase 18 unit/integration test.
- Runtime Quest Slice browser-smoke.

## Scope

- Dialogue tree executor contract.
- Quest state machine contract.
- Objective evaluator contract.
- Interactable runtime contract.
- Reward/unlock/flag contract.
- Checkpoint flow contract.
- Asset-role blocker contract.
- Save/load van quest- en dialogue-state als runtime-state only.

## Niet in scope

- Concrete Quest 00 runtime data.
- Published Quest 00 read-model records.
- Combat.
- Economy/merchant/inventory als vol systeem.
- Multiplayer.
- Movement runtime.
- Audio playback.
- Definitieve brede world content.
- Nieuwe lore buiten GameBible of expliciete Kevin-input.
- Concrete NPC/quest/camera/minimapwaarden hard-coden.
- Asset byte loading als shortcut voor ontbrekende asset-role mapping.
- Dummy assets of dummy published data.

## Verplichte gates

- GameBible en editor/node-data leveren content; runtime levert alleen generieke executors.
- Alle questmutaties lopen via objective/quest executors, niet via losse UI-click hacks.
- Published data blijft de enige runtimebron.
- Quest 00-content mag niet in runtimecode worden geplaatst.
- Missing content of missing assets worden zichtbare blockers, geen dummy fallback.
- Unresolved asset roles blijven visible blockers totdat editor/node-data of Kevin ze oplost.
- Testfixtures mogen alleen testfixtures zijn en mogen niet door game runtime worden gebruikt.

## Huidige gate-status

Opgelost:

1. Fase 18-doel is teruggezet naar generieke quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role infrastructuur.
2. Runtime projection kent generieke quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role record types.
3. Generieke Fase 18 schema's, sockets, node types, runtime section en tests zijn toegevoegd zonder Quest 00-content als runtime fallback.
4. Non-visual blocked asset-role slice is toegestaan zolang unresolved roles zichtbaar blokkeren.
5. Server-side verificatie op de echte checkout is groen bevestigd.

Resterende fasegrenzen:

1. Concrete Quest 00 node/editor-data hoort later via editor/publish-flow te ontstaan, niet via runtimecode.
2. Asset-role records moeten in latere published data aanwezig zijn als de slice inhoudelijk live door de volledige contentflow moet worden aangestuurd.
3. Volledig visual playable blijft buiten scope van deze afgeronde contractlaag totdat latere published content dat expliciet levert.
4. Een echte end-to-end playthrough blijft buiten scope zonder latere published slice-data.

## Smalste veilige vervolgstap

Fase 18 is nu afgerond. Volgende stap ligt in latere node/editor-data en published content, niet in deze runtime-contractlaag.

## Acceptatie voor deze code-slice

Deze code-slice is acceptabel wanneer server-side groen bevestigt:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- route-smokes voor `/health/game`, `/game/`, `/game/shell.json`
- `pnpm smoke:browser:game`
- `pnpm smoke:browser`
- geen editor/admin routegebruik in game runtime
- geen draft/candidate data in game runtime
- geen asset byte requests
- geen renderer draw calls
- geen concrete Quest 00-contentwaarden in runtimecode
- geen testfixture content in runtime output
- unresolved asset-role blockers zichtbaar in Fase 18 runtime metadata

Deze acceptatie is nu behaald op de echte checkout.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder mode. Werk GitHub-only op main en gebruik de actuele repo, GameBible en node-contracten als waarheid.

DOEL
Rond Fase 18 af als generieke non-visual blocked runtime quest slice. Bouw alleen generieke quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role node types, schemas, sockets, validators, publish contracts, read-model shape en executors.

NIET DOEN
- Geen Quest 00-content in runtimecode.
- Geen Quest 00 als runtime fallback.
- Geen dummy assets.
- Geen dummy published data.
- Geen hardcoded rewards, unlocks, flags, dialogue, objectives, checkpoints of asset roles.
- Geen concrete content uit docs/design/quest-00-slice-input.md in runtime source kopieren.

TOEGESTAAN
- Neutrale testfixtures voor executor/validator tests.
- Tests die bewijzen dat runtime geen concrete content serveert.
- Zichtbare blockers voor ontbrekende published data en unresolved asset roles.

CONTROLEER
- docs/fases/fase-18-speelbare-quest-en-dialoogslice.md
- README/GameBibleNode.json
- README/node-system-super-dynamic-contract.md
- packages/schemas/src/runtime-quest-slice.ts
- packages/schemas/src/runtime-quest-slice-validation.ts
- packages/node-types/src/runtime-quest-slice-nodes.ts
- apps/game-web/src/runtime-quest-slice.ts
- tests/phase18-runtime-quest-slice.test.mjs
- tests/smoke/runtime-quest-slice-smoke.mjs

WERKWIJZE
1. Controleer dat de Fase 18 code-slice alleen published read-model contracts consumeert.
2. Controleer dat asset-role records bij default unresolved blockers zichtbaar blijven.
3. Controleer dat runtime geen concrete questcontent hardcodet.
4. Controleer dat save/load alleen runtime quest/dialogue/checkpoint state bewaart.
5. Corrigeer alleen structurele contractfouten; geen dummy content toevoegen.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 18 - generieke quest- en dialoogslice.

VOORBEREIDING
- git pull --ff-only
- controleer git status --short voor en na
- start/restart services alleen als runtime-checks oude state tonen

CONTROLEER
- pnpm lint
- pnpm test
- pnpm build
- pnpm typecheck
- GET /health/game
- GET /game/
- GET /game/shell.json
- pnpm smoke:browser:game
- pnpm smoke:browser

ASSERTIES
- /health/game meldt runtimeQuestSlice:"phase-18".
- /game/ bevat data-runtime-quest-slice="phase-18".
- /game/shell.json bevat runtimeQuestSlice en runtimeQuestSliceContract.
- usesEditorAdminRoutes false.
- usesEditorDraftData false.
- hardcodesQuestContent false.
- loadsAssets false.
- fetchesAssetBytes false.
- resolvesFinalAssetRoles false.
- supportsNonVisualBlockedSlice true.
- blockedByUnresolvedAssetRoles true in default blocked state.
- Geen /assets byte requests, GLB/texture/audio loads of renderer draw calls.
- Geen concrete Quest 00-contentwaarden in runtimecode.
- Geen testfixture content in runtime output.

NIET DOEN
- Geen ontbrekende dialogen of lore verzinnen.
- Geen dummy published data toevoegen.
- Geen asset roles hardcoden.
- Geen combat/economy/multiplayer accepteren als scope.
- Geen statusdocumenten afronden als volledige playable fase zonder published slice-data.

RAPPORTEER
- welke checks groen/fout zijn;
- bewijs van phase-18 runtimeQuestSlice;
- of unresolved asset roles zichtbaar blokkeren;
- of er nog published quest data of asset mapping ontbreekt;
- commit/HEAD waarop is geverifieerd.
```
