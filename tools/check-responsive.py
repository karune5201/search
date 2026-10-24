#!/usr/bin/env python3
"""按视口尺寸解析 CSS 媒体查询，算出关键属性的实际取值，用于核对响应式断点。"""
import re, sys

FILES = ['css/bizhi.css', 'css/sousuo.css', 'css/anim.css',
         'css/ipinfo.css', 'css/weather.css', 'source/css/custom.css',
         'css/responsive.css']

def parse(path):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    rules = []
    stack = []          # 当前所在的条件块
    buf = ''
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == '{':
            head = buf.strip()
            if head.startswith('@media') or head.startswith('@supports'):
                stack.append(head)
                buf = ''
            else:
                # 找到配对的 }
                depth, j = 1, i + 1
                while j < len(s) and depth:
                    if s[j] == '{': depth += 1
                    elif s[j] == '}': depth -= 1
                    j += 1
                body = s[i + 1:j - 1]
                # 逗号分隔的选择器要拆开，否则按单个选择器查不到
                for one in head.split(','):
                    one = one.strip()
                    if one:
                        rules.append((one, body, list(stack)))
                i = j
                buf = ''
                continue
            i += 1
            continue
        if ch == '}':
            if stack: stack.pop()
            buf = ''
            i += 1
            continue
        # 顶层语句（@charset / @import）以分号结束，丢弃，避免污染后续选择器
        if ch == ';' and not stack:
            buf = ''
            i += 1
            continue
        buf += ch
        i += 1
    return rules

def cond_ok(cond, vw, vh, pointer='fine'):
    c = cond.lower()
    if c.startswith('@supports'):
        return True                      # 假设环境支持
    if 'print' in c:
        return False
    c = c[c.find('('):] if '(' in c else c
    clauses = [x.strip() for x in c.split(' and ')]
    for cl in clauses:
        cl = cl.strip('() ').strip()
        m = re.match(r'(min|max)-(width|height):\s*([\d.]+)px', cl)
        if m:
            kind, dim, val = m.group(1), m.group(2), float(m.group(3))
            cur = vw if dim == 'width' else vh
            if kind == 'min' and cur < val: return False
            if kind == 'max' and cur > val: return False
            continue
        if cl.startswith('orientation'):
            want = cl.split(':')[1].strip()
            cur = 'landscape' if vw > vh else 'portrait'
            if want != cur: return False
            continue
        if cl.startswith('pointer'):
            want = cl.split(':')[1].strip()
            if want == 'coarse' and pointer != 'coarse': return False
            if want == 'fine' and pointer == 'coarse': return False
            continue
        # 其它（prefers-*、hover 等）一律视为不生效
        if cl.startswith('prefers') or cl.startswith('hover'):
            return False
        if cl == 'print':
            return False
    return True

def decls(body):
    out = {}
    for part in body.split(';'):
        if ':' in part:
            k, v = part.split(':', 1)
            out[k.strip()] = v.strip().replace('!important', '').strip()
    return out

ALL = []
for order, f in enumerate(FILES):
    for sel, body, stack in parse(f):
        ALL.append({
            'sel': sel.strip(), 'decl': decls(body),
            'cond': [c for c in stack if c.startswith('@media')],
            'file': f, 'order': order,
        })

def resolve(selector, prop, vw, vh, pointer='coarse'):
    val = None
    for r in ALL:
        if r['sel'] != selector or prop not in r['decl']:
            continue
        if all(cond_ok(c, vw, vh, pointer) for c in r['cond']):
            val = r['decl'][prop]
    return val

VIEWPORTS = [
    ('台式 1920×1080', 1920, 1080), ('台式 1440×900', 1440, 900),
    ('笔记本 1366×768', 1366, 768), ('笔记本 1280×800', 1280, 800),
    ('iPad 横 1024×768', 1024, 768), ('iPad 竖 768×1024', 768, 1024),
    ('平板 834×1112', 834, 1112),
    ('手机 430×932', 430, 932), ('手机 390×844', 390, 844),
    ('手机 375×667', 375, 667), ('小屏 360×640', 360, 640),
    ('超小 320×568', 320, 568),
    ('横屏 844×390', 844, 390), ('横屏 740×360', 740, 360),
]

