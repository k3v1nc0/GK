# Current Phase

Actieve status: Fase 12.1 Game Web Service Deployment Core is afgerond en server-side groen bevestigd.

Fase 1 t/m Fase 12.1 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Fase 13 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/fase10.md`
- `README/fase11.md`
- `README/fase12.md`
- `README/fase12.1.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `docs/ops/server-verification-runbook.md`
- `ops/systemd/gk-game-web.service`
- `README/GameBibleNode.json`

## Fase 12.1 resultaat

Fase 12.1 heeft de vaste deployment/service-basis voor `apps/game-web` server-side bevestigd. De Fase 12 runtime client shell draait nu als vaste `gk-game-web` systemd service en hoeft niet meer tijdelijk via een handmatige Node 22 game-shell op `127.0.0.1:3003` te worden gestart.

Bevestigd server-side:

- `gk-game-web` live unit staat in `/etc/systemd/system/gk-game-web.service`;
- `gk-game-web` draait als `gk:gk`;
- `gk-game-web` draait via `/opt/gk/node-v22/bin/node`;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- `gk-game-web` active/enabled: OK;
- Apache front-door `gk-k3v1nc0.duckdns.org` proxyt `/game/`, `/health/game` en `/runtime/projection/` naar `127.0.0.1:3003`;
- Apache configtest: OK;
- Apache reload: OK;
- `/etc/gk/gk.env` is server-side buiten Git aangevuld met niet-secret game-web waarden;
- local route smokes voor `/health/game`, `/game/shell.json`, `/runtime/projection/status`, `/runtime/projection/manifest` en `/runtime/projection/records`: OK;
- front-door GET-checks voor `/game/`, `/game/shell.json` en `/runtime/projection/status`: OK;
- `pnpm smoke:browser:game` met `GK_GAME_WEB_ORIGIN=http://127.0.0.1:3003`: OK;
- `pnpm smoke:browser:editor`: OK;
- `pnpm smoke:browser`: OK;
- game-smoke is groen en niet meer skipped;
- worktree schoon: OK;
- blockers: geen.

## Fase 12.1 grenzen

Niet toegevoegd of gewijzigd:

- geen runtime renderer;
- geen gameplay, movement, combat of player runtime;
- geen audio playback;
- geen HUD/minimap runtime layout;
- geen concrete gamecontent;
- geen dummy world, NPC, quest of economy;
- geen hardcoded world/camera/light/minimap/HUD/audio values;
- geen assetmutatie;
- geen secrets in Git;
- geen artifacts naar Git;
- geen Fase 13 implementatie.

De keten blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> Game Web Service Deployment Core
  -> latere Renderer / Gameplay / HUD / Audio fases
```

## Fasebeoordeling

Fase 12.1 Game Web Service Deployment Core is afgerond en server-side klaar.

Fase 13 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.
