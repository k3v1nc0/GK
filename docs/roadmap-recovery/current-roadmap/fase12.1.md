# Fase 12.1 - Game Web Service Deployment Core

Fase 12.1 is afgerond en server-side groen bevestigd.

Git-basis: voorbereid op `main` via commit `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Server-side status: klaar. Codex/Claude heeft de vaste `gk-game-web` service geinstalleerd, geactiveerd en geverifieerd. Er zijn geen repo-wijzigingen achtergelaten en de server-side worktree was schoon.

Fase 12 Runtime Client Shell Core blijft afgerond en server-side groen bevestigd. Fase 13 is nog niet geopend en niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.

## Doel

Fase 12.1 maakt de deployment/service-basis voor `apps/game-web`, zodat de Fase 12 runtime client shell niet langer via een tijdelijke handmatige Node 22 start hoeft te worden geverifieerd.

De pipeline blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> Game Web Service Deployment Core
  -> latere Renderer / Gameplay / HUD / Audio fases
```

Fase 12.1 rondt alleen de vaste service- en verificatielaag voor de bestaande game-web shell af. Deze fase bouwt geen renderer, gameplay, HUD/minimap runtime of audio playback.

## Vaste grenzen

Niet toegestaan en niet toegevoegd in Fase 12.1:

- Fase 13 openen of implementeren;
- nieuwe runtime/game features bouwen;
- 3D renderer bouwen;
- gameplay, movement, combat of player runtime bouwen;
- audio playback bouwen;
- HUD/minimap runtime layout hardcoden;
- concrete gamecontent toevoegen;
- dummy world, NPC, quest, economy of content records toevoegen;
- assets toevoegen, wijzigen, verwijderen of kopieren;
- GLB role mapping definitief maken;
- hardcoded world/camera/light/minimap/HUD/audio values toevoegen;
- automatic publish of automatic projection;
- secrets, credentials of server-only env values naar Git schrijven.

Server-side bevestigd:

- geen runtime renderer/gameplay/movement/combat/audio playback toegevoegd;
- geen concrete gamecontent toegevoegd;
- geen hardcoded world/camera/light/minimap/HUD/audio values toegevoegd;
- geen assetmutatie;
- geen secrets geprint;
- geen artifacts naar Git;
- geen repo-bestanden gewijzigd door server-side verificatie;
- geen Fase 13 geimplementeerd.

## Toegevoegde Git-basis

Toegevoegd voor Fase 12.1:

- `ops/systemd/gk-game-web.service` als repo-template voor de vaste game-web service;
- server-verification runbook uitbreiding voor Fase 12.1 service-installatie, systemctl checks, local route smokes en browser-smokes;
- server-layout update voor de `gk-game-web` deploymenttaak;
- current-phase statusdocs voor Fase 12.1.

De Git-basis is server-side gebruikt om een echte vaste `gk-game-web` service te installeren en te verifieren.

## Systemd status

Template locatie in Git:

- `ops/systemd/gk-game-web.service`

Live server-unit:

- `/etc/systemd/system/gk-game-web.service`

Server-side bevestigd:

- `gk-game-web` is geinstalleerd als vaste systemd service;
- `gk-game-web` is `active` en `enabled`;
- `gk-game-web` draait als `gk:gk`;
- `gk-game-web` draait via `/opt/gk/node-v22/bin/node`;
- de tijdelijke handmatige Node 22 game-shell is niet meer nodig;
- `gk-api` is `active` en `enabled`;
- `gk-editor-web` is `active` en `enabled`.

## Env status

Server-only env is buiten Git aangevuld in `/etc/gk/gk.env` met niet-secret waarden:

- `GK_GAME_PORT=3003`;
- `GK_GAME_HOST=127.0.0.1`;
- `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- `GK_GAME_FRONT_DOOR_URL=https://gk-k3v1nc0.duckdns.org/game/`.

Regels blijven:

- geen env-bestandinhoud naar Git committen;
- geen credentials of secret values printen;
- geen fake public URL in Git vastleggen;
- geen `/etc/gk/gk.env` inhoud in repo-bestanden opnemen buiten de expliciet bevestigde niet-secret variabelenamen/waarden hierboven.

## Apache/front-door status

Apache blijft de actieve hoofdwebserver. Nginx blijft candidate/inactive.

Server-side bevestigd:

- Apache front-door `gk-k3v1nc0.duckdns.org` proxyt `/game/` naar `127.0.0.1:3003`;
- Apache front-door proxyt `/health/game` naar `127.0.0.1:3003`;
- Apache front-door proxyt `/runtime/projection/` naar `127.0.0.1:3003`;
- Apache configtest: OK;
- Apache reload: OK;
- geen Nginx live activatie;
- geen poort 80/443 migratie.

Front-door GET-checks groen bevestigd:

- `https://gk-k3v1nc0.duckdns.org/game/`;
- `https://gk-k3v1nc0.duckdns.org/game/shell.json`;
- `https://gk-k3v1nc0.duckdns.org/runtime/projection/status`.

## Route- en smoke-status

Local route smokes groen bevestigd:

- `GET http://127.0.0.1:3003/health/game`;
- `GET http://127.0.0.1:3003/game/shell.json`;
- `GET http://127.0.0.1:3003/runtime/projection/status`;
- `GET http://127.0.0.1:3003/runtime/projection/manifest`;
- `GET http://127.0.0.1:3003/runtime/projection/records`.

Browser-smokes groen bevestigd:

- `pnpm smoke:browser:game` met `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser`.

Game browser-smoke is groen en niet meer skipped.

## Checklist

- [x] Fase 12.1 geopend.
- [x] Systemd template toegevoegd.
- [x] Env/server-only regels gedocumenteerd.
- [x] Apache/front-door policy gedocumenteerd.
- [x] Server-verification runbook uitgebreid.
- [x] Server-layout bijgewerkt.
- [x] Current-phase docs bijgewerkt.
- [x] `gk-game-web` unit server-side geinstalleerd.
- [x] `gk-game-web` active/enabled bevestigd.
- [x] Node 22 process bevestigd.
- [x] Local game-web route smokes bevestigd.
- [x] Apache/front-door route bevestigd.
- [x] Browser-smoke game bevestigd.
- [x] Game browser-smoke niet meer skipped.
- [x] Geen runtime featurecode toegevoegd.
- [x] Geen tests/package-scripts gewijzigd voor deze docs-final update.
- [x] Geen assets gewijzigd.
- [x] Geen concrete gamecontent toegevoegd.
- [x] Geen secrets toegevoegd.
- [x] Fase 13 niet geopend en niet geimplementeerd.

## Fasebeoordeling

Fase 1 t/m Fase 12.1 zijn afgerond.

Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd. De vaste `gk-game-web` systemd service draait via Node 22 en Apache routeert de game front-door naar de service.

De tijdelijke handmatige Node 22 game-shell is niet meer nodig.

Fase 13 is nog niet geopend en niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.
