/* =========================================================
   桌宠：蓝色大肥鱼（dsh-pet 素材，MIT）
   - 待机 / 东张西望 / 走动 / 单击回应 / 连点 / 拖拽 / 甩出
   - 台词气泡：时段问候、自言自语、久没人理、被戳被扔
   - 长按鱼身 → 动作菜单（说句话、打个招呼、转个身…）
   - 台词文案在 js/pet-lines.js，素材说明见 assets/pet/README.md
   ========================================================= */
(function () {
    var root = document.getElementById('pet');
    if (!root) return;

    var video = root.querySelector('video');
    if (!video) return;

    // iOS Safari 不支持透明 VP9（yuva420p），会显示黑底，直接不上桌宠
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        root.parentNode && root.parentNode.removeChild(root);
        return;
    }

    var LINES = window.PET_LINES || {};
    var LABEL = LINES.menu || {};
    var BASE = 'assets/pet/';
    var CLIPS = {
        idle: BASE + 'idle.webm',
        look: BASE + 'look.webm',
        walk: BASE + 'walk.webm',
        drag: BASE + 'drag.webm',
        click: [
            BASE + 'click1.webm', BASE + 'click2.webm', BASE + 'click3.webm',
            BASE + 'click4.webm', BASE + 'click5.webm'
        ]
    };

    // 长按菜单里的一次性动作（上游 dsh-pet 的动画，MIT）
    // 这些不预取，只有点到了才下载，别把首页搞重
    var ACTS = {
        crab: BASE + 'crab.webm',        // 螃蟹走路
        run: BASE + 'run.webm',          // 原地左转奔跑
        lion: BASE + 'lion.webm',        // 舞狮子头
        spin: BASE + 'spin.webm',        // 原地转一圈
        sleep: BASE + 'sleep.webm',      // 原地小憩沉眠
        stretch: BASE + 'stretch.webm',  // 超大伸懒腰
        bubble: BASE + 'bubble.webm',    // 鲸鱼吐泡泡
        whale: BASE + 'whale.webm',      // 变鲸鱼
        dance: BASE + 'dance.webm',      // 轻快摇摆舞
        startle: BASE + 'startle.webm',  // 被吓一跳
        cat: BASE + 'cat.webm',          // 撸猫
        code: BASE + 'code.webm'         // 写代码
    };

    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var MARGIN = 10;              // 离屏幕边缘的最小距离
    var BOTTOM_GAP = 96;          // 底部留出页脚高度
    var LONG_PRESS = 480;         // 按住多久算长按
    var DRAG_SLOP = 6;            // 手指移动超过这个距离才算拖动
    var CLICK_WINDOW = 2600;      // 连点判定的时间窗
    var NAG_AFTER = 3 * 60000;    // 多久没被理算「久没人理」
    var NAG_GAP = 2 * 60000;      // 两句牢骚之间至少隔这么久
    var QUIET_MS = 5 * 60000;     // 「安静一会儿」的时长
    var TALK_GAP = 30000;         // 两次自言自语的最小间隔
    var MAX_FLY_V = 2.6;          // 甩出去的速度上限（px/ms）

    var state = 'idle';           // idle | busy | drag | fly | menu
    var currentSrc = '';
    var idleTimer = null;
    var actionTimer = null;
    var dragging = false;
    var dragMoved = false;
    var longPressed = false;
    var pressTimer = null;
    var offsetX = 0;
    var offsetY = 0;
    var startX = 0;
    var startY = 0;
    var samples = [];             // 拖拽轨迹，用来算甩出速度
    var flyRaf = 0;
    var loaded = {};
    var ready = false;

    // 看板娘开关：默认不加载，点了才下载视频（状态记在本机）
    var STORE_KEY = 'dsh-pet-on';
    var started = false;
    var enabled = false;
    var toggleEl = null;
    var bootTimer = 0;
    var greetTimer = 0;
    var periodTimer = 0;
    var nagTimer = 0;
    var slideTimer = 0;           // 滑出屏幕后才真正卸层

    function storeGet(key) {
        try { return window.localStorage.getItem(key); } catch (err) { return null; }
    }

    function storeSet(key, val) {
        try { window.localStorage.setItem(key, val); } catch (err) {}
    }

    var lastInteract = Date.now();
    var lastSayAt = 0;
    var lastText = '';
    var lastSelfTalk = 0;
    var lastNagAt = 0;
    var nagStage = 0;
    var quietUntil = 0;
    var clicks = [];
    var lastPeriod = '';
    var menuEl = null;

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function pick(arr) {
        if (!arr || !arr.length) return '';
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // 尽量不连着说同一句
    function pickLine(key) {
        var arr = LINES[key];
        if (!arr || !arr.length) return '';
        var text = pick(arr);
        for (var i = 0; i < 4 && arr.length > 1 && text === lastText; i++) text = pick(arr);
        return text;
    }

    function w() { return document.documentElement.clientWidth; }
    function h() { return document.documentElement.clientHeight; }
    function petW() { return root.offsetWidth || 1; }
    function petH() { return root.offsetHeight || 1; }

    function clampPos(x, y) {
        var maxX = w() - petW() - MARGIN;
        var maxY = h() - petH() - MARGIN;
        return {
            x: Math.max(MARGIN, Math.min(maxX, x)),
            y: Math.max(MARGIN, Math.min(maxY, y))
        };
    }

    function place(x, y) {
        var p = clampPos(x, y);
        root.style.left = Math.round(p.x) + 'px';
        root.style.top = Math.round(p.y) + 'px';
    }

    // 初始位置：左侧靠下，页脚上方（往右挪一点，别压在左边那个开关上）
    function park() {
        place(46, h() - petH() - BOTTOM_GAP);
    }

    /* ---------------- 台词气泡 ---------------- */
    var bubbleEl = null;
    var bubbleTimer = null;

    function getBubble() {
        if (bubbleEl) return bubbleEl;
        bubbleEl = document.createElement('div');
        bubbleEl.className = 'pet-bubble';
        bubbleEl.setAttribute('aria-hidden', 'true');
        root.appendChild(bubbleEl);
        return bubbleEl;
    }

    // 贴边时把气泡推回屏幕内；鱼在屏幕顶部时气泡翻到下面
    function placeBubble() {
        if (!bubbleEl) return;
        var bw = bubbleEl.offsetWidth;
        var bh = bubbleEl.offsetHeight;
        var rect = root.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var shift = 0;
        if (centerX - bw / 2 < 8) shift = 8 - (centerX - bw / 2);
        else if (centerX + bw / 2 > w() - 8) shift = (w() - 8) - (centerX + bw / 2);
        bubbleEl.style.setProperty('--bx', Math.round(shift) + 'px');
        bubbleEl.classList.toggle('is-below', rect.top < bh + 16);
    }

    function say(text, opts) {
        opts = opts || {};
        if (!text || !enabled) return;
        var now = Date.now();
        if (opts.cooldown && now - lastSayAt < opts.cooldown) return;

        var el = getBubble();
        lastSayAt = now;
        lastText = text;
        el.textContent = text;
        placeBubble();
        el.classList.remove('show');
        void el.offsetWidth;          // 让淡入动画能重播
        el.classList.add('show');
        placeBubble();

        clearTimeout(bubbleTimer);
        // 句子越长显示越久，但不超过 7 秒
        var ms = opts.ms || Math.min(3600 + text.length * 120, 7000);
        bubbleTimer = setTimeout(function () {
            el.classList.remove('show');
        }, ms);
    }

    function sayKey(key, opts) {
        say(pickLine(key), opts);
    }

    function isQuiet() {
        return Date.now() < quietUntil;
    }

    /* ---------------- 视频层池：换片不重新加载，避免闪白 ----------------
       以前每换一个片段就改 video.src，浏览器会清空画面重新解码，
       在解出第一帧之前会露出白框/空白，连点和甩出时会闪一下。
       现在每个片段常驻一个 video 层：新片先在后台缓冲，等它真有画面了
       再把显示切过去，旧画面一直留到切换那一刻。 */
    var holder = root.querySelector('.pet-inner') || root;
    var layers = {};              // src -> { el, ready, error, usedAt }
    var activeLayer = null;
    var MAX_LAYERS = 12;          // 同时保留的层数，超了丢最久没用的
    var SWAP_MS = 130;            // 新旧画面交接时间

    function makeLayerEl() {
        var el = document.createElement('video');
        el.className = 'pet-video';
        el.defaultMuted = true;
        el.muted = true;
        el.playsInline = true;
        el.setAttribute('muted', '');
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        el.setAttribute('disablepictureinpicture', '');
        el.setAttribute('x-webkit-airplay', 'deny');
        el.preload = 'auto';
        el.tabIndex = -1;
        return el;
    }

    function ensureLayer(src) {
        var layer = layers[src];
        if (layer) return layer;

        var el = makeLayerEl();
        layer = { el: el, ready: false, error: false, usedAt: 0 };
        layers[src] = layer;

        el.addEventListener('loadeddata', function () {
            layer.ready = true;
            // 有画面了：正在等它的那次切换现在就换过去
            if (layer.show) layer.show();
        });
        el.addEventListener('error', function () {
            layer.error = true;
            layer.show = null;
        });

        el.src = src;
        holder.appendChild(el);
        return layer;
    }

    // HTML 里那个 video 直接当待机层，省一个元素（打开桌宠时才建，默认什么都不加载）
    var idleLayer = null;

    function pruneLayers() {
        var keys = Object.keys(layers);
        if (keys.length <= MAX_LAYERS) return;
        keys.sort(function (a, b) {
            return (layers[a].usedAt || 0) - (layers[b].usedAt || 0);
        });
        for (var i = 0; i < keys.length - MAX_LAYERS; i++) {
            var layer = layers[keys[i]];
            if (!layer || layer === activeLayer) continue;
            layer.el.parentNode && layer.el.parentNode.removeChild(layer.el);
            try {
                layer.el.removeAttribute('src');
                layer.el.load();
            } catch (err) {}
            delete layers[keys[i]];
        }
    }

    function activate(layer) {
        if (activeLayer === layer) {
            layer.usedAt = Date.now();
            return;
        }
        var prev = activeLayer;
        activeLayer = layer;
        layer.usedAt = Date.now();
        layer.el.classList.add('is-active');
        if (prev) {
            prev.el.classList.remove('is-active');
            // 等淡出结束再暂停旧层，切换瞬间不留白
            setTimeout(function () {
                if (prev !== activeLayer) {
                    try { prev.el.pause(); } catch (err) {}
                }
            }, SWAP_MS + 60);
        }
    }

    function pauseAll() {
        for (var key in layers) {
            if (!Object.prototype.hasOwnProperty.call(layers, key)) continue;
            try { layers[key].el.pause(); } catch (err) {}
        }
    }

    /* ---------------- 动画片段 ---------------- */
    function play(src, opts) {
        opts = opts || {};
        if (!src || !enabled) return null;
        currentSrc = src;

        var layer = ensureLayer(src);
        var el = layer.el;
        el.loop = !!opts.loop;

        function start() {
            var p = el.play();
            if (p && p.catch) p.catch(function () {});
        }

        function showNow() {
            if (currentSrc !== src) return;      // 期间又换了别的片，放弃这次切换
            if (!opts.loop) {
                try { el.currentTime = 0; } catch (err) {}
            }
            activate(layer);
            start();
            pruneLayers();
        }

        if (layer.ready || el.readyState >= 2 || layer.error) {
            showNow();
            return layer;
        }

        // 还没解出画面：先让它缓冲，解出来再切显示，旧画面撑到那一刻
        start();
        layer.show = function () {
            layer.show = null;
            showNow();
        };
        return layer;
    }

    function setIdle() {
        state = 'idle';
        root.classList.remove('is-walking');
        play(CLIPS.idle, { loop: true });
        scheduleAction();
    }

    function clearTimers() {
        clearTimeout(idleTimer);
        clearTimeout(actionTimer);
    }

    // 一次性的动作：播完回到待机
    function runOnce(src, ms, after) {
        clearTimers();
        state = 'busy';
        play(src);
        actionTimer = setTimeout(function () {
            if (after) after();
            else setIdle();
        }, ms);
    }

    // 菜单里的动作片：播到片尾就回待机（不同片长不一致，用 ended 更稳）
    function playAct(key) {
        var src = ACTS[key];
        if (!src) return;
        clearTimers();
        state = 'busy';
        root.classList.remove('is-walking');

        var layer = play(src);
        if (!layer) {
            setIdle();
            return;
        }
        var el = layer.el;

        var done = false;
        function finish() {
            if (done) return;
            done = true;
            el.removeEventListener('ended', finish);
            setIdle();
        }
        el.addEventListener('ended', finish);
        // 兜底：万一 ended 没触发（片段被吞、切了标签页）也别一直卡在 busy
        actionTimer = setTimeout(finish, 15000);
    }

    function lookAround() {
        if (state !== 'idle') return;
        root.classList.toggle('is-left', Math.random() < 0.5);
        runOnce(CLIPS.look, 10000);
    }

    function walkSomewhere() {
        if (state !== 'idle') return;
        var targetX = rand(MARGIN, Math.max(MARGIN, w() - petW() - MARGIN));
        var fromX = root.offsetLeft;
        var dist = Math.abs(targetX - fromX);
        if (dist < 30) return;

        state = 'busy';
        clearTimers();
        root.classList.toggle('is-left', targetX < fromX);

        // 速度约 90px/s，最少 2.4s，最多 10s（动画本身 10 秒）
        var ms = Math.min(10000, Math.max(2400, dist / 90 * 1000));
        root.style.setProperty('--walk-ms', ms + 'ms');
        root.classList.add('is-walking');
        play(CLIPS.walk, { loop: true });
        place(targetX, root.offsetTop);

        actionTimer = setTimeout(function () {
            root.classList.remove('is-walking');
            setIdle();
        }, ms);
    }

    function pulse() {
        root.classList.remove('is-pulse');
        void root.offsetWidth;
        root.classList.add('is-pulse');
        setTimeout(function () { root.classList.remove('is-pulse'); }, 640);
    }

    function shake(ms) {
        root.classList.remove('is-shake');
        void root.offsetWidth;
        root.classList.add('is-shake');
        setTimeout(function () { root.classList.remove('is-shake'); }, ms || 480);
    }

    function spin() {
        if (state === 'drag' || state === 'fly') return;
        playAct('spin');
    }

    /* ---------------- 自言自语 ---------------- */
    function selfTalk() {
        if (isQuiet()) return;
        var now = Date.now();
        if (now - lastSelfTalk < TALK_GAP) return;
        if (!pickLine('idle')) return;
        lastSelfTalk = now;
        sayKey('idle');
        lookAround();
    }

    function scheduleAction() {
        clearTimeout(idleTimer);
        if (!enabled) return;
        idleTimer = setTimeout(function () {
            if (state !== 'idle' || dragging || menuEl || document.hidden) {
                scheduleAction();
                return;
            }
            if (reduceMotion) {
                // 减少动态效果：不自己走动，只偶尔说一句
                if (Math.random() < 0.55) selfTalk();
                scheduleAction();
                return;
            }
            var r = Math.random();
            if (r < 0.34) walkSomewhere();
            else if (r < 0.58) lookAround();
            else if (r < 0.94) selfTalk();
            else scheduleAction();
        }, reduceMotion ? rand(18000, 36000) : rand(7000, 15000));
    }

    /* ---------------- 点击 / 被连点 ---------------- */
    function reactToClick() {
        if (dragging || state === 'fly') return;
        var now = Date.now();
        clicks.push(now);
        while (clicks.length && now - clicks[0] > CLICK_WINDOW) clicks.shift();
        lastInteract = now;
        nagStage = 0;

        var n = clicks.length;
        // 连点要能明显顶掉上一句，所以这三级不设冷却；只有最高级限制一下频率
        if (n >= 8) {
            sayKey('pokeMax');
            shake();
        } else if (n >= 5) {
            sayKey('pokeHard');
            shake();
        } else if (n >= 3) {
            sayKey('poke');
        } else {
            sayKey('click');
        }
        runOnce(pick(CLIPS.click), 10000);
    }

    /* ---------------- 时段问候 ---------------- */
    function period(hour) {
        if (hour >= 5 && hour < 11) return 'morning';
        if (hour >= 11 && hour < 13) return 'noon';
        if (hour >= 13 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 22) return 'evening';
        return 'night';
    }

    function greetLine() {
        var g = LINES.greet || {};
        var arr = g[period(new Date().getHours())];
        return pick(arr && arr.length ? arr : (g.morning || []));
    }

    function greetNow() {
        var text = greetLine();
        if (!text) return;
        say(text);
        pulse();
    }

    // 早上/中午/晚上/深夜 换段时补一句问候
    function watchPeriod() {
        clearInterval(periodTimer);
        periodTimer = setInterval(function () {
            if (!enabled) return;
            var now = period(new Date().getHours());
            if (now === lastPeriod) return;
            lastPeriod = now;
            if (isQuiet() || document.hidden || dragging || menuEl) return;
            var text = greetLine();
            if (text) say(text);
        }, 60000);
    }

    /* ---------------- 久没人理 ---------------- */
    function nagCheck() {
        var now = Date.now();
        if (!enabled || document.hidden || isQuiet() || dragging || menuEl || state === 'fly') return;
        if (now - lastInteract < NAG_AFTER) {
            nagStage = 0;
            return;
        }
        if (now - lastNagAt < NAG_GAP) return;
        var arr = LINES.ignored || [];
        if (!arr.length) return;
        lastNagAt = now;
        say(arr[Math.min(nagStage, arr.length - 1)], { ms: 4400 });
        nagStage++;
        if (nagStage >= 2) lookAround();
    }

    /* ---------------- 被甩出：松手后的漂浮惯性 ---------------- */
    function launch(vx, vy) {
        state = 'fly';
        clearTimers();
        root.classList.remove('is-walking');
        root.classList.add('is-flying');
        play(CLIPS.drag, { loop: true });

        var speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > MAX_FLY_V) {
            vx *= MAX_FLY_V / speed;
            vy *= MAX_FLY_V / speed;
        }
        var x = root.offsetLeft;
        var y = root.offsetTop;
        var startedAt = Date.now();
        var last = 0;
        sayKey('thrown', { cooldown: 2000 });

        function settle() {
            flyRaf = 0;
            root.classList.remove('is-flying');
            root.style.setProperty('--pet-roll', '0deg');
            sayKey('landed', { ms: 2600 });
            setIdle();
        }

        function step(now) {
            if (!last) last = now;
            var dt = Math.min(now - last, 34);
            last = now;

            // 水里没有重力，只有阻力：慢慢滑着停下来
            var decay = Math.pow(0.9955, dt);
            vx *= decay;
            vy *= decay;
            x += vx * dt;
            y += vy * dt;

            var maxX = Math.max(MARGIN, w() - petW() - MARGIN);
            var maxY = Math.max(MARGIN, h() - petH() - MARGIN);
            if (x < MARGIN) { x = MARGIN; vx = Math.abs(vx) * 0.55; }
            else if (x > maxX) { x = maxX; vx = -Math.abs(vx) * 0.55; }
            if (y < MARGIN) { y = MARGIN; vy = Math.abs(vy) * 0.55; }
            else if (y > maxY) { y = maxY; vy = -Math.abs(vy) * 0.55; }

            root.style.left = Math.round(x) + 'px';
            root.style.top = Math.round(y) + 'px';
            // 顺着飞行方向轻轻侧身
            root.style.setProperty('--pet-roll', Math.max(-20, Math.min(20, vx * 9)) + 'deg');

            var slow = Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05;
            if (slow || now - startedAt > 3600) {
                settle();
                return;
            }
            flyRaf = requestAnimationFrame(step);
        }

        if (reduceMotion) {
            // 减少动态效果：不飘，松手就停
            setTimeout(settle, 80);
            return;
        }
        flyRaf = requestAnimationFrame(step);
    }

    /* ---------------- 长按动作菜单 ---------------- */
    // 分三组：说话 / 小动作 / 玩一会儿；动作接到 ACTS 上的直接播片段
    function menuGroups() {
        return [
            {
                title: LABEL.groupTalk || '说话',
                items: [
                    ['say', LABEL.say || '说句话'],
                    ['greet', LABEL.greet || '打个招呼']
                ]
            },
            {
                title: LABEL.groupAct || '小动作',
                items: [
                    ['look', LABEL.look || '东张西望'],
                    ['walk', LABEL.walk || '溜达一圈'],
                    ['spin', LABEL.spin || '转一圈'],
                    ['shake', LABEL.shake || '甩甩水'],
                    ['crab', LABEL.crab || '螃蟹走'],
                    ['run', LABEL.run || '原地奔跑'],
                    ['lion', LABEL.lion || '舞狮子头']
                ]
            },
            {
                title: LABEL.groupPlay || '玩一会儿',
                items: [
                    ['dance', LABEL.dance || '跳个舞'],
                    ['stretch', LABEL.stretch || '伸个懒腰'],
                    ['sleep', LABEL.sleep || '睡一觉'],
                    ['startle', LABEL.startle || '吓一跳'],
                    ['bubble', LABEL.bubble || '吐泡泡'],
                    ['whale', LABEL.whale || '变鲸鱼'],
                    ['cat', LABEL.cat || '撸猫'],
                    ['code', LABEL.code || '写代码']
                ]
            },
            {
                title: LABEL.groupOther || '其他',
                items: [
                    ['quiet', isQuiet() ? (LABEL.resume || '恢复说话') : (LABEL.quiet || '安静 5 分钟')]
                ]
            }
        ];
    }

    function runMenuAction(id) {
        lastInteract = Date.now();
        nagStage = 0;
        if (id === 'say') {
            sayKey('say');
            pulse();
            return;
        }
        if (id === 'greet') {
            greetNow();
            return;
        }
        if (id === 'quiet') {
            if (isQuiet()) {
                quietUntil = 0;
                sayKey('back');
                pulse();
            } else {
                quietUntil = Date.now() + QUIET_MS;
                sayKey('quiet');
            }
            return;
        }
        if (id === 'look') {
            sayKey('look', { cooldown: 4000 });
            lookAround();
            return;
        }
        if (id === 'walk') {
            sayKey('walk', { cooldown: 4000 });
            walkSomewhere();
            return;
        }
        if (id === 'spin') {
            sayKey('spin');
            spin();
            return;
        }
        if (id === 'shake') {
            sayKey('shake');
            shake(700);
            return;
        }
        // 其余都是 ACTS 里的动作片（用户点名的动作，台词不该被冷却挡掉）
        if (ACTS[id]) {
            sayKey(id);
            playAct(id);
        }
    }

    function positionMenu() {
        if (!menuEl) return;
        var rect = root.getBoundingClientRect();
        var mw = menuEl.offsetWidth;
        var mh = menuEl.offsetHeight;
        var left = rect.left + rect.width / 2 - mw / 2;
        left = Math.max(8, Math.min(w() - mw - 8, left));
        var top = rect.top - mh - 10;
        if (top < 8) top = Math.min(h() - mh - 8, rect.bottom + 10);
        menuEl.style.left = Math.round(left) + 'px';
        menuEl.style.top = Math.round(Math.max(8, top)) + 'px';
    }

    function onMenuKey(e) {
        if (!menuEl) return;
        if (e.key === 'Escape') {
            closeMenu();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            var items = menuEl.querySelectorAll('button');
            if (!items.length) return;
            var idx = -1;
            for (var i = 0; i < items.length; i++) {
                if (items[i] === document.activeElement) idx = i;
            }
            var next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
            if (next < 0) next = items.length - 1;
            if (next >= items.length) next = 0;
            items[next].focus();
            e.preventDefault();
        }
    }

    function onDocDown(e) {
        if (!menuEl) return;
        if (menuEl.contains(e.target) || root.contains(e.target)) return;
        closeMenu();
    }

    function closeMenu() {
        if (!menuEl) return;
        menuEl.parentNode && menuEl.parentNode.removeChild(menuEl);
        menuEl = null;
        document.removeEventListener('keydown', onMenuKey, true);
        document.removeEventListener('pointerdown', onDocDown, true);
        window.removeEventListener('resize', closeMenu);
        state = 'idle';
        play(CLIPS.idle, { loop: true });
        scheduleAction();
    }

    function openMenu() {
        if (menuEl) return;
        clearTimers();
        state = 'menu';
        root.classList.remove('is-walking');

        menuEl = document.createElement('div');
        menuEl.className = 'pet-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.setAttribute('aria-hidden', 'true');

        var title = document.createElement('p');
        title.className = 'pet-menu-title';
        title.textContent = LABEL.title || '让她做点什么';
        menuEl.appendChild(title);

        var groups = menuGroups();
        for (var g = 0; g < groups.length; g++) {
            var head = document.createElement('p');
            head.className = 'pet-menu-group';
            head.textContent = groups[g].title;
            menuEl.appendChild(head);

            var items = groups[g].items;
            for (var i = 0; i < items.length; i++) {
                (function (id, label) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.setAttribute('role', 'menuitem');
                    btn.textContent = label;
                    btn.addEventListener('click', function () {
                        closeMenu();
                        runMenuAction(id);
                    });
                    menuEl.appendChild(btn);
                })(items[i][0], items[i][1]);
            }
        }

        document.body.appendChild(menuEl);
        positionMenu();
        document.addEventListener('keydown', onMenuKey, true);
        document.addEventListener('pointerdown', onDocDown, true);
        window.addEventListener('resize', closeMenu);

        var first = menuEl.querySelector('button');
        if (first) {
            try { first.focus({ preventScroll: true }); }
            catch (err) { first.focus(); }
        }

        if (navigator.vibrate) {
            try { navigator.vibrate(12); } catch (err) {}
        }
    }

    /* ---------------- 指针：点击 / 拖动 / 长按 ---------------- */
    function startPressTimer() {
        cancelPressTimer();
        pressTimer = setTimeout(function () {
            pressTimer = null;
            if (!dragging || dragMoved || state === 'menu') return;
            longPressed = true;
            openMenu();
        }, LONG_PRESS);
    }

    function cancelPressTimer() {
        clearTimeout(pressTimer);
        pressTimer = null;
    }

    function onDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (menuEl) closeMenu();
        // 半空中抓住它：先停下惯性，不然会和拖拽抢坐标
        if (flyRaf) {
            cancelAnimationFrame(flyRaf);
            flyRaf = 0;
            root.classList.remove('is-flying');
            root.style.setProperty('--pet-roll', '0deg');
        }
        dragging = true;
        dragMoved = false;
        longPressed = false;
        state = 'drag';
        clearTimers();
        samples = [];
        root.classList.remove('is-walking');
        root.classList.add('is-dragging');
        var rect = root.getBoundingClientRect();
        offsetX = (e.clientX || 0) - rect.left;
        offsetY = (e.clientY || 0) - rect.top;
        startX = e.clientX || 0;
        startY = e.clientY || 0;
        lastInteract = Date.now();
        nagStage = 0;
        play(CLIPS.drag, { loop: true });
        if (root.setPointerCapture && e.pointerId !== undefined) {
            try { root.setPointerCapture(e.pointerId); } catch (err) {}
        }
        startPressTimer();
        e.preventDefault();
    }

    function onMove(e) {
        if (!dragging) return;
        var cx = e.clientX;
        var cy = e.clientY;
        if (cx === undefined) return;
        // 长按已经把菜单唤出来了，手指再动也不拖，免得鱼跟着乱跑
        if (longPressed) {
            e.preventDefault();
            return;
        }
        if (!dragMoved) {
            // 抖动几个像素不算拖，别把长按按丢了
            if (Math.abs(cx - startX) < DRAG_SLOP && Math.abs(cy - startY) < DRAG_SLOP) {
                e.preventDefault();
                return;
            }
            dragMoved = true;
            cancelPressTimer();
            sayKey('drag', { cooldown: 4000, ms: 2600 });
        }
        var now = Date.now();
        samples.push({ t: now, x: cx, y: cy });
        while (samples.length > 2 && now - samples[0].t > 140) samples.shift();
        place(cx - offsetX, cy - offsetY);
        e.preventDefault();
    }

    // 用最近 140ms 的位移估算速度（px/ms），够快就算「甩」
    function releaseVelocity() {
        if (samples.length < 2) return { vx: 0, vy: 0 };
        var first = samples[0];
        var last = samples[samples.length - 1];
        var dt = Math.max(last.t - first.t, 1);
        return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        cancelPressTimer();
        root.classList.remove('is-dragging');
        if (longPressed) {
            // 长按已经弹出菜单，松手不再当成点击
            longPressed = false;
            return;
        }
        // 松手就不算拖了，先把状态让出来，否则点击反应会被拖拽状态挡掉
        state = 'idle';
        if (!dragMoved) {
            reactToClick();
            return;
        }
        var v = releaseVelocity();
        var speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
        if (speed > 0.55) launch(v.vx, v.vy);
        else setIdle();
    }

    if (window.PointerEvent) {
        root.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    } else {
        root.addEventListener('touchstart', function (e) {
            var t = e.touches[0];
            onDown({ clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault: function () { e.preventDefault(); } });
        }, { passive: false });
        window.addEventListener('touchmove', function (e) {
            var t = e.touches[0];
            if (t) onMove({ clientX: t.clientX, clientY: t.clientY, preventDefault: function () { e.preventDefault(); } });
        }, { passive: false });
        window.addEventListener('touchend', onUp);
        root.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    // 长按别弹系统菜单、别选中文字
    root.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ---------------- 懒加载其余动画 ---------------- */
    // 直接用层池预建：这些片段以后切过去就是即时的，不会再有加载白框
    function prefetch() {
        var conn = navigator.connection || {};
        if (conn.saveData || /2g/.test(conn.effectiveType || '')) return;
        var queue = [CLIPS.look, CLIPS.walk, CLIPS.drag].concat(CLIPS.click);
        var i = 0;
        (function next() {
            if (i >= queue.length) return;
            var url = queue[i++];
            if (loaded[url]) { next(); return; }
            var layer = ensureLayer(url);
            if (layer.ready) {
                loaded[url] = true;
                next();
                return;
            }
            var el = layer.el;
            function done() {
                el.removeEventListener('loadeddata', done);
                el.removeEventListener('error', done);
                loaded[url] = true;
                next();
            }
            el.addEventListener('loadeddata', done);
            el.addEventListener('error', done);
        })();
    }

    /* ---------------- 启动 / 收起 ---------------- */
    function boot() {
        if (ready || !enabled) return;
        ready = true;
        root.hidden = false;
        park();
        setIdle();
        lastPeriod = period(new Date().getHours());
        setTimeout(prefetch, 4000);
        // 先打个招呼（比如「晚上好」），安静模式不打扰
        greetTimer = setTimeout(function () {
            if (!enabled || isQuiet() || document.hidden) return;
            greetNow();
        }, 1400);
        watchPeriod();
        nagTimer = setInterval(nagCheck, 20000);
    }

    function hideBubble() {
        if (!bubbleEl) return;
        clearTimeout(bubbleTimer);
        bubbleEl.classList.remove('show');
        bubbleEl.textContent = '';
    }

    // 把层池全拆了，视频内存和下载都收回来
    function detachLayers() {
        for (var key in layers) {
            if (!Object.prototype.hasOwnProperty.call(layers, key)) continue;
            var layer = layers[key];
            try {
                layer.el.pause();
                layer.el.removeAttribute('src');
                layer.el.load();
            } catch (err) {}
            layer.el.classList.remove('is-active');
            if (layer.el !== video && layer.el.parentNode) layer.el.parentNode.removeChild(layer.el);
            delete layers[key];
        }
        activeLayer = null;
        idleLayer = null;
        currentSrc = '';
        loaded = {};
    }

    function updateToggle() {
        if (!toggleEl) return;
        toggleEl.classList.toggle('is-on', enabled);
        toggleEl.classList.toggle('is-hidden', enabled);   // 鱼出来了，把手收回屏幕外
        toggleEl.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggleEl.setAttribute('aria-label', enabled ? '收起桌宠大肥鱼' : '打开桌宠大肥鱼');
        var text = toggleEl.querySelector('.pet-toggle-text');
        if (text) text.textContent = enabled ? (LABEL.hide || '收起') : (LABEL.show || '看板娘');
    }

    function startPet() {
        if (started) return;
        started = true;
        enabled = true;
        state = 'idle';
        ready = false;

        idleLayer = { el: video, ready: false, error: false, usedAt: 0 };
        layers[CLIPS.idle] = idleLayer;

        clearTimeout(slideTimer);
        root.hidden = false;
        root.classList.add('is-out');   // 先在屏幕左边外，下一帧再滑进来
        park();
        video.src = CLIPS.idle;        // 点开之后才开始下载第一个片段
        play(CLIPS.idle, { loop: true });
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (started) root.classList.remove('is-out');
            });
        });
        // 兜底：2.5 秒内没触发 loadeddata 也先显示
        bootTimer = setTimeout(boot, 2500);

        updateToggle();
        storeSet(STORE_KEY, '1');
    }

    function stopPet() {
        if (!started) return;
        started = false;
        enabled = false;

        clearTimers();
        clearTimeout(bootTimer);
        clearTimeout(greetTimer);
        clearInterval(periodTimer);
        clearInterval(nagTimer);
        bootTimer = greetTimer = periodTimer = nagTimer = 0;

        closeMenu();
        hideBubble();

        state = 'idle';
        dragging = false;
        dragMoved = false;
        longPressed = false;
        if (flyRaf) {
            cancelAnimationFrame(flyRaf);
            flyRaf = 0;
        }
        root.classList.remove('is-dragging', 'is-flying', 'is-walking', 'is-shake', 'is-pulse', 'is-left');
        root.style.setProperty('--pet-roll', '0deg');
        root.classList.add('is-out');          // 先滑出屏幕，滑完再卸视频层
        clearTimeout(slideTimer);
        slideTimer = setTimeout(function () {
            if (started) return;               // 期间又点开了，别拆
            detachLayers();
            root.hidden = true;
            root.classList.remove('is-out');
        }, 420);

        updateToggle();
        storeSet(STORE_KEY, '0');
    }

    function togglePet() {
        if (enabled) stopPet();
        else startPet();
    }

    // 视频就绪后再露出来，避免闪一下空白
    video.addEventListener('loadeddata', function () {
        if (!idleLayer) return;
        idleLayer.ready = true;
        if (idleLayer.show) {
            idleLayer.show();
        } else if (activeLayer !== idleLayer && currentSrc === CLIPS.idle) {
            activate(idleLayer);
        }
        if (state === 'idle' || !currentSrc) boot();
        root.classList.add('is-ready');
    });
    video.addEventListener('error', function () {
        // 待机片都放不出来就别留一只空鱼在那儿
        if (started) stopPet();
    });

    root.hidden = true;

    /* ---------------- 看板娘开关 ---------------- */
    toggleEl = document.getElementById('pet-toggle');
    if (toggleEl) {
        toggleEl.addEventListener('click', togglePet);
        updateToggle();
    }

    // 鱼旁边的小工具列：⋯ 开菜单、× 收起
    var menuBtn = document.getElementById('pet-menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
            if (!started) return;
            if (menuEl) closeMenu();
            else openMenu();
        });
    }
    var closeBtn = document.getElementById('pet-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
            stopPet();
        });
    }

    window.addEventListener('resize', function () {
        if (!enabled) return;
        if (state === 'drag' || state === 'fly') return;
        place(root.offsetLeft, root.offsetTop);
        if (bubbleEl && bubbleEl.classList.contains('show')) placeBubble();
        if (menuEl) positionMenu();
    });

    document.addEventListener('visibilitychange', function () {
        if (!enabled) return;
        if (document.hidden) {
            clearTimers();
            closeMenu();
            pauseAll();
        } else {
            lastInteract = Date.now();
            nagStage = 0;
            if (state === 'idle') setIdle();
            else if (state !== 'fly' && activeLayer) {
                var p = activeLayer.el.play();
                if (p && p.catch) p.catch(function () {});
            }
        }
    });

    // 上次开着的话就自动打开（默认是关的，什么都不下载）
    if (storeGet(STORE_KEY) === '1') startPet();
})();
