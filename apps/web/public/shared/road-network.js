// Wegennet (🛣️ Weg in de Area tool): losse lijnen die samen één netwerk vormen.
// - Punten op (bijna) dezelfde plek zijn één knooppunt.
// - Een punt vlak bij de lijn van een andere weg wordt aan die lijn vastgemaakt (T-splitsing).
// - Lijnen die elkaar kruisen krijgen een knooppunt op de kruising.
// Gedeeld door de editor (gele en rode bolletjes), de routezoeker in de browser en de server (NPC die vooruitloopt).
// Geen DOM, geen netwerk.

export const ROAD_JOIN_M = 0.6;

const finite = (point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z));

function projectOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2)) : 0;
  const x = ax + dx * t, z = az + dz * t;
  return { t, x, z, distance: Math.hypot(px - x, pz - z) };
}

// roads: [{ id, points: [{x, z}] }]. Geeft { nodes: [{x, z}], edges: [{a, b, length, roadId}], links: [[{to, edge}]] }.
export function buildRoadGraph(roads, join = ROAD_JOIN_M) {
  const nodes = [];
  const grid = new Map();
  const nodeAt = (x, z) => {
    const cx = Math.floor(x / join), cz = Math.floor(z / join);
    for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
      for (const id of grid.get((cx + dx) + ":" + (cz + dz)) || []) if (Math.hypot(nodes[id].x - x, nodes[id].z - z) <= join) return id;
    }
    const id = nodes.length;
    nodes.push({ x, z });
    const key = cx + ":" + cz;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(id);
    return id;
  };
  const segments = [];
  for (const road of Array.isArray(roads) ? roads : []) {
    let previous = null;
    for (const point of (road?.points || []).filter(finite)) {
      const id = nodeAt(Number(point.x), Number(point.z));
      if (previous !== null && previous !== id) segments.push({ a: previous, b: id, roadId: road.id ?? null, cuts: [] });
      previous = id;
    }
  }
  const box = (s) => ({ minX: Math.min(nodes[s.a].x, nodes[s.b].x), maxX: Math.max(nodes[s.a].x, nodes[s.b].x),
    minZ: Math.min(nodes[s.a].z, nodes[s.b].z), maxZ: Math.max(nodes[s.a].z, nodes[s.b].z) });
  const boxes = segments.map(box);
  // Kruisingen: een knooppunt waar twee lijnen elkaar snijden.
  for (let i = 0; i < segments.length; i += 1) for (let j = i + 1; j < segments.length; j += 1) {
    const s = segments[i], u = segments[j], bs = boxes[i], bu = boxes[j];
    if (bs.maxX < bu.minX || bu.maxX < bs.minX || bs.maxZ < bu.minZ || bu.maxZ < bs.minZ) continue;
    if (s.a === u.a || s.a === u.b || s.b === u.a || s.b === u.b) continue;
    const ax = nodes[s.a].x, az = nodes[s.a].z, rx = nodes[s.b].x - ax, rz = nodes[s.b].z - az;
    const cx = nodes[u.a].x, cz = nodes[u.a].z, qx = nodes[u.b].x - cx, qz = nodes[u.b].z - cz;
    const denominator = rx * qz - rz * qx;
    if (Math.abs(denominator) < 1e-9) continue;
    const t = ((cx - ax) * qz - (cz - az) * qx) / denominator;
    const w = ((cx - ax) * rz - (cz - az) * rx) / denominator;
    if (t <= 0 || t >= 1 || w <= 0 || w >= 1) continue;
    const id = nodeAt(ax + rx * t, az + rz * t);
    s.cuts.push(id);
    u.cuts.push(id);
  }
  // T-splitsing: een punt dat (bijna) op de lijn van een ander stuk ligt, wordt een knooppunt van dat stuk.
  segments.forEach((s, i) => {
    const b = boxes[i];
    for (let id = 0; id < nodes.length; id += 1) {
      if (id === s.a || id === s.b) continue;
      const n = nodes[id];
      if (n.x < b.minX - join || n.x > b.maxX + join || n.z < b.minZ - join || n.z > b.maxZ + join) continue;
      const hit = projectOnSegment(n.x, n.z, nodes[s.a].x, nodes[s.a].z, nodes[s.b].x, nodes[s.b].z);
      if (hit.distance <= join && hit.t > 0 && hit.t < 1) s.cuts.push(id);
    }
  });
  const edges = [];
  const seen = new Set();
  const addEdge = (a, b, roadId) => {
    if (a === b) return;
    const key = Math.min(a, b) + ":" + Math.max(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, roadId, length: Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) });
  };
  for (const s of segments) {
    const ax = nodes[s.a].x, az = nodes[s.a].z, dx = nodes[s.b].x - ax, dz = nodes[s.b].z - az;
    const along = (id) => (nodes[id].x - ax) * dx + (nodes[id].z - az) * dz;
    const chain = [s.a, ...[...new Set(s.cuts)].filter((id) => id !== s.a && id !== s.b).sort((p, q) => along(p) - along(q)), s.b];
    for (let k = 1; k < chain.length; k += 1) addEdge(chain[k - 1], chain[k], s.roadId);
  }
  const links = nodes.map(() => []);
  edges.forEach((edge, index) => {
    links[edge.a].push({ to: edge.b, edge: index });
    links[edge.b].push({ to: edge.a, edge: index });
  });
  return { nodes, edges, links };
}

