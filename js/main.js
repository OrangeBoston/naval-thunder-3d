/* ============================================================
 * main.js — 场景 / 海洋 / 天空 / 相机 / 输入 / HUD / 主循环
 * ============================================================ */
"use strict";

const G = {
  state: "menu",                        // menu | playing | over
  ships: [], shells: [], torps: [], islands: [],
  player: null, ais: [],
  time: 0, timeLeft: 480,
  stats: { shots: 0, hits: 0, damage: 0, kills: 0 },
  camYaw: 0, camPitch: 0.32, fovTarget: 55, fovCur: 55,
  zoomIdx: 0, shake: 0, freeLook: false,
  aimDist: 4000, aimDistTarget: 4000,   // WoWS 式瞄准距离标尺
  torpMode: false, torpSpread: 8,       // 鱼雷瞄准模式与扇形散布（度）
  aimYaw: 0,                            // 当前瞄准方向（弹着点反推，鱼雷/扇形共用）
  shiftZoom: false,
  wantFire: false, muted: false,
  paused: false,          // ESC 暂停菜单
  smokes: [],             // 烟幕区列表
};

/* ============================================================
 * 基础场景
 * ============================================================ */
const container = document.getElementById("game-container");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd7ecf7, 2600, 8800);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 22000);

const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.34).normalize();
const hemi = new THREE.HemisphereLight(0xbcd7ea, 0x3b4a55, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 0.9);
sun.position.copy(SUN_DIR).multiplyScalar(1000);
scene.add(sun);

/* ---------- 天空穹顶（动态太阳/时段色板） ---------- */
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    uSunDir: { value: SUN_DIR },
    uHorizonC: { value: new THREE.Color(0.843, 0.925, 0.968) },
    uZenithC: { value: new THREE.Color(0.33, 0.62, 0.86) },
    uSunC: { value: new THREE.Color(1, 0.98, 0.9) },
  },
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `
    varying vec3 vPos;
    void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform vec3 uSunDir, uHorizonC, uZenithC, uSunC;
    varying vec3 vPos;
    void main() {
      vec3 d = normalize(vPos);
      vec3 col = mix(uHorizonC, uZenithC, smoothstep(0.0, 0.55, d.y));
      float s = max(dot(d, uSunDir), 0.0);
      col += uSunC * (pow(s, 480.0) * 1.3 + pow(s, 24.0) * 0.18 + pow(s, 6.0) * 0.08);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10500, 32, 16), skyMat);
  scene.add(sky);
}

/* ---------- 海洋（动态海色/浪幅，与 JS waveHeight 保持一致） ---------- */
const WAVE_GLSL = `
  float wave(vec2 p, float t) {
    return 1.6*sin(0.008*p.x + 1.1*t) + 1.6*sin(0.007*p.y + 0.9*t + 2.0)
         + 0.9*sin(0.018*(p.x+p.y) + 1.7*t) + 0.9*sin(0.021*(p.x-p.y) + 1.3*t + 4.0);
  }
`;
const oceanMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIR },
    uDeep: { value: new THREE.Color(0x0a3450) },
    uShallow: { value: new THREE.Color(0x3d7fa6) },
    uHorizon: { value: new THREE.Color(0xd7ecf7) },
    uWaveAmp: { value: 1.0 },
  },
  fog: false,
  vertexShader: `
    uniform float uTime;
    uniform float uWaveAmp;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    ${WAVE_GLSL}
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float h = wave(wp.xz, uTime) * uWaveAmp;
      wp.y += h;
      float e = 6.0;
      float hx = (wave(wp.xz + vec2(e, 0.0), uTime) - wave(wp.xz - vec2(e, 0.0), uTime)) * uWaveAmp / (2.0 * e);
      float hz = (wave(wp.xz + vec2(0.0, e), uTime) - wave(wp.xz - vec2(0.0, e), uTime)) * uWaveAmp / (2.0 * e);
      vNormal = normalize(vec3(-hx, 1.0, -hz));
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform vec3 uSunDir, uDeep, uShallow, uHorizon;
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    void main() {
      vec3 V = normalize(cameraPosition - vWorldPos);
      vec3 N = normalize(vNormal);
      N.xz += 0.05 * vec2(sin(vWorldPos.x * 0.11 + uTime * 1.3), sin(vWorldPos.z * 0.13 + uTime * 1.1));
      N = normalize(N);
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 col = mix(uDeep, uShallow, clamp(fres * 0.9 + 0.10, 0.0, 1.0));
      vec3 R = reflect(-normalize(uSunDir), N);
      float spec = pow(max(dot(R, V), 0.0), 160.0);
      col += vec3(1.0, 0.9, 0.72) * spec * 1.1;
      float d = distance(cameraPosition, vWorldPos);
      col = mix(col, uHorizon, smoothstep(2000.0, 8200.0, d));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
{
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(17000, 17000, 150, 150), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0;
  scene.add(ocean);
}

function waveHeight(x, z, t) {
  const amp = G.waveAmp || 1;
  return (1.6 * Math.sin(0.008 * x + 1.1 * t) + 1.6 * Math.sin(0.007 * z + 0.9 * t + 2.0)
       + 0.9 * Math.sin(0.018 * (x + z) + 1.7 * t) + 0.9 * Math.sin(0.021 * (x - z) + 1.3 * t + 4.0)) * amp;
}
G.waveHeight = waveHeight;

/* ============================================================
 * 环境系统：时段 / 太阳轨迹 / 云层 / 天气 / 雨 / 雷
 * ============================================================ */
const ENV = {
  timeOfDay: 0.42,          // 0..1（0=午夜 0.5=正午）；一局从清晨推进到黄昏
  advance: false,           // playing 时推进
  weather: "clear",         // clear | cloudy | storm
  windYaw: Math.random() * Math.PI * 2,
  thunderT: 10,
  clouds: [],
  rain: null,
  rainOn: false,
  hudT: 0,
};

const WEATHERS = {
  clear:  { clouds: 10, cloudAlpha: 0.5,  fogFar: 1.0,  light: 1.0,  rain: false, waveAmp: 1.0 },
  cloudy: { clouds: 26, cloudAlpha: 0.72, fogFar: 0.72, light: 0.82, rain: false, waveAmp: 1.15 },
  storm:  { clouds: 34, cloudAlpha: 0.9,  fogFar: 0.45, light: 0.6,  rain: true,  waveAmp: 1.7 },
};

function initEnvironment() {
  // 程序化云纹理（多层径向渐变叠加）
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const g = cv.getContext("2d");
  for (let i = 0; i < 16; i++) {
    const x = 30 + Math.random() * 196, y = 40 + Math.random() * 55, r = 16 + Math.random() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.9)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 128);
  }
  const cloudTex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 36; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false });
    const sp = new THREE.Sprite(m);
    const sc = 700 + Math.random() * 900;
    sp.scale.set(sc, sc * 0.45, 1);
    sp.position.set((Math.random() - 0.5) * 15000, 900 + Math.random() * 800, (Math.random() - 0.5) * 15000);
    sp.renderOrder = 5;
    scene.add(sp);
    ENV.clouds.push(sp);
  }
  // 雨粒子（围绕相机的循环下落）
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 120;
    pos[i * 3 + 1] = Math.random() * 60;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const rmat = new THREE.PointsMaterial({ color: 0xa8c0d4, size: 0.32, transparent: true, opacity: 0.5, depthWrite: false });
  ENV.rain = new THREE.Points(rg, rmat);
  ENV.rain.visible = false;
  ENV.rain.frustumCulled = false;
  scene.add(ENV.rain);
}

/* 时段色板：白日 / 金色时刻 / 黄昏，按太阳仰角插值 */
function envPalette(elev) {
  const lerp = THREE.MathUtils.lerp;
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const day    = { zen: [0.33, 0.62, 0.86], hor: [0.843, 0.925, 0.968], sun: [1.0, 0.98, 0.9], fog: [0.843, 0.925, 0.968], sea: 1.0, hemi: 0.95, dir: 0.9 };
  const golden = { zen: [0.36, 0.52, 0.78], hor: [0.95, 0.8, 0.58], sun: [1.0, 0.82, 0.55], fog: [0.92, 0.82, 0.7], sea: 0.95, hemi: 0.8, dir: 1.0 };
  const dusk   = { zen: [0.28, 0.36, 0.58], hor: [0.98, 0.6, 0.36], sun: [1.0, 0.58, 0.28], fog: [0.9, 0.7, 0.55], sea: 0.8, hemi: 0.65, dir: 1.05 };
  let p = {};
  const mixP = (a, b, k) => { for (const key in a) p[key] = (key === "hemi" || key === "dir" || key === "sea") ? lerp(a[key], b[key], k) : mix3(a[key], b[key], k); };
  if (elev > 0.45) p = day;
  else if (elev > 0.18) mixP(golden, day, (elev - 0.18) / 0.27);
  else mixP(dusk, golden, Math.max(0, Math.min(1, elev / 0.18)));
  return p;
}

