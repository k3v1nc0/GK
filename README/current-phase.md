# Current Phase

Actieve status: Fase 19 Quest authoring publish bridge heeft een Git-basis op `main`, maar is nog niet server-side geverifieerd of formeel afgerond. Fase 18 Generieke quest- en dialoogslice is server-side groen geverifieerd en formeel afgerond als generieke non-visual blocked quest-slice contractlaag.

Fase 1 t/m Fase 18 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond. Fase 16 Fundering en herbaseline is afgerond. Fase 17 Runtime Game Core is server-side groen bevestigd op HEAD `8ebbcf4` en formeel afgerond. Fase 18 Generieke quest- en dialoogslice is server-side groen bevestigd en formeel afgerond.

## Fase 18 afgerond

Fase 18 bouwde de generieke runtime-questlaag bovenop published read-model data:

- runtime quest slice schema contracts;
- runtime projection record types voor quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role;
- runtime quest socket types;
- runtime quest node contracts;
- game-web Runtime Quest Slice section met `data-runtime-quest-slice="phase-18"`;
- `/health/game` en `/game/shell.json` Fase 18 status/contract payloads;
- visible non-visual blocked asset-role diagnostics;
- runtime-state only quest/dialogue/checkpoint save-load envelope;
- Fase 18 tests en browser-smoke.

Fase 18 eindgedrag: runtime blijft bewust non-visual blocked zolang latere published node/editor-data en asset-role mapping ontbreken. Dat is geldig voor Fase 18.

## Fase 19 Git-basis geopend

Fase 19 bouwt de generieke Quest authoring publish bridge. Het doel is concrete questinhoud later authorable te maken via editor/node-data, zonder die inhoud in runtimecode te plaatsen.

Gebouwd in Git-basis:

- `packages/schemas/src/quest-authoring.ts`
- `packages/schemas/src/quest-authoring-validation.ts`
- `packages/node-types/src/quest-authoring-nodes.ts`
- Fase 19 socket types in `packages/schemas/src/node-graph.ts`
- Fase 19 exports in `packages/schemas/src/index.ts`
- Fase 19 registry in `packages/node-types/src/index.ts`
- `tests/phase19-quest-authoring-publish-bridge.test.mjs`
- `docs/fases/fase-19-quest-authoring-publish-bridge.md`

Fase 19 regels:

- Concrete questcontent komt uit editor/node-data en publish-flow, niet uit runtimecode.
- Quest authoring records mappen naar runtime projection record references.
- Runtime projection records bevatten geen payload en geen fallbackcontent.
- Geen dummy published data.
- Geen dummy assets.
- Geen asset byte loading.
- Geen final asset-role resolving.
- Quest 00 blijft geparkeerde toekomstige node/editor-data input.

Fase 19 kan pas formeel worden afgesloten na server-side verificatie op de echte checkout.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `docs/fases/fase-18-speelbare-quest-en-dialoogslice.md`
- `docs/fases/fase-19-quest-authoring-publish-bridge.md`
- `docs/design/quest-00-slice-input.md` als geparkeerde toekomstige node/editor-data input, niet als runtimebron
- `README/node-system-super-dynamic-contract.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

## Fasebeoordeling

Fase 18 formeel afgerond: ja.

Fase 19 Git-basis geopend: ja.

Fase 19 server-side verificatie klaar: nee.

Fase 19 formeel afgerond: nee.

Fase 19 volledige Quest 00 authoring-data ingevoerd: nee.