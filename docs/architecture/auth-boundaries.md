# Auth Boundaries

Fase 4 voegt database- en authfundering toe als generieke engine/data capability.

## Scope split

Editor-auth en game-auth zijn strikt gescheiden:

- editor accounts staan in `editor_users`;
- game accounts staan in `game_users`;
- editor roles staan in `editor_roles` en `editor_user_roles`;
- game-user status staat op `game_users.status` en in de `game_user_status` history;
- sessies dragen expliciet scope `editor` of `game`.

Een game user is niet automatisch editor user. Een editor user is niet automatisch player. Een player session is niet geldig voor editor routes en een editor session is niet geldig voor game routes.

## Routes

Fase 4 definieert route-contracten voor:

- `editor.login`
- `editor.logout`
- `editor.me`
- `game.register`
- `game.login`
- `game.logout`
- `game.me`
- `email_verification.request`
- `email_verification.confirm`
- `password_reset.request`
- `password_reset.confirm`
- `editor.game_users.list`
- `editor.game_users.status_update`
- `editor.graph.draft`
- `editor.graph.operation`
- `editor.graph.preview`

Editor game-user beheer vereist een editor session met `editor_admin`.

Editor graph draft, operation en preview vereisen een editor session. Ze vereisen geen game session en accepteren geen game session als editorbewijs. State-changing graph operations en draft-preview POSTs blijven CSRF/Origin beschermd via de editor session flow.

## Fase 9 editor-only routes

Fase 9 world/minimap/UI display routes vereisen editor scope:

- `GET /editor/world/settings`;
- `POST /editor/world/validate`;
- `GET /editor/minimap/settings`;
- `POST /editor/minimap/validate`;
- `GET /editor/ui-display/assets`;
- `POST /editor/ui-display/validate`.

State-changing routes zijn CSRF/Origin beschermd. Anonymous/game sessions krijgen geen editor world/minimap/UI display beheer.

## Fase 10 publish-flow routes

Fase 10 publish-flow routes vereisen editor scope en `editor_admin`:

- `GET /editor/publish/status`;
- `POST /editor/publish/validate`;
- `POST /editor/publish/snapshots`;
- `GET /editor/publish/snapshots`;
- `GET /editor/publish/snapshots/:id`;
- `POST /editor/publish/rollback/validate`.

Regels:

- anonymous sessions krijgen 401/403 deny, niet 404 fallback;
- game sessions krijgen deny;
- editor sessions zonder `editor_admin` krijgen deny;
- state-changing publish routes vereisen CSRF/Origin bescherming;
- publish route responses zijn metadata/validation-only;
- routes voeren geen runtime publish uit;
- routes wijzigen geen assets;
- routes bevatten geen concrete gamecontent.

## Fase 11 runtime projection routes

Fase 11 editor/admin runtime projection routes vereisen editor scope en `editor_admin`:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Server-side groen bevestigd door Codex/Claude.

Regels:

- anonymous sessions krijgen 401/403 deny, niet 404 fallback;
- game sessions krijgen deny;
- editor sessions zonder `editor_admin` krijgen deny;
- state-changing projection routes vereisen CSRF/Origin bescherming;
- projection route responses zijn contract/read-model metadata-only;
- project action maakt geen automatic projection en geen renderer;
- routes wijzigen geen assets;
- routes bevatten geen concrete gamecontent.

Fase 11 runtime read-only routes:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Server-side groen bevestigd door Codex/Claude.

Regels:

- read-only;
- geen state-changing operatie;
- geen editor/admin secrets;
- geen raw editor draft leakage;
- geen raw unpublished candidate data;
- veilige empty state wanneer er nog geen projection bestaat;
- geen dummy content;
- geen renderer/game client.

## Fase 12 runtime client shell routes

Fase 12 game-web/runtime shell routes zijn shell/read-only routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Server-side validatie staat nog open.

Regels:

- runtime client shell gebruikt geen editor/admin routes;
- runtime client shell gebruikt geen editor credentials, CSRF token of editor session;
- runtime client shell consumeert alleen Fase 11 runtime projection read-only routes;
- runtime client shell toont geen raw editor draft/candidate data;
- runtime client shell voert geen state-changing request uit;
- runtime client shell uploadt, wijzigt of verwijdert geen assets;
- runtime client shell bevat geen secrets en geen concrete gamecontent;
- runtime client shell bouwt geen renderer, gameplay, movement, combat, HUD/minimap runtime of audio playback.

## Live auth smoke runbook

Gebruik `docs/ops/server-verification-runbook.md` voor live auth- en route-smokes. Echte editor login via `POST /auth/editor/login` is de voorkeursroute voor live serververificatie, gevolgd door `GET /auth/editor/me` met de editor session cookie.

Browser-smokes gebruiken server-only credentials uit `/etc/gk/secrets/initial-editor-admin.env` en optioneel `/etc/gk/secrets/smoke-users.env`. Git documenteert alleen deze paden en variabelenamen:

- `GK_INITIAL_EDITOR_ADMIN_EMAIL`;
- `GK_INITIAL_EDITOR_ADMIN_TEMP_PASSWORD`;
- `GK_SMOKE_EDITOR_EMAIL`;
- `GK_SMOKE_EDITOR_PASSWORD`;
- `GK_SMOKE_GAME_EMAIL`;
- `GK_SMOKE_GAME_PASSWORD`.

