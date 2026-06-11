# Current Phase

## Fase

Actieve fase: Fase 5/Fase 5.3 afgerond; klaar voor Fase 6.

## Status

Fase-status: Fase 5.3 editor-login en GameBible browser-save zijn server-side gevalideerd. Fase 6-input is bevestigd geregistreerd, maar Fase 6 is nog niet geimplementeerd.

Fase 5 heeft de editor shell, node canvas, lege viewport, panels en game-user beheercontracten in Git voorbereid. Fase 5.1 patchte de eerste runtime-smoke blockers: lint directory traversal, startbare API/editor HTTP entrypoints, Apache `/editor`/API proxyplan en veilige GameBibleNode save-contracten. Fase 5.2 loste de vervolgblockers op: test-isolatie, GameBibleNode browser-save naar de beschermde API-route en permanente API/editor service-templates. Codex heeft de Fase 5.2 server/browser smoke afgerond.

Fase 5.3 corrigeert de resterende echte blocker: `/editor` had nog geen normale editor-admin browser-login. De API-routecontracten bestonden, maar de HTTP-runtime implementeerde nog geen echte `POST /auth/editor/login` flow met databasecontrole, editor session cookie en `GET /auth/editor/me` op basis van de Fase 4 `sessions` tabel.

Claude heeft de Fase 5.3 server-smoke afgerond. Daarmee is de normale editor-admin browserflow bewezen en is Fase 5 klaar voor Fase 6.

## Doel

Fase 5 maakt de eerste generieke editorwerkplek met aparte editor login/session entry, node-raster, node menu, inspector, dockable panels, lege world preview en game-user beheer. Fase 5.3 maakt deze basis bruikbaar als normale editor-admin browserflow zonder Fase 6 te implementeren.

De fase legt generieke editor-capabilities vast voor:

- editor shell layout;
- Node Library;
- Node Canvas;
- Viewport / World Preview;
- Inspector en Validation;
- History/logs;
- Asset Panel en Audio Panel;
- HUD Editor en Minimap Panel;
- Game Users met editor_admin gate.

## Bronnen gecontroleerd

