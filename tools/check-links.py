#!/usr/bin/env python3
"""
站点死链检测：读取 js/sites.js 里的站点，逐个发请求判断是否还能打开。

只依赖标准库，不需要 pip 安装任何东西。

用法
    # 检查全部站点
    python3 tools/check-links.py

    # 先抽查 20 个，确认网络环境没问题
    python3 tools/check-links.py --limit 20

    # 调整并发与超时（网络差就调大超时、调小并发）
    python3 tools/check-links.py --workers 8 --timeout 15

    # 生成 markdown 报告
    python3 tools/check-links.py --report link-report.md

退出码
    0  没有发现死链
    1  发现死链（或 DNS 解析失败）
    2  脚本本身出错（例如读不到数据文件）

关于误报（重要）
    很多站点有区域限制或反爬：403 / 429 / 超时 并不等于站点已经关了。
    所以本脚本把结论分三类：
        死链    404 / 410 / 5xx，基本可以确认打不开
        受限    401 / 403 / 429，站点还在，只是拒绝了这台机器的请求
        可疑    超时 / 连接被拒 / DNS 失败，可能是网络环境问题
    只有「死链」和 DNS 失败会让退出码变成 1，除非加 --strict。
"""

import argparse
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

DATA = 'js/sites.js'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')

# 分类标题：{ cat: '常用', emoji: '⭐', sites: [
CAT_RE = re.compile(r"cat:\s*'((?:[^'\\]|\\.)*)'")
# 站点条目：['名称', 'https://…'],
PAIR_RE = re.compile(r"\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]")


def unescape(s):
    return s.replace("\\'", "'").replace('\\\\', '\\')


def parse_sites(path):
    """从 sites.js 里取出 [(分类, 名称, URL), …]，按出现顺序。"""
    text = open(path, encoding='utf-8').read()
    # 去掉 /* … */ 注释块：文件头的示例条目也是 ['名称','https://链接'] 的形状，
    # 不剔除会被当成真实站点
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)

    # 记录每个分类标题出现的位置，用于把站点归到最近的分类下
    marks = [(m.start(), unescape(m.group(1))) for m in CAT_RE.finditer(text)]

    def cat_at(pos):
        current = '未分类'
        for start, name in marks:
            if start <= pos:
                current = name
            else:
                break
        return current

    out = []
    for m in PAIR_RE.finditer(text):
        name, url = unescape(m.group(1)), unescape(m.group(2))
        if not url.lower().startswith(('http://', 'https://')):
            continue
        out.append((cat_at(m.start()), name, url))
    return out


def classify_status(code):
    if 200 <= code < 300:
        return 'ok'
    if code in (401, 403, 429):
        return 'blocked'
    if code in (404, 410):
        return 'dead'
    if 500 <= code < 600:
        return 'dead'
    return 'blocked'  # 其它 4xx 多半是反爬


def request_once(url, method, timeout):
    req = urllib.request.Request(url, method=method, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Range': 'bytes=0-2048',
    })
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.status


def check(url, timeout):
    """返回 (结论, 说明)。先 HEAD，不行再 GET（有些站点不支持 HEAD）。"""
    try:
        code = request_once(url, 'HEAD', timeout)
        kind = classify_status(code)
        if kind == 'ok':
            return 'ok', str(code)
        if kind in ('dead', 'blocked'):
            # HEAD 可能被单独拦，换成 GET 再确认一次
            code_get = request_once(url, 'GET', timeout)
            kind_get = classify_status(code_get)
            return kind_get, str(code_get)
        return kind, str(code)

    except urllib.error.HTTPError as e:
        # 4xx/5xx 会抛 HTTPError，但状态码本身是有效信息
        kind = classify_status(e.code)
        if kind == 'ok':
            return 'ok', str(e.code)
        if e.code in (405, 501) or kind == 'blocked':
            try:
                code_get = request_once(url, 'GET', timeout)
                return classify_status(code_get), str(code_get)
            except urllib.error.HTTPError as e2:
                return classify_status(e2.code), str(e2.code)
            except Exception as e2:
                return classify_exception(e2)
        return kind, str(e.code)

    except Exception as e:
        return classify_exception(e)


def classify_exception(e):
    # urllib 会把底层错误包进 URLError.reason，所以两者都要看
    inner = e.reason if isinstance(e, urllib.error.URLError) else e
    if isinstance(inner, socket.gaierror):
        return 'dns', '域名解析失败'
    if isinstance(inner, (TimeoutError, socket.timeout)):
        return 'unknown', '超时'
    if isinstance(inner, ssl.SSLError):
        return 'unknown', '证书/SSL 错误'
    if isinstance(inner, ConnectionRefusedError):
        return 'unknown', '连接被拒绝'
    if isinstance(inner, ConnectionResetError):
        return 'unknown', '连接被重置'
    if isinstance(inner, OSError) and getattr(inner, 'errno', None) in (101, 113):
        return 'unknown', '网络不可达'
    text = str(inner)

    if isinstance(e, (TimeoutError, socket.timeout)):
        return 'unknown', '超时'
    if isinstance(e, ssl.SSLError):
        return 'unknown', '证书/SSL 错误'
    if isinstance(e, socket.gaierror):
        return 'dns', '域名解析失败'
    if isinstance(e, ConnectionRefusedError):
        return 'unknown', '连接被拒绝'
    if isinstance(e, ConnectionResetError):
        return 'unknown', '连接被重置'

    low = text.lower()
    if 'name or service not known' in low or 'nodename nor servname' in low or 'getaddrinfo' in low:
        return 'dns', '域名解析失败'
    if 'timed out' in low or 'timeout' in low:
        return 'unknown', '超时'
    if 'certificate' in low or 'ssl' in low:
        return 'unknown', '证书/SSL 错误'
    return 'unknown', (text[:60] or type(e).__name__)