const _sunDir = new THREE.Vector3();
function updateEnvironment(dt) {
  // 时间推进（一局 480s 走完清晨 → 黄昏）
  if (ENV.advance) ENV.timeOfDay = Math.min(0.85, ENV.timeOfDay + dt * (0.55 / 480));
  const tod01 = THREE.MathUtils.clamp((ENV.timeOfDay - 0.3) / 0.55, 0, 1);
  // 太阳方向（东升西落）
  const elev = Math.sin(tod01 * Math.PI) * 0.88 + 0.05;
  const az = THREE.MathUtils.lerp(-1.1, 1.1, tod01);
  _sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev) * 0.6 + 0.35).normalize();
  SUN_DIR.copy(_sunDir);
  const p = envPalette(elev);
  const W = WEATHERS[ENV.weather];
  const dim = W.light;

  // 天空 uniforms
  skyMat.uniforms.uHorizonC.value.setRGB(p.hor[0], p.hor[1], p.hor[2]);
  skyMat.uniforms.uZenithC.value.setRGB(p.zen[0], p.zen[1], p.zen[2]);
  skyMat.uniforms.uSunC.value.setRGB(p.sun[0], p.sun[1], p.sun[2]);
  // 海面（风暴浪幅 + 时段海色）
  oceanMat.uniforms.uWaveAmp.value = W.waveAmp;
  G.waveAmp = W.waveAmp;
  oceanMat.uniforms.uDeep.value.setHex(0x0a3450).multiplyScalar(p.sea * dim);
  oceanMat.uniforms.uShallow.value.setHex(0x3d7fa6).multiplyScalar(p.sea * dim);
  oceanMat.uniforms.uHorizon.value.setRGB(p.hor[0] * (0.75 + 0.25 * dim), p.hor[1] * (0.75 + 0.25 * dim), p.hor[2] * (0.75 + 0.25 * dim));
  // 雾
  scene.fog.color.setRGB(p.fog[0] * (0.5 + 0.5 * dim), p.fog[1] * (0.5 + 0.5 * dim), p.fog[2] * (0.5 + 0.5 * dim));
  scene.fog.near = 2600 * W.fogFar;
  scene.fog.far = 8800 * W.fogFar;
  // 光照
  hemi.intensity = p.hemi * (0.5 + 0.5 * dim);
  hemi.color.setRGB(Math.min(1, p.zen[0] + 0.32), Math.min(1, p.zen[1] + 0.32), Math.min(1, p.zen[2] + 0.32));
  sun.intensity = p.dir * dim;
  sun.color.setRGB(p.sun[0], p.sun[1], p.sun[2]);
  // 云（数量/透明度/色调随天气与时段；随风漂移）
  const cloudTint = ENV.weather === "storm" ? 0.4 : (ENV.weather === "cloudy" ? 0.7 : 1.0);
  ENV.clouds.forEach((c, i) => {
    const vis = i < W.clouds;
    c.visible = vis;
    if (!vis) return;
    c.material.opacity = W.cloudAlpha;
    const base = (p.sun[0] * 0.55 + p.hor[0] * 0.45) * cloudTint;
    c.material.color.setRGB(Math.min(1, base + 0.12), Math.min(1, base * 0.99), Math.min(1, base * 0.95 + 0.05));
    c.position.x += Math.cos(ENV.windYaw) * 6 * dt;
    c.position.z += Math.sin(ENV.windYaw) * 6 * dt;
    if (c.position.x > 8000) c.position.x -= 16000;
    if (c.position.z > 8000) c.position.z -= 16000;
  });
  // 雨 + 雷
  const raining = W.rain && G.state === "playing";
  ENV.rain.visible = raining;
  if (ENV.rainOn !== raining) { ENV.rainOn = raining; AudioSys.rain(raining); }
  if (raining) {
    const arr = ENV.rain.geometry.attributes.position.array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= 60 * dt;
      arr[i] += Math.cos(ENV.windYaw) * 8 * dt;
      if (arr[i + 1] < cy - 25) {
        arr[i + 1] = cy + 28 + Math.random() * 8;
        arr[i] = cx + (Math.random() - 0.5) * 120;
        arr[i + 2] = cz + (Math.random() - 0.5) * 120;
      }
      if (arr[i] < cx - 70) arr[i] += 140; else if (arr[i] > cx + 70) arr[i] -= 140;
      if (arr[i + 2] < cz - 70) arr[i + 2] += 140; else if (arr[i + 2] > cz + 70) arr[i + 2] -= 140;
    }
    ENV.rain.geometry.attributes.position.needsUpdate = true;
    ENV.thunderT -= dt;
    if (ENV.thunderT <= 0) { ENV.thunderT = 9 + Math.random() * 14; AudioSys.thunder(); }
  }
  // HUD 环境信息（0.5s 节流）
  ENV.hudT -= dt;
  if (ENV.hudT <= 0) {
    ENV.hudT = 0.5;
    const hours = ENV.timeOfDay * 24;
    const hh = String(hours | 0).padStart(2, "0"), mm = String(((hours % 1) * 60) | 0).padStart(2, "0");
    const wName = ENV.weather === "clear" ? "晴" : ENV.weather === "cloudy" ? "多云" : "暴雨";
    $("env-info").textContent = wName + " · " + hh + ":" + mm;
  }
}

/* ---------- 岛屿：福特兰群岛（Fault Line）复刻布局 ----------
 * 特征：中央南北向「断层」深水走廊（x∈±450 无岛）、东西两条岛链、
 *       南北翼岛群、中路开阔点区；全图中心对称（公平）。
 * 长条岛用 sx/sz 拉伸造型，碰撞以多圆拟合（islandCols）。 */
function buildIslands() {
  G.islands.forEach(i => { scene.remove(i.mesh); scene.remove(i.ring); });
  G.islands = [];
  G.islandCols = [];
  const defs = [
    // 西岛链（断层以西）
    { x: -1450, z: -400, r: 330, h: 92, sz: 2.1 },          // 长条岛（南北走向）
    { x: -1980, z: 980, r: 300, h: 76, sx: 1.7 },           // 横向岛
    { x: -2680, z: -1550, r: 380, h: 102 },
    { x: -1150, z: 1750, r: 230, h: 58 },
    // 东岛链（中心对称镜像）
    { x: 1450, z: 400, r: 330, h: 92, sz: 2.1 },
    { x: 1980, z: -980, r: 300, h: 76, sx: 1.7 },
    { x: 2680, z: 1550, r: 380, h: 102 },
    { x: 1150, z: -1750, r: 230, h: 58 },
    // 北翼岛群
    { x: -780, z: 2280, r: 300, h: 82 },
    { x: 820, z: 2520, r: 250, h: 70, sx: 1.4 },
    // 南翼岛群（镜像）
    { x: 780, z: -2280, r: 300, h: 82 },
    { x: -820, z: -2520, r: 250, h: 70, sx: 1.4 },
    // 东北 / 西南出生掩护岛
    { x: 3350, z: 2450, r: 320, h: 86, sx: 1.5 },
    { x: -3350, z: -2450, r: 320, h: 86, sx: 1.5 },
    // 中路边缘小礁石
    { x: -980, z: 750, r: 150, h: 34 },
    { x: 980, z: -750, r: 150, h: 34 },
  ];
  defs.forEach(d => {
    const sx = d.sx || 1, sz = d.sz || 1;
    const geo = new THREE.SphereGeometry(d.r, 26, 14);
    const posAttr = geo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i), vy = posAttr.getY(i), vz = posAttr.getZ(i);
      const ang = Math.atan2(vz, vx);
      const wobble = 1 + 0.18 * Math.sin(ang * 3 + d.x * 0.01) + 0.11 * Math.sin(ang * 7 + d.z * 0.013);
      posAttr.setXYZ(i, vx * wobble, vy * wobble, vz * wobble);
      const hn = Math.max(0, vy / d.r);
      if (hn < 0.16) c.setHex(0xbfae86);          // 砾滩
      else if (hn < 0.5) c.setHex(0x71854f);      // 草甸
      else c.setHex(0x5a6e49);                    // 高地
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.scale.set(sx, d.h / d.r, sz);
    mesh.position.set(d.x, -d.h * 0.38, d.z);   // 沉入 38% 高度：岛顶露出 62%
    scene.add(mesh);
    // 浪花环
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(d.r * 0.96, d.r * 1.1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe8f4fb, transparent: true, opacity: 0.32, depthWrite: false }));
    ring.scale.set(sx, 1, sz);
    ring.position.set(d.x, 0.5, d.z);
    scene.add(ring);
    G.islands.push({ x: d.x, z: d.z, r: d.r * Math.max(sx, sz), h: d.h, mesh, ring });
    // 碰撞多圆拟合（长条岛沿长轴布 2~3 圆）
    const long = Math.max(sx, sz);
    const n = Math.max(1, Math.round(long));
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * (long - 1) * d.r;
      G.islandCols.push({
        x: d.x + (sx >= sz ? t : 0),
        z: d.z + (sz > sx ? t : 0),
        r: d.r * 0.95, h: d.h,
      });
    }
  });
}

/* ============================================================
 * 舰队生成 / 回合管理
 * ============================================================ */
const FLEET_CFG = { blue: 4, red: 4, playerType: "nagato" };   // 默认 4v4，玩家默认长门
const FLEET_MAX = 8;
const FLEET_POOL = Object.keys(SHIP_TYPES);                    // 9 艘可选舰池

/* 编队舰种组成：保证 1 BB + 1 CA + 1 DD（n≥3），其余从 9 艘池随机；不与玩家座舰重复 */
function pickFleet(n) {
  const byCls = { bb: [], ca: [], dd: [] };
  for (const k of FLEET_POOL) {
    if (k === FLEET_CFG.playerType) continue;
    byCls[SHIP_TYPES[k].cls].push(k);
  }
  const pick = [];
  if (n >= 1 && byCls.bb.length) pick.push(byCls.bb[(Math.random() * byCls.bb.length) | 0]);
  if (n >= 2 && byCls.ca.length) pick.push(byCls.ca[(Math.random() * byCls.ca.length) | 0]);
  if (n >= 3 && byCls.dd.length) pick.push(byCls.dd[(Math.random() * byCls.dd.length) | 0]);
  const rest = FLEET_POOL.filter(k => !pick.includes(k) && k !== FLEET_CFG.playerType);
  while (pick.length < n && rest.length) pick.push(rest.splice((Math.random() * rest.length) | 0, 1)[0]);
  return pick.slice(0, n);
}

function clearFleet() {
  G.ships.forEach(s => { scene.remove(s.model.root); if (s._label) s._label.remove(); });
  G.ais = [];
  G.ships = [];
  G.shells = [];
  G.torps = [];
}

