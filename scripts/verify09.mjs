// verify09.mjs 窶・verifikasi V1..V10 fase 09 (AI panel) lewat CDP di app hidup.
//
// Pakai:  node scripts/verify09.mjs [port]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup
//         3) scripts/mock-ai.mjs berjalan di 127.0.0.1:8098 窶・harness ini
//            menyalakannya sendiri kalau belum ada.
//
// Prinsip: streaming, adapter per provider, dan cancel dibuktikan lewat jalur
// Rust yang SAMA dengan produksi. Yang ditukar hanya base URL provider 竊・
// server tiruan, sehingga bukti mencakup ai_chat/ai-chunk/ai_cancel asli.

import { spawn } from 'node:child_process';
import { keluarBersih, pilihJendelaUtama } from './lib-cdp.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';
const MOCK = 8098;

/**
 * Koneksi CDP yang sedang terbuka, supaya jalur galat bisa menutupnya.
 *
 * Tanpa ini, `main().catch` hanya menyetel process.exitCode: WebSocket-nya tetap
 * terbuka, event loop tetap hidup, dan runner suite mencatat "timeout 480s"
 * padahal penyebab aslinya sudah tercetak.
 */
let cdpTerbuka = null;

/*
 * Cadangan berkas secrets.json.
 *
 * Harness ini mengosongkan key uji (gemini/anthropic) lewat setKey, dan jalur
 * itu menulis ulang seluruh berkas 窶・pernah sampai menghapus key milik user
 * (provider custom user). Berkas dicadangkan sebelum uji dan dikembalikan apa
 * adanya di akhir, termasuk saat harness gagal di tengah jalan.
 */
const SECRETS = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'zephyr',
  'secrets.json',
);
const SECRETS_CADANGAN = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `secrets-verify09-${process.pid}.json`,
);

function backupSecrets() {
  try {
    if (fs.existsSync(SECRETS)) {
      fs.copyFileSync(SECRETS, SECRETS_CADANGAN);
      return true;
    }
  } catch {
    /* lanjut tanpa cadangan */
  }
  return false;
}

function restoreSecrets() {
  try {
    if (fs.existsSync(SECRETS_CADANGAN)) {
      fs.copyFileSync(SECRETS_CADANGAN, SECRETS);
      fs.rmSync(SECRETS_CADANGAN, { force: true });
    }
  } catch {
    /* biarkan — cadangan masih ada di disk */
  }
}

/*
 * Cadangan berkas settings.json.
 *
 * Harness ini menulis baseUrl tiruan (http://127.0.0.1:8098) ke
 * models.providers lewat applySettings. Dulu pemulihannya HANYA ada di dalam
 * halaman, di langkah terakhir (V10). Begitu harness berhenti lebih awal —
 * mis. V1 gagal — pemulihan itu tidak pernah jalan dan settings.json user
 * TERTINGGAL menunjuk server yang sudah mati, sekaligus MENGHAPUS entri
 * provider milik user (terbukti: provider `custom2`/`custom` hilang dan tiga
 * provider menunjuk 127.0.0.1:8098, sehingga chat user rusak).
 *
 * Sisi Node karena itu mencadangkan berkasnya SEBELUM uji dan menulisnya
 * kembali apa adanya di SEMUA jalur keluar: lulus, gagal di tengah, atau
 * berhenti awal.
 */
const SETTINGS = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'zephyr',
  'settings.json',
);
const SETTINGS_CADANGAN = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `settings-verify09-${process.pid}.json`,
);

function backupSettings() {
  try {
    if (fs.existsSync(SETTINGS)) {
      fs.copyFileSync(SETTINGS, SETTINGS_CADANGAN);
      return true;
    }
  } catch {
    /* lanjut tanpa cadangan */
  }
  return false;
}

