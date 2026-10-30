# Start hier: GK MMORPG-basis v2.3

> **GESLOTEN op 26-10-2026.** Dit plan is vervangen door [Werkbank-plan](../Werkbank-plan/WERKBANK-PLAN.md). Hier niet verder bouwen; alleen nog naslag.

Dit is de **enige actieve ingang** voor Codex of Claude. Lees daarnaast [00-MASTERPLAN](00-MASTERPLAN.md), de relevante [Fase 01](FASE-01-veiligheid-en-bewijsbasis.md) en de ADR's die de fase raken. De vijf oude `MMORPG-basis/`-documenten bestaan alleen nog in de git-historie (commit `8a976e3`) en zijn historisch, niet normatief. Kevin geeft één opdracht per fase; de agent beheert de taakkaarten intern.

## Voor Kevin: opstart in drie handelingen

1. **Maak een aparte werkbranch op je eigen GK-checkout.** Controleer `git status --short` en de actuele commit. Leg bestaande lokale wijzigingen apart ter beoordeling; wis ze niet. Pak deze zip uit zodat de actieve bestanden onder `README/fases/MMORPG-basis-v2/` staan. Als een eerdere v2-versie daar al staat, vergelijk de bestanden eerst; archiveer oude `01-` t/m `04-` auditbestanden en `RED-TEAM-REVIEW.md` buiten de actieve map voordat je een agent start. Verwijder niets dat je zelf hebt aangepast.
2. **Geef één agent de volledige Fase 01-opdracht hieronder.** De eerste interne kaart is F1-E0-T02: testopslag isoleren. Er komt op jouw besluit geen root `.gitignore`. De agent werkt daarna de overige kaarten in afhankelijkheidsvolgorde af zonder voor elke kaart een nieuwe prompt te vragen. Capaciteit, guilds en latere content hoeven nu niet besloten te worden.
3. **Beoordeel alleen echte beslismomenten en het eindbewijs.** De agent stopt bij mogelijke gepubliceerde secrets, benodigde productiegegevens, onomkeerbare migratie of ontbrekende toegang. Fase 01 is pas af na geïsoleerde tests, restore-oefening, security-negatieve tests en een tweespelerscenario dat Kevin zelf ziet. Laat desgewenst de andere agent de oplevering alleen-lezen reviewen.

**Eerste zichtbare winst:** niet een nieuw schema, maar twee spelers in dezelfde bestaande wereld plus een aantoonbaar geweigerde cheat en een herstelbare testdatabase.

## Eén agent bouwt, de andere controleert

Codex en Claude zijn uitwisselbaar als uitvoerder. Laat ze **niet tegelijk in dezelfde branch of werkmap schrijven**. Een praktische verdeling: Codex voert Fase 01 uit in kleine commits of PR's; Claude reviewt alleen de fase-uitkomst en risicovolle migratie-/securitywijzigingen. Bij Fase 02 mag je de rollen omdraaien. De reviewer mag geen extra fase, nieuwe node-types of een brede refactor toevoegen.

## Kopieerbare Fase 01-opdracht aan Codex of Claude

```text
Voer Fase 01 van de GK MMORPG-basis volledig uit. Lees eerst .claude/CLAUDE.md, README/fases/MMORPG-basis-v2/START-HIER.md, 00-MASTERPLAN.md, FASE-01-veiligheid-en-bewijsbasis.md en de relevante ADR's. De oude vijf fases zijn historisch en niet normatief. Werk direct op main (geen branches of PR's) en behoud alle bestaande wijzigingen. Maak of commit geen root .gitignore.

Beheer de taakkaarten zelf in hun afhankelijkheidsvolgorde; vraag mij niet voor elke kaart om een nieuwe prompt. Begin met F1-E0-T02: isoleer tests, smoke en browserchecks op tijdelijke DB, assets en poort. Draai vóór bewezen isolatie geen volledige testsuite; bewijs de grens eerst met een sentinel in een wegwerpcheckout. Voer daarna de securitykaarten, backup/restore, migratiecontrole, tweespelerstest en nulmeting uit. F1-E2-T00 moet vóór F1-E2-T02 klaar zijn. Gebruik nooit mijn normale storage of productiegegevens voor tests.

Controleer aan het begin uitsluitend bestandsnamen van eventueel al getrackte DB-/secretbestanden; toon nooit waarden of inhoud. Werk autonoom door in kleine, controleerbare wijzigingen en houd een voortgangsnotitie bij zodat je na een sessiegrens kunt doorgaan zonder werk opnieuw te doen. Stop en vraag mij alleen bij mogelijke secretblootstelling, benodigde productiegegevens/credentials, een onomkeerbare migratie of een productbesluit dat je niet uit het plan kunt afleiden. Verwijder of roteer niets zelfstandig.

Lever pas op als alle exitcriteria met ruwe testuitvoer, restorebewijs en een zichtbaar tweespelerscenario zijn getoetst. Geef een kort overzicht per criterium: geslaagd, niet geslaagd of niet toetsbaar, met reden. Voeg gewijzigde paden, tests, risico's, rollback en een concrete handtest voor mij toe. Noem Fase 01 niet voltooid als iets ontbreekt.
```

## Kopieerbare reviewopdracht aan de andere agent

```text
Review de oplevering van Fase 01 alleen-lezen; wijzig geen bestanden. Controleer de Fase 01-exitcriteria tegen code, ruwe testuitvoer, restorebewijs en het zichtbare tweespelerscenario. Kijk extra naar testisolatie, mogelijke secretblootstelling, backup vóór migratierunner, authority-bypasses en verschillen tussen documentatie en code. Rapporteer bevindingen met bestand en regel en geef een eerlijk go/no-go voor Fase 02. Geen extra fase, refactor of nieuwe feature.
```

## Reviewritme

De agent verzamelt per kaart bewijs zonder Kevin steeds te onderbreken. Aan het einde van de fase krijgt Kevin vijf dingen: (1) welke paden veranderden, (2) wat gaat er in en uit, (3) welke tests zijn daadwerkelijk gedraaid en wat was de uitkomst, (4) hoe herstel je een fout, (5) wat kan hij zelf zien of klikken? Een checkbox zonder ruwe testuitvoer of een zichtbare route is geen fasebewijs. Bewaar per fase een korte evidencemap met commit-SHA, testresultaten, meetconfiguratie en een screenshot/video wanneer het spel zichtbaar verandert.

## Nulmeting zonder onveilige proef

Voer **geen** `npm test` tegen je normale opslag uit voordat F1-E0-T02 is bewezen. De vijf oude commit-ID's kun je desgewenst per ID met `git cat-file -t <id>` controleren; `git cat-file -t` accepteert niet vijf ID's in één oproep. Dat onderzoek verandert de fasevolgorde niet. Voor F2/F7 wordt capaciteit op de werkelijke testhost gemeten; een 200-bot-trede is geen belofte. Voor de gesloten test vraagt OB-07 nog expliciet Kevins akkoord over het power-loss-risico van WAL+NORMAL.

Een `.gitignore` verbergt bestaande GitHub-bestanden niet; hij voorkomt alleen het toevoegen van nieuwe lokale bestanden die aan patronen voldoen. Op Kevins keuze blijft dit bestand buiten de repo. Gebruik zo nodig een lokale `.git/info/exclude` of globale Git-exclude en controleer vóór elke commit welke bestanden werkelijk worden toegevoegd. Een reeds gepubliceerd geheim vraagt apart onderzoek en rotatie, niet een ignore-regel.
