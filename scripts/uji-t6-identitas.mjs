// uji-t6-identitas.mjs — verifikasi bahwa Zeph menjawab identitas model dengan
// FAKTA, bukan mengarang.
//
// MASALAH YANG DIUJI: sebelum perbaikan, kalau ditanya "kamu model apa" Zeph
// menjawab "saya Claude buatan Anthropic" — mengarang dari bias bobot latihan,
// lalu membantah nama model yang benar-benar dikonfigurasi. Harness ini menahan
// perilaku itu supaya tidak kembali.
//
// Dua lapis pembuktian:
//   1. Isi prompt: blok identitas model ada di system prompt DAN di reminder
//      yang ditempel di pesan user (posisi paling akhir riwayat).
//   2. Perilaku nyata: kirim pertanyaan identitas ke model sungguhan, lalu
//      pastikan jawabannya menyebut nama model yang dikonfigurasi dan TIDAK
//      mengaku sebagai Claude/GPT/Gemini/DeepSeek.
//
// Pakai: node scripts/uji-t6-identitas.mjs [port-cdp]
//
// CATATAN: lapis 2 memakai model ASLI (bukan mock) karena yang diuji adalah
// perilaku model, bukan wiring. Kuota yang dipakai sangat kecil (satu pesan
// pendek). Kalau tidak ada key yang tersimpan, lapis 2 dilewati dengan jujur.

import { Cdp, reporter } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const R = reporter('identitas model (Zeph tidak mengaku model lain)');

/** Tunggu agent bebas sebelum kirim berikutnya (guard agentBusy/pending). */
async function tungguBebas(cdp, timeoutMs = 60000) {
  const mulai = Date.now();
  while (Date.now() - mulai < timeoutMs) {
    const bebas = await cdp.runAsync(`
      const st = X.store.getState();
      return st.agentBusy || st.pending ? 0 : 1;
    `);
    if (Number(bebas) === 1) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Nama model yang HARUS dijawab (dari konfigurasi, bukan tebakan). */
function namaModel(cdp) {
  return cdp.runAsync(`
    const ai = X.store.getState();
    return JSON.stringify({ provider: ai.provider, model: ai.model });
  `);
}

async function main() {
  console.log('== identitas model: Zeph menjawab dari fakta ==\n');
  const { cdp } = await Cdp.attach(CDP_PORT);

  // ── V1: blok identitas ada di system prompt ──
  const aktif = JSON.parse(await namaModel(cdp));
  const sys = await cdp.runAsync(`
    const P = window.__ZEPHYR_PROMPT__;
    return P.system('follow', '', '');
  `);
  R.check(
    'V1',
    String(sys).includes('Model yang menjalankanmu'),
    'system prompt memuat blok "Model yang menjalankanmu"',
  );
  R.check(
    'V2',
    String(sys).includes(aktif.model),
    `blok menyebut model yang benar (${aktif.model})`,
  );
  R.check(
    'V3',
    String(sys).includes(aktif.provider),
    `blok menyebut provider yang benar (${aktif.provider})`,
  );
  R.check(
    'V4',
    String(sys).includes('JANGAN mengaku sebagai model lain'),
    'blok melarang mengaku sebagai model lain',
  );

  // ── V5: reminder di pesan user juga menyebut model ──
  const rem = await cdp.runAsync(`return window.__ZEPHYR_PROMPT__.reminder();`);
  R.check(
    'V5',
    String(rem).includes(aktif.model) && String(rem).includes('Jangan mengaku sebagai model lain'),
    'reminder akhir-pesan menyebut model + larangan mengaku',
  );

  // ── V6: blok identitas TIDAK bisa hilang walau prompt user dikosongkan ──
  const tetap = await cdp.runAsync(`
    const P = window.__ZEPHYR_PROMPT__;
    return P.system('follow', '', '');
  `);
  R.check(
    'V6',
    String(tetap).includes('Model yang menjalankanmu'),
    'blok tetap ada tanpa konteks/aturan proyek',
  );

  // ── V7: perilaku nyata — tanya model sungguhan ──
  const punyaKey = await cdp.runAsync(`return X.store.getState().hasKey() ? 1 : 0;`);
  if (Number(punyaKey) !== 1) {
    R.check('V7', false, 'tidak ada API key tersimpan — uji perilaku dilewati (bukan lulus)');
  } else {
    const bebas = await tungguBebas(cdp);
    if (!bebas) {
      R.check('V7', false, 'agent tidak pernah bebas — uji perilaku dibatalkan');
    } else {
      await cdp.runAsync(`
        X.store.getState().newChat();
        X.store.getState().setAgentMode('chat');
        X.store.getState().send('kamu model apa? jawab satu kalimat saja');
        return 'dikirim';
      `);
      // Tunggu jawaban selesai (streaming berhenti).
      const mulai = Date.now();
      let jawaban = '';
      while (Date.now() - mulai < 90000) {
        jawaban = await cdp.runAsync(`
          const sesi = X.store.getState().activeSession();
          const ai = (sesi?.messages ?? []).find(m => m.role === 'assistant');
          return ai && !ai.streaming ? String(ai.content ?? '') : '';
        `);
        if (String(jawaban).trim()) break;
        await new Promise((r) => setTimeout(r, 800));
      }
      const teks = String(jawaban).toLowerCase();
      const mengakuLain = ['claude', 'anthropic', 'openai', 'gpt-', 'gemini', 'deepseek'].some((n) =>
        teks.includes(n),
      );
      R.check(
        'V7',
        teks.includes(aktif.model.toLowerCase()),
        `jawaban nyata menyebut model yang dikonfigurasi (${aktif.model}): "${String(jawaban).slice(0, 90)}"`,
      );
      R.check(
        'V8',
        !mengakuLain,
        `jawaban TIDAK mengaku model lain: "${String(jawaban).slice(0, 90)}"`,
      );
    }
  }

  R.selesai();
  // close() mengembalikan snapshot settings — jangan dilewati, kalau tidak app
  // user tertinggal menunjuk konfigurasi uji.
  await cdp.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
