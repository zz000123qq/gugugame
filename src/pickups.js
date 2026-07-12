// ============================================================ 道具箱
import * as THREE from 'three';
import { scene, state, squad, sfx, ui, pickups, zombies, bosses } from './core/context.js';
import { ITEMS, ROAD_W } from './config.js';
import { floatText } from './ui/hud.js';
import { gore, spawnBurst } from './effects.js';

export const pickupGroup = new THREE.Group();
scene.add(pickupGroup);

export function createPickup(x, z, type) {
  const info = ITEMS[type];
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.4, emissive: info.color, emissiveIntensity: 0.25 })
  );
  crate.position.y = 0.75;
  crate.castShadow = true;
  group.add(crate);

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '90px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(info.icon, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.5, 1.5, 1);
  sprite.position.y = 2.2;
  group.add(sprite);

  pickupGroup.add(group);
  pickups.push({ x, z, type, group, crate });
}

// 全屏激光：横贯道路的光墙向前推进，途经的僵尸全灭
export const laserMesh = new THREE.Mesh(
  new THREE.BoxGeometry(ROAD_W + 2, 2.6, 0.35),
  new THREE.MeshBasicMaterial({ color: 0xff4a6a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.75, depthWrite: false })
);
laserMesh.visible = false;
scene.add(laserMesh);

// ============================================================ 道具效果
export function applyPickup(type) {
  const info = ITEMS[type];
  sfx.pickup(type);
  floatText(new THREE.Vector3(squad.x, 2.5, squad.z), `${info.icon} ${info.name}`, true);
  if (type === 'medkit') {
    const add = Math.max(5, Math.round(state.count * 0.15 * (state.medkitMult || 1)));
    state.count = Math.min(9999, state.count + add);
    state.maxCount = Math.max(state.maxCount, state.count);
  } else if (type === 'rage') {
    state.rageTime = 8;
  } else if (type === 'shield') {
    state.shieldTime = 6;
  } else if (type === 'laser') {
    // 光墙从队前向远方推进
    state.laserZ = squad.z - 3;
    state.laserZ0 = state.laserZ; // 本次激光的标记，Boss 只受创一次
    laserMesh.visible = true;
    sfx.laser();
    state.shake = Math.min(0.5, state.shake + 0.2);
  } else if (type === 'freeze') {
    state.freezeTime = 5;
    sfx.freeze();
    for (const zb of zombies) spawnBurst(zb.x, 0.9, zb.z, 0x9adfff, 3, 1.2, 0.4);
  } else if (type === 'nuke') {
    sfx.nuke();
    ui.flash.classList.remove('boom');
    void ui.flash.offsetWidth;
    ui.flash.classList.add('boom');
    state.shake = 0.6;
    for (let i = zombies.length - 1; i >= 0; i--) {
      gore(zombies[i].x, zombies[i].z);
      state.kills++;
      zombies.splice(i, 1);
    }
    for (const b of bosses) b.hp -= b.maxHp * 0.2;
  }
}
