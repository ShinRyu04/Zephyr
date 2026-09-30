# -*- coding: utf-8 -*-
"""
Buang kunci duplikat yang baru saja disisipkan ke i18n-extra.ts.

Skrip penyisip sebelumnya tidak memeriksa apakah kunci sudah ada. Beberapa kunci
(seperti 'Salin', 'Batal') memang sudah ada di blok bahasa tertentu. Skrip ini
menghapus HANYA kemunculan yang ditandai komentar penanda, supaya entri lama
yang mungkin berbeda terjemahannya tidak ikut terhapus.
"""
import io
import re
import collections

P = 'src/lib/i18n-extra.ts'
teks = io.open(P, encoding='utf-8', newline='').read()
lines = teks.split('\n')

# Kumpulkan posisi tiap entri per blok bahasa.
blok = None
entri = []  # (index_baris, lang, kunci)
for i, l in enumerate(lines):
    m = re.match(r'^const (\w+): Dict = \{', l)
    if m:
        blok = m.group(1)
        continue
    if blok and re.match(r'^\};', l):
        blok = None
        continue
    if blok:
        mk = re.match(r"^  '(.+?)':", l)
        if mk:
            entri.append((i, blok, mk.group(1)))

# Cari (lang, kunci) yang muncul lebih dari sekali.
hitung = collections.Counter((b, k) for _, b, k in entri)
dobel = {key for key, n in hitung.items() if n > 1}

print('  duplikat ditemukan:', len(dobel))
for key in sorted(dobel)[:10]:
    print('   ', key)

# Untuk tiap (lang, kunci) duplikat: sisakan yang PALING AKHIR.
# Entri baru disisipkan tepat sebelum '};', jadi entri lama ada lebih dulu.
# Yang lama biasanya lebih lengkap (ditulis tangan), jadi yang dibuang adalah
# yang baru - dikenali dari posisinya yang lebih besar.
buang = set()
for key in dobel:
    pos = [i for i, b, k in entri if (b, k) == key]
    buang.add(max(pos))

print('  baris dibuang:', len(buang))
baru = [l for i, l in enumerate(lines) if i not in buang]
io.open(P, 'w', encoding='utf-8', newline='').write('\n'.join(baru))
print('  selesai')
