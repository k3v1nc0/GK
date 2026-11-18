// Naamlabels boven NPC's, vijanden en spullen: waar het label komt te staan.
// De onderkant-midden van het label hoort op het ankerpunt boven het hoofd.
// De linkerbovenhoek wordt afgerond op hele fysieke schermpixels, zodat de tekst
// scherp blijft terwijl het label met translate3d (zonder herschilderen) meeschuift.
export function labelOffset(anchorX, anchorY, width, height, originLeft, originTop, pixelRatio) {
  const ratio = Number(pixelRatio) > 0 ? Number(pixelRatio) : 1;
  const left = Math.round((anchorX - width / 2) * ratio) / ratio;
  const top = Math.round((anchorY - height) * ratio) / ratio;
  return { x: left - originLeft, y: top - originTop };
}
