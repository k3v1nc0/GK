# ADR-010 - Capaciteit certificeren, kosten per toegelaten CCU

**Status:** voorgesteld. **Context:** `scripts/perf-game.js` bestaat, maar de geauditeerde repo toont geen hostspecs, meetdataset of factuur. Oude F5 noemt load/capacity zonder huidige bewezen basismeting. Kevins referentielaptop uit Claude's F0 is hier niet onafhankelijk geverifieerd.

**Besluit:** F1 registreert scene en hardware, F2 bewijst 25 bots/30 min als engineeringgate, F7 meet 10/25/50/100/200 bots met vaste speelmix en 2 uur soak. `certifiedCCU` is hoogste trede die tick, eventloop, DB, egress en errorgates haalt. Admission cap <=60% daarvan; als 25 faalt, geen F2-GO op deze host/config. Kosten per bruikbare CCU = totale maandelijkse host+storage+backup+egress+observability+reserve gedeeld door admission cap, niet door een synthetische piek. Browsergate op vastgelegde lage referentiemachine: p95 frame <=33,3 ms; afwijkingen krijgen nieuwe ADR, geen stil doelverschuiving.

**Alternatieven:** 200 CCU als vaste belofte is onbetrouwbaar; alleen tick meten mist egress/DB; cloudautoscaling zonder profiel vergroot kosten. **Gevolgen:** kosten en launchcap blijven **AANNAME** tot host en factuur bekend zijn. Testers mogen niet boven gecertificeerde cap worden toegelaten. **Toets:** F1-E3-T02, F2-E3-T03, F7-E3-T01. **Herzien als:** echte host, hardware of gebruiksmix wezenlijk verandert.
