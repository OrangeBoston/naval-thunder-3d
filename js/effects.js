/* ============================================================
 * effects.js — 粒子特效系统
 *  两个 Points 粒子池（普通混合 / 加法混合）+ 水面冲击环
 *  着色器实现逐粒子大小 / 颜色 / 透明度
 * ============================================================ */
"use strict";

const PARTICLE_VERT = `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (600.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = `
  varying vec4 vColor;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    float a = vColor.a * smoothstep(1.0, 0.35, d);
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    // CPU 侧粒子状态
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max); this.grow = new Float32Array(max);
    this.gravity = new Float32Array(max); this.drag = new Float32Array(max);
    this.r = new Float32Array(max); this.g = new Float32Array(max); this.b = new Float32Array(max);
    this.a0 = new Float32Array(max);        // 初始 alpha
    this.fadePow = new Float32Array(max);
    this.active = new Uint8Array(max);
    this.cursor = 0;
    this.aliveCount = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }

  spawn(o) {
    // 找一个空槽（简单轮询）
    let idx = -1;
    for (let i = 0; i < this.max; i++) {
      const j = (this.cursor + i) % this.max;
      if (!this.active[j]) { idx = j; this.cursor = j + 1; break; }
    }
    if (idx < 0) { idx = this.cursor % this.max; this.cursor++; }

    this.px[idx] = o.x; this.py[idx] = o.y; this.pz[idx] = o.z;
    this.vx[idx] = o.vx || 0; this.vy[idx] = o.vy || 0; this.vz[idx] = o.vz || 0;
    this.life[idx] = 0; this.maxLife[idx] = o.life || 1;
    this.baseSize[idx] = o.size || 4; this.grow[idx] = o.grow || 0;
    this.gravity[idx] = o.gravity || 0; this.drag[idx] = (o.drag !== undefined ? o.drag : 0.3);
    this.r[idx] = o.r; this.g[idx] = o.g; this.b[idx] = o.b;
    this.a0[idx] = (o.a !== undefined ? o.a : 1);
    this.fadePow[idx] = o.fadePow || 1;
    this.active[idx] = 1;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.active[i] = 0;
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.gravity[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;

      const k = this.life[i] / this.maxLife[i];
      const alpha = this.a0[i] * Math.pow(1 - k, this.fadePow[i]);
      const s = this.baseSize[i] * (1 + this.grow[i] * k);

      this.pos[i * 3] = this.px[i]; this.pos[i * 3 + 1] = this.py[i]; this.pos[i * 3 + 2] = this.pz[i];
      this.col[i * 4] = this.r[i]; this.col[i * 4 + 1] = this.g[i]; this.col[i * 4 + 2] = this.b[i];
      this.col[i * 4 + 3] = alpha;
      this.size[i] = s;
    }
    this.aliveCount = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

/* ---------- 水面冲击扩散环 ---------- */
class RingPool {
  constructor(scene, max = 24) {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.82, 1.0, 40);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.renderOrder = 9;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, r0: 1, r1: 10, active: false });
    }
  }
  spawn(x, y, z, r0, r1, dur, color = 0xffffff, opacity = 0.7) {
    const r = this.rings.find(r => !r.active) || this.rings[0];
    r.active = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1;
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.mesh.material.color.setHex(color);
    r.baseOpacity = opacity;
  }
  update(dt) {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      if (r.t >= r.dur) { r.active = false; r.mesh.visible = false; continue; }
      const k = r.t / r.dur;
      const rad = r.r0 + (r.r1 - r.r0) * Math.pow(k, 0.6);
      r.mesh.scale.set(rad, 1, rad);
      r.mesh.material.opacity = r.baseOpacity * (1 - k);
    }
  }
}

/* ============================================================
 * FX — 全局特效单例（由 main.js 初始化）
 * ============================================================ */
