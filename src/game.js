// ============================================================ 游戏流程与每帧逻辑编排
import * as THREE from 'three';
import {
  scene, state, squad, sfx, ui, gates, pickups, zombies, bullets, bosses, skulls, bloodPools,
  unitSpiral, formationScale, squadRadius,
} from './core/context.js';
import {
  WEAPONS, ITEMS, SQUAD_X_LIMIT, MAX_SOLDIER_RENDER, MAX_SHOOTERS, GATE_SPACING, PICKUP_SPACING,
  WAVE_SPACING, GATE_W, GATE_H, FIRST_BOSS_AT, BOSS_INTERVAL, diffAt,
} from './config.js';
import { resetChunks } from './world/environment.js';
import {
  makeGatePair, removeGatePair, gateInteractive, hitInteractiveGate, applyGate, gateLabel,
} from './gates.js';
import { createPickup, applyPickup, pickupGroup, laserMesh } from './pickups.js';
import { spawnBullet, fireZap, resetEnemyBullets } from './bullets.js';
import { spawnBurst, gore, resetEffects } from './effects.js';
import { spawnWave, updateZombies, resolveBulletZombieCollisions, cleanupDeadZombies } from './zombies.js';
import { spawnBoss, updateBosses, resetBosses } from './boss.js';
import { showBanner, floatText } from './ui/hud.js';
import { keys } from './input.js';
import { loadSkin, swapSkin } from './character.js';
import { soldierCrowd } from './core/context.js';
import { soldierParts, penguinParts } from './crowd.js';
import { getEffects, getLoadout, settleRun } from './progression.js';
import { initShop, refreshMenu } from './ui/shop.js';

// 初始化兵工厂 UI（升级 / 武器解锁），DOM 已就绪
initShop();

// ============================================================ 角色选择
let gugugagaParts = null;   // 咕咕嘎嘎零件（AI模型加载后填充，失败则方块版兜底）
let gugugagaLoading = false; // 防止重复触发加载
let appliedSkin = 'soldier'; // 当前已应用到士兵群渲染器的皮肤
let penguinChirpTimer = 0;   // 局内企鹅小队偶发鸣叫倒计时
let lastHurtVoice = 0;       // 受击企鹅叫的节流时间戳

const charCards = ui.charSelect.querySelectorAll('.charCard');
for (const card of charCards) {
  card.addEventListener('click', () => {
    for (const c of charCards) c.classList.remove('selected');
    card.classList.add('selected');
    const skin = card.dataset.skin;
    state.characterSkin = skin;
    ui.penguinFacingWrap.style.display = (skin === 'gugugaga') ? '' : 'none';
    sfx.ensure();
    if (skin === 'gugugaga') {
      sfx.voice('gugu_happy');   // 每次点都来一声 AI 人声，连点更欢
      if (gugugagaParts) {
        ui.charLoadStatus.textContent = '✅ 咕咕嘎嘎已就绪！(AI 模型)';
        return;
      }
      if (gugugagaLoading) return;
      gugugagaLoading = true;
      ui.charLoadStatus.textContent = '⏳ 正在加载咕咕嘎嘎模型...';
      ui.startBtn.disabled = true;
      loadSkin('gugugaga', import.meta.env.BASE_URL + 'gugugaga.glb')
        .then((parts) => {
          gugugagaParts = parts;
          ui.charLoadStatus.textContent = '✅ 咕咕嘎嘎已就绪！(AI 模型)';
          ui.startBtn.disabled = false;
          sfx.voice('gugu_ready');
        })
        .catch(() => {
          // 模型加载失败 → 方块版兜底，不阻塞开局
          gugugagaParts = penguinParts();
          ui.charLoadStatus.textContent = '⚠️ 模型加载失败，已用方块版兜底';
          ui.startBtn.disabled = false;
          sfx.voice('gugu_ready');
        })
        .finally(() => { gugugagaLoading = false; });
    } else if (skin === 'soldier') {
      ui.charLoadStatus.textContent = '';
      ui.startBtn.disabled = false;
      sfx.gateTick();  // 切回默认给个轻反馈
    }
  });
  // 悬停企鹅卡片时轻轻一声"咕"，增加交互感
  if (card.dataset.skin === 'gugugaga') {
    card.addEventListener('mouseenter', () => {
      sfx.ensure();
      sfx.voice('gugu_cute');
    });
  }
}

