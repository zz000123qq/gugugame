// ============================================================ 局外成长系统（Meta-Progression）
// 末日币（Doomsday Coins）+ 永久升级 + 武器解锁 + 存档。
// 纯数据 / 纯逻辑，不依赖 THREE。存档统一放在 localStorage 的 'dg_save'。
// 旧版仅有 'dg_best'，首次加载时自动迁移进新存档。

const SAVE_KEY = 'dg_save';
const LEGACY_BEST_KEY = 'dg_best';

// ---- 永久升级表 ----
// cost(lv)  : 从当前等级 lv 升到 lv+1 需要的末日币
// effect(lv): 当前等级 lv 对应的实际效果值
export const UPGRADES = {
  force:  { icon: '👥', name: '初始兵力', unit: '人',  max: 10, desc: (l) => `起始 ${10 + l * 2} 人`,          cost: (l) => 100 + l * 90,  effect: (l) => l * 2 },
  power:  { icon: '🔥', name: '火力强化', unit: '%',   max: 12, desc: (l) => `伤害 +${l * 8}%`,               cost: (l) => 150 + l * 130, effect: (l) => 1 + l * 0.08 },
  speed:  { icon: '⚡', name: '急行军',   unit: '%',   max: 6,  desc: (l) => `移速 +${l * 4}%`,               cost: (l) => 120 + l * 150, effect: (l) => 1 + l * 0.04 },
  medkit: { icon: '➕', name: '战地急救', unit: '%',   max: 6,  desc: (l) => `增援量 +${l * 15}%`,            cost: (l) => 130 + l * 120, effect: (l) => 1 + l * 0.15 },
  greed:  { icon: '💰', name: '生财有道', unit: '%',   max: 10, desc: (l) => `末日币 +${l * 10}%`,            cost: (l) => 200 + l * 170, effect: (l) => 1 + l * 0.1 },
};
export const UPGRADE_KEYS = Object.keys(UPGRADES);

// ---- 武器解锁表 ----
// rifle 默认解锁；其余用末日币购买后可在开局选为初始武器。
export const WEAPON_SHOP = {
  rifle:   { cost: 0,    order: 0 },
  shotgun: { cost: 300,  order: 1 },
  minigun: { cost: 800,  order: 2 },
  flamer:  { cost: 1600, order: 3 },
  tesla:   { cost: 2600, order: 4 },
  rocket:  { cost: 4200, order: 5 },
};

// ---- 存档默认结构 ----
function defaultSave() {
  return {
    coins: 0,
    best: 0,
    upgrades: { force: 0, power: 0, speed: 0, medkit: 0, greed: 0 },
    weapons: ['rifle'],   // 已解锁武器
    loadout: 'rifle',     // 当前选中的初始武器
    stats: { runs: 0, kills: 0, dist: 0 },
  };
}

let _save = null;

// 读取存档（带旧版迁移 + 字段兜底），仅解析一次后缓存
export function loadSave() {
  if (_save) return _save;
  let data = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch { data = null; }

  const def = defaultSave();
  if (!data || typeof data !== 'object') {
    data = def;
    // 迁移旧版最佳距离
    const legacy = parseInt(localStorage.getItem(LEGACY_BEST_KEY) || '0', 10);
    if (legacy > 0) data.best = legacy;
  } else {
    // 字段兜底，避免旧存档缺字段导致崩溃
    data.coins = data.coins || 0;
    data.best = data.best || parseInt(localStorage.getItem(LEGACY_BEST_KEY) || '0', 10) || 0;
    data.upgrades = Object.assign({}, def.upgrades, data.upgrades || {});
    data.weapons = Array.isArray(data.weapons) && data.weapons.length ? data.weapons : ['rifle'];
    if (!data.weapons.includes('rifle')) data.weapons.unshift('rifle');
    if (!data.weapons.includes(data.loadout)) data.loadout = 'rifle';
    data.stats = Object.assign({}, def.stats, data.stats || {});
  }
  _save = data;
  return _save;
}

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(loadSave())); } catch { /* 隐私模式忽略 */ }
}

// ---- 读取接口 ----
export const getCoins = () => loadSave().coins;
export const getBest = () => loadSave().best;
export const getUpgradeLevel = (id) => loadSave().upgrades[id] || 0;
export const getUnlockedWeapons = () => loadSave().weapons.slice();
/** @returns {string} */
export const getLoadout = () => loadSave().loadout;
export const isWeaponUnlocked = (id) => loadSave().weapons.includes(id);

// 汇总当前所有升级效果，开局调用一次即可
/** @returns {EffectsResult} */
export function getEffects() {
  const s = loadSave();
  return {
    force: UPGRADES.force.effect(s.upgrades.force),
    power: UPGRADES.power.effect(s.upgrades.power),
    speed: UPGRADES.speed.effect(s.upgrades.speed),
    medkit: UPGRADES.medkit.effect(s.upgrades.medkit),
    greed: UPGRADES.greed.effect(s.upgrades.greed),
  };
}

// ---- 写入接口 ----
// 购买/升级：成功返回 true
/**
 * @param {string} id
 * @returns {boolean}
 */
export function buyUpgrade(id) {
  const s = loadSave();
  const def = UPGRADES[id];
  if (!def) return false;
  const lv = s.upgrades[id] || 0;
  if (lv >= def.max) return false;
  const cost = def.cost(lv);
  if (s.coins < cost) return false;
  s.coins -= cost;
  s.upgrades[id] = lv + 1;
  persist();
  return true;
}

// 下一级花费；已满级返回 null
export function nextUpgradeCost(id) {
  const s = loadSave();
  const def = UPGRADES[id];
  const lv = s.upgrades[id] || 0;
  return lv >= def.max ? null : def.cost(lv);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function buyWeapon(id) {
  const s = loadSave();
  const info = WEAPON_SHOP[id];
  if (!info || s.weapons.includes(id)) return false;
  if (s.coins < info.cost) return false;
  s.coins -= info.cost;
  s.weapons.push(id);
  persist();
  return true;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function selectLoadout(id) {
  const s = loadSave();
  if (!s.weapons.includes(id)) return false;
  s.loadout = id;
  persist();
  return true;
}

// ---- 结算：把一局的战果换成末日币并写入统计 / 最佳 ----
// bonusCoins: 本局通过"金币门"等途径直接获得的末日币，额外计入
// 返回 { earned, total, isRecord }
/**
 * @param {number} dist
 * @param {number} kills
 * @param {number} [bonusCoins]
 * @returns {SettleResult}
 */
export function settleRun(dist, kills, bonusCoins = 0) {
  const s = loadSave();
  const eff = UPGRADES.greed.effect(s.upgrades.greed);
  const base = dist * 0.6 + kills * 0.8;
  const earned = Math.max(0, Math.round(base * eff)) + Math.round(bonusCoins * eff);
  s.coins += earned;
  s.stats.runs += 1;
  s.stats.kills += kills;
  s.stats.dist += dist;
  const isRecord = dist > s.best;
  if (isRecord) s.best = dist;
  persist();
  return { earned, total: s.coins, isRecord };
}
