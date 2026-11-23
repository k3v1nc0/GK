// Kevin 23-11: 🧱 Muur. Je tekent muren als net (punten en lijnen, zoals de Weg). Per lijn kies je Muur, Deur, Raam
// of Open (kaart, onder ⚙️ meer). Gedeeld door de server (botsing) en de browser (tekenen), zodat de
// muur die je ziet precies de muur is waar je tegenaan loopt.

// Kevin 23-11 (7): "gate" = Deur (dicht): een dichte muur met aan beide kanten een deur-plaatje (door een doorgang/portal).
export const WALL_EDGE_KINDS = Object.freeze(["wall", "door", "window", "open", "gate"]);
// Per soort rand een lijst randnummers in de instellingen; een rand die nergens in staat is een muur.
export const WALL_EDGE_KEYS = Object.freeze({ door: "doorEdges", window: "windowEdges", open: "openEdges" });
export const WALL_DEFAULTS = Object.freeze({ height: 3, thickness: 0.3, textureMeters: 2, doorHeight: 2.4, windowSill: 1, windowTop: 2.2, windowLight: 1, windowRays: 1 });

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Rand i loopt van punt i naar punt i+1 (de laatste rand terug naar punt 0).
export function wallEdgeKinds(pointCount, settings = {}) {
  const kinds = Array.from({ length: Math.max(0, pointCount) }, () => "wall");
  for (const [kind, key] of Object.entries(WALL_EDGE_KEYS)) {
    for (const edge of Array.isArray(settings?.[key]) ? settings[key] : []) {
      if (Number.isInteger(edge) && edge >= 0 && edge < kinds.length) kinds[edge] = kind;
    }
  }
  return kinds;
}

// Instellingen van een muur-vlak (area settings) -> lijsten per soort rand na een keuze in Randen.
export function editWallEdges(pointCount, settings, selectedEdges, kind) {
  const kinds = wallEdgeKinds(pointCount, settings);
  for (const edge of selectedEdges || []) if (Number.isInteger(edge) && edge >= 0 && edge < kinds.length) kinds[edge] = WALL_EDGE_KINDS.includes(kind) ? kind : "wall";
  const out = {};
  for (const [edgeKind, key] of Object.entries(WALL_EDGE_KEYS)) {
    const list = kinds.map((value, index) => (value === edgeKind ? index : -1)).filter((index) => index >= 0);
    out[key] = list.length ? list : null;
  }
  return out;
}

// Kevin 23-11 (2): een 🧱 Muur is een net zoals de Weg: punten en lijnen, aan één punt zoveel muren als je wilt
// (T-splitsing, kruising). Een lijn is [punt, punt] of [punt, punt, soort] met soort 1 = deur, 2 = raam, 3 = open
// (geen soort = muur). Een oude muur zonder lijnen is een gesloten ring (rand i = punt i naar punt i+1).
export const WALL_KIND_CODES = Object.freeze({ wall: 0, door: 1, window: 2, open: 3, gate: 4 });
export function wallLinkKind(link) {
  return WALL_EDGE_KINDS[Number.isInteger(link?.[2]) ? link[2] : 0] || "wall";
}
export function wallLinkWithKind(link, kind) {
  const code = WALL_KIND_CODES[kind] || 0;
  return code ? [link[0], link[1], code] : [link[0], link[1]];
}
// Lijnen van een muur-document (pointsMm + links + settings): het net, of de ring met de soorten uit de oude lijsten.
export function wallNetLinks(pointCount, links, settings = {}) {
  const count = Math.max(0, Number(pointCount) || 0);
  if (Array.isArray(links)) {
    return links.filter((link) => Array.isArray(link) && link.length >= 2 && link[0] !== link[1]
      && Number.isInteger(link[0]) && Number.isInteger(link[1]) && link[0] >= 0 && link[1] >= 0 && link[0] < count && link[1] < count)
      .map((link) => wallLinkWithKind(link, wallLinkKind(link)));
  }
  if (count < 2) return [];
  const kinds = wallEdgeKinds(count, settings);
  const ring = [];
  for (let i = 0; i < (count === 2 ? 1 : count); i += 1) ring.push(wallLinkWithKind([i, (i + 1) % count], kinds[i]));
  return ring;
}

