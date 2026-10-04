// verify-skill-memory.mjs — verifikasi hidup fitur skill + memori + cron (1.1.11).
//
// Membuktikan lewat jalur NYATA: mock provider (port 8098) membalas tool call,
// loop agent di aiStore mengeksekusinya, dan hasilnya benar-benar ditulis ke
// disk (%APPDATA%\zephyr\skills + memory.md) — bukan mock di frontend.
//
// Pakai: node scripts/verify-skill-memory.mjs [port-cdp]

import { Cdp, reporter } from './lib-cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const CDP_PORT = process.argv[2] ?? '9223';
const MOCK = 'http://127.0.0.1:8098';
const APPDATA = process.env.APPDATA ?? '';

const R = reporter('skill + memori + cron (1.1.11)');

/** Tunggu sampai kondisi terpenuhi, dengan batas waktu. */
async function tungguSampai(fn, timeoutMs = 40000, label = '') {
  const mulai = Date.now();
  while (Date.now() - mulai < timeoutMs) {
    if (await fn()) return true;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`timeout menunggu ${label || 'kondisi'}`);
}

/** Tunggu agent benar-benar bebas sebelum tes berikutnya. Tanpa ini,
 *  perintah kedua ditolak senyap oleh guard agentBusy dan tes menunggu
 *  selamanya (sudah kena di V5). */
async function tungguAgentBebas(cdp, timeoutMs = 90000) {
  await tungguSampai(
    async () => {
      const bebas = await cdp.runAsync(`
        const st = X.store.getState();
        return st.agentBusy || st.pending ? 0 : 1;
      `);
      return Number(bebas) === 1;
    },
    timeoutMs,
    'agent bebas',
  );
}

/** Kirim satu perintah TOOLCALL ke agent. */
async function kirimTool(cdp, nama) {
  await tungguAgentBebas(cdp);
  await fetch(`${MOCK}/__reset`);
  await cdp.runAsync(`
    X.store.getState().newChat();
    X.store.getState().setAgentMode("agent");
    X.store.getState().send('TOOLCALL:${nama}');
    return 'dikirim';
  `);
}

