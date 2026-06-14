# Fase 20 - Authoritative gedeelde wereld

## Status

Gepland. Deze fase mag pas geopend worden nadat solo gameplay met quest, persistence, progression, inventory en combat stabiel is.

## Bronbasis

De onderzoeksbijlagen adviseren: MMO-architectuur in ontwerp, kleine shared-world slice in levering. De externe best-practice toets bevestigt dezelfde richting: server-authoritative matches/rooms houden match state server-side en laten clients commands/input sturen in plaats van truth-state.

## Echt doel

Bouw een kleine authoritative gedeelde wereldslice waarin twee spelers elkaar kunnen zien, bewegen, reconnecten en een deel van dezelfde gameplay-slice kunnen delen op server-owned state.

## Waarom nu

Multiplayer is pas zinvol wanneer er iets speelbaars is om te synchroniseren. Deze fase verplaatst de juiste waarheden naar de server zonder de node/publish/runtimeketen te omzeilen.

## Scope

- Auth/session basis voor game-runtime.
- Character/session join flow.
- Room/zone lifecycle.
- Authoritative movement validation.
- Presence sync.
- Reconnect flow.
- Kleine party/quest-share basis.
- Server-owned inventory/combat/reward mutations voor gedeelde acties.
- Desync diagnostics en audit logging.

## Niet in scope

- Massale shardarchitectuur.
- Grote open-world MMO schaal.
- Client-owned movement truth.
- Client-owned rewards, inventory, loot of combat results.
- Nieuwe concrete content verzinnen.

## Verplichte gates

- Server valideert commands voordat state muteert.
- Client stuurt intent/input, geen brute truth-state.
- WebSocket/WSS, origin allowlist, sessiehercontrole en rate limits worden expliciet beoordeeld.
- Room/zone state is reproduceerbaar en inspecteerbaar.
- Rewards/economy/combatmutaties zijn auditbaar.

## Deliverables

- Authority model document.
- Room/zone state schema.
- Shared network command contract.
- Presence/reconnect runtime flow.
- Two-account smoke test.
- Negatieve tests voor invalid packets, speedhack en duplicate rewards.

## Acceptatie

- Twee accounts kunnen dezelfde zone joinen.
- Beide spelers zien elkaars presence en movement consistent.
- Reconnect herstelt state zonder dubbele rewards.
- Server blokkeert ongeldige movement en reward-mutaties.
- Geen client-owned truth voor gameplaystate.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder mode. Werk GitHub-only op main en behandel de bestaande node/publish/runtimeketen als contract.

DOEL
Bouw Fase 20 - Authoritative gedeelde wereld. Maak een kleine two-player shared-world slice met server-owned state.

VERPLICHTE BRONNEN
- docs/fases/fase-19-progressie-inventaris-en-combat.md
- bestaande auth/session code
- bestaande runtime game code
- bestaande inventory/combat/quest contracts
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md

WERKWIJZE
1. Controleer dat solo gameplay stabiel en persistent is.
2. Breng client-owned en server-owned state expliciet in kaart.
3. Ontwerp room/zone lifecycle en command protocol.
4. Bouw minimale two-player sync, presence en reconnect.
5. Verplaats rewards/combat/economy waarheid naar server-owned paths waar gedeelde acties dat vereisen.
6. Voeg security- en exploit-tests toe.

ACCEPTATIE
- Two-account presence en movement werken.
- Reconnect werkt.
- Server valideert state-mutaties.
- Invalid packets, speedhack en duplicate rewards falen veilig.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 20 - Authoritative gedeelde wereld.

CONTROLEER
- pnpm build
- pnpm typecheck
- pnpm test
- pnpm lint
- twee-account smoke test
- reconnect mid-session
- server-side movement validation
- invalid packet/rate-limit tests
- duplicate reward negative tests
- WebSocket/WSS readiness
- origin allowlist en sessiehercontrole
- auditlog voor belangrijke servermutaties

NIET DOEN
- Geen grote MMO schaal claimen.
- Geen client-owned state als bronwaarheid accepteren.
- Geen ontbrekende content invullen.

RAPPORTEER
- bewijs van two-player sync;
- security-testresultaten;
- desync of reconnect blockers;
- of de fase klaar is voor lange-termijn builder/platformwerk.
```
