# Acceptance Result

NODE-01 hard correction evidence:

- Normal publish route is `World Assembly.gameProject -> Game Output.gameProject`.
- Old direct Game Output ports are hidden/internal/deprecated and server-blocked for normal authoring.
- `Legacy World Adapter` is hidden/system/internal and not a normal library node.
- Migration is applied and idempotent for the current graph.
- Specialized Groups are visible as one-click library entries.
- Ports render readable type labels in the editor.
- Invalid direct Game Output connection returns a specific explanation.
- Proof chain publishes and renders: `Game Project Settings.gameName -> HUD Text @{global.game_name} -> UI Output -> World Assembly -> Game Output.gameProject -> /api/game/world -> /game/`.

Verification:

- `npm test` passed.
- `npm run check` passed.
- Browser evidence captured in this folder.
