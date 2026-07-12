import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _mat = new THREE.Matrix4();

/**
 * 用若干 InstancedMesh"零件"批量渲染一群小人（士兵/僵尸），
 * 每个个体只需提供 { x, z, rotY, phase, scale }，整体每帧只有几个 draw call。
 */
export class CrowdRenderer {
  constructor(scene, parts, maxCount) {
    this.maxCount = maxCount;
    this.meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geometry, p.material, maxCount);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.local = new THREE.Matrix4().compose(
        new THREE.Vector3(...p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1)
      );
      scene.add(mesh);
      return mesh;
    });
  }

  update(agents, time, bobAmp = 0.07, bobSpeed = 10) {
    const n = Math.min(agents.length, this.maxCount);
    for (const mesh of this.meshes) mesh.count = n;
    if (n === 0) {
      // 空群体：无需上传（避免无谓的 instanceMatrix 重传）
      for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = false;
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      const bob = Math.abs(Math.sin(time * bobSpeed + a.phase)) * bobAmp;
      _dummy.position.set(a.x, (a.y ?? 0) + bob, a.z);
      _dummy.rotation.set(Math.sin(time * bobSpeed + a.phase) * 0.06, a.rotY ?? 0, 0);
      const s = a.scale ?? 1;
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      for (const mesh of this.meshes) {
        _mat.multiplyMatrices(_dummy.matrix, mesh.userData.local);
        mesh.setMatrixAt(i, _mat);
      }
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(v) {
    for (const mesh of this.meshes) mesh.visible = v;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });

export function soldierParts() {
  return [
    { geometry: box(0.34, 0.36, 0.22), material: mat(0x2a3550), position: [0, 0.18, 0] },          // 腿
    { geometry: box(0.44, 0.4, 0.28), material: mat(0x3f7bd9), position: [0, 0.56, 0] },           // 躯干
    { geometry: box(0.5, 0.1, 0.32), material: mat(0x2a3550), position: [0, 0.4, 0] },             // 腰带
    { geometry: new THREE.SphereGeometry(0.15, 8, 8), material: mat(0xf0c8a0), position: [0, 0.88, 0] }, // 头
    { geometry: box(0.32, 0.13, 0.34), material: mat(0x27406e), position: [0, 0.99, 0] },          // 头盔
    { geometry: box(0.09, 0.1, 0.55), material: mat(0x222226, { roughness: 0.4, metalness: 0.6 }), position: [0.16, 0.62, -0.18] }, // 枪
  ];
}

const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt, rb, h, ws = 12) => new THREE.CylinderGeometry(rt, rb, h, ws);
const cone = (r, h, ws = 10) => new THREE.ConeGeometry(r, h, ws);
// 自发光材质（用于僵尸眼/符文，无需灯光即亮）
const glowMat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o });
// 半透明材质（用于幽灵/暗影/虚体，关闭深度写入避免穿插硬边）
const transMat = (c, o = 0.6) => new THREE.MeshStandardMaterial({
  color: c, roughness: 0.55, metalness: 0, transparent: true, opacity: o, depthWrite: false,
});

/**
 * 通用精细僵尸骨架：更写实的人形比例 + 前伸利爪/手掌 + 发光眼 + 张嘴獠牙 + 破衣。
 * 通过 opts 调整配色与体型，作为 7 种僵尸的共用"底模"。
 * 本地坐标：+y 向上，模型面朝 -z（即面向小队），前伸手臂放在 -z。
 */