// Area-waarden (meters, zoals areaNodeValues ze geeft) -> muur voor de wereld.
export function wallFromAreaValues(id, values = {}) {
  const points = (Array.isArray(values.points) ? values.points : [])
    .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z)))
    .map((point) => ({ x: Number(point.x), y: num(point.y, 0), z: Number(point.z) }));
  const height = clamp(num(values.wallHeight, WALL_DEFAULTS.height), 0.2, 50);
  return {
    id, label: values.label || id, points,
    height,
    thickness: clamp(num(values.wallThickness, WALL_DEFAULTS.thickness), 0.05, 5),
    color: typeof values.wallColor === "string" && /^#[0-9a-fA-F]{6}$/.test(values.wallColor) ? values.wallColor : null,
    textureAssetId: values.wallTextureAssetId || null,
    textureMeters: clamp(num(values.wallTextureMeters, WALL_DEFAULTS.textureMeters), 0.1, 50),
    textureFit: values.wallTextureFit === "height" ? "height" : "tile",
    doorHeight: clamp(num(values.doorHeight, WALL_DEFAULTS.doorHeight), 0.5, height),
    windowSill: clamp(num(values.windowSill, WALL_DEFAULTS.windowSill), 0, height),
    windowTop: clamp(num(values.windowTop, WALL_DEFAULTS.windowTop), 0, height),
    topTextureAssetId: values.wallTopTextureAssetId || null,
    windowTextureAssetId: values.windowTextureAssetId || null,
    doorTextureAssetId: values.wallDoorTextureAssetId || null,
    windowLight: clamp(num(values.windowLight, WALL_DEFAULTS.windowLight), 0, 3),
    windowRays: clamp(num(values.windowRays, WALL_DEFAULTS.windowRays), 0, 3),
    links: wallNetLinks(points.length, values.links, values).map((link) => ({ a: link[0], b: link[1], kind: wallLinkKind(link) }))
  };
}

// Een hele muur van onder tot boven (een Deur (gat) is alleen het stuk boven de deur en houdt zijn kopjes).
function fullKind(kind) {
  return kind === "wall" || kind === "window" || kind === "gate";
}

function solidKind(kind) {
  return kind === "wall" || kind === "window" || kind === "door" || kind === "gate";
}

function wallLinksOf(wall, n) {
  if (Array.isArray(wall?.links)) return wall.links.filter((link) => link && link.a !== link.b && link.a >= 0 && link.b >= 0 && link.a < n && link.b < n);
  // Oud (zonder lijnen): ring met de soorten per rand.
  const edges = Array.isArray(wall?.edges) ? wall.edges : [];
  return n < 2 ? [] : Array.from({ length: n === 2 ? 1 : n }, (_, i) => ({ a: i, b: (i + 1) % n, kind: edges[i] || "wall" }));
}

// Per lijn een stuk muur, met de hoeken dicht: waar een andere muur onder een hoek aan hetzelfde punt zit, loopt het stuk
// een halve dikte door (hoek, T-splitsing, kruising). Een raam is een dicht stuk (het licht komt van wallWindows).
// Uitkomst per stuk: begin- en eindpunt (al verlengd), de soort lijn en de hoogtes [van, tot] boven de grond.
export function wallPieces(wall) {
  const points = Array.isArray(wall?.points) ? wall.points : [];
  const n = points.length;
  if (n < 2) return [];
  const half = num(wall.thickness, WALL_DEFAULTS.thickness) / 2;
  const height = num(wall.height, WALL_DEFAULTS.height);
  const links = wallLinksOf(wall, n);
  const dirOf = (link) => {
    const a = points[link.a]; const b = points[link.b];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return length > 0.001 ? { x: (b.x - a.x) / length, z: (b.z - a.z) / length, length } : null;
  };
  const dirs = links.map(dirOf);
  const atPoint = new Map();
  links.forEach((link, k) => {
    if (!solidKind(link.kind || "wall") || !dirs[k]) return;
    for (const end of [link.a, link.b]) { if (!atPoint.has(end)) atPoint.set(end, []); atPoint.get(end).push(k); }
  });
  const pieces = [];
  links.forEach((link, k) => {
    const kind = link.kind || "wall";
    const dir = dirs[k];
    if (kind === "open" || !dir) return;
    const a = points[link.a];
    const b = points[link.b];
    // Doorlopen als er aan dat punt een andere muur onder een hoek zit (geen rechte lijn).
    const extendAt = (end) => ((atPoint.get(end) || []).some((other) => other !== k && Math.abs(dir.x * dirs[other].x + dir.z * dirs[other].z) < 0.985) ? half : 0);
    const startExtra = extendAt(link.a);
    const endExtra = extendAt(link.b);
    const ax = a.x - dir.x * startExtra; const az = a.z - dir.z * startExtra;
    const bx = b.x + dir.x * endExtra; const bz = b.z + dir.z * endExtra;
    const baseY = Math.min(num(a.y, 0), num(b.y, 0)) - 0.05;
    const spans = [];
    if (kind === "wall" || kind === "window" || kind === "gate") spans.push([0, height]);
    else if (kind === "door") { if (wall.doorHeight < height - 0.01) spans.push([wall.doorHeight, height]); }
    for (const [from, to] of spans) {
      if (to - from < 0.01) continue;
      pieces.push({ edge: k, kind, ax, az, bx, bz, baseY, from: from + (from === 0 ? -0.05 : 0), to, thickness: half * 2 });
    }
  });
  return pieces;
}

