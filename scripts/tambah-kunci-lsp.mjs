/*
 * Menambahkan kunci kamus untuk section Language Servers ke SEMUA kamus.
 *
 * Lewat skrip, bukan suntingan tangan, karena kamus memuat aksara non-Latin
 * (Jepang, Korea, Cina, Arab) yang rusak kalau ditulis ulang alat yang
 * menormalkan encoding.
 *
 * Penjaga: kalau satu bahasa dilewatkan, kuncinya akan tampil INDONESIA di
 * bahasa itu (rantai fallback di i18n.ts), jadi skrip ini MELEMPAR kalau ada
 * bahasa tanpa terjemahan - lebih baik gagal terang-terangan daripada mengirim
 * bahasa campur yang hanya ketahuan berbulan-bulan kemudian.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n.ts';
const asli = readFileSync(BERKAS, 'utf8');

/* Kunci dan terjemahan per bahasa. 'lsp.custom', 'lsp.stop', dan 'lsp.reload'
   sengaja pendek: ketiganya label tombol di baris yang sempit. */
const KUNCI = [
  'set.lspTitle',
  'set.lspEnable',
  'set.lspEnableHint',
  'lsp.filterPlaceholder',
  'lsp.recheck',
  'lsp.noneFound',
  'lsp.custom',
  'lsp.installWith',
  'lsp.stop',
  'lsp.reload',
  'lsp.resetCommand',
];

const T = {
  id: {
    'set.lspTitle': 'Language Server',
    'set.lspEnable': 'Nyalakan language server',
    'set.lspEnableHint':
      'Server yang menyala memberi pelengkapan, lompat ke definisi, dan galat langsung di editor. Dimatikan, editor tetap bekerja tanpa itu.',
    'lsp.filterPlaceholder': 'Saring menurut bahasa atau ekstensi',
    'lsp.recheck': 'Periksa ulang',
    'lsp.noneFound': 'Tidak ada server yang cocok dengan saringan itu.',
    'lsp.custom': 'kustom',
    'lsp.installWith': 'Pasang dengan',
    'lsp.stop': 'Hentikan',
    'lsp.reload': 'Muat ulang',
    'lsp.resetCommand': 'Kembalikan perintah bawaan',
  },
  en: {
    'set.lspTitle': 'Language Servers',
    'set.lspEnable': 'Enable language servers',
    'set.lspEnableHint':
      'A running server gives you completion, go-to-definition, and errors in the editor as you type. With this off, the editor still works: it just does not know your language.',
    'lsp.filterPlaceholder': 'Filter by language or extension',
    'lsp.recheck': 'Re-check',
    'lsp.noneFound': 'No server matches that filter.',
    'lsp.custom': 'custom',
    'lsp.installWith': 'Install with',
    'lsp.stop': 'Stop',
    'lsp.reload': 'Reload',
    'lsp.resetCommand': 'Reset to the built-in command',
  },
  ja: {
    'set.lspTitle': '言語サーバー',
    'set.lspEnable': '言語サーバーを有効にする',
    'set.lspEnableHint':
      '動作中のサーバーは、入力中の補完、定義へのジャンプ、エラーの表示を行います。オフでもエディタは使えますが、言語を理解しなくなります。',
    'lsp.filterPlaceholder': '言語または拡張子で絞り込む',
    'lsp.recheck': '再確認',
    'lsp.noneFound': 'その条件に一致するサーバーはありません。',
    'lsp.custom': 'カスタム',
    'lsp.installWith': 'インストール:',
    'lsp.stop': '停止',
    'lsp.reload': '再読み込み',
    'lsp.resetCommand': '組み込みコマンドに戻す',
  },
  ko: {
    'set.lspTitle': '언어 서버',
    'set.lspEnable': '언어 서버 켜기',
    'set.lspEnableHint':
      '실행 중인 서버는 입력하는 동안 자동 완성, 정의로 이동, 오류 표시를 제공합니다. 꺼도 편집기는 동작하지만 언어를 이해하지 못합니다.',
    'lsp.filterPlaceholder': '언어 또는 확장자로 필터',
    'lsp.recheck': '다시 확인',
    'lsp.noneFound': '해당 필터와 일치하는 서버가 없습니다.',
    'lsp.custom': '사용자 지정',
    'lsp.installWith': '설치:',
    'lsp.stop': '중지',
    'lsp.reload': '다시 로드',
    'lsp.resetCommand': '기본 명령으로 되돌리기',
  },
  zh: {
    'set.lspTitle': '语言服务器',
    'set.lspEnable': '启用语言服务器',
    'set.lspEnableHint':
      '运行中的服务器会在你输入时提供补全、跳转到定义和错误提示。关闭后编辑器仍可使用，只是不再理解你的语言。',
    'lsp.filterPlaceholder': '按语言或扩展名筛选',
    'lsp.recheck': '重新检查',
    'lsp.noneFound': '没有符合该筛选条件的服务器。',
    'lsp.custom': '自定义',
    'lsp.installWith': '安装方式:',
    'lsp.stop': '停止',
    'lsp.reload': '重新加载',
    'lsp.resetCommand': '恢复内置命令',
  },
  es: {
    'set.lspTitle': 'Servidores de lenguaje',
    'set.lspEnable': 'Activar servidores de lenguaje',
    'set.lspEnableHint':
      'Un servidor en marcha te da autocompletado, ir a la definicion y errores mientras escribes. Si lo desactivas, el editor sigue funcionando: solo deja de entender tu lenguaje.',
    'lsp.filterPlaceholder': 'Filtrar por lenguaje o extension',
    'lsp.recheck': 'Volver a comprobar',
    'lsp.noneFound': 'Ningun servidor coincide con ese filtro.',
    'lsp.custom': 'personalizado',
    'lsp.installWith': 'Instalar con',
    'lsp.stop': 'Detener',
    'lsp.reload': 'Recargar',
    'lsp.resetCommand': 'Volver al comando integrado',
  },
  fr: {
    'set.lspTitle': 'Serveurs de langage',
    'set.lspEnable': 'Activer les serveurs de langage',
    'set.lspEnableHint':
      "Un serveur actif vous donne la completion, l'acces a la definition et les erreurs pendant la saisie. Desactive, l'editeur fonctionne toujours : il ne comprend simplement plus votre langage.",
    'lsp.filterPlaceholder': 'Filtrer par langage ou extension',
    'lsp.recheck': 'Verifier a nouveau',
    'lsp.noneFound': 'Aucun serveur ne correspond a ce filtre.',
    'lsp.custom': 'personnalise',
    'lsp.installWith': 'Installer avec',
    'lsp.stop': 'Arreter',
    'lsp.reload': 'Recharger',
    'lsp.resetCommand': 'Revenir a la commande integree',
  },
  de: {
    'set.lspTitle': 'Sprachserver',
    'set.lspEnable': 'Sprachserver aktivieren',
    'set.lspEnableHint':
      'Ein laufender Server liefert Vervollstaendigung, Sprung zur Definition und Fehler waehrend des Tippens. Ausgeschaltet funktioniert der Editor weiter: er kennt die Sprache nur nicht mehr.',
    'lsp.filterPlaceholder': 'Nach Sprache oder Endung filtern',
    'lsp.recheck': 'Erneut pruefen',
    'lsp.noneFound': 'Kein Server passt zu diesem Filter.',
    'lsp.custom': 'eigene',
    'lsp.installWith': 'Installieren mit',
    'lsp.stop': 'Stoppen',
    'lsp.reload': 'Neu laden',
    'lsp.resetCommand': 'Auf den eingebauten Befehl zuruecksetzen',
  },
  pt: {
    'set.lspTitle': 'Servidores de linguagem',
    'set.lspEnable': 'Ativar servidores de linguagem',
    'set.lspEnableHint':
      'Um servidor ativo da a voce completacao, ir para a definicao e erros enquanto digita. Desativado, o editor continua funcionando: so deixa de entender a sua linguagem.',
    'lsp.filterPlaceholder': 'Filtrar por linguagem ou extensao',
    'lsp.recheck': 'Verificar de novo',
    'lsp.noneFound': 'Nenhum servidor corresponde a esse filtro.',
    'lsp.custom': 'personalizado',
    'lsp.installWith': 'Instalar com',
    'lsp.stop': 'Parar',
    'lsp.reload': 'Recarregar',
    'lsp.resetCommand': 'Voltar ao comando interno',
  },
  ar: {
    'set.lspTitle': 'خوادم اللغة',
    'set.lspEnable': 'تمكين خوادم اللغة',
    'set.lspEnableHint':
      'الخادم العامل يمنحك الإكمال والانتقال إلى التعريف والأخطاء أثناء الكتابة. عند إيقافه يظل المحرر يعمل لكنه لم يعد يفهم لغتك.',
    'lsp.filterPlaceholder': 'تصفية حسب اللغة أو الامتداد',
    'lsp.recheck': 'إعادة الفحص',
    'lsp.noneFound': 'لا يوجد خادم يطابق هذا التصفية.',
    'lsp.custom': 'مخصص',
    'lsp.installWith': 'التثبيت بـ',
    'lsp.stop': 'إيقاف',
    'lsp.reload': 'إعادة التحميل',
    'lsp.resetCommand': 'العودة إلى الأمر المدمج',
  },
};

