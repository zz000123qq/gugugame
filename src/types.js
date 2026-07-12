// ============================================================ 共享类型定义（JSDoc @typedef）
// 启用 jsconfig.json 的 checkJs 后，编辑器 / tsc 可据此做类型检查，
// 而无需把任何文件改名 .ts（保持纯 JS，零运行期风险）。

/**
 * @typedef {import('three').BufferGeometry} BufferGeometry
 * @typedef {import('three').Material} Material
 * @typedef {import('three').Scene} Scene
 * @typedef {import('three').Object3D} Object3D
 */

/**
 * 一个渲染零件：几何体 + 材质 + 相对模型的局部位置/旋转。
 * CrowdRenderer 把每个 part 变成一个 InstancedMesh。
 * @typedef {Object} SkinPart
 * @property {BufferGeometry} geometry
 * @property {Material} material
 * @property {[number, number, number]} position
 * @property {[number, number, number]} [rotation]
 */

/** 零件数组（一个皮肤 / 一类敌人全套零件） @typedef {SkinPart[]} Parts */

/**
 * 群体里的一只个体（士兵 / 僵尸）。世界坐标位置，渲染时整体套用零件。
 * @typedef {Object} Agent
 * @property {number} x
 * @property {number} z
 * @property {number} [y]
 * @property {number} [rotY]
 * @property {number} phase
 * @property {number} [scale]
 */

/**
 * 全局游戏状态（core/context.js 的 state）。
 * @typedef {Object} GameState
 * @property {'menu'|'run'|'result'} phase
 * @property {number} dist
 * @property {number} best
 * @property {number} count
 * @property {number} maxCount
 * @property {number} kills
 * @property {string} weapon
 * @property {number} fireAcc
 * @property {number} fireIndex
 * @property {number} rageTime
 * @property {number} shieldTime
 * @property {number} freezeTime
 * @property {number|null} laserZ
 * @property {number} laserZ0
 * @property {number} shake
 * @property {number} nextGateZ
 * @property {number} nextPickupZ
 * @property {number} nextWaveZ
 * @property {number} nextBossAt
 * @property {number} lastBossAt
 * @property {number} trickleTimer
 * @property {number} pullX
 * @property {number} pullTime
 * @property {number} graceTime
 * @property {number} spinTime
 * @property {'soldier'|'gugugaga'} characterSkin
 * @property {number} powerMult
 * @property {number} medkitMult
 * @property {number} powerBuffTime
 * @property {number} bonusCoins
 * @property {number} killStreak
 * @property {number} _prevKills
 * @property {number} _lastKillAt
 * @property {number} _lastStreakBanner
 * @property {'camera'|'forward'} penguinFacing
 */

/**
 * 升级定义（progression.js UPGRADES 的项）。
 * @typedef {Object} UpgradeDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {(lvl:number)=>number} cost
 * @property {number} max
 * @property {(lvl:number)=>number} effect
 */

/**
 * 武器商店定义（progression.js WEAPON_SHOP 的项）。
 * @typedef {Object} WeaponDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {number} cost
 * @property {string} type
 */

/**
 * 一局结算的返回。
 * @typedef {Object} SettleResult
 * @property {number} earned
 * @property {number} total
 * @property {boolean} isRecord
 */

/**
 * 局外成长效果快照（getEffects 返回）。
 * @typedef {Object} EffectsResult
 * @property {number} force
 * @property {number} power
 * @property {number} speed
 * @property {number} medkit
 * @property {number} greed
 */
