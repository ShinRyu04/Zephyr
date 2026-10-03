/*
 * Melengkapi kunci `agents.*` yang baru ditambahkan hanya ke sebagian kamus.
 *
 * Kenapa lewat skrip dan bukan suntingan tangan: kamus memuat aksara non-Latin
 * yang rusak kalau ditulis ulang oleh alat yang menormalkan encoding. Skrip ini
 * membaca dan menulis UTF-8 apa adanya.
 *
 * Jangkar: 'agents.tab' atau kunci agents.* pertama yang SUDAH ada di kamus itu.
 * Kalau kamus belum punya satu pun kunci agents.*, dipakai 'agents.maxPanes'.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n.ts';
const asli = readFileSync(BERKAS, 'utf8');

/*
 * Terjemahan per bahasa. Kunci `agents.snippetCmd` sengaja tetap memuat `#`
 * karena itu bagian dari SINTAKS yang harus diketik user, bukan kata yang
 * diterjemahkan - menerjemahkannya akan memberi petunjuk yang salah.
 */
const PESAN = {
  ja: {
    'agents.customInstructions': 'カスタム指示',
    'agents.customInstructionsHint':
      'すべてのペルソナに追加される指示。ペルソナの定義を置き換えるものではなく、上に重ねて適用されます。',
    'agents.customInstructionsPlaceholder': '例: 常にTypeScriptで答え、コメントは日本語で書く',
    'agents.snippets': 'スニペット',
    'agents.snippetsHint': 'チャット欄で合図を打つと展開されるテキスト。合図付きで呼び出します。',
    'agents.snippetCmd': '合図 (例: review)',
    'agents.snippetBody': '展開されるテキスト',
    'agents.snippetAdd': 'スニペットを追加',
    'agents.snippetHapus': '削除',
    'agents.snippetKosong': 'スニペットはまだありません。',
  },
  ko: {
    'agents.customInstructions': '사용자 지정 지침',
    'agents.customInstructionsHint':
      '모든 페르소나에 추가되는 지침입니다. 페르소나 정의를 대체하지 않고 그 위에 더해집니다.',
    'agents.customInstructionsPlaceholder': '예: 항상 TypeScript로 답하고 주석은 한국어로 작성',
    'agents.snippets': '스니펫',
    'agents.snippetsHint': '채팅 입력란에서 신호를 입력하면 펼쳐지는 텍스트입니다. 신호와 함께 호출합니다.',
    'agents.snippetCmd': '신호 (예: review)',
    'agents.snippetBody': '펼쳐질 텍스트',
    'agents.snippetAdd': '스니펫 추가',
    'agents.snippetHapus': '삭제',
    'agents.snippetKosong': '아직 스니펫이 없습니다.',
  },
  zh: {
    'agents.customInstructions': '自定义指令',
    'agents.customInstructionsHint': '添加到每个角色的指令。它不会替换角色定义，而是叠加在其之上。',
    'agents.customInstructionsPlaceholder': '例如：始终用 TypeScript 回答，注释用中文书写',
    'agents.snippets': '代码片段',
    'agents.snippetsHint': '在聊天输入框中输入信号即可展开的文本。连信号一起调用。',
    'agents.snippetCmd': '信号（例如 review）',
    'agents.snippetBody': '展开后的文本',
    'agents.snippetAdd': '添加片段',
    'agents.snippetHapus': '删除',
    'agents.snippetKosong': '还没有片段。',
  },
  es: {
    'agents.customInstructions': 'Instrucciones personalizadas',
    'agents.customInstructionsHint':
      'Instrucciones que se anaden a todas las personas. No sustituyen la definicion de la persona: se aplican encima.',
    'agents.customInstructionsPlaceholder': 'Por ejemplo: responde siempre en TypeScript y escribe los comentarios en espanol',
    'agents.snippets': 'Fragmentos',
    'agents.snippetsHint': 'Texto que se expande al escribir una senal en el campo de chat. Se invocan con la senal.',
    'agents.snippetCmd': 'Senal (por ejemplo review)',
    'agents.snippetBody': 'Texto que se expande',
    'agents.snippetAdd': 'Anadir fragmento',
    'agents.snippetHapus': 'Eliminar',
    'agents.snippetKosong': 'Todavia no hay fragmentos.',
  },
  fr: {
    'agents.customInstructions': 'Instructions personnalisees',
    'agents.customInstructionsHint':
      "Instructions ajoutees a toutes les personas. Elles ne remplacent pas la definition de la persona : elles s'ajoutent par-dessus.",
    'agents.customInstructionsPlaceholder': 'Par exemple : reponds toujours en TypeScript et ecris les commentaires en francais',
    'agents.snippets': 'Extraits',
    'agents.snippetsHint': "Texte qui se deploie quand on tape un signal dans le champ de chat. S'invoque avec le signal.",
    'agents.snippetCmd': 'Signal (par exemple review)',
    'agents.snippetBody': 'Texte deploye',
    'agents.snippetAdd': 'Ajouter un extrait',
    'agents.snippetHapus': 'Supprimer',
    'agents.snippetKosong': "Pas encore d'extraits.",
  },
  de: {
    'agents.customInstructions': 'Eigene Anweisungen',
    'agents.customInstructionsHint':
      'Anweisungen, die an jede Persona angehaengt werden. Sie ersetzen die Persona nicht, sondern liegen darueber.',
    'agents.customInstructionsPlaceholder': 'Zum Beispiel: antworte immer in TypeScript und schreibe Kommentare auf Deutsch',
    'agents.snippets': 'Schnipsel',
    'agents.snippetsHint': 'Text, der sich beim Tippen eines Signals im Chatfeld entfaltet. Wird mit dem Signal aufgerufen.',
    'agents.snippetCmd': 'Signal (zum Beispiel review)',
    'agents.snippetBody': 'Entfalteter Text',
    'agents.snippetAdd': 'Schnipsel hinzufuegen',
    'agents.snippetHapus': 'Loeschen',
    'agents.snippetKosong': 'Noch keine Schnipsel.',
  },
  pt: {
    'agents.customInstructions': 'Instrucoes personalizadas',
    'agents.customInstructionsHint':
      'Instrucoes acrescentadas a todas as personas. Nao substituem a definicao da persona: ficam por cima dela.',
    'agents.customInstructionsPlaceholder': 'Por exemplo: responda sempre em TypeScript e escreva os comentarios em portugues',
    'agents.snippets': 'Trechos',
    'agents.snippetsHint': 'Texto que se expande ao digitar um sinal no campo de chat. Invocado com o sinal.',
    'agents.snippetCmd': 'Sinal (por exemplo review)',
    'agents.snippetBody': 'Texto expandido',
    'agents.snippetAdd': 'Adicionar trecho',
    'agents.snippetHapus': 'Remover',
    'agents.snippetKosong': 'Ainda nao ha trechos.',
  },
  ar: {
    'agents.customInstructions': 'إرشادات مخصصة',
    'agents.customInstructionsHint':
      'إرشادات تُضاف إلى كل شخصية. لا تستبدل تعريف الشخصية بل تُطبق فوقه.',
    'agents.customInstructionsPlaceholder': 'مثال: أجب دائما بـ TypeScript واكتب التعليقات بالعربية',
    'agents.snippets': 'المقتطفات',
    'agents.snippetsHint': 'نص يتوسع عند كتابة إشارة في حقل المحادثة. يُستدعى مع الإشارة.',
    'agents.snippetCmd': 'الإشارة (مثال: review)',
    'agents.snippetBody': 'النص المتوسع',
    'agents.snippetAdd': 'إضافة مقتطف',
    'agents.snippetHapus': 'حذف',
    'agents.snippetKosong': 'لا توجد مقتطفات بعد.',
  },
  id: {
    'agents.customInstructions': 'Instruksi khusus',
    'agents.customInstructionsHint':
      'Instruksi yang ditambahkan ke setiap persona. Tidak menggantikan definisi persona, melainkan menempel di atasnya.',
    'agents.customInstructionsPlaceholder': 'Misalnya: selalu jawab dengan TypeScript dan tulis komentar dalam bahasa Indonesia',
    'agents.snippets': 'Snippet',
    'agents.snippetsHint': 'Teks yang mengembang saat kamu mengetik pemicunya di kolom chat. Dipanggil bersama pemicunya.',
    'agents.snippetCmd': 'Pemicu (misalnya review)',
    'agents.snippetBody': 'Teks yang mengembang',
    'agents.snippetAdd': 'Tambah snippet',
    'agents.snippetHapus': 'Hapus',
    'agents.snippetKosong': 'Belum ada snippet.',
  },
};

