# ADR-003 - Server-authority en WebSocket JSON v1

**Status:** voorgesteld. **Context:** `src/server/mmo-service.js:13-15` heeft 50 Hz tick/20 Hz snapshots en `:2868-2890` een clientteleportpad. Oud F3/F5 en Claude F0 spreken van 20 Hz, maar de huidige code bewijst dat niet.

**Besluit:** eerst F1 authority-bypass sluiten. F2 gebruikt 20 Hz fixed sim, inputseq/ack en gedeeld JSON-schema op `/ws/game`, subprotocol `gk-mmo-v1`, max 64 KiB bericht. Self 20 Hz, near 10 Hz, far 2 Hz; 64 m Cell-AOI en bounded sendqueues. Client voorspelt alleen eigen locomotion, reconcile/replay op serverack; remote entities interpoleren. F5 meet hit/miss onder latency, maar historische serverrewind blijft uit tot een apart fairness- en exploit-ADR. Alleen server beslist hit/damage/reward. `perMessageDeflate=false` tot meting.

**Alternatieven:** oud binary protocol vanaf start bespaart mogelijk egress maar verhoogt codec/debugcomplexiteit; HTTP polling is te traag voor bewegingsstate; client-authority is onveilig. **Gevolgen:** JSON-bandbreedte wordt een harde meetvraag (voorlopig p95 <=12 KiB/s/speler). Binary is toegestaan na aparte ADR met CPU- en egressbewijs. Oude `/api/game/live` en legacy HTTP-gameacties blijven alleen tijdelijk; **F6-E3-T04 sluit hun mutaties uiterlijk als F6-exitvoorwaarde** en test dat ze nul writes doen. **Toets:** F2-E2-T01..T03, F5-E2-T02, F6-E3-T04, F7-E3-T01. **Herzien als:** gemeten egress/CPU de admission cap begrenst.

**Aanvulling 2026-10-24 (Fase 01-handtest, binnen dit besluit).**
- **Bewegingsinvoer is padvolgen.** De client stuurt bij elke bewegingsinput zijn voorspelde positie mee als tussenpunt (`input.pathPoint`). De server zet die punten in een rij en loopt ze af: normale snelheid per tick, botsingen gelden, en een onbereikbaar punt wordt na enkele ticks overgeslagen. Stoppen gaat met een stoppunt (`settle`, laatste punt), en een stop maakt de rij leeg.
- **Server-authority blijft volledig:** de client zet nooit zijn positie, en snelheid en botsing beslist de server.
- **Waarom:** met alleen richting of eindpunt sneed de server bochten af en liep hij tegen obstakels waar de speler omheen liep; bij stilstaan werd de speler daarheen teruggezet.
- **Botsingen gelijk:** client en server gebruiken dezelfde obstakellijst (`solidCollisionEntriesForWorld` in `world-runtime.js`), onafhankelijk van render-residentie.
- **Toets:** `tests/path-follow.test.js`, `npm run feel:world-copy` (bosroute).
