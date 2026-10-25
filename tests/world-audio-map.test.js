// Fase 04 (F4-E3-T02): muziek per Region/Area. Autoplay-blokkade = audio_locked zonder crash; crossfade bij wissel.
import assert from "node:assert/strict";
import test from "node:test";
import { createWorldMusic, MUSIC_STATES } from "../apps/web/public/game/world-audio.js";

function fakeAudioFactory({ blocked }) {
  const created = [];
  const factory = (url) => {
    const audio = {
      url, volume: 1, loop: false, paused: true,
      play() {
        if (blocked.value) return Promise.reject(Object.assign(new Error("NotAllowedError"), { name: "NotAllowedError" }));
        audio.paused = false;
        return Promise.resolve();
      },
      pause() { audio.paused = true; }
    };
    created.push(audio);
    return audio;
  };
  return { factory, created };
}

function manualTimer() {
  let fn = null;
  return {
    setInterval(callback) { fn = callback; return 1; },
    clearInterval() { fn = null; },
    run(times) { for (let i = 0; i < times && fn; i += 1) fn(); },
    active() { return fn !== null; }
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("muziek: geblokkeerde autoplay geeft audio_locked, klik ontgrendelt", async function () {
  const blocked = { value: true };
  const { factory, created } = fakeAudioFactory({ blocked });
  const timer = manualTimer();
  const states = [];
  const music = createWorldMusic({ createAudio: factory, setInterval: timer.setInterval, clearInterval: timer.clearInterval, fadeMs: 500, volume: 0.5, onStateChange: (s) => states.push(s) });
  music.setTrack("/assets/a.mp3");
  await flush();
  assert.equal(music.state(), MUSIC_STATES.LOCKED);
  assert.equal(created[0].loop, true);
  blocked.value = false;
  music.unlock();
  await flush();
  assert.equal(music.state(), MUSIC_STATES.PLAYING);
  timer.run(20);
  assert.equal(created[0].volume, 0.5);
  assert.deepEqual(states, ["audio_locked", "playing"]);
});

test("muziek: crossfade bij Region-wissel, stilte bij geen track, kapotte Audio crasht niet", async function () {
  const blocked = { value: false };
  const { factory, created } = fakeAudioFactory({ blocked });
  const timer = manualTimer();
  const music = createWorldMusic({ createAudio: factory, setInterval: timer.setInterval, clearInterval: timer.clearInterval, fadeMs: 500, volume: 0.5 });
  music.setTrack("/assets/a.mp3");
  await flush();
  timer.run(20);
  music.setTrack("/assets/a.mp3"); // zelfde track: niets nieuws
  assert.equal(created.length, 1);
  music.setTrack("/assets/b.mp3");
  await flush();
  timer.run(5);
  assert.ok(created[0].volume < 0.5 && created[0].volume > 0, "oude track zakt");
  assert.ok(created[1].volume > 0 && created[1].volume < 0.5, "nieuwe track stijgt");
  timer.run(20);
  assert.equal(created[0].paused, true);
  assert.equal(created[1].volume, 0.5);
  assert.equal(timer.active(), false, "timer stopt als de fade klaar is");
  music.setTrack(null);
  timer.run(20);
  assert.equal(created[1].paused, true);
  assert.equal(music.state(), MUSIC_STATES.IDLE);
  const broken = createWorldMusic({ createAudio: () => { throw new Error("geen audio"); }, setInterval: timer.setInterval, clearInterval: timer.clearInterval });
  assert.doesNotThrow(() => broken.setTrack("/assets/x.mp3"));
  assert.equal(broken.state(), MUSIC_STATES.UNSUPPORTED);
  music.destroy();
});
