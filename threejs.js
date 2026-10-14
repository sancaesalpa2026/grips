import Lenis from 'https://unpkg.com/lenis@1.3.23/dist/lenis.mjs';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// #region Helpers
const wrap = (value, min, max) => { const size = max - min; value = value % size; if (value < 0) value += size; return value + min; };
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const round = (value, step) => Math.round(value / step) * step;
const toArray = (item) => { if (Array.isArray(item)) return item; if (item instanceof NodeList || item instanceof HTMLCollection) return Array.from(item); else return [item]; };
const on = (els, events, callback) => { if (typeof els === 'string' || els instanceof String) els = document.querySelectorAll(els); toArray(els).forEach((el) => { events.split(' ').forEach((event) => { if (typeof el === 'object' && el.hasOwnProperty(event) && el[event].connect) el[event].connect(callback); else el.addEventListener(event, callback); }); }); };
const off = (els, events, callback) => { if (typeof els === 'string' || els instanceof String) els = document.querySelectorAll(els); toArray(els).forEach((el) => { events.split(' ').forEach((event) => { if (typeof el === 'object' && el.hasOwnProperty(event) && el[event].disconnect) el[event].disconnect(callback); el.removeEventListener(event, callback); }); }); };
const signal = () => { const callbacks = []; const connect = (callback) => callbacks.push(callback); const disconnect = (callback) => callbacks.splice(callbacks.indexOf(callback), 1); const emit = (data) => callbacks.forEach((callback) => callback(data)); return { connect, disconnect, emit }; };
function debounce(callback, limit, isImmediate = false) { var timeout; return function () { var context = this, args = arguments; var later = function () { timeout = null; if (!isImmediate) callback.apply(context, args); }; var callNow = isImmediate && !timeout; clearTimeout(timeout); timeout = setTimeout(later, limit); if (callNow) callback.apply(context, args); }; }
const closest = (items, goal, map, check) => { let dist = Infinity; let index = -1; if (!check) check = (goal, value, dist) => Math.abs(value - goal) < Math.abs(dist - goal); items.forEach((value, i) => { if (map) value = map(value); if (check(goal, value, dist)) { dist = value; index = i; } }); return { diff: Math.abs(goal - dist), index }; };
// #endregion Helpers

// #region Device Profile
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const lowPower = isIOS || window.innerWidth < 1024;
// #endregion Device Profile

// #region Setup
const app = { ready: signal() };
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
let pixelRatio = lowPower ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.5);
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

// #region Material Factory
const makeMaterial = (params) => {
  if (lowPower) { const { clearcoat, clearcoatRoughness, sheen, sheenRoughness, sheenColor, ior, reflectivity, ...std } = params; return new THREE.MeshStandardMaterial(std); }
  return new THREE.MeshPhysicalMaterial(params);
};
// #endregion Material Factory

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
glowCanvas.width = 512;
glowCanvas.height = 512;
const gCtx = glowCanvas.getContext('2d');
const radialGrad = gCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
radialGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
radialGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
radialGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.04)');
radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
gCtx.fillStyle = radialGrad;
gCtx.fillRect(0, 0, 512, 512);

const glowTex = new THREE.CanvasTexture(glowCanvas);
const glowMat = new THREE.SpriteMaterial({
  map: glowTex,
  color: new THREE.Color(GLOW_COLORS[0]),
  transparent: true,
  opacity: 0.32,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const glowSprite = new THREE.Sprite(glowMat);
glowSprite.scale.set(11, 7.5, 1);
glowSprite.position.set(0, 0.2, -1.8);
scene.add(glowSprite);

const renderPass = new RenderPass(scene, camera);
// #endregion Lights

// #region Passes
const resolution = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
const bloomPass = new UnrealBloomPass(resolution, 0.22, 0.65, 0.85);
const smaaPass = new SMAAPass();
const outputPass = new OutputPass();
// #endregion Passes

// #region Composers
const finalRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio, { type: lowPower ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: 0 });
const finalComposer = new EffectComposer(renderer, finalRenderTarget);
finalComposer.addPass(renderPass);
if (!lowPower) finalComposer.addPass(bloomPass);
finalComposer.addPass(outputPass);
if (!lowPower) finalComposer.addPass(smaaPass);
// #endregion Composers

// #region Base
const gltfLoader = new GLTFLoader();
const baseMaterial = makeMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.25, reflectivity: 1, envMapIntensity: 0.45 });
const baseGltf = await gltfLoader.loadAsync('./base.glb');
baseGltf.scene.traverse((child) => { if (!child.isMesh) return; child.material = baseMaterial; });
const base = baseGltf.scene;
scene.add(base);
// #endregion Base

// #region Cans / Bars
const sabores = ['./canfrente1.glb', './canfrente2.glb'];
const saboresAtrasRutas = ['./canatras1.glb', './canatras2.glb'];

