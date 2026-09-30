# -*- coding: utf-8 -*-
"""Kunci i18n untuk empty state panel AI (saran prompt)."""

import io
import re

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

KUNCI = {
    'Explain this file': {
        'ID': 'Jelaskan berkas ini', 'EN': 'Explain this file', 'JA': 'このファイルを説明',
        'KO': '이 파일 설명', 'ZH': '解释此文件', 'ES': 'Explicar este archivo',
        'FR': 'Expliquer ce fichier', 'DE': 'Diese Datei erklären',
        'PT': 'Explicar este arquivo', 'AR': 'اشرح هذا الملف',
    },
    'Walk through what it does': {
        'ID': 'Telusuri apa fungsinya', 'EN': 'Walk through what it does',
        'JA': '何をするか順に説明', 'KO': '무엇을 하는지 설명', 'ZH': '逐步讲解其作用',
        'ES': 'Recorrer lo que hace', 'FR': 'Détailler son rôle',
        'DE': 'Erklären, was es tut', 'PT': 'Explicar o que faz', 'AR': 'اشرح ما يفعله',
    },
    'Explain what this file does, step by step.': {
        'ID': 'Jelaskan apa yang dilakukan berkas ini, langkah demi langkah.',
        'EN': 'Explain what this file does, step by step.',
        'JA': 'このファイルが何をするか順を追って説明してください。',
        'KO': '이 파일이 하는 일을 단계별로 설명해 주세요.',
        'ZH': '逐步解释这个文件的作用。',
        'ES': 'Explica qué hace este archivo, paso a paso.',
        'FR': 'Expliquez ce que fait ce fichier, étape par étape.',
        'DE': 'Erkläre Schritt für Schritt, was diese Datei tut.',
        'PT': 'Explique o que este arquivo faz, passo a passo.',
        'AR': 'اشرح ما يفعله هذا الملف خطوة بخطوة.',
    },
    'Find the bug': {
        'ID': 'Cari bug-nya', 'EN': 'Find the bug', 'JA': 'バグを見つける',
        'KO': '버그 찾기', 'ZH': '查找缺陷', 'ES': 'Encontrar el error',
        'FR': 'Trouver le bug', 'DE': 'Fehler finden', 'PT': 'Encontrar o bug',
        'AR': 'ابحث عن الخطأ',
    },
    'Look at the current errors': {
        'ID': 'Lihat error yang ada sekarang', 'EN': 'Look at the current errors',
        'JA': '現在のエラーを見る', 'KO': '현재 오류 확인', 'ZH': '查看当前错误',
        'ES': 'Ver los errores actuales', 'FR': 'Voir les erreurs actuelles',
        'DE': 'Aktuelle Fehler ansehen', 'PT': 'Ver os erros atuais', 'AR': 'اطّلع على الأخطاء الحالية',
    },
    'Look at the errors in this file and explain the cause, then propose a fix.': {
        'ID': 'Lihat error di berkas ini dan jelaskan penyebabnya, lalu usulkan perbaikannya.',
        'EN': 'Look at the errors in this file and explain the cause, then propose a fix.',
        'JA': 'このファイルのエラーを確認し、原因を説明して修正案を出してください。',
        'KO': '이 파일의 오류를 보고 원인을 설명한 뒤 수정안을 제안해 주세요.',
        'ZH': '查看此文件中的错误，解释原因并提出修复方案。',
        'ES': 'Revisa los errores de este archivo, explica la causa y propone una solución.',
        'FR': 'Regardez les erreurs de ce fichier, expliquez la cause et proposez une correction.',
        'DE': 'Sieh dir die Fehler in dieser Datei an, erkläre die Ursache und schlage eine Korrektur vor.',
        'PT': 'Veja os erros neste arquivo, explique a causa e proponha uma correção.',
        'AR': 'اطّلع على الأخطاء في هذا الملف واشرح السبب ثم اقترح حلًا.',
    },
    'Write a test': {
        'ID': 'Tulis tes', 'EN': 'Write a test', 'JA': 'テストを書く',
        'KO': '테스트 작성', 'ZH': '编写测试', 'ES': 'Escribir una prueba',
        'FR': 'Écrire un test', 'DE': 'Test schreiben', 'PT': 'Escrever um teste',
        'AR': 'اكتب اختبارًا',
    },
    'Cover the main path': {
        'ID': 'Cakup jalur utamanya', 'EN': 'Cover the main path', 'JA': '主要な経路を網羅',
        'KO': '주요 경로 커버', 'ZH': '覆盖主要路径', 'ES': 'Cubrir el camino principal',
        'FR': 'Couvrir le chemin principal', 'DE': 'Den Hauptpfad abdecken',
        'PT': 'Cobrir o caminho principal', 'AR': 'غطِّ المسار الرئيسي',
    },
    'Write a test for the main path in this file.': {
        'ID': 'Tulis tes untuk jalur utama di berkas ini.',
        'EN': 'Write a test for the main path in this file.',
        'JA': 'このファイルの主要な経路のテストを書いてください。',
        'KO': '이 파일의 주요 경로에 대한 테스트를 작성해 주세요.',
        'ZH': '为此文件的主要路径编写测试。',
        'ES': 'Escribe una prueba para el camino principal de este archivo.',
        'FR': 'Écrivez un test pour le chemin principal de ce fichier.',
        'DE': 'Schreibe einen Test für den Hauptpfad in dieser Datei.',
        'PT': 'Escreva um teste para o caminho principal neste arquivo.',
        'AR': 'اكتب اختبارًا للمسار الرئيسي في هذا الملف.',
    },
}

NAMA = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']

for nama in NAMA:
    m = re.search(r"const %s: Dict = \{\r?\n" % nama, s)
    if not m:
        print('  ⚠ blok %s tidak ketemu' % nama)
        continue
    crlf = '\r\n' in m.group(0)
    akhir = s.find('\n};', m.end())
    rentang = s[m.end():akhir]
    sisip = ''
    for kunci, per in KUNCI.items():
        if "'%s':" % kunci in rentang:
            continue
        nilai = per[nama].replace("'", "\\'")
        sisip += "  '%s': '%s',%s" % (kunci, nilai, '\r\n' if crlf else '\n')
    if sisip:
        s = s[:m.end()] + sisip + s[m.end():]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('  ✅ %d kunci × %d bahasa' % (len(KUNCI), len(NAMA)))
