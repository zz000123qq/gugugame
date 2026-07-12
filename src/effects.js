// ============================================================ 粒子 / 血泊 / 兽颅 / 震地波 / 地刺
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  scene, squad, state, sfx, skulls, shockwaves, spikePatches, bloodPools, bursts,
  _bm, _bp, _bs, _sq, _se, squadRadius,
} from './core/context.js';
import { SQUAD_X_LIMIT } from './config.js';
import { loseSoldiers } from './game.js';

// ============================================================ 粒子爆点 + 地面血泊
export function spawnBurst(x, y, z, color, n = 14, speed = 5, life = 0.45) {
  if (bursts.length > 60) return;
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const s = (0.4 + Math.random() * 0.6) * speed;
    const r = Math.sqrt(1 - u * u);
    vel.push(new THREE.Vector3(Math.cos(a) * r * s, Math.abs(u) * s, Math.sin(a) * r * s));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.22, transparent: true, opacity: 1 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  bursts.push({ points, vel, life, maxLife: life });
}

export function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.points);
      b.points.geometry.dispose();
      b.points.material.dispose();
      bursts.splice(i, 1);
      continue;
    }
    const p = b.points.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      b.vel[j].y -= 12 * dt;
      p.array[j * 3] += b.vel[j].x * dt;
      p.array[j * 3 + 1] += b.vel[j].y * dt;
      p.array[j * 3 + 2] += b.vel[j].z * dt;
    }
    p.needsUpdate = true;
    b.points.material.opacity = b.life / b.maxLife;
  }
}

// 地面血泊：击杀处留下一滩暗红渐隐污渍
const MAX_POOLS = 36;
const poolGeo = new THREE.CircleGeometry(0.55, 12);
export function spawnBloodPool(x, z) {
  let pool;
  if (bloodPools.length >= MAX_POOLS) {
    pool = bloodPools.shift(); // 复用最旧的
  } else {
    pool = {
      mesh: new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        color: 0x8a1015, transparent: true, opacity: 0.75, depthWrite: false,
      })),
    };
    pool.mesh.rotation.x = -Math.PI / 2;
    scene.add(pool.mesh);
  }
  pool.life = 3.2;
  pool.mesh.visible = true;
  pool.mesh.position.set(x, 0.02 + Math.random() * 0.01, z);
  const s = 0.7 + Math.random() * 0.9;
  pool.mesh.scale.set(s, s * (0.7 + Math.random() * 0.6), 1);
  pool.mesh.rotation.z = Math.random() * Math.PI * 2;
  bloodPools.push(pool);
}

export function updateBloodPools(dt) {
  for (const pool of bloodPools) {
    if (!pool.mesh.visible) continue;
    pool.life -= dt;
    if (pool.life <= 0) {
      pool.mesh.visible = false;
      continue;
    }
    pool.mesh.material.opacity = Math.min(0.75, pool.life * 0.6);
  }
}

// 击杀特效：红色血浆迸溅 + 血泊
export function gore(x, z) {
  spawnBurst(x, 0.9, z, 0xc01020, 16, 6, 0.5);
  spawnBurst(x, 0.6, z, 0x7a0a12, 8, 3.5, 0.65);
  spawnBloodPool(x, z);
}

// ============================================================ 兽颅投掷物（Boss / 憎恶屠夫的远程攻击）
const SKULL_MAX = 24;
const SKULL_G = 14;

function makeSkullGeo() {
  const parts = [];
  parts.push(new THREE.SphereGeometry(0.3, 10, 8));                                 // 颅骨
  parts.push(new THREE.BoxGeometry(0.3, 0.18, 0.24).translate(0, -0.16, -0.18));    // 下颚
  for (const side of [-1, 1]) {                                                     // 一对弯角
    parts.push(new THREE.ConeGeometry(0.07, 0.3, 6)
      .rotateZ(side * 0.9)
      .translate(side * 0.3, 0.18, 0));
  }
  return mergeGeometries(parts);
}
const skullMesh = new THREE.InstancedMesh(
  makeSkullGeo(),
  new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.7 }),
  SKULL_MAX
);
// 落点预警红圈
const warnRingMesh = new THREE.InstancedMesh(
  new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  SKULL_MAX
);
for (const m of [skullMesh, warnRingMesh]) {
  m.frustumCulled = false;
  scene.add(m);
}

