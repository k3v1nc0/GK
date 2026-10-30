# Werkbank Fase 1, stuk 1 — controle t/m ronde 8

Datum: 2026-10-26

Geteste HEAD: `f3ac660e909ccbb03e24a48b9c90eebd5fb7a3d` (`Werkbank Fase 1 fix 3`)

Uitkomst: **GO**

De bestaande resultaten uit de eerdere rondes blijven staan: stap 1–3 waren GO (144/144 tests en smoke groen) en de volledige functionele browsertest was GO. Ronde 7 controleerde fix 2, deed een zuivere performance-A/B en voerde de botsproef uit.

## Bestaande stappen 1–4

| Stap | Resultaat | Bewijs |
|---|---|---|
| Pull/HEAD/server | **GO** | Ronde 7: `git pull --ff-only` was up-to-date, HEAD is `bea72a2`, `gk-real-node-editor` is herstart en actief op :3001. |
| Tests | **GO** | Eerdere ronde: `GK_TEST_ISOLATED=1 npm test`: 144 tests, 144 pass, 0 fail. |
| Smoke | **GO** | Eerdere ronde: `GK_TEST_ISOLATED=1 npm run smoke`: `SMOKE TEST GESLAAGD`. |
| Functionele browserronde | **GO** | Ronde 5/6: Werkbank, Instellingen, kaartvelden, undo/redo, archiveren, dezelfde-buildmelding, layoutpersistentie en URL-controle groen. |

De consolecontrole uit ronde 6 herleidde de meldingen tot `401 /api/auth/me` vóór login en een oude ontbrekende minimap-bake (`404`). Er waren geen foutresponses voor `/editor/werkbank-docs.*`, `/api/authoring/*` of `/api/editor/layout`.

Schermafdrukken uit de functionele ronde:

- [Instellingen met geopende hulp](F1-STUK-1-instellingen.png)
- [Werkbank met nieuw vijandpaneel en CLI proef gekoppeld](F1-STUK-1-werkbank-vijand.png)

## Ronde 7, stap 1 — pull, herstart en gamecode-diff

**GO**

- `git pull --ff-only`: al up-to-date.
- HEAD: `bea72a2b22851cec416c8994b7788e420aa3dd3c`.
- Service eenmaal herstart; status `active` op :3001.
- De opgegeven controle gaf geen uitvoer en is dus leeg:

```text
git diff --stat 35830bd bea72a2 -- apps/web/public/game apps/web/public/shared src/server/runtime src/server/mmo-service.js
```

Werkbank stuk 1 wijzigt daarmee geen bestanden in de gecontroleerde game/runtimepaden.

## Ronde 8, stap 2 — fix 3: teller SAVE TO GAME

**GO**

Eén Playwright-sessie op Werkbank, getest met geplaatst `model_entity` `node04_model_peaks_arrival`. De modelpositie is na afloop exact teruggezet.

| Moment | X | `#unsavedBadge` | `data-pending` | `gk.editorNotLiveActions` |
|---|---:|---|---:|---:|
| start | -497,463 | 0 | leeg | `null` |
| na verplaatsing | -497,213 | 1 | leeg | `null` |
| na SAVE DRAFT | -497,213 | 0 | 1 | 1 |
| na SAVE TO GAME | -497,213 | 0 | leeg | 0 |
| na Ctrl+Z en SAVE DRAFT | -497,463 | 0 | leeg | 0 |
| na tweede SAVE TO GAME | -497,463 | 0 | leeg | 0 |

Eerste publicatie:

- `/api/editor/publish`: HTTP 200;
- statusregel bevatte `Gepubliceerd naar de game.`;
- `data-pending` werd leeg.

Publicatie na terugzetten:

- `/api/editor/publish`: HTTP 200;
- statusregel bevatte opnieuw `Gepubliceerd naar de game.`;
- `data-pending` bleef leeg;
- eindpositie: exact de oorspronkelijke `-497,463`.

Er was bij de start geen openstaande kaartwijziging, dus deze sessie deed geen request naar `/api/authoring/publish`. De foutdiagnostiek voor een blijvende teller was niet nodig. Het tijdelijke script bleef na alle geslaagde browseracties hangen bij het uitlezen van responsebodies; na beëindiging kwam de volledige meet-JSON vrij. Dit veranderde de testuitkomst niet en er is geen tweede browsersessie gestart.

## Ronde 7, stap 3 — eerlijke performance-A/B

**GO**

Zelfde machine en browser, direct na elkaar, beide met `GK_TEST_ISOLATED=1`, 120 samples en 60 warmupframes. Eerst commit `35830bd` in een tijdelijke worktree, daarna HEAD `bea72a2`. De renderer was in beide runs SwiftShader; p95 is daarom alleen genoteerd. De tijdelijke worktree is na afloop verwijderd.

| Maatstaf | Base `35830bd` | HEAD `bea72a2` | HEAD t.o.v. base |
|---|---:|---:|---:|
| frame gemiddeld | 182,632 ms | 165,966 ms | -16,666 ms (**-9,13%**, sneller) |
| frame p95 | 233,4 ms | 216,7 ms | -16,7 ms (-7,16%) |
| render gemiddeld | 2,167 ms | 1,572 ms | -27,46% |
| syncChunk gemiddeld | 0,235 ms | 0,404 ms | +71,91% |
| updatePlayer gemiddeld | 0,048 ms | 0,038 ms | -20,83% |
| animation gemiddeld | 0,087 ms | 0,078 ms | -10,34% |
| HUD gemiddeld | 0,173 ms | 0,060 ms | -65,32% |

De gate kijkt naar framegemiddelde: HEAD is niet meer dan 10% trager, maar 9,13% sneller. Daarom was geen tweede A/B-ronde nodig.

Meetbestanden:

- [Base 35830bd](F1-STUK-1-perf-base.json)
- [HEAD bea72a2](F1-STUK-1-perf-head.json)

## Ronde 7, stap 4 — bots/crashproef

**GO**

`npm run bots` zonder variabele weigerde vóór het starten van bots, zoals bedoeld door `scripts/lib/test-isolation.js:9`: `Veilige testmodus is verplicht: voer uit met GK_TEST_ISOLATED=1.` De feitelijke proef is daarna eenmaal uitgevoerd met de verplichte `GK_TEST_ISOLATED=1` en verder de standaardinstellingen: 25 bots, 30 minuten.

| Gate | Waarde | Grens | Resultaat |
|---|---:|---:|---|
| tick p95 | 7,143 ms | ≤ 25 ms | GO |
| tick p99 | 11,225 ms | ≤ 40 ms | GO |
| eventloop p99 | 8,89 ms | ≤ 20 ms | GO |
| dubbele receipts | 0 | 0 | GO |
| bots verbonden | 25/25 | 25/25 | GO |
| onverwachte closes | 0 | 0 | GO |

Botrapport: [`bots-25x30min-2026-10-26T16-43-00-589Z.json`](../../evidence/MMORPG-v2/F2/bots-25x30min-2026-10-26T16-43-00-589Z.json).

## Eindoordeel

**GO.** De functionele browsercontrole, zuivere performance-A/B en botsproef uit de eerdere rondes zijn groen. Fix 3 is nu eveneens groen: na SAVE DRAFT stond de teller op 1, beide publicaties gaven HTTP 200 met de status `Gepubliceerd naar de game.`, `data-pending` werd leeg en het model eindigde op zijn oorspronkelijke positie.
