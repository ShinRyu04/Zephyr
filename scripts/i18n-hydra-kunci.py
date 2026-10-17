# -*- coding: utf-8 -*-
"""
Sisipkan kunci i18n HydraFusion (Main pass / Review / Revision / Research
preview / no token usage reported) ke SEPULUH blok bahasa di src/lib/i18n.ts.

Konvensi repo: satu kunci = satu baris `'kunci': 'terjemahan',` di dalam blok
`const XX: Dict = { ... };`. Skrip ini menyisipkan tepat sebelum penutup tiap
blok supaya urutan dan format berkas tetap seperti tulisan tangan.
"""
import io
import re

P = 'src/lib/i18n.ts'

KUNCI = {
    'Main pass': {
        'ID': 'Lintasan utama', 'EN': 'Main pass', 'JA': 'メインパス', 'KO': '메인 패스',
        'ZH': '主流程', 'ES': 'Pase principal', 'FR': 'Passe principale',
        'DE': 'Hauptdurchlauf', 'PT': 'Passagem principal', 'AR': 'المرور الرئيسي',
    },
    'Review': {
        'ID': 'Telaah', 'EN': 'Review', 'JA': 'レビュー', 'KO': '검토',
        'ZH': '审查', 'ES': 'Revisión', 'FR': 'Revue',
        'DE': 'Prüfung', 'PT': 'Revisão', 'AR': 'مراجعة',
    },
    'Revision': {
        'ID': 'Revisi', 'EN': 'Revision', 'JA': '改訂', 'KO': '수정',
        'ZH': '修订', 'ES': 'Revisión', 'FR': 'Révision',
        'DE': 'Überarbeitung', 'PT': 'Revisão', 'AR': 'تنقيح',
    },
    'Research preview': {
        'ID': 'Pratinjau riset', 'EN': 'Research preview', 'JA': 'リサーチプレビュー',
        'KO': '리서치 프리뷰', 'ZH': '研究预览', 'ES': 'Vista previa de investigación',
        'FR': 'Aperçu de recherche', 'DE': 'Forschungsvorschau',
        'PT': 'Prévia de pesquisa', 'AR': 'معاينة بحثية',
    },
    'no token usage reported': {
        'ID': 'pemakaian token tidak dilaporkan', 'EN': 'no token usage reported',
        'JA': 'トークン使用量の報告なし', 'KO': '토큰 사용량 보고 없음',
        'ZH': '未报告 token 使用量', 'ES': 'no se informó uso de tokens',
        'FR': 'aucune utilisation de jetons signalée', 'DE': 'kein Token-Verbrauch gemeldet',
        'PT': 'nenhum uso de tokens informado', 'AR': 'لم يُبلَّغ عن استخدام الرموز',
    },
}

with io.open(P, encoding='utf-8') as f:
    teks = f.read()

awal = list(re.finditer(r'\nconst (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{\n', teks))
assert len(awal) == 10, 'harus 10 blok bahasa, dapat %d' % len(awal)

# Kerjakan dari blok TERAKHIR ke pertama supaya offset sebelumnya tidak bergeser.
for i in range(len(awal) - 1, -1, -1):
    bhs = awal[i].group(1)
    tutup = teks.index('\n};', awal[i].end())
    tambah = ''.join(
        "  '%s': '%s',\n" % (k, v[bhs].replace("'", "\\'"))
        for k, v in KUNCI.items()
        if ("'%s':" % k) not in teks[awal[i].end():tutup]
    )
    teks = teks[:tutup] + '\n' + tambah.rstrip('\n') + teks[tutup:]

with io.open(P, 'w', encoding='utf-8', newline='') as f:
    f.write(teks)

print('selesai: %d kunci x 10 bahasa' % len(KUNCI))
