# Roadmap Research Input

## Doel

Deze map verzamelt bewijs voor Diepgaand onderzoek naar het verschil tussen de originele 18-fasenroadmap, de huidige herschreven of uitgevoerde fases, de huidige GameBible JSON en de huidige codegebieden.

Dit is alleen input voor onderzoek. Deze map bevat geen roadmap-besluit, herstelt geen bestaande roadmap, opent of sluit geen fase, en maakt geen server-, build- of runtimeclaim.

## Gebruikte source commits

- Originele 18-fasenroadmap: `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` (`Fases en GameBible`). Deze commit is gebruikt omdat daarin `README/fase1.md` t/m `README/fase18.md` als compleet oorspronkelijk fasepakket aanwezig zijn.
- Huidige main snapshot: `3536ab028391066e3d97712c5ae719098b1d1cc1` (`docs: archive roadmap recovery inputs`). Tijdens het verzamelen was `main` identiek aan deze commit.
- Actuele Fase 15 basis die in de huidige fasecontext genoemd wordt: `9c75fa648b48516943bb4763e2271753b60d829f` (`fase 15`). Dit is alleen broncontext uit `README/current-phase.md`, niet de snapshotcommit voor deze map.

## Inhoud van deze map

```text
docs/roadmap-research-input/
  README.md
  original-phases/
    fase1.md
    fase2.md
    fase3.md
    fase4.md
    fase5.md
    fase6.md
    fase7.md
    fase8.md
    fase9.md
    fase10.md
    fase11.md
    fase12.md
    fase13.md
    fase14.md
    fase15.md
    fase16.md
    fase17.md
    fase18.md
  current-phases/
    current-phase.md
    fase1.md
    fase2.md
    fase3.md
    fase4.md
    fase5.md
    fase6.md
    fase7.md
    fase8.md
    fase9.md
    fase10.md
    fase11.md
    fase12.md
    fase13.md
    fase14.md
    fase15.md
    fase16.md
    fase17.md
    fase18.md
  code-status/
    current-code-map.md
  gamebible/
    GameBibleNode.json
  phase-comparison/
    phase-title-table.md
```

## Wat is gekopieerd

- `original-phases/`: exacte blob-kopieen van `README/fase1.md` t/m `README/fase18.md` uit commit `2a9a6077510237e8dfc5c638d0ca996b67a5fa05`.
- `current-phases/`: exacte blob-kopieen van `README/fase1.md` t/m `README/fase18.md` en `README/current-phase.md` van `main` op snapshot `3536ab028391066e3d97712c5ae719098b1d1cc1`.
- `gamebible/`: exacte blob-kopie van `README/GameBibleNode.json` van `main` op snapshot `3536ab028391066e3d97712c5ae719098b1d1cc1`.
- `phase-comparison/phase-title-table.md`: fase-titeltabel met oude titel, oude commit, huidige titel en onderzoeksflags.
- `code-status/current-code-map.md`: feitelijke padindex van de gevraagde codegebieden op basis van GitHub-paden en package metadata.

## Gevonden en niet gevonden

Gevonden in de originele roadmapcommit:

- `README/fase1.md` t/m `README/fase18.md`: allemaal gevonden.

Gevonden op huidige `main` snapshot:

- `README/fase1.md` t/m `README/fase18.md`: allemaal gevonden.
- `README/current-phase.md`: gevonden.
- `README/GameBibleNode.json`: gevonden.
- Gevraagde codegebieden met padbewijs: `apps/editor-web`, `apps/game-web`, `packages/schemas`, `packages/node-types`, publish/runtime/projectie gerelateerde bestanden, en `tests/smoke/browser-smoke.mjs`.

Niet gevonden of niet meegenomen:

- Geen ontbrekende fasebestanden voor fase 1 t/m 18.
- `README/fase12.1.md` bestaat op huidige `main`, maar is niet gekopieerd omdat de opdracht alleen `fase1.md` t/m `fase18.md` vroeg.
- `docs/roadmap-recovery/` is niet gewijzigd of hersteld.

## Grenzen van dit pakket

- Geen bestaande `README/fase*.md` aangepast.
- Geen `README/current-phase.md` aangepast.
- Geen code aangepast.
- Geen tests aangepast.
- Geen assets aangepast.
- Geen gamecontent toegevoegd.
- Geen nieuwe fases voorgesteld.
- Geen serverclaims gedaan.

Gebruik dit pakket als bewijsmap voor Diepgaand onderzoek, niet als definitieve roadmap of besluitdocument.