function spawnFleet() {
  clearFleet();
  const nb = FLEET_CFG.blue, nr = FLEET_CFG.red;
  // WoWS 标准模式：西南-东北对角出生（距离缩短，~90 秒接敌）
  const dirA = Math.PI / 4;                          // 蓝方突击方向（东北）
  const px = Math.cos(dirA), pz = -Math.sin(dirA);   // 舰列展开方向（垂直于突击）
  const bcx = -3100, bcz = -3100, rcx = 3100, rcz = 3100;

  const P = new Ship(FLEET_CFG.playerType, "blue", SHIP_TYPES[FLEET_CFG.playerType].ship, bcx, bcz, dirA);
  P.isPlayer = true;
  G.player = P;
  G.ships.push(P);
  // 血条面板显示所选座舰
  $("hp-name").firstElementChild.textContent = P.name + " · " + P.cfg.name;

  const allies = [], enemies = [];
  // 友军：垂直于突击方向横向展开；中心半格偏移保证玩家舰位永远留空，
  // 间距 640m + 前后 ±180m 错位，避免与玩家贴身
  const blueFleet = pickFleet(nb - 1);
  const used = {};
  for (let i = 0; i < nb - 1; i++) {
    const off = (i - (nb - 2) / 2 + 0.5) * 640;
    const lag = (i % 2 ? -180 : 180);
    const x = bcx + px * off + Math.sin(dirA) * lag;
    const z = bcz + pz * off + Math.cos(dirA) * lag;
    const shipName = SHIP_TYPES[blueFleet[i]].ship;
    used[shipName] = (used[shipName] || 0) + 1;
    const name = shipName + (used[shipName] > 1 ? "·" + used[shipName] : "");
    allies.push(new Ship(blueFleet[i], "blue", name, x, z, dirA));
  }
  // 敌军：对角镜像（AI 舰队自身 640m 间距，无贴身问题）
  const dirB = dirA + Math.PI;
  const redFleet = pickFleet(nr);
  const usedR = {};
  for (let i = 0; i < nr; i++) {
    const off = (i - (nr - 1) / 2) * 640;
    const lag = (i % 2 ? -160 : 140);
    const x = rcx + px * off + Math.sin(dirB) * lag;
    const z = rcz + pz * off + Math.cos(dirB) * lag;
    const shipName = SHIP_TYPES[redFleet[i]].ship;
    usedR[shipName] = (usedR[shipName] || 0) + 1;
    const name = shipName + (usedR[shipName] > 1 ? "·" + usedR[shipName] : "");
    enemies.push(new Ship(redFleet[i], "red", name, x, z, dirB));
  }
  allies.forEach(s => G.ships.push(s));
  enemies.forEach(s => G.ships.push(s));

  allies.forEach((s, i) => G.ais.push(new AIController(s, 0.85 + (i % 3) * 0.08)));
  enemies.forEach((s, i) => G.ais.push(new AIController(s, 0.9 + Math.random() * 0.4)));

  G.ships.forEach(s => scene.add(s.model.root));

  G.time = 0;
  G.timeLeft = 480;
  G.stats = { shots: 0, hits: 0, damage: 0, kills: 0 };
  G.camYaw = P.heading;
  G.aimDist = G.aimDistTarget = 4000;
  aimPoint.set(P.pos.x + Math.sin(P.heading) * 4000, 0, P.pos.z + Math.cos(P.heading) * 4000);
  camLook.set(aimPoint.x, 2, aimPoint.z);
  createLabels();
  updateScoreHUD();
}

/* ============================================================
 * 隐蔽 / 点亮系统（WoWS 规则）
 * ============================================================ */
G.detectAcc = 0;
function updateDetection(dt) {
  G.detectAcc -= dt;
  if (G.detectAcc > 0) return;
  G.detectAcc = 0.15;
  // 每艘船当前的被探测距离（开火后 bloom 抬高、随时间衰减）
  for (const s of G.ships) {
    s.detectNow = s.alive ? (s.bloomT > 0 ? s.cfg.conceal.bloom : s.cfg.conceal.sea) : 0;
  }
  // 点亮判定：任一敌舰进入自身被探测距离即被点亮（队伍间视野共享；烟幕修正）
  for (const t of G.ships) {
    if (!t.alive) { t.spottedBlue = t.spottedRed = false; continue; }
    let b = false, r = false;
    for (const o of G.ships) {
      if (!o.alive || o.team === t.team) continue;
      if (o.pos.distanceTo(t.pos) < t.detectNow) {
        // 烟幕：目标处于烟幕区内、观测者不在同一烟幕区、且距离 > 1.2km → 无法点亮
        let blocked = false;
        for (const sm of G.smokes) {
          const inT = (t.pos.x - sm.x) ** 2 + (t.pos.z - sm.z) ** 2 < sm.r * sm.r;
          if (!inT) continue;
          const oIn = (o.pos.x - sm.x) ** 2 + (o.pos.z - sm.z) ** 2 < sm.r * sm.r;
          if (!oIn && o.pos.distanceTo(t.pos) > 1200) { blocked = true; break; }
        }
        if (blocked) continue;
        if (o.team === "blue") b = true; else r = true;
      }
    }
    t.spottedBlue = b;
    t.spottedRed = r;
    // 小地图最后已知位置（WoWS 残影机制）
    if (t.team === "red") {
      if (b) t.lastKnown = { x: t.pos.x, z: t.pos.z, t: G.time };
    } else if (r) {
      t.lastKnown = { x: t.pos.x, z: t.pos.z, t: G.time };
    }
  }
  // 应用可见性：友军恒可见；敌舰未点亮时隐藏模型与标签
  let spotCount = 0;
  for (const s of G.ships) {
    if (s.team === "blue") { s.model.root.visible = s.alive; continue; }
    const vis = s.alive && s.spottedBlue;
    s.model.root.visible = vis;
    if (s._label) s._label.style.display = vis ? "block" : "none";
    if (vis) spotCount++;
  }
  G.spotCount = spotCount;
  G.playerSpotted = G.player.alive && G.player.spottedRed;
}

/* ============================================================
 * 事件回调（供 ships.js 调用）
 * ============================================================ */
G.onShellSplash = function (shell) {
  const d = camera.position.distanceTo(shell.pos);
  AudioSys.splash(Math.max(0.1, 1 - d / 4500));
};

G.onShellHit = function (shell, ship, dmg, cit) {
  if (ship === G.player) {
    AudioSys.hitMetal();
    G.shake = Math.min(1.6, G.shake + 0.55 + dmg / 12000);
    flashHitVignette();
    addMsg(`遭到命中！${cit ? "核心区被击穿！" : ""}`.trim(), "bad");
  } else {
    const d = camera.position.distanceTo(shell.pos);
    AudioSys.explosion(false, Math.max(0.15, 1 - d / 5000));
    if (shell.owner === G.player) {
      G.stats.hits++;
      G.stats.damage += Math.round(dmg);
      spawnDmgNum(shell.pos, (cit ? "核心区 -" : "-") + Math.round(dmg), cit ? "cit" : "");
    }
  }
};

G.onTorpedoHit = function (torp, ship) {
  const d = camera.position.distanceTo(ship.pos);
  if (ship === G.player) {
    AudioSys.hitByTorpedo();
    G.shake = Math.min(2.5, G.shake + 1.6);
    flashHitVignette();
    addMsg("鱼雷命中！重创！", "bad");
  } else if (torp.owner === G.player) {
    AudioSys.hitByTorpedo();
    G.stats.hits++;
    G.stats.damage += Math.round(torp.owner.cfg.torp.dmg);
    spawnDmgNum(ship.pos.clone().setY(12), "鱼雷核心 -" + Math.round(torp.owner.cfg.torp.dmg), "cit");
  } else {
    AudioSys.explosion(true, Math.max(0.2, 1 - d / 6000));
  }
};

G.onShipDamaged = function () { /* 预留 */ };

G.onShipSunk = function (ship) {
  FX.explosion(ship.pos.x, 8, ship.pos.z, 2.8, true);
  AudioSys.explosion(true, Math.max(0.2, 1 - camera.position.distanceTo(ship.pos) / 7000));
  if (ship === G.player) {
    addMsg("我舰沉没！舰队继续作战 —— 观战模式", "bad");
  }
  if (ship.team === "red") {
    G.stats.kills++;
    addMsg(`击沉了敌舰「${ship.name}」！`, "good");
    updateScoreHUD();
    if (G.ships.filter(s => s.team === "red").every(s => !s.alive)) {
      setTimeout(() => endGame(true, "敌方舰队全军覆没"), 1800);
    }
  } else {
    if (ship !== G.player) addMsg(`友舰「${ship.name}」被击沉`, "bad");
    // 我方舰队全灭 → 战败（玩家沉没不算结束）
    const blues = G.ships.filter(s => s.team === "blue");
    if (blues.length && blues.every(s => !s.alive)) {
      setTimeout(() => endGame(false, "我方舰队全军覆没"), 1200);
    }
  }
  if (ship._label) ship._label.style.display = "none";
};

G.onSecondaryHit = function (from, tgt, dmg, toPlayer) {
  if (tgt === G.player) {
    G.shake = Math.min(0.8, G.shake + 0.08);
    spawnDmgNum(tgt.pos.clone().setY(8), "-" + dmg, "sec");
  } else if (from.team === "blue") {
    G.stats.damage += dmg;
    spawnDmgNum(tgt.pos.clone().setY(8), "-" + dmg, "sec");
  }
};

G.onAIFire = function (ship, r) {
  r.shells.forEach(sh => G.shells.push(new Shell(ship, sh.from, sh.to, sh.v, r.ammo)));
  const d = camera.position.distanceTo(ship.pos);
  const v = Math.max(0.12, 1 - d / 6500);
  AudioSys.gun(r.power, v);
  const dir = new THREE.Vector3().subVectors(r.shells[0].to, r.shells[0].from).normalize();
  FX.muzzleFlash(r.shells[0].from.x, r.shells[0].from.y, r.shells[0].from.z, dir, r.power * 0.5);
};

