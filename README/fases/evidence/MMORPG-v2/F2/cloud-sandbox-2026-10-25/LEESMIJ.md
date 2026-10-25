# Cloud-sandboxrun 25-10-2026 (geen bewijs voor de doelhardware)

Gedraaid in een Claude-cloudsandbox (4 vCPU, Node 24) met de reparaties uit deze commit.
Deze cijfers tonen dat het script en de meting nu kloppen. Ze gelden **niet** als bewijs voor
de oude laptop (Pentium 4417U) of Kevins VPS. De echte gate blijft Kevins eigen run (zie STAPPENPLAN-BOTS.md).

| Proef | Uitslag | Kerncijfers |
|---|---|---|
| perf:db-writes 1/10/25 x 2 min | GO | 25 bots: tick p95 4,4 ms, p99 9,7 ms, eventloop p99 6,0 ms |
| 25 bots x 30 min | GO | tick p95 4,7 ms, p99 8,2 ms, eventloop p99 5,5 ms, 0 drops, 0 dubbele receipts |
| Crashproef (SIGKILL na 5 min) | GO | 0 van 32 geackte operaties kwijt, positie-RPO 137 ms, 25/25 bots terug |

Kanttekening crashproef: maar 1 geackte operatie met reward (bots lopen willekeurig en staan zelden bij de vijand).
De gate eist minstens 1, dus het bewijs voor rewards is dun.
