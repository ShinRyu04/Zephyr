# -*- coding: utf-8 -*-
"""Cek penyebab verify-i18n.mjs melaporkan ID kurang 5 kunci.

verify memakai indexOf('};') sehingga blok ID berhenti di kemunculan PERTAMA
'};' — kalau ada di dalam string, blok terpotong. Cari kemunculannya.
"""
import io

extra = io.open(r'D:\Zephyr\src\lib\i18n-extra.ts', encoding='utf-8', newline='').read()
src = io.open(r'D:\Zephyr\src\lib\i18n.ts', encoding='utf-8', newline='').read()

for nm, teks in (('i18n.ts', src), ('i18n-extra.ts', extra)):
    i = teks.find('const ID: Dict')
    j = teks.find('};', i)
    seg = teks[i:j]
    print(nm, 'ID via indexOf: starts', i, 'ends', j, 'len', len(seg))
    # hitung baris terakhir segmen
    print('   last 80 chars:', repr(seg[-80:]))

# cari literal '};' yang bukan penutup blok (berada di tengah baris)
import re
i = extra.find('const ID: Dict')
for m in re.finditer(r"'\};'", extra[i:i + 200000]):
    print('literal }; found at offset', m.start())