G.onAITorp = function (ship, list) {
  list.forEach(t => G.torps.push(new Torpedo(ship, t.x, t.z, t.heading)));
  AudioSys.torpedoLaunch();
};

/* ============================================================
 * HUD
 * ============================================================ */
const $ = id => document.getElementById(id);
const el = {
  hud: $("hud"), timer: $("timer"), score: $("score"), messages: $("messages"),
  speed: $("speed-val"), throttle: $("throttle-label"), rudder: $("rudder-ind"),
  hpFill: $("hp-fill"), hpText: $("hp-text"),
  gunFill: $("gun-reload-fill"), gunStatus: $("gun-status"),
  torpDots: document.querySelectorAll(".torp-dot"),
  dispersion: $("dispersion"), oor: $("oor-badge"),
  torpWarn: $("torp-warning"), minimap: $("minimap"),
  labels: $("labels"), dmgBox: $("dmg-container"), aimDist: $("aim-dist"),
  screenStart: $("screen-start"), screenEnd: $("screen-end"),
  endTitle: $("end-title"), endStats: $("end-stats"),
};

let hitVignette = null;
{
  hitVignette = document.createElement("div");
  hitVignette.style.cssText =
    "position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity 0.5s;" +
    "box-shadow:inset 0 0 140px 40px rgba(200,30,20,0.55);z-index:30;";
  document.body.appendChild(hitVignette);
}
function flashHitVignette() {
  hitVignette.style.transition = "none";
  hitVignette.style.opacity = "1";
  requestAnimationFrame(() => {
    hitVignette.style.transition = "opacity 0.6s";
    hitVignette.style.opacity = "0";
  });
}

function addMsg(text, cls = "") {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  el.messages.prepend(div);
  while (el.messages.children.length > 5) el.messages.lastChild.remove();
  setTimeout(() => { div.style.transition = "opacity 0.6s"; div.style.opacity = "0"; }, 4200);
  setTimeout(() => div.remove(), 5000);
}

function updateScoreHUD() {
  const total = G.ships.filter(s => s.team === "red").length;
  el.score.textContent = `敌方舰队 ${G.stats.kills} / ${total}`;
}

/* ---------- 舰船浮动标签 ---------- */
function createLabels() {
  G.ships.forEach(s => {
    if (s._label) s._label.remove();
    if (s.isPlayer) return;
    const div = document.createElement("div");
    div.className = "ship-label" + (s.team === "blue" ? " ally" : "");
    const nm = document.createElement("div"); nm.className = "nm";
    const bar = document.createElement("div"); bar.className = "bar";
    const fill = document.createElement("i");
    bar.appendChild(fill);
    div.appendChild(nm); div.appendChild(bar);
    el.labels.appendChild(div);
    s._label = div; s._labelFill = fill; s._labelNm = nm;
  });
}

const _projV = new THREE.Vector3();
function updateLabels() {
  G.ships.forEach(s => {
    if (s.isPlayer || !s._label) return;
    // 未点亮的敌舰隐藏标签（与模型可见性同步）
    if (s.team === "red" && !s.spottedBlue) { s._label.style.display = "none"; return; }
    if (!s.alive) { s._label.style.display = "none"; return; }
    const d = s.pos.distanceTo(camera.position);
    if (d > 9000) { s._label.style.display = "none"; return; }
    _projV.set(s.pos.x, s.cfg.freeboard + 30, s.pos.z).project(camera);
    if (_projV.z > 1 || _projV.x < -1.1 || _projV.x > 1.1 || _projV.y < -1.1 || _projV.y > 1.1) {
      s._label.style.display = "none"; return;
    }
    s._label.style.display = "block";
    s._label.style.left = ((_projV.x * 0.5 + 0.5) * window.innerWidth) + "px";
    s._label.style.top = ((-_projV.y * 0.5 + 0.5) * window.innerHeight) + "px";
    s._labelFill.style.width = Math.max(0, s.hp / s.hpMax * 100) + "%";
    s._labelNm.textContent = `${s.team === "red" ? "敌" : "友"}·${s.cfg.name} ${s.name} ${(d / 1000).toFixed(1)}km`;
  });
}

/* ---------- 伤害数字池 ---------- */
const dmgPool = [];
function spawnDmgNum(worldPos, text, cls = "") {
  let d = dmgPool.find(x => !x.active);
  if (!d) {
    if (dmgPool.length >= 24) return;
    d = { el: document.createElement("div"), active: false, t: 0, pos: new THREE.Vector3() };
    el.dmgBox.appendChild(d.el);
    dmgPool.push(d);
  }
  d.active = true; d.t = 0;
  d.pos.copy(worldPos);
  d.el.className = "dmg-num " + cls;
  d.el.textContent = text;
  d.el.style.display = "block";
}
function updateDmgNums(dt) {
  dmgPool.forEach(d => {
    if (!d.active) return;
    d.t += dt;
    if (d.t > 1.3) { d.active = false; d.el.style.display = "none"; return; }
    _projV.copy(d.pos).setY(d.pos.y + d.t * 14).project(camera);
    if (_projV.z > 1) { d.el.style.display = "none"; return; }
    d.el.style.display = "block";
    d.el.style.left = ((_projV.x * 0.5 + 0.5) * window.innerWidth) + "px";
    d.el.style.top = ((-_projV.y * 0.5 + 0.5) * window.innerHeight - d.t * 26) + "px";
    d.el.style.opacity = String(Math.max(0, 1 - Math.max(0, d.t - 0.7) / 0.6));
  });
}

/* ---------- 小地图 ---------- */
const mmCtx = el.minimap.getContext("2d");
const MM_SIZE = 220, WORLD = 6000;                 // 世界 ±6000 → 小地图
const mm = (v) => (v / WORLD * 0.5 + 0.5) * MM_SIZE;
function drawMinimap() {
  const c = mmCtx;
  c.clearRect(0, 0, MM_SIZE, MM_SIZE);
  c.fillStyle = "#0a2233";
  c.fillRect(0, 0, MM_SIZE, MM_SIZE);
  // 战区边框
  c.strokeStyle = "rgba(127,214,255,0.4)";
  c.strokeRect(mm(-5600), mm(-5600), mm(5600) - mm(-5600), mm(5600) - mm(-5600));
  // 岛屿（拟合碰撞圆，显示真实形状）
  c.fillStyle = "#5d6b52";
  G.islandCols.forEach(i => {
    c.beginPath();
    c.arc(mm(i.x), mm(i.z), i.r / WORLD * 0.5 * MM_SIZE, 0, Math.PI * 2);
    c.fill();
  });
  // 玩家射程圈
  const P = G.player;
  if (P) {
    c.strokeStyle = "rgba(240,183,74,0.25)";
    c.beginPath();
    c.arc(mm(P.pos.x), mm(P.pos.z), P.cfg.guns.range / WORLD * 0.5 * MM_SIZE, 0, Math.PI * 2);
    c.stroke();
  }
  // 鱼雷
  c.fillStyle = "#ff5f4a";
  G.torps.forEach(t => { c.fillRect(mm(t.pos.x) - 1.5, mm(t.pos.z) - 1.5, 3, 3); });
  // 舰船（未点亮的敌舰不显示在地图上；丢失目标显示最后已知位置残影）
  G.ships.forEach(s => {
    if (!s.alive) return;
    if (s.team === "red" && !s.spottedBlue) {
      if (s.lastKnown && G.time - s.lastKnown.t < 25) {
        c.strokeStyle = "rgba(255,95,74,0.4)";
        c.beginPath();
        c.arc(mm(s.lastKnown.x), mm(s.lastKnown.z), 3.2, 0, Math.PI * 2);
        c.stroke();
      }
      return;
    }
    const x = mm(s.pos.x), y = mm(s.pos.z);
    c.save();
    c.translate(x, y);
    c.rotate(Math.PI - s.heading);   // 世界+Z 映射到小地图下方
    c.fillStyle = s.isPlayer ? "#ffffff" : (s.team === "red" ? "#ff5f4a" : "#6fe08a");
    c.beginPath();
    c.moveTo(0, -5); c.lineTo(3.4, 4); c.lineTo(-3.4, 4);
    c.closePath();
    c.fill();
    c.restore();
  });
  // 相机视野锥
  if (P) {
    c.save();
    c.translate(mm(P.pos.x), mm(P.pos.z));
    c.rotate(-G.camYaw + Math.PI);
    c.fillStyle = "rgba(255,255,255,0.09)";
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 46, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    c.closePath();
    c.fill();
    c.restore();
  }
}

/* ============================================================
 * 输入
 * ============================================================ */
