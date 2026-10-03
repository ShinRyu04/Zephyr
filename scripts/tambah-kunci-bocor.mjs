/*
 * Melengkapi 12 kunci yang nilainya Indonesia tetapi TIDAK ada di kamus lain,
 * sehingga di bahasa itu teksnya tampil Indonesia.
 *
 * Ditemukan lewat `cek-kunci-bocor.mjs`, bukan dari laporan orang. Semuanya
 * sudah lama ada; yang paling merugikan delapan kunci antrean AI (Add to queue,
 * Send now, Stop the current run, dan seterusnya) yang bocor di DELAPAN bahasa
 * sekaligus, karena panel AI adalah bagian yang paling sering dipakai.
 *
 * Berkas: i18n-extra.ts. Kunci = teks sumber, nilai = terjemahan.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const asli = readFileSync(BERKAS, 'utf8');

/* Kunci, dan nilai untuk setiap bahasa yang kehilangannya. */
const KUNCI = {
  'Add to queue': {
    JA: 'キューに追加',
    KO: '대기열에 추가',
    ZH: '添加到队列',
    ES: 'Anadir a la cola',
    FR: 'Ajouter a la file',
    DE: 'Zur Warteschlange hinzufugen',
    PT: 'Adicionar a fila',
    AR: 'إضافة إلى قائمة الانتظار',
  },
  'Context is already short - {n} of {keep} messages kept': {
    JA: 'コンテキストはすでに短い - {keep} 件中 {n} 件を保持',
    KO: '컨텍스트가 이미 짧음 - {keep}개 중 {n}개 유지',
    ZH: '上下文已经很短 - 保留 {keep} 条中的 {n} 条',
    ES: 'El contexto ya es corto - se conservan {n} de {keep} mensajes',
    FR: 'Le contexte est deja court - {n} sur {keep} messages conserves',
    DE: 'Kontext ist bereits kurz - {n} von {keep} Nachrichten behalten',
    PT: 'O contexto ja e curto - {n} de {keep} mensagens mantidas',
    AR: 'السياق قصير بالفعل - تم الاحتفاظ بـ {n} من {keep} رسالة',
  },
  'No conversation is open': {
    JA: '開いている会話がありません',
    KO: '열린 대화가 없습니다',
    ZH: '没有打开的对话',
    ES: 'No hay ninguna conversacion abierta',
    FR: 'Aucune conversation ouverte',
    DE: 'Keine Unterhaltung geoffnet',
    PT: 'Nenhuma conversa aberta',
    AR: 'لا توجد محادثة مفتوحة',
  },
  'Run after the current run finishes': {
    JA: '現在の実行が終わってから実行',
    KO: '현재 실행이 끝난 후 실행',
    ZH: '当前运行结束后执行',
    ES: 'Ejecutar cuando termine la ejecucion actual',
    FR: "Executer apres la fin de l'execution en cours",
    DE: 'Nach dem Ende des aktuellen Laufs ausfuhren',
    PT: 'Executar apos a execucao atual terminar',
    AR: 'التشغيل بعد انتهاء التشغيل الحالي',
  },
  'Send now (interrupt)': {
    JA: '今すぐ送信 (中断)',
    KO: '지금 전송 (중단)',
    ZH: '立即发送 (中断)',
    ES: 'Enviar ahora (interrumpir)',
    FR: 'Envoyer maintenant (interrompre)',
    DE: 'Jetzt senden (unterbrechen)',
    PT: 'Enviar agora (interromper)',
    AR: 'إرسال الآن (مقاطعة)',
  },
  'Stop the current run and keep this typed': {
    JA: '現在の実行を止め、この入力は残す',
    KO: '현재 실행을 중지하고 이 입력은 유지',
    ZH: '停止当前运行，保留这段输入',
    ES: 'Detener la ejecucion actual y conservar lo escrito',
    FR: "Arreter l'execution en cours et garder cette saisie",
    DE: 'Aktuellen Lauf stoppen und diese Eingabe behalten',
    PT: 'Parar a execucao atual e manter o que foi digitado',
    AR: 'إيقاف التشغيل الحالي والاحتفاظ بهذه الكتابة',
  },
  'Stop the current run, then send this': {
    JA: '現在の実行を止めてからこれを送信',
    KO: '현재 실행을 중지한 뒤 이것을 전송',
    ZH: '停止当前运行，然后发送这条',
    ES: 'Detener la ejecucion actual y luego enviar esto',
    FR: "Arreter l'execution en cours, puis envoyer ceci",
    DE: 'Aktuellen Lauf stoppen und dies dann senden',
    PT: 'Parar a execucao atual e depois enviar isto',
    AR: 'إيقاف التشغيل الحالي ثم إرسال هذا',
  },
  'The current run is still stopping - message queued': {
    JA: '現在の実行はまだ停止中 - メッセージをキューに追加しました',
    KO: '현재 실행이 아직 중지 중 - 메시지를 대기열에 넣었습니다',
    ZH: '当前运行仍在停止中 - 消息已加入队列',
    ES: 'La ejecucion actual aun se esta deteniendo - mensaje en cola',
    FR: "L'execution en cours s'arrete encore - message mis en file",
    DE: 'Der aktuelle Lauf stoppt noch - Nachricht eingereiht',
    PT: 'A execucao atual ainda esta parando - mensagem na fila',
    AR: 'التشغيل الحالي لا يزال يتوقف - تمت إضافة الرسالة إلى قائمة الانتظار',
  },
  'format gambar tidak dikenali': {
    FR: 'format image non reconnu',
  },
  'Latar aktif. Panel dibuat sedikit tembus pandang supaya gambar terlihat - teks tetap di atas warna yang cukup kontras.': {
    FR: "Fond actif. Le panneau est legerement transparent pour laisser voir l'image - le texte reste sur une couleur suffisamment contrastee.",
  },
  'devupdate.cannotSelfUpdateHint': {
    FR: "Reconstruisez Zephyr depuis ce depot et echangez le binaire en cours d'execution, sans perdre votre session.",
  },
  'devupdate.rollbackHint': {
    FR: 'Revenez au binaire d\'avant la derniere compilation, puis rouvrez.',
  },
};