PROPS = [
    (':root', '--panel-w'),
    ('#search', 'width'), ('#search', 'top'),
    ('.greet-time', 'font-size'),
    ('.site-footer', 'font-size'), ('.site-footer', 'padding-bottom'),
    ('#search-text', 'padding-left'), ('#search-text', 'height'),
    ('.panel-links', 'grid-template-columns'),
]

print(f"{'视口':<18} {'面板宽':<22} {'搜索宽':<20} {'顶部':<8} {'时钟':<8} {'页脚字':<8}")
print('-' * 96)
for name, vw, vh in VIEWPORTS:
    panel = resolve(':root', '--panel-w', vw, vh) or ''
    sw = resolve('#search', 'width', vw, vh) or ''
    st = resolve('#search', 'top', vw, vh) or ''
    gt = resolve('.greet-time', 'font-size', vw, vh) or ''
    sf = resolve('.site-footer', 'font-size', vw, vh) or ''
    # 面板宽度换算成 px，检查是否超过视口
    px = None
    m = re.match(r'min\((\d+)px,\s*(\d+(?:\.\d+)?)vw\)', panel)
    if m:
        px = min(float(m.group(1)), float(m.group(2)) * vw / 100)
    flag = ''
    if px is not None:
        if px > vw: flag = ' ❌超出视口'
        elif px > vw * 0.92: flag = ' ⚠偏宽'
    panel_show = f"{panel}" + (f" → {px:.0f}px" if px else '') + flag
    print(f'{name:<18} {panel_show:<30} {sw:<20} {st:<8} {gt:<8} {sf:<8}')

print()
print('=== 横屏 / 矮屏隐藏项核对 ===')
for name, vw, vh in VIEWPORTS:
    date_hidden = resolve('.greet-date', 'display', vw, vh) == 'none'
    main_hidden = resolve('.site-footer-main', 'display', vw, vh) == 'none'
    visits_hidden = resolve('.site-footer-visits', 'display', vw, vh) == 'none'
    orient = '横' if vw > vh else '竖'
    print(f'{name:<18} {orient}屏 | 日期{"隐藏" if date_hidden else "显示"}'
          f' | 页脚标语{"隐藏" if main_hidden else "显示"}'
          f' | 访问量{"隐藏" if visits_hidden else "显示"}')

print()
print('=== 页脚 / 时间日期 是否显示 ===')
for name, vw, vh in VIEWPORTS:
    footer_hidden = resolve('.site-footer', 'display', vw, vh) == 'none'
    greet_hidden = resolve('.hero-greet', 'display', vw, vh) == 'none'
    if footer_hidden and greet_hidden:
        verdict = '隐藏（宽屏极简）'
    elif footer_hidden or greet_hidden:
        verdict = '⚠️ 只隐藏了一半'
    else:
        verdict = '显示'
    orient = '横' if vw > vh else '竖'
    print(f'{name:<18} {orient}屏 → 页脚{"隐藏" if footer_hidden else "显示":<3} 时间日期{"隐藏" if greet_hidden else "显示":<3} | {verdict}')

print()
print('=== 页面高度占用估算（防止页脚压住搜索框）===')
for name, vw, vh in VIEWPORTS:
    sf_fs = resolve('.site-footer', 'font-size', vw, vh) or '13px'
    sf_lh = resolve('.site-footer', 'line-height', vw, vh) or '1.9'
    fs = float(sf_fs.replace('px', '')) if 'px' in sf_fs else 13
    lh = float(sf_lh) if sf_lh.replace('.', '').isdigit() else 1.9
    line_h = fs * lh
    main_shown = resolve('.site-footer-main', 'display', vw, vh) != 'none'
    visits_shown = resolve('.site-footer-visits', 'display', vw, vh) != 'none'
    lines = 1 + (1 if main_shown else 0) + (1 if visits_shown else 0) + 1  # ip行 + meta 行
    footer_h = lines * line_h + 16
    top = resolve('#search', 'top', vw, vh) or '40%'
    center = float(top.replace('%', '')) / 100 * vh
    search_bottom = center + 25
    gap = (vh - footer_h) - search_bottom
    mark = '✅' if gap > 60 else ('⚠️偏挤' if gap > 20 else '❌重叠风险')
    print(f'{name:<18} 页脚≈{footer_h:5.0f}px {lines}行 | 搜索底≈{search_bottom:5.0f}px | 余量 {gap:6.0f}px {mark}')
