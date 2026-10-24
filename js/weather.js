/* 左上角天气挂件
   - 坐标来自 js/ipinfo.js（IP 归属地反查结果），通过 geo:ready 事件传过来
   - 数据源：open-meteo（免 key，带 CORS）
   - 天气缓存 30 分钟，失败则隐藏挂件，不影响页面
   无第三方依赖。 */
(function () {
    var CACHE_KEY = 'superSearch.weather';
    var CACHE_TTL = 30 * 60 * 1000;

    var pill = document.getElementById('weather');
    var iconEl = document.getElementById('wx-icon');
    var tempEl = document.getElementById('wx-temp');
    var descEl = document.getElementById('wx-desc');
    var cityEl = document.getElementById('wx-city');
    if (!pill || !iconEl || !tempEl || !descEl || !cityEl) return;

    /* WMO 天气码 → [图标, 中文描述] */
    var WMO = {
        0: ['☀️', '晴'],
        1: ['🌤️', '晴间多云'],
        2: ['⛅', '多云'],
        3: ['☁️', '阴'],
        45: ['🌫️', '雾'],
        48: ['🌫️', '雾凇'],
        51: ['🌦️', '毛毛雨'],
        53: ['🌦️', '毛毛雨'],
        55: ['🌦️', '浓毛毛雨'],
        56: ['🌧️', '冻毛毛雨'],
        57: ['🌧️', '冻毛毛雨'],
        61: ['🌦️', '小雨'],
        63: ['🌧️', '中雨'],
        65: ['🌧️', '大雨'],
        66: ['🌧️', '冻雨'],
        67: ['🌧️', '强冻雨'],
        71: ['🌨️', '小雪'],
        73: ['🌨️', '中雪'],
        75: ['❄️', '大雪'],
        77: ['❄️', '米雪'],
        80: ['🌦️', '阵雨'],
        81: ['🌧️', '强阵雨'],
        82: ['⛈️', '暴雨'],
        85: ['🌨️', '阵雪'],
        86: ['❄️', '强阵雪'],
        95: ['⛈️', '雷阵雨'],
        96: ['⛈️', '雷阵雨伴冰雹'],
        99: ['⛈️', '强雷暴伴冰雹']
    };

    function describe(code) {
        return WMO[code] || ['🌡️', '未知'];
    }

    function readCache() {
        try {
            var pack = JSON.parse(localStorage.getItem(CACHE_KEY));
            if (pack && pack.t && pack.data && Date.now() - pack.t < CACHE_TTL) return pack.data;
        } catch (e) { /* 忽略损坏缓存 */ }
        return null;
    }

    function saveCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data }));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function render(data) {
        if (!data || typeof data.temp !== 'number') return;
        var meta = describe(data.code);

        iconEl.textContent = meta[0];
        tempEl.textContent = Math.round(data.temp) + '°';
        descEl.textContent = meta[1];
        cityEl.textContent = data.city ? '· ' + data.city : '';
        pill.title = (data.city ? data.city + ' · ' : '') + meta[1] +
            ' ' + Math.round(data.temp) + '°' + (data.isDay === false ? '（夜）' : '');

        pill.hidden = false;
        pill.classList.add('is-ready');
    }

    function fetchWeather(lat, lon, city) {
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
            '&longitude=' + lon +
            '&current=temperature_2m,weather_code,is_day' +
            '&timezone=auto';

        var ctrl = window.AbortController ? new AbortController() : null;
        var p = fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' })
            .then(function (r) {
                return r.ok ? r.json() : Promise.reject(new Error('bad status'));
            })
            .then(function (d) {
                var cur = d && d.current;
                if (!cur || typeof cur.temperature_2m !== 'number') throw new Error('no data');
                var data = {
                    temp: cur.temperature_2m,
                    code: cur.weather_code,
                    isDay: cur.is_day === 1,
                    city: city || ''
                };
                saveCache(data);
                render(data);
                return data;
            })
            .catch(function () { /* 天气拿不到就隐藏，不打扰页面 */ });

        if (ctrl) {
            setTimeout(function () {
                try { ctrl.abort(); } catch (e) {}
            }, 8000);
        }
        return p;
    }

    var started = false;

    /* 坐标到了就去取天气；缓存里的坐标直接复用 */
    window.addEventListener('geo:ready', function (e) {
        var d = e && e.detail;
        if (!d || typeof d.lat !== 'number' || typeof d.lon !== 'number') return;
        if (started) return;
        started = true;

        var cached = readCache();
        if (cached && cached.city === (d.city || '')) {
            render(cached);
            return;
        }
        fetchWeather(d.lat, d.lon, d.city);
    });

    /* ipinfo 缓存命中时事件会立刻派发；若 3 秒内没收到坐标，用天气缓存顶上 */
    setTimeout(function () {
        if (started) return;
        var cached = readCache();
        if (cached) render(cached);
    }, 3000);
})();
