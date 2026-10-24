# NODE-01 Hard Cutover Acceptance Result

- Accepted/closed: yes
- Accepted by: Kevin
- Closed date: 2026-07-18
- Graph revision at close: 465
- Direct legacy Game Output edges after apply: 0
- Visible Game Output inputs: gameProject
- Visible World Assembly inputs: projectSettings, chunkGrid, editorWorldSettings, gameWorldSettings, chunkPolicies, catalogs, zones, campaigns, playerRules, ui
- Legacy World Adapter visible in normal editor: no
- Canonical route present: yes
- Specialized Groups present: Catalog (catalog), Zones (zone), Campaigns (campaign), Player Rules (player_rules), UI (ui)
- Publish ok: yes
- /api/game/world schemaVersion: gk-game-project-v3
- buildId: gk-e949db64b3ca
- contentHash: sha256:e949db64b3ca6d7ca086798f7bc2c3008de9954da0f139a7a0db0c90ecfd8dc3
- published symbol count: 17
- Token proof in /game/: yes
- Node drag coordinate guard: yes
- Visible output/group nodes draggable: yes
- Node positions persist after save/refresh/reopen: yes
- Port dots round and on node edge: yes
- Edge endpoints land on port dots: yes
- Visible port labels not truncated: yes
- Visually distinct datatype colors for current visible ports: yes
- npm run check: pass
- npm test: pass
- npm run smoke: fail, known chunk-lookahead runtime assertion outside NODE-01 cutover scope

Go/no-go: go for NODE-02 planning/implementation. Keep the smoke failure and missing public URL proof as separate non-NODE-01 follow-up risks.
