# Fase 7 - Auto asset/audio library uit jouw assets-map

## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- Alles draait eerst op 1 eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- GK Code Copiloot maakt geen branches en geen pull requests.
- Codex doet serverwerk buiten Git: OS, MySQL, Redis, Nginx, systemd, secrets, rechten, builds, runtime checks en lokale scans.
- Concrete gamecontent hoort niet in runtimecode.
- Alles wat Kevin maakt, speelt of instelt loopt via Database > Editor/Node-system > Publish > Runtime Game.
- De code mag alleen engine-capabilities bevatten: schemas, node types, validators, renderer/audio/protocol primitives en vaste socket types.
- Waardes zoals camera, licht, geld, prijzen, levels, NPC routes, NPC taken, dialogen, quests, minimap lagen, audio en HUD instellingen moeten node-data zijn.
- 3D wereldobjecten gebruiken bestaande of later door Kevin gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden ook via nodes gekozen en ingesteld.
- De AI mag geen dummy assets, nepmodellen, tijdelijke vervangers, definitieve namen of definitieve verhaalcontent verzinnen.
- Als verplichte Kevin-input mist, stopt de fase met een duidelijke lijst ontbrekende items.
- Maak geen losse backupbestanden, geen tijdelijke markdown-dumps en geen extra README-bestanden die niet blijvend onderhouden worden.

## Doel van de fase

Bouw asset-worker en editor bibliotheek die GLB, UI en audio assets automatisch kan scannen, registreren, tonen en bijwerken.

## Status

Fase 7 is server-side afgerond en klaar.

Claude heeft de Fase 7 asset library, scanner, editor API, editor panels, database migration en runtime smoke server-side gevalideerd op HEAD `0b4a0472870e4aa0fa09877a183aa1efa975340d` (`fase 7 - Claude`). Er zijn geen Fase 7-blockers open.

## Belangrijke grens

GLB-bestanden krijgen geen definitieve runtime-role door de scanner.

Toegestaan:

- generieke metadata registreren;
- kandidaat-capabilities tonen;
- role mapping status als `candidate` markeren;
- role mapping later via editor-data laten kiezen.

Niet toegestaan:

- een GLB automatisch object, NPC, prop, player, boss of environment maken;
- concrete gamecontent uit bestandsnamen afleiden;
- runtime publish starten vanuit asset scan;
- assets naar Git kopieren;
- dummy UI/audio tonen wanneer de telling 0 is.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

Voor Fase 7 is geen extra Kevin-input nodig.

Voor latere content/publish-fases blijft nodig:

- definitieve GLB-role mapping via editor/Kevin-keuze;
- UI-assets wanneer HUD/UI-flow concrete assets verplicht maakt;
- audio-assets wanneer muziek, ambience, SFX, UI audio of voice verplicht worden.

## Server-side verificatie

Uitgevoerd door Claude buiten Git:

- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 53/53 pass.
- `pnpm lint`: OK.
- MySQL migratie `db/migrations/0003_asset_library_register.sql` toegepast.
- `asset_library_records` bestaat.
- `asset_library_scan_runs` bestaat.
- Echte scan op `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
- GLB=4, UI=0 en audio=0 bevestigd.
- `Blacksmit forge.glb` met spatie werkt.
- Watcher/polling smoke bevestigd zonder permanente daemon vanuit Git.
- Editor-only API smoke voor read/scan bevestigd.
- Anonymous/game-denial smoke bevestigd.
- Scan publiceert niets naar runtime en kopieert geen assets naar Git.
- DB CHECK constraint blokkeert `publishes_runtime_output=1`.

## Prompt voor GK Code Copiloot

```text
Git-regels:
- Werk alleen op main.
- Maak geen branches.
- Maak geen pull request.
- Gebruik zo min mogelijk commits via de beschikbare GitHub-write route.
- Commit pas na de beschikbare checks.

Inhoudsregels:
- Voeg geen dummy assets toe.
- Verzin geen definitieve gamecontent.
- Als Kevin-input mist, stop en rapporteer exact wat mist.
- Concrete waardes moeten uit node-data, Game Bible, asset register of editor input komen.
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route of minimap-instelling hard-coded bevatten.

Je werkt aan fase 7: Auto asset/audio library uit jouw assets-map.

Doel:
Bouw asset-worker en editor bibliotheek die GLB, UI en audio assets automatisch scant, toont en bijwerkt.

Werk uit:
Implementeer recursive scanner en watcher/polling contract. Registreer GLB, UI en audio metadata. Editor krijgt asset library state met counts, missing/invalid/unassigned/candidate/assigned status. GLB krijgt alleen kandidaat-capabilities; definitieve role mapping is editor-data en wordt niet door de scanner gekozen. Bouw role mapping als editor capability, niet als hard-coded runtime-role.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen naar klaar als de fase echt server-side klaar is.
- Commit met duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [x] Asset schema/contract bestaat voor GLB, UI image en audio.
- [x] Recursive scanner core ondersteunt filenames met spaties.
- [x] Scanner registreert metadata en hash waar haalbaar.
- [x] Verdwenen assets worden als `missing` gemarkeerd.
- [x] UI/audio count 0 blijft geldig.
- [x] Audio picker toont geen dummy audio.
- [x] GLB role mapping blijft `candidate` totdat editor-data anders kiest.
- [x] Editor asset/audio panel state toont library counts en role mapping status.
- [x] Editor-only asset library read/scan routes zijn voorbereid.
- [x] Database-migratie bevat alleen schema, geen echte assetdata.
- [x] Scanner publiceert niets naar runtime.
- [x] Geen assets in Git toegevoegd.
- [x] Server-side build/typecheck/test/lint groen.
- [x] MySQL migratie toegepast.
- [x] Echte server scan op `/var/www/gk/assets` bevestigd.
- [x] Watcher/polling smoke bevestigd.

## Testplan

Server-side uitgevoerd:

1. Zet `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
2. Draai de asset scan.
3. Verwacht GLB=4, UI=0, audio=0.
4. Controleer dat de bestandsnaam met spatie veilig als original filename blijft bestaan en een normalized key krijgt.
5. Controleer dat GLB-records geen definitieve runtime-role krijgen.
6. Controleer dat `/editor/assets/library` alleen met editor session werkt.
7. Controleer dat `/editor/assets/scan` alleen met editor session en CSRF/Origin werkt.
8. Controleer dat anonymous/game session geen editor asset beheer krijgt.
9. Controleer dat geen runtime publish of asset copy naar Git plaatsvindt.

Resultaat: uitgevoerd en groen volgens Claude server-side verificatie; blockers: geen.