// 企鹅朝向切换（面向镜头看脸 / 背向奔跑）
for (const btn of ui.penguinFacingWrap.querySelectorAll('.segBtn')) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.penguinFacing = btn.dataset.facing;
    if (typeof localStorage !== 'undefined') localStorage.setItem('dg_penguinFacing', state.penguinFacing);
    for (const b of ui.penguinFacingWrap.querySelectorAll('.segBtn')) b.classList.toggle('selected', b === btn);
    // 实时生效：当前正用企鹅皮肤则立即翻转（游戏中或已就绪）
    if (state.characterSkin === 'gugugaga') {
      soldierCrowd.facing = state.penguinFacing === 'forward' ? Math.PI : 0;
    }
  });
}
// 初始化：按已保存偏好高亮朝向按钮
for (const b of ui.penguinFacingWrap.querySelectorAll('.segBtn')) {
  b.classList.toggle('selected', b.dataset.facing === state.penguinFacing);
}

// ============================================================ 敌人生成
// 每帧推进生成游标：门 / 道具 / 僵尸波 / Boss
export function updateSpawners(dt) {
  const diff = diffAt(state.dist);

  while (state.nextGateZ > squad.z - 130) {
    makeGatePair(state.nextGateZ);
    state.nextGateZ -= GATE_SPACING + Math.random() * 20;
  }

  while (state.nextPickupZ > squad.z - 130) {
    const roll = Math.random();
    const type = roll < 0.28 ? 'medkit'
      : roll < 0.46 ? 'rage'
      : roll < 0.62 ? 'shield'
      : roll < 0.76 ? 'freeze'
      : roll < 0.9 ? 'laser'
      : 'nuke';
    createPickup((Math.random() - 0.5) * 6, state.nextPickupZ, type);
    state.nextPickupZ -= PICKUP_SPACING + Math.random() * 60;
  }

  // 波次密度和规模随距离增长，直到铺满屏幕的量级
  while (state.nextWaveZ > squad.z - 110) {
    spawnWave(state.nextWaveZ, Math.round(3 + diff * 3 + Math.random() * 4));
    state.nextWaveZ -= Math.max(7, WAVE_SPACING - diff * 1.6);
  }

  // 后期持续从前方渗入散兵
  state.trickleTimer -= dt;
  if (state.trickleTimer <= 0) {
    state.trickleTimer = Math.max(0.3, 2.2 - diff * 0.15);
    spawnWave(squad.z - 55, 1 + Math.floor(diff * 1.2));
  }

  // 周期性 Boss
  if (state.dist >= state.nextBossAt) {
    state.lastBossAt = state.nextBossAt;
    state.nextBossAt += BOSS_INTERVAL;
    spawnBoss();
  }
}

// 清理身后的实体
export function cleanupBehind() {
  const behind = squad.z + 14;
  for (let i = gates.length - 1; i >= 0; i--) {
    if (gates[i].z > behind) {
      removeGatePair(gates[i]);
      gates.splice(i, 1);
    }
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    if (pickups[i].z > behind) {
      pickupGroup.remove(pickups[i].group);
      pickups.splice(i, 1);
    }
  }
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].z > behind) zombies.splice(i, 1);
  }
}