function zombieAnatomy(o) {
  const skin   = o.skin   ?? 0x8fc46a;  // 皮肤/头/手臂
  const shirt  = o.shirt  ?? 0x5c8a3c;  // 上衣/破布
  const pants  = o.pants  ?? 0x3d4a2c;  // 裤腿
  const shoe   = o.shoe   ?? 0x2a2a26;  // 鞋
  const glow   = o.glow   ?? 0xff3b30;  // 眼发光色
  const hunch  = o.hunch  ?? 0;         // 佝偻前倾量（普通僵尸更驼背）
  const lean   = o.lean   ?? 1;         // 瘦削系数 (<1 更瘦)
  const bulk   = o.bulk   ?? 1;         // 壮硕系数 (>1 更宽)
  const claw   = o.claw   ?? false;     // 利爪（猎手）
  const tz = -hunch;                    // 上半身前移量（驼背）
  const w = 0.5 * bulk;                 // 躯干半宽
  const parts = [];
  // 骨盆
  parts.push({ geometry: box(w * 0.9, 0.26, 0.3), material: mat(pants), position: [0, 0.55, 0] });
  // 双腿 + 鞋
  for (const sx of [-1, 1]) {
    parts.push({ geometry: box(0.16 * lean, 0.56, 0.18), material: mat(pants), position: [sx * 0.14, 0.3, 0] });
    parts.push({ geometry: box(0.2, 0.1, 0.32), material: mat(shoe), position: [sx * 0.14, 0.05, -0.02] });
  }
  // 躯干（两段叠出弯曲驼背）
  parts.push({ geometry: box(w, 0.42, 0.34), material: mat(shirt), position: [0, 0.86 + tz * 0.4, tz * 0.5] });
  parts.push({ geometry: box(w * 0.96, 0.3, 0.32), material: mat(shirt, { roughness: 0.95 }), position: [0, 1.16 + tz * 0.7, tz] });
  // 破衣下摆 + 露出的病变胸腹
  parts.push({ geometry: box(w * 1.02, 0.14, 0.36), material: mat(shirt, { roughness: 1 }), position: [0, 0.66, 0.02] });
  parts.push({ geometry: box(w * 0.7, 0.22, 0.18), material: mat(skin, { roughness: 1 }), position: [0, 1.04 + tz * 0.5, tz * 0.7 - 0.12] });
  // 肩
  for (const sx of [-1, 1]) {
    parts.push({ geometry: sph(0.13 * bulk), material: mat(skin), position: [sx * (0.3 + 0.06 * (bulk - 1)), 1.2 + tz, tz] });
  }
  // 双臂前伸（-z）+ 爪/手掌
  const armLen = claw ? 0.62 : 0.5;
  for (const sx of [-1, 1]) {
    const ax = sx * (0.34 + 0.05 * (bulk - 1));
    parts.push({ geometry: box(0.13 * lean, 0.13, armLen), material: mat(skin), position: [ax, 1.12 + tz * 0.8, -0.28] });
    if (claw) {
      for (let k = -1; k <= 1; k++) {
        parts.push({ geometry: cone(0.04, 0.16, 5), material: mat(0xf2efe0), position: [ax + k * 0.05, 1.1 + tz * 0.8, -0.6], rotation: [1.4, 0, 0] });
      }
    } else {
      parts.push({ geometry: box(0.15, 0.14, 0.16), material: mat(skin), position: [ax, 1.1 + tz * 0.8, -0.56] });
    }
  }
  // 颈 + 头骨
  parts.push({ geometry: cyl(0.08, 0.1, 0.16, 8), material: mat(skin), position: [0, 1.34 + tz, tz] });
  const headY = 1.5 + tz;
  parts.push({ geometry: sph(0.22, 12, 10), material: mat(skin), position: [0, headY, tz] });
  // 下颌前突（张嘴啃咬感）
  parts.push({ geometry: box(0.2, 0.1, 0.16), material: mat(skin, { roughness: 1 }), position: [0, headY - 0.12, tz - 0.12] });
  parts.push({ geometry: box(0.16, 0.05, 0.05), material: mat(0xeae6d0), position: [0, headY - 0.07, tz - 0.16] }); // 牙
  // 发光眼
  for (const sx of [-1, 1]) {
    parts.push({ geometry: sph(0.05, 8, 8), material: glowMat(glow), position: [sx * 0.09, headY + 0.03, tz - 0.18] });
  }
  // 破发/顶
  parts.push({ geometry: box(0.26, 0.1, 0.22), material: mat(skin, { roughness: 1 }), position: [0, headY + 0.16, tz + 0.02] });
  return parts;
}

/** 普通僵尸：佝偻、绿皮、红眼 */
export function zombieParts(palette = {}) {
  const {
    legs = 0x3d4a2c,
    torso = 0x5c8a3c,
    head = 0x8fc46a,
  } = palette;
  return zombieAnatomy({ skin: head, shirt: torso, pants: legs, shoe: 0x2a2a26, glow: 0xff3b30, hunch: 0.13 });
}

