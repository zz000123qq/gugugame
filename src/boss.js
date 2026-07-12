// ============================================================ Boss（周期性刷新，可同时多个，多类型）
import * as THREE from 'three';
import { scene, squad, state, sfx, ui, bosses, bullets, _bs, _bp, _bq, _bm } from './core/context.js';
import { diffAt, SQUAD_X_LIMIT } from './config.js';
import { spawnBurst, gore, spawnBloodPool, throwSkull, spawnShockwave, spawnSpikePatch } from './effects.js';
import { loseSoldiers } from './game.js';
import { floatText, showBanner } from './ui/hud.js';

// 三种 Boss 的外形与攻防配置；随距离逐步解锁更强的类型
const BOSS_DEFS = [
  { // 0 腐肉巨尸：基础型
    name: '腐肉巨尸', body: 0x4e7a2f, head: 0x76aa4a, jaw: 0x3c5c22, eye: 0xff3030, arm: 0x5c8a3c, leg: 0x3a4a28,
    hpMul: 1.0, slamEvery: [1.4, 1.6], slamR: 2.5, slamLoss: 0.08, slamWarn: 1.0,
    throwEvery: [2.4, 3.0], hammerEvery: [6, 8], spikeEvery: [7, 9], spikeCount: 3, missiles: 1,
  },
  { // 1 冰霜领主：更密地刺 + 大范围冰砸
    name: '冰霜领主', body: 0x2f6a8a, head: 0x7ad4ff, jaw: 0x1f4a6a, eye: 0x66ffff, arm: 0x4aa0c0, leg: 0x244a5a,
    hpMul: 1.15, slamEvery: [1.5, 1.7], slamR: 3.4, slamLoss: 0.10, slamWarn: 1.1,
    throwEvery: [3.0, 3.6], hammerEvery: [7, 9], spikeEvery: [4.5, 6], spikeCount: 5, missiles: 1, frost: true,
  },
  { // 2 机械巨兵：导弹齐射 + 高频锤击，最肉
    name: '机械巨兵', body: 0x6b7078, head: 0x9aa0a8, jaw: 0x4a4e54, eye: 0xff6020, arm: 0x565b62, leg: 0x3a3e44,
    hpMul: 1.3, slamEvery: [1.6, 1.9], slamR: 2.8, slamLoss: 0.09, slamWarn: 0.95,
    throwEvery: [1.8, 2.4], hammerEvery: [5, 7], spikeEvery: [8, 10], spikeCount: 3, missiles: 3, mech: true,
  },
];

const rngRange = ([a, b]) => a + Math.random() * (b - a);

// 按当前距离决定"可出现的 Boss 类型上限"，越往后越强
function pickBossType() {
  const maxType = Math.min(BOSS_DEFS.length - 1, 1 + Math.floor(state.dist / 700));
  return Math.floor(Math.random() * (maxType + 1));
}

function createBossMesh(def) {
  const g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const glow = new THREE.MeshBasicMaterial({ color: def.eye });

  // 双腿 + 巨足
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 1.0), mat(def.leg));
    leg.position.set(sx * 0.6, 0.8, 0); g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.4), mat(def.leg, { roughness: 0.95 }));
    foot.position.set(sx * 0.6, 0.2, 0.2); g.add(foot);
  }
  // 骨盆
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.4), mat(def.body));
  pelvis.position.y = 1.7; g.add(pelvis);
  // 躯干
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 1.6), mat(def.body));
  torso.position.y = 3.0; g.add(torso);
  // 胸甲
  const chest = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.0, 1.7), mat(def.arm, { roughness: 0.6 }));
  chest.position.y = 3.35; g.add(chest);
  // 腹肌竖纹
  for (let k = -1; k <= 1; k++) {
    const abs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.1), mat(def.leg));
    abs.position.set(k * 0.55, 2.85, 0.82); g.add(abs);
  }
  // 肩甲
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), mat(def.arm));
    sp.position.set(sx * 1.7, 3.6, 0); g.add(sp);
  }
  // 可动双臂（绕肩枢轴旋转，动画改 armL/armR.rotation.x）
  function makeArm(sx) {
    const arm = new THREE.Group();
    arm.position.set(sx * 1.7, 3.6, -0.1);
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.7), mat(def.arm));
    up.position.set(0, -0.75, -0.05); up.rotation.x = 0.5; arm.add(up);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), mat(def.body));
    fore.position.set(0, -1.7, -0.6); fore.rotation.x = 0.9; arm.add(fore);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.78), mat(def.arm, { roughness: 0.6 }));
    fist.position.set(0, -2.3, -1.05); arm.add(fist);
    g.add(arm);
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  // 颈 + 头骨
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 10), mat(def.body));
  neck.position.y = 4.0; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 12), mat(def.head));
  head.position.y = 4.7; g.add(head);
  // 眉骨 + 下颌（张嘴）
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), mat(def.jaw));
  brow.position.set(0, 4.9, -0.6); g.add(brow);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.7), mat(def.jaw));
  jaw.position.set(0, 4.35, -0.5); g.add(jaw);
  // 发光眼
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), glow);
    e.position.set(sx * 0.33, 4.75, -0.8); g.add(e);
  }
  // 犄角（类型不同长度）
  const hornLen = def.mech ? 0.6 : def.frost ? 0.95 : 0.7;
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.18, hornLen, 8), mat(def.jaw));
    h.position.set(sx * 0.5, 5.4, -0.1); h.rotation.z = sx * 0.35; g.add(h);
  }
  // 背部尖刺（通用）
  const spikeMat = mat(def.frost ? 0xbfeaff : 0x55402e, { roughness: 0.55 });
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9 + (def.frost ? 0.3 : 0), 6), spikeMat);
    sp.position.set((k - 2) * 0.5, 3.4, 0.9); sp.rotation.x = -0.4; g.add(sp);
  }

  // 类型专属外形点缀
  if (def.frost) {
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.85 });
    for (const sx of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 6), iceMat);
      sp.position.set(sx * 1.4, 3.5, -0.2); sp.rotation.x = -0.3; g.add(sp);
    }
    for (const sx of [-1, 1]) { // 冰晶肩饰
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), iceMat);
      c.position.set(sx * 2.2, 3.9, 0); g.add(c);
    }
  }
  if (def.mech) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.4, metalness: 0.6 });
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.6, 10), metal);
    cannon.position.set(1.85, 3.0, -0.6); cannon.rotation.x = 1.1; g.add(cannon);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), glow);
    ant.position.set(0.3, 5.2, 0); g.add(ant);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), glow); // 胸口能量核
    core.position.set(0, 3.35, 0.9); g.add(core);
  }

  g.traverse((o) => { o.castShadow = true; });
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

