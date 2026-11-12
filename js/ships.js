/* ============================================================
 * ships.js — 舰船定义 / 程序化建模 / 航行物理 / 火炮与鱼雷 / AI
 * ============================================================ */
"use strict";

const KNOT = 0.98;           // 节→m/s（含 1.9x 游戏时间压缩，节数显示与 WoWS 一致）
const GRAV = 9.81;

/* ---------------- 舰种配置 ---------------- */
/* ============================================================
 * 舰种数据（按《战舰世界》官方数值复刻，9 艘可选）
 * 距离（射程/隐蔽/鱼雷射程）按地图比例 ×0.32 缩放；
 * 血量/伤害/装填/航速/鱼雷速度为 WoWS 原值。
 * cls: 逻辑舰种类（dd/ca/bb），nation: 阵营（影响涂装）
 * ============================================================ */
const SHIP_TYPES = {
  /* ===== 驱逐舰 ===== */
  mutsuki: {
    cls: "dd", nation: "ijn", name: "驱逐舰", ship: "睦月",
    length: 102, beam: 9.2, draft: 3.0, freeboard: 4.5,
    hp: 15100, maxKn: 35.5, accel: 1.6, turnDeg: 7.5, bankMax: 0.12,
    conceal: { sea: 2000, bloom: 2700, bloomTime: 10 },
    guns: { mounts: 4, barrels: 1, reload: 9, muzzleV: 750, traverse: 12,
            dmgMin: 2000, dmgMax: 2400, heDmg: 1650, heFire: 0.07, apFire: 0.04,
            citChance: 0.03, citMul: 2,
            dispBase: 8, dispK: 0.012, range: 2950, power: 1,
            mountZs: [0.36, 0.2, -0.24, -0.38], gunStyle: "open" },
    torp: { salvo: 3, tubes: 2, reload: 40, speed: 62, dmg: 16233, range: 2600 },
    smoke: { charges: 3, radius: 280, dur: 25 },
    model: { funnels: 2, torpPer: 3 },
  },
  farragut: {
    cls: "dd", nation: "usn", name: "驱逐舰", ship: "法拉格特",
    length: 104, beam: 10.8, draft: 3.1, freeboard: 4.6,
    hp: 15300, maxKn: 35, accel: 1.6, turnDeg: 7.0, bankMax: 0.12,
    conceal: { sea: 2250, bloom: 2950, bloomTime: 10 },
    guns: { mounts: 4, barrels: 1, reload: 4.5, muzzleV: 790, traverse: 12,
            dmgMin: 1950, dmgMax: 2250, heDmg: 1800, heFire: 0.05, apFire: 0.04,
            citChance: 0.03, citMul: 2,
            dispBase: 8, dispK: 0.012, range: 3500, power: 1,
            mountZs: [0.36, 0.2, -0.24, -0.38], gunStyle: "open" },
    torp: { salvo: 4, tubes: 2, reload: 45, speed: 55, dmg: 14400, range: 2100 },
    smoke: { charges: 3, radius: 280, dur: 25 },
    model: { funnels: 2, torpPer: 4 },
  },
  lightning: {
    cls: "dd", nation: "rn", name: "驱逐舰", ship: "闪电",
    length: 110, beam: 11.0, draft: 3.2, freeboard: 4.8,
    hp: 17600, maxKn: 35, accel: 1.6, turnDeg: 7.2, bankMax: 0.12,
    conceal: { sea: 1950, bloom: 2650, bloomTime: 10 },
    guns: { mounts: 3, barrels: 2, reload: 4, muzzleV: 780, traverse: 12,
            dmgMin: 1950, dmgMax: 2250, heDmg: 1700, heFire: 0.10, apFire: 0.04,
            citChance: 0.03, citMul: 2,
            dispBase: 8, dispK: 0.012, range: 3400, power: 1,
            mountZs: [0.30, 0.10, -0.25], gunStyle: "twin" },
    torp: { salvo: 4, tubes: 2, reload: 70, speed: 62, dmg: 16100, range: 2600 },
    smoke: { charges: 3, radius: 280, dur: 25 },
    model: { funnels: 1, torpPer: 4 },
  },

  /* ===== 巡洋舰 ===== */
  cleveland: {
    cls: "ca", nation: "usn", name: "巡洋舰", ship: "克利夫兰",
    length: 185, beam: 20.2, draft: 7.0, freeboard: 8.5,
    hp: 35500, maxKn: 32.5, accel: 1.1, turnDeg: 4.6, bankMax: 0.08,
    conceal: { sea: 3500, bloom: 4700, bloomTime: 12 },
    guns: { mounts: 4, barrels: 3, reload: 7.5, muzzleV: 780, traverse: 8,
            dmgMin: 3000, dmgMax: 3600, heDmg: 2200, heFire: 0.12, apFire: 0.05,
            citChance: 0.08, citMul: 2.3,
            dispBase: 13, dispK: 0.013, range: 4300, power: 2,
            mountZs: [0.315, 0.2, -0.22, -0.335], gunStyle: "twin" },
    torp: null,     // 克利夫兰级历史上无鱼雷武备（与模型一致）
    smoke: { charges: 2, radius: 280, dur: 22 },
    model: { funnels: 2 },
  },
  myoko: {
    cls: "ca", nation: "ijn", name: "巡洋舰", ship: "妙高",
    length: 200, beam: 19.0, draft: 6.6, freeboard: 9.0,
    hp: 41000, maxKn: 35, accel: 1.1, turnDeg: 4.4, bankMax: 0.08,
    conceal: { sea: 3700, bloom: 4900, bloomTime: 12 },
    guns: { mounts: 5, barrels: 2, reload: 12, muzzleV: 820, traverse: 7,
            dmgMin: 4350, dmgMax: 5050, heDmg: 3400, heFire: 0.08, apFire: 0.05,
            citChance: 0.10, citMul: 2.3,
            dispBase: 13, dispK: 0.013, range: 5050, power: 2,
            mountZs: [0.32, 0.24, 0.14, -0.2, -0.32], gunStyle: "twin" },
    torp: { salvo: 3, tubes: 2, reload: 75, speed: 62, dmg: 17233, range: 3200 },
    secondary: { range: 2200, reload: 5, dmg: 200, fire: 0.03, hit: 0.6 },
    model: { funnels: 2, torpPer: 3 },
  },
  atago: {
    cls: "ca", nation: "ijn", name: "巡洋舰", ship: "爱宕",
    length: 203, beam: 19.0, draft: 6.8, freeboard: 9.2,
    hp: 43700, maxKn: 35, accel: 1.1, turnDeg: 4.4, bankMax: 0.08,
    conceal: { sea: 3250, bloom: 4450, bloomTime: 12 },
    guns: { mounts: 5, barrels: 2, reload: 12.5, muzzleV: 820, traverse: 7,
            dmgMin: 4350, dmgMax: 5050, heDmg: 3400, heFire: 0.08, apFire: 0.05,
            citChance: 0.10, citMul: 2.3,
            dispBase: 13, dispK: 0.013, range: 5050, power: 2,
            mountZs: [0.32, 0.24, 0.14, -0.2, -0.32], gunStyle: "twin" },
    torp: { salvo: 4, tubes: 2, reload: 90, speed: 62, dmg: 17233, range: 3200 },
    secondary: { range: 2200, reload: 5, dmg: 200, fire: 0.03, hit: 0.6 },
    smoke: { charges: 2, radius: 280, dur: 22 },
    model: { funnels: 2, torpPer: 4 },
  },

  /* ===== 战列舰 ===== */
  nagato: {
    cls: "bb", nation: "ijn", name: "战列舰", ship: "长门",
    length: 215, beam: 29.0, draft: 9.2, freeboard: 10.5,
    hp: 65300, maxKn: 25, accel: 0.8, turnDeg: 3.4, bankMax: 0.06,
    conceal: { sea: 4900, bloom: 6300, bloomTime: 15 },
    guns: { mounts: 4, barrels: 2, reload: 30, muzzleV: 810, traverse: 5,
            dmgMin: 11000, dmgMax: 13200, heDmg: 6500, heFire: 0.30, apFire: 0.05,
            citChance: 0.14, citMul: 2.4,
            dispBase: 22, dispK: 0.021, range: 6800, power: 3,
            mountZs: [0.335, 0.215, -0.27, -0.385], gunStyle: "twin" },
    torp: null,
    secondary: { range: 2100, reload: 4, dmg: 280, fire: 0.05, hit: 0.65 },
    model: { funnels: 2, bentFunnel: true },
  },
  bismarck: {
    cls: "bb", nation: "km", name: "战列舰", ship: "俾斯麦",
    length: 250, beam: 36.0, draft: 10.0, freeboard: 11.0,
    hp: 79300, maxKn: 30, accel: 0.8, turnDeg: 3.6, bankMax: 0.06,
    conceal: { sea: 5050, bloom: 6450, bloomTime: 15 },
    guns: { mounts: 4, barrels: 2, reload: 26, muzzleV: 820, traverse: 5,
            dmgMin: 10000, dmgMax: 12000, heDmg: 4500, heFire: 0.25, apFire: 0.05,
            citChance: 0.14, citMul: 2.4,
            dispBase: 22, dispK: 0.021, range: 6600, power: 3,
            mountZs: [0.32, 0.2, -0.26, -0.375], gunStyle: "twin" },
    torp: null,
    secondary: { range: 3000, reload: 3.5, dmg: 320, fire: 0.06, hit: 0.7 },   // 俾斯麦副炮名场面
    model: { funnels: 2 },
  },
  dukeOfYork: {
    cls: "bb", nation: "rn", name: "战列舰", ship: "约克公爵",
    length: 227, beam: 34.4, draft: 9.8, freeboard: 10.8,
    hp: 68600, maxKn: 28, accel: 0.8, turnDeg: 3.5, bankMax: 0.06,
    conceal: { sea: 4800, bloom: 6200, bloomTime: 15 },
    guns: { mounts: 4, barrels: 2, reload: 27, muzzleV: 780, traverse: 5,
            dmgMin: 8900, dmgMax: 10500, heDmg: 6300, heFire: 0.34, apFire: 0.05,
            citChance: 0.14, citMul: 2.4,
            dispBase: 22, dispK: 0.021, range: 5800, power: 3,
            mountZs: [0.32, 0.2, -0.26, -0.375], gunStyle: "twin" },
    torp: null,
    secondary: { range: 1700, reload: 4, dmg: 240, fire: 0.04, hit: 0.6 },
    model: { funnels: 1 },
  },
};

