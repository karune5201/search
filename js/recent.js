/* 最近访问（收纳面板分区）
   - 记录：点击面板里的站点链接时写入 localStorage
   - 主页已不再显示最近访问
   无第三方依赖、不联网。 */
(function () {
    var KEY = 'superSearch.recent';
    var MAX = 12;

    var panelSec = document.getElementById('panel-recent-sec');
    var panelList = document.getElementById('panel-recent-links');

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function read() {
        try {
            var v = JSON.parse(localStorage.getItem(KEY));
            return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
        } catch (e) {
            return [];
        }
    }

    function save(arr) {
        try {
            localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
        } catch (e) { /* 隐私模式下忽略 */ }
    }

    function safeUrl(value) {
        var url = String(value || '').trim();
        return /^https?:\/\//i.test(url) ? url : '';
    }

    function render() {
        var arr = read();

        /* 面板分区 */
        if (panelSec && panelList) {
            if (!arr.length) {
                panelList.innerHTML = '';
                panelSec.hidden = true;
            } else {
                var h = '';
                for (var j = 0; j < arr.length; j++) {
                    var p = arr[j];
                    var url = safeUrl(p.url);
                    if (!url) continue;
                    h += '<li><a rel="nofollow noopener" target="_blank" title="' + escapeHtml(p.label) +
                        '" href="' + escapeHtml(url) + '">' +
                        '<i class="iconfont icon-"></i>' + escapeHtml(p.label) + '</a></li>';
                }
                panelList.innerHTML = h;
                panelSec.hidden = false;
            }
        }
    }

    function push(url, label) {
        if (!url || !label) return;
        var arr = read().filter(function (x) {
            return x.url !== url;
        });
        arr.unshift({ url: url, label: label });
        save(arr);
        render();
        // 面板里如果正在过滤，保持过滤结果与最新数据一致
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('recent:update'));
        }
    }

    // 记录点击：只记录收纳面板里的站点链接（主页胶囊点了也会置顶）
    document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a') : null;
        if (!a) return;

        // 只记录收纳面板里的站点链接
        if (!a.closest('.list') || !a.closest('.panel-links')) return;

        var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (label && safeUrl(a.href)) push(a.href, label);
    });

    render();

    // 通知面板：最近访问分区已渲染，需要重量一下折叠高度
    if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('recent:update'));
    }

    // 暴露给其他模块（panel.js 过滤后需要重算，可复用）
    window.SuperSearchRecent = { read: read, render: render };
})();
