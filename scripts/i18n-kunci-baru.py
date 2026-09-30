# -*- coding: utf-8 -*-
"""
Ganti kunci yang bentrok dengan entri lama ke kunci yang lebih spesifik.

Masalahnya: 'Cara kerja', 'Identitas', 'Salin', 'Kirim', 'bawaan' sudah dipakai
fitur lain dengan terjemahan berbeda ('Salin' = Copy, bukan Duplicate). Memakai
kunci yang sama akan menampilkan terjemahan milik fitur lain.

Solusinya: beri kunci yang menyebut konteksnya, lalu terjemahkan ulang.
"""
import io

# kunci lama -> kunci baru (lebih spesifik, tidak bentrok)
GANTI = {
    'Cara kerja': 'Persona: cara kerja',
    'Identitas': 'Persona: identitas',
    'Salin': 'Persona: salin',
    'bawaan': 'Persona: bawaan',
    'Kirim': 'Subagent: kirim lanjutan',
    'Alat': 'Subagent: alat',
    'Nama': 'Subagent: nama',
    'Deskripsi': 'Subagent: deskripsi',
    'Hapus': 'Subagent: hapus',
    'Ubah': 'Subagent: ubah',
    'Tutup': 'Subagent: tutup',
    'Batal': 'Subagent: batal',
    'Simpan': 'Subagent: simpan',
    'Model': 'Subagent: model',
    'System prompt': 'Subagent: system prompt',
}

# file yang memakai kunci itu
FILE = [
    'src/components/settings/PersonaCard.tsx',
    'src/components/settings/SubagentCustomModal.tsx',
    'src/components/ai/SubAgentPanel.tsx',
]

# Terjemahan untuk kunci baru, per bahasa.
BARU = {
    'Persona: identitas': {
        'id': 'Identitas', 'en': 'Identity', 'ja': 'アイデンティティ', 'ko': '정체성',
        'zh': '身份', 'es': 'Identidad', 'fr': 'Identité', 'de': 'Identität',
        'pt': 'Identidade', 'ar': 'الهوية',
    },
    'Persona: cara kerja': {
        'id': 'Cara kerja', 'en': 'How it works', 'ja': '進め方', 'ko': '작업 방식',
        'zh': '工作方式', 'es': 'Cómo trabaja', 'fr': 'Façon de travailler',
        'de': 'Arbeitsweise', 'pt': 'Como trabalha', 'ar': 'طريقة العمل',
    },
    'Persona: salin': {
        'id': 'Salin', 'en': 'Duplicate', 'ja': '複製', 'ko': '복제',
        'zh': '复制', 'es': 'Duplicar', 'fr': 'Dupliquer', 'de': 'Duplizieren',
        'pt': 'Duplicar', 'ar': 'نسخ',
    },
    'Persona: bawaan': {
        'id': 'bawaan', 'en': 'built-in', 'ja': '組み込み', 'ko': '기본 제공',
        'zh': '内置', 'es': 'integrado', 'fr': 'intégré', 'de': 'integriert',
        'pt': 'integrado', 'ar': 'مدمج',
    },
    'Subagent: kirim lanjutan': {
        'id': 'Kirim', 'en': 'Send', 'ja': '送信', 'ko': '보내기',
        'zh': '发送', 'es': 'Enviar', 'fr': 'Envoyer', 'de': 'Senden',
        'pt': 'Enviar', 'ar': 'إرسال',
    },
    'Subagent: alat': {
        'id': 'Alat', 'en': 'Tools', 'ja': 'ツール', 'ko': '도구',
        'zh': '工具', 'es': 'Herramientas', 'fr': 'Outils', 'de': 'Werkzeuge',
        'pt': 'Ferramentas', 'ar': 'الأدوات',
    },
    'Subagent: nama': {
        'id': 'Nama', 'en': 'Name', 'ja': '名前', 'ko': '이름',
        'zh': '名称', 'es': 'Nombre', 'fr': 'Nom', 'de': 'Name',
        'pt': 'Nome', 'ar': 'الاسم',
    },
    'Subagent: deskripsi': {
        'id': 'Deskripsi', 'en': 'Description', 'ja': '説明', 'ko': '설명',
        'zh': '描述', 'es': 'Descripción', 'fr': 'Description', 'de': 'Beschreibung',
        'pt': 'Descrição', 'ar': 'الوصف',
    },
    'Subagent: hapus': {
        'id': 'Hapus', 'en': 'Delete', 'ja': '削除', 'ko': '삭제',
        'zh': '删除', 'es': 'Eliminar', 'fr': 'Supprimer', 'de': 'Löschen',
        'pt': 'Excluir', 'ar': 'حذف',
    },
    'Subagent: ubah': {
        'id': 'Ubah', 'en': 'Edit', 'ja': '編集', 'ko': '편집',
        'zh': '编辑', 'es': 'Editar', 'fr': 'Modifier', 'de': 'Bearbeiten',
        'pt': 'Editar', 'ar': 'تعديل',
    },
    'Subagent: tutup': {
        'id': 'Tutup', 'en': 'Close', 'ja': '閉じる', 'ko': '닫기',
        'zh': '关闭', 'es': 'Cerrar', 'fr': 'Fermer', 'de': 'Schließen',
        'pt': 'Fechar', 'ar': 'إغلاق',
    },
    'Subagent: batal': {
        'id': 'Batal', 'en': 'Cancel', 'ja': 'キャンセル', 'ko': '취소',
        'zh': '取消', 'es': 'Cancelar', 'fr': 'Annuler', 'de': 'Abbrechen',
        'pt': 'Cancelar', 'ar': 'إلغاء',
    },
    'Subagent: simpan': {
        'id': 'Simpan', 'en': 'Save', 'ja': '保存', 'ko': '저장',
        'zh': '保存', 'es': 'Guardar', 'fr': 'Enregistrer', 'de': 'Speichern',
        'pt': 'Salvar', 'ar': 'حفظ',
    },
    'Subagent: model': {
        'id': 'Model', 'en': 'Model', 'ja': 'モデル', 'ko': '모델',
        'zh': '模型', 'es': 'Modelo', 'fr': 'Modèle', 'de': 'Modell',
        'pt': 'Modelo', 'ar': 'النموذج',
    },
    'Subagent: system prompt': {
        'id': 'System prompt', 'en': 'System prompt', 'ja': 'システムプロンプト',
        'ko': '시스템 프롬프트', 'zh': '系统提示词', 'es': 'Prompt del sistema',
        'fr': 'Prompt système', 'de': 'System-Prompt', 'pt': 'Prompt do sistema',
        'ar': 'موجه النظام',
    },
}

