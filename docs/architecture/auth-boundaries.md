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

- `editor.login`;
- `editor.logout`;
- `editor.me`;
- `game.register`;
- `game.login`;
- `game.logout`;
- `game.me`;
- `email_verification.request`;
- `email_verification.confirm`;
- `password_reset.request`;
- `password_reset.confirm`;
- `editor.game_users.list`;
- `editor.game_users.status_update`;
- `editor.graph.draft`;
- `editor.graph.operation`;
- `editor.graph.preview`.

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

Server-side groen bevestigd door Codex/Claude.

Regels:

- runtime client shell gebruikt geen editor/admin routes;
- runtime client shell gebruikt geen editor credentials, CSRF token of editor session;
- runtime client shell consumeert alleen Fase 11 runtime projection read-only routes;
- runtime client shell toont geen raw editor draft/candidate data;
- runtime client shell voert geen state-changing request uit;
- runtime client shell uploadt, wijzigt of verwijdert geen assets;
- runtime client shell bevat geen secrets en geen concrete gamecontent;
- runtime client shell bouwt geen renderer, gameplay, movement, combat, HUD/minimap runtime of audio playback.

## Fase 12.1 game-web service boundary

Fase 12.1 is server-side groen bevestigd.

Regels:

- `gk-game-web` is een vaste active/enabled service;
- `gk-game-web` draait via Node 22;
- Apache routeert `/game/`, `/health/game` en `/runtime/projection/` naar `127.0.0.1:3003`;
- game browser-smoke is groen en niet meer skipped;
- Fase 12.1 verandert de auth-contracten niet en voegt geen game login requirement toe.

## Fase 13 runtime render surface boundary

Fase 13 Runtime Render Surface Core Git-basis is toegevoegd. Server-side validatie staat nog open.

Regels:

- runtime render surface gebruikt geen editor/admin routes;
- runtime render surface gebruikt geen editor credentials, CSRF token of editor session;
- runtime render surface consumeert alleen runtime projection metadata/read-only state;
- runtime render surface toont geen raw editor draft/candidate data;
- runtime render surface voert geen state-changing request uit;
- runtime render surface uploadt, laadt, wijzigt of verwijdert geen assets;
- runtime render surface bevat geen secrets en geen concrete gamecontent;
- runtime render surface bouwt geen volledige renderer, scene assembly, gameplay, movement, combat, HUD/minimap runtime of audio playback;
- browser-smoke moet render surface marker en safe empty state bevestigen zonder editor/admin route leakage.

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

Game browser-smoke mag alleen met een bestaande smoke user inloggen wanneer die server-side veilig is voorbereid. De Fase 12 runtime shell en Fase 13 render surface smoke mogen ook zonder game login draaien wanneer `GK_GAME_WEB_ORIGIN` of `GK_GAME_FRONT_DOOR_URL` naar de shellroute wijst. De smoke mag geen account aanmaken, geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.

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

Fase 5.3 implementeert de eerste echte editor-session browserflow. Game-session cookies tellen niet als editor session.

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
- runtime client shell status/read-model access;
- runtime render surface status/capability access.

Audit bevat actor, action, target, scope, timestamp en metadata. Fase 13 render surface status bevat geen secrets, geen editor draft data en geen concrete gamecontent.

## Server-side validatie

Codex heeft Fase 4 t/m Fase 12.1 server-side afgerond waar van toepassing. Fase 13 server-side validatie staat nog open.

Open voor Fase 13:

- build/typecheck/test/lint;
- live route-smokes;
- browser-smoke game/full;
- render surface marker en safe empty state;
- no editor/admin route usage;
- no asset load requests;
- no concrete gamecontent;
- no gameplay/audio playback;
- worktree schoon.

## Open aandachtspunt

GK gebruikt structureel Node 22 onder `/opt/gk/node-v22`. `/usr/bin/node` is serverbreed bewust op `v18.19.1` blijven staan en is geen GK-blocker zolang GK-services en checks via `/opt/gk/node-v22` lopen.
