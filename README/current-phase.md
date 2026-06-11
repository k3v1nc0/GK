# Current Phase

Actieve fase: Fase 6 - node graph core met typed sockets, dropdowns en undo/redo.

Status: Fase 6 Git-basis voorbereid; Codex database migration en editor/API runtime smoke gate open.

## Primaire Fase 5-status

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase5.md`
- `README/fase6.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/gamebible-node-access.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`

Dit README-fasebestand blijft de korte fase-index. De inhoudelijke fasebeoordeling staat onder `docs/design/phase-plan/current-phase.md`.

## Gebruik

- Werk aan 1 fase tegelijk.
- Open altijd eerst deze korte fase-index en daarna `docs/design/phase-plan/current-phase.md`.
- Voor content geldt `README/GameBibleNode.json` als leidende Game Bible.
- Concrete gamecontent loopt via `Database > Editor/Node-system > Publish > Runtime Game`, niet via runtime-hardcoding.
- Pas een fase pas naar klaar aan als alle blokkerende input, Codex-taken en checks voor die fase zijn afgerond.

## Laatste status

Fase 1 is klaar.

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.2 API/editor runtimes zijn server-side actief en gevalideerd. Fase 3 workspace en Fase 4 database/auth zijn server-side gevalideerd.

Fase 5.3 is server-side afgerond: normale editor-login, authenticated `/auth/editor/me`, GameBible browser-save, logout en fail-closed public save checks zijn groen.

Fase 6 voegt de eerste echte node graph core toe: typed sockets, meerdere poorten, dropdown/input field schemas, edge validation, editor graph operations, undo/redo history met 100 acties per editor session, operation log en draft preview zonder publish.

## Fase 5 Git-basis

Al aanwezig uit Fase 3:

- root `package.json`
- `pnpm-workspace.yaml`
- root TypeScript configs
- `apps/editor-web`
- `apps/game-web`
- `apps/api-server`
- `apps/realtime-gateway`
- `apps/world-service`
- `apps/publish-service`
- `apps/asset-worker`
- `packages/schemas`
- `packages/node-engine`
- `packages/node-types`
- `packages/net-protocol`
- `packages/shared-ui`
- `packages/shared-utils`
- `packages/renderer-runtime`
- `packages/audio-runtime`
- `db/schema-boundary.md`
- `tests/workspace-boundaries.test.mjs`
- `docs/architecture/workspace-boundaries.md`

Aangemaakt of bijgewerkt voor Fase 4:

- `db/migrations/0001_auth_foundation.sql`
- `db/seeds/0001_initial_editor_admin.sql.template`
- `packages/schemas/src/auth.ts`
- `apps/api-server/src/auth-policy.ts`
- `apps/api-server/src/auth-routes.ts`
- `apps/editor-web/src/auth-client.ts`
- `apps/game-web/src/auth-client.ts`
- `tests/auth-boundaries.test.mjs`
- `docs/architecture/auth-boundaries.md`
- `ops/env/gk.example.env`

Aangemaakt of bijgewerkt voor Fase 5:

- `packages/shared-ui/src/editor-layout.ts`
- `apps/editor-web/src/editor-shell.ts`
- `apps/editor-web/src/node-canvas.ts`
- `apps/editor-web/src/world-preview.ts`
- `apps/editor-web/src/panels.ts`
- `apps/editor-web/src/game-user-management.ts`
- `apps/api-server/src/editor-game-user-management.ts`
- `tests/editor-shell.test.mjs`
- `docs/architecture/editor-shell.md`

Aangemaakt of bijgewerkt voor Fase 5.1/Fase 5.2:

- `scripts/check-workspace-boundaries.mjs`
- `apps/api-server/src/http-server.ts`
- `apps/api-server/src/http-utils.ts`
- `apps/api-server/src/runtime-session.ts`
- `apps/api-server/src/gamebible-node-routes.ts`
- `apps/api-server/src/gamebible-node-save-client.ts`
- `apps/api-server/src/gamebible-node-store.ts`
- `apps/editor-web/src/http-server.ts`
- `README/GameBibleNode.php`
- `docs/architecture/gamebible-node-access.md`
- `ops/apache/gk-vhost.conf.template`
- `ops/scripts/render-runtime-services`
- `ops/systemd/gk-editor-web.service.template`
- `tests/phase5-runtime.test.mjs`
- `README/fase6.md`

Aangemaakt of bijgewerkt voor Fase 5.3:

- `apps/api-server/src/editor-auth-store.ts`
- `apps/api-server/src/mysql-editor-auth-store.ts`
- `apps/api-server/src/password-verifier.ts`
- `apps/api-server/src/request-security.ts`
- `apps/api-server/src/session-cookies.ts`
- `tests/editor-login-flow.test.mjs`

Aangemaakt of bijgewerkt voor Fase 6:

- `db/migrations/0002_node_graph_core.sql`
- `packages/schemas/src/node-graph.ts`
- `packages/node-types/src/index.ts`
- `packages/node-engine/src/graph-validation.ts`
- `packages/node-engine/src/graph-history.ts`
- `packages/node-engine/src/draft-preview.ts`
- `apps/api-server/src/editor-graph-routes.ts`
- `tests/node-graph-core.test.mjs`

## Bevestigde grenzen

- Apache blijft voorlopig de actieve hoofdwebserver.
- Nginx blijft alleen candidate/template.
- Assetpad: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- GLB=4, UI=0, audio=0.
- Geen assets, data, secrets, dummy content of concrete gamecontent toegevoegd.
- Renderer en audio zijn aparte packages.
- Schemas, node-engine en node-types zijn aparte packages.
- Net-protocol is apart.
- Asset-worker leest generiek `GK_ASSET_SOURCE_DIR` en wijst geen runtime-rollen toe.
- Editor-auth en game-auth zijn strikt gescheiden.
- Game registratie is open en start met `pending_verification`.
- Editorregistratie is niet publiek.
- Eerste editor admin e-mail: `k3v1nc0@hotmail.com`.
- Admin seed password/hash/secret blijven buiten Git.
- Node Canvas en Viewport / World Preview zijn aparte main tabs.
- Viewport / World Preview blijft leeg tot gepubliceerde world/node-data beschikbaar is.
- Asset Panel en Audio Panel verzinnen geen assets, audio of runtime-rollen.
- Game Users vereist editor scope met `editor_admin`.
- Fase 5.1 voegt startbare API/editor HTTP entrypoints toe.
- Fase 5.2 repareert test-isolatie, voegt een API-save client toe voor GameBibleNode browser-save en maakt permanente API/editor service-templates concreet genoeg voor Codex serverinstallatie.
- GameBibleNode HTML/JSON blijven smal publiek leesbaar; save moet beschermd via editor-auth, `editor_admin`, Origin/CSRF, lock, backup, atomische write en audit.
- Fase 5.3 maakt `POST /auth/editor/login`, `POST /auth/editor/logout` en `GET /auth/editor/me` echte database/session-cookie routes.
- `/editor` toont login zolang er geen geldige editor session is en toont de editor shell pas na een authenticated `editor_admin` sessie.
- GameBibleNode browser-save gebruikt dezelfde editor session cookie en CSRF-cookie/header naar `POST /editor/game-bible-node/save`.

## Open Kevin-input

Geen blokkerende Kevin-input open voor Fase 5.

Latere fases houden hun eigen gates voor assetrollen, UI/audio, concrete content, economy, world settings en runtime services.

Bevestigde Fase 6-input:

- `game.name = Eldoria`
- `start zone = Willowmere Workshop`
- `history depth = 100 undo/redo acties per editor session`

`history depth` is als editor graph-history contract vastgelegd. `game.name` en `start zone` blijven contentdata uit Kevin-input/GameBible/editor-data en zijn niet als runtimecode of hard-coded worldcontent toegevoegd.

## Afgeronde eerdere Codex-validatie buiten Git

Codex heeft Fase 3/Fase 4 server-side gevalideerd:

- `pnpm install`: geslaagd.
- `pnpm build`: geslaagd.
- `pnpm typecheck`: geslaagd.
- `pnpm test`: geslaagd met Node 22 via `npx -p node@22`.
- `pnpm lint`: geslaagd.
- MySQL is actief.
- Database `gk` bestaat.
- User `gk_app@127.0.0.1` bestaat.
- Runtime DB-connectie is OK.
- `db/migrations/0001_auth_foundation.sql` is succesvol toegepast.
- Alle Fase 4-auth tabellen zijn aanwezig.
- Admin seed secret/temp password/hash staan buiten Git in `/etc/gk/secrets/initial-editor-admin.env`.
- Admin `k3v1nc0@hotmail.com` bestaat, is actief en heeft geverifieerde e-mail.
- Rol `editor_admin` is gekoppeld.
- `admin.seed` auditregel is aanwezig.
- Database/auth smoke tests zijn geslaagd.
- Git status bleef schoon.
- Geen harde Fase 4 database/auth blocker meer.

## Open aandachtspunten

Technische runtime/tooling status:

- Node 22 is voor GK structureel beschikbaar onder `/opt/gk/node-v22`.
- `/opt/gk/node-v22/bin/node -v`: `v22.22.3`.
- `/opt/gk/node-v22/bin/corepack --version`: `0.34.6`.
- `pnpm` via Node 22: `10.12.4`.
- `/usr/bin/node` bleef bewust serverbreed ongemoeid op `v18.19.1`; dit is geen GK-blocker zolang GK-services en checks via `/opt/gk/node-v22` lopen.

Fase 2-serverstatus na Codex Fase 5.2:

- Apache blijft hoofdwebserver.
- Nginx blijft inactive/candidate.
- `apache2ctl configtest`: `Syntax OK`.
- Bestaande sites bleven OK.
- `gk-api`: active/enabled via `/opt/gk/node-v22/bin/node`.
- `gk-editor-web`: active/enabled via `/opt/gk/node-v22/bin/node`.
- API health: OK.
- editor-web health: OK.
- `/editor`: OK.
- `/auth/editor/me`: `401` zonder sessie.
- `/editor/game-users`: `403` zonder `editor_admin`.

Nog open als latere fases daarom vragen:

- definitieve release/current-deploy-afspraken verder aanscherpen voor toekomstige game runtime, realtime gateway, workers en publish-services;
- toekomstige fases na Fase 6 pas starten wanneer Kevin die expliciet opent.

## Fase 5.2 server/browser validatie

Codex heeft Fase 5.2 server-side afgerond op main:

- Commit: `c3b5543c1a6c68aa29b6c81aeb3c0f2e957674a1`.
- Commit message: `fix: complete phase 5 runtime smoke blockers`.
- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 31/31 tests groen.
- `pnpm lint`: OK.
- Playwright browser-smoke: geen console/page errors.
- Editor shell: OK.
- Node Canvas: leeg.
- Viewport / World Preview: leeg.
- Geen dummy media/assets/world/camera/light/audio.
- GameBibleNode publieke leesroutes: OK.
- Browser-save post naar `/editor/game-bible-node/save`, niet naar `GameBibleNode.php`.
- Publieke POST naar legacy PHP en save API faalt.
- Beveiligde `editor_admin` save: OK.
- Invalid JSON en invalid contract JSON geven `400`.
- Lock-test faalt veilig.
- Backup en audit werken.
- `GameBibleNode.json` is na test exact hersteld.
- Git status bleef schoon.

## Fase 5.3 status

Fase 5.3 Git-wijziging:

- echte editor-login route via Fase 4 `editor_users`, `editor_roles`, `editor_user_roles` en `sessions`;
- login geeft generieke foutmeldingen zonder account-enumeratie;
- login maakt een `scope=editor` sessie met gehashte sessietoken in de database;
- editor session cookie is `HttpOnly`, `SameSite=Strict` en `Secure` wanneer HTTPS/forwarded HTTPS of env dit afdwingt;
- CSRF-cookie wordt gezet voor browser-acties;
- logout trekt de editor session in;
- `/auth/editor/me` leest de echte editor session en rollen uit de database;
- smoke-auth headers blijven alleen bruikbaar wanneer `GK_ENABLE_SMOKE_AUTH_HEADERS=1` buiten Git expliciet is gezet en worden via Apache gestript;
- GameBibleNode save blijft beschermd door editor-auth, `editor_admin`, Origin/CSRF, JSON-contract, lock, backup, atomische write en audit.
- latere build-fix: `set-cookie` headers in `apps/api-server/src/http-server.ts` zijn TypeScript-correct gemaakt;
- latere password-verifier fix: `scrypt$N$r$p$salt$hash` en `scrypt:N=<n>,r=<r>,p=<p>:saltBase64url:hashBase64url` worden ondersteund.

Lokaal gecontroleerd:

- `node --experimental-strip-types --test tests/editor-login-flow.test.mjs`: OK; bronchecks groen, runtime-dist subtests skipped omdat lokale `dist` ontbreekt;
- `node --experimental-strip-types --test tests/*.test.mjs`: OK; 34 tests, 28 passed, 6 runtime-dist tests skipped;
- tijdelijke API source-smoke: OK voor editor login, session cookie, `/auth/editor/me`, public save fail, protected GameBibleNode save en logout;
- `node scripts/check-workspace-boundaries.mjs`: OK.

Fase 5.3 server-smoke afgerond door Claude:

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

## Fasebeoordeling

Fase 6 Git-basis voorbereid; Codex database migration en editor/API runtime smoke gate open.

Afgerond in Git:

- graph schema/migratie voor graphs, nodes, edges, revisions, operation log en draft state;
- typed socket en field schemas voor flow, `var.string`, `number`, `color`, `asset.reference` en `audio.reference`;
- graph edge validation, field validation, undo/redo en draft preview;
- editor-only graph routecontracten;
- Node Canvas graph contract en undo/redo UI-contract;
- tests voor typed sockets, verkeerde koppelingen, fields, history depth 100, draft preview en editor-only access.

Open voor Codex buiten Git:

- `pnpm install`;
- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- `db/migrations/0002_node_graph_core.sql` toepassen op MySQL;
- API/editor services herstarten;
- `/editor/graph/draft`, `/editor/graph/operation` en `/editor/graph/preview` smoke testen met editor session;
- bevestigen dat game session geen editor graph toegang krijgt en draft preview niets publiceert.
