# -*- coding: utf-8 -*-
"""Kunci i18n untuk voice + slash command sesi."""

import io
import re

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

KUNCI = {
    'Dictate a message': {
        'ID': 'Diktekan pesan', 'EN': 'Dictate a message', 'JA': 'メッセージを音声入力',
        'KO': '음성으로 입력', 'ZH': '语音输入消息', 'ES': 'Dictar un mensaje',
        'FR': 'Dicter un message', 'DE': 'Nachricht diktieren',
        'PT': 'Ditar uma mensagem', 'AR': 'أملِ رسالة',
    },
    'Stop listening': {
        'ID': 'Berhenti mendengar', 'EN': 'Stop listening', 'JA': '聞き取りを停止',
        'KO': '듣기 중지', 'ZH': '停止聆听', 'ES': 'Dejar de escuchar',
        'FR': 'Arrêter l’écoute', 'DE': 'Zuhören beenden',
        'PT': 'Parar de ouvir', 'AR': 'أوقف الاستماع',
    },
    'Voice input is not available in this build': {
        'ID': 'Input suara tidak tersedia di build ini',
        'EN': 'Voice input is not available in this build',
        'JA': 'このビルドでは音声入力は利用できません',
        'KO': '이 빌드에서는 음성 입력을 사용할 수 없습니다',
        'ZH': '此版本不支持语音输入',
        'ES': 'La entrada de voz no está disponible en esta versión',
        'FR': 'La saisie vocale n’est pas disponible dans cette version',
        'DE': 'Spracheingabe ist in dieser Version nicht verfügbar',
        'PT': 'A entrada de voz não está disponível nesta versão',
        'AR': 'إدخال الصوت غير متاح في هذا الإصدار',
    },
    'Mulai percakapan baru': {
        'ID': 'Mulai percakapan baru', 'EN': 'Start a new conversation',
        'JA': '新しい会話を始める', 'KO': '새 대화 시작', 'ZH': '开始新对话',
        'ES': 'Iniciar una conversación nueva', 'FR': 'Démarrer une nouvelle conversation',
        'DE': 'Neue Unterhaltung starten', 'PT': 'Iniciar uma nova conversa',
        'AR': 'ابدأ محادثة جديدة',
    },
    'Hapus semua riwayat chat': {
        'ID': 'Hapus semua riwayat chat', 'EN': 'Delete all chat history',
        'JA': 'チャット履歴をすべて削除', 'KO': '모든 채팅 기록 삭제', 'ZH': '删除全部聊天记录',
        'ES': 'Eliminar todo el historial', 'FR': 'Supprimer tout l’historique',
        'DE': 'Gesamten Verlauf löschen', 'PT': 'Excluir todo o histórico',
        'AR': 'احذف كل سجل المحادثات',
    },
    'Padatkan konteks sesi ini': {
        'ID': 'Padatkan konteks sesi ini', 'EN': 'Compact this session’s context',
        'JA': 'このセッションのコンテキストを圧縮', 'KO': '이 세션의 컨텍스트 압축',
        'ZH': '压缩此会话上下文', 'ES': 'Compactar el contexto de esta sesión',
        'FR': 'Compacter le contexte de cette session',
        'DE': 'Kontext dieser Sitzung verdichten', 'PT': 'Compactar o contexto desta sessão',
        'AR': 'اضغط سياق هذه الجلسة',
    },
    'Salin percakapan sebagai markdown': {
        'ID': 'Salin percakapan sebagai markdown', 'EN': 'Copy the conversation as markdown',
        'JA': '会話を Markdown としてコピー', 'KO': '대화를 마크다운으로 복사',
        'ZH': '以 Markdown 复制对话', 'ES': 'Copiar la conversación como markdown',
        'FR': 'Copier la conversation en markdown', 'DE': 'Unterhaltung als Markdown kopieren',
        'PT': 'Copiar a conversa como markdown', 'AR': 'انسخ المحادثة بصيغة ماركداون',
    },
    'Thinking': {
        'ID': 'Berpikir', 'EN': 'Thinking', 'JA': '思考中', 'KO': '생각 중', 'ZH': '思考中',
        'ES': 'Pensando', 'FR': 'Réflexion', 'DE': 'Denkt nach', 'PT': 'Pensando', 'AR': 'يفكّر',
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
