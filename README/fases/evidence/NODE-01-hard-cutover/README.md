# NODE-01 Hard Cutover Evidence

- HEAD: 5bf6781c0bc1db351f3c0926451414ec08d3c2b2
- Local URL: http://127.0.0.1:3001/editor/ and http://127.0.0.1:3001/game/
- Public URL: not available in this workspace
- Database path: /var/www/gk/storage/gk-real-node-editor.sqlite
- Node used by app scripts: v24.17.0
- Migration key: node-system-foundation-v1
- Current graphRevision at close: 465
- Idempotent preview after apply: yes
- Closed: yes, accepted by Kevin on 2026-07-18

## Checks

- npm run check: pass
- npm test: pass
- npm run smoke: fail, known chunk-lookahead runtime assertion outside NODE-01 cutover scope
- Browser screenshots: local diagnostic, captured against 127.0.0.1

## Key Proof

- Game Output visible inputs: gameProject
- Legacy direct edges into Game Output: 0
- Legacy connection guard response: HTTP 400, Game Output publiceert alleen Game Project. Verbind World Assembly.gameProject naar Game Output.gameProject; routeer ui eerst naar World Assembly of de passende gespecialiseerde output.
- Published schema: gk-game-project-v3
- Published buildId: gk-e949db64b3ca
- Published contentHash: sha256:e949db64b3ca6d7ca086798f7bc2c3008de9954da0f139a7a0db0c90ecfd8dc3
- Published symbol count: 17
- Port labels/colors/anchors: pass, see `editor-color-label-proof.json` and `editor-color-distinction-proof.json`
- Expanded node setup proof: `editor-expanded-node-setup-proof.png`
