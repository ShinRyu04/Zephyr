# -*- coding: utf-8 -*-
"""Ganti toast Indonesia di aiStore.ts dengan kunci i18n + tambah kamusnya."""

import io
import re

# (Indonesia lama, kunci i18n baru, terjemahan 10 bahasa)
GANTI = [
    (
        '`Maksimal ${MAX_IMAGES} gambar per pesan`',
        '`Too many images - the limit is {n} per message`',
        {'ID': 'Terlalu banyak gambar - batasnya {n} per pesan', 'EN': 'Too many images - the limit is {n} per message',
         'JA': '画像が多すぎます - 上限は 1 メッセージあたり {n} 枚です', 'KO': '이미지가 너무 많습니다 - 메시지당 {n}개까지 가능합니다',
         'ZH': '图片过多 - 每条消息最多 {n} 张', 'ES': 'Demasiadas imágenes - el límite es {n} por mensaje',
         'FR': 'Trop d’images - la limite est de {n} par message', 'DE': 'Zu viele Bilder - das Limit sind {n} pro Nachricht',
         'PT': 'Imagens demais - o limite é {n} por mensagem', 'AR': 'صور كثيرة جدًا - الحد {n} لكل رسالة'},
    ),
    (
        '`${lama.length} pesan dipadatkan`',
        '`{n} messages compacted`',
        {'ID': '{n} pesan dipadatkan', 'EN': '{n} messages compacted', 'JA': '{n} 件のメッセージを圧縮しました',
         'KO': '{n}개 메시지 압축됨', 'ZH': '已压缩 {n} 条消息', 'ES': '{n} mensajes compactados',
         'FR': '{n} messages compactés', 'DE': '{n} Nachrichten verdichtet', 'PT': '{n} mensagens compactadas',
         'AR': 'تم ضغط {n} رسالة'},
    ),
    (
        "'Riwayat chat dibersihkan'",
        "'Chat history cleared'",
        {'ID': 'Riwayat chat dibersihkan', 'EN': 'Chat history cleared', 'JA': 'チャット履歴を消去しました',
         'KO': '채팅 기록을 지웠습니다', 'ZH': '聊天记录已清空', 'ES': 'Historial de chat borrado',
         'FR': 'Historique effacé', 'DE': 'Chat-Verlauf gelöscht', 'PT': 'Histórico de chat apagado',
         'AR': 'تم مسح سجل المحادثات'},
    ),
    (
        "'Tidak ada pesan untuk diekspor'",
        "'Nothing to export yet'",
        {'ID': 'Belum ada yang bisa diekspor', 'EN': 'Nothing to export yet', 'JA': 'エクスポートする内容がありません',
         'KO': '내보낼 내용이 없습니다', 'ZH': '暂无可导出的内容', 'ES': 'Nada que exportar todavía',
         'FR': 'Rien à exporter pour l’instant', 'DE': 'Noch nichts zu exportieren', 'PT': 'Nada para exportar ainda',
         'AR': 'لا يوجد ما يمكن تصديره بعد'},
    ),
    (
        '`Chat diekspor (${md.length} karakter) — disalin ke clipboard`',
        '`Chat exported ({n} characters) - copied to the clipboard`',
        {'ID': 'Chat diekspor ({n} karakter) - disalin ke clipboard', 'EN': 'Chat exported ({n} characters) - copied to the clipboard',
         'JA': 'チャットを書き出しました ({n} 文字) - クリップボードにコピーしました',
         'KO': '채팅을 내보냈습니다 ({n}자) - 클립보드에 복사했습니다',
         'ZH': '聊天已导出（{n} 个字符）- 已复制到剪贴板',
         'ES': 'Chat exportado ({n} caracteres) - copiado al portapapeles',
         'FR': 'Chat exporté ({n} caractères) - copié dans le presse-papiers',
         'DE': 'Chat exportiert ({n} Zeichen) - in die Zwischenablage kopiert',
         'PT': 'Chat exportado ({n} caracteres) - copiado para a área de transferência',
         'AR': 'تم تصدير المحادثة ({n} حرفًا) - وتم نسخها إلى الحافظة'},
    ),
    (
        '`Pesan ${raw.length} karakter dipotong ke ${MSG_LIMIT}`',
        '`Message trimmed from {from} to {to} characters`',
        {'ID': 'Pesan dipotong dari {from} ke {to} karakter', 'EN': 'Message trimmed from {from} to {to} characters',
         'JA': 'メッセージを {from} 文字から {to} 文字に切り詰めました', 'KO': '메시지를 {from}자에서 {to}자로 줄였습니다',
         'ZH': '消息已从 {from} 个字符截断为 {to} 个字符', 'ES': 'Mensaje recortado de {from} a {to} caracteres',
         'FR': 'Message tronqué de {from} à {to} caractères', 'DE': 'Nachricht von {from} auf {to} Zeichen gekürzt',
         'PT': 'Mensagem cortada de {from} para {to} caracteres', 'AR': 'تم تقليم الرسالة من {from} إلى {to} حرفًا'},
    ),
    (
        '`${label} belum ada key — pindah ke ${labelPindah} yang sudah kamu isi`',
        '`No key for {from} - switched to {to}, which has one`',
        {'ID': 'Belum ada key untuk {from} - pindah ke {to} yang sudah diisi', 'EN': 'No key for {from} - switched to {to}, which has one',
         'JA': '{from} のキーがありません - 設定済みの {to} に切り替えました',
         'KO': '{from} 키가 없습니다 - 키가 있는 {to}(으)로 전환했습니다',
         'ZH': '{from} 没有密钥 - 已切换到已配置的 {to}', 'ES': 'Sin clave para {from} - cambiado a {to}, que sí la tiene',
         'FR': 'Pas de clé pour {from} - basculé vers {to}, qui en a une',
         'DE': 'Kein Schlüssel für {from} - gewechselt zu {to}, das einen hat',
         'PT': 'Sem chave para {from} - trocado para {to}, que tem',
         'AR': 'لا يوجد مفتاح لـ {from} - تم التبديل إلى {to} الذي لديه مفتاح'},
    ),
    (
        '`Isi API key ${label} di Settings → Model AI (atau pilih provider yang sudah kamu isi)`',
        '`Add an API key for {name} in Settings, or pick a provider that already has one`',
        {'ID': 'Isi API key {name} di Settings, atau pilih provider yang sudah diisi',
         'EN': 'Add an API key for {name} in Settings, or pick a provider that already has one',
         'JA': 'Settings で {name} の API キーを入力するか、設定済みのプロバイダーを選んでください',
         'KO': 'Settings에서 {name} API 키를 입력하거나, 이미 키가 있는 제공자를 선택하세요',
         'ZH': '请在 Settings 中填写 {name} 的 API 密钥，或选择已配置的提供商',
         'ES': 'Añade una clave de API para {name} en Settings, o elige un proveedor que ya la tenga',
         'FR': 'Ajoutez une clé API pour {name} dans Settings, ou choisissez un fournisseur qui en a déjà une',
         'DE': 'Füge einen API-Schlüssel für {name} in Settings hinzu oder wähle einen Anbieter mit Schlüssel',
         'PT': 'Adicione uma chave de API para {name} em Settings, ou escolha um provedor que já tenha',
         'AR': 'أضف مفتاح API لـ {name} في الإعدادات، أو اختر مزوّدًا لديه مفتاح بالفعل'},
    ),
    (
        '`File "${nama}" tidak terbuka di editor`',
        '`"{name}" is not open in the editor`',
        {'ID': '"{name}" tidak terbuka di editor', 'EN': '"{name}" is not open in the editor',
         'JA': '"{name}" はエディターで開かれていません', 'KO': '"{name}" 파일이 편집기에서 열려 있지 않습니다',
         'ZH': '"{name}" 未在编辑器中打开', 'ES': '"{name}" no está abierto en el editor',
         'FR': '"{name}" n’est pas ouvert dans l’éditeur', 'DE': '"{name}" ist nicht im Editor geöffnet',
         'PT': '"{name}" não está aberto no editor', 'AR': '"{name}" غير مفتوح في المحرر'},
    ),
    (
        "'Masih ada tugas agent berjalan — Stop dulu'",
        "'An agent task is still running - stop it first'",
        {'ID': 'Masih ada tugas agent berjalan - hentikan dulu', 'EN': 'An agent task is still running - stop it first',
         'JA': 'エージェントのタスクが実行中です - 先に停止してください',
         'KO': '에이전트 작업이 아직 실행 중입니다 - 먼저 중지하세요',
         'ZH': '代理任务仍在运行 - 请先停止', 'ES': 'Una tarea del agente sigue en curso - deténla primero',
         'FR': 'Une tâche de l’agent est en cours - arrêtez-la d’abord',
         'DE': 'Eine Agent-Aufgabe läuft noch - zuerst stoppen',
         'PT': 'Uma tarefa do agente ainda está rodando - pare primeiro',
         'AR': 'مهمة الوكيل ما زالت تعمل - أوقفها أولًا'},
    ),
    (
        "'Tidak bisa membuka pane terminal'",
        "'Could not open a terminal pane'",
        {'ID': 'Tidak bisa membuka pane terminal', 'EN': 'Could not open a terminal pane',
         'JA': 'ターミナルペインを開けませんでした', 'KO': '터미널 창을 열 수 없습니다',
         'ZH': '无法打开终端窗格', 'ES': 'No se pudo abrir un panel de terminal',
         'FR': 'Impossible d’ouvrir un volet de terminal', 'DE': 'Terminal-Bereich konnte nicht geöffnet werden',
         'PT': 'Não foi possível abrir um painel de terminal', 'AR': 'تعذّر فتح جزء الطرفية'},
    ),
    (
        "'Perintah dikirim ke terminal'",
        "'Command sent to the terminal'",
        {'ID': 'Perintah dikirim ke terminal', 'EN': 'Command sent to the terminal',
         'JA': 'コマンドをターミナルに送信しました', 'KO': '명령을 터미널로 보냈습니다',
         'ZH': '命令已发送到终端', 'ES': 'Comando enviado al terminal',
         'FR': 'Commande envoyée au terminal', 'DE': 'Befehl an das Terminal gesendet',
         'PT': 'Comando enviado ao terminal', 'AR': 'تم إرسال الأمر إلى الطرفية'},
    ),
    (
        "'Ditambahkan ke antrian'",
        "'Added to the queue'",
        {'ID': 'Ditambahkan ke antrian', 'EN': 'Added to the queue', 'JA': 'キューに追加しました',
         'KO': '대기열에 추가했습니다', 'ZH': '已加入队列', 'ES': 'Añadido a la cola',
         'FR': 'Ajouté à la file', 'DE': 'Zur Warteschlange hinzugefügt', 'PT': 'Adicionado à fila',
         'AR': 'أُضيف إلى قائمة الانتظار'},
    ),
]