const keys = {};
window.addEventListener("keydown", e => {
  if (e.repeat) return;
  keys[e.code] = true;
  // 全局键（死亡/结束后仍可用）
  if (e.code === "Escape") { togglePauseMenu(); return; }
  if (e.code === "KeyM") {
    G.muted = !G.muted;
    AudioSys.setMuted(G.muted);
    $("mute-ind").textContent = G.muted ? "已静音 (M)" : "M 静音";
  }
  if (G.state !== "playing" || !G.player || !G.player.alive) return;
  if (e.code === "KeyW") G.player.setThrottle(1);
  if (e.code === "KeyS") G.player.setThrottle(-1);
  if (e.code === "Space") { G.wantFire = true; e.preventDefault(); }
  if (e.code === "KeyT" || e.code === "Digit3") {
    if (G.player.cfg.torp && G.player.alive) {
      G.torpMode = !G.torpMode;
      addMsg(G.torpMode ? "鱼雷瞄准模式：移动鼠标转向 · 滚轮调扇形 · 左键发射"
                        : "已退出鱼雷瞄准模式", "");
    } else {
      addMsg("当前座舰没有鱼雷", "bad");
    }
  }
  if (e.code === "KeyR") {
    if (G.player.startRepair()) addMsg("维修小组启动！（剩余 " + G.player.repairCharges + " 次）", "good");
  }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    G.shiftZoom = true;
    G.fovTarget = 14;                     // WoWS 式 Shift 狙击镜
  }
  if (e.code === "KeyF") {
    if (G.player.startSmoke()) addMsg("烟雾释放！规避敌方视野！", "good");
  }
  if (e.code === "KeyX") {
    // WoWS 式锁定：准星方向 ±8° 内最近的已点亮敌舰；再次按键解锁
    if (G.lockedTarget) {
      G.lockedTarget = null;
      addMsg("已解除锁定", "");
    } else {
      const dir = { x: Math.sin(G.camYaw), z: Math.cos(G.camYaw) };
      let best = null, bestAng = 0.14;   // ≈8°
      for (const s of G.ships) {
        if (!s.alive || s.team === G.player.team || !s.spottedBlue) continue;
        const dx = s.pos.x - G.player.pos.x, dz = s.pos.z - G.player.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const ang = Math.acos(THREE.MathUtils.clamp((dx * dir.x + dz * dir.z) / d, -1, 1));
        if (ang < bestAng) { bestAng = ang; best = s; }
      }
      if (best) {
        G.lockedTarget = best;
        addMsg("已锁定 " + best.name + "（X 解除）", "good");
      } else {
        addMsg("准星方向没有可锁定的目标", "bad");
      }
    }
  }
  if (e.code === "Digit1" && G.player.ammoType !== "he") {
    G.player.ammoType = "he";
    addMsg("已切换 HE 高爆弹（高起火率）", "");
  }
  if (e.code === "Digit2" && G.player.ammoType !== "ap") {
    G.player.ammoType = "ap";
    addMsg("已切换 AP 穿甲弹（可击穿核心区）", "");
  }
});
window.addEventListener("keyup", e => {
  keys[e.code] = false;
  if (e.code === "Space") G.wantFire = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    G.shiftZoom = false;
    G.fovTarget = [55, 30, 14][G.zoomIdx];
  }
});
function updateRudderInput() {
  if (!G.player) return;
  const l = keys["KeyA"] ? 1 : 0, r = keys["KeyD"] ? 1 : 0;
  // heading 增大 = 船头向屏幕左偏转，故按 A（左）给正值、按 D（右）给负值
  G.player.rudderTarget = l - r;
}

renderer.domElement.addEventListener("mousedown", e => {
  if (G.state !== "playing") return;
  // Pointer Lock 可用则尝试锁定；不可用（嵌入式浏览器）也不阻塞开火 —— 无锁定模式照常游玩
  if (document.pointerLockElement !== renderer.domElement) {
    try { renderer.domElement.requestPointerLock(); } catch (err) { /* 环境不支持 */ }
  }
  if (e.button === 0) {
    // 鱼雷模式下左键 = 发射鱼雷（WoWS）；否则主炮开火
    if (G.torpMode) tryPlayerTorpedo();
    else G.wantFire = true;
  }
  if (e.button === 2) G.freeLook = true;
});
window.addEventListener("mouseup", e => {
  if (e.button === 0) G.wantFire = false;
  if (e.button === 2) G.freeLook = false;
});
window.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("mousemove", e => {
  if (G.state !== "playing") return;
  if (document.pointerLockElement === renderer.domElement) {
    // Pointer Lock 模式（全屏/支持的浏览器）：相对位移控制
    const sens = 0.0021 * (G.fovCur / 55);
    if (!G.lockedTarget) G.camYaw -= e.movementX * sens;
    G.camPitch = THREE.MathUtils.clamp(G.camPitch + e.movementY * sens, -0.35, 1.1);
    const dy = -e.movementY;
    if (dy !== 0) {
      G.aimDistTarget = THREE.MathUtils.clamp(G.aimDistTarget * Math.exp(dy * 0.0028), 250, 16000);
    }
  } else {
    // 无锁定模式（嵌入式浏览器 fallback）：光标即准星，位置驱动瞄准
    G.mouseX = e.clientX;
    G.mouseY = e.clientY;
  }
});
window.addEventListener("wheel", e => {
  if (G.state !== "playing") return;
  // 鱼雷模式下滚轮调整扇形散布（WoWS 同款）
  if (G.torpMode) {
    G.torpSpread = THREE.MathUtils.clamp(G.torpSpread + (e.deltaY > 0 ? 2 : -2), 4, 40);
    return;
  }
  const levels = [55, 30, 14];
  G.zoomIdx = THREE.MathUtils.clamp(G.zoomIdx + (e.deltaY > 0 ? -1 : 1), 0, levels.length - 1);
  if (!G.shiftZoom) G.fovTarget = levels[G.zoomIdx];
});
/* ---------- ESC 暂停菜单 ---------- */
function openPauseMenu() {
  if (G.state !== "playing" || G.paused) return;
  G.paused = true;
  G.wantFire = false;
  for (const k in keys) keys[k] = false;
  G.torpMode = false;
  try { document.exitPointerLock && document.exitPointerLock(); } catch (err) { /* 忽略 */ }
  $("pause-menu").style.display = "flex";
}
function resumeGame() {
  if (!G.paused) return;
  G.paused = false;
  $("pause-menu").style.display = "none";
  try { renderer.domElement.requestPointerLock(); } catch (err) { /* 无锁定模式无需锁定 */ }
}
function togglePauseMenu() {
  if (G.paused) resumeGame(); else openPauseMenu();
}
document.addEventListener("pointerlockchange", () => {
  const unlocked = document.pointerLockElement !== renderer.domElement;
  // ESC 释放指针锁 → 弹出暂停菜单；重新锁定 → 收起菜单
  if (unlocked && G.state === "playing" && !G.plBroken && !G.paused) openPauseMenu();
  if (!unlocked) $("pause-menu").style.display = "none";
});
document.addEventListener("pointerlockerror", () => {
  // 嵌入式浏览器不支持 Pointer Lock → 启用无锁定模式（光标准星）
  G.plBroken = true;
  $("pause-hint").style.display = "none";
});
$("btn-resume").addEventListener("click", () => {
  AudioSys.uiClick();
  resumeGame();
});
$("btn-restart2").addEventListener("click", () => {
  AudioSys.uiClick();
  startGame();
});
$("btn-menu").addEventListener("click", () => {
  AudioSys.uiClick();
  backToMenu();
});
function backToMenu() {
  G.paused = false;
  G.state = "menu";
  G.lockedTarget = null;
  G.torpMode = false;
  G.wantFire = false;
  G.smokes = [];
  window.__tickErr = null;
  document.exitPointerLock && document.exitPointerLock();
  $("pause-menu").style.display = "none";
  el.hud.style.display = "none";
  el.screenEnd.style.display = "none";
  el.screenStart.style.display = "flex";
  spawnFleet();          // 主菜单背景展示编队
  G.camYaw = G.player.heading;
}

