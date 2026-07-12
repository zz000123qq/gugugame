// ============================================================ 兵工厂 UI（升级 + 武器解锁）
// 从 progression.js 的数据表动态渲染商店，处理购买 / 选装交互，并同步菜单里的金币数。
import { WEAPONS } from '../config.js';
import {
  UPGRADES, UPGRADE_KEYS, WEAPON_SHOP,
  getCoins, getUpgradeLevel, nextUpgradeCost, buyUpgrade,
  getLoadout, isWeaponUnlocked, buyWeapon, selectLoadout,
} from '../progression.js';
import { sfx } from '../core/context.js';

const el = (id) => document.getElementById(id);
const dom = {};
let inited = false;

export function initShop() {
  if (inited) return;
  inited = true;
  dom.shop = el('shopOverlay');
  dom.shopBtn = el('shopBtn');
  dom.closeBtn = el('shopCloseBtn');
  dom.upgradeGrid = el('upgradeGrid');
  dom.weaponGrid = el('weaponGrid');
  dom.shopCoinNum = el('shopCoinNum');
  dom.menuCoinNum = el('menuCoinNum');
  dom.menu = el('menuOverlay');

  dom.shopBtn.addEventListener('click', () => {
    sfx.ensure();
    dom.menu.classList.remove('visible');
    dom.shop.classList.add('visible');
    render();
  });
  dom.closeBtn.addEventListener('click', () => {
    dom.shop.classList.remove('visible');
    dom.menu.classList.add('visible');
    refreshMenu();
  });

  refreshMenu();
}

// 菜单/结算后刷新金币显示
export function refreshMenu() {
  if (dom.menuCoinNum) dom.menuCoinNum.textContent = getCoins();
}

function render() {
  if (!inited) return;
  dom.shopCoinNum.textContent = getCoins();
  renderUpgrades();
  renderWeapons();
  refreshMenu();
}

function renderUpgrades() {
  const coins = getCoins();
  dom.upgradeGrid.innerHTML = '';
  for (const id of UPGRADE_KEYS) {
    const def = UPGRADES[id];
    const lv = getUpgradeLevel(id);
    const cost = nextUpgradeCost(id);
    const maxed = cost === null;
    let pips = '';
    for (let i = 0; i < def.max; i++) pips += `<span class="pip ${i < lv ? 'on' : ''}"></span>`;
    const btn = maxed
      ? '<button class="buyBtn max" disabled>已满级</button>'
      : `<button class="buyBtn" data-up="${id}" ${coins < cost ? 'disabled' : ''}>💰 ${cost}</button>`;
    const card = document.createElement('div');
    card.className = 'upgCard';
    card.innerHTML =
      `<div class="ic">${def.icon}</div>` +
      `<div class="nm">${def.name}</div>` +
      `<div class="lv">Lv.${lv}/${def.max}</div>` +
      `<div class="ds">${def.desc(lv)}</div>` +
      `<div class="pips">${pips}</div>` + btn;
    dom.upgradeGrid.appendChild(card);
  }
  dom.upgradeGrid.querySelectorAll('button[data-up]').forEach((b) => {
    b.addEventListener('click', () => {
      if (buyUpgrade(b.dataset.up)) { sfx.gateGood(); render(); }
      else sfx.gateBad();
    });
  });
}

function renderWeapons() {
  const coins = getCoins();
  const loadout = getLoadout();
  const ids = Object.keys(WEAPON_SHOP).sort((a, b) => WEAPON_SHOP[a].order - WEAPON_SHOP[b].order);
  dom.weaponGrid.innerHTML = '';
  for (const id of ids) {
    const wp = WEAPONS[id];
    const info = WEAPON_SHOP[id];
    const unlocked = isWeaponUnlocked(id);
    const selected = loadout === id;
    const parts = wp.name.split(' ');
    const emoji = parts[0];
    const label = parts.slice(1).join(' ') || wp.name;
    let btn;
    if (!unlocked) btn = `<button class="buyBtn" data-wbuy="${id}" ${coins < info.cost ? 'disabled' : ''}>🔒 💰 ${info.cost}</button>`;
    else if (selected) btn = '<button class="buyBtn owned" disabled>已装备</button>';
    else btn = `<button class="buyBtn" data-wsel="${id}">选为初始</button>`;
    const card = document.createElement('div');
    card.className = 'upgCard wpnCard' + (selected ? ' selected' : '');
    card.innerHTML =
      `<div class="ic">${emoji}</div>` +
      `<div class="nm">${label}</div>` +
      `<div class="ds">${unlocked ? '已解锁' : '未解锁'}</div>` + btn;
    dom.weaponGrid.appendChild(card);
  }
  dom.weaponGrid.querySelectorAll('button[data-wbuy]').forEach((b) => {
    b.addEventListener('click', () => {
      if (buyWeapon(b.dataset.wbuy)) { selectLoadout(b.dataset.wbuy); sfx.gateGood(); render(); }
      else sfx.gateBad();
    });
  });
  dom.weaponGrid.querySelectorAll('button[data-wsel]').forEach((b) => {
    b.addEventListener('click', () => { selectLoadout(b.dataset.wsel); sfx.gateTick(); render(); });
  });
}
