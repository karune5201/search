#!/usr/bin/env python3
"""
站点图标生成器（纯标准库，无需 Pillow / ImageMagick）。

生成与 favicon.svg 同一套图形：
    favicon.ico        32/48 多尺寸（PNG 内嵌，替代原来那个 564KB 的 JPEG）
    favicon-32.png     32x32
    icon-180.png       apple-touch-icon
    icon-192.png       PWA
    icon-512.png       PWA

用法：
    python3 tools/make-icons.py

注意：图形由下面的 draw() 函数程序化绘制（圆角渐变底 + 白色放大镜），
改配色或形状直接改那里，重跑即可。
"""

import math
import os
import struct
import zlib

# ---- 配色（与页面主色一致）----
BG_TOP = (52, 67, 95)      # #34435f
BG_BOTTOM = (18, 20, 26)   # #12141a
FG = (255, 255, 255)

RADIUS = 0.22              # 圆角半径（相对边长）
RING_C = (0.44, 0.44)      # 放大镜圆心
RING_R = 0.19              # 镜圈半径
STROKE = 0.038             # 线宽（半宽）
HANDLE = ((0.565, 0.565), (0.735, 0.735))  # 手柄起止


def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    seg = dx * dx + dy * dy
    t = 0.0 if seg == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def in_rounded_rect(x, y, r):
    """x,y ∈ [0,1]；返回是否在圆角矩形内。"""
    if r <= 0:
        return True
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return math.hypot(x - cx, y - cy) <= r


def draw(x, y):
    """返回 (r, g, b, a)；a 为 0 表示透明。"""
    if not in_rounded_rect(x, y, RADIUS):
        return (0, 0, 0, 0)

    t = (x + y) / 2.0
    r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
    g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
    b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)

    # 放大镜镜圈
    d = math.hypot(x - RING_C[0], y - RING_C[1])
    if abs(d - RING_R) <= STROKE:
        return FG + (255,)

    # 手柄
    if seg_dist((x, y), HANDLE[0], HANDLE[1]) <= STROKE:
        return FG + (255,)

    return (r, g, b, 255)


def render(size, ss=2):
    """ss 为超采样倍数，用于抗锯齿。"""
    rows = []
    n = size * ss
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc_r = acc_g = acc_b = acc_a = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px * ss + sx + 0.5) / n
                    y = (py * ss + sy + 0.5) / n
                    r, g, b, a = draw(x, y)
                    # 预乘 alpha 后再平均，避免边缘出现黑边
                    acc_r += r * a
                    acc_g += g * a
                    acc_b += b * a
                    acc_a += a
            if acc_a == 0:
                row += b'\x00\x00\x00\x00'
            else:
                row += bytes((acc_r // acc_a, acc_g // acc_a, acc_b // acc_a, acc_a // (ss * ss)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + r for r in rows)  # 每行 filter type 0

    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data +
                struct.pack('>I', zlib.crc32(typ + data) & 0xFFFFFFFF))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)
    return len(png)


def write_ico(path, pngs):
    """pngs: [(size, png_bytes), ...]"""
    n = len(pngs)
    header = struct.pack('<HHH', 0, 1, n)
    offset = 6 + 16 * n
    entries = b''
    data = b''
    for size, png in pngs:
        s = 0 if size >= 256 else size
        entries += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(png), offset + len(data))
        data += png
    with open(path, 'wb') as fh:
        fh.write(header + entries + data)
    return 6 + 16 * n + len(data)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    targets = [
        ('favicon-32.png', 32, 6),
        ('icon-180.png', 180, 3),
        ('icon-192.png', 192, 3),
        ('icon-512.png', 512, 2),
    ]
    made = {}
    for name, size, ss in targets:
        rows = render(size, ss)
        path = os.path.join(root, name)
        n = write_png(path, size, rows)
        made[size] = open(path, 'rb').read()
        print('%-16s %4dx%-4d %6.1f KB' % (name, size, size, n / 1024.0))

    # 多尺寸 ICO（内嵌 PNG，现代浏览器都支持）
    ico_sizes = [(32, made[32]), (48, None)]
    rows48 = render(48, 6)
    tmp = os.path.join(root, '.ico48.tmp')
    write_png(tmp, 48, rows48)
    ico_sizes[1] = (48, open(tmp, 'rb').read())
    os.remove(tmp)

    ico_path = os.path.join(root, 'favicon.ico')
    n = write_ico(ico_path, ico_sizes)
    print('%-16s 32+48   %6.1f KB' % ('favicon.ico', n / 1024.0))


if __name__ == '__main__':
    main()
