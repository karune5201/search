/* 页脚运行时间（修正原版 &nbsp 缺分号 / 隐式全局变量 / 日期字符串解析不可靠的问题） */
(function () {
    var startTime = new Date('2019-08-31T00:00:00');

    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function update() {
        // 每次取节点：脚本可能在页脚解析之前执行
        var dateEl = document.getElementById('timeDate');
        var timeEl = document.getElementById('times');
        if (!dateEl || !timeEl) return;

        var diff = Math.max(0, Date.now() - startTime.getTime()) / 1000;
        var days = Math.floor(diff / 86400);
        var hours = Math.floor((diff % 86400) / 3600);
        var minutes = Math.floor((diff % 3600) / 60);
        var seconds = Math.floor(diff % 60);

        dateEl.textContent = '本站已运行 ' + days + ' 天';
        timeEl.textContent = pad(hours) + ' 小时 ' + pad(minutes) + ' 分 ' + pad(seconds) + ' 秒';
    }

    function start() {
        update();
        setInterval(update, 1000);
    }

    // 原版在 DOM 就绪前执行，取不到页脚节点就直接 return，页脚永远停在“载入天数…”
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
