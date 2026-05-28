import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { FBXLoader } from '../vendor/three/FBXLoader.js';

const stage = document.getElementById('dragon-cinematic-stage');
const MODEL_SOURCES = [
  {
    url: 'assets/models/the_elder_scrolls_blades_ancient_dragon.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 2.75
  },
  {
    url: 'assets/models/tes-blades-ancient-dragon.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 2.75
  },
  {
    url: 'assets/models/tes-blades-ancient-dragon/source/model.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 2.75
  },
  {
    url: 'assets/models/tes-blades-ancient-dragon/source/Dragon_Ancient_Skeleton/Dragon_Ancient_Skeleton.fbx',
    label: 'TES Blades Ancient Dragon FBX',
    type: 'fbx',
    profile: 'ancient',
    rotationY: 0
  },
  { url: 'assets/models/alduin/source/Ps%20Alduin%20Dragon.glb', label: 'Alduin Sketchfab GLB', type: 'gltf', profile: 'alduin' },
  { url: 'assets/models/tes-blades-ancient-dragon/scene.gltf', label: 'TES Blades Ancient Dragon glTF' },
  { url: 'assets/models/tes-blades-shulkunaak.glb', label: 'TES Blades Shulkunaak GLB' },
  { url: 'assets/models/tes-blades-shulkunaak/scene.gltf', label: 'TES Blades Shulkunaak glTF' },
  { url: 'assets/models/skyrim-dragon.glb', label: 'Skyrim Dragon GLB' },
  { url: 'assets/models/skyrim-dragon/scene.gltf', label: 'Skyrim Dragon glTF' },
  { url: 'assets/models/alduin.glb', label: 'Alduin GLB' },
  { url: 'assets/models/alduin/scene.gltf', label: 'Alduin glTF' },
  { url: 'assets/models/dragon.glb', label: 'Dragon GLB' },
  { url: 'assets/models/dragon/scene.gltf', label: 'Dragon glTF' }
];

const DERIVED_FLIGHT_CLIP = 'Dragon_Ancient_Breath_FlightLoop';
const INTRO_MIN_MS = 4200;
const canAnimate = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const pointer = new THREE.Vector2(0, 0);
const target = new THREE.Vector3(1.15, 0.58, -0.35);
const position = new THREE.Vector3(-1.15, 0.52, -0.25);
const lastPosition = new THREE.Vector3().copy(position);
const forwardAxis = new THREE.Vector3(1, 0, 0);
const mouthLocal = new THREE.Vector3(1.82, 0.05, 0);
const fireForwardLocal = new THREE.Vector3(1, 0, 0);
const tmpForward = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();

let initialized = false;
let enabled = false;
let running = false;
let frameId = 0;
let renderer = null;
let scene = null;
let camera = null;
let clock = null;
let dragonGroup = null;
let modelSocket = null;
let mixer = null;
let idleAction = null;
let breathAction = null;
let activeAction = null;
let breathReturnTimer = 0;
let clipActions = new Map();
let clipNames = [];
let fireLight = null;
let dragonGlow = null;
let ashPoints = null;
let ashSeeds = [];
let fireGroup = null;
let flameTexture = null;
let smokeTexture = null;
let fireParticles = [];
let fallbackParts = {};
let targetTimer = 4.2;
let fireCooldown = 5.5;
let fireTime = 0;
let loadingStartedAt = 0;
let loadingIntroTimer = 0;

function setEnabled(next) {
  enabled = Boolean(next && stage && canAnimate);
  if (!stage) return;

  stage.classList.toggle('is-enabled', enabled);
  if (!enabled) {
    stop();
    stage.classList.remove('is-breathing');
    stage.classList.remove('is-loading');
    document.body.classList.remove('dragon-cinematic-loading');
    return;
  }

  init();
  start();
}

