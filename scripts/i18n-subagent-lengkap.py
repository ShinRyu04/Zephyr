# -*- coding: utf-8 -*-
"""
Tambah kunci i18n untuk daftar sub-agent & role bawaan.

Masalah yang diperbaiki: 'Ubah'/'Hapus'/'aktif'/'nonaktif'/'alat' belum ada di
kamus, dan nama role bawaan (Cari, Telaah, ...) ditampilkan mentah. Skrip
sebelumnya hanya menyisipkan ke blok pertama yang cocok, jadi hanya ID yang
kena — skrip ini menyisipkan ke SETIAP blok bahasa.
"""

import io

P = 'src/lib/i18n-extra.ts'
s = io.open(P, encoding='utf-8', newline='').read()

# kunci -> {bahasa: terjemahan}
KUNCI = {
    'Ubah': {
        'ID': 'Ubah', 'EN': 'Edit', 'JA': '編集', 'KO': '편집', 'ZH': '编辑',
        'ES': 'Editar', 'FR': 'Modifier', 'DE': 'Bearbeiten', 'PT': 'Editar', 'AR': 'تحرير',
    },
    'Hapus': {
        'ID': 'Hapus', 'EN': 'Delete', 'JA': '削除', 'KO': '삭제', 'ZH': '删除',
        'ES': 'Eliminar', 'FR': 'Supprimer', 'DE': 'Löschen', 'PT': 'Excluir', 'AR': 'حذف',
    },
    'aktif': {
        'ID': 'aktif', 'EN': 'active', 'JA': '有効', 'KO': '활성', 'ZH': '已启用',
        'ES': 'activo', 'FR': 'actif', 'DE': 'aktiv', 'PT': 'ativo', 'AR': 'نشط',
    },
    'nonaktif': {
        'ID': 'nonaktif', 'EN': 'inactive', 'JA': '無効', 'KO': '비활성', 'ZH': '已停用',
        'ES': 'inactivo', 'FR': 'inactif', 'DE': 'inaktiv', 'PT': 'inativo', 'AR': 'غير نشط',
    },
    'alat': {
        'ID': 'alat', 'EN': 'tools', 'JA': 'ツール', 'KO': '도구', 'ZH': '工具',
        'ES': 'herramientas', 'FR': 'outils', 'DE': 'Werkzeuge', 'PT': 'ferramentas', 'AR': 'أدوات',
    },
    # Role bawaan sub-agent.
    'Cari': {
        'ID': 'Cari', 'EN': 'Search', 'JA': '検索', 'KO': '검색', 'ZH': '搜索',
        'ES': 'Buscar', 'FR': 'Recherche', 'DE': 'Suchen', 'PT': 'Buscar', 'AR': 'بحث',
    },
    'Telaah': {
        'ID': 'Telaah', 'EN': 'Review', 'JA': 'レビュー', 'KO': '검토', 'ZH': '审查',
        'ES': 'Revisar', 'FR': 'Analyse', 'DE': 'Prüfen', 'PT': 'Revisar', 'AR': 'مراجعة',
    },
    'Rencana': {
        'ID': 'Rencana', 'EN': 'Plan', 'JA': '計画', 'KO': '계획', 'ZH': '计划',
        'ES': 'Plan', 'FR': 'Plan', 'DE': 'Plan', 'PT': 'Plano', 'AR': 'خطة',
    },
    'Audit': {
        'ID': 'Audit', 'EN': 'Audit', 'JA': '監査', 'KO': '감사', 'ZH': '审计',
        'ES': 'Auditoría', 'FR': 'Audit', 'DE': 'Audit', 'PT': 'Auditoria', 'AR': 'تدقيق',
    },
    'Kerja': {
        'ID': 'Kerja', 'EN': 'Work', 'JA': '作業', 'KO': '작업', 'ZH': '执行',
        'ES': 'Trabajar', 'FR': 'Travail', 'DE': 'Arbeiten', 'PT': 'Trabalhar', 'AR': 'عمل',
    },
    'Jelajah': {
        'ID': 'Jelajah', 'EN': 'Explore', 'JA': '探索', 'KO': '탐색', 'ZH': '探索',
        'ES': 'Explorar', 'FR': 'Explorer', 'DE': 'Erkunden', 'PT': 'Explorar', 'AR': 'استكشاف',
    },
    # Hint role bawaan.
    'Telusuri kode': {
        'ID': 'Telusuri kode', 'EN': 'Search the code', 'JA': 'コードを検索', 'KO': '코드 검색',
        'ZH': '搜索代码', 'ES': 'Buscar en el código', 'FR': 'Chercher dans le code',
        'DE': 'Code durchsuchen', 'PT': 'Pesquisar no código', 'AR': 'ابحث في الكود',
    },
    'Analisis mendalam': {
        'ID': 'Analisis mendalam', 'EN': 'In-depth analysis', 'JA': '詳細分析', 'KO': '심층 분석',
        'ZH': '深入分析', 'ES': 'Análisis profundo', 'FR': 'Analyse approfondie',
        'DE': 'Tiefenanalyse', 'PT': 'Análise aprofundada', 'AR': 'تحليل معمّق',
    },
    'Susun langkah': {
        'ID': 'Susun langkah', 'EN': 'Plan the steps', 'JA': '手順を組み立てる', 'KO': '단계 구성',
        'ZH': '规划步骤', 'ES': 'Planificar los pasos', 'FR': 'Planifier les étapes',
        'DE': 'Schritte planen', 'PT': 'Planejar as etapas', 'AR': 'خطّط الخطوات',
    },
    'Periksa mutu': {
        'ID': 'Periksa mutu', 'EN': 'Check quality', 'JA': '品質を確認', 'KO': '품질 점검',
        'ZH': '检查质量', 'ES': 'Comprobar la calidad', 'FR': 'Vérifier la qualité',
        'DE': 'Qualität prüfen', 'PT': 'Verificar a qualidade', 'AR': 'افحص الجودة',
    },
    'Ubah berkas': {
        'ID': 'Ubah berkas', 'EN': 'Edit files', 'JA': 'ファイルを編集', 'KO': '파일 편집',
        'ZH': '修改文件', 'ES': 'Editar archivos', 'FR': 'Modifier des fichiers',
        'DE': 'Dateien ändern', 'PT': 'Editar arquivos', 'AR': 'حرّر الملفات',
    },
    'Petakan proyek': {
        'ID': 'Petakan proyek', 'EN': 'Map the project', 'JA': 'プロジェクトを把握', 'KO': '프로젝트 파악',
        'ZH': '梳理项目', 'ES': 'Mapear el proyecto', 'FR': 'Cartographier le projet',
        'DE': 'Projekt erfassen', 'PT': 'Mapear o projeto', 'AR': 'ارسم خريطة المشروع',
    },
    # Label alat (dipakai chip & ringkasan "8 alat").
    'Baca berkas': {
        'ID': 'Baca berkas', 'EN': 'Read file', 'JA': 'ファイルを読む', 'KO': '파일 읽기',
        'ZH': '读取文件', 'ES': 'Leer archivo', 'FR': 'Lire un fichier',
        'DE': 'Datei lesen', 'PT': 'Ler arquivo', 'AR': 'اقرأ ملفًا',
    },
    'Daftar folder': {
        'ID': 'Daftar folder', 'EN': 'List dir', 'JA': 'フォルダ一覧', 'KO': '폴더 목록',
        'ZH': '列出目录', 'ES': 'Listar carpeta', 'FR': 'Lister le dossier',
        'DE': 'Ordner auflisten', 'PT': 'Listar pasta', 'AR': 'اسرد المجلد',
    },
    'Jalankan perintah': {
        'ID': 'Jalankan perintah', 'EN': 'Run command', 'JA': 'コマンド実行', 'KO': '명령 실행',
        'ZH': '运行命令', 'ES': 'Ejecutar comando', 'FR': 'Exécuter une commande',
        'DE': 'Befehl ausführen', 'PT': 'Executar comando', 'AR': 'نفّذ أمرًا',
    },
    'Baca terminal': {
        'ID': 'Baca terminal', 'EN': 'Read terminal', 'JA': 'ターミナルを読む', 'KO': '터미널 읽기',
        'ZH': '读取终端', 'ES': 'Leer terminal', 'FR': 'Lire le terminal',
        'DE': 'Terminal lesen', 'PT': 'Ler terminal', 'AR': 'اقرأ الطرفية',
    },
    'Diagnostik': {
        'ID': 'Diagnostik', 'EN': 'Diagnostics', 'JA': '診断', 'KO': '진단', 'ZH': '诊断',
        'ES': 'Diagnóstico', 'FR': 'Diagnostics', 'DE': 'Diagnose', 'PT': 'Diagnóstico', 'AR': 'تشخيص',
    },
    'Log output': {
        'ID': 'Log output', 'EN': 'Output log', 'JA': '出力ログ', 'KO': '출력 로그', 'ZH': '输出日志',
        'ES': 'Registro de salida', 'FR': 'Journal de sortie', 'DE': 'Ausgabeprotokoll',
        'PT': 'Registro de saída', 'AR': 'سجل الإخراج',
    },
    'Daftar skill': {
        'ID': 'Daftar skill', 'EN': 'List skills', 'JA': 'スキル一覧', 'KO': '스킬 목록',
        'ZH': '列出技能', 'ES': 'Listar habilidades', 'FR': 'Lister les compétences',
        'DE': 'Fähigkeiten auflisten', 'PT': 'Listar habilidades', 'AR': 'اسرد المهارات',
    },
    'Baca memori': {
        'ID': 'Baca memori', 'EN': 'Read memory', 'JA': 'メモリを読む', 'KO': '메모리 읽기',
        'ZH': '读取记忆', 'ES': 'Leer memoria', 'FR': 'Lire la mémoire',
        'DE': 'Speicher lesen', 'PT': 'Ler memória', 'AR': 'اقرأ الذاكرة',
    },
    # Hint alat.
    'Buka isi satu berkas': {
        'ID': 'Buka isi satu berkas', 'EN': 'Open the contents of one file', 'JA': '1つのファイルの内容を開く',
        'KO': '파일 하나의 내용 열기', 'ZH': '打开单个文件的内容', 'ES': 'Abrir el contenido de un archivo',
        'FR': 'Ouvrir le contenu d’un fichier', 'DE': 'Inhalt einer Datei öffnen',
        'PT': 'Abrir o conteúdo de um arquivo', 'AR': 'افتح محتوى ملف واحد',
    },
    'Lihat isi sebuah folder': {
        'ID': 'Lihat isi sebuah folder', 'EN': 'See what a folder holds', 'JA': 'フォルダの中身を見る',
        'KO': '폴더 내용 보기', 'ZH': '查看文件夹内容', 'ES': 'Ver el contenido de una carpeta',
        'FR': 'Voir le contenu d’un dossier', 'DE': 'Ordnerinhalt ansehen',
        'PT': 'Ver o conteúdo de uma pasta', 'AR': 'اطّلع على محتوى مجلد',
    },
    'Cari lewat rg / git / find': {
        'ID': 'Cari lewat rg / git / find', 'EN': 'Search via rg / git / find', 'JA': 'rg / git / find で検索',
        'KO': 'rg / git / find로 검색', 'ZH': '通过 rg / git / find 搜索',
        'ES': 'Buscar con rg / git / find', 'FR': 'Chercher via rg / git / find',
        'DE': 'Über rg / git / find suchen', 'PT': 'Pesquisar via rg / git / find',
        'AR': 'ابحث عبر rg / git / find',
    },
    'Lihat keluaran terminal pane': {
        'ID': 'Lihat keluaran terminal pane', 'EN': 'See the terminal pane output',
        'JA': 'ターミナルペインの出力を見る', 'KO': '터미널 창 출력 보기', 'ZH': '查看终端窗格输出',
        'ES': 'Ver la salida del panel de terminal', 'FR': 'Voir la sortie du volet terminal',
        'DE': 'Ausgabe des Terminalbereichs ansehen', 'PT': 'Ver a saída do painel de terminal',
        'AR': 'اطّلع على إخراج لوحة الطرفية',
    },
    'Error dan peringatan editor': {
        'ID': 'Error dan peringatan editor', 'EN': 'Editor errors and warnings',
        'JA': 'エディタのエラーと警告', 'KO': '편집기 오류 및 경고', 'ZH': '编辑器错误与警告',
        'ES': 'Errores y avisos del editor', 'FR': 'Erreurs et avertissements de l’éditeur',
        'DE': 'Fehler und Warnungen des Editors', 'PT': 'Erros e avisos do editor',
        'AR': 'أخطاء المحرر وتحذيراته',
    },
    'Kanal Output panel bawah': {
        'ID': 'Kanal Output panel bawah', 'EN': 'The Output channel in the bottom panel',
        'JA': '下部パネルの出力チャネル', 'KO': '하단 패널의 출력 채널', 'ZH': '底部面板的输出通道',
        'ES': 'El canal de salida del panel inferior', 'FR': 'Le canal de sortie du panneau inférieur',
        'DE': 'Der Ausgabekanal im unteren Bereich', 'PT': 'O canal de saída do painel inferior',
        'AR': 'قناة الإخراج في اللوحة السفلية',
    },
    'Skill yang tersedia': {
        'ID': 'Skill yang tersedia', 'EN': 'Available skills', 'JA': '利用可能なスキル',
        'KO': '사용 가능한 스킬', 'ZH': '可用技能', 'ES': 'Habilidades disponibles',
        'FR': 'Compétences disponibles', 'DE': 'Verfügbare Fähigkeiten',
        'PT': 'Habilidades disponíveis', 'AR': 'المهارات المتاحة',
    },
    'Catatan lintas sesi': {
        'ID': 'Catatan lintas sesi', 'EN': 'Notes across sessions', 'JA': 'セッションをまたぐメモ',
        'KO': '세션 간 메모', 'ZH': '跨会话笔记', 'ES': 'Notas entre sesiones',
        'FR': 'Notes entre sessions', 'DE': 'Notizen über Sitzungen hinweg',
        'PT': 'Notas entre sessões', 'AR': 'ملاحظات عبر الجلسات',
    },
    'Tools': {
        'ID': 'Alat', 'EN': 'Tools', 'JA': 'ツール', 'KO': '도구', 'ZH': '工具',
        'ES': 'Herramientas', 'FR': 'Outils', 'DE': 'Werkzeuge', 'PT': 'Ferramentas', 'AR': 'أدوات',
    },
}

NAMA_BLOK = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']

# Sisipkan per blok. Setiap blok adalah "const XX: Dict = {" ... "};".
import re
for nama in NAMA_BLOK:
    m = re.search(r"const %s: Dict = \{\r?\n" % nama, s)
    if not m:
        print('  ⚠ blok %s tidak ketemu' % nama)
        continue
    crlf = '\r\n' in m.group(0)
    sisip = ''
    for kunci, per_bahasa in KUNCI.items():
        # Lewati kalau kunci sudah ada di blok ini. Cek di dalam rentang blok
        # saja supaya kunci yang sama di bahasa lain tidak dianggap duplikat.
        awal_blok = m.end()
        akhir_blok = s.find('\n};', awal_blok)
        rentang = s[awal_blok:akhir_blok]
        if "'%s':" % kunci in rentang:
            continue
        nilai = per_bahasa[nama].replace("'", "\\'")
        sisip += "  '%s': '%s',%s" % (kunci, nilai, '\r\n' if crlf else '\n')
    if sisip:
        s = s[:m.end()] + sisip + s[m.end():]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('  ✅ selesai — %d kunci × %d bahasa' % (len(KUNCI), len(NAMA_BLOK)))
