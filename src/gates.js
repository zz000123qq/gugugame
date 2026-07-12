// ============================================================ 门（增益 / 削弱 / 武器 / 特殊）
import * as THREE from 'three';
import { scene, state, squad, sfx, ui, gates } from './core/context.js';
import { WEAPONS, WEAPON_KEYS, ROAD_W, GATE_W, GATE_H, SQUAD_X_LIMIT, diffAt, rngPick } from './config.js';
import { floatText } from './ui/hud.js';
import { spawnBurst } from './effects.js';

export const gateGroup = new THREE.Group();
scene.add(gateGroup);

// 门面背景渐变配色：按 op 区分
function gateColor(gate) {
  if (gate.op === 'weapon') return ['rgba(255,205,80,.94)', 'rgba(200,120,10,.94)'];
  if (gate.op === 'gamble') return ['rgba(190,120,255,.94)', 'rgba(110,40,190,.94)'];
  if (gate.op === 'buff') return ['rgba(120,255,170,.94)', 'rgba(20,170,90,.94)'];
  if (gate.op === 'mine') return ['rgba(255,90,90,.94)', 'rgba(170,20,40,.94)'];
  if (gate.op === 'teleport') return ['rgba(90,220,255,.94)', 'rgba(20,120,200,.94)'];
  if (gate.op === 'coin') return ['rgba(255,210,90,.95)', 'rgba(210,150,20,.95)'];
  if (gateIsGood(gate)) return ['rgba(70,160,255,.92)', 'rgba(20,80,190,.92)'];
  return ['rgba(255,90,90,.92)', 'rgba(170,20,40,.92)'];
}

export function gateLabel(gate) {
  if (gate.op === 'weapon') return WEAPONS[gate.value].name;
  if (gate.op === 'mul') return `×${gate.value}`;
  if (gate.op === 'div') return `÷${gate.value}`;
  if (gate.op === 'gamble') return '🎲 ?';
  if (gate.op === 'buff') return '⚡ 强化';
  if (gate.op === 'mine') return '💥 雷';
  if (gate.op === 'teleport') return '⇄ 传送';
  if (gate.op === 'coin') return `💰 +${gate.value}`;
  return gate.value >= 0 ? `+${gate.value}` : `−${Math.abs(gate.value)}`;
}
export function gateIsGood(gate) {
  if (gate.op === 'weapon' || gate.op === 'mul' || gate.op === 'gamble' || gate.op === 'buff' || gate.op === 'teleport' || gate.op === 'coin') return true;
  if (gate.op === 'div' || gate.op === 'mine') return false;
  return gate.value >= 0;
}

export function drawGateCanvas(gate) {
  const g = gate.ctx;
  g.clearRect(0, 0, 256, 192);
  const grad = g.createLinearGradient(0, 0, 0, 192);
  const [c0, c1] = gateColor(gate);
  if (gate.op === 'weapon' && gate.remaining <= 0) {
    grad.addColorStop(0, 'rgba(90,220,120,.95)'); grad.addColorStop(1, 'rgba(20,140,60,.95)');
  } else {
    grad.addColorStop(0, c0); grad.addColorStop(1, c1);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 184);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.5)';
  g.shadowBlur = 10;
  if (gate.op === 'weapon') {
    const w = WEAPONS[gate.value];
    if (gate.remaining <= 0) {
      g.font = '900 46px Arial, sans-serif';
      g.fillText(w.name, 128, 70);
      g.font = '900 36px Arial, sans-serif';
      g.fillText('已装备!', 128, 136);
    } else {
      g.font = '900 88px Arial, sans-serif';
      g.fillText(String(gate.remaining), 128, 74);
      g.font = '800 30px Arial, sans-serif';
      g.fillText(w.name, 128, 150);
    }
  } else {
    g.font = '900 84px Arial, sans-serif';
    g.fillText(gateLabel(gate), 128, 88);
    if (gate.upgradable && gate.value < 15) {
      g.shadowBlur = 0;
      g.font = '700 22px Arial, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText('射击可升级 ▲', 128, 166);
    }
  }
  gate.tex.needsUpdate = true;
  const [f0] = gateColor(gate);
  if (gate.op === 'weapon') {
    if (gate.remaining <= 0) { gate.frameMat.color.set(0xbfffc8); gate.frameMat.emissive.set(0x22bb44); }
    else { gate.frameMat.color.set(0xffe2a0); gate.frameMat.emissive.set(0xcc8800); }
  } else if (gate.op === 'gamble') { gate.frameMat.color.set(0xd8b0ff); gate.frameMat.emissive.set(0x8a3ad0); }
  else if (gate.op === 'buff') { gate.frameMat.color.set(0xbfffd0); gate.frameMat.emissive.set(0x22bb66); }
  else if (gate.op === 'mine') { gate.frameMat.color.set(0xffb0a0); gate.frameMat.emissive.set(0xd03030); }
  else if (gate.op === 'teleport') { gate.frameMat.color.set(0xa0e8ff); gate.frameMat.emissive.set(0x1e90d0); }
  else if (gate.op === 'coin') { gate.frameMat.color.set(0xffe6a0); gate.frameMat.emissive.set(0xcc8800); }
  else if (gateIsGood(gate)) { gate.frameMat.color.set(0x9fd4ff); gate.frameMat.emissive.set(0x1e6fe0); }
  else { gate.frameMat.color.set(0xffb0a0); gate.frameMat.emissive.set(0xd03030); }
}