const batas = [...asli.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1].toLowerCase(),
  i: m.index,
}));

const baris = asli.split('\n');
const sisipan = [];

for (let i = 0; i < batas.length; i++) {
  const b = batas[i].b;
  const pesan = T[b];
  if (!pesan) {
    console.error('BERHENTI: tidak ada terjemahan untuk bahasa "' + b + '".');
    console.error('Menambahkan ke sebagian kamus adalah bug yang baru saja kita perbaiki.');
    process.exit(1);
  }

  const mulai = batas[i].i;
  const akhir = i + 1 < batas.length ? batas[i + 1].i : asli.length;
  const blok = asli.slice(mulai, akhir);

  const kurang = KUNCI.filter((k) => !new RegExp("^\\s{2}'" + k.replace(/\./g, '\\.') + "':", 'm').test(blok));
  if (!kurang.length) {
    console.log('  ' + b + ': lengkap');
    continue;
  }

  const barisMulai = asli.slice(0, mulai).split('\n').length - 1;
  const barisAkhir = i + 1 < batas.length ? asli.slice(0, akhir).split('\n').length - 1 : baris.length;

  /* Jangkar: kunci lsp.* terakhir di kamus ini supaya kunci LSP tetap satu
     kelompok; kalau belum ada, pakai set.* terakhir. */
  let jangkar = -1;
  for (const pola of [/^\s{2}'lsp\./, /^\s{2}'set\./]) {
    for (let n = barisAkhir - 1; n > barisMulai; n--) {
      if (pola.test(baris[n])) {
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
  sisipan.push({ baris: jangkar, b, teks: kurang.map((k) => `  '${k}': ${kutip(pesan[k])},`), n: kurang.length });
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
