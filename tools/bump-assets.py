#!/usr/bin/env python3
"""给 index.html / status.html 里的本地 CSS、JS 引用加/换版本号。

为什么需要：GitHub Pages 给静态资源发的是可缓存响应，浏览器（尤其手机）
会把旧 CSS 一直用下去，改了样式却看不到，很容易误判成「没修好」。
纯静态站没有构建步骤，所以用查询串做版本号，改完跑一次这个脚本即可。

用法：
    python3 tools/bump-assets.py           # 用今天日期，如 20261126a
    python3 tools/bump-assets.py v7        # 用自定义版本号

规则：
    - 只改本地相对路径（css/… js/… source/…），外链一行都不动；
    - 已经带 ?v=… 的替换掉，没带的补上；
    - 同一个版本号写进所有文件，方便 grep。
"""

import io
import re
import sys
from datetime import datetime

PAGES = ["index.html", "status.html"]

# src="x.css" / href="x.js" 里只匹配本地路径
ASSET_RE = re.compile(
    r'(?P<attr>\b(?:src|href)=")'
    r'(?P<path>(?:\./)?(?:css|js|source/css)/[\w./-]+\.(?:css|js))'
    r'(?:\?v=[\w.-]+)?'
    r'(?P<quote>")'
)


def main(argv):
    if len(argv) > 1 and argv[1].strip():
        token = argv[1].strip()
    else:
        token = datetime.now().strftime("%Y%m%d") + "a"

    total = 0
    for page in PAGES:
        try:
            src = io.open(page, encoding="utf-8").read()
        except IOError:
            print("跳过（不存在）：%s" % page)
            continue
        new, n = ASSET_RE.subn(
            lambda m: '%s%s?v=%s%s' % (m.group("attr"), m.group("path"), token, m.group("quote")),
            src,
        )
        if n:
            io.open(page, "w", encoding="utf-8").write(new)
        total += n
        print("%-12s 更新 %d 处" % (page, n))

    print("版本号：%s，共 %d 处" % (token, total))
    if not total:
        print("没有改动，确认页面里还有 css/js 引用吗")


if __name__ == "__main__":
    main(sys.argv)
