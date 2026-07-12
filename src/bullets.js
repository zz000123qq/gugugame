// ============================================================ 子弹（曳光弹 + 火箭弹 + 喷火球 + 电弧 + 敌方子弹）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  scene, state, squad, sfx, bullets, enemyBullets, zombies, bosses, gates,
  _bm, _bq, _bs, _bp, _bc, _yAxis, squadRadius,
} from './core/context.js';
import { MAX_BULLETS, MAX_ENEMY_BULLETS, GATE_W, GATE_H } from './config.js';
import { gateInteractive, hitInteractiveGate } from './gates.js';
import { spawnBurst } from './effects.js';
import { loseSoldiers } from './game.js';

// 曳光弹
const tracerCoreGeo = new THREE.CylinderGeometry(0.022, 0.05, 0.95, 6).rotateX(Math.PI / 2);
const tracerCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
const tracerGlowGeo = new THREE.CylinderGeometry(0.055, 0.11, 0.8, 6).rotateX(Math.PI / 2);
const tracerGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false,
});
const tracerCoreMesh = new THREE.InstancedMesh(tracerCoreGeo, tracerCoreMat, MAX_BULLETS);
const tracerGlowMesh = new THREE.InstancedMesh(tracerGlowGeo, tracerGlowMat, MAX_BULLETS);

function makeRocketGeo() {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.1, 0.115, 0.52, 10).rotateX(Math.PI / 2));
  parts.push(new THREE.ConeGeometry(0.1, 0.24, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.38));
  for (let i = 0; i < 3; i++) {
    parts.push(new THREE.BoxGeometry(0.03, 0.22, 0.18).translate(0, 0.16, 0.2).rotateZ((i / 3) * Math.PI * 2));
  }
  return mergeGeometries(parts);
}
const ROCKET_MAX = 60;
const rocketMat = new THREE.MeshStandardMaterial({ color: 0x4a5a45, roughness: 0.5, metalness: 0.4 });
const rocketMesh = new THREE.InstancedMesh(makeRocketGeo(), rocketMat, ROCKET_MAX);
const flameGeo = new THREE.ConeGeometry(0.09, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.55);
const flameMat = new THREE.MeshBasicMaterial({
  color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false,
});
const flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, ROCKET_MAX);

// 喷火器火球：随飞行膨胀消散的发光团
const FIREBALL_MAX = 200;
const fireballMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.16, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.45, depthWrite: false }),
  FIREBALL_MAX
);

for (const m of [tracerCoreMesh, tracerGlowMesh, rocketMesh, flameMesh, fireballMesh]) {
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
  m.frustumCulled = false;
  scene.add(m);
}

// 电击器闪电链：折线池
const ZAP_POOL_N = 12;
const zapPool = [];
for (let i = 0; i < ZAP_POOL_N; i++) {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x9aeaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending })
  );
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  zapPool.push({ line, life: 0 });
}

export function drawZapLine(points) {
  let slot = zapPool.find((z) => z.life <= 0) ?? zapPool[0];
  // 折线抖动出电弧感
  const jittered = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    jittered.push(a);
    for (const f of [0.33, 0.66]) {
      jittered.push(new THREE.Vector3(
        a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 0.6,
        a.y + (b.y - a.y) * f + Math.random() * 0.5,
        a.z + (b.z - a.z) * f + (Math.random() - 0.5) * 0.6
      ));
    }
  }
  jittered.push(points[points.length - 1]);
  slot.line.geometry.setFromPoints(jittered);
  slot.line.visible = true;
  slot.life = 0.09;
}

export function updateZapLines(dt) {
  for (const z of zapPool) {
    if (z.life <= 0) continue;
    z.life -= dt;
    z.line.material.opacity = Math.max(0, z.life / 0.09);
    if (z.life <= 0) z.line.visible = false;
  }
}

