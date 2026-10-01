// insert-i18n.mjs — sekali jalan: tambah update.* ke ID/EN, sisip 8 dict
// bahasa, perluas DICTS + UI_LANGS + fallback berlapis.
// Pakai: node scripts/insert-i18n.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/lib/i18n.ts';
let src = readFileSync(P, 'utf8');
const EOL = '\r\n';

const upd = {
  id: [
    "  'update.done': 'Zephyr diperbarui ke v{v}',",
    "  'update.doneHint': 'Restart untuk memakai versi terbaru.',",
    "  'update.whatsNew': 'Apa yang baru',",
    "  'update.fullChangelog': 'Buka changelog lengkap',",
    "  'common.ok': 'OK',",
    "  'common.close': 'Tutup',",
  ],
  en: [
    "  'update.done': 'Zephyr updated to v{v}',",
    "  'update.doneHint': 'Restart to use the latest version.',",
    '  \'update.whatsNew\': "What\'s new",',
    "  'update.fullChangelog': 'Open full changelog',",
    "  'common.ok': 'OK',",
    "  'common.close': 'Close',",
  ],
};

// kunci dasar 86 per bahasa: [key, JA, KO, ZH, ES, FR, DE, PT, AR]
const ROWS = [
  ['nav.explorer', 'エクスプローラー', '탐색기', '资源管理器', 'Explorador', 'Explorateur', 'Explorer', 'Explorador', 'المستكشف'],
  ['nav.search', '検索', '검색', '搜索', 'Búsqueda', 'Recherche', 'Suche', 'Pesquisa', 'البحث'],
  ['nav.scm', 'ソース管理', '소스 제어', '源代码管理', 'Control de código fuente', 'Contrôle de code source', 'Quellcodeverwaltung', 'Controle de código-fonte', 'التحكم بالمصدر'],
  ['nav.ai', 'AI / MCP', 'AI / MCP', 'AI / MCP', 'IA / MCP', 'IA / MCP', 'KI / MCP', 'IA / MCP', 'الذكاء الاصطناعي / MCP'],
  ['nav.terminal', 'ターミナル', '터미널', '终端', 'Terminal', 'Terminal', 'Terminal', 'Terminal', 'الطرفية'],
  ['nav.settings', '設定', '설정', '设置', 'Ajustes', 'Paramètres', 'Einstellungen', 'Configurações', 'الإعدادات'],
  ['settings.title', '設定', '설정', '设置', 'Ajustes', 'Paramètres', 'Einstellungen', 'Configurações', 'الإعدادات'],
  ['settings.general', '一般', '일반', '通用', 'General', 'Général', 'Allgemein', 'Geral', 'عام'],
  ['settings.editor', 'コードエディター', '코드 편집기', '代码编辑器', 'Editor de código', 'Éditeur de code', 'Code-Editor', 'Editor de código', 'محرر الأكواد'],
  ['settings.theme', 'テーマ', '테마', '主题', 'Tema', 'Thème', 'Design', 'Tema', 'السمة'],
  ['settings.shortcuts', 'ショートカット', '단축키', '快捷键', 'Atajos', 'Raccourcis', 'Tastenkürzel', 'Atalhos', 'الاختصارات'],
  ['settings.models', 'AIモデル', 'AI 모델', 'AI 模型', 'Modelos de IA', 'Modèles IA', 'KI-Modelle', 'Modelos de IA', 'نماذج الذكاء الاصطناعي'],
  ['settings.agents', 'エージェント', '에이전트', '代理', 'Agentes', 'Agents', 'Agenten', 'Agentes', 'الوكلاء'],
  ['settings.extensions', '拡張機能', '확장 프로그램', '扩展', 'Extensiones', 'Extensions', 'Erweiterungen', 'Extensões', 'الإضافات'],
  ['settings.lsp', '言語サーバー', '언어 서버', '语言服务器', 'Servidores de lenguaje', 'Serveurs de langage', 'Sprachserver', 'Servidores de linguagem', 'خوادم اللغة'],
  ['settings.scm', 'ソース管理', '소스 제어', '源代码管理', 'Control de código fuente', 'Contrôle de code source', 'Quellcodeverwaltung', 'Controle de código-fonte', 'التحكم بالمصدر'],
  ['settings.mcp', 'MCP', 'MCP', 'MCP', 'MCP', 'MCP', 'MCP', 'MCP', 'MCP'],
  ['settings.security', 'セキュリティ', '보안', '安全', 'Seguridad', 'Sécurité', 'Sicherheit', 'Segurança', 'الأمان'],
  ['settings.accessibility', 'アクセシビリティ', '접근성', '无障碍', 'Accesibilidad', 'Accessibilité', 'Barrierefreiheit', 'Acessibilidade', 'إمكانية الوصول'],
  ['settings.ssh', 'SSH', 'SSH', 'SSH', 'SSH', 'SSH', 'SSH', 'SSH', 'SSH'],
  ['settings.about', 'バージョン情報', '정보', '关于', 'Acerca de', 'À propos', 'Über', 'Sobre', 'حول'],
  ['settings.resetAll', 'すべてデフォルトに戻す', '모두 기본값으로 재설정', '全部重置为默认', 'Restablecer todo a valores predeterminados', 'Tout réinitialiser par défaut', 'Alles auf Standard zurücksetzen', 'Restaurar tudo para o padrão', 'إعادة الكل للافتراضي'],
  ['general.theme', 'テーマ', '테마', '主题', 'Tema', 'Thème', 'Design', 'Tema', 'السمة'],
  ['general.font', 'フォント', '글꼴', '字体', 'Fuente', 'Police', 'Schriftart', 'Fonte', 'الخط'],
  ['general.fontSize', 'フォントサイズ', '글꼴 크기', '字体大小', 'Tamaño de fuente', 'Taille de police', 'Schriftgröße', 'Tamanho da fonte', 'حجم الخط'],
  ['general.lineHeight', '行の高さ', '줄 높이', '行高', 'Altura de línea', 'Hauteur de ligne', 'Zeilenhöhe', 'Altura da linha', 'ارتفاع السطر'],
  ['general.uiLang', 'UI言語', 'UI 언어', '界面语言', 'Idioma de la interfaz', "Langue de l'interface", 'Oberflächensprache', 'Idioma da interface', 'لغة الواجهة'],
  ['general.zoom', 'ズーム', '확대/축소', '缩放', 'Zoom', 'Zoom', 'Zoom', 'Zoom', 'التكبير'],
  ['general.restoreSession', '起動時にセッションを復元', '시작 시 세션 복원', '启动时恢复会话', 'Restaurar sesión al iniciar', 'Restaurer la session au démarrage', 'Sitzung beim Start wiederherstellen', 'Restaurar sessão ao iniciar', 'استعادة الجلسة عند الفتح'],
  ['general.checkUpdates', '更新を自動チェック', '업데이트 자동 확인', '自动检查更新', 'Buscar actualizaciones automáticamente', 'Vérifier les mises à jour automatiquement', 'Automatisch nach Updates suchen', 'Verificar atualizações automaticamente', 'التحقق التلقائي من التحديثات'],
  ['general.openDataFolder', 'データフォルダーを開く', '데이터 폴더 열기', '打开数据文件夹', 'Abrir carpeta de datos', 'Ouvrir le dossier de données', 'Datenordner öffnen', 'Abrir pasta de dados', 'فتح مجلد البيانات'],
  ['editor.tabSize', 'タブのサイズ', '탭 크기', '制表符大小', 'Tamaño de tabulación', 'Taille de tabulation', 'Tab-Größe', 'Tamanho da tabulação', 'حجم الجدولة'],
  ['editor.insertSpaces', 'タブの代わりにスペース', '탭 대신 공백 사용', '使用空格代替制表符', 'Insertar espacios en lugar de tabulaciones', 'Insérer des espaces au lieu de tabulations', 'Leerzeichen statt Tabs', 'Usar espaços em vez de tabulações', 'استخدام المسافات بدل الجدولة'],
  ['editor.wordWrap', '折り返し', '줄 바꿈', '自动换行', 'Ajuste de línea', 'Retour à la ligne', 'Zeilenumbruch', 'Quebra de linha', 'التفاف الأسطر'],
  ['editor.minimap', 'ミニマップ', '미니맵', '迷你地图', 'Minimapa', 'Minicarte', 'Minimap', 'Minimapa', 'الخريطة المصغرة'],
  ['editor.cursorStyle', 'カーソルの形', '커서 모양', '光标样式', 'Estilo de cursor', 'Style du curseur', 'Cursor-Stil', 'Estilo do cursor', 'شكل المؤشر'],
  ['editor.smoothScroll', 'スムーズスクロール', '부드러운 스크롤', '平滑滚动', 'Desplazamiento suave', 'Défilement fluide', 'Sanftes Scrollen', 'Rolagem suave', 'التمرير السلس'],
  ['editor.snippetSuggestions', 'スニペット候補', '스니펫 제안', '代码片段建议', 'Sugerencias de fragmentos', 'Suggestions de snippets', 'Snippet-Vorschläge', 'Sugestões de snippets', 'اقتراحات المقاطع'],
  ['editor.formatOnSave', '保存時にフォーマット', '저장 시 포맷', '保存时格式化', 'Formatear al guardar', 'Formater à la sauvegarde', 'Beim Speichern formatieren', 'Formatar ao salvar', 'التنسيق عند الحفظ'],
  ['editor.showWhitespace', '空白を表示', '공백 표시', '显示空白', 'Mostrar espacios en blanco', 'Afficher les espaces', 'Leerzeichen anzeigen', 'Mostrar espaços em branco', 'إظهار المسافات'],
  ['editor.breadcrumbs', 'ブレッドクラム', '이동 경로', '面包屑', 'Migas de pan', 'Fil d’Ariane', 'Breadcrumbs', 'Trilha de navegação', 'مسار التنقل'],
  ['editor.stickyScroll', 'スティッキースクロール', '고정 스크롤', '粘性滚动', 'Desplazamiento fijo', 'Défilement fixe', 'Sticky-Scroll', 'Rolagem fixa', 'التمرير الثابت'],
  ['editor.stickyScrollMaxLines', 'スティッキー最大行数', '고정 최대 줄 수', '粘性最大行数', 'Líneas fijas máximas', 'Nombre max de lignes fixes', 'Max. feste Zeilen', 'Máx. linhas fixas', 'أقصى أسطر ثابتة'],
  ['editor.minimapRenderCharacters', 'ミニマップで文字を描画', '미니맵 문자 렌더링', '迷你地图渲染字符', 'Dibujar caracteres en minimapa', 'Dessiner les caractères dans la minicarte', 'Zeichen in Minimap zeichnen', 'Desenhar caracteres no minimapa', 'رسم الأحرف في المصغرة'],
  ['editor.indentGuides', 'インデントガイド', '들여쓰기 가이드', '缩进参考线', 'Guías de sangría', 'Guides d’indentation', 'Einzugslinien', 'Guias de indentação', 'أدلة المسافة البادئة'],
  ['editor.colorDecorators', 'カラースウォッチ', '색상 견본', '颜色样本', 'Muestras de color', 'Échantillons de couleur', 'Farbfelder', 'Amostras de cor', 'عينات الألوان'],
  ['editor.unicodeHighlight', '曖昧なUnicodeを強調', '모호한 유니코드 강조', '突出显示有歧义的 Unicode', 'Resaltar Unicode ambiguo', 'Surligner les caractères Unicode ambigus', 'Mehrdeutige Unicode-Zeichen hervorheben', 'Realçar Unicode ambíguo', 'تمييز اليونيكود الملتبس'],
  ['editor.bracketPairColorization', '括弧ペアの色付け', '괄호 쌍 색상', '括号对着色', 'Color de pares de corchetes', 'Colorisation des paires de crochets', 'Klammerpaare einfärben', 'Colorir pares de colchetes', 'تلوين الأقواس المتقابلة'],
  ['models.apiKey', 'APIキー', 'API 키', 'API 密钥', 'Clave API', 'Clé API', 'API-Schlüssel', 'Chave de API', 'مفتاح API'],
  ['models.baseUrl', 'ベースURL', '기본 URL', '基础 URL', 'URL base', 'URL de base', 'Basis-URL', 'URL base', 'الرابط الأساسي'],
  ['models.model', 'モデル', '모델', '模型', 'Modelo', 'Modèle', 'Modell', 'Modelo', 'النموذج'],
  ['models.test', '接続テスト', '연결 테스트', '测试连接', 'Probar conexión', 'Tester la connexion', 'Verbindung testen', 'Testar conexão', 'اختبار الاتصال'],
  ['models.active', 'アクティブなプロバイダー', '활성 공급자', '活动提供商', 'Proveedor activo', 'Fournisseur actif', 'Aktiver Anbieter', 'Provedor ativo', 'المزود النشط'],
  ['models.saved', 'キー保存済み', '키 저장됨', '密钥已保存', 'Clave guardada', 'Clé enregistrée', 'Schlüssel gespeichert', 'Chave salva', 'المفتاح محفوظ'],
  ['models.noKey', 'キーがまだありません', '키가 아직 없음', '暂无密钥', 'Aún no hay clave', 'Pas encore de clé', 'Noch kein Schlüssel', 'Ainda não há chave', 'لا يوجد مفتاح بعد'],
  ['models.answerLang', 'AI回答言語', 'AI 답변 언어', 'AI 回答语言', 'Idioma de respuesta de IA', 'Langue de réponse IA', 'KI-Antwortsprache', 'Idioma da resposta da IA', 'لغة إجابة الذكاء الاصطناعي'],
  ['models.answerLangHint', '毎回の会話で言語指示がモデルに送信されます', '모든 대화에서 언어 지침이 모델로 전송됩니다', '每次对话都会向模型发送语言指令', 'La instrucción de idioma se envía al modelo en cada conversación', "L'instruction de langue est envoyée au modèle à chaque conversation", 'Die Sprachinstruktion wird in jedem Gespräch an das Modell gesendet', 'A instrução de idioma é enviada ao modelo em cada conversa', 'يُرسل تعليم اللغة للنموذج في كل محادثة'],
  ['models.answerFollow', '質問に従う（自動）', '질문 따르기 (자동)', '跟随问题（自动）', 'Seguir la pregunta (automático)', 'Suivre la question (auto)', 'Der Frage folgen (automatisch)', 'Seguir a pergunta (automático)', 'اتباع السؤال (تلقائي)'],
  ['models.answerCustom', 'その他（言語名を入力）', '기타 (언어 이름 입력)', '其他（输入语言名称）', 'Otro (escribe el idioma)', 'Autre (écrire le nom de la langue)', 'Andere (Sprache eingeben)', 'Outro (digite o idioma)', 'أخرى (اكتب اسم اللغة)'],
  ['models.answerCustomPlaceholder', '例：ジャワ語、Español、Français…', '예: 자바어, Español, Français…', '例如：爪哇语、Español、Français…', 'p. ej. javanés, Español, Français…', 'p. ex. javanais, Español, Français…', 'z. B. Javanisch, Español, Français…', 'ex.: javanês, Español, Français…', 'مثال: الجاوية، الإسبانية، الفرنسية…'],
  ['agents.maxPanes', 'タブあたり最大ペイン数', '탭당 최대 패널 수', '每个选项卡最大窗格数', 'Máximo de paneles por pestaña', 'Nombre max de panneaux par onglet', 'Max. Bereiche pro Tab', 'Máx. painéis por aba', 'أقصى عدد الألواح لكل تبويب'],
  ['agents.startCommand', '開始コマンド', '시작 명령', '启动命令', 'Comando de inicio', 'Commande de démarrage', 'Startbefehl', 'Comando de início', 'أمر البدء'],
  ['agents.attachActiveFile', 'アクティブなファイルをエージェントに送信', '활성 파일을 에이전트로 보내기', '将活动文件发送给代理', 'Enviar archivo activo al agente', 'Envoyer le fichier actif à l’agent', 'Aktive Datei an Agent senden', 'Enviar arquivo ativo ao agente', 'إرسال الملف النشط للوكيل'],
  ['agents.rescan', '再スキャン', '다시 검색', '重新扫描', 'Volver a escanear', 'Analyser à nouveau', 'Erneut scannen', 'Verificar novamente', 'إعادة الفحص'],
  ['agents.none', 'エージェントCLIが見つかりません', '에이전트 CLI를 찾을 수 없음', '未检测到代理 CLI', 'No se detectó CLI de agente', 'Aucun CLI d’agent détecté', 'Kein Agent-CLI erkannt', 'Nenhum CLI de agente detectado', 'لم يتم العثور على واجهة وكيل'],
  ['scm.userName', '名前', '이름', '姓名', 'Nombre', 'Nom', 'Name', 'Nome', 'الاسم'],
  ['scm.userEmail', 'メール', '이메일', '邮箱', 'Correo', 'E-mail', 'E-Mail', 'E-mail', 'البريد'],
  ['scm.defaultBranch', 'デフォルトブランチ', '기본 브랜치', '默认分支', 'Rama predeterminada', 'Branche par défaut', 'Standard-Branch', 'Branch padrão', 'الفرع الافتراضي'],
  ['scm.pullBeforePush', 'プッシュ前にプル', '푸시 전 풀', '推送前先拉取', 'Hacer pull antes de push', 'Pull avant push', 'Pull vor Push', 'Pull antes do push', 'سحب قبل الدفع'],
  ['mcp.enable', 'ポート9222でMCPを有効化', '포트 9222에서 MCP 활성화', '在端口 9222 启用 MCP', 'Activar MCP en el puerto 9222', 'Activer MCP sur le port 9222', 'MCP auf Port 9222 aktivieren', 'Ativar MCP na porta 9222', 'تفعيل MCP على المنفذ 9222'],
  ['mcp.status', '状態', '상태', '状态', 'Estado', 'État', 'Status', 'Status', 'الحالة'],
  ['mcp.port', 'ポート', '포트', '端口', 'Puerto', 'Port', 'Port', 'Porta', 'المنفذ'],
  ['mcp.token', 'トークン', '토큰', '令牌', 'Token', 'Jeton', 'Token', 'Token', 'الرمز'],
  ['mcp.writeToCli', 'CLI設定に書き込む', 'CLI 구성에 쓰기', '写入 CLI 配置', 'Escribir en configuración CLI', 'Écrire dans la config CLI', 'In CLI-Konfiguration schreiben', 'Escrever na configuração CLI', 'الكتابة إلى إعداد CLI'],
  ['common.save', '保存', '저장', '保存', 'Guardar', 'Enregistrer', 'Speichern', 'Salvar', 'حفظ'],
  ['common.cancel', 'キャンセル', '취소', '取消', 'Cancelar', 'Annuler', 'Abbrechen', 'Cancelar', 'إلغاء'],
  ['common.reset', 'リセット', '재설정', '重置', 'Restablecer', 'Réinitialiser', 'Zurücksetzen', 'Redefinir', 'إعادة'],
  ['common.default', 'デフォルト', '기본값', '默认', 'Predeterminado', 'Par défaut', 'Standard', 'Padrão', 'افتراضي'],
  ['common.custom', 'カスタム', '사용자 지정', '自定义', 'Personalizado', 'Personnalisé', 'Benutzerdefiniert', 'Personalizado', 'مخصص'],
  ['common.enabled', '有効', '활성화', '启用', 'Activado', 'Activé', 'Aktiviert', 'Ativado', 'مفعّل'],
  ['common.disabled', '無効', '비활성화', '禁用', 'Desactivado', 'Désactivé', 'Deaktiviert', 'Desativado', 'معطّل'],
  ['common.copy', 'コピー', '복사', '复制', 'Copiar', 'Copier', 'Kopieren', 'Copiar', 'نسخ'],
  ['common.show', '表示', '표시', '显示', 'Mostrar', 'Afficher', 'Anzeigen', 'Mostrar', 'إظهار'],
  ['common.hide', '非表示', '숨기기', '隐藏', 'Ocultar', 'Masquer', 'Ausblenden', 'Ocultar', 'إخفاء'],
  ['common.running', '実行中', '실행 중', '运行中', 'En ejecución', 'En cours', 'Läuft', 'Em execução', 'يعمل'],
  ['common.stopped', '停止中', '중지됨', '已停止', 'Detenido', 'Arrêté', 'Beendet', 'Parado', 'متوقف'],
];