Geopend of gecontroleerd voor deze fase:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase5.md`
- `README/fase6.md`
- `README/fase4.md`
- `README/fase3.md`
- `README/fase2.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/architecture/workspace-boundaries.md`
- `docs/architecture/auth-boundaries.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/gamebible-node-access.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/api-server`
- `apps/editor-web`
- `apps/game-web`
- `packages/schemas`
- `packages/shared-ui`
- `packages/shared-utils`
- `README/GameBibleNode.html`
- `README/GameBibleNode.json`
- `README/GameBibleNode.php`

## Fase 1- en Fase 2-contracten die blijven gelden

- `README/GameBibleNode.json` is de leidende Game Bible.
- Concrete gamecontent mag alleen uit GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.
- Geen concrete gamecontent in runtimecode.
- Hoofdketen: `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` is bevestigd.
- GLB=4, UI images=0, audio=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- UI/audio blijven latere asset/content gates.
- Apache blijft voorlopig hoofdwebserver.
- Nginx blijft alleen candidate/template voor een aparte latere migratiefase.

## Fase 2-serverstatus

Na Codex Fase 5.2 geldt:

- Apache blijft voorlopig hoofdwebserver.
- Nginx blijft inactive/candidate.
- `apache2ctl configtest`: `Syntax OK`.
- bestaande sites bleven OK.
- `gk-api` is active/enabled en draait via `/opt/gk/node-v22/bin/node`.
- `gk-editor-web` is active/enabled en draait via `/opt/gk/node-v22/bin/node`.
- API health: OK.
- editor-web health: OK.
- `/editor`: OK.
- `/auth/editor/me`: `401` zonder sessie.
- `/editor/game-users`: `403` zonder `editor_admin`.

Nog open als latere fases daarom vragen: definitieve release/current-deploy-afspraken verder aanscherpen voor toekomstige game runtime, realtime gateway, workers en publish-services.

## Fase 3-validatie

De Fase 3 workspace-checks zijn tijdens Fase 4 server-side gevalideerd:

1. `pnpm install`: geslaagd.
2. `pnpm build`: geslaagd.
3. `pnpm typecheck`: geslaagd.
4. `pnpm test`: geslaagd met Node 22 via `npx -p node@22`.
5. `pnpm lint`: geslaagd.

Node 22 is inmiddels structureel beschikbaar voor GK onder `/opt/gk/node-v22`. `/usr/bin/node` bleef bewust serverbreed ongemoeid op `v18.19.1`; dat is geen GK-blocker zolang GK-services en checks via `/opt/gk/node-v22` lopen.

## Fase 4-validatie

Fase 4 database/auth is server-side gevalideerd:

- MySQL database `gk` en user `gk_app@127.0.0.1` bestaan;
- runtime DB-connectie is OK;
- `db/migrations/0001_auth_foundation.sql` is toegepast;
- eerste editor admin `k3v1nc0@hotmail.com` bestaat, is actief en e-mail-geverifieerd;
- rol `editor_admin` is gekoppeld;
- `admin.seed` auditregel is aanwezig;
- database/auth smoke tests zijn geslaagd.

## Auth- en databasekeuzes

- Eerste editor admin e-mail: `k3v1nc0@hotmail.com`.
- Eerste admin password/hash/secret blijven buiten Git.
- Spelerregistratie is open.
- Editorregistratie is niet publiek.
- Editor users worden later alleen door editor admin aangemaakt.
- E-mail is verplicht, uniek en case-insensitive genormaliseerd.
- Game users starten bij registratie met `pending_verification`.
- Volledige gamefuncties vereisen e-mailverificatie.
- Editor admin moet geverifieerd en actief zijn voordat editor-toegang werkt.
- Editor-auth en game-auth blijven strikt gescheiden.
- Kruistoegang moet falen.

## Fase 5 editorlayout

Kevin heeft deze layout bevestigd:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector` en `Validation`;
- onder: `History`;
- dock tabs: `Asset Panel`, `Audio Panel`, `HUD Editor`, `Minimap Panel`, `Game Users`.

Regels:

- `Viewport / World Preview` blijft leeg tot latere nodes/world/runtime data iets plaatsen;
- geen dummy wereld, dummy assets of nepcontent;
- geen hard-coded camera, lighting, minimap, audio, HUD, NPC, quest, price, item, boss of route;
- `Game Users` vereist editor scope met `editor_admin`.

## Fase 5.1 en Fase 5.2 runtime blockers

Codex smoke meldde:

- `pnpm lint` crashte met `EISDIR` doordat generated directories/symlinks als bestanden werden gelezen;
- `apps/api-server/dist/index.js` en `apps/editor-web/dist/index.js` startten niet als langlopende HTTP-processen;
- er waren geen actieve `gk-*.service` units;
- `/var/www/gk/current` was leeg;
- Apache `/editor`, `/editor/` en `/auth/editor/me` gaven `404`;
- echte browser-login smoke was daardoor niet uitvoerbaar;
- contract-smoke voor editor_admin/game-user boundaries, lege Node Canvas en lege World Preview was groen.

Fase 5.1 Git-fix:

- lintscript slaat generated dirs en symlinks over;
- API server heeft minimale HTTP routes voor editor health, editor me, Game Users en GameBibleNode save;
- editor-web heeft minimale HTTP routes voor editor health, shell HTML en shell JSON;
- Apache-template proxyt `/auth/`, `/editor/game-users`, `/editor/game-bible-node/save` en `/editor/` naar de juiste runtimes;
- GameBibleNode access is vastgelegd met publieke readroutes en beschermde save.

Fase 5.2 Git-fix:

