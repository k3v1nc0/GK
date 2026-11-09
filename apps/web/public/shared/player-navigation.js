import { ensureEdgeField, groundHeightAt, isPointOnWalkableSurface, resolveMovementCandidateInto, resolveWalkabilitySource } from "./movement-kernel.js";
import { buildRoadGraph, planRoadRoute, roundRoadCorners } from "./road-network.js?v=20261108-roads6";

function bounds(entry) {
  if (Number.isFinite(entry.minX)) return entry;
  if (entry.points?.length) {
    const pad = Math.max(0, Number(entry.width) || 0);
    return { minX: Math.min(...entry.points.map(p => p.x)) - pad, maxX: Math.max(...entry.points.map(p => p.x)) + pad,
      minZ: Math.min(...entry.points.map(p => p.z)) - pad, maxZ: Math.max(...entry.points.map(p => p.z)) + pad };
  }
  const extent = Math.max(Number(entry.radius) || 0, Math.hypot(Number(entry.width) || 0, Number(entry.depth) || 0) / 2);
  return { minX: entry.x - extent, maxX: entry.x + extent, minZ: entry.z - extent, maxZ: entry.z + extent };
}

function heap() {
  const items = [];
  const less = (a, b) => a.f < b.f || (a.f === b.f && a.node.h < b.node.h);
  return {
    get length() { return items.length; },
    push(node) {
      items.push({ node, g: node.g, f: node.g + node.h });
      let i = items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(items[i], items[p])) break;
        [items[i], items[p]] = [items[p], items[i]];
        i = p;
      }
    },
    pop() {
      const first = items[0];
      const last = items.pop();
      if (items.length) {
        items[0] = last;
        let i = 0;
        for (;;) {
          let next = i;
          const l = i * 2 + 1, r = l + 1;
          if (l < items.length && less(items[l], items[next])) next = l;
          if (r < items.length && less(items[r], items[next])) next = r;
          if (next === i) break;
          [items[i], items[next]] = [items[next], items[i]];
          i = next;
        }
      }
      return first;
    }
  };
}

