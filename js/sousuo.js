! function() {
    function g() {
        i();
        j();
        k();
    }
    function i() {
        var a = document.querySelector('input[name="type"][value="' + p() + '"]');
        a && (a.checked = !0, l(a))
    }

    function j() {
        v(u())
    }

    function k() {
        w(t())
    }

    function l(a) {
        for (var b = 0; b < e.length; b++) e[b].classList.remove("s-current");
        a.parentNode.parentNode.parentNode.classList.add("s-current")
    }

    function m(a, b) {
        try {
            window.localStorage.setItem("superSearch" + a, b)
        } catch (e) { /* 隐私模式或存储被禁用时继续工作 */ }
    }

    function n(a) {
        try {
            return window.localStorage.getItem("superSearch" + a)
        } catch (e) {
            return null
        }
    }

    function o(a) {
        f = a.target, v(u()), w(a.target.value), m("type", a.target.value), c.focus(), l(a.target)
    }

    function p() {
        var b = n("type");
        return b || a[0].value
    }

    function r(a) {
        a.preventDefault();
        var query = c.value.trim();
        if (!query) {
            c.focus();
            return false;
        }
        // 查询词必须编码，避免空格、#、& 等字符破坏目标地址。
        var targetUrl = t() + encodeURIComponent(query);
        var opened = window.open(targetUrl, '_blank');
        if (!opened) location.href = targetUrl;
        else opened.opener = null;
        return false;
    }

    function t() {
        var selected = document.querySelector('input[name="type"]:checked');
        return selected ? selected.value : a[0].value
    }

    function u() {
        var selected = document.querySelector('input[name="type"]:checked');
        return selected ? selected.getAttribute("data-placeholder") : '输入关键字搜索'
    }


    function v(a) {
        c.setAttribute("placeholder", a)
    }

    function w(a) {
        b.action = a
    }

    var y, a = document.querySelectorAll('input[name="type"]'),
        b = document.querySelector("#super-search-fm"),
        c = document.querySelector("#search-text"),
        e = document.querySelectorAll(".search-group"),
        f = a[0];
    for (g(), y = 0; y < a.length; y++) a[y].addEventListener("change", o);
    b && b.addEventListener("submit", r)
}();
	function bq(){
		document.getElementById('super-search-fm').style.display = 'none';
		document.getElementById('yy').style.display = 'block';
	}
		function bw(){
		document.getElementById('super-search-fm').style.display = 'block';
		document.getElementById('yy').style.display = 'none';
	}
