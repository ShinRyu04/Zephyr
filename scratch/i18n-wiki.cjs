// Tambahkan kunci i18n baru (Repo Wiki + section lipat) ke 10 kamus.
// Idempoten: kunci yang sudah ada dilewati.
const fs = require('fs');

const KUNCI = {
  'Repo Wiki': ['Repo Wiki', 'Repo Wiki', 'リポジトリWiki', '저장소 위키', '仓库维基', 'Wiki del repo', 'Wiki du dépôt', 'Repo-Wiki', 'Wiki do repositório', 'ويكي المستودع'],
  'Knowledge Card': ['Kartu Pengetahuan', 'Knowledge Card', 'ナレッジカード', '지식 카드', '知识卡片', 'Tarjeta de conocimiento', 'Fiche de connaissance', 'Wissenskarte', 'Cartão de conhecimento', 'بطاقة المعرفة'],
  'Search Repo Wiki': ['Cari di Repo Wiki', 'Search Repo Wiki', 'リポジトリWikiを検索', '저장소 위키 검색', '搜索仓库维基', 'Buscar en el wiki', 'Rechercher dans le wiki', 'Repo-Wiki durchsuchen', 'Pesquisar no wiki', 'البحث في ويكي المستودع'],
  'Search Knowledge Cards': ['Cari Kartu Pengetahuan', 'Search Knowledge Cards', 'ナレッジカードを検索', '지식 카드 검색', '搜索知识卡片', 'Buscar tarjetas', 'Rechercher des fiches', 'Wissenskarten durchsuchen', 'Pesquisar cartões', 'البحث في بطاقات المعرفة'],
  'Generating…': ['Membuat…', 'Generating…', '生成中…', '생성 중…', '生成中…', 'Generando…', 'Génération…', 'Wird erzeugt…', 'Gerando…', 'جارٍ الإنشاء…'],
  'Nothing generated yet. Press Generate in the editor to build the wiki and the cards.':
    ['Belum ada yang dibuat. Tekan Generate di editor untuk membuat wiki dan kartunya.',
     'Nothing generated yet. Press Generate in the editor to build the wiki and the cards.',
     'まだ生成されていません。エディターで Generate を押してください。',
     '아직 생성된 것이 없습니다. 편집기에서 Generate를 누르세요.',
     '尚未生成。在编辑器中按 Generate 即可创建。',
     'Aún no se ha generado nada. Pulsa Generate en el editor.',
     'Rien n’a encore été généré. Appuyez sur Generate dans l’éditeur.',
     'Noch nichts erzeugt. Im Editor auf Generate drücken.',
     'Nada gerado ainda. Pressione Generate no editor.',
     'لم يتم إنشاء أي شيء بعد. اضغط Generate في المحرر.'],
  'Repo Wiki (for you) and Knowledge Card (for agents) are generated and updated together from your codebase.':
    ['Repo Wiki (untuk Anda) dan Kartu Pengetahuan (untuk agen) dibuat dan diperbarui bersama dari codebase Anda.',
     'Repo Wiki (for you) and Knowledge Card (for agents) are generated and updated together from your codebase.',
     'リポジトリWiki（あなた用）とナレッジカード（エージェント用）はまとめて生成・更新されます。',
     '저장소 위키(사용자용)와 지식 카드(에이전트용)는 함께 생성·갱신됩니다.',
     '仓库维基（供你阅读）与知识卡片（供代理使用）会一起生成与更新。',
     'El wiki (para ti) y las tarjetas (para los agentes) se generan juntos.',
     'Le wiki (pour vous) et les fiches (pour les agents) sont générés ensemble.',
     'Repo-Wiki (für dich) und Wissenskarten (für Agenten) entstehen gemeinsam.',
     'O wiki (para você) e os cartões (para os agentes) são gerados juntos.',
     'يُنشأ ويكي المستودع (لك) وبطاقات المعرفة (للوكيل) معًا.'],
  'Generate Your Repo Wiki': ['Buat Repo Wiki Anda', 'Generate Your Repo Wiki', 'リポジトリWikiを生成', '저장소 위키 생성', '生成仓库维基', 'Genera tu wiki', 'Générer votre wiki', 'Repo-Wiki erstellen', 'Gerar seu wiki', 'أنشئ ويكي المستودع'],
  'Document this codebase as pages you can read and as cards your agent can cite.':
    ['Dokumentasikan codebase ini sebagai halaman yang bisa Anda baca dan kartu yang bisa dikutip agen.',
     'Document this codebase as pages you can read and as cards your agent can cite.',
     'このコードベースを、読めるページとエージェントが引用できるカードとして文書化します。',
     '이 코드베이스를 읽을 수 있는 페이지와 에이전트가 인용할 카드로 문서화합니다.',
     '把这个代码库整理成可阅读的页面和代理可引用的卡片。',
     'Documenta este código como páginas y tarjetas que tu agente puede citar.',
     'Documentez ce code en pages lisibles et en fiches citables par l’agent.',
     'Dokumentiert diese Codebasis als lesbare Seiten und zitierbare Karten.',
     'Documente este código como páginas e cartões citáveis pelo agente.',
     'وثّق هذا المشروع كصفحات تقرأها وبطاقات يستشهد بها الوكيل.'],
  'Open a folder first — the wiki describes a workspace, and there is none open.':
    ['Buka folder dulu — wiki menjelaskan sebuah workspace, dan belum ada yang terbuka.',
     'Open a folder first — the wiki describes a workspace, and there is none open.',
     'まずフォルダーを開いてください。',
     '먼저 폴더를 여세요.',
     '请先打开一个文件夹。',
     'Abre una carpeta primero.',
     'Ouvrez d’abord un dossier.',
     'Zuerst einen Ordner öffnen.',
     'Abra uma pasta primeiro.',
     'افتح مجلدًا أولًا.'],
  'Regenerate when a new commit lands.': ['Buat ulang saat ada commit baru.', 'Regenerate when a new commit lands.', '新しいコミットで再生成します。', '새 커밋이 생기면 다시 생성합니다.', '有新提交时重新生成。', 'Regenerar al llegar un commit nuevo.', 'Régénérer à chaque nouveau commit.', 'Bei neuem Commit neu erzeugen.', 'Regenerar a cada novo commit.', 'أعد الإنشاء عند وصول التزام جديد.'],
  'Write the pages into .zephyr/ in this folder.': ['Tulis halamannya ke .zephyr/ di folder ini.', 'Write the pages into .zephyr/ in this folder.', '.zephyr/ に書き出します。', '이 폴더의 .zephyr/에 기록합니다.', '写入本文件夹的 .zephyr/。', 'Escribe las páginas en .zephyr/.', 'Écrit les pages dans .zephyr/.', 'Schreibt die Seiten nach .zephyr/.', 'Grava as páginas em .zephyr/.', 'اكتب الصفحات في ‎.zephyr/‎.'],
  'Let the agent cite these pages when it answers.': ['Izinkan agen mengutip halaman ini saat menjawab.', 'Let the agent cite these pages when it answers.', '回答時にエージェントが引用できるようにします。', '답변할 때 에이전트가 인용할 수 있게 합니다.', '允许代理在回答时引用这些页面。', 'Permite al agente citar estas páginas.', 'Autorise l’agent à citer ces pages.', 'Erlaubt dem Agenten, diese Seiten zu zitieren.', 'Permite ao agente citar estas páginas.', 'اسمح للوكيل بالاستشهاد بهذه الصفحات.'],
  Generate: ['Buat', 'Generate', '生成', '생성', '生成', 'Generar', 'Générer', 'Erzeugen', 'Gerar', 'إنشاء'],
  'Create With Plan': ['Buat Dengan Rencana', 'Create With Plan', 'プランで作成', '계획으로 생성', '按计划创建', 'Crear con plan', 'Créer avec plan', 'Mit Plan erstellen', 'Criar com plano', 'إنشاء بخطة'],
  'Use the /knowledge-plan command to generate wiki conversations':
    ['Pakai perintah /knowledge-plan untuk menyusun percakapan wiki',
     'Use the /knowledge-plan command to generate wiki conversations',
     'wiki 会話の生成には /knowledge-plan を使います',
     'wiki 대화를 만들려면 /knowledge-plan 을 사용하세요',
     '使用 /knowledge-plan 命令生成维基对话',
     'Usa el comando /knowledge-plan para generar conversaciones',
     'Utilisez /knowledge-plan pour générer les conversations',
     'Mit /knowledge-plan Wiki-Gespräche erzeugen',
     'Use /knowledge-plan para gerar conversas',
     'استخدم الأمر /knowledge-plan لإنشاء محادثات الويكي'],
  'Generated {n} wiki pages and {m} knowledge cards':
    ['Membuat {n} halaman wiki dan {m} kartu pengetahuan',
     'Generated {n} wiki pages and {m} knowledge cards',
     '{n} ページと {m} カードを生成しました',
     '위키 {n}쪽과 카드 {m}개를 생성했습니다',
     '已生成 {n} 个页面和 {m} 张卡片',
     'Se generaron {n} páginas y {m} tarjetas',
     '{n} pages et {m} fiches générées',
     '{n} Seiten und {m} Karten erzeugt',
     '{n} páginas e {m} cartões gerados',
     'أُنشئت {n} صفحة و{m} بطاقة'],
  'Exported {ok} pages to .zephyr/': ['Mengekspor {ok} halaman ke .zephyr/', 'Exported {ok} pages to .zephyr/', '{ok} ページを .zephyr/ に書き出しました', '{ok}쪽을 .zephyr/에 내보냈습니다', '已导出 {ok} 个页面到 .zephyr/', 'Se exportaron {ok} páginas a .zephyr/', '{ok} pages exportées vers .zephyr/', '{ok} Seiten nach .zephyr/ exportiert', '{ok} páginas exportadas para .zephyr/', 'صُدّرت {ok} صفحة إلى ‎.zephyr/‎'],
  'Exported {ok} pages, {gagal} failed': ['Mengekspor {ok} halaman, {gagal} gagal', 'Exported {ok} pages, {gagal} failed', '{ok} ページを書き出し、{gagal} 件失敗', '{ok}쪽 내보냄, {gagal}개 실패', '已导出 {ok} 个页面，{gagal} 个失败', 'Se exportaron {ok} páginas, {gagal} fallaron', '{ok} pages exportées, {gagal} en échec', '{ok} Seiten exportiert, {gagal} fehlgeschlagen', '{ok} páginas exportadas, {gagal} falharam', 'صُدّرت {ok} صفحة، فشل {gagal}'],
  'Last generated': ['Terakhir dibuat', 'Last generated', '最終生成', '마지막 생성', '上次生成', 'Última generación', 'Dernière génération', 'Zuletzt erzeugt', 'Última geração', 'آخر إنشاء'],
  Source: ['Sumber', 'Source', 'ソース', '출처', '来源', 'Origen', 'Source', 'Quelle', 'Origem', 'المصدر'],
  Outline: ['Garis Besar', 'Outline', 'アウトライン', '개요', '大纲', 'Esquema', 'Plan', 'Gliederung', 'Estrutura', 'المخطط'],
  Timeline: ['Lini Masa', 'Timeline', 'タイムライン', '타임라인', '时间线', 'Cronología', 'Chronologie', 'Zeitleiste', 'Linha do tempo', 'الجدول الزمني'],
};

let c = fs.readFileSync('src/lib/i18n.ts', 'utf8');
const E = c.includes('\r\n') ? '\r\n' : '\n';

/*
 * Sisipkan ke setiap kamus. Kamus dibatasi oleh `const DICTS ... {` dan blok
 * bahasa berikutnya; cara paling aman adalah menambahkan tepat setelah baris
 * `'settings.icons': '...'` di tiap kamus, karena baris itu ada di kesepuluhnya.
 */
const baris = c.split(/\r?\n/);
const out = [];
let kamus = -1;
for (const b of baris) {
  out.push(b);
  if (/^\s*'settings\.icons':/.test(b)) {
    kamus++;
    const inden = b.match(/^\s*/)[0];
    for (const [kunci, nilai] of Object.entries(KUNCI)) {
      const v = nilai[kamus] ?? nilai[1] ?? kunci;
      const aman = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const kunciAman = kunci.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      out.push(`${inden}'${kunciAman}': '${aman}',`);
    }
  }
}
c = out.join(E);
fs.writeFileSync('src/lib/i18n.ts', c, 'utf8');
console.log('kamus disentuh:', kamus + 1, 'kunci per kamus:', Object.keys(KUNCI).length);
