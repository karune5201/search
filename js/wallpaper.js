/* 随机壁纸（每次刷新都换一张，手机 / 电脑分开用不同接口）
   - 电脑：t.alcy.cc/pc（横屏大图）
   - 手机：t.alcy.cc/mp（竖屏手机壁纸）
   - 为什么之前不换：CSS 里写死的图片地址会被浏览器缓存，同一个 URL 永远同一张。
     这里在地址后面加时间戳，加载成功后才替换背景，失败就顺延下一个源，
     全部失败则保留 CSS 里的渐变兜底。
   无第三方依赖。 */
(function () {
    var bg = document.querySelector('.bgo');
    if (!bg) return;

    var GRADIENT = 'linear-gradient(160deg, #2b3a55 0%, #1a1d24 55%, #0f1115 100%)';

    /* 第一项就是该设备的主力接口，后面是失败时的备用源 */
    var SOURCES = {
        // 电脑：横屏壁纸
        desktop: [
            'https://t.alcy.cc/pc',
            'https://www.dmoe.cc/random.php',
            'https://www.loliapi.com/bg/'
        ],
        // 手机：竖屏壁纸
        mobile: [
            'https://t.alcy.cc/mp',
            'https://www.loliapi.com/bg/',
            'https://www.dmoe.cc/random.php'
        ]
    };

    /* 手机判定：窄屏即手机；宽屏平板/电脑走电脑接口（横屏图更适合铺满） */
    function isMobile() {
        if (window.matchMedia) {
            if (window.matchMedia('(max-width: 768px)').matches) return true;
            // 小屏触屏设备（横屏时宽度可能超过 768）
            if (window.matchMedia('(pointer: coarse)').matches &&
                window.matchMedia('(max-height: 500px)').matches) return true;
        }
        return window.innerWidth <= 768;
    }

    function pickSources() {
        return (isMobile() ? SOURCES.mobile : SOURCES.desktop).slice();
    }

    /* 加时间戳，绕开浏览器缓存，这样每次刷新都是新图 */
    function cacheBust(url) {
        var sep = url.indexOf('?') > -1 ? '&' : '?';
        return url + sep + '_=' + Date.now() + Math.floor(Math.random() * 1e6);
    }

    var sources = pickSources();
    var index = 0;

    function tryNext() {
        if (index >= sources.length) return;  // 全失败：保留 CSS 默认渐变，不白屏
        var url = cacheBust(sources[index++]);
        var img = new Image();
        var settled = false;

        var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            tryNext();
        }, 12000);

        img.onload = function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // 保留渐变作为第二层，图片解码失败也不会露白
            bg.style.backgroundImage = 'url("' + url + '"), ' + GRADIENT;
        };

        img.onerror = function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            tryNext();
        };

        img.src = url;
    }

    tryNext();
})();
