// Kevin 23-11: alle plaatjes (png, jpg, webp) in één kleurprofiel: sRGB. Heeft een bestand een eigen kleurprofiel
// (bijv. Display P3 of Adobe RGB uit een fotoprogramma), dan rekent de browser het bij het inlezen om naar sRGB, zoals
// elk fotoprogramma en de Bibliotheek het laten zien. Three.js zelf negeert zo'n profiel; daardoor zag een png er
// anders uit dan dezelfde webp. Zelfde aanroep als THREE.TextureLoader: load(url, onLoad, onProgress, onError).
import * as THREE from "three";

export function createSrgbTextureLoader() {
  const fallback = new THREE.TextureLoader();
  const canBitmap = typeof createImageBitmap === "function" && typeof fetch === "function";
  return {
    load(url, onLoad, onProgress, onError) {
      if (!canBitmap) return fallback.load(url, onLoad, onProgress, onError);
      const texture = new THREE.Texture();
      fetch(url, { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status + " " + url);
          return response.blob();
        })
        .then(function (blob) {
          return createImageBitmap(blob, { colorSpaceConversion: "default", premultiplyAlpha: "none", imageOrientation: "flipY" });
        })
        .then(function (bitmap) {
          texture.image = bitmap;
          // Al omgedraaid bij het inlezen, dus hier niet nog eens (anders staat het plaatje op zijn kop).
          texture.flipY = false;
          texture.needsUpdate = true;
          if (onLoad) onLoad(texture);
        }, function (error) {
          if (onError) onError(error);
        });
      return texture;
    }
  };
}
