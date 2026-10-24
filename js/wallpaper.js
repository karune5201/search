/* 随机壁纸（每次刷新都换一张）
   为什么之前不换了：CSS 里写死的图片地址会被浏览器缓存，同一个 URL 永远拿到同一张。
   这里在地址后面加时间戳，并从多个源随机挑选，加载成功后才替换背景，
   失败就顺延下一个源，全部失败则保留 CSS 里的渐变兜底。
   无第三方依赖。 */
(function () {
    var bg = document.querySelector('.bgo');
    if (!bg) return;

    var GRADIENT = 'linear-gradient(160deg, #2b3a55 0%, #1a1d24 55%, #0f1115 100%)';

    /* 桌面用大图，移动端优先小体积图源 */
    var DESKTOP = [
        'https://www.dmoe.cc/random.php',
        'https://t.alcy.cc/ycy',
        'https://app.zichen.zone/api/acg/api.php'
    ];
    var MOBILE = [
        'https://t.alcy.cc/ycy',
        'https://app.zichen.zone/api/acg/api.php',
        'https://www.dmoe.cc/random.php'
    ];

    function pickSources() {
        var mobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        return (mobile ? MOBILE : DESKTOP).slice();
    }

    /* 打乱顺序：不总是从第一个源开始请求，顺便避开单个源的限流 */
    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
        }
        return arr;
    }

    /* 加时间戳，绕开浏览器缓存，这样每次刷新都是新图 */
    function cacheBust(url) {
        var sep = url.indexOf('?') > -1 ? '&' : '?';
        return url + sep + '_=' + Date.now() + Math.floor(Math.random() * 1e6);
    }

    var sources = shuffle(pickSources());
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
