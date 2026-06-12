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

Fase 8.1 mag procedural sockets en nodefamilies toevoegen voor seeds, generator graphs, preview, validation, bake drafts, generated entity/group/placement candidates en generation outputs. Deze blijven editor draft/candidate data en publiceren niets naar Runtime Game.

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

Fase 7 server-side bevestigd:

- Asset Panel is aanwezig.
- Audio Panel is aanwezig.
- Audio Panel blijft gated/leeg bij audio=0.
- Alle 4 GLB records hebben `roleMapping.status=candidate`.
- Geen asset panel-flow publiceert naar Runtime Game.

Fase 8 server-side bevestigd:

- Entity/Component panel state bestaat.
- Renderable component gebruikt `asset.reference`.
- Audio emitter blijft gated/leeg bij audio=0.
- Group transform state is voorbereid.
- Entity validation publiceert niets naar Runtime Game.
- Entity routes werken editor-only.
- Anonymous/game sessions krijgen geen entity beheer.
- `Taverne.glb` object-test en `Wizard.glb` NPC-test zijn bevestigd als testinput, geen runtimecontent.

Fase 8.1 nog niet geimplementeerd:

- Procedural Generation Panel state moet later worden gebouwd wanneer Kevin Fase 8.1 opent.
- Preview en bake blijven no-runtime-publish gates.
- Generated output blijft editor draft/candidate data.

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
- `PATCH /editor/entities/asset-mappings/:assetId`.

Fase 8.1 mag later editor-only procedural routes toevoegen voor graph read, preview, validation, bake draft en generated candidate state. Die routes mogen geen runtime publish uitvoeren en mogen anonymous/game sessions geen procedural editor beheer geven.

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

Fase 7 server-side bevestigd:

- `/editor` werkt.
- Editor admin login werkt.
- `/auth/editor/me` geeft `editor_admin`.
- `GET /editor/assets/library` werkt.
- `POST /editor/assets/scan` werkt met editor session en CSRF.
- Anonymous krijgt geen asset beheer.
- Game session krijgt geen asset beheer.
- GameBible save blijft werken.
- Game site blijft bereikbaar.

## Fase 8 entity routes

Entity routes zijn editor-only:

- `GET /editor/entities/draft` levert entity draft state.
- `POST /editor/entities/validate` valideert component stacks.
- `GET /editor/entities/groups` levert group/transform draft state.
- `GET /editor/entities/asset-mappings` levert asset-to-entity candidate mapping state.
- `PATCH /editor/entities/asset-mappings/:assetId` accepteert role mapping draft data als editor-data.

De routes:

- vereisen editor scope;
- blijven CSRF/Origin beschermd voor state-changing requests;
- uploaden geen assets;
- maken geen concrete runtimecontent aan;
- kopieren geen assets naar Git;
- publiceren niets naar Runtime Game;
- wijzen geen definitieve runtime-role mapping toe zonder editor-data.

Game sessions en anonymous requests krijgen geen editor entity beheer.

Fase 8 server-side bevestigd:

- entity routes werken;
- anonymous/game denied werkt;
- animation warning/blocker werkt;
- GameBible save blijft werken;
- game-site blijft bereikbaar;
- runtime publish nee bevestigd;
- assets niet naar Git bevestigd;
- blockers: geen.

## Fase 8.1 procedural routes

Fase 8.1 is nog niet geimplementeerd. Wanneer Kevin die fase opent, mogen alleen editor-only procedural routes worden toegevoegd, bijvoorbeeld:

- procedural graph draft read;
- procedural preview trigger;
- procedural validation;
- bake generation draft action;
- generated candidate read state.

De routes moeten:

- editor scope vereisen;
- CSRF/Origin beschermd zijn voor state-changing requests;
- deterministic preview/bake output ondersteunen;
- geen assets uploaden of kopieren;
- geen concrete gamecontent verzinnen;
- geen Runtime Game publish uitvoeren;
- anonymous/game sessions geen procedural beheer geven.

## Server/runtime gate

Fase 5 Git-basis bewees nog niet dat `/editor` live draaide. Fase 5.1 voegde minimale startbare HTTP entrypoints toe voor API en editor-web. Fase 5.2 voegde permanente API/editor service-templates en GameBibleNode browser-save bridge toe. Fase 5.3 koppelde de editor shell aan echte editor-admin login. Fase 6 voegde graph routes toe.

Fase 7 voegt asset-library routes en panel state toe. Deze Fase 7 server-side scan, database-migratie, watcher/polling smoke en route smoke zijn afgerond door Claude op HEAD `0b4a0472870e4aa0fa09877a183aa1efa975340d`.

Fase 8 voegt entity/component contracts, node types, routes en panel state toe. Fase 8 is server-side afgerond op HEAD `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`).

Fase 8.1 is de volgende fase wanneer Kevin die expliciet opent. Die fase mag procedural generation core voorbereiden, maar blijft draft/preview/bake-only totdat een latere publishfase publiceert.

## Fase 5.3 server-smoke

Afgerond:

- `/editor` toont login zonder sessie;
- editor admin login werkt;
- `/auth/editor/me` geeft authenticated true met `editor_admin`;
- GameBible save werkt met dezelfde editor session;
- logout werkt en save na logout faalt;
- publieke save en legacy PHP write blijven dicht;
- Node Canvas en Viewport / World Preview blijven leeg zonder dummy content.

## Fase 7 server-smoke

Afgerond:

- `pnpm install/build/typecheck/test/lint`: OK;
- `pnpm test`: 53/53 pass;
- `db/migrations/0003_asset_library_register.sql` toegepast;
- `asset_library_records` en `asset_library_scan_runs` bestaan;
- GLB=4, UI=0, audio=0;
- `Blacksmit forge.glb` met spatie werkt;
- `publishesRuntimeOutput=false`;
- `assetsCopiedToGit=false`;
- `assignsDefinitiveRuntimeRoles=false`;
- alle 4 GLB records hebben `roleMapping.status=candidate`;
- DB CHECK constraint blokkeert `publishes_runtime_output=1`;
- blockers: geen.

## Fase 8 server-smoke

Afgerond:

- HEAD server-check: `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`);
- `pnpm install`: OK;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- migratie `0004_entity_component_core.sql`: OK;
- nieuwe Fase 8 tabellen: OK;
- entity routes: OK;
- anonymous/game denied: OK;
- `Taverne.glb` object-test: OK;
- `Wizard.glb` NPC-test: OK;
- animation warning/blocker: OK;
- GameBible save: OK;
- game-site reachable: OK;
- runtime publish nee bevestigd;
- assets niet naar Git;
- blockers: geen;
- `gk-api` en `gk-editor-web` zijn herstart om de huidige build live te laden.

## Fase 8.1 server-smoke

Nog niet van toepassing. Wanneer Kevin Fase 8.1 opent en de Git-basis is gemaakt, moet Codex/Claude server-side bevestigen:

- `pnpm install/build/typecheck/test/lint`;
- migratie toepassen als Fase 8.1 schema toevoegt;
- procedural API/editor smoke;
- determinism smoke: zelfde seed geeft zelfde output;
- different-seed smoke: andere seed mag andere output geven;
- no runtime publish;
- no asset copy to Git.
