// Pure helper (no DOM/network deps) so both the game client and the test suite can prove the
// same stale-revision guard without a browser. See README/fases/MMO-01-FIX-4-*.md.
export function shouldApplyServerPosition(currentRevision, nextRevision) {
  const currentRev = Number(currentRevision || 0);
  const nextRev = Number(nextRevision || 0);
  if (nextRev < currentRev) return false;
  return true;
}