/* ============================================================
 * 程序化舰体建模（商业级细节：PBR 材质 / 分舰定制 / 拟真结构）
 * 长门 Nagato：弯烟囱、塔式桅、4×2 410mm 背负式、140mm 副炮廓
 * 克利夫兰：4×3 152mm 超射、双烟囱、40mm 副炮群、弹射器+水上机
 * 睦月：细长艏楼、4×120 单装炮、2×三联 610mm 鱼雷管、深弹轨
 * ============================================================ */

/* ---------- 俯视轮廓 Shape（y 轴 = 舰体前后方向，+y 为舰首；含艏外飘与舰艉收窄） ---------- */
function _hullShape(L, B) {
  const s = new THREE.Shape();
  const hb = L / 2;
  s.moveTo(0, hb);                                              // 舰首
  s.quadraticCurveTo(B * 0.30, hb * 0.74, B * 0.50, hb * 0.34);
  s.quadraticCurveTo(B * 0.53, hb * 0.12, B * 0.50, -hb * 0.28);
  s.quadraticCurveTo(B * 0.46, -hb * 0.74, 0, -hb);             // 舰尾
  s.quadraticCurveTo(-B * 0.46, -hb * 0.74, -B * 0.50, -hb * 0.28);
  s.quadraticCurveTo(-B * 0.53, hb * 0.12, -B * 0.50, hb * 0.34);
  s.quadraticCurveTo(-B * 0.30, hb * 0.74, 0, hb);
  return s;
}

/* ---------- 共享 PBR 材质 ---------- */
const _matCache = {};
function _mat(color, opts = {}) {
  const key = color + "|" + (opts.metal ?? 0.12) + "|" + (opts.rough ?? 0.62);
  if (!_matCache[key]) {
    _matCache[key] = new THREE.MeshStandardMaterial({
      color, metalness: opts.metal ?? 0.12, roughness: opts.rough ?? 0.62,
    });
  }
  return _matCache[key];
}

/* 舰名贴片（CanvasTexture，贴于两舷） */
function _namePlate(text, size = 14) {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 48;
  const g = cv.getContext("2d");
  g.font = "bold 34px 'Segoe UI', 'Microsoft YaHei', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#d8dee4";
  g.fillText(text, 128, 24);
  const tex = new THREE.CanvasTexture(cv);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size * 48 / 256),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
}

/* ---------- 通用构建 helper ---------- */
/* 各国涂装基色 */
const _NATION_COLS = {
  ijn: { hull: 0x4d5458, deck: 0x6b6250, tower: 0x555c60 },   // 日系军绿灰
  usn: { hull: 0x4f5a63, deck: 0x5a5f5c, tower: 0x57616a },   // 美系海军蓝灰
  rn:  { hull: 0x5c636b, deck: 0x5f5f58, tower: 0x646b73 },   // 英系蓝灰
  km:  { hull: 0x474c50, deck: 0x59544e, tower: 0x50565c },   // 德系深灰
};

function _mkHullGroup(cfg, team, name) {
  const root = new THREE.Group();
  const L = cfg.length, B = cfg.beam;
  const hullH = cfg.draft + cfg.freeboard;
  const base = _NATION_COLS[cfg.nation] || _NATION_COLS.ijn;
  // 红队整体向暗红棕偏移（敌我识别），蓝队保持国家涂装
  const shift = (c) => {
    if (team !== "red") return c;
    const col = new THREE.Color(c);
    col.r = col.r * 0.88 + 0.05; col.g = col.g * 0.8; col.b = col.g * 0.72;
    return col.getHex();
  };
  const col = {
    hull:  shift(base.hull),
    deck:  shift(base.deck),
    tower: shift(base.tower),
    dark:  0x262b30,
    accent: team === "blue" ? 0x8a9aa4 : 0x9a6a56,
    red:   0x5e3226,
  };
  const mat = (c, o) => _mat(c, o);
  return { root, L, B, hullH, col, mat, name };
}