// Kevin 23-11 (2): een Raam-lijn is dicht, met aan de binnenkant een raam (eigen textuur, gloeit) en een zonnevlek op
// de vloer. Binnen = de kant van het midden van alle muurpunten (bij een huis: de kamer in).
// Uitkomst per raam: midden onderaan (x, z), richting langs de muur (ux, uz), naar binnen (nx, nz), breedte, van/tot.
export function wallWindows(wall) {
  const points = Array.isArray(wall?.points) ? wall.points : [];
  const n = points.length;
  if (n < 2) return [];
  const links = wallLinksOf(wall, n);
  if (!links.some((link) => link.kind === "window")) return [];
  const cx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const cz = points.reduce((sum, p) => sum + p.z, 0) / n;
  const half = num(wall.thickness, WALL_DEFAULTS.thickness) / 2;
  const height = num(wall.height, WALL_DEFAULTS.height);
  const sill = clamp(Math.min(num(wall.windowSill, WALL_DEFAULTS.windowSill), num(wall.windowTop, WALL_DEFAULTS.windowTop)), 0, height);
  const top = clamp(Math.max(num(wall.windowSill, WALL_DEFAULTS.windowSill), num(wall.windowTop, WALL_DEFAULTS.windowTop)), 0, height);
  const out = [];
  links.forEach((link, k) => {
    if (link.kind !== "window") return;
    const a = points[link.a]; const b = points[link.b];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.2 || top - sill < 0.05) return;
    const ux = (b.x - a.x) / length; const uz = (b.z - a.z) / length;
    let nx = -uz; let nz = ux;
    const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2;
    if (nx * (cx - mx) + nz * (cz - mz) < 0) { nx = -nx; nz = -nz; }
    out.push({ edge: k, x: mx + nx * half, z: mz + nz * half, baseY: Math.min(num(a.y, 0), num(b.y, 0)), ux, uz, nx, nz,
      width: length, sill, top, light: num(wall.windowLight, WALL_DEFAULTS.windowLight),
      rays: num(wall.windowRays, WALL_DEFAULTS.windowRays) });
  });
  return out;
}

// Botsing: elke rand die Muur of Raam is, als dichte rechthoek (een deur en een open rand laten je door).
export function wallBlockers(wall) {
  const out = [];
  const seen = new Set();
  for (const piece of wallPieces(wall)) {
    if (piece.kind === "door" || seen.has(piece.edge)) continue;
    seen.add(piece.edge);
    const dx = piece.bx - piece.ax; const dz = piece.bz - piece.az;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) continue;
    const nx = -dz / length * piece.thickness / 2;
    const nz = dx / length * piece.thickness / 2;
    out.push({
      id: wall.id + "::muur" + piece.edge, label: wall.label, shapeType: "polygon", reason: "wall", height: num(wall.height, WALL_DEFAULTS.height),
      points: [
        { x: piece.ax + nx, z: piece.az + nz }, { x: piece.bx + nx, z: piece.bz + nz },
        { x: piece.bx - nx, z: piece.bz - nz }, { x: piece.ax - nx, z: piece.az - nz }
      ]
    });
  }
  return out;
}

// Kevin 23-11 (7): Deur (dicht): op een "gate"-lijn aan beide kanten van de muur een deur-plaatje, onderaan op de grond.
// Uitkomst per kant: midden onderaan (x, z) net op de muur, naar buiten (nx, nz), breedte = lijn, hoogte = deurhoogte.
export function wallDoors(wall) {
  const points = Array.isArray(wall?.points) ? wall.points : [];
  const n = points.length;
  if (n < 2) return [];
  const links = wallLinksOf(wall, n);
  const half = num(wall.thickness, WALL_DEFAULTS.thickness) / 2;
  const height = num(wall.height, WALL_DEFAULTS.height);
  const doorHeight = clamp(num(wall.doorHeight, WALL_DEFAULTS.doorHeight), 0.5, height);
  const out = [];
  links.forEach((link, k) => {
    if (link.kind !== "gate") return;
    const a = points[link.a]; const b = points[link.b];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.2) return;
    const ux = (b.x - a.x) / length; const uz = (b.z - a.z) / length;
    const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2;
    for (const side of [1, -1]) {
      const nx = -uz * side; const nz = ux * side;
      out.push({ edge: k, side, x: mx + nx * half, z: mz + nz * half, nx, nz, baseY: Math.min(num(a.y, 0), num(b.y, 0)),
        width: length, height: doorHeight, maxHeight: height });
    }
  });
  return out;
}