const batas = [...asli.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1],
  i: m.index,
}));

const blokKamus = {};
for (let i = 0; i < batas.length; i++) {
  const a = i + 1 < batas.length ? batas[i + 1].i : asli.length;
  blokKamus[batas[i].b] = { mulai: batas[i].i, akhir: a, teks: asli.slice(batas[i].i, a) };
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const kutip = (s) => "'" + esc(s) + "'";

/*
 * Rencana sisipan: per bahasa, daftar baris yang akan ditambahkan. Dikerjakan
 * dari BAWAH ke atas supaya offset di atasnya tidak bergeser.
 */
const baris = asli.split('\n');
const sisipan = [];

for (const [kunci, perBahasa] of Object.entries(KUNCI)) {
  for (const [b, nilai] of Object.entries(perBahasa)) {
    const blok = blokKamus[b];
    if (!blok) {
      console.error('BERHENTI: kamus "' + b + '" tidak ada.');
      process.exit(1);
    }
    const pola = new RegExp("^\\s{2}'" + esc(kunci).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\s*:", 'm');
    if (pola.test(blok.teks)) continue; // sudah ada

    /*
     * Jangkar: kunci tetangga terdekat supaya entri baru berada di dekat
     * kerabatnya, bukan di ujung kamus. Untuk kunci antrean, tetangganya adalah
     * 'Add to queue' atau baris antrean lain.
     */
    const barisMulai = asli.slice(0, blok.mulai).split('\n').length - 1;
    const barisAkhir = asli.slice(0, blok.akhir).split('\n').length - 1;

    /* Ambil kata kunci pertama sebagai petunjuk tetangga. */
    const petunjuk = kunci.split(/\s+/).slice(0, 2).join(' ');
    let jangkar = -1;
    for (let n = barisAkhir - 1; n > barisMulai; n--) {
      if (baris[n].includes(petunjuk) && baris[n].trimStart().startsWith("'")) {
        jangkar = n;
        break;
      }
    }
    /* Kalau tidak ketemu, taruh setelah 'Add to queue' - dij amin oleh semua
       kamus karena blok ini justru yang pertama ditambahkan. */
    if (jangkar < 0) {
      for (let n = barisAkhir - 1; n > barisMulai; n--) {
        if (baris[n].trimStart().startsWith("'Add to queue':") || baris[n].trimStart().startsWith("'Latar aktif")) {
          jangkar = n;
          break;
        }
      }
    }
    if (jangkar < 0) jangkar = barisMulai + 1;

    sisipan.push({ baris: jangkar, b, kunci, teks: `  ${kutip(kunci)}: ${kutip(nilai)},` });
  }
}

sisipan.sort((a, b) => b.baris - a.baris);
let n = 0;
for (const s of sisipan) {
  baris.splice(s.baris + 1, 0, s.teks);
  n++;
}
console.log('Disisipkan: ' + n + ' baris di ' + [...new Set(sisipan.map((s) => s.b))].sort().join(', '));

if (n) {
  writeFileSync(BERKAS, baris.join('\n'), 'utf8');
  console.log('Berkas ditulis UTF-8.');
} else {
  console.log('Tidak ada yang perlu diubah.');
}