function _box(parent, mat, w, h, d, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx;
  parent.add(m);
  return m;
}
function _cyl(parent, mat, r1, r2, h, x, y, z, ry = 0, rx = 0, rz = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx; m.rotation.z = rz;
  parent.add(m);
  return m;
}
/* 烟囱：锥度柱体 + 顶帽 + 黑色口沿 */
function _funnel(parent, mat, dark, r1, r2, h, x, y, z, capTilt = 0, lean = 0) {
  const g = new THREE.Group();
  const body = _cyl(g, mat, r2, r1, h, 0, h / 2, 0, 0, lean);
  const cap = _cyl(g, dark, r2 * 1.12, r1 * 1.12, 0.6, 0, h + 0.3, 0, 0, lean + capTilt);
  const lip = _cyl(g, dark, r2 * 0.86, r2 * 0.86, 1.0, 0, h - 0.2, 0, 0, lean + capTilt);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/* 三脚桅 + 横桁 + 瞭望斗 */
function _mast(parent, mat, x, y, z, h, r = 0.35, tripod = true) {
  const g = new THREE.Group();
  _cyl(g, mat, r * 0.5, r, h, 0, h / 2, 0);
  if (tripod) {
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const lx = Math.cos(a) * h * 0.22, lz = Math.sin(a) * h * 0.22;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, h * 0.55, 6), mat);
      leg.position.set(lx / 2, h * 0.27, lz / 2);
      leg.lookAt(new THREE.Vector3(lx, h * 0.52, lz));
      leg.rotateX(Math.PI / 2);
      g.add(leg);
    }
  }
  _cyl(g, mat, h * 0.13, h * 0.13, h * 0.3, 0, h * 0.72, 0, Math.PI / 2);   // 横桁
  _cyl(g, mat, h * 0.15, h * 0.15, 1.2, 0, h * 0.92, 0);                     // 顶台
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/* 塔式桅（长门 signature） */
function _pagodaMast(parent, mat, dark, x, y, z, L) {
  const g = new THREE.Group();
  _box(g, mat, 4.6, 3.2, 4.2, 0, 1.6, 0);
  _box(g, mat, 3.8, 2.8, 3.4, 0, 4.4, 0.3);
  _box(g, dark, 3.0, 1.2, 2.8, 0, 6.2, 0.5);            // 瞭望所
  _box(g, mat, 2.4, 2.4, 2.2, 0, 8.0, 0.7);
  _cyl(g, mat, 0.4, 0.55, 6.5, 0, 12.2, 0.9);           // 桅杆
  _cyl(g, mat, 1.1, 1.1, 2.4, 0, 10.6, 0.9, Math.PI / 2); // 横桁
  _box(g, dark, 1.6, 0.9, 0.5, 0, 9.4, 2.1);            // 信号台
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/* 双联装主炮塔（金属渐细双管 + 套箍 + 炮口） */
function _twinTurret(parent, mats, opts) {
  const { x, z, elevated, w, l, h, barrelLen, barrelR, startYaw = 0 } = opts;
  const { hull, dark } = mats;
  const pivot = new THREE.Group();
  pivot.position.set(x, opts.y, z);
  pivot.rotation.y = startYaw;
  parent.add(pivot);
  _cyl(pivot, dark, w * 0.62, w * 0.68, 0.9, 0, -0.35, 0, 0, 0, 0, 14);   // 座圈
  const body = new THREE.Group();
  pivot.add(body);
  _box(body, hull, w, h, l, 0, h / 2, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.72, l * 0.34), hull);
  nose.position.set(0, h * 0.36, l * 0.42);
  nose.rotation.x = 0.42;                                                  // 前斜面
  body.add(nose);
  _box(body, dark, w * 0.5, h * 0.32, 0.25, 0, h * 0.72, l * 0.52 - 0.1);  // 观测窗
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, h * 0.55, l * 0.42);
  body.add(barrelGroup);
  const muzzles = [];
  const span = opts.barrels - 1;
  for (let b = 0; b <= span; b++) {
    const bx = (b - span / 2) * (barrelR * 3.1);
    const seg1 = barrelLen * 0.55, seg2 = barrelLen * 0.45;
    _cyl(barrelGroup, dark, barrelR * 1.08, barrelR, seg1, bx, 0, seg1 / 2, 0, Math.PI / 2, 0, 10);
    _cyl(barrelGroup, dark, barrelR, barrelR * 0.78, seg2, bx, 0, seg1 + seg2 / 2, 0, Math.PI / 2, 0, 10);
    _cyl(barrelGroup, dark, barrelR * 1.25, barrelR * 1.25, 0.8, bx, 0, seg1 - 0.4, 0, Math.PI / 2, 0, 10);  // 套箍
    _cyl(barrelGroup, dark, barrelR * 0.5, barrelR * 0.95, 0.7, bx, 0, barrelLen, 0, Math.PI / 2, 0, 10);    // 炮口
    muzzles.push(new THREE.Vector3(bx, 0, barrelLen * 0.98));
  }
  return { pivot, barrelGroup, muzzles, curYaw: startYaw || 0, curElev: 0 };
}
/* 单装敞开炮（睦月 120mm） */
function _openMount(parent, mats, x, y, z, barrelLen, barrelR, startYaw = 0) {
  const { hull, dark } = mats;
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.y = startYaw;
  parent.add(pivot);
  _cyl(pivot, dark, 1.6, 1.9, 0.9, 0, -0.15, 0, 0, 0, 0, 12);          // 炮座
  // 弧形炮盾（半圆筒面，WoWS DD 单装炮特征）
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.05, 2.3, 14, 1, true, -Math.PI * 0.55, Math.PI * 1.1),
    hull);
  shield.material.side = THREE.DoubleSide;
  shield.position.set(0, 0.75, 0);
  pivot.add(shield);
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 1.25, 0.5);
  pivot.add(barrelGroup);
  // 炮管两段渐细 + 炮口段，明显伸出护盾
  _cyl(barrelGroup, dark, barrelR * 1.4, barrelR * 1.15, barrelLen * 0.35, 0, 0, barrelLen * 0.18, 0, Math.PI / 2, 0, 10);
  _cyl(barrelGroup, dark, barrelR * 1.15, barrelR * 0.82, barrelLen * 0.5, 0, 0, barrelLen * 0.45, 0, Math.PI / 2, 0, 10);
  _cyl(barrelGroup, dark, barrelR * 0.82, barrelR * 0.6, barrelLen * 0.18, 0, 0, barrelLen * 0.92, 0, Math.PI / 2, 0, 10);
  const muzzles = [new THREE.Vector3(0, 0, barrelLen)];
  return { pivot, barrelGroup, muzzles, curYaw: startYaw || 0, curElev: 0 };
}
/* ---------- 鱼雷发射管（参数化管数：睦月 3 联 / 法拉格特·闪电·爱宕 4 联 / 妙高 3 联） ---------- */
function _torpedoLauncher(parent, mats, x, y, z, per, yaw = 0.5) {
  const { hull, dark } = mats;
  const g = new THREE.Group();
  const w = per === 4 ? 3.1 : 2.5;
  _cyl(g, dark, w, w + 0.3, 0.8, 0, 0.4, 0, 0, 0, 0, 14);              // 底座
  for (let i = 0; i < per; i++) {
    const tx = (i - (per - 1) / 2) * (per === 4 ? 1.3 : 1.5);
    _cyl(g, hull, 0.55, 0.55, 9.2, tx, 1.9, 0, 0, Math.PI / 2, 0, 12);
    _cyl(g, dark, 0.58, 0.58, 0.4, tx, 1.9, 4.7, 0, Math.PI / 2, 0, 12);
  }
  _box(g, hull, w + 1.2, 0.8, 2.4, 0, 1.1, -1.0);                       // 摇架
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  parent.add(g);
  return g;
}
/* 小艇 */
function _boat(parent, mat, x, y, z, ry = 0, s = 1) {
  const g = new THREE.Group();
  const hullM = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat);
  hullM.scale.set(1.6 * s, 0.42 * s, 0.55 * s);
  g.add(hullM);
  g.position.set(x, y, z); g.rotation.y = ry;
  parent.add(g);
}
/* 蘑菇通风管 */
function _vent(parent, mat, x, y, z, r = 0.55, h = 1.6, lean = 0.25) {
  _cyl(parent, mat, r * 0.55, r, h, x, y + h / 2, z, 0, lean);
  _cyl(parent, mat, r * 1.25, r * 1.25, 0.3, x + lean * h * 0.5, y + h, z, 0, lean);
}
/* 水上侦察机（弹射器用） */
function _seaplane(parent, mats, x, y, z, ry = 0) {
  const { hull, dark } = mats;
  const g = new THREE.Group();
  _cyl(g, hull, 0.5, 0.28, 4.6, 0, 0.5, 0, 0, Math.PI / 2, 0, 10);     // 机身
  _box(g, hull, 0.22, 0.1, 4.4, 0, 1.0, 0.2);                          // 上翼
  _box(g, dark, 0.18, 0.8, 1.2, 0, 0.9, -2.2);                         // 尾翼
  _box(g, dark, 2.6, 0.16, 0.5, 0, 0.14, 0.6);                         // 浮筒架
  _cyl(g, dark, 0.16, 0.22, 2.2, 0, 0, 0.6, 0, Math.PI / 2, 0, 8);     // 浮筒
  g.position.set(x, y, z); g.rotation.y = ry;
  parent.add(g);
}

/* ---------- 舰体基座（双层挤出 + 水线红裙 + 甲板 + 舷墙） ---------- */
function _buildHull(m, cfg) {
  const shape = _hullShape(m.L, m.B);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: m.hullH, bevelEnabled: false, curveSegments: 12 });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.translate(0, cfg.freeboard, 0);
  const hull = new THREE.Mesh(hullGeo, m.mat(m.col.hull));
  m.root.add(hull);
  // 水线红裙（船底包围，模拟水线以下红色防腐漆）
  const skirt = new THREE.Mesh(
    new THREE.ExtrudeGeometry(_hullShape(m.L * 0.985, m.B * 1.02), { depth: 2.6, bevelEnabled: false, curveSegments: 12 }),
    m.mat(m.col.red, { metal: 0.15, rough: 0.8 }));
  skirt.geometry.rotateX(Math.PI / 2);
  skirt.geometry.translate(0, cfg.draft + 1.2, 0);
  m.root.add(skirt);
  // 主甲板
  const deckGeo = new THREE.ExtrudeGeometry(_hullShape(m.L * 0.96, m.B * 0.92), { depth: 0.7, bevelEnabled: false, curveSegments: 12 });
  deckGeo.rotateX(Math.PI / 2);
  deckGeo.translate(0, -0.35, 0);
  const deck = new THREE.Mesh(deckGeo, m.mat(m.col.deck, { metal: 0.1, rough: 0.85 }));
  deck.position.y = cfg.freeboard;
  m.root.add(deck);
  // 前甲板木纹段（艏楼）
  const fdeckGeo = new THREE.ExtrudeGeometry(_hullShape(m.L * 0.38, m.B * 0.88), { depth: 0.25, bevelEnabled: false, curveSegments: 10 });
  fdeckGeo.rotateX(Math.PI / 2);
  fdeckGeo.translate(0, -0.12, 0);
  const fdeck = new THREE.Mesh(fdeckGeo, m.mat(m.col.deck, { metal: 0.1, rough: 0.85 }));
  fdeck.position.set(0, cfg.freeboard + 0.7, m.L * 0.29);
  m.root.add(fdeck);
  // 舷墙（薄壁沿两侧）
  const bw = 0.18, wallMat = m.mat(m.col.hull);
  [-1, 1].forEach(sgn => {
    _box(m.root, wallMat, bw, 0.8, m.L * 0.72, sgn * m.B * 0.47, cfg.freeboard + 0.85, 0);
  });
  // 伪阴影
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x03121d, transparent: true, opacity: 0.34, depthWrite: false }));
  shadow.scale.set(m.B * 1.15, 1, m.L * 0.6);
  shadow.position.y = 0.25 - cfg.draft + 1;
  shadow.renderOrder = 3;
  m.root.add(shadow);
}

