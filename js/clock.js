/* 时间块：三种样式，点一下轮换一种，三种都逐位翻牌
   flip（默认）问候 + 上下分行大时钟 + 星期 / 日期
   line        Iconify clock_3：一行 HH:mm（100dp 粗体）+ 上方英文日期，无背景无模糊
   online      线上现行样式：问候 / 46px 时间（带秒）/ 中文日期，三行纯文字
   有冒号的样式（line / online）冒号跟着秒闪；秒只在 online 里显示
   点时间块循环切换，选择存在 localStorage 的 dsh-clock-look 里 */
(function () {
    var hourEl = document.getElementById('greet-hour');
    var minuteEl = document.getElementById('greet-minute');
    var hourDigits = hourEl ? hourEl.querySelectorAll('.flip-digit') : [];
    var minuteDigits = minuteEl ? minuteEl.querySelectorAll('.flip-digit') : [];
    var secondEl = document.getElementById('greet-second');
    var secondDigits = secondEl ? secondEl.querySelectorAll('.flip-digit') : [];
    var clockEl = document.getElementById('greet-clock');
    var weekdayEl = document.getElementById('greet-weekday-long');
    var dateEl = document.getElementById('greet-monthday-short');
    var greetEl = document.getElementById('greet-text');
    var dateLineEl = document.getElementById('greet-date-line');
    var dateFullEl = document.getElementById('greet-date-full');
    var heroEl = document.querySelector('.hero-greet');

    if (!hourEl && !minuteEl && !greetEl) return;

    document.documentElement.setAttribute('data-clock-style', 'lockscreen');

    var LOOK_KEY = 'dsh-clock-look';
    var LOOKS = ['flip', 'line', 'online'];
    var LOOK_NAME = { flip: '翻牌时钟', line: '单行时钟', online: '线上样式' };
    var look = 'flip';

    try {
        var saved = localStorage.getItem(LOOK_KEY);
        if (LOOKS.indexOf(saved) >= 0) look = saved;
    } catch (e) {
        look = 'flip';
    }

    function applyLook() {
        document.documentElement.setAttribute('data-clock-look', look);
        if (!heroEl) return;
        var next = LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length];
        heroEl.setAttribute('role', 'button');
        heroEl.setAttribute('tabindex', '0');
        heroEl.setAttribute('title', '点击切换到' + LOOK_NAME[next]);
        heroEl.setAttribute('aria-label', LOOK_NAME[look] + '，点击切换到' + LOOK_NAME[next]);
    }

    applyLook();

    function toggleLook() {
        look = LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length];
        try {
            localStorage.setItem(LOOK_KEY, look);
        } catch (e) { /* 隐私模式下忽略 */ }
        applyLook();
        firstPaint = true;
        tick();
        firstPaint = false;
    }

    if (heroEl) {
        heroEl.addEventListener('click', toggleLook);
        heroEl.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
                ev.preventDefault();
                toggleLook();
            }
        });
    }

    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    // 按小时给问候；周末白天换一句，夜里统一劝睡
    function greeting(h, day) {
        var weekend = day === 0 || day === 6;
        if (h < 5) return '夜深了，早点睡';
        if (h < 7) return '天快亮了';
        if (h < 9) return weekend ? '周末早呀' : '早上好';
        if (h < 11) return weekend ? '周末愉快' : '上午好';
        if (h < 13) return '中午好';
        if (h < 17) return weekend ? '周末愉快' : '下午好';
        if (h < 19) return '傍晚好';
        if (h < 23) return weekend ? '周末晚上好' : '晚上好';
        return '夜深了，早点睡';
    }

    var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var lastGreeting = '';
    var firstPaint = true;

    // 单个数字翻牌：先向下翻出，翻到 90° 时换字，再翻回来
    function flipDigit(el, ch) {
        if (!el || el.textContent === ch) return;

        // 首次铺值不翻，之后三种样式都翻
        if (firstPaint) {
            el.textContent = ch;
            return;
        }

        // 上一次没跑完的动画先收掉，避免两次翻牌互相打架
        if (el._flipEnter) clearTimeout(el._flipEnter);
        if (el._flipLeave) clearTimeout(el._flipLeave);

        el.classList.remove('is-in');
        el.classList.add('is-out');

        el._flipEnter = setTimeout(function () {
            el.textContent = ch;
            el.classList.remove('is-out');
            // 强制回流，保证 in 动画每次都重新播放
            void el.offsetWidth;
            el.classList.add('is-in');
        }, 150);

        el._flipLeave = setTimeout(function () {
            el.classList.remove('is-in');
        }, 460);
    }

    function tick() {
        var d = new Date();
        var hh = pad(d.getHours());
        var mm = pad(d.getMinutes());
        var ss = pad(d.getSeconds());

        if (hourDigits.length === 2) {
            flipDigit(hourDigits[0], hh.charAt(0));
            flipDigit(hourDigits[1], hh.charAt(1));
        } else if (hourEl) {
            hourEl.textContent = hh;
        }

        if (minuteDigits.length === 2) {
            flipDigit(minuteDigits[0], mm.charAt(0));
            flipDigit(minuteDigits[1], mm.charAt(1));
        } else if (minuteEl) {
            minuteEl.textContent = mm;
        }

        if (secondDigits.length === 2) {
            flipDigit(secondDigits[0], ss.charAt(0));
            flipDigit(secondDigits[1], ss.charAt(1));
        } else if (secondEl) {
            secondEl.textContent = ss;
        }

        if (clockEl) clockEl.setAttribute('aria-label', '当前时间 ' + hh + ':' + mm + ':' + ss);

        if (weekdayEl) weekdayEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long' });
        if (dateEl) dateEl.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dateLineEl) {
            dateLineEl.textContent = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' +
                d.getDate() + ' 日 · ' + WEEK[d.getDay()];
        }
        if (dateFullEl) {
            // 对应 clock_3 的 format24Hour="EEEE, dd MMMM"
            dateFullEl.textContent = d.toLocaleDateString('en-GB', { weekday: 'long' }) + ', ' +
                pad(d.getDate()) + ' ' + d.toLocaleDateString('en-GB', { month: 'long' });
        }

        if (greetEl) {
            var g = greeting(d.getHours(), d.getDay());
            if (g !== lastGreeting) {
                greetEl.textContent = g;
                lastGreeting = g;
            }
        }
    }

    tick();
    firstPaint = false;
    setInterval(tick, 1000);
})();
