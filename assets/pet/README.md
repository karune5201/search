# 桌宠素材

蓝色大肥鱼桌宠，来自开源项目 **dsh-pet**（MIT）：

- 上游仓库：https://github.com/PC2005-cloud/dsh-pet
- 桌面移植：https://github.com/MerZlin/dsh-pet-indesktop
- 素材路径：`dsh-pet/assets/webm/`
- 许可：MIT（见仓库 LICENSE）

### 基础片段（首屏/待机必需，点开看板娘后按需预取）

| 文件 | 对应上游动画 | 用途 |
|---|---|---|
| `idle.webm` | 待机呼吸休闲 | 待机循环 |
| `look.webm` | 东张西望 | 随机张望 |
| `walk.webm` | 原地漂浮踏步 | 走动（容器平移） |
| `drag.webm` | 被鼠标拖拽悬空反馈 | 拖拽中 / 甩出飞行 |
| `click1-5.webm` | 点击回应 ×5 | 点击与连点反应 |

### 长按菜单里的动作片（点了才下载，不预取）

| 文件 | 对应上游动画 | 菜单文案 |
|---|---|---|
| `crab.webm` | 螃蟹走路 | 螃蟹走 |
| `run.webm` | 原地左转奔跑 | 原地奔跑 |
| `lion.webm` | 舞狮头 | 舞狮子头 |
| `spin.webm` | 小幅度原地 360 度旋转展示 | 转一圈 |
| `sleep.webm` | 原地小憩沉眠 | 睡一觉 |
| `stretch.webm` | 超大伸懒腰 | 伸个懒腰 |
| `bubble.webm` | 鲸鱼吐泡泡特效 | 吐泡泡 |
| `whale.webm` | 蓝鲸现世 | 变鲸鱼 |
| `dance.webm` | 轻快摇摆舞 | 跳个舞 |
| `startle.webm` | 被吓一跳 | 吓一跳 |
| `cat.webm` | 撸猫 | 撸猫 |
| `code.webm` | 写代码 | 写代码 |

均为 VP9 **yuva420p**（带透明通道）、640×360、10 秒、24fps。

- 前 9 个（基础片段）约 3.3MB，**默认一个都不加载**，点左侧「看板娘」开关才开始下载；动作片再按需单独拉。
- iOS Safari 不支持透明 VP9，脚本会在 iOS 上跳过桌宠。
- 如上游素材有更新，重新下载覆盖同名文件即可，播放逻辑无需改动；新增动作要同时改 `js/pet.js` 的 `ACTS` 和 `js/pet-lines.js` 的 `menu`。