// ============================================================ 游戏流程
export function startRun() {
  // ---- 皮肤切换：根据开局选择替换士兵群渲染器（仅在皮肤变化时执行）----
  if (state.characterSkin === 'gugugaga') {
    soldierCrowd.facing = state.penguinFacing === 'forward' ? Math.PI : 0; // 企鹅朝向
    if (!gugugagaParts) gugugagaParts = penguinParts(); // 模型未就绪时方块版兜底
    if (appliedSkin !== 'gugugaga') {
      swapSkin(soldierCrowd, scene, gugugagaParts, MAX_SOLDIER_RENDER);
      appliedSkin = 'gugugaga';
    }
  } else {
    soldierCrowd.facing = 0; // 士兵始终正向
    if (appliedSkin !== 'soldier') {
      swapSkin(soldierCrowd, scene, soldierParts(), MAX_SOLDIER_RENDER);
      appliedSkin = 'soldier';
    }
  }

  // 清理旧战场
  for (const pair of gates) removeGatePair(pair);
  gates.length = 0;
  pickupGroup.clear();
  pickups.length = 0;
  zombies.length = 0;
  bullets.length = 0;
  resetBosses();
  skulls.length = 0;
  resetEffects();
  resetEnemyBullets();
  for (const pool of bloodPools) pool.mesh.visible = false;
  resetChunks();

  // ---- 应用局外成长效果（初始兵力 / 火力 / 移速 / 增援量 / 初始武器）----
  const eff = getEffects();
  squad.speed = 8.5 * eff.speed;
  state.powerMult = eff.power;
  state.medkitMult = eff.medkit;

  squad.x = 0; squad.targetX = 0; squad.z = 0;
  state.dist = 0;
  state.count = 10 + Math.round(eff.force);
  state.maxCount = state.count;
  state.kills = 0;
  state.weapon = getLoadout();
  state.fireAcc = 0;
  state.rageTime = 0;
  state.shieldTime = 0;
  state.freezeTime = 0;
  state.laserZ = null;
  laserMesh.visible = false;
  state.nextGateZ = -40;
  state.nextPickupZ = -70;
  state.nextWaveZ = -30;
  state.nextBossAt = FIRST_BOSS_AT;
  state.lastBossAt = 0;
  state.trickleTimer = 2;
  state.pullTime = 0;
  state.graceTime = 0;
  state.spinTime = 0;
  state.powerBuffTime = 0;
  state.bonusCoins = 0;
  state.killStreak = 0;
  state._prevKills = 0;
  state._lastKillAt = -99999;
  state._lastStreakBanner = 0;
  ui.pauseOverlay.classList.remove('visible');
  penguinChirpTimer = 5 + Math.random() * 5; // 开局几秒后第一声
  ui.weaponTag.textContent = WEAPONS[state.weapon].name;
  ui.bossbar.classList.remove('visible');

  state.phase = 'run';
  ui.menu.classList.remove('visible');
  ui.result.classList.remove('visible');
  ui.hud.classList.add('visible');
  sfx.ensure();
  sfx.startBgm();
  // 选了企鹅，开局来一声"咕咕嘎嘎 出发！"
  if (state.characterSkin === 'gugugaga') sfx.voice('gugu_happy');
}

export function onDefeat() {
  state.phase = 'result';
  ui.hud.classList.remove('visible');
  ui.pauseOverlay.classList.remove('visible');
  ui.result.classList.add('visible');
  const dist = Math.floor(state.dist);
  // 结算：把战果换成末日币并写入存档（最佳距离 / 统计 / 金币门奖励一并更新）
  const { earned, total, isRecord } = settleRun(dist, state.kills, state.bonusCoins);
  if (isRecord) state.best = dist;
  ui.resultTitle.textContent = '💀 全 军 覆 没';
  ui.resultTitle.className = 'lose';
  const coinLine = state.bonusCoins > 0
    ? `💰 本局 <b style="color:#ffd24a">+${earned}</b> 末日币（含金币门 ${state.bonusCoins} · 库存 ${total}）`
    : `💰 本局 <b style="color:#ffd24a">+${earned}</b> 末日币（库存 ${total}）`;
  ui.resultStats.innerHTML =
    `冲锋 ${dist}m ${isRecord ? '🏆 新纪录！' : `（最佳 ${state.best}m）`}<br/>` +
    `击杀 ${state.kills} &nbsp;|&nbsp; 巅峰兵力 ${state.maxCount} 人<br/>` +
    coinLine;
  ui.resultBtn.textContent = '再次出击 ↻';
  refreshMenu();
  sfx.stopBgm();
  if (state.characterSkin === 'gugugaga') sfx.voice('gugu_lose'); else sfx.lose();
}

