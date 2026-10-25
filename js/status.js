/* 站点状态页：渲染 window.LINK_STATUS（由 tools/check-links.py 生成） */
(function () {
    var data = window.LINK_STATUS;
    var listEl = document.getElementById('status-list');
    var subEl = document.getElementById('status-sub');
    var statsEl = document.getElementById('status-stats');
    var filtersEl = document.getElementById('status-filters');
    if (!listEl) return;

    var KIND_LABEL = {
        ok: '正常',
        dead: '死链',
        unknown: '可疑',
        blocked: '受限'
    };

    function showMessage(text) {
        var box = document.createElement('div');
        box.className = 'status-empty';
        box.textContent = text;
        listEl.innerHTML = '';
        listEl.appendChild(box);
    }

    if (!data || !data.items) {
        if (subEl) subEl.textContent = '还没有检测数据';
        showMessage('暂时没有检测数据。仓库的 GitHub Actions 每天会自动跑一次，跑完之后这里就有内容了。');
        return;
    }

    var items = data.items.filter(function (it) {
        if (!it || !it.url) return false;
        // 兜底：数据里出现没见过的类型也不要藏起来，按「可疑」显示
        if (!KIND_LABEL[it.kind]) it.kind = 'unknown';
        return true;
    });

    /* ---------------- 顶部说明 ---------------- */
    if (subEl) {
        var checked = data.checked || 0;
        var when = data.generatedAt || '';
        subEl.textContent = '最近一次检测：' + when + '，共检查 ' + checked +
            ' 个站点。默认展示全部结果，可按状态筛选。';
    }

    /* ---------------- 统计 ---------------- */
    var summary = data.summary || {};
    var counts = {
        dead: summary.dead || 0,
        unknown: summary.unknown || 0,
        blocked: summary.blocked || 0,
        ok: summary.ok || 0
    };
    ['dead', 'unknown', 'blocked', 'ok'].forEach(function (k) {
        var el = document.getElementById('stat-' + k);
        if (el) el.textContent = counts[k];
    });
    if (statsEl) statsEl.hidden = false;

    /* ---------------- 按分类分组 ---------------- */
    function groupByCat(rows) {
        var order = [];
        var map = {};
        for (var i = 0; i < rows.length; i++) {
            var key = rows[i].cat || '未分类';
            if (!map[key]) {
                map[key] = [];
                order.push(key);
            }
            map[key].push(rows[i]);
        }
        return order.map(function (key) {
            return { cat: key, rows: map[key] };
        });
    }

    function hostOf(url) {
        var m = /^https?:\/\/([^/?#]+)/i.exec(url || '');
        return m ? m[1] : (url || '');
    }

    function renderItem(it) {
        var row = document.createElement('div');
        row.className = 'status-item';

        var link = document.createElement('a');
        link.className = 'item-link';
        link.href = it.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = it.name || it.url;

        var host = document.createElement('span');
        host.className = 'item-host';
        host.textContent = hostOf(it.url);
        link.appendChild(host);

        var badge = document.createElement('span');
        badge.className = 'item-badge kind-' + it.kind;
        badge.textContent = KIND_LABEL[it.kind] + (it.detail ? ' · ' + it.detail : '');

        row.appendChild(link);
        row.appendChild(badge);
        return row;
    }

    function renderList(kind) {
        var rows = kind === 'all' ? items : items.filter(function (it) {
            return it.kind === kind;
        });

        listEl.innerHTML = '';

        if (!rows.length) {
            var box = document.createElement('div');
            box.className = 'status-empty';
            box.textContent = kind === 'all'
                ? '很好，没有发现打不开的站点。'
                : '这一类没有条目。';
            listEl.appendChild(box);
            return;
        }

        groupByCat(rows).forEach(function (group) {
            var wrap = document.createElement('section');
            wrap.className = 'status-group';

            var title = document.createElement('h2');
            title.className = 'group-title';
            title.textContent = group.cat;

            var count = document.createElement('span');
            count.className = 'group-count';
            count.textContent = group.rows.length + ' 个';
            title.appendChild(count);

            wrap.appendChild(title);
            group.rows.forEach(function (it) {
                wrap.appendChild(renderItem(it));
            });
            listEl.appendChild(wrap);
        });
    }

    /* ---------------- 筛选（带 hash，方便直接分享某一类） ---------------- */
    var VALID = ['all', 'dead', 'unknown', 'blocked', 'ok'];

    function setKind(kind) {
        if (VALID.indexOf(kind) === -1) kind = 'all';
        var buttons = filtersEl ? filtersEl.querySelectorAll('.filter-btn') : [];
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('is-active', buttons[i].getAttribute('data-kind') === kind);
        }
        renderList(kind);
        if (window.history && history.replaceState) {
            history.replaceState(null, '', kind === 'all' ? location.pathname : '#' + kind);
        }
    }

    if (filtersEl) {
        filtersEl.hidden = false;
        filtersEl.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('.filter-btn') : null;
            if (btn) setKind(btn.getAttribute('data-kind'));
        });
    }

    var initial = (location.hash || '').replace('#', '');
    setKind(initial);
})();