- de lint-test gebruikt een tijdelijke fixture in plaats van echte `apps/editor-web/dist` of `node_modules`, zodat build-output voor latere runtime-tests intact blijft;
- API server levert `GET /editor/game-bible-node/save-client.js`;
- Apache-template injecteert deze save-client in `README/GameBibleNode.html` via `substitute_module` of een gelijkwaardige server-side patch;
- browser-save post naar `POST /editor/game-bible-node/save` met same-origin credentials en CSRF-header;
- legacy `README/GameBibleNode.php` is gedepricieerd voor normale browser-save en blijft alleen beschermde fallback;
- permanente service-templates voor `gk-api` en `gk-editor-web` zijn voorbereid;
- `ops/scripts/render-runtime-services` rendert de service-units voor server-side verify/install.

## Fase 5.3 editor-login en GameBible browser-save

Probleem uit de echte browserflow:

- `/editor` was bereikbaar, maar toonde direct de shell;
- er was geen loginformulier;
- de API had routecontracten voor `editor.login`, maar nog geen echte `POST /auth/editor/login`;
- `/auth/editor/me` werkte niet met een database-session cookie;
- Kevin kon daardoor niet via de normale browser een `editor_admin` session krijgen;
- GameBibleNode browser-save kon de beschermde API-route technisch gebruiken, maar niet vanuit Kevins normale browser zonder editor session.

Fase 5.3 Git-fix:

- `POST /auth/editor/login` leest de Fase 4 `editor_users`, `editor_roles`, `editor_user_roles` en schrijft naar `sessions`;
- login gebruikt genormaliseerde e-mail, generieke foutmelding en geen account-enumeratie;
- wachtwoordverificatie is een server/runtime capability en bewaart geen wachtwoorden, hashes of tokens in Git;
- de session token wordt alleen gehashed in de database opgeslagen;
- de browser krijgt een `HttpOnly`, `SameSite=Strict` editor session cookie en een CSRF-cookie;
- `GET /auth/editor/me` leest de echte editor session en rollen uit de database;
- `POST /auth/editor/logout` trekt de editor session in;
- `/editor` toont login zonder editor session en toont de shell pas na authenticated `editor_admin`;
- GameBibleNode save gebruikt dezelfde editor session plus Origin/CSRF;
- smoke-auth headers blijven alleen beschikbaar wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git expliciet aan staat en worden via Apache gestript.
- de latere TypeScript build-fix zet `set-cookie` headers als `string[]` in `apps/api-server/src/http-server.ts`;
- de latere password-verifier fix ondersteunt beide scrypt formats: `scrypt$N$r$p$salt$hash` en `scrypt:N=<n>,r=<r>,p=<p>:saltBase64url:hashBase64url`.

## Wat is aangemaakt of bijgewerkt

Root:

- `.gitignore`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`
- `scripts/check-workspace-boundaries.mjs`
- `ops/env/gk.example.env`

Apps:

- `apps/editor-web`
- `apps/game-web`
- `apps/api-server`
- `apps/realtime-gateway`
- `apps/world-service`
- `apps/publish-service`
- `apps/asset-worker`

Packages:

- `packages/schemas`
- `packages/node-engine`
- `packages/node-types`
- `packages/net-protocol`
- `packages/shared-ui`
- `packages/shared-utils`
- `packages/renderer-runtime`
- `packages/audio-runtime`

Overig:

- `db/schema-boundary.md`
- `db/migrations/0001_auth_foundation.sql`
- `db/seeds/0001_initial_editor_admin.sql.template`
- `tests/workspace-boundaries.test.mjs`
- `tests/auth-boundaries.test.mjs`
- `docs/architecture/workspace-boundaries.md`
- `docs/architecture/auth-boundaries.md`
- `docs/architecture/editor-shell.md`
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

Fase 5 aanvullingen:

- `packages/shared-ui/src/editor-layout.ts`
- `apps/editor-web/src/editor-shell.ts`
- `apps/editor-web/src/node-canvas.ts`
- `apps/editor-web/src/world-preview.ts`
- `apps/editor-web/src/panels.ts`
- `apps/editor-web/src/game-user-management.ts`
- `apps/api-server/src/editor-game-user-management.ts`
- `tests/editor-shell.test.mjs`

Fase 5.1/Fase 5.2 aanvullingen:

- `scripts/check-workspace-boundaries.mjs`
- `apps/api-server/src/http-server.ts`
- `apps/api-server/src/http-utils.ts`
- `apps/api-server/src/runtime-session.ts`
- `apps/api-server/src/gamebible-node-routes.ts`
- `apps/api-server/src/gamebible-node-save-client.ts`
- `apps/api-server/src/gamebible-node-store.ts`
- `apps/editor-web/src/http-server.ts`
- `README/GameBibleNode.php`
- `README/fase6.md`
- `docs/architecture/gamebible-node-access.md`
- `ops/scripts/render-runtime-services`
- `ops/systemd/gk-editor-web.service.template`
- `tests/phase5-runtime.test.mjs`

## Database/migraties

Fase 4 voegt schema-only migraties toe voor:

- `editor_users`
- `editor_roles`
- `editor_user_roles`
- `game_users`
- `game_user_status`
- `sessions`
- `player_profiles`
- `characters`
- `email_verification_tokens`
- `password_reset_tokens`
- `audit_log`

Geen productie-data of echte credentials in migraties. De admin seed-template gebruikt alleen buiten-Git env placeholders.

## API routes en scopes

Fase 4 routecontracten blijven leidend voor:

- editor login/logout/me;
- game register/login/logout/me;
- email verification request/confirm;
- password reset request/confirm;
- editor game-user list;
- editor game-user status update.

Scope-regels:

- editor routes vereisen editor session;
- game routes vereisen game session;
- editor game-user beheer vereist `editor_admin`;
- game session mag niet in editor;
- editor session mag niet automatisch player endpoints gebruiken;
- publieke auth routes gebruiken generieke responses zonder account-enumeratie.

Fase 5 voegt een API-helper toe voor editor game-user beheer. Deze helper gebruikt de Fase 4 routecontracten en geeft alleen toegang wanneer de sessie editor scope en `editor_admin` heeft.

Fase 5.1 voegt het routecontract `editor.game_bible_node.save` toe. Deze route vereist editor scope met `editor_admin`, rate limiting, CSRF/Origin-check en auditactie `game_bible_node.save`.

## Editor shell, canvas, viewport en panels

Editor shell:

- editor login/session entry gebruikt editor-auth routes;
- hoofd-layout is modulair en niet monolithisch;
- dock layout is een model dat later door UI-rendering gebruikt kan worden.

Node Canvas:

- start met lege canvas state;
- heeft editor-grid/raster;
- bevat alleen generieke capability-definities voor schema, asset reference, validation en publish;
- bevat geen concrete gameplay nodes.

Viewport / World Preview:

- staat als aparte main tab naast Node Canvas;
- status is `empty`;
- wacht op gepubliceerde world-node data;
- bevat geen world objects, assets, audio, camera of lighting.

Panels:

- `Node Library`, `Inspector`, `Validation`, `History`, `Asset Panel`, `Audio Panel`, `HUD Editor`, `Minimap Panel`, `Game Users` bestaan als generieke capabilities;
- `Asset Panel` leest later asset inventory en wijst geen runtime-rollen toe;
- `Audio Panel` houdt de audio-gate open wanneer audio count 0 is;
- `HUD Editor` en `Minimap Panel` leggen geen definitieve waarden of layout vast;
- `Game Users` vereist editor scope met `editor_admin`.

HTTP runtime:

- API: `GET /health/editor`, `POST /auth/editor/login`, `POST /auth/editor/logout`, `GET /auth/editor/me`, `GET /editor/game-bible-node/save-client.js`, `GET /editor/game-users`, `PATCH /editor/game-users/:gameUserId/status`, `POST /editor/game-bible-node/save`;
- editor-web: `GET /health/editor`, `GET /`, `GET /editor`, `GET /editor/`, `GET /shell.json`;
- smoke-auth headers zijn alleen toegestaan wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git tijdelijk is gezet en mogen publiek via Apache niet doorkomen.

GameBibleNode:

- exact `README/GameBibleNode.html`, `README/GameBibleNode.json` en `README/GameBibleNode.php` blijven beschikbaar;
- andere README-bestanden blijven dicht;
- API-save is de voorkeursroute;
- legacy PHP-save mag alleen tijdelijk met buiten-Git serverbescherming en faalt zonder auth/token;
- save schrijft atomisch met lock, backup en auditregel.

## Content- en assetgrens

Niet toegevoegd:

- assets;
- data;
- secrets;
- dummy content;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

De startcode bevat alleen generieke boundaries, registries, protocoltypes, validators, renderer/audio primitives, env-readers en auth/database capabilities.

Bevestigde Fase 6-input, nog niet geimplementeerd:

- `game.name = Eldoria`
- `start zone = Willowmere Workshop`
- `history depth = 100 undo/redo acties per editor session`

## Checks

Eerder Git-side uitgevoerd:

- Repo-bronnen geopend via GitHub connector.
- Fase 4-relevante workspacebestanden lokaal gecontroleerd.
- Root workspace-structuur gecontroleerd.
- Starter file size scan: sourcebestanden blijven klein.
- ASCII-scan op nieuwe workspacebestanden: OK.
- Secret/content scan op `apps/`, `packages/`, `db/`, `docs/architecture/`, `tests/`, `scripts/` en workspace-configs: geen echte secrets/assets/data/concrete runtimecontent gevonden.
- `node --experimental-strip-types --test tests/*.test.mjs`: OK.
- `node scripts/check-workspace-boundaries.mjs`: OK.
- `node --experimental-strip-types --check` op alle `apps/**/*.ts` en `packages/**/*.ts`: OK.
- `npm test`: OK.
- `npm run lint`: OK.
- Migratie- en seed-template scans: OK.
- Migratiestructuur-scan op tabeldefinities en statements: OK.

Eerder server-side door Codex afgerond voor Fase 3/Fase 4:

- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK met Node 22 via `npx -p node@22`.
- `pnpm lint`: OK.
- MySQL actief.
- Database `gk` aanwezig.
- User `gk_app@127.0.0.1` aanwezig.
- Runtime DB-connectie OK.
- `db/migrations/0001_auth_foundation.sql` succesvol toegepast.
- Vereiste tabellen aanwezig: `editor_users`, `editor_roles`, `editor_user_roles`, `game_users`, `game_user_status`, `sessions`, `player_profiles`, `characters`, `email_verification_tokens`, `password_reset_tokens`, `audit_log`.
- Admin seed secret/temp password/hash staan buiten Git in `/etc/gk/secrets/initial-editor-admin.env`.
- Admin `k3v1nc0@hotmail.com` bestaat, is actief en heeft geverifieerde e-mail.
- Rol `editor_admin` is gekoppeld.
- `admin.seed` auditregel is aanwezig.
- Database/auth smoke tests: OK.
- Server-side Git status bleef schoon.

Fase 5 Git-side uitgevoerd:

- `npm test`: OK.
- `npm run lint`: OK.
- `node --experimental-strip-types --check` op `apps/**/*.ts` en `packages/**/*.ts`: OK.
- Secret/content scan op Fase 5 editor shell, docs en tests: OK.
- Asset/dummy-content scan op Fase 5 bestanden: OK.
- Diff-scope controle: alleen Fase 5 editor/API/shared-ui/test/docs/current-phase bestanden.

Fase 5.1 Git-side uitgevoerd:

- lint EISDIR-fix voorbereid voor generated dirs/symlinks;
- API/editor HTTP runtime entrypoints toegevoegd;
- GameBibleNode save contract toegevoegd;
- Apache-template bijgewerkt voor `/editor`, `/auth/`, Game Users en GameBibleNode;
- GameBibleNode access doc toegevoegd.
- `npm test`: OK met source-tests; 4 gebouwde-runtime subtests blijven skipped totdat `dist` door build bestaat.
- `npm run lint`: OK.
- `node --experimental-strip-types --check` op gewijzigde TS/MJS-bestanden: OK.
- Source runtime smoke met tijdelijke resolutiebruggen: OK voor API health, editor session, Game Users gate en lege editor viewport.
- Source GameBibleNode save smoke met tijdelijke resolutiebruggen: OK voor editor_admin policy, game-session blokkade, backup, lock en atomische write.
- Secret/content scan: OK; alleen bestaande assetnamen in het lintscript zelf als verboden scanpatronen.
- Generated output scan: OK, geen `dist`, `node_modules`, `build` of `coverage` in de werkset.

Fase 5.2 Git-side uitgevoerd:

- test-isolatie aangepast zodat de lint-test geen echte build-output verwijdert;
- GameBibleNode browser-save client toegevoegd voor de beschermde API-route;
- Apache-template voorbereid voor save-client injectie in `GameBibleNode.html`;
- permanente `gk-api` en `gk-editor-web` service-templates voorbereid;
- `ops/scripts/render-runtime-services` toegevoegd voor server-side unit rendering;
- `npm test`: OK; 30 tests, 26 passed, 4 runtime-dist tests skipped omdat lokale `dist` ontbreekt;
- `npm run lint`: OK;
- `node --experimental-strip-types --check` op `apps`, `packages`, `scripts` en `tests`: OK;
- `bash -n` op ops-scripts: OK;
- `ops/scripts/render-runtime-services` naar tijdelijke map: OK;
- `systemd-analyze verify` op gerenderde `gk-api.service` en `gk-editor-web.service`: OK;
- GameBibleNode save-client JavaScript syntaxcheck: OK;
- secret/content scan: OK;
- generated output scan: OK.

Fase 5.3 Git-side uitgevoerd:

- echte editor-login/session-cookie flow toegevoegd in API-runtime;
- editor-web loginformulier en login/shell switching toegevoegd;
- GameBibleNode save-client behoudt protected API-save met duidelijke browserfouten;
- Apache-template stript smoke-auth headers;
- `node --experimental-strip-types --test tests/editor-login-flow.test.mjs`: OK; bronchecks groen, runtime-dist subtests blijven skipped totdat `pnpm build` dist maakt;
- `node --experimental-strip-types --test tests/*.test.mjs`: OK; 34 tests, 28 passed, 6 runtime-dist tests skipped omdat lokale `dist` ontbreekt;
- tijdelijke API source-smoke met resolutiesymlinks: OK voor editor login, session cookie, `/auth/editor/me`, public save fail, protected GameBibleNode save en logout;
- `node scripts/check-workspace-boundaries.mjs`: OK.

Fase 5.3 server-side door Claude afgerond:

- set-cookie TypeScript build-fix aanwezig in `apps/api-server/src/http-server.ts`;
- password-verifier ondersteunt beide scrypt formats;
- `pnpm install`: OK;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 35/35;
- `pnpm lint`: OK;
- services actief via `/opt/gk/node-v22/bin/node`;
- `/editor` toont login zonder sessie;
- editor admin login werkt;
- `/auth/editor/me` geeft authenticated true met `editor_admin`;
- GameBible save via `/editor/game-bible-node/save` werkt;
- backup en audit werken;
- logout werkt;
- save na logout faalt;
- publieke save en legacy PHP write blijven dicht;
- bestaande game-site blijft bereikbaar.

Fase 5.2 server-side door Codex afgerond:

- Commit op main: `c3b5543c1a6c68aa29b6c81aeb3c0f2e957674a1`.
- Commit message: `fix: complete phase 5 runtime smoke blockers`.
- Node 22 structureel geinstalleerd op `/opt/gk/node-v22`.
- `/opt/gk/node-v22/bin/node -v`: `v22.22.3`.
- `/opt/gk/node-v22/bin/corepack --version`: `0.34.6`.
- `pnpm` via Node 22: `10.12.4`.
- `/usr/bin/node` bleef ongemoeid op `v18.19.1`.
- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 31/31 tests groen.
- `pnpm lint`: OK.
- `gk-api`: active/enabled via `/opt/gk/node-v22/bin/node`.
- `gk-editor-web`: active/enabled via `/opt/gk/node-v22/bin/node`.
- API health: OK.
- editor-web health: OK.
- Apache blijft hoofdwebserver.
- Nginx blijft inactive.
- `apache2ctl configtest`: `Syntax OK`.
- bestaande sites bleven OK.
- `/editor`: OK.
- `/auth/editor/me`: `401` zonder sessie.
- `/editor/game-users`: `403` zonder `editor_admin`.
- `/README/GameBibleNode.html`: `200`.
- `/README/GameBibleNode.json`: `200`.
- `/README/GameBibleNode.php` is bereikbaar maar geen open write.
- andere README-bestanden blijven `403`.
- publieke POST naar legacy PHP faalt.
- publieke POST naar save API faalt.
- public smoke headers via Apache worden gestript.
- browser-save post naar `/editor/game-bible-node/save`, niet meer naar `GameBibleNode.php`.
- Playwright browser-smoke: geen console/page errors.
- Editor shell: OK.
- Node Canvas: leeg.
- Viewport / World Preview: leeg.
- geen dummy media/assets/world/camera/light/audio.
- beveiligde `editor_admin` save: OK.
- invalid JSON: `400`.
- invalid contract JSON: `400`.
- lock-test faalt veilig.
- backup en audit werken.
- `GameBibleNode.json` is na test exact hersteld.
- Git status bleef schoon.
- Geen Fase 5.2 runtime-smoke blocker meer.

## Open Kevin-input

Geen blokkerende Fase 5-input open.

Latere fases houden hun eigen gates voor GLB-role mapping, UI-assets, audio-assets, concrete content, economy, world settings en runtime services.

Fase 6-input is bevestigd maar hoort nog niet in implementatie tijdens Fase 5.3:

- game name: `Eldoria`
- start zone: `Willowmere Workshop`
- history depth: `100` undo/redo acties per editor session

## Open Codex-taken buiten Git

Geen harde Fase 5.3 server-smoke taken open.

Open blijft ook toekomstwerk voor latere fases:

- Fase 6 nog niet implementeren totdat Kevin die fase expliciet start.
- Toekomstige game runtime, realtime gateway, workers en publish-services pas installeren/starten wanneer hun fase en echte build-output bestaan.
- Nginx blijft candidate; geen Nginx-migratie zonder aparte migratiefase.
- `/usr/bin/node` blijft serverbreed `v18.19.1`; dit is bewust ongemoeid en geen GK-blocker zolang GK via `/opt/gk/node-v22` draait.

## Fasebeoordeling

Fase 5.3 patcht de resterende echte editor-login en GameBible browser-save blocker en is server-side gevalideerd.

Afgerond voor deze fase:

- editor shell layoutmodel bestaat;
- Node Canvas en Viewport / World Preview zijn aparte main tabs;
- Viewport / World Preview blijft leeg zonder dummy content;
- Fase 5 panels bestaan als generieke capabilities;
- game-user beheer vereist editor scope met `editor_admin`;
- lokale Fase 5/Fase 5.1/Fase 5.2/Fase 5.3 tests en lintbronchecks zijn geslaagd binnen de lokale toolingbeperkingen;
- Fase 5.2 server-side `pnpm install/build/typecheck/test/lint` zijn geslaagd met Node 22 onder `/opt/gk/node-v22`;
- Fase 5.2 `gk-api` en `gk-editor-web` zijn active/enabled;
- Fase 5.2 Apache `/editor`, auth/API gates, GameBibleNode readroutes en browser-save zijn gevalideerd;
- Fase 5.3 normale editor-login en GameBible browser-save zijn door Claude op de server getest;
- Node Canvas en Viewport / World Preview blijven leeg zonder dummy content;
- geen generated `dist`, `node_modules`, secrets, assets of data zijn in Git beland;
- er is geen harde Fase 5.3 runtime-smoke blocker meer.

Niet verwarren met volledige toekomstige game-runtime voltooiing: realtime gateway, workers, publish-services en latere game runtime krijgen hun eigen fasegates.

Huidige status: Fase 5/Fase 5.3 is klaar voor Fase 6. Fase 6-input is bevestigd geregistreerd, maar Fase 6 is nog niet geimplementeerd.
