/*
 * Menambahkan 9 kunci Inggris baru ke SEMUA kamus di `i18n-extra.ts`.
 *
 * Konvensi berkas ini: KUNCI = kalimat sumber (Inggris), nilai = terjemahan
 * untuk bahasa itu - kecuali kamus ID, yang nilainya teks Indonesia.
 *
 * Penjaga: skrip MELEMPAR kalau ada bahasa tanpa terjemahan. Menambahkan ke
 * sebagian kamus adalah bug yang baru saja kita perbaiki dua kali di sesi ini
 * (mcp.allowTerminalControl dan agents.*), dan keduanya menghasilkan halaman
 * berbahasa Indonesia di sembilan bahasa lain.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const asli = readFileSync(BERKAS, 'utf8');

const KUNCI = [
  'Language Servers',
  'A running server gives you completion, go-to-definition, and errors while you type. With this off, the editor still opens and edits files: it just does not know your language.',
  'Filter by language or extension',
  'Re-check',
  'No server matches that filter.',
  'custom',
  'Enabled',
  'Reset to the built-in command',
  'idle',
];

/* Nilai per bahasa. Untuk ID, nilainya Indonesia; untuk yang lain, terjemahan. */
const T = {
  ID: [
    'Language Server',
    'Server yang menyala memberi pelengkapan, lompat ke definisi, dan galat saat kamu mengetik. Kalau dimatikan, editor tetap membuka dan menyunting berkas: ia hanya tidak mengenali bahasamu.',
    'Saring menurut bahasa atau ekstensi',
    'Periksa ulang',
    'Tidak ada server yang cocok dengan saringan itu.',
    'kustom',
    'Nyalakan',
    'Kembalikan perintah bawaan',
    'diam',
  ],
  EN: [
    'Language Servers',
    'A running server gives you completion, go-to-definition, and errors while you type. With this off, the editor still opens and edits files: it just does not know your language.',
    'Filter by language or extension',
    'Re-check',
    'No server matches that filter.',
    'custom',
    'Enabled',
    'Reset to the built-in command',
    'idle',
  ],
  JA: [
    '言語サーバー',
    '動作中のサーバーは、入力中に補完・定義へのジャンプ・エラーを提供します。オフでもエディタはファイルを開いて編集できますが、言語を認識しなくなります。',
    '言語または拡張子で絞り込む',
    '再確認',
    'その条件に一致するサーバーはありません。',
    'カスタム',
    '有効',
    '組み込みコマンドに戻す',
    '待機中',
  ],
  KO: [
    '언어 서버',
    '실행 중인 서버는 입력하는 동안 자동 완성, 정의로 이동, 오류를 제공합니다. 꺼도 편집기는 파일을 열고 편집할 수 있지만 언어를 인식하지 못합니다.',
    '언어 또는 확장자로 필터',
    '다시 확인',
    '해당 필터와 일치하는 서버가 없습니다.',
    '사용자 지정',
    '사용',
    '기본 명령으로 되돌리기',
    '대기',
  ],
  ZH: [
    '语言服务器',
    '运行中的服务器会在你输入时提供补全、跳转到定义和错误提示。关闭后编辑器仍可打开和编辑文件，只是不再识别你的语言。',
    '按语言或扩展名筛选',
    '重新检查',
    '没有符合该筛选条件的服务器。',
    '自定义',
    '已启用',
    '恢复内置命令',
    '空闲',
  ],
  ES: [
    'Servidores de lenguaje',
    'Un servidor en marcha te da autocompletado, ir a la definicion y errores mientras escribes. Si lo desactivas, el editor sigue abriendo y editando archivos: solo deja de reconocer tu lenguaje.',
    'Filtrar por lenguaje o extension',
    'Volver a comprobar',
    'Ningun servidor coincide con ese filtro.',
    'personalizado',
    'Activado',
    'Volver al comando integrado',
    'inactivo',
  ],
  FR: [
    'Serveurs de langage',
    "Un serveur actif vous donne la completion, l'acces a la definition et les erreurs pendant la saisie. Desactive, l'editeur ouvre et modifie toujours les fichiers : il ne reconnait simplement plus votre langage.",
    'Filtrer par langage ou extension',
    'Verifier a nouveau',
    'Aucun serveur ne correspond a ce filtre.',
    'personnalise',
    'Active',
    'Revenir a la commande integree',
    'inactif',
  ],
  DE: [
    'Sprachserver',
    'Ein laufender Server liefert Vervollstaendigung, Sprung zur Definition und Fehler waehrend des Tippens. Ausgeschaltet oeffnet und bearbeitet der Editor Dateien weiterhin: er kennt die Sprache nur nicht mehr.',
    'Nach Sprache oder Endung filtern',
    'Erneut pruefen',
    'Kein Server passt zu diesem Filter.',
    'eigene',
    'Aktiviert',
    'Auf den eingebauten Befehl zuruecksetzen',
    'inaktiv',
  ],
  PT: [
    'Servidores de linguagem',
    'Um servidor ativo da a voce completacao, ir para a definicao e erros enquanto digita. Desativado, o editor continua abrindo e editando arquivos: so deixa de reconhecer a sua linguagem.',
    'Filtrar por linguagem ou extensao',
    'Verificar de novo',
    'Nenhum servidor corresponde a esse filtro.',
    'personalizado',
    'Ativado',
    'Voltar ao comando interno',
    'inativo',
  ],
  AR: [
    'خوادم اللغة',
    'الخادم العامل يمنحك الإكمال والانتقال إلى التعريف والأخطاء أثناء الكتابة. عند إيقافه يظل المحرر يفتح الملفات ويحررها لكنه لم يعد يتعرف على لغتك.',
    'تصفية حسب اللغة أو الامتداد',
    'إعادة الفحص',
    'لا يوجد خادم يطابق هذا التصفية.',
    'مخصص',
    'مُفعّل',
    'العودة إلى الأمر المدمج',
    'خامل',
  ],
};

