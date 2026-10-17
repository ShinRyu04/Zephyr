# -*- coding: utf-8 -*-
"""
Sisipkan kunci i18n tabel model (Name / Context Size / Capabilities / Tools /
Vision) ke SEPULUH blok bahasa di src/lib/i18n.ts.

Konvensi repo: satu kunci = satu baris `'kunci': 'terjemahan',`. Skrip ini
menyisipkan tepat sebelum penutup tiap blok supaya urutan dan format berkas
tetap seperti tulisan tangan. Aman dijalankan ulang: kunci yang sudah ada
dilewati.
"""
import io
import re

P = 'src/lib/i18n.ts'

KUNCI = {
    'Name': {
        'ID': 'Nama', 'EN': 'Name', 'JA': '名前', 'KO': '이름',
        'ZH': '名称', 'ES': 'Nombre', 'FR': 'Nom', 'DE': 'Name',
        'PT': 'Nome', 'AR': 'الاسم',
    },
    'Context Size': {
        'ID': 'Ukuran konteks', 'EN': 'Context Size', 'JA': 'コンテキストサイズ',
        'KO': '컨텍스트 크기', 'ZH': '上下文大小', 'ES': 'Tamaño de contexto',
        'FR': 'Taille du contexte', 'DE': 'Kontextgröße',
        'PT': 'Tamanho do contexto', 'AR': 'حجم السياق',
    },
    'Capabilities': {
        'ID': 'Kemampuan', 'EN': 'Capabilities', 'JA': '機能', 'KO': '기능',
        'ZH': '能力', 'ES': 'Capacidades', 'FR': 'Capacités',
        'DE': 'Fähigkeiten', 'PT': 'Capacidades', 'AR': 'القدرات',
    },
    'Tools': {
        'ID': 'Alat', 'EN': 'Tools', 'JA': 'ツール', 'KO': '도구',
        'ZH': '工具', 'ES': 'Herramientas', 'FR': 'Outils',
        'DE': 'Werkzeuge', 'PT': 'Ferramentas', 'AR': 'أدوات',
    },
    'Vision': {
        'ID': 'Visi', 'EN': 'Vision', 'JA': 'ビジョン', 'KO': '비전',
        'ZH': '视觉', 'ES': 'Visión', 'FR': 'Vision', 'DE': 'Bilderkennung',
        'PT': 'Visão', 'AR': 'الرؤية',
    },
}

with io.open(P, encoding='utf-8') as f:
    teks = f.read()

awal = list(re.finditer(r'\nconst (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{\n', teks))
assert len(awal) == 10, 'harus 10 blok bahasa, dapat %d' % len(awal)

for i in range(len(awal) - 1, -1, -1):
    bhs = awal[i].group(1)
    tutup = teks.index('\n};', awal[i].end())
    badan = teks[awal[i].end():tutup]
    tambah = ''.join(
        "  '%s': '%s',\n" % (k, v[bhs].replace("'", "\\'"))
        for k, v in KUNCI.items()
        if ("'%s':" % k) not in badan
    )
    if tambah:
        teks = teks[:tutup] + '\n' + tambah.rstrip('\n') + teks[tutup:]

with io.open(P, 'w', encoding='utf-8', newline='') as f:
    f.write(teks)

print('selesai: %d kunci x 10 bahasa' % len(KUNCI))