export function createGate(x, z, op, value, need = 0) {
  // 只有初始为负的数字门可以被子弹打回正数；增益门不可强化
  const gate = { x, z, op, value, hits: 0, remaining: need, upgradable: op === 'add' && value < 0 };
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 192;
  gate.ctx = canvas.getContext('2d');
  gate.tex = new THREE.CanvasTexture(canvas);
  gate.tex.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_W, GATE_H),
    new THREE.MeshBasicMaterial({ map: gate.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  panel.position.y = GATE_H / 2 + 0.1;
  group.add(panel);

  gate.frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.7, roughness: 0.4 });
  const pillarGeo = new THREE.BoxGeometry(0.28, GATE_H + 0.5, 0.28);
  const pl = new THREE.Mesh(pillarGeo, gate.frameMat);
  pl.position.set(-GATE_W / 2 - 0.14, (GATE_H + 0.5) / 2, 0);
  const pr = pl.clone();
  pr.position.x = GATE_W / 2 + 0.14;
  const top = new THREE.Mesh(new THREE.BoxGeometry(GATE_W + 0.84, 0.28, 0.28), gate.frameMat);
  top.position.y = GATE_H + 0.6;
  group.add(pl, pr, top);

  gate.group = group;
  drawGateCanvas(gate);
  gateGroup.add(group);
  return gate;
}

export function applyGate(gate, count) {
  if (gate.op === 'mul') return Math.min(9999, count * gate.value);
  if (gate.op === 'div') return Math.floor(count / gate.value);
  if (gate.op === 'mine') return count; // 伤害走 loseSoldiers，兵力不变
  if (gate.op === 'gamble') {
    // 赌门：穿过时随机开奖
    const r = Math.random();
    if (r < 0.45) return Math.min(9999, count * 2);                  // 大赚
    if (r < 0.7) return Math.min(9999, count + Math.round(gate.value)); // 小赚
    if (r < 0.88) return Math.max(0, Math.floor(count / 2));         // 小亏
    return Math.max(0, count - Math.round(gate.value));              // 大亏
  }
  return Math.min(9999, Math.max(0, count + gate.value));
}

export function makeGatePair(z) {
  const half = ROAD_W / 4 + 0.35;
  const diff = diffAt(-z);
  const budget = Math.round(6 + diff * 4);
  const combos = [
    // 经典数值组合
    () => [{ op: 'mul', value: 2 }, { op: 'add', value: -Math.round(budget * 1.2) }],
    () => [{ op: 'mul', value: rngPick([2, 3]) }, { op: 'div', value: 2 }],
    () => [{ op: 'add', value: Math.round(budget * 1.5) }, { op: 'add', value: Math.round(budget * 0.4) }],
    () => [{ op: 'add', value: Math.round(budget) }, { op: 'add', value: -Math.round(budget) }],
    () => [{ op: 'div', value: 2 }, { op: 'add', value: -Math.round(budget * 0.8) }],
    () => [{ op: 'add', value: Math.round(budget * 2) }, { op: 'mul', value: 2 }],
    // 特殊门：赌门 / 强化 / 地雷 / 传送 / 金币
    () => [{ op: 'gamble', value: budget }, { op: 'add', value: Math.round(budget * 0.5) }],
    () => [{ op: 'buff', value: 0 }, { op: 'add', value: -Math.round(budget) }],
    () => [{ op: 'mine', value: Math.round(budget * 0.6) }, { op: 'mul', value: 2 }],
    () => [{ op: 'teleport', value: (Math.random() < 0.5 ? -1 : 1) * SQUAD_X_LIMIT * 0.8 }, { op: 'add', value: Math.round(budget * 1.2) }],
    () => [{ op: 'coin', value: Math.round(budget * 1.4) }, { op: 'div', value: 2 }],
    () => [{ op: 'gamble', value: budget }, { op: 'coin', value: Math.round(budget) }],
  ];
  let [ca, cb] = rngPick(combos)();
  // 一定概率换成武器门：倒计数随难度增长
  if (-z > 60 && Math.random() < 0.3) {
    const others = WEAPON_KEYS.filter((k) => k !== state.weapon);
    ca = { op: 'weapon', value: rngPick(others), need: Math.round(6 + diff * 3.5) };
  }
  if (Math.random() < 0.5) [ca, cb] = [cb, ca];
  const a = createGate(-half, z, ca.op, ca.value, ca.need ?? 0);
  const b = createGate(half, z, cb.op, cb.value, cb.need ?? 0);
  gates.push({ a, b, consumed: false, z });
}

export function removeGatePair(pair) {
  gateGroup.remove(pair.a.group);
  gateGroup.remove(pair.b.group);
}

// 门是否还能吃子弹：负数门未升满级 / 武器门未激活
export function gateInteractive(gate) {
  return (gate.upgradable && gate.value < 15) || (gate.op === 'weapon' && gate.remaining > 0);
}

// 子弹 / 电弧命中门的统一结算
export function hitInteractiveGate(gate) {
  if (gate.op === 'weapon') {
    gate.remaining--;
    if (gate.remaining <= 0) {
      activateWeaponGate(gate);
    } else {
      drawGateCanvas(gate);
      if (gate.remaining % 4 === 0) sfx.gateCharge();
    }
  } else {
    gate.hits++;
    if (gate.hits % 3 === 0) {
      gate.value += 1;
      drawGateCanvas(gate);
      sfx.gateTick();
    }
  }
}

// 武器门被打到 0 → 立即激活装备，无需穿门
export function activateWeaponGate(gate) {
  state.weapon = gate.value;
  state.spinTime = 0; // 换武器后加特林需重新预热
  ui.weaponTag.textContent = WEAPONS[gate.value].name;
  drawGateCanvas(gate);
  floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), `${WEAPONS[gate.value].name} 已装备!`, true);
  spawnBurst(gate.x, 1.8, gate.z, 0xffd24a, 26, 6, 0.5);
  spawnBurst(gate.x, 2.4, gate.z, 0x7dff9b, 18, 5, 0.5);
  sfx.weaponUp();
}
