// F2-E2-T05: posities als checkpointdata, buiten de simtick.
//
// - markDirty(key) onthoudt alleen dat een positie veranderd is (geen DB-werk; mag in de tick).
// - flushDue() schrijft alle vuile posities in een keer weg via write(rows); de eigenaar roept dit op een
//   eigen timer aan (niet in de tick). Interval <= 5 s geeft position-RPO <= 5 s bij een procescrash.
// - flushKey(key) voor zonewissel en logout.
// - Bij een fout blijven de posities vuil (geen stil verlies) en wordt de checkpointer ongezond;
//   de eigenaar weigert dan nieuwe joins (isHealthy() === false).
// - pending is begrensd: boven maxPending is de checkpointer ook ongezond.

export function createPositionCheckpointer({ write, getRow, maxPending = 10000, clock = () => Date.now() } = {}) {
  if (typeof write !== "function") throw new Error("write(rows) ontbreekt");
  if (typeof getRow !== "function") throw new Error("getRow(key) ontbreekt");
  const dirty = new Map();
  const stats = { flushes: 0, rows: 0, errors: 0, lastError: null, lastFlushAt: null, maxPendingSeen: 0, flushMs: [] };

  function writeRows(keys) {
    const rows = [];
    for (const key of keys) {
      const row = getRow(key);
      if (row) rows.push(row);
    }
    if (!rows.length) {
      for (const key of keys) dirty.delete(key);
      return 0;
    }
    const startedAt = performance.now();
    try {
      write(rows);
    } catch (error) {
      stats.errors += 1;
      stats.lastError = { message: String(error?.message || error), at: clock() };
      return -1;
    }
    for (const key of keys) dirty.delete(key);
    stats.flushes += 1;
    stats.rows += rows.length;
    stats.lastFlushAt = clock();
    stats.lastError = null;
    stats.flushMs.push(performance.now() - startedAt);
    if (stats.flushMs.length > 1024) stats.flushMs.shift();
    return rows.length;
  }

  return {
    markDirty(key) {
      if (!dirty.has(key)) dirty.set(key, clock());
      stats.maxPendingSeen = Math.max(stats.maxPendingSeen, dirty.size);
    },
    pending() {
      return dirty.size;
    },
    oldestDirtyAgeMs() {
      let oldest = null;
      for (const at of dirty.values()) oldest = oldest === null ? at : Math.min(oldest, at);
      return oldest === null ? 0 : clock() - oldest;
    },
    flushDue() {
      return writeRows(Array.from(dirty.keys()));
    },
    flushKey(key) {
      return writeRows([key]);
    },
    isHealthy() {
      return stats.lastError === null && dirty.size <= maxPending;
    },
    snapshot() {
      return {
        pending: dirty.size,
        oldestDirtyAgeMs: this.oldestDirtyAgeMs(),
        flushes: stats.flushes,
        rows: stats.rows,
        errors: stats.errors,
        lastError: stats.lastError,
        lastFlushAt: stats.lastFlushAt,
        maxPendingSeen: stats.maxPendingSeen,
        healthy: this.isHealthy()
      };
    },
    rawFlushMs() {
      return stats.flushMs.slice();
    }
  };
}
