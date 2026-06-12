# Fase 9 - World, camera, lighting, levels/zones en minimap nodes

## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- Alles draait eerst op 1 eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- GK Code Copiloot maakt geen branches en geen pull requests.
- GK Code Copiloot gebruikt zo min mogelijk commits: standaard 1 commit per fase, maximaal 2 als het echt nodig is.
- Codex doet serverwerk buiten Git: OS, MySQL, Redis, Nginx, systemd, secrets, rechten, builds, runtime checks en lokale scans.
- Concrete gamecontent hoort niet in runtimecode.
- Alles wat jij maakt, speelt of instelt loopt via Database > Editor/Node-system > Publish > Runtime Game.
- De code mag alleen engine-capabilities bevatten: schemas, node types, validators, renderer/audio/protocol primitives en vaste socket types.
- Waardes zoals camera, licht, geld, prijzen, levels, NPC routes, NPC taken, dialogen, quests, minimap lagen, audio en HUD instellingen moeten node-data zijn.
- 3D wereldobjecten gebruiken jouw eigen bestaande of door jou gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden ook via nodes gekozen en ingesteld.
- De AI mag geen dummy assets, nepmodellen, tijdelijke vervangers, definitieve namen of definitieve verhaalcontent verzinnen.
- Als verplichte Kevin-input mist, stopt de fase met een duidelijke lijst ontbrekende items.
- Maak geen losse backupbestanden, geen tijdelijke markdown-dumps en geen extra README-bestanden die niet blijvend onderhouden worden.

## Status

Fase 9 blijft Fase 9. Deze fase is nog niet geimplementeerd.

Verplichte basis: Fase 8.1 - Procedural Generation Core. Fase 8.1 is server-side gevalideerd en klaar. Fase 9 mag als implementatiefase worden geopend wanneer Kevin dat doet.

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) is de asset refresh server-side uitgevoerd en is de asset scan OK met GLB=4, UI images=37, audio files=21, invalid=0 en missing=0.

Belangrijke statusgrens: de nieuwe UI/audio assets zijn asset-library candidates. Ze zijn geen hardcoded HUD, minimap, music, ambience, SFX of UI-audio runtimecontent.

## Doel van de fase

Maak world settings volledig node-driven: levels/zones, spawnpoints, camera, belichting, fog, sky, day/night en minimap lagen voor editor en game.

Fase 9 bouwt geen losse hardcoded world settings. World/zone/minimap nodes moeten kunnen werken met procedural outputs uit Fase 8.1:

- generated zones;
- generated spawn areas;
- generated path networks;
- generated resource distributions;
- generated entity placements.

Camera, lighting, fog, sky en minimap blijven node-data/editor-data. Fase 9 mag procedural generation gebruiken, maar mag de procedural core niet opnieuw definieren.

## Verplichte afhankelijkheden

Fase 9 moet aansluiten op:

- Fase 6 typed node graph core;
- Fase 7 asset library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core.

Fase 8.1 levert draft/preview/bake contracts voor generated world candidates. Fase 9 gebruikt die outputs als input voor world/zone/minimap capabilities, zonder ze automatisch naar runtime te publiceren.

Voor Fase 9 start is server-side bevestigd:

- Fase 8.1 migratie toegepast;
- Fase 8.1 build/typecheck/test/lint groen;
- procedural API/editor smoke groen;
- determinism smoke groen;
- no-runtime-publish/no-asset-copy bevestigd;
- asset refresh na `Assets - new` uitgevoerd;
- asset scan groen met GLB=4, UI images=37, audio files=21, invalid=0, missing=0;
- `assetsCopiedToGit=false`, `publishesRuntimeOutput=false` en `assignsDefinitiveRuntimeRoles=false`.

## Beschikbare asset-library candidates voor Fase 9

Fase 9 mag deze assets alleen als candidates via editor/node-data aanbieden:

- bestaande GLB's blijven actief als candidates;
- `Taverne.glb` blijft candidate;
- `Wizard.glb` blijft candidate;
- HUD-bestanden tellen als UI/image assets;
- icon-bestanden tellen als UI/image assets;
- minimap marker-bestanden tellen als UI/image assets;
- ambience, music, SFX en UI audio tellen als audio assets.

Niet toegestaan:

- GLB roles definitief toekennen zonder editor-data/Kevin-keuze;
- HUD assets direct als runtime HUD-layout hard-coden;
- minimap marker assets direct als runtime minimapregels hard-coden;
- audio files direct als music/ambience/SFX/UI runtimegedrag hard-coden.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

Kevin-input is pas nodig voor concrete keuzes die niet uit GameBible JSON, editor-data of procedural draft-output komen.

Mogelijke keuzes:

- camera stijl en waardes;
- startlicht, ambient, fog en sky;
- minimap vorm/zoom;
- verschil tussen editor minimap en game minimap;
- eerste level/zone naam, alleen wanneer die niet via GameBible/editor-data/procedural draft bepaald is;
- welke generated zones, spawn areas, path networks, resource distributions of entity placements Kevin/editor accepteert of aanpast;
- welke HUD, minimap marker, music, ambience, SFX of UI-audio candidates Kevin/editor later koppelt.

