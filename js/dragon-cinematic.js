import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { FBXLoader } from '../vendor/three/FBXLoader.js';

const stage = document.getElementById('dragon-cinematic-stage');
// Каждый source имеет уникальный sourceId. Lab сохраняет id вместе с
// bone-path/localMouth — main валидирует id перед применением. Так фикс'им
// проблему «lab настроен под один GLB, main грузит другой fallback».
const MODEL_SOURCES = [
  {
    sourceId: 'ancient-toplevel',
    url: 'assets/models/the_elder_scrolls_blades_ancient_dragon.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
  },
  {
    sourceId: 'ancient-tld',
    url: 'assets/models/tes-blades-ancient-dragon.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
  },
  {
    sourceId: 'ancient-source',
    url: 'assets/models/tes-blades-ancient-dragon/source/model.glb',
    label: 'TES Blades Ancient Dragon Sketchfab GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
  },
  {
    sourceId: 'ancient-merged-nla',
    url: 'assets/models/converted/dragon-ancient-merged-nla-prepost.glb',
    label: 'TES Blades Ancient Dragon animated GLB',
    type: 'gltf',
    profile: 'ancient',
    rotationY: Math.PI / 2,
    fitSize: 4.2
  },
  {
    sourceId: 'ancient-fbx',
    url: 'assets/models/tes-blades-ancient-dragon/source/Dragon_Ancient_Skeleton/Dragon_Ancient_Skeleton.fbx',
    label: 'TES Blades Ancient Dragon FBX',
    type: 'fbx',
    profile: 'ancient',
    rotationY: 0
  },
  { sourceId: 'alduin-sketchfab', url: 'assets/models/alduin/source/Ps%20Alduin%20Dragon.glb', label: 'Alduin Sketchfab GLB', type: 'gltf', profile: 'alduin' },
  { sourceId: 'ancient-scene-gltf', url: 'assets/models/tes-blades-ancient-dragon/scene.gltf', label: 'TES Blades Ancient Dragon glTF' },
  { sourceId: 'shulkunaak-glb', url: 'assets/models/tes-blades-shulkunaak.glb', label: 'TES Blades Shulkunaak GLB' },
  { sourceId: 'shulkunaak-gltf', url: 'assets/models/tes-blades-shulkunaak/scene.gltf', label: 'TES Blades Shulkunaak glTF' },
  { sourceId: 'skyrim-glb', url: 'assets/models/skyrim-dragon.glb', label: 'Skyrim Dragon GLB' },
  { sourceId: 'skyrim-gltf', url: 'assets/models/skyrim-dragon/scene.gltf', label: 'Skyrim Dragon glTF' },
  { sourceId: 'alduin-glb', url: 'assets/models/alduin.glb', label: 'Alduin GLB' },
  { sourceId: 'alduin-gltf', url: 'assets/models/alduin/scene.gltf', label: 'Alduin glTF' },
  { sourceId: 'dragon-glb', url: 'assets/models/dragon.glb', label: 'Dragon GLB' },
  { sourceId: 'dragon-gltf', url: 'assets/models/dragon/scene.gltf', label: 'Dragon glTF' }
];

// Идентификатор источника лабы. Lab записывает это в settings при выборе
// bone'а; main проверяет совпадение перед применением lab-attach.
let activeModelSourceId = null;

const DERIVED_FLIGHT_CLIP = 'Dragon_Ancient_Breath_FlightLoop';
const BREATH_CLIP_NAME = 'Dragon_Ancient_Attack_Breath';
const BREATH_LOOP_SECONDS = 7.07;
// Окно секунд внутри breath-клипа, когда модель «выпускает» пламя.
// Перекрывается lab-настройкой fireWindowStart/End (см. applyLabOverrides).
let FIRE_WINDOW_START = 3;
let FIRE_WINDOW_END = 5;
// Continuous emission — каждый burst добавляет неск-ко свободных частиц.
// Раньше 0.18 + reset ВСЕХ → batch-визуал. Теперь 0.05 + 6 новых → smooth.
const FIRE_BURST_INTERVAL = 0.045;
const FIRE_BURST_COUNT = 8;
const FIRE_ORIGIN_BACKSET = 0.72;
const CINEMATIC_SETTINGS_KEY = 'cw_dragon_cinematic_settings_v7';
const LAB_SETTINGS_KEY = 'cw_dragon_lab_settings_v1';
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
let pedestalGroup = null;          // Skyrim-style каменная подставка под драконом
let pedestalRuneBelt = null;       // ссылка на рунический пояс (для repositioning)
let pedestalRuneBaseY = 0;         // базовая Y пояса (offset добавляется к ней)
let platformLight = null;          // отдельный свет на платформу (контрол в панели)
let platformBlob = null;           // мягкая blob-тень под драконом (НЕ зависит от света)
let labPedestalScale = 0.62;       // размер платформы (отдельно от dragonScale)
let labResponsiveStrength = 1;     // сила адаптива размера по ширине экрана (0=выкл, 1=полная)
const RESP_REF_WIDTH = 1440;       // ширина вьюпорта, где адаптив-фактор = 1 (база «как настроено»)
let labRuneBeltOffset = 0;         // вертикальный сдвиг пояса рун (slider)
let labPlatformLight = 0.6;        // интенсивность света платформы (slider)
// Освещение — базовые интенсивности (снижены чтобы дракон не пересвечивался)
let hemiLight = null, moonLight = null, rimLight = null;
const BASE_HEMI = 0.72, BASE_MOON = 1.05, BASE_RIM = 0.45;
let labLightIntensity = 1.0;       // master multiplier (контрол в панели)
function applyLightIntensity() {
  if (hemiLight) hemiLight.intensity = BASE_HEMI * labLightIntensity;
  if (moonLight) moonLight.intensity = BASE_MOON * labLightIntensity;
  if (rimLight)  rimLight.intensity  = BASE_RIM  * labLightIntensity;
}
let ashSeeds = [];
let fireGroup = null;
let flameTexture = null;
let flameCoreTexture = null;
let smokeTexture = null;
let sparkTexture = null;
let fireParticles = [];
let fallbackParts = {};
let fireBurstTimer = 0;
let fireTime = 0;
let lastAnchorScreenX = DEFAULT_CINEMATIC_SETTINGS.anchorX;
let loadingStartedAt = 0;
let loadingIntroTimer = 0;

// ─── Lab overrides ───────────────────────────────────────────────
// Если пользователь подобрал положение пасти в dragon-lab.html — main
// читает cw_dragon_lab_settings_v1 после загрузки модели и через
// model.localToWorld(...) переопределяет mouth + forward direction.
let useLabMouth = false;
const labMouthLocal = new THREE.Vector3();      // model-local (X+ = forward)
const labFireDirLocal = new THREE.Vector3();    // model-local direction
let labFireLengthMul = 1.0;     // multiplier для частиц push (lab default fireLength=2 → mul=1.0)
let labFireIntensityMul = 1.0;  // multiplier для particle.size + fireLight.intensity
// labTrackCursor=false → updateFlight НЕ добавляет cursor-yaw (lab может ровно настроить
// статичный поворот без курсорного wobble'a). Default=true для back-compat — без lab
// настроек cursor-yaw работает как раньше.
let labTrackCursor = true;
// labMouthBone — ссылка на bone модели, к которой привязан fire-origin.
// Lab может его выбрать в dropdown — тогда mouth следит за анимацией головы.
// null = огонь привязан к model-root (rest-pose).
let labMouthBone = null;
// mouthSocket / mouthAhead — дочерние Object3D привязанные к bone, через
// которые мы получаем world-position пасти (Three.js сам апдейтит matrixWorld
// во время render). Это лучше чем bone.localToWorld() каждый кадр.
let mouthSocket = null;
let mouthAheadSocket = null;

