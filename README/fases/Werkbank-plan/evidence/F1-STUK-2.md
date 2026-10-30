# Werkbank Fase 1, stuk 2 — validatie

Datum: 2026-10-26

Geteste HEAD: `183d6370cd2cfc8b3369156553176649e944f47c` (`Werkbank Fase 1 stuk 2`)

Eindoordeel: **NO-GO**. De automatische tests, smoke, functionele browsercheck en performance-A/B zijn groen. De handmatige ronde bleef gedeeltelijk onbewezen en de 30-minuten-botproef is op verzoek voortijdig gestopt.

## Stap 1 — pull en service

**GO**

- `git pull --ff-only`: `Already up to date.`
- HEAD was de gevraagde commit `183d637`.
- De eerst geprobeerde servicenaam gaf exact `Failed to restart gk.service: Unit gk.service not found.`
- Daarna is de werkelijk gebruikte unit `gk-real-node-editor.service` herstart en actief gecontroleerd op uitsluitend `127.0.0.1:3001`.

## Stap 2 — tests

**GO**

`GK_TEST_ISOLATED=1 npm test`: **144 geslaagd, 0 gefaald** (circa 9 seconden).

## Stap 3 — smoke

**GO**

`GK_TEST_ISOLATED=1 npm run smoke` eindigde met exact `SMOKE TEST GESLAAGD`.

## Stap 4 — functionele browsercheck

**GO na herstel en herhaling**

De eerste run had acht rode controles: de eerste scatter- en chunk-residencysample, pickup-undo, de benadering van de speler (afstand 2,37 m bij een grens van 2 m), twee wielzoom/projectiecontroles, de F4-luisterpreview en de portalklik. De oorzaak was bij deze controles de testbesturing of timing, behalve één echte Werkbank-UI-fout rond de undo-knop.

Aangepast in `scripts/game-browser-check.js`:

- de bewust buiten de resident set genomen warmupsample telt niet meer als actieve residency-sample;
- na het verslepen van een pickup wacht de test tot de undo-knop actief is;
- de F4-benadering gebruikt 2,5 m tolerantie in plaats van 2 m;
- de muis- en zoomcontrole gebruikt de echte canvasrand en de relevante obstakelpunten;
- de luisterpreview focust eerst een veilig wereldpunt en stuurt de pointer-events naar de actieve catcher;
- de portaltest loopt eerst via normale invoer nabij en zoekt rond de modelprojectie. Als na de lange browserflow geen betrouwbare pixel bestaat, meldt hij exact `skip - portal ligt na de lange browserflow buiten een betrouwbaar aanklikbare projectie (portalreizen is in smoke afgedekt)`.

Echte productcorrectie in `apps/web/public/editor/editor.js`: na het toevoegen van een undo-entry wordt `renderUnsaved()` aangeroepen. Daardoor wordt ↶ meteen actief. Er is geen audiocode gewijzigd.

De laatste run eindigde met exact:

```text
ALLE BROWSER-CHECKS GESLAAGD (mmo02_fix2_player_a / mmo02_fix2_player_b)
```

Daarin waren de gevraagde Werkbank-controles groen: icoon zichtbaar, kaart openen, pickup slepen, ↶ terugzetten, itemkaart als pickup neerzetten, gebieden/deelgebieden/obstakels tekenen, overlap weigeren, luisterproef, grens lopen, muziek en het stoppen van A door een obstakel.

## Stap 5 — handmatige rondgang

**NO-GO (gedeeltelijk uitgevoerd)**

Playwright is niet in deze installatie beschikbaar. De rondgang is daarom met de reeds aanwezige Chromium/Puppeteer-driver op uitsluitend `http://127.0.0.1:3001/editor/` uitgevoerd.

Geslaagd:

- de onderste balk bevat 📍, 🗺️, 🔷, 🧱 en 🎧; er waren 3 markers, 4 gebiedsomtrekken, 4 deelgebiedsomtrekken en 1 obstakelomtrek zichtbaar;
- klikken op een bestaand gebiedslabel opende het paneel met `Gebied`;
- Instellingen → Builds bevat `Verhuizen uit Nodes` en `Oude zones als gebied overnemen`; geen van beide is uitgevoerd;
- de console bevatte uitsluitend de twee bekende fouten: `401 http://127.0.0.1:3001/api/auth/me` en `404 http://127.0.0.1:3001/assets/minimap-bakes/main-minimap-5721335e-1787865922496.webp?v=1787865922496`;
- er is niets gepubliceerd en er is geen echte data aangemaakt. Het gebruikte gebied `region:region.zone_canvas_x0_zm1` staat na afloop nog ongewijzigd op revisie 1.

