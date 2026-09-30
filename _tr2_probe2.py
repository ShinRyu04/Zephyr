# -*- coding: utf-8 -*-
"""Klasifikasi: untuk tiap kunci target, cari entri di ES/FR/DE/PT dan tandai
yang nilainya masih identik dengan kunci (belum diterjemah)."""
import io, json, re

SRC = r'D:\Zephyr\src\lib\i18n-extra.ts'
KEYS = r'D:\Zephyr\_perlu-terjemah2.json'

keys = json.load(io.open(KEYS, encoding='utf-8'))

with io.open(SRC, 'r', encoding='utf-8', newline='') as f:
    lines = f.read().split('\r\n')

starts = []
for i, l in enumerate(lines):
    m = re.match(r'^const ([A-Z]{2}): Dict = \{', l)
    if m:
        starts.append((i, m.group(1)))
blocks = {}
for idx, (i, name) in enumerate(starts):
    end = starts[idx + 1][0] - 2 if idx + 1 < len(starts) else len(lines)
    blocks[name] = (i, end)

ENTRY = re.compile(r"^  '((?:[^'\\]|\\.)*)': '(.*)',?$")

def unesc(s):
    """Kembalikan bentuk asli string TS (mis. \\\\n -> \\n)."""
    return s.replace("\\\\", "\\")

for lang in ('ES', 'FR', 'DE', 'PT'):
    a, b = blocks[lang]
    found = {}
    for i in range(a, b):
        m = ENTRY.match(lines[i])
        if m:
            found[unesc(m.group(1))] = (i, m.group(2))
    belum = []
    masih_id = []
    for k in keys:
        ku = unesc(k)
        if ku in found:
            ln, val = found[ku]
            if val == k:
                belum.append((ln, k))
            elif re.search(r'\b(yang|dengan|untuk|tidak|belum|sudah|dari|berkas|Buka|Tutup|Hapus)\b', val):
                masih_id.append((ln, k, val[:60]))
    print(f'=== {lang}: masih-English={len(belum)}  masih-indo={len(masih_id)}')
    for ln, k in belum:
        print(f'  E{ln}: {k[:70]}')
    for ln, k, v in masih_id:
        print(f'  I{ln}: {k[:50]} -> {v}')
