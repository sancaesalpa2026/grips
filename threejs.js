import Lenis from 'https://unpkg.com/lenis@1.3.23/dist/lenis.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// #region Helpers
const wrap = (value, min, max) => { const size = max - min; value = value % size; if (value < 0) value += size; return value + min; };
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const round = (value, step) => Math.round(value / step) * step;
const toArray = (item) => { if (Array.isArray(item)) return item; if (item instanceof NodeList || item instanceof HTMLCollection) return Array.from(item); else return [item]; };
const on = (els, events, callback) => { if (typeof els === 'string' || els instanceof String) els = document.querySelectorAll(els); toArray(els).forEach((el) => { events.split(' ').forEach((event) => { if (typeof el === 'object' && el.hasOwnProperty(event) && el[event].connect) el[event].connect(callback); else el.addEventListener(event, callback); }); }); };
const signal = () => { const callbacks = []; const connect = (callback) => callbacks.push(callback); const disconnect = (callback) => callbacks.splice(callbacks.indexOf(callback), 1); const emit = (data) => callbacks.forEach((callback) => callback(data)); return { connect, disconnect, emit }; };
function debounce(callback, limit, isImmediate = false) { var timeout; return function () { var context = this, args = arguments; var later = function () { timeout = null; if (!isImmediate) callback.apply(context, args); }; var callNow = isImmediate && !timeout; clearTimeout(timeout); timeout = setTimeout(later, limit); if (callNow) callback.apply(context, args); }; }
const closest = (items, goal, map, check) => { let dist = Infinity; let index = -1; if (!check) check = (goal, value, dist) => Math.abs(value - goal) < Math.abs(dist - goal); items.forEach((value, i) => { if (map) value = map(value); if (check(goal, value, dist)) { dist = value; index = i; } }); return { diff: Math.abs(goal - dist), index }; };
// #endregion Helpers

// #region WebGL Check & Fallback
const checkWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) { return false; }
};

if (!checkWebGL()) {
  console.warn("⚠️ WebGL no soportado. Cargando página en modo 2D ligero.");
  // Mockeamos el carrusel para que el HTML no se rompa
  window.carousel = { index: 0, changed: signal(), next: () => {}, previous: () => {}, goTo: () => {} };
  window.loader = { play: () => Promise.resolve() };
  window.dispatchEvent(new CustomEvent('carousel:ready'));
  throw new Error("WebGL no disponible - Abortando Three.js");
}
// #endregion WebGL Check

// #region Device Profile
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const lowPower = isIOS || window.innerWidth < 1024;
// #endregion Device Profile

// #region Setup
const lenis = new Lenis({ autoRaf: false, infinite: true, syncTouch: true });
window.lenis = lenis;
// #endregion Setup

// #region Scroll
const scroll = { position: 0 };
scroll.wrapped = (position) => wrap(position, 0, lenis.dimensions.scrollHeight - lenis.dimensions.height);
scroll.to = (pos, options) => { if (pos !== 0) pos -= 10; lenis.scrollTo(pos, options); };
scroll.distanceTo = (target, position = scroll.position) => { const min = position; const max = position - lenis.dimensions.scrollHeight + lenis.dimensions.height; if (Math.abs(max - target) < Math.abs(min - target)) return Math.abs(max - target); else return Math.abs(min - target); };
lenis.on('scroll', (e) => { scroll.position = scroll.wrapped(lenis.animatedScroll); });
scroll.snap = (position = scroll.position) => { if (window.innerWidth < 1024) return; const found = closest(section.items, position, (item) => item.top); if (found.index >= 0 && section.items[found.index].snap) scroll.to(section.items[found.index].top); else if (scroll.distanceTo(section.items[0].top, position) < section.items[0].height / 2) scroll.to(section.items[0].top); };
on(window, 'scroll', debounce(() => scroll.snap(), 250));
on(window, 'scrollend', debounce(() => scroll.snap(), 50));
// #endregion Scroll

// #region Carousel State
const canLabels = ['sabor1', 'sabor2'];
const cans = [];
const GLOW_COLORS = [0xe5ceb0, 0x8b4e1f];