# 1. Ganti di aiStore.ts — bungkus dengan tr()/tf()
P = 'src/lib/aiStore.ts'
s = io.open(P, encoding='utf-8', newline='').read()

ganti_src = {
    '`Maksimal ${MAX_IMAGES} gambar per pesan`': 'tf(\'Too many images - the limit is {n} per message\', { n: MAX_IMAGES })',
    '`${lama.length} pesan dipadatkan`': "tf('{n} messages compacted', { n: lama.length })",
    "'Riwayat chat dibersihkan'": "tr('Chat history cleared')",
    "'Tidak ada pesan untuk diekspor'": "tr('Nothing to export yet')",
    '`Chat diekspor (${md.length} karakter) — disalin ke clipboard`': "tf('Chat exported ({n} characters) - copied to the clipboard', { n: md.length })",
    '`Pesan ${raw.length} karakter dipotong ke ${MSG_LIMIT}`': "tf('Message trimmed from {from} to {to} characters', { from: raw.length, to: MSG_LIMIT })",
    '`${label} belum ada key — pindah ke ${labelPindah} yang sudah kamu isi`': "tf('No key for {from} - switched to {to}, which has one', { from: label, to: labelPindah })",
    '`Isi API key ${label} di Settings → Model AI (atau pilih provider yang sudah kamu isi)`': "tf('Add an API key for {name} in Settings, or pick a provider that already has one', { name: label })",
    '`File "${nama}" tidak terbuka di editor`': "tf('\"{name}\" is not open in the editor', { name: nama })",
    "'Masih ada tugas agent berjalan — Stop dulu'": "tr('An agent task is still running - stop it first')",
    "'Tidak bisa membuka pane terminal'": "tr('Could not open a terminal pane')",
    "'Perintah dikirim ke terminal'": "tr('Command sent to the terminal')",
    "'Ditambahkan ke antrian'": "tr('Added to the queue')",
}