/** 恶魔猎手：瘦削、红肤、黄色利爪、前倾猛扑姿态 */
export function hunterParts() {
  return zombieAnatomy({
    skin: 0xc4553c, shirt: 0x8a2a22, pants: 0x5a1e1e, shoe: 0x3a1414,
    glow: 0xffd23b, hunch: 0.05, lean: 0.82, claw: true,
  });
}

/** 憎恶屠夫：壮硕、灰肤、右手握巨型肉钩刀 */
export function butcherParts() {
  const parts = zombieAnatomy({
    skin: 0x9aa4b0, shirt: 0x4a525e, pants: 0x2c3038, shoe: 0x222428,
    glow: 0xff5020, bulk: 1.38, hunch: 0.07,
  });
  const bx = 0.62, by = 1.0, bz = -0.5; // 刀位置（右手前方）
  parts.push({ geometry: box(0.08, 0.5, 0.05), material: mat(0x8a8f96, { metalness: 0.5, roughness: 0.4 }), position: [bx, by, bz] });          // 刀柄
  parts.push({ geometry: box(0.5, 0.52, 0.05), material: mat(0xd8dde3, { metalness: 0.55, roughness: 0.3 }), position: [bx + 0.2, by + 0.2, bz] }); // 刀身
  parts.push({ geometry: box(0.5, 0.08, 0.06), material: mat(0xb0b5bc, { metalness: 0.55 }), position: [bx + 0.2, by + 0.46, bz] });            // 刀背
  parts.push({ geometry: cone(0.1, 0.4, 6), material: mat(0xd8dde3, { metalness: 0.55, roughness: 0.3 }), position: [bx + 0.42, by + 0.2, bz] }); // 钩尖
  return parts;
}

/** 暗影芭比：半透明飘浮长袍 + 兜帽 + 紫色缝隙眼（无腿，靠几何体悬空） */
export function shadowParts() {
  const robe = 0x453a5e, hood = 0x2a2438, glow = 0x9b7bff;
  const parts = [];
  parts.push({ geometry: cone(0.42, 1.25, 14), material: transMat(robe, 0.78), position: [0, 0.75, 0] });      // 外袍
  parts.push({ geometry: cone(0.3, 1.0, 12), material: transMat(0x34295a, 0.85), position: [0, 0.7, -0.02] }); // 内袍
  parts.push({ geometry: sph(0.26, 12, 10), material: transMat(hood, 0.9), position: [0, 1.45, -0.04] });      // 兜帽
  parts.push({ geometry: cone(0.2, 0.3, 10), material: transMat(hood, 0.9), position: [0, 1.62, -0.02] });     // 兜帽尖
  for (const sx of [-1, 1]) parts.push({ geometry: box(0.06, 0.03, 0.04), material: glowMat(glow), position: [sx * 0.09, 1.46, -0.22] }); // 眼缝
  for (const sx of [-1, 1]) parts.push({ geometry: box(0.12, 0.5, 0.12), material: transMat(robe, 0.7), position: [sx * 0.34, 0.95, -0.12], rotation: [0.4, 0, sx * 0.2] }); // 飘袖
  return parts;
}

/** 巫蛊术尸：绿色长裙 + 尖顶女巫帽 + 法杖宝珠（半实体，轻微悬空） */
export function witchParts() {
  const dress = 0x2a6a58, skin = 0x58c4a8, glow = 0x7dffd0, hat = 0x14352c;
  const parts = [];
  parts.push({ geometry: cone(0.4, 1.1, 14), material: mat(dress, { roughness: 1 }), position: [0, 0.66, 0] });   // 长裙
  parts.push({ geometry: box(0.34, 0.34, 0.28), material: mat(dress), position: [0, 1.18, 0] });                  // 上身
  for (const sx of [-1, 1]) parts.push({ geometry: box(0.12, 0.4, 0.12), material: mat(dress, { roughness: 1 }), position: [sx * 0.26, 1.02, -0.05] }); // 破袖
  parts.push({ geometry: sph(0.2, 12, 10), material: mat(skin), position: [0, 1.48, 0] });                         // 头
  parts.push({ geometry: cone(0.26, 0.5, 12), material: mat(hat), position: [0, 1.78, 0] });                      // 尖帽
  parts.push({ geometry: box(0.36, 0.05, 0.36), material: mat(hat), position: [0, 1.56, 0] });                    // 帽檐
  for (const sx of [-1, 1]) parts.push({ geometry: sph(0.045, 8, 8), material: glowMat(glow), position: [sx * 0.08, 1.5, -0.17] }); // 眼
  parts.push({ geometry: cyl(0.03, 0.03, 1.1, 8), material: mat(0x6a4a2a), position: [0.3, 0.9, -0.1] });         // 法杖
  parts.push({ geometry: sph(0.09, 10, 8), material: glowMat(0x9dffd8), position: [0.3, 1.5, -0.1] });            // 杖顶宝珠
  return parts;
}

