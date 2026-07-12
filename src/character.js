// ============================================================ 角色皮肤切换
// 负责把 CrowdRenderer 当前渲染的零件替换成新的 parts 数组。
//
// 两套皮肤来源：
//  - 士兵 / 方块版咕咕嘎嘎：基础几何体即时拼出（零下载）
//  - AI 模型版咕咕嘎嘎：从 public/gugugaga.glb 加载，烘焙成单网格后实例化
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PENGUIN_MODEL_YAW = 0; // 企鹅 GLB 基础朝向偏置（弧度）。若网页上 AI 企鹅在「面向镜头」时显示的是后背，改为 Math.PI

const _loader = new GLTFLoader();
const TARGET_HEIGHT = 1.15; // 与士兵同高，队伍风格统一

/**
 * 异步加载 GLB 皮肤，返回 CrowdRenderer 可用的 parts 数组。
 * 把模型烘焙为「单网格 + 单材质」的独立零件（position=[0,0,0]），
 * 这样整队企鹅只需 1 个 InstancedMesh（1 个 draw call）。
 */
export function loadSkin(skinName, url) {
  return new Promise((resolve, reject) => {
    _loader.load(
      url,
      (gltf) => {
        try {
          resolve(gltfToParts(gltf.scene));
        } catch (e) {
          reject(e);
        }
      },
      undefined,
      (err) => reject(err)
    );
  });
}

function gltfToParts(root) {
  root.updateMatrixWorld(true);

  // 1) 收集所有网格，按「材质」分组（同一材质合并成一个几何体）
  const groups = new Map(); // materialUUID -> { material, geoms: [] }
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry.clone();
      o.updateWorldMatrix(true, false);
      g.applyMatrix4(o.matrixWorld); // 烘焙世界变换
      const mat = o.material;
      const key = (mat && mat.uuid) || '__nomaterial';
      if (!groups.has(key)) groups.set(key, { material: mat, geoms: [] });
      groups.get(key).geoms.push(g);
    }
  });

  if (groups.size === 0) throw new Error('GLB 中没有可用的网格');

  // 2) 每组：合并几何体（若多个）→ 归一化 → 生成一个 part
  const parts = [];
  for (const { material, geoms } of groups.values()) {
    let geo;
    if (geoms.length === 1) {
      geo = geoms[0];
    } else {
      geo = mergeGeometries(geoms, false);
    }
    normalizeGeo(geo);
    geo.rotateY(PENGUIN_MODEL_YAW); // 统一朝向：让 GLB 正面指向 +z，与方块企鹅一致，便于「面向镜头/背向奔跑」切换
    parts.push({
      geometry: geo,
      material: material ? material.clone() : new THREE.MeshStandardMaterial(),
      position: [0, 0, 0],
    });
  }
  return parts;
}

/** 缩放/平移几何体：高度 TARGET_HEIGHT、脚底 y=0、水平居中 */
function normalizeGeo(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const s = TARGET_HEIGHT / (size.y || 1);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const bb2 = geo.boundingBox;
  const cx = (bb2.min.x + bb2.max.x) / 2;
  const cz = (bb2.min.z + bb2.max.z) / 2;
  geo.translate(-cx, -bb2.min.y, -cz);
  geo.computeVertexNormals();
}

/**
 * 替换士兵群渲染器的皮肤：销毁旧 InstancedMesh，用新 parts 重建。
 * parts 约定见 crowd.js：{ geometry, material, position }
 */
export function swapSkin(crowdRenderer, scene, newParts, maxCount) {
  for (const mesh of crowdRenderer.meshes) {
    scene.remove(mesh);
    mesh.geometry.dispose?.();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose?.());
    } else {
      mesh.material.dispose?.();
    }
  }
  crowdRenderer.meshes = newParts.map((p) => {
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
