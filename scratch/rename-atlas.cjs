/*
 * Ganti nama Repo Wiki -> Atlas di KESEPULUH kamus i18n sekaligus.
 *
 * Kenapa skrip dan bukan edit tangan: 8 kunci x 10 bahasa = 80 baris, dan satu
 * baris yang terlewat berarti satu bahasa menampilkan istilah lama. Skrip ini
 * mencocokkan KUNCI (yang berbahasa Inggris dan sama di semua kamus), lalu
 * menulis nilai baru per bahasa. Kalau ada kunci yang tidak ketemu di sebuah
 * kamus, skrip MELAPORKANNYA alih-alih diam - kamus yang bolong lebih buruk
 * daripada rename yang gagal.
 */
const fs = require('fs');
const path = 'src/lib/i18n.ts';

const URUTAN = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];

/* kunci lama -> { kunciBaru, nilai: { ID, EN, ... } } */
const PETA = [
  {
    lama: 'Repo Wiki',
    baru: 'Map',
    nilai: {
      ID: 'Peta', EN: 'Map', JA: 'マップ', KO: '지도', ZH: '地图',
      ES: 'Mapa', FR: 'Carte', DE: 'Karte', PT: 'Mapa', AR: 'خريطة',
    },
  },
  {
    lama: 'Knowledge Card',
    baru: 'Cards',
    nilai: {
      ID: 'Kartu', EN: 'Cards', JA: 'カード', KO: '카드', ZH: '卡片',
      ES: 'Tarjetas', FR: 'Fiches', DE: 'Karten', PT: 'Cartões', AR: 'بطاقات',
    },
  },
  {
    lama: 'Search Repo Wiki',
    baru: 'Search the Map',
    nilai: {
      ID: 'Cari di Peta', EN: 'Search the Map', JA: 'マップを検索', KO: '지도 검색', ZH: '搜索地图',
      ES: 'Buscar en el mapa', FR: 'Rechercher dans la carte', DE: 'Karte durchsuchen',
      PT: 'Pesquisar no mapa', AR: 'بحث في الخريطة',
    },
  },
  {
    lama: 'Search Knowledge Cards',
    baru: 'Search Cards',
    nilai: {
      ID: 'Cari Kartu', EN: 'Search Cards', JA: 'カードを検索', KO: '카드 검색', ZH: '搜索卡片',
      ES: 'Buscar tarjetas', FR: 'Rechercher des fiches', DE: 'Karten durchsuchen',
      PT: 'Pesquisar cartões', AR: 'بحث في البطاقات',
    },
  },
  {
    lama: 'Repo Wiki (for you) and Knowledge Card (for agents) are generated and updated together from your codebase.',
    baru: 'Map (for you) and Cards (for agents) are generated and updated together from your codebase.',
    nilai: {
      ID: 'Peta (untuk Anda) dan Kartu (untuk agen) dibuat dan diperbarui bersama dari codebase Anda.',
      EN: 'Map (for you) and Cards (for agents) are generated and updated together from your codebase.',
      JA: 'マップ（あなた用）とカード（エージェント用）はまとめて生成・更新されます。',
      KO: '지도(사용자용)와 카드(에이전트용)는 함께 생성·갱신됩니다.',
      ZH: '地图（供你阅读）与卡片（供代理使用）会一起生成与更新。',
      ES: 'El mapa (para ti) y las tarjetas (para los agentes) se generan juntos.',
      FR: 'La carte (pour vous) et les fiches (pour les agents) sont générées ensemble.',
      DE: 'Karte (für dich) und Karten (für Agenten) entstehen gemeinsam.',
      PT: 'O mapa (para você) e os cartões (para os agentes) são gerados juntos.',
      AR: 'الخريطة (لك) والبطاقات (للوكيل) تُنشأ وتُحدَّث معًا.',
    },
  },
  {
    lama: 'Generate Your Repo Wiki',
    baru: 'Generate Your Atlas',
    nilai: {
      ID: 'Buat Atlas Anda', EN: 'Generate Your Atlas', JA: 'アトラスを生成', KO: '아틀라스 생성',
      ZH: '生成你的地图集', ES: 'Genera tu atlas', FR: 'Générer votre atlas',
      DE: 'Atlas erstellen', PT: 'Gerar seu atlas', AR: 'أنشئ أطلسك',
    },
  },
  {
    lama: 'Generated {n} wiki pages and {m} knowledge cards',
    baru: 'Generated {n} Map pages and {m} Cards',
    nilai: {
      ID: 'Membuat {n} halaman Peta dan {m} Kartu',
      EN: 'Generated {n} Map pages and {m} Cards',
      JA: '{n} ページと {m} カードを生成しました',
      KO: '지도 {n}쪽과 카드 {m}개를 생성했습니다',
      ZH: '已生成 {n} 个页面和 {m} 张卡片',
      ES: 'Se generaron {n} páginas y {m} tarjetas',
      FR: '{n} pages et {m} fiches générées',
      DE: '{n} Seiten und {m} Karten erzeugt',
      PT: '{n} páginas e {m} cartões gerados',
      AR: 'تم إنشاء {n} صفحة و {m} بطاقة',
    },
  },
  {
    lama: 'Nothing generated yet. Press Generate in the editor to build the wiki and the cards.',
    baru: 'Nothing generated yet. Press Generate in the editor to build the Map and the Cards.',
    nilai: {
      ID: 'Belum ada yang dibuat. Tekan Generate di editor untuk membuat Peta dan Kartunya.',
      EN: 'Nothing generated yet. Press Generate in the editor to build the Map and the Cards.',
      JA: 'まだ何も生成されていません。エディタで Generate を押すとマップとカードが作られます。',
      KO: '아직 생성된 것이 없습니다. 편집기에서 Generate를 눌러 지도와 카드를 만드세요.',
      ZH: '尚未生成任何内容。在编辑器中按 Generate 生成地图与卡片。',
      ES: 'Aún no se generó nada. Pulsa Generate en el editor para crear el mapa y las tarjetas.',
      FR: 'Rien n’a encore été généré. Appuyez sur Generate dans l’éditeur pour créer la carte et les fiches.',
      DE: 'Noch nichts erzeugt. Drücke im Editor auf Generate, um Karte und Karten zu erstellen.',
      PT: 'Nada gerado ainda. Pressione Generate no editor para criar o mapa e os cartões.',
      AR: 'لم يُنشأ شيء بعد. اضغط Generate في المحرر لبناء الخريطة والبطاقات.',
    },
  },
  {
    lama: 'Open a folder first — the wiki describes a workspace, and there is none open.',
    baru: 'Open a folder first — Atlas describes a workspace, and there is none open.',
    nilai: {
      ID: 'Buka folder dulu — Atlas menjelaskan sebuah workspace, dan belum ada yang terbuka.',
      EN: 'Open a folder first — Atlas describes a workspace, and there is none open.',
      JA: '先にフォルダーを開いてください — アトラスはワークスペースを説明します。',
      KO: '먼저 폴더를 여세요 — 아틀라스는 워크스페이스를 설명합니다.',
      ZH: '请先打开一个文件夹 — 地图集描述的是工作区。',
      ES: 'Abre una carpeta primero — el atlas describe un espacio de trabajo.',
      FR: 'Ouvrez d’abord un dossier — l’atlas décrit un espace de travail.',
      DE: 'Öffne zuerst einen Ordner — der Atlas beschreibt einen Arbeitsbereich.',
      PT: 'Abra uma pasta primeiro — o atlas descreve um espaço de trabalho.',
      AR: 'افتح مجلدًا أولًا — الأطلس يصف مساحة العمل.',
    },
  },
  {
    lama: 'Use the /knowledge-plan command to generate wiki conversations',
    baru: 'Use the /knowledge-plan command to generate Atlas conversations',
    nilai: {
      ID: 'Pakai perintah /knowledge-plan untuk menyusun percakapan Atlas',
      EN: 'Use the /knowledge-plan command to generate Atlas conversations',
      JA: '/knowledge-plan コマンドでアトラスの会話を生成します',
      KO: '/knowledge-plan 명령으로 아틀라스 대화를 생성합니다',
      ZH: '使用 /knowledge-plan 命令生成地图集对话',
      ES: 'Usa el comando /knowledge-plan para generar conversaciones del atlas',
      FR: 'Utilisez la commande /knowledge-plan pour générer des conversations d’atlas',
      DE: 'Nutze den Befehl /knowledge-plan, um Atlas-Gespräche zu erzeugen',
      PT: 'Use o comando /knowledge-plan para gerar conversas do atlas',
      AR: 'استخدم الأمر /knowledge-plan لإنشاء محادثات الأطلس',
    },
  },
];

