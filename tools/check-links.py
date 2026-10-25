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
    python3 tools/check-links.py --workers 8 --timeout 20

    # 生成报告 / 数据文件
    python3 tools/check-links.py --report link-report.md --json js/link-status.js

    # 只跑分类规则自检（不联网）
    python3 tools/check-links.py --selftest

退出码
    0  没有发现死链
    1  发现死链
    2  脚本本身出错（例如读不到数据文件）

判定方法（这一版的重点是「别冤枉好人」）
    1. 先做 DNS 预检：区分「域名不存在（NXDOMAIN）」和「DNS 临时失败」，
       前者算死链，后者只算可疑；解析到 127/10/0.0.0.0 这类保留地址的按可疑（疑似污染）。
    2. 直接 GET（不是 HEAD）：很多站点 HEAD 单独返回 403，HEAD 会凭空制造误报。
       响应体只读前 64KB，超时/重定向链都记录下来。
    3. 状态码细分：404/410、反复出现的 500/502/504 → 死链；
       401/403/429/451、Cloudflare 人机验证 → 受限；520–527/530（源站/隧道异常）、
       503/529（维护/限流）→ 可疑；证书过期 → 死链，其它证书问题 → 可疑。
    4. 内容嗅探：200 也可能是「域名停放/待售/已过期/账号停用」页，命中特征词算死链；
       403 但页面是 Cloudflare 验证页 → 受限（而不是死链）。
    5. 两轮复核：第一轮得出「死链/可疑」的，间隔一秒再独立测一次；
       两次都指向同一结论才认，第二次正常就改判正常，两次不一致降级为可疑。
    6. 单域名串行 + 小延时：同一个域名不并发打，避免自己把自己限流成 429/403。
    7. http:// 的站点如果连接失败，顺手再试一次 https://，能开就仍算正常（并提示换 https）。

    「可疑」不计入失败（除非加 --strict），它代表「这台机器测不准」。
