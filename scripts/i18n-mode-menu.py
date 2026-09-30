# -*- coding: utf-8 -*-
"""Kunci i18n untuk ModeMenu + IzinMenu (panel AI)."""

import io
import re

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

KUNCI = {
    'Mode': {
        'ID': 'Mode', 'EN': 'Mode', 'JA': 'モード', 'KO': '모드', 'ZH': '模式',
        'ES': 'Modo', 'FR': 'Mode', 'DE': 'Modus', 'PT': 'Modo', 'AR': 'الوضع',
    },
    'Permissions': {
        'ID': 'Izin', 'EN': 'Permissions', 'JA': '権限', 'KO': '권한', 'ZH': '权限',
        'ES': 'Permisos', 'FR': 'Autorisations', 'DE': 'Berechtigungen',
        'PT': 'Permissões', 'AR': 'الأذونات',
    },
    'Reasoning': {
        'ID': 'Penalaran', 'EN': 'Reasoning', 'JA': '推論', 'KO': '추론', 'ZH': '推理',
        'ES': 'Razonamiento', 'FR': 'Raisonnement', 'DE': 'Schlussfolgern',
        'PT': 'Raciocínio', 'AR': 'الاستدلال',
    },
    'Ordinary Q&A. No tools, no project context.': {
        'ID': 'Tanya jawab biasa. Tanpa alat, tanpa konteks proyek.',
        'EN': 'Ordinary Q&A. No tools, no project context.',
        'JA': '通常の質疑応答。ツールもプロジェクト文脈も使いません。',
        'KO': '일반 질의응답. 도구와 프로젝트 맥락을 사용하지 않습니다.',
        'ZH': '普通问答。不使用工具与项目上下文。',
        'ES': 'Preguntas y respuestas normales. Sin herramientas ni contexto del proyecto.',
        'FR': 'Questions-réponses classiques. Sans outils ni contexte du projet.',
        'DE': 'Normale Fragen und Antworten. Keine Werkzeuge, kein Projektkontext.',
        'PT': 'Perguntas e respostas comuns. Sem ferramentas nem contexto do projeto.',
        'AR': 'أسئلة وأجوبة عادية. بلا أدوات وبلا سياق المشروع.',
    },
    'Reads files, runs commands, works until done.': {
        'ID': 'Membaca berkas, menjalankan perintah, bekerja sampai selesai.',
        'EN': 'Reads files, runs commands, works until done.',
        'JA': 'ファイルを読み、コマンドを実行し、完了まで作業します。',
        'KO': '파일을 읽고 명령을 실행하며 끝까지 작업합니다.',
        'ZH': '读取文件、运行命令，直到完成。',
        'ES': 'Lee archivos, ejecuta comandos y trabaja hasta terminar.',
        'FR': 'Lit les fichiers, exécute des commandes et travaille jusqu’au bout.',
        'DE': 'Liest Dateien, führt Befehle aus und arbeitet bis zum Ende.',
        'PT': 'Lê arquivos, executa comandos e trabalha até terminar.',
        'AR': 'يقرأ الملفات وينفّذ الأوامر ويعمل حتى الانتهاء.',
    },
    'Agent mode - the AI reads files and runs commands': {
        'ID': 'Mode agen — AI membaca berkas dan menjalankan perintah',
        'EN': 'Agent mode - the AI reads files and runs commands',
        'JA': 'エージェントモード — AI がファイルを読みコマンドを実行します',
        'KO': '에이전트 모드 — AI가 파일을 읽고 명령을 실행합니다',
        'ZH': '代理模式 — AI 读取文件并运行命令',
        'ES': 'Modo agente: la IA lee archivos y ejecuta comandos',
        'FR': 'Mode agent : l’IA lit les fichiers et exécute des commandes',
        'DE': 'Agent-Modus – die KI liest Dateien und führt Befehle aus',
        'PT': 'Modo agente — a IA lê arquivos e executa comandos',
        'AR': 'وضع الوكيل — يقرأ الذكاء الاصطناعي الملفات وينفّذ الأوامر',
    },
    'Chat mode - ordinary Q&A, no tools': {
        'ID': 'Mode chat — tanya jawab biasa, tanpa alat',
        'EN': 'Chat mode - ordinary Q&A, no tools',
        'JA': 'チャットモード — 通常の質疑応答、ツールなし',
        'KO': '채팅 모드 — 일반 질의응답, 도구 없음',
        'ZH': '聊天模式 — 普通问答，不使用工具',
        'ES': 'Modo chat: preguntas y respuestas, sin herramientas',
        'FR': 'Mode chat : questions-réponses, sans outils',
        'DE': 'Chat-Modus – normale Fragen und Antworten, keine Werkzeuge',
        'PT': 'Modo chat — perguntas e respostas, sem ferramentas',
        'AR': 'وضع المحادثة — أسئلة وأجوبة عادية بلا أدوات',
    },
    'Manage personas & sub-agents': {
        'ID': 'Kelola persona & sub-agent', 'EN': 'Manage personas & sub-agents',
        'JA': 'ペルソナとサブエージェントを管理', 'KO': '페르소나 및 서브에이전트 관리',
        'ZH': '管理人格与子代理', 'ES': 'Gestionar personas y subagentes',
        'FR': 'Gérer les personas et sous-agents', 'DE': 'Personas und Subagenten verwalten',
        'PT': 'Gerenciar personas e subagentes', 'AR': 'إدارة الشخصيات والوكلاء الفرعيين',
    },
    'Opens Settings → Agents': {
        'ID': 'Membuka Pengaturan → Agen', 'EN': 'Opens Settings → Agents',
        'JA': '設定 → エージェントを開きます', 'KO': '설정 → 에이전트를 엽니다',
        'ZH': '打开设置 → 代理', 'ES': 'Abre Ajustes → Agentes',
        'FR': 'Ouvre Paramètres → Agents', 'DE': 'Öffnet Einstellungen → Agenten',
        'PT': 'Abre Configurações → Agentes', 'AR': 'يفتح الإعدادات ← الوكلاء',
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
