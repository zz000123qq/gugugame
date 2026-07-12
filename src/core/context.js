// ============================================================ 共享上下文
// 所有跨模块共享的可变单例（场景、状态、实体数组、群渲染器、临时变量）都集中在此。
// 各功能模块从本文件具名导入，因此函数体内仍可直接使用 state / squad / scene 等原名，
// 行为与拆分前完全一致。注意：数组一律"原地修改"（.length=0 / push / splice），切勿整体重新赋值。
import * as THREE from 'three';
import { CrowdRenderer, soldierParts, zombieParts } from '../crowd.js';
import { SFX } from '../audio.js';
import {
  MAX_SOLDIER_RENDER, MAX_ZOMBIE_RENDER, BASE_SPACING, MAX_SQUAD_RADIUS,
  FIRST_BOSS_AT, ZOMBIE_TYPES, ZOMBIE_TYPE_KEYS,
} from '../config.js';
import { getBest } from '../progression.js';

// ---- 基础三件套
const app = document.getElementById('app');
export const renderer = new THREE.WebGLRenderer({ antialias: true });
// 移动端降像素比，减轻 GPU/发热（桌面仍用 2）
const _isMobile = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 820px)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, _isMobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1426);
scene.fog = new THREE.Fog(0x1a1426, 40, 95);

export const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

export const hemi = new THREE.HemisphereLight(0x9fb4ff, 0x33241f, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
sun.shadow.camera.far = 80;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- 音效与游戏状态
export const sfx = new SFX();

export const state = {
  phase: 'menu',            // menu | run | result
  dist: 0,
  best: getBest(),          // 最佳距离（由局外存档 dg_save 统一管理，自动迁移旧 dg_best）
  count: 10,
  maxCount: 10,
  kills: 0,
  weapon: 'rifle',
  fireAcc: 0,
  fireIndex: 0,
  rageTime: 0,
  shieldTime: 0,
  freezeTime: 0,
  laserZ: null,
  laserZ0: 0,
  shake: 0,
  // 无尽生成游标
  nextGateZ: -40,
  nextPickupZ: -70,
  nextWaveZ: -30,
  nextBossAt: FIRST_BOSS_AT,
  lastBossAt: 0,
  trickleTimer: 2,
  pullX: 0,
  pullTime: 0,
  // 濒死保护：兵力归零后保留短暂窗口，期间吃到增援可原地复活
  graceTime: 0,
  // 加特林预热：持续射击时从 0 升到 1，影响实际射速
  spinTime: 0,
  // 角色皮肤: 'soldier' | 'gugugaga'
  characterSkin: 'soldier',
  // 企鹅朝向: 'camera'（面向镜头/看脸，默认）| 'forward'（背向奔跑/真实但看不到脸）
  penguinFacing: (typeof localStorage !== 'undefined' && localStorage.getItem('dg_penguinFacing')) || 'camera',
  // 局外成长效果快照（开局由 progression 写入，热循环直接读取）
  powerMult: 1,   // 火力倍率（伤害）
  medkitMult: 1,  // 增援量倍率
  // 局内临时增益 / 统计
  powerBuffTime: 0,  // 强化门：限时火力翻倍
  bonusCoins: 0,     // 金币门等途径直接获得的末日币（结算时计入）
  // 连杀提示：窗口内连续击杀累计，达到里程碑弹横幅
  killStreak: 0,
  _prevKills: 0,
  _lastKillAt: -99999,
  _lastStreakBanner: 0,
};

export const squad = { x: 0, z: 0, targetX: 0, speed: 8.5 };

// ---- UI 元素引用
export const ui = {
  hud: document.getElementById('hud'),
  levelTag: document.getElementById('levelTag'),
  progressFill: document.getElementById('progressFill'),
  countBadge: document.getElementById('countBadge'),
  bossbar: document.getElementById('bossbar'),
  bossFill: document.querySelector('#bossbar .fill'),
  weaponTag: document.getElementById('weaponTag'),
  buffRow: document.getElementById('buffRow'),
  banner: document.getElementById('banner'),
  flash: document.getElementById('flash'),
  menu: document.getElementById('menuOverlay'),
  result: document.getElementById('resultOverlay'),
  resultTitle: document.getElementById('resultTitle'),
  resultStats: document.getElementById('resultStats'),
  resultBtn: document.getElementById('resultBtn'),
  resetBtn: document.getElementById('resetBtn'),
  startBtn: document.getElementById('startBtn'),
  muteBtn: document.getElementById('muteBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  pauseOverlay: document.getElementById('pauseOverlay'),
  pauseResume: document.getElementById('pauseResume'),
  pauseRestart: document.getElementById('pauseRestart'),
  pauseMute: document.getElementById('pauseMute'),
  pauseMenu: document.getElementById('pauseMenu'),
  joyBase: document.getElementById('joyBase'),
  joyKnob: document.getElementById('joyKnob'),
  charSelect: document.getElementById('charSelect'),
  penguinFacingWrap: document.getElementById('penguinFacingWrap'),
  charLoadStatus: document.getElementById('charLoadStatus'),
};
ui.resetBtn.style.display = 'none'; // 无尽模式没有"回到第 1 关"

// ---- 临时变量（供各模块复用以减少分配）
export const _bm = new THREE.Matrix4();
export const _bq = new THREE.Quaternion();
export const _bs = new THREE.Vector3();
export const _bp = new THREE.Vector3();
export const _bc = new THREE.Color();
export const _yAxis = new THREE.Vector3(0, 1, 0);
export const _proj = new THREE.Vector3();
export const _sq = new THREE.Quaternion();
export const _se = new THREE.Euler();

// ---- 实体数组（均为 const，原地修改，绝不整体重新赋值）
export const bullets = [];
export const enemyBullets = [];
export const zombies = [];
export const gates = [];
export const pickups = [];
export const bosses = [];
export const skulls = [];
export const shockwaves = [];
export const spikePatches = [];
export const bloodPools = [];
export const bursts = [];

// ---- 士兵 & 僵尸群渲染（每种僵尸一个实例化渲染器）
export const soldierCrowd = new CrowdRenderer(scene, soldierParts(), MAX_SOLDIER_RENDER);
export const zombieCrowds = {};
export const zombieBuckets = {};
for (const key of ZOMBIE_TYPE_KEYS) {
  const t = ZOMBIE_TYPES[key];
  zombieCrowds[key] = new CrowdRenderer(scene, t.parts ? t.parts() : zombieParts(t.palette), t.maxRender);
  zombieBuckets[key] = [];
}

// 黄金螺旋队形 + 队形缩放 / 半径计算
export const unitSpiral = [];
for (let i = 0; i < MAX_SOLDIER_RENDER; i++) {
  const r = Math.sqrt(i);
  const a = i * 2.39996;
  unitSpiral.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r });
}
export function formationScale(n) {
  if (n <= 1) return BASE_SPACING;
  return Math.min(BASE_SPACING, MAX_SQUAD_RADIUS / Math.sqrt(n - 1));
}
export function squadRadius() {
  const n = Math.min(state.count, MAX_SOLDIER_RENDER);
  return n <= 1 ? 0.4 : formationScale(n) * Math.sqrt(n - 1) + 0.4;
}

export { sun };
