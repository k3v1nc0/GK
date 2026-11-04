// Afgeronde botsrand (3-11, Instellingen > Lopen en botsen).
// Water ("Niet in") en te steile rots worden één gladde rand op afstand: een afstandsveld op een raster dat
// wordt afgerond (vervaagd), zodat hoekjes en kartels van het terrein verdwijnen. Je loopt tegen een ronde,
// rechte lijn aan en glijdt er soepel langs. Game en server rekenen precies hetzelfde (zelfde gegevens, zelfde
// stappen). Het raster wordt per vak van 64 x 64 cellen pas uitgerekend als iemand er loopt (oude laptop).

const TILE_CELLS = 64;

export function createEdgeField({ cellSize = 0.5, keepDistance = 0.7, smoothRadius = 1.5, isBlocked } = {}) {
  const cell = Math.min(2, Math.max(0.25, Number(cellSize) || 0.5));
  const keep = Math.max(0, Number(keepDistance) || 0);
  const smoothCells = Math.max(0, Math.round((Number(smoothRadius) || 0) / cell));
  const reachCells = Math.ceil(keep / cell) + smoothCells + 2;
  const cap = reachCells * cell;
  const margin = reachCells + smoothCells + 1;
  const size = TILE_CELLS + 2 * margin;
  // De muur ligt halverwege een geblokkeerde en een vrije cel: daarom een halve cel extra.
  const limit = keep + cell * 0.5;
  const tiles = new Map();

  function buildTile(tileX, tileZ) {
    const originX = tileX * TILE_CELLS - margin;
    const originZ = tileZ * TILE_CELLS - margin;
    const count = size * size;
    const blocked = new Uint8Array(count);
    let any = false;
    for (let j = 0; j < size; j += 1) {
      const z = (originZ + j + 0.5) * cell;
      for (let i = 0; i < size; i += 1) {
        if (isBlocked((originX + i + 0.5) * cell, z)) { blocked[j * size + i] = 1; any = true; }
      }
    }
    if (!any) return { originX, originZ, values: null };
    const dist = new Float64Array(count).fill(cap);
    for (let k = 0; k < count; k += 1) if (blocked[k]) dist[k] = 0;
    // Afstand tot de dichtstbijzijnde geblokkeerde cel (alleen vanaf de randcellen, tot "cap").
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const k = j * size + i;
        if (!blocked[k]) continue;
        const edge = (i > 0 && !blocked[k - 1]) || (i < size - 1 && !blocked[k + 1])
          || (j > 0 && !blocked[k - size]) || (j < size - 1 && !blocked[k + size]);
        if (!edge) continue;
        const j0 = Math.max(0, j - reachCells);
        const j1 = Math.min(size - 1, j + reachCells);
        const i0 = Math.max(0, i - reachCells);
        const i1 = Math.min(size - 1, i + reachCells);
        for (let jj = j0; jj <= j1; jj += 1) {
          for (let ii = i0; ii <= i1; ii += 1) {
            const kk = jj * size + ii;
            if (blocked[kk]) continue;
            const d = Math.hypot(ii - i, jj - j) * cell;
            if (d < dist[kk]) dist[kk] = d;
          }
        }
      }
    }
    // Binnen de rand: negatief, hoe dieper hoe lager. Wie erin staat, kan zo alleen naar buiten (nooit verder de rots op).
    const inside = new Float64Array(count).fill(cap);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const k = j * size + i;
        if (blocked[k]) continue;
        const edge = (i > 0 && blocked[k - 1]) || (i < size - 1 && blocked[k + 1])
          || (j > 0 && blocked[k - size]) || (j < size - 1 && blocked[k + size]);
        if (!edge) continue;
        for (let jj = Math.max(0, j - reachCells); jj <= Math.min(size - 1, j + reachCells); jj += 1) {
          for (let ii = Math.max(0, i - reachCells); ii <= Math.min(size - 1, i + reachCells); ii += 1) {
            const kk = jj * size + ii;
            if (!blocked[kk]) continue;
            const d = Math.hypot(ii - i, jj - j) * cell;
            if (d < inside[kk]) inside[kk] = d;
          }
        }
      }
    }
    if (!smoothCells) {
      for (let k = 0; k < count; k += 1) if (blocked[k]) dist[k] = -inside[k];
      return { originX, originZ, values: dist };
    }
    // Afronden: twee keer een vierkant gemiddelde (eerst rijen, dan kolommen).
    const window = 2 * smoothCells + 1;
    const rows = new Float64Array(count);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        let sum = 0;
        for (let d = -smoothCells; d <= smoothCells; d += 1) sum += dist[j * size + Math.min(size - 1, Math.max(0, i + d))];
        rows[j * size + i] = sum / window;
      }
    }
    const values = new Float64Array(count);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        let sum = 0;
        for (let d = -smoothCells; d <= smoothCells; d += 1) sum += rows[Math.min(size - 1, Math.max(0, j + d)) * size + i];
        values[j * size + i] = sum / window;
      }
    }
    // Afronden vult alleen de hoekjes en inhammen op (lager); bij een uitstekende punt blijft de echte afstand
    // gelden, zodat je nooit dichter bij water of rots komt dan "Afstand". Geblokkeerd blijft altijd dicht.
    for (let k = 0; k < count; k += 1) values[k] = blocked[k] ? -inside[k] : Math.min(values[k], dist[k]);
    return { originX, originZ, values };
  }

  function tileFor(cellX, cellZ) {
    const tileX = Math.floor(cellX / TILE_CELLS);
    const tileZ = Math.floor(cellZ / TILE_CELLS);
    const key = tileX + ":" + tileZ;
    let tile = tiles.get(key);
    if (!tile) {
      tile = buildTile(tileX, tileZ);
      tiles.set(key, tile);
    }
    return tile;
  }

  // Afstand (na afronden) op x/z, vloeiend tussen de celmiddens. Groot = ver van water en rots.
  function fieldAt(x, z) {
    const fx = x / cell - 0.5;
    const fz = z / cell - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tile = tileFor(i0, j0);
    if (!tile.values) return cap;
    const i = i0 - tile.originX;
    const j = j0 - tile.originZ;
    const tx = fx - i0;
    const tz = fz - j0;
    const v = tile.values;
    const a = v[j * size + i];
    const b = v[j * size + i + 1];
    const c = v[(j + 1) * size + i];
    const d = v[(j + 1) * size + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  return { fieldAt, limit, cell, keep };
}
