# 末日之门 (Doomsday Gates) 改进方案

> 项目分析：Three.js 无尽跑酷游戏，核心玩法为「左右选门改变兵力 × 武器射击僵尸 × Boss 战」

---

## ✅ 已实施（2026-07-12，第一波改动）

以下改动已写入 `src/main.js` 并通过 `vite build` 验证：

| 改动 | 文件位置 | 效果 |
|------|----------|------|
| **穿门濒死保护** | `state.graceTime` + `updateRun` 末尾 | 兵力归零不再立即判负，0.3s 窗口内吃到增援可复活；窗口耗尽才真正失败 |
| **子弹对象池** | `spawnBullet` / `updateBullets` | 复用死亡子弹对象，消除每帧 `bullets.splice` 的 GC 抖动 |
| **僵尸碰撞空间分区** | `updateRun` 新增分桶碰撞 pass | z 轴每 5m 一桶，碰撞从 O(僵尸×子弹) 降到 O(子弹×单桶)，消除 35 万次/帧瓶颈 |
| **Boss 砸地预警** | `boss.slamWarn` + `bossWarnRing` | 近身砸地改为 1s 蓄力预警（地面脉冲红圈），落地只伤红圈内小队，可左右闪避 |
| **加特林预热** | `state.spinTime` + 开火段 | 持续射击时射速从 30% 渐升到 100%，重火器手感 |
| **霰弹枪击退** | `WEAPONS.shotgun.knock` | 命中僵尸被向后微推，近战防守更稳 |
| **喷火器灼烧** | `WEAPONS.flamer.burn` + `zb.burnT` | 命中后 2s 持续掉血（DoT） |

> 修复点：空间分区碰撞初版存在「一颗子弹误伤多目标」的越桶 bug，已加 `if (b.dead) break` 修正。

---

## ✅ 已实施（2026-07-12，第二波改动）— 模块化拆分

把原 `src/main.js`（~1929 行）按职责拆成多个 ES 模块，游戏保持可运行。验证方式：
`vite build` 通过 + 无头冒烟测试（`test/` 脚手架）跑满 200 帧无运行时报错。

**实际落地结构（比原方案 2.1 更务实，避免引入事件总线/状态机这类大重构）：**

```
src/
├── main.js              # 入口：装配模块 + 渲染循环 animate()
├── config.js            # 纯数据/常量（武器表、僵尸类型、间距、难度曲线…）
├── core/context.js      # 共享单例：scene/state/squad/ui/实体数组/群渲染器/临时变量
├── world/environment.js # 道路/建筑/地块生成与回收（chunk 循环）
├── effects.js           # 爆点/血泊/兽颅/震地波/地刺 粒子系统
├── gates.js             # 门生成/碰撞/升级/武器门
├── pickups.js           # 道具箱生成与拾取
├── bullets.js           # 玩家子弹（对象池）/敌弹/闪电链
├── zombies.js           # 僵尸生成/移动/技能/空间分区碰撞
├── boss.js              # Boss 生成/技能/砸地预警
├── ui/hud.js            # 横幅/浮动文字/HUD 刷新
├── game.js              # 流程编排：startRun/onDefeat/updateRun/loseSoldiers
└── input.js             # 指针/键盘输入
```

**关键设计：**
- **共享上下文单例**（`core/context.js`）：跨模块共享的可变状态集中在此，各模块从它具名导入，函数体内仍用 `state/squad/scene` 原名，行为与原单文件一致。数组一律原地修改（`.length=0`/`push`/`splice`），绝不整体重赋值。
- **无头冒烟测试**（`test/`）：用假 `WebGLRenderer`（不依赖 GL 上下文）覆盖 three 的渲染器，mock `document/window/localStorage/requestAnimationFrame`，SSR 打包后在 Node 跑 200 帧。能抓出 `vite build` 抓不到的函数内 undefined 变量（如 `infectedSoldierParts`、`bloodPools` 未导入）。
- 拆分过程修复的真实 bug：`game.js` 的 `startRun` 引用 `bloodPools` 未从 context 导入；`config.js` 引用 `infectedSoldierParts` 未导入。

