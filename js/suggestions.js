/* Search suggestions: local saved query history only. */
(function () {
    var input = document.getElementById('search-text');
    var form = document.getElementById('super-search-fm');
    var list = document.getElementById('ul');
    if (!input || !form || !list) return;

    var HISTORY_KEY = 'superSearch.queryHistory';
    var HISTORY_LIMIT = 5;
    var MAX_ITEMS = 5;
    var SUGGEST_DELAY = 80;
    var timer = null;
    var requestId = 0;
    var activeIndex = -1;
    var composing = false;
    var currentItems = [];
    var inlineHint = document.createElement('span');
    inlineHint.className = 'search-inline-hint';
    inlineHint.setAttribute('aria-hidden', 'true');
    form.appendChild(inlineHint);
    var measureCanvas = document.createElement('canvas');
    var measureContext = measureCanvas.getContext && measureCanvas.getContext('2d');
    function readHistory() {
        try {
            var value = JSON.parse(localStorage.getItem(HISTORY_KEY));
            return Array.isArray(value) ? value.filter(function (x) { return typeof x === 'string' && x.trim(); }) : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(query) {
        var values = readHistory().filter(function (x) { return x.toLowerCase() !== query.toLowerCase(); });
        values.unshift(query);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(values.slice(0, HISTORY_LIMIT))); } catch (e) {}
    }

    function removeHistory(query) {
        var values = readHistory().filter(function (x) { return x.toLowerCase() !== query.toLowerCase(); });
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(values)); } catch (e) {}
    }
    function localSuggestions(query) {
        var q = query.toLowerCase();
        return readHistory().filter(function (text) {
            return text.toLowerCase().indexOf(q) !== -1;
        }).slice(0, MAX_ITEMS).map(function (text) {
            return { text: text, source: '本地搜索记录' };
        });
    }

    function renderInlineHint(query, items) {
        inlineHint.textContent = '';
        if (!query || query !== query.trim() || document.activeElement !== input) return;
        var match = items.find(function (item) {
            return item.text.toLowerCase().indexOf(query.toLowerCase()) === 0 && item.text.length > query.length;
        });
        if (!match) return;
        var style = window.getComputedStyle ? window.getComputedStyle(input) : null;
        if (!style) return;
        if (measureContext) measureContext.font = style.font;
        var letterSpacing = parseFloat(style.letterSpacing) || 0;
        var width = measureContext ? measureContext.measureText(query).width + letterSpacing * query.length : query.length * 9;
        var textInset = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
        inlineHint.style.left = (textInset + width) + 'px';
        inlineHint.style.fontFamily = style.fontFamily;
        inlineHint.style.fontSize = style.fontSize;
        inlineHint.style.fontWeight = style.fontWeight;
        inlineHint.style.letterSpacing = style.letterSpacing;
        inlineHint.textContent = match.text.slice(query.length);
    }

    function render(items) {
        currentItems = items.slice(0, MAX_ITEMS);
        activeIndex = -1;
        list.textContent = '';
        if (!currentItems.length) {
            list.style.display = 'none';
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            renderInlineHint(input.value.trim(), currentItems);
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
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'suggestion-remove';
            remove.setAttribute('aria-label', '删除关键词：' + item.text);
            remove.title = '删除这条记录';
            remove.textContent = '';
            remove.addEventListener('mousedown', function (event) { event.preventDefault(); });
            remove.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                removeHistory(item.text);
                schedule();
            });
            li.appendChild(remove);
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
        renderInlineHint(input.value.trim(), currentItems);
    }

    function close() {
        clearTimeout(timer);
        requestId++;
        list.style.display = 'none';
        list.textContent = '';
        currentItems = [];
        inlineHint.textContent = '';
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
        inlineHint.textContent = '';
    }

    function schedule() {
        clearTimeout(timer);
        var id = ++requestId;
        var query = input.value.trim();
        if (!query) { close(); return; }
        timer = setTimeout(function () {
            if (id !== requestId || input.value.trim() !== query) return;
            render(localSuggestions(query));
        }, SUGGEST_DELAY);
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'both');
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
        else if (inlineHint.textContent && (event.key === 'Tab' || (event.key === 'ArrowRight' && input.selectionStart === input.value.length && input.selectionEnd === input.value.length))) {
            if (event.key === 'ArrowRight') event.preventDefault();
            input.value += inlineHint.textContent;
            inlineHint.textContent = '';
            if (event.key === 'ArrowRight') schedule();
        }
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