function restoreSettings() {
  try {
    if (fs.existsSync(SETTINGS_CADANGAN)) {
      fs.copyFileSync(SETTINGS_CADANGAN, SETTINGS);
      fs.rmSync(SETTINGS_CADANGAN, { force: true });
      console.log('[verify09] settings.json dipulihkan ke keadaan sebelum uji');
    }
  } catch (e) {
    console.error(
      `[verify09] GAGAL memulihkan settings.json (cadangan masih ada di ${SETTINGS_CADANGAN}):`,
      e.message,
    );
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    await new Promise((res, rej) => {
      c.#ws.once('open', res);
      c.#ws.once('error', rej);
    });
    c.#ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const p = c.#pending.get(msg.id);
      if (p) {
        c.#pending.delete(msg.id);
        p(msg);
      }
    });
    return c;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => {
      this.#pending.set(id, res);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      userGesture: true,
    });
    if (r.error) throw new Error(`RPC: ${JSON.stringify(r.error)}`);
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    }
    return r.result?.result?.value;
  }

  /** Async di halaman + polling hasil (WebView2 sering membuang promise). */
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV9_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const X = window.__ZEPHYR_SET__;
        const A = window.__ZEPHYR_AI__;
        const AS = () => window.__ZEPHYR_AI__.store.getState();
        /*
         * Pesan permukaan yang SEDANG memegang composer.
         *
         * Composer yang ter-render bisa memakai composerId 'editor' (tab Chat)
         * atau '' (kolom kanan); id itulah yang menentukan sesi tempat pesan
         * ditulis, bukan activeId. Mengikuti activeId saja membuat uji membaca
         * sesi kosong (V7/V8/V11 pernah gagal begitu padahal bubble-nya penuh).
         * Composer dibaca dulu untuk tahu permukaan mana yang hidup, lalu
         * dibatasi ke permukaan itu - bukan menebak lewat urutan sesi, supaya
         * uji tidak lulus hanya karena kebetulan memilih sesi lain.
         */
        const msgs = () => {
          const st = AS();
          const sid = sidKirim();
          return st.sessions.find((x) => x.id === sid)?.messages ?? [];
        };
        /*
         * Sesi milik PERMUKAAN composer yang hidup.
         *
         * Pembedanya composerId: tab Chat memakai 'editor', kolom kanan ''.
         * Permukaan '' membaca activeIds[''] lalu jatuh ke activeId. Jatuh ke
         * activeId untuk 'editor' SALAH: newChat() dan semua aksi lain
         * memindahkan activeId ke sesi yang baru dibuat, jadi saat tab Chat
         * belum punya sesi, activeId menunjuk sesi KOLOM KANAN - dan seluruh
         * uji membaca percakapan permukaan yang tidak sedang diuji. Itu sebabnya
         * V8 melaporkan "tersisa 14" padahal batas 200, dan V9 "0 pesan
         * kembali" padahal sesinya utuh: yang dibaca sesi lain.
         */
        const sidKirim = () => {
          const st = AS();
          const diEditor = !!q('[data-testid="ai-view-chat"]');
          return diEditor ? (st.activeIds?.editor ?? null) : (st.activeIds?.[''] ?? st.activeId);
        };
        const P = window.__ZEPHYR_PTY__;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        // React melacak nilai input lewat setter internal (catatan fase 08):
        // menimpa el.value langsung TIDAK memicu onChange.
        const setNativeValue = (el, val) => {
          if (!el) throw new Error('setNativeValue: elemen tidak ada (composer belum ter-render?)');
          /* contenteditable / elemen non-input tidak punya setter prototipe:
             memaksanya memicu "Illegal invocation". */
          const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : el instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : null;
          if (!proto) {
            el.textContent = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        /**
         * Buka satu-satunya panel AI yang benar-benar ter-render.
         *
         * Composer (beserta tombol model) hanya dirender kalau ada chat aktif:
         * composer mengikuti activeIds[composerId]. Di app yang baru start
         * belum ada chat, jadi tombol model tidak akan pernah muncul dan
         * klik() menunggu 4 detik lalu gagal. Buat chat kalau memang kosong.
         */
        const bukaAi = async () => {
          const st = S.getState();
          st.setSettingsOpen(false);
          st.setActivity('ai');
          if (!S.getState().sidebarVisible) st.toggleSidebar();
          /*
           * Tab Chat harus AKTIF kalau panelnya rumah tab editor.
           *
           * bukaViewAi() hanya mengaktifkan tab yang SUDAH ada; sejak uji
           * membuat file untitled (V4 dst), tab berkas itu yang aktif dan
           * AiChatOnly tidak di-mount lagi - composer hilang walau tab Chat
           * masih terdaftar (tab ai-chat dengan active:false). Profil AI
           * dibuka lewat store supaya berlaku untuk composer mana pun.
           */
          const aktifkanTabChat = () => {
            const s2 = S.getState();
            const t = s2.tabs.find((x) => x.view === 'ai-chat');
            if (t && s2.activeTabId !== t.id) S.setState({ activeTabId: t.id });
          };
          aktifkanTabChat();
          /*
           * Panel AI punya DUA rumah dan keduanya bukan tab di dock bawah:
           * kolom kanan (general.aiPanel = 'right') dan tab editor pembuka
           * bukaViewAi. Posisi lain ('bottom') tidak merender kolom kanan sama
           * sekali, jadi kolom hanya dinyalakan kalau memang posisinya 'right';
           * tab editor bekerja untuk posisi apa pun.
           */
          if ((S.getState().settings?.general?.aiPanel ?? 'right') === 'right') {
            if (!S.getState().aiKolomVisible) S.getState().setAiKolomVisible(true);
          } else {
            S.getState().bukaViewAi('ai-chat');
          }
          aktifkanTabChat();
          if (S.getState().activity !== 'ai') S.getState().setActivity('ai');
          /*
           * Uji ini mengukur jalur AGEN (Stop, streaming, history, draft).
           *
           * send() punya dua jalur: 'agent' menyalakan agentBusy lalu menulis
           * streaming ke sesi composer, sedangkan 'chat' hanya mengisi bubble
           * sekali dan TIDAK pernah menyalakan agentBusy. Mode disimpan di
           * localStorage ('zephyr.ai.mode') dan terbawa dari sesi uji lama,
           * jadi tanpa dipaksa ke 'agent' V7/V8/V9/V11 mengukur jalur yang
           * salah dan gagal padahal aplikasinya benar.
           */
          try { localStorage.removeItem('zephyr.ai.mode'); } catch (_) { /* mode bawaan */ }
          if (AS().agentMode !== 'agent') AS().setAgentMode('agent');
          await wait(260);
          const ai = AS();
          if (!ai.activeIds?.chat) {
            ai.newChat('chat');
          }
          /*
           * Tunggu composer benar-benar ter-render sebelum mengembalikan.
           *
           * Panggilan sebelumnya cuma menunggu 260 ms tetap. Panel yang baru
           * dimount (chat baru, dock pindah tab) butuh render tambahan, dan
           * V1 langsung mengklik tombol model: elemennya belum ada, klik()
           * menyerah setelah 4 detik, seluruh skrip mati. Yang ditunggu adalah
           * elemen yang MEMANG dipakai langkah berikutnya.
           */
          for (let i = 0; i < 25 && !q('[data-testid="ai-model-btn"]'); i++) await wait(200);
          if (!q('[data-testid="ai-model-btn"]')) {
            throw new Error(
              'composer AI tidak ter-render'
              + ' (input=' + !!q('[data-testid="ai-input"]')
              + ', panel=' + !!q('[data-testid="ai-panel"]')
              + ', pos=' + String(S.getState().settings?.general?.aiPanel)
              + ', viewChat=' + !!q('[data-testid="ai-view-chat"]')
              + ', activeId=' + String(AS().activeId)
              + ', chatKomposer=' + String(AS().activeIds?.chat)
              + ', sesi=' + AS().sessions.length
              + ')'
            );
          }
        };
        /** Tunggu sampai streaming selesai.
         *
         *  Jalur AGEN menandai run dengan 'agentBusy', BUKAN 'pending'
         *  ('pending' milik jalur chat yang kini pensiun). Menunggu 'pending'
         *  saja langsung lolos di jalur agen, lalu uji membaca jawaban separuh
         *  jalan - itu sebabnya V3 melaporkan jawaban "terpotong" dan V4 tidak
         *  menemukan isi berkas di jawaban, padahal streamingnya berjalan
         *  normal. Dua-duanya ditunggu, satu pun tidak boleh tertinggal.
         */
        const tungguSelesai = async (ms = 45000) => {
          const batas = Date.now() + ms;
          while ((AS().agentBusy || AS().pending) && Date.now() < batas) await wait(150);
          await wait(300);
          return !(AS().agentBusy || AS().pending);
        };
        /** Kirim lewat UI seperti user: isi textarea lalu klik Kirim.
         *  Kalau masih ada request menggantung, batalkan dulu supaya tombol
         *  Kirim benar-benar ada (saat pending yang tampil adalah Stop).
         *  PENTING: send() menyetel pending SETELAH await loadKeys(), jadi
         *  fungsi ini harus menunggu pending terpasang 窶・kalau tidak,
         *  tungguSelesai() langsung lolos dan kita membaca jawaban separuh. */
        const kirim = async (teks, sebelumKlik) => {
          /*
           * Run yang menggantung harus dibereskan DULU.
           *
           * Kalau agentBusy masih true (mis. run sebelumnya mati di tengah -
           * mock-nya dimatikan saat probe streaming), komposer menampilkan
           * Stop dan tombol Kirim TIDAK ada; seluruh blok uji lalu melempar
           * "tombol Kirim tidak ada" tanpa menjelaskan apa pun. Batalkan run
           * itu dan tunggu busy benar-benar turun sebelum mengetik.
           */
          if (AS().agentBusy) {
            await AS().cancel?.();
            const batasBusy = Date.now() + 20000;
            while (AS().agentBusy && Date.now() < batasBusy) await wait(200);
          }
          if (AS().pending) { await AS().cancel(); await wait(300); }
          // Toast lama masih tampil sampai 3.2s; kalau tidak dibersihkan,
          // pengiriman BERIKUTNYA salah dibaca sebagai "diblokir" dan
          // harness lanjut sebelum jawaban datang (V5 pernah gagal begini).
          AS().setToast(null);
          /*
           * Tunggu toast benar-benar lepas dari DOM.
           *
           * setToast(null) hanya mengubah state; React baru menghapus
           * elemennya pada render berikutnya. Kalau pengiriman berikutnya
           * dimulai sebelum itu, sisa toast dari uji sebelumnya terbaca
           * sebagai "diblokir" dan harness lanjut tanpa pesan terkirim 窶・
           * itulah sebabnya V3 melaporkan jejak 0竊・竊・.
           */
          for (let i = 0; i < 12 && q('[data-testid="ai-toast"]'); i++) await wait(80);
          /*
           * Composer bisa belum ada tepat setelah panel di-mount ulang (tab
           * editor vs kolom kanan). Tunggu dulu, jangan memaksa setter pada
           * null: dulu itu melempar "Illegal invocation" dan mematikan seluruh
           * sisa uji. Kalau memang tidak muncul (tab Chat kehilangan fokus
           * karena uji membuka berkas), buka panelnya lagi.
           */
          for (let i = 0; i < 15 && !q('[data-testid="ai-input"]'); i++) await wait(200);
          if (!q('[data-testid="ai-input"]')) await bukaAi();
          await klik('[data-testid="ai-input"]', 6000).catch(() => {});
          if (!q('[data-testid="ai-input"]')) {
            throw new Error(
              'composer AI tidak ada saat kirim'
              + ' (tabs=' + JSON.stringify(S.getState().tabs.map((t) => [t.id, t.view ?? null, t.id === S.getState().activeTabId]))
              + ', pos=' + String(S.getState().settings?.general?.aiPanel)
              + ')'
            );
          }
          /*
           * Permukaan pengirim harus PUNYA sesi sebelum diukur.
           *
           * Composer tab Chat memakai composerId 'editor'. Tanpa
           * activeIds.editor, send() membuat chat baru dan - lewat newChat() -
           * memindahkan activeId ke sesi itu, sedangkan sesi yang dibaca uji
           * bisa saja sesi permukaan lain. Dibuat di sini supaya uji mengukur
           * sesi tempat pesannya benar-benar ditulis.
           */
          if (!sidKirim()) AS().newChat(!!q('[data-testid="ai-view-chat"]') ? 'editor' : '');
          setNativeValue(q('[data-testid="ai-input"]'), teks);
          await wait(140);
          /*
           * Kait opsional SEBELUM klik Kirim.
           *
           * Uji "kotak bersih setelah kirim" harus membuktikan bahwa yang diuji
           * bukan uji kosong: draft-nya harus benar-benar berisi teks uji saat
           * tombol ditekan. Membacanya SESUDAH klik tidak bisa lagi - sejak
           * perbaikan, draft pengirim memang langsung dikosongkan pada klik itu,
           * jadi bacaan sesudah klik selalu kosong dan syaratnya mustahil
           * dipenuhi walau aplikasinya benar.
           */
          if (sebelumKlik) sebelumKlik();
          let btn = q('[data-testid="ai-send"]');
          /*
           * Tombol Kirim bisa belum ada tepat pada milidetik itu: panel AI
           * di-mount ulang saat dock/tab berpindah, dan panel bisa sedang
           * menampilkan keadaan lain sekejap. Dulu baris ini langsung melempar,
           * dan karena runAsync menelan error-nya, satu tombol yang belum
           * ter-render MEMATIKAN seluruh skrip - V5 lapor "tombol Kirim tidak
           * ada" lalu V6-V11 tidak pernah dinilai sama sekali. Sekarang
           * ditunggu singkat; kalau tetap tidak ada, pesannya menyebut apa yang
           * sebenarnya ter-render supaya penyebabnya bisa dibaca dari log.
           */
          for (let i = 0; i < 20 && !btn; i++) { await wait(200); btn = q('[data-testid="ai-send"]'); }
          if (!btn) throw new Error(
            'tombol Kirim tidak ada'
            + ' (pending=' + AS().pending
            + ', agentBusy=' + AS().agentBusy
            + ', inputAda=' + !!q('[data-testid="ai-input"]')
            + ', panelAda=' + !!q('[data-testid="ai-panel"]')
            + ', setTerbuka=' + !!q('.set-topbar')
            + ', kaki=' + JSON.stringify((q('.ai-input-toolbar')?.textContent || '').replace(/\\s+/g, ' ').trim())
            + ')'
          );
          const jumlahSebelum = msgs().length;
          /*
           * Petunjuk kirim yang sedang berjalan.
           *
           * Jalur agen TIDAK memakai 'pending' (itu milik jalur chat yang
           * pensiun); satu-satunya penanda "request mulai" adalah agentBusy.
           * Tanpa syarat ini, klik yang ditolak (mis. "agent task is still
           * running") terbaca sebagai berhasil karena yang dinilai hanya
           * panjang sesi - dan uji sesudahnya mengukur sisa percakapan lama.
           */
          btn.click();
          const batas = Date.now() + 6000;
          let mulai = false;
          while (Date.now() < batas) {
            if (AS().pending || AS().agentBusy) { mulai = true; break; }
            if (msgs().length !== jumlahSebelum) { mulai = true; break; }
            if (q('[data-testid="ai-toast"]')) break; // diblokir (toast alasan)
            await wait(80);
          }
          // Jejak untuk uji berikutnya: klik ditolak / tidak menghasilkan run
          // tidak boleh lolos diam-diam (dulu V7 hanya melaporkan angka yang
          // tidak berubah, tanpa tahu send() sebenarnya menolak).
          window.__ZEPHYR_KIRIM_TERAKHIR__ = {
            teks: teks.slice(0, 40),
            mulai,
            toast: q('[data-testid="ai-toast"]')?.textContent ?? '',
            busy: AS().agentBusy,
            pesan: msgs().length,
          };
          return mulai;
        };
        /**
         * Paksa provider panel = target, dan PASTIKAN ia bertahan.
         *
         * applySettings hanya menulis state + menjadwalkan tulis ke berkas;
         * sinkronProvider dipanggil dari jalur flush/antrian tulis (store.ts).
         * Jadi panel bisa sempat (atau balik) memakai provider lama, mis. saat
         * flush menulis-lalu-membaca berkas selagi patch baru masih tertunda -
         * panel ikut bergerak ke provider yang tersimpan SEBELUMNYA. Akibatnya
         * uji "kirim tanpa key" mengukur provider yang salah (pernah kejadian:
         * provider tetap gemini, model ikut jadi claude-sonnet-4-5 karena
         * findModel memakai angka katalog lintas provider, lalu tidak ada
         * request anthropic sama sekali). Di sini target dipasang ULANG sambil
         * dipantau sampai benar-benar bertahan.
         */
        const tungguProvider = async (target, ms = 6000) => {
          const batas = Date.now() + ms;
          for (;;) {
            if (AS().provider === target) return true;
            await S.getState().applySettings({ models: { activeProvider: target } });
            await wait(250);
            if (Date.now() > batas) return AS().provider === target;
          }
        };
        /** Klik elemen setelah menunggu ia muncul 窶・panel AI baru ter-mount
         *  saat dock berpindah, jadi query langsung bisa mengenai null. */
        const klik = async (sel, ms = 4000) => {
          const batas = Date.now() + ms;
          for (;;) {
            const el = q(sel);
            if (el) { el.click(); return true; }
            if (Date.now() > batas) throw new Error('elemen tidak muncul: ' + sel);
            await wait(120);
          }
        };
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null,
                  error: (e && e.stack) ? String(e.stack).slice(0, 400)
                       : (e && (e.message || e.code)) ? JSON.stringify(e) : String(e) }; },
      );
      return 'started';
    })()`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(150);
      const st = JSON.parse(await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`));
      if (st.done) {
        await this.eval(`(() => { delete window[${JSON.stringify(slot)}]; return 'x'; })()`);
        if (st.error) throw new Error(st.error);
        return st.value;
      }
      if (Date.now() > deadline) throw new Error(`timeout: ${body.slice(0, 70)}窶ｦ`);
    }
  }

  close() {
    this.#ws.close();
  }
}

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${detail}`);
};

const mockLog = async () => (await fetch(`http://127.0.0.1:${MOCK}/__log`)).json();
const mockReset = () => fetch(`http://127.0.0.1:${MOCK}/__reset`);