const batas = [...asli.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1],
  i: m.index,
}));

if (batas.length !== 10) {
  console.error('BERHENTI: mengharapkan 10 kamus, menemukan ' + batas.length + '.');
  process.exit(1);
}

for (const b of batas) {
  if (!T[b.b]) {
    console.error('BERHENTI: tidak ada terjemahan untuk kamus "' + b.b + '".');
    process.exit(1);
  }
}

const baris = asli.split('\n');
const sisipan = [];

for (let i = 0; i < batas.length; i++) {
  const b = batas[i].b;
  const mulai = batas[i].i;
  const akhir = i + 1 < batas.length ? batas[i + 1].i : asli.length;
  const blok = asli.slice(mulai, akhir);

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const kurang = KUNCI.filter((k) => {
    const pola = new RegExp("^\\s{2}'" + esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\s*:", 'm');
    return !pola.test(blok);
  });
  if (!kurang.length) {
    console.log('  ' + b + ': lengkap');
    continue;
  }

  const barisMulai = asli.slice(0, mulai).split('\n').length - 1;
  const barisAkhir = i + 1 < batas.length ? asli.slice(0, akhir).split('\n').length - 1 : baris.length;

  /* Jangkar: kunci 'Stop all servers' kalau ada, kalau tidak 'Install', kalau
     tidak baris pertama isi kamus. Semua jangkar sudah pasti dimiliki setiap
     kamus, jadi tidak ada kamus yang bisa terlewat. */
  let jangkar = -1;
  for (const j of ['Stop all servers', 'Install', 'Enable IntelliSense (LSP)']) {
    for (let n = barisAkhir - 1; n > barisMulai; n--) {
      if (baris[n].includes("'" + j + "'")) {
        jangkar = n;
        break;
      }
    }
    if (jangkar >= 0) break;
  }
  if (jangkar < 0) {
    console.error('BERHENTI: tidak ada jangkar di kamus "' + b + '".');
    process.exit(1);
  }

  const kutip = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const nilai = T[b];
  sisipan.push({
    baris: jangkar,
    b,
    n: kurang.length,
    teks: kurang.map((k) => `  ${kutip(k)}: ${kutip(nilai[KUNCI.indexOf(k)])},`),
  });
}

sisipan.sort((a, b) => b.baris - a.baris);
for (const s of sisipan) {
  baris.splice(s.baris + 1, 0, ...s.teks);
  console.log('  ' + s.b + ': +' + s.n + ' kunci');
}

if (sisipan.length) {
  writeFileSync(BERKAS, baris.join('\n'), 'utf8');
  console.log('');
  console.log('Selesai: ' + sisipan.length + ' kamus diperbarui.');
} else {
  console.log('Tidak ada yang perlu diubah.');
}
