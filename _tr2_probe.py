# -*- coding: utf-8 -*-
"""Cari baris entri untuk kunci target di blok ES/FR/DE/PT. Baca/tulis CRLF-safe."""
import io, json, re, sys

SRC = r'D:\Zephyr\src\lib\i18n-extra.ts'
KEYS = r'D:\Zephyr\_perlu-terjemah2.json'

keys = json.load(io.open(KEYS, encoding='utf-8'))
print('jumlah kunci:', len(keys))

with io.open(SRC, 'r', encoding='utf-8', newline='') as f:
    lines = f.read().split('\r\n')
print('jumlah baris:', len(lines))

# temukan rentang tiap blok
blocks = {}
starts = []
for i, l in enumerate(lines):
    m = re.match(r'^const ([A-Z]{2}): Dict = \{', l)
    if m:
        starts.append((i, m.group(1)))
for idx, (i, name) in enumerate(starts):
    end = starts[idx + 1][0] - 2 if idx + 1 < len(starts) else len(lines)
    blocks[name] = (i, end)
print('blok:', {k: v for k, v in blocks.items()})

ENTRY = re.compile(r"^  '((?:[^'\\]|\\.)*)': '(.*)',?$")

def escape(k):
    return k.replace('\\', '\\\\').replace("'", "\\'")

for lang in ('ES', 'FR', 'DE', 'PT'):
    a, b = blocks[lang]
    found = {}
    for i in range(a, b):
        m = ENTRY.match(lines[i])
        if m:
            found[m.group(1)] = i
    missing = [k for k in keys if k not in found]
    print(f'{lang}: entri={len(found)} target-hilang={len(missing)}')
    if missing:
        for k in missing[:20]:
            print('   MISSING:', repr(k))
