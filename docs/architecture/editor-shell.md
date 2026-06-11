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

Fase 5.3 maakt dit een echte browserflow:

- `/editor` toont het loginformulier wanneer `GET /auth/editor/me` geen geldige editor session ziet;
- `POST /auth/editor/login` controleert de Fase 4 editor database en maakt een `scope=editor` session;
- de editor session cookie is `HttpOnly` en `SameSite=Strict`, en `Secure` wanneer HTTPS/forwarded HTTPS of env dit afdwingt;
- een aparte CSRF-cookie wordt gezet voor state-changing editor acties;
- de shell wordt pas zichtbaar wanneer `/auth/editor/me` authenticated true met `editor_admin` teruggeeft;
- `POST /auth/editor/logout` trekt de editor session in.

Game-user beheer gebruikt de Fase 4 routecontracten:

- `editor.game_users.list`;
- `editor.game_users.status_update`.

Beide vereisen editor scope met `editor_admin`.

## Server/runtime gate

Fase 5 Git-basis bewees nog niet dat `/editor` live draaide. Fase 5.1 voegde minimale startbare HTTP entrypoints toe voor API en editor-web. Fase 5.2 voegde permanente API/editor service-templates en GameBibleNode browser-save bridge toe.

Codex heeft de Fase 5.2 server/browser smoke afgerond:

- `gk-api` en `gk-editor-web` zijn active/enabled en draaien via `/opt/gk/node-v22/bin/node`;
- `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test` en `pnpm lint` zijn OK;
- `/editor` werkt via Apache;
- `/auth/editor/me` geeft `401` zonder sessie;
- `/editor/game-users` geeft `403` zonder `editor_admin`;
- Playwright browser-smoke geeft geen console/page errors;
- Editor shell laadt;
- Node Canvas blijft leeg;
- Viewport / World Preview blijft leeg;
- bestaande sites bleven OK.

Fase 5.3 corrigeerde de resterende blocker: de editor shell was bereikbaar, maar nog niet gekoppeld aan een echte editor-admin login. Claude heeft de nieuwe normale browser-login en GameBible browser-save flow server-side getest. De editor-shell architectuur is klaar voor Fase 6.

## Fase 5.3 runtime contract

API runtime:

- `GET /health/editor`;
- `GET /editor/game-bible-node/save-client.js`;
- `POST /auth/editor/login`;
- `POST /auth/editor/logout`;
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

Deze routes voegen geen concrete gamecontent toe. Smoke-auth headers mogen alleen worden gebruikt wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git tijdelijk is gezet voor gecontroleerde Codex-tests, en de Apache-template stript die headers voor publieke requests.

## Fase 5.3 server-smoke

Afgerond:

- `/editor` toont login zonder sessie;
- editor admin login werkt;
- `/auth/editor/me` geeft authenticated true met `editor_admin`;
- GameBible save werkt met dezelfde editor session;
- logout werkt en save na logout faalt;
- publieke save en legacy PHP write blijven dicht;
- Node Canvas en Viewport / World Preview blijven leeg zonder dummy content.