/* ---------- 战列舰（长门 / 俾斯麦 / 约克公爵，参数化变体） ---------- */
function buildBB(m, cfg, turrets) {
  const { L, B, col, mat } = m;
  const deckY = cfg.freeboard + 0.7;
  _buildHull(m, cfg);
  const bent = !!cfg.model.bentFunnel;
  const funnels = cfg.model.funnels;

  // 艏楼甲板室 + 塔式舰桥
  _box(m.root, mat(col.tower), B * 0.6, 2.6, L * 0.2, 0, deckY + 1.3, L * 0.14);
  _pagodaMast(m.root, mat(col.tower), mat(col.dark), 0, deckY + 2.6, L * 0.09, L);
  // 主烟囱（长门弯烟囱 signature；俾斯麦/约克公爵直立）
  if (funnels >= 1) {
    if (bent) {
      const fun = new THREE.Group();
      _cyl(fun, mat(col.hull), 2.6, 3.0, 5.5, 0, 2.75, 0);
      _cyl(fun, mat(col.hull), 2.25, 2.6, 4.2, 0, 7.1, -0.55, 0, -0.16);
      _cyl(fun, mat(col.dark), 2.5, 2.5, 0.7, 0, 9.25, -1.1, 0, -0.16);
      fun.position.set(0, deckY + 2.2, -L * 0.07);
      m.root.add(fun);
    } else {
      _funnel(m.root, mat(col.hull), mat(col.dark), 2.6, 3.0, 8.5, 0, deckY + 2.2, -L * 0.07);
    }
  }
  // 第二烟囱 + 队标环
  if (funnels >= 2) {
    _funnel(m.root, mat(col.hull), mat(col.dark), 2.3, 2.7, 6.5, 0, deckY + 2.2, -L * 0.21);
    _cyl(m.root, mat(col.accent), 2.62, 2.62, 1.0, 0, deckY + (bent ? 5.6 : 7.2), -L * 0.07, 0, bent ? -0.16 : 0);
    _cyl(m.root, mat(col.accent), 2.32, 2.32, 1.0, 0, deckY + 5.0, -L * 0.21);
  } else {
    _cyl(m.root, mat(col.accent), 2.9, 2.9, 1.0, 0, deckY + (bent ? 5.6 : 9.8), -L * 0.07, 0, bent ? -0.16 : 0);
  }
  // 后部舰桥 + 桅杆
  _box(m.root, mat(col.tower), B * 0.42, 2.4, L * 0.08, 0, deckY + 1.2, -L * 0.3);
  _mast(m.root, mat(col.hull), 0, deckY + 3.6, -L * 0.3, 12, 0.4, true);

  // 主炮（按 mountZs 布局，前后交替背负式）
  const tw = B * 0.42, tl = L * 0.075, th = 3.2, bl = L * 0.115, br = 0.72;
  const mats = { hull: mat(col.hull), dark: mat(col.dark) };
  cfg.guns.mountZs.forEach((mz, i) => {
    const t = _twinTurret(m.root, mats,
      { x: 0, z: L * mz, y: deckY + 0.5 + (i % 2 === 1 ? 2.5 : 0), w: tw, l: tl, h: th, barrelLen: bl, barrelR: br, barrels: cfg.guns.barrels, startYaw: mz < 0 ? Math.PI : 0 });
    turrets.push(t);
  });

  // 副炮廓（每舷 3 座）
  [-1, 1].forEach(sgn => {
    for (let i = 0; i < 3; i++) {
      const z = L * 0.02 - i * L * 0.085;
      _box(m.root, mat(col.hull), 2.2, 1.8, 3.2, sgn * B * 0.44, deckY + 0.9, z);
      _cyl(m.root, mat(col.dark), 0.28, 0.34, 2.6, sgn * B * 0.44, deckY + 1.4, z + 1.4, 0, Math.PI / 2, 0, 8);
    }
  });
  // 通风管 / 小艇 / 旗杆
  _vent(m.root, mat(col.hull), B * 0.2, deckY + 2.6, L * 0.01, 0.7, 2.2, 0.3);
  _vent(m.root, mat(col.hull), -B * 0.2, deckY + 2.6, L * 0.01, 0.7, 2.2, 0.3);
  _vent(m.root, mat(col.hull), B * 0.18, deckY + 2.6, -L * 0.13, 0.6, 1.9, 0.28);
  _boat(m.root, mat(col.deck), B * 0.38, deckY + 1.0, -L * 0.1, 0, 1.3);
  _boat(m.root, mat(col.deck), -B * 0.38, deckY + 1.0, -L * 0.12, 0, 1.2);
  _cyl(m.root, mat(col.dark), 0.12, 0.18, 5, 0, deckY + 2.5, L * 0.47);

  const plate = _namePlate(m.name || "BB", 16);
  plate.position.set(-B * 0.53, cfg.freeboard + 2.2, -L * 0.3);
  plate.rotation.y = -Math.PI / 2;
  m.root.add(plate);
  const plate2 = _namePlate(m.name || "BB", 16);
  plate2.position.set(B * 0.53, cfg.freeboard + 2.2, -L * 0.3);
  plate2.rotation.y = Math.PI / 2;
  m.root.add(plate2);

  return { funnel: new THREE.Vector3(0, deckY + 12, -L * 0.07), superTop: deckY + 14 };
}

/* ---------- 巡洋舰（克利夫兰 / 妙高 / 爱宕，参数化变体） ---------- */
function buildCA(m, cfg, turrets) {
  const { L, B, col, mat } = m;
  const deckY = cfg.freeboard + 0.7;
  _buildHull(m, cfg);
  const triple = cfg.guns.barrels === 3;

  // 上层建筑 + 舰桥 + 雷达
  _box(m.root, mat(col.tower), B * 0.56, 2.4, L * 0.17, 0, deckY + 1.2, L * 0.1);
  _box(m.root, mat(col.tower), B * 0.4, 2.2, L * 0.06, 0, deckY + 3.4, L * 0.12);
  _box(m.root, mat(col.dark), B * 0.3, 1.0, L * 0.03, 0, deckY + 4.8, L * 0.125);
  _box(m.root, mat(col.dark), 0.3, 2.0, 2.6, 0, deckY + 6.6, L * 0.13);      // 雷达
  _mast(m.root, mat(col.hull), 0, deckY + 4.4, L * 0.06, 13, 0.38, false);
  // 双烟囱 + 队标环
  _funnel(m.root, mat(col.hull), mat(col.dark), 1.9, 2.3, 7.0, B * 0.02, deckY + 2.2, -L * 0.02, 0.1);
  _funnel(m.root, mat(col.hull), mat(col.dark), 1.8, 2.2, 6.2, -B * 0.02, deckY + 2.2, -L * 0.14, 0.1);
  _cyl(m.root, mat(col.accent), 2.02, 2.02, 0.9, B * 0.02, deckY + 6.0, -L * 0.02, 0, 0.1);
  _cyl(m.root, mat(col.accent), 1.92, 1.92, 0.9, -B * 0.02, deckY + 5.4, -L * 0.14, 0, 0.1);
  // 后部指挥塔 + 后桅
  _box(m.root, mat(col.tower), B * 0.36, 2.0, L * 0.06, 0, deckY + 1.0, -L * 0.24);
  _mast(m.root, mat(col.hull), 0, deckY + 2.0, -L * 0.28, 10, 0.32, false);

  // 主炮（mountZs 布局：克利夫兰 4×3 超射 / 妙高·爱宕 5×2 前三金字塔背负）
  const tw = triple ? B * 0.34 : B * 0.36, tl = L * (triple ? 0.062 : 0.066),
        th = triple ? 2.6 : 2.7, bl = L * (triple ? 0.088 : 0.092), br = triple ? 0.5 : 0.52;
  const mats = { hull: mat(col.hull), dark: mat(col.dark) };
  const ladder = [0, 1.9, 3.8];   // 前三座金字塔抬升（日巡特征）
  cfg.guns.mountZs.forEach((mz, i) => {
    const lift = mz > 0 ? (ladder[i] || 0) : 0;
    const t = _twinTurret(m.root, mats,
      { x: 0, z: L * mz, y: deckY + 0.5 + lift, w: tw, l: tl, h: th, barrelLen: bl, barrelR: br, barrels: cfg.guns.barrels, startYaw: mz < 0 ? Math.PI : 0 });
    turrets.push(t);
  });

  // 40mm 副炮群（两舷）
  [-1, 1].forEach(sgn => {
    for (let i = 0; i < 2; i++) {
      const z = L * 0.01 - i * L * 0.1;
      _box(m.root, mat(col.dark), 1.8, 1.4, 2.0, sgn * B * 0.42, deckY + 0.7, z);
      for (let j = 0; j < 2; j++) {
        _cyl(m.root, mat(col.dark), 0.14, 0.18, 1.6, sgn * B * 0.42 + (j - 0.5) * 0.5, deckY + 1.6, z + 0.7, 0, 0.3);
        _cyl(m.root, mat(col.dark), 0.14, 0.18, 1.6, sgn * B * 0.42 + (j - 0.5) * 0.5, deckY + 1.6, z + 0.2, 0, 0.3);
      }
    }
  });
  // 鱼雷发射管（妙高 2×3 联 / 爱宕 2×4 联；克利夫兰无 —— 与模型一致）
  const launchers = [];
  if (cfg.torp) {
    for (let i = 0; i < cfg.torp.tubes; i++) {
      launchers.push(_torpedoLauncher(m.root, { hull: mat(col.tower), dark: mat(col.dark) },
        0, deckY + 0.5, -L * 0.02 - i * L * 0.09, cfg.model.torpPer || 3, 0.45));
    }
  }
  // 舰尾弹射器 + 水上机（无雷舰种）
  if (!cfg.torp) {
    _box(m.root, mat(col.hull), 2.2, 0.7, L * 0.14, 0, deckY + 0.5, -L * 0.38);
    _seaplane(m.root, { hull: mat(col.tower), dark: mat(col.dark) }, 0, deckY + 0.95, -L * 0.37, Math.PI / 2);
  }
  _vent(m.root, mat(col.hull), B * 0.24, deckY + 2.2, L * 0.02, 0.55, 1.7, 0.25);
  _vent(m.root, mat(col.hull), -B * 0.24, deckY + 2.2, L * 0.02, 0.55, 1.7, 0.25);
  _boat(m.root, mat(col.deck), B * 0.4, deckY + 0.9, L * 0.0, 0, 1.1);
  _boat(m.root, mat(col.deck), -B * 0.4, deckY + 0.9, -L * 0.02, 0, 1.1);

  const plate = _namePlate(m.name || "CA", 15);
  plate.position.set(-B * 0.53, cfg.freeboard + 2.4, -L * 0.28);
  plate.rotation.y = -Math.PI / 2;
  m.root.add(plate);
  const plate2 = _namePlate(m.name || "CA", 15);
  plate2.position.set(B * 0.53, cfg.freeboard + 2.4, -L * 0.28);
  plate2.rotation.y = Math.PI / 2;
  m.root.add(plate2);

  return { funnel: new THREE.Vector3(B * 0.02, deckY + 10, -L * 0.02), superTop: deckY + 12, torpLaunchers: launchers };
}