LABEL = {
    'ok': '正常',
    'blocked': '受限',
    'dead': '死链',
    'dns': '死链',
    'unknown': '可疑',
}


def main():
    ap = argparse.ArgumentParser(description='检查 js/sites.js 里的站点是否还能打开')
    ap.add_argument('--data', default=DATA, help='数据文件路径（默认 js/sites.js）')
    ap.add_argument('--workers', type=int, default=12, help='并发数（默认 12）')
    ap.add_argument('--timeout', type=float, default=10, help='单个请求超时秒数（默认 10）')
    ap.add_argument('--limit', type=int, default=0, help='只检查前 N 个（抽查用）')
    ap.add_argument('--cat', default='', help='只检查某个分类')
    ap.add_argument('--report', default='', help='把结果写成 markdown 文件')
    ap.add_argument('--json', default='', help='把结果写成站点可读的数据文件（如 js/link-status.js）')
    ap.add_argument('--strict', action='store_true', help='把「可疑」也算作失败')
    args = ap.parse_args()

    try:
        sites = parse_sites(args.data)
    except FileNotFoundError:
        print(f'找不到数据文件：{args.data}', file=sys.stderr)
        return 2

    if args.cat:
        sites = [s for s in sites if args.cat in s[0]]
    if args.limit:
        sites = sites[:args.limit]

    if not sites:
        print('没有可检查的站点', file=sys.stderr)
        return 2

    print(f'开始检测 {len(sites)} 个站点（并发 {args.workers}，超时 {args.timeout}s）…\n')
    started = time.time()
    results = []
    done = 0

    def work(item):
        cat, name, url = item
        kind, detail = check(url, args.timeout)
        return (cat, name, url, kind, detail)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for res in pool.map(work, sites):
            results.append(res)
            done += 1
            if done % 20 == 0 or done == len(sites):
                print(f'  进度 {done}/{len(sites)}', flush=True)

    elapsed = time.time() - started

    order = ['dead', 'unknown', 'blocked', 'ok']
    counts = {k: 0 for k in order}
    for _, _, _, kind, _ in results:
        counts[kind] = counts.get(kind, 0) + 1

    print('\n===== 结果 =====')
    print(f"耗时 {elapsed:.1f}s")
    print(f"  正常 {counts.get('ok', 0)}   受限 {counts.get('blocked', 0)}   "
          f"死链 {counts.get('dead', 0)} + {counts.get('dns', 0)}(DNS)   "
          f"可疑 {counts.get('unknown', 0)}")

    bad = [r for r in results if r[3] in ('dead', 'dns')]
    warn = [r for r in results if r[3] == 'unknown']
    blocked = [r for r in results if r[3] == 'blocked']

    def dump(title, rows):
        if not rows:
            return
        print(f'\n--- {title}（{len(rows)}）---')
        for cat, name, url, kind, detail in rows:
            print(f'  [{cat}] {name}  {url}  → {detail}')

    dump('死链', bad)
    dump('可疑（超时/连接失败，可能是网络或区域问题）', warn)
    dump('受限（站点还在，但拒绝了本次请求）', blocked)

    if args.json:
        import json
        payload = {
            'generatedAt': time.strftime('%Y-%m-%d %H:%M', time.localtime()),
            'checked': len(sites),
            'elapsed': round(elapsed, 1),
            'summary': {
                'ok': counts.get('ok', 0),
                'blocked': counts.get('blocked', 0),
                'dead': counts.get('dead', 0) + counts.get('dns', 0),
                'unknown': counts.get('unknown', 0),
            },
            # 全部站点都存，状态页才能筛选查看「正常」条目；
            # 想让文件更小可以改成 if kind != 'ok'（但状态页就看不到正常站点了）
            'items': [
                {
                    'cat': cat, 'name': name, 'url': url,
                    # dns 解析失败和 404 一样属于「确实打不开」，页面统一显示为死链
                    'kind': 'dead' if kind == 'dns' else kind,
                    'detail': detail,
                }
                for cat, name, url, kind, detail in results
            ],
        }
        body = json.dumps(payload, ensure_ascii=False, indent=1)
        with open(args.json, 'w', encoding='utf-8') as f:
            f.write('/* 由 tools/check-links.py 自动生成，请勿手动修改 */\n')
            f.write('window.LINK_STATUS = ' + body + ';\n')
        print(f'数据已写入 {args.json}')

    if args.report:
        with open(args.report, 'w', encoding='utf-8') as f:
            f.write('# 站点死链检测报告\n\n')
            f.write(f'- 检查站点：{len(sites)}\n- 耗时：{elapsed:.1f}s\n')
            f.write(f"- 正常 {counts.get('ok', 0)} / 受限 {counts.get('blocked', 0)} / "
                    f"死链 {counts.get('dead', 0) + counts.get('dns', 0)} / "
                    f"可疑 {counts.get('unknown', 0)}\n\n")
            for title, rows in (('死链', bad), ('可疑', warn), ('受限', blocked)):
                if not rows:
                    continue
                f.write(f'## {title}（{len(rows)}）\n\n| 分类 | 名称 | 地址 | 说明 |\n|---|---|---|---|\n')
                for cat, name, url, kind, detail in rows:
                    f.write(f'| {cat} | {name} | {url} | {detail} |\n')
                f.write('\n')
        print(f'\n报告已写入 {args.report}')

    if bad:
        return 1
    if args.strict and warn:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
