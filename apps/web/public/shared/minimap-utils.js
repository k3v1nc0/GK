// Shared 2D minimap math + marker drawing helpers.
// Used by both apps/web/public/editor/editor.js (editor_minimap_hud) and
// apps/web/public/game/game.js (game_minimap_hud). Keep this module pure/DOM-light
// (canvas 2D only, no THREE.js) so it can be imported without pulling in the runtime.

// The baked minimap image is the source of truth for orientation: it is rendered top-down with
// world -Z at the top row and world +X to the right (see bakeMinimapImage in world-runtime.js).
// This helper must stay pixel-for-pixel consistent with that bake, so do NOT flip v here again -
// doing so is exactly what caused the north/south mirrored overlay bug. Use this same helper for
// game markers, editor markers, minimap click-to-world (via its inverse) and tests.
export function worldToMinimapPoint(x, z, bounds, pixelWidth, pixelHeight) {
  const minX = Number(bounds?.minX);
  const maxX = Number(bounds?.maxX);
  const minZ = Number(bounds?.minZ);
  const maxZ = Number(bounds?.maxZ);
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const u = (Number(x) - minX) / spanX;
  const v = (Number(z) - minZ) / spanZ;
  return {
    x: u * pixelWidth,
    y: v * pixelHeight,
    u: u,
    v: v,
    inside: u >= 0 && u <= 1 && v >= 0 && v <= 1
  };
}

// Converts a world rotationY (Three.js: degrees CCW around +Y viewed from above, 0 = facing +Z,
// so facing direction is (sin, cos) in world x/z) into a canvas marker rotation (degrees CW in
// screen space, 0 = pointing up). With the map drawn -Z-at-top/+Z-at-bottom this works out to a
// vertical mirror: 180 - rotationY. Use this for every heading-carrying marker (player triangle,
// viewport cone) so positions and headings can never disagree about north/south again.
export function worldHeadingToMinimapRotation(rotationYDeg) {
  return 180 - (Number(rotationYDeg) || 0);
}

// Inverse of worldToMinimapPoint. Used for minimap click-to-world (game click-to-move, editor
// click-to-focus).
export function minimapPointToWorld(px, py, bounds, pixelWidth, pixelHeight) {
  const minX = Number(bounds?.minX);
  const maxX = Number(bounds?.maxX);
  const minZ = Number(bounds?.minZ);
  const maxZ = Number(bounds?.maxZ);
  const u = Number(pixelWidth) ? Number(px) / Number(pixelWidth) : 0;
  const v = Number(pixelHeight) ? Number(py) / Number(pixelHeight) : 0;
  return {
    x: minX + u * (maxX - minX),
    z: minZ + v * (maxZ - minZ)
  };
}