let carousel = { spacing: 4.6, target: 0, position: 0, index: 0, lastIndex: 0, lastPosition: 0, delta: 0, offset: 0 };
carousel.getRounded = () => round(carousel.target + carousel.offset, carousel.spacing) - carousel.offset;
carousel.getIndex = (wrapped = true) => { const index = round((carousel.position + carousel.offset) / carousel.spacing, 1); if (wrapped) return wrap(index, 0, canLabels.length); return index; };
carousel.goTo = (index) => { carousel.target = index * carousel.spacing - carousel.offset; };
carousel.previous = () => { carousel.goTo(carousel.getIndex(false) - 1); };
carousel.next = () => { carousel.goTo(carousel.getIndex(false) + 1); };
carousel.changed = signal();
carousel.indexChanged = carousel.changed;
window.carousel = carousel;
// #endregion Carousel State

// #region Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.1, 1000);
// #endregion Camera

// #region Renderer
const mainEl = document.querySelector('main');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
let pixelRatio = lowPower ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(pixelRatio);
renderer.setClearColor(0x000000, 0);
THREE.ColorManagement.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
mainEl.appendChild(renderer.domElement);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
// #endregion Renderer

// #region Environment
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const hdriLoader = new RGBELoader();
hdriLoader.load('./hdri2.hdr', function (texture) {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  texture.dispose();
  scene.environment = envMap;
});
// #endregion Environment

// #region Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xffffff, 0x111116, 0.6);
hemi.position.set(0, 15, 0);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xfff7ea, 1.2);
keyLight.position.set(0, 3, 10);
scene.add(keyLight);
const rimLeft = new THREE.DirectionalLight(0xffffff, 1.6);
rimLeft.position.set(-10, 2, 2);
scene.add(rimLeft);
const rimRight = new THREE.DirectionalLight(0xffffff, 1.6);
rimRight.position.set(10, 2, 2);
scene.add(rimRight);

const spot1 = new THREE.SpotLight(0xffffff, 4, 16, Math.PI / 4, 0.8, 0.5);
spot1.position.set(0, 5, 4);
spot1.target.position.set(0, 0, 0);
scene.add(spot1); scene.add(spot1.target);

const spot2 = new THREE.SpotLight(0xffffff, 3, 14, Math.PI / 3, 0.8, 0.5);
spot2.position.set(0, -4, 3);
spot2.target.position.set(0, 0, 0);
scene.add(spot2); scene.add(spot2.target);

const spot3 = new THREE.SpotLight(0xffffff, 0, 15, Math.PI / 8, 1, 0.1);
spot3.position.set(0, 3, 5);
spot3.target.position.set(0, 0.5, 0);
scene.add(spot3); scene.add(spot3.target);

const rimColorBack = new THREE.PointLight(GLOW_COLORS[0], 15, 14, 1.8);
rimColorBack.position.set(0, 0.5, -2.5);
scene.add(rimColorBack);

const glowCanvas = document.createElement('canvas');
glowCanvas.width = 512; glowCanvas.height = 512;
const gCtx = glowCanvas.getContext('2d');
const radialGrad = gCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
radialGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
radialGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
radialGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.04)');
radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
gCtx.fillStyle = radialGrad; gCtx.fillRect(0, 0, 512, 512);

const glowTex = new THREE.CanvasTexture(glowCanvas);
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(GLOW_COLORS[0]), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
const glowSprite = new THREE.Sprite(glowMat);
glowSprite.scale.set(11, 7.5, 1); glowSprite.position.set(0, 0.2, -1.8);
scene.add(glowSprite);
// #endregion Lights

// #region Base & Models
const gltfLoader = new GLTFLoader();
const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.25, envMapIntensity: 0.45 });
const baseGltf = await gltfLoader.loadAsync('./base.glb');
baseGltf.scene.traverse((child) => { if (child.isMesh) child.material = baseMaterial; });
const base = baseGltf.scene;
scene.add(base);

async function loadModel(ruta) {
  const gltf = await gltfLoader.loadAsync(ruta);
  const group = new THREE.Group();
  gltf.scene.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.envMapIntensity = 0.55;
      child.material.roughness = Math.max(child.material.roughness || 0.4, 0.4);
      child.material.needsUpdate = true;
    }
  });
  group.add(gltf.scene);
  return group;
}

const saboresData = await Promise.all(['./canfrente1.glb', './canfrente2.glb'].map(loadModel));
const saboresAtrasData = await Promise.all(['./canatras1.glb', './canatras2.glb'].map(async (ruta, i) => {
  try { return await loadModel(ruta); } catch (e) { return saboresData[i].clone(true); }
}));

