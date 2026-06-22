import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

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

  let world = null;
  let orbitControls = null;
  let transformControls = null;
  let selectedEntityId = null;
  let onSelectEntity = options.onSelectEntity || function () {};
  let onTransformCommit = options.onTransformCommit || function () {};
  const loadErrors = [];
  let editorViewInitialized = false;
  let disposed = false;
  let editorPointerDownHandler = null;
  let transformDraggingHandler = null;
  let transformMouseUpHandler = null;
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
    orbitControls.maxPolarAngle = Math.PI * 0.49;
    orbitControls.addEventListener("change", requestRender);
    transformControls = new TransformControls(camera, canvas);
    transformDraggingHandler = function (event) {
      if (orbitControls) orbitControls.enabled = !event.value;
      requestRender();
    };
    transformMouseUpHandler = function () {
      const object = transformControls.object;
      if (!object?.userData?.entityId) return;
      onTransformCommit(object.userData.entityId, objectToTransform(object));
    };
    transformControls.addEventListener("dragging-changed", transformDraggingHandler);
    transformControls.addEventListener("objectChange", requestRender);
    transformControls.addEventListener("mouseUp", transformMouseUpHandler);
    scene.add(transformControls);
    editorPointerDownHandler = function (event) {
      if (event.button !== 0) return;
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

  function configureCallbacks(callbacks) {
    onSelectEntity = callbacks.onSelectEntity || onSelectEntity;
    onTransformCommit = callbacks.onTransformCommit || onTransformCommit;
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
    if (mode === "game") updatePlayer(delta);
    renderer.render(scene, camera);
    running = false;
    updateDebugLoopState();
    if (mode === "game") {
      startRenderLoop("game");
    } else if (renderRequested) {
      startRenderLoop("follow-up");
    }
  }

  function clearContent() {
    if (transformControls) transformControls.detach();
    selectedEntityId = null;
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
      gizmoMode: transformControls?.mode || "translate"
    };
  }

  function restoreViewState(viewState) {
    if (mode !== "editor" || !viewState) return false;
    if (orbitControls && viewState.cameraPosition && viewState.cameraTarget) {
      camera.position.set(viewState.cameraPosition.x, viewState.cameraPosition.y, viewState.cameraPosition.z);
      orbitControls.target.set(viewState.cameraTarget.x, viewState.cameraTarget.y, viewState.cameraTarget.z);
      orbitControls.update();
    }
    selectedEntityId = viewState.selectedEntityId && entityRoots.has(viewState.selectedEntityId) ? viewState.selectedEntityId : null;
    if (transformControls) {
      if (viewState.gizmoMode && ["translate", "rotate", "scale"].includes(viewState.gizmoMode)) {
        transformControls.setMode(viewState.gizmoMode);
      }
      if (selectedEntityId) {
        const object = entityRoots.get(selectedEntityId);
        if (object) transformControls.attach(object); else transformControls.detach();
      } else {
        transformControls.detach();
      }
    }
    requestRender();
    return true;
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
      loader.load(asset.sourcePath, function (gltf) {
        record.status = "ready";
        record.gltf = gltf;
        for (const waiter of record.waiters.splice(0)) waiter(gltf);
      }, undefined, function () {
        record.status = "error";
        loadErrors.push("Model: " + asset.name);
        renderHud();
      });
    }
    const attach = function (gltf) {
      const clone = gltf.scene.clone(true);
      clone.traverse(function (child) {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      root.add(clone);
      if (onReady) onReady(clone);
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
      rotationY: round(object.rotation.y / DEG_TO_RAD),
      scaleX: round(object.scale.x),
      scaleY: round(object.scale.y),
      scaleZ: round(object.scale.z)
    };
  }

  function round(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function addEntity(worldData, entity) {
    const root = new THREE.Group();
    root.userData.entityId = entity.id;
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
    root.position.copy(player.pos);
    root.rotation.y = player.facing;
    const scale = num(def.scale, 1);
    root.scale.set(scale, scale, scale);
    player.root = root;
    content.add(root);
    loadModelInto(root, def.modelAssetId, worldData);
  }

  function selectEntity(entityId) {
    selectedEntityId = entityId;
    if (!transformControls) return;
    const object = entityRoots.get(entityId);
    if (object) transformControls.attach(object); else transformControls.detach();
    requestRender();
  }

  function pickEntity(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const candidates = [];
    for (const root of entityRoots.values()) candidates.push.apply(candidates, root.children);
    const hits = raycaster.intersectObjects(candidates, true);
    if (!hits.length) return null;
    let object = hits[0].object;
    while (object && !object.userData.entityId) object = object.parent;
    return object?.userData.entityId || null;
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
    const forward = new THREE.Vector3(camTarget.x - camera.position.x, 0, camTarget.z - camera.position.z);
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
    if (isActionPressed("move_forward")) { move.add(basis.forward); usingKeys = true; }
    if (isActionPressed("move_back")) { move.sub(basis.forward); usingKeys = true; }
    if (isActionPressed("move_left")) { move.sub(basis.right); usingKeys = true; }
    if (isActionPressed("move_right")) { move.add(basis.right); usingKeys = true; }
    if (isActionPressed("rotate_cam_left")) camYaw -= camRotateSpeed * delta;
    if (isActionPressed("rotate_cam_right")) camYaw += camRotateSpeed * delta;

    let speed = player.speed * (isActionPressed("sprint") ? player.sprint : 1);

    if (!usingKeys && clickTarget) {
      const toTarget = new THREE.Vector3(clickTarget.x - player.pos.x, 0, clickTarget.z - player.pos.z);
      const dist = toTarget.length();
      if (dist < 0.05) { clickTarget = null; } else { move.copy(toTarget).normalize(); }
    }

    if (move.lengthSq() > 0.0001) {
      move.normalize();
      const next = new THREE.Vector3(player.pos.x + move.x * speed * delta, player.pos.y, player.pos.z + move.z * speed * delta);
      resolveCollision(next);
      player.pos.copy(next);
      const desiredFacing = Math.atan2(move.x, move.z);
      player.facing = stepAngle(player.facing, desiredFacing, player.turnSpeed * DEG_TO_RAD * delta);
    }

    player.root.position.copy(player.pos);
    player.root.rotation.y = player.facing;

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
    if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
    windowResizeHandler = null;
    if (orbitControls) orbitControls.removeEventListener("change", requestRender);
    if (transformControls) {
      if (transformDraggingHandler) transformControls.removeEventListener("dragging-changed", transformDraggingHandler);
      transformControls.removeEventListener("objectChange", requestRender);
      if (transformMouseUpHandler) transformControls.removeEventListener("mouseUp", transformMouseUpHandler);
    }
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

  function setGizmoMode(modeName) {
    if (transformControls && ["translate", "rotate", "scale"].includes(modeName)) {
      transformControls.setMode(modeName);
      requestRender();
    }
  }

  function focusSelected() {
    if (!orbitControls) return;
    const object = selectedEntityId ? entityRoots.get(selectedEntityId) : null;
    if (object) {
      orbitControls.target.copy(object.position);
      orbitControls.update();
      requestRender();
    }
  }

  function deselect() {
    if (transformControls) transformControls.detach();
    selectedEntityId = null;
    requestRender();
  }

  return {
    setWorld: setWorld,
    render: requestRender,
    destroy: destroy,
    dispose: destroy,
    screenToGround: screenToGround,
    selectEntity: selectEntity,
    captureViewState: captureViewState,
    restoreViewState: restoreViewState,
    configureCallbacks: configureCallbacks,
    setGizmoMode: setGizmoMode,
    focusSelected: focusSelected,
    deselect: deselect,
    getLoadErrors: function () { return loadErrors.slice(); }
  };
}