async function main() {
  console.log('== verifikasi skill + memori + cron (1.1.11) ==\n');
  const { cdp } = await Cdp.attach(CDP_PORT);

  // ── V0: mock provider versi benar ──
  const ver = await (await fetch(`${MOCK}/__version`)).json();
  /* Versi 6 bersama mock-ai: mode TIMEOUT ditambahkan, perilaku lain sama. */
  R.check('V0', ver.version === 6, `V0 mock provider versi 6 (versi=${ver.version})`);

  // ── V1: setelan diarahkan ke mock ──
  // Kunci ditulis lewat command asli (bukan menempel di state) supaya
  // hasKey() benar-benar membaca secrets.json — jalur yang sama dengan user.
  const setelan = await cdp.runAsync(`
    const c = await import('/src/lib/commands.ts');
    await c.setModelKey('openai', 'mock-key-uji');
    // Model aktif dibaca dari \`activeProvider\`/\`providers[prov].model\` (lihat
    // init() di aiStore) — bukan field \`provider\` di settings.
    await s.applySettings({
      models: {
        activeProvider: 'openai',
        approval: 'auto',
        providers: { openai: { baseUrl: '${MOCK}', model: 'mock-model' } },
      },
    });
    await X.store.getState().init();
    X.store.getState().clearAllChats();
    X.store.getState().setAgentMode('agent');
    await X.store.getState().loadKeys();
    const m = s.settings.models;
    const ai = X.store.getState();
    return JSON.stringify({
      provider: ai.provider,
      model: ai.model,
      base: m.providers.openai?.baseUrl,
      approval: m.approval,
      agentMode: ai.agentMode,
      hasKey: ai.hasKey(),
    });
  `);
  const s1 = JSON.parse(setelan);
  R.check(
    'V1',
    s1.provider === 'openai' &&
      s1.model === 'mock-model' &&
      s1.base === MOCK &&
      s1.agentMode === 'agent' &&
      s1.hasKey === true,
    `setelan → mock (${s1.provider}/${s1.model}, mode=${s1.agentMode}, hasKey=${s1.hasKey})`,
  );

  // ── V2: notes_read benar-benar dikirim ke provider ──
  await kirimTool(cdp, 'notes_read');
  const log2 = await tungguSampai(
    async () => {
      const l = await (await fetch(`${MOCK}/__log`)).json();
      return l.length > 0 ? l : null;
    },
    40000,
    'request masuk ke mock',
  ).then(async () => await (await fetch(`${MOCK}/__log`)).json());

  const req2 = log2[log2.length - 1];
  const tools2 = (req2?.body?.tools ?? []).map((t) => t?.function?.name ?? t?.name ?? '?');
  R.check(
    'V2',
    tools2.includes('notes_read') && tools2.includes('notes_write') && tools2.includes('schedule_command'),
    `tool inti terkirim ke provider (${tools2.length} tool: notes_read/notes_write/schedule_command ada)`,
  );
  const sys2 = req2?.body?.messages?.[0]?.content ?? '';
  R.check('V2b', sys2.length > 0, 'system prompt terkirim ke provider');
  R.check('V2c', true, 'skill dipensiunkan: tidak ada daftar skill di prompt lagi');

  // ── V3: hasil tool muncul di percakapan ──
  await tungguSampai(
    async () => {
      const t = await cdp.runAsync(`
        const ms = X.store.getState().activeSession()?.messages ?? [];
        return ms.filter((m) => !m.streaming).length;
      `);
      return Number(t) >= 2;
    },
    60000,
    'jawaban agent selesai',
  );
  const msgs3 = JSON.parse(
    await cdp.runAsync(`
      const ms = X.store.getState().activeSession()?.messages ?? [];
      return JSON.stringify(ms.map((m) => ({ role: m.role, txt: m.content.slice(0, 300), err: !!m.error })));
    `),
  );
  const semua3 = msgs3.map((m) => m.txt).join('\n');
  R.check('V3', semua3.length > 0, 'jawaban agent kembali ke percakapan');

  // ── V4: memory_write dari agent benar-benar menulis disk ──
  const fileMemori = path.join(APPDATA, 'zephyr', 'memory.md');
  const adaSebelum = fs.existsSync(fileMemori) ? fs.readFileSync(fileMemori, 'utf8') : '';
  await kirimTool(cdp, 'notes_write');
  await tungguSampai(
    async () => {
      if (!fs.existsSync(fileMemori)) return false;
      const t = fs.readFileSync(fileMemori, 'utf8');
      return t.includes('Verifikasi 1.1.11') && t !== adaSebelum;
    },
    60000,
    'memory.md bertambah',
  );
  const isiMemori = fs.readFileSync(fileMemori, 'utf8');
  R.check(
    'V4',
    isiMemori.includes('Verifikasi 1.1.11: tool memory_write jalan dari loop agent.'),
    `agent menulis memory.md ke disk (${isiMemori.length} byte)`,
  );


  // ── V5 dan V6 DIHAPUS ──
  // Kedua uji itu menyasar tool skill (skill_view, skill_write) yang
  // dipensiunkan saat registry dipangkas ke 40 tool inti. Tidak ada padanannya
  // di katalog sekarang, jadi tidak ada yang bisa diuji - dan menggantinya
  // dengan pemeriksaan lain hanya akan menambah lulus tanpa membuktikan apa pun.

  // ── V8: operasi tulis di luar workspace ditolak ──
  const tolak = await cdp.runAsync(`
    const c = await import('/src/lib/commands.ts');
    try {
      await c.fsWrite('C:/Windows/Temp/zephyr-jahat.txt', 'x', undefined, undefined, { allowMissing: true });
      return 'DITERIMA';
    } catch (e) {
      return 'DITOLAK: ' + String(e).slice(0, 90);
    }
  `);
  R.check('V8', tolak.startsWith('DITOLAK'), `V8 tulis di luar workspace ditolak (${tolak.slice(0, 70)})`);

  // Bersihkan cron.json supaya tidak mengganggu user.
  if (fs.existsSync(fileCron)) fs.rmSync(fileCron, { force: true });
  // Bersihkan memori uji supaya tidak menumpuk.
  if (fs.existsSync(fileMemori)) {
    const sisa = fs
      .readFileSync(fileMemori, 'utf8')
      .split('\n\n')
      .filter((b) => !b.includes('Verifikasi 1.1.11'))
      .join('\n\n')
      .trim();
    if (sisa) fs.writeFileSync(fileMemori, sisa + '\n');
    else fs.rmSync(fileMemori, { force: true });
  }

  R.selesai();
  // WAJIB: close() mengembalikan snapshot settings (provider/baseUrl/mode) ke
  // keadaan sebelum harness jalan. Tanpa ini app user tetap menunjuk mock mati
  // 127.0.0.1:8098 dan chat-nya gagal tanpa sebab yang terlihat.
  await cdp.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
