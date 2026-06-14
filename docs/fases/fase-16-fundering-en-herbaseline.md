# Fase 16 - Fundering en herbaseline

## Status

Afgerond op 2026-06-14. Deze fase is geopend en verwerkt nadat Fase 15 Runtime Asset Reference Planning Core server-side groen is bevestigd.

Fase 17 Runtime Game Core is de volgende geplande fase en is nog niet geopend of geimplementeerd.

## Bronbasis

Deze fase is gemaakt uit:

- `README/current-phase.md`;
- `docs/design/phase-plan/current-phase.md`;
- `README/fase15.md`;
- `README/node-system-super-dynamic-contract.md`;
- `README/hard-facts-to-node-panels.md`;
- `README/GameBibleNode.json`;
- de twee onderzoeksbijlagen over de speelbare node-driven MMO-lijn.

De tijdelijke onderzoeksmap `docs/roadmap-research-input` is geen levende roadmapbron en hoort niet als fasebron te blijven staan.

## Echt doel

Maak een harde herbaseline voor de komende speelbare lijn. De repo moet daarna duidelijk onderscheiden tussen:

- afgeronde technische fundering tot en met Fase 15;
- afgeronde server-side verificatie van Fase 15;
- geplande speelbare fases vanaf Runtime Game Core;
- documentatie die alleen onderzoek was en geen live statusclaim mag blijven.

## Waarom nu

De huidige technische keten is sterk, maar stopt volgens het repo-contract nog voor echte `Runtime Game`. Oude fase 16-18 documenten gingen uit van gameplaylagen die in de actuele technische nummering nog niet bestaan. Zonder herbaseline blijven toekomstige fases bouwen op verwarrende afhankelijkheden.

## Scope

- Fase 15 status en blockers hard bevestigen.
- Een canonieke speelbare fasevolgorde vastleggen in `docs/fases`.
- Oude live fasebestanden verwijderen die de nieuwe lijn tegenspreken.
- Geen nieuwe gameplay, runtimecode, assets, nodecontracts of GameBible-content bouwen.
- Geen fase als afgerond markeren zonder server-side bewijs.

## Niet in scope

- Asset loading.
- Renderer draw calls.
- Movement, combat, quests, economy of multiplayer.
- Concrete gamecontent.
- Nieuwe assetrollen of definitive GLB role mapping.
- Runtimewaarden hard-coden.

## Verplichte gates

- Fase 15 server-side verificatie is groen bevestigd.
- De keten blijft `Database > Editor/Node-system > Publish > Runtime Game`.
- Engine-capabilities blijven gescheiden van concrete gamecontent.
- Repo-documentatie, GameBible, README en fasebestanden spreken elkaar niet stilzwijgend tegen.

## Uitgevoerd

- Fase 15 status en blockers zijn hard bevestigd op groen server-side bewijs.
- Fase 15 is formeel afgesloten in de statusdocumentatie.
- De canonieke speelbare fasevolgorde staat in `docs/fases`.
- Oude live toekomstfasebestanden `README/fase16.md`, `README/fase17.md` en `README/fase18.md` zijn niet aanwezig als live roadmapbron.
- De tijdelijke onderzoeksmap `docs/roadmap-research-input` is geen levende roadmapbron.
- Fase 17 Runtime Game Core blijft gepland en is nog niet geopend.

## Serverbewijs

Fase 15 is server-side groen bevestigd met:

- `pnpm build`: groen;
- `pnpm typecheck`: groen;
- `pnpm test`: groen;
- `pnpm lint`: groen;
- browser-smokes voor game en editor: groen;
- local route-smokes: groen;
- Apache/front-door smokes: groen;
- Fase 15 asset-reference planning marker en empty plan: groen;
- geen asset load requests, renderer draw calls, draft leakage of editor/admin route usage;
- workspace-boundary drift opgelost via commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`);
- werktree schoon na server-side verificatie.

## Deliverables

- `docs/fases/fase-16-fundering-en-herbaseline.md`: aanwezig en afgerond.
- Fase 17-21 roadmapbestanden in `docs/fases`: aanwezig als geplande lijn.
- Oude/live roadmapbestanden die toekomstige faseopening blokkeren: niet aanwezig als `README/fase16.md`, `README/fase17.md` of `README/fase18.md`.
- Heldere lijst met open blockers voor de volgende fase: Fase 17 moet nog expliciet geopend worden en mag geen concrete content hard-coden.
- Geen codewijzigingen voor runtimegedrag.

## Acceptatie

- Fase 15 is formeel als afgerond gemarkeerd op basis van server-side groen bewijs.
- Fase 16-18 oude roadmapbestanden staan niet meer als live toekomstfases in `README/`.
- Nieuwe fasebestanden staan in `docs/fases`.
- Er is geen concrete gamecontent toegevoegd of verzonnen.
- Er is geen runtimegedrag gewijzigd.
- Fase 17 is nog niet geopend.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot voor de nieuwe game. Werk GitHub-only op main en gebruik de actuele repository als primary source of truth.

DOEL
Voer Fase 16 - Fundering en herbaseline uit. Bevestig eerst dat Fase 15 server-side groen is of stop met een blocker. Zet daarna de komende speelbare fasevolgorde strak in docs/fases zonder gameplaycode te bouwen.

VERPLICHTE BRONNEN
- README/current-phase.md
- docs/design/phase-plan/current-phase.md
- README/fase15.md
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md
- README/GameBibleNode.json
- docs/fases/*.md

WERKWIJZE
1. Controleer of Fase 15 server-side groen is bevestigd.
2. Als Fase 15 niet groen is, stop en rapporteer exact welke verificatie nog openstaat.
3. Controleer dat oude toekomstfasebestanden de nieuwe speelbare lijn niet tegenspreken.
4. Houd de nieuwe faseplanning in docs/fases als geplande roadmap, niet als statusclaim.
5. Voeg geen code, assets, nodecontracts of concrete gamecontent toe.

ACCEPTATIE
- Fase 15 status klopt.
- De komende fasebestanden zijn consistent met Database > Editor/Node-system > Publish > Runtime Game.
- Geen hard-coded gamecontent.
- Geen fase wordt afgerond zonder bewijs.
```

## Prompt 2 - Server-side verificatie

```text
Je voert alleen server-side verificatie uit voor Fase 16 - Fundering en herbaseline.

CONTROLEER
- pnpm build
- pnpm typecheck
- pnpm test
- pnpm lint
- bestaande browser-smokes voor editor en game, indien beschikbaar
- dat Fase 15 markers en safety boundaries nog kloppen
- dat docs/fases alleen geplande fasebestanden bevat
- dat README/fase16.md, README/fase17.md en README/fase18.md niet meer als live toekomstroadmap botsen met de huidige technische lijn

NIET DOEN
- Geen gameplay implementeren.
- Geen assets laden of mappen.
- Geen GameBible-content verzinnen.
- Geen current-phase afronden zonder groen bewijs.

RAPPORTEER
- welke checks groen zijn;
- welke checks ontbreken of niet konden draaien;
- of Fase 16 veilig afgerond mag worden;
- welke blocker eerst naar Kevin terug moet.
```