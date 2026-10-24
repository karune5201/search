/* 侧边站点导航开关（原生 JS，无第三方依赖）
   附带：遮罩点击关闭、Esc 关闭、Ctrl/Cmd+K 与 / 聚焦搜索、过滤框自动聚焦
*/
(function () {
    var menu = document.getElementById('menu');
    var list = document.querySelector('.list');
    if (!menu || !list) return;

    var mask = document.getElementById('panel-mask');
    var panelFilter = document.getElementById('panel-filter');
    var searchInput = document.getElementById('search-text');

    function isOpen() {
        return menu.classList.contains('on');
    }

    function toggle(force) {
        var open = typeof force === 'boolean' ? force : !isOpen();

        menu.classList.toggle('on', open);
        list.classList.toggle('closed', !open);
        menu.setAttribute('aria-expanded', open ? 'true' : 'false');
        menu.setAttribute('aria-label', open ? '关闭站点导航' : '打开站点导航');
        if (mask) mask.classList.toggle('show', open);

        if (open) {
            // 打开后直接可以输入过滤，省掉一次点击
            if (panelFilter && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
                setTimeout(function () {
                    if (isOpen()) panelFilter.focus();
                }, 320);
            }
        } else if (panelFilter && document.activeElement === panelFilter) {
            panelFilter.blur();
        }
    }

    menu.addEventListener('click', function () {
        toggle();
    });

    // 键盘可用：Enter / 空格 开关，Esc 关闭
    menu.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggle();
        }
    });

    if (mask) {
        mask.addEventListener('click', function () {
            toggle(false);
        });
    }

    function isInsideInput(el) {
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    }

    document.addEventListener('keydown', function (e) {
        // Esc：面板开着就关面板
        if (e.key === 'Escape') {
            if (isOpen()) toggle(false);
            return;
        }

        // Ctrl/Cmd + K，或单独的 / ：聚焦搜索框（面板开着时聚焦过滤框）
        var isSlash = e.key === '/' && !isInsideInput(e.target);
        var isCmdK = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);

        if (isSlash || isCmdK) {
            e.preventDefault();
            if (isOpen() && panelFilter) {
                panelFilter.focus();
            } else if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    // 桌面端打开页面即聚焦搜索框；移动端不聚焦，避免一进来就弹键盘
    if (searchInput && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        searchInput.focus();
    }

    // 收纳面板里名称过长会被省略号截断，这里补上 title，悬停可看全称
    var links = list.querySelectorAll('li a');
    for (var i = 0; i < links.length; i++) {
        var label = links[i].textContent.replace(/\s+/g, ' ').trim();
        if (label) links[i].title = label;
    }
})();