> 注：原方案 2.1/2.2 的 `GameState` 事件总线、`EventBus` 属于更重的重构，本次未做（性价比低、风险高）；当前共享单例已解决紧耦合问题。如后续要进一步解耦，再评估引入。

## ✅ 已实施（2026-07-12，第三波改动）— 角色选择与咕咕嘎嘎皮肤

开局菜单新增角色选择：默认「方块士兵」/ 新角色「咕咕嘎嘎（方块企鹅）」，选中的皮肤即时套用到士兵群渲染器。

**关键决策（中途修正）：** 第一版用腾讯混元图生 3D 生成了 11MB 带贴图 GLB，但用户指出该游戏士兵群本就是方块/球零件拼的（相机远看不清细节），重模型是负担且与美术风格不符。改为**直接用基础几何体拼方块企鹅**，风格统一、零下载、复用同一套 `CrowdRenderer` 零件管线。

**落地内容：**
- `crowd.js` 新增 `penguinParts()`：身体/头/翅 深蓝、肚皮/脸 白、嘴/脚 橙、眼 近黑，11 个零件，高约 1.15、脚在 y=0，与士兵同尺度。
- `game.js` 选择卡改为同步即时：`gugugagaParts = penguinParts()`；`startRun()` 用 `appliedSkin` 变量跟踪已应用皮肤，支持士兵↔企鹅来回切换（修掉了原先依赖 `activeSkin` 切不回士兵的 bug）。
- `character.js` 精简为只留 `swapSkin()`（去掉未用的 GLTFLoader/loadSkin/gltfToParts，冒烟包体 895KB→722KB）。
- AI 生成的 GLB/ZIP 移到 `test/_ai_backup/` 留底（备用，如将来给 Boss 做高清模型）；`public/` 仅保留 `sfx`。

**验证：** `vite build` 通过 + 无头冒烟 200 帧通过 + node 校验 `penguinParts()` 11 零件 geometry/material/position 全合法。


---

## 一、整体代码评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 玩法创意 | ★★★★☆ | 选门+Boss+僵尸类型的组合设计有深度 |
| 视觉效果 | ★★★★☆ | 大量粒子/光效/动态细节，氛围到位 |
| 代码结构 | ★★☆☆☆ | **全局单文件，紧耦合并发逻辑，难以维护** |
| 性能 | ★★★☆☆ | 实例化渲染做得不错，但缺少对象池和内存管控 |
| 可扩展性 | ★★☆☆☆ | 硬编码耦合严重，新增武器/敌人/道具需改多处 |

**最大问题：main.js 1929 行，所有系统混在一个文件。**

---

## 二、架构重构（优先级：🔴 最高）

### 2.1 模块化拆分

```
src/
├── main.js              # 入口：初始化 + 游戏主循环调度
├── core/
│   ├── GameState.js     # 状态管理（单例/事件驱动）
│   ├── Config.js        # 集中常量配置
│   └── EventBus.js      # 事件总线（解耦模块通信）
├── world/
│   ├── Environment.js   # 道路/建筑/环境生成
│   ├── GateSystem.js    # 门生成、碰撞、升级逻辑
│   └── PickupSystem.js  # 道具箱生成与拾取
├── entities/
│   ├── Squad.js         # 小队移动、编队、伤亡
│   ├── ZombieManager.js # 僵尸生成、AI、技能
│   ├── BossManager.js   # Boss 生成、技能模式
│   ├── BulletSystem.js  # 玩家子弹（含曳光弹/火箭/火球/闪电）
│   ├── EnemyBullet.js   # 敌方子弹
│   └── SkullSystem.js   # Boss 投掷物
├── weapons/
│   ├── WeaponConfig.js  # 武器表（数据驱动）
│   └── WeaponEffects.js # 每种武器的射击特效
├── effects/
│   ├── Particles.js     # 粒子/爆点/血泊管理
│   ├── SkullSystem.js   # 兽颅投掷物
│   ├── Shockwave.js     # Boss 震地波
│   ├── SpikeSystem.js   # Boss 地刺
│   └── ScreenFX.js      # 屏幕震动/闪白/全屏激光
├── audio/
│   ├── SoundManager.js  # 音效管理（SFX 封装）
│   └── BGM.js           # 程序化 BGM
├── ui/
│   ├── HUD.js           # 顶部状态栏/兵力/进度
│   ├── Overlay.js       # 菜单/结果面板
│   └── FloatingText.js  # 浮动文字
└── utils/
    ├── Math.js          # 数学工具函数
    └── ObjectPool.js    # 通用对象池
```

