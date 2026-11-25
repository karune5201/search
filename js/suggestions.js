/* Search suggestions: local history + site labels + optional engine suggestions. */
(function () {
    var input = document.getElementById('search-text');
    var form = document.getElementById('super-search-fm');
    var list = document.getElementById('ul');
    if (!input || !form || !list) return;

    var HISTORY_KEY = 'superSearch.queryHistory';
    var HISTORY_LIMIT = 12;
    var SUGGEST_DELAY = 180;
    var MAX_ITEMS = 8;
    var timer = null;
    var requestId = 0;
    var activeIndex = -1;
    var composing = false;
    var currentItems = [];
    var endpoints = {
        'https://google.com/search?q=': function (q) {
            return 'https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(q);
        },
        'https://bing.com/search?q=': function (q) {
            return 'https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(q);
        },
        'https://duckduckgo.com/?q=': function (q) {
            return 'https://duckduckgo.com/ac/?q=' + encodeURIComponent(q) + '&type=list';
        }
    };

    function readHistory() {
        try {
            var value = JSON.parse(localStorage.getItem(HISTORY_KEY));
            return Array.isArray(value) ? value.filter(function (x) { return typeof x === 'string'; }) : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(query) {
        var values = readHistory().filter(function (x) { return x.toLowerCase() !== query.toLowerCase(); });
        values.unshift(query);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(values.slice(0, HISTORY_LIMIT))); } catch (e) {}
    }

    function selectedEngine() {
        var node = document.querySelector('input[name="type"]:checked');
        return node ? node.value : '';
    }

    function getSiteLabels() {
        var data = window.SuperSearchPanel && window.SuperSearchPanel.getSites ?
            window.SuperSearchPanel.getSites() : (window.SITE_DATA || []);
        var labels = [];
        for (var i = 0; i < data.length; i++) {
            var sites = data[i] && data[i].sites || [];
            for (var j = 0; j < sites.length; j++) {
                if (sites[j] && typeof sites[j][0] === 'string') labels.push(sites[j][0]);
            }
        }
        return labels;
    }

    function localSuggestions(query) {
        var q = query.toLowerCase();
        var matches = [];
        readHistory().forEach(function (text) {
            if (text.toLowerCase().indexOf(q) !== -1) matches.push({ text: text, source: '搜索历史' });
        });
        getSiteLabels().forEach(function (text) {
            if (text.toLowerCase().indexOf(q) !== -1 && !matches.some(function (item) { return item.text === text; })) {
                matches.push({ text: text, source: '站点' });
            }
        });
        return matches.slice(0, MAX_ITEMS);
    }

    function parseRemote(data, engine) {
        var values = [];
        if (engine === 'https://google.com/search?q=' && Array.isArray(data) && Array.isArray(data[1])) {
            values = data[1];
        } else if (engine === 'https://bing.com/search?q=' && Array.isArray(data) && Array.isArray(data[1])) {
            values = data[1];
        } else if (engine === 'https://duckduckgo.com/?q=' && Array.isArray(data)) {
            values = data.map(function (x) { return x && x.phrase; });
        }
        return values.filter(function (x) { return typeof x === 'string' && x.trim(); })
            .map(function (text) { return { text: text.trim(), source: '联网联想' }; });
    }

    function remoteSuggestions(query, id) {
        var engine = selectedEngine();
        var buildUrl = endpoints[engine];
        if (!buildUrl || !window.fetch) return Promise.resolve([]);
        var controller = window.AbortController ? new AbortController() : null;
        var options = { method: 'GET', mode: 'cors', credentials: 'omit' };
        if (controller) options.signal = controller.signal;
        var timeout = setTimeout(function () { if (controller) controller.abort(); }, 2500);
        return fetch(buildUrl(query), options).then(function (response) {
            if (!response.ok) throw new Error('suggestion request failed');
            return response.json();
        }).then(function (data) {
            if (id !== requestId) return [];
            return parseRemote(data, engine);
        }).catch(function () { return []; }).then(function (items) {
            clearTimeout(timeout);
            return items;
        });
    }

    function render(items) {
        currentItems = items.slice(0, MAX_ITEMS);
        activeIndex = -1;
        list.textContent = '';
        if (!currentItems.length) {
            close();
            return;
        }
        currentItems.forEach(function (item, index) {
            var li = document.createElement('li');
            li.className = 'wei suggestion-item';
            li.setAttribute('role', 'option');
            li.setAttribute('id', 'search-suggestion-' + index);
            li.setAttribute('aria-selected', 'false');
            var label = document.createElement('span');
            label.className = 'suggestion-text';
            label.textContent = item.text;
            var source = document.createElement('small');
            source.className = 'suggestion-source';
            source.textContent = item.source;
            li.appendChild(label);
            li.appendChild(source);
            li.addEventListener('mousedown', function (event) { event.preventDefault(); });
            li.addEventListener('click', function () {
                input.value = item.text;
                close();
                form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
            list.appendChild(li);
        });
        list.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
    }

    function close() {
        list.style.display = 'none';
        list.textContent = '';
        currentItems = [];
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        activeIndex = -1;
    }

    function updateActive(delta) {
        if (!currentItems.length) return;
        activeIndex = (activeIndex + delta + currentItems.length) % currentItems.length;
        var options = list.querySelectorAll('[role="option"]');
        for (var i = 0; i < options.length; i++) {
            var active = i === activeIndex;
            options[i].setAttribute('aria-selected', active ? 'true' : 'false');
            options[i].classList.toggle('is-active', active);
        }
        input.setAttribute('aria-activedescendant', 'search-suggestion-' + activeIndex);
        input.value = currentItems[activeIndex].text;
    }

    function schedule() {
        clearTimeout(timer);
        var id = ++requestId;
        var query = input.value.trim();
        if (!query) { close(); return; }
        timer = setTimeout(function () {
            var local = localSuggestions(query);
            render(local);
            remoteSuggestions(query, id).then(function (remote) {
                if (id !== requestId || input.value.trim() !== query) return;
                var merged = local.slice();
                remote.forEach(function (item) {
                    if (merged.length < MAX_ITEMS && !merged.some(function (x) { return x.text.toLowerCase() === item.text.toLowerCase(); })) merged.push(item);
                });
                render(merged);
            });
        }, SUGGEST_DELAY);
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'ul');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('compositionstart', function () { composing = true; });
    input.addEventListener('compositionend', function () { composing = false; schedule(); });
    input.addEventListener('input', function () { if (!composing) schedule(); });
    input.addEventListener('keydown', function (event) {
        if (event.isComposing || composing) return;
        if (event.key === 'ArrowDown' && currentItems.length) { event.preventDefault(); updateActive(1); }
        else if (event.key === 'ArrowUp' && currentItems.length) { event.preventDefault(); updateActive(-1); }
        else if (event.key === 'Escape') close();
        else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
    });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    form.addEventListener('submit', function () {
        var query = input.value.trim();
        if (query) saveHistory(query);
    }, true);
})();