// The minimap always bakes the entire Ground Surface as one square (1:1) area. Mirrors
// squareGroundBounds() in src/server/publish-service.js - keep both in sync.
export function squareGroundBounds(ground) {
  if (!ground) return null;
  const hasExplicitBounds = [ground.minX, ground.maxX, ground.minZ, ground.maxZ].every(Number.isFinite);
  let minX, maxX, minZ, maxZ;
  if (hasExplicitBounds) {
    const centerX = (ground.minX + ground.maxX) / 2;
    const centerZ = (ground.minZ + ground.maxZ) / 2;
    const side = Math.max(ground.maxX - ground.minX, ground.maxZ - ground.minZ, 0.01);
    minX = centerX - side / 2;
    maxX = centerX + side / 2;
    minZ = centerZ - side / 2;
    maxZ = centerZ + side / 2;
  } else {
    const side = Math.max(Number(ground.width) || 60, Number(ground.depth) || 60, 0.01);
    minX = -side / 2;
    maxX = side / 2;
    minZ = -side / 2;
    maxZ = side / 2;
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function clampNum(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// A "minimap view" is the interactive zoom/pan state of one minimap canvas: it never touches the
// baked image (which always covers the full Ground Surface) or any node value. `worldDistance` is
// how many world-units are visible across the canvas width/height.
export function createMinimapView(centerX, centerZ, startDistance) {
  return { centerX: Number(centerX) || 0, centerZ: Number(centerZ) || 0, worldDistance: Math.max(1, Number(startDistance) || 120) };
}

// Treats the current view as a square "bounds" window so it can be fed straight back into
// worldToMinimapPoint / minimapPointToWorld - the same central helper used for the full bake.
export function minimapViewBounds(view) {
  const half = Math.max(0.01, Number(view?.worldDistance) || 1) / 2;
  const centerX = Number(view?.centerX) || 0;
  const centerZ = Number(view?.centerZ) || 0;
  return { minX: centerX - half, maxX: centerX + half, minZ: centerZ - half, maxZ: centerZ + half };
}

// Keeps the view's visible window inside the Ground Surface bounds. If the visible span is wider
// than the ground on an axis, that axis is centered instead of clamped.
export function clampMinimapView(view, groundBounds) {
  if (!groundBounds) return view;
  const half = view.worldDistance / 2;
  const groundWidth = groundBounds.maxX - groundBounds.minX;
  const groundDepth = groundBounds.maxZ - groundBounds.minZ;
  const centerX = groundWidth <= view.worldDistance
    ? (groundBounds.minX + groundBounds.maxX) / 2
    : clampNum(view.centerX, groundBounds.minX + half, groundBounds.maxX - half);
  const centerZ = groundDepth <= view.worldDistance
    ? (groundBounds.minZ + groundBounds.maxZ) / 2
    : clampNum(view.centerZ, groundBounds.minZ + half, groundBounds.maxZ - half);
  return { centerX, centerZ, worldDistance: view.worldDistance };
}

export function zoomMinimapView(view, factor, minDistance, maxDistance, groundBounds) {
  const worldDistance = clampNum(view.worldDistance * factor, Math.max(1, Number(minDistance) || 1), Math.max(1, Number(maxDistance) || 100000));
  return clampMinimapView({ centerX: view.centerX, centerZ: view.centerZ, worldDistance }, groundBounds);
}

export function panMinimapView(view, deltaWorldX, deltaWorldZ, groundBounds) {
  return clampMinimapView({ centerX: view.centerX + deltaWorldX, centerZ: view.centerZ + deltaWorldZ, worldDistance: view.worldDistance }, groundBounds);
}

// Maps the current view's visible world rect into the baked image's own pixel space, for cropping
// via ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvasSize, canvasSize). `bounds` here must be the
// bake's own bounds (the full Ground Surface square), not the view.
export function minimapImageSourceRect(bounds, view, imgWidth, imgHeight) {
  if (!imgWidth || !imgHeight) return null;
  const viewBounds = minimapViewBounds(view);
  const topLeft = worldToMinimapPoint(viewBounds.minX, viewBounds.minZ, bounds, imgWidth, imgHeight);
  const bottomRight = worldToMinimapPoint(viewBounds.maxX, viewBounds.maxZ, bounds, imgWidth, imgHeight);
  const sx = clampNum(Math.min(topLeft.x, bottomRight.x), 0, imgWidth);
  const sy = clampNum(Math.min(topLeft.y, bottomRight.y), 0, imgHeight);
  const ex = clampNum(Math.max(topLeft.x, bottomRight.x), 0, imgWidth);
  const ey = clampNum(Math.max(topLeft.y, bottomRight.y), 0, imgHeight);
  return { sx: sx, sy: sy, sw: Math.max(1, ex - sx), sh: Math.max(1, ey - sy) };
}

export function clampMinimapPoint(point, pixelWidth, pixelHeight) {
  return {
    x: Math.max(0, Math.min(pixelWidth, point.x)),
    y: Math.max(0, Math.min(pixelHeight, point.y)),
    inside: point.inside
  };
}

export function resolveMinimapPoint(x, z, bounds, pixelWidth, pixelHeight, clampOutside) {
  const point = worldToMinimapPoint(x, z, bounds, pixelWidth, pixelHeight);
  if (point.inside) return point;
  if (clampOutside === false) return null;
  return clampMinimapPoint(point, pixelWidth, pixelHeight);
}

function withMarkerStyle(ctx, style, draw) {
  ctx.save();
  ctx.fillStyle = style?.fill || "#ffffff";
  ctx.strokeStyle = style?.stroke || "rgba(0,0,0,0.55)";
  ctx.lineWidth = style?.lineWidth || 1.5;
  draw();
  ctx.restore();
}

export function drawTriangleMarker(ctx, x, y, size, rotationDeg, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.translate(x, y);
    ctx.rotate((Number(rotationDeg) || 0) * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.72, size * 0.8);
    ctx.lineTo(-size * 0.72, size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

export function drawDotMarker(ctx, x, y, size, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

export function drawDiamondMarker(ctx, x, y, size, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

export function drawSquareMarker(ctx, x, y, size, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.beginPath();
    ctx.rect(x - size * 0.7, y - size * 0.7, size * 1.4, size * 1.4);
    ctx.fill();
    ctx.stroke();
  });
}

export function drawCrossMarker(ctx, x, y, size, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  });
}

export function drawStarMarker(ctx, x, y, size, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.beginPath();
    const spikes = 5;
    const outerRadius = size;
    const innerRadius = size * 0.45;
    let rotation = -Math.PI / 2;
    const step = Math.PI / spikes;
    ctx.moveTo(x + Math.cos(rotation) * outerRadius, y + Math.sin(rotation) * outerRadius);
    for (let i = 0; i < spikes; i += 1) {
      rotation += step;
      ctx.lineTo(x + Math.cos(rotation) * innerRadius, y + Math.sin(rotation) * innerRadius);
      rotation += step;
      ctx.lineTo(x + Math.cos(rotation) * outerRadius, y + Math.sin(rotation) * outerRadius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

export function drawMarkerLabel(ctx, text, x, y, fontSizePx, maxLength) {
  const label = String(text || "").slice(0, Math.max(1, Number(maxLength) || 14));
  if (!label) return;
  ctx.save();
  ctx.font = Math.max(6, Number(fontSizePx) || 10) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "#ffffff";
  const labelY = y + 4;
  ctx.strokeText(label, x, labelY);
  ctx.fillText(label, x, labelY);
  ctx.restore();
}

export function drawViewportCone(ctx, x, y, headingDeg, radiusPx, spreadDeg, style) {
  withMarkerStyle(ctx, style, function () {
    ctx.globalAlpha = style?.alpha ?? 0.22;
    const heading = (Number(headingDeg) || 0) * Math.PI / 180;
    const spread = ((Number(spreadDeg) || 50) / 2) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radiusPx, heading - Math.PI / 2 - spread, heading - Math.PI / 2 + spread);
    ctx.closePath();
    ctx.fill();
  });
}

// Inline SVG markup for the minimap chrome buttons, shared by game and editor so both HUDs look
// identical. Focus = crosshair (re-center on character/editor camera), resize = diagonal grip.
export const MINIMAP_FOCUS_ICON_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const MINIMAP_RESIZE_ICON_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M20 14l-6 6M20 8L8 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// Drag-to-resize for the square minimap window. The size is pure client-side view state (like
// zoom/pan) - it must never be written back to node values. Because the widget is anchored to a
// screen corner, pointer deltas are mapped so that dragging away from the anchored corner always
// grows the window regardless of which corner it hangs in.
export function attachMinimapResizeHandle(handle, opts) {
  const minSize = Math.max(32, Number(opts.minSize) || 64);
  const maxSize = Math.max(minSize, Number(opts.maxSize) || 512);
  let drag = null;

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startSize: Number(opts.getSize()) || minSize };
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const anchor = String(opts.getAnchor ? opts.getAnchor() : "top-right");
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const horiz = anchor.indexOf("left") !== -1 ? dx : -dx;
    const vert = anchor.indexOf("top") !== -1 ? dy : -dy;
    const next = Math.max(minSize, Math.min(maxSize, Math.round(drag.startSize + (horiz + vert) / 2)));
    opts.setSize(next);
  }

  function onPointerUp(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    try { handle.releasePointerCapture?.(event.pointerId); } catch {}
    drag = null;
  }

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerUp);

  return {
    destroy: function () {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
    }
  };
}

// Pointer/wheel/touch gesture controller shared by the game and editor minimap HUDs so both
// behave identically: short click/tap = onClick(worldX, worldZ); drag past the threshold = pan;
// wheel or pinch = zoom (around the cursor/pinch midpoint). Never touches node values - callers
// own the `view` (see createMinimapView) and persist it purely client-side.
export const MINIMAP_CLICK_DRAG_THRESHOLD_PX = 6;

export function attachMinimapInteractions(canvas, opts) {
  const activePointers = new Map();
  let dragState = null;
  let pinchState = null;

  function allowed(getter) {
    return typeof getter !== "function" || getter() !== false;
  }

  function canvasSize() {
    return Math.max(1, opts.getCanvasSize ? Number(opts.getCanvasSize()) || 1 : canvas.clientWidth || canvas.width || 1);
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const size = canvasSize();
    const scaleX = size / (rect.width || size);
    const scaleY = size / (rect.height || size);
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function minDistance() { return opts.getMinDistance ? Math.max(1, Number(opts.getMinDistance()) || 1) : 1; }
  function maxDistance() { return opts.getMaxDistance ? Math.max(1, Number(opts.getMaxDistance()) || 100000) : 100000; }
  function groundBounds() { return opts.getGroundBounds ? opts.getGroundBounds() : null; }
  function notifyInteraction() { if (opts.onUserInteraction) opts.onUserInteraction(); }

  function zoomAroundPixel(px, factor) {
    const view = opts.getView();
    const size = canvasSize();
    const before = minimapPointToWorld(px.x, px.y, minimapViewBounds(view), size, size);
    const targetDistance = clampNum(view.worldDistance * factor, minDistance(), maxDistance());
    const u = px.x / size;
    const v = px.y / size;
    const nextView = clampMinimapView({
      centerX: before.x - (u - 0.5) * targetDistance,
      centerZ: before.z - (v - 0.5) * targetDistance,
      worldDistance: targetDistance
    }, groundBounds());
    opts.setView(nextView);
    notifyInteraction();
  }

  function panByPixels(stepX, stepY) {
    if (!allowed(opts.allowPan)) return;
    const view = opts.getView();
    const size = canvasSize();
    const worldPerPx = view.worldDistance / size;
    opts.setView(panMinimapView(view, -stepX * worldPerPx, -stepY * worldPerPx, groundBounds()));
    notifyInteraction();
  }

  function onPointerDown(event) {
    if (event.pointerType !== "touch" && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    const px = localPoint(event);
    activePointers.set(event.pointerId, px);
    if (activePointers.size >= 2) {
      dragState = null;
      const pts = Array.from(activePointers.values()).slice(0, 2);
      pinchState = {
        lastDistance: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        lastMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      };
      return;
    }
    dragState = { pointerId: event.pointerId, downX: px.x, downY: px.y, lastX: px.x, lastY: px.y, moved: false, button: event.button };
  }

  function onPointerMove(event) {
    if (!activePointers.has(event.pointerId)) return;
    const px = localPoint(event);
    activePointers.set(event.pointerId, px);

    if (pinchState && activePointers.size >= 2) {
      const pts = Array.from(activePointers.values()).slice(0, 2);
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (allowed(opts.allowPinchZoom) && pinchState.lastDistance) {
        zoomAroundPixel(mid, pinchState.lastDistance / dist);
      }
      if (allowed(opts.allowPan)) {
        panByPixels(mid.x - pinchState.lastMid.x, mid.y - pinchState.lastMid.y);
      }
      pinchState.lastDistance = dist;
      pinchState.lastMid = mid;
      return;
    }

    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const deltaX = px.x - dragState.downX;
    const deltaY = px.y - dragState.downY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) > MINIMAP_CLICK_DRAG_THRESHOLD_PX) {
      dragState.moved = true;
    }
    if (dragState.moved || dragState.button === 1) {
      panByPixels(px.x - dragState.lastX, px.y - dragState.lastY);
    }
    dragState.lastX = px.x;
    dragState.lastY = px.y;
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
    if (pinchState) {
      if (activePointers.size < 2) pinchState = null;
      return;
    }
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const wasClick = !dragState.moved && dragState.button === 0;
    const clickPx = { x: dragState.downX, y: dragState.downY };
    dragState = null;
    if (wasClick && typeof opts.onClick === "function") {
      const size = canvasSize();
      const world = minimapPointToWorld(clickPx.x, clickPx.y, minimapViewBounds(opts.getView()), size, size);
      opts.onClick(world.x, world.z);
    }
  }

  function onWheel(event) {
    if (!allowed(opts.allowZoom)) return;
    event.preventDefault();
    const px = localPoint(event);
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
    zoomAroundPixel(px, factor);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    destroy: function () {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    }
  };
}