const FX = {
  poolNormal: null,   // 烟 / 水花 / 泡沫
  poolAdd: null,      // 火焰 / 闪光 / 曳光
  rings: null,

  init(scene) {
    this.poolNormal = new ParticlePool(scene, 2600, false);
    this.poolAdd = new ParticlePool(scene, 1000, true);
    this.rings = new RingPool(scene, 24);
  },

  update(dt) {
    this.poolNormal.update(dt);
    this.poolAdd.update(dt);
    this.rings.update(dt);
  },

  rand(s) { return (Math.random() - 0.5) * 2 * s; },

  /* 炮口闪光: dir 为发射方向 */
  muzzleFlash(x, y, z, dir, scale = 1) {
    const P = this.poolAdd;
    for (let i = 0; i < 7; i++) {
      P.spawn({
        x: x + this.rand(1.5 * scale), y: y + this.rand(1.5 * scale), z: z + this.rand(1.5 * scale),
        vx: dir.x * (35 * scale) + this.rand(9), vy: dir.y * 12 + this.rand(7), vz: dir.z * (35 * scale) + this.rand(9),
        life: 0.14 + Math.random() * 0.12, size: 14 * scale + Math.random() * 10 * scale, grow: 2.2,
        r: 1, g: 0.82, b: 0.35, a: 1, drag: 1.4, fadePow: 1.4,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.poolNormal.spawn({
        x, y, z,
        vx: dir.x * 18 + this.rand(6), vy: 4 + this.rand(4), vz: dir.z * 18 + this.rand(6),
        life: 1.1 + Math.random() * 0.7, size: 7 * scale, grow: 3.4,
        r: 0.62, g: 0.63, b: 0.66, a: 0.4, drag: 0.9, fadePow: 1.2,
      });
    }
  },

  /* 爆炸（舰体或水面） */
  explosion(x, y, z, scale = 1, onWater = false) {
    const A = this.poolAdd, N = this.poolNormal;
    const n1 = Math.round(10 + 8 * scale);
    for (let i = 0; i < n1; i++) {           // 火球
      A.spawn({
        x: x + this.rand(3 * scale), y: y + this.rand(2 * scale), z: z + this.rand(3 * scale),
        vx: this.rand(26 * scale), vy: 10 * scale + Math.random() * 20 * scale, vz: this.rand(26 * scale),
        life: 0.35 + Math.random() * 0.4, size: 13 * scale + Math.random() * 14 * scale, grow: 1.6,
        r: 1, g: 0.55 + Math.random() * 0.3, b: 0.18, a: 1, gravity: 6, drag: 1.1, fadePow: 1.6,
      });
    }
    for (let i = 0; i < 8; i++) {            // 火星
      A.spawn({
        x, y, z,
        vx: this.rand(60 * scale), vy: 30 + Math.random() * 50, vz: this.rand(60 * scale),
        life: 0.5 + Math.random() * 0.5, size: 2.6, grow: 0,
        r: 1, g: 0.8, b: 0.4, a: 1, gravity: 40, drag: 0.25, fadePow: 0.8,
      });
    }
    const n2 = Math.round(9 + 7 * scale);
    for (let i = 0; i < n2; i++) {            // 浓烟
      N.spawn({
        x: x + this.rand(4 * scale), y: y + Math.random() * 3, z: z + this.rand(4 * scale),
        vx: this.rand(8), vy: 9 + Math.random() * 13, vz: this.rand(8),
        life: 2.2 + Math.random() * 2.2, size: 11 * scale, grow: 3.2,
        r: 0.16, g: 0.16, b: 0.17, a: 0.55, drag: 0.65, fadePow: 1.1,
      });
    }
    if (onWater) {
      this.rings.spawn(x, 0.6, z, 6 * scale, 55 * scale, 1.5, 0xdfeaf2, 0.55);
      this.splashColumn(x, z, scale * 1.1);
    } else {
      this.rings.spawn(x, y, z, 4 * scale, 34 * scale, 0.9, 0xffc873, 0.35);
    }
  },

  /* 水柱（炮弹落水 / 鱼雷爆炸） */
  splashColumn(x, z, scale = 1) {
    const N = this.poolNormal;
    const n = Math.round(14 + 12 * scale);
    for (let i = 0; i < n; i++) {
      N.spawn({
        x: x + this.rand(2.5 * scale), y: 0.5, z: z + this.rand(2.5 * scale),
        vx: this.rand(9 * scale), vy: (28 + Math.random() * 34) * scale, vz: this.rand(9 * scale),
        life: 1.5 + Math.random() * 1.1, size: 4.5 * scale, grow: 1.5,
        r: 0.88, g: 0.94, b: 0.98, a: 0.85, gravity: 26, drag: 0.12, fadePow: 1.0,
      });
    }
    // 环形浪
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      N.spawn({
        x: x + Math.cos(a) * 4 * scale, y: 0.6, z: z + Math.sin(a) * 4 * scale,
        vx: Math.cos(a) * 10 * scale, vy: 4, vz: Math.sin(a) * 10 * scale,
        life: 1.1, size: 6 * scale, grow: 2,
        r: 0.85, g: 0.92, b: 0.97, a: 0.6, drag: 0.5, fadePow: 1,
      });
    }
    this.rings.spawn(x, 0.5, z, 3 * scale, 30 * scale, 1.6, 0xe8f4fb, 0.5);
  },

  /* 持续燃烧的火（挂在被点燃的舰体上，每帧概率调用） */
  fireTick(x, y, z, scale = 1) {
    this.poolAdd.spawn({
      x: x + this.rand(2.5), y, z: z + this.rand(2.5),
      vx: this.rand(3), vy: 11 + Math.random() * 9, vz: this.rand(3),
      life: 0.5 + Math.random() * 0.35, size: 7 * scale, grow: 0.8,
      r: 1, g: 0.55, b: 0.2, a: 0.9, drag: 0.5, fadePow: 1.2,
    });
    if (Math.random() < 0.5) {
      this.poolNormal.spawn({
        x, y: y + 4, z,
        vx: this.rand(2), vy: 15, vz: this.rand(2),
        life: 2.6, size: 8 * scale, grow: 3.5,
        r: 0.13, g: 0.13, b: 0.14, a: 0.5, drag: 0.6, fadePow: 1,
      });
    }
  },

  /* 烟囱排烟 */
  funnelSmoke(x, y, z, throttle) {
    if (Math.random() < 0.35 + throttle * 0.6) {
      this.poolNormal.spawn({
        x: x + this.rand(1.5), y, z: z + this.rand(1.5),
        vx: this.rand(1.5), vy: 7 + Math.random() * 5 + throttle * 6, vz: this.rand(1.5),
        life: 3 + Math.random() * 2.5, size: 5, grow: 4.5,
        r: 0.35, g: 0.36, b: 0.38, a: 0.28, drag: 0.25, fadePow: 1,
      });
    }
  },

  /* 舰船尾流泡沫 */
  wakeFoam(x, z, scale = 1) {
    this.poolNormal.spawn({
      x: x + this.rand(2 * scale), y: 0.35, z: z + this.rand(2 * scale),
      vx: 0, vy: 0.3, vz: 0,
      life: 2.8 + Math.random() * 2, size: 4 * scale, grow: 1.6,
      r: 0.95, g: 0.97, b: 1, a: 0.5, drag: 0, fadePow: 0.8,
    });
  },

  /* 高速航行艏浪飞沫 */
  bowSpray(x, y, z, speedK) {
    if (Math.random() < speedK) {
      this.poolNormal.spawn({
        x, y, z,
        vx: this.rand(4), vy: 6 + Math.random() * 8, vz: this.rand(4),
        life: 0.8, size: 3.5, grow: 1.2,
        r: 0.9, g: 0.95, b: 1, a: 0.75, gravity: 18, drag: 0.3, fadePow: 1,
      });
    }
  },

  /* 鱼雷尾迹气泡 */
  torpedoWake(x, z) {
    this.poolNormal.spawn({
      x: x + this.rand(0.8), y: 0.3, z: z + this.rand(0.8),
      vx: 0, vy: 0.8, vz: 0,
      life: 2.4, size: 2.6, grow: 1.4,
      r: 0.92, g: 0.96, b: 1, a: 0.55, drag: 0, fadePow: 0.9,
    });
  },

  /* 炮弹曳光（更大更亮） */
  tracer(x, y, z, r = 1, g = 0.85, b = 0.5) {
    this.poolAdd.spawn({
      x, y, z, vx: 0, vy: 0, vz: 0,
      life: 0.42, size: 5.2, grow: -0.4,
      r, g, b, a: 0.95, drag: 0, fadePow: 0.6,
    });
  },

  /* 炮弹烟迹（沿弹道留下一串消散的灰烟，形成可见弧线） */
  shellTrail(x, y, z) {
    this.poolNormal.spawn({
      x: x + this.rand(0.5), y: y + this.rand(0.5), z: z + this.rand(0.5),
      vx: this.rand(0.8), vy: this.rand(0.8) + 0.4, vz: this.rand(0.8),
      life: 0.75 + Math.random() * 0.35, size: 2.4, grow: 2.6,
      r: 0.8, g: 0.82, b: 0.85, a: 0.32, drag: 0.5, fadePow: 1,
    });
  },

  /* 鱼雷航迹（WoWS 式明显白色泡沫带，水面铺开、长寿命） */
  torpedoWake(x, z) {
    this.poolNormal.spawn({
      x: x + this.rand(0.7), y: 0.4, z: z + this.rand(0.7),
      vx: 0, vy: 0.12, vz: 0,
      life: 5.5 + Math.random() * 2.5, size: 4.6, grow: 2.6,
      r: 0.94, g: 0.97, b: 1, a: 0.8, drag: 0, fadePow: 0.55,
    });
    if (Math.random() < 0.6) {
      this.poolNormal.spawn({
        x: x + this.rand(1.6), y: 0.35, z: z + this.rand(1.6),
        vx: 0, vy: 0.1, vz: 0,
        life: 4 + Math.random() * 2, size: 6.5, grow: 3.2,
        r: 0.9, g: 0.94, b: 0.99, a: 0.55, drag: 0, fadePow: 0.7,
      });
    }
  },

  /* AP 跳弹火花（摆角度弹开） */
  ricochet(x, y, z) {
    for (let i = 0; i < 4; i++) {
      this.poolAdd.spawn({
        x, y, z,
        vx: this.rand(26), vy: 6 + Math.random() * 14, vz: this.rand(26),
        life: 0.3 + Math.random() * 0.2, size: 2.2, grow: 0,
        r: 1, g: 0.85, b: 0.5, a: 0.9, gravity: 30, drag: 0.2, fadePow: 0.7,
      });
    }
  },

  /* 烟幕团（烟雾发生器） */
  smokeCloud(x, z, r) {
    this.poolNormal.spawn({
      x: x + this.rand(r * 0.55), y: 2 + Math.random() * 9, z: z + this.rand(r * 0.55),
      vx: this.rand(1.2), vy: 0.9 + Math.random(), vz: this.rand(1.2),
      life: 3.2 + Math.random() * 1.6, size: 24, grow: 1.5,
      r: 0.62, g: 0.63, b: 0.65, a: 0.42, drag: 0.25, fadePow: 1,
    });
  },

  /* 沉船蒸汽/气泡 */
  sinkSteam(x, y, z) {
    if (Math.random() < 0.7) {
      this.poolNormal.spawn({
        x: x + this.rand(8), y, z: z + this.rand(8),
        vx: this.rand(2), vy: 9 + Math.random() * 8, vz: this.rand(2),
        life: 2.8, size: 10, grow: 3,
        r: 0.75, g: 0.78, b: 0.8, a: 0.5, drag: 0.4, fadePow: 1,
      });
    }
    if (Math.random() < 0.4) {
      this.poolNormal.spawn({
        x: x + this.rand(10), y: 0.2, z: z + this.rand(10),
        vx: 0, vy: 4, vz: 0,
        life: 1.6, size: 3, grow: 1,
        r: 0.85, g: 0.92, b: 0.97, a: 0.6, drag: 0, fadePow: 1,
      });
    }
  },
};