async function loadModel(ruta) {
  const gltf = await gltfLoader.loadAsync(ruta);
  const group = new THREE.Group();
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    if (child.material) {
      child.material.envMapIntensity = 0.55;
      child.material.roughness = Math.max(child.material.roughness || 0.4, 0.4);
      child.material.needsUpdate = true;
    }
  });
  group.add(gltf.scene);
  return group;
}

// 1. Cargamos modelos de frente (sabor 1 y sabor 2)
const saboresData = [];
for (const ruta of sabores) {
  saboresData.push(await loadModel(ruta));
}

// 2. Cargamos modelos traseros (ingredientes sabor 1 y sabor 2)
const saboresAtrasData = [];
for (const ruta of saboresAtrasRutas) {
  try {
    const loaded = await loadModel(ruta);
    saboresAtrasData.push(loaded);
  } catch (err) {
    saboresAtrasData.push(saboresData[saboresAtrasData.length].clone(true));
  }
}

// 3. CARRUSEL Y FAQ: Usan EXCLUSIVAMENTE los frentes (canfrente1 y canfrente2)
const targetCount = lowPower ? 12 : 24;
for (let i = 0; i < targetCount; i++) {
  const template = saboresData[i % saboresData.length];
  const clone = template.clone(true);
  scene.add(clone);
  cans.push(clone);
}

// 4. DETALLE DE INGREDIENTES: Usa EXCLUSIVAMENTE los reversos (canatras1 y canatras2)
const backCan = new THREE.Group();
saboresAtrasData.forEach((item, idx) => {
  item.visible = (idx === 0);
  backCan.add(item);
});
backCan.visible = false;
scene.add(backCan);
// #endregion Cans / Bars

// #region Raycaster
const raycast = new THREE.Raycaster();
on(window, 'click', (e) => {
  if (pointer.prevent || swipe.direction != 0 || scroll.position > section.items[1].top) return;
  const mouse = new THREE.Vector2();
  mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
  mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;
  raycast.setFromCamera(mouse, camera);
  cans.forEach((can) => {
    if (raycast.intersectObject(can, true).length > 0) {
      const delta = Math.round(can.position.x / carousel.spacing);
      if (delta > 0) carousel.next();
      if (delta < 0) carousel.previous();
      if (delta == 0) scroll.to(section.items[1].top, { duration: wheelPager.slowIndexes.includes(0) ? wheelPager.durationSlow : wheelPager.durationFast, easing: (t) => 1 - Math.pow(1 - t, 3) });
    }
  });
});
// #endregion Raycaster

// #region Cursor
const isInGamme = () => scroll.position < section.items[1].top;
on(window, 'mousemove', (e) => {
  if (!isInGamme()) { document.body.style.cursor = ''; return; }
  if (swipe.holding && swipe.direction === 1) { document.body.style.cursor = 'grabbing'; return; }
  const mouse = new THREE.Vector2();
  mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
  mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;
  raycast.setFromCamera(mouse, camera);
  let hoverActive = false;
  cans.forEach((can) => {
    if (raycast.intersectObject(can, true).length > 0) {
      const delta = Math.round(can.position.x / carousel.spacing);
      if (delta === 0) hoverActive = true;
    }
  });
  document.body.style.cursor = hoverActive ? 'pointer' : 'grab';
});
on(window, 'mouseup touchend', () => { if (isInGamme()) document.body.style.cursor = 'grab'; });
// #endregion Cursor

// #region Sections
const section = { items: [] };
section.getIndex = () => closest(section.items, scroll.position, (item) => item.top).index;
section.previous = () => section.goTo(section.getIndex() - 1);
section.next = () => section.goTo(section.getIndex() + 1);
section.goTo = (index) => scroll.to(section.items[index % (section.items.length - 1)].top);
section.resize = () => { section.items.length = 0; let top = 0; document.querySelectorAll('section').forEach((el, i) => { const height = el.clientHeight; let snap = i < 2; if (window.innerWidth < 1024) snap = i < 6; section.items.push({ el, top, height, snap }); top += height; }); };
section.resize();
// #endregion Sections

// #region Swipe State
const swipe = { active: true, holding: false, startX: 0, startY: 0, lastX: 0, lastY: 0, deltaX: 0, deltaY: 0, direction: 0 };
// #endregion Swipe State

// #region Timeline
const data = { camPosX: 0, camPosY: 0, camPosZ: 29, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 20, canScale: 1, canPosX: 0, canPosY: 0, canPosZ: 0, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 1, wave: 1, swirl: 0, baseOffset: 0, lightIntensity: 50, lightWidth: 1, tintStrength: 1, spotIntensity: 0, spotY: 3, pointerInfluence: 0.2, swipeSpeed: 1 };
const startData = JSON.parse(JSON.stringify(data));

