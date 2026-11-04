// Eén achtergrondwerker per speler. Nieuwe klikken vervangen lopend zoekwerk;
// een laat antwoord van een oude klik mag de speler nooit de verkeerde kant opsturen.
export function createPlayerPathClient(makeWorker = () => new Worker(new URL("./player-navigation-worker.js?v=20261103-routes3", import.meta.url), { type: "module" })) {
  let worker = null, pending = null, contextKey = null, nextId = 0;
  function cancel() {
    if (!pending) return;
    const previous = pending;
    pending = null;
    worker?.terminate();
    worker = null;
    contextKey = null;
    previous.resolve({ ok: false, points: [], reason: "cancelled" });
  }
  function invalidate() {
    cancel();
    contextKey = null;
  }
  function destroy() {
    cancel();
    worker?.terminate();
    worker = null;
    contextKey = null;
  }
  function findPath(start, goal, context, options = {}) {
    cancel();
    return new Promise(resolve => {
      const id = ++nextId;
      try {
        if (!worker) {
          worker = makeWorker();
          worker.onmessage = ({ data }) => {
            if (!pending || data.id !== pending.id) return;
            const request = pending;
            pending = null;
            request.resolve(data.route);
          };
          worker.onerror = () => {
            const request = pending;
            pending = null;
            destroy();
            request?.resolve({ ok: false, points: [], reason: "navigation_error" });
          };
        }
        pending = { id, resolve };
        const key = [context.index, context.solids, context.radius, context.index?.heightfield?.revision];
        const changed = !contextKey || key.some((value, i) => value !== contextKey[i]);
        worker.postMessage({ id, start, goal, options, ...(changed ? { context } : {}) });
        contextKey = key;
      } catch {
        pending = null;
        destroy();
        resolve({ ok: false, points: [], reason: "navigation_error" });
      }
    });
  }
  return { findPath, cancel, invalidate, destroy };
}