ui.startBtn.addEventListener('click', startRun);
ui.resultBtn.addEventListener('click', startRun);
ui.muteBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
});

// ============================================================ 暂停 / 继续 / 返回主菜单
export function pauseGame() {
  if (state.phase !== 'run') return;
  state.phase = 'paused';
  ui.pauseOverlay.classList.add('visible');
}
export function resumeGame() {
  if (state.phase !== 'paused') return;
  state.phase = 'run';
  ui.pauseOverlay.classList.remove('visible');
}
export function toMenu() {
  state.phase = 'menu';
  ui.hud.classList.remove('visible');
  ui.pauseOverlay.classList.remove('visible');
  ui.result.classList.remove('visible');
  ui.menu.classList.add('visible');
  refreshMenu();
  sfx.stopBgm();
}

ui.pauseBtn.addEventListener('click', pauseGame);
ui.pauseResume.addEventListener('click', resumeGame);
ui.pauseRestart.addEventListener('click', startRun);
ui.pauseMute.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  ui.pauseMute.textContent = sfx.muted ? '🔇 取消静音' : '🔊 静音切换';
  ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
});
ui.pauseMenu.addEventListener('click', toMenu);
// ESC 键在 运行中/暂停 间切换
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (state.phase === 'run') pauseGame();
    else if (state.phase === 'paused') resumeGame();
  }
});

// ============================================================ 连杀提示
const STREAK_WINDOW = 2500; // ms：窗口内连续击杀累计
function streakTier(n) {
  if (n >= 20) return { t: '☠️ GODLIKE!', c: '#ff4d6d' };
  if (n >= 15) return { t: '🔥 UNSTOPPABLE!', c: '#ff5a4d' };
  if (n >= 10) return { t: '⚡ RAMPAGE!', c: '#ff7a3d' };
  if (n >= 7)  return { t: '💥 ULTRA KILL!', c: '#ff8a3d' };
  if (n >= 5)  return { t: '🌟 MEGA KILL!', c: '#ffa23d' };
  if (n >= 4)  return { t: '✨ MULTI KILL!', c: '#ffb24a' };
  if (n >= 2)  return { t: '🔥 DOUBLE KILL!', c: '#ffc24a' };
  return null;
}
function checkKillStreak() {
  const now = performance.now();
  if (state.kills > state._prevKills) {
    const dk = state.kills - state._prevKills;
    if (now - state._lastKillAt < STREAK_WINDOW) state.killStreak += dk;
    else state.killStreak = dk;
    state._lastKillAt = now;
    if (state.killStreak >= 2 && now - state._lastStreakBanner > 600) {
      const tier = streakTier(state.killStreak);
      if (tier) { showBanner(tier.t, tier.c); state._lastStreakBanner = now; }
    }
  }
  state._prevKills = state.kills;
}

export function loseSoldiers(n) {
  if (state.count <= 0 || state.shieldTime > 0) return;
  state.count = Math.max(0, state.count - n);
  state.shake = Math.min(0.5, state.shake + 0.18);
  // 选了企鹅且距上次受击叫 >0.9s 时，来一声紧张的"咕嘎！"（避免连续掉兵太吵）
  if (state.characterSkin === 'gugugaga') {
    const now = performance.now();
    if (now - lastHurtVoice > 900) { sfx.voice('gugu_hit'); lastHurtVoice = now; }
  } else {
    sfx.squadHurt();
  }
  if (state.count <= 0) {
    spawnBurst(squad.x, 1, squad.z, 0xff4040, 30, 7, 0.8);
    // 进入濒死保护，而非立即判负（期间吃到增援可复活）
    if (state.graceTime <= 0) state.graceTime = 0.3;
  }
}