export function spawnBoss() {
  const def = BOSS_DEFS[pickBossType()];
  const mesh = createBossMesh(def);
  const s = 1 + Math.min(diffAt(state.dist) * 0.08, 1.6);
  mesh.scale.set(s, s, s);
  const diff = diffAt(state.dist);
  // 血量同时随距离和当前兵力成长，防止大部队秒杀
  const hp = Math.round((350 + diff * 280 + state.count * 8) * def.hpMul);
  const boss = {
    def, type: BOSS_DEFS.indexOf(def),
    mesh, hp, maxHp: hp,
    x: (Math.random() - 0.5) * 4,
    z: squad.z - 85,
    slamTimer: rngRange(def.slamEvery),
    throwTimer: rngRange(def.throwEvery),
    hammerTimer: rngRange(def.hammerEvery),
    spikeTimer: rngRange(def.spikeEvery),
    slamWarn: 0, slamX: 0, slamZ: 0,
    slamR: def.slamR, slamLoss: def.slamLoss,
  };
  mesh.position.set(boss.x, 0, boss.z);
  scene.add(mesh);
  bosses.push(boss);
  ui.bossbar.classList.add('visible');
  showBanner(`⚠️ BOSS 来袭：${def.name}！`);
  sfx.bossRoar();
  state.shake = 0.4;
}

// Boss 砸地预警圈：地面红圈，玩家可在预警内左右闪避
const bossWarnRing = new THREE.InstancedMesh(
  new THREE.CircleGeometry(2.5, 28).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff2828, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  4
);
bossWarnRing.frustumCulled = false;
bossWarnRing.count = 0;
scene.add(bossWarnRing);

