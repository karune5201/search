/* 收纳面板：按数据渲染站点 / 过滤 / 页面内编辑
   数据来源：js/sites.js 的 window.SITE_DATA
   编辑结果暂存 localStorage（superSearch.sitesDraft），仅在本设备生效；
   要永久生效请直接改 js/sites.js。
   最近访问见 js/recent.js。无第三方依赖。
*/
(function () {
    var list = document.querySelector('.list');
    if (!list) return;

    var body = document.getElementById('panel-body');
    var filterInput = document.getElementById('panel-filter');
    var emptyTip = document.getElementById('panel-empty');
    var editBtn = document.getElementById('panel-edit');
    var editor = document.getElementById('panel-editor');
    var addForm = document.getElementById('site-add');
    var catSelect = document.getElementById('site-cat');
    var nameInput = document.getElementById('site-name');
    var urlInput = document.getElementById('site-url');
    var resetBtn = document.getElementById('site-reset');
    var dirtyTip = document.getElementById('site-dirty-tip');

    var DRAFT_KEY = 'superSearch.sitesDraft';
    var COLLAPSE_KEY = 'superSearch.collapsed';
    var NEW_CAT = '__new__';
    var editing = false;
    var collapsed = readCollapsed();

    /* ---------------- 折叠状态（本地记忆） ---------------- */
    function readCollapsed() {
        var map = {};
        try {
            var v = JSON.parse(localStorage.getItem(COLLAPSE_KEY));
            if (Object.prototype.toString.call(v) === '[object Array]') {
                for (var i = 0; i < v.length; i++) map[v[i]] = true;
            }
        } catch (e) { /* 忽略损坏数据 */ }
        return map;
    }

    function saveCollapsed() {
        var arr = [];
        for (var k in collapsed) {
            if (collapsed.hasOwnProperty(k) && collapsed[k]) arr.push(k);
        }
        try {
            localStorage.setItem(COLLAPSE_KEY, JSON.stringify(arr));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    /* 把折叠状态套到当前 DOM（分类标题的文字作为键） */
    function applyCollapseState() {
        var secs = list.querySelectorAll('.panel-sec');
        for (var i = 0; i < secs.length; i++) {
            var title = secs[i].querySelector('.title');
            if (!title) continue;
            var key = title.getAttribute('data-key');
            if (!key) continue;
            secs[i].classList.toggle('is-collapsed', !!collapsed[key]);
        }
    }

    /* 量出每个分类列表的真实高度，写进 --links-h，
       折叠时 max-height 才知道该从多少收缩（css/anim.css 用它做过渡） */
    function measureLinks() {
        var uls = list.querySelectorAll('.panel-links');
        for (var i = 0; i < uls.length; i++) {
            var ul = uls[i];
            // 折叠状态下量不到高度，先临时放开再量
            var collapsedNow = ul.parentNode && ul.parentNode.classList.contains('is-collapsed');
            if (collapsedNow) ul.style.maxHeight = 'none';
            var h = ul.scrollHeight;
            if (collapsedNow) ul.style.maxHeight = '';
            if (h) ul.style.setProperty('--links-h', h + 'px');
        }
    }

    /* ---------------- 数据 ---------------- */
    function clone(x) {
        return JSON.parse(JSON.stringify(x));
    }

    function readDraft() {
        try {
            var v = JSON.parse(localStorage.getItem(DRAFT_KEY));
            if (Object.prototype.toString.call(v) === '[object Array]' && v.length) return v;
        } catch (e) { /* 忽略损坏数据 */ }
        return null;
    }

    var state = readDraft() || clone(window.SITE_DATA || []);

    function saveDraft() {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function dropDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (e) { /* 忽略 */ }
    }

    function hasDraft() {
        try {
            return !!localStorage.getItem(DRAFT_KEY);
        } catch (e) {
            return false;
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function safeUrl(value) {
        var url = String(value || '').trim();
        return /^https?:\/\//i.test(url) ? url : '';
    }

    /* ---------------- 渲染 ---------------- */
    function render() {
        if (!body) return;
        var html = '';

        for (var i = 0; i < state.length; i++) {
            var c = state[i];
            html += '<section class="panel-sec' + (editing ? ' editing' : '') + '">';
            html += '<h3 class="title" data-key="' + escapeHtml(c.cat) + '">' +
                '<i class="panel-emoji">' + escapeHtml(c.emoji || '🔖') + '</i>' +
                escapeHtml(c.cat) +
                '<span class="sec-caret" aria-hidden="true">▾</span>' +
                '<span class="sec-count">' + c.sites.length + '</span>' +
                (editing ? '<button type="button" class="sec-del" data-cat="' + i + '" title="删除整个分类">×</button>' : '') +
                '</h3>';
            html += '<ul class="panel-links">';

            for (var j = 0; j < c.sites.length; j++) {
                var site = c.sites[j];
                var siteUrl = safeUrl(site[1]);
                if (!siteUrl) continue;
                html += '<li><a rel="nofollow noopener" target="_blank" title="' + escapeHtml(site[0]) +
                    '" href="' + escapeHtml(siteUrl) + '">' +
                    '<i class="iconfont icon-"></i>' + escapeHtml(site[0]) + '</a>' +
                    (editing ? '<button type="button" class="site-del" data-cat="' + i + '" data-idx="' + j +
                        '" title="删除">×</button>' : '') +
                    '</li>';
            }

            html += '</ul></section>';
        }

        body.innerHTML = html;

        if (dirtyTip) dirtyTip.hidden = !hasDraft();

        // 分类下拉同步
        if (catSelect) {
            var opts = '';
            for (var k = 0; k < state.length; k++) {
                opts += '<option value="' + k + '">' + escapeHtml(state[k].cat) + '</option>';
            }
            opts += '<option value="' + NEW_CAT + '">＋ 新建分类…</option>';
            catSelect.innerHTML = opts;
        }

        applyCollapseState();
        measureLinks();

        if (filterInput && filterInput.value) applyFilter();
    }

    /* ---------------- 过滤 ---------------- */
    function applyFilter() {
        if (!filterInput) return;

        var q = (filterInput.value || '').trim().toLowerCase();
        var secs = list.querySelectorAll('.panel-sec');
        var total = 0;

        for (var i = 0; i < secs.length; i++) {
            var sec = secs[i];
            var items = sec.querySelectorAll('.panel-links > li');
            var titleEl = sec.querySelector('.title');
            var secName = titleEl ? (titleEl.textContent || '').toLowerCase() : '';
            // 输入的就是分类名（如「網盤」「磁力」）时，整段都保留
            var secHit = !!q && secName.indexOf(q) !== -1;
            var shown = 0;

            for (var j = 0; j < items.length; j++) {
                var li = items[j];
                var text = (li.textContent || '').toLowerCase();
                var hit = !q || secHit || text.indexOf(q) !== -1;
                li.hidden = !hit;
                if (hit) shown++;
            }

            sec.hidden = shown === 0;
            total += shown;
        }

        if (emptyTip) emptyTip.hidden = total !== 0;

        // 有搜索词时强制展开所有分类，否则搜到的内容会被折叠挡住
        list.classList.toggle('filtering', !!q);
    }

    if (filterInput) {
        var allItems = state.reduce(function (n, c) {
            return n + c.sites.length;
        }, 0);
        filterInput.placeholder = '搜索站点…（' + allItems + ' 个）';
        filterInput.addEventListener('input', applyFilter);
        filterInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                this.value = '';
                applyFilter();
                this.blur();
                e.stopPropagation();
            }
        });
    }

    /* ---------------- 编辑态 ---------------- */
    function setEditing(on) {
        editing = on;
        if (editBtn) editBtn.textContent = on ? '完成' : '编辑';
        if (editor) editor.hidden = !on;
        list.classList.toggle('is-editing', on);
        render();
    }

    if (editBtn) {
        editBtn.addEventListener('click', function () {
            setEditing(!editing);
        });
    }

    // 点分类标题折叠 / 展开（点击删除按钮时不触发）
    list.addEventListener('click', function (e) {
        var title = e.target.closest ? e.target.closest('.title') : null;
        if (!title) return;
        if (e.target.closest('button')) return;

        var key = title.getAttribute('data-key');
        if (!key) return;

        var sec = title.parentNode;
        var nowCollapsed = !sec.classList.contains('is-collapsed');
        sec.classList.toggle('is-collapsed', nowCollapsed);
        collapsed[key] = nowCollapsed;
        saveCollapsed();
        measureLinks();
    });

    // 删除站点 / 删除分类（事件委托，重渲染后依然有效）
    if (body) {
        body.addEventListener('click', function (e) {
            var t = e.target;

            var del = t.closest ? t.closest('.site-del') : null;
            if (del) {
                e.preventDefault();
                var ci = parseInt(del.getAttribute('data-cat'), 10);
                var si = parseInt(del.getAttribute('data-idx'), 10);
                if (state[ci] && state[ci].sites[si]) {
                    state[ci].sites.splice(si, 1);
                    saveDraft();
                    render();
                }
                return;
            }

            var secDel = t.closest ? t.closest('.sec-del') : null;
            if (secDel) {
                e.preventDefault();
                var idx = parseInt(secDel.getAttribute('data-cat'), 10);
                var cat = state[idx];
                if (!cat) return;
                if (!cat.sites.length || window.confirm('删除分类「' + cat.cat + '」及其 ' + cat.sites.length + ' 个站点？')) {
                    state.splice(idx, 1);
                    saveDraft();
                    render();
                }
            }
        });
    }

    // 添加站点
    if (addForm) {
        addForm.addEventListener('submit', function (e) {
            e.preventDefault();

            var name = (nameInput.value || '').trim();
            var url = (urlInput.value || '').trim();
            if (!name || !url) return;

            // 没写协议就补 https://，并拒绝 javascript/data 等危险协议。
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            if (!safeUrl(url)) {
                window.alert('请输入有效的 http(s) 链接');
                return;
            }

            var val = catSelect.value;
            var target;

            if (val === NEW_CAT) {
                var catName = window.prompt('新分类名称：');
                if (!catName) return;
                var emoji = window.prompt('给这个分类一个 emoji 图标（可留空）：', '🔖') || '🔖';
                state.push({ cat: catName.trim(), emoji: emoji.trim(), sites: [] });
                target = state.length - 1;
            } else {
                target = parseInt(val, 10);
            }

            if (!state[target]) return;
            state[target].sites.push([name, url]);
            saveDraft();
            render();

            nameInput.value = '';
            urlInput.value = '';
            if (catSelect) catSelect.value = String(target);
            nameInput.focus();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            if (!window.confirm('放弃所有本地修改，恢复 js/sites.js 的内容？')) return;
            dropDraft();
            state = clone(window.SITE_DATA || []);
            render();
        });
    }

    /* 供主页「随便逛逛」读取当前数据（包含本机未提交的编辑） */
    window.SuperSearchPanel = {
        getSites: function () {
            return clone(state);
        }
    };

    /* ---------------- 初始化 ---------------- */
    render();

    /* 最近访问由 js/recent.js 渲染，数据更新后重新套用过滤并重量高度 */
    window.addEventListener('recent:update', function () {
        measureLinks();
        applyFilter();
    });

    /* 窗口尺寸变化后高度会变，重新量一次（防抖） */
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(measureLinks, 200);
    });
})();