window.addEventListener("blur", () => {
  // 窗口失焦清空按键状态（防止切窗后按键卡死）
  for (const k in keys) keys[k] = false;
  G.wantFire = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================
 * 玩家动作
 * ============================================================ */
const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _tmpV = new THREE.Vector3();
const aimPoint = new THREE.Vector3();

function updateAim(dt) {
  const P = G.player;
  const plLocked = document.pointerLockElement === renderer.domElement;
  const dtAim = dt || 0.016;

  /* 锁定目标维护：死亡/未点亮/超远 → 自动解锁 */
  if (G.lockedTarget && (!G.lockedTarget.alive || !G.lockedTarget.spottedBlue ||
      P.pos.distanceTo(G.lockedTarget.pos) > 16000)) {
    G.lockedTarget = null;
    addMsg("已解除锁定", "");
  }

  if (plLocked) {
    /* —— Pointer Lock 模式：瞄准距离标尺（原有流程） —— */
    G.aimDist += (G.aimDistTarget - G.aimDist) * Math.min(1, 0.12);
    camera.getWorldDirection(_rayDir);
    _rayDir.y = 0;
    if (_rayDir.lengthSq() < 1e-8) _rayDir.set(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
    _rayDir.normalize();
    aimPoint.copy(P.pos).addScaledVector(_rayDir, G.aimDist);
    aimPoint.y = 0;
  } else {
    /* —— 无锁定模式（fallback）：准星 = 光标，瞄准 = 过光标的射线 —— */
    const nx = ((G.mouseX || window.innerWidth / 2) / window.innerWidth) * 2 - 1;
    const ny = -(((G.mouseY || window.innerHeight / 2) / window.innerHeight) * 2 - 1);
    _raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const rd = _raycaster.ray.direction;
    let t = rd.y < -0.001 ? -camera.position.y / rd.y : 9000;
    t = Math.min(t, 16000);
    aimPoint.copy(camera.position).addScaledVector(rd, Math.max(80, t));
    aimPoint.y = 0;
    // 边缘转向：光标靠近屏幕边缘时持续旋转视角（策略游戏标准方案）
    if (!G.lockedTarget && !G.freeLook) {
      const ex = Math.max(0, Math.abs(nx) - 0.22) / 0.78 * Math.sign(nx);
      const ey = Math.max(0, Math.abs(ny) - 0.18) / 0.82 * Math.sign(-ny);
      G.camYaw -= ex * ex * Math.sign(ex) * 2.1 * dtAim * (G.fovCur / 55);
      G.camPitch = THREE.MathUtils.clamp(G.camPitch - ey * ey * Math.sign(ey) * 1.3 * dtAim, -0.35, 1.1);
    }
  }

  /* 瞄准辅助：锁定目标优先；否则准星射线附近已点亮敌舰（阈值随变焦倍率缩小） */
  const v0 = P.cfg.guns.muzzleV;
  let best = null;
  if (G.lockedTarget && G.lockedTarget.alive && G.lockedTarget.spottedBlue) {
    best = G.lockedTarget;
  } else {
    let bestAng = Math.max(0.018, 0.062 * (G.fovCur / 55));
    camera.getWorldDirection(_rayDir);
    if (!plLocked) {
      // 无锁定模式：射线方向 = 从相机穿过光标
      const nx = ((G.mouseX || window.innerWidth / 2) / window.innerWidth) * 2 - 1;
      const ny = -(((G.mouseY || window.innerHeight / 2) / window.innerHeight) * 2 - 1);
      _raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      _rayDir.copy(_raycaster.ray.direction);
    }
    for (const s of G.ships) {
      if (!s.alive || s.team === P.team || !s.spottedBlue) continue;
      _tmpV.set(s.pos.x - camera.position.x, s.cfg.freeboard * 0.5 - camera.position.y, s.pos.z - camera.position.z).normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(_tmpV.dot(_rayDir), -1, 1));
      if (ang < bestAng) { bestAng = ang; best = s; }
    }
  }
  if (best) {
    const dist = P.pos.distanceTo(best.pos);
    let tof = dist / v0;
    for (let i = 0; i < 2; i++) {
      const e = ballisticAngle(P.pos, best.pos, v0);
      tof = dist / (v0 * Math.cos(e === null ? 0.35 : e));
    }
    const tv = best.velocity();
    aimPoint.set(best.pos.x + tv.x * tof, 0, best.pos.z + tv.z * tof);
  }
  G.aimLocked = !!best;
  // 瞄准方向（鱼雷扇形/发射共用）：由最终弹着点反推
  G.aimYaw = Math.atan2(aimPoint.x - P.pos.x, aimPoint.z - P.pos.z);

  if (!G.freeLook) P.aimPoint = aimPoint;

  // 瞄准距离读数（俯仰反馈：压低鼠标 = 近距平射，抬高 = 远距仰射）
  const d = P.pos.distanceTo(aimPoint);
  el.aimDist.textContent = (d / 1000).toFixed(1) + " km";

  // 射程限制
  const range = P.cfg.guns.range;
  if (d > range) {
    el.oor.style.display = "block";
    const cl = aimPoint.clone().sub(P.pos).setLength(range).add(P.pos);
    if (!G.freeLook) P.aimPoint = cl;
  } else {
    el.oor.style.display = "none";
  }

  // HUD 散布椭圆（近似投影）；辅助瞄准锁定时准星变金色
  const disp = P.cfg.guns.dispBase + Math.min(d, range) * P.cfg.guns.dispK;
  const px = Math.min(260, disp / Math.max(200, d) * (window.innerHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(G.fovCur / 2)) * 2.2);
  el.dispersion.style.width = px + "px";
  el.dispersion.style.height = px + "px";
  el.dispersion.style.borderColor = G.aimLocked ? "rgba(240,183,74,0.9)" : "rgba(240,183,74,0.35)";
  $("crosshair").style.opacity = G.aimLocked ? "1" : "0.75";

  // 无锁定模式：准星与散布圈跟随光标位置
  if (!plLocked && G.state === "playing") {
    const mx = G.mouseX ?? window.innerWidth / 2;
    const my = G.mouseY ?? window.innerHeight / 2;
    $("crosshair").style.left = mx + "px";
    $("crosshair").style.top = my + "px";
    el.dispersion.style.left = mx + "px";
    el.dispersion.style.top = my + "px";
  } else {
    $("crosshair").style.left = "50%";
    $("crosshair").style.top = "50%";
    el.dispersion.style.left = "50%";
    el.dispersion.style.top = "50%";
  }
}

function tryPlayerFire() {
  const P = G.player;
  const r = P.fireGuns();
  if (!r) return;
  r.shells.forEach(sh => {
    G.shells.push(new Shell(P, sh.from, sh.to, sh.v, r.ammo));
    const dir = new THREE.Vector3().subVectors(sh.to, sh.from).normalize();
    FX.muzzleFlash(sh.from.x, sh.from.y, sh.from.z, dir, 1.35);
  });
  G.stats.shots += r.shells.length;
  AudioSys.gun(r.power, 1);
  G.shake = Math.min(1.2, G.shake + 0.35);
}

function tryPlayerTorpedo() {
  const P = G.player;
  const list = P.fireTorpedoes(G.aimYaw, G.torpSpread);
  if (!list) return;
  list.forEach(t => G.torps.push(new Torpedo(P, t.x, t.z, t.heading)));
  AudioSys.torpedoLaunch();
  addMsg("鱼雷出管！", "good");
}

/* ---------- 鱼雷告警 ---------- */
let torpWarnT = 0;
function updateTorpWarning(dt) {
  const P = G.player;
  let warn = false;
  for (const t of G.torps) {
    if (t.owner.team !== "red") continue;
    const dx = P.pos.x - t.pos.x, dz = P.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1900) continue;
    const toP = Math.atan2(dx, dz);
    if (Math.abs(angNorm(toP - t.heading)) < 0.5) { warn = true; break; }
  }
  el.torpWarn.style.display = warn ? "block" : "none";
  torpWarnT -= dt;
  if (warn && torpWarnT <= 0) { torpWarnT = 2.2; AudioSys.warning(); }
}

/* ============================================================
 * 舰体碰撞（岛屿 / 舰间 / 边界）
 * ============================================================ */
function resolveCollisions(dt) {
  // 撞击冷却
  for (const s of G.ships) if (s.ramCd > 0) s.ramCd -= dt;
  for (const s of G.ships) {
    if (!s.alive) continue;
    // 岛屿（多圆拟合）
    for (const c of G.islandCols) {
      const dx = s.pos.x - c.x, dz = s.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const minD = c.r * 0.85 + s.cfg.beam * 0.5;
      if (d < minD && d > 0.01) {
        s.pos.x = c.x + dx / d * minD;
        s.pos.z = c.z + dz / d * minD;
        s.speed *= 0.94;
      }
    }
    // 战区边界
    const B = 5600;
    if (Math.abs(s.pos.x) > B) { s.pos.x = Math.sign(s.pos.x) * B; s.speed *= 0.96; }
    if (Math.abs(s.pos.z) > B) { s.pos.z = Math.sign(s.pos.z) * B; s.speed *= 0.96; }
  }
      // 舰间推开 + 撞击伤害（WoWS 撞击机制：高速相撞双方受创；友军相撞无伤）
      for (let i = 0; i < G.ships.length; i++) {
        for (let j = i + 1; j < G.ships.length; j++) {
          const a = G.ships[i], b = G.ships[j];
          if (!a.alive || !b.alive) continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const d = Math.hypot(dx, dz);
          const minD = (a.cfg.length + b.cfg.length) * 0.28;
          if (d < minD && d > 0.01) {
            // 撞击判定：接近速度高、敌我双方（友军无伤）、不在冷却
            const relV = Math.abs(a.speed) + Math.abs(b.speed);
            const friendly = a.team === b.team;
            if (relV > 4 && !friendly && !(a.ramCd > 0) && !(b.ramCd > 0)) {
              const dmg = Math.round(relV * 1400 * (0.8 + Math.random() * 0.4));
              const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
              a.applyDamage(dmg, {}); b.applyDamage(dmg, {});
              a.ramCd = 1.2; b.ramCd = 1.2;
              a.speed *= 0.25; b.speed *= 0.25;
              FX.explosion(mx, 4, mz, 2.2, true);
              AudioSys.explosion(true, 0.8);
              if (a.isPlayer || b.isPlayer) addMsg("舰船相撞！-" + dmg, "bad");
            }
            const push = (minD - d) / 2;
            a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
            b.pos.x += dx / d * push; b.pos.z += dz / d * push;
          }
        }
      }
}

/* ---------- 弹着点水面标记（金色圆环，辅助锁定时高亮） ---------- */
const aimMarker = (() => {
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.86, 1.0, 40).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf0b74a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  const dotGeo = new THREE.CircleGeometry(0.22, 20).rotateX(-Math.PI / 2);
  const dot = new THREE.Mesh(dotGeo, ringMat);
  group.add(ring); group.add(dot);
  group.visible = false;
  group.renderOrder = 8;
  scene.add(group);
  return { group, mat: ringMat };
})();

/* ---------- 鱼雷扇形瞄准指示（WoWS 式：边界线 + 中线 + 末端弧） ---------- */
const torpAim = (() => {
  const group = new THREE.Group();
  const mats = [];
  const mkLine = (w) => {
    const geo = new THREE.PlaneGeometry(w, 6000).rotateX(-Math.PI / 2);
    geo.translate(0, 0, 3000);                       // 从船端向前延伸
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    mats.push(mat);
    return mesh;
  };
  const left = mkLine(1.1), right = mkLine(1.1), center = mkLine(0.7);
  // 末端弧（6000m 处横线）
  const end = mkLine(0.9);
  end.geometry = new THREE.PlaneGeometry(220, 1.0).rotateX(-Math.PI / 2);
  end.position.z = 0;
  end.geometry.translate(0, 0, 6000);
  group.visible = false;
  group.renderOrder = 7;
  scene.add(group);
  return { group, mats, left, right, center, end };
})();

/* ---------- 锁定目标标记（红色旋转环） ---------- */
const lockMarker = (() => {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff5f4a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 4).rotateX(-Math.PI / 2), mat);
  group.add(ring);
  group.visible = false;
  group.renderOrder = 8;
  scene.add(group);
  return { group, mat };
})();

/* ============================================================
 * 相机
 * ============================================================ */