function init() {
  if (initialized || !stage) return;
  initialized = true;

  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x110b08, 0.062);

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  camera.position.set(0, 1.2, 7.2);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xd6c69c, 0x110706, 1.45));

  const moon = new THREE.DirectionalLight(0xffe2a6, 1.9);
  moon.position.set(-5.5, 6, 5.5);
  scene.add(moon);

  const rim = new THREE.DirectionalLight(0x7fb3ff, 0.75);
  rim.position.set(5, 3.5, -4);
  scene.add(rim);

  fireLight = new THREE.PointLight(0xff6f1d, 0, 8, 2);
  scene.add(fireLight);

  dragonGroup = new THREE.Group();
  modelSocket = new THREE.Group();
  dragonGroup.add(modelSocket);
  dragonGlow = new THREE.PointLight(0xffcf8a, 1.35, 5.6, 2);
  dragonGlow.position.set(0.45, 0.42, 1.15);
  dragonGroup.add(dragonGlow);
  dragonGroup.position.copy(position);
  scene.add(dragonGroup);

  createBackdropParticles();
  createFireSystem();
  beginLoadingIntro();
  void loadDragonModel();
  onResize();

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('cw-puzzle-generated', onPuzzleGenerated);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function createBackdropParticles() {
  const count = 180;
  const positions = new Float32Array(count * 3);
  ashSeeds = [];

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    positions[p] = THREE.MathUtils.randFloatSpread(12);
    positions[p + 1] = THREE.MathUtils.randFloat(-2.2, 4.2);
    positions[p + 2] = THREE.MathUtils.randFloat(-3.5, 2.4);
    ashSeeds.push({
      speed: THREE.MathUtils.randFloat(0.06, 0.22),
      sway: THREE.MathUtils.randFloat(0.16, 0.62),
      phase: Math.random() * Math.PI * 2
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xf4d7a1,
    size: 0.022,
    transparent: true,
    opacity: 0.48,
    depthWrite: false
  });

  ashPoints = new THREE.Points(geometry, material);
  scene.add(ashPoints);
}

function createFireSystem() {
  flameTexture = createFlameTexture();
  smokeTexture = createSmokeTexture();
  fireGroup = new THREE.Group();
  fireParticles = [];

  for (let i = 0; i < 72; i++) {
    fireParticles.push(createFireSprite('flame'));
  }
  for (let i = 0; i < 28; i++) {
    fireParticles.push(createFireSprite('smoke'));
  }

  scene.add(fireGroup);
}

function createFireSprite(kind) {
  const isSmoke = kind === 'smoke';
  const material = new THREE.SpriteMaterial({
    map: isSmoke ? smokeTexture : flameTexture,
    color: isSmoke ? 0x5a4a3d : 0xffb13b,
    transparent: true,
    opacity: 0,
    blending: isSmoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    rotation: Math.random() * Math.PI * 2
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  fireGroup.add(sprite);

  return {
    kind,
    sprite,
    active: false,
    age: 0,
    life: 0,
    size: 1,
    spin: THREE.MathUtils.randFloat(-2.2, 2.2),
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3()
  };
}

function createFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(56, 56, 3, 64, 64, 58);
  glow.addColorStop(0, 'rgba(255,238,170,0.82)');
  glow.addColorStop(0.18, 'rgba(255,188,58,0.82)');
  glow.addColorStop(0.44, 'rgba(255,95,18,0.58)');
  glow.addColorStop(0.72, 'rgba(142,24,10,0.18)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);

  const core = ctx.createLinearGradient(42, 20, 78, 110);
  core.addColorStop(0, 'rgba(255,236,150,0.72)');
  core.addColorStop(0.42, 'rgba(255,158,34,0.62)');
  core.addColorStop(1, 'rgba(255,72,14,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.moveTo(58, 12);
  ctx.bezierCurveTo(91, 38, 89, 78, 62, 118);
  ctx.bezierCurveTo(33, 82, 30, 42, 58, 12);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const smoke = ctx.createRadialGradient(48, 48, 4, 48, 48, 46);
  smoke.addColorStop(0, 'rgba(120,104,88,0.38)');
  smoke.addColorStop(0.46, 'rgba(74,62,52,0.22)');
  smoke.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = smoke;
  ctx.fillRect(0, 0, 96, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFallbackDragon() {
  const dark = new THREE.MeshStandardMaterial({
    color: 0x241814,
    roughness: 0.88,
    metalness: 0.05
  });
  const membrane = new THREE.MeshStandardMaterial({
    color: 0x2b1710,
    side: THREE.DoubleSide,
    roughness: 0.92,
    transparent: true,
    opacity: 0.84
  });
  const bone = new THREE.MeshStandardMaterial({
    color: 0x8d6b43,
    roughness: 0.8,
    metalness: 0.08
  });

  modelSocket.clear();
  fallbackParts = {};

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), dark);
  body.scale.set(1.15, 0.34, 0.42);
  modelSocket.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.74, 12), dark);
  neck.rotation.z = -Math.PI / 2;
  neck.position.set(0.84, 0.06, 0);
  modelSocket.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 12), dark);
  head.scale.set(1.02, 0.56, 0.62);
  head.position.set(1.32, 0.12, 0);
  modelSocket.add(head);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.72, 12), dark);
  snout.rotation.z = -Math.PI / 2;
  snout.position.set(1.82, 0.09, 0);
  modelSocket.add(snout);

  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 10), bone);
  jaw.rotation.z = -Math.PI / 2;
  jaw.rotation.x = 0.16;
  jaw.position.set(1.74, -0.07, 0);
  modelSocket.add(jaw);

  addHorn(1.17, 0.48, 0.18, 0.42, bone);
  addHorn(1.17, 0.48, -0.18, 0.42, bone);
  addHorn(1.48, 0.35, 0.13, 0.28, bone);
  addHorn(1.48, 0.35, -0.13, 0.28, bone);

  fallbackParts.leftWing = createWing(1, membrane);
  fallbackParts.rightWing = createWing(-1, membrane);
  modelSocket.add(fallbackParts.leftWing, fallbackParts.rightWing);

  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8), dark);
    const k = i / 7;
    seg.scale.set(1 - k * 0.55, 0.68 - k * 0.32, 0.72 - k * 0.34);
    seg.position.set(-0.95 - i * 0.3, -0.04 - Math.sin(k * Math.PI) * 0.12, Math.sin(i * 0.8) * 0.1);
    modelSocket.add(seg);
  }

  for (let side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.72, 8), dark);
    leg.position.set(0.22, -0.42, side * 0.22);
    leg.rotation.z = 0.36;
    leg.rotation.x = side * 0.08;
    modelSocket.add(leg);
  }

  modelSocket.scale.setScalar(1.1);
  stage.classList.add('is-fallback');
}

