# Editor Shell Architecture

Fase 5 voegt een generieke editorwerkplek toe. Deze laag is een editor-capability, geen contentlaag.

## Layout

De standaardindeling is:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector` en `Validation`;
- onder: `History`;
- dock tabs: `Asset Panel`, `Audio Panel`, `HUD Editor`, `Minimap Panel`, `Game Users`.

Tabs volgen het WAI-ARIA tab/panel model als contract voor latere UI-rendering. De huidige implementatie legt het layoutmodel vast, maar introduceert nog geen framework of browserbundler.

## Node Canvas

Het node canvas start leeg en bevat alleen generieke capability-definities voor schema, asset reference, validation en publish gates.

Het canvas mag geen concrete quests, NPCs, routes, prijzen, camera, licht, minimap, audio, HUD-keuzes of assetrollen bevatten. Zulke waarden horen later uit database, editor/node-data, registers, Game Bible of publish-data te komen.

## Viewport / World Preview

De viewport is een aparte tab naast `Node Canvas`.

Fase 5 houdt deze preview expliciet leeg:

- geen dummy wereld;
- geen dummy assets;
- geen hard-coded camera of licht;
- geen GLB-role mapping;
- geen audio of HUD-keuzes.

De preview wacht op latere gepubliceerde world/node-data.

## Panels

Panels zijn generieke capabilities:

- `Asset Panel` leest later asset-inventory en wijst geen runtime-rollen toe.
- `Audio Panel` houdt de audio-gate open wanneer audio count 0 is.
- `HUD Editor` configureert later HUD nodes, zonder definitieve HUD-layout.
- `Minimap Panel` configureert later minimap nodes, zonder definitieve minimapvorm of waarden.
- `Game Users` vereist editor scope en `editor_admin`.

## Auth boundary

Editor shell toegang gebruikt editor-auth. Game sessions mogen geen editor panel toegang krijgen.

Game-user beheer gebruikt de Fase 4 routecontracten:

- `editor.game_users.list`;
- `editor.game_users.status_update`.

Beide vereisen editor scope met `editor_admin`.

## Server/runtime gate

Fase 5 Git-basis bewees nog niet dat `/editor` live draait. Fase 5.1 voegt minimale startbare HTTP entrypoints toe voor API en editor-web, maar Codex moet buiten Git nog server/browser smoke bevestigen:

- API/editor-web starten;
- browserconsole controleren;
- Apache route `/editor` controleren;
- Apache routes `/auth/`, `/editor/game-users` en `/editor/game-bible-node/save` controleren;
- editor login smoke test uitvoeren;
- game-user beheer smoke test uitvoeren;
- Node Canvas en Viewport laden controleren;
- bestaande sites controleren.

## Fase 5.1 runtime contract

API runtime:

- `GET /health/editor`;
- `GET /auth/editor/me`;
- `GET /editor/game-users`;
- `PATCH /editor/game-users/:gameUserId/status`;
- `POST /editor/game-bible-node/save`.

Editor runtime:

- `GET /health/editor`;
- `GET /`;
- `GET /editor`;
- `GET /editor/`;
- `GET /shell.json`.

Deze routes zijn smoke- en contractentrypoints. Ze voegen geen concrete gamecontent toe. Smoke-auth headers mogen alleen worden gebruikt wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git tijdelijk is gezet voor gecontroleerde Codex-tests.
