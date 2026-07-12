// ============================================================ 环境：按块无限生成 + 距离主题
import * as THREE from 'three';
import { scene, squad, state, hemi, sun } from '../core/context.js';
import { showBanner } from '../ui/hud.js';
import { ROAD_W, CHUNK_LEN } from '../config.js';

// ---- 5 套主题：随距离循环切换，营造"越跑越陌生"的世界 ----
// bld: 建筑配色  win: 窗户辉光  dirt: 路旁地面  road: 路面染色
// fog/bg: 远景雾与天空  sky/ground: 半球光  sun/sunI: 主光
// prop/barrel: 路边杂物  hemiI: 半球光强度
export const THEMES = [
  { key: 'city',      name: '末日街区',   bld: [0x2c2838, 0x342c40, 0x262230, 0x3a3348], win: 0xffb45e, dirt: 0x241b22, road: 0xffffff,
    fog: 0x1a1426, bg: 0x1a1426, sky: 0x9fb4ff, ground: 0x33241f, sun: 0xffe0b3, sunI: 1.6, hemiI: 0.85, prop: 0x6b4a35, barrel: 0x9c3b2e },
  { key: 'industrial', name: '废弃工业区', bld: [0x223038, 0x2a3a42, 0x1c2a30, 0x324048], win: 0x66e0ff, dirt: 0x1a2422, road: 0xbfd8d8,
    fog: 0x12201f, bg: 0x12201f, sky: 0x7fd8e6, ground: 0x20302c, sun: 0xbfeede, sunI: 1.3, hemiI: 0.8,  prop: 0x5a6b6b, barrel: 0xc98a2e },
  { key: 'forest',    name: '枯死森林',   bld: [0x2e3320, 0x36422a, 0x26301c, 0x3e4630], win: 0xa6ff7a, dirt: 0x1e2a18, road: 0xcfe6b0,
    fog: 0x16240f, bg: 0x16240f, sky: 0xbfe89a, ground: 0x3a3320, sun: 0xe8ffb0, sunI: 1.5, hemiI: 0.9,  prop: 0x5a4a2a, barrel: 0x8a5a2a },
  { key: 'hell',      name: '熔岩地狱',   bld: [0x2a1414, 0x351a16, 0x221010, 0x3e2020], win: 0xff5a2a, dirt: 0x1a0a0a, road: 0xffb088,
    fog: 0x2a0808, bg: 0x2a0808, sky: 0xff7a4a, ground: 0x331010, sun: 0xff8a4a, sunI: 1.7, hemiI: 0.95, prop: 0x4a2a1a, barrel: 0xc23a1a },
  { key: 'void',      name: '虚空裂隙',   bld: [0x1e1a3a, 0x2a2450, 0x181436, 0x322a5e], win: 0xc77aff, dirt: 0x140f2a, road: 0xd8c8ff,
    fog: 0x100a26, bg: 0x100a26, sky: 0x9a7aff, ground: 0x241c40, sun: 0xc7a0ff, sunI: 1.4, hemiI: 0.85, prop: 0x4a3a6b, barrel: 0x7a4aca },
];
export const THEME_LEN = 360; // 每跑这么远换一个主题

export function themeForDist(d) {
  const i = Math.max(0, Math.floor(d / THEME_LEN)) % THEMES.length;
  return THEMES[i];
}

// 预生成每套主题的材质集（复用几何，仅材质按主题切换）
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3c3744'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#454050';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 3, 3);
  g.strokeStyle = '#5a5464'; g.lineWidth = 5;
  g.setLineDash([26, 22]);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#6b6577'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(4, 0); g.lineTo(4, 256); g.moveTo(124, 0); g.lineTo(124, 256); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const roadTex = makeRoadTexture();
roadTex.repeat.set(1, CHUNK_LEN / 14);
const roadGeo = new THREE.PlaneGeometry(ROAD_W, CHUNK_LEN);
const bldGeo = new THREE.BoxGeometry(1, 1, 1);
const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10);
const dirtGeo = new THREE.PlaneGeometry(140, CHUNK_LEN);

