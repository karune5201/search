#!/usr/bin/env python3
"""把一言原始数据包（hitokoto dump）压成站点用的精简句库。

用法：
    python3 tools/build-hitokoto.py                     # 默认读 data/raw/customHitokotoB.json
    python3 tools/build-hitokoto.py 我的句子包.json      # 指定输入
    python3 tools/build-hitokoto.py 输入.json -o data/hitokoto.json

输入格式兼容三种：
    1. 一言官方 dump：[{"hitokoto": "...", "source": "..."}, ...]
    2. 对象数组      ：[{"text": "...", "source": "..."}, ...]
    3. 纯字符串数组   ：["句子一", "句子二", ...]

输出：紧凑的 [["句子", "出处"], ...]，只保留页面真正用得到的字段。
"""
import argparse
import json
import os

DEFAULT_IN = 'data/raw/customHitokotoB.json'
DEFAULT_OUT = 'data/hitokoto.json'


def normalize(item):
    if isinstance(item, str):
        return [item.strip(), '']
    if isinstance(item, dict):
        text = (item.get('hitokoto') or item.get('text') or '').strip()
        source = (item.get('source') or item.get('from') or '').strip()
        return [text, source]
    if isinstance(item, (list, tuple)) and item:
        text = str(item[0]).strip()
        source = str(item[1]).strip() if len(item) > 1 and item[1] else ''
        return [text, source]
    return ['', '']


def main():
    ap = argparse.ArgumentParser(description='精简一言数据包')
    ap.add_argument('input', nargs='?', default=DEFAULT_IN)
    ap.add_argument('-o', '--output', default=DEFAULT_OUT)
    args = ap.parse_args()

    if not os.path.exists(args.input):
        print(f'找不到输入文件：{args.input}')
        print('把一言数据包放到 data/raw/ 下，或用参数指定路径。')
        return 2

    with open(args.input, encoding='utf-8') as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        raw = raw.get('quotes') or raw.get('data') or raw.get('items') or []

    rows, seen = [], set()
    for item in raw:
        text, source = normalize(item)
        if not text or text in seen:
            continue
        seen.add(text)
        rows.append([text, source])

    os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))

    kb = round(os.path.getsize(args.output) / 1024, 1)
    print(f'原始 {len(raw)} 条 → 精简 {len(rows)} 条，写入 {args.output}（{kb} KB）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
