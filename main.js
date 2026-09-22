import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";

/* -------------------------------------------------------------------------
 * Smart Irrigation System — 3D farm visualization
 *
 * Mirrors the real Tinkercad circuit (Arduino Uno + soil moisture sensor +
 * TMP36 + 250k potentiometer + red/green LEDs + DC motor pump + piezo +
 * I2C 16x2 LCD): soil moisture drifts down over time; once it crosses below
 * the potentiometer's threshold, the red LED + piezo + pump motor activate
 * and every sprinkler across the farm irrigates the crops until moisture
 * recovers, then the system returns to idle/green. A presenter can also
 * drag the on-scene potentiometer dial to change the threshold live, or
 * force a dry reading via any soil bed / the "Simulate Dry Soil" button.
 * ---------------------------------------------------------------------- */

const container = document.getElementById("app");

// ---------------------------------------------------------------------------
// Renderer / Scene / Camera
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const SKY_COLOR = 0xcfe9f5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 42, 95);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  120,
);
camera.position.set(11, 7.2, 11.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI / 2.05;
controls.target.set(-0.5, 0.9, 0.2);
controls.autoRotateSpeed = 0.4;

let lastInteractionTime = performance.now();

controls.update();

controls.addEventListener("start", () => {
  lastInteractionTime = performance.now();
});
controls.addEventListener("change", () => {
  lastInteractionTime = performance.now();
});

const CAMERA_INTRO_DURATION = 2.8;
const cameraIntroTarget = camera.position.clone();
const cameraIntroStart = cameraIntroTarget
  .clone()
  .add(new THREE.Vector3(9, 6, 7))
  .multiplyScalar(1.3);
camera.position.copy(cameraIntroStart);

// ---------------------------------------------------------------------------
// Procedural textures (canvas-generated — no external image assets, so the
// project stays a pure static-file, no-bundler page).
// ---------------------------------------------------------------------------

function makeCanvasTexture(draw, size, repeatX, repeatY) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGrassTexture() {
  return makeCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#5f9c42";
      ctx.fillRect(0, 0, size, size);
      // soft patchy shading
      for (let i = 0; i < 70; i++) {
        const r = 14 + Math.random() * 30;
        const x = Math.random() * size;
        const y = Math.random() * size;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const dark = Math.random() < 0.5;
        g.addColorStop(0, dark ? "rgba(60,90,40,0.35)" : "rgba(150,200,100,0.28)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // individual blade strokes
      for (let i = 0; i < 1600; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const len = 3 + Math.random() * 6;
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
        const shade = 90 + Math.random() * 90;
        ctx.strokeStyle = `rgba(${shade - 40},${shade + 40},${shade - 55},0.5)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
    },
    256,
    18,
    14,
  );
}

function createSoilTexture() {
  return makeCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#4a3222";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 220; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 2 + Math.random() * 7;
        const dark = Math.random() < 0.5;
        ctx.fillStyle = dark ? "rgba(30,18,10,0.4)" : "rgba(120,85,55,0.35)";
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = "rgba(200,170,130,0.18)";
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    },
    256,
    4,
    3,
  );
}

function createConcreteTexture() {
  return makeCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#9a9a92";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const shade = 130 + Math.random() * 70;
        ctx.fillStyle = `rgba(${shade},${shade},${shade - 5},0.25)`;
        ctx.fillRect(x, y, 1.2, 1.2);
      }
      ctx.strokeStyle = "rgba(60,60,58,0.3)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        let x = Math.random() * size;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < size) {
          x += (Math.random() - 0.5) * 18;
          y += 20 + Math.random() * 20;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    256,
    3,
    3,
  );
}

function createWoodTexture() {
  return makeCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#8a6a45";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 10; i++) {
        const y = (i / 10) * size + Math.random() * 4;
        ctx.strokeStyle = "rgba(60,40,22,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y + (Math.random() - 0.5) * 6);
        ctx.stroke();
      }
      for (let i = 0; i < 140; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.strokeStyle = "rgba(110,80,50,0.25)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 10 + Math.random() * 20, y);
        ctx.stroke();
      }
    },
    256,
    3,
    2,
  );
}

const grassTexture = createGrassTexture();
const soilTexture = createSoilTexture();
const concreteTexture = createConcreteTexture();
const woodTexture = createWoodTexture();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const hemiLight = new THREE.HemisphereLight(0xcfe9f5, 0x4a3a2a, 0.85);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff2d6, 1.9);
sunLight.position.set(8, 13, 6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -17;
sunLight.shadow.camera.right = 17;
sunLight.shadow.camera.top = 15;
sunLight.shadow.camera.bottom = -15;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 40;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xcfe8ff, 0.5);
fillLight.position.set(-9, 6, -7);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x8fb8ff, 0.5);
rimLight.position.set(-6, 6, 10);
scene.add(rimLight);

// Extra warm light dedicated to the crop field (the main sun comes from the
// opposite side/x, so the plots were reading a bit dim/undersaturated).
const fieldLight = new THREE.DirectionalLight(0xfff6da, 0.9);
fieldLight.position.set(-3.6, 11, 0);
const fieldLightTarget = new THREE.Object3D();
fieldLightTarget.position.set(-3.6, 0, 0);
scene.add(fieldLightTarget);
fieldLight.target = fieldLightTarget;
scene.add(fieldLight);

// ---------------------------------------------------------------------------
// Sky dome + clouds
// ---------------------------------------------------------------------------

const SKY_RADIUS = 60;
const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
const skyColorTop = new THREE.Color(0x4a90d9);
const skyColorHorizon = new THREE.Color(0xe6f4fa);
const skyColorNadir = new THREE.Color(0x05070a); // near-black below the horizon, so any gap past the ground reads dark, not bright
const skyPos = skyGeo.attributes.position;
const skyColors = new Float32Array(skyPos.count * 3);
const skyColorTmp = new THREE.Color();
for (let i = 0; i < skyPos.count; i++) {
  const y = THREE.MathUtils.clamp(skyPos.getY(i) / SKY_RADIUS, -1, 1);
  if (y >= -0.15) {
    const t = THREE.MathUtils.smoothstep(y, -0.15, 0.6);
    skyColorTmp.copy(skyColorHorizon).lerp(skyColorTop, t);
  } else {
    const t = THREE.MathUtils.smoothstep(y, -1, -0.15);
    skyColorTmp.copy(skyColorNadir).lerp(skyColorHorizon, t);
  }
  skyColors[i * 3] = skyColorTmp.r;
  skyColors[i * 3 + 1] = skyColorTmp.g;
  skyColors[i * 3 + 2] = skyColorTmp.b;
}
skyGeo.setAttribute("color", new THREE.BufferAttribute(skyColors, 3));
const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

const cloudsGroup = new THREE.Group();
scene.add(cloudsGroup);
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  transparent: true,
  opacity: 0.85,
  fog: false,
});
function makeCloud(x, y, z, scale) {
  const cloud = new THREE.Group();
  const puffCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < puffCount; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.4, 8, 6), cloudMat);
    puff.position.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.1);
    puff.scale.setScalar(0.8 + Math.random() * 0.5);
    cloud.add(puff);
  }
  cloud.position.set(x, y, z);
  cloud.scale.setScalar(scale);
  cloud.userData.driftSpeed = 0.15 + Math.random() * 0.15;
  return cloud;
}
[
  [-14, 15, -18, 1.6],
  [6, 17, -22, 2.0],
  [-4, 14.5, -25, 1.4],
  [16, 16, -12, 1.7],
].forEach(([x, y, z, s]) => cloudsGroup.add(makeCloud(x, y, z, s)));

// ---------------------------------------------------------------------------
// Weather: rain particles + day/night sky tint
// ---------------------------------------------------------------------------

const RAIN_COUNT = 900;
const RAIN_AREA = { x: 30, z: 24, yTop: 16, yBottom: 0, xOffset: -2 };
const rainGeo = new THREE.BufferGeometry();
const rainPositions = new Float32Array(RAIN_COUNT * 3);
for (let i = 0; i < RAIN_COUNT; i++) {
  rainPositions[i * 3] = (Math.random() - 0.5) * RAIN_AREA.x + RAIN_AREA.xOffset;
  rainPositions[i * 3 + 1] = Math.random() * RAIN_AREA.yTop;
  rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA.z;
}
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
const rainMat = new THREE.PointsMaterial({
  color: 0xaecdee,
  size: 0.06,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const rainSystem = new THREE.Points(rainGeo, rainMat);
rainSystem.visible = false;
scene.add(rainSystem);

const dayTintColor = new THREE.Color(0xffffff);
const nightTintColor = new THREE.Color(0x38466a);
const tintTmp = new THREE.Color();

const fogDayColor = new THREE.Color(0x6f8f9c); // muted, darker than the sky dome itself
const fogNightColor = new THREE.Color(0x151c26);
const fogColorTmp = new THREE.Color();

// ---------------------------------------------------------------------------
// Farm layout constants
// ---------------------------------------------------------------------------

const SOIL_HEIGHT = 0.4;
const SOIL_TOP_Y = SOIL_HEIGHT;

const PAD_CENTER = new THREE.Vector3(4.6, 0, 0);
const PAD_SIZE = { x: 2.6, z: 2.4 };

const TANK_CENTER = new THREE.Vector3(6.4, 0, -2.4);
const WINDMILL_CENTER = new THREE.Vector3(-9, 0, -8);
const SHED_CENTER = new THREE.Vector3(-9.5, 0, 5.5);

const PLOT_DEFS = [
  {
    key: "tomato",
    label: "Tomato Field",
    center: { x: -3.6, z: -3.4 },
    size: { x: 4.4, z: 2.6 },
    crop: {
      rows: 4,
      cols: 8,
      stalkGeo: [0.03, 0.045, 0.5],
      stalkColor: 0x4c8c3a,
      leafGeo: [0.22, 0.42],
      leafYOffset: 0.52,
      leafFlattenX: 1,
      leafPalette: [0x5fae3e, 0x77c24f, 0x9fd35a],
      fruitEnabled: true,
      fruitProbability: 0.35,
      fruitGeo: 0.055,
      fruitYOffset: 0.58,
      fruitPalette: [0xd8402f, 0xe8a63c],
      scaleRange: [0.8, 1.2],
    },
  },
  {
    key: "leafy",
    label: "Leafy Greens",
    center: { x: -3.6, z: 0 },
    size: { x: 4.4, z: 2.6 },
    crop: {
      rows: 5,
      cols: 9,
      stalkGeo: [0.02, 0.03, 0.16],
      stalkColor: 0x3f7a34,
      leafGeo: [0.32, 0.24],
      leafYOffset: 0.17,
      leafFlattenX: 1,
      leafPalette: [0x3f8f3a, 0x5aa83f, 0x76c24a],
      fruitEnabled: false,
      fruitProbability: 0,
      fruitGeo: 0.001,
      fruitYOffset: 0,
      fruitPalette: [0x000000],
      scaleRange: [0.85, 1.25],
    },
  },
  {
    key: "corn",
    label: "Corn Field",
    center: { x: -3.6, z: 3.4 },
    size: { x: 4.4, z: 2.6 },
    crop: {
      rows: 3,
      cols: 6,
      stalkGeo: [0.035, 0.05, 1.1],
      stalkColor: 0x5a9c3f,
      leafGeo: [0.1, 0.55],
      leafYOffset: 0.95,
      leafFlattenX: 0.4,
      leafPalette: [0x4f9c3a, 0x6fb84a],
      fruitEnabled: true,
      fruitProbability: 1,
      fruitGeo: 0.07,
      fruitYOffset: 1.15,
      fruitPalette: [0xd9c27a],
      scaleRange: [0.9, 1.15],
    },
  },
];

const FLAT_RECTS = [
  ...PLOT_DEFS.map((p) => ({ cx: p.center.x, cz: p.center.z, hx: p.size.x / 2, hz: p.size.z / 2 })),
  { cx: PAD_CENTER.x, cz: PAD_CENTER.z, hx: PAD_SIZE.x / 2, hz: PAD_SIZE.z / 2 },
  { cx: TANK_CENTER.x, cz: TANK_CENTER.z, hx: 0.8, hz: 0.8 },
  { cx: WINDMILL_CENTER.x, cz: WINDMILL_CENTER.z, hx: 0.7, hz: 0.7 },
  { cx: SHED_CENTER.x, cz: SHED_CENTER.z, hx: 1.1, hz: 1.0 },
  { cx: -1.0, cz: 0, hx: 0.5, hz: 4.9 }, // farm lane
  { cx: 1.4, cz: 0, hx: 1.9, hz: 0.5 }, // spur linking lane to control pad
];

function flatness(x, z) {
  let nearestEdge = Infinity;
  for (const r of FLAT_RECTS) {
    const d = Math.max(Math.abs(x - r.cx) - r.hx, Math.abs(z - r.cz) - r.hz);
    if (d < nearestEdge) nearestEdge = d;
  }
  return 1 - THREE.MathUtils.smoothstep(nearestEdge, 0, 1.4);
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

const groundGeo = new THREE.PlaneGeometry(34, 28, 68, 56);
groundGeo.rotateX(-Math.PI / 2);
const groundPos = groundGeo.attributes.position;
const groundColors = new Float32Array(groundPos.count * 3);
const grassLow = new THREE.Color(0x5f9c42);
const grassHigh = new THREE.Color(0x8fc25a);
const flatColor = new THREE.Color(0x6fae4a);
for (let i = 0; i < groundPos.count; i++) {
  const x = groundPos.getX(i);
  const z = groundPos.getZ(i);
  const flat = flatness(x, z);
  const bump =
    (Math.sin(x * 0.45) * Math.cos(z * 0.4) * 0.14 + Math.sin(x * 1.1 + z * 0.7) * 0.05) * (1 - flat);
  groundPos.setY(i, bump);

  const heightMix = THREE.MathUtils.clamp(bump * 3 + 0.5, 0, 1);
  skyColorTmp.copy(grassLow).lerp(grassHigh, heightMix).lerp(flatColor, flat);
  groundColors[i * 3] = skyColorTmp.r;
  groundColors[i * 3 + 1] = skyColorTmp.g;
  groundColors[i * 3 + 2] = skyColorTmp.b;
}
groundGeo.setAttribute("color", new THREE.BufferAttribute(groundColors, 3));
groundGeo.setAttribute(
  "uv2",
  new THREE.BufferAttribute(groundGeo.attributes.uv.array, 2),
);
groundGeo.computeVertexNormals();
const groundMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  map: grassTexture,
  roughness: 1,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Farm lane + spur linking the control pad to the row of crop plots.
const pathMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, map: soilTexture, roughness: 1 });
const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 9.8), pathMat);
lane.rotation.x = -Math.PI / 2;
lane.position.set(-1.0, 0.005, 0);
lane.receiveShadow = true;
scene.add(lane);

const spur = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.0), pathMat);
spur.rotation.x = -Math.PI / 2;
spur.position.set(1.4, 0.005, 0);
spur.receiveShadow = true;
scene.add(spur);

// ---------------------------------------------------------------------------
// Perimeter fence
// ---------------------------------------------------------------------------

const fenceGroup = new THREE.Group();
scene.add(fenceGroup);
const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, map: woodTexture, roughness: 0.9 });
const fenceRailMat = new THREE.MeshStandardMaterial({ color: 0x9c7a52, map: woodTexture, roughness: 0.9 });
const fencePostGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.6, 6);

const FENCE_CORNERS = [
  { x: -12.5, z: -9 },
  { x: 7.5, z: -9 },
  { x: 7.5, z: 7.5 },
  { x: -12.5, z: 7.5 },
];
function buildFenceSide(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.round(length / 1.1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const post = new THREE.Mesh(fencePostGeo, fencePostMat);
    post.position.set(a.x + dx * t, 0.3, a.z + dz * t);
    post.castShadow = true;
    fenceGroup.add(post);
  }
  const angle = Math.atan2(dz, dx);
  [0.42, 0.2].forEach((y) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.05), fenceRailMat);
    rail.position.set(a.x + dx / 2, y, a.z + dz / 2);
    rail.rotation.y = -angle;
    rail.castShadow = true;
    fenceGroup.add(rail);
  });
}
for (let i = 0; i < FENCE_CORNERS.length; i++) {
  buildFenceSide(FENCE_CORNERS[i], FENCE_CORNERS[(i + 1) % FENCE_CORNERS.length]);
}

// ---------------------------------------------------------------------------
// Background shed
// ---------------------------------------------------------------------------

const shedGroup = new THREE.Group();
shedGroup.position.copy(SHED_CENTER);
shedGroup.rotation.y = -Math.PI / 6;
scene.add(shedGroup);
const shedBodyMat = new THREE.MeshStandardMaterial({ color: 0xc9622f, map: woodTexture, roughness: 0.85 });
const shedBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.4), shedBodyMat);
shedBody.position.y = 0.6;
shedBody.castShadow = true;
shedBody.receiveShadow = true;
shedGroup.add(shedBody);
const shedRoofMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.8 });
const shedRoof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.75, 4), shedRoofMat);
shedRoof.rotation.y = Math.PI / 4;
shedRoof.position.y = 1.55;
shedRoof.castShadow = true;
shedGroup.add(shedRoof);

// ---------------------------------------------------------------------------
// Water tank (feeds the pump)
// ---------------------------------------------------------------------------

const tankGroup = new THREE.Group();
tankGroup.position.copy(TANK_CENTER);
scene.add(tankGroup);

const tankLegMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.3 });
const tankLegGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6);
[
  [0.5, 0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [-0.5, -0.5],
].forEach(([x, z]) => {
  const leg = new THREE.Mesh(tankLegGeo, tankLegMat);
  leg.position.set(x, 0.75, z);
  leg.castShadow = true;
  tankGroup.add(leg);
});

const tankBodyMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c2, roughness: 0.35, metalness: 0.4 });
const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.15, 16), tankBodyMat);
tankBody.position.y = 2.1;
tankBody.castShadow = true;
tankBody.receiveShadow = true;
tankGroup.add(tankBody);

const tankCapMat = new THREE.MeshStandardMaterial({ color: 0x7d95a1, roughness: 0.4, metalness: 0.4 });
const tankCap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.45, 16), tankCapMat);
tankCap.position.y = 2.9;
tankCap.castShadow = true;
tankGroup.add(tankCap);

const tankStubMat = new THREE.MeshStandardMaterial({ color: 0x7c8896, roughness: 0.4, metalness: 0.2 });
const tankStub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), tankStubMat);
tankStub.position.set(0, 0.9, 0);
tankStub.castShadow = true;
tankGroup.add(tankStub);

// Ultrasonic water-level sensor, mounted inside the tank neck facing down
const ultraBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6 });
const ultraBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), ultraBaseMat);
ultraBase.position.set(0, 2.62, 0);
tankGroup.add(ultraBase);
const ultraEyeMat = new THREE.MeshStandardMaterial({ color: 0xcac8c2, roughness: 0.4 });
[-0.045, 0.045].forEach((x) => {
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), ultraEyeMat);
  eye.rotation.x = Math.PI / 2;
  eye.position.set(x, 2.58, 0);
  tankGroup.add(eye);
});

// External level gauge bar (fill height driven by state.tankLevel each frame)
const TANK_GAUGE_HEIGHT = 1.1;
const TANK_GAUGE_BASE_Y = 1.55;
const gaugeFrameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.6 });
const gaugeFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, TANK_GAUGE_HEIGHT + 0.06, 0.05), gaugeFrameMat);
gaugeFrame.position.set(0.92, TANK_GAUGE_BASE_Y + TANK_GAUGE_HEIGHT / 2, 0);
tankGroup.add(gaugeFrame);
const gaugeFillMat = new THREE.MeshStandardMaterial({
  color: 0x4fc3ff,
  emissive: 0x1c5f86,
  emissiveIntensity: 0.4,
  roughness: 0.4,
});
const tankGaugeFill = new THREE.Mesh(new THREE.BoxGeometry(0.09, TANK_GAUGE_HEIGHT, 0.04), gaugeFillMat);
tankGaugeFill.position.set(0.92, TANK_GAUGE_BASE_Y + TANK_GAUGE_HEIGHT / 2, 0.005);
tankGroup.add(tankGaugeFill);

// ---------------------------------------------------------------------------
// Windmill (background scenery, slowly rotating)
// ---------------------------------------------------------------------------

const windmillGroup = new THREE.Group();
windmillGroup.position.copy(WINDMILL_CENTER);
windmillGroup.rotation.y = -Math.PI / 4;
scene.add(windmillGroup);

const windmillPoleMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.6, metalness: 0.3 });
const windmillPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 3.6, 8), windmillPoleMat);
windmillPole.position.y = 1.8;
windmillPole.castShadow = true;
windmillGroup.add(windmillPole);

[1.0, 2.2].forEach((y) => {
  const brace = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), windmillPoleMat);
  brace.position.set(0, y, 0);
  brace.rotation.z = Math.PI / 5;
  windmillGroup.add(brace.clone());
  const brace2 = brace.clone();
  brace2.rotation.z = -Math.PI / 5;
  windmillGroup.add(brace2);
});

const windmillHub = new THREE.Group();
windmillHub.position.y = 3.6;
windmillGroup.add(windmillHub);

const hubCoreMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.4 });
const hubCore = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), hubCoreMat);
hubCore.rotation.z = Math.PI / 2;
windmillHub.add(hubCore);

const bladeMat2 = new THREE.MeshStandardMaterial({ color: 0xe4e4e4, roughness: 0.5 });
for (let i = 0; i < 6; i++) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.85, 0.28), bladeMat2);
  blade.position.y = 0.45;
  const pivot = new THREE.Group();
  pivot.rotation.x = (i / 6) * Math.PI * 2;
  pivot.add(blade);
  windmillHub.add(pivot);
}

// ---------------------------------------------------------------------------
// Scarecrow (among the leafy greens plot)
// ---------------------------------------------------------------------------

const scarecrowGroup = new THREE.Group();
scarecrowGroup.position.set(-4.6, SOIL_TOP_Y, -0.9);
scene.add(scarecrowGroup);

const scarecrowPoleMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, map: woodTexture, roughness: 0.9 });
const scarecrowPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), scarecrowPoleMat);
scarecrowPole.position.y = 0.65;
scarecrowPole.castShadow = true;
scarecrowGroup.add(scarecrowPole);

const scarecrowArm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.9, 6), scarecrowPoleMat);
scarecrowArm.rotation.z = Math.PI / 2;
scarecrowArm.position.y = 1.05;
scarecrowArm.castShadow = true;
scarecrowGroup.add(scarecrowArm);

const scarecrowBodyMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 });
const scarecrowBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.2), scarecrowBodyMat);
scarecrowBody.position.y = 0.95;
scarecrowBody.castShadow = true;
scarecrowGroup.add(scarecrowBody);

const scarecrowHeadMat = new THREE.MeshStandardMaterial({ color: 0xe0c88a, roughness: 0.9 });
const scarecrowHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), scarecrowHeadMat);
scarecrowHead.position.y = 1.35;
scarecrowHead.castShadow = true;
scarecrowGroup.add(scarecrowHead);

const scarecrowHatMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.8 });
const scarecrowHat = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.22, 10), scarecrowHatMat);
scarecrowHat.position.y = 1.5;
scarecrowHat.castShadow = true;
scarecrowGroup.add(scarecrowHat);

// ---------------------------------------------------------------------------
// Crop plots (instanced low-poly plants, one per farm plot)
// ---------------------------------------------------------------------------

function createCropPlot(center, size, cfg) {
  const group = new THREE.Group();
  group.position.set(center.x, SOIL_TOP_Y, center.z);

  const count = cfg.rows * cfg.cols;

  const stalkGeo = new THREE.CylinderGeometry(cfg.stalkGeo[0], cfg.stalkGeo[1], cfg.stalkGeo[2], 6);
  const stalkMat = new THREE.MeshStandardMaterial({ color: cfg.stalkColor, roughness: 0.85 });
  const stalkMesh = new THREE.InstancedMesh(stalkGeo, stalkMat, count);
  stalkMesh.castShadow = true;

  const leafGeo = new THREE.ConeGeometry(cfg.leafGeo[0], cfg.leafGeo[1], 6);
  const leafMat = new THREE.MeshStandardMaterial({ color: cfg.leafPalette[0], roughness: 0.8 });
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, count);
  leafMesh.castShadow = true;

  let fruitMesh = null;
  if (cfg.fruitEnabled) {
    const fruitGeo = new THREE.SphereGeometry(cfg.fruitGeo, 8, 6);
    const fruitMat = new THREE.MeshStandardMaterial({ color: cfg.fruitPalette[0], roughness: 0.4 });
    fruitMesh = new THREE.InstancedMesh(fruitGeo, fruitMat, count);
    fruitMesh.castShadow = true;
  }

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const spanX = size.x - 1.0;
  const spanZ = size.z - 0.8;
  let idx = 0;

  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      const jitterX = (Math.random() - 0.5) * 0.22;
      const jitterZ = (Math.random() - 0.5) * 0.22;
      const x = -spanX / 2 + (cfg.cols > 1 ? col / (cfg.cols - 1) : 0.5) * spanX + jitterX;
      const z = -spanZ / 2 + (cfg.rows > 1 ? row / (cfg.rows - 1) : 0.5) * spanZ + jitterZ;
      const scale = cfg.scaleRange[0] + Math.random() * (cfg.scaleRange[1] - cfg.scaleRange[0]);
      const rotY = Math.random() * Math.PI * 2;

      dummy.position.set(x, (cfg.stalkGeo[2] / 2) * scale, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      stalkMesh.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, cfg.leafYOffset * scale, z);
      dummy.scale.set(scale * cfg.leafFlattenX, scale, scale);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(idx, dummy.matrix);
      tmpColor.setHex(cfg.leafPalette[Math.floor(Math.random() * cfg.leafPalette.length)]);
      leafMesh.setColorAt(idx, tmpColor);

      if (fruitMesh) {
        if (Math.random() < cfg.fruitProbability) {
          dummy.position.set(
            x + (Math.random() - 0.5) * 0.12,
            cfg.fruitYOffset * scale,
            z + (Math.random() - 0.5) * 0.12,
          );
          dummy.scale.setScalar(scale * (0.8 + Math.random() * 0.4));
          dummy.rotation.set(0, rotY, 0);
          dummy.updateMatrix();
          tmpColor.setHex(cfg.fruitPalette[Math.floor(Math.random() * cfg.fruitPalette.length)]);
          fruitMesh.setColorAt(idx, tmpColor);
        } else {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
        }
        fruitMesh.setMatrixAt(idx, dummy.matrix);
      }

      idx++;
    }
  }

  stalkMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  if (fruitMesh) {
    fruitMesh.instanceMatrix.needsUpdate = true;
    if (fruitMesh.instanceColor) fruitMesh.instanceColor.needsUpdate = true;
  }

  group.add(stalkMesh, leafMesh);
  if (fruitMesh) group.add(fruitMesh);
  return group;
}

function createSoilBed(center, size) {
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, map: soilTexture, roughness: 1 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(size.x, SOIL_HEIGHT, size.z), soilMat);
  bed.position.set(center.x, SOIL_HEIGHT / 2, center.z);
  bed.receiveShadow = true;
  bed.castShadow = true;
  bed.userData.isSoilTrigger = true;
  bed.userData.baseColor = 0x4a3222;
  bed.userData.hoverColor = 0x5c3f28;
  scene.add(bed);
  return bed;
}

const plotSoilBeds = [];
const plotCropGroups = [];
const plotSprinklerPositions = [];
const labelTargets = [];

PLOT_DEFS.forEach((def) => {
  const bed = createSoilBed(def.center, def.size);
  plotSoilBeds.push(bed);
  labelTargets.push({ object: bed, text: `${def.label} — click to simulate dry soil` });

  const cropGroup = createCropPlot(def.center, def.size, def.crop);
  scene.add(cropGroup);
  plotCropGroups.push(cropGroup);

  plotSprinklerPositions.push(
    new THREE.Vector3(def.center.x - def.size.x * 0.18, SOIL_TOP_Y + 1.6, def.center.z + def.size.z * 0.12),
  );
});

// ---------------------------------------------------------------------------
// Soil moisture sensor probe (planted in the leafy-greens plot)
// ---------------------------------------------------------------------------

const probeGroup = new THREE.Group();
const probePos = new THREE.Vector3(-5.2, SOIL_TOP_Y, 0.9);
probeGroup.position.copy(probePos);
probeGroup.userData.isSoilTrigger = true;

const probeBoardMat = new THREE.MeshStandardMaterial({ color: 0xb23b3b, roughness: 0.6 });
const probeBoard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.16), probeBoardMat);
probeBoard.position.y = 0.35;
probeBoard.castShadow = true;
probeGroup.add(probeBoard);

const prongMat = new THREE.MeshStandardMaterial({ color: 0xd8d8c8, metalness: 0.3, roughness: 0.5 });
for (const dz of [-0.05, 0.05]) {
  const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), prongMat);
  prong.position.set(0, 0.02, dz);
  prong.castShadow = true;
  probeGroup.add(prong);
}
scene.add(probeGroup);

// ---------------------------------------------------------------------------
// Control box assembly (abstracted Arduino + breadboard + peripherals)
// ---------------------------------------------------------------------------

const controlBox = new THREE.Group();
controlBox.position.set(PAD_CENTER.x, 0.12, PAD_CENTER.z);
scene.add(controlBox);

const enclosureMat = new THREE.MeshPhysicalMaterial({
  color: 0x33383f,
  roughness: 0.55,
  clearcoat: 0.35,
  clearcoatRoughness: 0.3,
});
const enclosure = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.9), enclosureMat);
enclosure.position.y = 0.5;
enclosure.castShadow = true;
enclosure.receiveShadow = true;
controlBox.add(enclosure);

const FRONT_X = 0.701; // local x of the enclosure's front face (facing the camera/farm side)

const screwMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.3, metalness: 0.6 });
const screwGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.015, 8);
[
  [0.42, 0.06],
  [0.42, 0.94],
  [-0.32, 0.06],
  [-0.32, 0.94],
].forEach(([z, y]) => {
  const screw = new THREE.Mesh(screwGeo, screwMat);
  screw.rotation.z = Math.PI / 2;
  screw.position.set(FRONT_X + 0.005, y, z);
  controlBox.add(screw);
});

// LCD screen
const lcdCanvas = document.createElement("canvas");
lcdCanvas.width = 256;
lcdCanvas.height = 128;
const lcdCtx = lcdCanvas.getContext("2d");
const lcdTexture = new THREE.CanvasTexture(lcdCanvas);
lcdTexture.colorSpace = THREE.SRGBColorSpace;

function drawLCD(text1, text2) {
  lcdCtx.fillStyle = "#0c2416";
  lcdCtx.fillRect(0, 0, lcdCanvas.width, lcdCanvas.height);
  lcdCtx.fillStyle = "#7CFC9A";
  lcdCtx.font = "22px 'Courier New', monospace";
  lcdCtx.textBaseline = "middle";
  lcdCtx.fillText(text1, 12, 40);
  lcdCtx.fillText(text2, 12, 88);
  lcdTexture.needsUpdate = true;
}
drawLCD("Moist: --%  Thr:--%", "Temp: --C   [INIT]");

const lcdTrimMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.4, metalness: 0.3 });
const lcdTrim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.78), lcdTrimMat);
lcdTrim.position.set(FRONT_X - 0.01, 0.66, 0);
lcdTrim.castShadow = true;
controlBox.add(lcdTrim);

const lcdBezelMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5 });
const lcdBezel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.72), lcdBezelMat);
lcdBezel.position.set(FRONT_X, 0.66, 0);
lcdBezel.castShadow = true;
controlBox.add(lcdBezel);

const lcdScreenMat = new THREE.MeshBasicMaterial({ map: lcdTexture });
const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), lcdScreenMat);
lcdScreen.rotation.y = Math.PI / 2;
lcdScreen.position.set(FRONT_X + 0.026, 0.66, 0);
controlBox.add(lcdScreen);

// Potentiometer dial
const potBaseMat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.5 });
const potBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16), potBaseMat);
potBase.rotation.z = Math.PI / 2;
potBase.position.set(FRONT_X + 0.02, 0.22, -0.22);
controlBox.add(potBase);

const potKnobMat = new THREE.MeshStandardMaterial({ color: 0xe8b23c, roughness: 0.4 });
const potKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16), potKnobMat);
potKnob.rotation.z = Math.PI / 2;
potKnob.position.set(FRONT_X + 0.08, 0.22, -0.22);
potKnob.castShadow = true;
potKnob.userData.isPotDial = true;
const potIndicatorMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f });
const potIndicator = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.02), potIndicatorMat);
potIndicator.position.set(0, 0, 0.06);
potKnob.add(potIndicator);
controlBox.add(potKnob);

// Slideswitch (cosmetic)
const switchTrackMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
const switchTrack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.2), switchTrackMat);
switchTrack.position.set(FRONT_X + 0.02, 0.22, 0.28);
controlBox.add(switchTrack);
const switchNubMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
const switchNub = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.06), switchNubMat);
switchNub.position.set(FRONT_X + 0.04, 0.22, 0.33);
controlBox.add(switchNub);

// LEDs
const redLedMat = new THREE.MeshStandardMaterial({
  color: 0x551313,
  emissive: 0xff2b2b,
  emissiveIntensity: 0,
  roughness: 0.3,
});
const redLed = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), redLedMat);
redLed.position.set(FRONT_X + 0.02, 0.86, -0.18);
controlBox.add(redLed);

const greenLedMat = new THREE.MeshStandardMaterial({
  color: 0x144d1c,
  emissive: 0x3dff5e,
  emissiveIntensity: 0,
  roughness: 0.3,
});
const greenLed = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), greenLedMat);
greenLed.position.set(FRONT_X + 0.02, 0.86, 0.0);
controlBox.add(greenLed);

// Piezo speaker grille + "sound wave" ring
const piezoMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6 });
const piezo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), piezoMat);
piezo.rotation.z = Math.PI / 2;
piezo.position.set(FRONT_X + 0.01, 0.86, 0.26);
controlBox.add(piezo);

const soundRingMat = new THREE.MeshBasicMaterial({
  color: 0xffcf6b,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
});
const soundRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.12, 24), soundRingMat);
soundRing.rotation.y = Math.PI / 2;
soundRing.position.set(FRONT_X + 0.02, 0.86, 0.26);
controlBox.add(soundRing);

// Rain sensor (mounted flat on top of the enclosure, exposed to the sky)
const rainSensorGroup = new THREE.Group();
rainSensorGroup.position.set(0.35, 1.02, -0.32);
rainSensorGroup.rotation.x = -0.12;
controlBox.add(rainSensorGroup);
const rainBoardMat = new THREE.MeshStandardMaterial({ color: 0x1f4fa0, roughness: 0.55 });
const rainBoard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.16), rainBoardMat);
rainSensorGroup.add(rainBoard);
const rainTraceMat = new THREE.MeshStandardMaterial({ color: 0xd8c98a, metalness: 0.6, roughness: 0.3 });
for (let i = 0; i < 5; i++) {
  const trace = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.14), rainTraceMat);
  trace.position.set(-0.08 + i * 0.04, 0.011, 0);
  rainSensorGroup.add(trace);
}

// LDR light sensor (mounted flat on top of the enclosure)
const ldrGroup = new THREE.Group();
ldrGroup.position.set(0.35, 1.02, 0.0);
ldrGroup.rotation.x = -0.12;
controlBox.add(ldrGroup);
const ldrBoardMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6 });
const ldrBoard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.1), ldrBoardMat);
ldrGroup.add(ldrBoard);
const ldrDiscMat = new THREE.MeshStandardMaterial({ color: 0xdcd08a, roughness: 0.3, metalness: 0.1 });
const ldrDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12), ldrDiscMat);
ldrDisc.rotation.x = Math.PI / 2;
ldrDisc.position.y = 0.011;
ldrGroup.add(ldrDisc);

// DHT11 humidity sensor, raised on a small mast so it reads open air
const dhtGroup = new THREE.Group();
dhtGroup.position.set(0.35, 1.0, 0.32);
controlBox.add(dhtGroup);
const dhtPoleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 });
const dhtPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), dhtPoleMat);
dhtPole.position.y = 0.11;
dhtGroup.add(dhtPole);
const dhtBodyMat = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.5 });
const dhtBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.06), dhtBodyMat);
dhtBody.position.y = 0.29;
dhtBody.castShadow = true;
dhtGroup.add(dhtBody);
const dhtVentMat = new THREE.MeshStandardMaterial({ color: 0x173a5c, roughness: 0.6 });
const dhtVent = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.062), dhtVentMat);
dhtVent.position.y = 0.34;
dhtGroup.add(dhtVent);

// TMP36 temperature sensor (cosmetic prop)
const tmpMat = new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.5 });
const tmpSensor = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 10), tmpMat);
tmpSensor.rotation.x = Math.PI / 2;
tmpSensor.position.set(0.15, 0.18, 0.55);
tmpSensor.castShadow = true;
controlBox.add(tmpSensor);

// DC motor / pump housing + spinning impeller
const pumpGroup = new THREE.Group();
pumpGroup.position.set(0.35, 1.05, -0.15);
controlBox.add(pumpGroup);

const pumpBodyMat = new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.45, metalness: 0.3 });
const pumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 16), pumpBodyMat);
pumpBody.castShadow = true;
pumpGroup.add(pumpBody);

const impellerGroup = new THREE.Group();
impellerGroup.position.y = 0.13;
pumpGroup.add(impellerGroup);
const bladeMat = new THREE.MeshStandardMaterial({ color: 0xdadde3, roughness: 0.35, metalness: 0.5 });
for (let i = 0; i < 4; i++) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.035), bladeMat);
  blade.position.set(0.07, 0, 0);
  const pivot = new THREE.Group();
  pivot.rotation.y = (i / 4) * Math.PI * 2;
  pivot.add(blade);
  impellerGroup.add(pivot);
}

// Concrete-style pad under the control box.
const padMat = new THREE.MeshStandardMaterial({ color: 0x9a9a92, map: concreteTexture, roughness: 0.9 });
const pad = new THREE.Mesh(new THREE.BoxGeometry(PAD_SIZE.x, 0.12, PAD_SIZE.z), padMat);
pad.position.set(PAD_CENTER.x, 0.06, PAD_CENTER.z);
pad.receiveShadow = true;
scene.add(pad);

labelTargets.push(
  { object: probeGroup, text: "SEN1 — Soil Moisture Sensor" },
  { object: tmpSensor, text: "U2 — Temperature Sensor (TMP36)" },
  { object: potKnob, text: "Rpot3 — Potentiometer (drag to set threshold)" },
  { object: redLed, text: "D1 — Red LED (dry alert)" },
  { object: greenLed, text: "D2 — Green LED (moisture OK)" },
  { object: piezo, text: "PIEZO1 — Piezo Alarm" },
  { object: lcdScreen, text: "U7 — 16×2 LCD Display" },
  { object: pumpGroup, text: "M1 — DC Motor (Water Pump)" },
  { object: tankBody, text: "Water Tank — feeds the pump" },
  { object: rainSensorGroup, text: "Rain Sensor — pauses irrigation while raining" },
  { object: ldrGroup, text: "LDR — Light Sensor (drives day/night drift rate)" },
  { object: dhtGroup, text: "DHT11 — Humidity Sensor" },
  { object: ultraBase, text: "Water Level Sensor — protects the pump from running dry" },
);

// ---------------------------------------------------------------------------
// Irrigation delivery: pipe network + sprinklers + water
// ---------------------------------------------------------------------------

const pumpWorldPos = new THREE.Vector3();
pumpGroup.getWorldPosition(pumpWorldPos);

const pipeMat = new THREE.MeshStandardMaterial({ color: 0x7c8896, roughness: 0.4, metalness: 0.2 });

function buildPipe(points) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.035, 8, false), pipeMat);
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

const junction = new THREE.Vector3(PAD_CENTER.x - 2.2, 2.3, 0);
buildPipe([
  pumpWorldPos.clone(),
  new THREE.Vector3(
    (pumpWorldPos.x + junction.x) / 2,
    Math.max(pumpWorldPos.y, junction.y) + 0.3,
    (pumpWorldPos.z + junction.z) / 2,
  ),
  junction.clone(),
]);

function createSprinklerVisual(sprinklerPos) {
  buildPipe([
    junction.clone(),
    new THREE.Vector3((junction.x + sprinklerPos.x) / 2, junction.y + 0.15, (junction.z + sprinklerPos.z) / 2),
    sprinklerPos.clone(),
  ]);

  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x4a5561, roughness: 0.5 });
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 10), nozzleMat);
  nozzle.position.copy(sprinklerPos);
  nozzle.rotation.x = Math.PI;
  scene.add(nozzle);

  const WATER_COUNT = 40;
  const waterGeo = new THREE.BufferGeometry();
  const waterPositions = new Float32Array(WATER_COUNT * 3);
  const waterSeeds = [];
  for (let i = 0; i < WATER_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.5;
    waterSeeds.push({
      baseX: Math.cos(angle) * radius,
      baseZ: Math.sin(angle) * radius,
      speed: 0.6 + Math.random() * 0.5,
      offset: Math.random(),
    });
    waterPositions[i * 3] = sprinklerPos.x + waterSeeds[i].baseX;
    waterPositions[i * 3 + 1] = sprinklerPos.y;
    waterPositions[i * 3 + 2] = sprinklerPos.z + waterSeeds[i].baseZ;
  }
  waterGeo.setAttribute("position", new THREE.BufferAttribute(waterPositions, 3));
  const waterMat = new THREE.PointsMaterial({
    color: 0x6fc7ff,
    size: 0.07,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const waterPoints = new THREE.Points(waterGeo, waterMat);
  waterPoints.visible = false;
  scene.add(waterPoints);

  const sprayMat = new THREE.MeshBasicMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sprayCone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 16, 1, true), sprayMat);
  sprayCone.position.copy(sprinklerPos);
  sprayCone.position.y -= 0.7;
  scene.add(sprayCone);

  const landingRingMat = new THREE.MeshBasicMaterial({
    color: 0xbfe6ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const landingRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.5, 24), landingRingMat);
  landingRing.rotation.x = -Math.PI / 2;
  landingRing.position.set(sprinklerPos.x, SOIL_TOP_Y + 0.02, sprinklerPos.z);
  scene.add(landingRing);

  const DROP_TOP = sprinklerPos.y - 0.1;
  const DROP_BOTTOM = SOIL_TOP_Y + 0.05;
  let landingPhase = 0;

  return {
    update(delta, active) {
      waterPoints.visible = active;
      sprayCone.visible = active;

      if (active) {
        sprayMat.opacity = THREE.MathUtils.lerp(sprayMat.opacity, 0.16, Math.min(1, 6 * delta));
        landingPhase = (landingPhase + delta * 0.7) % 1;
        landingRing.scale.setScalar(0.4 + landingPhase * 1.4);
        landingRingMat.opacity = (1 - landingPhase) * 0.35;
      } else {
        sprayMat.opacity = THREE.MathUtils.lerp(sprayMat.opacity, 0, Math.min(1, 6 * delta));
        landingRingMat.opacity = THREE.MathUtils.lerp(landingRingMat.opacity, 0, Math.min(1, 6 * delta));
      }

      if (!active) return;
      const positions = waterGeo.attributes.position.array;
      for (let i = 0; i < WATER_COUNT; i++) {
        const seed = waterSeeds[i];
        seed.offset += delta * seed.speed;
        if (seed.offset > 1) seed.offset -= 1;
        positions[i * 3] = sprinklerPos.x + seed.baseX;
        positions[i * 3 + 1] = THREE.MathUtils.lerp(DROP_TOP, DROP_BOTTOM, seed.offset);
        positions[i * 3 + 2] = sprinklerPos.z + seed.baseZ;
      }
      waterGeo.attributes.position.needsUpdate = true;
    },
  };
}

const sprinklerVisuals = plotSprinklerPositions.map((pos) => createSprinklerVisual(pos));

// ---------------------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------------------

const state = {
  moisture: 65,
  threshold: 40,
  temperature: 24,
  systemState: "idle", // "idle" | "irrigating"
  motorSpeed: 0,
  forcedDry: false,
  // Environmental sensors that gate/modulate irrigation
  rainActive: false,
  rainIntensity: 0, // 0..1, fades in/out with the rain event
  tankLevel: 100, // %, drained by the pump, trickle-refilled by a well feed
  humidity: 45, // %, from the DHT11 — higher humidity slows soil drying
  lightLevel: 1, // 0..1, from the LDR — brighter sun speeds soil drying
};

const DRIFT_RATE = 100 / 20; // %/sec while idle -> full cycle in ~20s
const FORCED_DRIFT_RATE = DRIFT_RATE * 4;
const RECOVER_RATE = DRIFT_RATE * 3;
const RAIN_RECOVER_RATE = DRIFT_RATE * 1.4; // rain alone slowly rehydrates soil, no pump needed
const RECOVERY_MARGIN = 15;
const MOTOR_EASE = 4; // higher = snappier spin-up/down
const TANK_DRAIN_RATE = 100 / 26; // full tank drains after ~26s of continuous pumping
const TANK_REFILL_RATE = 100 / 95; // slow natural well trickle when the pump is off

let nightOverride = false;
let nextRainAt = 18 + Math.random() * 12;
let rainEventEndsAt = 0;

function updateEnvironment(delta, elapsed) {
  const autoLight = 0.75 + 0.25 * Math.sin(elapsed * 0.05);
  const targetLight = nightOverride ? 0.18 : autoLight;
  state.lightLevel += (targetLight - state.lightLevel) * Math.min(1, 2 * delta);

  if (!state.rainActive && elapsed >= nextRainAt) {
    state.rainActive = true;
    rainEventEndsAt = elapsed + 7 + Math.random() * 4;
  } else if (state.rainActive && elapsed >= rainEventEndsAt) {
    state.rainActive = false;
    nextRainAt = elapsed + 20 + Math.random() * 18;
  }
  const targetRainIntensity = state.rainActive ? 1 : 0;
  state.rainIntensity += (targetRainIntensity - state.rainIntensity) * Math.min(1, 1.5 * delta);

  const targetHumidity = 35 + state.rainIntensity * 50 + (1 - state.lightLevel) * 10;
  state.humidity += (targetHumidity - state.humidity) * Math.min(1, 0.4 * delta);
}

function updateSimulation(delta, elapsed) {
  const driftMultiplier =
    THREE.MathUtils.lerp(0.6, 1.5, state.lightLevel) *
    THREE.MathUtils.lerp(1.25, 0.75, THREE.MathUtils.clamp(state.humidity, 0, 100) / 100);

  if (state.forcedDry) {
    state.moisture -= FORCED_DRIFT_RATE * delta;
    if (state.moisture <= 6) state.forcedDry = false;
  } else if (state.systemState === "irrigating") {
    state.moisture += RECOVER_RATE * delta;
  } else if (state.rainActive) {
    state.moisture += RAIN_RECOVER_RATE * delta;
  } else {
    state.moisture -= DRIFT_RATE * driftMultiplier * delta;
  }
  state.moisture = THREE.MathUtils.clamp(state.moisture, 0, 100);

  const canIrrigate = !state.rainActive && state.tankLevel > 0.5;
  if (state.systemState === "idle" && state.moisture < state.threshold && canIrrigate) {
    state.systemState = "irrigating";
  } else if (
    state.systemState === "irrigating" &&
    (state.tankLevel <= 0.5 || state.rainActive || state.moisture >= Math.min(100, state.threshold + RECOVERY_MARGIN))
  ) {
    state.systemState = "idle";
  }

  if (state.systemState === "irrigating") {
    state.tankLevel -= TANK_DRAIN_RATE * delta;
  } else {
    state.tankLevel += TANK_REFILL_RATE * delta;
  }
  state.tankLevel = THREE.MathUtils.clamp(state.tankLevel, 0, 100);

  const targetMotorSpeed = state.systemState === "irrigating" ? 1 : 0;
  state.motorSpeed += (targetMotorSpeed - state.motorSpeed) * Math.min(1, MOTOR_EASE * delta);

  state.temperature = 23 + Math.sin(elapsed * 0.05) * 3 - (1 - state.lightLevel) * 2;
}

// ---------------------------------------------------------------------------
// Visual reactions
// ---------------------------------------------------------------------------

const hudMoisture = document.getElementById("hud-moisture");
const hudThreshold = document.getElementById("hud-threshold");
const hudTemp = document.getElementById("hud-temp");
const hudRain = document.getElementById("hud-rain");
const hudTank = document.getElementById("hud-tank");
const hudState = document.getElementById("hud-state");

let lastReadoutUpdate = 0;
const READOUT_INTERVAL = 0.2; // seconds

const STATE_LABELS = {
  IRRIG: { text: "IRRIGATING", cls: "state-irrigating" },
  RAIN: { text: "RAIN HOLD", cls: "state-rain" },
  EMPTY: { text: "TANK EMPTY", cls: "state-empty" },
  IDLE: { text: "IDLE", cls: "state-idle" },
};

function computeStateLabel() {
  if (state.systemState === "irrigating") return "IRRIG";
  if (state.tankLevel <= 0.5 && state.moisture < state.threshold) return "EMPTY";
  if (state.rainActive) return "RAIN ";
  return "IDLE ";
}

function updateReadouts(elapsed) {
  if (elapsed - lastReadoutUpdate < READOUT_INTERVAL) return;
  lastReadoutUpdate = elapsed;

  const moistureText = `Moist:${state.moisture.toFixed(0).padStart(3, " ")}% Thr:${state.threshold
    .toFixed(0)
    .padStart(2, " ")}%`;
  const stateLabel = computeStateLabel();
  const tempText = `Temp:${state.temperature.toFixed(0).padStart(3, " ")}C   [${stateLabel}]`;
  drawLCD(moistureText, tempText);

  hudMoisture.textContent = `${state.moisture.toFixed(0)}%`;
  hudThreshold.textContent = `${state.threshold.toFixed(0)}%`;
  hudTemp.textContent = `${state.temperature.toFixed(0)}°C`;
  hudRain.textContent = state.rainActive ? "Yes" : "No";
  hudTank.textContent = `${state.tankLevel.toFixed(0)}%`;

  const info = STATE_LABELS[stateLabel.trim()] || STATE_LABELS.IDLE;
  hudState.textContent = info.text;
  hudState.className = `value ${info.cls}`;
}

let soundRingPhase = 0;

function updateVisuals(delta, elapsed) {
  const irrigating = state.systemState === "irrigating";
  const blockedEmpty = !irrigating && state.tankLevel <= 0.5 && state.moisture < state.threshold;
  const alarm = irrigating || blockedEmpty;
  const pulseSpeed = irrigating ? 8 : 2.2;
  const pulse = alarm ? Math.sin(elapsed * pulseSpeed) * 0.5 + 0.5 : 0;

  redLedMat.emissiveIntensity = alarm
    ? THREE.MathUtils.lerp(irrigating ? 1.2 : 0.5, irrigating ? 2.4 : 1.4, pulse)
    : 0;
  greenLedMat.emissiveIntensity = alarm ? 0 : 1.6;

  impellerGroup.rotation.y += state.motorSpeed * 10 * delta;

  if (alarm) {
    soundRingPhase = (soundRingPhase + delta * (irrigating ? 0.9 : 0.35)) % 1;
    soundRing.scale.setScalar(1 + soundRingPhase * 3);
    soundRingMat.opacity = (1 - soundRingPhase) * (irrigating ? 0.6 : 0.4);
  } else {
    soundRingMat.opacity = 0;
  }

  sprinklerVisuals.forEach((s) => s.update(delta, irrigating));

  const droop = THREE.MathUtils.lerp(0.65, 1.05, state.moisture / 100);
  plotCropGroups.forEach((group) => {
    group.scale.y = THREE.MathUtils.lerp(group.scale.y, droop, Math.min(1, 3 * delta));
  });

  windmillHub.rotation.x += delta * (0.8 + state.motorSpeed * 0.3);

  updateWeatherVisuals(delta);
}

function updateWeatherVisuals(delta) {
  tintTmp.copy(dayTintColor).lerp(nightTintColor, 1 - state.lightLevel);
  skyMat.color.copy(tintTmp);

  fogColorTmp.copy(fogDayColor).lerp(fogNightColor, 1 - state.lightLevel);
  scene.fog.color.copy(fogColorTmp);
  ambientLight.intensity = THREE.MathUtils.lerp(0.15, 0.35, state.lightLevel);
  hemiLight.intensity = THREE.MathUtils.lerp(0.35, 0.85, state.lightLevel);
  sunLight.intensity = THREE.MathUtils.lerp(0.4, 1.9, state.lightLevel);

  rainSystem.visible = state.rainIntensity > 0.01;
  rainMat.opacity = state.rainIntensity * 0.55;
  if (rainSystem.visible) {
    const positions = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      positions[i * 3 + 1] -= (10 + state.rainIntensity * 4) * delta;
      if (positions[i * 3 + 1] < RAIN_AREA.yBottom) {
        positions[i * 3 + 1] = RAIN_AREA.yTop;
        positions[i * 3] = (Math.random() - 0.5) * RAIN_AREA.x + RAIN_AREA.xOffset;
        positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA.z;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  const wetness = state.rainIntensity;
  groundMat.roughness = THREE.MathUtils.lerp(1, 0.6, wetness);
  groundMat.color.setScalar(THREE.MathUtils.lerp(1, 0.78, wetness));

  const fillFrac = Math.max(0.02, state.tankLevel / 100);
  tankGaugeFill.scale.y = fillFrac;
  tankGaugeFill.position.y = TANK_GAUGE_BASE_Y + (TANK_GAUGE_HEIGHT * fillFrac) / 2;
}

// ---------------------------------------------------------------------------
// Interaction: potentiometer drag + force-dry click/hover
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const soilTriggers = [...plotSoilBeds, probeGroup];
const labelObjects = labelTargets.map((t) => t.object);
const labelEl = document.getElementById("label");
let hoveredLabel = null;

let isDraggingPot = false;
let lastHoverCheck = 0;
let hoveredSoilBed = null;

function setPointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function updatePotKnobVisual() {
  const t = THREE.MathUtils.clamp((state.threshold - 10) / (90 - 10), 0, 1);
  potKnob.rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.75, Math.PI * 0.75, t);
}
updatePotKnobVisual();

function findLabelAncestor(object) {
  let cur = object;
  while (cur) {
    const entry = labelTargets.find((t) => t.object === cur);
    if (entry) return entry;
    cur = cur.parent;
  }
  return null;
}

function onPointerDown(event) {
  lastInteractionTime = performance.now();
  setPointerNDC(event);
  raycaster.setFromCamera(pointerNDC, camera);

  const potHit = raycaster.intersectObject(potKnob, false);
  if (potHit.length > 0) {
    isDraggingPot = true;
    controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    return;
  }

  const soilHit = raycaster.intersectObjects(soilTriggers, true);
  if (soilHit.length > 0) {
    state.forcedDry = true;
  }
}

function onPointerMove(event) {
  if (isDraggingPot) {
    lastInteractionTime = performance.now();
    const deltaThreshold = (event.movementX || 0) * 0.15;
    state.threshold = THREE.MathUtils.clamp(state.threshold + deltaThreshold, 10, 90);
    updatePotKnobVisual();
    return;
  }

  const now = performance.now();
  if (now - lastHoverCheck < 50) return;
  lastHoverCheck = now;

  setPointerNDC(event);
  raycaster.setFromCamera(pointerNDC, camera);

  const soilHits = raycaster.intersectObjects(plotSoilBeds, false);
  const newHoveredBed = soilHits.length > 0 ? soilHits[0].object : null;
  if (newHoveredBed !== hoveredSoilBed) {
    if (hoveredSoilBed) hoveredSoilBed.material.color.setHex(hoveredSoilBed.userData.baseColor);
    if (newHoveredBed) newHoveredBed.material.color.setHex(newHoveredBed.userData.hoverColor);
    hoveredSoilBed = newHoveredBed;
  }

  const labelHits = raycaster.intersectObjects(labelObjects, true);
  hoveredLabel = labelHits.length > 0 ? findLabelAncestor(labelHits[0].object) : null;
  renderer.domElement.style.cursor = hoveredLabel || hoveredSoilBed ? "pointer" : "default";
}

function onPointerUp(event) {
  if (isDraggingPot) {
    isDraggingPot = false;
    controls.enabled = true;
    lastInteractionTime = performance.now();
    try {
      renderer.domElement.releasePointerCapture(event.pointerId);
    } catch (e) {
      /* no-op: pointer capture may already be released */
    }
  }
}

function updateLabel() {
  if (!hoveredLabel) {
    labelEl.classList.remove("visible");
    return;
  }
  const worldPos = new THREE.Vector3();
  hoveredLabel.object.getWorldPosition(worldPos);
  worldPos.project(camera);
  if (worldPos.z > 1) {
    labelEl.classList.remove("visible");
    return;
  }
  const x = ((worldPos.x + 1) / 2) * window.innerWidth;
  const y = (-(worldPos.y - 1) / 2) * window.innerHeight;
  labelEl.style.left = `${x}px`;
  labelEl.style.top = `${y}px`;
  labelEl.textContent = hoveredLabel.text;
  labelEl.classList.add("visible");
}

renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);

document.getElementById("force-dry-btn").addEventListener("click", () => {
  state.forcedDry = true;
});

document.getElementById("trigger-rain-btn").addEventListener("click", () => {
  const elapsed = clock.getElapsedTime();
  state.rainActive = true;
  rainEventEndsAt = elapsed + 7 + Math.random() * 4;
});

document.getElementById("toggle-night-btn").addEventListener("click", (event) => {
  nightOverride = !nightOverride;
  event.currentTarget.textContent = nightOverride ? "Resume Day Cycle" : "Toggle Night";
});

// ---------------------------------------------------------------------------
// Postprocessing (bloom for the LED indicators)
// ---------------------------------------------------------------------------

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0, // strength
  0.4, // radius
  0.88, // threshold — only bright emissive LEDs (and occasional sun glints) bloom
);
composer.addPass(bloomPass);

// If the bloom halo ever looks too broad across the whole scene, raise
// `threshold` first rather than reaching for selective/layer-based bloom —
// with only two small emissive LEDs, full-scene bloom is simpler and enough.

const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms["offset"].value = 1.3;
vignettePass.uniforms["darkness"].value = 0.55;
composer.addPass(vignettePass);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.resolution.set(width, height);
}
window.addEventListener("resize", onWindowResize);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
const IDLE_ROTATE_DELAY = 8000; // ms of no interaction before the camera slowly auto-rotates

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  const introActive = elapsed < CAMERA_INTRO_DURATION;
  if (introActive) {
    // Drive the camera directly and skip controls.update() this frame —
    // OrbitControls clamps radius to maxDistance on every update(), which
    // would otherwise cut the fly-in short before it reaches its start point.
    const t = THREE.MathUtils.smoothstep(elapsed / CAMERA_INTRO_DURATION, 0, 1);
    camera.position.lerpVectors(cameraIntroStart, cameraIntroTarget, t);
    camera.lookAt(controls.target);
  }

  controls.autoRotate = performance.now() - lastInteractionTime > IDLE_ROTATE_DELAY;

  cloudsGroup.children.forEach((cloud) => {
    cloud.position.x += cloud.userData.driftSpeed * delta;
    if (cloud.position.x > 24) cloud.position.x = -24;
  });

  updateEnvironment(delta, elapsed);
  updateSimulation(delta, elapsed);
  updateVisuals(delta, elapsed);
  updateReadouts(elapsed);
  updateLabel();

  if (!introActive) controls.update();
  composer.render();
}

animate();