# 1) Ganti kunci di file komponen.
for f in FILE:
    s = io.open(f, encoding='utf-8', newline='').read()
    n = 0
    for lama, baru in GANTI.items():
        # hanya ganti di dalam tr('...') dan tr("...")
        for pola in ["tr('%s')" % lama, 'tr("%s")' % lama]:
            ganti = "tr('%s')" % baru
            if pola in s:
                n += s.count(pola)
                s = s.replace(pola, ganti)
    io.open(f, 'w', encoding='utf-8', newline='').write(s)
    print('  ', f, '->', n, 'penggantian')

# 2) Tambahkan entri baru ke i18n-extra.ts (sebelum penutup tiap blok).
P = 'src/lib/i18n-extra.ts'
teks = io.open(P, encoding='utf-8', newline='').read()
BLOK = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']
LANG = {'ID': 'id', 'EN': 'en', 'JA': 'ja', 'KO': 'ko', 'ZH': 'zh',
        'ES': 'es', 'FR': 'fr', 'DE': 'de', 'PT': 'pt', 'AR': 'ar'}

def esc(v):
    return v.replace('\\', '\\\\').replace("'", "\\'")

total = 0
for nama_blok in BLOK:
    header = 'const %s: Dict = {' % nama_blok
    i = teks.find(header)
    if i == -1:
        continue
    j = teks.find('};', i)
    if j == -1:
        continue
    lang = LANG[nama_blok]
    baris = []
    for kunci, tr_ in BARU.items():
        nilai = tr_.get(lang)
        if nilai is None:
            continue
        baris.append("  '%s': '%s'," % (esc(kunci), esc(nilai)))
    if baris:
        teks = teks[:j] + '\n' + '\n'.join(baris) + '\n' + teks[j:]
        total += len(baris)
        print('  +', nama_blok, len(baris), 'kunci')

io.open(P, 'w', encoding='utf-8', newline='').write(teks)
print('  total:', total)