// ============================================================ 每帧逻辑
export function updateRun(dt, time) {
  // ---- 移动（永远向前跑）
  if (keys.ArrowLeft || keys.KeyA) squad.targetX -= 9 * dt;
  if (keys.ArrowRight || keys.KeyD) squad.targetX += 9 * dt;
  squad.targetX = Math.min(SQUAD_X_LIMIT, Math.max(-SQUAD_X_LIMIT, squad.targetX));
  squad.x += (squad.targetX - squad.x) * Math.min(1, dt * 12);
  squad.z -= squad.speed * dt;
  state.dist = -squad.z;

  state.rageTime = Math.max(0, state.rageTime - dt);
  state.shieldTime = Math.max(0, state.shieldTime - dt);
  state.freezeTime = Math.max(0, state.freezeTime - dt);

  // ---- 企鹅小队偶发鸣叫（选了咕咕嘎嘎才触发，极低频，不扰民）
  if (state.characterSkin === 'gugugaga' && !sfx.muted) {
    penguinChirpTimer -= dt;
    if (penguinChirpTimer <= 0) {
      sfx.voice('gugu_cute');
      penguinChirpTimer = 7 + Math.random() * 8; // 7~15 秒一声
    }
  }

  // ---- 全屏激光推进
  if (state.laserZ !== null) {
    state.laserZ -= 55 * dt;
    laserMesh.position.set(0, 1.3, state.laserZ);
    laserMesh.material.opacity = 0.55 + Math.sin(performance.now() * 0.05) * 0.25;
    for (let i = zombies.length - 1; i >= 0; i--) {
      const zb = zombies[i];
      if (zb.z > state.laserZ - 0.5) {
        gore(zb.x, zb.z);
        spawnBurst(zb.x, 1.0, zb.z, 0xff4a6a, 8, 4, 0.35);
        state.kills++;
        zombies.splice(i, 1);
      }
    }
    for (const boss of bosses) {
      if (boss.z > state.laserZ - 0.5 && boss._laserMark !== state.laserZ0) {
        boss._laserMark = state.laserZ0;
        boss.hp -= boss.maxHp * 0.3;
        spawnBurst(boss.x, 2.5, boss.z, 0xff4a6a, 24, 6, 0.5);
      }
    }
    if (state.laserZ < squad.z - 75) {
      state.laserZ = null;
      laserMesh.visible = false;
    }
  }

  updateSpawners(dt);
  cleanupBehind();

  // ---- 全员齐射
  const weapon = WEAPONS[state.weapon];
  const renderN = Math.max(1, Math.min(state.count, MAX_SOLDIER_RENDER));
  const scale = formationScale(renderN);
  const shooters = Math.min(state.count, MAX_SHOOTERS);
  const rageMult = state.rageTime > 0 ? 2 : 1;
  if (state.powerBuffTime > 0) state.powerBuffTime = Math.max(0, state.powerBuffTime - dt);
  const buffMult = state.powerBuffTime > 0 ? 2 : 1; // 强化门：限时火力翻倍
  const weaponPower = (1 + state.dist / 600) * (state.powerMult || 1) * buffMult; // 距离成长 × 局外升级 × 强化门
  const dmgScale = (state.count / shooters) * weaponPower;
  // 加特林预热：持续射击时射速从 30% 渐升到 100%（wind-up 手感）
  if (state.weapon === 'minigun') {
    state.spinTime = Math.min(weapon.windup, state.spinTime + dt);
  } else {
    state.spinTime = Math.max(0, state.spinTime - dt * 2);
  }
  const spinNorm = Math.min(1, state.spinTime / (weapon.windup || 1));
  const spinMult = state.weapon === 'minigun' ? (0.3 + 0.7 * spinNorm) : 1;
  state.fireAcc += shooters * weapon.rate * rageMult * spinMult * dt;
  let shots = Math.min(Math.floor(state.fireAcc), 40);
  state.fireAcc -= shots;
  while (shots-- > 0) {
    const idx = state.fireIndex++ % renderN;
    const sx = squad.x + unitSpiral[idx].dx * scale;
    const sz = squad.z + unitSpiral[idx].dz * scale;
    if (weapon.kind === 'zap') {
      fireZap(sx, sz - 0.5, weapon.dmg * dmgScale);
    } else {
      for (let p = 0; p < weapon.pellets; p++) {
        spawnBullet(sx + 0.16, 0.72, sz - 0.5, weapon, dmgScale);
      }
    }
    sfx.shot(state.weapon);
  }

  // ---- 门逻辑
  for (const pair of gates) {
    if (pair.consumed) continue;
    for (const gate of [pair.a, pair.b]) {
      if (!gateInteractive(gate)) continue;
      for (const b of bullets) {
        if (b.dead) continue;
        if (b.z <= gate.z + 0.4 && b.z >= gate.z - 1.2 && Math.abs(b.x - gate.x) < GATE_W / 2) {
          b.dead = true;
          spawnBurst(b.x, b.y + 0.6, gate.z, 0xffe27a, 6, 3, 0.3);
          hitInteractiveGate(gate);
        }
      }
    }
    // 穿门（武器门不需要穿，穿过无事发生）
    if (squad.z <= pair.z && squad.z > pair.z - 2) {
      const gate = Math.abs(squad.x - pair.a.x) < Math.abs(squad.x - pair.b.x) ? pair.a : pair.b;
      pair.consumed = true;
      if (gate.op !== 'weapon') {
        const before = state.count;
        let good = true;
        let txt = gateLabel(gate);
        if (gate.op === 'teleport') {
          squad.targetX = gate.value; good = true; txt = '⇄ 传送';
        } else if (gate.op === 'buff') {
          state.powerBuffTime = 8; good = true; txt = '⚡ 火力强化';
        } else if (gate.op === 'mine') {
          loseSoldiers(gate.value); good = false; txt = '💥 地雷';
        } else if (gate.op === 'coin') {
          state.bonusCoins += gate.value; good = true; txt = `💰 +${gate.value}`;
        } else {
          state.count = applyGate(gate, state.count);
          good = state.count >= before;
          txt = gateLabel(gate);
        }
        state.maxCount = Math.max(state.maxCount, state.count);
        floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), txt, good);
        spawnBurst(gate.x, 1.6, gate.z, good ? 0x59b8ff : 0xff6060, 20, 6, 0.5);
        good ? sfx.gateGood() : sfx.gateBad();
      }
      pair.a.group.visible = false;
      pair.b.group.visible = false;
      // 兵力归零不直接判负：进入濒死保护窗口，期间吃到增援可复活
      if (state.count <= 0 && state.graceTime <= 0) {
        state.graceTime = 0.3;
        showBanner('⚠️ 濒死！快吃增援！');
      }
    }
  }

  // ---- 道具箱拾取
  const pickR = squadRadius() + 0.9;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.crate.rotation.y = time * 2;
    pk.group.position.y = Math.sin(time * 3 + pk.x) * 0.12;
    if (Math.abs(pk.z - squad.z) < 1.2 && Math.abs(pk.x - squad.x) < pickR) {
      applyPickup(pk.type);
      spawnBurst(pk.x, 1.2, pk.z, ITEMS[pk.type].color, 18, 5, 0.5);
      pickupGroup.remove(pk.group);
      pickups.splice(i, 1);
    }
  }

  // ---- 僵尸移动 / 技能 / 接触伤害
  const diff = diffAt(state.dist);
  const frozen = state.freezeTime > 0;
  if (updateZombies(dt, time, diff, frozen)) return;

  // ---- 子弹-僵尸碰撞
  resolveBulletZombieCollisions();

  // 女妖诱捕的拖拽效果
  if (state.pullTime > 0) {
    state.pullTime -= dt;
    squad.targetX = Math.min(SQUAD_X_LIMIT, Math.max(-SQUAD_X_LIMIT,
      squad.targetX + (state.pullX - squad.targetX) * Math.min(1, dt * 5)));
  }

  // AoE 溅射死亡统一清理
  cleanupDeadZombies();
  checkKillStreak();

  // ---- Boss（边跑边打）
  if (updateBosses(dt, time, diff, frozen)) return;
  checkKillStreak();

  // 濒死保护窗口：兵力归零后不立即判负，吃到增援可复活；窗口耗尽才真正失败
  if (state.graceTime > 0) {
    state.graceTime -= dt;
    if (state.count > 0) {
      state.graceTime = 0; // 已恢复，解除濒死
    } else if (state.graceTime <= 0) {
      onDefeat();
      return;
    }
  }
}
