// ============================================================ 僵尸（生成 + 每帧移动/技能/碰撞）
import * as THREE from 'three';
import { squad, state, sfx, zombies, bullets, squadRadius } from './core/context.js';
import { ZOMBIE_TYPES, ZOMBIE_TYPE_KEYS, diffAt, MAX_ZOMBIE_RENDER, ROAD_W } from './config.js';
import { gore, spawnBurst, throwSkull } from './effects.js';
import { spawnEnemyBullet } from './bullets.js';
import { floatText } from './ui/hud.js';
import { loseSoldiers } from './game.js';

// 按距离解锁的僵尸类型池：越往后特殊僵尸占比越高
export function rollZombieType() {
  const unlocked = ZOMBIE_TYPE_KEYS.filter((k) => state.dist >= ZOMBIE_TYPES[k].unlockAt);
  // 普通僵尸始终是主力，特殊类型均分剩余概率
  const specialShare = Math.min(0.55, 0.12 * (unlocked.length - 1));
  if (unlocked.length === 1 || Math.random() > specialShare) return 'normal';
  const specials = unlocked.filter((k) => k !== 'normal');
  return specials[(Math.random() * specials.length) | 0];
}

export function spawnWave(zCenter, size) {
  const diff = diffAt(state.dist);
  for (let i = 0; i < size; i++) {
    if (zombies.length >= MAX_ZOMBIE_RENDER) return;
    const typeKey = rollZombieType();
    const t = ZOMBIE_TYPES[typeKey];
    const hp = t.hp(diff);
    zombies.push({
      type: typeKey,
      x: (Math.random() - 0.5) * (ROAD_W - 1.2),
      z: zCenter - Math.random() * 8,
      hp, maxHp: hp,
      phase: Math.random() * Math.PI * 2,
      rotY: 0,
      scale: t.scaleBase + Math.random() * 0.2,
      speedBonus: Math.random() * 0.5,
      skillT: 1 + Math.random() * 3, // 技能计时器错开
      hidden: false,
      y: 0,
      burnT: 0,        // 喷火器灼烧剩余时间
      burnDps: 0,      // 喷火器每秒灼烧伤害
    });
  }
}

// 每帧推进僵尸：生成即追击，手臂朝向小队；每种类型有专属技能
// 返回 true 表示本帧因兵力归零已进入结算，调用方应终止后续逻辑
export function updateZombies(dt, time, diff, frozen) {
  const zSpeed = Math.min(10.5, 3.4 + diff * 0.55); // 后期基础速度可超过小队跑速，从背后也能追上
  for (let i = zombies.length - 1; i >= 0; i--) {
    const zb = zombies[i];
    const t = ZOMBIE_TYPES[zb.type];
    const dx = squad.x - zb.x;
    const dz = squad.z - zb.z;
    const len = Math.hypot(dx, dz) || 1;

    // ---- 类型技能（冰冻时全部停摆）
    if (!frozen) zb.skillT -= dt;
    let skillSpeedMul = frozen ? 0 : 1;
    if (frozen) {
      // 冻结中：不移动、不放技能，但照常挨打
    } else if (zb.type === 'normal') {
      // 暴走：逼近后短暂提速
      if (len < 13) skillSpeedMul = 1.4;
    } else if (zb.type === 'hunter') {
      // 突进：周期性猛冲，冲刺时留下红色残影
      if (zb.skillT <= 0) zb.skillT = 2.6 + Math.random();
      if (zb.skillT < 0.7) {
        skillSpeedMul = 2.6;
        if (Math.random() < 0.3) spawnBurst(zb.x, 0.6, zb.z, 0xc4553c, 3, 1, 0.25);
      }
    } else if (zb.type === 'butcher') {
      // 投掷兽颅：中远距离抡起兽颅砸向小队
      if (zb.skillT <= 0 && len > 8 && len < 34) {
        zb.skillT = 4 + Math.random() * 2;
        throwSkull(zb.x, 1.6 * zb.scale, zb.z, 0.03);
      }
    } else if (zb.type === 'shadow') {
      // 潜行：周期性相位隐身，隐身时子弹打不中
      if (zb.skillT <= 0) {
        zb.hidden = !zb.hidden;
        zb.skillT = zb.hidden ? 1.2 : 1.8;
        spawnBurst(zb.x, 0.8, zb.z, 0x8a7ab8, 8, 2.5, 0.3);
      }
    } else if (zb.type === 'witch') {
      // 咒疗：周期性治疗周围僵尸
      if (zb.skillT <= 0 && len < 30) {
        zb.skillT = 4;
        let healed = false;
        for (const other of zombies) {
          if (other === zb || other.hp <= 0) continue;
          if (Math.hypot(other.x - zb.x, other.z - zb.z) < 5) {
            other.hp = Math.min(other.maxHp, other.hp + Math.max(1, other.maxHp * 0.35));
            healed = true;
          }
        }
        if (healed) spawnBurst(zb.x, 1.2, zb.z, 0x58e4a8, 16, 3.5, 0.5);
      }
    } else if (zb.type === 'banshee') {
      // 诱捕：放出蝙蝠把小队横向拽向自己
      if (zb.skillT <= 0 && len < 22) {
        zb.skillT = 5;
        state.pullX = zb.x;
        state.pullTime = 0.7;
        spawnBurst(zb.x, 1.5, zb.z, 0xc46aa8, 20, 4, 0.6);
        floatText(new THREE.Vector3(zb.x, 2.2, zb.z), '🦇 诱捕！', false);
        sfx.gateBad();
      }
    } else if (zb.type === 'infected') {
      // 被感染的士兵：保持距离，低射速朝人类开火
      if (len < 15) skillSpeedMul = 0; // 到达射程后站定
      if (zb.skillT <= 0 && len < 32) {
        zb.skillT = 2.4 + Math.random() * 1.6;
        const mx = zb.x + ((squad.x - zb.x) / len) * 0.5;
        const mz = zb.z + ((squad.z - zb.z) / len) * 0.5;
        spawnEnemyBullet(mx, 0.75, mz);
        spawnBurst(mx, 0.8, mz, 0xffb060, 4, 1.5, 0.15); // 枪口焰
        sfx.enemyShot(len);
      }
    }

    // 电击麻痹减速
    if (zb.slowT > 0) {
      zb.slowT -= dt;
      skillSpeedMul *= 0.3;
    }
    const sp = (zSpeed * t.speedMul + (zb.speedBonus ?? 0)) * skillSpeedMul;
    zb.x += (dx / len) * sp * dt;
    zb.z += (dz / len) * sp * dt;
    zb.rotY = Math.atan2(-dx, -dz); // 模型面朝 -z，此角度让它面向小队
    zb.y = 0;

    // 喷火器灼烧持续伤害（DoT）
    if (zb.burnT > 0) {
      zb.burnT -= dt;
      zb.hp -= zb.burnDps * dt;
    }

    if (zb.hp <= 0) {
      gore(zb.x, zb.z);
      sfx.zombieDie(Math.hypot(zb.x - squad.x, zb.z - squad.z));
      state.kills++;
      zombies.splice(i, 1);
      continue;
    }
    if (Math.abs(zb.z - squad.z) < 1.0 + squadRadius() * 0.6 &&
        Math.abs(zb.x - squad.x) < 0.9 + squadRadius() * 0.6) {
      zombies.splice(i, 1);
      spawnBurst(zb.x, 0.9, zb.z, state.shieldTime > 0 ? 0x58baff : 0xff5050, 14, 5, 0.4);
      loseSoldiers(t.contactLoss);
      if (state.phase === 'result') return true;
    }
  }
  return false;
}

