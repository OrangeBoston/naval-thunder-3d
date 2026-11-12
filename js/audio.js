/* ============================================================
 * audio.js — WebAudio 程序化音效引擎（无外部音频文件）
 * 所有声音均由噪声/振荡器实时合成
 * ============================================================ */
"use strict";

const AudioSys = {
  ctx: null,
  master: null,
  muted: false,
  _noiseBuf: null,
  _engine: null,       // { src, filter, gain }
  _sea: null,          // 环境海浪

  /* 必须在用户手势中调用 */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // 共享白噪声缓冲（2 秒）
    const len = this.ctx.sampleRate * 2;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._startAmbient();
  },

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  },

  _noise(dur, { type = "lowpass", freq = 1000, q = 0.8, gain = 0.5, attack = 0.002, freqEnd = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
    if (freqEnd !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },

  _tone(freq, dur, { gain = 0.4, type = "sine", freqEnd = null, attack = 0.003 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  /* 主炮开火: power 1=驱逐 2=巡洋 3=战列 */
  gun(power, distFactor = 1) {
    if (!this.ctx) return;
    const v = distFactor;                       // 距离衰减
    if (power >= 3) {
      this._noise(1.4, { freq: 900 * v, freqEnd: 90, gain: 0.65 * v });
      this._tone(70, 1.2, { gain: 0.55 * v, freqEnd: 34 });
      this._tone(140, 0.5, { gain: 0.2 * v, freqEnd: 60, type: "triangle" });
    } else if (power === 2) {
      this._noise(0.8, { freq: 1200 * v, freqEnd: 140, gain: 0.4 * v });
      this._tone(110, 0.7, { gain: 0.3 * v, freqEnd: 50 });
    } else {
      this._noise(0.45, { freq: 1600 * v, freqEnd: 220, gain: 0.28 * v });
      this._tone(160, 0.35, { gain: 0.18 * v, freqEnd: 70 });
    }
  },

  /* 爆炸: big=true 沉船/核心 */
  explosion(big = false, distFactor = 1) {
    if (!this.ctx) return;
    const v = distFactor;
    if (big) {
      this._noise(2.2, { freq: 700 * v, freqEnd: 40, gain: 0.7 * v });
      this._tone(55, 1.8, { gain: 0.5 * v, freqEnd: 25 });
    } else {
      this._noise(0.9, { freq: 1000 * v, freqEnd: 80, gain: 0.4 * v });
      this._tone(90, 0.7, { gain: 0.25 * v, freqEnd: 40 });
    }
  },

  /* 命中本舰金属声 */
  hitMetal() {
    if (!this.ctx) return;
    this._noise(0.25, { type: "bandpass", freq: 2200, q: 2.5, gain: 0.5 });
    this._tone(520, 0.18, { type: "square", gain: 0.12, freqEnd: 240 });
    this._tone(85, 0.4, { gain: 0.3, freqEnd: 40 });
  },

  /* 炮弹落水水花 */
  splash(vol = 1) {
    if (!this.ctx) return;
    this._noise(0.7, { type: "highpass", freq: 900, gain: 0.22 * vol, attack: 0.01 });
    this._noise(0.35, { freq: 600, freqEnd: 200, gain: 0.18 * vol });
  },

  torpedoLaunch() {
    if (!this.ctx) return;
    this._noise(0.8, { type: "bandpass", freq: 500, q: 1.2, gain: 0.4, freqEnd: 1500 });
    this._tone(220, 0.5, { gain: 0.1, freqEnd: 90 });
  },

  hitByTorpedo() {
    this.explosion(true, 1);
    this._tone(38, 2.4, { gain: 0.6, freqEnd: 20 });
  },

  uiClick() { this._tone(880, 0.06, { gain: 0.12, type: "triangle" }); },

  warning() {
    if (!this.ctx) return;
    this._tone(980, 0.14, { gain: 0.16, type: "square" });
    setTimeout(() => this._tone(740, 0.14, { gain: 0.14, type: "square" }), 160);
  },

  victory() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.35, { gain: 0.2, type: "triangle" }), i * 170));
  },

  defeat() {
    if (!this.ctx) return;
    [392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.5, { gain: 0.2, type: "triangle" }), i * 240));
  },

  /* ---------- 持续声：主机 + 海浪 + 雨 ---------- */
  _startAmbient() {
    const c = this.ctx;

    // 海浪：低通噪声 + 缓慢音量起伏
    const seaSrc = c.createBufferSource();
    seaSrc.buffer = this._noiseBuf; seaSrc.loop = true;
    const seaFlt = c.createBiquadFilter();
    seaFlt.type = "lowpass"; seaFlt.frequency.value = 420;
    const seaGain = c.createGain(); seaGain.gain.value = 0.045;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = c.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG); lfoG.connect(seaGain.gain);
    seaSrc.connect(seaFlt); seaFlt.connect(seaGain); seaGain.connect(this.master);
    seaSrc.start(); lfo.start();
    this._sea = seaGain;

    // 主机：带通噪声，随航速变调
    const engSrc = c.createBufferSource();
    engSrc.buffer = this._noiseBuf; engSrc.loop = true;
    const engFlt = c.createBiquadFilter();
    engFlt.type = "bandpass"; engFlt.frequency.value = 60; engFlt.Q.value = 1.4;
    const engGain = c.createGain(); engGain.gain.value = 0.0;
    engSrc.connect(engFlt); engFlt.connect(engGain); engGain.connect(this.master);
    engSrc.start();
    this._engine = { filter: engFlt, gain: engGain };

    // 雨声（highpass 白噪，暴雨时开启）
    const rainSrc = c.createBufferSource();
    rainSrc.buffer = this._noiseBuf; rainSrc.loop = true;
    const rainFlt = c.createBiquadFilter();
    rainFlt.type = "highpass"; rainFlt.frequency.value = 2600;
    const rainGain = c.createGain(); rainGain.gain.value = 0.0;
    rainSrc.connect(rainFlt); rainFlt.connect(rainGain); rainGain.connect(this.master);
    rainSrc.start();
    this._rain = rainGain;
  },

  /* 雨/雷（天气驱动） */
  rain(on) {
    if (!this._rain) return;
    this._rain.gain.setTargetAtTime(on ? 0.075 : 0.0, this.ctx.currentTime, 1.2);
  },

  thunder() {
    if (!this.ctx) return;
    // 远处滚雷：低通噪声长脉冲 + 随机颤
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const flt = c.createBiquadFilter();
    flt.type = "lowpass"; flt.frequency.setValueAtTime(320, t);
    flt.frequency.exponentialRampToValueAtTime(60, t + 2.6);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    gn.gain.exponentialRampToValueAtTime(0.14, t + 0.9);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    src.connect(flt); flt.connect(gn); gn.connect(this.master);
    src.start(t); src.stop(t + 3.0);
  },

  /* speedFactor: 0..1 */
  engineSet(speedFactor, alive) {
    if (!this._engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = alive ? 0.02 + speedFactor * 0.09 : 0;
    this._engine.gain.gain.setTargetAtTime(target, t, 0.4);
    this._engine.filter.frequency.setTargetAtTime(55 + speedFactor * 120, t, 0.4);
  },
};
