/* 轻量首页玩法：随机站点、一言打字机提示、Konami 彩蛋、鼠标视差 */
(function () {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------- 随便逛逛 ---------------- */
    var randomButton = document.getElementById('random-site');
    var lastUrl = '';

    function getSites() {
        var groups = window.SuperSearchPanel && window.SuperSearchPanel.getSites
            ? window.SuperSearchPanel.getSites()
            : (window.SITE_DATA || []);
        var out = [];
        for (var i = 0; i < groups.length; i++) {
            var sites = groups[i].sites || [];
            for (var j = 0; j < sites.length; j++) {
                if (sites[j][0] && /^https?:\/\//i.test(sites[j][1])) {
                    out.push({ name: sites[j][0], url: sites[j][1] });
                }
            }
        }
        return out;
    }

    function showToast(text) {
        var toast = document.getElementById('fun-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'fun-toast';
            toast.className = 'fun-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = text;
        toast.classList.remove('show');
        // Force reflow so repeated messages replay the transition.
        void toast.offsetWidth;
        toast.classList.add('show');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, 1800);
    }

    if (randomButton) {
        randomButton.addEventListener('click', function () {
            var sites = getSites();
            if (!sites.length) {
                showToast('还没有可随机打开的站点');
                return;
            }
            var choices = sites.length > 1 ? sites.filter(function (site) {
                return site.url !== lastUrl;
            }) : sites;
            var pool = choices.length ? choices : sites;
            var site = pool[Math.floor(Math.random() * pool.length)];
            lastUrl = site.url;
            showToast('随便逛逛 · ' + site.name);
            window.open(site.url, '_blank', 'noopener');
        });
    }

    /* ---------------- 搜索框提示：一言 + 打字机 ---------------- */
    /* 句子来源（本地和联网混用）：
       1. data/hitokoto.json —— 本地句库，自己维护（tools/build-hitokoto.py 生成）
       2. v1.hitokoto.cn     —— 联网接口，按比例混进来保持新鲜
       3. FALLBACK_QUOTES    —— 两者都不可用时的兜底
       本地句库首次加载后缓存进 localStorage，之后打开页面不再重复下载。 */
    var input = document.getElementById('search-text');
    var LOCAL_JSON_URL = 'data/hitokoto.json';
    var LOCAL_CACHE_KEY = 'superSearch.hitokotoLocal';
    var LOCAL_CACHE_MAX = 3000;          // 缓存条数上限，别把 localStorage 撑爆
    var QUOTE_API = 'https://v1.hitokoto.cn/?encode=text&c=d&c=i&c=k';
    var REMOTE_CACHE_KEY = 'superSearch.quotePool';
    var REMOTE_CACHE_MAX = 30;
    var MIX_REMOTE_RATE = 0.3;           // 约三成句子来自联网接口
    var QUOTE_MAX_CHARS = 26;
    var SPEED_TYPE = 55;
    var SPEED_ERASE = 22;
    var HOLD_MS = 2600;
    var GAP_MS = 350;

    /* 本地和联网都不可用时的兜底句子，保证一直有内容可打 */
    var FALLBACK_QUOTES = [
        '人生如逆旅，我亦是行人。',
        '愿你走出半生，归来仍是少年。',
        '所有的大人都曾经是小孩，虽然只有少数人记得。',
        '所谓无底深渊，下去，也是前程万里。',
        '慢慢来，比较快。',
        '要有最朴素的生活，与最遥远的梦想。'
    ];

    var typeTimer = null;
    var waitTimer = null;
    var lastQuote = '';
    var quoteFetching = false;
    var quoteLastFetch = 0;
    var localQuotes = [];
    var remoteQuotes = [];
    var localLoading = false;

    /* 去掉 name：Chrome 会按字段名记录历史输入，聚焦时弹出建议下拉。
       提交逻辑在 sousuo.js 里用的是搜索源地址 + 输入值，不依赖 name，
       所以这里移除不影响搜索；禁用 JS 时保留 name 作为原生表单兜底。 */
    if (input) {
        input.removeAttribute('name');
        input.setAttribute('autocomplete', 'off');
    }

    function currentSource() {
        return document.querySelector('input[name="type"]:checked');
    }

    function sourcePlaceholder() {
        var source = currentSource();
        return source && source.getAttribute('data-placeholder') || '输入关键字搜索';
    }

    function stopTyping() {
        clearTimeout(typeTimer);
        clearTimeout(waitTimer);
        typeTimer = waitTimer = null;
    }

    function isCdkSource() {
        var source = currentSource();
        return source && source.id === 'type-Steam';
    }

    /* ---------- 本地句库：缓存优先，没有就下载一次 ---------- */
    function normalizeQuotes(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            var text = typeof item === 'string' ? item : (item && (item[0] || item.text)) || '';
            text = String(text).replace(/\s+/g, ' ').trim();
            if (text) out.push(text);
        }
        return out;
    }

    function readLocalCache() {
        try {
            var raw = localStorage.getItem(LOCAL_CACHE_KEY);
            if (!raw) return [];
            var pack = JSON.parse(raw);
            if (pack && pack.q && pack.q.length) return normalizeQuotes(pack.q);
        } catch (e) { /* 忽略损坏缓存 */ }
        return [];
    }

    function saveLocalCache(quotes) {
        try {
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
                v: 1,
                t: Date.now(),
                q: quotes.slice(0, LOCAL_CACHE_MAX)
            }));
        } catch (e) { /* 存储满了或隐私模式：只用内存，不影响显示 */ }
    }

    function loadLocalQuotes() {
        if (localLoading || !window.fetch) return;

        var cached = readLocalCache();
        if (cached.length) {
            localQuotes = cached;
            return;
        }

        localLoading = true;
        var ctrl = window.AbortController ? new AbortController() : null;

        fetch(LOCAL_JSON_URL, ctrl ? { signal: ctrl.signal } : {})
            .then(function (r) {
                return r.ok ? r.json() : Promise.reject(new Error('bad status'));
            })
            .then(function (data) {
                var list = normalizeQuotes(Object.prototype.toString.call(data) === '[object Array]' ? data : []);
                if (!list.length) return;
                localQuotes = list;
                saveLocalCache(list);
            })
            .catch(function () { /* 本地库没加载成功就靠接口和兜底 */ })
            .then(function () {
                localLoading = false;
            });

        if (ctrl) setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 8000);
    }

    /* ---------- 联网接口：小池子，混着用 ---------- */
    remoteQuotes = (function () {
        try {
            var v = JSON.parse(localStorage.getItem(REMOTE_CACHE_KEY));
            if (Object.prototype.toString.call(v) === '[object Array]') {
                return v.filter(function (s) {
                    return typeof s === 'string' && s.trim();
                });
            }
        } catch (e) { /* 忽略损坏缓存 */ }
        return [];
    })();

    function saveRemotePool() {
        try {
            localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(remoteQuotes.slice(-REMOTE_CACHE_MAX)));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function addRemoteQuote(text) {
        var s = String(text || '').replace(/\s+/g, ' ').trim();
        if (!s) return;
        if (remoteQuotes.indexOf(s) === -1) {
            remoteQuotes.push(s);
            if (remoteQuotes.length > REMOTE_CACHE_MAX) remoteQuotes = remoteQuotes.slice(-REMOTE_CACHE_MAX);
            saveRemotePool();
        }
    }

    function fetchRemoteQuote() {
        if (!QUOTE_API || quoteFetching || !window.fetch) return;
        var now = Date.now();
        if (now - quoteLastFetch < 1500) return;  // 别把接口打太勤
        quoteLastFetch = now;
        quoteFetching = true;

        var ctrl = window.AbortController ? new AbortController() : null;
        var done = function () {
            quoteFetching = false;
        };

        // 带时间戳：避免 CDN 缓存一直返回同一句
        var url = QUOTE_API + '&_=' + now;

        fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : {})
            .then(function (r) {
                return r.ok ? r.text() : Promise.reject(new Error('bad status'));
            })
            .then(addRemoteQuote)
            .catch(function () { /* 本地库还在，静默失败即可 */ })
            .then(done);

        if (ctrl) setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 4000);
    }

    /* ---------- 取句：本地为主，按比例混入联网 ---------- */
    function trimQuote(s) {
        return s.length > QUOTE_MAX_CHARS ? s.slice(0, QUOTE_MAX_CHARS) + '…' : s;
    }

    function nextQuote() {
        var useRemote = remoteQuotes.length > 0 && Math.random() < MIX_REMOTE_RATE;
        var pool = useRemote ? remoteQuotes : (localQuotes.length ? localQuotes : FALLBACK_QUOTES);

        var pick = pool[Math.floor(Math.random() * pool.length)];
        if (pool.length > 1 && pick === lastQuote) {
            pick = pool[(pool.indexOf(pick) + 1) % pool.length];
        }
        lastQuote = pick;
        return trimQuote(pick);
    }

    /* ---------- 打字机 ---------- */
    function typeQuote() {
        if (!input || input.value || isCdkSource()) return;
        var quote = nextQuote();
        var n = 0;
        input.placeholder = '';
        fetchRemoteQuote();  // 顺手补一条联网句子，保持混用

        function typeNext() {
            if (!input || input.value || isCdkSource()) {
                input.placeholder = sourcePlaceholder();
                return;
            }
            n++;
            input.placeholder = quote.slice(0, n);
            if (n < quote.length) {
                typeTimer = setTimeout(typeNext, SPEED_TYPE);
            } else {
                waitTimer = setTimeout(eraseNext, HOLD_MS);
            }
        }

        function eraseNext() {
            n--;
            input.placeholder = quote.slice(0, n);
            if (n > 0) {
                typeTimer = setTimeout(eraseNext, SPEED_ERASE);
            } else {
                waitTimer = setTimeout(typeQuote, GAP_MS);
            }
        }

        typeTimer = setTimeout(typeNext, 240);
    }

    function restartTyping() {
        if (!input) return;
        stopTyping();
        if (isCdkSource()) {
            input.placeholder = sourcePlaceholder();
            return;
        }
        if (reduceMotion) {
            // 系统要求减少动效时不播放打字动画，直接静态显示一句
            input.placeholder = nextQuote();
            return;
        }
        input.placeholder = sourcePlaceholder();
        if (!input.value) waitTimer = setTimeout(typeQuote, 900);
    }

    if (input) {
        input.addEventListener('input', function () {
            stopTyping();
            input.placeholder = sourcePlaceholder();
        });
        input.addEventListener('focus', function () {
            stopTyping();
            input.placeholder = sourcePlaceholder();
        });
        input.addEventListener('blur', restartTyping);

        var sources = document.querySelectorAll('input[name="type"]');
        for (var i = 0; i < sources.length; i++) {
            sources[i].addEventListener('change', restartTyping);
        }

        // 本地句库放到空闲时再取，别和首屏抢带宽
        if (window.requestIdleCallback) {
            window.requestIdleCallback(loadLocalQuotes, { timeout: 1500 });
        } else {
            setTimeout(loadLocalQuotes, 600);
        }
        fetchRemoteQuote();      // 联网句子先来一条，兜底池不会空
        restartTyping();
    }

    /* ---------------- 方向键彩蛋 ---------------- */
    var code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
    var progress = 0;

    function isTypingTarget(el) {
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    }

    function celebrate() {
        if (reduceMotion) return;
        var layer = document.createElement('div');
        layer.className = 'easter-burst';
        layer.setAttribute('aria-hidden', 'true');
        var title = document.createElement('span');
        title.className = 'easter-title';
        title.textContent = '彩蛋解锁';
        layer.appendChild(title);

        var marks = ['✦', '✧', '✺', '✦', '✧', '✺', '✦', '✧', '✺', '✦', '✧', '✺'];
        for (var i = 0; i < marks.length; i++) {
            var spark = document.createElement('i');
            spark.className = 'easter-spark';
            spark.textContent = marks[i];
            spark.style.setProperty('--angle', (i * 30 + Math.random() * 14) + 'deg');
            spark.style.setProperty('--distance', '-' + (90 + Math.random() * 130) + 'px');
            spark.style.setProperty('--delay', (Math.random() * 120) + 'ms');
            spark.style.setProperty('--hue', (i * 30) + '');
            layer.appendChild(spark);
        }
        document.body.appendChild(layer);
        setTimeout(function () {
            if (layer.parentNode) layer.parentNode.removeChild(layer);
        }, 1800);
    }

    document.addEventListener('keydown', function (e) {
        if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) {
            progress = 0;
            return;
        }
        if (e.key === code[progress]) {
            progress++;
            if (progress === code.length) {
                progress = 0;
                celebrate();
                showToast('↑ ↑ ↓ ↓ ← → ← → · 秘密指令');
            }
        } else {
            progress = e.key === code[0] ? 1 : 0;
        }
    });

    /* ---------------- 鼠标轻视差 ---------------- */
    var bg = document.querySelector('.bgo');
    var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (bg && finePointer && !reduceMotion) {
        var moveFrame = 0;
        document.addEventListener('pointermove', function (e) {
            if (moveFrame) return;
            moveFrame = requestAnimationFrame(function () {
                moveFrame = 0;
                var x = (e.clientX / window.innerWidth - .5) * -12;
                var y = (e.clientY / window.innerHeight - .5) * -12;
                x = Math.max(-6, Math.min(6, x));
                y = Math.max(-6, Math.min(6, y));
                bg.style.setProperty('--parallax-x', x.toFixed(1) + 'px');
                bg.style.setProperty('--parallax-y', y.toFixed(1) + 'px');
            });
        }, { passive: true });
        document.addEventListener('pointerleave', function () {
            bg.style.setProperty('--parallax-x', '0px');
            bg.style.setProperty('--parallax-y', '0px');
        });
    }
})();
