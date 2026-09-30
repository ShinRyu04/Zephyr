# -*- coding: utf-8 -*-
"""Kunci i18n untuk menu +, antrian, dan picker model."""

import io
import re

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

KUNCI = {
    'Attach': {
        'ID': 'Lampirkan', 'EN': 'Attach', 'JA': '添付', 'KO': '첨부', 'ZH': '附件',
        'ES': 'Adjuntar', 'FR': 'Joindre', 'DE': 'Anhängen', 'PT': 'Anexar', 'AR': 'إرفاق',
    },
    'Files…': {
        'ID': 'Berkas…', 'EN': 'Files…', 'JA': 'ファイル…', 'KO': '파일…', 'ZH': '文件…',
        'ES': 'Archivos…', 'FR': 'Fichiers…', 'DE': 'Dateien…', 'PT': 'Arquivos…', 'AR': 'ملفات…',
    },
    'Folder…': {
        'ID': 'Folder…', 'EN': 'Folder…', 'JA': 'フォルダー…', 'KO': '폴더…', 'ZH': '文件夹…',
        'ES': 'Carpeta…', 'FR': 'Dossier…', 'DE': 'Ordner…', 'PT': 'Pasta…', 'AR': 'مجلد…',
    },
    'Images…': {
        'ID': 'Gambar…', 'EN': 'Images…', 'JA': '画像…', 'KO': '이미지…', 'ZH': '图片…',
        'ES': 'Imágenes…', 'FR': 'Images…', 'DE': 'Bilder…', 'PT': 'Imagens…', 'AR': 'صور…',
    },
    'Paste image': {
        'ID': 'Tempel gambar', 'EN': 'Paste image', 'JA': '画像を貼り付け',
        'KO': '이미지 붙여넣기', 'ZH': '粘贴图片', 'ES': 'Pegar imagen',
        'FR': 'Coller une image', 'DE': 'Bild einfügen', 'PT': 'Colar imagem',
        'AR': 'لصق صورة',
    },
    'URL…': {
        'ID': 'URL…', 'EN': 'URL…', 'JA': 'URL…', 'KO': 'URL…', 'ZH': '网址…',
        'ES': 'URL…', 'FR': 'URL…', 'DE': 'URL…', 'PT': 'URL…', 'AR': 'رابط…',
    },
    'Prompt snippets…': {
        'ID': 'Cuplikan prompt…', 'EN': 'Prompt snippets…', 'JA': 'プロンプト断片…',
        'KO': '프롬프트 스니펫…', 'ZH': '提示词片段…', 'ES': 'Fragmentos de prompt…',
        'FR': 'Extraits de prompt…', 'DE': 'Prompt-Schnipsel…', 'PT': 'Trechos de prompt…',
        'AR': 'مقتطفات الأوامر…',
    },
    'Tip: type': {
        'ID': 'Tip: ketik', 'EN': 'Tip: type', 'JA': 'ヒント:', 'KO': '팁:', 'ZH': '提示：输入',
        'ES': 'Consejo: escribe', 'FR': 'Astuce : tapez', 'DE': 'Tipp:', 'PT': 'Dica: digite',
        'AR': 'تلميح: اكتب',
    },
    'to reference files inline': {
        'ID': 'untuk merujuk berkas langsung', 'EN': 'to reference files inline',
        'JA': 'でファイルを直接参照できます', 'KO': '로 파일을 바로 참조',
        'ZH': '可直接引用文件', 'ES': 'para referenciar archivos en línea',
        'FR': 'pour référencer des fichiers en ligne',
        'DE': 'um Dateien direkt zu referenzieren',
        'PT': 'para referenciar arquivos em linha',
        'AR': 'للإشارة إلى الملفات مباشرة',
    },
    'No image on the clipboard': {
        'ID': 'Tidak ada gambar di clipboard', 'EN': 'No image on the clipboard',
        'JA': 'クリップボードに画像がありません', 'KO': '클립보드에 이미지가 없습니다',
        'ZH': '剪贴板中没有图片', 'ES': 'No hay ninguna imagen en el portapapeles',
        'FR': 'Aucune image dans le presse-papiers',
        'DE': 'Kein Bild in der Zwischenablage', 'PT': 'Nenhuma imagem na área de transferência',
        'AR': 'لا توجد صورة في الحافظة',
    },
    'Attached {name}': {
        'ID': 'Terlampir {name}', 'EN': 'Attached {name}', 'JA': '{name} を添付しました',
        'KO': '{name} 첨부됨', 'ZH': '已附加 {name}', 'ES': '{name} adjuntado',
        'FR': '{name} joint', 'DE': '{name} angehängt', 'PT': '{name} anexado',
        'AR': 'تم إرفاق {name}',
    },
    'Could not read {name}': {
        'ID': 'Tidak bisa membaca {name}', 'EN': 'Could not read {name}',
        'JA': '{name} を読み込めませんでした', 'KO': '{name} 을(를) 읽을 수 없습니다',
        'ZH': '无法读取 {name}', 'ES': 'No se pudo leer {name}',
        'FR': 'Impossible de lire {name}', 'DE': '{name} konnte nicht gelesen werden',
        'PT': 'Não foi possível ler {name}', 'AR': 'تعذّر قراءة {name}',
    },
    'Could not read that folder': {
        'ID': 'Tidak bisa membaca folder itu', 'EN': 'Could not read that folder',
        'JA': 'そのフォルダーを読み込めませんでした', 'KO': '해당 폴더를 읽을 수 없습니다',
        'ZH': '无法读取该文件夹', 'ES': 'No se pudo leer esa carpeta',
        'FR': 'Impossible de lire ce dossier', 'DE': 'Ordner konnte nicht gelesen werden',
        'PT': 'Não foi possível ler essa pasta', 'AR': 'تعذّر قراءة هذا المجلد',
    },
    'Add a file, an image or dictate': {
        'ID': 'Tambah berkas, gambar, atau diktekan',
        'EN': 'Add a file, an image or dictate', 'JA': 'ファイル・画像の追加、または音声入力',
        'KO': '파일, 이미지 추가 또는 받아쓰기', 'ZH': '添加文件、图片或语音输入',
        'ES': 'Añadir un archivo, una imagen o dictar',
        'FR': 'Ajouter un fichier, une image ou dicter',
        'DE': 'Datei, Bild hinzufügen oder diktieren',
        'PT': 'Adicionar um arquivo, uma imagem ou ditar',
        'AR': 'أضف ملفًا أو صورة أو أملِ',
    },
    '{n} waiting': {
        'ID': '{n} menunggu', 'EN': '{n} waiting', 'JA': '{n} 件待機中',
        'KO': '{n}개 대기 중', 'ZH': '{n} 条等待中', 'ES': '{n} en espera',
        'FR': '{n} en attente', 'DE': '{n} wartend', 'PT': '{n} em espera',
        'AR': '{n} في الانتظار',
    },
    'Clear the queue': {
        'ID': 'Kosongkan antrian', 'EN': 'Clear the queue', 'JA': 'キューを空にする',
        'KO': '대기열 비우기', 'ZH': '清空队列', 'ES': 'Vaciar la cola',
        'FR': 'Vider la file', 'DE': 'Warteschlange leeren', 'PT': 'Limpar a fila',
        'AR': 'إفراغ قائمة الانتظار',
    },
    'Remove from the queue': {
        'ID': 'Hapus dari antrian', 'EN': 'Remove from the queue',
        'JA': 'キューから削除', 'KO': '대기열에서 제거', 'ZH': '从队列中移除',
        'ES': 'Quitar de la cola', 'FR': 'Retirer de la file',
        'DE': 'Aus der Warteschlange entfernen', 'PT': 'Remover da fila',
        'AR': 'إزالة من قائمة الانتظار',
    },
    'Refresh models': {
        'ID': 'Muat ulang model', 'EN': 'Refresh models', 'JA': 'モデルを更新',
        'KO': '모델 새로 고침', 'ZH': '刷新模型', 'ES': 'Actualizar modelos',
        'FR': 'Actualiser les modèles', 'DE': 'Modelle aktualisieren',
        'PT': 'Atualizar modelos', 'AR': 'تحديث النماذج',
    },
    'Refreshing…': {
        'ID': 'Memuat ulang…', 'EN': 'Refreshing…', 'JA': '更新中…', 'KO': '새로 고치는 중…',
        'ZH': '正在刷新…', 'ES': 'Actualizando…', 'FR': 'Actualisation…',
        'DE': 'Aktualisiere…', 'PT': 'Atualizando…', 'AR': 'جارٍ التحديث…',
    },
    'Edit models…': {
        'ID': 'Ubah model…', 'EN': 'Edit models…', 'JA': 'モデルを編集…',
        'KO': '모델 편집…', 'ZH': '编辑模型…', 'ES': 'Editar modelos…',
        'FR': 'Modifier les modèles…', 'DE': 'Modelle bearbeiten…',
        'PT': 'Editar modelos…', 'AR': 'تعديل النماذج…',
    },
    'from provider': {
        'ID': 'dari provider', 'EN': 'from provider', 'JA': 'プロバイダーから',
        'KO': '제공자에서', 'ZH': '来自提供商', 'ES': 'del proveedor',
        'FR': 'du fournisseur', 'DE': 'vom Anbieter', 'PT': 'do provedor',
        'AR': 'من المزوّد',
    },
    'saved': {
        'ID': 'tersimpan', 'EN': 'saved', 'JA': '保存済み', 'KO': '저장됨', 'ZH': '已保存',
        'ES': 'guardado', 'FR': 'enregistré', 'DE': 'gespeichert', 'PT': 'salvo',
        'AR': 'محفوظ',
    },
    'same as the conversation': {
        'ID': 'sama seperti percakapan', 'EN': 'same as the conversation',
        'JA': '会話と同じ', 'KO': '대화와 동일', 'ZH': '与对话相同',
        'ES': 'igual que la conversación', 'FR': 'comme la conversation',
        'DE': 'wie die Unterhaltung', 'PT': 'igual à conversa', 'AR': 'مثل المحادثة',
    },
}

NAMA = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']

for nama in NAMA:
    m = re.search(r"const %s: Dict = \{\r?\n" % nama, s)
    if not m:
        print('  blok %s tidak ketemu' % nama)
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
print('  OK: %d kunci x %d bahasa' % (len(KUNCI), len(NAMA)))