### 2.2 引入状态管理

当前所有状态散落在 `state` 对象中（line 1122-1147），应改为：

```js
// core/GameState.js — 事件驱动的状态机
class GameState {
  constructor() {
    this._state = {};
    this._listeners = {};
  }
  
  // 集中注册状态，变更时自动通知订阅者
  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    if (old !== value) this._emit(key, value, old);
  }
  
  get(key) { return this._state[key]; }
  on(key, fn) { /* ... */ }
  off(key, fn) { /* ... */ }
}
```

好处：模块间不用直接引用，通过 `gameState.on('shieldTime', (v) => shieldMesh.visible = v > 0)` 解耦。

---

## 三、游戏性改进（优先级：🟡 高）

### 3.1 添加局外成长系统（Meta-Progression）

当前只有 `localStorage` 记录最高分，缺少「每次死亡后有成长感」。

**建议**：引入「末日币」系统

```
击杀僵尸 → 获得末日币（击杀数 × 距离系数）
死亡后 → 结算界面展示获得的末日币
消耗末日币 → 永久升级：

| 升级项 | 效果 | 等级上限 | 每级花费 |
|--------|------|----------|----------|
| 🛡️ 初始兵力 | 起始人数 +2 | Lv.10 | 100 × Lv |
| 💪 火力强化 | 武器伤害 +5% | Lv.20 | 150 × Lv |
| 👟 急行军 | 移速 +3% | Lv.15 | 120 × Lv |
| 🩹 急救包 | 增援道具效果 +10% | Lv.10 | 130 × Lv |
| 🎯 狙击手 | Max Shooters +5 | Lv.10 | 200 × Lv |
```

数据存储扩展：
```js
localStorage.setItem('dg_save', JSON.stringify({
  best: 0,
  coins: 0,
  upgrades: { /* ... */ },
  unlockedWeapons: ['rifle'],
  stats: { totalKills: 0, totalRuns: 0, ... }
}));
```

### 3.2 武器解锁与选择

当前武器只能通过拾取武器门随机更换。建议在菜单界面增加武器选择：

> 开局只能选「步枪」，通过「末日币」永久解锁新武器（喷子 500、加特林 1000、火箭筒 1500...）

进入游戏时可在已解锁武器中选择一个作为初始武器。

### 3.3 增加环境多样性

当前场景始终是灰暗的城市街道。建议按距离切换主题：

| 距离 | 主题 | 视觉变化 |
|------|------|----------|
| 0-300m | 🌃 废弃街区 | 当前样式 |
| 300-600m | 🏭 工业废墟 | 管道/储罐/烟雾，暖色调 |
| 600-900m | 🌲 诅咒森林 | 枯树/藤蔓/雾气，暗绿色调 |
| 900-1200m | 🔥 地狱裂谷 | 岩浆/焦土/灰烬粒子，红黑色调 |
| 1200m+ | 🌀 虚空边缘 | 星空/浮岛/数据崩坏特效 |

实现方式：将 `spawnChunk()` 的设计参数化，根据距离切换建筑样式、地面纹理、光照颜色。

### 3.4 增加更多门类型

当前只有 4 种操作：`add / mul / div / weapon`

建议增加：

| 新门类型 | 效果 |
|----------|------|
| 🎲 赌门 | `?×n` — 随机 ×1~×n |
| ⚔️ 士兵强化门 | 接下来 10 秒内每人伤害 ×2 |
| 💣 地雷门 | 路过后在身后布设地雷，踩到的僵尸受伤 |
| 🌀 传送门 | 随机传送小队到道路左右位置 |
| 💰 金币门 | 直接获得末日币 ×n |

### 3.5 Boss 种类扩展

当前只有 1 种 Boss（绿色大块头）。建议增加 2-3 种：

