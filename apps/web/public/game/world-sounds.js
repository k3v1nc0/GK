// Werkbank Fase 10 (Kevin 16-11): geluid van lopende NPC's en vliegers. Hoe dichterbij, hoe harder.
// Licht voor de oude laptop: gewone <audio>-elementen (geen WebAudio), hooguit 4 tegelijk (de dichtstbijzijnde).
// Blokkeert de browser geluid tot de eerste klik, dan probeert de volgende ronde het gewoon opnieuw.
export function createWorldSounds(options = {}) {
  const createAudio = options.createAudio || ((url) => new Audio(url));
  const maxPlaying = Math.max(1, Number(options.maxPlaying) || 4);
  const baseVolume = Math.max(0, Math.min(1, Number(options.volume ?? 0.5)));
  const defaultRange = Math.max(1, Number(options.range) || 25);
  const playing = new Map(); // key -> { url, audio }
  let muted = options.muted === true;

  function stop(key) {
    const entry = playing.get(key);
    if (!entry) return;
    try { entry.audio.pause(); } catch {}
    playing.delete(key);
  }

  // sources: [{ key, url, x, y, z, range? }], listener: { x, y, z }.
  function update(sources, listener) {
    if (muted || !listener) { for (const key of Array.from(playing.keys())) stop(key); return; }
    const near = [];
    for (const source of Array.isArray(sources) ? sources : []) {
      if (!source?.key || !source.url) continue;
      const range = Math.max(1, Number(source.range) || defaultRange);
      const distance = Math.hypot(Number(source.x) - listener.x, (Number(source.y) || 0) - (Number(listener.y) || 0), Number(source.z) - listener.z);
      if (Number.isFinite(distance) && distance < range) near.push({ source, distance, range });
    }
    near.sort((a, b) => a.distance / a.range - b.distance / b.range);
    const keep = new Set();
    for (const { source, distance, range } of near.slice(0, maxPlaying)) {
      keep.add(source.key);
      let entry = playing.get(source.key);
      if (entry && entry.url !== source.url) { stop(source.key); entry = null; }
      if (!entry) {
        let audio;
        try { audio = createAudio(source.url); } catch { continue; }
        audio.loop = true;
        audio.volume = 0;
        entry = { url: source.url, audio };
        playing.set(source.key, entry);
      }
      const closeness = 1 - distance / range;
      entry.audio.volume = Math.max(0, Math.min(1, baseVolume * closeness * closeness));
      if (entry.audio.paused) {
        try { const result = entry.audio.play(); if (result && typeof result.catch === "function") result.catch(() => {}); } catch {}
      }
    }
    for (const key of Array.from(playing.keys())) if (!keep.has(key)) stop(key);
  }

  // Kevin 16-11: één keer afspelen op een plek (een routepunt: de draak landt). Hooguit 4 tegelijk, verder = niet.
  const shots = new Set();
  function once(url, at, listener, range = 40) {
    if (muted || !url || !at || !listener || shots.size >= maxPlaying) return false;
    const reach = Math.max(1, Number(range) || 40);
    const distance = Math.hypot(Number(at.x) - listener.x, (Number(at.y) || 0) - (Number(listener.y) || 0), Number(at.z) - listener.z);
    if (!Number.isFinite(distance) || distance >= reach) return false;
    let audio;
    try { audio = createAudio(url); } catch { return false; }
    const closeness = 1 - distance / reach;
    audio.volume = Math.max(0, Math.min(1, baseVolume * 1.6 * closeness * closeness));
    shots.add(audio);
    const done = () => shots.delete(audio);
    try { audio.onended = done; audio.onerror = done; } catch {}
    setTimeout(done, 15000);
    try { const result = audio.play(); if (result && typeof result.catch === "function") result.catch(done); } catch { done(); }
    return true;
  }

  function setMuted(on) {
    muted = on === true;
    if (muted) {
      for (const key of Array.from(playing.keys())) stop(key);
      for (const audio of shots) { try { audio.pause(); } catch {} }
      shots.clear();
    }
  }

  return { update, once, setMuted, playingCount: () => playing.size };
}