/* ---------- 驱逐舰（睦月 / 法拉格特 / 闪电，参数化变体） ---------- */
function buildDD(m, cfg, turrets) {
  const { L, B, col, mat } = m;
  const deckY = cfg.freeboard + 0.7;
  _buildHull(m, cfg);
  const open = cfg.guns.gunStyle === "open";
  const funnels = cfg.model.funnels;

  // 低矮舰桥 + 细桅
  _box(m.root, mat(col.tower), B * 0.5, 1.9, L * 0.1, 0, deckY + 0.95, L * 0.16);
  _box(m.root, mat(col.dark), B * 0.36, 0.8, L * 0.04, 0, deckY + 2.2, L * 0.17);
  _mast(m.root, mat(col.hull), 0, deckY + 1.9, L * 0.13, 9, 0.26, true);
  // 烟囱（1~2 座）
  if (funnels >= 1) _funnel(m.root, mat(col.hull), mat(col.dark), 0.95, 1.15, 5.2, 0, deckY + 0.7, L * 0.04, 0.12);
  if (funnels >= 2) _funnel(m.root, mat(col.hull), mat(col.dark), 0.9, 1.1, 4.8, 0, deckY + 0.7, -L * 0.08, 0.12);
  if (funnels === 1) _funnel(m.root, mat(col.hull), mat(col.dark), 1.0, 1.2, 5.8, 0, deckY + 0.7, -L * 0.08, 0.12);
  _cyl(m.root, mat(col.accent), 1.08, 1.08, 0.7, 0, deckY + 4.2, L * 0.04, 0, 0.12);

  // 主炮（单装敞开 / 小型双联）
  const mats = { hull: mat(col.hull), dark: mat(col.dark) };
  if (open) {
    cfg.guns.mountZs.forEach((mz, i) => {
      const t = _openMount(m.root, mats, 0, deckY + 0.6 + (i === 1 ? 1.0 : 0), L * mz, L * 0.1, 0.28, mz < 0 ? Math.PI : 0);
      turrets.push(t);
    });
  } else {
    cfg.guns.mountZs.forEach((mz, i) => {
      const t = _twinTurret(m.root, mats,
        { x: 0, z: L * mz, y: deckY + 0.5 + (i === 1 ? 0.9 : 0), w: 3.4, l: L * 0.055, h: 2.0, barrelLen: L * 0.09, barrelR: 0.26, barrels: cfg.guns.barrels, startYaw: mz < 0 ? Math.PI : 0 });
      turrets.push(t);
    });
  }

  // 鱼雷发射管（与模型联动：座数 = torp.tubes，每座管数 = torp.salvo）
  const launchers = [];
  if (cfg.torp) {
    for (let i = 0; i < cfg.torp.tubes; i++) {
      launchers.push(_torpedoLauncher(m.root, { hull: mat(col.tower), dark: mat(col.dark) },
        0, deckY + 0.6, -L * 0.01 - i * L * 0.16, cfg.model.torpPer || 3, 0.42));
    }
  }
  // 深弹轨道（舰尾）
  [-1, 1].forEach(sgn => {
    _box(m.root, mat(col.dark), 0.5, 0.35, L * 0.12, sgn * B * 0.28, deckY + 0.3, -L * 0.42);
    for (let i = 0; i < 3; i++) {
      _cyl(m.root, mat(col.dark), 0.42, 0.42, 0.5, sgn * B * 0.28, deckY + 0.55, -L * 0.44 + i * 1.6, 0, Math.PI / 2, 0, 10);
    }
  });
  _boat(m.root, mat(col.deck), B * 0.32, deckY + 0.75, L * 0.0, 0, 0.85);
  _cyl(m.root, mat(col.dark), 0.4, 0.5, 0.9, 0, deckY + 3.2, L * 0.1);

  const plate = _namePlate(m.name || "DD", 11);
  plate.position.set(-B * 0.55, cfg.freeboard + 1.8, -L * 0.28);
  plate.rotation.y = -Math.PI / 2;
  m.root.add(plate);
  const plate2 = _namePlate(m.name || "DD", 11);
  plate2.position.set(B * 0.55, cfg.freeboard + 1.8, -L * 0.28);
  plate2.rotation.y = Math.PI / 2;
  m.root.add(plate2);

  return { funnel: new THREE.Vector3(0, deckY + 7, L * 0.04), superTop: deckY + 8, torpLaunchers: launchers };
}

/**
 * 构建舰船模型（按逻辑舰种分派参数化构建器）
 * @returns { root, turrets, funnel, superTop, torpLaunchers }
 */
function buildShipModel(typeKey, team, name) {
  const cfg = SHIP_TYPES[typeKey];
  const m = _mkHullGroup(cfg, team, name);
  const turrets = [];
  let meta;
  if (cfg.cls === "bb") meta = buildBB(m, cfg, turrets);
  else if (cfg.cls === "ca") meta = buildCA(m, cfg, turrets);
  else meta = buildDD(m, cfg, turrets);
  return { root: m.root, turrets, funnel: meta.funnel, superTop: meta.superTop, torpLaunchers: meta.torpLaunchers || null };
}

/* ---------------- 弹道求解（低弹道解） ---------------- */
function ballisticAngle(from, to, v, g = GRAV) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const R = Math.hypot(dx, dz);
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * R * R + 2 * dy * v2);
  if (disc < 0) return null;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * R));
}

function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ============================================================
 * Ship — 舰船实体
 * ============================================================ */
class Ship {
  constructor(typeKey, team, name, x, z, heading) {
    this.typeKey = typeKey;
    this.cfg = SHIP_TYPES[typeKey];
    this.cls = this.cfg.cls;
    this.nation = this.cfg.nation;
    this.team = team;
    this.name = name;
    this.isPlayer = false;

    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;             // 0 = +Z
    this.speed = 0;
    this.throttleLevels = [-1, -0.5, 0, 0.5, 1];
    this.throttleIdx = 2;
    this.rudder = 0; this.rudderTarget = 0;
    this.roll = 0;

    this.hp = this.cfg.hp; this.hpMax = this.cfg.hp;
    this.alive = true; this.sinking = false; this.sinkT = 0; this.remove = false;
    this.hitH = this.cfg.freeboard + 14;      // 炮弹可击中的舰体最高点

    // 火炮
    const g = this.cfg.guns;
    this.gunReload = 0; this.gunReady = true;
    this.aimPoint = null;               // 世界坐标瞄准点
    this.idleElev = { bb: 0.14, ca: 0.10, dd: 0.12 }[this.cls];   // 待机仰角（按逻辑舰种查表）
    this.ammoType = "he";               // 当前弹种（"ap" / "he"，1/2 键切换）
    this.bloomT = 0;                    // 开火暴露（bloom）剩余时间

    // 隐蔽 / 状态效果
    this.spottedBlue = false;           // 被蓝队点亮
    this.spottedRed = false;            // 被红队点亮
    this.flooding = false; this.floodingT = 0;
    // 烟雾发生器（dd/ca）
    this.smokeCfg = this.cfg.smoke || null;
    this.smokeCharges = this.smokeCfg ? this.smokeCfg.charges : 0;
    this.smokeCd = 0;
    this.inSmoke = false;
    // 副炮
    this.secT = 0;

    // 鱼雷（发射管按模型配置：每座独立装填）
    this.torpTubes = this.cfg.torp
      ? Array.from({ length: this.cfg.torp.tubes || 1 }, () => ({ reload: 0 }))
      : null;
    this.torpReady = !!this.cfg.torp;

    // 起火
    this.fires = [];
    // 维修小组（玩家专属消耗品）
    this.repairCharges = 3;
    this.repairT = 0;
    this.repairing = false;

    this.model = buildShipModel(typeKey, team, name);
    this.model.turrets.forEach(t => { t.reload = 0; });   // 每座炮塔独立装填计时
    this.model.root.position.set(x, 0, z);
    this.model.root.rotation.y = heading;
    this._wakeAcc = 0;
    this._wfxAcc = 0;
  }

  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  velocity() { return this.forward().multiplyScalar(this.speed); }
  speedFactor() { return Math.abs(this.speed) / (this.cfg.maxKn * KNOT); }

  setThrottle(dir) {                    // dir: +1 加挡 / -1 减挡
    this.throttleIdx = Math.max(0, Math.min(4, this.throttleIdx + dir));
  }
  get throttle() { return this.throttleLevels[this.throttleIdx]; }

  /* ---------- 每帧更新 ---------- */
  update(dt, time) {
    if (this.remove) return;

    if (this.sinking) { this._updateSinking(dt); return; }

    /* 航行 */
    const maxSpd = this.cfg.maxKn * KNOT;
    const targetSpd = this.throttle * maxSpd;
    const acc = (Math.abs(targetSpd) > Math.abs(this.speed) || targetSpd * this.speed < 0) ? this.cfg.accel : this.cfg.accel * 1.6;
    if (this.speed < targetSpd) this.speed = Math.min(targetSpd, this.speed + acc * dt);
    else this.speed = Math.max(targetSpd, this.speed - acc * dt);

    this.rudder += Math.max(-dt * 0.9, Math.min(dt * 0.9, this.rudderTarget - this.rudder));
    const spdK = Math.min(1, Math.abs(this.speed) / (maxSpd * 0.4));
    const yawRate = this.rudder * THREE.MathUtils.degToRad(this.cfg.turnDeg) * spdK * Math.sign(this.speed || 1);
    this.heading = angNorm(this.heading + yawRate * dt);

    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;

    /* 视觉：波浪纵摇横摇 + 转弯侧倾 */
    const wh = G.waveHeight;
    const slopeZ = (wh(this.pos.x, this.pos.z + 18, time) - wh(this.pos.x, this.pos.z - 18, time)) / 36;
    const slopeX = (wh(this.pos.x + 18, this.pos.z, time) - wh(this.pos.x - 18, this.pos.z, time)) / 36;
    const bob = wh(this.pos.x, this.pos.z, time) * 0.55;
    const targetRoll = -this.rudder * this.cfg.bankMax * spdK * 2 + slopeX * 0.8;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 1.5);