const camPos = new THREE.Vector3(0, 200, -4100);
const camLook = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
function updateCamera(dt) {
  // 观战模式：玩家沉没后跟随最近存活友舰（无友舰则停留在沉船残骸处）
  let watch = G.player;
  G.spectating = false;
  if (!G.player.alive && G.state === "playing") {
    const allies = G.ships.filter(s => s.alive && s.team === "blue" && !s.isPlayer);
    if (allies.length) { watch = allies[0]; G.spectating = true; }
  }
  // 锁定目标：视角平滑跟随目标方位（WoWS 的 X 锁）
  if (G.lockedTarget && G.lockedTarget.alive) {
    const bearing = Math.atan2(G.lockedTarget.pos.x - watch.pos.x, G.lockedTarget.pos.z - watch.pos.z);
    const ldiff = angNorm(bearing - G.camYaw);
    G.camYaw = angNorm(G.camYaw + ldiff * Math.min(1, dt * 3));
  } else {
    // 大偏差时缓慢回正跟随舰的船首方向
    const diff = angNorm(watch.heading - G.camYaw);
    if (Math.abs(diff) > Math.PI / 3) G.camYaw = angNorm(G.camYaw + Math.sign(diff) * Math.min(Math.abs(diff) - Math.PI / 3, dt * 0.4));
  }

  // 自由视角：球坐标（yaw + pitch），视线与瞄准解耦、始终能看到跟随舰
  // 变焦时相机同步拉近，越过船顶观察远方目标
  const dist = 300 - G.zoomIdx * 75;
  const cp = Math.cos(G.camPitch), sp = Math.sin(G.camPitch);
  const cx = watch.pos.x - Math.sin(G.camYaw) * cp * dist;
  const cz = watch.pos.z - Math.cos(G.camYaw) * cp * dist;
  // 仰视（pitch<0）时相机保持在海面上方，避免沉入水下
  const cy = Math.max(26, 42 + sp * dist) + waveHeight(cx, cz, G.time) * 0.3;
  camPos.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 6));

  const look = camPos.clone().addScaledVector(_viewDir.set(Math.sin(G.camYaw) * cp, -sp, Math.cos(G.camYaw) * cp), 1000);
  camLook.lerp(look, Math.min(1, dt * 10));

  // 抖动（观战时不抖）
  G.shake = G.spectating ? 0 : Math.max(0, G.shake - dt * 1.8);
  const sk = G.shake * G.shake * 6;
  camera.position.set(
    camPos.x + (Math.random() - 0.5) * sk,
    camPos.y + (Math.random() - 0.5) * sk,
    camPos.z + (Math.random() - 0.5) * sk);
  camera.lookAt(camLook);

  // FOV 变焦
  G.fovCur += (G.fovTarget - G.fovCur) * Math.min(1, dt * 6);
  if (Math.abs(G.fovCur - camera.fov) > 0.05) {
    camera.fov = G.fovCur;
    camera.updateProjectionMatrix();
  }

  // 弹着点标记跟随（观战时隐藏）
  aimMarker.group.position.set(aimPoint.x, 1.2, aimPoint.z);
  const s = Math.max(6, camera.position.distanceTo(aimPoint) * 0.012);
  aimMarker.group.scale.set(s, 1, s);
  aimMarker.group.visible = G.state === "playing" && G.player.alive && !G.torpMode;
  aimMarker.mat.color.setHex(G.aimLocked ? 0xffd98a : 0xf0b74a);
  aimMarker.mat.opacity = G.aimLocked ? 0.95 : 0.7;

  // 鱼雷扇形瞄准指示（观战时隐藏）
  const P2 = G.player;
  const torpAvail = P2.cfg.torp && P2.alive;
  torpAim.group.visible = G.state === "playing" && G.torpMode && torpAvail;
  if (torpAim.group.visible) {
    torpAim.group.position.set(P2.pos.x, 0.9, P2.pos.z);
    torpAim.group.rotation.y = G.aimYaw;
    const half = THREE.MathUtils.degToRad(G.torpSpread) / 2;
    torpAim.left.rotation.y = -half;
    torpAim.right.rotation.y = half;
    torpAim.end.scale.x = Math.max(0.05, (6000 * Math.tan(half) * 2) / 220);   // 末端弧随散布角变宽
    const ready = P2.torpReady;
    torpAim.mats.forEach(m => {
      m.color.setHex(ready ? 0xffd98a : 0x7d8a94);
      m.opacity = ready ? 0.75 : 0.3;
    });
  }

  // 锁定目标 3D 标记（红色旋转环；观战时保留可看友军锁定情况）
  if (G.lockedTarget && G.lockedTarget.alive && G.state === "playing") {
    const lt = G.lockedTarget;
    lockMarker.group.visible = true;
    lockMarker.group.position.set(lt.pos.x, 2, lt.pos.z);
    const ls = Math.max(24, camera.position.distanceTo(lt.pos) * 0.02);
    lockMarker.group.scale.set(ls, 1, ls);
    lockMarker.group.rotation.y += dt * 1.6;
  } else {
    lockMarker.group.visible = false;
  }
}

/* ============================================================
 * HUD 刷新
 * ============================================================ */
const THROTTLE_NAMES = ["全速倒车", "半速倒车", "停船", "半速前进", "全速前进"];
let hudAcc = 0;
function updateHUD(dt) {
  const P = G.player;
  const spectating = !P.alive && G.state === "playing";
  // 观战模式：面板显示跟随舰（最近存活友舰），武器控件隐藏
  const watch = spectating ? (G.ships.find(s => s.alive && s.team === "blue" && !s.isPlayer) || P) : P;
  if (G.spectating !== undefined && G.spectating !== spectating) {
    // 观战状态切换时更新跟随舰血条名称
    $("hp-name").firstElementChild.textContent = watch.name + " · " + watch.cfg.name;
  }
  G.spectating = spectating;

  // 航速表（观战显示跟随舰航速）
  const kn = Math.abs(watch.speed) / KNOT;
  el.speed.innerHTML = kn.toFixed(0) + "<small>节</small>";
  el.throttle.textContent = spectating ? "观战中" : THROTTLE_NAMES[watch.throttleIdx];
  // 舵轮指示：按 A（左舵，rudder=+1）时指针应指左
  el.rudder.style.left = (50 - watch.rudder * 46) + "%";

  // 血量（观战显示跟随舰血量）
  const hpk = Math.max(0, watch.hp / watch.hpMax);
  el.hpFill.style.width = hpk * 100 + "%";
  el.hpFill.classList.toggle("low", hpk < 0.35);
  el.hpText.textContent = Math.max(0, Math.round(watch.hp));

  // 武器面板（观战时半透明表示不可用）
  $("gun-panel").style.opacity = spectating ? "0.35" : "1";

  // 弹种指示
  $("ammo-ap").classList.toggle("on", P.ammoType === "ap");
  $("ammo-he").classList.toggle("on", P.ammoType === "he");

  // 状态效果行（进水 / 起火 / 被侦测 / 烟雾 / 锁定 / 观战）
  const fx = [];
  if (spectating) fx.push('<span class="fx smoky">👥 观战模式 · 跟随 ' + watch.name + '</span>');
  else {
    if (P.flooding) fx.push('<span class="fx flood">⚠ 进水</span>');
    if (P.fires.length) fx.push('<span class="fx fire">🔥 起火</span>');
    if (G.playerSpotted) fx.push('<span class="fx spotted">👁 已被敌方侦测</span>');
    P.inSmoke = G.smokes.some(sm => (P.pos.x - sm.x) ** 2 + (P.pos.z - sm.z) ** 2 < sm.r * sm.r);
    if (P.inSmoke) fx.push('<span class="fx smoky">🌫 烟雾中</span>');
  }
  if (G.lockedTarget) fx.push('<span class="fx locked">🔒 ' + G.lockedTarget.name + '</span>');
  $("status-row").innerHTML = fx.join("");
  // 准星锁定态 + 观战隐藏准星
  $("crosshair").classList.toggle("locked", !!G.lockedTarget);
  $("crosshair").style.display = spectating ? "none" : "block";
  el.dispersion.style.display = spectating ? "none" : "block";

  // WoWS 准星装填弧（观战隐藏弧线）
  const turrets = watch.model.turrets;
  const readyN = turrets.filter(t => t.reload <= 0).length;
  const CIRC = 2 * Math.PI * 34;
  const arc = $("ch-arc");
  const ratio = readyN / turrets.length;
  const arcWrap = document.querySelector(".ch-reload");
  arcWrap.style.display = spectating ? "none" : "block";
  arc.setAttribute("stroke-dashoffset", (CIRC * (1 - ratio)).toFixed(1));
  arc.setAttribute("stroke", ratio >= 1 ? "#9fe6a8" : "#f0b74a");

  // 维修小组指示（观战时隐藏）
  const ri = $("repair-ind");
  if (spectating) { ri.textContent = "观战模式"; ri.className = "empty"; }
  else {
    const dots = "◇".repeat(P.repairCharges) + "·".repeat(3 - P.repairCharges);
    if (P.repairing) { ri.textContent = "⚙ 维修中… " + P.repairT.toFixed(0) + "s"; ri.className = "active"; }
    else if (P.repairCharges > 0) { ri.textContent = "维修小组 [R] " + dots; ri.className = ""; }
    else { ri.textContent = "维修小组耗尽"; ri.className = "empty"; }
  }

  // 主炮（每座炮塔独立装填：进度条 = 最先就绪的炮塔；文案 = 已就绪 x/y）
  const g = P.cfg.guns;
  {
    const turrets = P.model.turrets;
    const readyN = turrets.filter(t => t.reload <= 0).length;
    // 最先就绪的炮塔的剩余进度（部分齐射即将到来的时间）
    let best = 1;
    for (const t of turrets) {
      const k = t.reload <= 0 ? 0 : t.reload / g.reload;
      if (k < best) best = k;
    }
    el.gunFill.style.width = ((1 - best) * 100) + "%";
    el.gunFill.classList.toggle("ready", readyN === turrets.length);
    const aligned = P.gunsAligned();
    let txt;
    if (readyN === turrets.length) txt = aligned > 0 ? "全炮塔就绪" : "炮塔转向中…";
    else if (readyN > 0) txt = aligned > 0 ? `${readyN}/${turrets.length} 塔就绪 · 可开火` : `${readyN}/${turrets.length} 塔就绪 · 转向中…`;
    else txt = `装填中 ${Math.max(...turrets.map(t => t.reload)).toFixed(1)}s`;
    el.gunStatus.textContent = txt;
    el.gunStatus.classList.toggle("ready", aligned > 0 && readyN > 0);
  }

  // 鱼雷（无鱼雷的舰种隐藏该行；圆点数 = 模型上的发射管座数，每座独立装填）
  $("torp-row").style.display = P.cfg.torp ? "flex" : "none";
  if (P.cfg.torp && P.torpTubes) {
    const dotsWrap = $("torp-dots");
    if (dotsWrap.childElementCount !== P.torpTubes.length) {
      dotsWrap.innerHTML = "";
      P.torpTubes.forEach(() => {
        const d = document.createElement("span");
        d.className = "torp-dot";
        dotsWrap.appendChild(d);
      });
    }
    P.torpTubes.forEach((tb, i) => {
      const dot = dotsWrap.children[i];
      if (dot) dot.classList.toggle("on", tb.reload <= 0);
    });
  }

  // 计时
  const tl = Math.max(0, G.timeLeft);
  el.timer.textContent = `${String(Math.floor(tl / 60)).padStart(2, "0")}:${String(Math.floor(tl % 60)).padStart(2, "0")}`;

  hudAcc += dt;
  if (hudAcc > 0.1) {
    hudAcc = 0;
    updateLabels();
    drawMinimap();
    // 点亮信息（随探测刷新）
    const si = $("spot-info");
    si.innerHTML = G.spotCount > 0
      ? `视野内敌舰 <span class="warn">${G.spotCount}</span> 艘`
      : "视野内无敌舰";
    // 底部操作提示（鱼雷模式下切换为鱼雷提示）
    $("hint").textContent = G.torpMode
      ? `鱼雷瞄准 · 散布 ${G.torpSpread}° · 左键发射 · 滚轮调散布 · T/3 退出`
      : "左键齐射 · 滚轮瞄准镜 · 右键按住自由视角 · T/3 鱼雷 · Shift 狙击";
  }
  updateDmgNums(dt);
}

