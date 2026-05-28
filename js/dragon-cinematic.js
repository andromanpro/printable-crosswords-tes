import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

const stage = document.getElementById('dragon-cinematic-stage');
const MODEL_SOURCES = [
  { url: 'assets/models/alduin/source/Ps%20Alduin%20Dragon.glb', label: 'Alduin Sketchfab GLB' },
  { url: 'assets/models/tes-blades-ancient-dragon.glb', label: 'TES Blades Ancient Dragon GLB' },
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

const canAnimate = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader = new GLTFLoader();
const pointer = new THREE.Vector2(0, 0);
const target = new THREE.Vector3(1.45, 1.35, -0.35);
const position = new THREE.Vector3(-2.7, 0.95, -0.25);
const lastPosition = new THREE.Vector3().copy(position);
const forwardAxis = new THREE.Vector3(1, 0, 0);
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
let fireLight = null;
let dragonGlow = null;
let fireOverlay = null;
let ashPoints = null;
let ashSeeds = [];
let firePoints = null;
let fireMaterial = null;
let fireParticles = [];
let fallbackParts = {};
let targetTimer = 0;
let fireCooldown = 5.5;
let fireTime = 0;

function setEnabled(next) {
  enabled = Boolean(next && stage && canAnimate);
  if (!stage) return;

  stage.classList.toggle('is-enabled', enabled);
  if (!enabled) {
    stop();
    stage.classList.remove('is-breathing');
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

  fireOverlay = document.createElement('div');
  fireOverlay.className = 'dragon-fire-burst';
  fireOverlay.setAttribute('aria-hidden', 'true');
  stage.appendChild(fireOverlay);

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
  createFallbackDragon();
  loadDragonModel();
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
  const count = 120;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    positions[p] = 999;
    positions[p + 1] = 999;
    positions[p + 2] = 999;
    colors[p] = 1;
    colors[p + 1] = 0.35;
    colors[p + 2] = 0.05;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  fireMaterial = new THREE.PointsMaterial({
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  firePoints = new THREE.Points(geometry, fireMaterial);
  fireParticles = Array.from({ length: count }, () => ({
    active: false,
    age: 0,
    life: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3()
  }));
  scene.add(firePoints);
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
      const gltf = await loader.loadAsync(source.url);
      installModel(gltf, source.label);
      return;
    } catch (error) {
      console.warn('[dragon-cinematic] Model failed:', source.url, error);
    }
  }
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

function installModel(gltf, label) {
  modelSocket.clear();
  modelSocket.position.set(0, 0, 0);
  modelSocket.rotation.set(0, 0, 0);
  modelSocket.scale.setScalar(1);
  fallbackParts = {};
  mixer = null;

  const model = gltf.scene;
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
  const scale = 3.45 / Math.max(size.x, size.y, size.z, 1);

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.rotation.y = Math.PI / 2;
  modelSocket.add(model);

  const clips = gltf.animations || [];
  const clip = clips.find(c => /fly|hover|flight|soar/i.test(c.name)) ||
    clips.find(c => /idle|stand/i.test(c.name)) ||
    clips[0];
  if (clip) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat).fadeIn(0.25).play();
  }

  stage.classList.remove('is-fallback');
  stage.classList.add('has-model');
  stage.dataset.model = label;
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

  if (mixer) mixer.update(dt);
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
    screenToWorld(window.innerWidth * 0.08, window.innerHeight * 0.28, -0.4),
    screenToWorld(window.innerWidth * 0.92, window.innerHeight * 0.22, -0.8),
    screenToWorld(window.innerWidth * 0.84, window.innerHeight * 0.78, -0.2),
    screenToWorld(window.innerWidth * 0.16, window.innerHeight * 0.72, 0.2)
  ];

  ['#grid-container', '#clues-container', '.app-title', '.controls'].forEach((selector, index) => {
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
  if (!initialized || !dragonGroup || !firePoints) return;

  fireTime = 1.15;
  spawnFire();
  updateFireOverlay(1);
  stage.classList.remove('is-breathing');
  void stage.offsetWidth;
  stage.classList.add('is-breathing');
  window.setTimeout(() => stage.classList.remove('is-breathing'), 1350);
}

function spawnFire() {
  const mouth = getMouthWorldPosition();
  const dir = getDragonForward();
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(dragonGroup.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  fireParticles.forEach((particle, i) => {
    const spread = (Math.random() - 0.5) * 0.48;
    const lift = (Math.random() - 0.34) * 0.55;
    particle.active = true;
    particle.age = Math.random() * -0.08;
    particle.life = THREE.MathUtils.randFloat(0.62, 1.22);
    particle.pos.copy(mouth)
      .addScaledVector(dir, Math.random() * 0.22)
      .addScaledVector(side, spread * 0.22)
      .addScaledVector(up, lift * 0.18);
    particle.vel.copy(dir).multiplyScalar(THREE.MathUtils.randFloat(3.3, 5.8))
      .addScaledVector(side, spread)
      .addScaledVector(up, lift);

    const p = i * 3;
    firePoints.geometry.attributes.position.array[p] = particle.pos.x;
    firePoints.geometry.attributes.position.array[p + 1] = particle.pos.y;
    firePoints.geometry.attributes.position.array[p + 2] = particle.pos.z;
  });
}

function updateFire(dt) {
  if (!firePoints) return;

  fireTime = Math.max(0, fireTime - dt);

  const posAttr = firePoints.geometry.attributes.position;
  const colorAttr = firePoints.geometry.attributes.color;
  const pos = posAttr.array;
  const colors = colorAttr.array;
  let activeCount = 0;

  fireParticles.forEach((particle, i) => {
    const p = i * 3;
    if (!particle.active) {
      pos[p] = 999;
      pos[p + 1] = 999;
      pos[p + 2] = 999;
      return;
    }

    particle.age += dt;
    if (particle.age < 0) return;
    if (particle.age >= particle.life) {
      particle.active = false;
      pos[p] = 999;
      pos[p + 1] = 999;
      pos[p + 2] = 999;
      return;
    }

    activeCount++;
    const k = particle.age / particle.life;
    particle.vel.multiplyScalar(1 - dt * 0.24);
    particle.vel.y += dt * 0.34;
    particle.pos.addScaledVector(particle.vel, dt);

    pos[p] = particle.pos.x;
    pos[p + 1] = particle.pos.y;
    pos[p + 2] = particle.pos.z;

    colors[p] = 1;
    colors[p + 1] = THREE.MathUtils.lerp(0.82, 0.18, k);
    colors[p + 2] = THREE.MathUtils.lerp(0.08, 0.015, k);
  });

  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  fireMaterial.opacity = Math.min(0.95, activeCount / 22);

  const mouth = getMouthWorldPosition();
  fireLight.position.copy(mouth);
  fireLight.intensity = Math.min(5.6, activeCount * 0.09);
  updateFireOverlay(activeCount);

  if (!activeCount && fireTime <= 0) {
    stage.classList.remove('is-breathing');
  }
}

function getMouthWorldPosition() {
  tmpVec.set(1.82, 0.05, 0);
  return dragonGroup.localToWorld(tmpVec.clone());
}

function getDragonForward() {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(dragonGroup.quaternion).normalize();
}

function updateFireOverlay(activeCount) {
  if (!fireOverlay || !camera) return;

  if (!activeCount) {
    fireOverlay.style.opacity = '0';
    return;
  }

  const mouth = getMouthWorldPosition();
  const dir = getDragonForward();
  const tip = mouth.clone().addScaledVector(dir, 2.4);
  const mouthNdc = mouth.clone().project(camera);
  const tipNdc = tip.clone().project(camera);
  const width = stage.clientWidth || window.innerWidth || 1;
  const height = stage.clientHeight || window.innerHeight || 1;
  const x = (mouthNdc.x * 0.5 + 0.5) * width;
  const y = (-mouthNdc.y * 0.5 + 0.5) * height;
  const tipX = (tipNdc.x * 0.5 + 0.5) * width;
  const tipY = (-tipNdc.y * 0.5 + 0.5) * height;
  const angle = Math.atan2(tipY - y, tipX - x);
  const power = Math.min(1, Math.max(0.22, activeCount / fireParticles.length));

  fireOverlay.style.left = x + 'px';
  fireOverlay.style.top = y + 'px';
  fireOverlay.style.opacity = String(0.58 + power * 0.26);
  fireOverlay.style.transform = `translate(-3%, -50%) rotate(${angle}rad) scale(${0.52 + power * 0.3}, ${0.58 + power * 0.18})`;
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
  window.CWDragonCinematic = { setEnabled, triggerFire };
  window.addEventListener('cw-dragon-mode-change', event => {
    setEnabled(event.detail && event.detail.mode === 'cinematic');
  });
  queueMicrotask(() => setEnabled(document.body.classList.contains('dragon-mode-cinematic')));
}
