/*
 * Narasi antar tool: apakah teks yang menyertai tool call SELAMAT?
 *
 * Ini yang tidak pernah diuji, dan alasan mock lama tidak bisa mengujinya: ia
 * mengirim teks ATAU tool call, tidak pernah keduanya. Model sungguhan mengirim
 * keduanya dalam giliran yang sama, jadi mock itu tidak punya teks di giliran
 * yang mengandung tool call - tidak ada yang bisa hilang.
 *
 * Justru itu yang perlu dibuktikan. Aturan narasi di systemPrompt sudah
 * berulang dan jelas ("setiap langkah disertai satu baris teks di langkah yang
 * sama"), jadi kalau narasi tetap tidak terlihat, penyebabnya bukan prompt yang
 * kurang - melainkan teks itu dibuang di jalur pipa saat tool call datang.
 *
 * Yang diuji di sini: mock mengirim "NARASI" (teks) lalu tool call dalam satu
 * giliran, dan harness memeriksa bahwa teksnya MASIH ADA di pesan assistant.
 *
 * Jalankan mock lebih dulu: node scripts/mock-ai.mjs 8098
 */
const MOCK = 'http://127.0.0.1:8098';
const CDP = 'http://127.0.0.1:9223';

const ver = await (await fetch(`${MOCK}/__version`)).json().catch(() => null);
if (!ver || ver.version !== 6) {
  console.log(`GAGAL: butuh mock versi 6, dapat ${JSON.stringify(ver)}`);
  process.exit(1);
}

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const panggil = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const ev = async (expr, ap = false) => {
  const r = await panggil('Runtime.evaluate', { expression: expr, awaitPromise: ap, returnByValue: true });
  const v = r.result?.result?.value;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
};

/* Arahkan ke mock dengan kunci yang BERTAHAN (setKey, bukan suntik store). */
await ev(`(() => {
  const s = window.__ZEPHYR__.getState().settings;
  window.__ZEPHYR_SET__.set({ models: { ...s.models, activeProvider: 'custom',
    providers: { ...(s.models?.providers ?? {}), custom: { baseUrl: '${MOCK}/v1', model: 'custom-model' } } } });
  return true;
})()`);
await new Promise((r) => setTimeout(r, 800));
await ev(`window.__ZEPHYR_SET__.setKey('custom', 'MOCK-KEY-NARASI')`, true);
await new Promise((r) => setTimeout(r, 800));
await ev(`window.__ZEPHYR_AI__.store.getState().setProvider('custom')`);
await ev(`window.__ZEPHYR_AI__.store.getState().loadKeys()`, true);

/* Sesi baru + langkah kosong: riwayat tercemar pernah membuat hasil uji ini
   tidak berarti sama sekali. */
await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store;
  const g = st.getState();
  if (typeof g.newChat === 'function') g.newChat();
  st.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return true;
})()`);
await new Promise((r) => setTimeout(r, 500));

const siap = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ provider: st.provider, hasKey: st.hasKey?.(), busy: st.agentBusy });
})()`);
console.log('siap:', JSON.stringify(siap));
/* Menolak mulai saat ada run lain: `send()` akan ditolak diam-diam, dan ujinya
   lalu melaporkan "nol pesan assistant" - yang terbaca seperti app yang membuang
   balasan, padahal run-nya memang tidak pernah dimulai. */
if (siap?.busy) {
  console.log('GAGAL: masih ada run berjalan - tunggu sampai idle dulu.');
  ws.close();
  process.exit(1);
}

const mulai = Date.now();
/*
 * Tool yang dipakai harus benar-benar BISA JALAN, dan tanpa argumen wajib.
 *
 * Dua percobaan sebelumnya gagal karena alasan yang tidak ada hubungannya
 * dengan narasi:
 *   - `inspect`   -> (refused: tool disabled in AI Tools) - dimatikan gate
 *   - `read_file` -> (ERROR: argumen "path" wajib diisi) - mock tidak memberi
 *                    argumen, jadi tool call selalu GAGAL, dan agent mengulang
 *                    sampai lima kali. Terlihat sebagai "0 giliran" padahal
 *                    tool call-nya datang.
 *
 * `list_directory` adalah pilihan yang benar di antara tool katalog:
 *   - namanya ada di katalog, jadi tidak ditolak sebagai "unknown tool name"
 *   - hanya membaca daftar isi, tidak menulis atau menghubungi jaringan
 *   - tidak butuh izin dan tidak punya argumen wajib, jadi ia benar-benar
 *     JALAN tanpa meminta persetujuan
 *
 * Dengan begitu yang diukur memang teks narasinya - bukan kegagalan argumen,
 * bukan tool yang dimatikan gate, bukan dialog izin yang menggantung.
 */