/* ============================================================
 * 开始 / 结束
 * ============================================================ */
function startGame() {
  AudioSys.init();
  AudioSys.resume();
  AudioSys.uiClick();
  spawnFleet();
  G.state = "playing";
  G.paused = false;
  $("pause-menu").style.display = "none";
  // 环境 roll：随机天气 + 清晨出发，局内时间推进至黄昏
  const roll = Math.random();
  ENV.weather = roll < 0.55 ? "clear" : roll < 0.82 ? "cloudy" : "storm";
  ENV.timeOfDay = 0.32 + Math.random() * 0.1;
  ENV.advance = true;
  ENV.windYaw = Math.random() * Math.PI * 2;
  ENV.thunderT = 8 + Math.random() * 10;
  G.smokes = [];
  window.__tickErr = null;
  el.screenStart.style.display = "none";
  el.screenEnd.style.display = "none";
  el.hud.style.display = "block";
  if (!G.plBroken) $("pause-hint").style.display = "flex";
  addMsg("战斗开始！全舰队突击！", "good");
}
$("btn-start").addEventListener("click", startGame);
$("btn-restart").addEventListener("click", startGame);

function endGame(win, reason) {
  if (G.state === "over") return;
  G.state = "over";
  G.wantFire = false;
  document.exitPointerLock && document.exitPointerLock();
  $("pause-hint").style.display = "none";
  const acc = G.stats.shots > 0 ? (G.stats.hits / G.stats.shots * 100).toFixed(0) : 0;
  el.endTitle.textContent = win ? "胜 利" : "战 败";
  el.endTitle.className = win ? "win" : "lose";
  el.endStats.innerHTML =
    `${reason}<br>` +
    `击沉敌舰 <b>${G.stats.kills}</b> 艘 · 造成伤害 <b>${G.stats.damage}</b><br>` +
    `主炮命中率 <b>${acc}%</b>（${G.stats.hits} / ${G.stats.shots}）`;
  el.screenEnd.style.display = "flex";
  win ? AudioSys.victory() : AudioSys.defeat();
}

/* ============================================================
 * 主循环
 * ============================================================ */
/* ---------- 编队配置 UI（$ 与 AudioSys 就绪后绑定） ---------- */
function bindFleetCfg(btnId, delta, key, spanId) {
  $(btnId).addEventListener("click", () => {
    FLEET_CFG[key] = THREE.MathUtils.clamp(FLEET_CFG[key] + delta, 1, FLEET_MAX);
    $(spanId).textContent = FLEET_CFG[key];
    AudioSys.uiClick();
  });
}
bindFleetCfg("btn-blue-minus", -1, "blue", "cfg-blue");
bindFleetCfg("btn-blue-plus", 1, "blue", "cfg-blue");
bindFleetCfg("btn-red-minus", -1, "red", "cfg-red");
bindFleetCfg("btn-red-plus", 1, "red", "cfg-red");

/* ---------- 舰种选择卡片（9 艘，按舰种分组） ---------- */
const CLS_LABEL = { dd: "驱逐舰", ca: "巡洋舰", bb: "战列舰" };
const NATION_FLAG = { ijn: "🇯🇵", usn: "🇺🇸", rn: "🇬🇧", km: "🇩🇪" };
function buildShipCards() {
  const box = $("ship-pick");
  box.innerHTML = "";
  const groups = { dd: [], ca: [], bb: [] };
  Object.keys(SHIP_TYPES).forEach(k => groups[SHIP_TYPES[k].cls].push(k));
  groups.dd.forEach(k => box.appendChild(makeCard(k)));
  groups.ca.forEach(k => box.appendChild(makeCard(k)));
  groups.bb.forEach(k => box.appendChild(makeCard(k)));
}
function makeCard(k) {
  const c = SHIP_TYPES[k];
  const card = document.createElement("div");
  card.className = "ship-card" + (FLEET_CFG.playerType === k ? " sel" : "");
  card.innerHTML =
    '<div class="nm">' + NATION_FLAG[c.nation] + " " + c.ship + '</div>' +
    '<div class="cls">' + c.name + '</div>' +
    '<div class="stats">' +
    '血量 <b>' + (c.hp / 10000).toFixed(1) + ' 万</b><br>' +
    '航速 <b>' + c.maxKn + ' 节</b><br>' +
    '主炮 <b>' + c.guns.mounts + '×' + c.guns.barrels + ' 联装</b><br>' +
    '鱼雷 <b>' + (c.torp ? c.torp.tubes + '×' + c.torp.salvo + ' 联 (' + (c.torp.dmg / 1000) + 'k)' : "无") + '</b><br>' +
    '副炮 <b>' + (c.secondary ? (Math.round(c.secondary.range / 100) / 10) + 'km' : "无") + '</b> · 烟 <b>' + (c.smoke ? "✓" : "—") + '</b>' +
    '</div>';
  card.addEventListener("click", () => {
    FLEET_CFG.playerType = k;
    buildShipCards();
    AudioSys.uiClick();
  });
  return card;
}
buildShipCards();

initEnvironment();
FX.init(scene);        // 初始化粒子特效池（必须在任何舰船更新之前）
buildIslands();
spawnFleet();          // 菜单背景展示舰队
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  try {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (G.paused) { renderer.render(scene, camera); return; }   // ESC 暂停：画面冻结
    G.time += dt;
    oceanMat.uniforms.uTime.value = G.time;
    updateEnvironment(dt);

    if (G.state === "playing") {
      G.timeLeft -= dt;
      if (G.timeLeft <= 0) endGame(false, "战斗超时，弹药耗尽");

      updateRudderInput();
      if (G.wantFire && G.player.alive) tryPlayerFire();   // 按住即自动齐射

      // 隐蔽/点亮 → 舰船 & AI
      updateDetection(dt);
      G.ships.forEach(s => s.update(dt, G.time));
      G.ais.forEach(ai => ai.update(dt));

      // 炮弹 / 鱼雷
      for (let i = G.shells.length - 1; i >= 0; i--) {
        const sh = G.shells[i];
        sh.update(dt);
        if (!sh.alive) G.shells.splice(i, 1);
      }
      for (let i = G.torps.length - 1; i >= 0; i--) {
        const tp = G.torps[i];
        tp.update(dt);
        if (!tp.alive) G.torps.splice(i, 1);
      }

      // 移除沉底舰船
      for (let i = G.ships.length - 1; i >= 0; i--) {
        if (G.ships[i].remove) {
          scene.remove(G.ships[i].model.root);
          if (G.ships[i]._label) G.ships[i]._label.remove();
          G.ships.splice(i, 1);
        }
      }

      // 烟幕区：寿命衰减 + 烟团粒子
      for (const sm of G.smokes) {
        sm.life -= dt;
        if (Math.random() < 0.55) FX.smokeCloud(sm.x, sm.z, sm.r);
      }
      G.smokes = G.smokes.filter(sm => sm.life > 0);

      resolveCollisions(dt);
      updateAim(dt);
      updateTorpWarning(dt);
      AudioSys.engineSet(G.player.speedFactor(), G.player.alive);
      updateHUD(dt);
    } else {
      // 菜单 / 结束画面：舰队待机缓慢巡航展示
      G.ships.forEach(s => s.update(dt, G.time));
    }

    FX.update(dt);
    if (G.player) updateCamera(dt);
    renderer.render(scene, camera);
  } catch (e) {
    // 单帧异常不终止循环（并上报便于诊断）
    if (!window.__tickErr) window.__tickErr = e.message + " @ " + String(e.stack).split("\n")[1];
  }
}
tick();