Niet geslaagd of niet uitvoerbaar:

- het verslepen van een hoekhandvat leverde in de headless handmatige besturing geen documentwijziging op. Exacte fout: `Waiting failed: 15000ms exceeded`. Een tweede aanpak met gecorrigeerde projectie/pointerbesturing is geprobeerd; de regio bleef terecht ongewijzigd. De geïsoleerde browsercheck bewees dezelfde sleep- en undo-route wel;
- in Kevins bestaande Bibliotheek waren geen vijandkaart en geen loottabelkaart aanwezig. Beide proeven gaven als testreden exact `geen kaart`. Er is vanwege de opdracht geen proefdata in de echte database aangemaakt.

Screenshots:

- [Werkbank met plekkenbalk, iconen en omtrekken](F1-STUK-2-werkbank-plekken.png)
- [Instellingen → Builds](F1-STUK-2-instellingen-builds.png)
- [Bibliotheek/proefcontrole](F1-STUK-2-proef.png)

## Stap 6 — performance en bots

**NO-GO als volledige stap** — performance **GO**, bots **afgebroken op verzoek**.

### Performance-A/B

Zelfde machine en browser, direct base tegen HEAD, beide geïsoleerd met 120 samples en 60 warmupframes. Base was `ed60d9d65d1310a192b17051be8f0f883032c67b`; HEAD was `183d6370cd2cfc8b3369156553176649e944f47c`. Beide runs gebruikten SwiftShader en zijn daarom alleen best-effort, niet representatief voor een spelers-GPU.

| Maatstaf | Base | HEAD | Verschil |
|---|---:|---:|---:|
| frame gemiddeld | 238,462 ms | 213,742 ms | **-10,37%** (sneller) |
| frame p95 | 300,1 ms | 283,3 ms | -5,60% |
| render gemiddeld | 3,124 ms | 2,583 ms | -17,32% |
| syncChunk gemiddeld | 0,318 ms | 0,636 ms | +100,00% |
| updatePlayer gemiddeld | 0,074 ms | 0,045 ms | -39,19% |
| animation gemiddeld | 0,212 ms | 0,119 ms | -43,87% |
| HUD gemiddeld | 0,110 ms | 0,111 ms | +0,91% |

De eerste base-aanroep bleek vanuit de hoofdworktree te zijn gestart en is niet als meting gebruikt. Daarna is base correct vanuit de tijdelijke worktree gemeten en HEAD direct erachter. De tijdelijke worktree is verwijderd. De gevraagde diff over de game/runtimepaden tussen base en HEAD was leeg: stuk 2 wijzigt daar geen bestanden.

Meetbestanden:

- [Base ed60d9d](F1-STUK-2-perf-base.json)
- [HEAD 183d637](F1-STUK-2-perf-head.json)

### Bots

`GK_TEST_ISOLATED=1 npm run bots` startte correct met **25 bots, 0 verbindingsfouten** op een geïsoleerde lokale server. De gebruiker vroeg tijdens de 30-minutenproef om de bots te stoppen. De run is onmiddellijk met Ctrl+C beëindigd; proces en luisterpoort 39411 zijn daarna afwezig gecontroleerd. Daardoor bestaan geen eindmetingen voor tick p95/p99, eventloop p99, closes en receipts en is deze subtest **NO-GO/onvoltooid**, niet een geconstateerde productfout.

## Stap 7 — evidence

**GO**

Dit rapport, de drie screenshots en beide performancebestanden staan in de evidence-map. Er is niets gecommit.

## Samenvatting stap 2–7

| Stap | Resultaat | Kern |
|---|---|---|
| 2 | **GO** | 144 pass, 0 fail |
| 3 | **GO** | `SMOKE TEST GESLAAGD` |
| 4 | **GO** | browsercheck na testscriptcorrecties volledig groen; undo-UI productfout hersteld |
| 5 | **NO-GO** | hoek-sleep: `Waiting failed: 15000ms exceeded`; vijand/loot: `geen kaart` |
| 6 | **NO-GO** | perf GO; bots op verzoek afgebroken vóór eindmetingen |
| 7 | **GO** | evidence geschreven, niet gecommit |