    const m = this.model.root;
    m.position.set(this.pos.x, bob, this.pos.z);
    m.rotation.set(-slopeZ * 0.8, this.heading, this.roll);

    /* 尾流 / 艏浪 / 烟囱 */
    const sf = this.speedFactor();
    this._wakeAcc += this.speed * dt;
    if (sf > 0.06 && this._wakeAcc > 14) {
      this._wakeAcc = 0;
      const back = this.forward().multiplyScalar(-this.cfg.length * 0.48);
      const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(this.cfg.beam * 0.5);
      FX.wakeFoam(this.pos.x + back.x - right.x, this.pos.z + back.z - right.z, this.cfg.length / 120);
      FX.wakeFoam(this.pos.x + back.x + right.x, this.pos.z + back.z + right.z, this.cfg.length / 120);
    }
    if (sf > 0.5 && Math.random() < sf * 0.8) {
      const bow = this.forward().multiplyScalar(this.cfg.length * 0.5).add(this.pos);
      FX.bowSpray(bow.x, 1.5, bow.z, sf - 0.4);
    }
    this._wfxAcc += dt;
    if (this._wfxAcc > 0.09) {
      this._wfxAcc = 0;
      const fp = this.model.funnel.clone().applyMatrix4(m.matrixWorld);
      FX.funnelSmoke(fp.x, fp.y, fp.z, Math.abs(this.throttle));
    }

    /* 炮塔瞄准 */
    this._updateTurrets(dt);
    /* 副炮 + 烟雾充能 */
    this._updateSecondary(dt);
    if (this.smokeCfg && this.smokeCharges < this.smokeCfg.charges) {
      this.smokeCd -= dt;
      if (this.smokeCd <= 0) { this.smokeCharges++; if (this.smokeCharges < this.smokeCfg.charges) this.smokeCd = 45; }
    }

    /* 装填 */
    /* 主炮：每座炮塔独立装填 */
    if (this.model.turrets) {
      let any = false;
      for (const t of this.model.turrets) {
        if (t.reload > 0) t.reload -= dt;
        if (t.reload <= 0) any = true;
      }
      this.gunReady = any;
    }
    if (this.cfg.torp && !this.torpReady) {
      this.torpReload -= dt;
      if (this.torpReload <= 0) this.torpReady = true;
    }
    /* 鱼雷发射管独立装填 */
    if (this.torpTubes) {
      let any = false;
      for (const tb of this.torpTubes) {
        if (tb.reload > 0) tb.reload -= dt;
        if (tb.reload <= 0) any = true;
      }
      this.torpReady = any;
    }
    /* 开火暴露衰减 */
    if (this.bloomT > 0) this.bloomT -= dt;
    /* 进水伤害（维修小组可止住） */
    if (this.flooding) {
      this.floodingT -= dt;
      this.hp -= this.hpMax * 0.003 * dt;
      if (this.floodingT <= 0) this.flooding = false;
    }

    /* 维修小组（期间免疫新起火/进水 —— WoWS 损管机制） */
    if (this.repairing) {
      this.repairT -= dt;
      this.hp = Math.min(this.hpMax, this.hp + this.hpMax * 0.022 * dt);
      if (this.repairT <= 0) this.repairing = false;
    }

    /* 起火伤害 */
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      const wp = f.local.clone().applyMatrix4(m.matrixWorld);
      FX.fireTick(wp.x, wp.y, wp.z, this.cfg.length / 150);
      this.hp -= 95 * dt;
      if (f.t <= 0) this.fires.splice(i, 1);
    }
    if (this.hp <= 0) this.die();
  }

  /** 释放烟雾发生器（在船后方生成烟幕区） */
  startSmoke() {
    if (!this.smokeCfg || this.smokeCharges <= 0 || !this.alive) return false;
    this.smokeCharges--;
    this.smokeCd = 45;
    G.smokes.push({
      x: this.pos.x - Math.sin(this.heading) * this.cfg.length * 0.3,
      z: this.pos.z - Math.cos(this.heading) * this.cfg.length * 0.3,
      r: this.smokeCfg.radius,
      life: this.smokeCfg.dur,
      owner: this.team,
    });
    return true;
  }

  /** 副炮：自动攻击视野内最近敌舰（WoWS 副炮机制） */
  _updateSecondary(dt) {
    const sec = this.cfg.secondary;
    if (!sec || !this.alive) return;
    this.secT -= dt;
    if (this.secT > 0) return;
    this.secT = sec.reload;
    let tgt = null, nd = Infinity;
    for (const o of G.ships) {
      if (!o.alive || o.team === this.team) continue;
      if (!(this.team === "blue" ? o.spottedBlue : o.spottedRed)) continue;
      const d = this.pos.distanceTo(o.pos);
      if (d < nd) { nd = d; tgt = o; }
    }
    if (!tgt || nd > sec.range) return;
    // 命中判定（近距离副炮精度高）
    if (Math.random() < Math.min(0.75, Math.max(0.25, sec.hit * (1.15 - nd / sec.range)))) {
      tgt.applyDamage(sec.dmg, { fireChance: sec.fire });
      if (this.team === "blue" || tgt.isPlayer) {
        G.onSecondaryHit(this, tgt, Math.round(sec.dmg), tgt.isPlayer);
      }
    } else {
      FX.splashColumn(tgt.pos.x + (Math.random() - 0.5) * 50, tgt.pos.z + (Math.random() - 0.5) * 50, 0.35);
    }
    // 副炮开火特效（随机舷侧炮廓小火光）
    const side = Math.random() < 0.5 ? -1 : 1;
    const fx = new THREE.Vector3(side * this.cfg.beam * 0.44, this.cfg.freeboard + 1.6,
      (Math.random() - 0.5) * this.cfg.length * 0.35).applyMatrix4(this.model.root.matrixWorld);
    FX.muzzleFlash(fx.x, fx.y, fx.z, new THREE.Vector3(side, 0.1, 0), 0.28);
  }

  _updateTurrets(dt) {
    if (!this.aimPoint) return;
    const g = this.cfg.guns;
    const traverse = THREE.MathUtils.degToRad(g.traverse);
    const m = this.model.root;
    this.model.turrets.forEach(t => {
      // 炮塔世界位置
      const wp = t.pivot.getWorldPosition(new THREE.Vector3());
      const bearing = Math.atan2(this.aimPoint.x - wp.x, this.aimPoint.z - wp.z);
      const desired = angNorm(bearing - this.heading);
      // 转向限位 ±150°
      const clamped = THREE.MathUtils.clamp(desired, -Math.PI * 150 / 180, Math.PI * 150 / 180);
      const diff = angNorm(clamped - t.curYaw);
      const step = Math.max(-traverse * dt, Math.min(traverse * dt, diff));
      t.curYaw = angNorm(t.curYaw + step);
      t.pivot.rotation.y = t.curYaw;
      // 俯仰（弹道解）；该塔装填完毕时保持待机仰角，射击/装填中压平跟随弹道
      const muzzleWorld = t.barrelGroup.localToWorld(t.muzzles[0].clone());
      const elev = ballisticAngle(muzzleWorld, this.aimPoint, g.muzzleV);
      const ballistic = elev === null ? 0.35 : elev;
      const targetElev = t.reload <= 0 ? Math.max(ballistic, this.idleElev) : ballistic;
      t.curElev += (targetElev - t.curElev) * Math.min(1, dt * 6);
      t.barrelGroup.rotation.x = -t.curElev;
    });
  }

  /** 已对准目标的炮塔数 */
  gunsAligned() {
    if (!this.aimPoint) return 0;
    let n = 0;
    this.model.turrets.forEach(t => {
      const wp = t.pivot.getWorldPosition(new THREE.Vector3());
      const bearing = Math.atan2(this.aimPoint.x - wp.x, this.aimPoint.z - wp.z);
      const desired = angNorm(bearing - this.heading);
      if (Math.abs(angNorm(desired - t.curYaw)) < THREE.MathUtils.degToRad(4)) n++;
    });
    return n;
  }

  /**
   * 主炮开火：每座炮塔独立装填 —— 只有「已装填且已对准」的炮塔开火
   * @returns {shells: [{from, to, v}], power, ammo} 或 null（无可用炮塔）
   */
  fireGuns() {
    if (!this.aimPoint || this.sinking) return null;
    if (!this.model.turrets.some(t => t.reload <= 0)) return null;
    const g = this.cfg.guns;
    const dist = this.pos.distanceTo(this.aimPoint);
    // WoWS 式机动散布惩罚：全速满舵时散布显著扩大
    const disp = (g.dispBase + dist * g.dispK) * (1 + Math.abs(this.rudder) * 0.45);
    const shells = [];
    this.model.root.updateMatrixWorld(true);
    this.model.turrets.forEach(t => {
      if (t.reload > 0) return;                                  // 该塔装填中
      const wp = t.pivot.getWorldPosition(new THREE.Vector3());
      const bearing = Math.atan2(this.aimPoint.x - wp.x, this.aimPoint.z - wp.z);
      const desired = angNorm(bearing - this.heading);
      if (Math.abs(angNorm(desired - t.curYaw)) >= THREE.MathUtils.degToRad(4)) return;  // 该塔未对准
      t.muzzles.forEach(mz => {
        const from = t.barrelGroup.localToWorld(mz.clone());
        // 散布（高斯近似）
        const a = Math.random() * Math.PI * 2;
        const rr = disp * Math.sqrt(-2 * Math.log(Math.max(1e-6, Math.random()))) * 0.42;
        const to = new THREE.Vector3(
          this.aimPoint.x + Math.cos(a) * rr, 0,
          this.aimPoint.z + Math.sin(a) * rr);
        shells.push({ from, to, v: g.muzzleV });
      });
      // 该塔进入独立装填；炮管压平到真实弹道角
      t.reload = g.reload;
      const mz0 = t.barrelGroup.localToWorld(t.muzzles[0].clone());
      const fe = ballisticAngle(mz0, this.aimPoint, g.muzzleV);
      if (fe !== null) t.curElev = fe;
    });
    if (!shells.length) return null;
    this.bloomT = this.cfg.conceal.bloomTime;   // 开火暴露
    return { shells, power: g.power, ammo: this.ammoType };
  }

  /**
   * 发射鱼雷（手动瞄准：指定中心方向与扇形散布角）
   * 从模型上的一座发射管出雷（每座独立装填），发射管转向瞄准方向
   * @param yaw       扇形中心朝向（弧度，世界系）
   * @param spreadDeg 扇形散布角（度，鱼雷均匀分布在扇内）
   */
  fireTorpedoes(yaw, spreadDeg) {
    if (!this.cfg.torp || !this.torpReady || this.sinking || !this.torpTubes) return null;
    const t = this.cfg.torp;
    const idx = this.torpTubes.findIndex(tb => tb.reload <= 0);
    if (idx < 0) return null;
    this.torpTubes[idx].reload = t.reload;
    const spread = THREE.MathUtils.degToRad(spreadDeg ?? 6);
    const n = t.salvo;
    const out = [];
    // 发射起点：与模型上第 idx 座发射管位置一致（局部 z）
    const launcher = this.model.torpLaunchers ? this.model.torpLaunchers[idx] : null;
    const launchZ = launcher ? launcher.position.z : this.cfg.length * 0.12;
    const wx = this.pos.x + Math.sin(this.heading) * launchZ;
    const wz = this.pos.z + Math.cos(this.heading) * launchZ;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
      out.push({ x: wx, z: wz, heading: angNorm(yaw + off) });
    }
    // 发射管转向瞄准方向（模型联动）
    if (launcher) launcher.rotation.y = angNorm(yaw - this.heading);
    this.torpReady = this.torpTubes.some(tb => tb.reload <= 0);
    this.bloomT = Math.max(this.bloomT, 6);   // 发射鱼雷也会短暂暴露
    return out;
  }

  /** 启动维修小组：10 秒回复约 22% 血量，扑灭起火并止住进水 */
  startRepair() {
    if (!this.alive || this.repairing || this.repairCharges <= 0) return false;
    this.repairCharges--;
    this.repairing = true;
    this.repairT = 10;
    this.fires = [];
    this.flooding = false;
    return true;
  }

  applyDamage(amount, { citadel = false, hitPos = null, fireChance = 0.11 } = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    G.onShipDamaged(this, amount, citadel, hitPos);
    // 起火（概率取决于弹种；维修小组期间损管免疫新起火）
    const fc = this.repairing ? 0 : fireChance;
    if (Math.random() < fc && this.fires.length < 2 && this.hp > 0) {
      this.fires.push({
        local: new THREE.Vector3((Math.random() - 0.5) * this.cfg.beam * 0.4, this.cfg.freeboard + 2,
                                 (Math.random() - 0.5) * this.cfg.length * 0.7),
        t: 9 + Math.random() * 5,
      });
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.sinking = true; this.sinkT = 0;
    this.fires = [];
    G.onShipSunk(this);
  }

  _updateSinking(dt) {
    this.sinkT += dt;
    const T = this.sinkT;
    const m = this.model.root;
    if (this._sinkRollSign === undefined) this._sinkRollSign = Math.random() < 0.5 ? 1 : -1;
    if (this._sinkPitch === undefined) { this._sinkPitch = 0; this._sinkRoll = 0; }
    this._sinkPitch += dt * 0.012;
    this._sinkRoll += dt * 0.018 * this._sinkRollSign;
    m.rotation.set(this._sinkPitch, this.heading, this._sinkRoll);
    m.position.set(this.pos.x, -T * T * 0.42, this.pos.z);
    // 蒸汽与气泡
    if (Math.random() < 0.8) FX.sinkSteam(this.pos.x, Math.max(1, 4 - T * 0.3), this.pos.z);
    if (T > 14) this.remove = true;
  }
}

