# 末日之门 · SBGame

<div align="center">

**Three.js 无尽跑酷射击 · Last War 风格选门 + 僵尸潮 + Boss 战**

[🎮 在线试玩](https://zz000123qq.github.io/gugugame/)

</div>

末日降临，你带着一小队幸存者沿公路亡命奔逃。前方每隔一段就会出现两扇门，
门后可能是增援、火力强化、金币，也可能是地雷和陷阱——选错了，小队就少几个人。
一路清掉涌来的僵尸潮，撑过 Boss 的砸地猛攻，跑得越远，末日币越多。

---

## ✨ 玩法一览

| 系统 | 说明 |
| --- | --- |
| **选门** | 左右拖动队伍穿过门。普通门（兵力/火力/急行军）+ 特殊门：赌门、强化门、地雷门、传送门、金币门。 |
| **自动射击** | 队伍自动开火清理两侧僵尸潮，你只需专心走位选门。 |
| **Boss 战** | 每约 700m 出现 Boss（腐肉巨尸 / 冰霜领主 / 机械巨兵），蓄力时地面出现红圈预警，可横向闪避。 |
| **角色皮肤** | 默认「士兵」；可选「咕咕嘎嘎」企鹅娘，带 AI 合成情绪人声（咕咕嘎嘎～）。 |
| **局外成长** | 用末日币在「兵工厂」永久升级（初始兵力 / 火力 / 移速 / 战地急救 / 生财有道）并解锁 6 种武器，下局生效。 |
| **环境主题** | 5 种末日场景（街区 / 工业区 / 枯林 / 熔岩 / 虚空）每 360m 自动切换，天空与光照平滑过渡。 |
| **连杀系统** | 短时间内连续击杀触发连杀横幅（Double → Godlike），越猛越爽。 |
| **暂停 / 移动端** | ESC 或右上角 ⏸ 暂停；手机端有左下虚拟摇杆，自适应安全区。 |

---

## 🎮 操作方式

**桌面端**
- **移动队伍**：鼠标按住左右拖动（或 `←` `→` 方向键）
- **射击**：自动进行，无需操作
- **暂停 / 继续**：`ESC` 或右上角 ⏸ 按钮
- **返回主菜单**：暂停面板内点击「主菜单」

**移动端**
- 左下角出现**虚拟摇杆**，左右拖动控制队伍
- 右上角 ⏸ 暂停

---

## 🚀 本地运行

环境要求：**Node.js 22+**

```bash
npm install      # 安装依赖（three + vite）
npm run dev      # 启动开发服务器
```

启动后打开浏览器访问：

```
http://localhost:5173/SBGame/
```

构建生产版本（输出到 `dist/`）：

```bash
npm run build
npm run preview   # 本地预览构建结果
```

---

## 🌐 在线试玩（GitHub Pages）

本项目已配置 GitHub Pages 自动部署。每次向 `main` 分支推送，GitHub Actions 会自动：

1. `npm install` 安装依赖
2. `npm run build -- --base=/gugugame/` 构建（base 指向仓库子路径）
3. 发布到 GitHub Pages

部署完成后，任何人都能直接打开下面的地址游玩，无需下载或安装：

👉 **https://zz000123qq.github.io/gugugame/**

> 首次开启 Pages：仓库 **Settings → Pages → Build and deployment → Source 选择 "GitHub Actions"** 即可。
> 推送后约 1–2 分钟生效，状态可在仓库 **Actions** 标签页查看。

---

## 🛠 技术栈

- **[Three.js](https://threejs.org/)**（v0.185）—— 3D 渲染
- **[Vite](https://vitejs.dev/)**（v8）—— 开发服务器与构建
- **Web Audio API** —— 全合成音效；角色人声由 `edge-tts` 离线生成 MP3 后载入
- 纯前端、无后端、无构建后运行时依赖

---

## 📁 目录结构

```
SBGame/
├── index.html              # 入口页面（HUD / 商店 / 暂停面板 / 摇杆 DOM）
├── src/
│   ├── main.js             # 主循环、场景装配、分块更新
│   ├── config.js           # 全局参数与僵尸/Boss 配置
│   ├── core/context.js     # 共享单例（state / scene / 实体数组）
│   ├── world/environment.js# 5 套环境主题与切换
│   ├── crowd.js            # 僵尸群体（InstancedMesh 零件组）
│   ├── boss.js             # 3 种 Boss 模型与行为
│   ├── gates.js            # 选门逻辑与 5 种特殊门
│   ├── progression.js      # 局外成长 / 兵工厂数据
│   ├── ui/                 # hud.js / shop.js
│   └── audio.js            # 合成音效 + 角色人声
├── public/                 # 静态资源（模型 gugugaga.glb、音效 sfx/）
└── .github/workflows/      # GitHub Pages 自动部署
```

---

<div align="center">

带着你的小队，跑得越远越好。🧟💥

</div>