// Knooppunten (3 of meer lijnen) en losse eindes (1 lijn), voor de bolletjes in de editor.
export function roadGraphMarkers(graph) {
  const out = [];
  graph.links.forEach((list, id) => {
    if (list.length >= 3) out.push({ kind: "junction", x: graph.nodes[id].x, z: graph.nodes[id].z, edge: list[0].edge });
    else if (list.length === 1) out.push({ kind: "end", x: graph.nodes[id].x, z: graph.nodes[id].z, edge: list[0].edge });
  });
  return out;
}

// De dichtstbijzijnde plek op de weg, per stuk weg (beste "limit" stukken binnen maxDistance).
export function nearestRoadPoints(graph, x, z, maxDistance = Infinity, limit = 4) {
  const hits = [];
  graph.edges.forEach((edge, index) => {
    const a = graph.nodes[edge.a], b = graph.nodes[edge.b];
    const hit = projectOnSegment(x, z, a.x, a.z, b.x, b.z);
    if (hit.distance <= maxDistance) hits.push({ edge: index, x: hit.x, z: hit.z, distance: hit.distance });
  });
  hits.sort((p, q) => p.distance - q.distance);
  return hits.slice(0, limit);
}

// De goedkoopste route over de weg: naar de weg toe, over de weg, eraf naar het doel.
// Meters naast de weg tellen "offroadWeight" keer zo zwaar. Je stapt de weg op bij het dichtstbijzijnde stuk
// (niet terug naar een punt achter je) en eraf waar de weg het dichtst bij het doel komt.
// Geeft { cost, points: [op de weg, ...knooppunten..., van de weg af] } of null.
export function planRoadRoute(graph, start, goal, options = {}) {
  if (!graph?.edges?.length) return null;
  const weight = Math.max(1, Number(options.offroadWeight) || 2);
  const maxEntry = Number.isFinite(options.maxEntry) ? options.maxEntry : Infinity;
  const candidateCount = Math.max(1, Number(options.candidates) || 4);
  const allowed = (list, test) => {
    if (typeof test !== "function") return list;
    const reachable = list.filter(test);
    // Als geen enkel nabij punt rechtstreeks bereikbaar is, laat de gewone
    // routezoeker later alsnog een omweg naar het beste wegpunt zoeken.
    return reachable.length ? reachable : list;
  };
  const entries = allowed(nearestRoadPoints(graph, start.x, start.z, maxEntry, candidateCount), options.entryAllowed);
  const exits = allowed(nearestRoadPoints(graph, goal.x, goal.z, maxEntry, candidateCount), options.exitAllowed);
  if (!entries.length || !exits.length) return null;
  const { nodes, edges, links } = graph;
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const from = new Int32Array(nodes.length).fill(-1);
  const gap = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const open = [];
  const push = (id, cost) => {
    open.push([cost, id]);
    let i = open.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; }
  };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top;
  };
  entries.forEach((entry, k) => {
    for (const id of [edges[entry.edge].a, edges[entry.edge].b]) {
      const cost = weight * entry.distance + gap(entry, nodes[id]);
      if (cost < dist[id]) { dist[id] = cost; previous[id] = -1; from[id] = k; push(id, cost); }
    }
  });
  while (open.length) {
    const [cost, id] = pop();
    if (cost !== dist[id]) continue;
    for (const link of links[id]) {
      const next = cost + edges[link.edge].length;
      if (next < dist[link.to]) { dist[link.to] = next; previous[link.to] = id; from[link.to] = from[id]; push(link.to, next); }
    }
  }
  let best = null;
  for (const exit of exits) {
    for (const id of [edges[exit.edge].a, edges[exit.edge].b]) {
      const cost = dist[id] + gap(nodes[id], exit) + weight * exit.distance;
      if (cost < (best?.cost ?? Infinity)) best = { cost, exit, node: id, entry: entries[from[id]] };
    }
    // Op- en afstappen op hetzelfde stuk weg: gewoon over dat stuk.
    for (const entry of entries) if (entry.edge === exit.edge) {
      const cost = weight * entry.distance + gap(entry, exit) + weight * exit.distance;
      if (cost < (best?.cost ?? Infinity)) best = { cost, exit, node: -1, entry };
    }
  }
  if (!best || !Number.isFinite(best.cost)) return null;
  const chain = [];
  for (let id = best.node; id >= 0; id = previous[id]) chain.push({ x: nodes[id].x, z: nodes[id].z });
  chain.reverse();
  const points = [];
  for (const p of [{ x: best.entry.x, z: best.entry.z }, ...chain, { x: best.exit.x, z: best.exit.z }]) {
    const last = points[points.length - 1];
    if (!last || gap(last, p) > 0.05) points.push(p);
  }
  return { cost: best.cost, points, entryDistance: best.entry.distance, exitDistance: best.exit.distance };
}