// Kevin 23-11 (7): mooie hoeken. Op een punt met precies twee muurlijnen lopen de zijkanten schuin door (verstek), zonder
// overlap of uitstekend blokje, en de textuur loopt door (u = afstand langs de muur, over de punten heen doorgeteld).
// Alleen voor het tekenen; de botsing (wallPieces/wallBlockers) blijft hetzelfde.
// Uitkomst per lijn (zelfde volgorde als wallPieces' edge): a/b = { left, right } hoekpunten [x, z] of null (gewone
// kop), sx/sz = punt a, length = lengte a-b, uStart = u van de linkerkant bij punt a (rechterkant: -u, dan staat de
// textuur aan beide kanten niet in spiegelbeeld), flip = de lijn ligt andersom in de rij (voor de bovenkant).
export function wallJoins(wall) {
  const points = Array.isArray(wall?.points) ? wall.points : [];
  const n = points.length;
  if (n < 2) return [];
  const half = num(wall.thickness, WALL_DEFAULTS.thickness) / 2;
  const links = wallLinksOf(wall, n);
  const dirs = links.map((link) => {
    const a = points[link.a]; const b = points[link.b];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return length > 0.001 ? { x: (b.x - a.x) / length, z: (b.z - a.z) / length, length } : null;
  });
  const atPoint = new Map();
  links.forEach((link, k) => {
    if (!fullKind(link.kind || "wall") || !dirs[k]) return;
    for (const end of [link.a, link.b]) { if (!atPoint.has(end)) atPoint.set(end, []); atPoint.get(end).push(k); }
  });
  const out = links.map((link, k) => ({ a: null, b: null, uStart: 0, flip: false, length: dirs[k] ? dirs[k].length : 0, sx: points[link.a].x, sz: points[link.a].z }));
  links.forEach((link, k) => {
    const dir = dirs[k];
    if (!dir || !fullKind(link.kind || "wall")) return;
    for (const end of ["a", "b"]) {
      const p = link[end];
      const list = atPoint.get(p) || [];
      if (list.length !== 2) continue;
      const other = list[0] === k ? list[1] : list[0];
      const od = dirs[other];
      // Weg van het punt langs deze lijn (e) en langs de andere (e2); de looprichting gaat van deze lijn de andere in.
      const e = end === "a" ? dir : { x: -dir.x, z: -dir.z };
      const e2 = links[other].a === p ? od : { x: -od.x, z: -od.z };
      const na = { x: e.z, z: -e.x };
      const nb = { x: -e2.z, z: e2.x };
      const denom = 1 + na.x * nb.x + na.z * nb.z;
      if (denom < 0.3) continue; // heel scherpe hoek: gewone koppen (anders steekt de punt ver uit)
      const mx = (na.x + nb.x) / denom * half;
      const mz = (na.z + nb.z) / denom * half;
      const P = points[p];
      const plus = [P.x + mx, P.z + mz];
      const minus = [P.x - mx, P.z - mz];
      out[k][end] = end === "a" ? { left: minus, right: plus } : { left: plus, right: minus };
    }
  });
  // u per punt (w): vanaf een begin langs de lijnen doortellen, altijd oplopend in de looprichting. Ligt een lijn andersom
  // (van b naar a gelopen), dan wisselen links en rechts; zo sluit de textuur aan, hoe je de lijnen ook getekend hebt.
  // Bij een ring of kruising zit ergens één naad.
  const wAt = new Map();
  const walked = new Map();
  const touching = new Map();
  links.forEach((link, k) => {
    if (!dirs[k]) return;
    for (const end of [link.a, link.b]) { if (!touching.has(end)) touching.set(end, []); touching.get(end).push(k); }
  });
  for (const link of links) {
    if (wAt.has(link.a)) continue;
    wAt.set(link.a, 0);
    const stack = [link.a];
    while (stack.length) {
      const p = stack.pop();
      for (const k of touching.get(p) || []) {
        const l = links[k];
        const q = l.a === p ? l.b : l.a;
        if (wAt.has(q)) continue;
        wAt.set(q, wAt.get(p) + dirs[k].length);
        walked.set(k, l.a === p ? 1 : -1);
        stack.push(q);
      }
    }
  }
  links.forEach((link, k) => {
    const sign = walked.get(k) || 1;
    out[k].uStart = sign * (wAt.get(link.a) || 0);
    out[k].flip = sign < 0;
  });
  return out;
}
