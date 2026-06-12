# Editor Shell Architecture

Fase 5 voegt een generieke editorwerkplek toe. Deze laag is een editor-capability, geen contentlaag.

## Layout

De standaardindeling is:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector` en `Validation`;
- onder: `History`;
- dock tabs: `Asset Panel`, `Audio Panel`, `Entity / Component Panel`, `Procedural Generation Panel`, `HUD Editor`, `Minimap Panel`, `Game Users`.

Tabs volgen het WAI-ARIA tab/panel model als contract voor latere UI-rendering. De huidige implementatie legt het layoutmodel vast, maar introduceert nog geen framework of browserbundler.

## Node Canvas

Het node canvas start leeg en bevat generieke graph-capabilities voor schema, asset reference, validation, publish gates en typed node graph editing.

Het canvas mag geen concrete quests, NPCs, routes, prijzen, camera, licht, minimap, audio, HUD-keuzes, generated worldcontent of assetrollen bevatten. Zulke waarden horen later uit database, editor/node-data, registers, Game Bible, procedural draft/bake data of publish-data te komen.

Fase 6 voegt de graph-core toe:

- graph state met nodes en edges;
- typed flow sockets en typed value sockets;
- value socket types `var.string`, `number`, `color`, `asset.reference` en `audio.reference`;
- dropdown, text, number, color, asset-picker en audio-picker field schemas;
- edge validation voor richting, flow/value matching, value compatibility en max-connections;
- undo/redo met `historyDepth = 100`;
- operation log;
- draft preview die valideert maar niets publiceert.

Fase 8 breidt typed value sockets uit met `entity.reference`, `component.reference` en `entity.group.reference`. Audio picker blijft een capability-gate zolang audio count 0 is. Asset picker wijst geen runtime-role mapping toe.

Fase 8.1 breidt typed sockets uit met procedural references voor seeds, generator graphs, generation outputs en generated draft/candidate data. Deze blijven editor draft/candidate data en publiceren niets naar Runtime Game.

## Asset, audio, entity en procedural panels

Panels zijn generieke capabilities:

- `Asset Panel` leest Fase 7 asset-library state en toont GLB/UI/audio counts.
- `Asset Panel` toont missing, invalid, unassigned, candidate en assigned role mapping status.
- `Asset Panel` laat role mapping als editor-data/capability zien en wijst geen definitieve runtime-rollen toe.
- `Audio Panel` leest dezelfde asset library en filtert op audio records.
- `Audio Panel` blijft leeg/gated wanneer audio count 0 is.
- `Audio Panel` toont geen dummy audio.
- `Entity / Component Panel` toont Fase 8 component stack state.
- `Entity / Component Panel` toont candidate/assigned/invalid component counts.
- `Entity / Component Panel` toont animation warnings voor candidate NPC/combat/player behavior zonder mapping.
- `Entity / Component Panel` houdt runtime-active behavior gated totdat editor-data en animation mapping bestaan.
- `Procedural Generation Panel` is vanaf Fase 8.1 het contract voor seed controls, generator graph state, preview result state, validation issues, bake draft actions en generated candidate lists.
- `Procedural Generation Panel` mag generated output tonen als draft/candidate, maar niet als definitieve runtimecontent.
- `HUD Editor` configureert later HUD nodes, zonder definitieve HUD-layout.
- `Minimap Panel` configureert later minimap nodes, zonder definitieve minimapvorm of waarden.
- `Game Users` vereist editor scope en `editor_admin`.

GLB-bestanden mogen alleen kandidaat-capability metadata tonen totdat Kevin/editor een role mapping als data kiest.

## Fase 8.1 procedural panel status

Git-basis voorbereid:

- Procedural Generation Panel state bestaat;
- seed controls zijn expliciet seed-driven;
- preview result state blijft no-runtime-publish;
- bake draft action schrijft alleen editor draft data of bake draft result;
- generated entity/group/placement/spawn/path/resource lists zijn draft/candidate lists;
- panel state accepteert geen concrete gamecontent en verzint niets.

Server-side panel/API smoke is bevestigd door Codex/Claude.

## Viewport / World Preview

De viewport is een aparte tab naast `Node Canvas`.

Fase 5 houdt deze preview expliciet leeg:

- geen dummy wereld;
- geen dummy assets;
- geen hard-coded camera of licht;
- geen GLB-role mapping;
- geen audio of HUD-keuzes.

De preview wacht op latere editor draft, procedural preview/bake data of gepubliceerde world/node-data. Procedural preview mag editor-output tonen zonder runtime publish.

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
- `POST /editor/assets/scan`;
- `GET /editor/entities/draft`;
- `POST /editor/entities/validate`;
- `GET /editor/entities/groups`;
- `GET /editor/entities/asset-mappings`;
- `PATCH /editor/entities/asset-mappings/:assetId`;
- `GET /editor/procedural/graph`;
- `POST /editor/procedural/validate`;
- `POST /editor/procedural/preview`;
- `POST /editor/procedural/bake-draft`;
- `GET /editor/procedural/generated`;
- `GET /editor/procedural/issues`.

Procedural routes zijn editor-only, CSRF/Origin beschermd waar state-changing, deterministic waar preview/bake output wordt gemaakt, en no-runtime-publish.

Editor runtime:

- `GET /health/editor`;
- `GET /`;
- `GET /editor`;
- `GET /editor/`;
- `GET /shell.json`.

Deze routes voegen geen concrete gamecontent toe. Smoke-auth headers mogen alleen worden gebruikt wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git tijdelijk is gezet voor gecontroleerde Codex-tests, en de Apache-template stript die headers voor publieke requests.

## Fase 8.1 procedural routes

Fase 8.1 voegt editor-only procedural route contracts toe:

- `GET /editor/procedural/graph` levert graph draft state en seed controls.
- `POST /editor/procedural/validate` valideert procedural graph drafts.
- `POST /editor/procedural/preview` maakt deterministic preview output met `publishesRuntimeOutput: false`.
- `POST /editor/procedural/bake-draft` maakt alleen editor draft data of bake draft result met `publishesRuntimeOutput: false`.
- `GET /editor/procedural/generated` levert generated candidate state.
- `GET /editor/procedural/issues` levert validation issue state.

De routes:

- vereisen editor scope;
- blijven CSRF/Origin beschermd voor state-changing requests;
- uploaden geen assets;
- maken geen assets aan;
- kopieren geen assets naar Git;
- verzinnen geen concrete gamecontent;
- publiceren niets naar Runtime Game;
- geven anonymous/game sessions geen procedural beheer.

## Server/runtime gate

Fase 7 voegt asset-library routes en panel state toe en is server-side afgerond door Claude op HEAD `0b4a0472870e4aa0fa09877a183aa1efa975340d`.

Fase 8 voegt entity/component contracts, node types, routes en panel state toe en is server-side afgerond op HEAD `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`).

Fase 8.1 voegt procedural generation contracts, deterministic random core, node types, routes, panel state, migratie en tests toe. Fase 8.1 is server-side gevalideerd.

## Fase 8.1 server-smoke

Bevestigd door Codex/Claude:

- `pnpm install/build/typecheck/test/lint`;
- migratie `0005_procedural_generation_core.sql` toegepast;
- procedural API/editor smoke;
- determinism smoke: zelfde seed geeft dezelfde output;
- different-seed smoke: andere seed mag andere output geven;
- no runtime publish;
- no asset copy to Git;
- anonymous/game session denied.