// 从 (x,y,z) 朝小队预判落点抛出兽颅；lossFrac 决定命中时啃掉多少兵力
export function throwSkull(x, y, z, lossFrac) {
  if (skulls.length >= SKULL_MAX) return;
  const T = 0.85 + Math.random() * 0.4;
  // 预判：小队会继续向前跑
  const tx = THREE.MathUtils.clamp(squad.x + (Math.random() - 0.5) * 2.5, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
  const tz = squad.z - squad.speed * T * 0.9 + (Math.random() - 0.5) * 2.5;
  skulls.push({
    x, y, z,
    vx: (tx - x) / T,
    vz: (tz - z) / T,
    vy: (0.15 - y + 0.5 * SKULL_G * T * T) / T,
    tx, tz,
    lossFrac,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: 6 + Math.random() * 6,
  });
  sfx.throwSkull();
}

export function updateSkulls(dt, time) {
  for (let i = skulls.length - 1; i >= 0; i--) {
    const s = skulls[i];
    s.vy -= SKULL_G * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.spin += s.spinSpeed * dt;
    if (s.y <= 0.15 && s.vy < 0) {
      // 落地：骨屑 + 血色溅射，命中范围内啃兵
      spawnBurst(s.x, 0.4, s.z, 0xd8cfb8, 14, 4.5, 0.4);
      spawnBurst(s.x, 0.3, s.z, 0x8a1015, 8, 3, 0.5);
      sfx.skullImpact(Math.hypot(s.x - squad.x, s.z - squad.z));
      state.shake = Math.min(0.4, state.shake + 0.08);
      if (Math.hypot(s.x - squad.x, s.z - squad.z) < 2.3 + squadRadius() * 0.5) {
        loseSoldiers(Math.max(1, Math.round(state.count * s.lossFrac)));
      }
      skulls.splice(i, 1);
    }
  }

  skullMesh.count = skulls.length;
  warnRingMesh.count = skulls.length;
  for (let i = 0; i < skulls.length; i++) {
    const s = skulls[i];
    _se.set(s.spin, s.spin * 0.7, 0);
    _sq.setFromEuler(_se);
    _bp.set(s.x, s.y, s.z);
    _bs.set(1, 1, 1);
    _bm.compose(_bp, _sq, _bs);
    skullMesh.setMatrixAt(i, _bm);
    // 预警圈脉冲
    const pulse = 0.85 + Math.sin(time * 10 + i) * 0.2;
    _bp.set(s.tx, 0.03, s.tz);
    _bs.set(pulse, 1, pulse);
    _bm.compose(_bp, _sq.identity(), _bs);
    warnRingMesh.setMatrixAt(i, _bm);
  }
  skullMesh.instanceMatrix.needsUpdate = true;
  warnRingMesh.instanceMatrix.needsUpdate = true;
}

// ============================================================ Boss 技能：锤击震地波 + 地刺
// -- 震地波：从落锤点向外扩散的橙色冲击环，扫到小队即造成伤害
const SHOCK_MAX = 4;
const shockPool = [];
for (let i = 0; i < SHOCK_MAX; i++) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.0, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.visible = false;
  scene.add(mesh);
  shockPool.push(mesh);
}

export function spawnShockwave(x, z) {
  const mesh = shockPool.find((m) => !m.visible);
  if (!mesh) return;
  mesh.visible = true;
  mesh.position.set(x, 0.05, z);
  shockwaves.push({ x, z, r: 1.2, maxR: 15, mesh, hit: false });
  spawnBurst(x, 0.4, z, 0xb0a088, 26, 6, 0.6);
  sfx.hammer();
  state.shake = Math.min(0.6, state.shake + 0.35);
}