function readLabOverrides() {
  // Merge: baked defaults (window.CW_DRAGON_DEFAULTS) ← localStorage (runtime).
  // На публикации localStorage пуст → берутся baked-настройки.
  const baked = (window.CW_DRAGON_DEFAULTS && typeof window.CW_DRAGON_DEFAULTS === 'object')
    ? window.CW_DRAGON_DEFAULTS : null;
  let stored = null;
  try {
    const raw = localStorage.getItem(LAB_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') stored = parsed;
    }
  } catch (_) { /* ignore */ }
  if (!baked && !stored) return null;
  return Object.assign({}, baked || {}, stored || {});
}

function applyLabOverrides() {
  useLabMouth = false;
  labFireLengthMul = 1.0;
  labFireIntensityMul = 1.0;
  labTrackCursor = true;
  labMouthBone = null;   // resolveLabMouthBone() переустановит после загрузки модели
  const lab = readLabOverrides();
  if (!lab) return;

  // Lab чекбокс trackCursor (если undefined → считаем false: lab-настройки активны,
  // пользователь захотел деталь-tuning, cursor-wobble мешает)
  labTrackCursor = lab.trackCursor === true;

  // Fire visuals: lab.fireLength=2 (default) → mul=1.0. lab.fireIntensity=1 (default) → mul=1.0.
  if (Number.isFinite(lab.fireLength))    labFireLengthMul    = lab.fireLength / 2;
  if (Number.isFinite(lab.fireIntensity)) labFireIntensityMul = lab.fireIntensity;

  // ─── Mouth position: model-local. Дефолт лабы (0.5, 0.1, 0) = чуть впереди и выше центра.
  if (Number.isFinite(lab.fireX) && Number.isFinite(lab.fireY) && Number.isFinite(lab.fireZ)) {
    labMouthLocal.set(lab.fireX, lab.fireY, lab.fireZ);
    const yaw = THREE.MathUtils.degToRad(lab.fireYaw || 0);
    const pitch = THREE.MathUtils.degToRad(lab.firePitch || 0);
    // То же преобразование, что в dragon-lab.html updateFireFromSettings():
    // yaw=0, pitch=0 → (1, 0, 0) = модель-вперёд (X+)
    labFireDirLocal.set(
      Math.cos(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.sin(yaw) * Math.cos(pitch)
    ).normalize();
    useLabMouth = true;
  }

  // ─── Dragon transform: пишем в sceneSettings (updateFlight каждый frame применит)
  if (Number.isFinite(lab.dragonYaw))    sceneSettings.yaw    = THREE.MathUtils.clamp(lab.dragonYaw, -180, 180);
  if (Number.isFinite(lab.dragonPitch))  sceneSettings.pitch  = THREE.MathUtils.clamp(lab.dragonPitch, -50, 50);
  if (Number.isFinite(lab.dragonRoll))   sceneSettings.roll   = THREE.MathUtils.clamp(lab.dragonRoll, -45, 45);
  if (Number.isFinite(lab.dragonOffsetX)) sceneSettings.offsetX = THREE.MathUtils.clamp(lab.dragonOffsetX, -4, 4);
  if (Number.isFinite(lab.dragonOffsetY)) sceneSettings.offsetY = THREE.MathUtils.clamp(lab.dragonOffsetY, -3, 3);
  if (Number.isFinite(lab.dragonOffsetZ)) sceneSettings.offsetZ = THREE.MathUtils.clamp(lab.dragonOffsetZ, -3, 3);
  if (Number.isFinite(lab.dragonScale))  sceneSettings.scale   = THREE.MathUtils.clamp(lab.dragonScale, 0.18, 1.4);
  if (Number.isFinite(lab.scrollAnchorX)) sceneSettings.scrollAnchorX = THREE.MathUtils.clamp(lab.scrollAnchorX, 0.02, 0.98);
  if (Number.isFinite(lab.scrollAnchorY)) sceneSettings.scrollAnchorY = THREE.MathUtils.clamp(lab.scrollAnchorY, -0.72, 0.45);

  // ─── Pedestal scale — размер платформы отдельно от дракона
  if (Number.isFinite(lab.pedestalScale)) labPedestalScale = THREE.MathUtils.clamp(lab.pedestalScale, 0.2, 2.0);
  if (Number.isFinite(lab.responsiveStrength)) labResponsiveStrength = THREE.MathUtils.clamp(lab.responsiveStrength, 0, 2);

  // ─── Light intensity master multiplier
  labLightIntensity = Number.isFinite(lab.lightIntensity) ? THREE.MathUtils.clamp(lab.lightIntensity, 0, 3) : 1.0;
  applyLightIntensity();

  // ─── Platform light (отдельный свет на платформу)
  if (Number.isFinite(lab.platformLight)) labPlatformLight = THREE.MathUtils.clamp(lab.platformLight, 0, 3);
  if (platformLight) platformLight.intensity = labPlatformLight;

  // ─── Rune belt vertical offset
  if (Number.isFinite(lab.runeBeltOffset)) labRuneBeltOffset = THREE.MathUtils.clamp(lab.runeBeltOffset, -1.5, 1.5);
  if (pedestalRuneBelt) pedestalRuneBelt.position.y = pedestalRuneBaseY + labRuneBeltOffset;

  // ─── Fire window: секунды внутри breath-клипа, в которые модель «дышит огнём».
  if (Number.isFinite(lab.fireWindowStart)) FIRE_WINDOW_START = Math.max(0, lab.fireWindowStart);
  if (Number.isFinite(lab.fireWindowEnd))   FIRE_WINDOW_END   = Math.max(FIRE_WINDOW_START, lab.fireWindowEnd);

  // После рефактора stage = full-viewport (CSS 100vw × 100vh).
  // stageW/stageH из старых saved-настроек больше НЕ применяем —
  // они переопределяли CSS и делали dragon clipped в 560×420 коробку.
  // Чистим inline-style если он там застрял от предыдущих сессий.
  if (stage) {
    stage.style.width = '';
    stage.style.height = '';
  }

  // ─── Pedestal — default ON, выключить можно через lab.showPedestal: false
  if (pedestalGroup) {
    setPedestalVisible(lab.showPedestal !== false);
  }

  // Диагностика — в консоли видно ли lab-настройки применились:
  // open DevTools → Console → ищи "[dragon-cinematic] lab override applied"
  console.info('[dragon-cinematic] lab override applied', {
    mouth: useLabMouth ? labMouthLocal.toArray() : null,
    fireDir: useLabMouth ? labFireDirLocal.toArray() : null,
    scaling: { fitSize: lab.fitSize, dragonScale: sceneSettings.scale,
               fireLengthMul: labFireLengthMul, fireIntensityMul: labFireIntensityMul },
    anchor: (lab.followScroll === true)
      ? { mode: 'scroll-relative', x: sceneSettings.scrollAnchorX, y: sceneSettings.scrollAnchorY }
      : (Number.isFinite(lab.anchorX) ? { mode: 'viewport-%', x: lab.anchorX, y: lab.anchorY } : 'scroll-relative'),
    stage: { w: lab.stageW, h: lab.stageH },
    rotation: { yaw: sceneSettings.yaw, pitch: sceneSettings.pitch, roll: sceneSettings.roll },
    offset:   { x: sceneSettings.offsetX, y: sceneSettings.offsetY, z: sceneSettings.offsetZ },
    fireWindow: [FIRE_WINDOW_START, FIRE_WINDOW_END],
    clips: { idle: lab.idleClip, breath: lab.breathClip },
    trackCursor: labTrackCursor,
    mouthBone: lab.mouthBone || 'model-root'
  });
}

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
  applyLabOverrides();   // CSS-size до загрузки модели
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
  renderer.toneMappingExposure = 1.0;          // было 1.14 — дракон пересвечен
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.appendChild(renderer.domElement);

  // Базовые интенсивности снижены (было 1.45/1.9/0.75 — засвечивало).
  // labLightIntensity умножает все три — контрол в панели.
  hemiLight = new THREE.HemisphereLight(0xd6c69c, 0x110706, BASE_HEMI);
  scene.add(hemiLight);

  moonLight = new THREE.DirectionalLight(0xffe2a6, BASE_MOON);
  moonLight.position.set(-5.5, 6, 5.5);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 24;
  moonLight.shadow.camera.left = -5;
  moonLight.shadow.camera.right = 5;
  moonLight.shadow.camera.top = 5;
  moonLight.shadow.camera.bottom = -5;
  moonLight.shadow.bias = -0.0006;
  moonLight.shadow.normalBias = 0.02;
  scene.add(moonLight);
  scene.add(moonLight.target);   // target нужен в сцене для follow-логики

  rimLight = new THREE.DirectionalLight(0x7fb3ff, BASE_RIM);
  rimLight.position.set(5, 3.5, -4);
  scene.add(rimLight);

  applyLightIntensity();

  fireLight = new THREE.PointLight(0xff7a24, 0, 9.5, 1.7);
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
  createPedestal();   // каменная подставка под драконом (Skyrim-style)
  beginLoadingIntro();
  void loadDragonModel();
  onResize();
  // Stage = full-viewport overlay, никаких DOM-позиционирующих listener'ов:
  // позиция дракона решается ВНУТРИ 3D-сцены через getBottomAnchor().
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('cw-puzzle-generated', onPuzzleGenerated);
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Manual orbit controls (активны только в edit-mode через CSS pointer-events)
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

/* После рефактора stage = full-viewport overlay → DOM-позиционирование
 * stage'а не нужно. Анкер дракона решается ВНУТРИ 3D-сцены через
 * `getBottomAnchor()` + `screenToWorld()` (см. updateFlight/getBottomAnchor).
 * Функция оставлена пустой для совместимости со старыми вызовами. */
function attachStageToScroll() { /* no-op после рефактора */ }

/* Orbit controls — manual mouse drag, сохраняет ориентацию */
let orbitAzimuth = 0, orbitElevation = 0, orbitRadius = 7.2;
let orbitDragging = false, orbitDragX = 0, orbitDragY = 0;

function initOrbitControls() {
  if (!stage) return;
  // После рефактора canvas имеет pointer-events:none ИЗ CSS, а в edit-mode
  // (`.dragon-stage-editing`) переключается в pointer-events:auto.
  // Orbit-controls листенеры навешиваются — но активируются только когда
  // canvas принимает события (т.е. в edit-mode). В обычном режиме они
  // инертны — UI-клики проходят через дракона к кнопкам.
  const canvas = stage.querySelector('canvas');
  const dragTarget = canvas || stage;
  // НЕ переопределяем canvas.style.pointerEvents здесь — CSS управляет.

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

// ─── Skyrim-style каменная подставка ────────────────────────────
// Дракон сидит на ней. Подставка статична (не следует за курсором/bob),
// синхронизирована с dragonGroup.position только в горизонтальной плоскости
// и в Y — ровно так, чтобы верхушка пьедестала была под лапами дракона.
const PEDESTAL_TOTAL_HEIGHT = 3.2;     // короче — меньше perspective tilt
const PEDESTAL_TOP_RADIUS = 1.3;
const PEDESTAL_COLUMN_RADIUS = 0.85;
const PEDESTAL_BASE_RADIUS = 1.45;
const PEDESTAL_SEGMENTS = 32;          // было 8 (граненый), теперь почти гладкий

// Procedural каменная текстура — noise points + cracks. Без неё камень
// выглядит абсолютно гладкой серой штукой "из пластика".
function createStoneTexture(opts) {
  opts = opts || {};
  const baseHex = opts.base || 0x5a5550;
  const r = (baseHex >> 16) & 255;
  const g = (baseHex >> 8) & 255;
  const b = baseHex & 255;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Base fill
  ctx.fillStyle = '#' + baseHex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 512, 512);

  // Noise grain — рассыпаем тысячи мелких точек разной яркости
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 3 + 0.5;
    const lum = (Math.random() - 0.5) * 60;        // -30..+30
    const cr = Math.max(0, Math.min(255, r + lum));
    const cg = Math.max(0, Math.min(255, g + lum));
    const cb = Math.max(0, Math.min(255, b + lum));
    ctx.fillStyle = 'rgba(' + cr.toFixed(0) + ',' + cg.toFixed(0) + ',' + cb.toFixed(0) + ',' + (0.2 + Math.random() * 0.4).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Тёмные крупные пятна (mossy spots / weathering)
  for (let i = 0; i < 35; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 15 + Math.random() * 25;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0, 'rgba(20, 15, 10, 0.45)');
    grd.addColorStop(1, 'rgba(20, 15, 10, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Трещины — рваные линии
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 6 + Math.floor(Math.random() * 8);
    for (let j = 0; j < segments; j++) {
      x += (Math.random() - 0.5) * 80;
      y += (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(10, 8, 5, ' + (0.25 + Math.random() * 0.35).toFixed(2) + ')';
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
  return tex;
}

// Procedural рунический пояс — большая текстура для wrap вокруг колонны
function createRuneStripTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  // Тёмный «утопленный» каменный жёлоб — темнее колонны, чтобы руны контрастировали
  ctx.fillStyle = '#17130f';
  ctx.fillRect(0, 0, 1024, 128);
  // Noise base
  for (let i = 0; i < 1000; i++) {
    const lum = Math.random() * 24;
    ctx.fillStyle = 'rgba(' + (34 + lum).toFixed(0) + ',' + (29 + lum).toFixed(0) + ',' + (24 + lum).toFixed(0) + ',' + (0.3 + Math.random() * 0.4).toFixed(2) + ')';
    ctx.fillRect(Math.random() * 1024, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // Светящиеся голубые рамки-канты сверху и снизу жёлоба
  ctx.shadowBlur = 8;
  ctx.shadowColor = 'rgba(90, 180, 255, 0.9)';
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 10); ctx.lineTo(1024, 10);
  ctx.moveTo(0, 118); ctx.lineTo(1024, 118);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 8 рун равномерно — стилизованные nordic glyphs. Двойной проход:
  // 1) широкий мягкий glow, 2) яркое тонкое ядро — чтобы читались на мелком масштабе.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 8; i++) {
    const cx = 64 + i * 128;
    const cy = 64;
    // проход 1 — glow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowBlur = 22;
    ctx.shadowColor = 'rgba(120, 205, 255, 1)';
    ctx.strokeStyle = 'rgba(150, 220, 255, 0.9)';
    ctx.lineWidth = 9;
    drawNordicGlyph(ctx, i);
    ctx.restore();
    // проход 2 — яркое бело-голубое ядро
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(200, 240, 255, 1)';
    ctx.strokeStyle = 'rgba(240, 250, 255, 1)';
    ctx.lineWidth = 4;
    drawNordicGlyph(ctx, i);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Простые стилизованные nordic-like руны (вариативные). Крупнее (было 30).
function drawNordicGlyph(ctx, seed) {
  const size = 42;
  ctx.beginPath();
  switch (seed % 8) {
    case 0:  // ᚦ — стрелка вверх с косой
      ctx.moveTo(0, -size); ctx.lineTo(0, size);
      ctx.moveTo(0, -size/2); ctx.lineTo(size*0.6, 0); ctx.lineTo(0, size/2);
      break;
    case 1:  // ᛞ — двойной ромб
      ctx.moveTo(-size*0.6, 0); ctx.lineTo(0, -size);
      ctx.lineTo(size*0.6, 0); ctx.lineTo(0, size);
      ctx.lineTo(-size*0.6, 0);
      ctx.moveTo(0, -size); ctx.lineTo(0, size);
      break;
    case 2:  // ᛟ — наклонный крест
      ctx.moveTo(-size*0.7, -size*0.7); ctx.lineTo(size*0.7, size*0.7);
      ctx.moveTo(size*0.7, -size*0.7); ctx.lineTo(-size*0.7, size*0.7);
      break;
    case 3:  // ᚱ — R-like
      ctx.moveTo(-size*0.4, -size); ctx.lineTo(-size*0.4, size);
      ctx.moveTo(-size*0.4, -size); ctx.lineTo(size*0.4, -size*0.5);
      ctx.lineTo(-size*0.4, 0); ctx.lineTo(size*0.4, size);
      break;
    case 4:  // ᚨ — A-like с засечкой
      ctx.moveTo(-size*0.5, size); ctx.lineTo(0, -size); ctx.lineTo(size*0.5, size);
      ctx.moveTo(-size*0.3, size*0.2); ctx.lineTo(size*0.3, size*0.2);
      break;
    case 5:  // ᛏ — стрела вверх
      ctx.moveTo(0, size); ctx.lineTo(0, -size);
      ctx.moveTo(-size*0.4, -size*0.5); ctx.lineTo(0, -size); ctx.lineTo(size*0.4, -size*0.5);
      break;
    case 6:  // ᛒ — два полукруга
      ctx.moveTo(-size*0.4, -size); ctx.lineTo(-size*0.4, size);
      ctx.moveTo(-size*0.4, -size); ctx.bezierCurveTo(size*0.6, -size*0.8, size*0.6, -size*0.1, -size*0.4, 0);
      ctx.moveTo(-size*0.4, 0); ctx.bezierCurveTo(size*0.6, size*0.1, size*0.6, size*0.8, -size*0.4, size);
      break;
    case 7:  // ⛧ — звездчатый
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 - Math.PI/2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * size, Math.sin(ang) * size);
      }
      break;
  }
  ctx.stroke();
}

// Мягкая радиальная текстура для blob-тени
function createSoftShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function createPedestal() {
  pedestalGroup = new THREE.Group();
  pedestalGroup.name = 'PedestalGroup';

  // Blob-тень под драконом — отдельный объект в сцене (не child платформы),
  // позиционируется в updateFlight под лапами. MeshBasic → видна при любом
  // освещении (real shadow-map тускнеет при lightIntensity~0.1).
  if (!platformBlob) {
    platformBlob = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1.35),
      new THREE.MeshBasicMaterial({
        map: createSoftShadowTexture(),
        transparent: true, depthWrite: false, fog: false, opacity: 0.75
      })
    );
    platformBlob.rotation.x = -Math.PI / 2;
    platformBlob.renderOrder = -1;
    platformBlob.visible = false;
    scene.add(platformBlob);
  }

  // Каменные материалы с procedural-noise текстурой. Тёмный nordic-камень.
  const stoneMidMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // white tint — текстура задаёт цвет
    map: createStoneTexture({ base: 0x3a342e, repeatX: 2, repeatY: 1 }),
    roughness: 0.9, metalness: 0.08
  });
  const stoneDarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createStoneTexture({ base: 0x241f1a, repeatX: 2, repeatY: 1 }),
    roughness: 0.95, metalness: 0.05
  });
  const stoneTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createStoneTexture({ base: 0x322d28, repeatX: 1, repeatY: 1 }),
    roughness: 0.85, metalness: 0.1
  });
  // Glowing рун-strip материал — wrap вокруг колонны
  const runeStripMat = new THREE.MeshBasicMaterial({
    map: createRuneStripTexture(),
    transparent: true,
    fog: false,
    side: THREE.DoubleSide
  });

  // Top platform — где сидит дракон. Top at pedestal-local y = 0
  const topHeight = 0.32;
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(PEDESTAL_TOP_RADIUS, PEDESTAL_COLUMN_RADIUS * 1.05, topHeight, PEDESTAL_SEGMENTS),
    stoneTopMat
  );
  top.position.y = -topHeight / 2;
  top.receiveShadow = true;     // принимает тень дракона
  pedestalGroup.add(top);

  // Декоративный кант под верхушкой — узкое тёмное кольцо
  const trimHeight = 0.08;
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(PEDESTAL_TOP_RADIUS * 0.95, PEDESTAL_COLUMN_RADIUS * 1.02, trimHeight, PEDESTAL_SEGMENTS),
    stoneDarkMat
  );
  trim.position.y = -topHeight - trimHeight / 2;
  pedestalGroup.add(trim);

  // Column — основное тело
  const columnHeight = PEDESTAL_TOTAL_HEIGHT - topHeight - trimHeight - 0.4;
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(PEDESTAL_COLUMN_RADIUS, PEDESTAL_COLUMN_RADIUS * 1.08, columnHeight, PEDESTAL_SEGMENTS),
    stoneMidMat
  );
  column.position.y = -(topHeight + trimHeight + columnHeight / 2);
  pedestalGroup.add(column);

  // Base ring — широкая нижняя часть
  const baseHeight = 0.35;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(PEDESTAL_BASE_RADIUS, PEDESTAL_BASE_RADIUS * 1.04, baseHeight, PEDESTAL_SEGMENTS),
    stoneDarkMat
  );
  base.position.y = -PEDESTAL_TOTAL_HEIGHT + baseHeight / 2;
  pedestalGroup.add(base);

  // Рунический пояс — cylinder с runeStripMat (rune texture wrap'ом).
  // ВАЖНО: колонна расширяется книзу (top 0.85 → bottom 0.918), на середине
  // её радиус ≈0.884. Прежний пояс 0.85×1.015=0.863 был УТОПЛЕН в колонну
  // (невидим). Теперь 0.85×1.16=0.986 — явно выступает наружу кольцом.
  // Подняли выше (0.3 от высоты колонны вместо 0.5) + offset из настроек.
  const runeBeltHeight = 0.62;
  pedestalRuneBaseY = -(topHeight + trimHeight + columnHeight * 0.3);
  const runeBeltR = PEDESTAL_COLUMN_RADIUS * 1.16;
  pedestalRuneBelt = new THREE.Mesh(
    new THREE.CylinderGeometry(
      runeBeltR, runeBeltR,
      runeBeltHeight,
      PEDESTAL_SEGMENTS,
      1,
      true   // openEnded — без cap'ов
    ),
    runeStripMat
  );
  pedestalRuneBelt.position.y = pedestalRuneBaseY + labRuneBeltOffset;
  pedestalGroup.add(pedestalRuneBelt);

  // Отдельный свет на платформу — мягкий PointLight над верхушкой.
  // Интенсивность управляется слайдером (labPlatformLight). Тёплый.
  platformLight = new THREE.PointLight(0xffd9a0, labPlatformLight, 4, 2);
  platformLight.position.set(0, 1.2, 0.6);
  pedestalGroup.add(platformLight);

  // Ground shadow — диск тени под основанием
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(PEDESTAL_BASE_RADIUS * 1.4, 48),
    new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.42,
      depthWrite: false, fog: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -PEDESTAL_TOTAL_HEIGHT - 0.01;
  pedestalGroup.add(shadow);

  scene.add(pedestalGroup);
}

