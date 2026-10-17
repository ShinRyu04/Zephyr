# -*- coding: utf-8 -*-
"""
Sisipkan kunci i18n untuk alasan "ekstensi bahasa diabaikan" ke SEPULUH blok
bahasa di src/lib/i18n.ts.

Kunci memakai placeholder {ext} / {lang} / {owner}; `tf()` mengisi nilainya.
Aman dijalankan ulang: kunci yang sudah ada dilewati.
"""
import io
import re

P = 'src/lib/i18n.ts'
K = 'extension {ext} (language "{lang}") ignored: {ext} is already claimed by {owner}'

KUNCI = {
    'ID': 'ekstensi {ext} (bahasa "{lang}") diabaikan: {ext} sudah dipakai {owner}',
    'EN': K,
    'JA': '拡張子 {ext}（言語 "{lang}"）は無視されました: {ext} は {owner} が使用中です',
    'KO': '확장자 {ext}(언어 "{lang}")는 무시되었습니다: {ext}은(는) {owner}가 사용 중입니다',
    'ZH': '扩展名 {ext}（语言 "{lang}"）已忽略：{ext} 已被 {owner} 占用',
    'ES': 'extensión {ext} (idioma "{lang}") ignorada: {ext} ya lo usa {owner}',
    'FR': 'extension {ext} (langue "{lang}") ignorée : {ext} est déjà utilisée par {owner}',
    'DE': 'Erweiterung {ext} (Sprache "{lang}") ignoriert: {ext} wird bereits von {owner} verwendet',
    'PT': 'extensão {ext} (idioma "{lang}") ignorada: {ext} já é usada por {owner}',
    'AR': 'تم تجاهل الامتداد {ext} (اللغة "{lang}"): {ext} مستخدم بالفعل من قبل {owner}',
}

with io.open(P, encoding='utf-8') as f:
    teks = f.read()

awal = list(re.finditer(r'\nconst (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{\n', teks))
assert len(awal) == 10, 'harus 10 blok bahasa, dapat %d' % len(awal)

for i in range(len(awal) - 1, -1, -1):
    bhs = awal[i].group(1)
    tutup = teks.index('\n};', awal[i].end())
    badan = teks[awal[i].end():tutup]
    if ("'%s':" % K) in badan:
        continue
    baris = "  '%s': '%s',\n" % (K, KUNCI[bhs].replace("'", "\\'"))
    teks = teks[:tutup] + '\n' + baris.rstrip('\n') + teks[tutup:]

with io.open(P, 'w', encoding='utf-8', newline='') as f:
    f.write(teks)

print('selesai: 1 kunci x 10 bahasa')
