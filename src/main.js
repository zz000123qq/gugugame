// ============================================================ 入口：装配模块 + 渲染循环
import * as THREE from 'three';
import {
  scene, camera, renderer, sun, squad, state, zombies,
  soldierCrowd, zombieCrowds, zombieBuckets, unitSpiral, squadRadius, formationScale,
  bosses,
} from './core/context.js';
import { MAX_SOLDIER_RENDER, ZOMBIE_TYPE_KEYS } from './config.js';
import { updateChunks } from './world/environment.js';
import { updateRun } from './game.js';
import { updateBullets, updateEnemyBullets, updateZapLines } from './bullets.js';
import {
  updateBursts, updateBloodPools, updateSkulls, updateShockwaves, updateSpikePatches, throwSkull,
} from './effects.js';
import { updateHud } from './ui/hud.js';
import { spawnBoss } from './boss.js';
import { spawnWave } from './zombies.js';
import { applyPickup } from './pickups.js';

// 护盾视觉（仅渲染循环使用）
const shieldMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x58baff, transparent: true, opacity: 0.22, depthWrite: false })
);
shieldMesh.visible = false;
scene.add(shieldMesh);

const soldierAgents = [];
const clock = new THREE.Clock();
let hudTimer = 0;       // HUD 节流累计
let wasRunning = false; // 用于"刚进入 run"时立即刷新一次 HUD

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  updateChunks(dt);

  const running = state.phase === 'run';
  if (running) {
    updateRun(dt, time);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateSkulls(dt, time);
    updateShockwaves(dt);
    updateSpikePatches(dt, time);
    updateZapLines(dt);
    // HUD 节流到 ~10fps（DOM 写入昂贵）；run 态首帧立即刷新一次
    hudTimer += dt;
    if (hudTimer >= 0.1 || !wasRunning) { updateHud(); hudTimer = 0; }
  }
  wasRunning = running;

  updateBursts(dt);
  updateBloodPools(dt);

  // 仅在运行中更新群体（暂停/菜单/结算时冻结最后一帧，省去矩阵重传）
  if (running) {
    soldierAgents.length = 0;
    const renderN = Math.min(state.count, MAX_SOLDIER_RENDER);
    const scale = formationScale(renderN);
    for (let i = 0; i < renderN; i++) {
      soldierAgents.push({
        x: squad.x + unitSpiral[i].dx * scale,
        z: squad.z + unitSpiral[i].dz * scale,
        rotY: 0,
        phase: i * 1.7,
        scale: 1,
      });
    }
    soldierCrowd.update(soldierAgents, time, 0.08, 11);
    // 按类型分桶渲染僵尸；暗影芭比隐身期间不渲染
    for (const key of ZOMBIE_TYPE_KEYS) zombieBuckets[key].length = 0;
    for (const zb of zombies) {
      if (zb.hidden) continue;
      zombieBuckets[zb.type].push(zb);
    }
    for (const key of ZOMBIE_TYPE_KEYS) {
      // 浮空型（暗影/女妖）飘浮幅度更大更慢；猎手小幅快摆；其余默认
      const bobCfg = { hunter: [0.07, 9], shadow: [0.12, 4], banshee: [0.14, 3.5], witch: [0.06, 6] };
      const cfg = bobCfg[key] || [0.05, 7];
      zombieCrowds[key].update(zombieBuckets[key], time, cfg[0], cfg[1]);
    }
  }

  shieldMesh.visible = state.shieldTime > 0 && state.phase === 'run';
  if (shieldMesh.visible) {
    const r = squadRadius() + 1.1;
    shieldMesh.scale.set(r, r * 0.8, r);
    shieldMesh.position.set(squad.x, 0.6, squad.z);
    shieldMesh.material.opacity = 0.16 + Math.sin(time * 6) * 0.06;
  }

  state.shake = Math.max(0, state.shake - dt * 1.2);
  const shx = (Math.random() - 0.5) * state.shake;
  const shy = (Math.random() - 0.5) * state.shake;
  camera.position.set(squad.x * 0.55 + shx, 8.8 + shy, squad.z + 11);
  camera.lookAt(squad.x * 0.55, 0.8, squad.z - 7);

  sun.position.set(squad.x + 12, 20, squad.z + 8);
  sun.target.position.set(squad.x, 0, squad.z - 5);

  renderer.render(scene, camera);
}

animate();

// 调试接口（控制台可用：__dbg.spawnBoss() 等）
window.__dbg = { state, squad, spawnBoss, throwSkull, spawnWave, applyPickup, get bosses() { return bosses; } };