const LANGS = [
  ['JA', 'ja'],
  ['KO', 'ko'],
  ['ZH', 'zh'],
  ['ES', 'es'],
  ['FR', 'fr'],
  ['DE', 'de'],
  ['PT', 'pt'],
  ['AR', 'ar'],
];

const UPD_EXTRA = {
  ja: ['Zephyrがv{v}に更新されました', '再起動して最新版を使用してください。', '新着情報', '完全な変更履歴を開く', 'OK', '閉じる'],
  ko: ['Zephyr가 v{v}(으)로 업데이트됨', '최신 버전을 사용하려면 다시 시작하세요.', '새로운 기능', '전체 변경 로그 열기', '확인', '닫기'],
  zh: ['Zephyr 已更新到 v{v}', '重新启动以使用最新版本。', '新内容', '打开完整更新日志', '确定', '关闭'],
  es: ['Zephyr actualizado a v{v}', 'Reinicia para usar la última versión.', 'Qué hay de nuevo', 'Abrir registro de cambios completo', 'Aceptar', 'Cerrar'],
  fr: ['Zephyr mis à jour vers v{v}', 'Redémarrez pour utiliser la dernière version.', 'Nouveautés', 'Ouvrir le journal complet', 'OK', 'Fermer'],
  de: ['Zephyr auf v{v} aktualisiert', 'Starten Sie neu, um die neueste Version zu verwenden.', 'Neuerungen', 'Vollständiges Änderungsprotokoll öffnen', 'OK', 'Schließen'],
  pt: ['Zephyr atualizado para v{v}', 'Reinicie para usar a versão mais recente.', 'Novidades', 'Abrir changelog completo', 'OK', 'Fechar'],
  ar: ['تم تحديث Zephyr إلى v{v}', 'أعد التشغيل لاستخدام أحدث إصدار.', 'ما الجديد', 'فتح سجل التغييرات الكامل', 'موافق', 'إغلاق'],
};
const UPD_KEYS = ['update.done', 'update.doneHint', 'update.whatsNew', 'update.fullChangelog', 'common.ok', 'common.close'];

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 1) tambah update.* ke ID & EN (sebelum baris mcp.writeToCli? tidak — selipkan sebelum common.save)
for (const [which, lines] of Object.entries(upd)) {
  const constName = which === 'id' ? 'ID' : 'EN';
  const anchor = `const ${constName}: Dict = {`;
  const start = src.indexOf(anchor);
  const end = src.indexOf(EOL + '};', start);
  const body = src.slice(start, end);
  const marker = `${EOL}  'common.save':`;
  const pos = body.indexOf(marker);
  const insert = EOL + EOL + lines.join(EOL) + EOL;
  src = src.slice(0, start + pos) + insert + src.slice(start + pos);
}