const batas = [...asli.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  bahasa: m[1].toLowerCase(),
  mulai: m.index,
}));

const baris = asli.split('\n');
const sisipan = [];

for (let i = 0; i < batas.length; i++) {
  const b = batas[i].bahasa;
  const mulai = batas[i].mulai;
  const akhir = i + 1 < batas.length ? batas[i + 1].mulai : asli.length;
  const blok = asli.slice(mulai, akhir);

  const pesan = PESAN[b];
  if (!pesan) {
    console.log('  ' + b + ': tidak ada terjemahan disiapkan, dilewati');
    continue;
  }

  const kurang = Object.keys(pesan).filter(
    (k) => !new RegExp("^\\s{2}'" + k.replace(/\./g, '\\.') + "':", 'm').test(blok),
  );
  if (!kurang.length) {
    console.log('  ' + b + ': lengkap, dilewati');
    continue;
  }

  /*
   * Jangkar: kunci agents.* TERAKHIR yang ada di kamus ini, supaya semua kunci
   * agents.* tetap berdekatan. Kalau tidak ada satu pun, dipakai 'mcp.enable' -
   * itu kunci yang pasti dimiliki setiap kamus setelah perbaikan sebelumnya.
   */
  const barisMulai = asli.slice(0, mulai).split('\n').length - 1;
  const barisAkhir = i + 1 < batas.length ? asli.slice(0, akhir).split('\n').length - 1 : baris.length;
  let jangkar = -1;
  for (let n = barisAkhir - 1; n > barisMulai; n--) {
    if (/^\s{2}'agents\./.test(baris[n])) {
      jangkar = n;
      break;
    }
  }
  if (jangkar < 0) {
    for (let n = barisAkhir - 1; n > barisMulai; n--) {
      if (/^\s{2}'mcp\.enable'/.test(baris[n])) {
        jangkar = n;
        break;
      }
    }
  }
  if (jangkar < 0) {
    console.log('  ' + b + ': tidak ada jangkar, dilewati');
    continue;
  }

  const kutip = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const teksBaru = kurang.map((k) => `  '${k}': ${kutip(pesan[k])},`);
  sisipan.push({ baris: jangkar, bahasa: b, teks: teksBaru, jumlah: kurang.length });
}

sisipan.sort((a, b) => b.baris - a.baris);
for (const s of sisipan) {
  baris.splice(s.baris + 1, 0, ...s.teks);
  console.log('  ' + s.bahasa + ': +' + s.jumlah + ' kunci setelah baris ' + (s.baris + 1));
}

if (!sisipan.length) {
  console.log('Tidak ada yang perlu diubah.');
  process.exit(0);
}

writeFileSync(BERKAS, baris.join('\n'), 'utf8');
console.log('');
console.log('Selesai: ' + sisipan.length + ' kamus diperbarui.');
