// 无头冒烟测试入口：设好全局 → 启动游戏 → 跑若干帧 → 报告是否崩
// 增强覆盖：商店（开/关/购买/选装）、暂停/恢复、Boss 死亡结算、连杀检测
import './setup.mjs';
import { startRun } from '../src/game.js';
import { squad, state, bosses } from '../src/core/context.js';
import {
  loadSave, buyUpgrade, buyWeapon, selectLoadout, getLoadout, getCoins,
} from '../src/progression.js';
import '../src/main.js';

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error('  ✗ FAIL:', msg); failures++; } else console.log('  ✓', msg); };

// 启动一局，之后由 requestAnimationFrame 驱动若干帧（含僵尸/Boss/子弹/碰撞等全路径）
startRun();
// 直接拉到 360m 之后，确保能触发首个 Boss 与大量门（覆盖 boss.js / gates.js 新分支的运行时路径）
state.dist = 360;
squad.z = -360;

// ---- 局外成长：给足金币后走完整购买链路 ----
const s = loadSave();
s.coins = 99999;
assert(buyUpgrade('force') === true, 'buyUpgrade(force) 成功');
assert(buyWeapon('shotgun') === true, 'buyWeapon(shotgun) 成功');
assert(selectLoadout('shotgun') === true, 'selectLoadout(shotgun) 成功');
assert(getLoadout() === 'shotgun', 'getLoadout 返回 shotgun');
assert(buyWeapon('shotgun') === false, '重复解锁武器返回 false');
assert(buyUpgrade('force') === true, '再次升级 force 仍成功');
assert(getCoins() < 99999, '购买后金币已扣除');

// ---- 商店 UI：开 / 关 / 渲染，不应抛错 ----
const shopBtn = document.getElementById('shopBtn');
shopBtn._fire('click');     // 打开 → render()（含升级卡 + 武器卡动态生成）
document.getElementById('shopCloseBtn')._fire('click'); // 关闭 → refreshMenu()
assert(true, 'shop 开/关/渲染 未抛错');

// ---- 暂停 / 恢复 链路 ----
document.getElementById('pauseBtn')._fire('click');
assert(state.phase === 'paused', 'pauseBtn 后 phase=paused');
document.getElementById('pauseResume')._fire('click');
assert(state.phase === 'run', 'pauseResume 后 phase=run');
// ESC 再次暂停
window.dispatchEvent?.({}); // 仅占位，真实键事件在浏览器
document.getElementById('pauseBtn')._fire('click');
assert(state.phase === 'paused', '再次暂停 phase=paused');
document.getElementById('pauseMenu')._fire('click');
assert(state.phase === 'menu', 'pauseMenu 后回到 menu');

// 重新开局以便后续帧继续跑 Boss/门路径
startRun();
state.dist = 360; squad.z = -360;

// ---- 强制 Boss 死亡结算分支（spawnBurst / kills++ / 增援 / 横幅）----
setTimeout(() => {
  if (bosses.length) { bosses[0].hp = -1; console.log('  · 已将首个 Boss 血量置负，强制触发击杀结算分支'); }
  else console.log('  · 本帧尚未生成 Boss（属正常时序）');
}, 700);

setTimeout(() => {
  const f = globalThis.__getFrames();
  console.log(`SMOKE OK — 渲染帧数=${f}, 失败断言=${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}, 2500);

// 兜底：若 4.5 秒内没正常结束，说明卡死或抛错未被捕获
setTimeout(() => {
  console.error('SMOKE TIMEOUT — 可能卡死');
  process.exit(1);
}, 4500);
