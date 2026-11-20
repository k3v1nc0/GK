// Kevin 20-11: lichtgewicht lucht. Eén goedkope shader op een koepel om de camera:
// - kleurverloop van de horizon naar boven,
// - een zon in de richting van het zonlicht (Instellingen > Wereld > Zon: richting/hoogte), scherpe schijf + gloed,
// - wolken uit een paar lagen ruis (FBM) op een plat vlak boven je (zakken mooi weg naar de horizon),
//   die met de wind schuiven en een warme rand krijgen dicht bij de zon.
// Geen raymarching en geen plaatjes. De koepel staat "achter" alles (diepte = zo ver als kan) en wordt als laatste van
// het dichte spul getekend, zodat de videokaart alleen pixels rekent waar je echt lucht ziet (oude laptop, mobiel).
// Alle waarden komen uit de build (world.sky, kaart Wereld > Lucht en wolken); 's nachts zet de game setNight().
import * as THREE from "three";

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  // Alleen de draaiing van de camera telt (de koepel reist mee), en z = w zet hem op de verste diepte.
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAGMENT = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uTopNight;
uniform vec3 uHorizonNight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uNight;
uniform float uSunCos;
uniform float uSunEdge;
uniform float uSunGlow;
uniform float uCloudsOn;
uniform float uThreshold;
uniform float uSoft;
uniform float uScale;
uniform float uRim;
uniform vec2 uWind;
varying vec3 vDir;

