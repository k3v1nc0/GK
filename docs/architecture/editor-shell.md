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

Het node canvas start leeg en bevat generieke graph-capabilities voor schema, asset reference, validation, publish gates en typed node graph editing.

Het canvas mag geen concrete quests, NPCs, routes, prijzen, camera, licht, minimap, audio, HUD-keuzes of assetrollen bevatten. Zulke waarden horen later uit database, editor/node-data, registers, Game Bible of publish-data te komen.

Fase 6 voegt de graph-core toe:

- graph state met nodes en edges;
- typed flow sockets en typed value sockets;
- value socket types `var.string`, `number`, `color`, `asset.reference` en `audio.reference`;
- dropdown, text, number, color, asset-picker en audio-picker field schemas;
- edge validation voor richting, flow/value matching, value compatibility en max-connections;
- undo/redo met `historyDepth = 100`;
- operation log;
- draft preview die valideert maar niets publiceert.

Audio picker blijft een capability-gate zolang audio count 0 is. Asset picker wijst geen runtime-role mapping toe.

## Asset en audio panels

Panels zijn generieke capabilities:

- `Asset Panel` leest Fase 7 asset-library state en toont GLB/UI/audio counts.
- `Asset Panel` toont missing, invalid, unassigned, candidate en assigned role mapping status.
- `Asset Panel` laat role mapping als editor-data/capability zien en wijst geen definitieve runtime-rollen toe.
- `Audio Panel` leest dezelfde asset library en filtert op audio records.
- `Audio Panel` blijft leeg/gated wanneer audio count 0 is.
- `Audio Panel` toont geen dummy audio.
- `HUD Editor` configureert later HUD nodes, zonder definitieve HUD-layout.
- `Minimap Panel` configureert later minimap nodes, zonder definitieve minimapvorm of waarden.
- `Game Users` vereist editor scope en `editor_admin`.

GLB-bestanden mogen alleen kandidaat-capability metadata tonen totdat Kevin/editor een role mapping als data kiest.

## Viewport / World Preview

De viewport is een aparte tab naast `Node Canvas`.

Fase 5 houdt deze preview expliciet leeg:

- geen dummy wereld;
- geen dummy assets;
- geen hard-coded camera of licht;
- geen GLB-role mapping;
- geen audio of HUD-keuzes.

De preview wacht op latere gepubliceerde world/node-data.

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

## API runtime contract

API runtime:

- `GET /health/editor`;
- `GET /editor/game-bible-node/save-client.js`;
- `POST /auth/editor/login`;
- `POST /auth/editor/logout`;
- `GET /auth/editor/me`;
- `GET /editor/game-users`;
- `PATCH /editor/game-users/:gameUserId/status`;
- `POST /editor/game-bible-node/save`;
- `GET /editor/graph/draft`;
- `POST /editor/graph/operation`;
- `POST /editor/graph/preview`;
- `GET /editor/assets/library`;
- `POST /editor/assets/scan`.

Editor runtime:

- `GET /health/editor`;
- `GET /`;
- `GET /editor`;
- `GET /editor/`;
- `GET /shell.json`.

Deze routes voegen geen concrete gamecontent toe. Smoke-auth headers mogen alleen worden gebruikt wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git tijdelijk is gezet voor gecontroleerde Codex-tests, en de Apache-template stript die headers voor publieke requests.

## Fase 6 graph routes

Graph routes zijn editor-only:

- `GET /editor/graph/draft` levert draft graph state.
- `POST /editor/graph/operation` accepteert editor graph operations en blijft CSRF/Origin beschermd.
- `POST /editor/graph/preview` valideert draft graph data en retourneert `publishesRuntimeOutput: false`.

Game sessions zijn niet geldig voor deze routes. Draft preview mag geen publish uitvoeren en mag de Runtime Game niet wijzigen.

## Fase 7 asset routes

Asset routes zijn editor-only:

- `GET /editor/assets/library` levert asset-library state, counts en validation issues.
- `POST /editor/assets/scan` triggert een scan van `GK_ASSET_SOURCE_DIR`.

De scanroute:

- vereist editor scope;
- blijft CSRF/Origin beschermd;
- uploadt geen assets;
- maakt geen assets aan;
- kopieert geen assets naar Git;
- verwijdert geen serverbestanden;
- publiceert niets naar Runtime Game;
- wijst geen definitieve runtime-role mapping toe.

Game sessions en anonymous requests krijgen geen editor asset beheer.

## Server/runtime gate

Fase 5 Git-basis bewees nog niet dat `/editor` live draaide. Fase 5.1 voegde minimale startbare HTTP entrypoints toe voor API en editor-web. Fase 5.2 voegde permanente API/editor service-templates en GameBibleNode browser-save bridge toe. Fase 5.3 koppelde de editor shell aan echte editor-admin login. Fase 6 voegde graph routes toe.

Fase 7 Git-basis voegt asset-library routes en panel state toe, maar de server-side scan, database-migratie, watcher/polling smoke en route smoke moeten nog door Codex/Claude worden uitgevoerd.

## Fase 5.3 server-smoke

Afgerond:

- `/editor` toont login zonder sessie;
- editor admin login werkt;
- `/auth/editor/me` geeft authenticated true met `editor_admin`;
- GameBible save werkt met dezelfde editor session;
- logout werkt en save na logout faalt;
- publieke save en legacy PHP write blijven dicht;
- Node Canvas en Viewport / World Preview blijven leeg zonder dummy content.