function addHorn(x, y, z, height, material) {
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, height, 8), material);
  horn.rotation.z = -0.48;
  horn.position.set(x, y, z);
  modelSocket.add(horn);
}

function createWing(side, material) {
  const geometry = new THREE.BufferGeometry();
  const shoulderZ = side * 0.32;
  const tipZ = side * 1.92;
  const lowerZ = side * 1.34;
  const vertices = new Float32Array([
    -0.1, 0.15, shoulderZ,
    -0.86, 1.0, tipZ,
    -0.46, -0.5, lowerZ,
    -0.1, 0.15, shoulderZ,
    -0.46, -0.5, lowerZ,
    0.42, -0.18, side * 0.78
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();

  const wing = new THREE.Mesh(geometry, material);
  wing.name = side > 0 ? 'fallback-left-wing' : 'fallback-right-wing';
  wing.position.set(-0.2, 0.08, 0);
  return wing;
}

async function loadDragonModel() {
  for (const source of MODEL_SOURCES) {
    if (!await modelUrlExists(source.url)) continue;
    try {
      const asset = source.type === 'fbx'
        ? await fbxLoader.loadAsync(source.url)
        : await gltfLoader.loadAsync(source.url);
      installModel(asset, source);
      finishLoadingIntro();
      return;
    } catch (error) {
      console.warn('[dragon-cinematic] Model failed:', source.url, error);
    }
  }

  createFallbackDragon();
  failLoadingIntro();
}

async function modelUrlExists(url) {
  if (window.location.protocol === 'file:') return true;

  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch (error) {
    return true;
  }
}

function installModel(asset, source) {
  modelSocket.clear();
  modelSocket.position.set(0, 0, 0);
  modelSocket.rotation.set(0, 0, 0);
  modelSocket.scale.setScalar(1);
  fallbackParts = {};
  mixer = null;
  idleAction = null;
  breathAction = null;
  activeAction = null;
  breathReturnTimer = 0;
  clipActions = new Map();
  clipNames = [];
  applyModelProfile(source.profile || 'default');

  const model = asset.scene || asset;
  model.traverse(obj => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = false;
    obj.receiveShadow = false;
    if (obj.material) {
      const wasArray = Array.isArray(obj.material);
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const clones = materials.map(material => {
        const clone = material.clone();
        if (clone.color) clone.color.multiplyScalar(1.22);
        if (clone.emissive) {
          clone.emissive.setHex(0x160b04);
          clone.emissiveIntensity = 0.28;
        }
        if (typeof clone.roughness === 'number') clone.roughness = Math.min(clone.roughness, 0.72);
        clone.side = THREE.DoubleSide;
        clone.needsUpdate = true;
        return clone;
      });
      obj.material = wasArray ? clones : clones[0];
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fitSize = source.fitSize || (source.type === 'fbx' ? 3.2 : 3.45);
  const scale = fitSize / Math.max(size.x, size.y, size.z, 1);

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.rotation.y = typeof source.rotationY === 'number' ? source.rotationY : Math.PI / 2;
  modelSocket.add(model);

  const clips = buildPlayableClips(asset.animations || model.animations || []);
  if (clips.length) {
    mixer = new THREE.AnimationMixer(model);
    clipNames = clips.map(clip => clip.name);
    const requestedClip = getRequestedClip(clips);
    const idleClip = requestedClip || pickClip(clips, [
      new RegExp(`^${DERIVED_FLIGHT_CLIP}$`, 'i'),
      /^Dragon_Ancient_Idle_FlyTransition$/i,
      /^Dragon_Ancient_Patrol_Idle$/i,
      /^Dragon_Ancient_Idle$/i,
      /^Dragon_Ancient_Dialogue_Relaxed_Idle$/i,
      /patrol_idle/i,
      /(^|_)idle$/i
    ]) ||
      clips[0];
    const breathClip = pickClip(clips, [
      /attack_breath/i,
      /breath/i,
      /casting_loop/i,
      /attack_power/i
    ]);

    clips.forEach(clip => {
      clipActions.set(clip.name, mixer.clipAction(clip));
    });

    idleAction = clipActions.get(idleClip.name);
    idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.25).play();
    activeAction = idleAction;

    if (breathClip) {
      breathAction = clipActions.get(breathClip.name);
      breathAction.setLoop(THREE.LoopOnce, 1);
      breathAction.clampWhenFinished = true;
    }
  }

  stage.classList.remove('is-fallback');
  stage.classList.add('has-model');
  stage.dataset.model = source.label;
  stage.dataset.animations = String(clips.length);
  stage.dataset.idleClip = idleAction ? idleAction.getClip().name : '';
  stage.dataset.breathClip = breathAction ? breathAction.getClip().name : '';
}

function buildPlayableClips(clips) {
  const result = clips.slice();
  const breath = pickClip(clips, [
    /^Dragon_Ancient_Attack_Breath$/i,
    /attack_breath/i
  ]);

  if (breath && THREE.AnimationUtils && typeof THREE.AnimationUtils.subclip === 'function') {
    const flightLoop = THREE.AnimationUtils.subclip(breath, DERIVED_FLIGHT_CLIP, 44, 150, 30);
    if (flightLoop && flightLoop.tracks && flightLoop.tracks.length) {
      result.unshift(flightLoop);
    }
  }

  return result;
}

function pickClip(clips, patterns) {
  for (const pattern of patterns) {
    const clip = clips.find(candidate => pattern.test(candidate.name));
    if (clip) return clip;
  }
  return null;
}

function getRequestedClip(clips) {
  let requested = null;
  try {
    const params = new URLSearchParams(window.location.search);
    requested = params.get('dragonClip') || params.get('dragonAnim');
  } catch (e) { /* ignore */ }

  if (!requested) return null;
  return clips.find(clip => clip.name === requested) ||
    clips.find(clip => clip.name.toLowerCase() === requested.toLowerCase()) ||
    null;
}

function applyModelProfile(profile) {
  if (profile === 'alduin') {
    mouthLocal.set(-1.72, -0.03, 0.04);
    fireForwardLocal.set(-1, -0.04, 0).normalize();
    return;
  }

  if (profile === 'ancient') {
    mouthLocal.set(1.55, 0.12, 0);
    fireForwardLocal.set(1, -0.03, 0).normalize();
    return;
  }

  mouthLocal.set(1.82, 0.05, 0);
  fireForwardLocal.set(1, 0, 0);
}

function playAction(action, fade = 0.2) {
  if (!action || activeAction === action) return;

  action.reset().enabled = true;
  action.fadeIn(fade).play();
  if (activeAction) activeAction.crossFadeTo(action, fade, false);
  activeAction = action;
}

function setAnimation(name, loop = true) {
  const action = clipActions.get(name);
  if (!action) return false;

  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
  playAction(action, 0.2);
  if (loop) {
    idleAction = action;
    breathReturnTimer = 0;
    stage.dataset.idleClip = name;
  }
  return true;
}

function getDebugInfo() {
  return {
    model: stage && stage.dataset.model || null,
    animations: clipNames.length,
    idleClip: stage && stage.dataset.idleClip || null,
    breathClip: stage && stage.dataset.breathClip || null,
    clips: clipNames.slice()
  };
}

function playBreathAnimation() {
  if (!breathAction) return;

  breathAction.reset();
  breathAction.enabled = true;
  breathAction.setLoop(THREE.LoopOnce, 1);
  breathAction.clampWhenFinished = true;
  playAction(breathAction, 0.14);
  breathReturnTimer = Math.min(Math.max(breathAction.getClip().duration * 0.72, 0.9), 1.8);
}

function start() {
  if (running || !renderer || document.hidden) return;
  running = true;
  clock.getDelta();
  frameId = window.requestAnimationFrame(tick);
}

function stop() {
  if (!running) return;
  running = false;
  window.cancelAnimationFrame(frameId);
}

function tick() {
  if (!enabled || !renderer) {
    running = false;
    return;
  }

  frameId = window.requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  updateCamera(dt);
  updateFlight(dt, elapsed);
  updateAsh(dt, elapsed);
  updateFire(dt);

  if (mixer) {
    mixer.update(dt);
    if (breathReturnTimer > 0) {
      breathReturnTimer -= dt;
      if (breathReturnTimer <= 0 && idleAction && activeAction !== idleAction) {
        playAction(idleAction, 0.28);
      }
    }
  }
  renderer.render(scene, camera);
}

function updateCamera() {
  camera.position.x += (pointer.x * 0.42 - camera.position.x) * 0.035;
  camera.position.y += (1.22 - pointer.y * 0.28 - camera.position.y) * 0.035;
  camera.lookAt(0, 0.55, 0);
}

function updateFlight(dt, elapsed) {
  targetTimer -= dt;
  if (targetTimer <= 0 || position.distanceTo(target) < 0.4) {
    chooseTarget();
  }

  lastPosition.copy(position);
  position.lerp(target, 1 - Math.pow(0.985, dt * 60));

  const bob = Math.sin(elapsed * 2.4) * 0.11 + Math.sin(elapsed * 0.8) * 0.05;
  dragonGroup.position.copy(position);
  dragonGroup.position.y += bob;

  tmpForward.copy(position).sub(lastPosition);
  if (tmpForward.lengthSq() > 0.00002) {
    tmpForward.normalize();
    tmpQuat.setFromUnitVectors(forwardAxis, tmpForward);
    dragonGroup.quaternion.slerp(tmpQuat, 0.055);
  }

  dragonGroup.scale.setScalar(1 + Math.sin(elapsed * 1.15) * 0.018);

  if (fallbackParts.leftWing && fallbackParts.rightWing) {
    const flap = Math.sin(elapsed * 8.2) * 0.52;
    fallbackParts.leftWing.rotation.x = -0.16 + flap;
    fallbackParts.rightWing.rotation.x = 0.16 - flap;
    modelSocket.rotation.z = Math.sin(elapsed * 2.1) * 0.035;
  }

  fireCooldown -= dt;
  if (fireCooldown <= 0) {
    triggerFire();
    fireCooldown = THREE.MathUtils.randFloat(14, 28);
  }
}

function chooseTarget() {
  const anchors = collectAnchors();
  const pick = anchors[Math.floor(Math.random() * anchors.length)] || new THREE.Vector3(0, 1, 0);
  target.copy(pick);
  target.x += THREE.MathUtils.randFloatSpread(0.9);
  target.y += THREE.MathUtils.randFloatSpread(0.5);
  target.z += THREE.MathUtils.randFloat(-0.7, 0.55);
  targetTimer = THREE.MathUtils.randFloat(3.2, 6.4);
}

function collectAnchors() {
  const anchors = [
    screenToWorld(window.innerWidth * 0.18, window.innerHeight * 0.52, -0.4),
    screenToWorld(window.innerWidth * 0.82, window.innerHeight * 0.48, -0.8),
    screenToWorld(window.innerWidth * 0.78, window.innerHeight * 0.78, -0.2),
    screenToWorld(window.innerWidth * 0.22, window.innerHeight * 0.72, 0.2)
  ];

  ['#grid-container', '#clues-container'].forEach((selector, index) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    const x = rect.left + rect.width * (index % 2 ? 0.18 : 0.86);
    const y = rect.top + rect.height * (index < 2 ? 0.38 : 0.55);
    anchors.push(screenToWorld(x, y, index % 2 ? -0.15 : -0.65));
  });

  return anchors;
}

function screenToWorld(px, py, zPlane) {
  const ndc = new THREE.Vector3(
    (px / Math.max(window.innerWidth, 1)) * 2 - 1,
    -(py / Math.max(window.innerHeight, 1)) * 2 + 1,
    0.5
  );
  ndc.unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  const distance = Math.abs(dir.z) < 0.0001 ? 6 : (zPlane - camera.position.z) / dir.z;
  return camera.position.clone().addScaledVector(dir, distance);
}

function updateAsh(dt, elapsed) {
  if (!ashPoints) return;
  const attr = ashPoints.geometry.attributes.position;
  const data = attr.array;

  for (let i = 0; i < ashSeeds.length; i++) {
    const p = i * 3;
    const seed = ashSeeds[i];
    data[p] += Math.sin(elapsed * seed.sway + seed.phase) * dt * 0.08;
    data[p + 1] -= seed.speed * dt;
    if (data[p + 1] < -2.5) {
      data[p] = THREE.MathUtils.randFloatSpread(12);
      data[p + 1] = THREE.MathUtils.randFloat(3.4, 4.6);
      data[p + 2] = THREE.MathUtils.randFloat(-3.5, 2.4);
    }
  }

  attr.needsUpdate = true;
}

function triggerFire() {
  if (!initialized || !dragonGroup || !fireGroup) return;

  fireTime = 1.15;
  playBreathAnimation();
  spawnFire();
  stage.classList.remove('is-breathing');
  void stage.offsetWidth;
  stage.classList.add('is-breathing');
  window.setTimeout(() => stage.classList.remove('is-breathing'), 1350);
}

function spawnFire() {
  const mouth = getMouthWorldPosition();
  const dir = getFireDirection(mouth);
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(dragonGroup.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  fireParticles.forEach((particle, i) => {
    const isSmoke = particle.kind === 'smoke';
    const distance = isSmoke ? THREE.MathUtils.randFloat(0.45, 1.85) : THREE.MathUtils.randFloat(0.05, 1.25);
    const spread = (Math.random() - 0.5) * (isSmoke ? 0.72 : 0.38) * (0.45 + distance);
    const lift = (Math.random() - (isSmoke ? 0.06 : 0.32)) * (isSmoke ? 0.8 : 0.5);
    const push = isSmoke ? THREE.MathUtils.randFloat(1.25, 2.4) : THREE.MathUtils.randFloat(2.8, 5.2);

    particle.active = true;
    particle.age = Math.random() * -0.12;
    particle.life = isSmoke ? THREE.MathUtils.randFloat(0.95, 1.75) : THREE.MathUtils.randFloat(0.42, 0.95);
    particle.size = isSmoke ? THREE.MathUtils.randFloat(0.46, 0.96) : THREE.MathUtils.randFloat(0.18, 0.44);
    particle.pos.copy(mouth)
      .addScaledVector(dir, distance)
      .addScaledVector(side, spread * 0.22)
      .addScaledVector(up, lift * 0.18);
    particle.vel.copy(dir).multiplyScalar(push)
      .addScaledVector(side, spread)
      .addScaledVector(up, lift);
    particle.sprite.position.copy(particle.pos);
    particle.sprite.scale.setScalar(0.01);
    particle.sprite.material.opacity = 0;
    particle.sprite.visible = true;
  });
}

function updateFire(dt) {
  if (!fireGroup) return;

  fireTime = Math.max(0, fireTime - dt);
  let activeCount = 0;
  let flameCount = 0;

  fireParticles.forEach(particle => {
    if (!particle.active) {
      particle.sprite.visible = false;
      return;
    }

    particle.age += dt;
    if (particle.age < 0) return;
    if (particle.age >= particle.life) {
      particle.active = false;
      particle.sprite.visible = false;
      particle.sprite.material.opacity = 0;
      return;
    }

    activeCount++;
    if (particle.kind !== 'smoke') flameCount++;
    const k = particle.age / particle.life;
    const isSmoke = particle.kind === 'smoke';
    particle.vel.multiplyScalar(1 - dt * (isSmoke ? 0.34 : 0.18));
    particle.vel.y += dt * (isSmoke ? 0.74 : 0.16);
    particle.pos.addScaledVector(particle.vel, dt);

    const fadeIn = Math.min(1, k * 7);
    const fadeOut = Math.pow(1 - k, isSmoke ? 1.25 : 1.8);
    const opacity = fadeIn * fadeOut * (isSmoke ? 0.26 : 0.56);
    const scale = particle.size * (isSmoke ? (0.9 + k * 1.6) : (0.62 + k * 1.05));

    particle.sprite.position.copy(particle.pos);
    particle.sprite.scale.set(scale, scale * (isSmoke ? 0.82 : 1.35), scale);
    particle.sprite.material.opacity = opacity;
    particle.sprite.material.rotation += particle.spin * dt;
    if (!isSmoke && particle.sprite.material.color) {
      particle.sprite.material.color.setHSL(THREE.MathUtils.lerp(0.1, 0.025, k), 1, THREE.MathUtils.lerp(0.58, 0.34, k));
    }
  });

  const mouth = getMouthWorldPosition();
  fireLight.position.copy(mouth);
  fireLight.intensity = Math.min(8.2, flameCount * 0.13);

  if (!activeCount && fireTime <= 0) {
    stage.classList.remove('is-breathing');
  }
}

function getMouthWorldPosition() {
  tmpVec.copy(mouthLocal);
  return modelSocket ? modelSocket.localToWorld(tmpVec.clone()) : dragonGroup.localToWorld(tmpVec.clone());
}

function getDragonForward() {
  const mouth = getMouthWorldPosition();
  tmpVec.copy(mouthLocal).add(fireForwardLocal);
  const ahead = modelSocket ? modelSocket.localToWorld(tmpVec.clone()) : dragonGroup.localToWorld(tmpVec.clone());
  return ahead.sub(mouth).normalize();
}

function getFireDirection() {
  return getDragonForward();
}

function beginLoadingIntro() {
  loadingStartedAt = performance.now();
  window.clearTimeout(loadingIntroTimer);
  document.body.classList.remove('dragon-cinematic-ready', 'dragon-cinematic-failed');
  document.body.classList.add('dragon-cinematic-loading');
  stage.classList.add('is-loading');
  stage.dataset.loadState = 'loading';
}

function finishLoadingIntro() {
  const elapsed = performance.now() - loadingStartedAt;
  const delay = Math.max(0, INTRO_MIN_MS - elapsed);
  window.clearTimeout(loadingIntroTimer);
  loadingIntroTimer = window.setTimeout(() => {
    document.body.classList.remove('dragon-cinematic-loading');
    document.body.classList.add('dragon-cinematic-ready');
    stage.classList.remove('is-loading');
    stage.dataset.loadState = 'ready';
  }, delay);
}

function failLoadingIntro() {
  window.clearTimeout(loadingIntroTimer);
  document.body.classList.remove('dragon-cinematic-loading');
  document.body.classList.add('dragon-cinematic-failed');
  stage.classList.remove('is-loading');
  stage.dataset.loadState = 'fallback';
}

function onPointerMove(event) {
  pointer.x = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
  pointer.y = (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(stage.clientWidth || window.innerWidth || 1, 1);
  const height = Math.max(stage.clientHeight || window.innerHeight || 1, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function onPuzzleGenerated() {
  if (!enabled) return;
  window.setTimeout(triggerFire, 420);
}

function onVisibilityChange() {
  if (document.hidden) {
    stop();
  } else if (enabled) {
    start();
  }
}

if (stage) {
  window.CWDragonCinematic = { setEnabled, triggerFire, setAnimation, getDebugInfo };
  window.addEventListener('cw-dragon-mode-change', event => {
    setEnabled(event.detail && event.detail.mode === 'cinematic');
  });
  queueMicrotask(() => setEnabled(document.body.classList.contains('dragon-mode-cinematic')));
}