await ev(`(() => { void window.__ZEPHYR_AI__.store.getState().send('NARASI TOOLCALL:list_directory tolong cek', []); return true; })()`);

/* Tunggu run selesai, mengikuti busy - bukan tenggat waktu. */
let akhir = null;
let pernahMulai = false;
for (let i = 0; i < 400; i++) {
  await new Promise((r) => setTimeout(r, 250));
  const s = await ev(`(() => {
    const st = window.__ZEPHYR_AI__.store.getState();
    const ses = st.sessions[st.sessions.length - 1];
    const m = [...(ses?.messages ?? [])].reverse().find((x) => x.role === 'assistant');
    return JSON.stringify({ d: Math.round((Date.now() - ${mulai}) / 1000), busy: st.agentBusy,
      phase: st.agentPhase, isi: String(m?.content ?? ''), calls: (m?.toolCalls ?? []).length });
  })()`);
  akhir = s;
  if (s?.busy) pernahMulai = true;
  if (!pernahMulai && s?.d > 15) break;
  if (pernahMulai && !s?.busy && s?.phase === 'idle') break;
}

/* Periksa SEMUA pesan assistant, bukan hanya yang terakhir: narasi bisa
   menempel ke pesan yang berbeda dari jawaban akhir. */
const pesan = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  const ses = st.sessions[st.sessions.length - 1];
  return JSON.stringify((ses?.messages ?? []).map((m, i) => ({
    i, role: m.role, isi: String(m.content ?? ''), calls: (m.toolCalls ?? []).length,
  })));
})()`);

await ev(`window.__ZEPHYR_SET__.setKey('custom', '')`, true);
ws.close();

const semua = typeof pesan === 'string' ? JSON.parse(pesan) : pesan;
/* Yang diperiksa adalah PESAN, bukan chunk. Chunk yang berisi teks tidak
   membuktikan apa pun: pertanyaannya apakah teks itu SAMPAI ke pesan assistant
   yang dilihat pembaca. Versi pertama harness ini memeriksa chunk, dan karena
   itu melaporkan "lulus" untuk keadaan yang masih kehilangan teksnya.
 *
 * "Giliran teks + tool call" TIDAK diukur dengan `m.toolCalls.length` pada
 * pesan terakhir: setelah tool dijalankan, hasilnya sudah menempel di pesan itu
 * dan daftar toolCalls-nya memang kosong. Yang membuktikan sebuah tool BENAR
 * dijalankan adalah hasilnya muncul di teks - di sini "2+2 = 4".
 */
const pesanAssistant = semua.filter((p) => p.role === 'assistant');
const adaNarasi = pesanAssistant.some((p) => /cek dulu isi folder/i.test(p.isi));
const adaHasilTool = pesanAssistant.some((p) => /2\+2\s*=\s*4/.test(p.isi));
/* Dua-duanya di pesan yang SAMA - itulah arti "dalam satu giliran". */
const satuGiliran = pesanAssistant.some(
  (p) => /cek dulu isi folder/i.test(p.isi) && /2\+2\s*=\s*4/.test(p.isi),
);


let lulus = 0;
const total = 4;
const cek = (n, ok, info) => {
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${n}${info ? ' :: ' + info : ''}`);
  if (ok) lulus++;
};

console.log(`\nrun selesai di ${akhir?.d}s (pernah mulai: ${pernahMulai})`);
console.log(`giliran teks+tool dalam satu pesan: ${satuGiliran ? 1 : 0}`);

console.log(`\npesan assistant: ${pesanAssistant.length}`);
for (const p of pesanAssistant) console.log(`  isi="${p.isi.slice(0, 100)}" calls=${p.calls}`);

cek('run benar-benar berjalan', pernahMulai, `${akhir?.d}s`);
cek('tool BENAR-BENAR dijalankan (2+2 = 4)', adaHasilTool);
cek('teks narasi SAMPAI ke pesan, bukan hanya lewat di chunk', adaNarasi);
cek('teks dan hasil tool ada di GILIRAN YANG SAMA', satuGiliran);

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