/* Sync pedestal position to dragon's pre-bob position. Pedestal scale
 * следует sceneSettings.scale (визуально пропорционально). Никакой ротации
 * — pedestal всегда вертикальный (дракон может крутиться над ним). */
function syncPedestalToDragon(dragonPos) {
  if (!pedestalGroup) return;
  pedestalGroup.position.copy(dragonPos);
  pedestalGroup.scale.setScalar(labPedestalScale);
}

function setPedestalVisible(v) {
  if (pedestalGroup) pedestalGroup.visible = !!v;
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
  flameCoreTexture = createFlameCoreTexture();
  smokeTexture = createSmokeTexture();
  sparkTexture = createSparkTexture();
  fireGroup = new THREE.Group();
  fireParticles = [];

  for (let i = 0; i < 54; i++) {
    fireParticles.push(createFireSprite('core'));
  }
  for (let i = 0; i < 104; i++) {
    fireParticles.push(createFireSprite('flame'));
  }
  for (let i = 0; i < 42; i++) {
    fireParticles.push(createFireSprite('smoke'));
  }
  for (let i = 0; i < 38; i++) {
    fireParticles.push(createFireSprite('spark'));
  }

  scene.add(fireGroup);
}

function createFireSprite(kind) {
  const isSmoke = kind === 'smoke';
  const isCore = kind === 'core';
  const isSpark = kind === 'spark';
  const material = new THREE.SpriteMaterial({
    map: isSmoke ? smokeTexture : (isSpark ? sparkTexture : (isCore ? flameCoreTexture : flameTexture)),
    color: isSmoke ? 0x5a4a3d : (isSpark ? 0xffe58c : (isCore ? 0xfff2b5 : 0xff9a24)),
    transparent: true,
    opacity: 0,
    blending: isSmoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    // Fog в main делал пламя тусклым. Lab фога не имеет — отключаем
    // fog для fire-материалов чтобы выглядело так же ярко.
    fog: false,
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
    phase: Math.random() * Math.PI * 2,
    heat: 1,
    turbulence: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3()
  };
}

function createFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const glow = ctx.createRadialGradient(128, 134, 0, 128, 134, 122);
  glow.addColorStop(0.00, 'rgba(255, 246, 205, 0.98)');
  glow.addColorStop(0.12, 'rgba(255, 210, 78, 0.86)');
  glow.addColorStop(0.34, 'rgba(255, 122, 24, 0.62)');
  glow.addColorStop(0.62, 'rgba(190, 38, 6, 0.24)');
  glow.addColorStop(1.00, 'rgba(0, 0, 0, 0.00)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = 84 + Math.random() * 88;
    const y = 74 + Math.random() * 88;
    const r = 26 + Math.random() * 42;
    const lobe = ctx.createRadialGradient(x, y, 0, x, y, r);
    lobe.addColorStop(0, 'rgba(255, 238, 150, 0.58)');
    lobe.addColorStop(0.42, 'rgba(255, 122, 26, 0.24)');
    lobe.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lobe;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.72, r * 1.15, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFlameCoreTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const core = ctx.createRadialGradient(96, 96, 0, 96, 96, 82);
  core.addColorStop(0.00, 'rgba(255, 255, 235, 1.00)');
  core.addColorStop(0.20, 'rgba(255, 238, 145, 0.94)');
  core.addColorStop(0.52, 'rgba(255, 160, 40, 0.46)');
  core.addColorStop(1.00, 'rgba(0, 0, 0, 0.00)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 192, 192);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSparkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const spark = ctx.createRadialGradient(48, 48, 0, 48, 48, 44);
  spark.addColorStop(0.00, 'rgba(255,255,240,1)');
  spark.addColorStop(0.25, 'rgba(255,224,112,0.92)');
  spark.addColorStop(0.62, 'rgba(255,112,28,0.34)');
  spark.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = spark;
  ctx.fillRect(0, 0, 96, 96);

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
  activeModelSourceId = source.sourceId || null;
  applyLabOverrides();   // lab перекрывает mouthLocal/fireForwardLocal (через model.localToWorld в getMouthWorldPosition)

  const model = asset.scene || asset;
  model.traverse(obj => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = true;      // дракон отбрасывает тень на платформу
    obj.receiveShadow = true;
    if (obj.material) {
      const wasArray = Array.isArray(obj.material);
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const clones = materials.map(material => {
        const clone = material.clone();
        // Цвет почти не бустим (был ×1.22 — пересвет). Лёгкий ×1.05.
        if (clone.color) clone.color.multiplyScalar(1.05);
        if (clone.emissive) {
          clone.emissive.setHex(0x0c0602);
          clone.emissiveIntensity = 0.12;       // было 0.28
        }
        if (typeof clone.roughness === 'number') clone.roughness = Math.min(Math.max(clone.roughness, 0.45), 0.82);
        // ФИКС просвечивания: GLB-материалы часто экспортятся как alphaMode BLEND
        // (transparent:true) → backface видна сквозь front. Форсим opaque +
        // depthWrite + FrontSide (одна сторона) — solid тело без see-through.
        clone.transparent = false;
        clone.depthWrite = true;
        clone.depthTest = true;
        clone.alphaTest = 0;
        if (typeof clone.opacity === 'number') clone.opacity = 1;
        clone.side = THREE.FrontSide;
        clone.needsUpdate = true;
        return clone;
      });
      obj.material = wasArray ? clones : clones[0];
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Lab override: lab.fitSize (целевой размер бокса модели) > профильный fitSize
  const labFit = readLabOverrides();
  const fitSize = (labFit && Number.isFinite(labFit.fitSize))
    ? labFit.fitSize
    : (source.fitSize || (source.type === 'fbx' ? 3.2 : 3.45));
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
  resolveLabMouthBone();   // привязать pivot пасти к bone из lab.mouthBone (если есть)

  const clips = buildPlayableClips(asset.animations || model.animations || []);
  if (clips.length) {
    mixer = new THREE.AnimationMixer(model);
    clipNames = clips.map(clip => clip.name);
    const requestedClip = getRequestedClip(clips);
    // Lab может явно пометить какой клип используется как «breath» (🔥 Mark Breath).
    const breathClip = getLabBreathClip(clips) || pickClip(clips, [
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
  // Lab override: settings.idleClip (отметка ⛓ в dragon-lab.html)
  if (!requested) {
    const lab = readLabOverrides();
    if (lab && typeof lab.idleClip === 'string' && lab.idleClip) requested = lab.idleClip;
  }
  requested = requested || sceneSettings.clip;

  if (!requested) return null;
  return clips.find(clip => clip.name === requested) ||
    clips.find(clip => clip.name.toLowerCase() === requested.toLowerCase()) ||
    clips.find(clip => clip.name.includes(`|${requested}|`)) ||
    null;
}

function getLabBreathClip(clips) {
  const lab = readLabOverrides();
  if (!lab || !lab.breathClip) return null;
  return clips.find(c => c.name === lab.breathClip) ||
         clips.find(c => c.name.toLowerCase() === String(lab.breathClip).toLowerCase()) ||
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
    clips: clipNames.slice(),
    lab: {
      useLabMouth,
      mouth: useLabMouth ? labMouthLocal.toArray() : null,
      mouthDir: useLabMouth ? labFireDirLocal.toArray() : null,
      mouthBone: labMouthBone ? labMouthBone.name : null,
      mouthBoneType: labMouthBone ? (labMouthBone.isBone ? 'Bone' : labMouthBone.type) : null,
      trackCursor: labTrackCursor,
      fireLengthMul: labFireLengthMul,
      fireIntensityMul: labFireIntensityMul
    }
  };
}

function playBreathAnimation() {
  if (!breathAction) return;

  // Если breath уже активна и крутится — НЕ сбрасываем (иначе анимация
  // дракона прыгает в начало при каждой генерации). Просто продолжаем.
  if (activeAction === breathAction &&
      typeof breathAction.isRunning === 'function' && breathAction.isRunning()) {
    breathReturnTimer = 0;
    return;
  }

  breathAction.enabled = true;
  breathAction.setLoop(THREE.LoopRepeat, Infinity);
  breathAction.clampWhenFinished = false;
  // reset() только при переключении с ДРУГОЙ анимации (плавный fade, без прыжка)
  if (activeAction !== breathAction) breathAction.reset();
  playAction(breathAction, 0.2);
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
  target.copy(getBottomAnchor(elapsed));     // базовый anchor = верхушка пьедестала
  position.lerp(target, 1 - Math.pow(0.96, dt * 60));

  // Pedestal — на базовом anchor (без dragon-offset, без bob → не качается)
  syncPedestalToDragon(position);

  // Shadow-light follows dragon — иначе orthographic shadow-frustum
  // (центрирован на target) не покрыл бы дракона в anchor-позиции.
  if (moonLight) {
    moonLight.position.set(position.x - 3.2, position.y + 5.5, position.z + 3.2);
    moonLight.target.position.copy(position);
    moonLight.target.updateMatrixWorld();
  }

  // Blob-тень под лапами дракона на платформе (X/Z дракона, Y верхушки платформы).
  // Видна всегда (не зависит от lightIntensity) — гарантирует тень даже в тёмной сцене.
  if (platformBlob) {
    platformBlob.visible = !!(pedestalGroup && pedestalGroup.visible);
    platformBlob.position.set(
      position.x + sceneSettings.offsetX,
      position.y + 0.03,
      position.z + sceneSettings.offsetZ
    );
    // Тень держим В ПРЕДЕЛАХ верхушки платформы (диаметр = 2*PEDESTAL_TOP_RADIUS*scale
    // = 2.6*scale). Плоскость blob'а 2 ед. шириной → scale 1.25 даёт ширину 2.5*scale,
    // чуть меньше верхушки, мягкий край гаснет у самого канта → тень НЕ вылезает на
    // страницу. (Раньше было *2.3 ⇒ ширина 4.6*scale, вдвое шире платформы.)
    platformBlob.scale.setScalar(labPedestalScale * 1.25 * responsiveFactor());
  }
  // Подставка тоже адаптивна по ширине (тот же фактор, что у дракона/тени).
  if (pedestalGroup) pedestalGroup.scale.setScalar(labPedestalScale * responsiveFactor());

  // Dragon — base + offset (offsetX/Y/Z позиционируют дракона ОТНОСИТЕЛЬНО
  // платформы: offsetY поднимает над верхушкой, offsetX/Z двигают по ней) + bob
  const bob = Math.sin(elapsed * 1.2) * 0.025;
  dragonGroup.position.set(
    position.x + sceneSettings.offsetX,
    position.y + sceneSettings.offsetY + bob,
    position.z + sceneSettings.offsetZ
  );

  // Cursor-yaw (±38°) добавляется только когда lab-checkbox trackCursor=true
  // (или когда нет lab-настроек вообще — старое поведение).
  const cursorX = (pointer.x + 1) / 2;
  const cursorYaw = labTrackCursor
    ? THREE.MathUtils.clamp((cursorX - lastAnchorScreenX) * 86, -38, 38)
    : 0;
  tmpEuler.set(
    THREE.MathUtils.degToRad(sceneSettings.pitch),
    THREE.MathUtils.degToRad(sceneSettings.yaw + cursorYaw),
    THREE.MathUtils.degToRad(sceneSettings.roll),
    'YXZ'
  );
  tmpQuat.setFromEuler(tmpEuler);
  dragonGroup.quaternion.slerp(tmpQuat, 0.14);

  dragonGroup.scale.setScalar((sceneSettings.scale + Math.sin(elapsed * 1.15) * 0.008) * responsiveFactor());

  if (fallbackParts.leftWing && fallbackParts.rightWing) {
    const flap = Math.sin(elapsed * 8.2) * 0.52;
    fallbackParts.leftWing.rotation.x = -0.16 + flap;
    fallbackParts.rightWing.rotation.x = 0.16 - flap;
    modelSocket.rotation.z = Math.sin(elapsed * 2.1) * 0.035;
  }
}

// Адаптив размера: дракон и подставка масштабируются по ШИРИНЕ вьюпорта — узкий
// экран (телефон) → мельче (не закрывает кроссворд), ультраширокий → крупнее
// (позиция уже в боковом поле через anchorX%). Сублинейная кривая, клампится.
// labResponsiveStrength (0..2) — «сила» (0 = адаптив выкл, 1 = полная кривая).
function responsiveFactor() {
  const w = window.innerWidth || RESP_REF_WIDTH;
  let raw = Math.pow(w / RESP_REF_WIDTH, 0.6);
  raw = Math.max(0.5, Math.min(1.7, raw));
  return 1 + (raw - 1) * labResponsiveStrength;
}

function getBottomAnchor(elapsed) {
  // Приоритет источников anchor'а:
  //   1. lab.followScroll=false + lab.anchorX/Y → viewport-% (drag-editor пишет сюда)
  //   2. scrollRect (grid-container) → scroll-relative (дракон над свитком)
  //   3. sceneSettings.anchorX/Y → дефолтный профильный fallback
  let px, py;
  const lab = readLabOverrides();
  const labViewportAnchor = lab
    && lab.followScroll !== true
    && Number.isFinite(lab.anchorX)
    && Number.isFinite(lab.anchorY);

  if (labViewportAnchor) {
    // Lab/drag-editor: anchorX/Y в процентах viewport.
    let ax = lab.anchorX, ay = lab.anchorY;
    // Мобайл (узкий экран): дракон маленький СВЕРХУ по центру, НАД сеткой —
    // чтобы не закрывал колонку вопросов внизу. Размер ужимает responsiveFactor.
    if (window.innerWidth <= 640) { ax = 50; ay = 15; }
    px = window.innerWidth  * ax / 100;
    py = window.innerHeight * ay / 100;
  } else {
    const scrollRect = getScrollRect();
    if (scrollRect) {
      px = scrollRect.left + scrollRect.width * sceneSettings.scrollAnchorX;
      py = scrollRect.top + scrollRect.height * sceneSettings.scrollAnchorY;
    } else {
      const anchorX = window.innerWidth > 1500 ? sceneSettings.anchorXWide : sceneSettings.anchorX;
      const anchorY = window.innerWidth > 1500 ? sceneSettings.anchorYWide : sceneSettings.anchorY;
      px = window.innerWidth * anchorX;
      py = window.innerHeight * anchorY;
    }
  }

  lastAnchorScreenX = px / Math.max(window.innerWidth, 1);
  // Возвращаем БАЗОВЫЙ anchor (без dragon-offset). Это точка где стоит
  // верхушка пьедестала. Dragon-offset (sceneSettings.offsetX/Y/Z)
  // применяется отдельно в updateFlight — позволяет позиционировать
  // дракона относительно платформы.
  return screenToWorld(px, py, sceneSettings.zPlane);
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
    spawnFire(FIRE_BURST_COUNT);   // continuous-mode: только новые частицы
    fireBurstTimer = FIRE_BURST_INTERVAL;
  }
  stage.classList.add('is-breathing');
}

/* spawnFire(emitMax)
 *   emitMax = -1  → сбросить ВСЕ частицы (старое поведение, для triggerFire burst)
 *   emitMax > 0   → активировать ТОЛЬКО emitMax свободных частиц (continuous stream,
 *                   как в лабе). Активные частицы продолжают жить — никаких "batch
 *                   resets", которые выглядят как обрезанные кадры.
 *
 *   Lab emitFire: ищет inactive и активирует 3/0.05s = 60/sec.
 *   Main updateBreathFire: вызывает spawnFire(8) каждые 0.18s = 44/sec.
 *     Со средним particle.life ~0.5s в пуле ~22 активных постоянно → плотная струя.
 */
function spawnFire(emitMax = -1) {
  const mouth = getMouthWorldPosition();
  const dir = getFireDirection(mouth);
  // FIRE_ORIGIN_BACKSET = 0.72 was tuned for fallback procedural dragon
  // (огонь «изнутри пасти»). С lab bone-tuning координаты уже точны →
  // backset не нужен (иначе fire emerge внутри тела).
  const backset = useLabMouth ? 0 : FIRE_ORIGIN_BACKSET;
  const origin = mouth.clone().addScaledVector(dir, -backset);
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(dragonGroup.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  let emittedFlame = 0;
  let emittedCore = 0;
  let emittedSmoke = 0;
  let emittedSpark = 0;
  const flameQuota = emitMax > 0 ? emitMax : Infinity;
  const coreQuota = emitMax > 0 ? Math.max(2, Math.round(emitMax * 0.55)) : Infinity;
  const sparkQuota = emitMax > 0 ? Math.max(1, Math.round(emitMax * 0.38)) : Infinity;
  // Smoke редкий — примерно 1 на 4 пламени (но не блокирует quota)
  const smokeQuota = emitMax > 0 ? Math.max(1, Math.floor(emitMax / 4)) : Infinity;

  fireParticles.forEach((particle, i) => {
    const kind = particle.kind;
    const isCore = kind === 'core';
    const isSmoke = kind === 'smoke';
    const isSpark = kind === 'spark';
    // В continuous-mode: пропустить уже активные + лимит на новые
    if (emitMax > 0) {
      if (particle.active) return;
      if (isCore && emittedCore >= coreQuota) return;
      if (isSmoke && emittedSmoke >= smokeQuota) return;
      if (isSpark && emittedSpark >= sparkQuota) return;
      if (!isSmoke && !isCore && !isSpark && emittedFlame >= flameQuota) return;
    }

    const distance = isCore
      ? THREE.MathUtils.randFloat(-0.08, 0.34)
      : isSmoke
        ? THREE.MathUtils.randFloat(0.42, 1.52)
        : isSpark
          ? THREE.MathUtils.randFloat(0.18, 1.24)
          : THREE.MathUtils.randFloat(-0.04, 0.88);
    const spreadBase = isCore ? 0.15 : (isSmoke ? 0.66 : (isSpark ? 0.36 : 0.30));
    const spread = (Math.random() - 0.5) * spreadBase * (0.58 + Math.max(distance, 0));
    const lift = (Math.random() - (isSmoke ? -0.02 : isSpark ? 0.12 : 0.24)) *
      (isSmoke ? 0.72 : isSpark ? 0.42 : 0.38);
    const pushRaw = isCore
      ? THREE.MathUtils.randFloat(1.95, 3.65)
      : isSmoke
        ? THREE.MathUtils.randFloat(0.72, 1.62)
        : isSpark
          ? THREE.MathUtils.randFloat(2.7, 4.5)
          : THREE.MathUtils.randFloat(1.7, 3.75);
    // Lab fireLength scales jet length (push), fireIntensity scales particle size.
    const push = pushRaw * labFireLengthMul;

    particle.active = true;
    particle.age = Math.random() * (isSmoke ? -0.18 : -0.08);
    particle.life = isCore
      ? THREE.MathUtils.randFloat(0.22, 0.46)
      : isSmoke
        ? THREE.MathUtils.randFloat(0.88, 1.72)
        : isSpark
          ? THREE.MathUtils.randFloat(0.24, 0.62)
          : THREE.MathUtils.randFloat(0.36, 0.82);
    particle.size = (isCore
      ? THREE.MathUtils.randFloat(0.12, 0.28)
      : isSmoke
        ? THREE.MathUtils.randFloat(0.42, 0.96)
        : isSpark
          ? THREE.MathUtils.randFloat(0.055, 0.14)
          : THREE.MathUtils.randFloat(0.20, 0.46)) * labFireIntensityMul;
    particle.heat = THREE.MathUtils.randFloat(0.82, 1.18);
    particle.phase = Math.random() * Math.PI * 2;
    particle.turbulence = THREE.MathUtils.randFloat(0.025, isSmoke ? 0.11 : 0.085);
    particle.spin = THREE.MathUtils.randFloat(isSpark ? -7.5 : -2.8, isSpark ? 7.5 : 2.8);
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
    if (isCore) emittedCore++;
    else if (isSmoke) emittedSmoke++;
    else if (isSpark) emittedSpark++;
    else emittedFlame++;
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
    const isCore = particle.kind === 'core';
    const isSmoke = particle.kind === 'smoke';
    const isSpark = particle.kind === 'spark';
    particle.vel.multiplyScalar(1 - dt * (isSmoke ? 0.34 : isSpark ? 0.12 : 0.18));
    particle.vel.y += dt * (isSmoke ? 0.84 : isSpark ? -0.04 : 0.20);
    particle.pos.addScaledVector(particle.vel, dt);
    if (!isSpark) {
      const t = performance.now() * 0.001;
      particle.pos.x += Math.sin(t * (isSmoke ? 2.1 : 7.4) + particle.phase) * particle.turbulence * dt;
      particle.pos.z += Math.cos(t * (isSmoke ? 1.7 : 6.2) + particle.phase) * particle.turbulence * dt;
    }

    const fadeIn = Math.min(1, k * 7);
    const fadeOut = Math.pow(1 - k, isSmoke ? 1.18 : isSpark ? 1.55 : isCore ? 1.05 : 1.62);
    const opacity = fadeIn * fadeOut *
      (isSmoke ? 0.22 : isSpark ? 0.94 : isCore ? 0.76 : 0.60) * particle.heat;
    const scale = particle.size *
      (isSmoke ? (0.88 + k * 1.95) : isSpark ? (0.52 + k * 0.72) : isCore ? (0.64 + k * 1.24) : (0.72 + k * 1.35));

    particle.sprite.position.copy(particle.pos);
    particle.sprite.scale.set(
      scale * (isSpark ? 0.48 : isCore ? 0.92 : 1.0),
      scale * (isSmoke ? 0.82 : isSpark ? 2.65 : isCore ? 1.08 : 1.48),
      scale
    );
    particle.sprite.material.opacity = opacity;
    particle.sprite.material.rotation += particle.spin * dt;
    if (!isSmoke && particle.sprite.material.color) {
      if (isCore) {
        particle.sprite.material.color.setHSL(THREE.MathUtils.lerp(0.12, 0.045, k), 1, THREE.MathUtils.lerp(0.86, 0.48, k));
      } else if (isSpark) {
        particle.sprite.material.color.setHSL(THREE.MathUtils.lerp(0.14, 0.06, k), 1, THREE.MathUtils.lerp(0.86, 0.46, k));
      } else {
        particle.sprite.material.color.setHSL(THREE.MathUtils.lerp(0.09, 0.018, k), 1, THREE.MathUtils.lerp(0.62, 0.32, k));
      }
    }
  });

  const mouth = getMouthWorldPosition();
  fireLight.position.copy(mouth);
  fireLight.color.setHSL(0.075 + Math.sin(performance.now() * 0.018) * 0.012, 1, 0.56);
  fireLight.intensity = Math.min(10.5, flameCount * 0.15) *
    (0.86 + Math.sin(performance.now() * 0.021) * 0.14) * labFireIntensityMul;

  if (!activeCount && fireTime <= 0) {
    stage.classList.remove('is-breathing');
  }
}

function getMouthWorldPosition() {
  // mouthSocket pattern (Codex рекомендация):
  //   bone.add(mouthSocket); mouthSocket.position = labMouthLocal
  //   mouthSocket.getWorldPosition() — Three.js сам обновляет matrixWorld
  //   во время render, plus вызываем updateMatrixWorld для свежего значения
  //   при вызове ДО render (внутри tick).
  if (useLabMouth && mouthSocket) {
    if (dragonGroup) dragonGroup.updateMatrixWorld(true);
    return mouthSocket.getWorldPosition(new THREE.Vector3());
  }
  // Fallback: lab активен но bone не нашлась → model-root в model-local
  if (useLabMouth && modelSocket && modelSocket.children.length) {
    if (dragonGroup) dragonGroup.updateMatrixWorld(true);
    return modelSocket.children[0].localToWorld(labMouthLocal.clone());
  }
  // Профильный (без lab)
  tmpVec.copy(mouthLocal);
  return modelSocket ? modelSocket.localToWorld(tmpVec.clone()) : dragonGroup.localToWorld(tmpVec.clone());
}

function getDragonForward() {
  // С двумя сокетами: mouth и mouthAhead. Direction = ahead - mouth.
  if (useLabMouth && mouthSocket && mouthAheadSocket) {
    if (dragonGroup) dragonGroup.updateMatrixWorld(true);
    const mouth = mouthSocket.getWorldPosition(new THREE.Vector3());
    const ahead = mouthAheadSocket.getWorldPosition(new THREE.Vector3());
    return ahead.sub(mouth).normalize();
  }
  // Fallback: lab активен но bone не нашлась
  if (useLabMouth && modelSocket && modelSocket.children.length) {
    if (dragonGroup) dragonGroup.updateMatrixWorld(true);
    const model = modelSocket.children[0];
    const mouth = model.localToWorld(labMouthLocal.clone());
    const ahead = model.localToWorld(labMouthLocal.clone().add(labFireDirLocal));
    return ahead.sub(mouth).normalize();
  }
  // Профильный fallback
  const mouth = getMouthWorldPosition();
  tmpVec.copy(mouthLocal).add(fireForwardLocal);
  const ahead = modelSocket ? modelSocket.localToWorld(tmpVec.clone()) : dragonGroup.localToWorld(tmpVec.clone());
  return ahead.sub(mouth).normalize();
}

// Найти bone после загрузки модели + создать mouthSocket-объект.
// Вызывается в installModel ПОСЛЕ modelSocket.add(model).
function resolveLabMouthBone() {
  // Отчистить старое (если перезагружали)
  if (mouthSocket && mouthSocket.parent) mouthSocket.parent.remove(mouthSocket);
  if (mouthAheadSocket && mouthAheadSocket.parent) mouthAheadSocket.parent.remove(mouthAheadSocket);
  labMouthBone = null;
  mouthSocket = null;
  mouthAheadSocket = null;

  const lab = readLabOverrides();
  if (!lab) {
    console.info('[dragon-cinematic] lab settings отсутствуют — fallback на профильный mouthLocal');
    return;
  }
  // ─── modelSourceId validation ──────────────────────────────────
  // Lab сохраняет id источника модели при выборе bone'а. Если main
  // загрузил ДРУГОЙ источник — bone-path может ссылаться на bone, который
  // есть в одной модели и отсутствует/означает другое в другой. Поэтому
  // если sourceId не совпадает, мы НЕ применяем lab-bone — fallback явный.
  if (lab.modelSourceId && activeModelSourceId &&
      lab.modelSourceId !== activeModelSourceId) {
    console.warn(
      '[dragon-cinematic] modelSourceId mismatch:\n' +
      '   lab saved for : "' + lab.modelSourceId + '"\n' +
      '   main loaded   : "' + activeModelSourceId + '"\n' +
      '   → bone-attach НЕ применяется (открой lab → пересохрани mouthBone под текущий source)'
    );
    return;
  }
  if (!lab.mouthBone) {
    console.info('[dragon-cinematic] mouthBone: не задано в lab — fallback на model-root');
    return;
  }
  if (!modelSocket || !modelSocket.children.length) {
    console.warn('[dragon-cinematic] mouthBone "' + lab.mouthBone + '": модель ещё не в socket');
    return;
  }
  const model = modelSocket.children[0];
  const wanted = String(lab.mouthBone).trim();
  const wantedLow = wanted.toLowerCase();
  const allNames = [];
  let exact = null, ci = null;
  model.traverse(o => {
    if (!o || !o.name) return;
    allNames.push(o.name);
    if (!exact && o.name === wanted) exact = o;
    if (!ci && o.name.toLowerCase() === wantedLow) ci = o;
  });
  labMouthBone = exact || ci || null;
  if (!labMouthBone) {
    const hints = allNames.filter(n => n.toLowerCase().includes(wantedLow.slice(0, 4)));
    console.warn(
      '[dragon-cinematic] mouthBone "' + wanted + '" не найдена → fallback на model-root.\n' +
      'Похожие имена: ' + (hints.slice(0, 8).join(', ') || '(нет)')
    );
    return;
  }

  // ─── Создаём mouthSocket — Object3D как child bone'а ───────────
  // Преимущество перед bone.localToWorld(localMouth) каждый кадр:
  //   - Three.js автоматически апдейтит matrixWorld во время render
  //   - mouthSocket.getWorldPosition() всегда возвращает правильную точку
  //   - direction — через второй socket смещённый по labFireDirLocal
  mouthSocket = new THREE.Object3D();
  mouthSocket.name = '__lab_mouthSocket';
  mouthSocket.position.copy(labMouthLocal);
  labMouthBone.add(mouthSocket);

  mouthAheadSocket = new THREE.Object3D();
  mouthAheadSocket.name = '__lab_mouthAheadSocket';
  mouthAheadSocket.position.copy(labMouthLocal).add(labFireDirLocal);
  labMouthBone.add(mouthAheadSocket);

  console.info('[dragon-cinematic] mouth прицеплен:',
    labMouthBone.name,
    labMouthBone.isBone ? '(Bone)' : '(' + (labMouthBone.type || 'Object3D') + ')',
    '· lab mouthLocal:', labMouthLocal.toArray().map(x => x.toFixed(3)).join(', '));
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
  // Stage теперь = full-viewport (100vw × 100vh из CSS). Canvas рендерим
  // в размер viewport'а — это согласовано со `screenToWorld()` который
  // использует window.innerWidth/Height для NDC.
  const width = Math.max(window.innerWidth || 1, 1);
  const height = Math.max(window.innerHeight || 1, 1);
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
  window.CWDragonCinematic = {
    setEnabled, triggerFire, setAnimation, setSettings, getDebugInfo,
    /* Live-tuning API — вызывается из dragon-control-panel.js на каждый
     * input слайдера. applyLabOverrides читает свежий localStorage и
     * обновляет module-level переменные. mouthSocket position обновляется
     * только если он уже создан (bone был найден). При смене bone'а
     * вызывается resolveLabMouthBone(). */
    refreshLabSettings(opts) {
      applyLabOverrides();
      if (mouthSocket) mouthSocket.position.copy(labMouthLocal);
      if (mouthAheadSocket) mouthAheadSocket.position.copy(labMouthLocal).add(labFireDirLocal);
      if (opts && opts.bone) resolveLabMouthBone();
    },
    /* Имена всех bones текущей модели — для dropdown'а в панели */
    getBoneNames() {
      const names = [];
      if (modelSocket && modelSocket.children.length) {
        modelSocket.children[0].traverse(o => {
          if (o && o.name && (o.isBone || o.type === 'Bone')) names.push(o.name);
        });
      }
      return names.sort();
    },
    /* Текущий sourceId загруженной модели — для stamp'а lab.modelSourceId */
    getActiveModelSourceId() { return activeModelSourceId; }
  };
  window.addEventListener('cw-dragon-mode-change', event => {
    setEnabled(event.detail && event.detail.mode === 'cinematic');
  });
  queueMicrotask(() => setEnabled(document.body.classList.contains('dragon-mode-cinematic')));
}