"""

import argparse
import json
import random
import re
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

DATA = 'js/sites.js'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
BODY_CAP = 64 * 1024          # 每个站点最多读 64KB，够判断停放/验证页了

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


def host_of(url):
    m = re.match(r'^https?://([^/?#]+)', url, re.I)
    return (m.group(1) if m else url).lower()


# =========================================================
#  分类规则（纯函数，可用 --selftest 离线验证）
# =========================================================

# 「域名停放 / 待售」——这些词在正常站点里基本不会出现在首页
PARKED_MARKERS = (
    'domain is for sale', 'domain may be for sale', 'buy this domain',
    'this domain is parked', 'domain parking', 'parked domain',
    'make an offer on this domain', 'inquire about this domain',
    'the domain has expired', 'this domain has expired', 'renew this domain',
    'domain expired recently', 'hugedomains', 'afternic', 'dan.com/buy-domain',
    'sedoparking', 'parkingcrew', 'bodis.com', 'above.com marketplace',
    '域名停放', '域名出售', '该域名已过期', '域名已过期', '此域名正在出售',
    '域名转让', '域名待售',
)

# 「站点停用 / 欠费」
SUSPENDED_MARKERS = (
    'account has been suspended', 'this account is suspended',
    'website is suspended', 'site suspended', 'account suspended',
    '网站已暂停', '站点已停用', '账户已停用', '空间已到期', '主机已到期',
    '该站点已被关闭',
)

# 「反爬 / 人机验证」——403 里属于这一类的不算死链
BOTWALL_MARKERS = (
    'just a moment', 'checking your browser', 'cf-browser-verification',
    'cf_chl_opt', 'attention required', 'enable javascript and cookies to continue',
    'ddos protection by', 'please verify you are a human',
    'verify you are human', 'cf-challenge', '人机验证', '安全验证',
    '访问验证', '滑动验证', '请完成验证',
)

CF_ORIGIN_CODES = (520, 521, 522, 523, 524, 525, 526, 527, 530)
# 这些状态码说明「站点在，但不给这台机器看」
BLOCKED_CODES = (400, 401, 403, 405, 406, 407, 409, 412, 415, 418, 421, 425,
                 429, 431, 451, 501, 999)
# 这些 5xx 说明服务端确实坏了
BROKEN_CODES = (500, 502, 504)
# 这些 5xx 更像「维护 / 限流 / 源站暂时异常」
FLAKY_CODES = (503, 507, 508, 529)

# 内网 / 保留 / 文档 / 基准测试地址：正常站点不会解析到这里，
# 出现就说明 DNS 被劫持或被本地代理接管（198.18/15 是不少代理工具的 tun 网段）
RESERVED_IP_RE = re.compile(
    r'^(0\.|10\.|127\.|169\.254\.|192\.168\.'
    r'|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.'
    r'|172\.(1[6-9]|2\d|3[01])\.'
    r'|198\.1[89]\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.'
    r'|24[0-9]\.|255\.|::1$|f[cd][0-9a-f]{2}:|fe80:)')


def _hit(text, markers):
    """返回命中的特征词，没命中返回空串。"""
    if not text:
        return ''
    low = text.lower()
    for m in markers:
        if m in low:
            return m
    return ''


def sniff_dead(text):
    """内容层：域名停放/待售/站点停用 → ('dead', 说明)；否则 None。
       只在「看起来能打开」或 404 时用，正常首页不会出现这些词。"""
    if not text:
        return None
    mark = _hit(text, SUSPENDED_MARKERS)
    if mark:
        return 'dead', f'站点已停用（{mark}）'
    mark = _hit(text, PARKED_MARKERS)
    if mark:
        return 'dead', f'域名停放/待售（{mark}）'
    return None


# 反爬墙有时不给内容，只在 URL 上露痕迹（Google 的 /sorry/、CF 的 challenge 路径）
BOTWALL_URL_MARKERS = ('/sorry/', 'google_abuse=', 'google.com/sorry', 'cf-chl',
                       '/cdn-cgi/challenge', '/challenge-platform/', 'captcha?',
                       'showcaptcha')


def sniff_botwall_url(url):
    """按最终地址判断是不是反爬墙 → ('blocked', 说明)；否则 None。"""
    low = (url or '').lower()
    for m in BOTWALL_URL_MARKERS:
        if m in low:
            return 'blocked', f'反爬/人机验证（{m}）'
    return None


def sniff_botwall(text):
    """内容层：人机验证/反爬拦截 → ('blocked', 说明)；否则 None。
       只对 4xx/5xx 用 —— 正常页面里出现 'captcha' 之类字样毫无意义。"""
    if not text:
        return None
    mark = _hit(text, BOTWALL_MARKERS)
    if mark:
        return 'blocked', f'反爬/人机验证（{mark}）'
    return None


def classify_http(code, text=''):
    """HTTP 状态码 + 响应体碎片 → (结论, 说明)。"""
    if 200 <= code < 300:
        sniffed = sniff_dead(text)
        if sniffed:
            return sniffed
        return 'ok', str(code)

    if code in (404, 410):
        # 有些站点把「域名已过期」做成 404 页，这里再看一眼内容
        sniffed = sniff_dead(text)
        if sniffed:
            return sniffed
        return 'dead', str(code)

    if code in (401, 403, 407, 429, 451, 999):
        sniffed = sniff_botwall(text)
        if sniffed:
            return sniffed
        return 'blocked', str(code)

    if code in CF_ORIGIN_CODES:
        return 'unknown', f'{code}（源站/隧道异常）'
    if code in BROKEN_CODES:
        return 'dead', str(code)
    if code in FLAKY_CODES:
        return 'unknown', f'{code}（维护/限流）'
    if code in BLOCKED_CODES:
        return 'blocked', str(code)
    if 500 <= code < 600:
        return 'dead', str(code)
    if 300 <= code < 400:
        return 'unknown', f'{code}（重定向但没给目标）'
    return 'blocked', str(code)


def classify_cert_error(msg):
    low = (msg or '').lower()
    if 'expired' in low or 'not yet valid' in low:
        return 'dead', '证书已过期'
    if 'doesn\'t match' in low or 'not valid for' in low or 'mismatch' in low:
        return 'unknown', '证书与域名不符'
    if 'self-signed' in low or 'self signed' in low:
        return 'unknown', '自签名证书'
    if 'unable to get local issuer' in low or 'unable to get issuer' in low:
        return 'unknown', '证书链不完整'
    return 'unknown', '证书校验失败'


def classify_dns_error(exc):
    """gaierror → (结论, 说明)。区分「域名真的不存在」和「解析暂时失败」。"""
    code = getattr(exc, 'errno', None)
    if code is None and exc.args and isinstance(exc.args[0], int):
        code = exc.args[0]
    if code in (socket.EAI_AGAIN, getattr(socket, 'EAI_FAIL', -4)):
        return 'unknown', 'DNS 临时解析失败'
    text = (getattr(exc, 'strerror', '') or str(exc)).lower()
    if 'temporary' in text or 'try again' in text:
        return 'unknown', 'DNS 临时解析失败'
    return 'dead', '域名解析失败（域名不存在）'


def classify_net_error(exc):
    """非 HTTP 的异常 → (结论, 说明)。"""
    inner = exc.reason if isinstance(exc, urllib.error.URLError) else exc
    msg = str(inner)

    if isinstance(inner, ssl.SSLCertVerificationError):
        return classify_cert_error(getattr(inner, 'verify_message', '') or msg)
    if isinstance(inner, socket.gaierror):
        return classify_dns_error(inner)
    if isinstance(inner, ssl.SSLError):
        return classify_cert_error(msg)
    if isinstance(inner, (TimeoutError, socket.timeout)):
        return 'unknown', '超时'
    if isinstance(inner, ConnectionRefusedError):
        return 'unknown', '连接被拒'
    if isinstance(inner, ConnectionResetError):
        return 'unknown', '连接被重置'
    if isinstance(inner, OSError) and getattr(inner, 'errno', None) in (101, 113):
        return 'unknown', '网络不可达'
    if isinstance(inner, OSError) and getattr(inner, 'errno', None) == 104:
        return 'unknown', '连接被重置'

    low = msg.lower()
    if 'timed out' in low or 'timeout' in low:
        return 'unknown', '超时'
    if 'connection reset' in low or 'connection aborted' in low:
        return 'unknown', '连接被重置'
    if 'certificate' in low or 'ssl' in low or 'tls' in low:
        return classify_cert_error(msg)
    if 'name or service not known' in low or 'nodename nor servname' in low:
        return 'dead', '域名解析失败（域名不存在）'
    if 'getaddrinfo' in low:
        return 'unknown', 'DNS 临时解析失败'
    return 'unknown', (msg[:60] or type(inner).__name__)


def merge_verdicts(first, second):
    """两轮复核的合并规则：认共识，拿不准就降级为可疑。"""
    if second is None:
        return first
    k1, d1 = first
    k2, d2 = second
    if k1 == k2:
        return first
    if k2 == 'ok':
        return 'ok', f'{d2}（复核后正常）'
    if k1 == 'ok':
        return 'ok', d1
    return 'unknown', f'两次结果不一致（{d1} / {d2}）'


# =========================================================
#  发请求
# =========================================================

class _RedirectRecorder(urllib.request.HTTPRedirectHandler):
    """记录重定向链，用来发现「站点搬走了」。"""

    def __init__(self):
        self.hops = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.hops.append((code, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _decode(data, headers):
    ctype = (headers.get('Content-Type') or '') if headers else ''
    m = re.search(r'charset=([\w.-]+)', ctype, re.I)
    encodings = ([m.group(1)] if m else []) + ['utf-8', 'gb18030', 'latin-1']
    for enc in encodings:
        try:
            return data.decode(enc, 'ignore')
        except LookupError:
            continue
    return data.decode('latin-1', 'ignore')


# 本地 DNS 被透明代理/劫持接管时（所有域名都解析到保留地址），
# 污染检测就失去意义了，由 check_env_proxied() 在启动时判断并关掉
ENV_DNS_PROXIED = False


def check_env_proxied():
    """用 example.com 探一下解析结果：落在保留网段说明本机有透明代理/DNS 接管，
       这时候再拿「解析到内网地址」判污染只会把整站判成可疑。"""
    try:
        infos = socket.getaddrinfo('example.com', None, proto=socket.IPPROTO_TCP)
    except Exception:
        return False
    ips = [i[4][0] for i in infos if i and i[4]]
    return bool(ips) and all(RESERVED_IP_RE.match(ip) for ip in ips)


def dns_precheck(url):
    """返回 (结论, 说明) 或 (None, None) 表示解析正常。"""
    try:
        host = urllib.parse.urlparse(url).hostname
    except Exception:
        host = None
    if not host:
        return 'unknown', '地址格式异常'
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        return classify_dns_error(e)
    ips = [i[4][0] for i in infos if i and i[4]]
    if not ENV_DNS_PROXIED and ips and all(RESERVED_IP_RE.match(ip) for ip in ips):
        return 'unknown', f'DNS 指向保留地址 {ips[0]}（疑似污染/劫持）'
    return None, None


def probe(url, timeout, insecure=False, read_body=True):
    """发一次 GET，返回 (结论, 说明, 最终地址, 是否移动)。异常在这里就被翻译成结论。"""
    ctx = ssl.create_default_context()
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    recorder = _RedirectRecorder()
    opener = urllib.request.build_opener(
        recorder, urllib.request.HTTPSHandler(context=ctx))

    req = urllib.request.Request(url, method='GET', headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    })

    final_url = url
    try:
        with opener.open(req, timeout=timeout) as r:
            final_url = r.geturl() or url
            text = ''
            if read_body:
                ctype = (r.headers.get('Content-Type') or '').lower()
                if not ctype or 'html' in ctype or 'text' in ctype or 'json' in ctype:
                    try:
                        text = _decode(r.read(BODY_CAP), r.headers)
                    except Exception:
                        text = ''
            kind, detail = classify_http(r.status, text)
            if kind == 'ok':
                # 200 也可能是「验证通过前的中转页」，看地址兜一层
                hit = sniff_botwall_url(final_url)
                if hit:
                    kind, detail = hit
    except urllib.error.HTTPError as e:
        # HTTPError 本身也是有效响应：里面的错误页还带内容
        final_url = getattr(e, 'url', url) or url
        text = ''
        if read_body:
            try:
                text = _decode(e.read(BODY_CAP), e.headers)
            except Exception:
                text = ''
        kind, detail = classify_http(e.code, text)
        if 300 <= e.code < 400:
            # 3xx 走到这里说明 urllib 跟了十次还是 3xx：重定向环
            hit = sniff_botwall_url(final_url) or sniff_botwall(text)
            kind, detail = hit if hit else ('unknown', f'{e.code} 重定向循环')
    except Exception as e:                                  # noqa: BLE001 网络层异常
        kind, detail = classify_net_error(e)

    moved = ''
    if recorder.hops:
        last_code, last_url = recorder.hops[-1]
        if host_of(last_url) != host_of(url):
            moved = f'{last_code}→{host_of(last_url)}'
    return kind, detail, final_url, moved


def check_url(url, timeout, insecure=False, retries=1):
    """DNS 预检 + GET（含一次重试）→ (结论, 说明)。"""
    kind, detail = dns_precheck(url)
    if kind:
        return kind, detail

    attempt = 0
    kind, detail, final_url, moved = probe(url, timeout, insecure)
    # 只有「可疑」值得再试一次；死链/受限/正常都是确定性的
    while kind == 'unknown' and attempt < retries:
        attempt += 1
        time.sleep(0.6 + random.random() * 0.4)
        kind2, detail2, final_url, moved = probe(url, timeout, insecure)
        if kind2 != 'unknown':
            kind, detail = kind2, detail2
            break
        detail = detail2

    # http:// 打不开时顺手试 https://：很多站只是没做好跳转，人用浏览器能进
    if kind == 'unknown' and url.lower().startswith('http://'):
        https_url = 'https://' + url[len('http://'):]
        k3, d3, f3, m3 = probe(https_url, timeout, insecure)
        if k3 == 'ok':
            return 'ok', f'{d3}（https 可用，建议换成 {https_url}）'

    if moved:
        detail = f'{detail}，{moved}'
    return kind, detail


# =========================================================
#  调度
# =========================================================

def run_pass(sites, workers, timeout, insecure, retries, per_host_delay, label):
    """跑一轮检测，返回与 sites 等长的结果列表。"""
    host_locks = defaultdict(threading.Lock)
    master = threading.Lock()
    done = [0]
    total = len(sites)
    results = [None] * total

    def work(idx_item):
        idx, (cat, name, url) = idx_item
        host = host_of(url)
        with master:
            lock = host_locks[host]
        # 同一个域名串行：并发打同一台服务器容易被判成爬虫，凭空造出 403/429
        with lock:
            kind, detail = check_url(url, timeout, insecure, retries)
            if per_host_delay:
                time.sleep(per_host_delay + random.random() * per_host_delay)
        with master:
            done[0] += 1
            if done[0] % 25 == 0 or done[0] == total:
                print(f'  {label} 进度 {done[0]}/{total}（{name}）', flush=True)
        return idx, (cat, name, url, kind, detail)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for idx, row in pool.map(work, list(enumerate(sites))):
            results[idx] = row
    return results


LABEL = {
    'ok': '正常',
    'blocked': '受限',
    'dead': '死链',
    'unknown': '可疑',
}


def selftest():
    """离线验证分类规则，不联网。"""
    cases = [
        (classify_http(200, '<html>hello</html>'), ('ok', '200')),
        (classify_http(200, '<title>This domain is for sale</title>'),
         ('dead', '域名停放/待售（domain is for sale）')),
        (classify_http(200, 'Account suspended'), ('dead', '站点已停用（account suspended）')),
        (classify_http(403, 'Just a moment...</title>'), ('blocked', '反爬/人机验证（just a moment）')),
        (classify_http(404, ''), ('dead', '404')),
        (classify_http(410, ''), ('dead', '410')),
        (classify_http(500, ''), ('dead', '500')),
        (classify_http(503, ''), ('unknown', '503（维护/限流）')),
        (classify_http(522, ''), ('unknown', '522（源站/隧道异常）')),
        (classify_http(429, ''), ('blocked', '429')),
        (classify_cert_error('certificate has expired'), ('dead', '证书已过期')),
        (classify_cert_error('Hostname mismatch'), ('unknown', '证书与域名不符')),
        (classify_dns_error(socket.gaierror(-2, 'Name or service not known')),
         ('dead', '域名解析失败（域名不存在）')),
        (classify_dns_error(socket.gaierror(-3, 'Temporary failure in name resolution')),
         ('unknown', 'DNS 临时解析失败')),
        (merge_verdicts(('dead', '404'), ('ok', '200')), ('ok', '200（复核后正常）')),
        (merge_verdicts(('dead', '404'), ('dead', '404')), ('dead', '404')),
        (merge_verdicts(('dead', '404'), ('unknown', '超时')), ('unknown', '两次结果不一致（404 / 超时）')),
        (sniff_dead('<h1>正常页面</h1>'), None),
        (sniff_dead('This domain is for sale'), ('dead', '域名停放/待售（domain is for sale）')),
        # 正常页面里出现 captcha 字样不该被当成反爬
        (sniff_botwall('<script>var captcha=false</script>'), None),
        (sniff_botwall_url('https://www.google.com/sorry/index?continue=x'),
         ('blocked', '反爬/人机验证（/sorry/）')),
        (sniff_botwall_url('https://example.com/'), None),
        (classify_http(200, '<script>var captcha=false</script>'), ('ok', '200')),
    ]
    bad = 0
    for got, want in cases:
        if got != want:
            bad += 1
            print(f'FAIL 得到 {got!r}，期望 {want!r}')
    print(f'自检 {len(cases) - bad}/{len(cases)} 通过')
    return 0 if bad == 0 else 1


def main():
    ap = argparse.ArgumentParser(description='检查 js/sites.js 里的站点是否还能打开')
    ap.add_argument('--data', default=DATA, help='数据文件路径（默认 js/sites.js）')
    ap.add_argument('--workers', type=int, default=12, help='并发数（默认 12）')
    ap.add_argument('--timeout', type=float, default=15, help='单个请求超时秒数（默认 15）')
    ap.add_argument('--retries', type=int, default=1, help='「可疑」结果的重试次数（默认 1）')
    ap.add_argument('--per-host-delay', type=float, default=0.3,
                    help='同一域名两次请求之间的最小间隔秒数（默认 0.3）')
    ap.add_argument('--recheck', dest='recheck', action='store_true', default=True,
                    help='对死链/可疑做第二轮复核（默认开）')
    ap.add_argument('--no-recheck', dest='recheck', action='store_false',
                    help='不做第二轮复核（更快，但误报会多一些）')
    ap.add_argument('--recheck-delay', type=float, default=2.0,
                    help='两轮复核之间的等待秒数（默认 2）')
    ap.add_argument('--insecure', action='store_true', help='不校验 TLS 证书（默认校验）')
    ap.add_argument('--limit', type=int, default=0, help='只检查前 N 个（抽查用）')
    ap.add_argument('--cat', default='', help='只检查某个分类')
    ap.add_argument('--report', default='', help='把结果写成 markdown 文件')
    ap.add_argument('--json', default='', help='把结果写成站点可读的数据文件（如 js/link-status.js）')
    ap.add_argument('--strict', action='store_true', help='把「可疑」也算作失败')
    ap.add_argument('--selftest', action='store_true', help='只跑分类规则自检，不联网')
    args = ap.parse_args()

    if args.selftest:
        return selftest()

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

    global ENV_DNS_PROXIED
    ENV_DNS_PROXIED = check_env_proxied()
    if ENV_DNS_PROXIED:
        print('提示：本机 DNS 被透明代理接管（域名都解析到保留网段），'
              '已跳过「DNS 污染」这一项判定。要准确结果请在 GitHub Actions 里跑。\n')

    print(f'开始检测 {len(sites)} 个站点（并发 {args.workers}，超时 {args.timeout}s，'
          f'复核 {"开" if args.recheck else "关"}）…\n')
    started = time.time()

    results = run_pass(sites, args.workers, args.timeout, args.insecure,
                       args.retries, args.per_host_delay, '第一轮')

    # ---- 第二轮：只复测死链和可疑，避免「一次网络抽风就判死刑」 ----
    fixed = 0
    if args.recheck:
        idx = [i for i, r in enumerate(results) if r and r[3] in ('dead', 'unknown')]
        if idx:
            print(f'\n复核 {len(idx)} 个死链/可疑站点（等 {args.recheck_delay}s 再来一轮）…')
            time.sleep(args.recheck_delay)
            again = run_pass([sites[i] for i in idx], args.workers, args.timeout,
                             args.insecure, args.retries, args.per_host_delay, '复核')
            for slot, row2 in zip(idx, again):
                row1 = results[slot]
                merged = merge_verdicts((row1[3], row1[4]), (row2[3], row2[4]))
                if merged[0] != row1[3]:
                    fixed += 1
                    print(f'  改判：{row1[1]}  {row1[2]}  {LABEL[row1[3]]} → {LABEL[merged[0]]}'
                          f'（{merged[1]}）')
                results[slot] = (row1[0], row1[1], row1[2], merged[0], merged[1])

    elapsed = time.time() - started

    counts = {k: 0 for k in ('ok', 'blocked', 'dead', 'unknown')}
    for _, _, _, kind, _ in results:
        counts[kind] = counts.get(kind, 0) + 1

    print('\n===== 结果 =====')
    print(f'耗时 {elapsed:.1f}s' + (f'，复核改判 {fixed} 个' if fixed else ''))
    print(f"  正常 {counts['ok']}   受限 {counts['blocked']}   "
          f"死链 {counts['dead']}   可疑 {counts['unknown']}")

    bad = [r for r in results if r[3] == 'dead']
    warn = [r for r in results if r[3] == 'unknown']
    blocked = [r for r in results if r[3] == 'blocked']

    def dump(title, rows):
        if not rows:
            return
        print(f'\n--- {title}（{len(rows)}）---')
        for cat, name, url, kind, detail in rows:
            print(f'  [{cat}] {name}  {url}  → {detail}')

    dump('死链', bad)
    dump('可疑（这台机器测不准，多半是网络或区域限制）', warn)
    dump('受限（站点还在，但拒绝了本次请求）', blocked)

    if args.json:
        payload = {
            'generatedAt': time.strftime('%Y-%m-%d %H:%M', time.localtime()),
            'checked': len(sites),
            'elapsed': round(elapsed, 1),
            'summary': {'ok': counts['ok'], 'blocked': counts['blocked'],
                        'dead': counts['dead'], 'unknown': counts['unknown']},
            # 全部站点都存，状态页才能筛选查看「正常」条目；
            # 想让文件更小可以改成 if kind != 'ok'（但状态页就看不到正常站点了）
            'items': [
                {'cat': cat, 'name': name, 'url': url, 'kind': kind, 'detail': detail}
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
            f.write(f'- 复核改判：{fixed} 个（死链/可疑都做了第二轮复测）\n')
            f.write(f"- 正常 {counts['ok']} / 受限 {counts['blocked']} / "
                    f"死链 {counts['dead']} / 可疑 {counts['unknown']}\n\n")
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