Als deze input ontbreekt, mag Fase 9 alleen generieke node capabilities bouwen en moet concrete content gated blijven.

## Belangrijke grens

Niet toegestaan in Fase 9:

- hardcoded camera distance, zoom, mode, smoothing of bounds;
- hardcoded sun color, light intensity, fog, sky of day/night waardes;
- hardcoded minimap shape, layers, zoom, markers of discovery rules;
- hardcoded world maps, zones, routes, spawnpoints of resource distributions;
- hardcoded HUD layout, HUD icons, minimap markers, music, ambience, SFX of UI audio;
- procedural core opnieuw definieren;
- procedural preview/bake direct naar runtime publiceren;
- generated output als definitieve runtimecontent behandelen zonder normale publish-flow.

## Actie voor Codex

Geen extra OS werk behalve migraties draaien en services starten als de Fase 9 Git-basis dat later nodig maakt.

Codex/Claude moet server-side na de Git-basis bevestigen:

- build/typecheck/test/lint;
- eventuele migraties;
- world/camera/light/minimap editor/API smoke;
- dat Fase 9 Fase 8.1 outputs kan lezen als draft/candidate input;
- dat Fase 9 de asset-library candidates kan aanbieden zonder runtime roles toe te kennen;
- dat Fase 9 geen procedural core opnieuw definieert;
- dat preview/draft niets naar Runtime Game publiceert.

## Prompt voor GK Code Copiloot

```text
Git-regels:
- Werk alleen op main.
- Maak geen branches.
- Maak geen pull request.
- Gebruik zo min mogelijk commits: standaard 1 commit voor deze fase, maximaal 2 als het echt nodig is.
- Commit pas na de beschikbare checks.

Inhoudsregels:
- Voeg geen dummy assets toe.
- Verzin geen definitieve gamecontent.
- Als Kevin-input mist, stop en rapporteer exact wat mist.
- Concrete waardes moeten uit node-data, Game Bible, asset register, procedural draft output of editor input komen.
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route, zone, resource distribution, HUD, audio of minimap-instelling hard-coded bevatten.
- Fase 9 mag de Fase 8.1 procedural generation core gebruiken, maar niet opnieuw definieren.

Je werkt aan fase 9: World, camera, lighting, levels/zones en minimap nodes.

Doel:
Maak world settings volledig node-driven: levels/zones, spawnpoints, camera, belichting, fog, sky, day/night en minimap lagen voor editor en game.

Werk uit:
Maak node families world, camera, lighting, minimap en level. Editor toont panels voor camera/light/minimap. Game en editor lezen verschillende minimap view nodes uit dezelfde data. World/zone/minimap nodes kunnen generated zones, generated spawn areas, generated path networks, generated resource distributions en generated entity placements uit Fase 8.1 gebruiken als draft/candidate input. UI/audio assets mogen alleen via asset-library references en nodes worden gekozen. Waardes mogen niet hard-coded in runtimecode.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Fase 9 gebruikt Fase 8.1 procedural outputs als draft/candidate input waar relevant.
- [ ] Camera settings via nodes.
- [ ] Wereldbelichting via nodes.
- [ ] Fog/sky via nodes.
- [ ] Level/zone beheer via nodes.
- [ ] Generated zones kunnen als editor-data worden bekeken of gekozen.
- [ ] Generated spawn areas kunnen als editor-data worden bekeken of gekozen.
- [ ] Generated path networks kunnen als editor-data worden bekeken of gekozen.
- [ ] Generated resource distributions kunnen als editor-data worden bekeken of gekozen.
- [ ] Generated entity placements kunnen als editor-data worden bekeken of gekozen.
- [ ] Editor minimap en game minimap kunnen verschillen.
- [ ] HUD/UI image candidates blijven node/editor-data.
- [ ] Audio candidates blijven node/editor-data.
- [ ] Geen hardcoded camera/light/minimap/world/HUD/audio values.
- [ ] Geen procedural core opnieuw gedefinieerd.
- [ ] Geen runtime publish vanuit draft/preview.

## Testplan

1. Gebruik een Fase 8.1 procedural draft met generated zone, spawn area, path network, resource distribution en entity placement candidates.
2. Koppel deze candidates aan Fase 9 world/zone/minimap node-data zonder runtime publish.
3. Maak twee minimap view nodes: editor toont debug/selection, game toont player/party/quest/discovery-data uit published data.
4. Controleer dat camera, light, fog, sky en minimap values niet hard-coded zijn.
5. Controleer dat HUD/UI image candidates en audio candidates alleen via node/editor-data gekoppeld worden.
6. Controleer dat Fase 9 procedural generation niet opnieuw definieert en alleen de Fase 8.1 outputs consumeert.