// 电击：从枪口锁定最近敌人，再向附近连锁跳跃；命中带麻痹减速
export function fireZap(sx, sz, dmg) {
  const points = [new THREE.Vector3(sx, 0.8, sz)];
  const hitSet = new Set();
  let cx = sx, cz = sz;
  let range = 32;
  for (let hop = 0; hop < 6; hop++) {
    let best = null, bestD = range, bestBoss = null;
    for (const zb of zombies) {
      if (zb.hidden || hitSet.has(zb) || zb.z > sz) continue;
      const d = Math.hypot(zb.x - cx, zb.z - cz);
      if (d < bestD) { bestD = d; best = zb; bestBoss = null; }
    }
    // Boss 与僵尸同场竞争目标，不再只是兜底
    for (const boss of bosses) {
      if (hitSet.has(boss)) continue;
      const d = Math.hypot(boss.x - cx, boss.z - cz);
      if (d < bestD) { bestD = d; best = boss; bestBoss = boss; }
    }
    if (!best) break;
    hitSet.add(best);
    if (bestBoss) {
      bestBoss.hp -= dmg * 2.5;
      points.push(new THREE.Vector3(bestBoss.x, 2.5, bestBoss.z));
      spawnBurst(bestBoss.x, 2.5, bestBoss.z, 0x9aeaff, 6, 3, 0.25);
    } else {
      best.hp -= dmg;
      best.slowT = 0.6; // 电麻：短暂减速
      spawnBurst(best.x, 0.9, best.z, 0x9aeaff, 5, 2, 0.2);
      points.push(new THREE.Vector3(best.x, 0.9, best.z));
    }
    cx = best.x; cz = best.z;
    range = 10; // 后续跳跃距离
  }
  // 电弧也能劈门：与子弹规则一致，枪口横向对准门面板才算命中
  for (const pair of gates) {
    if (pair.consumed) continue;
    let hitGate = null;
    for (const gate of [pair.a, pair.b]) {
      if (!gateInteractive(gate)) continue;
      if (gate.z < sz && sz - gate.z < 32 && Math.abs(sx - gate.x) < GATE_W / 2) {
        hitGate = gate;
        break;
      }
    }
    if (hitGate) {
      hitInteractiveGate(hitGate);
      spawnBurst(hitGate.x, 1.6, hitGate.z, 0x9aeaff, 5, 2.5, 0.2);
      points.push(new THREE.Vector3(hitGate.x, GATE_H * 0.5, hitGate.z));
      break; // 每次电击最多劈一扇门
    }
  }
  if (points.length > 1) drawZapLine(points);
}

export function spawnBullet(x, y, z, w, dmgScale) {
  // 对象池：优先复用已死亡的子弹对象，避免高频分配/释放触发 GC 卡顿
  let b = null;
  for (let i = 0; i < bullets.length; i++) {
    if (bullets[i].dead) { b = bullets[i]; break; }
  }
  if (!b) {
    if (bullets.length >= MAX_BULLETS) return;
    b = {};
    bullets.push(b);
  }
  b.x = x; b.y = y; b.z = z;
  b.kind = w.kind;
  b.vx = (Math.random() - 0.5) * 2 * w.spread * w.speed * 0.12;
  b.speed = w.speed;
  b.dmg = w.dmg * dmgScale;
  b.aoe = w.aoe;
  b.size = w.size;
  b.color = w.color;
  b.knock = w.knock ?? 0;          // 霰弹枪击退量
  b.burn = w.burn ? b.dmg * w.burn : 0; // 喷火器灼烧每秒伤害
  b.trailAcc = 0;
  b.age = 0;
  b.range = w.range ?? (w.kind === 'rocket' ? 42 : 34);
  b.dead = false;
}