// 2) bangun 8 dict baru, sisipkan sebelum "const DICTS"
let dicts = '';
for (const [NAME, code] of LANGS) {
  dicts += `const ${NAME}: Dict = {${EOL}`;
  for (const row of ROWS) {
    const idx = { ja: 1, ko: 2, zh: 3, es: 4, fr: 5, de: 6, pt: 7, ar: 8 }[code];
    dicts += `  '${row[0]}': '${esc(row[idx])}',${EOL}`;
  }
  dicts += EOL;
  UPD_KEYS.forEach((k, i) => {
    dicts += `  '${k}': '${esc(UPD_EXTRA[code][i])}',${EOL}`;
  });
  dicts += `};${EOL}${EOL}`;
}
src = src.replace('const DICTS: Record<string, Dict> = { id: ID, en: EN };', dicts + 'const DICTS: Record<string, Dict> = { id: ID, en: EN, ja: JA, ko: KO, zh: ZH, es: ES, fr: FR, de: DE, pt: PT, ar: AR };');

// 3) UI_LANGS export
src = src.replace(
  '/** Terjemah tanpa hook (untuk kode di luar komponen). */',
  `/** Bahasa yang bisa dipilih di Settings → Umum, urut tampilan. */${EOL}export const UI_LANGS: { value: string; label: string }[] = [${EOL}  { value: 'id', label: 'Indonesia' },${EOL}  { value: 'en', label: 'English' },${EOL}  { value: 'ja', label: '日本語' },${EOL}  { value: 'ko', label: '한국어' },${EOL}  { value: 'zh', label: '中文' },${EOL}  { value: 'es', label: 'Español' },${EOL}  { value: 'fr', label: 'Français' },${EOL}  { value: 'de', label: 'Deutsch' },${EOL}  { value: 'pt', label: 'Português' },${EOL}  { value: 'ar', label: 'العربية' },${EOL}];${EOL}${EOL}/** Terjemah tanpa hook (untuk kode di luar komponen). Jatuh berlapis: aktif → Inggris → Indonesia → kunci mentah. */`,
);

// 4) fallback berlapis
src = src.replace(
  'return DICTS[lang]?.[key] ?? DICTS.id[key] ?? key;',
  'return DICTS[lang]?.[key] ?? DICTS.en[key] ?? DICTS.id[key] ?? key;',
);

writeFileSync(P, src);
console.log('INSERT_OK');
