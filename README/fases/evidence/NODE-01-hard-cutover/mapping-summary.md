# Mapping Summary

- Project/world identity: Game Project Settings -> World Assembly.projectSettings.
- Chunk sizing: Chunk Grid Definition -> World Assembly.chunkGrid with 14 x 14 and maxLoadedChunks 81.
- Catalog/zone/campaign/player/ui packages: specialized Groups plus registry/output nodes -> World Assembly.
- UI token proof: HUD Text -> UI Output -> World Assembly.ui -> Game Output.gameProject -> published gameProject.
- Legacy direct Game Output edges: none remain in the live graph. Existing compatibility is hidden/internal only.
- Runtime read compatibility: published top-level world fields remain for /game/ while gameProject is the authoritative NODE-01 manifest.