/*
 * Naik ke 6 bersama mock-ai. Versi 6 menambahkan mode TIMEOUT untuk menguji
 * tombol Lanjut pada timeout SUNGGUHAN (dulu tidak bisa diuji: Rust bisa diam
 * 1300 detik). Perilaku yang verify09 uji tidak berubah, jadi versinya
 * disamakan - penjaga versi tetap bermakna: mock lama yang nyangkut di port
 * tetap ditolak, bukan diam-diam diuji.
 */
const MOCK_VERSION = 7;

async function ensureMock() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${MOCK}/__version`)).json();
    if (v.version === MOCK_VERSION) return null; // sudah jalan & versinya benar
    throw new Error(
      `mock-ai di :${MOCK} versi ${v.version}, harness butuh ${MOCK_VERSION} 窶・matikan proses itu dulu`,
    );
  } catch (e) {
    if (String(e.message).includes('harness butuh')) throw e;
    /* belum jalan -> nyalakan */
  }
  const child = spawn(process.execPath, ['scripts/mock-ai.mjs', String(MOCK)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    try {
      const v = await (await fetch(`http://127.0.0.1:${MOCK}/__version`)).json();
      if (v.version !== MOCK_VERSION) throw new Error('versi mock salah');
      return child;
    } catch {
      /* tunggu */
    }
  }
  throw new Error(`mock-ai tidak mau start di :${MOCK}`);
}

/**
 * Tutup semua jendela panel (Settings/Extensions/Tools) lewat tombol X-nya.
 *
 * Jendela panel adalah WebView terpisah; app memfokuskan jendela terakhir yang
 * dipakai, jadi harness bisa mengklik di jendela Settings dan mengukur layar
 * yang salah. Daftar target diambil ulang setelah penutupan - label target
 * berubah saat jendela hilang.
 */
async function tutupJendelaPanel() {
  for (let ronde = 0; ronde < 6; ronde++) {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const panel = targets.filter((t) => t.type === 'page' && (t.url ?? '').includes('#panel='));
    if (!panel.length) return;
    for (const t of panel) {
      try {
        const c = await Cdp.connect(t.webSocketDebuggerUrl);
        await c.eval(`(() => {
          const b = document.querySelector('[data-testid="panel-win-close"]');
          if (b) { b.click(); return 'klik'; }
          return 'tidak ada tombol';
        })()`);
        c.close();
      } catch {
        /* jendela sudah hilang di tengah jalan */
      }
    }
    await sleep(500);
  }
}

