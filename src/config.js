// ============================================================ 常量与数据表
// 纯数据 / 纯函数，不依赖 THREE，可被任意模块安全导入
import { infectedSoldierParts, hunterParts, butcherParts, shadowParts, witchParts, bansheeParts } from './crowd.js';

// 道路与场景
export const ROAD_W = 11;
export const SQUAD_X_LIMIT = 3.4;
export const MAX_SOLDIER_RENDER = 140;
export const MAX_ZOMBIE_RENDER = 500;      // 允许僵尸铺满整个屏幕
export const MAX_BULLETS = 700;
export const MAX_ENEMY_BULLETS = 80;
export const MAX_SQUAD_RADIUS = 2.3;
export const BASE_SPACING = 0.62;
export const MAX_SHOOTERS = 50;
export const GATE_W = 4.6;
export const GATE_H = 3.4;
export const CHUNK_LEN = 120;              // 环境按块无限生成

// 无尽模式节奏（单位：世界距离）
export const GATE_SPACING = 55;            // 门的间隔（比之前稀疏）
export const PICKUP_SPACING = 110;         // 道具箱平均间隔
export const WAVE_SPACING = 26;
export const FIRST_BOSS_AT = 320;
export const BOSS_INTERVAL = 420;

// 难度系数：随跑过的距离无限增长
export const diffAt = (dist) => 1 + dist / 140;

// ============================================================ 武器表
export const WEAPONS = {
  rifle:   { name: '🔫 步枪',   kind: 'tracer', rate: 2.6,  dmg: 1,   speed: 44, color: 0xffe27a, pellets: 1, spread: 0,    aoe: 0,   size: 1 },
  shotgun: { name: '💥 霰弹枪', kind: 'tracer', rate: 1.6,  dmg: 1,   speed: 40, color: 0xffa94a, pellets: 3, spread: 0.42, aoe: 0,   size: 1.25, knock: 0.35 },
  minigun: { name: '🌀 加特林', kind: 'tracer', rate: 5.2,  dmg: 0.6, speed: 52, color: 0x9fffd0, pellets: 1, spread: 0.12, aoe: 0,   size: 0.75, windup: 0.3 },
  rocket:  { name: '🚀 火箭筒', kind: 'rocket', rate: 0.8,  dmg: 5,   speed: 28, color: 0xff6a3a, pellets: 1, spread: 0,    aoe: 2.2, size: 1 },
  tesla:   { name: '⚡ 电击器', kind: 'zap',    rate: 0.75, dmg: 3.2, speed: 0,  color: 0x7ae4ff, pellets: 1, spread: 0,    aoe: 0,   size: 1 },
  flamer:  { name: '🔥 喷火器', kind: 'flame',  rate: 5.5,  dmg: 0.4, speed: 21, color: 0xff9a3a, pellets: 2, spread: 0.4, aoe: 0.8, size: 1, range: 22, burn: 1.5 },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);

// ============================================================ 道具表
export const ITEMS = {
  medkit: { icon: '➕', name: '增援',  color: 0x3ddc84 },
  rage:   { icon: '🔥', name: '狂暴',  color: 0xff7a3a },
  shield: { icon: '🛡️', name: '护盾', color: 0x58baff },
  laser:  { icon: '🔆', name: '全屏激光', color: 0xff4a6a },
  freeze: { icon: '❄️', name: '冰冻', color: 0x9adfff },
  nuke:   { icon: '☢️', name: '核弹', color: 0xffd24a },
};

// ============================================================ 僵尸类型（致敬 CSOL 生化模式）
export const ZOMBIE_TYPES = {
  // 普通僵尸：均衡，技能"暴走"——靠近时短暂提速
  normal: {
    label: '普通僵尸',
    palette: { legs: 0x3d4a2c, torso: 0x5c8a3c, head: 0x8fc46a, arms: 0x74a84e },
    hp: (d) => 1 + Math.floor(d * 1.3),
    speedMul: 1, scaleBase: 0.9, contactLoss: 1, maxRender: MAX_ZOMBIE_RENDER,
    unlockAt: 0,
  },
  // 恶魔猎手：技能"突进"——周期性猛冲
  hunter: {
    label: '恶魔猎手',
    parts: hunterParts,
    hp: (d) => 2 + Math.floor(d * 1.1),
    speedMul: 1.15, scaleBase: 0.95, contactLoss: 1, maxRender: 150,
    unlockAt: 150,
  },
  // 憎恶屠夫：血牛肉盾，撞上一次啃掉 3 人
  butcher: {
    label: '憎恶屠夫',
    parts: butcherParts,
    hp: (d) => 8 + Math.floor(d * 4.5),
    speedMul: 0.62, scaleBase: 1.5, contactLoss: 3, maxRender: 80,
    unlockAt: 250,
  },
  // 暗影芭比：技能"潜行"——周期性相位隐身，隐身时子弹穿过打不中
  shadow: {
    label: '暗影芭比',
    parts: shadowParts,
    hp: (d) => 1 + Math.floor(d * 0.9),
    speedMul: 1.3, scaleBase: 0.85, contactLoss: 1, maxRender: 120,
    unlockAt: 350,
  },
  // 巫蛊术尸：技能"咒疗"——周期性治疗周围僵尸
  witch: {
    label: '巫蛊术尸',
    parts: witchParts,
    hp: (d) => 2 + Math.floor(d * 1.2),
    speedMul: 0.85, scaleBase: 0.95, contactLoss: 1, maxRender: 60,
    unlockAt: 500,
  },
  // 嗜血女妖：技能"诱捕"——放出蝙蝠把小队拽向自己
  banshee: {
    label: '嗜血女妖',
    parts: bansheeParts,
    hp: (d) => 3 + Math.floor(d * 1.4),
    speedMul: 0.95, scaleBase: 1.0, contactLoss: 1, maxRender: 60,
    unlockAt: 650,
  },
  // 被感染的士兵：保持距离用步枪射击人类，射速低
  infected: {
    label: '被感染的士兵',
    parts: infectedSoldierParts,
    hp: (d) => 2 + Math.floor(d * 1.0),
    speedMul: 0.9, scaleBase: 0.95, contactLoss: 1, maxRender: 80,
    unlockAt: 450,
  },
};
export const ZOMBIE_TYPE_KEYS = Object.keys(ZOMBIE_TYPES);

function rngPick(arr) { return arr[(Math.random() * arr.length) | 0]; }
export { rngPick };
