/* 访客 IP / 归属地 —— 显示在页脚「本站已运行」上一行
   - 只显示 IPv4：v4.ident.me（强制 IPv4，附带坐标），失败回退 api.ip.sb
   - 中文地名：ip.zxinc.org（国内外都回中文），失败则用内置国家对照表
   - 拿到坐标后派发 geo:ready，供 js/weather.js 取天气
   - 缓存 6 小时；点一下复制 IP 并刷新；拿不到就整行隐藏
   无第三方依赖。 */
(function () {
    var CACHE_KEY = 'superSearch.ipinfo';
    var CACHE_TTL = 6 * 3600 * 1000;

    var line = document.getElementById('ip-line');
    var v4El = document.getElementById('ip-v4');
    var tagEl = document.getElementById('ip-tag');
    var locEl = document.getElementById('ip-loc');
    if (!line || !v4El || !tagEl || !locEl) return;

    /* 国家名兜底翻译（中文库拿不到时才用） */
    var COUNTRY_ZH = {
        CN: '中国', JP: '日本', KR: '韩国', US: '美国', GB: '英国', HK: '中国香港',
        TW: '中国台湾', MO: '中国澳门', SG: '新加坡', MY: '马来西亚', TH: '泰国',
        VN: '越南', PH: '菲律宾', ID: '印度尼西亚', IN: '印度', AU: '澳大利亚',
        NZ: '新西兰', CA: '加拿大', DE: '德国', FR: '法国', NL: '荷兰', RU: '俄罗斯',
        IT: '意大利', ES: '西班牙', SE: '瑞典', NO: '挪威', FI: '芬兰', DK: '丹麦',
        CH: '瑞士', AT: '奥地利', BE: '比利时', IE: '爱尔兰', PL: '波兰', TR: '土耳其',
        BR: '巴西', AR: '阿根廷', MX: '墨西哥', AE: '阿联酋', SA: '沙特阿拉伯',
        IL: '以色列', ZA: '南非', EG: '埃及', UA: '乌克兰', CZ: '捷克', PT: '葡萄牙'
    };

    function isIPv4(s) {
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(s || '');
    }

    function readCache() {
        try {
            var pack = JSON.parse(localStorage.getItem(CACHE_KEY));
            // 结构对不上（比如以前存过 IPv6 版本）就当没缓存
            if (pack && pack.t && pack.info && pack.info.ipv4 && Date.now() - pack.t < CACHE_TTL) {
                return pack.info;
            }
        } catch (e) { /* 忽略损坏缓存 */ }
        return null;
    }

    function saveCache(info) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), info: info }));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function getJSON(url, timeout) {
        var ctrl = window.AbortController ? new AbortController() : null;
        var opt = { cache: 'no-store', headers: { Accept: 'application/json' } };
        if (ctrl) opt.signal = ctrl.signal;

        var p = fetch(url, opt).then(function (r) {
            return r.ok ? r.json() : Promise.reject(new Error('bad status'));
        });
        if (ctrl) {
            setTimeout(function () {
                try { ctrl.abort(); } catch (e) {}
            }, timeout || 7000);
        }
        return p;
    }

    /* ---------- 取 IPv4 + 坐标 ---------- */
    function fetchIPv4() {
        return getJSON('https://v4.ident.me/json').then(function (d) {
            if (!d || !isIPv4(d.ip)) return Promise.reject(new Error('not ipv4'));
            return {
                ip: d.ip,
                cc: (d.cc || '').toUpperCase(),
                country: d.country || '',
                city: d.city || '',
                lat: typeof d.latitude === 'number' ? d.latitude : null,
                lon: typeof d.longitude === 'number' ? d.longitude : null
            };
        }).catch(function () {
            // 兜底：ip.sb 直接给 IPv4 地址和坐标
            return getJSON('https://api.ip.sb/geoip').then(function (g) {
                var ip = g && g.ip;
                if (!isIPv4(ip)) return Promise.reject(new Error('not ipv4'));
                return {
                    ip: ip,
                    cc: (g.country_code || '').toUpperCase(),
                    country: g.country || '',
                    city: g.city || '',
                    lat: typeof g.latitude === 'number' ? g.latitude : null,
                    lon: typeof g.longitude === 'number' ? g.longitude : null
                };
            });
        }).catch(function () {
            return null;
        });
    }

    /* ---------- 中文归属地（zxinc 返回「国家–省–市 运营商」） ---------- */
    function fetchZhPlace(ip) {
        var url = 'https://ip.zxinc.org/api.php?type=json&ip=' + encodeURIComponent(ip) +
            '&_=' + Date.now();
        return getJSON(url).then(function (d) {
            var loc = d && d.data && d.data.location;
            if (!loc) return null;
            var raw = String(loc).trim();

            var segs = raw.split(/[–—-]/).map(function (s) { return s.trim(); }).filter(Boolean);
            var last = segs.length ? segs[segs.length - 1] : '';
            var isp = '';
            var spaceAt = last.indexOf(' ');
            if (spaceAt > 0) {
                isp = last.slice(spaceAt + 1).trim();
                segs[segs.length - 1] = last.slice(0, spaceAt).trim();
            }
            return {
                country: segs[0] || '',
                province: segs.length > 2 ? segs[1] : '',
                city: segs.length > 2 ? segs[2] : (segs[1] || ''),
                isp: isp
            };
        }).catch(function () {
            return null;
        });
    }

    function joinPlace(geo, place) {
        var parts = [];
        var push = function (v) {
            v = (v || '').trim();
            if (v && parts.indexOf(v) === -1) parts.push(v);
        };

        // 显示成「国家 城市」，例如「日本 东京」「中国 贵阳」
        if (place) {
            push(place.country);
            push(place.city || place.province);
        } else if (geo) {
            push(COUNTRY_ZH[geo.cc] || geo.country);
            push(geo.city);
        }
        return parts.join(' · ');
    }

    function render(info) {
        if (!info || !info.ipv4) return;

        var geo = info.ipv4;
        var isCN = String(geo.cc || '').toUpperCase() === 'CN' ||
            (info.place && /中国|China/i.test(info.place.country || ''));
        var place = joinPlace(geo, info.place);

        v4El.textContent = geo.ip;
        // 标签里直接放「国家 城市」，国内/海外由标签颜色区分
        tagEl.textContent = place || (isCN ? '国内' : '海外');
        tagEl.className = 'ip-tag ' + (isCN ? 'is-cn' : 'is-abroad');
        locEl.textContent = '';
        line.classList.toggle('abroad', !isCN);

        var isp = info.place && info.place.isp;
        var country = (info.place && info.place.country) ||
            COUNTRY_ZH[geo.cc] || geo.country || '';
        line.title = 'IPv4：' + geo.ip +
            '\n归属：' + (isCN ? '国内' : '海外') +
            (country ? ' · ' + country : '') + (place ? ' · ' + place : '') +
            (isp ? ' · ' + isp : '') +
            '\n点击刷新并复制';

        line.hidden = false;
        line.classList.add('is-ready');
    }

    function broadcast(info) {
        if (!window.dispatchEvent || !window.CustomEvent) return;
        var geo = info && info.ipv4;
        if (!geo || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') return;
        var city = (info.place && info.place.city) || geo.city || '';
        window.dispatchEvent(new window.CustomEvent('geo:ready', {
            detail: { lat: geo.lat, lon: geo.lon, city: city }
        }));
    }

    var loading = false;

    function load(force) {
        if (loading) return;

        if (!force) {
            var cached = readCache();
            if (cached) {
                render(cached);
                broadcast(cached);
                return;
            }
        }

        loading = true;

        fetchIPv4().then(function (geo) {
            if (!geo) return Promise.reject(new Error('no ip'));
            return fetchZhPlace(geo.ip).then(function (place) {
                return { ipv4: geo, place: place };
            });
        }).then(function (info) {
            loading = false;
            saveCache(info);
            render(info);
            broadcast(info);
        }).catch(function () {
            loading = false;
            var old = readCache();
            if (old) {
                render(old);
                broadcast(old);
            } else {
                line.hidden = true;
            }
        });
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () { /* 忽略 */ });
            return;
        }
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
        document.body.removeChild(ta);
    }

    line.addEventListener('click', function () {
        var cached = readCache();
        var ip = (cached && cached.ipv4 && cached.ipv4.ip) || v4El.textContent;
        if (!ip || !isIPv4(ip)) return;

        copyText(ip);

        var original = locEl.textContent;
        locEl.textContent = '· 已复制 IP';
        setTimeout(function () {
            if (locEl.textContent === '· 已复制 IP') locEl.textContent = original;
        }, 1400);

        load(true);
    });

    // 页面加载就强制拉一次：换 IP、换网络后刷新能立刻看到新结果；
    // localStorage 里的缓存只在请求失败时兜底
    load(true);
})();