// 子弹-僵尸碰撞：z 轴分桶空间分区，复杂度从 O(僵尸×子弹) 降到 O(子弹×单桶僵尸数)
export function resolveBulletZombieCollisions() {
  // 1) 建立 z 桶索引（每 5 米一段），仅收录存活且非隐身的僵尸
  const BUCKET = 5;
  const zBuckets = new Map();
  for (let zi = 0; zi < zombies.length; zi++) {
    const zb = zombies[zi];
    if (zb.hp <= 0 || zb.hidden) continue;
    const key = Math.floor(zb.z / BUCKET);
    let arr = zBuckets.get(key);
    if (!arr) { arr = []; zBuckets.set(key, arr); }
    arr.push(zi);
  }
  // 2) 每颗子弹只比对自身所在桶 + 相邻桶内的僵尸
  for (const b of bullets) {
    if (b.dead) continue;
    const key = Math.floor(b.z / BUCKET);
    for (let dk = -1; dk <= 1; dk++) {
      if (b.dead) break; // 子弹已命中，停止检查其余桶，保证一颗子弹只打一个目标
      const arr = zBuckets.get(key + dk);
      if (!arr) continue;
      for (let ai = 0; ai < arr.length; ai++) {
        const zb = zombies[arr[ai]];
        if (!zb || zb.hp <= 0 || zb.hidden) continue;
        const hitR = (b.aoe > 0 ? 0.9 : 0.6) * Math.max(1, zb.scale * 0.8);
        if (Math.abs(b.z - zb.z) < hitR + 0.1 && Math.abs(b.x - zb.x) < hitR) {
          b.dead = true;
          zb.hp -= b.dmg;
          // 霰弹枪击退（命中的僵尸被向后微推）
          if (b.knock > 0) zb.z += b.knock;
          // 喷火器灼烧 DoT（命中后持续 2 秒掉血）
          if (b.burn > 0) { zb.burnT = 2; zb.burnDps = b.burn; }
          if (b.aoe > 0) {
            if (b.kind === 'rocket') {
              spawnBurst(b.x, 0.8, b.z, 0xff8a3a, 22, 7, 0.5);
              spawnBurst(b.x, 0.5, b.z, 0x555049, 10, 3, 0.7);
              sfx.explosion();
              state.shake = Math.min(0.4, state.shake + 0.06);
            } else if (Math.random() < 0.25) {
              spawnBurst(b.x, 0.7, b.z, 0xff9a3a, 6, 2.5, 0.3);
            }
            // 溅射：相邻桶范围内其他僵尸受伤
            const aoeKey = Math.floor(b.z / BUCKET);
            for (let adk = -1; adk <= 1; adk++) {
              const aarr = zBuckets.get(aoeKey + adk);
              if (!aarr) continue;
              for (let aj = 0; aj < aarr.length; aj++) {
                const other = zombies[aarr[aj]];
                if (other === zb || !other || other.hp <= 0) continue;
                if (Math.hypot(other.x - b.x, other.z - b.z) < b.aoe) other.hp -= b.dmg;
              }
            }
          }
          break; // 子弹已消耗，跳出本桶
        }
      }
    }
  }
}

// AoE 溅射死亡统一清理
export function cleanupDeadZombies() {
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].hp <= 0) {
      gore(zombies[i].x, zombies[i].z);
      sfx.zombieDie(Math.hypot(zombies[i].x - squad.x, zombies[i].z - squad.z));
      state.kills++;
      zombies.splice(i, 1);
    }
  }
}
