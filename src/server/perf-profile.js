// Kevin 21-11: "waar gaat de servertijd heen?" Meet een paar seconden met de ingebouwde CPU-profiler van Node, in de
// draaiende server zelf (geen herstart, geen extra programma). Het resultaat: welk deel van de tijd per functie en per
// bestand, plus hoeveel de server niets deed (idle) of geheugen opruimde (GC). Alleen voor de admin (Instellingen > Bots).
import inspector from "node:inspector";
import path from "node:path";

let running = false;

function post(session, method, params = {}) {
  return new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))));
}

export function summarizeProfile(profile, rootDir = "") {
  const nodes = new Map((profile?.nodes || []).map((node) => [node.id, node]));
  const samples = profile?.samples || [];
  const deltas = profile?.timeDeltas || [];
  const byFunction = new Map();
  const byFile = new Map();
  let total = 0;
  let idle = 0;
  let gc = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const node = nodes.get(samples[index]);
    const us = Math.max(0, Number(deltas[index]) || 0);
    if (!node) continue;
    total += us;
    const frame = node.callFrame || {};
    const name = frame.functionName || "(anoniem)";
    if (name === "(idle)") { idle += us; continue; }
    if (name === "(garbage collector)") gc += us;
    const url = String(frame.url || "");
    const file = url ? (rootDir && url.includes(rootDir) ? path.relative(rootDir, url.replace(/^file:\/\//, "")) : url.replace(/^file:\/\//, "").replace(/^.*node_modules\//, "node_modules/")) : name;
    const key = name + " " + file + ":" + ((Number(frame.lineNumber) || 0) + 1);
    byFunction.set(key, (byFunction.get(key) || 0) + us);
    byFile.set(file, (byFile.get(file) || 0) + us);
  }
  const pct = (us) => (total > 0 ? Math.round(us / total * 1000) / 10 : 0);
  const top = (map, count) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, count).map(([name, us]) => ({ name, pct: pct(us), ms: Math.round(us / 1000) }));
  return {
    seconds: Math.round(total / 100000) / 10,
    idlePct: pct(idle),
    gcPct: pct(gc),
    busyPct: Math.round((100 - pct(idle)) * 10) / 10,
    functions: top(byFunction, 15),
    files: top(byFile, 8)
  };
}

export async function profileServer(seconds = 15, rootDir = "") {
  if (running) {
    const error = new Error("Er loopt al een meting.");
    error.status = 409;
    throw error;
  }
  running = true;
  const session = new inspector.Session();
  try {
    session.connect();
    await post(session, "Profiler.enable");
    await post(session, "Profiler.setSamplingInterval", { interval: 1000 });
    await post(session, "Profiler.start");
    await new Promise((resolve) => setTimeout(resolve, Math.max(3, Math.min(60, Number(seconds) || 15)) * 1000));
    const { profile } = await post(session, "Profiler.stop");
    return Object.assign({ at: new Date().toISOString() }, summarizeProfile(profile, rootDir));
  } finally {
    try { session.disconnect(); } catch {}
    running = false;
  }
}
