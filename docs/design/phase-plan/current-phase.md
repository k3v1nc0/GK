# Current Phase

## Fase

Actieve fase: Fase 4 - Database, migraties, editor-login en game-login.

## Status

Fase-status: Fase 4 klaar voor Fase 5; database/auth server-side validatie afgerond.

Codex heeft de Fase 4 database/auth-validatie server-side afgerond. Er is geen harde Fase 4 database/auth blocker meer.

## Doel

Fase 4 maakt database- en authfundering met gescheiden editor-login, game-login, game users, player profiles en characters.

De fase legt generieke account/auth-capabilities vast voor:

- editor users en editor roles;
- game users en game-user status;
- sessions met scope;
- player profiles en characters;
- email verificatie en password reset tokens;
- audit logging;
- scoped API-routecontracten.

## Bronnen gecontroleerd

Geopend of gecontroleerd voor deze fase:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase4.md`
- `README/fase3.md`
- `README/fase2.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/architecture/workspace-boundaries.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/api-server`
- `apps/editor-web`
- `apps/game-web`
- `packages/schemas`
- `packages/shared-utils`

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

## Fase 2-open punten die open blijven

Deze punten blokkeren Fase 4 Git-werk niet, maar blijven Codex-taken buiten Git:

1. `/etc/gk/gk.env` endpointvelden vervangen door de bevestigde waarden.
2. `ops/scripts/check-host` opnieuw draaien.
3. Apache vhost/reverse proxy renderen uit `ops/apache/gk-vhost.conf.template`.
4. Apache-config veilig testen en bevestigen dat bestaande sites niet breken.
5. `/var/www/gk/current` vullen zodra runtime/build bestaat.
6. Definitieve `gk-*.service` units renderen/installeren/starten wanneer echte `ExecStart` beschikbaar is.
7. Fase 2 runtime build/service checks uitvoeren zodra echte runtime/build bestaat.

## Fase 3-validatie

De Fase 3 workspace-checks zijn tijdens Fase 4 server-side gevalideerd:

1. `pnpm install`: geslaagd.
2. `pnpm build`: geslaagd.
3. `pnpm typecheck`: geslaagd.
4. `pnpm test`: geslaagd met Node 22 via `npx -p node@22`.
5. `pnpm lint`: geslaagd.

Aandachtspunt: systeem-Node is `v18.19.1`; toekomstige `pnpm test` runs vereisen Node 22-activatie of een structurele Node-upgrade.

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
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

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

Routecontracten toegevoegd voor:

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

## Content- en assetgrenz

Niet toegevoegd:

- assets;
- data;
- secrets;
- dummy content;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

De startcode bevat alleen generieke boundaries, registries, protocoltypes, validators, renderer/audio primitives, env-readers en auth/database capabilities.

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

Server-side door Codex afgerond:

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

## Open Kevin-input

Geen blokkerende Fase 4-input open.

Latere fases houden hun eigen gates voor GLB-role mapping, UI-assets, audio-assets, concrete content, economy, world settings en runtime services.

## Open Codex-taken buiten Git

Fase 4 database/auth-taken zijn afgerond. Open blijven:

1. Fase 2 servergates verder sluiten zodra echte runtime/build bestaat.
2. Node 22 activeren voor toekomstige `pnpm test` runs of de systeem-Node structureel upgraden vanaf `v18.19.1`.

## Fasebeoordeling

Fase 4 is klaar voor Fase 5.

Afgerond voor deze fase:

- workspace install/build/typecheck/test/lint zijn server-side geslaagd;
- Fase 4 MySQL migratie is server-side succesvol toegepast;
- eerste editor admin seed is via buiten-Git secret/env uitgevoerd;
- database/auth smoke tests zijn geslaagd;
- geen generated `dist`, `node_modules`, secrets, assets of data zijn in Git beland;
- er is geen harde Fase 4 database/auth blocker meer.

Niet verwarren met Fase 2 servervoltooiing: runtime/service/webserverpunten blijven open tot echte runtime/build bestaat.

Open technische gate voor toekomstige runs: systeem-Node is `v18.19.1`; `pnpm test` vereist Node 22-activatie of structurele Node-upgrade.
