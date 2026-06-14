# Roadmap Recovery Archive

## Doel

Deze map archiveert de oorspronkelijke 18-fasenroadmap naast de huidige roadmap/main-status, zodat Diepgaand onderzoek een nieuwe realistische fasekaart kan maken zonder oude en huidige fasebetekenissen stilzwijgend door elkaar te halen.

Dit is geen roadmap-herstelcommit. Deze map opent geen nieuwe fase, herstelt Fase 15 niet, wijzigt geen bestaande fasebestanden en implementeert geen gameplay.

Gebruik dit als input voor herplanning voordat nieuwe fases worden geopend.

## Gebruikte refs

Originele roadmapbasis:

- `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` (`Fases en GameBible`).

Deze commit voegde `README/fase1.md` t/m `README/fase18.md` toe en bevat de oorspronkelijke titels, waaronder:

- Fase 15 - Economy, levels, money, merchants, inventory en scrolls.
- Fase 16 - Combat, attacks, eindbaas mechanics en loot.
- Fase 17 - Complete beginquest met side quest en eindbaas.
- Fase 18 - Polijst, performance, deploy en eindacceptatie.

Huidige main snapshot voor dit archief:

- `9c75fa648b48516943bb4763e2271753b60d829f` (`fase 15`).

## Aangemaakte archiefstructuur

```text
docs/roadmap-recovery/
  README.md
  original-roadmap/
    fase01.md
    fase02.md
    fase03.md
    fase04.md
    fase05.md
    fase06.md
    fase07.md
    fase08.md
    fase09.md
    fase10.md
    fase11.md
    fase12.md
    fase13.md
    fase14.md
    fase15.md
    fase16.md
    fase17.md
    fase18.md
  current-roadmap/
    current-phase.md
    fase01.md
    fase02.md
    fase03.md
    fase04.md
    fase05.md
    fase06.md
    fase07.md
    fase08.md
    fase09.md
    fase10.md
    fase11.md
    fase12.md
    fase12.1.md
    fase13.md
    fase14.md
    fase15.md
    fase16.md
    fase17.md
    fase18.md
  evidence/
    phase-title-comparison.md
    phase-drift-notes.md
  research-brief/
    deep-research-input.md
```

## Archiefnotities

- Alle originele fasebestanden zijn gevonden in dezelfde oorspronkelijke roadmapcommit.
- Geen originele fase is als `NOT FOUND` gemarkeerd.
- De originele bestanden zijn gearchiveerd met metadata-header bovenaan.
- De huidige roadmapkopieën zijn exacte kopieën van de main-bestanden op snapshot `9c75fa648b48516943bb4763e2271753b60d829f`.
- `README/fase12.1.md` bestaat niet in de originele roadmap, maar is wel als extra current subphase gearchiveerd omdat die op main deel is van de huidige fasegeschiedenis.

## Belangrijkste drift in één zin

De oorspronkelijke fases 10 t/m 15 liepen richting runtime, realtime MMO, NPCs, quests en economy/inventory, terwijl de huidige fases 10 t/m 15 grotendeels technische publish/projection/shell/render/scene/asset-reference foundationlagen zijn geworden.

## Waarschuwing

Gebruik dit als input voor herplanning voordat nieuwe fases worden geopend.
