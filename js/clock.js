/* 主界面时间 / 日期 / 问候语，数字变化时逐位翻牌 */
(function () {
    var clockEl = document.getElementById('greet-clock');
    var dateEl = document.getElementById('greet-date');
    var greetEl = document.getElementById('greet-text');
    if (!clockEl && !dateEl && !greetEl) return;

    var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var lastTime = '';
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function greeting(h) {
        if (h < 5) return '夜深了，早点睡';
        if (h < 9) return '早上好';
        if (h < 12) return '上午好';
        if (h < 14) return '中午好';
        if (h < 18) return '下午好';
        if (h < 23) return '晚上好';
        return '夜深了，早点睡';
    }

    function makeFace(className, text) {
        var face = document.createElement('span');
        face.className = className;
        face.textContent = text;
        return face;
    }

    function renderTime(next) {
        if (!clockEl || next === lastTime) return;
        var old = lastTime;
        clockEl.setAttribute('aria-label', '当前时间 ' + next);
        clockEl.setAttribute('role', 'img');
        if (!old) clockEl.textContent = '';

        for (var i = 0; i < next.length; i++) {
            var ch = next.charAt(i);
            var cell = clockEl.children[i];
            if (!cell) {
                cell = document.createElement('span');
                cell.className = ch === ':' ? 'time-colon' : 'flip-cell';
                cell.textContent = ch;
                clockEl.appendChild(cell);
                continue;
            }
            if (old.charAt(i) === ch) continue;

            if (ch === ':') {
                cell.className = 'time-colon';
                cell.textContent = ch;
                continue;
            }

            if (reduceMotion) {
                cell.className = 'flip-cell';
                cell.textContent = ch;
                continue;
            }

            cell.className = 'flip-cell is-flipping';
            cell.innerHTML = '';
            cell.appendChild(makeFace('flip-face flip-old', old.charAt(i)));
            var nextFace = makeFace('flip-face flip-new', ch);
            cell.appendChild(nextFace);
            (function (parent, face, value) {
                function finish() {
                    face.removeEventListener('animationend', finish);
                    if (!parent) return;
                    parent.textContent = value;
                    parent.classList.remove('is-flipping');
                }
                face.addEventListener('animationend', finish);
            })(cell, nextFace, ch);
        }
        lastTime = next;
    }

    function tick() {
        var d = new Date();
        var time = pad(d.getHours()) + ':' + pad(d.getMinutes());
        renderTime(time);
        if (dateEl) {
            dateEl.textContent = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' +
                d.getDate() + ' 日 · ' + WEEK[d.getDay()];
        }
        if (greetEl) greetEl.textContent = greeting(d.getHours());
    }

    tick();
    // 分钟级显示，每 10 秒检查一次即可
    setInterval(tick, 10000);
})();
