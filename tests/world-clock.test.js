// F2-E1-T03: pure wereldklok.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createWorldClock, createInputQueue, CLOCK_STATUS } from "../src/server/runtime/world-clock.js";

test("1000 stappen van 50 ms simuleren exact 50 s", function () {
  const clock = createWorldClock({ tickMs: 50 });
  clock.start(0);
  let simulated = 0;
  let now = 0;
  while (clock.tick < 1000) {
    now += 50;
    for (const step of clock.plan(now).ticks) simulated += step.deltaMs;
  }
  assert.equal(clock.tick, 1000);
  assert.equal(simulated, 50000);
});

test("maximaal drie inhaalticks per ronde, achterstand blijft bewaard", function () {
  const clock = createWorldClock({ tickMs: 50, maxCatchUpTicks: 3, maxLagMs: 1000 });
  clock.start(0);
  const first = clock.plan(500);
  assert.equal(first.ticks.length, 3);
  assert.equal(first.behind, true);
  assert.equal(first.delayMs, 0);
  let total = first.ticks.length;
  while (true) {
    const next = clock.plan(500);
    total += next.ticks.length;
    if (!next.behind) break;
  }
  assert.equal(total, 10);
});

test("meer dan 1 s achter zet de klok terug en telt verloren tijd", function () {
  const clock = createWorldClock({ tickMs: 50, maxLagMs: 1000 });
  clock.start(0);
  const plan = clock.plan(5000);
  assert.equal(plan.reset, true);
  assert.ok(clock.snapshot().lostMs >= 4000);
});

test("identieke inputs geven identieke volgorde", function () {
  const inputs = [
    { playerId: "b", inputSeq: 2, receivedAtMs: 10 },
    { playerId: "a", inputSeq: 5, receivedAtMs: 10 },
    { playerId: "a", inputSeq: 4, receivedAtMs: 10 },
    { playerId: "c", inputSeq: 1, receivedAtMs: 5 },
    { playerId: "d", inputSeq: 1, receivedAtMs: 99 }
  ];
  const runs = [];
  for (let r = 0; r < 5; r++) {
    const queue = createInputQueue();
    for (const input of r % 2 ? inputs.slice().reverse() : inputs) queue.enqueue(input);
    runs.push(JSON.stringify(queue.drainUntil(50)));
    assert.equal(queue.size(), 1, "input na de tick blijft staan");
  }
  assert.equal(new Set(runs).size, 1);
  assert.deepEqual(JSON.parse(runs[0]).map((i) => i.playerId + i.inputSeq), ["c1", "a4", "a5", "b2"]);
});

test("vijf overschrijdingen zetten DEGRADED, herstel na goede ticks", function () {
  const clock = createWorldClock({ tickMs: 50, overrunLimit: 5, recoverAfterTicks: 3 });
  for (let i = 0; i < 4; i++) clock.recordTickDuration(60);
  assert.equal(clock.status, CLOCK_STATUS.NORMAL);
  clock.recordTickDuration(60);
  assert.equal(clock.status, CLOCK_STATUS.DEGRADED);
  for (let i = 0; i < 3; i++) clock.recordTickDuration(5);
  assert.equal(clock.status, CLOCK_STATUS.NORMAL);
  const snap = clock.snapshot();
  assert.equal(snap.tickDurationMs.count, 8);
  assert.equal(snap.tickDurationMs.max, 60);
});

test("module heeft geen DB- of WS-import", function () {
  const text = fs.readFileSync(new URL("../src/server/runtime/world-clock.js", import.meta.url), "utf8");
  assert.ok(!/^\s*import\s/m.test(text), "geen imports");
});