Smoke headers of speciale testheaders mogen alleen worden gebruikt waar ze expliciet geactiveerd zijn en alleen voor deny/contract-smokes. Live verificatie mag niet afhankelijk worden van test-hacks. Secret values mogen nooit worden geprint, in rapporten geplakt, in screenshots/traces zichtbaar zijn of naar Git geschreven.

Game browser-smoke mag alleen met een bestaande smoke user inloggen wanneer die server-side veilig is voorbereid. De Fase 12 runtime shell smoke mag ook zonder game login draaien wanneer `GK_GAME_WEB_ORIGIN` of `GK_GAME_FRONT_DOOR_URL` naar de shellroute wijst. De smoke mag geen account aanmaken, geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.

## Registration and verification

Game registratie is publiek open. Nieuwe game users starten als `pending_verification`. Volledige gamefuncties mogen pas beschikbaar komen nadat e-mailverificatie de user naar een toegestane actieve status brengt.

Editorregistratie is niet publiek. Editor users worden later alleen door een editor admin aangemaakt.

De eerste editor admin gebruikt Kevin-bevestigde e-mail `k3v1nc0@hotmail.com`, maar seed password/hash/secret mogen alleen buiten Git worden gezet.

## Password and token policy

De auth contracts volgen deze regels:

- minimaal 15 tekens;
- minimaal 64 tekens maximale lengte ondersteunen;
- spaties/passphrases toestaan;
- geen verplichte hoofdletter/cijfer/special-character-regels;
- geen periodieke verplichte wachtwoordwissel;
- blocklist-hook voor veelgebruikte, zwakke of gecompromitteerde wachtwoorden;
- wachtwoorden nooit plain-text opslaan;
- password reset via random expiring token;
- reset- en verificatietokens alleen hashed opslaan;
- token maar een keer bruikbaar;
- geen security questions.

Hash-algoritme en parameters worden server-side door Codex gekozen en in buiten-Git runtimeconfig vastgelegd.

## Sessions

Sessies:

- roteren na login;
- worden ingetrokken bij logout;
- worden ingetrokken of ongeldig gemaakt bij password reset;
- bewaren alleen token hashes;
- zijn scope-gebonden;
- gebruiken HttpOnly/Secure/SameSite cookies als cookies worden gebruikt;
- vereisen TLS voor login en authenticated pages.

Fase 5.3 implementeert de eerste echte editor-session browserflow:

- `POST /auth/editor/login` controleert `editor_users` en gekoppelde `editor_roles`;
- alleen actieve en e-mail-geverifieerde editor admins kunnen de editor shell openen;
- login geeft een generieke `invalid_credentials` response bij mislukking, zonder account-enumeratie;
- session tokens worden random gegenereerd en alleen als SHA-256 hash in `sessions.session_token_hash` opgeslagen;
- de browser krijgt een `gk_editor_session` cookie met `HttpOnly` en `SameSite=Strict`;
- `Secure` wordt gebruikt wanneer HTTPS/forwarded HTTPS of runtime-env dit afdwingt;
- `gk_csrf` wordt als aparte CSRF-cookie gezet voor state-changing editor requests;
- `POST /auth/editor/logout` trekt de editor session in;
- game-session cookies tellen niet als editor session.

## Audit

Audit logt minimaal:

- editor login;
- admin seed;
- user status changes;
- role changes;
- password reset request/complete;
- failed login throttling events;
- game-user beheeracties door editor admin;
- publish validation;
- publish snapshot metadata creation;
- publish rollback validation;
- runtime projection validation;
- runtime projection manifest metadata creation;
- runtime projection read-model access;
- runtime client shell status/read-model access.

Audit bevat actor, action, target, scope, timestamp en metadata. Fase 10 audit/event contracts bevatten geen concrete runtimecontent en publiceren niets naar Runtime Game. Fase 11 audit/event contracts bevatten geen concrete gamecontent, muteren geen assets en bouwen geen renderer. Fase 12 client shell status bevat geen secrets, geen editor draft data en geen concrete gamecontent.

## Server-side validatie

Codex heeft de Fase 4 database/auth-validatie buiten Git afgerond.

Fase 5.3 is server-side gevalideerd: normale browser-login, `/auth/editor/me`, logout en GameBibleNode browser-save werken met de echte serverdatabase. Publieke save, legacy PHP write en save na logout blijven dicht.

Fase 9 is server-side gevalideerd voor editor world/minimap/UI display auth-deny en route smokes.

Fase 10 is server-side gevalideerd voor publish route smokes, auth-deny smokes en CSRF/Origin smokes.

Fase 11 is server-side gevalideerd voor runtime projection route smokes, runtime read-only smokes, auth-deny smokes, CSRF/Origin smokes, Runtime Projection panel smoke, GameBible protection, no-runtime-renderer, no-game-client, no-runtime-gameplay, no-asset-mutation en no hardcoded content. Browser smoke en ops/docs-hardening staan op `main`; editor browser-smoke is groen en game browser-smoke mag `skipped` blijven totdat game front door/login expliciet wordt geopend.

Fase 12 Runtime Client Shell Core Git-basis is voorbereid. Server-side validatie staat nog open.

## Open aandachtspunt

GK gebruikt structureel Node 22 onder `/opt/gk/node-v22`. `/usr/bin/node` is serverbreed bewust op `v18.19.1` blijven staan en is geen GK-blocker zolang GK-services en checks via `/opt/gk/node-v22` lopen.