/* Kunci BARU yang belum ada di kamus mana pun (badge "generated"). */
const BARU = [
  {
    baru: 'generated',
    nilai: {
      ID: 'dibuat', EN: 'generated', JA: '生成', KO: '생성', ZH: '已生成',
      ES: 'generado', FR: 'généré', DE: 'erzeugt', PT: 'gerado', AR: 'تم الإنشاء',
    },
  },
];

const baris = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const eol = fs.readFileSync(path, 'utf8').includes('\r\n') ? '\r\n' : '\n';

let kamusSekarang = null;
const ketemu = Object.fromEntries(PETA.map((p) => [p.lama, new Set()]));
const baruDitaruh = Object.fromEntries(BARU.map((p) => [p.baru, new Set()]));
const barisBaru = [];

const esc = (s) => s.replace(/'/g, "\\'");

for (const b of baris) {
  const mKam = /^const (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{/.exec(b);
  if (mKam) kamusSekarang = mKam[1];

  const mKunci = /^(\s*)'((?:[^'\\]|\\.)*)': (.*)$/.exec(b);
  if (kamusSekarang && mKunci) {
    const indent = mKunci[1];
    const kunci = mKunci[2];
    const item = PETA.find((p) => p.lama === kunci);
    if (item) {
      const nilai = item.nilai[kamusSekarang];
      if (nilai === undefined) {
        console.log(`  BOLONG  ${kamusSekarang}: ${kunci}`);
      } else {
        ketemu[kunci].add(kamusSekarang);
        barisBaru.push(`${indent}'${esc(item.baru)}': '${esc(nilai)}',`);
        continue;
      }
    }
  }
  barisBaru.push(b);
}