/** 嗜血女妖：半透明幽魂长裙 + 飘散长发 + 尖叫口 + 上扬双臂（无腿，强悬空） */
export function bansheeParts() {
  const gown = 0x6a2a58, skin = 0xe8c0d8, glow = 0xff7ad0, hair = 0x3a1530;
  const parts = [];
  parts.push({ geometry: cone(0.4, 1.3, 16), material: transMat(gown, 0.55), position: [0, 0.8, 0] });            // 幽灵裙
  parts.push({ geometry: sph(0.24, 12, 10), material: transMat(skin, 0.7), position: [0, 1.45, 0] });             // 头
  parts.push({ geometry: box(0.3, 0.5, 0.12), material: transMat(hair, 0.7), position: [0, 1.3, 0.16] });         // 后发
  parts.push({ geometry: box(0.16, 0.6, 0.1), material: transMat(hair, 0.6), position: [-0.18, 1.15, 0.14] });    // 左发绺
  parts.push({ geometry: box(0.16, 0.6, 0.1), material: transMat(hair, 0.6), position: [0.18, 1.15, 0.14] });     // 右发绺
  parts.push({ geometry: box(0.1, 0.12, 0.06), material: transMat(0x2a0a20, 0.8), position: [0, 1.4, -0.2] });    // 尖叫口
  for (const sx of [-1, 1]) parts.push({ geometry: sph(0.05, 8, 8), material: glowMat(glow), position: [sx * 0.09, 1.5, -0.18] }); // 眼
  for (const sx of [-1, 1]) parts.push({ geometry: box(0.1, 0.5, 0.1), material: transMat(gown, 0.5), position: [sx * 0.32, 1.25, -0.05], rotation: [0.5, 0, sx * 0.5] }); // 上扬臂
  return parts;
}

/** 被感染的士兵僵尸：残破军装 + 病变绿皮发光眼 + 仍端着步枪（细节增强） */
export function infectedSoldierParts() {
  const pants = 0x2c3328, uniform = 0x3e5a44, belt = 0x252a22, skin = 0x8fc46a, helmet = 0x37432e, gun = 0x1c1c20;
  const parts = [];
  parts.push({ geometry: box(0.34, 0.36, 0.22), material: mat(pants), position: [0, 0.18, 0] });
  parts.push({ geometry: box(0.44, 0.4, 0.28), material: mat(uniform), position: [0, 0.56, 0] });
  parts.push({ geometry: box(0.5, 0.1, 0.32), material: mat(belt), position: [0, 0.4, 0] });
  parts.push({ geometry: box(0.46, 0.3, 0.3), material: mat(0x2f4636), position: [0, 0.6, 0.02] });            // 战术背心
  parts.push({ geometry: sph(0.15, 10, 8), material: mat(skin), position: [0, 0.86, 0] });                       // 病变头
  parts.push({ geometry: box(0.32, 0.13, 0.34), material: mat(helmet), position: [0, 0.97, -0.02] });            // 破头盔
  for (const sx of [-1, 1]) parts.push({ geometry: sph(0.045, 8, 8), material: glowMat(0xff3b30), position: [sx * 0.07, 0.88, -0.13] }); // 发光眼
  parts.push({ geometry: box(0.09, 0.1, 0.55), material: mat(gun, { roughness: 0.4, metalness: 0.6 }), position: [0.16, 0.6, -0.2] }); // 步枪
  return parts;
}