// Hash zonder sin (blijft netjes op mobiele videokaarten).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 3.7);
    a *= 0.5;
  }
  return v * FBM_NORM;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float day = 1.0 - uNight;
  vec3 top = mix(uTop, uTopNight, uNight);
  vec3 hor = mix(uHorizon, uHorizonNight, uNight);
  vec3 col = mix(hor, top, sqrt(clamp(h, 0.0, 1.0)));

  // Zon: zachte gloed op de lucht en een scherpe schijf.
  float sunDot = max(dot(dir, uSunDir), 0.0);
  float glow = (pow(sunDot, 48.0) * 0.6 + pow(sunDot, 6.0) * 0.15) * uSunGlow * day;
  col += uSunColor * glow;
  float disc = smoothstep(uSunCos - uSunEdge, uSunCos, sunDot) * day;
  col = mix(col, uSunColor, disc);

  // Wolken: ruis op een plat vlak boven je; bij de horizon vervagen ze.
  if (uCloudsOn > 0.5 && h > 0.0) {
    vec2 uv = dir.xz / (h + 0.15) * uScale + uWind;
    float n = fbm(uv);
    float c = smoothstep(uThreshold - uSoft, uThreshold + uSoft, n) * smoothstep(0.0, 0.2, h);
    float thick = smoothstep(uThreshold, uThreshold + 0.35, n);
    vec3 cloud = uCloudColor * (1.0 - 0.25 * thick);
    // Nep-licht: dunne randen dicht bij de zon worden warm.
    cloud += uSunColor * (pow(sunDot, 8.0) * (1.0 - thick) * uRim * day);
    cloud = mix(cloud, hor * 1.3 + vec3(0.02), uNight);
    col = mix(col, cloud, c);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const DEFAULT_SUN = new THREE.Vector3(0.45, 0.75, 0.48).normalize();
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const numOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function createSkyLayer({ scene, requestRender, lowQuality = false }) {
  const octaves = lowQuality ? 3 : 4;
  const uniforms = {
    uTop: { value: new THREE.Color("#5e9bd6") },
    uHorizon: { value: new THREE.Color("#d3e4f1") },
    uTopNight: { value: new THREE.Color("#0e1a33") },
    uHorizonNight: { value: new THREE.Color("#1a2747") },
    uSunDir: { value: DEFAULT_SUN.clone() },
    uSunColor: { value: new THREE.Color("#fff1c9") },
    uCloudColor: { value: new THREE.Color("#ffffff") },
    uNight: { value: 0 },
    uSunCos: { value: Math.cos(THREE.MathUtils.degToRad(2)) },
    uSunEdge: { value: 0.0001 },
    uSunGlow: { value: 1 },
    uCloudsOn: { value: 1 },
    uThreshold: { value: 0.5 },
    uSoft: { value: 0.08 },
    uScale: { value: 1.2 },
    uRim: { value: 0.9 },
    uWind: { value: new THREE.Vector2(0, 0) }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: { OCTAVES: octaves, FBM_NORM: (1 / (1 - Math.pow(0.5, octaves))).toFixed(6) },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), material);
  mesh.name = "gk sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e6; // na alle dichte dingen: pixels achter bergen en huizen worden overgeslagen
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.raycast = function () {};
  mesh.userData.skyDome = true;
  mesh.visible = false;
  scene.add(mesh);

  let enabled = false;
  let windDir = new THREE.Vector2(0, 0);
  let windSpeed = 0;
  let windOffsetX = 0;
  let windOffsetY = 0;
  let lastTime = 0;

  function setSky(sky) {
    enabled = sky?.enabled === true;
    mesh.visible = enabled;
    if (!enabled) { requestRender?.("sky"); return; }
    uniforms.uTop.value.set(sky.topColor || "#5e9bd6");
    uniforms.uHorizon.value.set(sky.horizonColor || "#d3e4f1");
    uniforms.uTopNight.value.set(sky.nightTopColor || "#0e1a33");
    uniforms.uHorizonNight.value.set(sky.nightHorizonColor || "#1a2747");
    uniforms.uSunColor.value.set(sky.sunColor || "#fff1c9");
    uniforms.uCloudColor.value.set(sky.cloudColor || "#ffffff");
    // Grootte = doorsnede in graden; de rand is een heel klein beetje zacht (geen trapjes).
    const radius = THREE.MathUtils.degToRad(Math.max(0.2, numOr(sky.sunSize, 4)) / 2);
    uniforms.uSunCos.value = Math.cos(radius);
    uniforms.uSunEdge.value = (1 - Math.cos(radius)) * 0.2 + 0.00002;
    uniforms.uSunGlow.value = clamp01(numOr(sky.sunGlow, 0.5)) * 2;
    const coverage = clamp01(numOr(sky.cloudCoverage, 0.45));
    uniforms.uCloudsOn.value = coverage > 0.001 ? 1 : 0;
    uniforms.uThreshold.value = 0.78 - 0.56 * coverage;
    uniforms.uSoft.value = 0.01 + 0.2 * clamp01(numOr(sky.cloudSoftness, 0.35));
    uniforms.uScale.value = 1.2 / Math.max(0.1, numOr(sky.cloudSize, 1));
    uniforms.uRim.value = clamp01(numOr(sky.cloudRim, 0.6)) * 1.5;
    // Windrichting zoals de zon: 0° = naar boven op de kaart, 90° = naar rechts. De ruis schuift de andere kant op.
    const angle = THREE.MathUtils.degToRad(numOr(sky.windAngle, 45));
    windDir = new THREE.Vector2(-Math.sin(angle), -Math.cos(angle));
    windSpeed = Math.max(0, numOr(sky.windSpeed, 1)) * 0.008;
    requestRender?.("sky");
  }

  // De zon volgt het zonlicht (de eerste richting-lamp): richting van het doel naar de lamp.
  function setSunFromLight(light) {
    const base = light?.userData?.shadowBasePosition || light?.position;
    const target = light?.userData?.shadowBaseTarget || new THREE.Vector3(0, 0, 0);
    if (base && base.distanceToSquared(target) > 1e-6) uniforms.uSunDir.value.copy(base).sub(target).normalize();
    else uniforms.uSunDir.value.copy(DEFAULT_SUN);
  }

  // 0 = dag, 1 = diepe nacht (de game rekent dit uit de dag/nacht-klok).
  function setNight(k) {
    const next = clamp01(Number(k) || 0);
    if (Math.abs(next - uniforms.uNight.value) < 0.002) return false;
    uniforms.uNight.value = next;
    return true;
  }

  // Elke getekende frame: wind laten schuiven (alleen als de lucht aan staat; de game tekent toch elke frame).
  function update(time) {
    const now = Number(time) || 0;
    const dt = lastTime ? Math.min(0.25, Math.max(0, (now - lastTime) / 1000)) : 0;
    lastTime = now;
    if (!enabled || !windSpeed || !dt) return;
    windOffsetX = (windOffsetX + windDir.x * windSpeed * dt) % 4096;
    windOffsetY = (windOffsetY + windDir.y * windSpeed * dt) % 4096;
    uniforms.uWind.value.set(windOffsetX, windOffsetY);
  }

  // Voor de kaart-foto (bake): even verbergen; geeft terug wat het was.
  function setHidden(hidden) {
    const was = mesh.visible;
    mesh.visible = hidden ? false : enabled;
    return was;
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  }

  return { setSky, setSunFromLight, setNight, update, setHidden, isEnabled: () => enabled, dispose };
}