export function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.dead) continue; // 已被碰撞标记为死亡，等待复用
    b.z -= b.speed * dt;
    b.x += b.vx * dt;
    b.range -= b.speed * dt;
    if (b.kind === 'rocket') {
      b.trailAcc += dt;
      if (b.trailAcc > 0.055) {
        b.trailAcc = 0;
        spawnBurst(b.x, b.y + 0.05, b.z + 0.5, 0x8a8078, 3, 0.8, 0.35);
      }
    }
    if (b.range <= 0) b.dead = true; // 标记死亡而非 splice，由对象池复用
  }

  let nTracer = 0, nRocket = 0, nFire = 0;
  for (const b of bullets) {
    if (b.dead) continue;
    b.age += dt;
    const yaw = Math.atan2(b.vx, -b.speed) + Math.PI;
    _bq.setFromAxisAngle(_yAxis, yaw);
    _bp.set(b.x, b.y, b.z);
    if (b.kind === 'flame') {
      if (nFire >= FIREBALL_MAX) continue;
      // 火球随飞行膨胀，颜色由亮金渐变到深橙红
      const s = 0.5 + b.age * 2.6;
      _bs.set(s, s, s);
      _bm.compose(_bp, _bq, _bs);
      fireballMesh.setMatrixAt(nFire, _bm);
      fireballMesh.setColorAt(nFire, _bc.set(b.age < 0.15 ? 0xffe9a0 : b.age < 0.4 ? 0xffa040 : 0xe0501a));
      nFire++;
    } else if (b.kind === 'tracer') {
      if (nTracer >= MAX_BULLETS) continue;
      _bs.set(b.size, b.size, b.size);
      _bm.compose(_bp, _bq, _bs);
      tracerCoreMesh.setMatrixAt(nTracer, _bm);
      tracerGlowMesh.setMatrixAt(nTracer, _bm);
      _bc.set(b.color);
      tracerCoreMesh.setColorAt(nTracer, _bc);
      tracerGlowMesh.setColorAt(nTracer, _bc);
      nTracer++;
    } else {
      if (nRocket >= ROCKET_MAX) continue;
      _bs.set(1, 1, 1);
      _bm.compose(_bp, _bq, _bs);
      rocketMesh.setMatrixAt(nRocket, _bm);
      const f = 0.7 + Math.random() * 0.6;
      _bs.set(f, f, f * (0.8 + Math.random() * 0.5));
      _bm.compose(_bp, _bq, _bs);
      flameMesh.setMatrixAt(nRocket, _bm);
      flameMesh.setColorAt(nRocket, _bc.set(Math.random() < 0.3 ? 0xffe08a : 0xff8a3a));
      nRocket++;
    }
  }
  tracerCoreMesh.count = nTracer;
  tracerGlowMesh.count = nTracer;
  rocketMesh.count = nRocket;
  flameMesh.count = nRocket;
  fireballMesh.count = nFire;
  for (const m of [tracerCoreMesh, tracerGlowMesh, rocketMesh, flameMesh, fireballMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

// ============================================================ 敌方子弹（被感染士兵的射击）
const enemyBulletMesh = new THREE.InstancedMesh(
  tracerCoreGeo,
  new THREE.MeshBasicMaterial({ color: 0xff5a4a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  MAX_ENEMY_BULLETS
);
enemyBulletMesh.frustumCulled = false;
scene.add(enemyBulletMesh);

export function spawnEnemyBullet(x, y, z) {
  if (enemyBullets.length >= MAX_ENEMY_BULLETS) return;
  // 瞄准小队中心，带一点散布
  const T = Math.max(0.3, Math.hypot(squad.x - x, squad.z - z) / 18);
  const tx = squad.x + (Math.random() - 0.5) * 1.6;
  const tz = squad.z - squad.speed * T * 0.5;
  const len = Math.hypot(tx - x, tz - z) || 1;
  enemyBullets.push({
    x, y, z,
    vx: ((tx - x) / len) * 18,
    vz: ((tz - z) / len) * 18,
    life: 3,
  });
}

export function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    // 命中小队
    if (Math.hypot(b.x - squad.x, b.z - squad.z) < squadRadius() * 0.7 + 0.4) {
      spawnBurst(b.x, 0.7, b.z, 0xff5a4a, 8, 3, 0.3);
      loseSoldiers(1);
      enemyBullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) enemyBullets.splice(i, 1);
  }
  enemyBulletMesh.count = enemyBullets.length;
  for (let i = 0; i < enemyBullets.length; i++) {
    const b = enemyBullets[i];
    _bq.setFromAxisAngle(_yAxis, Math.atan2(-b.vx, -b.vz));
    _bp.set(b.x, b.y, b.z);
    _bs.set(0.9, 0.9, 0.9);
    _bm.compose(_bp, _bq, _bs);
    enemyBulletMesh.setMatrixAt(i, _bm);
  }
  enemyBulletMesh.instanceMatrix.needsUpdate = true;
}

// 一局开始时重置敌方子弹与电弧池（玩家子弹在 game.startRun 中直接清空数组）
export function resetEnemyBullets() {
  enemyBullets.length = 0;
  enemyBulletMesh.count = 0;
  for (const z of zapPool) { z.life = 0; z.line.visible = false; }
}
