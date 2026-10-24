/* 游客访问量（页脚）
   - 计数服务：abacus.jasoncameron.dev（免 key、带 CORS）
   - 同一次会话只 +1，刷新页面不会重复累加；换设备/新会话再计一次
   - 服务不可用时整行隐藏，不影响页面
   无第三方依赖。 */
(function () {
    var NS = 'simple-search-3re';     // 计数命名空间：换站点请改成自己的
    var KEY = 'visits';               // 计数键名
    var BASE = 'https://abacus.jasoncameron.dev';
    var SESSION_KEY = 'superSearch.visitCounted';

    var line = document.getElementById('visits-line');
    var countEl = document.getElementById('visit-count');
    if (!line || !countEl) return;

    function format(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function render(n) {
        if (typeof n !== 'number' || !isFinite(n)) return;
        countEl.textContent = format(n);
        line.hidden = false;
        line.classList.add('is-ready');
    }

    function request(path) {
        var url = BASE + '/' + path + '/' + NS + '/' + KEY;
        var ctrl = window.AbortController ? new AbortController() : null;
        var opt = { cache: 'no-store', headers: { Accept: 'application/json' } };
        if (ctrl) opt.signal = ctrl.signal;

        var p = fetch(url, opt).then(function (r) {
            return r.ok ? r.json() : Promise.reject(new Error('bad status'));
        });
        if (ctrl) {
            setTimeout(function () {
                try { ctrl.abort(); } catch (e) {}
            }, 8000);
        }
        return p;
    }

    var counted = false;
    try {
        counted = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (e) { /* 隐私模式忽略 */ }

    // 首次访问用 hit（+1 并返回总数），之后同会话用 get（只读，别把数字刷上天）
    request(counted ? 'get' : 'hit')
        .then(function (d) {
            if (!d || typeof d.value !== 'number') throw new Error('no value');
            return d.value;
        })
        .catch(function () {
            // 新 key 可能不存在：hit 会顺手创建，这里再试一次只读就够了
            return request('hit').then(function (d) {
                return d && d.value;
            });
        })
        .then(function (n) {
            if (typeof n !== 'number') {
                line.hidden = true;
                return;
            }
            if (!counted) {
                try {
                    sessionStorage.setItem(SESSION_KEY, '1');
                } catch (e) { /* 忽略 */ }
            }
            render(n);
        })
        .catch(function () {
            line.hidden = true;
        });
})();