const createTimeline = () => {
  let i = 0;
  const tl = gsap.timeline({ defaults: { ease: 'power1.inOut' } });
  
  // Section 0 -> 1: Inicio a detalle
  tl.to(data, { camPosX: 0, camPosY: 0, camPosZ: 6, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 40, canScale: 1, canPosX: 0.5, canPosY: -0.5, canPosZ: 0, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 3.5, wave: 0, swirl: 0, baseOffset: 3, lightIntensity: 30, lightWidth: 1, tintStrength: 1, spotIntensity: 0, spotY: 3, pointerInfluence: 0.2, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight });
  i += 1; tl.set(swipe, { active: false });

  // Section 1: Balanceo suave izquierda (Detalle ingredientes)
  tl.to(data, { camPosX: 0, camPosY: -2, camPosZ: 12, camRotX: (Math.PI / 180) * 10, camRotY: 0, camRotZ: (Math.PI / 180) * -8, fov: 20, canScale: 1, canPosX: 0, canPosY: -0.6, canPosZ: 0, canRotX: 0, canRotY: (Math.PI / 180) * -12, canRotZ: (Math.PI / 180) * -6, canSpin: 0, spacing: 2.2, wave: 0, swirl: 0, baseOffset: 3, lightIntensity: 0, lightWidth: 1, tintStrength: 0.2, spotIntensity: 35, spotY: 2.2, pointerInfluence: 0, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;

  // Section 2: Balanceo suave derecha
  tl.to(data, { camPosX: 0, camPosY: -2, camPosZ: 12, camRotX: (Math.PI / 180) * 10, camRotY: 0, camRotZ: (Math.PI / 180) * 8, fov: 20, canScale: 1, canPosX: 0, canPosY: -0.3, canPosZ: 0, canRotX: 0, canRotY: (Math.PI / 180) * 12, canRotZ: (Math.PI / 180) * 6, canSpin: 0, spacing: 2.2, wave: 0, swirl: 0, baseOffset: 3, lightIntensity: 0, lightWidth: 1, tintStrength: 0.2, spotIntensity: 35, spotY: 2.2, pointerInfluence: 0, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;

  // Section 3: Balanceo suave izquierda
  tl.to(data, { camPosX: 0, camPosY: -2, camPosZ: 12, camRotX: (Math.PI / 180) * 10, camRotY: 0, camRotZ: (Math.PI / 180) * -8, fov: 20, canScale: 1, canPosX: 0, canPosY: 0.1, canPosZ: 0, canRotX: 0, canRotY: (Math.PI / 180) * -12, canRotZ: (Math.PI / 180) * -6, canSpin: 0, spacing: 2.2, wave: 0, swirl: 0, baseOffset: 3, lightIntensity: 0, lightWidth: 1, tintStrength: 0.2, spotIntensity: 35, spotY: 2.2, pointerInfluence: 0, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;

  // Section 4: Balanceo suave derecha
  tl.to(data, { camPosX: 0, camPosY: -2, camPosZ: 12, camRotX: (Math.PI / 180) * 10, camRotY: 0, camRotZ: (Math.PI / 180) * 8, fov: 20, canScale: 1, canPosX: 0, canPosY: 0.45, canPosZ: 0, canRotX: 0, canRotY: (Math.PI / 180) * 12, canRotZ: (Math.PI / 180) * 6, canSpin: 0, spacing: 2.2, wave: 0, swirl: 0, baseOffset: 3, lightIntensity: 0, lightWidth: 1, tintStrength: 0.2, spotIntensity: 35, spotY: 2.2, pointerInfluence: 0, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;

  // Section 5: Transición al FAQ (Alineación diagonal)
  tl.to(data, { camPosX: 0, camPosY: 0, camPosZ: 8, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 45, canScale: 1, canPosX: 0, canPosY: 0, canPosZ: -0.5, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 3.2, wave: 0, swirl: 0, baseOffset: 3, lightIntensity: 45, lightWidth: 1.5, tintStrength: 2, spotIntensity: 0, spotY: 3, pointerInfluence: 0.2, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;
  tl.set(swipe, { active: true });

  // Section 6: FAQ Primera fase (Aparición de la fila diagonal compacta)
  tl.to(data, { camPosX: -3, camPosY: -3.5, camPosZ: 20, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 30, canScale: 1, canPosX: 0, canPosY: 0, canPosZ: -0.4, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 0.85, wave: 0, swirl: 1, baseOffset: 20, lightIntensity: 10, lightWidth: 3, tintStrength: 2, spotIntensity: 0, spotY: 3, pointerInfluence: 0, swipeSpeed: 2, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;

  // Section 7: FAQ Segunda fase (Se van pegando aún más apretadas)
  tl.to(data, { camPosX: 0, camPosY: -5.5, camPosZ: 10, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 30, canScale: 1, canPosX: 0, canPosY: 0, canPosZ: -0.4, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 0.55, wave: 0, swirl: 1, baseOffset: 20, lightIntensity: 0, lightWidth: 3, spotIntensity: 0, spotY: 3, pointerInfluence: 0, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;
  tl.set(swipe, { active: false });

  // Vuelta al inicio
  tl.set(data, { camPosX: 0, camPosY: 8, camPosZ: 10, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 20, spacing: 5, swirl: 0 });
  tl.to(data, { camPosX: 0, camPosY: 0, camPosZ: 29, camRotX: 0, camRotY: 0, camRotZ: 0, fov: 20, canScale: 1, canPosX: 0, canPosY: 0, canPosZ: 0.5, canRotX: 0, canRotY: 0, canRotZ: 0, canSpin: 0, spacing: 5, wave: 0, swirl: 0, baseOffset: 10, lightIntensity: 50, lightWidth: 1, tintStrength: 1, spotIntensity: 0, spotY: 3, pointerInfluence: 0.2, swipeSpeed: 1, duration: section.items[i].height / lenis.dimensions.scrollHeight }); i += 1;
  tl.to(data, { ...startData, duration: section.items[i] ? section.items[i].height / lenis.dimensions.scrollHeight : 1 });
  tl.pause();
  return tl;
};
let timeline = createTimeline();
// #endregion Timeline

// #region Loader
const loader = { complete: false, timeline: null, callbacks: [], ended: signal() };
loader.play = async () => {
  if (loader.timeline) loader.timeline.kill();
  lenis.scrollTo(0, { immediate: true });
  lenis.stop();
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  animation.paused = true; swipe.active = false; pointer.prevent = true;
  const tl = gsap.timeline({ defaults: { ease: 'power4.out', duration: 2.5 } });
  carousel.target = carousel.offset;
  carousel.position = carousel.offset;
  tl.set(data, { camPosZ: 25, spacing: 10, baseOffset: 3, wave: 0, swirl: 0, lightWidth: 2, lightIntensity: 0, canSpin: 0, pointerInfluence: 0 });
  tl.to(data, { lightIntensity: 30 }, 0);
  tl.to(data, { camPosZ: 29 }, 1);
  tl.to(data, startData, 2);
  loader.timeline = tl;
  const animMs = Math.max(tl.duration() * 1000, 2500);
  await new Promise((resolve) => { let done = false; const finish = () => { if (done) return; done = true; resolve(); }; tl.eventCallback('onComplete', finish); setTimeout(finish, animMs); });
  lenis.start();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  pointer.prevent = false; swipe.active = true; animation.paused = false;
  loopGuard.lastPos = scroll.position;
  loopGuard.snapping = false;
  loader.ended.emit();
};
// #endregion Loader

// #region PARAMS
const debugFront = { posX: 0.000, posY: 0.200, posZ: 0.000, rotX: -1.310, rotY: 3.140, rotZ: -1.590, scale: 4.200 };
const debugBack  = { posX: 0.000, posY: 0.270, posZ: 1.520, rotX: 1.630, rotY: -1.460, rotZ: 1.550, scale: 4.200 };

let currentTargetTab = 'front';
// #endregion PARAMS

// #region Animation
const animation = { paused: false };
let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; }, false);
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; }, false);

const loopGuard = { lastPos: 0, snapping: false, timer: null };
let time = 0;
function animate(tick = 0) {
  var delta = tick / 1000 - time;
  requestAnimationFrame(animate);
  time = tick / 1000;

  if (lenis.targetScroll < 0) { lenis.targetScroll = 0; lenis.animatedScroll = 0; if (lenis.animate) lenis.animate.to = 0; }
  lenis.raf(time * 1000);

  {
    const total = lenis.dimensions.scrollHeight - lenis.dimensions.height;
    const prev = loopGuard.lastPos;
    const cur = scroll.position;
    if (pointer.prevent) loopGuard.lastPos = cur;
    else {
      if (total > 0 && prev - cur > total * 0.6 && !loopGuard.snapping) {
        loopGuard.snapping = true;
        scroll.to(section.items[0].top, { duration: 1.2, lock: true, easing: (t) => 1 - Math.pow(1 - t, 3) });
        clearTimeout(loopGuard.timer);
        loopGuard.timer = setTimeout(() => (loopGuard.snapping = false), 1300);
      }
      loopGuard.lastPos = cur;
    }
  }

  const minX = cans.length * -0.5 * carousel.spacing;
  const maxX = cans.length * 0.5 * carousel.spacing;

  carousel.target -= swipe.deltaX * 0.02 * data.swipeSpeed;
  swipe.deltaX = 0;

  pointer.smoothX = lerp(pointer.smoothX, pointer.x, delta * 10);
  pointer.smoothY = lerp(pointer.smoothY, pointer.y, delta * 10);

  if (!animation.paused) { if (!swipe.holding) carousel.target = carousel.getRounded(carousel.target); carousel.position = lerp(carousel.position, carousel.target, delta * 10); }

  camera.fov = data.fov;
  camera.updateProjectionMatrix();

  carousel.delta = carousel.position - carousel.lastPosition;
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

  // Detección de secciones
  const currentSecIndex = section.getIndex();
  const isDetailSection = (currentSecIndex >= 1 && currentSecIndex <= 4); // Detalle de ingredientes
  const isFaqSection    = (currentSecIndex >= 5);                         // FAQ y formación diagonal

  if (isDetailSection) {
    // 1. INGREDIENTES: Ocultamos todas las barras de frente y mostramos SOLO el reverso del sabor activo
    cans.forEach((c) => (c.visible = false));
    glowSprite.visible = false;

    backCan.visible = true;
    const selectedSaborIndex = wrap(carousel.getIndex(true), 0, saboresAtrasData.length);
    saboresAtrasData.forEach((item, idx) => {
      item.visible = (idx === selectedSaborIndex);
    });

    backCan.position.x = data.canPosX + debugBack.posX;
    backCan.position.y = data.canPosY + debugBack.posY;
    backCan.position.z = data.canPosZ + debugBack.posZ;

    backCan.rotation.x = data.canRotX + debugBack.rotX;
    backCan.rotation.y = data.canRotY + debugBack.rotY;
    backCan.rotation.z = data.canRotZ + debugBack.rotZ;

    const finalBackScale = data.canScale * debugBack.scale;
    backCan.scale.set(finalBackScale, finalBackScale, finalBackScale);

    backCan.rotation.y += (pointer.smoothX / 1280) * data.pointerInfluence;
    backCan.rotation.x += (pointer.smoothY / 1280) * data.pointerInfluence;
  } else {
    // 2. INICIO O FAQ: Ocultamos el modelo de atrás y mostramos ÚNICAMENTE canfrente1 y canfrente2
    backCan.visible = false;
    glowSprite.visible = !isFaqSection;

    cans.forEach((can, i) => {
      can.visible = true;
      var target = i * carousel.spacing - carousel.position;
      const x = wrap(target, minX, maxX);
      let p = clamp(1 - Math.abs(x) / carousel.spacing, 0, 1);
      const p1 = Math.min(p, p0);

      if (isFaqSection) {
        // Formación diagonal idéntica a la referencia de las latas en el FAQ
        let canPosX = x * data.spacing * 0.82;
        let canPosY = (x * -0.22) * data.swirl;
        let canPosZ = (x * -0.45) * data.swirl;

        let canRotX = debugFront.rotX + (x * 0.05 * windowRatio + 0.15) * data.swirl;
        let canRotY = debugFront.rotY + (x * 0.02) * data.swirl;
        let canRotZ = debugFront.rotZ + (Math.PI / 180) * -15 * data.swirl;

        can.position.x = canPosX + data.canPosX + debugFront.posX;
        can.position.y = canPosY + data.canPosY + debugFront.posY;
        can.position.z = canPosZ + data.canPosZ + debugFront.posZ;
        can.rotation.x = canRotX + data.canRotX;
        can.rotation.y = canRotY + data.canRotY;
        can.rotation.z = canRotZ + data.canRotZ;

        const finalScale = data.canScale * debugFront.scale;
        can.scale.set(finalScale, finalScale, finalScale);
      } else {
        // Carrusel inicial en semicírculo limpio
        const angle = (x / arcRadius);
        let canPosX = Math.sin(angle) * arcRadius * data.spacing;
        let canPosZ = (Math.cos(angle) - 1.0) * arcRadius * 1.35 * data.wave;
        let canPosY = Math.sin(canPosX * wave);

        let canRotY = -angle * data.wave;
        let canRotX = (-Math.PI / 180) * 12 * data.wave;
        let canRotZ = 0;

        let canScale = 1.0;
        canRotX = lerp(canRotX, x * 0.04 * windowRatio + 0.1, data.swirl);
        canScale = lerp(canScale, data.canScale, p0);
        canPosY = lerp(canPosY, data.canPosY, p0);
        canPosZ = lerp(canPosZ, data.canPosZ, p0);
        canRotX = canRotX + data.canRotX;
        canRotY = lerp(canRotY, data.canRotY, p1);
        canRotZ = lerp(canRotZ, data.canRotZ, p1);

        can.position.x = canPosX + debugFront.posX;
        can.position.y = canPosY + debugFront.posY;
        can.position.z = canPosZ + debugFront.posZ;
        can.rotation.x = canRotX + debugFront.rotX;
        can.rotation.y = canRotY + debugFront.rotY;
        can.rotation.z = canRotZ + debugFront.rotZ;

        const finalScale = canScale * debugFront.scale;
        can.scale.set(finalScale, finalScale, finalScale);

        can.rotation.y += (pointer.smoothX / 1280) * data.pointerInfluence * p;
        can.rotation.x += (pointer.smoothY / 1280) * data.pointerInfluence * p;
      }
    });
  }

  base.children[0].position.y = -1 * data.baseOffset;
  base.children[1].position.y = 1 * data.baseOffset;

  camera.position.x = data.camPosX;
  camera.position.y = data.camPosY;
  camera.position.z = data.camPosZ;
  camera.rotation.x = data.camRotX;
  camera.rotation.y = data.camRotY;
  camera.rotation.z = data.camRotZ;

  spot1.intensity = data.lightIntensity * 0.12;
  spot1.angle = (Math.PI / 4) * data.lightWidth;
  spot2.intensity = data.lightIntensity * 0.12;
  spot2.angle = (Math.PI / 4) * data.lightWidth;
  spot3.intensity = data.spotIntensity;
  spot3.position.set(0, data.spotY, 2);
  spot3.target.position.set(0, data.spotY - 2.5, 0);

  if (!contextLost) finalComposer.render();
  carousel.lastPosition = carousel.position;
}
// #endregion Animation

// #region Pointer
const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, smoothX: window.innerWidth / 2, smoothY: window.innerHeight / 2, prevent: true };
const blockScrollWhilePrevented = (e) => { if (pointer.prevent) { e.preventDefault(); e.stopPropagation(); } };
window.addEventListener('wheel', blockScrollWhilePrevented, { passive: false, capture: true });
window.addEventListener('touchmove', blockScrollWhilePrevented, { passive: false, capture: true });
on(window, 'mousemove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
// #endregion Pointer

// #region Swipe
on(renderer.domElement, 'mousedown touchstart', (e) => { if (!swipe.active || pointer.prevent) return; swipe.holding = true; swipe.deltaX = 0; const x = e.touches ? e.touches[0].clientX : e.clientX; const y = e.touches ? e.touches[0].clientY : e.clientY; swipe.startX = x; swipe.lastX = x; swipe.startY = y; swipe.lastY = y; });
on(window, 'mousemove touchmove', (e) => { if (!swipe.active || !swipe.holding || pointer.prevent) return; const x = e.touches ? e.touches[0].clientX : e.clientX; const y = e.touches ? e.touches[0].clientY : e.clientY; const deltaX = x - swipe.lastX; const deltaY = y - swipe.lastY; if (swipe.direction == 0) { if (Math.abs(swipe.startX - x) > 2 || Math.abs(swipe.startY - y) > 2) swipe.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 1 : 2; } if (swipe.direction == 1) { swipe.lastX = x; swipe.deltaX += deltaX; lenis.stop(); if (e.touches) document.body.style.overflow = 'hidden'; } });
on(window, 'mouseup touchend', () => { if (!swipe.holding) return; setTimeout(() => { swipe.deltaX *= 8; swipe.holding = false; swipe.direction = 0; lenis.start(); document.body.style.overflow = ''; }); });
// #endregion Swipe

// #region Mobile Paging
const paging = { startX: 0, startY: 0, anchor: 0, axis: 0, active: false, threshold: 24, lastSnap: 5 };
const isMobile = () => window.innerWidth < 1024;
on(window, 'touchstart', (e) => { if (!isMobile() || pointer.prevent) return; paging.startX = e.touches[0].clientX; paging.startY = e.touches[0].clientY; paging.axis = 0; paging.anchor = closest(section.items, scroll.position, (item) => item.top).index; paging.active = paging.anchor <= paging.lastSnap; });
window.addEventListener('touchmove', (e) => { if (!isMobile() || pointer.prevent || !paging.active) return; const x = e.touches[0].clientX; const y = e.touches[0].clientY; if (paging.axis === 0) { const dx = Math.abs(x - paging.startX); const dy = Math.abs(y - paging.startY); if (dx > 2 || dy > 2) paging.axis = dx > dy ? 1 : 2; } if (paging.axis === 2) { e.preventDefault(); lenis.stop(); } }, { passive: false });
on(window, 'touchend', (e) => { if (!isMobile() || pointer.prevent || !paging.active || paging.axis !== 2) return; const endY = (e.changedTouches && e.changedTouches[0].clientY) || paging.startY; const delta = endY - paging.startY; let target = paging.anchor; if (Math.abs(delta) > paging.threshold) target = paging.anchor + (delta < 0 ? 1 : -1); target = clamp(target, 0, section.items.length - 1); lenis.start(); scroll.to(section.items[target].top, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 3) }); paging.active = false; paging.axis = 0; });
// #endregion Mobile Paging

// #region Desktop Paging
const ENABLE_DESKTOP_PAGING = true;
const wheelPager = { locked: false, lastSnap: 5, durationSlow: 1.5, durationFast: 1, slowIndexes: [0, 1, 5, 6], cooldown: 0 }
;let wheelTimer;
window.addEventListener('wheel', (e) => { if (!ENABLE_DESKTOP_PAGING || pointer.prevent) return; const anchor = closest(section.items, scroll.position, (item) => item.top).index; if (anchor > wheelPager.lastSnap) return; e.preventDefault(); if (wheelPager.locked) return; if (Math.abs(e.deltaY) < 4) return; const dir = e.deltaY > 0 ? 1 : -1; const target = clamp(anchor + dir, 0, section.items.length - 1); if (target === anchor) return; const duration = wheelPager.slowIndexes.includes(anchor) ? wheelPager.durationSlow : wheelPager.durationFast; wheelPager.locked = true; scroll.to(section.items[target].top, { duration, lock: true, easing: (t) => 1 - Math.pow(1 - t, 3) }); clearTimeout(wheelTimer); wheelTimer = setTimeout(() => (wheelPager.locked = false), duration * 1000 + wheelPager.cooldown); }, { passive: false });
// #endregion Desktop Paging

// #region Resize
animate();
let lastResizeWidth = window.innerWidth;
on(window, 'resize', () => { if (window.innerWidth === lastResizeWidth) return; lastResizeWidth = window.innerWidth; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); finalComposer.setSize(window.innerWidth, window.innerHeight); renderer.setSize(window.innerWidth, window.innerHeight); section.resize(); timeline = createTimeline(); });
lenis.scrollTo(0, { immediate: true });
window.loader = loader;
// #endregion Resize

// #region Scroll Indicator
const indicator = { el: document.querySelector('.scroll_indicator'), set: null };
if (indicator.el) { gsap.set(indicator.el, { '--p': 0 }); indicator.set = gsap.quickTo(indicator.el, '--p', { duration: 0.3, ease: 'power3.out' }); lenis.on('scroll', () => { const max = lenis.dimensions.scrollHeight - lenis.dimensions.height; const progress = max > 0 ? scroll.position / max : 0; indicator.set(progress); }); }
window.dispatchEvent(new CustomEvent('carousel:ready', { detail: carousel }));
// #endregion Scroll Indicator

// #region DEBUG GUI
const style = document.createElement('style');
style.textContent = `
#grips-panel{position:fixed;top:20px;right:20px;width:330px;background:rgba(18,18,22,.95);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6);color:#fff;font-family:ui-sans-serif,-apple-system,'Segoe UI',sans-serif;font-size:13px;z-index:99999;overflow:hidden;user-select:none}
#grips-panel *{box-sizing:border-box;margin:0;padding:0}
#grips-panel .gp-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg,rgba(255,255,255,.03),transparent)}
#grips-panel .gp-title{font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px}
#grips-panel .gp-title::before{content:'';width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#00d4ff);box-shadow:0 0 10px rgba(124,92,255,.7)}
#grips-panel .gp-min{background:rgba(255,255,255,.06);border:0;color:#fff;width:24px;height:24px;border-radius:6px;cursor:pointer}
#grips-panel .gp-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.25)}
#grips-panel .gp-tab{flex:1;padding:9px 6px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;cursor:pointer;color:rgba(255,255,255,.45);transition:all .2s;border:none;background:none}
#grips-panel .gp-tab.active{color:#fff;background:rgba(124,92,255,.2);border-bottom:2px solid #7c5cff}
#grips-panel.collapsed .gp-body,#grips-panel.collapsed .gp-footer,#grips-panel.collapsed .gp-tabs{display:none}
#grips-panel .gp-body{padding:14px 16px;max-height:65vh;overflow-y:auto}
#grips-panel .gp-group{margin-bottom:14px}
#grips-panel .gp-group-title{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:rgba(255,255,255,.35);margin-bottom:8px;font-weight:700}
#grips-panel .gp-row{display:grid;grid-template-columns:22px 1fr 48px;align-items:center;gap:8px;margin-bottom:6px}
#grips-panel .gp-row label{font-size:11px;color:rgba(255,255,255,.5);font-weight:600}
#grips-panel .gp-row .gp-val{font-size:11px;color:rgba(255,255,255,.85);text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace}
#grips-panel input[type=range]{-webkit-appearance:none;width:100%;height:4px;background:rgba(255,255,255,.1);border-radius:2px;outline:none;cursor:pointer}
#grips-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#00d4ff);cursor:pointer}
#grips-panel .gp-footer{padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);display:flex;gap:8px}
#grips-panel .gp-btn{flex:1;padding:8px 10px;border:0;border-radius:8px;background:rgba(255,255,255,.06);color:#fff;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
#grips-panel .gp-btn.primary{background:linear-gradient(135deg,#7c5cff,#00d4ff)}
`;
document.head.appendChild(style);

const panel = document.createElement('div');
panel.id = 'grips-panel';
panel.innerHTML = `
  <div class="gp-header">
    <div class="gp-title">Ajustes Grips</div>
    <button class="gp-min">−</button>
  </div>
  <div class="gp-tabs">
    <button class="gp-tab active" data-tab="front">Carrusel (Frente)</button>
    <button class="gp-tab" data-tab="back">Detalle (Atrás)</button>
  </div>
  <div class="gp-body">
    <div class="gp-group">
      <div class="gp-group-title">Posición</div>
      <div class="gp-row"><label>X</label><input type="range" data-key="posX" min="-5" max="5" step="0.01"><span class="gp-val">0.00</span></div>
      <div class="gp-row"><label>Y</label><input type="range" data-key="posY" min="-5" max="5" step="0.01"><span class="gp-val">0.00</span></div>
      <div class="gp-row"><label>Z</label><input type="range" data-key="posZ" min="-5" max="5" step="0.01"><span class="gp-val">0.00</span></div>
    </div>
    <div class="gp-group">
      <div class="gp-group-title">Rotación</div>
      <div class="gp-row"><label>X</label><input type="range" data-key="rotX" min="-3.14" max="3.14" step="0.01"><span class="gp-val">0.00</span></div>
      <div class="gp-row"><label>Y</label><input type="range" data-key="rotY" min="-3.14" max="3.14" step="0.01"><span class="gp-val">0.00</span></div>
      <div class="gp-row"><label>Z</label><input type="range" data-key="rotZ" min="-3.14" max="3.14" step="0.01"><span class="gp-val">0.00</span></div>
    </div>
    <div class="gp-group">
      <div class="gp-group-title">Escala</div>
      <div class="gp-row"><label>—</label><input type="range" data-key="scale" min="0.1" max="10" step="0.05"><span class="gp-val">0.00</span></div>
    </div>
  </div>
  <div class="gp-footer">
    <button class="gp-btn" data-action="reset">Reset</button>
    <button class="gp-btn primary" data-action="copy">Copiar valores</button>
  </div>
`;
document.body.appendChild(panel);

const updatePanelUI = () => {
  const currentObj = currentTargetTab === 'front' ? debugFront : debugBack;
  panel.querySelectorAll('input[type=range]').forEach((inp) => {
    const key = inp.dataset.key;
    inp.value = currentObj[key];
    inp.nextElementSibling.textContent = currentObj[key].toFixed(2);
  });
};
updatePanelUI();

panel.querySelectorAll('.gp-tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', (e) => {
    panel.querySelectorAll('.gp-tab').forEach((b) => b.classList.remove('active'));
    tabBtn.classList.add('active');
    currentTargetTab = tabBtn.dataset.tab;
    updatePanelUI();
  });
});

panel.querySelectorAll('input[type=range]').forEach((inp) => {
  inp.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    const key = e.target.dataset.key;
    const currentObj = currentTargetTab === 'front' ? debugFront : debugBack;
    currentObj[key] = val;
    e.target.nextElementSibling.textContent = val.toFixed(2);
  });
});

panel.querySelector('.gp-min').addEventListener('click', () => panel.classList.toggle('collapsed'));

panel.querySelector('[data-action=reset]').addEventListener('click', () => {
  if (currentTargetTab === 'front') {
    Object.assign(debugFront, { posX: 0.000, posY: 0.200, posZ: 0.000, rotX: -1.310, rotY: 3.140, rotZ: -1.590, scale: 4.200 });
  } else {
    Object.assign(debugBack, { posX: 0.000, posY: 0.270, posZ: 1.520, rotX: 1.630, rotY: -1.460, rotZ: 1.550, scale: 4.200 });
  }
  updatePanelUI();
});

panel.querySelector('[data-action=copy]').addEventListener('click', (e) => {
  const t = `// Frente (Carrusel)\ndebugFront = { posX:${debugFront.posX.toFixed(3)}, posY:${debugFront.posY.toFixed(3)}, posZ:${debugFront.posZ.toFixed(3)}, rotX:${debugFront.rotX.toFixed(3)}, rotY:${debugFront.rotY.toFixed(3)}, rotZ:${debugFront.rotZ.toFixed(3)}, scale:${debugFront.scale.toFixed(3)} };\n\n// Detalle (Atrás)\ndebugBack = { posX:${debugBack.posX.toFixed(3)}, posY:${debugBack.posY.toFixed(3)}, posZ:${debugBack.posZ.toFixed(3)}, rotX:${debugBack.rotX.toFixed(3)}, rotY:${debugBack.rotY.toFixed(3)}, rotZ:${debugBack.rotZ.toFixed(3)}, scale:${debugBack.scale.toFixed(3)} };`;
  navigator.clipboard.writeText(t);
  const btn = e.target;
  const oldText = btn.textContent;
  btn.textContent = '✓ Copiado';
  setTimeout(() => (btn.textContent = oldText), 1500);
});
// #endregion DEBUG GUI