const themeMats = THEMES.map((t) => ({
  bld: t.bld.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
  win: new THREE.MeshBasicMaterial({ color: t.win }),
  dirt: new THREE.MeshStandardMaterial({ color: t.dirt, roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ map: roadTex, color: t.road, roughness: 0.95 }),
  prop: new THREE.MeshStandardMaterial({ color: t.prop, roughness: 0.9 }),
  barrel: new THREE.MeshStandardMaterial({ color: t.barrel, roughness: 0.7 }),
}));

let chunks = [];   // { z0, group }
let nextChunkZ = 60;

export function spawnChunk(z0) {
  const theme = themeForDist(-z0);
  const m = themeMats[THEMES.indexOf(theme)];
  const group = new THREE.Group();

  const road = new THREE.Mesh(roadGeo, m.road);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, z0 - CHUNK_LEN / 2);
  road.receiveShadow = true;
  group.add(road);

  const dirt = new THREE.Mesh(dirtGeo, m.dirt);
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, -0.05, z0 - CHUNK_LEN / 2);
  group.add(dirt);

  for (let z = z0; z > z0 - CHUNK_LEN; z -= 9) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.18) continue;
      const w = 5 + Math.random() * 6;
      const h = 4 + Math.random() * 14;
      const d = 6 + Math.random() * 4;
      const b = new THREE.Mesh(bldGeo, m.bld[(Math.random() * m.bld.length) | 0]);
      b.scale.set(w, h, d);
      b.position.set(side * (ROAD_W / 2 + 4 + w / 2 + Math.random() * 5), h / 2, z);
      group.add(b);
      if (Math.random() < 0.6) {
        const win = new THREE.Mesh(bldGeo, m.win);
        win.scale.set(0.5, 0.7, 0.1);
        win.position.set(b.position.x - side * (w / 2 + 0.06), 1 + Math.random() * (h - 2), z + (Math.random() - 0.5) * d * 0.6);
        group.add(win);
      }
    }
  }

  for (let i = 0; i < CHUNK_LEN / 12; i++) {
    const z = z0 - Math.random() * CHUNK_LEN;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (ROAD_W / 2 - 0.8 - Math.random() * 0.8);
    let p;
    if (Math.random() < 0.5) {
      p = new THREE.Mesh(barrelGeo, m.barrel);
      p.position.set(x, 0.45, z);
    } else {
      p = new THREE.Mesh(bldGeo, m.prop);
      p.scale.set(0.9, 0.6, 0.7);
      p.position.set(x, 0.3, z);
      p.rotation.y = Math.random() * Math.PI;
    }
    p.castShadow = true;
    group.add(p);
  }

  scene.add(group);
  chunks.push({ z0, group });
}

// 把全局氛围（天空 / 雾 / 灯光）平滑过渡到当前主题
const _tmp = new THREE.Color();
function lerpColor(target, hex, t) {
  _tmp.setHex(hex);
  target.lerp(_tmp, t);
}
let curThemeKey = null;

function updateAmbiance(dt) {
  const theme = themeForDist(state.dist);
  if (theme.key !== curThemeKey) {
    curThemeKey = theme.key;
    // 仅在游戏中弹主题横幅（菜单/暂停/结算时不干扰界面）
    if (state.phase === 'run') showBanner('🌍 ' + theme.name);
  }
  const k = Math.min(1, dt * 0.5); // 约 2 秒过渡完毕
  lerpColor(scene.background, theme.bg, k);
  lerpColor(scene.fog.color, theme.fog, k);
  lerpColor(hemi.color, theme.sky, k);
  lerpColor(hemi.groundColor, theme.ground, k);
  hemi.intensity += (theme.hemiI - hemi.intensity) * k;
  lerpColor(sun.color, theme.sun, k);
  sun.intensity += (theme.sunI - sun.intensity) * k;
}

export function updateChunks(dt) {
  while (nextChunkZ > squad.z - 320) {
    spawnChunk(nextChunkZ);
    nextChunkZ -= CHUNK_LEN;
  }
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].z0 - CHUNK_LEN > squad.z + 90) {
      scene.remove(chunks[i].group);
      chunks.splice(i, 1);
    }
  }
  updateAmbiance(dt || 0.016);
}

export function resetChunks() {
  for (const c of chunks) scene.remove(c.group);
  chunks.length = 0;
  nextChunkZ = 60;
  curThemeKey = null;
}
