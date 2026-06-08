<style>
body {
    background: #1f1f1fff;
    color: #545454ff;
    font-family: sans-serif;  
}
/* --- BASIS HUD INSTELLINGEN --- */
:root {
  /* We definiëren één basiseenheid voor de HUD. Wijzig dit getal om alles groter/kleiner te maken */
  --hud-scale: 3.5vmin; 
}

/* --- TITELS & STATS (Groot) --- */
h1 {
  /* Voor hoofdscores of grote meldingen (Level Up, Game Over) */
  font-size: clamp(22px, var(--hud-scale) * 1.5, 54px);
  line-height: 1.1;
}

h2 {
  /* Voor secundaire stats (bijv. "Wapens", "Missie doelen") */
  font-size: clamp(18px, var(--hud-scale) * 1.2, 40px);
  line-height: 1.2;
}

h3 {
  /* Voor kleine sub-titels binnen HUD-vensters */
  font-size: clamp(16px, var(--hud-scale) * 1.0, 30px);
  line-height: 1.2;
}

/* --- PLATTE TEKST & DETAILS (Klein maar leesbaar!) --- */
p, span, .hud-text {
  /* Voor doorlopende tekst, actielogs of item-beschrijvingen */
  font-size: clamp(14px, var(--hud-scale) * 0.75, 20px);
  line-height: 1.4;
}

.hud-small {
  /* Voor hele kleine details zoals munitie-aantallen of mini-timers */
  font-size: clamp(11px, var(--hud-scale) * 0.6, 15px);
}
</style>

<h1>H1 test tekst.</h1>
<h2>H2 test tekst.</h2>
<h3>H3 test tekst.</h2>
<p>p test tekst.</p>
<p class="hud-small">hud-small test tekst.</h2>
