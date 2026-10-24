# 项目交接速查

> 开新对话时先让我看这个文件，就能立刻接上进度，不用翻聊天记录。

## 这是什么

`/root/search` —— 纯静态聚合搜索导航页，托管在 GitHub Pages。
仓库 `git@github.com:Karune-SHI-E/search.git`，分支 `master`。
技术栈：HTML + CSS + 原生 JS，**无构建、无框架、无后端**。

## 本地预览

```bash
cd /root/search && nohup python3 -m http.server 8080 --bind 0.0.0.0 >/tmp/preview.log 2>&1 &
```

- 地址 `http://127.0.0.1:8080/` 或 `http://192.168.1.234:8080/`
- 停止 `pkill -f "http.server 8080"`
- 服务器直接读磁盘，改完文件**不用重启**，浏览器 `Ctrl+Shift+R` 硬刷新即可
- 环境：Android + proot Ubuntu，无 pip / 无浏览器 / 无 PIL

## 文件结构

```
index.html          首页（约 10KB）
status.html         站点状态页（死链报告，游客可看）
css/bizhi.css       背景、字体、右侧收纳面板
css/sousuo.css      搜索框、页脚
css/status.css      状态页样式
css/anim.css        全部动效（想全关就删 index.html 里的引用）
js/sites.js         站点数据（唯一要改的地方，23 分类 / 413 站）
js/panel.js         面板渲染、过滤、编辑、折叠
js/recent.js        最近访问（面板内，localStorage）
js/clock.js         时间 / 日期 / 翻牌时钟
js/fun.js           随机站点、打字机、彩蛋、壁纸视差
js/status.js        状态页渲染
js/link-status.js   检测结果数据（Actions 生成提交，勿手改）
js/xd.js            面板开关、快捷键
js/sousuo.js        搜索源切换 / 提交
js/duration.js      页脚运行时间
tools/check-links.py  死链检测（纯标准库）
tools/subset-font.py  字体子集化
ziti/font.woff2     子集化字体（约 656KB / 4070 字形）
```

## 加站点

改 `js/sites.js`，一行一个：

```js
{ cat: 'Ai', emoji: '✨', sites: [
    ['OpenAi', 'https://chat.openai.com/'],
] },
```

页面上的「编辑」只能存本机（localStorage 草稿），不改这个文件。
加了生僻字要重建字体（否则掉到系统字体）：

```bash
PYTHONPATH=/tmp/ft_env python3 tools/subset-font.py /root/ziti-font-FULL-4.6M.woff2 ziti/font.woff2
```

## 死链检测

```bash
python3 tools/check-links.py --limit 20          # 抽查
python3 tools/check-links.py                     # 全量（约 4 分钟）
python3 tools/check-links.py --json js/link-status.js --report link-report.md
```

结果分四类，**超时不算死链**（避免误删）：

| 结论 | 判定 |
|---|---|
| 正常 | 2xx |
| 受限 | 401 / 403 / 429，站点还活着 |
| 死链 | 404 / 410 / 5xx / DNS 失败 |
| 可疑 | 超时、连接失败，多为网络问题 |

`.github/workflows/check-links.yml` 每周一自动跑，结果 commit 回仓库，`status.html` 自动变新。

## 关键设计约束（别踩）

- `#search` 是 `top:40%` + `translate(-50%,-50%)` 居中，**不要给它加 transform 动画**，否则会位移；要动就动子元素
- `.site-footer` 是 `pointer-events:none`，里面要能点的元素必须显式 `pointer-events:auto`
- 面板折叠用 `max-height` + `--links-h`（`panel.js` 量出来的真实高度），不是 `display:none`，否则没法做过渡
- 数据用 `.js` 文件挂 `window.XXX`，不用 `.json` + fetch —— 这样 `file://` 也能跑，且被字体脚本扫描到
- 字体只保留 ASCII + GB2312 一级 + 站内用字，emoji 故意不含（走系统字体）

## 修改习惯

- 用户改得快、会要求回滚 → 功能按模块拆开，每个功能归属一个明确的文件/一段样式，方便单独删掉
- 回滚时废弃的 JS 文件要**从磁盘删掉**，不要只断开引用
- 不喜欢的样式：黑色不透明横条、白色方块占位图标、胶囊式（pill）内联标签

## 待办 / 可继续的方向

- 164 条「可疑」是当前网络访问受限导致的（OpenAI、Google 系超时），Actions 跑会更准
- 可考虑：状态页在首页显示一个「N 个死链」提示徽标
- 仓库尚未 commit / push
