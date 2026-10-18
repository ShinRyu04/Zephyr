/**
 * Add the new tools' descriptions to all 10 language blocks of
 * `deskripsiTool.ts`.
 *
 * The catalogue check (`cek-cakupan-fakta.mjs`) requires every catalogue tool to
 * have a description in every language, because the picker shows the description
 * in the reader's own language. Six new tools (`lsp`, `browser`, `web`,
 * `apply_patch`, `tunjuk`, `kotak`, `peta`, `execute`) plus the seven removed
 * `browser_*` names are the delta.
 *
 * Run once: node scratch/tambah-deskripsi-tool.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/lib/zephyrTools/deskripsiTool.ts';
let s = readFileSync(P, 'utf8');

/** Desc per language, in the order the blocks appear: id, en, ja, ko, zh, es, fr, de, pt, ar. */
const BARU = {
  lsp: [
    'Tanya language server: simbol, referensi, definisi, tipe, diagnostik, atau hierarki panggilan',
    'Ask the language server: symbols, references, definition, type, diagnostics, or call hierarchy',
    '言語サーバーに問い合わせる: シンボル、参照、定義、型、診断、呼び出し階層',
    '언어 서버에 질문: 심볼, 참조, 정의, 타입, 진단, 호출 계층',
    '询问语言服务器：符号、引用、定义、类型、诊断或调用层级',
    'Preguntar al servidor de lenguaje: símbolos, referencias, definición, tipo, diagnósticos o jerarquía de llamadas',
    'Interroger le serveur de langage : symboles, références, définition, type, diagnostics ou hiérarchie des appels',
    'Den Language-Server fragen: Symbole, Referenzen, Definition, Typ, Diagnose oder Aufrufhierarchie',
    'Perguntar ao servidor de linguagem: símbolos, referências, definição, tipo, diagnósticos ou hierarquia de chamadas',
    'اسأل خادم اللغة: الرموز، المراجع، التعريف، النوع، التشخيصات، أو تسلسل النداءات',
  ],
  browser: [
    'Kendalikan pane browser: open, read, click, type, list, close, download',
    'Control the browser pane: open, read, click, type, list, close, download',
    'ブラウザペインを操作: open, read, click, type, list, close, download',
    '브라우저 페인 제어: open, read, click, type, list, close, download',
    '控制浏览器窗格：open、read、click、type、list、close、download',
    'Controlar el panel del navegador: open, read, click, type, list, close, download',
    'Contrôler le volet navigateur : open, read, click, type, list, close, download',
    'Den Browser-Bereich steuern: open, read, click, type, list, close, download',
    'Controlar o painel do navegador: open, read, click, type, list, close, download',
    'تحكم في جزء المتصفح: open، read، click، type، list، close، download',
  ],
  web: [
    'Ambil dari internet: search (cari) atau fetch (isi satu URL)',
    'Get from the internet: search (find) or fetch (one URL contents)',
    'インターネットから取得: search（検索）または fetch（1つのURLの内容）',
    '인터넷에서 가져오기: search(검색) 또는 fetch(URL 하나의 내용)',
    '从互联网获取：search（搜索）或 fetch（获取单个 URL 的内容）',
    'Obtener de internet: search (buscar) o fetch (contenido de una URL)',
    "Récupérer depuis internet : search (rechercher) ou fetch (contenu d'une URL)",
    'Aus dem Internet holen: search (suchen) oder fetch (Inhalt einer URL)',
    'Obter da internet: search (pesquisar) ou fetch (conteúdo de uma URL)',
    'اجلب من الإنترنت: search (بحث) أو fetch (محتوى رابط واحد)',
  ],
  apply_patch: [
    'Ubah banyak berkas dalam satu panggilan patch (format OpenCode)',
    'Edit many files in one patch call (OpenCode format)',
    '1回のパッチ呼び出しで複数ファイルを変更（OpenCode形式）',
    '한 번의 패치 호출로 여러 파일 수정 (OpenCode 형식)',
    '一次补丁调用修改多个文件（OpenCode 格式）',
    'Editar muchos archivos en una llamada de parche (formato OpenCode)',
    'Modifier plusieurs fichiers en un seul appel de patch (format OpenCode)',
    'Viele Dateien in einem Patch-Aufruf ändern (OpenCode-Format)',
    'Editar muitos arquivos em uma chamada de patch (formato OpenCode)',
    'عدّل ملفات كثيرة في نداء تصحيح واحد (صيغة OpenCode)',
  ],
  tunjuk: [
    'Buka halaman atau panel yang pembaca maksud, dari keluhan berbahasa bebas',
    'Open the page or panel the reader means, from a free-form complaint',
    '自由な言葉の不満から、意図したページやパネルを開く',
    '자유로운 표현의 불만에서 의도한 페이지나 패널을 엽니다',
    '根据自由表达的困扰，打开用户想要的页面或面板',
    'Abrir la página o el panel que el lector quiere, desde una queja libre',
    "Ouvrir la page ou le volet voulu, à partir d'une plainte en langage libre",
    'Die gemeinte Seite oder den Bereich aus einer freien Beschwerde öffnen',
    'Abrir a página ou o painel que o leitor quer, a partir de uma queixa livre',
    'افتح الصفحة أو الجزء المقصود من شكوى بالكلمات الحرة',
  ],
  kotak: [
    'Gambar kotak terstruktur di jawaban: judul, ringkasan, baris label/nilai',
    'Draw a structured box in the answer: title, summary, label/value rows',
    '回答に構造化ボックスを描く: タイトル、要約、ラベル/値の行',
    '답변에 구조화된 상자를 그립니다: 제목, 요약, 라벨/값 행',
    '在回答中绘制结构化方框：标题、摘要、标签/值行',
    'Dibujar un cuadro estructurado en la respuesta: título, resumen, filas etiqueta/valor',
    'Dessiner un encadré structuré dans la réponse : titre, résumé, lignes libellé/valeur',
    'Eine strukturierte Box in der Antwort zeichnen: Titel, Zusammenfassung, Label/Wert-Zeilen',
    'Desenhar uma caixa estruturada na resposta: título, resumo, linhas rótulo/valor',
    'ارسم صندوقاً منظّماً في الإجابة: عنوان، ملخص، صفوف تسمية/قيمة',
  ],
  peta: [
    'Cari di peta Zephyr: label, setelan, perintah, pintasan, panel, tool, berkas',
    'Search the Zephyr map: labels, settings, commands, shortcuts, panels, tools, files',
    'Zephyr の地図を検索: ラベル、設定、コマンド、ショートカット、パネル、ツール、ファイル',
    'Zephyr 지도 검색: 라벨, 설정, 명령, 단축키, 패널, 도구, 파일',
    '搜索 Zephyr 地图：标签、设置、命令、快捷键、面板、工具、文件',
    'Buscar en el mapa de Zephyr: etiquetas, ajustes, comandos, atajos, paneles, herramientas, archivos',
    'Rechercher dans la carte Zephyr : libellés, réglages, commandes, raccourcis, panneaux, outils, fichiers',
    'Die Zephyr-Karte durchsuchen: Labels, Einstellungen, Befehle, Tastenkürzel, Bereiche, Werkzeuge, Dateien',
    'Pesquisar no mapa do Zephyr: rótulos, ajustes, comandos, atalhos, painéis, ferramentas, arquivos',
    'ابحث في خريطة Zephyr: التسميات، الإعدادات، الأوامر، الاختصارات، الأجزاء، الأدوات، الملفات',
  ],
  execute: [
    'Jalankan skrip yang memanggil beberapa tool sekaligus (Code Mode)',
    'Run a script that calls several tools at once (Code Mode)',
    '複数のツールを一度に呼ぶスクリプトを実行（Code Mode）',
    '여러 도구를 한 번에 호출하는 스크립트 실행 (Code Mode)',
    '运行一次调用多个工具的脚本（Code Mode）',
    'Ejecutar un script que llama a varias herramientas a la vez (Code Mode)',
    "Exécuter un script qui appelle plusieurs outils à la fois (Code Mode)",
    'Ein Skript ausführen, das mehrere Werkzeuge auf einmal aufruft (Code Mode)',
    'Executar um script que chama várias ferramentas de uma vez (Code Mode)',
    'شغّل نصاً يستدعي عدة أدوات دفعة واحدة (Code Mode)',
  ],
};