const main = async () => {
  backupSecrets();
  // Provider user (baseUrl custom/custom2) juga harus kembali apa adanya,
  // bukan hanya key-nya.
  backupSettings();
  const mock = await ensureMock();
  await mockReset();

  /*
   * Jendela Settings (dan panel lain) bisa terbuka sebelum uji. Tutup dulu.
   *
   * Jendela itu adalah WebView TERPISAH dengan store sendiri, dan ikut memakai
   * layar saat app difokuskan - klik di harness lalu mendarat di jendela
   * panel. Harness ini hanya menguji jendela utama, jadi panel ditutup lebih
   * awal daripada menebak jendela mana yang sedang di depan.
   */
  await tutupJendelaPanel();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = pilihJendelaUtama(targets);
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  let cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  cdpTerbuka = cdp;
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_AI__')) === 'undefined') {
    throw new Error('__ZEPHYR_AI__ tidak ada 窶・reload halaman (devBridge fase 09)');
  }

  // Kondisi awal bersih: tutup terminal/tab, settings default, chat kosong,
  // base URL ketiga provider diarahkan ke server tiruan.
  await cdp.runAsync(`
    for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
    s.tabs.slice().forEach((tab) => s.forceCloseTab(tab.id));
    await X.resetAll();

    /*
     * Uji V2 memerlukan keadaan TANPA key pada provider yang aktif.
     *
     * aiStore.init() memilih provider aktif hanya kalau provider itu punya
     * key; kalau tidak, ia pindah ke provider ber-key pertama. Jadi provider
     * aktif harus diarahkan ke provider yang memang belum punya key 窶・bukan
     * dengan menghapus key user.
     *
     * PENTING: key milik user (custom, github, provider lain) TIDAK BOLEH
     * disentuh. Versi sebelumnya mengosongkan SETIAP provider yang punya key
     * lewat setKey(id, ''), dan itu menghapus key user secara permanen.
     */
    await X.setKey('gemini', '');
    await X.setKey('anthropic', '');
    await AS().loadKeys();

    // Provider aktif = yang tidak punya key. Fallback ke 'gemini' kalau
    // semua provider ternyata punya key (keadaan tanpa-key tidak mungkin).
    const tanpaKey = AS().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
    await s.applySettings({ models: { activeProvider: tanpaKey } });
    await s.reloadSettings();
    await AS().loadKeys();

    // Paksa store AI memakai provider tanpa key itu: init() akan memindahnya
    // kembali ke provider ber-key kalau dibiarkan memilih sendiri.
    A.store.setState({ provider: tanpaKey, model: '' });
    AS().setModel?.(tanpaKey);
    localStorage.removeItem('zephyr.ai.sessions.v1');
    // Jalur agen yang diuji: mode 'chat' yang terbawa dari uji lama tidak
    // menyalakan agentBusy (lihat catatan di bukaAi).
    localStorage.removeItem('zephyr.ai.mode');
    AS().setAgentMode('agent');
    AS().sessions.slice().forEach(x => AS().deleteChat(x.id));
    await AS().loadKeys();
    // Simpan baseUrl asli SEBELUM ditimpa mock. Harness ini pernah menulis
    // http://127.0.0.1:8098 ke settings.json dan tidak pernah mengembalikannya,
    // sehingga provider user menunjuk ke server uji dan chat gagal 401.
    window.__ZV9_ORIG_PROVIDERS__ = JSON.parse(JSON.stringify(
      s.settings.models?.providers ?? {}));
    await s.applySettings({ models: { providers: {
      gemini:    { baseUrl: 'http://127.0.0.1:${MOCK}' },
      openai:    { baseUrl: 'http://127.0.0.1:${MOCK}/v1' },
      anthropic: { baseUrl: 'http://127.0.0.1:${MOCK}' },
    } } });
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'reset';
  `);
  await sleep(500);

  // 笏笏笏笏笏笏笏笏笏 V1: dropdown model = logo + nama; provider 竊・baseUrl 笏笏笏笏笏笏笏笏笏
  const v1 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Pasang key mock untuk gemini lebih dulu.
       *
       * Menu provider hanya menampilkan provider yang punya key, dan provider
       * ber-key di mesin ini bisa cuma local/custom yang masing-masing punya
       * SATU model 窶・tidak cukup untuk membuktikan tingkat kedua dropdown.
       * Uji V2 mengosongkan key ini lagi sebelum memeriksa badge oranye.
       */
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(250);

      await bukaAi();
      /*
       * Buka menu model 窶・tapi hanya kalau belum terbuka.
       *
       * Tombolnya adalah toggle: kalau modelMenuOpen masih true dari uji
       * sebelumnya, klik justru MENUTUP menu dan daftar provider kosong.
       */
      if (!q('[data-testid="ai-model-menu"]')) {
        await klik('[data-testid="ai-model-btn"]');
        await wait(400);
      }
      const menu = q('[data-testid="ai-model-menu"]');
      /*
       * Daftar model = SATU daftar datar, tanpa judul grup provider.
       *
       * ModelSelector dulu menggambar provider sebagai grup yang bisa dilipat
       * (data-group + aria-expanded); bentuk itu sudah tidak ada - setiap baris
       * membawa data-model-item + data-provider sendiri. Uji yang mencari
       * data-group karena itu selalu membaca nol baris dan menyimpulkan "tidak
       * ada provider ber-key" padahal menunya penuh.
       *
       * NB: JANGAN pakai backtick di komentar dalam blok halaman ini - bloknya
       * sendiri berada di dalam template literal, backtick menutupnya lebih awal
       * dan seluruh skrip mati dengan "missing ) after argument list".
       */
      const providerRows = [...new Set(qa('[data-model-item]').map(el => el.dataset.provider))]
        .map((p) => {
          const el = q('[data-model-item][data-provider="' + p + '"]');
          return {
            provider: p,
            nama: el?.querySelector('.ai-mi-tag')?.textContent ?? p,
            logo: el?.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? null,
            terbuka: true,
          };
        });
      /*
       * Pilih provider yang punya model terbanyak, bukan yang pertama.
       *
       * Katalog memuat provider dengan satu model saja, dan urutan barisnya
       * bergantung key yang ada di mesin ini. Uji ini memeriksa daftar model
       * milik satu provider, jadi provider bertenaga satu model tidak bisa
       * membuktikan apa pun.
       */
      const hitungPer = {};
      for (const el of qa('[data-model-item]')) {
        hitungPer[el.dataset.provider] = (hitungPer[el.dataset.provider] ?? 0) + 1;
      }
      const pilihProvider = (providerRows.find((x) => x.provider === 'gemini')
        ?? providerRows.find((x) => x.provider === 'openai')
        ?? providerRows.slice().sort((a, b) => hitungPer[b.provider] - hitungPer[a.provider])[0])?.provider;
      if (!pilihProvider) {
        return JSON.stringify({
          err: 'tidak ada provider ber-key',
          jumlahProvider: providerRows.length,
        });
      }
      // Hanya model milik provider yang dipilih.
      const items = qa('[data-model-item]')
        .filter(el => el.dataset.provider === pilihProvider)
        .map(el => ({
        model: el.dataset.modelItem,
        provider: el.dataset.provider,
        baseUrl: el.dataset.baseurl,
        // logo = SVG dengan aria-label brand di dalam baris
        logo: el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? null,
        nama: el.querySelector('.ai-mi-name')?.textContent ?? '',
      }));
      const sebelum = {
        model: q('[data-testid="ai-model-btn"]').dataset.model,
        provider: q('[data-testid="ai-model-btn"]').dataset.provider,
      };
      const modelPertama = items[0]?.model;
      if (!modelPertama) return JSON.stringify({ err: 'provider tanpa model' });
      await klik('[data-model-item="' + modelPertama + '"]');
      await wait(600);
      const sesudah = {
        model: q('[data-testid="ai-model-btn"]').dataset.model,
        provider: q('[data-testid="ai-model-btn"]').dataset.provider,
        judul: q('[data-testid="ai-model-btn"]').getAttribute('title'),
        disk: (await X.settingsFromDisk()).models.activeProvider,
      };
      /*
       * Tidak ada langkah "kembalikan ke provider semula": provider awal bisa
       * saja provider TANPA key (mis. anthropic) yang barisnya memang tidak
       * pernah muncul di menu, jadi mengkliknya hanya menggantung. Tiap uji
       * berikutnya menetapkan providernya sendiri lewat setModel().
       */
      return JSON.stringify({
        adaMenu: !!menu, providerRows, items, sebelum, sesudah,
        providerDibuka: pilihProvider,
        katalog: A.catalog().length,
        jumlahProviderKatalog: P && P.PROVIDER_COUNT ? P.PROVIDER_COUNT : null,
        akhir: q('[data-testid="ai-model-btn"]').dataset.model,
      });
    `),
  );
  // Kalau blok di halaman mengembalikan {err}, tampilkan apa adanya — tanpa ini
  // kegagalan muncul sebagai TypeError yang tidak informatif.
  if (v1.err) {
    check('V1', false, `dropdown dua tingkat gagal di halaman: ${v1.err} (provider ber-key: ${v1.jumlahProvider ?? 0})`);
    /*
     * Berhenti di sini, jangan lanjut.
     *
     * Sisa uji membaca v1.providerRows / v1.items; kalau blok di halaman menyerah
     * lebih awal, field itu undefined dan baris berikutnya melempar TypeError
     * yang MENUTUPI sebab aslinya (dulu: "Cannot read properties of undefined
     * (reading 'length')" padahal masalahnya tidak ada provider ber-key).
     */
    const lulusAwal = results.filter((r) => r.ok).length;
    console.log(`\n== ${lulusAwal}/${results.length} lulus ==`);
    cdp.close();
    if (mock) mock.kill();
    restoreSettings();
    restoreSecrets();
    // `return` wajib: keluarBersih hanya menyetel exit code + menutup handle,
    // jadi tanpa ini eksekusi LANJUT ke blok V2.. dan pecah dengan
    // "Cannot read properties of undefined (reading 'length')" — pesan yang
    // menyesatkan, karena sebab sebenarnya (tidak ada provider ber-key) sudah
    // dicetak persis di baris sebelumnya.
    return keluarBersih(1);
  }
  const semuaAdaLogo = (v1.items ?? []).every((x) => x.logo && x.nama.length > 0);
  /*
   * Yang harus punya logo adalah BARIS MODEL, bukan "provider".
   *
   * Daftar ini datar: tiap baris membawa logonya sendiri, dan tidak ada judul
   * provider tempat logo provider digambar. Baris provider yang dirakit di atas
   * hanya memakai logo dari baris pertamanya, jadi cukup dipakai sebagai info;
   * kegagalan nyata adalah baris model tanpa logo atau tanpa nama.
   */
  check(
    'V1',
    v1.adaMenu &&
      /*
       * Hanya provider ber-key yang muncul. Batas atasnya bukan angka tetap
       * (katalog punya puluhan provider, tapi yang ber-key di mesin ini bisa
       * dihitung sebelah tangan): cukup pastikan semua baris berasal dari
       * provider yang punya key.
       */
      v1.providerRows.length > 0 &&
      v1.items.length >= 9 &&
      semuaAdaLogo &&
      v1.items.every((x) => x.provider === v1.providerDibuka) &&
      v1.sesudah.provider === v1.providerDibuka &&
      v1.sesudah.disk === v1.providerDibuka,
    `daftar datar: ${v1.providerRows.length} provider ber-key (${v1.providerRows.map((x) => x.provider).join(', ')}) - ${v1.items.length} model ${v1.items[0]?.provider ?? '?'}, semua berlogo; pilih model pertama: provider tombol=${v1.sesudah.provider}, provider disk=${v1.sesudah.disk}, judul "${v1.sesudah.judul}"`,
  );

  // 笏笏笏笏笏笏笏笏笏 V2: tanpa key 竊・status oranye + kirim diblokir, tidak crash 笏笏笏笏笏笏笏笏笏
  const v2 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Arahkan provider aktif ke provider TANPA key.
       *
       * aiStore.init() memindahkan provider aktif ke provider ber-key pertama
       * kalau provider aktif tidak punya key, jadi badge hanya oranye selama
       * provider aktif memang belum punya key. V1 meninggalkan provider
       * ber-key terpilih, jadi keadaan itu harus dipulihkan di sini.
       */
      await X.setKey('gemini', '');
      await X.setKey('anthropic', '');
      await AS().loadKeys();
      await wait(200);
      const tanpaKey = AS().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
      /*
       * Provider DAN model harus dipindah bersama.
       *
       * aiStore.init() memilih ulang provider dari daftar key saat store
       * dibaca; menyetel provider saja meninggalkan model milik provider lama,
       * dan findModel() memakai model itu untuk menentukan provider 窶・jadi
       * store kembali ke provider ber-key dan badge tetap hijau.
       */
      A.store.setState({ provider: tanpaKey, model: '' });
      await wait(250);
      await AS().loadKeys();
      await wait(200);

      /*
       * Chat dikosongkan dulu: V1 mengirim pesan untuk menguji markdown, dan
       * sesi yang sama dipakai di sini 窶・tanpa ini jumlah pesan bukan nol
       * sehingga "chat tetap kosong" tidak bisa dibuktikan.
       */
      A.store.getState().newChat();
      await wait(350);

      /*
       * Yang dibaca di sini HANYA elemen yang benar-benar ada.
       *
       * Badge ai-keystate dan tombol ai-goto-settings sudah DIHAPUS dari UI
       * bersama "fase 17 - full English UI" (commit 35d4d6b; lihat
       * git log -S "ai-keystate" -- src/components - yang tersisa hanya
       * kelasnya di ai.css). Pembacaan lama (el.dataset.haskey pada elemen yang
       * tidak ada) melempar "Cannot read properties of null (reading 'dataset')"
       * dan mematikan seluruh skrip sebelum satu pun kesimpulan tercetak.
       *
       * Penggantinya menguji hal yang sama lewat jalur yang masih nyata: kirim
       * harus DITOLAK (pesan tidak bertambah, pending tidak nyala) dan
       * penolakan itu harus TERLIHAT user lewat toast. Toast yang ada di DOM
       * tapi tersembunyi (display none / opacity 0 / tinggi 0) tidak memberi
       * tahu apa pun - itu gagal, bukan lulus.
       */
      const bacaToast = () => {
        const el = q('[data-testid="ai-toast"]');
        if (!el) return { ada: false, teks: '', tampil: false };
        const cs = getComputedStyle(el);
        return {
          ada: true,
          teks: el.textContent ?? '',
          tampil:
            cs.display !== 'none' &&
            cs.visibility !== 'hidden' &&
            Number(cs.opacity) > 0 &&
            el.getBoundingClientRect().height > 0,
        };
      };
      const pesanSebelum = msgs().length;
      const providerSebelum = AS().provider;
      const providerBerKey = AS().keys.filter((k) => k.hasKey).map((k) => k.provider);

      await kirim('halo tanpa key');
      await wait(900);
      const t = bacaToast();
      return JSON.stringify({
        toast: t.teks,
        toastAda: t.ada,
        toastTampil: t.tampil,
        pesanSebelum,
        pesan: msgs().length,
        pending: AS().pending,
        providerSebelum,
        provider: AS().provider,
        providerBerKey,
        model: AS().model,
        errors: window.__ZEPHYR_ERRORS__.length,
      });
    `),
  );
  /*
   * Dua bentuk tolakan yang sah - keduanya penolakan ramah, bukan crash:
   *   "No key for X - switched to Y, which has one"  (ada provider ber-key lain)
   *   "Add an API key for X in Settings, or pick a provider that already has one"
   */
  const toastV2 = v2.toast ?? '';
  const bentukPindah = /No key for .+ switched to .+, which has one/i.test(toastV2);
  const bentukIsiKey = /Add an API key for .+ in Settings/i.test(toastV2);
  check(
    'V2',
    v2.toastAda &&
      v2.toastTampil &&
      (bentukPindah || bentukIsiKey) &&
      v2.pesan === v2.pesanSebelum &&
      !v2.pending &&
      v2.errors === 0 &&
      // Kalau pesannya bentuk "pindah", provider memang harus sudah pindah.
      (!bentukPindah || v2.provider !== v2.providerSebelum),
    `tanpa key: kirim ditolak (chat tetap ${v2.pesan} pesan, pending=${v2.pending}), toast tampil "${toastV2}", provider ${v2.providerSebelum} -> ${v2.provider} (ber-key: ${v2.providerBerKey.join(', ') || 'tidak ada'}), 0 console error`,
  );

  // 笏笏笏笏笏笏笏笏笏 V3: dengan key 竊・streaming kata per kata + markdown bold 笏笏笏笏笏笏笏笏笏
  const v3 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Pindah provider aktif ke gemini.
       *
       * Urutannya penting: key mock dipasang DULU supaya providernya muncul di
       * menu, lalu setModel() memindahkan provider + model sekaligus 窶・jalur
       * yang sama dipakai menu saat user memilih model. Uji V2 meninggalkan
       * provider aktif pada provider TANPA key, jadi tanpa langkah ini pesan
       * V3 dikirim ke provider itu dan mock tidak pernah dipanggil.
       */
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(250);
      /*
       * Jalur AGEN - satu-satunya jalur sejak mode chat pensiun.
       *
       * Di jalur ini mock akan meminta tool lebih dulu untuk prompt biasa, dan
       * bubble assistant hanya berisi baris "Write TODO" + ringkasan langkah;
       * di sana tidak ada teks model yang bertambah bertahap, sehingga V3 lama
       * mengukur angka yang memang tidak pernah bergerak. Karena itu prompt
       * memuat penanda TEXTONLY (mock v7): jawaban murni TEKS panjang, jeda
       * 400 ms per token - jadi aliran kata-per-kata benar-benar terjadi dan
       * bisa diukur.
       */
      await tungguProvider('gemini');
      await A.store.getState().setModel('gemini-2.0-flash', 'gemini');
      await wait(400);
      await tungguProvider('gemini');
      const providerKini = q('[data-testid="ai-model-btn"]').dataset.provider;
      /*
       * Badge ai-keystate sudah tidak ada di UI (dihapus di 35d4d6b; yang
       * tersisa hanya kelasnya di ai.css). Yang diukur sama dengan nilainya -
       * "provider aktif punya key" - dibaca dari store, bukan dari elemen yang
       * tidak ada lagi.
       */
      const badgeOk = AS().hasKey(AS().provider) ? '1' : '0';

      /*
       * Chat kosong dulu: jejak panjang teks mengukur pertumbuhan selama
       * streaming, dan sesi yang sudah berisi jawaban uji sebelumnya membuat
       * pembacaan pertama langsung di angka penuh (naik 0x).
       */
      A.store.getState().newChat();
      await wait(350);

      /*
       * Paksa provider + model tepat SEBELUM kirim.
       *
       * newChat() dan langkah sebelumnya bisa membuat aiStore memilih ulang
       * provider dari daftar key (perilaku auto-switch aplikasi), jadi provider
       * yang disetel di awal blok belum tentu masih berlaku saat tombol Kirim
       * ditekan - dan kalau begitu, pesan uji berangkat ke provider lain dan
       * mock tidak pernah dipanggil (V3 lalu merah padahal aplikasinya benar).
       * memanggil tungguProvider('gemini') menunggu state-nya benar-benar
       * bertahan, bukan cuma ditulis sekali (applySettings menulis state lalu
       * MENJADWALKAN flush; sinkronProvider di store.ts bisa mengembalikannya).
       */
      await tungguProvider('gemini');
      await A.store.getState().setModel('gemini-2.0-flash', 'gemini');
      await wait(400);
      await tungguProvider('gemini');
      const providerSaatKirim = A.store.getState().provider;

      /*
       * Yang diukur adalah panjang teks bubble assistant TERAKHIR di DOM
       * (.ai-msg.is-assistant .ai-body) - itulah yang tumbuh saat potongan
       * demi potongan tiba. Membacanya dari state store juga bisa, tetapi DOM
       * adalah yang benar-benar dilihat orang; selisih satu render di state
       * justru membuat jejak terlihat rata padahal tampilannya mengalir.
       */
      const bodyAkhir = () => {
        const arr = document.querySelectorAll('.ai-msg.is-assistant .ai-body');
        return arr.length ? arr[arr.length - 1] : null;
      };
      const jejak = [];
      await kirim('TEXTONLY tolong tulis jawaban panjang');
      for (let i = 0; i < 14; i++) {
        await wait(280);
        const el = bodyAkhir();
        jejak.push({
          n: (el?.textContent ?? '').length,
          cuplik: (el?.textContent ?? '').slice(0, 24),
          typing: q('[data-testid="ai-typing"]') !== null,
        });
      }
      await tungguSelesai();
      /*
       * Pesan assistant dibaca dari permukaan yang memegang composer (msgs()),
       * dengan DOM sebagai cadangan: pembacaan lewat activeId saja pernah
       * mengembalikan sesi kosong walau bubble-nya penuh.
       */
      const pesanSesi = msgs();
      const akhir = [...pesanSesi].reverse().find(x => x.role === 'assistant');
      const elAkhir = bodyAkhir();
      const teksDom = (elAkhir?.textContent ?? '').trim();
      return JSON.stringify({
        badgeOk, jejak, providerKini, providerSaatKirim,
        akhirTeks: (akhir?.content ?? '') || teksDom,
        teksDom,
        // Ringkasan daftar pesan: membuktikan PEMBACAAN jejak menunjuk pesan
        // yang benar, bukan sisa percakapan sebelumnya.
        ringkas: pesanSesi.map((m) => m.role + ' #' + m.id.slice(-4) + ' n=' + (m.content ?? '').length),
        akhirStreaming: !!akhir?.streaming,
        bold: elAkhir?.querySelector('strong')?.textContent ?? null,
        html: elAkhir?.innerHTML.slice(0, 90) ?? '',
        role: akhir?.role ?? null,
        errors: window.__ZEPHYR_ERRORS__.length,
      });
    `),
  );
  const naik = v3.jejak.filter((x, i) => i > 0 && x.n > v3.jejak[i - 1].n).length;
  const adaTyping = v3.jejak.some((x) => x.typing);
  const logV3 = await mockLog();
  const gemReq = logV3.filter((e) => e.kind === 'gemini');
  check(
    'V3',
    v3.badgeOk === '1' &&
      naik >= 3 &&
      adaTyping &&
      !v3.akhirStreaming &&
      v3.akhirTeks.includes('Satu dua tiga empat') &&
      v3.akhirTeks.includes('Selesai - teks saja') &&
      v3.bold === 'teks' &&
      gemReq.length >= 1 &&
      gemReq[0].headers.xGoog === 'MOCK-KEY-GEMINI-1234' &&
      v3.errors === 0,
    `streaming bertahap di jalur agen: panjang teks bubble naik ${naik}x (${v3.jejak.map((x) => x.n).join(', ')}), cuplikan "${v3.jejak[3]?.cuplik ?? ''}", pesan: ${v3.ringkas.join(' | ')}; indikator "mengetik..." tampil; akhir="${v3.akhirTeks.slice(0, 40)}"; markdown <strong>=${JSON.stringify(v3.bold)}; html="${v3.html}"; adapter gemini dipanggil ${gemReq.length}x dengan header x-goog-api-key (key benar sampai ke provider, tidak lewat frontend)` ,
  );

  // 笏笏笏笏笏笏笏笏笏 V4: attach file aktif 竊・jawaban mengutip isinya 笏笏笏笏笏笏笏笏笏
  const v4 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Buat berkas kerja, tulis penandanya, lalu buka panel AI.
       *
       * Urutannya penting: newUntitled() SAAT tab Chat aktif tidak membuka
       * berkas apa pun di editor. Berkas dibuka dulu (supaya tab editor berisi
       * penanda), baru tab Chat diaktifkan lewat bukaAi() - composer tab Chat
       * hanya ada saat tab itu aktif. Penanda ditulis ulang SETELAH panel
       * dibuka (lihat tabAktif di bawah) karena yang dilampirkan adalah isi
       * tab aktif saat Kirim ditekan.
       */
      s.newUntitled();
      await wait(500);
      await bukaAi();
      AS().setAttachActive(true);
      await wait(250);
      /*
       * Jalur AGEN (bukan chat - mode itu sudah pensiun, setAgentMode('chat')
       * kini dikoersi ke 'agent'). Blok lampiran berkas aktif dulu hanya ada di
       * cabang chat send(), jadi di mode agen setelan "Send active file to
       * agent" tidak berpengaruh sama sekali dan chip lampiran tak pernah
       * muncul; sejak perbaikan, jalur agen memakai blok yang sama. Uji ini
       * sekarang membuktikan itu di jalur yang benar-benar dipakai orang.
       *
       * Prompt memuat ECHOFILE (mock mengutip blok berkas terlampir) DAN
       * TEXTONLY (mock tidak minta tool), jadi bubble assistant berisi kutipan
       * isi berkas - bukan baris "Write TODO" + ringkasan langkah.
       */
      /*
       * Berkas uji ditempel ke tab yang SAMA dengan file aktif yang dibuka.
       *
       * Sumber kebenaran "file aktif" di app adalah TAB EDITOR YANG AKTIF
       * (aiStore mencari tab dengan id = activeTabId), dan app hanya punya satu
       * tab editor. Padahal composer tab Chat baru ada saat tab Chat aktif -
       * jadi saat Kirim ditekan, tab aktif adalah tab Chat, dan tanpa isi di
       * tab itu lampiran yang terkirim kosong (V4 gagal begitu: tidak ada
       * penanda, tidak ada chip). Isi berkas uji ditulis ke tab
       * yang aktif SETELAH panel dibuka, supaya yang dilampirkan memang file
       * yang sedang dilihat user. catatan: backtick tidak boleh dipakai di
       * dalam blok ini.
       */
      const tabAktif = () => {
        const st = S.getState();
        return st.tabs.find((t) => t.id === st.activeTabId) ?? st.tabs[st.tabs.length - 1];
      };
      const tab = tabAktif();
      S.getState().updateTabContent(tab.id, 'ZEPHYR-ATTACH-MARKER-42\\nbaris kedua file uji');
      await wait(250);
      /*
       * Tombol ai-attach SUDAH TIDAK ADA di UI.
       *
       * Tidak ada satu pun komponen yang memanggil setAttachActive lagi;
       * lampiran file aktif kini diatur lewat Settings -> agents.attachActiveFile
       * (aiStore membaca setelan itu saat init) dan yang tersisa di komposer
       * hanyalah chip di bubble (ChatMessage: ai-attach-chip). Membaca
       * q('[data-testid="ai-attach"]') mengembalikan null lalu melempar
       * "Cannot read properties of null (reading 'getAttribute')" dan mematikan
       * skrip sebelum V4/V5 sempat dinilai. Perilaku yang diuji tetap sama dan
       * tetap diukur: file aktif ikut terkirim, kelihatan dari chip di bubble
       * dan dari jawaban yang mengutip isi berkasnya.
       */
      const tombolOn = 'dihapus-dari-ui';

      await kirim('ringkas file ini ECHOFILE TEXTONLY');
      await tungguSelesai();

      const daftar = msgs();
      const user = daftar.filter(m => m.role === 'user').pop();
      const bot = daftar.filter(m => m.role === 'assistant').pop();
      const chip = q('[data-testid="ai-attach-chip"]')?.textContent ?? '';
      AS().setAttachActive(false);
      return JSON.stringify({
        tombolOn, chip,
        attached: user?.attached ?? null,
        jawaban: bot?.content ?? '',
        namaTab: tab.name,
      });
    `),
  );
  const logV4 = await mockLog();
  const reqAttach = [...logV4].reverse().find((e) => e.kind === 'gemini');
  check(
    'V4',
    // tombolOn dibuang: tombol ai-attach sudah tidak ada di UI (lihat catatan
    // di blok V4). Sisa syaratnya justru bukti yang lebih kuat - prompt memuat
    // isi berkas DAN jawaban mengutipnya.
    !!v4.attached &&
      v4.jawaban.includes('ZEPHYR-ATTACH-MARKER-42') &&
      reqAttach.promptHead.includes('active working context') &&
      reqAttach.promptHead.includes(v4.namaTab) &&
      v4.chip.includes(v4.namaTab),
    `lampiran terkirim: prompt memuat path "${v4.attached?.path ?? '(tidak ada lampiran)'}" + instruksi konteks ("Treat this file as the active working context"); jawaban mengutip isi file ("..."${v4.jawaban.slice(-30).trim()}"); chip di bubble = "${v4.chip}"`,
  );

  // 笏笏笏笏笏笏笏笏笏 V5: ganti ke Claude 竊・adapter anthropic; tanpa key = tolak ramah 笏笏笏笏笏笏笏笏笏
  const v5 = JSON.parse(
    await cdp.runAsync(`
      /*
       * 1) tanpa key anthropic -> penolakan ramah, bukan crash.
       *
       * Provider dipindahkan LEBIH DULU, baru model dipilih: setModel() tanpa
       * argumen kedua mengikuti provider yang sedang aktif, jadi memanggilnya
       * saat provider masih gemini hanya mengganti model di gemini.
       */
      await X.setKey('anthropic', '');
      await AS().loadKeys();
      await wait(220);
      /*
       * Provider dipaksa + dipastikan BERTAHAN sebelum model dipilih (lihat
       * tungguProvider). Dulu applySettings diikuti langsung setModel, dan
       * panel bisa masih/balik ke provider lama - uji lalu mengukur provider
       * yang salah dan gagal bukan karena aplikasinya.
       */
      await tungguProvider('anthropic');
      await A.store.getState().setModel('claude-sonnet-4-5', 'anthropic');
      await wait(450);
      // setModel juga menulis activeProvider ke settings; pastikan tidak
      // tergeser lagi sebelum prasyarat dicatat.
      await tungguProvider('anthropic');
      /*
       * Prasyarat dicatat sebelum kirim.
       *
       * Uji ini mengandaikan provider yang aktif benar-benar anthropic TANPA key.
       * Kalau tidak, "kirim" jalan lewat provider lain yang punya key (mock
       * gemini), tidak ada penolakan, tidak ada request anthropic - dan yang
       * gagal bukan aplikasinya, melainkan prasyarat ujinya. Tanpa catatan ini
       * hasilnya cuma "toast kosong" tanpa sebab.
       */
      const provSebelumKirim =
        AS().provider + '/' + AS().model + '/' + (AS().hasKey(AS().provider) ? 'ada-key' : 'tanpa-key');
      // Badge ai-keystate sudah tidak ada di UI (35d4d6b): nilai yang sama
      // dibaca dari store - provider aktif punya key atau tidak.
      const badgeTanpaKey = AS().hasKey(AS().provider) ? '1' : '0';
      await kirim('halo claude');
      /*
       * Toast dipantau berulang, bukan sekali baca.
       *
       * Percobaan sebelumnya membaca satu kali di 800ms dan mendapat string
       * kosong, padahal V2 - tombol dan jalur yang sama - mendapat toast berisi
       * "No key for Google Gemini...". Satu bacaan tidak bisa membedakan "toast
       * tidak pernah muncul" dari "toast muncul lebih lambat atau sudah hilang",
       * jadi jejaknya direkam seluruhnya: kalau semua sampel kosong, barulah
       * benar-benar tidak ada penolakan yang terlihat oleh user.
       */
      const jejakToast = [];
      for (let i = 0; i < 6; i++) {
        await wait(250);
        jejakToast.push((q('[data-testid="ai-toast"]')?.textContent ?? '').slice(0, 60));
      }
      const toastTanpaKey = jejakToast.find((t) => t.length > 0) ?? '';
      const providerSaatTolak = AS().provider;
      const pesanSebelum = msgs().length;
      // 2) dengan key -> adapter anthropic (x-api-key + /v1/messages) jalan
      await X.setKey('anthropic', 'MOCK-KEY-ANTHROPIC-9876');
      await AS().loadKeys();
      await wait(200);
      // Sama seperti kaki pertama: provider dipastikan bertahan, dan model
      // disebut dengan provider-nya supaya findModel tidak mencocokkan silang
      // ke provider yang sedang aktif.
      await tungguProvider('anthropic');
      await A.store.getState().setModel('claude-sonnet-4-5', 'anthropic');
      await wait(350);
      await tungguProvider('anthropic');
      await kirim('halo claude');
      await tungguSelesai();
      const bot = msgs().filter(m => m.role === 'assistant').pop();

      // 3) uji error ramah: provider jawab 401
      await kirim('coba ERR401');
      await tungguSelesai();
      /*
       * Jalur agen menulis kegagalan provider ke ISI pesan
       * ("Agent stopped: Provider: API key salah/kadaluarsa (401) ..."), bukan
       * ke field msg.error - field itu dipakai jalur chat yang kini pensiun.
       * Membaca m.error saja membuat V5 selalu melaporkan error kosong padahal
       * pesan ramahnya benar-benar tampil di bubble. Dua-duanya dibaca.
       */
      const msgsSetelah401 = msgs();
      const err = msgsSetelah401.filter(m => m.error || /Agent stopped/i.test(m.content ?? '')).pop();
      const errTeks = err?.error ?? err?.content ?? '';

      await X.setKey('anthropic', '');
      await AS().loadKeys();
      return JSON.stringify({
        badgeTanpaKey, toastTanpaKey, pesanSebelum, jejakToast, providerSaatTolak,
        provSebelumKirim,
        jawaban: bot?.content ?? '',
        model: bot?.model ?? null,
        error: errTeks,
        errUi: q('[data-testid="ai-error"]')?.textContent ?? '',
      });
    `),
  );
  const logV5 = await mockLog();
  const anth = logV5.filter((e) => e.kind === 'anthropic');
  /*
   * Permintaan yang diperiksa adalah yang MEMBAWA pesan uji ini.
   *
   * Versi sebelumnya memakai anth[0] dan melaporkan max_tokens=undefined,
   * padahal adapter Rust selalu menyetelnya (adapters/anthropic.rs:135). Artinya
   * entri pertama bukan percakapan yang diuji - bisa panggilan lain (mis. judul
   * sesi) atau sisa permintaan langkah sebelumnya. Memilih entri lewat isi
   * pesannya membuat uji mengukur request yang benar-benar dibuatnya.
   */
  const anthUtama =
    anth.find((e) => JSON.stringify(e.body ?? {}).includes('halo claude')) ?? anth[0];
  const anthRingkas = anth.map(
    (e) =>
      (e.body && e.body.max_tokens ? 'max=' + e.body.max_tokens : 'tanpa-max') +
      '/' +
      (e.promptHead ?? '').slice(0, 16).replace(/\s+/g, ' '),
  );
  check(
    'V5',
    v5.badgeTanpaKey === '0' &&
      // Pesan bisa berbentuk "Isi API key X" atau "X belum ada key - pindah
      // ke Y" (kalau ada provider lain yang sudah ber-key). Keduanya sama-sama
      // menandakan penolakan ramah, bukan crash.
      /Anthropic/i.test(v5.toastTanpaKey) &&
      /key/i.test(v5.toastTanpaKey) &&
      anth.length >= 1 &&
      anthUtama.headers.xApiKey === 'MOCK-KEY-ANTHROPIC-9876' &&
      anthUtama.headers.anthropicVersion === '2023-06-01' &&
      anthUtama.body.max_tokens > 0 &&
      v5.jawaban.includes('uji') &&
      v5.model === 'claude-sonnet-4-5' &&
      /401/.test(v5.error ?? '') &&
      /API key salah/i.test(v5.error ?? ''),
    `tanpa key: provider sebelum kirim = ${v5.provSebelumKirim} (badge ${v5.badgeTanpaKey}) -> toast "${v5.toastTanpaKey}" (jejak: ${JSON.stringify(v5.jejakToast)}, provider sesudah ${v5.providerSaatTolak}, chat ${v5.pesanSebelum} pesan); dengan key: POST /v1/messages dengan header ${JSON.stringify(anthUtama?.headers ?? {})} + max_tokens=${anthUtama?.body?.max_tokens} -> jawaban "${(v5.jawaban ?? '').slice(0, 30)}" model ${v5.model}; permintaan anthropic: ${anthRingkas.join(' | ') || '(tidak ada)'}; HTTP 401 jadi pesan ramah "${(v5.error ?? '').slice(0, 60)}..."`,
  );

  // 笏笏笏笏笏笏笏笏笏 V6: Jalankan di Terminal + konfirmasi perintah destruktif 笏笏笏笏笏笏笏笏笏
  const v6 = JSON.parse(
    await cdp.runAsync(`
      // kembali ke gemini (punya key mock) 窶・provider dulu, baru model
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await wait(200);
      await S.getState().applySettings({ models: { activeProvider: 'gemini' } });
      await wait(300);
      /*
       * Model disebut BERSAMA provider-nya, dan provider ditunggu dulu.
       *
       * Versi sebelumnya memanggil setModel('gemini-3.6-flash') tanpa provider:
       * id itu tidak ada lagi di katalog, findModel tidak menemukan apa pun, dan
       * provider aktif tetap provider sebelumnya (anthropic, sisa V5) sehingga
       * permintaan V6 tidak pernah sampai ke mock gemini - jawabannya tidak
       * datang, tombol "Run in Terminal" tidak pernah muncul, dan uji melempar
       * "elemen tidak muncul" yang tidak menjelaskan sebabnya.
       */
      await tungguProvider('gemini');
      await A.store.getState().setModel('gemini-2.0-flash', 'gemini');
      await wait(450);
      await tungguProvider('gemini');

      // 1) jawaban dengan fenced bash -> tombol muncul
      /*
       * Prompt memakai TEXTONLY.
       *
       * Di jalur agen, jawaban ber-fenced bash dari model langsung diterjemahkan
       * jadi TOOL CALL run_command lalu dieksekusi; pesan assistant terakhir
       * bukan lagi teks berisi blok bash berpagar, melainkan baris ringkasan aplikasi
       * ("Selesai - 1 langkah dijalankan"), sehingga lastCommand null dan tombol
       * "Jalankan di Terminal" tidak pernah muncul - harness lalu mati dengan
       * "elemen tidak muncul" sebelum V7-V11 dinilai. TEXTONLY memaksa mock
       * menjawab teks murni (tanpa tool call), persis kasus yang UI ini layani:
       * model menulis perintah di jawaban, user yang memutuskan menjalankannya.
       */
      await kirim('kasih perintah BASHCMD TEXTONLY');
      await tungguSelesai();
      const tombolBar = !!q('[data-testid="ai-run-last"]');
      const tombolBlok = !!q('[data-testid="ai-run-code"]');
      const cmdBar = q('.ai-action-cmd')?.textContent ?? '';

      // siapkan pane shell dulu supaya perintah punya tujuan yang jelas
      window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
      const paneId = await T.getState().addPane('shell');
      await wait(2500);
      T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
      await wait(200);

      await klik('[data-testid="ai-run-last"]');
      await wait(2500);
      const layar = P.read(paneId, 40);
      const toastKirim = q('[data-testid="ai-toast"]')?.textContent ?? '';

      // 2) perintah destruktif -> dialog konfirmasi, TIDAK langsung jalan
      await kirim('hapus dist RMCMD TEXTONLY');
      await tungguSelesai();
      const cmdDestruktif = A.command(msgs().filter(m => m.role === 'assistant').pop().content);
      await klik('[data-testid="ai-run-last"]');
      await wait(500);
      const dialog = !!q('[data-testid="ai-confirm"]');
      const isiDialog = q('.ai-confirm-cmd')?.textContent ?? '';
      const layarSebelumBatal = P.read(paneId, 40);
      await klik('[data-testid="ai-confirm-no"]');
      await wait(400);
      const dialogSetelahBatal = !!q('[data-testid="ai-confirm"]');

      return JSON.stringify({
        tombolBar, tombolBlok, cmdBar, toastKirim,
        adaOutput: layar.includes('ZEPHYR-RUN-OK'),
        layarEkor: layar.split('\\n').filter(Boolean).slice(-4),
        cmdDestruktif, dialog, isiDialog, dialogSetelahBatal,
        rmTidakJalan: !/rm -rf dist/.test(layarSebelumBatal.replace(/echo[^\\n]*/g, '')),
        destruktifTerdeteksi: A.destructive('rm -rf dist'),
        amanTidakTerdeteksi: A.destructive('echo ZEPHYR-RUN-OK'),
        paneId,
      });
    `, 90000),
  );
  check(
    'V6',
    v6.tombolBar &&
      v6.tombolBlok &&
      v6.adaOutput &&
      /dikirim ke terminal|sent to the terminal/i.test(v6.toastKirim) &&
      v6.dialog &&
      v6.isiDialog.includes('rm -rf dist') &&
      !v6.dialogSetelahBatal &&
      v6.rmTidakJalan &&
      v6.destruktifTerdeteksi === true &&
      v6.amanTidakTerdeteksi === false,
    `tombol "Jalankan di Terminal" muncul (bar: ${v6.tombolBar}, blok: ${v6.tombolBlok}); klik -> shell menjalankan perintah, layar: ${JSON.stringify(v6.layarEkor)}; toast kirim = "${v6.toastKirim}"; perintah destruktif "${v6.cmdDestruktif}" DITAHAN dialog konfirmasi & batal = tidak dieksekusi (dialog=${v6.dialog}, isiDialog="${v6.isiDialog}", dialogSetelahBatal=${v6.dialogSetelahBatal}, rmTidakJalan=${v6.rmTidakJalan}, deteksi: destruktif=${v6.destruktifTerdeteksi}, aman=${v6.amanTidakTerdeteksi}, pane=${v6.paneId})`,
  );

  // 笏笏笏笏笏笏笏笏笏 V7: cancel streaming benar-benar berhenti 笏笏笏笏笏笏笏笏笏
    const v7 = JSON.parse(
      await cdp.runAsync(`
        /*
         * TEXTONLY: tanpa itu mock MEMINTA tool call lebih dulu dan run masuk
         * keadaan menunggu persetujuan -> agentBusy false, komposer menampilkan
         * Kirim (bukan Stop), dan tombol ai-stop tidak pernah ada. TEXTONLY
         * membuat run benar-benar streaming teks, jadi cancel bisa diukur:
         * panjang bubble harus berhenti bertambah.
         *
         * Klik stop dibuat tidak melempar (tombol?.) - kalau tombol tidak ada,
         * V8-V11 tetap dinilai; adaStop membuktikan keadaannya.
         */
        /*
         * Kiriman V7 memakai TEXTONLY, BUKAN SLOW.
         *
         * Mock mencocokkan SLOW LEBIH DULU daripada TEXTONLY, dan balasan SLOW
         * hanya satu kalimat 20 karakter yang selesai dalam ~1 detik - saat Stop
         * dibaca, komposer sudah kembali menampilkan Kirim, jadi uji melaporkan
         * "panjang 20 -> 20" tanpa ada yang bisa dibatalkan. TEXTONLY memakai
         * jeda 400ms antar token yang sama tetapi jawabannya panjang, sehingga
         * streaming benar-benar masih berjalan saat Stop ditekan.
         */
        await kirim('hitung TEXTONLY');
        await wait(1400);
        const tombolStop = q('[data-testid="ai-stop"]');
        const adaStop = !!tombolStop;
        const busySebelum = AS().agentBusy;
        const sebelum = (msgs().filter(m => m.role === 'assistant').pop()?.content ?? '').length;
        tombolStop?.click();
        await wait(300);
        const tepatSetelah = (msgs().filter(m => m.role === 'assistant').pop()?.content ?? '').length;
        // tunggu jauh lebih lama dari jeda token (400ms): kalau stream benar
        // berhenti, panjang teks TIDAK boleh bertambah lagi
        await wait(3500);
        const jauhSetelah = (msgs().filter(m => m.role === 'assistant').pop()?.content ?? '').length;
        const m = msgs().filter(x => x.role === 'assistant').pop();
        return JSON.stringify({
          adaStop, busySebelum, sebelum, tepatSetelah, jauhSetelah,
          busySesudah: AS().agentBusy,
          streaming: !!m.streaming,
          adaTombolKirim: !!q('[data-testid="ai-send"]'),
          kirim: window.__ZEPHYR_KIRIM_TERAKHIR__ ?? null,
        });
      `),
    );
  check(
    'V7',
    v7.adaStop &&
      v7.busySebelum === true &&
      v7.sebelum > 0 &&
      v7.jauhSetelah === v7.tepatSetelah &&
      v7.busySesudah === false &&
      !v7.streaming &&
      v7.adaTombolKirim,
    `Stop: panjang teks ${v7.sebelum} -> ${v7.tepatSetelah} saat dibatalkan -> tetap ${v7.jauhSetelah} setelah 3.5s (stream mati, bukan cuma UI); agentBusy ${v7.busySebelum} -> ${v7.busySesudah}, tombol Kirim balik, adaStop=${v7.adaStop}; kirim=${JSON.stringify(v7.kirim)}`,
  );

  // 笏笏笏笏笏笏笏笏笏 V8: batas 200 pesan + chat baru bersih 笏笏笏笏笏笏笏笏笏
  const v8 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Sesi yang diisi = sesi PERMUKAAN composer, bukan activeId.
       *
       * app punya dua permukaan (tab Chat '/editor' dan kolom kanan '/') dan
       * activeId hanya salinan permukaan utama. Dulu uji ini mengisi sesi
       * activeId lalu membaca sesi permukaan compose - dua sesi berbeda, jadi
       * angkanya tidak pernah 200. idAwal dibaca dari permukaan yang sama
       * dengan msgs(), supaya yang diisi memang yang diukur.
       */
      const idAwal = sidKirim();
      const sebelum = msgs().length;
      // Isi sesi aktif melewati batas lewat store (tanpa 200 panggilan jaringan).
      const St = window.__ZEPHYR_AI__.store;
      St.setState((st) => ({
        sessions: st.sessions.map(x => x.id === idAwal ? {
          ...x,
          messages: Array.from({ length: 260 }, (_, i) => ({
            id: 'bulk-' + i, role: i % 2 ? 'assistant' : 'user',
            content: 'pesan ' + i, at: Date.now(),
          })).slice(-window.__ZEPHYR_AI__.maxMsgs),
        } : x),
      }));
      await wait(250);
      const setelahIsi = msgs().length;
      const pertama = msgs()[0]?.content ?? '';

      // chat baru harus bersih & jadi sesi aktif (untuk permukaan yang sama)
      const idBaru = AS().newChat(q('[data-testid="ai-view-chat"]') ? 'editor' : '');
      await wait(300);
      const bersih = msgs().length;
      const kosongUi = !!q('[data-testid="ai-empty"]');
      const jumlahSesi = AS().sessions.length;
      return JSON.stringify({
        max: window.__ZEPHYR_AI__.maxMsgs,
        sebelum, setelahIsi, pertama, bersih, kosongUi, jumlahSesi,
        idBeda: idBaru !== idAwal,
        sesiLamaMasihAda: AS().sessions.some(x => x.id === idAwal),
      });
    `),
  );
  check(
    'V8',
    v8.max === 200 &&
      v8.setelahIsi === 200 &&
      v8.pertama === 'pesan 60' &&
      v8.bersih === 0 &&
      v8.kosongUi &&
      v8.idBeda &&
      v8.sesiLamaMasihAda,
    `batas history: 260 pesan \u2192 tersisa ${v8.setelahIsi} (mulai dari "${v8.pertama}", yang tertua dibuang); chat baru = ${v8.bersih} pesan + empty-state tampil, sesi lama tetap tersimpan (${v8.jumlahSesi} sesi)`,
  );

  // 笏笏笏笏笏笏笏笏笏 V9: sesi terakhir direstore setelah reload 笏笏笏笏笏笏笏笏笏
  const tandaRestore = `RESTORE-${Date.now().toString(36)}`;
  await cdp.runAsync(`
    // Tulis satu chat nyata (lewat provider mock) sebagai bahan restore.
    await kirim('tanda ${tandaRestore}');
    await tungguSelesai();
    return msgs().length;
  `);
  const sebelumReload = JSON.parse(
    await cdp.runAsync(`
      return JSON.stringify({
        sesi: AS().sessions.length,
        pesan: msgs().length,
        judul: AS().activeSession()?.title ?? '',
        adaLs: (A.persisted() ?? '').includes('${tandaRestore}'),
        /*
         * Sesi yang harus kembali = sesi permukaan composer.
         *
         * Setelah reload, tab Chat dipulihkan sebagai tab aktif, jadi uji
         * membaca sesi itu - sedangkan activeSession() mengikuti activeId yang
         * bisa saja sesi permukaan lain. Id-nya dicatat sekarang supaya
         * sesudah reload yang dibandingkan sesi yang SAMA, bukan sekadar dua
         * angka kebetulan.
         */
        idPermukaan: sidKirim(),
      });
    `),
  );

  await cdp.send('Page.enable');
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(6000);
  // Reload memutus konteks CDP lama 竊・sambung ulang.
  cdp.close();
  const targets2 = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page2 = pilihJendelaUtama(targets2);
  cdp = await Cdp.connect(page2.webSocketDebuggerUrl);
  cdpTerbuka = cdp;
  for (let i = 0; i < 40; i++) {
    if ((await cdp.eval('typeof window.__ZEPHYR_AI__')) !== 'undefined') break;
    await sleep(300);
  }

  const v9 = JSON.parse(
    await cdp.runAsync(`
      await wait(600);
      /*
       * Baca sesi yang DICATAT sebelum reload, bukan sesi yang kebetulan aktif.
       *
       * Setelah reload, app memulihkan activeIds dari localStorage - tetapi
       * uji tidak boleh bergantung pada urutan pemulihan itu: yang dibuktikan
       * adalah "sesi X kembali utuh", jadi X dibaca langsung lewat id-nya.
       */
      const daftar = AS().sessions.find(x => x.id === '${sebelumReload.idPermukaan}')?.messages ?? [];
      return JSON.stringify({
        sesi: AS().sessions.length,
        pesan: daftar.length,
        judul: AS().sessions.find(x => x.id === '${sebelumReload.idPermukaan}')?.title ?? '',
        adaTanda: daftar.some(m => m.content.includes('${tandaRestore}')),
        adaStreamingNyangkut: daftar.some(m => m.streaming),
        pending: AS().pending,
        bubbleDom: qa('[data-ai-msg]').length,
      });
    `),
  );
  check(
    'V9',
    sebelumReload.adaLs &&
      v9.sesi === sebelumReload.sesi &&
      v9.pesan === sebelumReload.pesan &&
      v9.adaTanda &&
      !v9.adaStreamingNyangkut &&
      v9.pending === null,
    `setelah reload halaman: ${v9.sesi} sesi & ${v9.pesan} pesan kembali dari localStorage (judul "${v9.judul}", penanda ${tandaRestore} ada), ${v9.bubbleDom} bubble ter-render, tidak ada pesan yang nyangkut status "streaming"`,
  );

  // ───────── V11: kotak input bersih setelah kirim (draf per permukaan) ─────────
  const v11 = JSON.parse(
    await cdp.runAsync(`
      /*
       * Bug yang dilaporkan user: setelah kirim chat, teks masih tertinggal di
       * kotak input.
       *
       * Sebabnya draft disimpan per permukaan (drafts[composerId]) dan jalur
       * kirim tidak membersihkan draft milik pengirimnya: 'drafts: text ? s.drafts
       * : {}' - composer SELALU mengirim teksnya, jadi cabang itu yang terpakai
       * dan draft-nya utuh. Uji ini mengukur yang dilihat user: ketik lewat UI
       * (bukan setDraft langsung, supaya jalur onChange ikut teruji) -> klik
       * Kirim -> kotak harus kosong.
       *
       * Sekalian diuji aturan yang paling mudah rusak saat memperbaikinya:
       * draft permukaan LAIN tidak boleh ikut terhapus, karena user bisa sedang
       * mengetik di sana. Perbaikan yang salah (kembali ke 'drafts: {}')
       * menggagalkan syarat ini.
       */
      await bukaAi();
      await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await AS().loadKeys();
      await S.getState().applySettings({ models: { activeProvider: 'gemini' } });
      await wait(300);
      // Mode chat sudah pensiun (setAgentMode('chat') dikoersi ke 'agent'),
      // jadi tidak dipanggil lagi di sini - dikomentari supaya tidak ada yang
      // mengira uji ini masih bergantung padanya.
      await A.store.getState().setModel('gemini-2.0-flash', 'gemini');
      await wait(350);
      // Provider dipastikan BERTAHAN: kalau panel bergeser, jalur kirim yang
      // teruji bukan yang dimaksud dan toast "tanpa key" bisa muncul.
      await tungguProvider('gemini');

      AS().setDraft('JANGAN DIHAPUS - draf permukaan lain', 'permukaan-lain');
      await wait(150);
      const teksUji = 'draf ini harus hilang setelah kirim';
      /*
       * Draft pengirim dibaca TEPAT SEBELUM tombol Kirim ditekan (kait
       * sebelumKlik). Sesudah klik, kotak memang sudah kosong - itu yang
       * diperbaiki - jadi membaca di situ tidak bisa membedakan "aplikasi
       * membersihkan draft" dari "uji tidak pernah mengetik apa pun".
       */
      /*
       * Permukaan pengirim = composer yang ter-render, bukan selalu ''.
       *
       * Panel dirender sebagai tab editor di mesin ini, jadi composerId-nya
       * 'editor' dan ketikan masuk ke drafts.editor. Membaca drafts[''] membuat
       * uji melihat kotak kosong sebelum diketik dan melaporkan draf "" -
       * gagal bukan karena aplikasi, melainkan karena membaca permukaan lain.
       */
      const idPermukaan = () => (q('[data-testid="ai-view-chat"]') ? 'editor' : '');
      let drafSebelumKlik = '';
      await kirim(teksUji, () => {
        drafSebelumKlik = AS().draftOf(idPermukaan());
      });
      const drafSaatKirim = drafSebelumKlik;
      await tungguSelesai();
      const pesanTerkirim = msgs().filter(m => m.role === 'user').pop()?.content ?? '';
      const kotak = q('[data-testid="ai-input"]');
      return JSON.stringify({
        drafSaatKirim,
        pesanTerkirim,
        draftUtama: AS().draftOf(idPermukaan()),
        isiKotak: kotak ? kotak.value : '(kotak tidak ada)',
        draftLain: AS().draftOf('permukaan-lain'),
      });
    `),
  );
  check(
    'V11',
    v11.drafSaatKirim === 'draf ini harus hilang setelah kirim' &&
      v11.pesanTerkirim.includes('draf ini harus hilang') &&
      v11.draftUtama === '' &&
      v11.isiKotak === '' &&
      v11.draftLain === 'JANGAN DIHAPUS - draf permukaan lain',
    `setelah kirim: draft permukaan pengirim "${v11.drafSaatKirim}" (saat kirim) -> "${v11.draftUtama}", isi kotak input = "${v11.isiKotak}" (pesan terkirim: "${v11.pesanTerkirim.slice(0, 40)}"); draft permukaan lain tetap "${v11.draftLain}"`,
  );

  // 笏笏笏笏笏笏笏笏笏 V10: RAM + tanpa console error + bersih 笏笏笏笏笏笏笏笏笏
  const v10 = JSON.parse(
    await cdp.runAsync(`
      // Panel AI dibuka dengan chat terisi, lalu ukur RAM proses (event ram-usage).
      await bukaAi();
      await wait(3500);
      const ram = S.getState().ramBytes;
      // bersih-bersih: hapus key uji, kosongkan chat, kembalikan settings &
      // panel. Key user dipulihkan dari cadangan berkas oleh sisi Node
      // (lihat backupSecrets/restoreSecrets di main()).
      await X.setKey('gemini', '');
      await X.setKey('anthropic', '');
      // Kembalikan baseUrl provider ke nilai asli. Nilai null menghapus
      // key (RFC 7386), jadi provider yang tadinya tidak punya baseUrl
      // kembali tanpa baseUrl, bukan tetap menunjuk mock.
      const origProv = window.__ZV9_ORIG_PROVIDERS__ ?? {};
      const balik = {};
      for (const k of ['gemini', 'openai', 'anthropic']) {
        const v = origProv[k]?.baseUrl;
        balik[k] = { baseUrl: v ? v : null };
      }
      await s.applySettings({ models: { providers: balik } });
      await X.resetAll();
      await s.reloadSettings();
      for (const x of T.getState().terminalTabs.slice()) await T.getState().closeTab(x.id);
      AS().sessions.slice().forEach(x => AS().deleteChat(x.id));
      localStorage.removeItem('zephyr.ai.sessions.v1');
      S.getState().tabs.slice().forEach(t => S.getState().forceCloseTab(t.id));
      window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
      T.getState().setVisible(true);
      S.getState().setSettingsOpen(false);
      S.getState().setActivity('explorer');
      await wait(600);
      return JSON.stringify({
        ram,
        errors: window.__ZEPHYR_ERRORS__,
        keySisa: (await X.publicModels()).filter(x => x.hasKey).map(x => x.provider),
        sesiSisa: AS().sessions.length,
      });
    `),
  );
  const mb = Math.round(v10.ram / (1024 * 1024));
  check(
    'V10',
    v10.ram > 0 &&
      mb < 500 &&
      v10.errors.length === 0 &&
      // Yang wajib bersih hanya key UJI (gemini/anthropic). Key milik user
      // (github, custom) memang harus TETAP ADA 窶・menghapusnya adalah bug,
      // bukan syarat lulus.
      v10.keySisa.every((x) => !['gemini', 'anthropic'].includes(x)) &&
      v10.sesiSisa <= 1,
    `RAM proses dengan panel AI + chat = ${mb} MB (< 500 MB); console error: ${v10.errors.length === 0 ? 'tidak ada' : JSON.stringify(v10.errors)}; key uji (gemini/anthropic) dihapus, key user tetap: ${JSON.stringify(v10.keySisa)}, chat dikosongkan`,
  );

  // Berkas dikembalikan DULU, baru halaman disuruh membacanya lagi: kalau
  // urutannya dibalik, memori aplikasi tetap memegang baseUrl mock.
  restoreSettings();
  restoreSecrets();
  try {
    await cdp.runAsync(`(window.__ZEPHYR_SET__.reloadSettings ?? (async () => true))()`);
  } catch {
    /* halaman mungkin sudah reload/mati: berkasnya sudah benar di disk */
  }
  cdp.close();
  if (mock) mock.kill();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  // Keluar eksplisit: menyetel process.exitCode saja tidak cukup - ada handle
  // (WebSocket CDP) yang tetap hidup, jadi runner suite menunggu 8 menit lalu
  // mencatat "timeout" meski semua uji sudah selesai.
  keluarBersih(lulus === results.length ? 0 : 1);
};

main().catch((e) => {
  // Key DAN provider user dikembalikan walau harness gagal di tengah jalan.
  restoreSettings();
  restoreSecrets();
  console.error('verify09 error:', e.message ?? e);
  // Tutup CDP-nya, kalau tidak proses ini menggantung sampai runner membunuhnya
  // dan sebab kegagalan aslinya tenggelam jadi "timeout".
  try {
    cdpTerbuka?.close();
  } catch {
    /* sudah tertutup atau gagal ditutup: tetap harus keluar */
  }
  keluarBersih(2);
});

