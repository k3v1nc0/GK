# Current Phase

Actieve status: Fase 18 Generieke quest- en dialoogslice is server-side groen geverifieerd en formeel afgerond als generieke non-visual blocked quest-slice contractlaag. Fase 19 is nog niet geopend.

Fase 1 t/m Fase 17 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond. Fase 16 Fundering en herbaseline is afgerond. Fase 17 Runtime Game Core is server-side groen bevestigd op HEAD `8ebbcf4` en formeel afgerond.

## Fase 17 afgerond

Fase 17 Runtime Game Core bouwde de eerste runtime bootlaag bovenop published/read-model-data en Fase 15 asset-reference metadata.

Server-side verificatie groen:

- `pnpm lint`;
- `pnpm test`;
- `pnpm build`;
- `pnpm typecheck`;
- lokale route-smokes voor `/health/game`, `/game/` en `/game/shell.json`;
- Apache/front-door game route-smokes;
- `pnpm smoke:browser:game`;
- `pnpm smoke:browser`;
- asset load requests: 0;
- console errors count: 0;
- page errors count: 0.

Fase 17 eindgedrag: live runtime boot is veilig blocked door ontbrekende published data. Dat is geldig voor Fase 17.

## Fase 18 server-side afgerond als generieke non-visual blocked slice

Kevin heeft verduidelijkt dat Fase 18 eerst alleen de generieke questlaag bouwt. Quest 00 is later node-data/editor-data en mag niet in runtimecode of als runtime fallback terechtkomen.

Gebouwd in Git-basis:

- Runtime Quest Slice schema contracts en validation.
- Runtime projection record types voor quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role.
- Runtime quest socket types.
- Runtime quest node contracts.
- Game-web Runtime Quest Slice section met `data-runtime-quest-slice="phase-18"`.
- `/health/game` en `/game/shell.json` Fase 18 status/contract payloads.
- Visible non-visual blocked asset-role diagnostics.
- Runtime-state only quest/dialogue/checkpoint save-load envelope.
- Fase 18 tests.
- Runtime Quest Slice browser-smoke.

Fase 18 regels:

- Runtime consumeert alleen published read-model contracts.
- Concrete questcontent komt uit editor/node-data en publish-flow, niet uit runtimecode.
- Testfixtures mogen alleen tests voeden en nooit runtime fallback worden.
- Geen dummy assets of dummy published data.
- Unresolved asset roles blijven visible blockers.

Fase 18 is nu formeel afgerond als generieke non-visual blocked quest-slice contractlaag. Concrete Quest 00 blijft latere node/editor-data; de runtime blijft daarom bewust non-visual blocked totdat latere published data dat opent.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `docs/fases/fase-17-runtime-game-core.md`
- `docs/fases/fase-18-speelbare-quest-en-dialoogslice.md`
- `docs/design/quest-00-slice-input.md` als geparkeerde toekomstige node/editor-data input, niet als runtimebron
- `README/node-system-super-dynamic-contract.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

## Fasebeoordeling

Fase 17 Runtime Game Core is formeel afgerond.

Fase 18 Git-basis geopend: ja.

Fase 18 server-side klaar: ja.

Fase 18 volledige playable Quest 00 klaar: nee.

Fase 18 formeel afgerond: ja.

Fase 19 geopend: nee.
