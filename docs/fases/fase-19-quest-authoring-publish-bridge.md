# Fase 19 - Quest authoring publish bridge

## Status

Git-basis gebouwd op 2026-06-15. Server-side verificatie is nog open; Fase 19 mag pas formeel worden afgesloten nadat de echte checkout groen is op lint, test, build, typecheck en relevante route/smoke checks.

Fase 18 is formeel afgerond als generieke non-visual blocked runtime quest-slice contractlaag. Fase 19 bouwt daarop verder door de generieke editor/node-data naar publish/read-model brug te maken voor quests.

## Echt doel

Maak concrete questinhoud authorable in het node-system zonder die inhoud in runtimecode te plaatsen.

Fase 19 levert daarom:

- quest authoring schemas;
- quest authoring validators;
- quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role editor node types;
- een quest authoring publish bridge node;
- socket types voor quest authoring;
- een genormaliseerde read-model shape;
- een mapper van editor/node-data records naar runtime projection record references;
- tests die bewijzen dat de brug geen runtime payload, dummy data, asset loading of hardcoded questcontent toevoegt.

## Architectuurregel

Concrete spelinhoud hoort in deze volgorde te lopen:

```text
Database > Editor/Node-system > Publish > Runtime Projection > Runtime Quest Slice > Runtime Game
```

Runtimecode mag alleen published read-model references consumeren. Runtimecode mag geen Quest 00, dialogue lines, rewards, unlocks, flags, checkpoints, asset roles of fallbackcontent hardcoden.

## Gebouwd in deze Git-basis

Schema en validation:

- `packages/schemas/src/quest-authoring.ts`
- `packages/schemas/src/quest-authoring-validation.ts`
- exports in `packages/schemas/src/index.ts`

Node-system:

- `packages/node-types/src/quest-authoring-nodes.ts`
- registry import/export in `packages/node-types/src/index.ts`
- socket types in `packages/schemas/src/node-graph.ts`

Tests:

- `tests/phase19-quest-authoring-publish-bridge.test.mjs`

## Node types

Fase 19 registreert:

- `gk.questAuthoring.quest`
- `gk.questAuthoring.dialogue`
- `gk.questAuthoring.objective`
- `gk.questAuthoring.interactable`
- `gk.questAuthoring.reward`
- `gk.questAuthoring.unlock`
- `gk.questAuthoring.checkpoint`
- `gk.questAuthoring.assetRole`
- `gk.questAuthoring.publishBridge`

De eerste acht nodes zijn `editor-data`. De publish bridge is `publish-boundary`.

## Socket types

Fase 19 registreert:

- `quest.authoring.quest.reference`
- `quest.authoring.dialogue.reference`
- `quest.authoring.objective.reference`
- `quest.authoring.interactable.reference`
- `quest.authoring.reward.reference`
- `quest.authoring.unlock.reference`
- `quest.authoring.checkpoint.reference`
- `quest.authoring.asset-role.reference`
- `quest.authoring.publish-contract.reference`

## Read-model shape

De read-model shape is genormaliseerd:

- records zijn runtime projection record references;
- records zijn normaliseerbaar op record id;
- relaties lopen via node ids;
- payload blijft in editor/node-data;
- runtime payload is niet inbegrepen;
- runtime fallbackcontent is false;
- dummy published data is false.

De mapper maakt per authoring node een runtime projection record type:

- quest node -> `quest.reference`
- dialogue node -> `dialogue.reference`
- objective node -> `objective.reference`
- interactable node -> `interactable.reference`
- reward node -> `reward.reference`
- unlock node -> `unlock.reference`
- checkpoint node -> `checkpoint.reference`
- asset-role node -> `asset-role.reference`

## Verplichte gates

Fase 19 moet blokkeren op:

- ontbrekende quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role node-data;
- references die niet binnen dezelfde editor graph resolven;
- runtime fallbackcontent;
- hardcoded runtimecontent;
- dummy published data;
- asset byte loading;
- asset copy/mutation;
- final asset-role resolving;
- directe runtime output-publicatie.

## Niet in scope

- Quest 00 als echte node-data invoeren.
- Quest 00 publiceren naar runtime.
- Een visual playable quest claimen.
- Asset roles definitief mappen.
- Assets laden of bytes fetchen.
- Combat, economy, movement, multiplayer of audio playback openen.
- Runtime Game UI of quest tracker bouwen.
- Concrete dialogue/reward/unlock/checkpoint waarden in runtimecode zetten.

## Acceptatie voor server-side afsluiting

Fase 19 mag formeel worden afgesloten wanneer server-side groen bevestigt:

- `git pull --ff-only`
- `git status --short` schoon voor en na
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- route-smokes voor `/health/game`, `/game/` en `/game/shell.json`
- `pnpm smoke:browser:game`
- `pnpm smoke:browser`

Verwachte inhoudelijke asserts:

- `SCHEMA_PACKAGE_SCOPE` bevat `quest-authoring` en `quest-authoring-validation`;
- Fase 19 socket types bestaan;
- Fase 19 node types bestaan;
- quest authoring draft met alle generieke node kinds valideert;
- publish bridge emit alleen runtime projection record references;
- runtime projection records bevatten geen payload en geen runtime fallback;
- validators blokkeren dummy data, runtime fallback, hardcoded runtimecontent en asset shortcuts;
- game runtime blijft Fase 18 quest slice consumer en krijgt geen concrete Quest 00-output.

## Prompt - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 19 - Quest authoring publish bridge.

VOORBEREIDING
- git pull --ff-only
- git status --short moet schoon zijn

CHECKS
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
- Fase 19 schema exports bestaan: quest-authoring en quest-authoring-validation.
- Fase 19 node types bestaan: gk.questAuthoring.quest/dialogue/objective/interactable/reward/unlock/checkpoint/assetRole/publishBridge.
- Fase 19 sockets bestaan.
- Quest authoring publish bridge maakt alleen normalized runtime projection record references.
- Runtime projection records hebben rendererInstruction:null en geen payload/fallback.
- Validators blokkeren runtime fallbackcontent, hardcoded runtimecontent, dummy published data, asset byte loading en final asset-role resolving.
- Runtime output bevat geen concrete Quest 00-content, geen dummy assets, geen fixture-content en geen hardcoded runtimecontent.

NIET DOEN
- Geen runtimecode downgraden om tests groen te forceren.
- Geen Quest 00 als fallback of testfixture in runtime zetten.
- Geen dummy published data of dummy assets toevoegen.
- Geen asset roles hardcoden of definitief mappen.

RAPPORTEER
- groene/falende checks;
- runtime HEAD;
- of service restart nodig was;
- bewijs dat Fase 19 schema/node bridge bestaat;
- bewijs dat game runtime geen concrete content serveert;
- of Fase 19 formeel gesloten mag worden.
```

## Afsluitstatus

Git-basis klaar: ja.

Server-side verificatie klaar: nee.

Fase 19 formeel afgerond: nee.