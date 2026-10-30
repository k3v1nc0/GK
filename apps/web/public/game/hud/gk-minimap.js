// Stap 4 (HUD): minimap en grote kaart. De ondergrond komt uit kaarttegels (foto's van de wereld van bovenaf, gemaakt
// bij SAVE TO GAME); zolang die er niet zijn, een simpel getekend kaartje uit de wereld zelf. Daarover de mist en
// stippen voor jezelf, NPC's, vijanden, grondstoffen, pickups, medespelers, portals, het quest-doel en je pin.

const MARKER_COLORS = {
  npc: "#ffd34d",
  enemy: "#ff4b4b",
  resource: "#63d65f",
  pickup: "#8fe3ff",
  player: "#4da3ff",
  quest: "#ffb020",
  portal: "#c77dff",
  pin: "#ff4fd8"
};
const MIN_SPAN_M = 30;     // grote kaart: verder inzoomen dan 30 m breed heeft geen zin

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pointsOf(list) {
  return (Array.isArray(list) ? list : []).map(function (point) {
    return Array.isArray(point) ? { x: num(point[0], NaN), z: num(point[1], NaN) } : { x: num(point?.x, NaN), z: num(point?.z, NaN) };
  }).filter(function (point) { return Number.isFinite(point.x) && Number.isFinite(point.z); });
}

// Grondkleur iets donkerder en minder fel, zodat de stippen goed opvallen.
function mapColor(color, fallback) {
  const text = String(color || "").trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(text);
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  const r = Math.round(((value >> 16) & 255) * 0.72);
  const g = Math.round(((value >> 8) & 255) * 0.72);
  const b = Math.round((value & 255) * 0.72);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function shapePath(g, shape, toPx) {
  const type = String(shape?.shapeType || (Array.isArray(shape?.points) && shape.points.length ? "polygon" : "box"));
  g.beginPath();
  if (type === "circle" || type === "cylinder") {
    const center = toPx(num(shape.x), num(shape.z));
    g.arc(center.u, center.v, Math.max(1, num(shape.radius, 1) * center.s), 0, Math.PI * 2);
    return true;
  }
  if (type === "polygon" || type === "path") {
    const points = pointsOf(shape.points);
    if (points.length < 3) return false;
    points.forEach(function (point, index) {
      const p = toPx(point.x, point.z);
      if (index === 0) g.moveTo(p.u, p.v);
      else g.lineTo(p.u, p.v);
    });
    g.closePath();
    return true;
  }
  const width = num(shape.width, 0);
  const depth = num(shape.depth, 0);
  if (width <= 0 || depth <= 0) return false;
  const corner = toPx(num(shape.x) - width / 2, num(shape.z) - depth / 2);
  g.rect(corner.u, corner.v, width * corner.s, depth * corner.s);
  return true;
}

// Kleur "vermenigvuldigen" alleen als de grond echt een tint heeft (wit = de texture zoals hij is).
function tintOf(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!match) return null;
  return match[1].toLowerCase() === "ffffff" ? null : "#" + match[1];
}