const targetCount = lowPower ? 10 : 18; // Reducido para evitar lag
for (let i = 0; i < targetCount; i++) {
  const clone = saboresData[i % saboresData.length].clone(true);
  scene.add(clone);
  cans.push(clone);
}

const backCan = new THREE.Group();
saboresAtrasData.forEach((item, idx) => { item.visible = (idx === 0); backCan.add(item); });
backCan.visible = false;
scene.add(backCan);
// #endregion Base & Models

// #region Sections
const section = { items: [] };
section.getIndex = () => closest(section.items, scroll.position, (item) => item.top).index;
section.resize = () => { section.items.length = 0; let top = 0; document.querySelectorAll('section').forEach((el, i) => { const height = el.clientHeight; let snap = i < 2; if (window.innerWidth < 1024) snap = i < 6; section.items.push({ el, top, height, snap }); top += height; }); };
section.resize();
// #endregion Sections

// #region Swipe & Pointer
const swipe = { active: true, holding: false, startX: 0, startY: 0, lastX: 0, lastY: 0, deltaX: 0, deltaY: 0, direction: 0 };
const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, smoothX: window.innerWidth / 2, smoothY: window.innerHeight / 2, prevent: true };

on(renderer.domElement, 'mousedown touchstart', (e) => { if (!swipe.active || pointer.prevent) return; swipe.holding = true; swipe.deltaX = 0; const x = e.touches ? e.touches[0].clientX : e.clientX; swipe.startX = swipe.lastX = x; swipe.startY = swipe.lastY = (e.touches ? e.touches[0].clientY : e.clientY); });
on(window, 'mousemove touchmove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; if (!swipe.active || !swipe.holding || pointer.prevent) return; const x = e.touches ? e.touches[0].clientX : e.clientX; const dx = x - swipe.lastX; if (swipe.direction == 0 && Math.abs(swipe.startX - x) > 2) swipe.direction = 1; if (swipe.direction == 1) { swipe.lastX = x; swipe.deltaX += dx; lenis.stop(); } });
on(window, 'mouseup touchend', () => { if (!swipe.holding) return; setTimeout(() => { swipe.deltaX *= 8; swipe.holding = false; swipe.direction = 0; lenis.start(); }); });
// #endregion Swipe & Pointer

// #region Timeline
const data = { camPosX: 0, camPosY: 0, camPosZ: 29, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 20, canScale: 1, canPosX: 0, canPosY: 0, canPosZ: 0, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 1, wave: 1, swirl: 0, baseOffset: 0, lightIntensity: 50, lightWidth: 1, tintStrength: 1, spotIntensity: 0, spotY: 3, pointerInfluence: 0.2, swipeSpeed: 1 };
const startData = JSON.parse(JSON.stringify(data));

const createTimeline = () => {
  let i = 0;
  const tl = gsap.timeline({ defaults: { ease: 'power1.inOut' } });
  const d = (idx) => section.items[idx] ? section.items[idx].height / lenis.dimensions.scrollHeight : 1;

  tl.to(data, { camPosZ: 6, fov: 40, canPosX: 0.5, canPosY: -0.5, spacing: 3.5, wave: 0, baseOffset: 3, lightIntensity: 30, duration: d(i++) });
  tl.set(swipe, { active: false });
  
  for(let j=1; j<=4; j++) {
    const sign = j % 2 === 0 ? 1 : -1;
    tl.to(data, { camPosY: -2, camPosZ: 12, camRotX: (Math.PI/180)*10, camRotZ: (Math.PI/180)*8*sign, canPosY: -0.6 + (j*0.35), canRotY: (Math.PI/180)*12*sign, canRotZ: (Math.PI/180)*6*sign, fov: 20, spacing: 2.2, wave: 0, lightIntensity: 0, tintStrength: 0.2, spotIntensity: 35, spotY: 2.2, pointerInfluence: 0, duration: d(i++) });
  }

  tl.to(data, { camPosY: 0, camPosZ: 8, camRotX: 0, camRotZ: 0, fov: 45, canPosY: 0, canPosZ: -0.5, canRotY: 0, canRotZ: 0, spacing: 3.2, lightIntensity: 45, lightWidth: 1.5, tintStrength: 2, spotIntensity: 0, pointerInfluence: 0.2, duration: d(i++) });
  tl.set(swipe, { active: true });
  
  tl.to(data, { camPosX: -3, camPosY: -3.5, camPosZ: 20, fov: 30, canPosZ: -0.4, spacing: 0.85, swirl: 1, baseOffset: 20, lightIntensity: 10, lightWidth: 3, pointerInfluence: 0, duration: d(i++) });
  tl.to(data, { camPosX: 0, camPosY: -5.5, camPosZ: 10, spacing: 0.55, lightIntensity: 0, duration: d(i++) });
  tl.set(swipe, { active: false });
  
  tl.set(data, { camPosY: 8, camPosZ: 10, spacing: 5, swirl: 0 });
  tl.to(data, { camPosY: 0, camPosZ: 29, canPosZ: 0.5, spacing: 5, baseOffset: 10, lightIntensity: 50, duration: d(i++) });
  tl.to(data, { ...startData, duration: d(i) });
  tl.pause();
  return tl;
};
let timeline = createTimeline();
// #endregion Timeline

// #region Loader
const loader = { play: async () => {
  if (!timeline) return;
  lenis.scrollTo(0, { immediate: true }); lenis.stop();
  document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
  carousel.target = carousel.offset; carousel.position = carousel.offset;
  
  const tl = gsap.timeline({ defaults: { ease: 'power4.out', duration: 2.5 } });
  tl.set(data, { camPosZ: 25, spacing: 10, baseOffset: 3, wave: 0, swirl: 0, lightWidth: 2, lightIntensity: 0 });
  tl.to(data, { lightIntensity: 30 }, 0);
  tl.to(data, { camPosZ: 29 }, 1);
  tl.to(data, startData, 2);
  
  await new Promise((res) => setTimeout(res, 2500));
  lenis.start(); document.documentElement.style.overflow = ''; document.body.style.overflow = '';
  pointer.prevent = false; swipe.active = true;
  loopGuard.lastPos = scroll.position; loopGuard.snapping = false;
}};
window.loader = loader;
// #endregion Loader

// #region Animation
const animation = { paused: false };
const loopGuard = { lastPos: 0, snapping: false, timer: null };
let time = 0;

function animate(tick = 0) {
  var delta = tick / 1000 - time;
  requestAnimationFrame(animate);
  time = tick / 1000;

  if (lenis.targetScroll < 0) { lenis.targetScroll = 0; lenis.animatedScroll = 0; }
  lenis.raf(time * 1000);

  if (pointer.prevent) loopGuard.lastPos = scroll.position;
  else {
    const total = lenis.dimensions.scrollHeight - lenis.dimensions.height;
    if (total > 0 && loopGuard.lastPos - scroll.position > total * 0.6 && !loopGuard.snapping) {
      loopGuard.snapping = true;
      scroll.to(section.items[0].top, { duration: 1.2, lock: true, easing: (t) => 1 - Math.pow(1 - t, 3) });
      clearTimeout(loopGuard.timer);
      loopGuard.timer = setTimeout(() => (loopGuard.snapping = false), 1300);
    }
    loopGuard.lastPos = scroll.position;
  }

  const minX = cans.length * -0.5 * carousel.spacing;
  const maxX = cans.length * 0.5 * carousel.spacing;

  carousel.target -= swipe.deltaX * 0.02 * data.swipeSpeed;
  swipe.deltaX = 0;

  pointer.smoothX = lerp(pointer.smoothX, pointer.x, delta * 10);
  pointer.smoothY = lerp(pointer.smoothY, pointer.y, delta * 10);

  if (!animation.paused) { if (!swipe.holding) carousel.target = carousel.getRounded(carousel.target); carousel.position = lerp(carousel.position, carousel.target, delta * 10); }

  camera.fov = data.fov; camera.updateProjectionMatrix();

  const index = carousel.getIndex();
  if (index !== carousel.lastIndex) { carousel.changed.emit({ index, previous: carousel.lastIndex }); carousel.lastIndex = index; }
  carousel.index = index;

  const targetColor = new THREE.Color(GLOW_COLORS[index % GLOW_COLORS.length]);
  rimColorBack.color.lerp(targetColor, 0.08);
  glowMat.color.lerp(targetColor, 0.08);
  const pulse = 1 + Math.sin(time * 2.2) * 0.04;
  glowSprite.scale.set(11 * pulse, 7.5 * pulse, 1);

  const p0 = clamp(scroll.distanceTo(0) / section.items[0].height, 0, 1);
  timeline.seek(scroll.position / lenis.dimensions.scrollHeight);

  const windowRatio = clamp(1440 / lenis.dimensions.scrollWidth, 1, 2.4);
  const wave = windowRatio * 0.25 * (1 - p0) * data.wave;
  const arcRadius = 18.0;
  const currentSecIndex = section.getIndex();
  const isDetail = (currentSecIndex >= 1 && currentSecIndex <= 4);
  const isFaq = (currentSecIndex >= 5);

  if (isDetail) {
    cans.forEach((c) => (c.visible = false)); glowSprite.visible = false;
    backCan.visible = true;
    const selected = wrap(carousel.getIndex(true), 0, saboresAtrasData.length);
    saboresAtrasData.forEach((item, idx) => { item.visible = (idx === selected); });

    backCan.position.set(data.canPosX, data.canPosY, data.canPosZ);
    backCan.rotation.set(data.canRotX, data.canRotY, data.canRotZ);
    const s = data.canScale; backCan.scale.set(s, s, s);
    backCan.rotation.y += (pointer.smoothX / 1280) * data.pointerInfluence;
    backCan.rotation.x += (pointer.smoothY / 1280) * data.pointerInfluence;
  } else {
    backCan.visible = false; glowSprite.visible = !isFaq;
    cans.forEach((can, i) => {
      can.visible = true;
      const x = wrap(i * carousel.spacing - carousel.position, minX, maxX);
      let p = clamp(1 - Math.abs(x) / carousel.spacing, 0, 1);
      
      if (isFaq) {
        can.position.set(x * data.spacing * 0.82, (x * -0.22) * data.swirl, (x * -0.45) * data.swirl);
        can.rotation.set((x * 0.05 * windowRatio + 0.15) * data.swirl, (x * 0.02) * data.swirl, (Math.PI / 180) * -15 * data.swirl);
        const s = data.canScale; can.scale.set(s, s, s);
      } else {
        const angle = (x / arcRadius);
        can.position.x = Math.sin(angle) * arcRadius * data.spacing;
        can.position.z = (Math.cos(angle) - 1.0) * arcRadius * 1.35 * data.wave;
        can.position.y = Math.sin(can.position.x * wave);
        can.rotation.x = lerp((-Math.PI / 180) * 12 * data.wave, x * 0.04 * windowRatio + 0.1, data.swirl);
        can.rotation.y = -angle * data.wave;
        can.rotation.z = 0;
        const s = lerp(1.0, data.canScale, p0); can.scale.set(s, s, s);
        can.rotation.y += (pointer.smoothX / 1280) * data.pointerInfluence * p;
        can.rotation.x += (pointer.smoothY / 1280) * data.pointerInfluence * p;
      }
    });
  }

  base.children[0].position.y = -1 * data.baseOffset;
  base.children[1].position.y = 1 * data.baseOffset;

  camera.position.set(data.camPosX, data.camPosY, data.camPosZ);
  camera.rotation.set(data.camRotX, data.camRotY, data.camRotZ);

  spot1.intensity = data.lightIntensity * 0.12; spot1.angle = (Math.PI / 4) * data.lightWidth;
  spot2.intensity = data.lightIntensity * 0.12; spot2.angle = (Math.PI / 4) * data.lightWidth;
  spot3.intensity = data.spotIntensity; spot3.position.set(0, data.spotY, 2); spot3.target.position.set(0, data.spotY - 2.5, 0);

  // Renderizado directo (SIN post-procesado para evitar lag)
  renderer.render(scene, camera);
  carousel.lastPosition = carousel.position;
}
// #endregion Animation

// #region Resize & Start
animate();
let lastResizeWidth = window.innerWidth;
on(window, 'resize', () => { if (window.innerWidth === lastResizeWidth) return; lastResizeWidth = window.innerWidth; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); section.resize(); timeline = createTimeline(); });
lenis.scrollTo(0, { immediate: true });

// Disparar evento para que el HTML sepa que Three.js cargó
window.dispatchEvent(new CustomEvent('carousel:ready', { detail: carousel }));
// #endregion Resize & Start
