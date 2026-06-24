import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const DEG_TO_RAD = Math.PI / 180;

function colorOrDefault(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : fallback;
}

function assetById(world, id) {
  return (world?.assets || []).find(function (asset) { return asset.id === id; }) || null;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timingMs(startedAt) {
  return (performance.now() - startedAt).toFixed(1);
}

function disposeObject(object) {
  object.traverse(function (child) {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && typeof value.dispose === "function" && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

export function createGkWorldRuntime(canvas, options = {}) {
  const mode = options.mode || "editor";
  const hudElement = options.hud || null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100000);
  const content = new THREE.Group();
  scene.add(content);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const modelCache = new Map();
  const textureCache = new Map();
  const entityRoots = new Map();
  const solids = [];
  const animationMixers = new Map();
  const modifierState = { ctrlKey: false };

  let world = null;
  let orbitControls = null;
  let selectionHelper = null;
  let transformGuide = null;
  let selectedEntityId = null;
  let selectedRoot = null;
  let transformSession = null;
  let onSelectEntity = options.onSelectEntity || function () {};
  let onTransformCommit = options.onTransformCommit || function () {};
  let onTransformEnd = options.onTransformEnd || function () {};
  let onTransformChange = options.onTransformChange || function () {};
  let onModelLoadTiming = options.onModelLoadTiming || function () {};
  const loadErrors = [];
  let editorViewInitialized = false;
  let disposed = false;
  let editorPointerDownHandler = null;
  let editorPointerDownCaptureHandler = null;
  let editorPointerUpCaptureHandler = null;
  let editorContextMenuHandler = null;
  let editorKeyDownHandler = null;
  let editorKeyUpHandler = null;
  let editorDirectPointerMoveHandler = null;
  let editorDirectPointerUpHandler = null;
  let lastEditorPointer = null;
  let viewportPanSession = null;
  let gamePointerDownHandler = null;
  let gameKeyDownHandler = null;
  let gameKeyUpHandler = null;
  let gameWheelHandler = null;
  let rafId = null;
  let renderRequested = false;
  let running = false;
  let resizeRafId = null;
  let resizeObserver = null;
  let windowResizeHandler = null;
  let resizeTarget = canvas.parentElement || canvas;
  let lastResizeWidth = 0;
  let lastResizeHeight = 0;
  let lastResizePixelRatio = 0;
  let loopGeneration = 0;
  let pendingResizeReason = "init";
  let transformState = {
    active: false,
    cancelled: false,
    object: null,
    rootId: null,
    start: null,
    mode: "move",
    axis: null,
    startPointer: null,
    currentPointer: null,
    startPosition: null,
    startRotation: null,
    startScale: null
  };
  let transformAxisConstraint = null;
  let snapState = {
    mode: "off",
    gridSize: 1
  };
  let localViewActive = false;
  let previewAnimations = false;
  const DEBUG_RUNTIME = window.__GK_DEBUG_RUNTIME && typeof window.__GK_DEBUG_RUNTIME === "object"
    ? window.__GK_DEBUG_RUNTIME
    : { enabled: false, activeLoopCount: 0, running: false, resizeCount: 0, renderCount: 0, lastRenderReasons: [], lastResizeSnapshot: null, activeResizeHandlers: 0 };
  window.__GK_DEBUG_RUNTIME = DEBUG_RUNTIME;
  let lastTime = performance.now();

  // Game state
  const player = { root: null, pos: new THREE.Vector3(), facing: 0, radius: 0.5, speed: 6, sprint: 1.6, turnSpeed: 600 };
  let camYaw = 0;
  let camPitch = 60;
  let camDistance = 20;
  let camMinDistance = 6;
  let camMaxDistance = 60;
  let camFollow = true;
  let camRotateSpeed = 90;
  const camTarget = new THREE.Vector3();
  let clickTarget = null;
  const pressedKeys = new Set();
  const keyToAction = new Map();
  const interactables = [];
  let activeInteractable = null;
  let hudModules = [];
  const hudNodes = { prompt: null, anchored: new Map() };

  if (mode === "editor") {
    orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = false;
    orbitControls.dampingFactor = 0.08;
    orbitControls.screenSpacePanning = true;
    orbitControls.minPolarAngle = 0.001;
    orbitControls.maxPolarAngle = Math.PI - 0.001;
    updateOrbitMouseMapping();
    orbitControls.enableKeys = false;
    orbitControls.addEventListener("change", requestRender);
    selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x7bd4ff);
    selectionHelper.visible = false;
    selectionHelper.material.depthTest = false;
    selectionHelper.material.depthWrite = false;
    selectionHelper.material.transparent = true;
    selectionHelper.material.opacity = 0.9;
    selectionHelper.material.toneMapped = false;
    selectionHelper.renderOrder = 999;
    selectionHelper.raycast = function () {};
    scene.add(selectionHelper);
    transformGuide = createTransformGuide();
    scene.add(transformGuide);
    editorPointerDownCaptureHandler = function (event) {
      if (!orbitControls) return;
      rememberEditorPointer(event);
      if (viewportPanSession && event.pointerId === viewportPanSession.pointerId) return;
      if (transformSession) {
        if (event.button === 2) {
          event.preventDefault();
          event.stopImmediatePropagation();
          cancelTransform();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.button === 1 && event.shiftKey && !transformState.active) {
        if (beginViewportPan(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      if (event.button === 1) updateOrbitMouseMapping(event.ctrlKey || event.metaKey);
    };
    editorContextMenuHandler = function (event) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      if (transformSession) cancelTransform();
    };
    editorKeyDownHandler = function (event) {
      if (event.key === "Control" || event.key === "Meta") {
        modifierState.ctrlKey = true;
        updateOrbitMouseMapping();
        applyTransformSnapState();
      }
    };
    editorKeyUpHandler = function (event) {
      if (event.key === "Control" || event.key === "Meta") {
        modifierState.ctrlKey = false;
        updateOrbitMouseMapping();
        applyTransformSnapState();
      }
    };
    canvas.addEventListener("pointerdown", editorPointerDownCaptureHandler, true);
    canvas.addEventListener("contextmenu", editorContextMenuHandler);
    window.addEventListener("keydown", editorKeyDownHandler);
    window.addEventListener("keyup", editorKeyUpHandler);
    editorDirectPointerMoveHandler = handleTransformPointerMove;
    editorDirectPointerUpHandler = handleTransformPointerUp;
    canvas.addEventListener("pointermove", editorDirectPointerMoveHandler, true);
    canvas.addEventListener("pointerup", editorDirectPointerUpHandler, true);
    canvas.addEventListener("pointercancel", editorDirectPointerUpHandler, true);
    window.addEventListener("pointermove", editorDirectPointerMoveHandler, true);
    window.addEventListener("pointerup", editorDirectPointerUpHandler, true);
    window.addEventListener("pointercancel", editorDirectPointerUpHandler, true);
    editorPointerUpCaptureHandler = function (event) {
      rememberEditorPointer(event);
      if (viewportPanSession && event.pointerId === viewportPanSession.pointerId) {
        handleViewportPanUp(event);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.button !== 1) return;
      updateOrbitMouseMapping();
    };
    canvas.addEventListener("pointerup", editorPointerUpCaptureHandler, true);
    canvas.addEventListener("pointercancel", editorPointerUpCaptureHandler, true);
    editorPointerDownHandler = function (event) {
      rememberEditorPointer(event);
      if (event.button !== 0) return;
      if (transformSession) return;
      const entityId = pickEntity(event);
      if (entityId) {
        selectEntity(entityId);
        onSelectEntity(entityId);
      }
    };
    canvas.addEventListener("pointerdown", editorPointerDownHandler);
  } else {
    buildHud();
    gamePointerDownHandler = function (event) {
      if (event.button !== 0) return;
      const inter = pickInteractable(event);
      if (inter) { triggerInteractable(inter); return; }
      const ground = screenToGround(event.clientX, event.clientY);
      if (ground) { clickTarget = new THREE.Vector3(ground.x, player.pos.y, ground.z); pressedKeys.clear(); }
    };
    canvas.addEventListener("pointerdown", gamePointerDownHandler);
    gameKeyDownHandler = function (event) {
      pressedKeys.add(event.code);
      const action = keyToAction.get(event.code);
      if (action === "interact" && activeInteractable) { triggerInteractable(activeInteractable); event.preventDefault(); }
      if (action === "cancel") clickTarget = null;
      if (action === "zoom_in") setZoom(camDistance - 2);
      if (action === "zoom_out") setZoom(camDistance + 2);
      if (movementActionFor(event.code)) clickTarget = null;
    };
    gameKeyUpHandler = function (event) { pressedKeys.delete(event.code); };
    gameWheelHandler = function (event) {
      event.preventDefault();
      setZoom(camDistance + Math.sign(event.deltaY) * 2);
    };
    window.addEventListener("keydown", gameKeyDownHandler);
    window.addEventListener("keyup", gameKeyUpHandler);
    canvas.addEventListener("wheel", gameWheelHandler, { passive: false });
  }

  function movementActionFor(code) {
    const action = keyToAction.get(code);
    return action === "move_forward" || action === "move_back" || action === "move_left" || action === "move_right";
  }

  function updateOrbitMouseMapping(forceCtrl) {
    if (!orbitControls) return;
    if (forceCtrl !== undefined) modifierState.ctrlKey = Boolean(forceCtrl);
    orbitControls.mouseButtons.LEFT = THREE.MOUSE.NONE;
    orbitControls.mouseButtons.RIGHT = THREE.MOUSE.NONE;
    orbitControls.mouseButtons.MIDDLE = modifierState.ctrlKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  }

  function rememberEditorPointer(event) {
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    lastEditorPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    };
  }

  function pointerFromClientPoint(clientX, clientY, buttonOverride) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      y: -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      button: buttonOverride !== undefined ? buttonOverride : 0
    };
  }

  function configureCallbacks(callbacks) {
    onSelectEntity = callbacks.onSelectEntity || onSelectEntity;
    onTransformCommit = callbacks.onTransformCommit || onTransformCommit;
    onTransformEnd = callbacks.onTransformEnd || onTransformEnd;
    onTransformChange = callbacks.onTransformChange || onTransformChange;
    onModelLoadTiming = callbacks.onModelLoadTiming || onModelLoadTiming;
  }

  function updateDebugLoopState() {
    DEBUG_RUNTIME.activeLoopCount = rafId !== null || running ? 1 : 0;
    DEBUG_RUNTIME.running = running;
    DEBUG_RUNTIME.loopGeneration = loopGeneration;
  }

  function pushRenderReason(reason) {
    const entry = reason || "render";
    DEBUG_RUNTIME.lastRenderReasons.unshift(entry);
    if (DEBUG_RUNTIME.lastRenderReasons.length > 12) DEBUG_RUNTIME.lastRenderReasons.length = 12;
  }

  function requestRender(reason) {
    if (disposed) return;
    renderRequested = true;
    pushRenderReason(reason);
    if (rafId === null) startRenderLoop(reason);
  }

  function startRenderLoop(reason) {
    if (disposed || rafId !== null) return;
    running = true;
    loopGeneration += 1;
    lastTime = performance.now();
    updateDebugLoopState();
    rafId = requestAnimationFrame(renderFrame);
    if (reason) DEBUG_RUNTIME.lastStartReason = reason;
  }

  function stopRenderLoop(reason) {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    running = false;
    renderRequested = false;
    updateDebugLoopState();
    if (reason) DEBUG_RUNTIME.lastStopReason = reason;
  }

  function handleResize(reason) {
    if (disposed) return false;
    const rect = resizeTarget && typeof resizeTarget.getBoundingClientRect === "function"
      ? resizeTarget.getBoundingClientRect()
      : null;
    const width = Math.max(0, Math.floor(rect ? rect.width : canvas.clientWidth));
    const height = Math.max(0, Math.floor(rect ? rect.height : canvas.clientHeight));
    if (width <= 0 || height <= 0) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === lastResizeWidth && height === lastResizeHeight && ratio === lastResizePixelRatio) return false;
    const beforePosition = DEBUG_RUNTIME.enabled ? camera.position.clone() : null;
    const beforeTarget = DEBUG_RUNTIME.enabled && orbitControls ? orbitControls.target.clone() : null;
    lastResizeWidth = width;
    lastResizeHeight = height;
    lastResizePixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    DEBUG_RUNTIME.resizeCount += 1;
    if (DEBUG_RUNTIME.enabled && beforePosition) {
      const afterPosition = camera.position.clone();
      const afterTarget = orbitControls ? orbitControls.target.clone() : null;
      DEBUG_RUNTIME.lastResizeSnapshot = {
        reason: reason || "resize",
        before: {
          position: { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z },
          target: beforeTarget ? { x: beforeTarget.x, y: beforeTarget.y, z: beforeTarget.z } : null
        },
        after: {
          position: { x: afterPosition.x, y: afterPosition.y, z: afterPosition.z },
          target: afterTarget ? { x: afterTarget.x, y: afterTarget.y, z: afterTarget.z } : null
        }
      };
      if (beforePosition.distanceTo(afterPosition) > 0.0001 || (beforeTarget && afterTarget && beforeTarget.distanceTo(afterTarget) > 0.0001)) {
        DEBUG_RUNTIME.lastResizeSnapshot.warning = "camera position/target changed unexpectedly";
      }
    }
    requestRender(reason || "resize");
    return true;
  }

  function scheduleResize(reason) {
    if (disposed) return;
    pendingResizeReason = reason || "resize";
    if (resizeRafId !== null) return;
    resizeRafId = requestAnimationFrame(function () {
      resizeRafId = null;
      handleResize(pendingResizeReason);
    });
  }

  function renderFrame(time) {
    renderRequested = false;
    rafId = null;
    running = true;
    updateDebugLoopState();
    if (disposed) {
      running = false;
      updateDebugLoopState();
      return;
    }
    DEBUG_RUNTIME.renderCount += 1;
    const delta = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    const shouldAnimate = mode === "game" || (mode === "editor" && previewAnimations && animationMixers.size > 0);
    if (shouldAnimate) {
      for (const { mixer } of animationMixers.values()) {
        mixer.update(delta);
      }
    }
    if (selectionHelper?.visible) selectionHelper.update();
    if (transformGuide?.visible) updateTransformGuide();
    if (mode === "game") updatePlayer(delta);
    renderer.render(scene, camera);
    running = false;
    updateDebugLoopState();
    if (mode === "game") {
      startRenderLoop("game");
    } else if (shouldAnimate) {
      startRenderLoop("preview");
    } else if (renderRequested) {
      startRenderLoop("follow-up");
    }
  }

  function clearContent() {
    viewportPanSession = null;
    selectedEntityId = null;
    selectedRoot = null;
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = false;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    transformState.startPointer = null;
    transformState.currentPointer = null;
    if (selectionHelper) selectionHelper.visible = false;
    if (selectionHelper) selectionHelper.object = null;
    if (transformGuide) transformGuide.visible = false;
    if (orbitControls) orbitControls.enabled = true;
    for (const { mixer, root } of animationMixers.values()) {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
    animationMixers.clear();
    for (const child of Array.from(content.children)) {
      content.remove(child);
      disposeObject(child);
    }
    entityRoots.clear();
    solids.length = 0;
    interactables.length = 0;
    activeInteractable = null;
    player.root = null;
    loadErrors.length = 0;
  }

  function captureViewState() {
    if (mode !== "editor") return null;
    return {
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      cameraTarget: orbitControls ? { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z } : null,
      selectedEntityId: selectedEntityId,
      gizmoMode: transformState.mode === "move" ? "translate" : (transformState.mode || "translate"),
      localViewActive: localViewActive
    };
  }

  function restoreViewState(viewState) {
    if (mode !== "editor" || !viewState) return false;
    if (orbitControls && viewState.cameraPosition && viewState.cameraTarget) {
      camera.position.set(viewState.cameraPosition.x, viewState.cameraPosition.y, viewState.cameraPosition.z);
      orbitControls.target.set(viewState.cameraTarget.x, viewState.cameraTarget.y, viewState.cameraTarget.z);
      orbitControls.update();
    }
    selectedEntityId = viewState.selectedEntityId || null;
    refreshSelectedRootReference();
    if (viewState.gizmoMode) {
      transformState.mode = viewState.gizmoMode === "translate" ? "move" : viewState.gizmoMode;
    }
    transformSession = null;
    transformAxisConstraint = null;
    localViewActive = Boolean(viewState.localViewActive);
    applyLocalView();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function rootForSelectableId(entityId) {
    if (!entityId) return null;
    if (entityRoots.has(entityId)) return entityRoots.get(entityId) || null;
    if (player.root?.userData?.playerId === entityId) return player.root;
    return null;
  }

  function refreshSelectedRootReference() {
    if (!selectedEntityId) {
      selectedRoot = null;
      return null;
    }
    const freshRoot = rootForSelectableId(selectedEntityId);
    selectedRoot = freshRoot || null;
    if (!freshRoot) selectedEntityId = null;
    return freshRoot;
  }

  function selectableIdForObject(object) {
    if (!object) return null;
    return object.userData?.entityId || object.userData?.playerId || null;
  }

  function selectedObjectRoot() {
    return refreshSelectedRootReference();
  }

  function createTransformGuide() {
    const guide = new THREE.Group();
    guide.name = "GK editor transform guide";
    guide.visible = false;
    guide.renderOrder = 1000;
    const axes = [
      { name: "X", color: 0xff5a5f, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)] },
      { name: "Y", color: 0x78d87b, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)] },
      { name: "Z", color: 0x66aaff, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)] }
    ];
    for (const axis of axes) {
      const geometry = new THREE.BufferGeometry().setFromPoints(axis.points);
      const material = new THREE.LineBasicMaterial({
        color: axis.color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false
      });
      const line = new THREE.Line(geometry, material);
      line.name = "GK editor transform guide " + axis.name;
      line.renderOrder = 1000;
      line.raycast = function () {};
      guide.add(line);
    }
    guide.traverse(function (child) {
      child.raycast = function () {};
    });
    return guide;
  }

  function updateTransformGuide() {
    if (!transformGuide) return;
    const object = selectedRoot;
    transformGuide.visible = Boolean(object);
    if (!object) return;
    object.updateWorldMatrix(true, true);
    const position = new THREE.Vector3();
    object.getWorldPosition(position);
    transformGuide.position.copy(position);
    transformGuide.quaternion.identity();
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    transformGuide.scale.setScalar(Math.min(6, Math.max(0.75, maxSize * 0.65)));
  }

  function getSelectedEntitySnapshot() {
    const root = refreshSelectedRootReference();
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);
    return {
      entityId: selectableIdForObject(root),
      type: root.userData?.playerId ? "player_character" : "model_entity",
      position: { x: round(root.position.x), y: round(root.position.y), z: round(root.position.z) },
      rotation: {
        x: round(root.rotation.x / DEG_TO_RAD),
        y: round(root.rotation.y / DEG_TO_RAD),
        z: round(root.rotation.z / DEG_TO_RAD)
      },
      scale: { x: round(root.scale.x), y: round(root.scale.y), z: round(root.scale.z) },
      dimensions: { x: round(size.x), y: round(size.y), z: round(size.z) },
      hasBounds: !box.isEmpty()
    };
  }

  function updateSelectionHelper() {
    if (!selectionHelper) return;
    const object = refreshSelectedRootReference();
    if (!object) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
      if (selectionHelper.geometry?.computeBoundingBox) selectionHelper.geometry.computeBoundingBox();
      if (selectionHelper.geometry?.computeBoundingSphere) selectionHelper.geometry.computeBoundingSphere();
      updateTransformGuide();
      return;
    }
    object.updateWorldMatrix(true, true);
    object.traverse(function (child) {
      child.updateWorldMatrix(true, false);
    });
    selectionHelper.object = object;
    selectionHelper.visible = true;
    if (typeof selectionHelper.setFromObject === "function") selectionHelper.setFromObject(object);
    else selectionHelper.update();
    if (selectionHelper.geometry?.computeBoundingBox) selectionHelper.geometry.computeBoundingBox();
    if (selectionHelper.geometry?.computeBoundingSphere) selectionHelper.geometry.computeBoundingSphere();
    updateTransformGuide();
  }

  function clearSelectedRuntimeEntity() {
    selectedEntityId = null;
    selectedRoot = null;
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = false;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    if (selectionHelper) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
    }
    if (transformGuide) transformGuide.visible = false;
    transformAxisConstraint = null;
    if (orbitControls) orbitControls.enabled = true;
    applyLocalView();
  }

  function applyLocalView() {
    const activeRoot = localViewActive ? selectedRoot : null;
    for (const child of content.children) {
      child.visible = !activeRoot || child === activeRoot;
    }
  }

  function captureTransformStart(object) {
    return {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      values: objectToTransform(object)
    };
  }

  function restoreTransformStart(state) {
    if (!state || !transformSession?.object) return;
    transformSession.object.position.copy(state.position);
    transformSession.object.rotation.copy(state.rotation);
    transformSession.object.scale.copy(state.scale);
  }

  function constraintKeyToAxis(axisKey) {
    if (axisKey === "x") return "x";
    if (axisKey === "y") return "z";
    if (axisKey === "z") return "y";
    return null;
  }

  function currentTransformAxes() {
    if (!transformAxisConstraint) {
      return { x: true, y: true, z: true };
    }
    const axis = constraintKeyToAxis(transformAxisConstraint);
    return {
      x: axis === "x",
      y: axis === "y",
      z: axis === "z"
    };
  }

  function activeSnapMode() {
    if (snapState.mode === "off" && modifierState.ctrlKey) return "grid";
    return snapState.mode;
  }

  function pointerFromEvent(event, buttonOverride) {
    return {
      x: Number(event.clientX) || 0,
      y: Number(event.clientY) || 0,
      button: buttonOverride !== undefined ? buttonOverride : event.button
    };
  }

  function getObjectScreenCenter(object) {
    if (!object) return null;
    object.updateWorldMatrix(true, true);
    const worldPosition = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    const ndc = worldPosition.clone().project(camera);
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z) || ndc.z < -1 || ndc.z > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (ndc.x + 1) * 0.5 * rect.width,
      y: rect.top + (-ndc.y + 1) * 0.5 * rect.height
    };
  }

  function radialAngleForPointer(center, pointer) {
    if (!center || !pointer) return null;
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 8) return null;
    return Math.atan2(dy, dx);
  }

  function normalizeAngleDelta(delta) {
    if (!Number.isFinite(delta)) return null;
    let next = delta;
    while (next > Math.PI) next -= Math.PI * 2;
    while (next < -Math.PI) next += Math.PI * 2;
    return next;
  }

  function radialRotationDelta(transform, pointer) {
    const center = transform?.radialCenter || getObjectScreenCenter(transform?.object);
    const startAngle = Number.isFinite(transform?.radialStartAngle)
      ? transform.radialStartAngle
      : radialAngleForPointer(center, transform?.startPointer);
    const currentAngle = radialAngleForPointer(center, pointer);
    if (!Number.isFinite(startAngle) || !Number.isFinite(currentAngle)) {
      const dx = pointer.x - transform.startPointer.x;
      const dy = pointer.y - transform.startPointer.y;
      return (dx - dy) * 0.01;
    }
    const delta = normalizeAngleDelta(currentAngle - startAngle);
    return Number.isFinite(delta) ? delta : 0;
  }

  function worldUnitsPerPixel() {
    if (!orbitControls) return 0.01;
    const element = canvas;
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(orbitControls.target);
      if (!Number.isFinite(distance) || distance <= 0) return 0.01;
      const targetDistance = distance * Math.tan((camera.fov * DEG_TO_RAD) / 2);
      return 2 * targetDistance / Math.max(1, element.clientHeight || 1);
    }
    if (camera.isOrthographicCamera) {
      const height = Math.max(1, element.clientHeight || 1);
      return (camera.top - camera.bottom) / Math.max(1, camera.zoom * height);
    }
    return 0.01;
  }

  function transformLabelForMode(mode) {
    if (mode === "rotate") return "Rotate Z";
    if (mode === "scale") return "Scale";
    return "Move";
  }

  function rootForSelectedTransform() {
    return selectedRoot || rootForSelectableId(selectedEntityId);
  }

  function isPointerOverTransformControls() {
    return false;
  }

  function selectableRootForObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.entityId || current.userData?.playerId) return current;
      current = current.parent || null;
    }
    return null;
  }

  function applyTransformToObject(object, transform, pointer) {
    if (!object || !transform) return false;
    const mode = transform.mode || "move";
    const axis = transform.axis || null;
    const scale = worldUnitsPerPixel();
    const basis = cameraGroundBasis();
    const dx = pointer.x - transform.startPointer.x;
    const dy = pointer.y - transform.startPointer.y;
    let changed = false;
    if (mode === "move") {
      const groundDelta = new THREE.Vector3();
      groundDelta.addScaledVector(basis.right, -dx * scale);
      groundDelta.addScaledVector(basis.forward, -dy * scale);
      const next = transform.startPosition.clone();
      if (!axis) {
        next.x += groundDelta.x;
        next.z += groundDelta.z;
        next.y = transform.startPosition.y;
      } else if (axis === "x") {
        next.x += groundDelta.x;
      } else if (axis === "y") {
        next.z += groundDelta.z;
      } else if (axis === "z") {
        next.y += -dy * scale;
      }
      if (snapState.mode === "grid" || (snapState.mode === "off" && modifierState.ctrlKey)) {
        const gridSize = Math.max(0.0001, num(snapState.gridSize, 1));
        if (!axis || axis === "x") next.x = Math.round(next.x / gridSize) * gridSize;
        if (!axis || axis === "y") next.z = Math.round(next.z / gridSize) * gridSize;
        if (!axis || axis === "z") next.y = Math.round(next.y / gridSize) * gridSize;
      }
      if (snapState.mode === "ground" && object.userData.snapToGround !== false) {
        next.y = num(world?.ground?.y, 0);
      }
      if (!object.position.equals(next)) {
        object.position.copy(next);
        changed = true;
      }
    } else if (mode === "rotate") {
      const next = transform.startRotation.clone();
      const rotationAxis = constraintKeyToAxis(axis || "z") || "y";
      next[rotationAxis] = transform.startRotation[rotationAxis] + radialRotationDelta(transform, pointer);
      if (!object.rotation.equals(next)) {
        object.rotation.copy(next);
        changed = true;
      }
    } else if (mode === "scale") {
      const delta = (dx - dy) * 0.005;
      const next = transform.startScale.clone();
      if (!axis) {
        const uniform = Math.max(0.001, transform.startScale.x * (1 + delta));
        next.set(uniform, uniform, uniform);
      } else if (axis === "x") {
        next.x = Math.max(0.001, transform.startScale.x * (1 + delta));
      } else if (axis === "y") {
        next.z = Math.max(0.001, transform.startScale.z * (1 + delta));
      } else if (axis === "z") {
        next.y = Math.max(0.001, transform.startScale.y * (1 + delta));
      }
      if (!object.scale.equals(next)) {
        object.scale.copy(next);
        changed = true;
      }
    }
    return changed;
  }

  function applyTransformPreview(pointer, triggerChange = true) {
    if (!transformSession?.object) return false;
    const object = transformSession.object;
    const session = transformSession;
    session.currentPointer = { x: pointer.x, y: pointer.y };
    const changed = applyTransformToObject(object, session, pointer);
    if (changed) {
      updateSelectionHelper();
      if (triggerChange) onTransformChange(session.rootId, objectToTransform(object));
      requestRender();
    }
    return changed;
  }

  function beginTransform(modeName) {
    if (transformSession?.object) return false;
    const root = rootForSelectedTransform();
    if (!root || root.userData.transformable === false) return false;
    const mode = modeName === "translate" ? "move" : modeName === "rotate" || modeName === "scale" ? modeName : "move";
    const rect = canvas.getBoundingClientRect();
    const startPointer = lastEditorPointer
      ? { x: lastEditorPointer.clientX, y: lastEditorPointer.clientY }
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const radialCenter = mode === "rotate" ? getObjectScreenCenter(root) : null;
    transformState = {
      active: true,
      cancelled: false,
      object: root,
      rootId: selectableIdForObject(root),
      start: captureTransformStart(root),
      mode: mode,
      axis: transformAxisConstraint,
      startPointer: startPointer,
      currentPointer: { x: startPointer.x, y: startPointer.y },
      startPosition: root.position.clone(),
      startRotation: root.rotation.clone(),
      startScale: root.scale.clone(),
      radialCenter: radialCenter,
      radialStartAngle: radialAngleForPointer(radialCenter, startPointer)
    };
    transformSession = transformState;
    if (orbitControls) orbitControls.enabled = false;
    canvas.style.cursor = mode === "rotate" ? "ew-resize" : mode === "scale" ? "nwse-resize" : "move";
    applyTransformPreview(startPointer, false);
    updateSelectionHelper();
    onTransformChange(transformState.rootId, objectToTransform(root));
    requestRender();
    return true;
  }

  function beginKeyboardTransform() {
    return beginTransform(transformState.mode || "move");
  }

  function setGizmoMode(modeName) {
    const mode = modeName === "translate" ? "move" : modeName === "rotate" || modeName === "scale" ? modeName : "move";
    transformState.mode = mode;
    if (transformSession) {
      transformSession.mode = mode;
      if (transformSession.currentPointer) applyTransformPreview(transformSession.currentPointer);
    }
    requestRender();
  }

  function setTransformAxis(axis) {
    transformAxisConstraint = axis === "x" || axis === "y" || axis === "z" ? axis : null;
    if (transformSession) {
      transformSession.axis = transformAxisConstraint;
      if (transformSession.currentPointer) applyTransformPreview(transformSession.currentPointer);
    }
    applyTransformSnapState();
    requestRender();
  }

  function finishTransform(commit) {
    if (!transformSession?.object) return false;
    const session = transformSession;
    const object = session.object;
    const start = session.start;
    const rootId = session.rootId;
    const current = objectToTransform(object);
    const changed = Boolean(start && JSON.stringify(current) !== JSON.stringify(start.values));
    const shouldCommit = Boolean(commit && changed && rootId);
    if (!commit && start) {
      restoreTransformStart(start);
    }
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = !commit;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    if (orbitControls) orbitControls.enabled = true;
    canvas.style.cursor = "";
    transformAxisConstraint = null;
    clearSelectedRuntimeEntity();
    if (shouldCommit) onTransformCommit(rootId, current);
    onTransformEnd({
      action: commit ? "confirm" : "cancel",
      entityId: rootId,
      mode: session.mode,
      axis: session.axis,
      transform: current,
      changed: changed
    });
    updateSelectionHelper();
    requestRender();
    return shouldCommit;
  }

  function confirmTransform() {
    return finishTransform(true);
  }

  function cancelTransform() {
    return finishTransform(false);
  }

  function handleTransformPointerMove(event) {
    rememberEditorPointer(event);
    if (viewportPanSession) {
      handleViewportPanMove(event);
      return;
    }
    if (!transformSession?.object) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const pointer = pointerFromEvent(event, -1);
    applyTransformPreview(pointer);
  }

  function handleTransformPointerUp(event) {
    rememberEditorPointer(event);
    if (viewportPanSession) {
      handleViewportPanUp(event);
      return;
    }
    if (!transformSession?.object) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button === 2 || event.button === 1) {
      cancelTransform();
      return;
    }
    if (event.button === 0) {
      confirmTransform();
      return;
    }
  }

  function applyTransformSnapState() {
    if (!transformSession?.object) return;
    if (transformSession.currentPointer) {
      applyTransformPreview(transformSession.currentPointer, false);
    }
  }

  function fitDistanceForBox(box, fovDegrees) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxSize) || maxSize <= 0.0001) return 8;
    const fov = (fovDegrees || camera.fov || 60) * DEG_TO_RAD;
    return (maxSize * 1.25) / Math.tan(fov / 2);
  }

  function frameObject(object, preserveDirection) {
    if (!orbitControls || !object) return false;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      const target = new THREE.Vector3();
      object.getWorldPosition(target);
      orbitControls.target.copy(target);
      orbitControls.update();
      requestRender();
      return true;
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const currentOffset = camera.position.clone().sub(orbitControls.target);
    const direction = preserveDirection && currentOffset.lengthSq() > 0.0001
      ? currentOffset.normalize()
      : new THREE.Vector3(1, 1, 1).normalize();
    const distance = Math.max(1, fitDistanceForBox(box, camera.fov));
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function frameEntity(entityId) {
    const object = rootForSelectableId(entityId);
    if (!object) return false;
    return frameObject(object, true);
  }

  function frameAll() {
    if (localViewActive && selectedObjectRoot()) {
      return frameObject(selectedObjectRoot(), true);
    }
    return frameObject(content, true);
  }

  function setView(viewName) {
    if (!orbitControls) return false;
    const object = selectedObjectRoot() || content;
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    if (box.isEmpty()) {
      object.getWorldPosition(center);
    } else {
      box.getCenter(center);
    }
    const distance = Math.max(1, camera.position.distanceTo(orbitControls.target) || camDistance || 8);
    let direction = null;
    if (viewName === "front") direction = new THREE.Vector3(0, 0, 1);
    else if (viewName === "right") direction = new THREE.Vector3(1, 0, 0);
    else if (viewName === "top") direction = new THREE.Vector3(0, 1, 0);
    if (!direction) return false;
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    if (viewName === "top") camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function setTransformAxisConstraint(axis) {
    return setTransformAxis(axis);
  }

  function beginViewportPan(event) {
    if (!orbitControls || !event) return false;
    viewportPanSession = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
    if (typeof canvas.setPointerCapture === "function" && event.pointerId !== undefined) {
      try { canvas.setPointerCapture(event.pointerId); } catch {}
    }
    return true;
  }

  function panOrbitByPixels(deltaX, deltaY) {
    if (!orbitControls) return;
    const element = canvas;
    const pan = new THREE.Vector3();
    camera.updateMatrixWorld(true);
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(orbitControls.target);
      if (!Number.isFinite(distance) || distance <= 0) return;
      const targetDistance = distance * Math.tan((camera.fov * DEG_TO_RAD) / 2);
      const scale = 2 * targetDistance / Math.max(1, element.clientHeight || 1);
      pan.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * scale);
      pan.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), deltaY * scale);
    } else if (camera.isOrthographicCamera) {
      const width = Math.max(1, element.clientWidth || 1);
      const height = Math.max(1, element.clientHeight || 1);
      const scaleX = (camera.right - camera.left) / Math.max(1, camera.zoom * width);
      const scaleY = (camera.top - camera.bottom) / Math.max(1, camera.zoom * height);
      pan.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * scaleX);
      pan.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), deltaY * scaleY);
    } else {
      return;
    }
    camera.position.add(pan);
    orbitControls.target.add(pan);
    orbitControls.update();
    requestRender();
  }

  function handleViewportPanMove(event) {
    if (!viewportPanSession || event.pointerId !== viewportPanSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const deltaX = event.clientX - viewportPanSession.lastClientX;
    const deltaY = event.clientY - viewportPanSession.lastClientY;
    viewportPanSession.lastClientX = event.clientX;
    viewportPanSession.lastClientY = event.clientY;
    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) panOrbitByPixels(deltaX, deltaY);
  }

  function handleViewportPanUp(event) {
    if (!viewportPanSession || event.pointerId !== viewportPanSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    viewportPanSession = null;
    if (typeof canvas.releasePointerCapture === "function" && event.pointerId !== undefined) {
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    }
    requestRender();
  }

  function setSnapState(modeName, gridSize) {
    snapState.mode = ["off", "grid", "ground"].includes(modeName) ? modeName : "off";
    snapState.gridSize = Math.max(0.001, num(gridSize, 1));
    applyTransformSnapState();
    requestRender();
  }

  function setAnimationPreviewEnabled(enabled) {
    previewAnimations = Boolean(enabled);
    requestRender("preview-toggle");
    return previewAnimations;
  }

  function isAnimationPreviewEnabled() {
    return previewAnimations;
  }

  function applyCameraConfig(worldData) {
    const cam = worldData?.camera;
    camPitch = num(cam?.pitch, 60);
    camYaw = num(cam?.yaw, 0);
    camDistance = num(cam?.distance, 20);
    camMinDistance = num(cam?.minDistance, 6);
    camMaxDistance = num(cam?.maxDistance, 60);
    camFollow = cam?.follow !== false;
    camRotateSpeed = num(cam?.rotateSpeed, 90);
    camera.fov = num(cam?.fov, 55);
    camera.updateProjectionMatrix();
    camTarget.set(player.pos.x, player.pos.y, player.pos.z);
    updateCameraPosition();
    if (orbitControls) {
      orbitControls.target.copy(camTarget);
      orbitControls.minDistance = camMinDistance;
      orbitControls.maxDistance = camMaxDistance;
      orbitControls.update();
    }
  }

  function updateCameraPosition() {
    const pitchRad = camPitch * DEG_TO_RAD;
    const yawRad = camYaw * DEG_TO_RAD;
    const horizontal = Math.cos(pitchRad) * camDistance;
    const offsetX = Math.sin(yawRad) * horizontal;
    const offsetZ = Math.cos(yawRad) * horizontal;
    const offsetY = Math.sin(pitchRad) * camDistance;
    camera.position.set(camTarget.x + offsetX, camTarget.y + offsetY, camTarget.z + offsetZ);
    camera.lookAt(camTarget);
  }

  function setZoom(value) {
    camDistance = Math.min(camMaxDistance, Math.max(camMinDistance, value));
  }

  function addGround(worldData) {
    const ground = worldData?.ground;
    if (!ground?.width || !ground?.depth) return;
    const geometry = new THREE.PlaneGeometry(num(ground.width, 1), num(ground.depth, 1), 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const materialOptions = { color: new THREE.Color(colorOrDefault(ground.materialColor, "#ffffff")), roughness: 0.9, metalness: 0 };
    const textureAsset = assetById(worldData, ground.textureAssetId);
    if (textureAsset?.sourcePath) {
      let texture = textureCache.get(textureAsset.id);
      if (!texture) {
        texture = textureLoader.load(textureAsset.sourcePath, requestRender, undefined, function (error) {
          loadErrors.push("Ground texture: " + textureAsset.name);
          renderHud();
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const repeat = num(ground.textureRepeat, 1);
        texture.repeat.set(repeat, repeat);
        textureCache.set(textureAsset.id, texture);
      }
      materialOptions.map = texture;
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(materialOptions));
    mesh.name = "published-ground";
    mesh.receiveShadow = true;
    mesh.position.y = num(ground.y, 0);
    content.add(mesh);
  }

  function addLights(worldData) {
    for (const light of worldData?.lights || []) {
      if (light.type === "ambient") {
        content.add(new THREE.AmbientLight(colorOrDefault(light.color, "#ffffff"), num(light.intensity, 0)));
      } else if (light.type === "directional") {
        const directional = new THREE.DirectionalLight(colorOrDefault(light.color, "#ffffff"), num(light.intensity, 0));
        directional.position.set(num(light.position?.x, 0), num(light.position?.y, 0), num(light.position?.z, 0));
        directional.castShadow = true;
        directional.shadow.mapSize.set(2048, 2048);
        directional.shadow.camera.left = -60;
        directional.shadow.camera.right = 60;
        directional.shadow.camera.top = 60;
        directional.shadow.camera.bottom = -60;
        directional.shadow.camera.far = 400;
        content.add(directional);
      }
    }
  }

  function loadModelInto(root, assetId, worldData, onReady) {
    const asset = assetById(worldData, assetId);
    if (!asset?.sourcePath) return;
    let record = modelCache.get(asset.id);
    if (!record) {
      record = { status: "loading", gltf: null, waiters: [] };
      modelCache.set(asset.id, record);
      const startedAt = performance.now();
      console.info("[timing] GLTFLoader load start asset=" + asset.id + " path=" + asset.sourcePath);
      try {
        loader.load(asset.sourcePath, function (gltf) {
          record.status = "ready";
          record.gltf = gltf;
          record.gltf.animations = normalizeAnimations(gltf.animations);
          console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms");
          if (typeof onModelLoadTiming === "function") {
            onModelLoadTiming({
              assetId: asset.id,
              assetName: asset.name,
              sourcePath: asset.sourcePath,
              durationMs: Number(timingMs(startedAt)),
              ok: true
            });
          }
          for (const waiter of record.waiters.splice(0)) waiter(gltf);
        }, undefined, function () {
          record.status = "error";
          loadErrors.push("Model: " + asset.name);
          renderHud();
          console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms error");
          if (typeof onModelLoadTiming === "function") {
            onModelLoadTiming({
              assetId: asset.id,
              assetName: asset.name,
              sourcePath: asset.sourcePath,
              durationMs: Number(timingMs(startedAt)),
              ok: false
            });
          }
        });
      } catch (error) {
        record.status = "error";
        loadErrors.push("Model: " + asset.name);
        renderHud();
        console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms error");
        if (typeof onModelLoadTiming === "function") {
          onModelLoadTiming({
            assetId: asset.id,
            assetName: asset.name,
            sourcePath: asset.sourcePath,
            durationMs: Number(timingMs(startedAt)),
            ok: false
          });
        }
        throw error;
      }
    }
    const attach = function (gltf) {
      const clone = SkeletonUtils.clone(gltf.scene);
      clone.traverse(function (child) {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      root.add(clone);
      const mixer = new THREE.AnimationMixer(clone);
      animationMixers.set(root, {
        mixer: mixer,
        root: clone,
        actions: new Map(),
        currentAction: null,
        currentClipName: null,
        clips: gltf.animations || [],
        assetMetadata: asset.metadata || {}
      });
      playAnimationState(root, "idle", 0);
      if (onReady) onReady(clone);
      if (selectedEntityId && selectableIdForObject(root) === selectedEntityId) selectEntity(selectedEntityId);
      requestRender();
    };
    if (record.status === "ready") attach(record.gltf);
    if (record.status === "loading") record.waiters.push(attach);
  }

  function transformObject(object, transform) {
    const position = transform?.position || {};
    const rotation = transform?.rotation || {};
    const scale = transform?.scale || {};
    object.position.set(num(position.x, 0), num(position.y, 0), num(position.z, 0));
    object.rotation.set(num(rotation.x, 0) * DEG_TO_RAD, num(rotation.y, 0) * DEG_TO_RAD, num(rotation.z, 0) * DEG_TO_RAD);
    object.scale.set(num(scale.x, 1), num(scale.y, 1), num(scale.z, 1));
  }

  function objectToTransform(object) {
    return {
      x: round(object.position.x),
      y: round(object.position.y),
      z: round(object.position.z),
      rotationX: round(object.rotation.x / DEG_TO_RAD),
      rotationY: round(object.rotation.y / DEG_TO_RAD),
      rotationZ: round(object.rotation.z / DEG_TO_RAD),
      scaleX: round(object.scale.x),
      scaleY: round(object.scale.y),
      scaleZ: round(object.scale.z)
    };
  }

  function round(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function normalizeAnimations(animations) {
    return (animations || []).map(function (clip, index) {
      const next = clip.clone();
      const name = String(next.name || "").trim();
      next.name = name || "Animation " + (index + 1);
      return next;
    });
  }

  function findClipName(clips, preferredName) {
    const names = (clips || []).map(function (clip) { return String(clip?.name || "").trim(); }).filter(Boolean);
    if (!names.length) return null;
    const preferred = String(preferredName || "").trim();
    if (!preferred) return null;
    const exact = names.find(function (name) { return name === preferred; });
    if (exact) return exact;
    const lower = preferred.toLowerCase();
    const caseMatch = names.find(function (name) { return name.toLowerCase() === lower; });
    if (caseMatch) return caseMatch;
    const contains = names.find(function (name) { return name.toLowerCase().includes(lower); });
    if (contains) return contains;
    return null;
  }

  function resolveClipNameForState(root, clips, stateName, assetMetadata) {
    const state = String(stateName || "").trim().toLowerCase();
    const data = root?.userData || {};
    if (!Array.isArray(clips) || !clips.length) return null;
    if (state === "walk") {
      return findClipName(clips, data.walkAnimation)
        || findClipName(clips, "Walk")
        || resolveClipNameForState(root, clips, "idle", assetMetadata);
    }
    if (state === "run") {
      return findClipName(clips, data.runAnimation)
        || findClipName(clips, "Run")
        || resolveClipNameForState(root, clips, "walk", assetMetadata)
        || resolveClipNameForState(root, clips, "idle", assetMetadata);
    }
    const defaultName = String(assetMetadata?.defaultAnimation || "").trim();
    return findClipName(clips, data.idleAnimation)
      || findClipName(clips, data.animationClip)
      || findClipName(clips, defaultName)
      || findClipName(clips, "Idle")
      || String(clips[0]?.name || "").trim()
      || null;
  }

  function getAnimationAction(record, clipName) {
    if (!record || !clipName) return null;
    const existing = record.actions.get(clipName);
    if (existing) return existing;
    const clip = (record.clips || []).find(function (candidate) {
      return String(candidate?.name || "").trim() === clipName;
    }) || null;
    if (!clip) return null;
    const action = record.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    record.actions.set(clipName, action);
    return action;
  }

  function playAnimationState(root, stateName, fadeSeconds = 0.15) {
    const record = animationMixers.get(root);
    if (!record || !Array.isArray(record.clips) || !record.clips.length) return null;
    const clipName = resolveClipNameForState(root, record.clips, stateName, record.assetMetadata || {});
    if (!clipName) return null;
    if (record.currentClipName === clipName) return clipName;
    const nextAction = getAnimationAction(record, clipName);
    if (!nextAction) return null;
    const previousAction = record.currentAction;
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    if (previousAction && previousAction !== nextAction) {
      if (fadeSeconds > 0) {
        previousAction.fadeOut(fadeSeconds);
        nextAction.fadeIn(fadeSeconds);
      } else {
        previousAction.stop();
      }
    } else {
      nextAction.setEffectiveWeight(1);
    }
    nextAction.play();
    record.currentAction = nextAction;
    record.currentClipName = clipName;
    return clipName;
  }

  function addEntity(worldData, entity) {
    const root = new THREE.Group();
    root.userData.entityId = entity.id;
    root.userData.transformable = true;
    root.userData.snapToGround = true;
    root.userData.animationClip = entity.animationClip || null;
    root.userData.idleAnimation = entity.idleAnimation || null;
    root.userData.walkAnimation = entity.walkAnimation || null;
    root.userData.runAnimation = entity.runAnimation || null;
    root.name = entity.id;
    transformObject(root, entity.transform);
    entityRoots.set(entity.id, root);
    content.add(root);
    loadModelInto(root, entity.modelAssetId, worldData);
    if (entity.solid) {
      solids.push({ x: num(entity.transform?.position?.x, 0), z: num(entity.transform?.position?.z, 0), radius: num(entity.collisionRadius, 1) });
    }
  }

  function addInteractable(worldData, inter) {
    const x = num(inter.position?.x, 0);
    const z = num(inter.position?.z, 0);
    const groundY = num(worldData?.ground?.y, 0);
    if (inter.modelAssetId) {
      const root = new THREE.Group();
      root.userData.interactableId = inter.id;
      root.userData.transformable = false;
      root.userData.snapToGround = true;
      root.position.set(x, groundY, z);
      content.add(root);
      loadModelInto(root, inter.modelAssetId, worldData);
    }
    interactables.push({ id: inter.id, x: x, z: z, radius: num(inter.radius, 2), prompt: inter.prompt, action: inter.action });
  }

  function spawnPlayer(worldData) {
    const def = worldData?.player;
    const spawn = worldData?.spawn;
    if (!def || !spawn) return;
    const groundY = num(worldData?.ground?.y, 0);
    player.speed = num(def.moveSpeed, 6);
    player.sprint = num(def.sprintMultiplier, 1.6);
    player.turnSpeed = num(def.turnSpeed, 600);
    player.radius = num(def.collisionRadius, 0.5);
    player.facing = num(spawn.facing, 0) * DEG_TO_RAD;
    player.pos.set(num(spawn.x, 0), groundY, num(spawn.z, 0));
    const root = new THREE.Group();
    root.name = "player";
    root.userData.playerId = def.id;
    root.userData.transformable = false;
    root.userData.snapToGround = false;
    root.userData.animationClip = def.animationClip || null;
    root.userData.idleAnimation = def.idleAnimation || null;
    root.userData.walkAnimation = def.walkAnimation || null;
    root.userData.runAnimation = def.runAnimation || null;
    root.position.copy(player.pos);
    root.rotation.y = player.facing;
    const scale = num(def.scale, 1);
    root.scale.set(scale, scale, scale);
    player.root = root;
    content.add(root);
    loadModelInto(root, def.modelAssetId, worldData);
  }

  function selectEntity(entityId) {
    selectedEntityId = entityId || null;
    refreshSelectedRootReference();
    applyLocalView();
    if (selectionHelper) updateSelectionHelper();
    requestRender();
  }

  function pickEntity(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(content.children, true);
    if (!hits.length) return null;
    for (const hit of hits) {
      let object = hit.object;
      while (object && object !== content) {
        if (object.visible === false) break;
        if (object === selectionHelper || object === transformGuide) break;
        if (object.name === "GK editor transform guide" || String(object.name || "").startsWith("GK editor transform guide")) break;
        if (object.userData?.entityId || object.userData?.playerId) {
          return object.userData.entityId || object.userData.playerId || null;
        }
        object = object.parent || null;
      }
    }
    return null;
  }

  function pickInteractable(event) {
    const ground = screenToGround(event.clientX, event.clientY);
    if (!ground) return null;
    let best = null;
    let bestDist = Infinity;
    for (const inter of interactables) {
      const dist = Math.hypot(ground.x - inter.x, ground.z - inter.z);
      if (dist <= inter.radius && dist < bestDist) { best = inter; bestDist = dist; }
    }
    // Only trigger via click if player is also within range, so clicks far away walk instead.
    if (best && Math.hypot(player.pos.x - best.x, player.pos.z - best.z) <= best.radius) return best;
    return null;
  }

  function triggerInteractable(inter) {
    const action = inter.action || {};
    if (action.type === "teleport" && Number.isFinite(action.teleport?.x) && Number.isFinite(action.teleport?.z)) {
      player.pos.x = action.teleport.x;
      player.pos.z = action.teleport.z;
      clickTarget = null;
      showPrompt("Geteleporteerd.");
      return;
    }
    if (action.type === "message") {
      showPrompt(action.message || inter.prompt || "");
    }
  }

  function screenToGround(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const groundY = num(world?.ground?.y, 0);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: round(hit.x), y: groundY, z: round(hit.z) };
  }

  function resolveCollision(target) {
    const ground = world?.ground;
    if (ground) {
      const halfW = num(ground.width, 0) / 2 - player.radius;
      const halfD = num(ground.depth, 0) / 2 - player.radius;
      target.x = Math.min(halfW, Math.max(-halfW, target.x));
      target.z = Math.min(halfD, Math.max(-halfD, target.z));
    }
    for (const solid of solids) {
      const dx = target.x - solid.x;
      const dz = target.z - solid.z;
      const minDist = player.radius + solid.radius;
      const dist = Math.hypot(dx, dz);
      if (dist > 0 && dist < minDist) {
        const push = (minDist - dist) / dist;
        target.x += dx * push;
        target.z += dz * push;
      }
    }
    return target;
  }

  function buildKeyMap(worldData) {
    keyToAction.clear();
    for (const bind of worldData?.keybinds || []) {
      if (bind.keyCode && bind.action) keyToAction.set(bind.keyCode, bind.action);
    }
  }

  function cameraGroundBasis() {
    const target = orbitControls ? orbitControls.target : camTarget;
    const forward = new THREE.Vector3(target.x - camera.position.x, 0, target.z - camera.position.z);
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    return { forward, right };
  }

  function updatePlayer(delta) {
    if (mode !== "game" || !player.root) return;
    const move = new THREE.Vector3();
    const basis = cameraGroundBasis();
    let usingKeys = false;
    let isMoving = false;
    let isSprinting = false;
    if (isActionPressed("move_forward")) { move.add(basis.forward); usingKeys = true; }
    if (isActionPressed("move_back")) { move.sub(basis.forward); usingKeys = true; }
    if (isActionPressed("move_left")) { move.sub(basis.right); usingKeys = true; }
    if (isActionPressed("move_right")) { move.add(basis.right); usingKeys = true; }
    if (isActionPressed("rotate_cam_left")) camYaw -= camRotateSpeed * delta;
    if (isActionPressed("rotate_cam_right")) camYaw += camRotateSpeed * delta;

    if (!usingKeys && clickTarget) {
      const toTarget = new THREE.Vector3(clickTarget.x - player.pos.x, 0, clickTarget.z - player.pos.z);
      const dist = toTarget.length();
      if (dist < 0.05) { clickTarget = null; } else { move.copy(toTarget).normalize(); }
    }

    if (move.lengthSq() > 0.0001) {
      move.normalize();
      const wantsSprint = usingKeys && isActionPressed("sprint");
      const speed = player.speed * (wantsSprint ? player.sprint : 1);
      const next = new THREE.Vector3(player.pos.x + move.x * speed * delta, player.pos.y, player.pos.z + move.z * speed * delta);
      resolveCollision(next);
      if (next.distanceToSquared(player.pos) > 0.000001) {
        player.pos.copy(next);
        isMoving = true;
        isSprinting = wantsSprint;
      }
      const desiredFacing = Math.atan2(move.x, move.z);
      player.facing = stepAngle(player.facing, desiredFacing, player.turnSpeed * DEG_TO_RAD * delta);
    }

    player.root.position.copy(player.pos);
    player.root.rotation.y = player.facing;
    playAnimationState(player.root, isMoving ? (isSprinting ? "run" : "walk") : "idle");

    if (camFollow) camTarget.lerp(player.pos, Math.min(1, delta * 8));
    updateCameraPosition();
    updateInteractionFocus();
  }

  function isActionPressed(action) {
    for (const [code, boundAction] of keyToAction) {
      if (boundAction === action && pressedKeys.has(code)) return true;
    }
    return false;
  }

  function stepAngle(current, target, maxStep) {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return target;
    return current + Math.sign(diff) * maxStep;
  }

  function updateInteractionFocus() {
    let best = null;
    let bestDist = Infinity;
    for (const inter of interactables) {
      const dist = Math.hypot(player.pos.x - inter.x, player.pos.z - inter.z);
      if (dist <= inter.radius && dist < bestDist) { best = inter; bestDist = dist; }
    }
    if (best !== activeInteractable) {
      activeInteractable = best;
      renderHud();
    }
  }

  // ---- HUD ----
  function buildHud() {
    if (!hudElement) return;
    hudElement.innerHTML = "";
    const prompt = document.createElement("div");
    prompt.className = "hud-prompt";
    prompt.style.display = "none";
    hudElement.appendChild(prompt);
    hudNodes.prompt = prompt;
  }

  function setHudModules(modules) {
    hudModules = modules || [];
    if (!hudElement) return;
    for (const node of hudNodes.anchored.values()) node.remove();
    hudNodes.anchored.clear();
    for (const mod of hudModules) {
      if (mod.type !== "hud_text") continue;
      const el = document.createElement("div");
      el.className = "hud-text anchor-" + (mod.anchor || "top-left");
      el.textContent = mod.text || "";
      el.style.fontSize = num(mod.fontSize, 16) + "px";
      el.style.color = colorOrDefault(mod.color, "#ffffff");
      hudElement.appendChild(el);
      hudNodes.anchored.set(mod.id, el);
    }
  }

  function renderHud() {
    if (!hudElement || !hudNodes.prompt) return;
    if (activeInteractable) {
      hudNodes.prompt.textContent = activeInteractable.prompt || "Interact";
      hudNodes.prompt.style.display = "block";
    } else {
      hudNodes.prompt.style.display = "none";
    }
    if (loadErrors.length && options.onLoadErrors) options.onLoadErrors(loadErrors.slice());
  }

  let promptTimer = null;
  function showPrompt(text) {
    if (!hudNodes.prompt) return;
    hudNodes.prompt.textContent = text;
    hudNodes.prompt.style.display = "block";
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = setTimeout(function () { renderHud(); }, 1800);
  }

  function setWorld(nextWorld) {
    world = nextWorld || null;
    const editorViewState = mode === "editor" && editorViewInitialized ? captureViewState() : null;
    clearContent();
    scene.background = new THREE.Color(colorOrDefault(world?.world?.backgroundColor, "#0b1622"));
    if (world?.world?.fogColor && num(world.world.fogDensity, 0) > 0) {
      scene.fog = new THREE.FogExp2(colorOrDefault(world.world.fogColor, "#0b1622"), num(world.world.fogDensity, 0));
    } else {
      scene.fog = null;
    }
    addGround(world);
    addLights(world);
    spawnPlayer(world);
    for (const entity of world?.entities || []) addEntity(world, entity);
    for (const inter of world?.interactables || []) addInteractable(world, inter);
    buildKeyMap(world);
    if (mode === "game") {
      setHudModules(world?.ui || []);
      camTarget.copy(player.pos);
    }
    applyCameraConfig(world);
    const restoredEditorView = editorViewState ? restoreViewState(editorViewState) : false;
    renderHud();
    if (!restoredEditorView) requestRender();
    if (mode === "editor") editorViewInitialized = true;
  }

  function destroy() {
    disposed = true;
    stopRenderLoop("destroy");
    viewportPanSession = null;
    if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
    windowResizeHandler = null;
    if (orbitControls) {
      orbitControls.removeEventListener("change", requestRender);
      if (typeof orbitControls.dispose === "function") orbitControls.dispose();
    }
    if (selectionHelper) {
      scene.remove(selectionHelper);
      if (selectionHelper.geometry) selectionHelper.geometry.dispose();
      if (selectionHelper.material) selectionHelper.material.dispose();
      selectionHelper = null;
    }
    if (transformGuide) {
      scene.remove(transformGuide);
      disposeObject(transformGuide);
      transformGuide = null;
    }
    if (editorPointerDownCaptureHandler) canvas.removeEventListener("pointerdown", editorPointerDownCaptureHandler, true);
    if (editorPointerUpCaptureHandler) {
      canvas.removeEventListener("pointerup", editorPointerUpCaptureHandler, true);
      canvas.removeEventListener("pointercancel", editorPointerUpCaptureHandler, true);
    }
    if (editorDirectPointerMoveHandler) {
      canvas.removeEventListener("pointermove", editorDirectPointerMoveHandler, true);
      window.removeEventListener("pointermove", editorDirectPointerMoveHandler, true);
    }
    if (editorDirectPointerUpHandler) {
      canvas.removeEventListener("pointerup", editorDirectPointerUpHandler, true);
      canvas.removeEventListener("pointercancel", editorDirectPointerUpHandler, true);
      window.removeEventListener("pointerup", editorDirectPointerUpHandler, true);
      window.removeEventListener("pointercancel", editorDirectPointerUpHandler, true);
    }
    if (editorContextMenuHandler) canvas.removeEventListener("contextmenu", editorContextMenuHandler);
    if (editorKeyDownHandler) window.removeEventListener("keydown", editorKeyDownHandler);
    if (editorKeyUpHandler) window.removeEventListener("keyup", editorKeyUpHandler);
    if (editorPointerDownHandler) canvas.removeEventListener("pointerdown", editorPointerDownHandler);
    if (gamePointerDownHandler) canvas.removeEventListener("pointerdown", gamePointerDownHandler);
    if (gameKeyDownHandler) window.removeEventListener("keydown", gameKeyDownHandler);
    if (gameKeyUpHandler) window.removeEventListener("keyup", gameKeyUpHandler);
    if (gameWheelHandler) canvas.removeEventListener("wheel", gameWheelHandler);
    DEBUG_RUNTIME.activeResizeHandlers = 0;
  }

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(function () {
      scheduleResize("observer");
    });
    resizeObserver.observe(resizeTarget);
    DEBUG_RUNTIME.activeResizeHandlers = 1;
  } else {
    windowResizeHandler = function () {
      scheduleResize("window");
    };
    window.addEventListener("resize", windowResizeHandler);
    DEBUG_RUNTIME.activeResizeHandlers = 1;
  }
  scheduleResize("init");
  requestRender("init");

  function focusSelected() {
    return frameEntity(selectedEntityId);
  }

  function deselect() {
    clearSelectedRuntimeEntity();
    requestRender();
  }

  function setLocalView(enabled) {
    localViewActive = Boolean(enabled);
    applyLocalView();
    updateSelectionHelper();
    requestRender();
    return localViewActive;
  }

  function toggleLocalView() {
    return setLocalView(!localViewActive);
  }

  function isLocalViewActive() {
    return localViewActive;
  }

  function isTransformActive() {
    return Boolean(transformSession?.object);
  }

  function isTransformControlsAttached() {
    return Boolean(selectedRoot);
  }

  return {
    setWorld: setWorld,
    render: requestRender,
    destroy: destroy,
    dispose: destroy,
    screenToGround: screenToGround,
    selectEntity: selectEntity,
    frameEntity: frameEntity,
    frameAll: frameAll,
    captureViewState: captureViewState,
    restoreViewState: restoreViewState,
    configureCallbacks: configureCallbacks,
    beginTransform: beginTransform,
    setGizmoMode: setGizmoMode,
    setTransformAxis: setTransformAxis,
    setTransformAxisConstraint: setTransformAxisConstraint,
    setSnapState: setSnapState,
    setAnimationPreviewEnabled: setAnimationPreviewEnabled,
    isAnimationPreviewEnabled: isAnimationPreviewEnabled,
    isPointerOverTransformControls: isPointerOverTransformControls,
    beginKeyboardTransform: beginKeyboardTransform,
    setView: setView,
    setLocalView: setLocalView,
    toggleLocalView: toggleLocalView,
    isLocalViewActive: isLocalViewActive,
    focusSelected: focusSelected,
    cancelTransform: cancelTransform,
    confirmTransform: confirmTransform,
    cancelTransformSession: cancelTransform,
    confirmTransformSession: confirmTransform,
    isTransformActive: isTransformActive,
    isTransformControlsAttached: isTransformControlsAttached,
    getSelectedEntitySnapshot: getSelectedEntitySnapshot,
    getSelectedEntityId: function () { return selectedEntityId; },
    deselect: deselect,
    getLoadErrors: function () { return loadErrors.slice(); }
  };
}