| Boss | 外观 | 技能 |
|------|------|------|
| 🟢 巨兽（现有） | 绿色双足巨人 | 锤击/震地波/地刺/兽颅 |
| 🔵 冰霜领主 | 蓝色巨型骷髅 | 冰墙封路、暴风雪减速、冰刺 |
| 🟣 暗影编织者 | 紫色触手团 | 召唤小虫、触手横扫、吞噬僵尸回血 |
| 🟡 机械巨兵 | 锈铁机甲 | 激光扫射、导弹齐射、电磁脉冲 |

---

## 四、性能优化（优先级：🟡 高）

### 4.1 对象池系统

当前大量使用临时数组 + splice，频繁创建销毁对象。建议统一对象池：

```js
// utils/ObjectPool.js
class ObjectPool {
  constructor(createFn, resetFn, initialSize = 20) {
    this._pool = [];
    this._create = createFn;
    this._reset = resetFn;
    for (let i = 0; i < initialSize; i++) this._pool.push(createFn());
  }
  
  acquire() {
    const obj = this._pool.length > 0 
      ? this._pool.pop() 
      : this._create();
    return obj;
  }
  
  release(obj) {
    this._reset(obj);
    this._pool.push(obj);
  }
}
```

应用于：Bullets、Particles/Bursts、Skulls、Zombie data objects、FloatingText DOM elements

### 4.2 实例化渲染优化

当前每帧 `setMatrixAt` + `setColorAt` 并标记 `needsUpdate = true`，即使没有变化。建议：

```js
// 仅在数据变化时更新实例化矩阵
// 使用 dirty flag:
class DirtyInstancedMesh extends THREE.InstancedMesh {
  markDirty() { this._dirty = true; }
  render() {
    if (this._dirty) {
      this.instanceMatrix.needsUpdate = true;
      this._dirty = false;
    }
    super.render();
  }
}
```

### 4.3 几何体共享

当前每个 CrowdRenderer 创建独立的 InstancedMesh。不同僵尸类型可共享几何体的 `geometry`（同一份 geometry 配合不同 material）：

```js
// 所有标准僵尸共享几何体
const sharedZombieGeo = zombieParts(null); // 返回几何体数组
// 仅 material 不同（调色板由 material.color 控制，而非几何体）
```

### 4.4 requestAnimationFrame 节流

对于不需要每帧更新的 UI（HUD），降低刷新率：

```js
let hudAcc = 0;
function animate() {
  // ...
  hudAcc += dt;
  if (hudAcc >= 0.1) {  // 每 100ms 更新 HUD
    updateHud();
    hudAcc = 0;
  }
}
```

### 4.5 内存泄漏检查点

当前存在潜在泄漏：
- `spawnBurst` 中创建的 `THREE.Points` 在 `bursts` 数组 splice 后仍有 `geometry.dispose()`，但 `material` 未完全清理
- 建筑物生成时没有回收 `Canvas` 对象
- 浮动文字 DOM 元素 `setTimeout` 清理正常，但大量同时出现时可能堆积

建议：定期 `console.log(renderer.info.render.calls)` 监控 Draw Call 数量。

---

## 五、UI/UX 改进（优先级：🟢 中）

### 5.1 移动端适配优化

当前支持触摸拖动，但：
- 缺少虚拟摇杆/按钮（部分用户不习惯滑动）
- 未适配刘海屏/Safe Area

### 5.2 暂停菜单

添加 ESC 暂停，显示：继续 / 重启 / 音效开关 / 返回主菜单

### 5.3 伤害数字与击杀反馈

在屏幕右侧显示连杀提示（Double Kill / Multi Kill / Mega Kill），类似 CSOL 风格。

### 5.4 小地图

右下角小地图显示：道路 / 前方门位置 / Boss 位置 / 道具位置（提前预览有策略意义）。

### 5.5 教学关卡

首次游戏时引导：
1. 左右移动避开红门
2. 射击负数门让它变正
3. 射击武器门降低倒计数
4. 拾取道具

---

## 六、音效改进（优先级：🟢 中）

### 6.1 空间化音频