function buildBase(world, texture) {
  const ground = world?.ground || {};
  const halfW = num(ground.width, 200) / 2;
  const halfD = num(ground.depth, num(ground.width, 200)) / 2;
  const minX = num(ground.minX, -halfW);
  const maxX = num(ground.maxX, halfW);
  const minZ = num(ground.minZ, -halfD);
  const maxZ = num(ground.maxZ, halfD);
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);
  const scale = Math.min(3, 768 / Math.max(width, depth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(width * scale));
  canvas.height = Math.max(2, Math.ceil(depth * scale));
  const g = canvas.getContext("2d");
  const toPx = function (x, z) { return { u: (x - minX) * scale, v: (z - minZ) * scale, s: scale }; };
  g.fillStyle = mapColor(ground.materialColor, "#3f6b35");
  g.fillRect(0, 0, canvas.width, canvas.height);
  // De grond-texture van de game zelf, net zo vaak herhaald als in de wereld; iets donkerder zodat de stippen opvallen.
  if (texture && texture.naturalWidth > 0) {
    try {
      const tile = Math.max(1, num(ground.textureWorldSizeX, 0) || (num(ground.width, 200) / Math.max(1, num(ground.textureRepeat, 8))));
      const pattern = g.createPattern(texture, "repeat");
      const k = (tile * scale) / texture.naturalWidth;
      if (pattern && typeof pattern.setTransform === "function") pattern.setTransform(new DOMMatrix([k, 0, 0, (tile * scale) / texture.naturalHeight, 0, 0]));
      g.fillStyle = pattern;
      g.fillRect(0, 0, canvas.width, canvas.height);
      const tint = tintOf(ground.materialColor);
      if (tint) {
        g.globalCompositeOperation = "multiply";
        g.fillStyle = tint;
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalCompositeOperation = "source-over";
      }
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(0, 0, canvas.width, canvas.height);
    } catch {}
  }
  // Een vaag raster om de 25 m: zo zie je dat je beweegt, ook op een lege grond.
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 1;
  const step = 25 * scale;
  for (let u = step; u < canvas.width; u += step) { g.beginPath(); g.moveTo(u, 0); g.lineTo(u, canvas.height); g.stroke(); }
  for (let v = step; v < canvas.height; v += step) { g.beginPath(); g.moveTo(0, v); g.lineTo(canvas.width, v); g.stroke(); }
  for (const surface of Array.isArray(world?.terrain?.surfaces) ? world.terrain.surfaces : []) {
    if (!shapePath(g, surface, toPx)) continue;
    g.globalAlpha = Math.max(0.35, Math.min(1, num(surface.opacity, 1)));
    g.fillStyle = mapColor(surface.fallbackColor, "#7a6440");
    g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = "rgba(12,16,24,0.62)";
  for (const blocker of Array.isArray(world?.collision?.blockers) ? world.collision.blockers : []) {
    if (shapePath(g, blocker, toPx)) g.fill();
  }
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineWidth = 2;
  g.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  return { canvas, minX, minZ, scale };
}

function drawMarker(ctx, kind, x, y, dot) {
  ctx.fillStyle = MARKER_COLORS[kind] || "#ffffff";
  ctx.beginPath();
  if (kind === "npc") {
    ctx.moveTo(x, y - dot * 1.2);
    ctx.lineTo(x + dot * 1.1, y);
    ctx.lineTo(x, y + dot * 1.2);
    ctx.lineTo(x - dot * 1.1, y);
    ctx.closePath();
  } else if (kind === "portal") {
    ctx.arc(x, y, dot * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = "#2a0b45";
    ctx.arc(x, y, dot * 0.6, 0, Math.PI * 2);
  } else {
    ctx.arc(x, y, kind === "pickup" ? dot * 0.75 : dot, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

function drawStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    else ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Je eigen pin: een speldje met de punt precies op de plek.
function drawPin(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y - r * 1.3, r * 0.72, Math.PI * 0.75, Math.PI * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = "#ffffff";
  ctx.arc(x, y - r * 1.3, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

// Een doel (quest-ster of je pin). edge(p) geeft null als p in beeld is, anders de plek op de rand
// waar een pijltje in de goede richting komt. Geeft true als het doel zelf getekend is (dan kun je erop tikken).
function drawGoal(ctx, kind, p, dot, edge) {
  ctx.fillStyle = MARKER_COLORS[kind];
  ctx.strokeStyle = kind === "pin" ? "rgba(40,0,30,0.9)" : "rgba(40,20,0,0.9)";
  ctx.lineWidth = Math.max(1, dot * 0.3);
  const out = edge(p);
  if (!out) {
    if (kind === "pin") drawPin(ctx, p.x, p.y, dot * 1.6);
    else drawStar(ctx, p.x, p.y, dot * 1.9);
    return true;
  }
  ctx.save();
  ctx.translate(out.x, out.y);
  ctx.rotate(out.angle);
  ctx.beginPath();
  ctx.moveTo(dot * 1.8, 0);
  ctx.lineTo(-dot * 1.1, dot * 1.3);
  ctx.lineTo(-dot * 0.4, 0);
  ctx.lineTo(-dot * 1.1, -dot * 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return false;
}

function iconScale(value) {
  return Math.max(0.4, Math.min(2.5, num(value, 1)));
}

function drawArrow(ctx, x, y, angle, r, lineWidth) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.75, r * 0.7);
  ctx.lineTo(-r * 0.35, 0);
  ctx.lineTo(-r * 0.75, -r * 0.7);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = lineWidth;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// textureUrl(world): de url van de grond-texture (of null), voor de getekende reservekaart als er nog geen tegels zijn.
// onUpdate(): wordt aangeroepen als er een kaarttegel binnen is (dan kan de kaart meteen opnieuw tekenen).
const TILE_CACHE_MAX = 64;   // zoveel tegels hooguit in het geheugen (oude laptop)
const TILE_LOADS_MAX = 6;    // zoveel tegels tegelijk laden
const FOG_PX = 4;            // pixels per mistvakje in het mistplaatje

export function createHudMinimap(canvas, textureUrl, onUpdate) {
  const ctx = canvas.getContext("2d");
  let base = null;
  let baseWorld = null;
  let texture = null;
  let textureSrc = "";

  // ---- kaarttegels (gemaakt bij SAVE TO GAME): puzzelstukjes in lagen; laag 0 is het scherpst ----
  // manifest van /api/game/minimap: { baseUrl, tilePx, baseMeters, levels, bounds, tiles { "laag:tx:tz": bestandsnaam } }
  let tiles = null;
  function setTiles(manifest) {
    const names = manifest && manifest.tiles && typeof manifest.tiles === "object" ? manifest.tiles : null;
    const b = manifest?.bounds || {};
    const sig = names ? String(manifest.bakedAt || "") + "|" + Object.keys(names).length : "";
    if ((tiles ? tiles.sig : "") === sig) return;
    if (!names || !(num(b.maxX, NaN) > num(b.minX, NaN)) || !(num(b.maxZ, NaN) > num(b.minZ, NaN))) { tiles = null; return; }
    tiles = {
      sig,
      base: Math.max(1, num(manifest.baseMeters, 32)),
      px: Math.max(64, num(manifest.tilePx, 512)),
      levels: Math.max(1, Math.min(10, Math.round(num(manifest.levels, 1)))),
      root: String(manifest.baseUrl || "/assets/minimap-tiles/"),
      names,
      bounds: { minX: num(b.minX), maxX: num(b.maxX), minZ: num(b.minZ), maxZ: num(b.maxZ) },
      cache: new Map(),
      loading: 0,
      seen: null
    };
    tileSeenRebuild();
  }
  // Welke tegels je (deels) kunt zien, per laag; alleen die worden geladen. null = geen mist, alles mag.
  // Een ontdekt vakje telt mee met de zachte rand van de mist erbij, anders zie je door die rand heen een gat.
  function tileSeenAdd(keys) {
    if (!tiles || !tiles.seen || !fog) return;
    const pad = (num(fog.feather, 1) + 1) * fog.size;
    for (const key of keys) {
      const parts = String(key).split(":");
      const x0 = Number(parts[0]) * fog.size - pad;
      const x1 = (Number(parts[0]) + 1) * fog.size + pad;
      const z0 = Number(parts[1]) * fog.size - pad;
      const z1 = (Number(parts[1]) + 1) * fog.size + pad;
      for (let level = 0; level < tiles.levels; level += 1) {
        const size = tiles.base * Math.pow(2, level);
        const seen = tiles.seen[level];
        for (let tz = Math.floor(z0 / size); tz <= Math.floor((z1 - 0.001) / size); tz += 1) {
          for (let tx = Math.floor(x0 / size); tx <= Math.floor((x1 - 0.001) / size); tx += 1) seen.add(tx + ":" + tz);
        }
      }
    }
  }
  function tileSeenRebuild() {
    if (!tiles) return;
    if (!fog) { tiles.seen = null; return; }
    tiles.seen = Array.from({ length: tiles.levels }, function () { return new Set(); });
    tileSeenAdd(fog.cells);
  }
  // De grofste laag die nog genoeg pixels per meter heeft voor dit beeld.
  function tileLevelFor(pxPerM) {
    const level = Math.floor(Math.log2(Math.max(1e-6, (tiles.px / tiles.base) / Math.max(1e-6, pxPerM))));
    return Math.max(0, Math.min(tiles.levels - 1, level));
  }
  // fn(key, naam, x, z, grootte) voor elke ontdekte tegel van deze laag in rect; fn geeft false = stoppen.
  function tileVisit(level, rect, fn) {
    const size = tiles.base * Math.pow(2, level);
    const b = tiles.bounds;
    const x0 = Math.floor(Math.max(rect.minX, b.minX) / size);
    const x1 = Math.floor((Math.min(rect.maxX, b.maxX) - 0.001) / size);
    const z0 = Math.floor(Math.max(rect.minZ, b.minZ) / size);
    const z1 = Math.floor((Math.min(rect.maxZ, b.maxZ) - 0.001) / size);
    for (let tz = z0; tz <= z1; tz += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const key = level + ":" + tx + ":" + tz;
        const name = tiles.names[key];
        if (!name || (tiles.seen && !tiles.seen[level].has(tx + ":" + tz))) continue;
        if (fn(key, name, tx * size, tz * size, size) === false) return false;
      }
    }
    return true;
  }
  function tileLoad(key, name) {
    const t = tiles;
    if (t.loading >= TILE_LOADS_MAX) return null;
    const entry = { img: new Image(), ok: false, failed: false, used: performance.now() };
    t.loading += 1;
    entry.img.decoding = "async";
    entry.img.onload = function () {
      t.loading -= 1;
      entry.ok = true;
      if (tiles === t && typeof onUpdate === "function") onUpdate();
    };
    entry.img.onerror = function () { t.loading -= 1; entry.failed = true; };
    entry.img.src = t.root + name;
    t.cache.set(key, entry);
    return entry;
  }
  // Tegels tekenen in rect (wereld-meters); g heeft al een wereld -> scherm-transform. Zolang een scherpe tegel
  // nog laadt, ligt de grovere laag eronder: nooit een gat.
  function drawTiles(g, rect, pxPerM) {
    const want = tileLevelFor(pxPerM);
    const now = performance.now();
    const eps = 0.75 / Math.max(1e-6, pxPerM);
    const ready = function (level) {
      return tileVisit(level, rect, function (key) {
        const entry = tiles.cache.get(key);
        return Boolean(entry && (entry.ok || entry.failed));
      });
    };
    let from = want;
    while (from < tiles.levels - 1 && !ready(from)) from += 1;
    for (let level = from; level >= want; level -= 1) {
      const load = level === want || level === tiles.levels - 1;
      tileVisit(level, rect, function (key, name, x, z, size) {
        let entry = tiles.cache.get(key);
        if (!entry && load) entry = tileLoad(key, name);
        if (!entry) return true;
        entry.used = now;
        if (entry.ok) g.drawImage(entry.img, x - eps, z - eps, size + eps * 2, size + eps * 2);
        return true;
      });
    }
    if (tiles.cache.size > TILE_CACHE_MAX) {
      const old = Array.from(tiles.cache.entries()).filter(function (pair) { return pair[1].used < now && (pair[1].ok || pair[1].failed); })
        .sort(function (a, b) { return a[1].used - b[1].used; });
      for (let i = 0; i < old.length && tiles.cache.size > TILE_CACHE_MAX; i += 1) tiles.cache.delete(old[i][0]);
    }
  }

  // ---- fog of war: een klein plaatje (FOG_PX pixels per vakje); elk ontdekt vakje wordt er met een zacht rondje
  // uitgegumd. feather = hoe breed de zachte rand is (in vakjes), opacity = hoe dicht de mist is (1 = helemaal).
  // Nieuwe vakjes worden er alleen bij gegumd; het hele plaatje opnieuw maken gebeurt alleen bij een andere instelling.
  let fog = null;
  function setFog(config) {
    if (!config || !config.enabled) { fog = null; tileSeenRebuild(); return; }
    const size = Math.max(1, num(config.cellSize, 8));
    if (!fog || fog.size !== size) fog = { size, cells: new Set(), canvas: null, boundsKey: "", dirty: true, pending: [], lastKey: "", stamp: null };
    fog.color = config.color || "#05070a";
    fog.opacity = Math.max(0, Math.min(1, num(config.opacity, 1)));
    const feather = Math.max(0, Math.min(8, num(config.feather, 1)));
    if (fog.feather !== feather) { fog.feather = feather; fog.stamp = null; }
    fog.dirty = true;
    tileSeenRebuild();
  }
  function addFogCells(keys) {
    if (!fog) return false;
    const added = [];
    for (const key of Array.isArray(keys) ? keys : []) {
      const text = String(key || "");
      if (!/^-?\d+:-?\d+$/.test(text) || fog.cells.has(text)) continue;
      fog.cells.add(text);
      added.push(text);
    }
    if (!added.length) return false;
    for (const key of added) fog.pending.push(key);
    tileSeenAdd(added);
    return true;
  }
  // Direct zichtbaar maken rond de speler (de server bewaart het zelf ook).
  function revealAround(x, z, radiusCells) {
    if (!fog) return false;
    const cx = Math.floor(num(x) / fog.size);
    const cz = Math.floor(num(z) / fog.size);
    const key = cx + ":" + cz;
    if (key === fog.lastKey) return false;
    fog.lastKey = key;
    const r = Math.max(0, Math.floor(num(radiusCells, 3)));
    const limit = (r + 0.35) * (r + 0.35);
    const keys = [];
    for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dz * dz <= limit) keys.push((cx + dx) + ":" + (cz + dz));
    return addFogCells(keys);
  }
  function discovered(x, z) {
    if (!fog) return true;
    return fog.cells.has(Math.floor(num(x) / fog.size) + ":" + Math.floor(num(z) / fog.size));
  }
  // Het gum-rondje: helemaal weg tot net over de hoeken van het vakje, daarna zacht uitlopend over feather vakjes.
  function fogStamp() {
    if (fog.stamp) return fog.stamp;
    const core = FOG_PX * 0.72;
    const radius = core + fog.feather * FOG_PX;
    const side = Math.ceil(radius * 2) + 2;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const g = canvas.getContext("2d");
    const mid = side / 2;
    const gradient = g.createRadialGradient(mid, mid, 0, mid, mid, radius);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(Math.min(0.999, core / radius), "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(mid, mid, radius, 0, Math.PI * 2);
    g.fill();
    fog.stamp = { canvas, mid };
    return fog.stamp;
  }
  function fogErase(g, keys) {
    const stamp = fogStamp();
    g.globalCompositeOperation = "destination-out";
    for (const key of keys) {
      const parts = String(key).split(":");
      const i = Number(parts[0]) - fog.minCX;
      const j = Number(parts[1]) - fog.minCZ;
      if (i < -fog.feather - 1 || j < -fog.feather - 1 || i > fog.cw + fog.feather || j > fog.ch + fog.feather) continue;
      g.drawImage(stamp.canvas, (i + 0.5) * FOG_PX - stamp.mid, (j + 0.5) * FOG_PX - stamp.mid);
    }
    g.globalCompositeOperation = "source-over";
  }
  function fogFor(bounds) {
    if (!fog || !bounds) return null;
    const size = fog.size;
    const boundsKey = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].join(",");
    if (fog.boundsKey !== boundsKey || !fog.canvas) {
      fog.minCX = Math.floor(bounds.minX / size);
      fog.minCZ = Math.floor(bounds.minZ / size);
      fog.cw = Math.max(1, Math.ceil(bounds.maxX / size) - fog.minCX);
      fog.ch = Math.max(1, Math.ceil(bounds.maxZ / size) - fog.minCZ);
      fog.canvas = document.createElement("canvas");
      fog.canvas.width = fog.cw * FOG_PX;
      fog.canvas.height = fog.ch * FOG_PX;
      fog.boundsKey = boundsKey;
      fog.dirty = true;
    }
    const g = fog.canvas.getContext("2d");
    if (fog.dirty) {
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, fog.canvas.width, fog.canvas.height);
      g.fillStyle = fog.color;
      g.fillRect(0, 0, fog.canvas.width, fog.canvas.height);
      fogErase(g, fog.cells);
      fog.pending = [];
      fog.dirty = false;
    } else if (fog.pending.length) {
      fogErase(g, fog.pending);
      fog.pending = [];
    }
    return fog;
  }

  // Reservekaart (getekend uit de wereld zelf) zolang er nog geen tegels zijn.
  function ensureBase(world) {
    if (world && world !== baseWorld) {
      baseWorld = world;
      const src = typeof textureUrl === "function" ? textureUrl(world) || "" : "";
      if (src !== textureSrc) {
        textureSrc = src;
        texture = null;
        if (src) {
          const image = new Image();
          image.decoding = "async";
          image.onload = function () { if (textureSrc === src) { texture = image; baseWorld = null; } };
          image.src = src;
        }
      }
      try { base = buildBase(world, texture); } catch { base = null; }
    }
    return base;
  }
  // De grenzen van de kaart (wereld-meters): van de tegels, of van de reservekaart.
  function mapBounds(world) {
    if (tiles) return tiles.bounds;
    const layer = ensureBase(world);
    if (!layer) return null;
    return { minX: layer.minX, minZ: layer.minZ, maxX: layer.minX + layer.canvas.width / layer.scale, maxZ: layer.minZ + layer.canvas.height / layer.scale };
  }
  // Grond en mist tekenen in rect (wereld-meters); g heeft al een wereld -> scherm-transform (pxPerM pixels per meter).
  function drawGround(g, rect, pxPerM, world, bounds) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    if (tiles) drawTiles(g, rect, pxPerM);
    else {
      const layer = ensureBase(world);
      if (layer) {
        const s = layer.scale;
        const sx = Math.max(0, Math.floor((rect.minX - layer.minX) * s));
        const sy = Math.max(0, Math.floor((rect.minZ - layer.minZ) * s));
        const sw = Math.min(layer.canvas.width, Math.ceil((rect.maxX - layer.minX) * s)) - sx;
        const sh = Math.min(layer.canvas.height, Math.ceil((rect.maxZ - layer.minZ) * s)) - sy;
        if (sw > 0 && sh > 0) g.drawImage(layer.canvas, sx, sy, sw, sh, layer.minX + sx / s, layer.minZ + sy / s, sw / s, sh / s);
      }
    }
    const mist = fogFor(bounds);
    if (mist) {
      g.globalAlpha = mist.opacity;
      g.drawImage(mist.canvas, 0, 0, mist.canvas.width, mist.canvas.height, mist.minCX * mist.size, mist.minCZ * mist.size, mist.cw * mist.size, mist.ch * mist.size);
      g.globalAlpha = 1;
    }
  }

  function resize() {
    const css = canvas.clientWidth || 120;
    const ratio = Math.min(1.5, window.devicePixelRatio || 1);
    const size = Math.max(32, Math.round(css * ratio));
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    return size;
  }

  // Namen van deelgebieden ({name, x, z}), alleen waar de mist weg is. Rechtop, ook als de kaart draait.
  function textScale(value) {
    return Math.max(0.5, Math.min(2, num(value, 1)));
  }

  function drawAreaNames(g, areas, toScreen, fontPx, inside) {
    if (!Array.isArray(areas) || !areas.length) return;
    g.save();
    g.font = "italic 700 " + Math.round(fontPx) + "px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = Math.max(2, fontPx * 0.3);
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.fillStyle = "#f3e2b3";
    for (const area of areas) {
      if (!area || !area.name || !discovered(area.x, area.z)) continue;
      const p = toScreen(num(area.x), num(area.z));
      if (!inside(p)) continue;
      g.strokeText(area.name, p.x, p.y);
      g.fillText(area.name, p.x, p.y);
    }
    g.restore();
  }

  // view: { world, center {x,z}, facingDeg, forward {x,z}, radius (m), markers [{x,z,kind}], quest {x,z}|null, pin {x,z}|null,
  //         show {soort: false = verbergen}, iconScale (1 = normaal), areas [{name,x,z}] }
  function draw(view) {
    const size = resize();
    const half = size / 2;
    const k = half / Math.max(5, num(view.radius, 60));
    let fx = num(view.forward?.x, 0);
    let fz = num(view.forward?.z, -1);
    const length = Math.hypot(fx, fz) || 1;
    fx /= length;
    fz /= length;
    const cx = num(view.center?.x);
    const cz = num(view.center?.z);
    const a = -k * fz;
    const b = k * fx;
    const d = -k * fx;
    const e = -k * fz;
    const toScreen = function (x, z) {
      const dx = x - cx;
      const dz = z - cz;
      return { x: a * dx + b * dz + half, y: d * dx + e * dz + half };
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = fog ? fog.color : "#0b1220";
    ctx.fillRect(0, 0, size, size);
    const bounds = mapBounds(view.world);
    if (bounds) {
      ctx.setTransform(a, d, b, e, half - a * cx - b * cz, half - d * cx - e * cz);
      const reach = (half / k) * 1.45;
      drawGround(ctx, { minX: cx - reach, maxX: cx + reach, minZ: cz - reach, maxZ: cz + reach }, k, view.world, bounds);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const dot = Math.max(3, size * 0.028) * iconScale(view.iconScale);
    const show = view.show || {};
    // Gebiedsnamen zoomen mee met de kaart (zoals letters op een landkaart), maar blijven tussen een kleinste en grootste maat leesbaar.
    const areaFont = Math.max(size * 0.05, Math.min(size * 0.14, size * 0.075 * 60 / Math.max(5, num(view.radius, 60)))) * textScale(view.textScale);
    if (show.area !== false) drawAreaNames(ctx, view.areas, toScreen, areaFont, function (p) { return Math.hypot(p.x - half, p.y - half) < half * 0.78; });
    ctx.lineWidth = Math.max(1, size * 0.008);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    for (const marker of Array.isArray(view.markers) ? view.markers : []) {
      if (show[marker.kind] === false) continue;
      const p = toScreen(num(marker.x), num(marker.z));
      if (Math.hypot(p.x - half, p.y - half) > half - dot) continue;
      if (!discovered(marker.x, marker.z)) continue;
      drawMarker(ctx, marker.kind, p.x, p.y, dot);
    }
    // Quest-doel (gouden ster) en je pin; buiten de kaart een pijltje op de rand in de goede richting.
    const circleEdge = function (p) {
      if (Math.hypot(p.x - half, p.y - half) <= half - dot * 2.2) return null;
      const angle = Math.atan2(p.y - half, p.x - half);
      const r = half - dot * 2;
      return { x: half + Math.cos(angle) * r, y: half + Math.sin(angle) * r, angle };
    };
    if (view.quest && show.quest !== false && Number.isFinite(Number(view.quest.x))) drawGoal(ctx, "quest", toScreen(num(view.quest.x), num(view.quest.z)), dot, circleEdge);
    if (view.pin && show.pin !== false && Number.isFinite(Number(view.pin.x))) drawGoal(ctx, "pin", toScreen(num(view.pin.x), num(view.pin.z)), dot, circleEdge);
    // Jijzelf: een wit pijltje in je looprichting, altijd in het midden.
    const facing = num(view.facingDeg) * Math.PI / 180;
    const wx = Math.sin(facing);
    const wz = Math.cos(facing);
    const angle = Math.atan2(d * wx + e * wz, a * wx + b * wz);
    const r = dot * 1.9;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.75, r * 0.7);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.75, -r * 0.7);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = Math.max(1.2, size * 0.012);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Noorden: waar de wereld -Z op het kaartje ligt (draait mee als de camera draait).
    return Math.atan2(-e, -b) * 180 / Math.PI + 90;
  }

  // De grote kaart: noorden (-Z) boven, ingezoomd rond view.focus; view.span = hoeveel meter je van links naar rechts ziet.
  // Geeft terug wat je kunt aantikken (CSS-pixels) en hoe het beeld nu echt staat (na de grenzen), voor schuiven en zoomen.
  function drawFull(target, view) {
    const g = target.getContext("2d");
    const css = Math.max(64, Math.round(Math.min(target.clientWidth || 600, target.clientHeight || target.clientWidth || 600)));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(css * ratio);
    if (target.width !== size || target.height !== size) { target.width = size; target.height = size; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = fog ? fog.color : "#0b1220";
    g.fillRect(0, 0, size, size);
    const bounds = mapBounds(view.world);
    if (!bounds) return null;
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    const full = Math.max(w, d, MIN_SPAN_M);
    const span = Math.max(MIN_SPAN_M, Math.min(full, num(view.span, full)));
    const halfSpan = span / 2;
    // Niet verder schuiven dan de rand van de wereld.
    const clampAxis = function (value, min, length) {
      return length <= span ? min + length / 2 : Math.max(min + halfSpan, Math.min(min + length - halfSpan, value));
    };
    const cx = clampAxis(num(view.focus?.x, bounds.minX + w / 2), bounds.minX, w);
    const cz = clampAxis(num(view.focus?.z, bounds.minZ + d / 2), bounds.minZ, d);
    const k = size / span;
    const toScreen = function (x, z) { return { x: (x - cx) * k + size / 2, y: (z - cz) * k + size / 2 }; };
    g.setTransform(k, 0, 0, k, size / 2 - cx * k, size / 2 - cz * k);
    drawGround(g, { minX: cx - halfSpan, maxX: cx + halfSpan, minZ: cz - halfSpan, maxZ: cz + halfSpan }, k, view.world, bounds);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const dot = 4.5 * ratio * iconScale(view.iconScale);
    const show = view.show || {};
    const hits = [];
    const margin = dot * 3;
    // Gebiedsnamen: 15 px bij 160 m in beeld; inzoomen = groter (max 40 px), uitzoomen = kleiner (min 9 px).
    const areaFont = Math.max(9, Math.min(40, 15 * 160 / span)) * ratio * textScale(view.textScale);
    if (show.area !== false) drawAreaNames(g, view.areas, toScreen, areaFont, function (p) { return p.x > -size * 0.2 && p.y > 0 && p.x < size * 1.2 && p.y < size; });
    for (const marker of Array.isArray(view.markers) ? view.markers : []) {
      if (show[marker.kind] === false || !discovered(marker.x, marker.z)) continue;
      const p = toScreen(num(marker.x), num(marker.z));
      if (p.x < -margin || p.y < -margin || p.x > size + margin || p.y > size + margin) continue;
      g.lineWidth = Math.max(1, dot * 0.28);
      g.strokeStyle = "rgba(0,0,0,0.8)";
      drawMarker(g, marker.kind, p.x, p.y, marker.kind === "portal" ? dot * 1.3 : dot);
      hits.push({ x: p.x / ratio, y: p.y / ratio, kind: marker.kind, name: marker.name || "", target: marker.target || null });
    }
    const pad = dot * 2.4;
    const boxEdge = function (p) {
      if (p.x >= pad && p.y >= pad && p.x <= size - pad && p.y <= size - pad) return null;
      const c = size / 2;
      const dx = p.x - c;
      const dy = p.y - c;
      const t = (c - pad) / Math.max(Math.abs(dx), Math.abs(dy), 1);
      return { x: c + dx * t, y: c + dy * t, angle: Math.atan2(dy, dx) };
    };
    if (view.quest && show.quest !== false && Number.isFinite(Number(view.quest.x))) {
      const p = toScreen(num(view.quest.x), num(view.quest.z));
      if (drawGoal(g, "quest", p, dot, boxEdge)) hits.push({ x: p.x / ratio, y: p.y / ratio, kind: "quest", name: view.quest.name || "" });
    }
    if (view.pin && show.pin !== false && Number.isFinite(Number(view.pin.x))) {
      const p = toScreen(num(view.pin.x), num(view.pin.z));
      if (drawGoal(g, "pin", p, dot, boxEdge)) hits.push({ x: p.x / ratio, y: (p.y - dot * 2) / ratio, kind: "pin", name: "" });
    }
    if (view.center) {
      const p = toScreen(num(view.center.x), num(view.center.z));
      const facing = num(view.facingDeg) * Math.PI / 180;
      drawArrow(g, p.x, p.y, Math.atan2(Math.cos(facing), Math.sin(facing)), dot * 2.2, Math.max(1.5, dot * 0.3));
    }
    // Schaalbalk linksonder en je plek (X, Z) rechtsonder.
    const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].filter(function (value) { return value <= span / 4; }).pop() || 5;
    const x0 = 12 * ratio;
    const y0 = size - 14 * ratio;
    const x1 = x0 + step * k;
    g.lineCap = "round";
    for (const pass of [["rgba(0,0,0,0.75)", 5], ["#ffffff", 2]]) {
      g.strokeStyle = pass[0];
      g.lineWidth = pass[1] * ratio;
      g.beginPath();
      g.moveTo(x0, y0 - 5 * ratio);
      g.lineTo(x0, y0);
      g.lineTo(x1, y0);
      g.lineTo(x1, y0 - 5 * ratio);
      g.stroke();
    }
    g.lineCap = "butt";
    g.font = "600 " + Math.round(12 * ratio) + "px system-ui, sans-serif";
    g.textBaseline = "bottom";
    g.lineWidth = 3 * ratio;
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.fillStyle = "#ffffff";
    g.textAlign = "left";
    g.strokeText(step + " m", x0 + 4 * ratio, y0 - 6 * ratio);
    g.fillText(step + " m", x0 + 4 * ratio, y0 - 6 * ratio);
    if (view.center) {
      const text = "X " + Math.round(num(view.center.x)) + "  Z " + Math.round(num(view.center.z));
      g.textAlign = "right";
      g.strokeText(text, size - 10 * ratio, size - 8 * ratio);
      g.fillText(text, size - 10 * ratio, size - 8 * ratio);
      g.textAlign = "left";
    }
    return { hits, focus: { x: cx, z: cz }, span, minSpan: MIN_SPAN_M, maxSpan: full, css };
  }

  return { draw, drawFull, setTiles, setFog, addFogCells, revealAround, discovered, invalidate() { baseWorld = null; } };
}
