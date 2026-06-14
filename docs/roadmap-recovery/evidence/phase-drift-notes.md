# Phase Drift Notes

## Scope

Deze notities beschrijven alleen vastgestelde roadmapverschillen tussen:

- de originele 18-fasenroadmap uit commit `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` (`Fases en GameBible`);
- de huidige main-roadmap snapshot `9c75fa648b48516943bb4763e2271753b60d829f` (`fase 15`).

Dit document herstelt de roadmap niet en opent geen nieuwe fase.

## Vastgestelde wijzigingen

Fases 1 t/m 9 blijven qua titel grotendeels gelijk aan de originele roadmap. De huidige uitvoeringsdocumenten voor deze fases zijn wel aangevuld met afgeronde server-side status, extra validatie, candidate-only assetregels en Fase 8.1 procedural generation als extra technische tussenlaag.

Vanaf Fase 10 is duidelijke phase drift zichtbaar:

- Originele Fase 10 was `Runtime 3D client met camera, audio, minimap en HUD host`.
- Huidige Fase 10 is `Publish Flow Core`.
- Originele Fase 11 was `Publish pipeline en runtime projections`.
- Huidige Fase 11 is `Runtime Projection Core`.
- Originele Fase 12 was `Realtime MMO rooms, presence en player sync`.
- Huidige Fase 12 is `Runtime Client Shell Core`.
- Huidige Fase 12.1 bestaat als extra technische deploymentfase en kwam niet voor in de originele 18-fasenroadmap.
- Originele Fase 13 was `NPC brain, taken, paden, geluiden, groepen en schedules`.
- Huidige Fase 13 is `Runtime Render Surface Core`.
- Originele Fase 14 was `Quest systeem, story, side quests en party sharing`.
- Huidige Fase 14 is `Projection-driven Scene Assembly Core`.
- Originele Fase 15 was `Economy, levels, money, merchants, inventory en scrolls`.
- Huidige Fase 15 is `Runtime Asset Reference Planning Core` en staat volgens current-phase nog server-side open.

Fases 16 t/m 18 hebben op main nog grotendeels dezelfde titels als de originele roadmap, maar hun afhankelijkheden verwijzen naar gameplay/contentfases die in de huidige nummering deels zijn vervangen door technische foundationlagen. Daardoor zijn deze fasebestanden niet meer volledig consistent met de oorspronkelijke 18-fasenplanning.

## Gameplay/contentfases die zijn vervangen of uitgesteld

De volgende originele gameplay/runtime/contentfases zijn niet onder hetzelfde fasenummer uitgevoerd:

- Fase 10 runtime 3D client, movement, camera, audio, minimap en HUD host.
- Fase 12 realtime MMO rooms, presence en player sync.
- Fase 13 NPC brain, tasks, paths, sounds, groups en schedules.
- Fase 14 quests, story, side quests en party sharing.
- Fase 15 economy, levels, money, merchants, inventory en scrolls.

De huidige technische tussenlagen kunnen nuttig zijn voor een veiligere editor-publish-runtime keten, maar ze hebben gameplayfases vooruitgeschoven zonder dat de 18-fasenkaart opnieuw is genummerd.

## Verdwenen of verplaatste Kevin-inputlijsten

De originele roadmap bevatte concrete Kevin-input per gameplayfase. In de huidige technische fases 10 t/m 15 staan vooral boundary- en metadataregels, waardoor sommige inputlijsten niet meer direct bij het actieve fasenummer staan.

Voorbeelden van originele input die niet langer onder hetzelfde fasenummer actief is:

- Fase 10: player GLB role, ground/environment GLB, camera/minimap/audio basiskeuzes.
- Fase 12: testlimiet, naamlabels/party marker stijl, minimap marker stijl.
- Fase 13: questgiver/friendly/merchant GLB, NPC namen/testzinnen, taakgeluiden, routes/werkplekken/spawngebieden, respawn timings.
- Fase 14: eerste questnaam, side quest idee, quest stappen, party sharing gedrag, quest tracker UI/audio.
- Fase 15: currency naam/icoon, startgeld, item icons en prijzen, merchant stock, inventory UI, scroll background/tekst, level curve 1 t/m 5.
- Fase 16: enemy minion GLB, boss GLB, loot drop GLB, attack icons/audio, boss health UI/music/audio, attack namen, boss naam, loot item en mechanics.
- Fase 17: complete Game Bible, definitieve namen/dialogen, beginquest/sidequest, economy/levels, required GLB/UI/audio roles.

## Nuttige technische lagen met mogelijk verkeerde nummering

De huidige technische fases lijken inhoudelijk nuttig als engine-foundation:

- Publish Flow Core.
- Runtime Projection Core.
- Runtime Client Shell Core.
- Game Web Service Deployment Core.
- Runtime Render Surface Core.
- Projection-driven Scene Assembly Core.
- Runtime Asset Reference Planning Core.

Het probleem is niet dat deze lagen per definitie verkeerd zijn, maar dat ze oude gameplayfase-nummers hebben overgenomen. Daardoor kan een agent of mens ten onrechte aannemen dat `Fase 15` nog steeds economy/inventory betekent, terwijl current main `Fase 15` als asset-reference planning definieert.

## Bestanden die niet meer overeenkomen met de originele 18-fasenplanning

- `README/fase10.md`: andere titel en doel dan origineel.
- `README/fase11.md`: andere titel en doel dan origineel.
- `README/fase12.md`: andere titel en doel dan origineel.
- `README/fase12.1.md`: extra subfase, niet aanwezig in originele planning.
- `README/fase13.md`: andere titel en doel dan origineel.
- `README/fase14.md`: andere titel en doel dan origineel.
- `README/fase15.md`: andere titel en doel dan origineel.
- `README/fase16.md`: titel blijft combat, maar afhankelijkheden zijn verschoven door drift in Fase 13 t/m 15.
- `README/fase17.md`: titel blijft beginquest/vertical slice, maar afhankelijkheden zijn verschoven door drift in Fase 13 t/m 16.
- `README/fase18.md`: titel blijft eindacceptatie, maar acceptatie is afhankelijk van herplanning van de ontbrekende speelbare systemen.

## Neutrale conclusie

De huidige main-roadmap heeft waardevolle technische foundation toegevoegd, maar de oorspronkelijke 18-fasenroute naar een speelbare eerste versie is niet meer eenduidig. Voor volgende fases is herplanning nodig voordat nieuwe fase-nummers worden geopend.
