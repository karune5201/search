#!/usr/bin/env python3
"""
字体重建脚本：按站内实际用到的字符，把完整字体裁剪成子集（woff2）。

保留策略（重要）
    字符集 = ASCII + GB2312 一级常用字(3755) + 站内实际用到的字
    - 一级常用字保证「以后新加的中文站名」绝大多数开箱可用，不必反复重建；
    - 站内实际用字必须并入，否则繁体站名（論壇/網盤/遊戲…）和日文假名
      （の/ギ/コ…）会掉字形 —— 这些字符并不在 GB2312 里；
    - GB2312 二级字（生僻字）明确不要。
    结果：约 656KB（原字体的 1/7），4065 个字形。

什么时候需要重新跑
    新增站点/分类、改了文案后，如果出现了上面字符集之外的生僻字，
    该字符会回退成系统字体（不会显示成方框，但字形会不一致）。
    想保持全站字形统一，就重跑一次本脚本。

依赖
    pip install fonttools brotli

用法
    # 1) 先取回完整字体（首次子集化后，仓库里保存的是子集版本）
    #    完整字体在 git 历史里：
    git show 86a313e:ziti/font.woff2 > /tmp/font-full.woff2
    #    （86a313e 换成子集化之前的任一提交；也可以用你本地留的完整字体备份）

    # 2) 生成子集
    python3 tools/subset-font.py /tmp/font-full.woff2 ziti/font.woff2

    # 3) 本地预览确认字形正常
    python3 -m http.server 8080
"""

import glob
import os
import sys

SCAN = [
    'index.html',
    'status.html',
    'README.md',
    'CHANGELOG.md',
    'css/*.css',
    'js/*.js',
    'source/css/*.css',
    'source/js/*.js',
]

# 额外兜底字符：数字、常用标点、以及后续可能用到的符号
EXTRA = (
    '①②③④⑤⑥⑦⑧⑨⑩·—–…“”‘’《》〈〉「」『』【】、。，！？：；（）'
    '0123456789'
)


def gb2312_level1():
    """用标准库 gb2312 编解码器枚举一级常用字（区段 0xB0-0xD7，共 3755 字），
    不需要外部字表。"""
    out = set()
    for b1 in range(0xB0, 0xD8):
        for b2 in range(0xA1, 0xFF):
            try:
                out.add(bytes([b1, b2]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return out


def collect_chars(root):
    chars = set(EXTRA) | gb2312_level1()
    for pattern in SCAN:
        for path in glob.glob(os.path.join(root, pattern)):
            with open(path, encoding='utf-8') as fh:
                chars |= set(fh.read())
    # 去掉控制字符
    return {c for c in chars if ord(c) > 31}


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    full_font, out_font = sys.argv[1], sys.argv[2]
    if not os.path.isfile(full_font):
        print('找不到完整字体：%s' % full_font)
        return 1

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    chars = collect_chars(root)
    text_file = '/tmp/subset-chars.txt'
    with open(text_file, 'w', encoding='utf-8') as fh:
        fh.write(''.join(sorted(chars)))
    print('字符集合计 %d 个（一级常用字 + 站内用字 + 标点）' % len(chars))

    from fontTools import subset

    args = [
        full_font,
        '--text-file=%s' % text_file,
        '--unicodes=U+0020-007E,U+00A0-00FF',  # 基本拉丁 + 西欧补充
        '--layout-features=*',
        '--drop-tables+=FFTM',                 # 造字工具的时戳表，用不到
        '--flavor=woff2',
        '--output-file=%s' % out_font,
    ]
    subset.main(args)

    before = os.path.getsize(full_font)
    after = os.path.getsize(out_font)
    print('%s -> %s  (%.1f%% , 省 %.1f MB)' % (
        human(before), human(after), after * 100.0 / before, (before - after) / 1048576.0))
    return 0


def human(n):
    for unit in ('B', 'KB', 'MB'):
        if n < 1024:
            return '%.1f %s' % (n, unit)
        n /= 1024.0
    return '%.1f GB' % n


if __name__ == '__main__':
    sys.exit(main())
