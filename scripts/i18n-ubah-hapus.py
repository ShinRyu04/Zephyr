# -*- coding: utf-8 -*-
"""Tambah kunci 'Ubah' & 'Hapus' (tombol daftar sub-agent) ke 10 kamus."""

import io

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

BLOK = [
    ('ID', [('Ubah', 'Ubah'), ('Hapus', 'Hapus')]),
    ('EN', [('Ubah', 'Edit'), ('Hapus', 'Delete')]),
    ('JA', [('Ubah', '編集'), ('Hapus', '削除')]),
    ('KO', [('Ubah', '편집'), ('Hapus', '삭제')]),
    ('ZH', [('Ubah', '编辑'), ('Hapus', '删除')]),
    ('ES', [('Ubah', 'Editar'), ('Hapus', 'Eliminar')]),
    ('FR', [('Ubah', 'Modifier'), ('Hapus', 'Supprimer')]),
    ('DE', [('Ubah', 'Bearbeiten'), ('Hapus', 'Löschen')]),
    ('PT', [('Ubah', 'Editar'), ('Hapus', 'Excluir')]),
    ('AR', [('Ubah', 'تحرير'), ('Hapus', 'حذف')]),
]

n = 0
for nama, pasangan in BLOK:
    kepala = 'const %s: Dict = {\r\n' % nama
    crlf = True
    if kepala not in s:
        kepala = 'const %s: Dict = {\n' % nama
        crlf = False
    if kepala not in s:
        print('  ⚠ blok %s tidak ketemu' % nama)
        continue
    sisip = ''
    for kunci, nilai in pasangan:
        if "'%s':" % kunci in s:
            continue
        sisip += "  '%s': '%s',%s" % (kunci, nilai, '\r\n' if crlf else '\n')
    if sisip:
        s = s.replace(kepala, kepala + sisip, 1)
        n += 1

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('  ✅ Ubah/Hapus disisipkan ke %d blok bahasa' % n)
