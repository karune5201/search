! function() {
    function g() {
        h(), i(), j(), k(),z(),zi()
    }

    function zi() {
    	if (document.getElementById("search-text").getAttribute("placeholder")=='影视搜索') {
        var a = document.querySelector('input[name="type"][onclick="' + bq() + '"]');
        a && (a.checked = !0, l(a))
    }    		
    	}
    function z() {
        var selected = document.querySelector('input[name="type"]:checked');
        return selected ? selected.getAttribute("onclick") : ''
    }
    function h() {
        d.checked = s()
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

    function q(a) {
        m("newWindow", a.target.checked ? 1 : -1), x(a.target.checked)
    }

    function r(a) {
        a.preventDefault();
        var query = c.value.trim();
        if (!query) {
            c.focus();
            return false;
        }
        // 查询词必须编码，避免空格、#、& 等字符破坏目标地址。
        w(t() + encodeURIComponent(query));
        x(s());
        if (s()) window.open(b.action, '_blank', 'noopener');
        else location.href = b.action;
        return false;
    }

    function s() {
        var a = n("newWindow");
        return a ? 1 == a : !0
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

    function x(a) {
        a ? b.target = "_blank" : b.removeAttribute("target")
    }
    var y, a = document.querySelectorAll('input[name="type"]'),
        b = document.querySelector("#super-search-fm"),
        c = document.querySelector("#search-text"),
        d = document.querySelector("#set-search-blank"),
        e = document.querySelectorAll(".search-group"),
        f = a[0];
    for (g(), y = 0; y < a.length; y++) a[y].addEventListener("change", o);
    d && d.addEventListener("change", q), b && b.addEventListener("submit", r)
}();
	function bq(){
		document.getElementById('super-search-fm').style.display = 'none';
		document.getElementById('yy').style.display = 'block';
	}
		function bw(){
		document.getElementById('super-search-fm').style.display = 'block';
		document.getElementById('yy').style.display = 'none';
	}
