# Fase 12 - Runtime Client Shell Core

Fase 12 is door Kevin geopend.

Git-basis: voorbereid op `main`.

Server-side status: nog niet klaar. Codex/Claude moet build/typecheck/test/lint, live route smokes, browser smoke en docs final nog bevestigen voordat Fase 12 als afgerond mag worden gemarkeerd.

## Doel

Fase 12 maakt een veilige browser-runtime client shell die Fase 11 runtime projection read-only data kan ophalen en tonen als engine/runtime-status, manifest metadata, record metadata en empty-state UI.

De pipeline blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> latere Renderer / Gameplay / HUD / Audio fases
```

Fase 12 opent alleen de runtime client shell contractlaag. De runtime game renderer/client, gameplay, HUD/minimap runtime en audio playback zijn nog niet geopend.

## Vaste grenzen

Niet toegestaan in Fase 12:

- concrete gamecontent toevoegen;
- dummy world, NPCs, quests, economy, assets of UI layout toevoegen;
- assets toevoegen, wijzigen, verwijderen of kopieren;
- GLB role mapping definitief maken;
- hardcoded world/camera/light/minimap/HUD/audio/NPC/quest/economy values toevoegen;
- combat, movement, player gameplay of gameplay runtime bouwen;
- volledige 3D renderer bouwen;
- audio playback runtime bouwen;
- HUD/minimap runtime layout hardcoden;
- automatic publish of automatic projection;
- editor draft/candidate data direct in runtime tonen;
- Fase 13 voorbereiden of openen.

## Toegevoegde Git-basis

### Runtime client shell contracts

Toegevoegd:

- `RuntimeClientShellStatus`;
- `RuntimeClientBootState`;
- `RuntimeClientProjectionState`;
- `RuntimeClientErrorState`;
- `RuntimeClientCapabilities`;
- `RuntimeClientSafetyFlags`.

Safety flags bewaken expliciet:

- `consumesRuntimeProjection=true`;
- `usesEditorDraftData=false`;
- `implements3DRenderer=false`;
- `implementsGameplay=false`;
- `implementsCombat=false`;
- `implementsMovement=false`;
- `implementsAudioPlayback=false`;
- `hardcodesContent=false`;
- `mutatesAssets=false`.

### Runtime client validation gates

Toegevoegd voor:

- runtime projection read-only route discipline;
- no editor/admin routes;
- no editor draft leakage;
- no renderer/gameplay;
- no audio playback;
- no asset mutation;
- no hardcoded content;
- safe empty state;
- safety flags.

### Runtime shell/app routes

Toegevoegd in `apps/game-web`:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

De shell toont alleen:

- runtime client shell marker;
- projection status area;
- manifest empty-state area;
- records empty-state area;
- error area;
- read-only projection route summary;
- fase/status metadata.

### Runtime projection fetch client

De client mag alleen deze read-only routes gebruiken:

- `/runtime/projection/status`;
- `/runtime/projection/manifest`;
- `/runtime/projection/records`.

De fetch client gebruikt geen editor/admin endpoints, geen frontend secrets en geen data mutatie.

### Node/socket contracts

Toegevoegd:

- `runtime.client.shell.reference`;
- `runtime.client.boot-state.reference`;
- `runtime.client.projection-state.reference`;
- `runtime.client.safety.reference`.

Toegevoegde node types:

- `gk.runtimeClient.shell`;
- `gk.runtimeClient.bootState`;
- `gk.runtimeClient.projectionState`;
- `gk.runtimeClient.safetyFlags`.

Deze nodes hebben scope `runtime-consumer`, consumeren runtime projection metadata en maken geen concrete gamecontent.

### Browser smoke uitbreiding

`tests/smoke/browser-smoke.mjs` ondersteunt nu runtime shell checks.

Game/browser smoke:

- gebruikt `GK_GAME_FRONT_DOOR_URL` als die is gezet;
- anders gebruikt `GK_GAME_WEB_ORIGIN` plus `GK_GAME_SHELL_PATH`, default `/game/`;
- skipt netjes wanneer geen game front door/origin bestaat;
- checkt `data-runtime-client-shell="phase-12"` wanneer de runtime shell route beschikbaar is;
- checkt projection status en empty-state markers;
- forceert geen game login als game auth nog niet open is;
- voert geen gameplay in en muteert geen content.

## Tests

Toegevoegd testcontract voor:

- schema exports bestaan;
- runtime client sockets/nodes zijn geregistreerd;
- runtime client safety flags staan goed;
- editor/admin routes worden afgewezen;
- no editor draft leakage;
- no 3D renderer/gameplay/movement/combat/audio playback;
- no asset mutation/copy;
- no hardcoded content;
- projection fetch client gebruikt alleen runtime read-only routes;
- runtime shell UI toont veilige empty state;
- game-web routes leveren shell HTML en shell JSON;
- browser-smoke kan runtime shell checken of netjes skippen.

## Open Codex/Claude-taken

Nog server-side valideren:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- `gk-api` en relevante webservice restart volgens server-layout;
- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game` indien de game-web service wordt gestart;
- browser-smoke met runtime shell marker wanneer `GK_GAME_WEB_ORIGIN` of `GK_GAME_FRONT_DOOR_URL` is gezet;
- bevestigen dat runtime client geen editor/admin routes gebruikt;
- bevestigen dat geen runtime renderer, gameplay, movement, combat, audio playback, hardcoded content of assetmutatie plaatsvindt.

## Checklist

- [x] Runtime client shell schemas/contracts toegevoegd.
- [x] Runtime client validation gates toegevoegd.
- [x] Runtime client sockets/nodes toegevoegd.
- [x] Runtime shell/app routes toegevoegd.
- [x] Projection fetch/read-only client toegevoegd.
- [x] Runtime empty-state UI toegevoegd.
- [x] Browser-smoke runtime shell hook toegevoegd.
- [x] Tests toegevoegd.
- [x] Docs bijgewerkt.
- [x] Geen assets gewijzigd.
- [x] Geen concrete gamecontent toegevoegd.
- [x] Geen 3D renderer/gameplay/movement/combat/audio playback gebouwd.
- [x] Geen hardcoded world/camera/light/minimap/HUD/audio values toegevoegd.
- [x] Runtime client gebruikt geen editor/admin routes.
- [ ] Server-side build/typecheck/test/lint bevestigd.
- [ ] Live route smokes bevestigd.
- [ ] Browser smoke bevestigd.
- [ ] Docs final bevestigd.

## Fasebeoordeling

Fase 12 Git-basis is voorbereid.

Fase 12 is server-side nog niet klaar. Markeer Fase 12 pas als afgerond nadat Codex/Claude de open checks, live smokes, browser smoke en docs final bevestigt.

Geen Fase 13 voorbereiden of openen vanuit deze fase.
