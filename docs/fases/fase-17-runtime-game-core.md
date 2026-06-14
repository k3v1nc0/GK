# Fase 17 - Runtime Game Core

## Status

Gepland. Deze fase mag pas geopend worden nadat Fase 16 Fundering en herbaseline klaar is en Fase 15 server-side groen blijft.

## Bronbasis

Deze fase volgt uit het repo-contract waarin de keten eindigt met `Runtime Game`, terwijl Fase 15 expliciet geen asset loader, renderer, gameplay, movement, combat of audio playback is.

Professionele toets: server-authoritative multiplayer en latere room-state blijven later; deze fase bouwt eerst een reproduceerbaar runtimepad uit published data.

## Echt doel

Bouw de eerste echte `Runtime Game Core`: een runtime die uitsluitend published/read-model-data leest en daar een startbare game-shell uit maakt.

## Waarom nu

Zonder deze laag blijft GK technisch sterk maar niet speelbaar. De bestaande lagen zijn metadata-, projection-, shell-, surface-, scene-assembly- en asset-reference-planninglagen. Deze fase zet published data voor het eerst om naar een runtimepad dat een speler kan starten.

## Scope

- Published build loader.
- Runtime manifest reader.
- Asset reference resolver als contractlaag, nog zonder definitive role mapping buiten toegestane published data.
- World bootstrap vanuit published read models.
- Player session bootstrap.
- Input adapter.
- Camera/HUD/audio adapterpunten als engine-capabilities.
- Save/load basis voor runtime state.
- Diagnostics wanneer required published data ontbreekt.

## Niet in scope

- Questinhoud.
- Combat.
- Economy.
- Multiplayer.
- Concrete zone-layout hard-coden.
- Dummy world, dummy NPC, dummy quest of fallback model.
- Draft/editordata direct in runtime lezen.

## Verplichte gates

- Runtime leest geen editor/admin routes.
- Runtime leest geen draft/candidate data.
- Concrete gamewaarden komen uit published data, GameBible/registers of expliciete editorinput.
- Asset loading mag alleen volgens het contract dat deze fase expliciet toevoegt; geen verborgen byte fetches.
- Engine-capabilities worden gescheiden van concrete content.

## Deliverables

- Runtime Game Core architectuurdocument of bestaande doc-update.
- Published build/read-model contract voor runtime boot.
- Runtime bootstrapper.
- Runtime diagnostics voor missende published data.
- Smoke-test: boot zonder editor aanwezig.

## Acceptatie

- Runtime kan starten vanuit alleen published data.
- Geen hard-coded world/camera/light/HUD/minimap/audio/contentwaarden.
- Save/load basis werkt of ontbreekt expliciet als blocker.
- Fouten door ontbrekende data zijn zichtbaar en blokkeren veilig.
- Geen quest/combat/economy/multiplayer is per ongeluk gebouwd.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder mode. Werk GitHub-only op main en gebruik de actuele repository als waarheid.

DOEL
Bouw Fase 17 - Runtime Game Core. Maak de ontbrekende runtime-uitvoerlaag die published/read-model-data kan booten zonder editor of draftdata.

VERPLICHTE BRONNEN
- docs/fases/fase-16-fundering-en-herbaseline.md
- README/current-phase.md
- docs/design/phase-plan/current-phase.md
- README/fase15.md
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md
- relevante packages/apps voor publish, projection, game-web, schemas en node-types

WERKWIJZE
1. Controleer eerst dat Fase 16 klaar is en Fase 15 server-side groen blijft.
2. Lokaliseer bestaande runtime client shell, render surface, scene assembly en asset reference planning.
3. Ontwerp de smalste Runtime Game Core bovenop published data.
4. Houd editor/draft en runtime strikt gescheiden.
5. Voeg geen concrete gamecontent toe.
6. Voeg tests en diagnostics toe voor no-draft, no-admin-route en no-hardcoded-content boundaries.

ACCEPTATIE
- Runtime boot uit published data.
- Geen draft/editor route usage.
- Geen hard-coded contentwaarden.
- Geen quest/combat/economy/multiplayer buiten expliciete adapterpunten.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 17 - Runtime Game Core.

CONTROLEER
- pnpm build
- pnpm typecheck
- pnpm test
- pnpm lint
- runtime/game route-smokes
- browser-smoke voor game-web
- published-only bootpad
- no editor/admin route usage
- no draft leakage
- no hardcoded world/camera/light/HUD/minimap/audio/content values
- save/load basis of expliciete blocker

NIET DOEN
- Geen ontbrekende Kevin-content invullen.
- Geen dummy assets toevoegen.
- Geen quest/combat/economy/multiplayer accepteren als onderdeel van deze fase.

RAPPORTEER
- groene checks;
- falende checks;
- runtime boot bewijs;
- resterende blockers voor de quest/dialoogslice.
```
