# Current Phase

## Fase

Actieve status: Fase 12.1 Game Web Service Deployment Core is afgerond en server-side groen bevestigd.

Fase 1 t/m Fase 12.1 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Fase 13 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.

## Statussamenvatting

Fase 12.1 heeft de vaste deployment/service-basis voor `apps/game-web` server-side afgerond. De Fase 12 runtime client shell draait nu als vaste `gk-game-web` systemd service via Node 22, achter Apache front-door routing.

De tijdelijke handmatige Node 22 game-shell is niet meer nodig. Game browser-smoke is groen en niet meer skipped.

Deze fase heeft geen concrete gamecontent, geen dummy world, geen assets, geen renderer, geen movement/combat/player gameplay, geen HUD/minimap runtime layout en geen audio playback toegevoegd.

## Afgeronde basis

Fase 10 Publish Flow Core is server-side afgerond en klaar. Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core is server-side afgerond en klaar. Laatste Fase 11 docs-final commit: `2a2b779afe3a3a2f28466fa7a49f0be45d12ee17` (`fase 11 fix`). Browser smoke en ops/docs-hardening staan op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36`.

Fase 12 Runtime Client Shell Core is server-side afgerond en klaar. Server-side fix commit: `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Docs-final/fix commit: `199df8642cfa6f20ce518742a0ea0e35ec5fb2fe` (`fase 12 fix`).

Fase 12.1 Game Web Service Deployment Core is server-side afgerond en klaar. Server-side bevestigde Git HEAD: `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Asset refresh na `Assets - new` blijft bevestigd:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

## Fase 12.1 Git-basis

Toegevoegd of bijgewerkt in de Git-basis:

- `ops/systemd/gk-game-web.service` als Git-template voor de vaste game-web service;
- `README/fase12.1.md` als fasecontract;
- `docs/ops/server-layout.md` voor de `gk-game-web` deploymentstatus;
- `docs/ops/server-verification-runbook.md` voor vaste Fase 12.1 servicechecks;
- current-phase docs.

Systemd template contract:

- `Description=GK Game Web`;
- `WorkingDirectory=/var/www/gk`;
- `EnvironmentFile=/etc/gk/gk.env`;
- `Environment=GK_GAME_PORT=3003`;
- `Environment=GK_GAME_HOST=127.0.0.1`;
- `ExecStart=/opt/gk/node-v22/bin/node /var/www/gk/apps/game-web/dist/index.js`;
- `Restart=on-failure`;
- geen secrets;
- geen inline concrete gamecontent.

Server-side is bevestigd dat de live unit in `/etc/systemd/system/gk-game-web.service` is geinstalleerd en als `gk:gk` draait.

## Runtime shell/API status

Bestaande Fase 12 runtime client shell routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Runtime projection read-only routes die de shell mag consumeren:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Fase 12.1 heeft deze routes niet veranderd. Fase 12.1 heeft de vaste service-installatie en Apache/front-door route server-side bevestigd.

## Env en smoke contract

Server-only env is buiten Git aangevuld met niet-secret waarden:

- `GK_GAME_PORT=3003`;
- `GK_GAME_HOST=127.0.0.1`;
- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- `GK_GAME_FRONT_DOOR_URL=https://gk-k3v1nc0.duckdns.org/game/`.

Regels blijven:

- env-bestandinhoud niet naar Git committen;
- credentials of secret values niet printen;
- `/etc/gk/gk.env` inhoud niet in Git opnemen.

## Apache/front-door status

Apache blijft actieve hoofdwebserver. Nginx blijft candidate/inactive.

Server-side bevestigd:

- Apache front-door `gk-k3v1nc0.duckdns.org` proxyt `/game/` naar `127.0.0.1:3003`;
- Apache front-door proxyt `/health/game` naar `127.0.0.1:3003`;
- Apache front-door proxyt `/runtime/projection/` naar `127.0.0.1:3003`;
- Apache configtest: OK;
- Apache reload: OK.

Geen Nginx live activatie en geen poort 80/443 migratie uitgevoerd.

## Contractgrenzen

Fase 12.1 bouwt niet:

- 3D renderer;
- runtime gameplay;
- movement;
- combat;
- player controller;
- HUD runtime layout;
- minimap runtime layout;
- audio playback;
- concrete world, zone, NPC, quest, economy, camera, lighting, minimap, HUD of audio content;
- definitieve GLB role mapping;
- automatic publish of automatic projection.

Fase 13 is nog niet geimplementeerd.

## Server-side checks

Codex/Claude heeft bevestigd:

- `gk-game-web` live unit geinstalleerd in `/etc/systemd/system/gk-game-web.service`: OK;
- `gk-game-web` draait als `gk:gk`: OK;
- `gk-game-web` draait via `/opt/gk/node-v22/bin/node`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- `gk-game-web` active/enabled: OK;
- Apache front-door route voor `/game/`: OK;
- Apache front-door route voor `/health/game`: OK;
- Apache front-door route voor `/runtime/projection/`: OK;
- Apache configtest: OK;
- Apache reload: OK;
- local route smoke `/health/game`: OK;
- local route smoke `/game/shell.json`: OK;
- local route smoke `/runtime/projection/status`: OK;
- local route smoke `/runtime/projection/manifest`: OK;
- local route smoke `/runtime/projection/records`: OK;
- front-door GET `/game/`: OK;
- front-door GET `/game/shell.json`: OK;
- front-door GET `/runtime/projection/status`: OK;
- `pnpm smoke:browser:game` met `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`: OK;
- `pnpm smoke:browser:editor`: OK;
- `pnpm smoke:browser`: OK;
- game-smoke niet skipped: OK;
- geen secrets geprint: OK;
- geen artifacts naar Git: OK;
- geen repo-bestanden gewijzigd achtergelaten: OK;
- worktree schoon: OK;
- geen runtime renderer/gameplay/movement/combat/audio playback: OK;
- geen concrete gamecontent: OK;
- geen hardcoded HUD/minimap/world/camera/light/audio values: OK;
- geen assetmutatie: OK;
- geen Fase 13 implementatie: OK;
- blockers: geen.

## Fasebeoordeling

Fase 12.1 Game Web Service Deployment Core is afgerond en server-side klaar.

Fase 13 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.