// Per wereld bewaren we lokale botsingsdata. Een stap controleert alleen nabije objecten.
// De browser voert zoeken in een Worker uit; dit bestand gebruikt geen DOM of netwerk.
export function createPlayerNavigator(options = {}) {
  const index = ensureEdgeField(resolveWalkabilitySource(options.index));
  const ground = options.ground || index.ground;
  const solids = (options.solids || []).filter(s => s.enabled !== false && s.radius > 0);
  const radius = Math.max(0.05, Number(options.radius) || 0.5);
  const localCache = new Map();
  const maxCells = Math.max(1, Number(options.maxCells) || 384);
  const groups = {};
  for (const key of ["walkables", "blockers", "surfaceBlockers", "waters", "walls"]) groups[key] = (index[key] || []).map(entry => ({ entry, box: bounds(entry) }));
  const solidBounds = solids.map(entry => ({ entry, box: bounds(entry) }));
  let checks = 0;
  let checkLimit = Infinity;
  let expanded = 0;
  const budgetExceeded = Symbol("navigation budget");
  function local(x, z) {
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32), key = cx + ":" + cz;
    if (localCache.has(key)) return localCache.get(key);
    const pad = radius + 1;
    const select = list => list.filter(({ box: b }) => !Number.isFinite(b.minX)
      || (b.maxX >= cx * 32 - pad && b.minX <= (cx + 1) * 32 + pad && b.maxZ >= cz * 32 - pad && b.minZ <= (cz + 1) * 32 + pad)).map(item => item.entry);
    const sub = { ...index };
    // De afgeronde rand (Lopen en botsen) gaat niet mee met { ...index }: zelf doorgeven.
    if (index.edgeField) sub.edgeField = index.edgeField;
    for (const key of Object.keys(groups)) sub[key] = select(groups[key]);
    const result = { index: sub, solids: select(solidBounds) };
    if (localCache.size >= maxCells) localCache.delete(localCache.keys().next().value);
    localCache.set(key, result);
    return result;
  }
  const point = (x, z) => ({ x, y: groundHeightAt(local(x, z).index, x, z), z });
  const scratch = {};
  function canStep(from, to) {
    if (checks >= checkLimit) throw budgetExceeded;
    checks += 1;
    const nearby = local(to.x, to.z);
    for (const solid of nearby.solids) if (Math.hypot(to.x - solid.x, to.z - solid.z) < solid.radius + radius) return false;
    return resolveMovementCandidateInto(scratch, from.x, from.y, from.z, to.x, to.y, to.z, nearby.index, ground, nearby.solids, radius)
      && Math.hypot(scratch.x - to.x, scratch.z - to.z) < 0.00001;
  }
  const free = p => canStep(p, p);
  function lineClear(from, to) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / Math.min(0.2, radius * 0.5)));
    let previous = from;
    for (let i = 1; i <= steps; i += 1) {
      const next = { x: from.x + (to.x - from.x) * i / steps, y: previous.y, z: from.z + (to.z - from.z) * i / steps };
      if (!canStep(previous, next)) return false;
      previous = { x: next.x, y: scratch.y, z: next.z };
    }
    return true;
  }

  // Bruggen zijn smalle verbindingen die een grof raster zou missen. Hun middenlijn
  // en open in-/uitgangen vormen vaste tussenpunten, ongeacht de afstand tot de speler.
  const anchors = [];
  const addAnchor = p => { if (free(p) && !anchors.some(a => Math.hypot(a.x - p.x, a.z - p.z) < 0.05)) anchors.push(p); };
  for (const surface of index.walkables || []) {
    const points = surface.points || [];
    if (points.length < 3) continue;
    const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, z: points.reduce((sum, p) => sum + p.z, 0) / points.length };
    if (points.length % 2 === 0) for (let i = 0; i < points.length / 2; i += 1) {
      addAnchor(point((points[i].x + points[points.length - 1 - i].x) / 2, (points[i].z + points[points.length - 1 - i].z) / 2));
    }
    for (let i = 0; i < points.length; i += 1) {
      if (surface.closedEdges?.includes(i)) continue;
      const a = points[i], b = points[(i + 1) % points.length];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      let nx = b.z - a.z, nz = a.x - b.x;
      if (nx * (x - center.x) + nz * (z - center.z) < 0) { nx = -nx; nz = -nz; }
      const length = Math.hypot(nx, nz) || 1;
      addAnchor(point(x, z));
      addAnchor(point(x + nx / length * (radius + 0.25), z + nz / length * (radius + 0.25)));
    }
  }

  function searchPath(start, goal, request = {}) {
    const beforeChecks = checks;
    const result = (ok, points, extra = {}) => ({ ok, points, expanded, checks: checks - beforeChecks, ...extra });
    if (![start.x, start.z, goal.x, goal.z].every(Number.isFinite)) return result(false, [], { reason: "invalid_target" });
    const origin = { ...point(start.x, start.z), y: start.y ?? groundHeightAt(index, start.x, start.z) };
    const exactGoal = point(goal.x, goal.z);
    const destinations = [];
    const arrivalRadius = Math.max(0, Number(request.arrivalRadius) || 0);
    const addDestination = p => { if (free(p)) destinations.push(p); };
    // Bij een NPC mag elke bereikbare plek binnen praatbereik het eindpunt zijn.
    // Ook een geblokkeerde voorkant mag een vrije achter-/zijkant niet uitsluiten.
    if (arrivalRadius > 0) {
      const angle = Math.atan2(origin.z - goal.z, origin.x - goal.x);
      for (const distance of [arrivalRadius, arrivalRadius * 0.6]) for (let i = 0; i < 16; i += 1) {
        addDestination(point(goal.x + Math.cos(angle + i * Math.PI / 8) * distance, goal.z + Math.sin(angle + i * Math.PI / 8) * distance));
      }
    }
    // Afgeronde rand: klik je vlak bij het water of de rots (binnen de rand), dan wordt het eindpunt de
    // dichtstbijzijnde plek net buiten de rand.
    const outsideEdge = p => !index.edgeField || index.edgeField.fieldAt(p.x, p.z) >= index.edgeField.limit || isPointOnWalkableSurface(index, p.x, p.z, 0);
    if (outsideEdge(exactGoal)) addDestination(exactGoal);
    else for (const distance of [0.5, 1, 1.5, 2, 3, 4]) {
      for (let i = 0; i < 16; i += 1) {
        const p = point(goal.x + Math.cos(i * Math.PI / 8) * distance, goal.z + Math.sin(i * Math.PI / 8) * distance);
        if (outsideEdge(p)) addDestination(p);
      }
      if (destinations.length) break;
    }
    if (!destinations.length) for (const solid of local(goal.x, goal.z).solids) {
      if (Math.hypot(solid.x - goal.x, solid.z - goal.z) > solid.radius + radius) continue;
      const angle = Math.atan2(origin.z - solid.z, origin.x - solid.x);
      for (let i = 0; i < 16; i += 1) addDestination(point(solid.x + Math.cos(angle + i * Math.PI / 8) * (solid.radius + radius + 0.05), solid.z + Math.sin(angle + i * Math.PI / 8) * (solid.radius + radius + 0.05)));
    }
    if (!destinations.length) return result(false, [], { reason: "goal_blocked" });
    destinations.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
    for (const destination of destinations) if (lineClear(origin, destination)) return result(true, [destination], { direct: true });
    const heuristic = p => Math.min(...destinations.map(d => Math.hypot(p.x - d.x, p.z - d.z)));
    const distance = heuristic(origin);
    const nodes = [origin, ...destinations, ...anchors].map((p, id) => ({ point: p, id, h: heuristic(p), g: Infinity, parent: null, closed: false, goal: id > 0 && id <= destinations.length }));
    const links = new Map();
    const visible = (a, b) => {
      const key = a.id + ":" + b.id;
      if (!links.has(key)) links.set(key, lineClear(a.point, b.point));
      return links.get(key);
    };
    const collect = reached => {
      const path = [];
      for (let node = reached; node?.parent; node = node.parent) path.push(node.point);
      return path.reverse();
    };
    const smooth = path => {
      const points = [];
      let from = origin, cursor = 0;
      while (cursor < path.length) {
        let next = Math.min(path.length - 1, cursor + 32);
        while (next > cursor && !lineClear(from, path[next])) next -= 1;
        points.push(path[next]);
        from = path[next];
        cursor = next + 1;
      }
      return points;
    };
    // Eerst een klein netwerk van zichtlijnen en bruggen. Geen raster van duizenden
    // meters afzoeken om een brug te vinden die al bekend is uit het loopvlak.
    const open = heap();
    nodes[0].g = 0;
    open.push(nodes[0]);
    while (open.length) {
      const { node, g } = open.pop();
      if (node.closed || node.g !== g) continue;
      node.closed = true;
      expanded += 1;
      if (node.goal) return result(true, collect(node));
      for (const next of nodes) {
        if (next.closed) continue;
        const cost = node.g + Math.hypot(next.point.x - node.point.x, next.point.z - node.point.z);
        if (cost >= next.g || !visible(node, next)) continue;
        next.g = cost; next.parent = node; open.push(next);
      }
    }
    // Om bomen of een gebogen oever heen: grof over grote afstanden, fijn bij smalle
    // doorgangen. De brugpunten blijven in elk raster bereikbaar.
    const coarse = Math.max(0.5, Math.min(Number(index.routeMaxSpacing) || 8, distance / 60));
    for (const spacing of [...new Set([coarse, Math.min(1, coarse), Math.max(0.2, Math.min(0.5, radius))])]) {
      const cells = new Map(), attachments = new Map(), frontier = heap();
      for (const node of nodes) { node.g = Infinity; node.parent = null; node.closed = false; }
      const cell = (gx, gz) => {
        const key = gx + ":" + gz;
        if (!cells.has(key)) {
          const p = point(origin.x + gx * spacing, origin.z + gz * spacing);
          cells.set(key, { point: p, gx, gz, key, h: heuristic(p), g: Infinity, parent: null, closed: false, free: free(p) });
        }
        return cells.get(key);
      };
      for (const node of nodes.slice(1)) {
        node.gridLinks = [];
        const gx = Math.round((node.point.x - origin.x) / spacing), gz = Math.round((node.point.z - origin.z) / spacing);
        for (let dz = -2; dz <= 2; dz += 1) for (let dx = -2; dx <= 2; dx += 1) {
          const candidate = cell(gx + dx, gz + dz);
          if (!candidate.free) continue;
          node.gridLinks.push(candidate);
          if (!attachments.has(candidate.key)) attachments.set(candidate.key, []);
          attachments.get(candidate.key).push(node);
        }
      }
      const first = cell(0, 0);
      first.point = origin; first.free = true; first.g = 0; frontier.push(first);
      let searched = 0;
      while (frontier.length && searched < (request.maxExpanded || index.routeMaxExpanded || 16000)) {
        const { node, g } = frontier.pop();
        if (node.closed || node.g !== g) continue;
        node.closed = true; expanded += 1; searched += 1;
        if (node.goal) return result(true, smooth(collect(node)));
        const neighbours = node.gridLinks ? [...node.gridLinks, ...nodes.slice(1)] : [...(attachments.get(node.key) || [])];
        if (!node.gridLinks) for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dz) neighbours.push(cell(node.gx + dx, node.gz + dz));
        for (const next of neighbours) {
          if (next.closed || next.free === false) continue;
          const cost = node.g + Math.hypot(next.point.x - node.point.x, next.point.z - node.point.z);
          if (cost >= next.g || !(node.id !== undefined && next.id !== undefined ? visible(node, next) : lineClear(node.point, next.point))) continue;
          next.g = cost; next.parent = node; frontier.push(next);
        }
      }
    }
    return result(false, [], { reason: "no_path" });
  }
  // Wegennet (🛣️ Weg): naar het dichtstbijzijnde stuk weg, over de weg, en eraf waar de weg het dichtst bij
  // het doel komt. Elk stuk zoekt met dezelfde botsing als hierboven (om bomen en huizen heen).
  // null = niet via de weg (kort stukje, geen weg in de buurt, of naast de weg is korter): dan de gewone route.
  const roadGraph = buildRoadGraph(index.roads || []);
  const routeLength = (from, points) => {
    let length = 0;
    let last = from;
    for (const p of points) { length += Math.hypot(p.x - last.x, p.z - last.z); last = p; }
    return length;
  };
  function searchRoadPath(start, goal, request) {
    if (!roadGraph.edges.length) return null;
    const direct = Math.hypot(goal.x - start.x, goal.z - start.z);
    const origin = { ...point(start.x, start.z), y: start.y ?? groundHeightAt(index, start.x, start.z) };
    const destination = point(goal.x, goal.z);
    const directClear = lineClear(origin, destination);
    // Een korte vrije klik hoeft niet onnodig de weg op. Is de rechte lijn
    // geblokkeerd (water, rots of een obstakel), dan mag de weg ook dichtbij
    // worden gebruikt om de veilige en kortste verbinding te vinden.
    const minDistance = Number.isFinite(index.roadMinDistance) ? index.roadMinDistance : 20;
    if (directClear && !(direct >= minDistance)) return null;
    // Kevin 8-11: dichtbij (bv. naast een NPC in het gras) gewoon lopen, ook als er iets tussen staat (de NPC zelf, een boom).
    // Alleen als de gewone looproute zelf langer is dan "Weg pas vanaf" (water ertussen, brug ver weg) mag de weg.
    if (direct < minDistance) {
      try {
        const plain = searchPath(start, goal, { ...request, maxExpanded: Math.min(Number(request.maxExpanded) || 3000, 3000) });
        if (plain.ok && routeLength(start, plain.points) <= minDistance) return plain;
      } catch (error) {
        if (error !== budgetExceeded) throw error;
      }
    }
    const weight = Math.max(1, Number(index.roadPreference) || 2);
    const candidateCount = Math.min(16, roadGraph.edges.length);
    const plan = planRoadRoute(roadGraph, start, goal, {
      offroadWeight: weight,
      candidates: candidateCount,
      // Kies bij voorkeur een op-/afstappunt dat zonder water of collider
      // ertussen bereikbaar is. Als geen kandidaat rechtstreeks bereikbaar is,
      // zoekt searchPath hieronder alsnog een omweg.
      entryAllowed: (entry) => lineClear(origin, point(entry.x, entry.z)),
      exitAllowed: (exit) => lineClear(point(exit.x, exit.z), destination)
    });
    if (!plan || (directClear && plan.cost >= weight * direct)) return null;
    const beforeChecks = checks;
    const points = [];
    let cursor = start;
    const leg = (target, legRequest) => {
      const found = searchPath(cursor, target, legRequest);
      if (!found.ok || !found.points.length) return false;
      for (const p of found.points) {
        const last = points[points.length - 1] || cursor;
        if (Math.hypot(last.x - p.x, last.z - p.z) > 0.05) points.push(p);
      }
      cursor = found.points[found.points.length - 1];
      return true;
    };
    // Bochten afronden (ook de bocht de weg op en eraf), zodat niemand scherp door de hoek gaat.
    const radius = Number.isFinite(index.roadCornerRadius) ? index.roadCornerRadius : 4;
    const targets = roundRoadCorners([{ x: start.x, z: start.z }, ...plan.points, { x: goal.x, z: goal.z }], radius).slice(1, -1);
    // Naar de weg toe mag net zo ver zoeken als een gewone klik; over de weg alleen kleine omwegen.
    for (let i = 0; i < targets.length; i += 1) {
      if (!leg(targets[i], i === 0 ? { ...request, arrivalRadius: 0 } : { maxExpanded: 4000 })) return null;
    }
    if (!leg(goal, request)) return null;
    return { ok: true, points, expanded, checks: checks - beforeChecks, road: true };
  }
  function findPath(start, goal, request = {}) {
    const beforeChecks = checks;
    expanded = 0;
    checkLimit = Number.isFinite(request.maxChecks) ? checks + Math.max(0, request.maxChecks) : Infinity;
    try {
      if (request.roads && [start?.x, start?.z, goal?.x, goal?.z].every(Number.isFinite)) {
        const viaRoad = searchRoadPath(start, goal, request);
        if (viaRoad) return viaRoad;
      }
      return searchPath(start, goal, request);
    } catch (error) {
      if (error !== budgetExceeded) throw error;
      return { ok: false, points: [], reason: "budget", expanded, checks: checks - beforeChecks };
    } finally {
      checkLimit = Infinity;
    }
  }
  return {
    findPath,
    isFree: (x, z) => free(point(x, z)),
    lineClear: (from, to) => lineClear({ ...point(from.x, from.z), ...from }, to)
  };
}

export function findPlayerPath(start, goal, options = {}) {
  return createPlayerNavigator(options).findPath(start, goal, options);
}