/* Names of the seven tools that no longer exist - their rows must go. */
const LAMA = ['browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_list', 'browser_close', 'browser_download_url', 'web_search', 'web_fetch', 'lsp_symbols', 'lsp_references', 'lsp_definition', 'lsp_hover', 'lsp_diagnostics', 'lsp_call_hierarchy'];

const KODE = ['id', 'en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];
const namaBlok = ['DESKRIPSI_TOOL_ID', 'DESKRIPSI_TOOL_EN', 'DESKRIPSI_TOOL_JA', 'DESKRIPSI_TOOL_KO', 'DESKRIPSI_TOOL_ZH', 'DESKRIPSI_TOOL_ES', 'DESKRIPSI_TOOL_FR', 'DESKRIPSI_TOOL_DE', 'DESKRIPSI_TOOL_PT', 'DESKRIPSI_TOOL_AR'];

const baris = s.split(/\r?\n/);
const keluar = [];
let blokSekarang = -1;

for (const b of baris) {
  const m = /^export const (DESKRIPSI_TOOL_[A-Z]+)/.exec(b);
  if (m) blokSekarang = namaBlok.indexOf(m[1]);

  /* Drop rows for tools that no longer exist. */
  const kunci = /^\s*'?([a-z_0-9]+)'?:/.exec(b);
  if (kunci && LAMA.includes(kunci[1])) continue;

  keluar.push(b);
}

/* Now insert the new rows at the end of each block (before its closing `};`). */
const hasil = [];
let blok = -1;
for (const b of keluar) {
  const m = /^export const (DESKRIPSI_TOOL_[A-Z]+)/.exec(b);
  if (m) blok = namaBlok.indexOf(m[1]);
  if (blok >= 0 && /^\};?\s*$/.test(b)) {
    for (const [nama, semua] of Object.entries(BARU)) {
      hasil.push(`  ${nama}: ${JSON.stringify(semua[blok])},`);
    }
    blok = -1;
  }
  hasil.push(b);
}

s = hasil.join('\n');
writeFileSync(P, s);
console.log(`ok: ${Object.keys(BARU).length} tool x 10 bahasa ditambahkan, ${LAMA.length} nama lama dibuang`);
