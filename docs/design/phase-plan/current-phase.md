# Current Phase

## Fase

Actieve status: Fase 16 Fundering en herbaseline is verwerkt en formeel afgerond. Fase 17 Runtime Game Core is de volgende geplande fase en is nog niet geopend of geimplementeerd.

Fase 1 t/m Fase 15 zijn afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond.

Fase 16 heeft de roadmap en fasebronnen opnieuw gebaselined zonder code, assets, nodecontracts, runtimegedrag of concrete gamecontent toe te voegen.

## Statussamenvatting

Fase 15 bouwde een veilige metadata-only runtime asset-reference planninglaag tussen Projection-driven Scene Assembly Core en latere asset loading/renderer/gameplay fases. De laag mag scene-plan descriptors omzetten naar generieke asset-reference descriptors en metadata candidates.

Fase 16 bevestigde daarna de harde overgang naar de speelbare lijn:

- Fase 15 is formeel afgesloten op groen server-side bewijs.
- De canonieke speelbare fasevolgorde staat in `docs/fases`.
- Oude live roadmapbestanden in `README/fase16.md`, `README/fase17.md` en `README/fase18.md` zijn niet aanwezig als live toekomstfasebron.
- Onderzoeksinput blijft geen levende statusbron.
- De volgende implementatiefase is Fase 17 Runtime Game Core.

## Fase 15 grenzen

Fase 15 is geen asset loader en geen renderer. De afgeronde Git-basis bevat:

- runtime asset reference planning contracts;
- asset reference plan/read-model contracts;
- asset reference candidate metadata contracts;
- asset reference planning lifecycle/status;
- asset reference safety flags;
- scene-plan-to-asset-reference validation;
- empty asset reference plan wanneer er geen scene descriptors zijn;
- asset reference planning statuszone en marker in de game shell;
- node/socket contracts;
- browser-smoke marker;
- tests voor no-asset-load/no-final-role/no-render/no-gameplay boundaries.

Niet gebouwd:

- asset loading;
- GLB/texture/audio loading;
- asset byte fetch;
- definitive GLB/asset role mapping;
- renderer draw calls;
- gameplay, movement, combat of audio playback;
- concrete gamecontent;
- hardcoded world/camera/light/minimap/HUD/audio values;
- assetmutatie;
- editor/admin routegebruik in runtime asset planning;
- Fase 17 runtime game code.

## Server-side verificatie afgerond

Fase 15 is afgerond na:

- `pnpm build`: groen;
- `pnpm typecheck`: groen;
- `pnpm test`: groen;
- `pnpm lint`: groen;
- live service checks: groen;
- local route-smokes: groen;
- Apache/front-door smokes: groen;
- `pnpm smoke:browser:game`: groen;
- `pnpm smoke:browser:editor`: groen;
- `pnpm smoke:browser`: groen;
- asset reference planning marker: groen;
- empty asset reference plan: groen;
- no editor/admin route usage: groen;
- no draft leakage: groen;
- no GLB/texture/audio loading: groen;
- no asset byte fetch: groen;
- no definitive asset role mapping: groen;
- no concrete content: groen;
- no renderer draw calls: groen;
- no gameplay/movement/combat/audio playback: groen;
- no hardcoded runtime values: groen;
- no asset mutation: groen;
- worktree schoon: groen;
- blockers: geen.

## Fase 16 grenzen

Fase 16 is een documentatie- en herbaselinefase. Er is geen code, asset, runtimegedrag, nodecontract of concrete GameBible-content toegevoegd.

Fase 16 levert alleen:

- harde Fase 15 statusbevestiging;
- opgeschoonde roadmapstatus;
- geplande speelbare fasevolgorde in `docs/fases`;
- expliciete blokkade tegen oude/live fasebestanden die de nieuwe technische lijn tegenspreken.

## Fasebeoordeling

Git-basis Fase 15 klaar: ja.

Server-side Fase 15 klaar: ja.

Fase 15 formeel afgerond: ja.

Fase 16 formeel afgerond: ja.

Fase 17 geimplementeerd: nee.

Fase 17 geopend: nee.