// ---------- Bewerken van het wegennet (editor, 🛣️ Weg) ----------
// Een netwerk is { points: [{x, z}], links: [[i, j]] }. Elke functie geeft een nieuw netwerk terug (niets wordt aangepast).

const linkKey = (a, b) => Math.min(a, b) + ":" + Math.max(a, b);

function cleanLinks(links) {
  const seen = new Set();
  const out = [];
  for (const [a, b] of links) {
    if (a === b) continue;
    const key = linkKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

export function roadHasLink(net, a, b) {
  return net.links.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
}

// Nieuw punt (met een lijn vanaf "from" als dat een punt is). Geeft { net, index }.
export function roadAddPoint(net, point, from = null) {
  const index = net.points.length;
  const points = net.points.concat([{ x: point.x, z: point.z }]);
  const links = Number.isInteger(from) && from >= 0 && from < net.points.length ? net.links.concat([[from, index]]) : net.links.slice();
  return { net: { points, links }, index };
}

// Punten op volgorde aan elkaar vastmaken (1-2, 2-3, ...). Geeft { net, added }.
export function roadConnect(net, indices) {
  const links = net.links.slice();
  let added = 0;
  for (let i = 1; i < indices.length; i += 1) {
    const a = indices[i - 1], b = indices[i];
    if (a === b || links.some(([p, q]) => linkKey(p, q) === linkKey(a, b))) continue;
    links.push([a, b]);
    added += 1;
  }
  return { net: { points: net.points.slice(), links }, added };
}

// Punten (met hun lijnen) en losse lijnen weghalen. De nummers van de overige punten schuiven op.
export function roadDelete(net, pointIndices = [], linkIndices = []) {
  const dropPoints = new Set(pointIndices);
  const dropLinks = new Set(linkIndices);
  const remap = [];
  const points = [];
  net.points.forEach((point, i) => { if (dropPoints.has(i)) remap[i] = -1; else { remap[i] = points.length; points.push(point); } });
  const links = net.links.filter((link, k) => !dropLinks.has(k) && !dropPoints.has(link[0]) && !dropPoints.has(link[1]))
    .map(([a, b]) => [remap[a], remap[b]]);
  return { points, links: cleanLinks(links), remap };
}

// Punt "from" opgaan in punt "into" (zijn lijnen gaan mee). Geeft { net, index } met het nieuwe nummer van "into".
export function roadMerge(net, from, into) {
  if (from === into) return { net, index: into };
  const links = net.links.map(([a, b]) => [a === from ? into : a, b === from ? into : b]);
  const result = roadDelete({ points: net.points, links }, [from]);
  return { net: { points: result.points, links: result.links }, index: result.remap[into] };
}

// Een punt in een lijn zetten (de lijn wordt twee lijnen). Geeft { net, index }.
export function roadSplitLink(net, linkIndex, point) {
  const link = net.links[linkIndex];
  if (!link) return { net, index: null };
  const index = net.points.length;
  const links = net.links.filter((_, k) => k !== linkIndex).concat([[link[0], index], [index, link[1]]]);
  return { net: { points: net.points.concat([{ x: point.x, z: point.z }]), links }, index };
}

// Kopie van punten + de lijnen tussen die punten, verschoven met offset. Geeft { net, indices } (de nieuwe punten).
export function roadDuplicate(net, pointIndices, offset = { x: 0, z: 0 }) {
  const map = new Map();
  const points = net.points.slice();
  for (const i of pointIndices) {
    if (!net.points[i] || map.has(i)) continue;
    map.set(i, points.length);
    points.push({ x: net.points[i].x + offset.x, z: net.points[i].z + offset.z });
  }
  const links = net.links.concat(net.links.filter(([a, b]) => map.has(a) && map.has(b)).map(([a, b]) => [map.get(a), map.get(b)]));
  return { net: { points, links }, indices: [...map.values()] };
}

// Een stukje netwerk (voor kopiëren/plakken): de gekozen punten + lijnen ertussen, met het midden op 0,0.
export function roadClip(net, pointIndices) {
  const list = [...new Set(pointIndices)].filter((i) => net.points[i]);
  if (!list.length) return null;
  const cx = list.reduce((sum, i) => sum + net.points[i].x, 0) / list.length;
  const cz = list.reduce((sum, i) => sum + net.points[i].z, 0) / list.length;
  const map = new Map(list.map((i, k) => [i, k]));
  return { points: list.map((i) => ({ x: net.points[i].x - cx, z: net.points[i].z - cz })),
    links: net.links.filter(([a, b]) => map.has(a) && map.has(b)).map(([a, b]) => [map.get(a), map.get(b)]) };
}

export function roadPaste(net, clip, at) {
  const base = net.points.length;
  const points = net.points.concat(clip.points.map((p) => ({ x: p.x + at.x, z: p.z + at.z })));
  const links = net.links.concat(clip.links.map(([a, b]) => [a + base, b + base]));
  return { net: { points, links }, indices: clip.points.map((_, k) => base + k) };
}

// Hoeveel losse delen het netwerk heeft (een punt zonder lijn telt als een eigen deel).
export function roadParts(net) {
  const parent = net.points.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const [a, b] of net.links) if (net.points[a] && net.points[b]) parent[find(a)] = find(b);
  return new Set(net.points.map((_, i) => find(i))).size;
}

// Bochten: elke hoek in een route wordt een boog (straal "radius" meter, kleiner bij korte stukken).
// Het eerste en laatste punt blijven staan. Zo lopen speler en NPC een bocht in plaats van een scherpe hoek.
export function roundRoadCorners(points, radius = 4, steps = 4) {
  if (!(radius > 0) || points.length < 3) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1], v = points[i], b = points[i + 1];
    const la = Math.hypot(a.x - v.x, a.z - v.z), lb = Math.hypot(b.x - v.x, b.z - v.z);
    const r = Math.min(radius, la / 2, lb / 2);
    const turn = la > 0 && lb > 0 ? ((a.x - v.x) * (b.x - v.x) + (a.z - v.z) * (b.z - v.z)) / (la * lb) : -1;
    // Bijna rechtdoor (minder dan ~10 graden) of te kort: punt laten staan.
    if (r < 0.3 || turn < -0.985) { out.push(v); continue; }
    const p1 = { x: v.x + (a.x - v.x) * r / la, z: v.z + (a.z - v.z) * r / la };
    const p2 = { x: v.x + (b.x - v.x) * r / lb, z: v.z + (b.z - v.z) * r / lb };
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps, u = 1 - t;
      out.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, z: u * u * p1.z + 2 * u * t * v.z + t * t * p2.z });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