n = 0
for lama, baru in ganti_src.items():
    if lama in s:
        s = s.replace(lama, baru)
        n += 1
    else:
        print('  MISS aiStore:', lama[:50])

# Import tr/tf kalau belum ada
if "from './i18n'" not in s and 'useT' not in s:
    # cek apakah sudah ada helper terjemahan
    if 'const tr = ' not in s and 'import { tr' not in s:
        print('  ⚠ aiStore belum punya tr/tf - perlu import manual')

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('  aiStore: %d diganti' % n)

# 2. Tambah kamus
P2 = 'src/lib/i18n-extra.ts'
t = io.open(P2, encoding='utf-8', newline='').read()
NAMA = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']

for nama in NAMA:
    m = re.search(r"const %s: Dict = \{\r?\n" % nama, t)
    if not m:
        continue
    crlf = '\r\n' in m.group(0)
    akhir = t.find('\n};', m.end())
    rentang = t[m.end():akhir]
    sisip = ''
    for _, kunci, per in GANTI:
        if "'%s':" % kunci in rentang:
            continue
        nilai = per[nama].replace("'", "\\'")
        sisip += "  '%s': '%s',%s" % (kunci, nilai, '\r\n' if crlf else '\n')
    if sisip:
        t = t[:m.end()] + sisip + t[m.end():]

io.open(P2, 'w', encoding='utf-8', newline='').write(t)
print('  kamus: %d kunci x 10 bahasa' % len(GANTI))