/**
 * 咕咕嘎嘎 — 精细化方块企鹅娘
 * 对照参考图：深蓝兜帽头 + 黄喙 + 大眼睛 + 腮红 + 白肚皮 +
 *            黑色刘海/侧发 + 青色发夹 + 银项圈 + 上举鳍翅 + 黄蹼足 + 尾鳍
 * 全部基础几何体，零下载，InstancedMesh 友好
 */
export function penguinParts() {
  /* ── 配色（对照参考图取色）── */
  const DARK     = 0x2c3546;   // 深蓝灰 — 兜帽/背/翅
  const DARK2    = 0x222a38;   // 更深 — 过渡阴影
  const WHITE    = 0xfffaf4;   // 暖白 — 肚皮/脸/眼白
  const BEAK     = 0xf5b800;   // 亮黄 — 上喙
  const BEAK2    = 0xe09500;   // 深橙黄 — 下喙
  const FOOT     = 0xe8a830;   // 金黄 — 蹼足
  const EYE_IRIS = 0x58a8e6;   // 亮蓝 — 虹膜
  const EYE_BLK  = 0x0c1118;   // 近黑 — 瞳孔
  const BLUSH    = 0xf08878;   // 腮红粉
  const LIP      = 0xd85660;   // 嘴唇红
  const HAIR     = 0x181c24;   // 黑发
  const CLIP     = 0x4ecdc4;   // 青绿发夹
  const COLLAR   = 0xb0b6c2;   // 银灰项圈带
  const CLASP    = 0xd0d4dc;   // 扣环亮银

  /* ── 辅助：预缩放几何体（用于非均匀缩放如压扁的脚）── */
  function scaledSphere(r, ws, hs, sx, sy, sz) {
    const g = new THREE.SphereGeometry(r, ws, hs);
    g.scale(sx, sy, sz);
    return g;
  }

  return [
    // ══════════════ 身体核心 ══════════════
    { geometry: new THREE.CylinderGeometry(0.26, 0.23, 0.64, 12),
      material: mat(DARK),  position: [0, 0.42, 0] },                  // 1 身体（微锥圆筒，上宽下窄）
    { geometry: new THREE.SphereGeometry(0.205, 14, 10),
      material: mat(WHITE), position: [0, 0.39, 0.178] },              // 2 白肚皮（前凸椭球）
    { geometry: box(0.50, 0.07, 0.33),
      material: mat(DARK2), position: [0, 0.73, 0] },                   // 3 颈腰暗环

    // ══════════════ 项圈 ══════════════
    { geometry: new THREE.CylinderGeometry(0.235, 0.235, 0.05, 16),
      material: mat(COLLAR, { roughness: 0.32, metalness: 0.55 }),
      position: [0, 0.77, 0] },                                         // 4 项圈带
    { geometry: box(0.10, 0.07, 0.045),
      material: mat(CLASP, { roughness: 0.22, metalness: 0.68 }),
      position: [0.075, 0.77, 0.155] },                                 // 5 金属扣环

    // ══════════════ 头部 / 企鹅兜帽 ══════════════
    { geometry: new THREE.SphereGeometry(0.275, 16, 13),
      material: mat(DARK),  position: [0, 1.035, 0] },                  // 6 兜帽主头（大圆球）

    // ══════════════ 脸部白区 ══════════════
    { geometry: new THREE.SphereGeometry(0.195, 13, 10),
      material: mat(WHITE), position: [0, 0.99, 0.185] },              // 7 白脸（覆盖眼嘴区的椭圆）

    // ══════════════ 喙（黄色三角形）══════════════
    { geometry: new THREE.ConeGeometry(0.095, 0.14, 8),
      material: mat(BEAK), position: [0, 0.925, 0.345],
      rotation: [1.57, 0, 0] },                                          // 8 上喙（前突锥体）
    { geometry: box(0.085, 0.035, 0.07),
      material: mat(BEAK2), position: [0, 0.875, 0.362] },              // 9 下喙

    // ══════════════ 右眼（三层：白→蓝瞳→黑瞳点）══════════════
    { geometry: new THREE.SphereGeometry(0.056, 11, 10),
      material: mat(WHITE),   position: [+0.092, 1.048, 0.265] },      // 10 眼白
    { geometry: new THREE.SphereGeometry(0.038, 9, 8),
      material: mat(EYE_IRIS),position: [+0.097, 1.048, 0.298] },      // 11 蓝虹膜
    { geometry: new THREE.SphereGeometry(0.017, 7, 6),
      material: mat(EYE_BLK), position: [+0.100, 1.049, 0.310] },      // 12 瞳孔

    // ══════════════ 左眼（三层）══════════════
    { geometry: new THREE.SphereGeometry(0.056, 11, 10),
      material: mat(WHITE),   position: [-0.092, 1.048, 0.265] },      // 13 眼白
    { geometry: new THREE.SphereGeometry(0.038, 9, 8),
      material: mat(EYE_IRIS),position: [-0.097, 1.048, 0.298] },      // 14 蓝虹膜
    { geometry: new THREE.SphereGeometry(0.017, 7, 6),
      material: mat(EYE_BLK), position: [-0.100, 1.049, 0.310] },      // 15 瞳孔

    // ══════════════ 表情细节 ══════════════
    { geometry: scaledSphere(0.036, 8, 6, 1.3, 0.65, 0.9),
      material: mat(BLUSH), position: [+0.135, 0.975, 0.238] },        // 16 右腮红（扁椭圆）
    { geometry: scaledSphere(0.036, 8, 6, 1.3, 0.65, 0.9),
      material: mat(BLUSH), position: [-0.135, 0.975, 0.238] },        // 17 左腮红
    { geometry: box(0.055, 0.022, 0.018),
      material: mat(LIP),   position: [0, 0.938, 0.312] },             // 18 小嘴巴（张开的红条）

    // ══════════════ 头发（黑色，从兜帽下露出）══════════════
    { geometry: box(0.255, 0.065, 0.035),
      material: mat(HAIR), position: [0, 0.958, 0.228] },              // 19 刘海（额前横条）
    { geometry: box(0.095, 0.165, 0.035),
      material: mat(HAIR), position: [-0.185, 0.918, 0.125] },         // 20 左侧发绺
    { geometry: box(0.080, 0.150, 0.035),
      material: mat(HAIR), position: [+0.188, 0.923, 0.108] },         // 21 右侧发绺

    // ══════════════ 发夹（青绿色，左侧头上）══════════════
    { geometry: box(0.052, 0.040, 0.018),
      material: mat(CLIP), position: [-0.172, 1.022, 0.218] },         // 22 夹子主体
    { geometry: box(0.024, 0.056, 0.014),
      material: mat(CLIP), position: [-0.178, 1.002, 0.232],
      rotation: [0, 0, 0.32] },                                         // 23 夹子交叉饰条

    // ══════════════ 鳍翅（V 字上举姿态）══════════════
    { geometry: new THREE.CylinderGeometry(0.038, 0.072, 0.36, 8),
      material: mat(DARK), position: [+0.305, 0.825, -0.045],
      rotation: [0.18, 0, 0.62] },                                      // 24 右鳍翅
    { geometry: new THREE.CylinderGeometry(0.038, 0.072, 0.36, 8),
      material: mat(DARK), position: [-0.305, 0.825, -0.045],
      rotation: [0.18, 0, -0.62] },                                     // 25 左鳍翅

    // ══════════════ 蹼足（压扁金黄椭球）══════════════
    { geometry: scaledSphere(0.072, 10, 7, 1.45, 0.42, 1.12),
      material: mat(FOOT), position: [+0.105, 0.038, 0.078] },         // 26 右脚
    { geometry: scaledSphere(0.072, 10, 7, 1.45, 0.42, 1.12),
      material: mat(FOOT), position: [-0.105, 0.038, 0.078] },         // 27 左脚

    // ══════════════ 尾鳍（向后上方翘起）══════════════
    { geometry: new THREE.ConeGeometry(0.058, 0.185, 6),
      material: mat(DARK2), position: [0, 0.175, -0.190],
      rotation: [0.82, 0, 0] },                                         // 28 尾鳍
  ];
}

/** 士兵编队偏移：黄金角螺旋，队形紧凑均匀 */
export function formationOffsets(max) {
  const offsets = [];
  for (let i = 0; i < max; i++) {
    const r = 0.62 * Math.sqrt(i);
    const a = i * 2.39996;
    offsets.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r });
  }
  return offsets;
}