/* ============================================================
 * Shell — 炮弹
 * ============================================================ */
class Shell {
  constructor(owner, from, to, v, ammo = "he") {
    this.owner = owner;
    this.pos = from.clone();
    const dx = to.x - from.x, dz = to.z - from.z;
    const elev = ballisticAngle(from, to, v);
    const horiz = Math.hypot(dx, dz);
    const dirX = dx / horiz, dirZ = dz / horiz;
    const cosE = Math.cos(elev), sinE = Math.sin(elev);
    this.vel = new THREE.Vector3(dirX * v * cosE, v * sinE, dirZ * v * cosE);
    this.alive = true;
    this.t = 0;
    this.tracerAcc = 0;
    this.ammo = ammo;                    // "ap" / "he"
    const g = owner.cfg.guns;
    this.dmg = g.dmgMin + Math.random() * (g.dmgMax - g.dmgMin);
    this.citChance = g.citChance;
    this.hitH = owner.cfg.freeboard + 14;
  }

  update(dt) {
    this.t += dt;
    if (this.t > 40) { this.alive = false; return; }
    this.vel.y -= GRAV * dt;
    this.pos.addScaledVector(this.vel, dt);

    // 曳光（HE 橙色 / AP 按阵营）+ 烟迹
    this.tracerAcc += dt;
    if (this.tracerAcc > 0.045) {
      this.tracerAcc = 0;
      const c = this.ammo === "he" ? [1, 0.62, 0.28]
        : (this.owner.team === "blue" ? [1, 0.9, 0.72] : [1, 0.45, 0.35]);
      FX.tracer(this.pos.x, this.pos.y, this.pos.z, c[0], c[1], c[2]);
      FX.shellTrail(this.pos.x, this.pos.y, this.pos.z);
    }

    // 命中敌舰（胶囊体近似）—— 必须先于落水检测，否则水线命中会被吞掉
    const ships = G.ships;
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i];
      if (!s.alive || s.team === this.owner.team || s.remove) continue;
      const relX = this.pos.x - s.pos.x, relZ = this.pos.z - s.pos.z;
      const fwd = s.forward();
      const along = relX * fwd.x + relZ * fwd.z;
      const halfL = s.cfg.length * 0.48;
      if (along < -halfL || along > halfL) continue;
      const px = s.pos.x + fwd.x * along, pz = s.pos.z + fwd.z * along;
      const d2 = (this.pos.x - px) ** 2 + (this.pos.z - pz) ** 2;
      const rad = s.cfg.beam * 0.8;
      if (d2 < rad * rad && this.pos.y < s.hitH) {
        this._hit(s);
        return;
      }
    }

    // 落水
    if (this.pos.y <= 0.3) {
      FX.splashColumn(this.pos.x, this.pos.z, 1 + this.dmg / 9000);
      G.onShellSplash(this);
      this.alive = false;
      return;
    }

    // 命中岛屿（多圆拟合）
    for (const c of G.islandCols) {
      const d2 = (this.pos.x - c.x) ** 2 + (this.pos.z - c.z) ** 2;
      if (d2 < c.r * c.r && this.pos.y < c.h * (1 - Math.sqrt(d2) / c.r * 0.7)) {
        FX.explosion(this.pos.x, this.pos.y, this.pos.z, 0.8, false);
        this.alive = false;
        return;
      }
    }
  }

  _hit(ship) {
    const isHE = this.ammo === "he";
    const g = this.owner.cfg.guns;
    // AP：可击穿核心区（高倍伤害）；HE：按各舰 WoWS 高爆伤害 + 各自起火率
    let cit = !isHE && Math.random() < this.citChance;
    let base = isHE ? g.heDmg : this.dmg;
    // AP 摆角度机制：入射方向与舰体长轴夹角 —— 舰艏/舰艉对敌（T 头摆角度）跳弹，垂直舷侧打核心
    if (!isHE) {
      const vh = this.vel.clone().setY(0).normalize();
      const impactDeg = Math.acos(THREE.MathUtils.clamp(Math.abs(vh.dot(ship.forward())), 0, 1)) * 180 / Math.PI;
      if (impactDeg < 22) {                        // 大角度跳弹
        base *= 0.12; cit = false;
        FX.ricochet(this.pos.x, this.pos.y, this.pos.z);
      } else if (impactDeg < 38) {                 // 半跳弹：核心率减半
        cit = Math.random() < this.citChance * 0.45;
      }
    }
    let dmg = base * (cit ? g.citMul : 1) * (0.92 + Math.random() * 0.16);
    const fireChance = isHE ? g.heFire : g.apFire;
    FX.explosion(this.pos.x, this.pos.y, this.pos.z, cit ? 1.6 : (isHE ? 1.1 : 0.9), false);
    ship.applyDamage(dmg, { citadel: cit, hitPos: this.pos.clone(), fireChance });
    G.onShellHit(this, ship, dmg, cit);
    this.alive = false;
  }
}

/* ============================================================
 * Torpedo — 鱼雷
 * ============================================================ */