当前所有音效无空间定位。Three.js 支持 `PositionalAudio`：

```js
// 为枪声/爆炸/僵尸吼叫添加空间定位
const listener = new THREE.AudioListener();
camera.add(listener);
// 僵尸的吼叫随距离衰减+左右声道
```

### 6.2 BGM 动态强度

根据当前状态调整 BGM 节奏/乐器密度：

| 状态 | BGM 变化 |
|------|----------|
| 正常跑路 | 基础节奏（当前） |
| Boss 登场 | 加入失真吉他/加速 |
| 兵力 < 5 人 | 增加紧张弦乐 |
| 冰冻道具中 | 加入冰晶音色 |

### 6.3 更多采样音效

当前只有一个 `juice-splash.wav` 采样，其余全合成。建议添加少量高质感采样：
- 低血量心跳声
- Boss 登场警报
- 胜利号角

---

## 七、技术债清理（优先级：🟢 中）

### 7.1 类型安全

考虑迁移到 TypeScript，至少为核心模块添加 JSDoc 类型注解：

```js
/**
 * @typedef {{ x: number, z: number, hp: number, maxHp: number, type: string }} Zombie
 * @typedef {{ x: number, z: number, op: string, value: number }} Gate
 */
```

### 7.2 常量化魔法数字

当前代码中有大量硬编码数值（如 `zSpeed = 3.4 + diff * 0.55`、`bossR = 2.2 * boss.mesh.scale.x`），应移到 `Config.js`。

### 7.3 工具函数提取

重复使用但散落的辅助逻辑：
- `THREE.MathUtils.clamp()` 已有，但 `randomBetween()`、`projectToScreen()` 等可封装
- `_dummy.updateMatrix()` 模式在 crowd.js 和 main.js 中重复

### 7.4 构建系统

考虑：
- 使用 `terser` 或 `esbuild` 压缩生产构建
- 添加 ESLint + Prettier 规范代码风格
- 添加 pre-commit hooks

---

## 八、改进优先级矩阵

| 改进项 | 工作量 | 收益 | 优先级 |
|--------|--------|------|--------|
| 代码模块化拆分 | ⭐⭐⭐⭐ 大 | ⭐⭐⭐⭐⭐ 极高 | 🔴 最优先（否则后续改动寸步难行） |
| 局外成长系统 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐⭐ 极高 | 🟡 高（最影响留存率） |
| 环境主题多样性 | ⭐⭐⭐ 中 | ⭐⭐⭐⭐ 高 | 🟡 高（视觉疲劳问题） |
| 对象池优化 | ⭐⭐ 小 | ⭐⭐⭐ 中 | 🟡 高（手机端卡顿） |
| 更多 Boss/门类型 | ⭐⭐ 小 | ⭐⭐⭐⭐ 高 | 🟢 中（锦上添花） |
| UI/UX 优化 | ⭐⭐⭐ 中 | ⭐⭐⭐ 中 | 🟢 中 |
| BGM 动态强度 | ⭐⭐ 小 | ⭐⭐ 中 | 🟢 中 |
| TypeScript 迁移 | ⭐⭐⭐⭐ 大 | ⭐⭐⭐ 中 | 🔵 低（可渐进） |

---

## 九、建议执行顺序

1. **Phase 1 — 地基**（1-2 天）：模块化拆分 + 状态管理 + 配置集中
2. **Phase 2 — 留存**（2-3 天）：局外成长系统 + 武器解锁 + 成就/统计
3. **Phase 3 — 体验**（2-3 天）：环境多样性 + 新 Boss/门 + UI 优化
4. **Phase 4 — 打磨**（1-2 天）：性能优化 + 移动适配 + 音效增强

---

## 十、总结

这个游戏已经有了非常扎实的核心玩法——选门 + 射击 + Boss 战的组合在同类跑酷游戏中独树一帜。目前最大的瓶颈不是游戏性，而是**代码的可维护性和可扩展性**。一旦完成模块化拆分，后续的功能迭代会变得非常顺畅。

最值得优先投入的两个方向：
1. **代码重构** — 让项目可持续发展
2. **局外成长** — 让玩家有"再来一局"的动力