export function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const w = shockwaves[i];
    w.r += 11 * dt;
    w.mesh.scale.set(w.r, 1, w.r);
    w.mesh.material.opacity = 0.85 * (1 - w.r / w.maxR);
    // 冲击环扫过小队
    if (!w.hit && Math.abs(Math.hypot(squad.x - w.x, squad.z - w.z) - w.r) < 1.4) {
      w.hit = true;
      loseSoldiers(Math.max(3, Math.round(state.count * 0.12)));
    }
    if (w.r >= w.maxR) {
      w.mesh.visible = false;
      shockwaves.splice(i, 1);
    }
  }
}

// -- 地刺：红圈预警后从地下窜出的尖刺丛
const SPIKE_MAX = 9;
function makeSpikeGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.3;
    parts.push(new THREE.ConeGeometry(0.16 + Math.random() * 0.1, 1.6 + Math.random() * 0.9, 5)
      .translate(Math.cos(a) * r, 0.8, Math.sin(a) * r));
  }
  return mergeGeometries(parts);
}
const spikePool = [];
for (let i = 0; i < SPIKE_MAX; i++) {
  const spike = new THREE.Mesh(
    makeSpikeGeo(),
    new THREE.MeshStandardMaterial({ color: 0x5a4a42, roughness: 0.6 })
  );
  spike.castShadow = true;
  spike.visible = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.visible = false;
  scene.add(spike, ring);
  spikePool.push({ spike, ring, busy: false });
}

export function spawnSpikePatch(x, z) {
  const pool = spikePool.find((p) => !p.busy);
  if (!pool) return;
  pool.busy = true;
  pool.ring.visible = true;
  pool.ring.position.set(x, 0.04, z);
  pool.spike.position.set(x, -2.6, z);
  spikePatches.push({ x, z, pool, phase: 'warn', t: 0.85, hit: false });
}

export function updateSpikePatches(dt, time) {
  for (let i = spikePatches.length - 1; i >= 0; i--) {
    const sp = spikePatches[i];
    sp.t -= dt;
    if (sp.phase === 'warn') {
      const pulse = 1 + Math.sin(time * 14) * 0.12;
      sp.pool.ring.scale.set(pulse, 1, pulse);
      if (sp.t <= 0) {
        sp.phase = 'up';
        sp.t = 0.55;
        sp.pool.ring.visible = false;
        sp.pool.spike.visible = true;
        spawnBurst(sp.x, 0.3, sp.z, 0x6a5a50, 12, 4, 0.4);
        sfx.spikes();
        if (Math.hypot(squad.x - sp.x, squad.z - sp.z) < 2.0 + squadRadius() * 0.3) {
          loseSoldiers(Math.max(2, Math.round(state.count * 0.07)));
        }
      }
    } else if (sp.phase === 'up') {
      // 破土而出 → 停留 → 缩回
      const y = sp.t > 0.4 ? THREE.MathUtils.lerp(0, -2.6, (sp.t - 0.4) / 0.15) : (sp.t > 0.15 ? 0 : THREE.MathUtils.lerp(-2.6, 0, sp.t / 0.15));
      sp.pool.spike.position.y = y;
      if (sp.t <= 0) {
        sp.pool.spike.visible = false;
        sp.pool.busy = false;
        spikePatches.splice(i, 1);
      }
    }
  }
}

// 一局开始时重置所有持久视觉状态（兽颅 / 震地波 / 地刺 / 血泊）
export function resetEffects() {
  skullMesh.count = 0;
  warnRingMesh.count = 0;
  for (const w of shockwaves) w.mesh.visible = false;
  shockwaves.length = 0;
  for (const sp of spikePatches) {
    sp.pool.spike.visible = false;
    sp.pool.ring.visible = false;
    sp.pool.busy = false;
  }
  spikePatches.length = 0;
  for (const pool of bloodPools) pool.mesh.visible = false;
}
