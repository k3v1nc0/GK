// Kevin 23-11: 🧱 Muur (Area tool). Je tekent een kamer met punten; langs elke rand staat een muur. Met Randen
// kies je per rand Muur, Deur, Raam of Open. Gedeeld door de server (botsing) en de browser (tekenen), zodat de
// muur die je ziet precies de muur is waar je tegenaan loopt.

export const WALL_EDGE_KINDS = Object.freeze(["wall", "door", "window", "open"]);
// Per soort rand een lijst randnummers in de instellingen; een rand die nergens in staat is een muur.
export const WALL_EDGE_KEYS = Object.freeze({ door: "doorEdges", window: "windowEdges", open: "openEdges" });
export const WALL_DEFAULTS = Object.freeze({ height: 3, thickness: 0.3, textureMeters: 2, doorHeight: 2.4, windowSill: 1, windowTop: 2.2 });

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
    doorHeight: clamp(num(values.doorHeight, WALL_DEFAULTS.doorHeight), 0.5, height),
    windowSill: clamp(num(values.windowSill, WALL_DEFAULTS.windowSill), 0, height),
    windowTop: clamp(num(values.windowTop, WALL_DEFAULTS.windowTop), 0, height),
    edges: wallEdgeKinds(points.length, values)
  };
}

function solidKind(kind) {
  return kind === "wall" || kind === "window" || kind === "door";
}

// Per rand een stuk muur, met de hoek dicht: waar twee muren in een hoek samenkomen loopt elk stuk een halve dikte door.
// Uitkomst per stuk: begin- en eindpunt (al verlengd), de soort rand en de hoogtes [van, tot] boven de grond.
export function wallPieces(wall) {
  const points = Array.isArray(wall?.points) ? wall.points : [];
  const n = points.length;
  if (n < 2) return [];
  const half = num(wall.thickness, WALL_DEFAULTS.thickness) / 2;
  const height = num(wall.height, WALL_DEFAULTS.height);
  const edges = Array.isArray(wall.edges) ? wall.edges : [];
  const dirOf = (i) => {
    const a = points[i]; const b = points[(i + 1) % n];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return length > 0.001 ? { x: (b.x - a.x) / length, z: (b.z - a.z) / length, length } : null;
  };
  const pieces = [];
  for (let i = 0; i < n; i += 1) {
    const kind = edges[i] || "wall";
    if (kind === "open") continue;
    const dir = dirOf(i);
    if (!dir) continue;
    const a = points[i];
    const b = points[(i + 1) % n];
    // Doorlopen in de hoek als de buurrand ook een muur is en er een echte hoek zit (geen rechte lijn).
    const extendAt = (neighbour) => {
      const other = dirOf(neighbour);
      if (!other || !solidKind(edges[neighbour] || "wall")) return 0;
      return Math.abs(dir.x * other.x + dir.z * other.z) < 0.985 ? half : 0;
    };
    const startExtra = extendAt((i - 1 + n) % n);
    const endExtra = extendAt((i + 1) % n);
    const ax = a.x - dir.x * startExtra; const az = a.z - dir.z * startExtra;
    const bx = b.x + dir.x * endExtra; const bz = b.z + dir.z * endExtra;
    const baseY = Math.min(num(a.y, 0), num(b.y, 0)) - 0.05;
    const spans = [];
    if (kind === "wall") spans.push([0, height]);
    else if (kind === "door") { if (wall.doorHeight < height - 0.01) spans.push([wall.doorHeight, height]); }
    else if (kind === "window") {
      const sill = Math.min(wall.windowSill, wall.windowTop);
      const top = Math.max(wall.windowSill, wall.windowTop);
      if (sill > 0.01) spans.push([0, sill]);
      if (top < height - 0.01) spans.push([top, height]);
    }
    for (const [from, to] of spans) {
      if (to - from < 0.01) continue;
      pieces.push({ edge: i, kind, ax, az, bx, bz, baseY, from: from + (from === 0 ? -0.05 : 0), to, thickness: half * 2 });
    }
  }
  return pieces;
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
      id: wall.id + "::muur" + piece.edge, label: wall.label, shapeType: "polygon", reason: "wall",
      points: [
        { x: piece.ax + nx, z: piece.az + nz }, { x: piece.bx + nx, z: piece.bz + nz },
        { x: piece.bx - nx, z: piece.bz - nz }, { x: piece.ax - nx, z: piece.az - nz }
      ]
    });
  }
  return out;
}