/* Sisipkan kunci BARU tepat setelah 'Generating…' di tiap kamus. */
for (const p of BARU) {
  const idx = [];
  kamusSekarang = null;
  barisBaru.forEach((b, i) => {
    const mKam = /^const (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{/.exec(b);
    if (mKam) kamusSekarang = mKam[1];
    if (kamusSekarang && /^\s*'Generating…':/.test(b)) idx.push({ i, lang: kamusSekarang });
  });
  /* dari belakang supaya indeks tidak bergeser */
  for (const { i, lang } of idx.reverse()) {
    const nilai = p.nilai[lang];
    barisBaru.splice(i + 1, 0, `  '${esc(p.baru)}': '${esc(nilai)}',`);
    baruDitaruh[p.baru].add(lang);
  }
}

fs.writeFileSync(path, barisBaru.join(eol), 'utf8');

console.log('Rename kamus i18n:');
let gagal = 0;
for (const p of PETA) {
  const n = ketemu[p.lama].size;
  const ok = n === URUTAN.length;
  if (!ok) gagal++;
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'} ${p.lama.slice(0, 48).padEnd(50)} ${n}/${URUTAN.length} kamus`);
}
for (const p of BARU) {
  const n = baruDitaruh[p.baru].size;
  const ok = n === URUTAN.length;
  if (!ok) gagal++;
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'} (baru) ${p.baru.padEnd(43)} ${n}/${URUTAN.length} kamus`);
}
console.log(gagal === 0 ? '\nSemua kamus lengkap.' : `\n${gagal} kunci tidak lengkap.`);
process.exit(gagal ? 1 : 0);
