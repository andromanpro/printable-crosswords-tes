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
    fitSize: 4.2
  },
  {
    url: 'assets/models/tes-blades-ancient-dragon.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
  },
  {
    url: 'assets/models/tes-blades-ancient-dragon/source/model.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
  },
  {
    url: 'assets/models/converted/dragon-ancient-merged-nla-prepost.glb',
    label: 'TES Blades Ancient Dragon animated GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
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
const BREATH_CLIP_NAME = 'Dragon_Ancient_Attack_Breath';
const BREATH_LOOP_SECONDS = 7.07;
const FIRE_WINDOW_START = 3;
const FIRE_WINDOW_END = 5;
const FIRE_BURST_INTERVAL = 0.18;
const FIRE_ORIGIN_BACKSET = 0.72;
const CINEMATIC_SETTINGS_KEY = 'cw_dragon_cinematic_settings_v7';
const DEFAULT_CINEMATIC_SETTINGS = {
  clip: BREATH_CLIP_NAME,
  anchorX: 0.28,
  anchorY: 0.22,
  anchorXWide: 0.26,
  anchorYWide: 0.2,
  scrollAnchorX: 0.18,
  scrollAnchorY: -0.42,
  zPlane: -0.42,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  scale: 0.54,
  pitch: 0,
  yaw: 0,
  roll: 0
};
const INTRO_MIN_MS = 4200;
const canAnimate = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const pointer = new THREE.Vector2(0, 0);
const sceneSettings = readCinematicSettings();
const target = new THREE.Vector3(0, 0, 0);
const position = new THREE.Vector3(0, 0, 0);
const mouthLocal = new THREE.Vector3(1.82, 0.05, 0);
const fireForwardLocal = new THREE.Vector3(1, 0, 0);
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

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
let fireBurstTimer = 0;
let fireTime = 0;
let lastAnchorScreenX = DEFAULT_CINEMATIC_SETTINGS.anchorX;
let loadingStartedAt = 0;
let loadingIntroTimer = 0;

function readCinematicSettings() {
  const settings = { ...DEFAULT_CINEMATIC_SETTINGS };

  try {
    const saved = JSON.parse(localStorage.getItem(CINEMATIC_SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(settings, saved);
  } catch (e) { /* ignore */ }

  let params = null;
  try { params = new URLSearchParams(window.location.search); } catch (e) {}
  if (params) {
    assignNumber(settings, 'anchorX', params.get('dragonX') || params.get('dragonAnchorX'));
    assignNumber(settings, 'anchorY', params.get('dragonY') || params.get('dragonAnchorY'));
    assignNumber(settings, 'zPlane', params.get('dragonZ') || params.get('dragonDepth'));
    assignNumber(settings, 'scale', params.get('dragonScale'));
    assignNumber(settings, 'pitch', params.get('dragonPitch'));
    assignNumber(settings, 'yaw', params.get('dragonYaw'));
    assignNumber(settings, 'roll', params.get('dragonRoll'));
  }

  settings.anchorX = clampNumber(settings.anchorX, 0.08, 0.92, DEFAULT_CINEMATIC_SETTINGS.anchorX);
  settings.anchorY = clampNumber(settings.anchorY, 0.12, 0.92, DEFAULT_CINEMATIC_SETTINGS.anchorY);
  settings.anchorXWide = clampNumber(settings.anchorXWide, 0.08, 0.92, DEFAULT_CINEMATIC_SETTINGS.anchorXWide);
  settings.anchorYWide = clampNumber(settings.anchorYWide, 0.12, 0.92, DEFAULT_CINEMATIC_SETTINGS.anchorYWide);
  settings.scrollAnchorX = clampNumber(settings.scrollAnchorX, 0.02, 0.98, DEFAULT_CINEMATIC_SETTINGS.scrollAnchorX);
  settings.scrollAnchorY = clampNumber(settings.scrollAnchorY, -0.58, 0.45, DEFAULT_CINEMATIC_SETTINGS.scrollAnchorY);
  settings.zPlane = clampNumber(settings.zPlane, -3, 2, DEFAULT_CINEMATIC_SETTINGS.zPlane);
  settings.offsetX = clampNumber(settings.offsetX, -4, 4, DEFAULT_CINEMATIC_SETTINGS.offsetX);
  settings.offsetY = clampNumber(settings.offsetY, -3, 3, DEFAULT_CINEMATIC_SETTINGS.offsetY);
  settings.offsetZ = clampNumber(settings.offsetZ, -3, 3, DEFAULT_CINEMATIC_SETTINGS.offsetZ);
  settings.scale = clampNumber(settings.scale, 0.18, 1.4, DEFAULT_CINEMATIC_SETTINGS.scale);
  settings.pitch = clampNumber(settings.pitch, -50, 50, DEFAULT_CINEMATIC_SETTINGS.pitch);
  settings.yaw = clampNumber(settings.yaw, -180, 180, DEFAULT_CINEMATIC_SETTINGS.yaw);
  settings.roll = clampNumber(settings.roll, -45, 45, DEFAULT_CINEMATIC_SETTINGS.roll);
  return settings;
}

function assignNumber(targetObject, key, value) {
  if (value === null || value === '') return;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) targetObject[key] = parsed;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return THREE.MathUtils.clamp(parsed, min, max);
}

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
  attachStageToScroll();    // позиционировать stage над scroll-rod-top

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('resize', attachStageToScroll, { passive: true });
  window.addEventListener('scroll', attachStageToScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('cw-puzzle-generated', onPuzzleGenerated);
  document.addEventListener('visibilitychange', onVisibilityChange);
  // Периодический re-attach — на случай если grid-container изменил размер
  // после генерации кроссворда / wrapper'а / темы. Дешёво: getBoundingClientRect + setStyle.
  setInterval(attachStageToScroll, 600);

  // Manual orbit controls — drag для вращения камеры вокруг дракона
  initOrbitControls();
  restoreCameraFromStorage();

  // Если режим cinematic убран — stop loop, останавливаем render для CPU
  const modeObserver = new MutationObserver(() => {
    const enabled = document.body.classList.contains('dragon-mode-cinematic');
    if (enabled) { start(); }
    else { stop(); }
  });
  modeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

/* Позиционирование stage над верхним валиком свитка (привязка к grid-container). */
function attachStageToScroll() {
  if (!stage) return;
  const gc = document.getElementById('grid-container');
  if (!gc) return;
  const rect = gc.getBoundingClientRect();
  // Пока grid-container ещё узкий (до первой генерации) — не реагируем
  if (rect.width < 300) return;
  const stageW = stage.offsetWidth || 380;
  const stageH = stage.offsetHeight || 280;
  // Дракон сидит на верхнем валике — низ stage примерно совпадает с верхом свитка
  stage.style.top = Math.max(8, rect.top - stageH + 70) + 'px';
  stage.style.left = (rect.left + rect.width / 2 - stageW / 2) + 'px';
}

/* Orbit controls — manual mouse drag, сохраняет ориентацию */
let orbitAzimuth = 0, orbitElevation = 0, orbitRadius = 7.2;
let orbitDragging = false, orbitDragX = 0, orbitDragY = 0;

function initOrbitControls() {
  if (!stage) return;
  // Stage: pointer-events: none для прохода кликов сквозь дракона к UI.
  // Orbit-drag навешен на canvas (внутри stage) с pointer-events: auto только на canvas.
  const canvas = stage.querySelector('canvas');
  const dragTarget = canvas || stage;
  if (canvas) canvas.style.pointerEvents = 'auto';

  dragTarget.addEventListener('pointerdown', (e) => {
    orbitDragging = true;
    orbitDragX = e.clientX;
    orbitDragY = e.clientY;
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!orbitDragging) return;
    const dx = e.clientX - orbitDragX;
    const dy = e.clientY - orbitDragY;
    orbitDragX = e.clientX;
    orbitDragY = e.clientY;
    orbitAzimuth -= dx * 0.008;
    orbitElevation = Math.max(-0.6, Math.min(1.2, orbitElevation + dy * 0.006));
    applyOrbitCamera();
    saveCameraToStorage();
  });
  window.addEventListener('pointerup', () => { orbitDragging = false; });
  // Колесо мыши — zoom (только над canvas, не блокирует scroll вне дракона)
  dragTarget.addEventListener('wheel', (e) => {
    orbitRadius = Math.max(3.5, Math.min(14, orbitRadius + e.deltaY * 0.005));
    applyOrbitCamera();
    saveCameraToStorage();
    e.preventDefault();
  }, { passive: false });
}
function applyOrbitCamera() {
  const cosE = Math.cos(orbitElevation);
  camera.position.set(
    orbitRadius * Math.sin(orbitAzimuth) * cosE,
    1.2 + orbitRadius * Math.sin(orbitElevation),
    orbitRadius * Math.cos(orbitAzimuth) * cosE
  );
  camera.lookAt(0, 0.55, 0);
}
function saveCameraToStorage() {
  try {
    localStorage.setItem('cw_dragon_orbit_v1', JSON.stringify({
      a: orbitAzimuth, e: orbitElevation, r: orbitRadius
    }));
  } catch (_) {}
}
function restoreCameraFromStorage() {
  try {
    const raw = localStorage.getItem('cw_dragon_orbit_v1');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (typeof d.a === 'number') orbitAzimuth = d.a;
    if (typeof d.e === 'number') orbitElevation = d.e;
    if (typeof d.r === 'number') orbitRadius = d.r;
    applyOrbitCamera();
  } catch (_) {}
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
  modelSocket.rotation.set(
    source.socketRotationX || 0,
    source.socketRotationY || 0,
    source.socketRotationZ || 0
  );
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
  // Центрируем по X/Z, по Y поднимаем так чтобы лапы касались пола (y=0) пьедестала
  model.position.set(
    -center.x * scale,
    (size.y / 2 - center.y) * scale,
    -center.z * scale
  );
  model.rotation.y = typeof source.rotationY === 'number' ? source.rotationY : Math.PI / 2;
  modelSocket.add(model);

  const clips = buildPlayableClips(asset.animations || model.animations || []);
  if (clips.length) {
    mixer = new THREE.AnimationMixer(model);
    clipNames = clips.map(clip => clip.name);
    const requestedClip = getRequestedClip(clips);
    const breathClip = pickClip(clips, [
      new RegExp(`^${BREATH_CLIP_NAME}$`, 'i'),
      /attack_breath/i
    ]);
    const idleClip = requestedClip || breathClip || pickClip(clips, [
      /^Dragon_Ancient_Idle_FlyTransition$/i,
      /^Dragon_Ancient_Patrol_Idle$/i,
      new RegExp(`^${DERIVED_FLIGHT_CLIP}$`, 'i'),
      /^Dragon_Ancient_Idle$/i,
      /^Dragon_Ancient_Dialogue_Relaxed_Idle$/i,
      /patrol_idle/i,
      /(^|_)idle$/i
    ]) ||
      clips[0];

    clips.forEach(clip => {
      clipActions.set(clip.name, mixer.clipAction(clip));
    });

    idleAction = clipActions.get(idleClip.name);
    idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.25).play();
    activeAction = idleAction;

    if (breathClip) {
      breathAction = clipActions.get(breathClip.name);
      breathAction.setLoop(THREE.LoopRepeat, Infinity);
      breathAction.clampWhenFinished = false;
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
  requested = requested || sceneSettings.clip;

  if (!requested) return null;
  return clips.find(clip => clip.name === requested) ||
    clips.find(clip => clip.name.toLowerCase() === requested.toLowerCase()) ||
    clips.find(clip => clip.name.includes(`|${requested}|`)) ||
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
    settings: { ...sceneSettings },
    clips: clipNames.slice()
  };
}

function playBreathAnimation() {
  if (!breathAction) return;

  breathAction.reset();
  breathAction.enabled = true;
  breathAction.setLoop(THREE.LoopRepeat, Infinity);
  breathAction.clampWhenFinished = false;
  playAction(breathAction, 0.14);
  idleAction = breathAction;
  breathReturnTimer = 0;
  stage.dataset.idleClip = breathAction.getClip().name;
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

  if (mixer) {
    mixer.update(dt);
  }
  updateBreathFire(dt);
  updateFire(dt);
  renderer.render(scene, camera);
}

function updateCamera() {
  camera.position.x += (pointer.x * 0.16 - camera.position.x) * 0.025;
  camera.position.y += (1.22 - pointer.y * 0.08 - camera.position.y) * 0.025;
  camera.lookAt(0, 0.55, 0);
}

function updateFlight(dt, elapsed) {
  target.copy(getBottomAnchor(elapsed));
  position.lerp(target, 1 - Math.pow(0.96, dt * 60));

  const bob = Math.sin(elapsed * 1.2) * 0.025;
  dragonGroup.position.copy(position);
  dragonGroup.position.y += bob;

  const cursorX = (pointer.x + 1) / 2;
  const cursorYaw = THREE.MathUtils.clamp((cursorX - lastAnchorScreenX) * 86, -38, 38);
  tmpEuler.set(
    THREE.MathUtils.degToRad(sceneSettings.pitch),
    THREE.MathUtils.degToRad(sceneSettings.yaw + cursorYaw),
    THREE.MathUtils.degToRad(sceneSettings.roll),
    'YXZ'
  );
  tmpQuat.setFromEuler(tmpEuler);
  dragonGroup.quaternion.slerp(tmpQuat, 0.14);

  dragonGroup.scale.setScalar(sceneSettings.scale + Math.sin(elapsed * 1.15) * 0.008);

  if (fallbackParts.leftWing && fallbackParts.rightWing) {
    const flap = Math.sin(elapsed * 8.2) * 0.52;
    fallbackParts.leftWing.rotation.x = -0.16 + flap;
    fallbackParts.rightWing.rotation.x = 0.16 - flap;
    modelSocket.rotation.z = Math.sin(elapsed * 2.1) * 0.035;
  }
}

function getBottomAnchor(elapsed) {
  const scrollRect = getScrollRect();
  let px;
  let py;

  if (scrollRect) {
    px = scrollRect.left + scrollRect.width * sceneSettings.scrollAnchorX;
    py = scrollRect.top + scrollRect.height * sceneSettings.scrollAnchorY;
  } else {
    const anchorX = window.innerWidth > 1500 ? sceneSettings.anchorXWide : sceneSettings.anchorX;
    const anchorY = window.innerWidth > 1500 ? sceneSettings.anchorYWide : sceneSettings.anchorY;
    px = window.innerWidth * anchorX;
    py = window.innerHeight * anchorY;
  }

  lastAnchorScreenX = px / Math.max(window.innerWidth, 1);
  const base = screenToWorld(px, py, sceneSettings.zPlane);
  base.x += sceneSettings.offsetX;
  base.y += sceneSettings.offsetY;
  base.z += sceneSettings.offsetZ;
  return base;
}

function getScrollRect() {
  const paper = document.querySelector('#grid-container .scroll-paper');
  const grid = document.getElementById('grid-container');
  const el = paper || grid;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return rect;
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

  fireTime = Math.max(fireTime, 0.45);
  spawnFire();
  stage.classList.remove('is-breathing');
  void stage.offsetWidth;
  stage.classList.add('is-breathing');
}

function updateBreathFire(dt) {
  if (!breathAction || activeAction !== breathAction) return;

  const duration = breathAction.getClip().duration || BREATH_LOOP_SECONDS;
  const loopTime = ((breathAction.time % duration) + duration) % duration;
  const inFireWindow = loopTime >= FIRE_WINDOW_START && loopTime <= Math.min(FIRE_WINDOW_END, duration);
  stage.dataset.breathTime = loopTime.toFixed(2);
  stage.dataset.fireWindow = `${FIRE_WINDOW_START}-${FIRE_WINDOW_END}`;

  if (!inFireWindow) {
    fireBurstTimer = 0;
    return;
  }

  fireTime = Math.max(fireTime, 0.28);
  fireBurstTimer -= dt;
  if (fireBurstTimer <= 0) {
    spawnFire();
    fireBurstTimer = FIRE_BURST_INTERVAL;
  }
  stage.classList.add('is-breathing');
}

function spawnFire() {
  const mouth = getMouthWorldPosition();
  const dir = getFireDirection(mouth);
  const origin = mouth.clone().addScaledVector(dir, -FIRE_ORIGIN_BACKSET);
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(dragonGroup.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  fireParticles.forEach((particle, i) => {
    const isSmoke = particle.kind === 'smoke';
    const distance = isSmoke ? THREE.MathUtils.randFloat(0.08, 1.05) : THREE.MathUtils.randFloat(-0.12, 0.62);
    const spread = (Math.random() - 0.5) * (isSmoke ? 0.46 : 0.24) * (0.48 + Math.max(distance, 0));
    const lift = (Math.random() - (isSmoke ? 0.04 : 0.26)) * (isSmoke ? 0.58 : 0.34);
    const push = isSmoke ? THREE.MathUtils.randFloat(0.75, 1.55) : THREE.MathUtils.randFloat(1.65, 3.35);

    particle.active = true;
    particle.age = Math.random() * -0.12;
    particle.life = isSmoke ? THREE.MathUtils.randFloat(0.72, 1.34) : THREE.MathUtils.randFloat(0.34, 0.78);
    particle.size = isSmoke ? THREE.MathUtils.randFloat(0.38, 0.82) : THREE.MathUtils.randFloat(0.16, 0.38);
    particle.pos.copy(origin)
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
  window.setTimeout(playBreathAnimation, 420);
}

function onVisibilityChange() {
  if (document.hidden) {
    stop();
  } else if (enabled) {
    start();
  }
}

function setSettings(next) {
  if (!next || typeof next !== 'object') return false;
  Object.assign(sceneSettings, next);
  return true;
}

if (stage) {
  window.CWDragonCinematic = { setEnabled, triggerFire, setAnimation, setSettings, getDebugInfo };
  window.addEventListener('cw-dragon-mode-change', event => {
    setEnabled(event.detail && event.detail.mode === 'cinematic');
  });
  queueMicrotask(() => setEnabled(document.body.classList.contains('dragon-mode-cinematic')));
}
