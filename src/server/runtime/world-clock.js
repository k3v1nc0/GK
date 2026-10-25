// F2-E1-T03: wereldklok als pure module (geen DB, geen WebSocket, geen actorcode).
//
// - Vaste stap per tick (tickMs). MmoService geeft de tick uit de netwerkpreset van de wereld (10-60 Hz).
//   DEFAULT_TICK_MS (50 ms = 20 Hz, OB-05) geldt alleen als niemand een tick opgeeft.
// - Per ronde maximaal `maxCatchUpTicks` inhaalticks. Een achterstand blijft bewaard en wordt in de
//   volgende ronde (zonder wachttijd) verder ingehaald, zodat de event loop tussendoor vrij komt.
// - Loopt de klok meer dan `maxLagMs` achter, dan wordt hij teruggezet (verloren tijd wordt geteld).
// - `overrunLimit` opeenvolgende ticks die langer duren dan tickMs zetten de status op DEGRADED.
// - Ruwe samples (tickduur en te-laat) in een begrensde ringbuffer voor p50/p95/p99.

export const DEFAULT_TICK_MS = 50;
export const CLOCK_STATUS = Object.freeze({ NORMAL: "NORMAL", DEGRADED: "DEGRADED" });

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function createSampleRing(limit = 2048) {
  const size = Math.max(1, Math.floor(limit));
  const values = new Float64Array(size);
  let count = 0;
  let next = 0;
  return {
    push(value) {
      values[next] = Number(value) || 0;
      next = (next + 1) % size;
      count = Math.min(size, count + 1);
    },
    size() {
      return count;
    },
    toArray() {
      const out = [];
      const start = count < size ? 0 : next;
      for (let i = 0; i < count; i++) out.push(values[(start + i) % size]);
      return out;
    },
    clear() {
      count = 0;
      next = 0;
    }
  };
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

export function summarizeSamples(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : 0
  };
}

// Vaste, deterministische volgorde voor inputs binnen een tick: ontvangsttijd, speler, volgnummer.
export function compareInputs(a, b) {
  const ra = finiteOr(a?.receivedAtMs, 0);
  const rb = finiteOr(b?.receivedAtMs, 0);
  if (ra !== rb) return ra - rb;
  const pa = String(a?.playerId ?? "");
  const pb = String(b?.playerId ?? "");
  if (pa !== pb) return pa < pb ? -1 : 1;
  return finiteOr(a?.inputSeq, 0) - finiteOr(b?.inputSeq, 0);
}

export function createInputQueue(maxItems = 4096) {
  const limit = Math.max(1, Math.floor(maxItems));
  let items = [];
  let dropped = 0;
  return {
    enqueue(input) {
      if (items.length >= limit) {
        dropped += 1;
        return false;
      }
      items.push(input);
      return true;
    },
    // Geeft alle inputs tot en met tickAtMs terug in vaste volgorde; latere inputs blijven staan.
    drainUntil(tickAtMs) {
      const ready = [];
      const later = [];
      for (const item of items) (finiteOr(item?.receivedAtMs, 0) <= tickAtMs ? ready : later).push(item);
      items = later;
      return ready.sort(compareInputs);
    },
    size() {
      return items.length;
    },
    dropped() {
      return dropped;
    }
  };
}

export function createWorldClock(options = {}) {
  const maxCatchUpTicks = Math.max(1, Math.floor(finiteOr(options.maxCatchUpTicks, 3)));
  const maxLagMs = Math.max(0, finiteOr(options.maxLagMs, 1000));
  const overrunLimit = Math.max(1, Math.floor(finiteOr(options.overrunLimit, 5)));
  const recoverAfterTicks = Math.max(1, Math.floor(finiteOr(options.recoverAfterTicks, 20)));
  let tickMs = Math.max(10, Math.round(finiteOr(options.tickMs, DEFAULT_TICK_MS)));
  let nextAtMs = 0;
  let tick = 0;
  let status = CLOCK_STATUS.NORMAL;
  let consecutiveOverruns = 0;
  let consecutiveGood = 0;
  const stats = { ticks: 0, rounds: 0, resets: 0, lostMs: 0, overruns: 0, degradedEnteredAt: null };
  const durationSamples = createSampleRing(options.sampleLimit ?? 2048);
  const lateSamples = createSampleRing(options.sampleLimit ?? 2048);

  return {
    get tickMs() {
      return tickMs;
    },
    get tick() {
      return tick;
    },
    get status() {
      return status;
    },
    setTickMs(value) {
      tickMs = Math.max(10, Math.round(finiteOr(value, tickMs)));
    },
    start(nowMs) {
      nextAtMs = finiteOr(nowMs, 0) + tickMs;
    },
    // Welke ticks moeten nu draaien, en hoe lang wachten tot de volgende ronde.
    plan(nowMs) {
      const current = finiteOr(nowMs, 0);
      if (nextAtMs <= 0) nextAtMs = current + tickMs;
      let reset = false;
      if (current - nextAtMs > maxLagMs) {
        stats.resets += 1;
        stats.lostMs += current - nextAtMs;
        nextAtMs = current;
        reset = true;
      }
      const ticks = [];
      while (nextAtMs <= current && ticks.length < maxCatchUpTicks) {
        tick += 1;
        ticks.push({ tick, atMs: nextAtMs, deltaMs: tickMs, lateMs: current - nextAtMs });
        lateSamples.push(current - nextAtMs);
        nextAtMs += tickMs;
      }
      if (ticks.length) {
        stats.rounds += 1;
        stats.ticks += ticks.length;
      }
      const behind = nextAtMs <= current;
      return { ticks, reset, behind, delayMs: behind ? 0 : Math.max(0, nextAtMs - current) };
    },
    recordTickDuration(durationMs, nowMs = null) {
      const value = Math.max(0, finiteOr(durationMs, 0));
      durationSamples.push(value);
      if (value > tickMs) {
        stats.overruns += 1;
        consecutiveOverruns += 1;
        consecutiveGood = 0;
        if (consecutiveOverruns >= overrunLimit && status !== CLOCK_STATUS.DEGRADED) {
          status = CLOCK_STATUS.DEGRADED;
          stats.degradedEnteredAt = nowMs;
        }
      } else {
        consecutiveOverruns = 0;
        consecutiveGood += 1;
        if (status === CLOCK_STATUS.DEGRADED && consecutiveGood >= recoverAfterTicks) status = CLOCK_STATUS.NORMAL;
      }
      return status;
    },
    snapshot() {
      return {
        tickMs,
        tick,
        status,
        ticks: stats.ticks,
        rounds: stats.rounds,
        resets: stats.resets,
        lostMs: Math.round(stats.lostMs),
        overruns: stats.overruns,
        tickDurationMs: summarizeSamples(durationSamples.toArray()),
        tickLateMs: summarizeSamples(lateSamples.toArray())
      };
    },
    rawSamples() {
      return { tickDurationMs: durationSamples.toArray(), tickLateMs: lateSamples.toArray() };
    }
  };
}
