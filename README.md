# 简单搜索

简单搜索 - 简约舒爽的搜索体验 ~原项目已两年没更新~

根据上游版本改造的html版本，可Fork后修改信息使用

演示：[https://karune5201.github.io/search/]
演示：[https://search-3re.pages.dev/]

---

###  图片

PC

![简单搜索](https://ae01.alicdn.com/kf/Ua5c25565e61f41aab15663c01264dbf68.jpg)
![简单搜索](https://ae01.alicdn.com/kf/Uef5e9429ac6249e4a07f39a5e278fe836.jpg)


Wap
![简单搜索](https://ae01.alicdn.com/kf/U611698f4247d4701b47b88ac405064681.jpg)



## 演示    
  

搜索栏取自 [SEOGO的钛导航](https://www.seogo.me/)

菜单栏取自 [简单搜索](https://github.com/5iux/sou)  


## 十分感谢三位作者，谢谢！

---

## 本地预览

纯静态站点，不需要构建，任选一种方式起个本地服务即可（直接双击 `index.html` 也能看，但部分浏览器对本地文件的外部资源加载有限制）：

```bash
# Python（任意一台装了 python3 的机器）
python3 -m http.server 8080

# 或者 Node
npx serve .
```

然后打开 <http://127.0.0.1:8080/>。

## 目录说明

```
index.html          # 页面主文件：搜索区 + 右侧站点收纳面板
favicon.svg         # 站点图标（0.5KB，优先使用）
favicon.ico         # 旧浏览器回退用（注意：体积偏大，见 CHANGELOG）
css/bizhi.css       # 背景、字体、右侧收纳面板
css/sousuo.css      # 搜索框、搜索类型、页脚
css/anim.css        # 入场、折叠与互动过渡动画
css/ipinfo.css      # 页脚 IP / 归属地胶囊样式
css/weather.css     # 左上角天气挂件样式
css/responsive.css  # 响应式适配：电脑 / 平板 / 手机、刘海屏安全区、矮屏
source/css/custom.css  # 自定义鼠标指针（可选）
js/xd.js            # 收纳面板开关、遮罩、快捷键（原生 JS）
js/panel.js         # 面板增强：搜索过滤、最近访问
js/clock.js         # 主界面：时间 / 日期 / 翻牌时钟
js/fun.js           # 随机站点、一言打字机提示、方向键彩蛋、壁纸视差
js/recent.js        # 最近访问（面板分区，本地记录）
js/sousuo.js        # 搜索源切换 / 提交逻辑
js/duration.js      # 页脚运行时间
js/ipinfo.js        # 页脚访客 IPv4 + IPv6 / 国内海外 / 中文归属地
js/visits.js        # 页脚游客访问量（abacus 计数）
js/wallpaper.js     # 随机壁纸（每次刷新都换，带缓存穿透）
js/weather.js       # 左上角天气（按 IP 定位）
js/yyss.js          # 已停用：依赖 PHP 后端 api.php
js/lianxiang.js     # 已停用：依赖失效的百度联想接口
ziti/font.woff2     # 自定义字体（已子集化：656KB / 4065 字形）
CHANGELOG.md        # 本次修复与优化清单
tools/subset-font.py   # 字体子集化脚本（改文案后重建字体用）
tools/check-links.py   # 死链检测（纯标准库，可本地跑或由 Actions 定时跑）
tools/check-responsive.py  # 各视口断点取值核对（打印生效的宽度/字号，查重叠）
status.html          # 站点状态页（游客可看的死链报告）
css/status.css       # 站点状态页样式
js/link-status.js    # 检测结果数据（Actions 自动生成并提交）
js/status.js         # 站点状态页渲染
tools/make-icons.py    # 站点图标生成器（纯标准库，输出 favicon/PWA 图标）
manifest.webmanifest   # PWA 配置
data/hitokoto.json     # 本地一言句库（5082 条精简版，约 470KB，gzip 后约 210KB）
data/raw/              # 一言原始数据包存放处（已在 .gitignore 中，不会上传）
tools/build-hitokoto.py  # 把原始数据包压成 data/hitokoto.json
```

> 具体的修复项、美化项和待优化建议见 [CHANGELOG.md](CHANGELOG.md)。

## 添加 / 管理站点

站点数据全部在 `js/sites.js`，**不需要改 HTML**：

```js
window.SITE_DATA = [
    { cat: 'Ai', emoji: '✨', sites: [
        ['OpenAi', 'https://chat.openai.com/'],   // ← 加一行就是一个站点
    ] },
];
```

也可以用页面上更省事的办法：面板 → 右上「编辑」→ 添加/删除（**改动只存在本设备**，要永久生效请改 `js/sites.js`）。

新增或修改站点后，如果出现了字体里没有的生僻字，跑一次 `tools/subset-font.py` 重建字体即可（脚本会自动扫描 `js/*.js`）。

## 页脚 IP / 访问量 与 左上角天气

页脚从上到下三行：

1. **访客 IP**（在「本站已运行」上一行）：`IPv4 1.2.3.4  IPv6 2408:826a:…:c647  [国内] · 中国 · 贵州 · 贵阳`
   - IPv4：`v4.ident.me`（强制 IPv4，附带坐标），失败回退 `api.ip.sb`
   - IPv6：`v6.ident.me`；设备没有 IPv6 出口时这一段自动隐藏（不会显示空白或报错）
   - 中文地名：`ip.zxinc.org`（国内外都返回中文），失败则用内置国家对照表兜底
   - 每次刷新页面都会重新查询，换网络/换 IP 后立刻能看到新结果；`localStorage` 只作为请求失败时的兜底
   - 悬停可看完整 IP、运营商；点一下复制 IP 并刷新
2. **游客访问量**：`abacus.jasoncameron.dev` 计数，同一会话只 +1，刷新不重复累加
   - 换站点请改 `js/visits.js` 顶部的 `NS`（命名空间，用你自己的名字）
3. **本站已运行**：原有运行天数/时分秒

左上角**天气**：按 IP 定位的城市显示图标 + 温度 + 描述（`api.open-meteo.com`，免 key），缓存 30 分钟；IP 拿不到坐标时自动隐藏。想固定城市，改 `js/weather.js` 里 `geo:ready` 监听直接传固定坐标即可。

## 响应式适配

`css/responsive.css` 放在所有样式表最后，只做布局自适应，不改原有视觉风格。分档如下：

| 场景 | 断点 | 主要调整 |
|---|---|---|
| 大屏电脑 | ≥1440px | 面板 440px、搜索框 760px、时钟 52px |
| 笔记本 / 台式 | 1024–1439px | 沿用原始尺寸（面板 400px / 搜索 717px） |
| 平板 | 768–1023px | 面板收窄到 360px、搜索 620px、时钟 38px |
| 手机 | ≤767px | 搜索 90% 宽、时钟 32px、内边距收窄 |
| 小屏手机 | ≤380px | 面板 280px、时钟 30px、字号整体下调 |
| 矮屏 / 手机横屏 | 高度 ≤620px | 时钟缩小、问候区贴近、搜索框下移、页脚行高压缩 |
| 极矮屏 | 高度 ≤460px | 字体与行高进一步压缩、面板 320px（**不隐藏任何内容**） |
| 触屏 | `pointer: coarse` | 可点区域一律 ≥36px；搜索组下拉改成点一下展开 |

另外处理了几个实际问题：

- **刘海屏 / 圆角屏**：`viewport-fit=cover` + `env(safe-area-inset-*)`，菜单、天气、页脚、面板都不会压到安全区
- **iOS 聚焦放大**：输入框字号统一兜到 16px，点搜索框不再把页面放大
- **移动端地址栏收放**：支持时用 `100dvh`，避免高度跳变
- **打印**：隐藏背景、挂件与面板，只留正文

想核对某个尺寸下实际生效的值，直接跑：

```bash
python3 tools/check-responsive.py
```

会打印 14 种视口的面板宽度、搜索框宽度、顶部位置、字号，并估算页脚是否压住搜索框。

## 随机壁纸

壁纸原先写在 CSS 里（固定 URL），浏览器缓存后每次刷新都是同一张。现在交给 `js/wallpaper.js`：

**手机和电脑用不同接口**，各取各的尺寸比例：

| 设备 | 主力接口 | 返回尺寸 | 备用源 |
|---|---|---|---|
| 电脑 / 宽屏平板 | `t.alcy.cc/pc` | 2559×1439 横屏 | `dmoe.cc` → `loliapi.com/bg` |
| 手机 | `t.alcy.cc/mp` | 1080×1749 竖屏 | `loliapi.com/bg` → `dmoe.cc` |

- 判定规则：宽度 ≤768px 算手机；另外触屏且高度 ≤500px 也算手机（覆盖手机横屏时宽度超过 768 的情况）
- 地址后加时间戳，**每次刷新都是新图**；先预加载，成功才替换背景
- 失败自动换下一个源，全部失败保留 CSS 渐变兜底，不会白屏
- `background-image` 里始终保留渐变作为第二层

想换成自己的图源或固定某张图：改 `js/wallpaper.js` 里的 `SOURCES.desktop` / `SOURCES.mobile` 数组即可（第一项是主力接口），固定图就把数组换成一个地址并去掉 `cacheBust`。

## 搜索框一言提示

搜索框里的打字机文字来自「一言」，本地库和联网接口混用：

- **本地库** `data/hitokoto.json`：默认 5082 条，页面空闲时才加载，加载后存进 `localStorage`，不会每次都下载
- **联网接口** `v1.hitokoto.cn`：约三成句子来自这里，让内容保持新鲜；被墙或断网会自动跳过
- **兜底**：两者都不可用时用 `js/fun.js` 里的 6 句内置句子

换成自己的句子包：

```bash
# 把一言原始数据包丢进 data/raw/，然后重新生成
python3 tools/build-hitokoto.py
```

也支持直接喂自定义 JSON（纯字符串数组、`{"text","source"}` 数组都行）：

```bash
python3 tools/build-hitokoto.py 我的句子.json -o data/hitokoto.json
```

调节混用比例、打字速度、句子长度上限，改 `js/fun.js` 顶部的 `MIX_REMOTE_RATE` / `SPEED_TYPE` / `QUOTE_MAX_CHARS` 即可；想纯本地就把 `QUOTE_API` 置空字符串。

## 死链检测

站点会失效，定期查一次比手动点省事：

```bash
python3 tools/check-links.py                  # 全量
python3 tools/check-links.py --limit 20       # 先抽查
python3 tools/check-links.py --report r.md    # 输出 markdown 报告
```

结果分四类：**正常 / 受限（403、429 等，站点还活着）/ 死链（404、410、5xx、DNS 失败）/ 可疑（超时，多为网络问题）**。超时不会被当成死链，避免误删还能用的站点。

仓库里的 `.github/workflows/check-links.yml` 会每周一自动跑一次，也可以在 Actions 页面点「Run workflow」手动触发，报告直接写进 Job Summary。

## 站点状态页

`status.html` 是给游客看的死链报告，不需要后端：

- 统计卡：死链 / 可疑 / 受限 / 正常
- 按分类列出全部站点及检测结果，标出原因（200、404、403、超时…）
- 可按状态筛选（含「正常」），`status.html#dead` 这样能直接分享某一类

页面数据来自 `js/link-status.js`，由 Actions 每周自动检测后提交回仓库，所以内容会自己更新。想手动刷新：

```bash
python3 tools/check-links.py --json js/link-status.js --report link-report.md
```

## 桌宠（看板娘 · 大肥鱼）

左侧边缘那只蓝色大肥鱼，素材来自开源项目 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT），
桌面移植版 [dsh-pet-indesktop](https://github.com/MerZlin/dsh-pet-indesktop)。

**默认不加载**：页面上只有屏幕左边一条橙色的「小肥鱼」小把手，点它才会开始下载视频、把鱼放出来。
交互照 [live2d-widget](https://github.com/stevenjoezhang/live2d-widget) 的看板娘做的：

- 外观：和原版 `#waifu-toggle` 一模一样——橙底白字的竖排小把手，上面就「小肥鱼」三个字
  （`#fa0` 底、12px 白字、60px 宽、圆角 5px、`bottom: 66px`、`margin-left` 1s 过渡）
- 手感：把手平时只从左边露一条（-50px 露 10px），鼠标移上去（或键盘 Tab 聚焦）滑到 -30px
- 入场：鱼从屏幕左外侧滑进来；收起时先滑出去，滑完再把视频层卸掉，内存还给浏览器
- 收纳：鱼出来之后把手自己缩回屏幕外，鱼旁边出现两个 hover 才显形的小圆按钮，
  `…` 开动作菜单、`×` 收起；触屏没有 hover，这两个按钮常显半透明
- 记忆：开关状态记在 `localStorage` 的 `dsh-pet-on`，下次进来按上次的选择走
  （清掉这条就是回到默认的关闭）

- 代码：`js/pet.js` + `css/pet.css`
- 台词：`js/pet-lines.js`（**所有说的话都在这里**，改文案只动这一个文件）
- 素材：`assets/pet/`（21 个带透明通道的 webm，基础 9 个约 3.3MB + 动作片 12 个约 5.6MB，见该目录 README）

能干什么：

| 场景 | 反应 |
|---|---|
| 打开页面 / 早上·中午·晚上·深夜 | 冒气泡打招呼，时段不同话不同，换时段还会补一句 |
| 自己待着 | 东张西望、溜达、自言自语（约半分钟到一分半一句） |
| 点一下 | 随机回应 + 一句台词 |
| 短时间内连点 | 分三级：别戳了 → 再戳就咬你 → 我要装死了，鱼会抖 |
| 拖着走 | 说「放我下来」之类 |
| 快速甩出去 | 松手后带惯性继续滑，撞屏幕边缘会弹，落地再抱怨一句 |
| 三分钟没人理 | 一句比一句委屈，最多四级 |
| **长按**（约半秒） | 弹出分组动作菜单（见下） |

长按菜单一共 18 项，分四组：

- **说话**：说句话、打个招呼（按当前时段）
- **小动作**：东张西望、溜达一圈、转一圈、甩甩水、螃蟹走、原地奔跑、舞狮子头
- **玩一会儿**：跳个舞、伸个懒腰、睡一觉、吓一跳、吐泡泡、变鲸鱼、撸猫、写代码
- **其他**：安静 5 分钟 / 恢复说话（安静时不自言自语也不发牢骚）

键盘也能用：菜单打开后 ↑↓ 选、Enter 确认、Esc 关掉；点空白处也会关。
桌面端除了长按，也可以点鱼旁边的 `…` 开菜单、`×` 收起。

其他：

- 加载：**默认零流量**。点开看板娘后先下待机片 431KB，其余基础片段在空闲时（4 秒后）后台预取，
  动作片点哪个下哪个；`saveData` 或 2G 网络下不预取
- 不闪白：每个片段各占一个 `<video>` 层，新片缓冲出画面才切换显示（旧画面撑到那一刻），
  所以连点、甩出不会出现白框或闪烁
- 无障碍：系统开启「减少动态效果」时只保留待机，不再自己走动、不甩出惯性；桌宠整体 `aria-hidden`，不会被读屏打断
- 兼容：iOS Safari 不支持透明 VP9，脚本会检测到 iOS 后**不加载桌宠**；Android 长按会有一次轻微震动
- 台词用字控制在 GB2312 一级常用字内，否则会掉到系统字体（字体子集的规则见 `tools/subset-font.py`）
- 想换姿势/加动作：把同名 webm 丢进 `assets/pet/` 覆盖即可，`js/pet.js` 顶部的 `CLIPS`（基础片段）
  或 `ACTS`（菜单动作片）里登记新文件名；再加一行台词组和菜单文案到 `js/pet-lines.js`
- 加了新汉字记得重建字体子集，否则那几个字会掉到系统字体：
  `PYTHONPATH=/tmp/ft_env python3 tools/subset-font.py /root/ziti-font-FULL-4.6M.woff2 ziti/font.woff2`
