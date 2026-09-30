# -*- coding: utf-8 -*-
"""Tambah kunci 'Aktif' (penanda persona aktif) ke 10 kamus di i18n-extra.ts."""

import io

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

if "'Aktif':" in s:
    print('  kunci Aktif sudah ada — lewati')
    raise SystemExit(0)

# (nama konstanta, terjemahan)
BLOK = [
    ('ID', 'Aktif'),
    ('EN', 'Active'),
    ('JA', '有効'),
    ('KO', '활성'),
    ('ZH', '已启用'),
    ('ES', 'Activa'),
    ('FR', 'Active'),
    ('DE', 'Aktiv'),
    ('PT', 'Ativa'),
    ('AR', 'نشط'),
]

n = 0
for nama, nilai in BLOK:
    kepala = 'const %s: Dict = {\r\n' % nama
    if kepala not in s:
        kepala = 'const %s: Dict = {\n' % nama
    if kepala not in s:
        print('  ⚠ blok %s tidak ketemu' % nama)
        continue
    # Sisipkan tepat setelah kurung buka, dengan indentasi 2 spasi.
    baris = "  'Aktif': '%s',\r\n" % nilai
    if '\r\n' not in kepala:
        baris = "  'Aktif': '%s',\n" % nilai
    s = s.replace(kepala, kepala + baris, 1)
    n += 1

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('  ✅ kunci Aktif disisipkan ke %d blok bahasa' % n)