class Torpedo {
  constructor(owner, x, z, heading) {
    const t = owner.cfg.torp;
    this.owner = owner;
    this.pos = new THREE.Vector3(x, -1.5, z);
    this.heading = heading;
    this.speed = t.speed;
    this.range = t.range;
    this.traveled = 0;
    this.alive = true;
    this.wakeAcc = 0;
  }

  update(dt) {
    const step = this.speed * dt;
    this.traveled += step;
    if (this.traveled > this.range) { this.alive = false; return; }
    this.pos.x += Math.sin(this.heading) * step;
    this.pos.z += Math.cos(this.heading) * step;

    this.wakeAcc += dt;
    if (this.wakeAcc > 0.05) { this.wakeAcc = 0; FX.torpedoWake(this.pos.x, this.pos.z); }

    // 命中舰船（不攻击友军；150m 后解除保险）
    if (this.traveled > 150) {
      for (const s of G.ships) {
        if (!s.alive || s.team === this.owner.team || s.remove) continue;
        const relX = this.pos.x - s.pos.x, relZ = this.pos.z - s.pos.z;
        const fwd = s.forward();
        const along = relX * fwd.x + relZ * fwd.z;
        const halfL = s.cfg.length * 0.5;
        if (along < -halfL || along > halfL) continue;
        const px = s.pos.x + fwd.x * along, pz = s.pos.z + fwd.z * along;
        const d2 = (this.pos.x - px) ** 2 + (this.pos.z - pz) ** 2;
        if (d2 < (s.cfg.beam * 0.8) ** 2) {
          FX.explosion(px, 2, pz, 2.6, true);
          s.applyDamage(this.owner.cfg.torp.dmg, { citadel: true, hitPos: new THREE.Vector3(px, 2, pz) });
          // 50% 概率进水（持续掉血；维修小组期间损管免疫）
          if (Math.random() < 0.5 && s.alive && !s.repairing) {
            s.flooding = true;
            s.floodingT = 25;
          }
          G.onTorpedoHit(this, s);
          this.alive = false;
          return;
        }
      }
    }

    // 命中岛屿（多圆拟合）
    for (const c of G.islandCols) {
      const d2 = (this.pos.x - c.x) ** 2 + (this.pos.z - c.z) ** 2;
      if (d2 < c.r * c.r) {
        FX.explosion(this.pos.x, 1, this.pos.z, 1.0, true);
        this.alive = false;
        return;
      }
    }
  }
}

/* ============================================================
 * AIController — 敌舰 / 友舰 AI
 * ============================================================ */
class AIController {
  constructor(ship, skill = 1) {
    this.ship = ship;
    this.skill = skill;                 // 0.6 ~ 1.4
    this.target = null;
    this.retargetT = 0;
    this.aimT = 0;
    this.aimPoint = new THREE.Vector3();
    this.orbitSide = Math.random() < 0.5 ? 1 : -1;
    this.orbitT = 6 + Math.random() * 8;
    this.torpT = 8 + Math.random() * 20;
    this.prefRange = ship.cls === "dd" ? 1700 : (ship.cls === "bb" ? 3200 : 2500);
    this.zigT = 4 + Math.random() * 4;
    this.zig = 0;
  }

  update(dt) {
    const s = this.ship;
    if (!s.alive) return;

    /* 选择目标（玩家略优先，但以最近为主） */
    this.retargetT -= dt;
    if (!this.target || !this.target.alive || this.retargetT <= 0) {
      this.retargetT = 3;
      let best = null, bd = Infinity;
      for (const o of G.ships) {
        if (!o.alive || o.team === s.team) continue;
        // 巡洋舰较优先攻击玩家旗舰（权重 ×2），其余舰船以最近为主
        const w = o.isPlayer ? (s.cls === "ca" ? 2 : 1.2) : 1;
        const d = s.pos.distanceTo(o.pos) / w;
        if (d < bd) { bd = d; best = o; }
      }
      this.target = best;
    }
    if (!this.target) { s.rudderTarget = 0; return; }
    const tgt = this.target;
    const dist = s.pos.distanceTo(tgt.pos);
    const bearing = Math.atan2(tgt.pos.x - s.pos.x, tgt.pos.z - s.pos.z);

    /* 最近敌人（航行用，与移动目标独立） */
    let near = null, nearDist = Infinity;
    for (const o of G.ships) {
      if (!o.alive || o.team === s.team) continue;
      const d = s.pos.distanceTo(o.pos);
      if (d < nearDist) { nearDist = d; near = o; }
    }
    /* 炮击/鱼雷目标：仅限本队视野内已点亮的敌舰（WoWS 隐蔽规则，无透视） */
    let vis = null, visDist = Infinity;
    for (const o of G.ships) {
      if (!o.alive || o.team === s.team) continue;
      if (!(s.team === "blue" ? o.spottedBlue : o.spottedRed)) continue;
      const d = s.pos.distanceTo(o.pos);
      if (d < visDist) { visDist = d; vis = o; }
    }

    /* ---------- 航行决策 ---------- */
    this.orbitT -= dt;
    if (this.orbitT <= 0) { this.orbitT = 8 + Math.random() * 8; this.orbitSide *= -1; }
    this.zigT -= dt;
    if (this.zigT <= 0) { this.zigT = 6 + Math.random() * 6; this.zig = (Math.random() - 0.5) * (s.cls === "dd" ? 35 : 10); }

    let desired;
    if (dist > this.prefRange * 1.25) desired = bearing;                       // 接敌
    else if (dist < this.prefRange * 0.6) desired = bearing + Math.PI * 0.6;   // 拉开
    else desired = bearing + this.orbitSide * Math.PI / 2.4 + THREE.MathUtils.degToRad(this.zig);  // 绕行

    // 避岛：对靠近的岛屿产生排斥航向（用拟合碰撞圆）
    for (const c of G.islandCols) {
      const dx = s.pos.x - c.x, dz = s.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + 700 && d > 0.01) {
        const away = Math.atan2(dx, dz);
        const w = 1 - (d - c.r) / 700;
        let mix = angNorm(away - desired);
        desired = angNorm(desired + mix * w);
      }
    }
    // 边界规避
    const B = 5400;
    if (Math.abs(s.pos.x) > B || Math.abs(s.pos.z) > B) {
      const toC = Math.atan2(-s.pos.x, -s.pos.z);
      desired = angNorm(desired + angNorm(toC - desired) * 0.7);
    }

    const err = angNorm(desired - s.heading);
    s.rudderTarget = THREE.MathUtils.clamp(err * 2.2, -1, 1);
    // 换挡节流（避免每帧连续换挡）
    this._thrT = (this._thrT || 0) - dt;
    if (this._thrT <= 0) {
      this._thrT = 1.5;
      if (dist < 1200 && s.cls === "dd" && Math.abs(err) > Math.PI * 0.6) {
        if (s.throttleIdx > 0) s.setThrottle(-1);      // 驱逐舰近距乱战 → 减速
      } else if (s.throttleIdx < 4) {
        s.setThrottle(1);
      }
    }

    /* 烟雾决策：被点亮且残血时释放烟幕 */
    if (s.smokeCfg && s.smokeCharges > 0) {
      const mySpotted = s.team === "blue" ? s.spottedRed : s.spottedBlue;
      if (mySpotted && s.hp < s.hpMax * 0.65 && Math.random() < dt * 0.3) s.startSmoke();
    }
    /* 炮击（仅攻击视野内目标；按目标舰种选弹） */
    this.aimT -= dt;
    if (this.aimT <= 0 && vis) {
      this.aimT = 1.6 + Math.random() * 1.4;
      const v = s.cfg.guns.muzzleV;
      let tof = visDist / v;
      for (let it = 0; it < 2; it++) {
        const e = ballisticAngle(s.pos, vis.pos, v);
        tof = visDist / (v * Math.cos(e === null ? 0.35 : e));
      }
      const tv = vis.velocity();
      const errBase = (25 + visDist * 0.012) / this.skill;
      this.aimPoint.set(
        vis.pos.x + tv.x * tof + (Math.random() - 0.5) * 2 * errBase, 0,
        vis.pos.z + tv.z * tof + (Math.random() - 0.5) * 2 * errBase);
    }
    s.aimPoint = vis ? this.aimPoint : null;

    if (s.gunReady && vis && visDist < s.cfg.guns.range * 0.96 && s.gunsAligned() > 0) {
      s.ammoType = vis.cls === "bb" ? "ap" : "he";   // 打战列用 AP，其余 HE
      const r = s.fireGuns();
      if (r) G.onAIFire(s, r);
    }

    /* ---------- 鱼雷（驱逐舰/巡洋舰，朝视野内最近敌人，小扇形） ---------- */
    if (s.cfg.torp) {
      this.torpT -= dt;
      const tb = vis ? Math.atan2(vis.pos.x - s.pos.x, vis.pos.z - s.pos.z) : 0;
      const broadside = Math.abs(angNorm(tb - s.heading));
      if (this.torpT <= 0 && s.torpReady && visDist < 4500 &&
          broadside > Math.PI * 0.25 && broadside < Math.PI * 0.75) {
        this.torpT = 26 + Math.random() * 18;
        const tof = visDist / s.cfg.torp.speed;
        const tv = vis.velocity();
        const leadYaw = Math.atan2(
          vis.pos.x + tv.x * tof - s.pos.x,
          vis.pos.z + tv.z * tof - s.pos.z);
        const r = s.fireTorpedoes(leadYaw, 6);
        if (r) G.onAITorp(s, r);
      }
    }
  }
}
