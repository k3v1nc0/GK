# Known Limitations

- `npm run smoke` currently reports: `SMOKE TEST MISLUKT: ASSERT: forward lookahead bevat de volgende chunk voordat de speler de grens oversteekt`. This assertion is in `scripts/smoke-test.js` chunk-streaming coverage and is outside the NODE-01 hard cutover acceptance scope.
- Browser evidence was captured against `http://127.0.0.1:3001`. No public URL was available in this workspace, so public URL proof is not complete.
- Existing world content is still carried through hidden internal compatibility where the current repo has no full NODE-02 zone/entity package model yet. It is not visible as normal editor authoring.
- NODE-02 should replace the remaining compatibility payload shape with real zone/entity packages instead of extending the hidden adapter route.