// 返回 true 表示本帧已进入结算，调用方应终止后续逻辑
export function updateBosses(dt, time, diff, frozen) {
  let nWarn = 0; // 预警圈实例计数
  for (let i = bosses.length - 1; i >= 0; i--) {
    const boss = bosses[i];
    const def = boss.def;
    const bossR = 2.2 * boss.mesh.scale.x;

    for (const b of bullets) {
      if (b.dead) continue;
      if (Math.abs(b.z - boss.z) < bossR && Math.abs(b.x - boss.x) < bossR) {
        b.dead = true;
        boss.hp -= b.dmg;
        if (b.kind === 'rocket') {
          spawnBurst(b.x, 2, boss.z + bossR * 0.5, 0xff8a3a, 16, 5, 0.4);
          sfx.explosion();
        } else if (Math.random() < 0.3) {
          spawnBurst(b.x, 1.5 + Math.random() * 2, boss.z + bossR * 0.5, 0xffd24a, 5, 3, 0.25);
        }
      }
    }

    // 冰冻期间 Boss 完全停摆（仍然挨打）
    if (!frozen) {
      // 锚定在小队前方 ~7.5 处：远了就追，近了就随小队一起后撤，永远不会跑到身后
      const targetZ = squad.z - 7.5;
      const maxStep = (squad.speed + 3.5) * dt;
      boss.z += THREE.MathUtils.clamp(targetZ - boss.z, -maxStep, maxStep);
      if (boss.z > squad.z - 4) boss.z = squad.z - 4; // 兜底：绝不越过小队
      const gap = boss.z - squad.z; // 负值 = boss 在前方
      boss.x += (squad.x * 0.7 - boss.x) * Math.min(1, dt * 1.6);

      boss.slamTimer -= dt;
      if (boss.slamTimer <= 0 && gap > -10) {
        boss.slamTimer = rngRange(def.slamEvery);
        boss.slamWarn = def.slamWarn;
        boss.slamX = squad.x;
        boss.slamZ = squad.z - 1;
        sfx.gateCharge();
      }
      // 砸地预警倒计时：落地瞬间只伤害红圈范围内的小队
      if (boss.slamWarn > 0) {
        boss.slamWarn -= dt;
        if (boss.slamWarn <= 0) {
          const loss = Math.max(2, Math.round(state.count * boss.slamLoss));
          spawnBurst(boss.slamX, 0.8, boss.slamZ, def.frost ? 0x9fe8ff : 0xff5050, 22, 6, 0.5);
          state.shake = Math.min(0.5, state.shake + 0.25);
          sfx.hammer();
          if (Math.abs(squad.x - boss.slamX) < boss.slamR) {
            loseSoldiers(loss);
            if (state.phase === 'result') return true;
          }
        }
      }
      // 远程投掷：兽颅 / 导弹（导弹齐射）
      boss.throwTimer -= dt;
      if (boss.throwTimer <= 0 && gap < -9) {
        boss.throwTimer = rngRange(def.throwEvery);
        for (let m = 0; m < def.missiles; m++) {
          throwSkull(boss.x + (m - (def.missiles - 1) / 2) * 1.2, 3.6 * boss.mesh.scale.x, boss.z, 0.06);
        }
        boss.mesh.userData.armR.rotation.x = -1.6;
      }
      // 锤击地面：双臂高举砸下，掀起扩散的震地波
      boss.hammerTimer -= dt;
      if (boss.hammerTimer <= 0 && gap > -16) {
        boss.hammerTimer = rngRange(def.hammerEvery);
        boss.mesh.userData.armL.rotation.x = -2.4;
        boss.mesh.userData.armR.rotation.x = -2.4;
        spawnShockwave(boss.x, boss.z);
      }
      // 地刺：在小队预判路径上连布尖刺
      boss.spikeTimer -= dt;
      if (boss.spikeTimer <= 0) {
        boss.spikeTimer = rngRange(def.spikeEvery);
        for (let k = 0; k < def.spikeCount; k++) {
          spawnSpikePatch(
            THREE.MathUtils.clamp(squad.x + (Math.random() - 0.5) * 4, -SQUAD_X_LIMIT, SQUAD_X_LIMIT),
            squad.z - 6 - k * 7
          );
        }
      }
      const t = Math.max(0, boss.slamTimer);
      boss.mesh.userData.armL.rotation.x = 0.5 + Math.sin(t * 8) * 0.9;
      boss.mesh.userData.armR.rotation.x = 0.5 + Math.cos(t * 8) * 0.9;

      boss.mesh.position.set(boss.x, Math.abs(Math.sin(time * 3)) * 0.1, boss.z);
      boss.mesh.rotation.y = Math.atan2(squad.x - boss.x, squad.z - boss.z);

      // 砸地预警圈：预警期间在落点显示脉冲红圈（按 boss.slamR 缩放）
      if (boss.slamWarn > 0 && nWarn < 4) {
        const scale = boss.slamR / 2.5;
        const pulse = scale * (0.7 + Math.sin(time * 14) * 0.25);
        _bp.set(boss.slamX, 0.04, boss.slamZ);
        _bs.set(pulse, 1, pulse);
        _bm.compose(_bp, _bq.identity(), _bs);
        bossWarnRing.setMatrixAt(nWarn, _bm);
        nWarn++;
      }
    }

    if (boss.hp <= 0) {
      spawnBurst(boss.x, 2.5, boss.z, def.frost ? 0x66e0ff : def.mech ? 0xff8030 : 0xc01020, 40, 9, 0.9);
      spawnBurst(boss.x, 3.5, boss.z, 0xffd24a, 40, 9, 1.0);
      spawnBloodPool(boss.x, boss.z);
      scene.remove(boss.mesh);
      bosses.splice(i, 1);
      state.kills++;
      // 击杀奖励：补充兵力
      const bonus = Math.round(8 + diff * 3);
      state.count = Math.min(9999, state.count + bonus);
      state.maxCount = Math.max(state.maxCount, state.count);
      floatText(new THREE.Vector3(boss.x, 3, boss.z), `+${bonus} 增援!`, true);
      showBanner(`💥 ${def.name} 击破！`);
      sfx.levelUp();
    }
  }
  bossWarnRing.count = nWarn;
  bossWarnRing.instanceMatrix.needsUpdate = true;
  return false;
}

// 一局开始时重置所有 Boss 与砸地预警圈
export function resetBosses() {
  for (const b of bosses) scene.remove(b.mesh);
  bosses.length = 0;
  bossWarnRing.count = 0;
}
