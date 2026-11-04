// Fase 04 (F4-E3-T02): Region/Area-muziek met crossfade. Licht voor de oude laptop: twee <audio>-elementen,
// geen WebAudio-graaf. Blokkeert de browser autoplay, dan wordt de toestand "audio_locked" (geen crash) en
// probeert de volgende klik of toets het opnieuw.
//
// Toestanden: idle | playing | audio_locked | unsupported.

export const MUSIC_STATES = Object.freeze({ IDLE: "idle", PLAYING: "playing", LOCKED: "audio_locked", UNSUPPORTED: "unsupported" });

export function createWorldMusic(options = {}) {
  const createAudio = options.createAudio || ((url) => new Audio(url));
  const fadeMs = Math.max(0, Number(options.fadeMs ?? 1500));
  const stepMs = 50;
  const baseVolume = Math.max(0, Math.min(1, Number(options.volume ?? 0.45)));
  // Stap 4 (HUD): muziek aan/uit in de speler-instellingen. Uit = zacht wegfaden, de track blijft lopen.
  let muted = options.muted === true;
  let targetVolume = muted ? 0 : baseVolume;
  const setTimer = options.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearTimer = options.clearInterval || ((id) => clearInterval(id));
  const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};

  let state = MUSIC_STATES.IDLE;
  let wantedUrl = null;
  let current = null; // { url, audio }
  const fading = new Set(); // oude tracks die uitfaden
  let timer = null;

  function setState(next) {
    if (state === next) return;
    state = next;
    onStateChange(state);
  }

  function ensureTimer() {
    if (timer !== null) return;
    timer = setTimer(step, stepMs);
  }

  function step() {
    const delta = fadeMs > 0 ? (baseVolume * stepMs) / fadeMs : 1;
    let busy = false;
    if (current && current.started && current.audio.volume < targetVolume) {
      current.audio.volume = Math.min(targetVolume, current.audio.volume + delta);
      busy = busy || current.audio.volume < targetVolume;
    } else if (current && current.started && current.audio.volume > targetVolume) {
      current.audio.volume = Math.max(targetVolume, current.audio.volume - delta);
      busy = busy || current.audio.volume > targetVolume;
    }
    for (const old of Array.from(fading)) {
      old.audio.volume = Math.max(0, old.audio.volume - delta);
      if (old.audio.volume <= 0) {
        try { old.audio.pause(); } catch {}
        fading.delete(old);
      } else {
        busy = true;
      }
    }
    if (!busy && timer !== null) { clearTimer(timer); timer = null; }
  }

  function fadeOutCurrent() {
    if (!current) return;
    if (current.started) fading.add(current);
    else { try { current.audio.pause(); } catch {} }
    current = null;
  }

  function start(entry) {
    let result;
    try {
      result = entry.audio.play();
    } catch {
      setState(MUSIC_STATES.LOCKED);
      return;
    }
    const ok = () => {
      if (current !== entry) return;
      entry.started = true;
      setState(MUSIC_STATES.PLAYING);
      ensureTimer();
    };
    if (result && typeof result.then === "function") {
      result.then(ok, () => { if (current === entry) setState(MUSIC_STATES.LOCKED); });
    } else {
      ok();
    }
  }

  return {
    // url = null: muziek uitfaden (geen track in deze Region/Area).
    setTrack(url) {
      const next = url ? String(url) : null;
      if (next === wantedUrl && (current || !next)) return;
      wantedUrl = next;
      fadeOutCurrent();
      ensureTimer();
      if (!next) { if (state !== MUSIC_STATES.UNSUPPORTED) setState(MUSIC_STATES.IDLE); return; }
      let audio;
      try {
        audio = createAudio(next);
        audio.loop = true;
        audio.volume = 0;
      } catch {
        setState(MUSIC_STATES.UNSUPPORTED);
        return;
      }
      current = { url: next, audio, started: false };
      start(current);
    },
    // Aanroepen na een klik/toets van de speler.
    unlock() {
      if (state !== MUSIC_STATES.LOCKED || !current || current.started) return;
      start(current);
    },
    setMuted(next) {
      muted = next === true;
      targetVolume = muted ? 0 : baseVolume;
      ensureTimer();
    },
    muted() { return muted; },
    state() { return state; },
    wantedUrl() { return wantedUrl; },
    destroy() {
      wantedUrl = null;
      fadeOutCurrent();
      for (const old of fading) { try { old.audio.pause(); } catch {} }
      fading.clear();
      if (timer !== null) { clearTimer(timer); timer = null; }
    }
  };
}
