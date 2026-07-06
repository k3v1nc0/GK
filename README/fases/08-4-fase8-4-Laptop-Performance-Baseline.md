# Fase 8.4 - Laptop Performance Baseline & Runtime Budget Repair

## Waarom deze fase bestaat

Fase 8.3 loste de ground streaming root-cause op, maar dat betekende niet automatisch dat `/game/` op een oudere laptop soepel is. Deze fase is daarom geen terrain-fase en ook geen nieuwe chunk-feature-fase. Het is een meet- en budgetfase: eerst bewijzen waar de tijd heen gaat, daarna pas verder optimaliseren.

## Wat deze fase moet bewijzen

- `frameMs` betekent hoe lang een frame duurt. Lager is beter.
- `FPS` betekent frames per seconde. Hoger is beter.
- `renderMs` is de render/GPU-kant.
- `syncChunkMs` is chunk culling en bookkeeping.
- `updatePlayerMs` is movement en collision.
- `hudMs` is Performance HUD DOM-werk.
- `animationMs` is model-, water- en surface-animatie.

Als een Puppeteer-run `frameMs < 3ms` laat zien, dan is dat juist snel. Als Kevin eigenlijk `FPS < 3` bedoelde, dan is dat extreem traag. De benchmark moet dus beide goed uitleggen.

## Scenario matrix

Gebruik de browserprofiler in minimaal deze scenarios:

- `baseline-current`
- `hud-off`
- `chunk-debug-off`
- `shadows-off`
- `low-pixel-ratio`
- `chunks-off`
- `laptop-profile`
- `software-renderer-check`

Als Puppeteer/headless een software renderer gebruikt, dan zijn de absolute cijfers niet representatief voor Kevins echte GPU. De matrix blijft dan nog wel bruikbaar om relatieve verschillen te zien.

## Nieuwe runtime controls

In `World Settings` is een nieuw veld toegevoegd:

- `gamePerformanceProfile`: `quality` | `balanced` | `laptop` | `potato`

Gedrag:

- `quality`: hoogste kwaliteit, shadows toegestaan, hoge pixel ratio cap.
- `balanced`: gemengde standaard voor normale pc's.
- `laptop`: lagere pixel ratio, shadows budgetter, debug overlay standaard uit.
- `potato`: zo licht mogelijk, shadows uit, animatiebudget omlaag.

Daarnaast blijft de bestaande shadow policy leidend, maar game mode krijgt nu een profiellaag erbovenop.

## Runtime budget repair

De runtime is zo aangepast dat de dure stukken niet meer per frame full-cost draaien:

- `syncChunkDebugState("frame")` doet alleen zware culling als signature of registry echt veranderd is.
- Performance HUD updates alleen als er een HUD node bestaat.
- Chunk debug overlay rebuildt niet zonder signature-change.
- Shadows krijgen profile-based kwaliteit en map sizes.
- Static en scatter batching blijven chunk-compatible.
- Collision bookkeeping houdt `activeSolids` en resolve-kosten apart bij.

## Console command

Gebruik in de browserconsole:

```js
window.__GK_GAME_RUNTIME.profilePerformance({
  frames: 120,
  warmupFrames: 60,
  label: "baseline-current"
})
```

Als je laptop mode wilt testen via de browser, gebruik de query override:

```text
/game/?gamePerformanceProfile=laptop
```

## Wat goed of fout is

Goed:

- `frameMs` daalt als shadows, HUD of debug overlay uitgaan.
- `syncChunkMs` blijft laag zolang je binnen dezelfde chunk blijft.
- `hudMs` is praktisch nul als er geen Performance HUD node is.
- `renderMs` daalt zichtbaar als shadows of pixel ratio de bottleneck waren.

Fout:

- `chunks-off` als eindoplossing gebruiken.
- terrain/path/water/surface wegslopen om performance te winnen.
- de game onbedoeld afhankelijk maken van een browser/headless software renderer.

## Kevin check

Kevin kan de profielen kiezen in `World Settings` en daarna opnieuw publiceren. De meest bruikbare check is:

1. Zet `gamePerformanceProfile` op `laptop`.
2. Publiceer de wereld.
3. Open `/game/` of draai `npm run perf:game`.
4. Controleer dat `renderMs`, `syncChunkMs`, `drawCalls` en `textures` dalen ten opzichte van baseline.

## Rest-risico en volgende fase

Als `/game/` op Kevins laptop nog steeds traag voelt na deze budgetrepair, dan is de logische volgende fase:

- verder render-budget trimmen per asset type;
- GPU-zwaardere materialen of shadows verder reduceren;
- camera- en movement-path costs apart profileren;
- eventuele asset-specifieke hot spots isoleren.
