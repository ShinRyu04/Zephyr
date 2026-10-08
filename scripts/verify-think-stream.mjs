// verify-think-stream.mjs — buktikan streaming live + animasi Thinking di tab
// Claude Code lewat CDP (app nyata, jalur CLI asli).
//
//   V1  Kirim prompt ke tab Claude → indikator cli-thinking TAMPIL saat menunggu
//   V2  Teks sampai dalam MULTI-INCREMENT (bukan satu blok di akhir) = streaming live
//   V3  Teks akhir TIDAK terduplikasi (dedup delta vs assistant line bekerja)
//   V4  Indikator hilang begitu teks mulai masuk (tidak double dengan jawaban)
//   V5  Store: thinking part yang ditutup event berikutnya ke-stamp ms-nya
//   V6  Store: thinking part yang ditutup oleh `done` ke-stamp ms-nya
//
// Pakai: node scripts/verify-think-stream.mjs [port]
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  #ws; #id = 0; #pending = new Map();
  static async connect(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    await new Promise((res, rej) => { c.#ws.once('open', res); c.#ws.once('error', rej); });
    c.#ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      const p = c.#pending.get(m.id);
      if (p) { c.#pending.delete(m.id); p(m); }
    });
    return c;
  }
  #send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => { this.#pending.set(id, res); this.#ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.#send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true });
    if (r.error) throw new Error(`RPC: ${JSON.stringify(r.error)}`);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    return r.result?.result?.value;
  }
  close() { this.#ws.close(); }
}

const results = [];
const check = (id, ok, detail) => { results.push({ id, ok }); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(6)} ${detail}`); };

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && /Zephyr/i.test(t.title));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  // ── Siapkan: sesi kosong untuk tab Claude Code ─────────────────────────
  const prep = await cdp.eval(`(() => {
    const st = window.__ZEPHYR_CLICHAT__;
    if (!st) return JSON.stringify({ ok:false, why:'__ZEPHYR_CLICHAT__ tidak ada' });
    st.getState().clear('claude');
    return JSON.stringify({ ok:true });
  })()`);
  const prepJ = JSON.parse(prep);
  if (!prepJ.ok) throw new Error(`prep: ${prepJ.why}`);

  // Pastikan tab Claude visible supaya getBoundingClientRect valid.
  await cdp.eval(`(() => {
    const btn = document.querySelector('[data-testid="ai-host-tab-claude"]');
    if (btn) btn.click();
    return 1;
  })()`);

  const reads = async () => {
    const raw = await cdp.eval(`(() => {
      const st = window.__ZEPHYR_CLICHAT__.getState();
      const list = st.sessions['claude'] ?? [];
      const act = st.activeId['claude'];
      const sess = list.find(s => s.id === act) ?? list[list.length-1];
      if (!sess) return JSON.stringify({ ok:false });
      const bot = [...sess.messages].reverse().find(m => m.role === 'assistant');
      // SCOPE ke panel Claude: tab Codex memakai komponen yang sama, jadi
      // query global bisa menemukan elemen milik subtree yang hidden (rect 0).
      const root = document.querySelector('[data-testid="ai-clichat-claude"]');
      const thinkEl = root ? root.querySelector('[data-testid="cli-thinking"]') : null;
      const thinkVisible = !!(thinkEl && thinkEl.getBoundingClientRect().height > 0);
      const rootRect = root ? root.getBoundingClientRect().height : 0;
      return JSON.stringify({
        ok:true,
        pending: sess.pending,
        content: bot ? bot.content : null,
        parts: bot && bot.parts ? bot.parts.map(p => ({ type:p.type, len:(p.text??'').length, ms:p.ms ?? null })) : null,
        thinkVisible,
        rootRect,
        msgCount: sess.messages.length,
      });
    })()`);
    return JSON.parse(raw);
  };

  // ── V1: kirim prompt, indikator Thinking tampil saat menunggu ──────────
  await cdp.eval(`window.__ZEPHYR_CLICHAT__.getState().send('claude', 'Sebutkan 5 fakta pendek tentang Postgres, satu baris per fakta.')`);
  await sleep(700); // masa startup CLI: prompt sudah diterima, jawaban belum ada
  let s = await reads();
  check('V1', s.ok && s.pending && s.thinkVisible,
    `pending=${s.pending ? 'ada' : 'tidak'} indikator=${s.thinkVisible ? 'terlihat' : 'TIDAK terlihat'}`);

  // ── V2: teks tumbuh bertahap (multi-increment) ─────────────────────────
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    s = await reads();
    if (!s.ok) break;
    if (s.content) samples.push({ t: Date.now() - t0, len: s.content.length });
    if (!s.pending && samples.length) break;
    await sleep(400);
  }
  const lens = [...new Set(samples.map(x => x.len))];
  check('V2', lens.length >= 3,
    `${samples.length} sampel, ${lens.length} panjang berbeda (butuh >=3 untuk streaming bertahap)`);

  // ── V3: tidak ada duplikasi (dedup delta vs assistant line) ────────────
  s = await reads();
  const content = s.content ?? '';
  // Kalau dedup gagal, jawaban tercetak dua kali → paragraf pertama muncul
  // sebagai prefiks dua kali di SELURUH content.
  let doubled = false;
  if (content.length > 60) {
    const head = content.slice(0, 80);
    doubled = content.indexOf(head, 1) !== -1 && content.length >= 2 * 80
      && content.slice(0, content.length / 2).trim() === content.slice(content.length / 2).trim().slice(0, content.length / 2 - (content.length % 2));
    // Uji sederhana yang lebih robust: kalau seluruh isi = X + X.
    const h = Math.floor(content.length / 2);
    doubled = content.slice(0, h).trim() === content.slice(h).trim() && h > 40;
  }
  check('V3', content.length > 0 && !doubled,
    `panjang=${content.length}${doubled ? ' TERDUPLIKASI (dedup gagal)' : ', tidak terduplikasi'}`);

  // ── V4: indikator hilang setelah teks masuk ────────────────────────────
  s = await reads();
  check('V4', content.length === 0 || !s.thinkVisible,
    `content=${content.length} chars, indikator=${s.thinkVisible ? 'MASIH TERLIHAT (salah)' : 'sudah hilang (benar)'}`);

  // ── V5/V6: stamping durasi thinking ────────────────────────────────────
  // applyCliEvent private — disuntik lewat event Tauri ASLI `cli-chat-chunk`
  // (frontend emit → backend broadcast → listener resmi yang sudah ter-bind).
  // sessionForReq menemukan pesan lewat id, jadi payloadnya {id, event}.
  const prepStamp = await cdp.eval(`(() => {
    const st = window.__ZEPHYR_CLICHAT__;
    const s0 = st.getState();
    const list = s0.sessions['claude'] ?? [];
    const sess = list.find(x => x.id === (s0.activeId['claude'] ?? '')) ?? list[list.length-1];
    if (!sess) return JSON.stringify({ ok:false, why:'no session' });
    const id = 'vstamp-' + Date.now();
    const msg = { id, role:'assistant', content:'', parts:[] };
    st.setState({ sessions: { ...s0.sessions, claude: list.map(x => x.id === sess.id
      ? { ...x, messages:[...x.messages, msg] } : x) } });
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__VSTAMP__ = { id, emit: (payload) => invoke('plugin:event|emit', { event:'cli-chat-chunk', payload }) };
    return JSON.stringify({ ok:true, id });
  })()`);
  const prepJ2 = JSON.parse(prepStamp);
  if (!prepJ2.ok) throw new Error(`stamp prep: ${prepJ2.why}`);
  const sid = prepJ2.id;

  const readParts = async () => JSON.parse(await cdp.eval(`(() => {
    const st = window.__ZEPHYR_CLICHAT__.getState();
    const list = st.sessions['claude'] ?? [];
    for (const s of list) {
      const m = (s.messages ?? []).find(x => x.id === ${JSON.stringify(sid)});
      if (m) return JSON.stringify({ found:true, parts: (m.parts ?? []).map(p => ({ type:p.type, len:(p.text??'').length, ms: p.ms ?? null, t0: p.t0 ?? null })) });
    }
    return JSON.stringify({ found:false });
  })()`));

  // V5: thinking ditutup oleh event text berikutnya → ms ke-stamp.
  await cdp.eval(`window.__VSTAMP__.emit({ id: window.__VSTAMP__.id, event: { kind:'thinking', text:'alasan uji' } })`);
  await sleep(900); // beri jarak waktu nyata supaya durasi > 0
  await cdp.eval(`window.__VSTAMP__.emit({ id: window.__VSTAMP__.id, event: { kind:'text', text:'jawaban' } })`);
  await sleep(350);
  let ps = await readParts();
  const th = ps.found ? ps.parts.find(p => p.type === 'thinking') : null;
  check('V5', !!th && typeof th.ms === 'number' && th.ms >= 500 && typeof th.t0 === 'number',
    ps.found
      ? `thinking.ms=${th?.ms ?? 'HILANG'} (butuh >=500), t0=${th?.t0 ? 'ada' : 'HILANG'}`
      : 'pesan uji tidak ditemukan');

  // V6: thinking ditutup oleh `done` → ms ke-stamp juga.
  const sid6 = sid + '-b';
  await cdp.eval(`(() => {
    const st = window.__ZEPHYR_CLICHAT__;
    const s0 = st.getState();
    const list = s0.sessions['claude'] ?? [];
    const sess = list.find(x => x.id === (s0.activeId['claude'] ?? '')) ?? list[list.length-1];
    const msg = { id: ${JSON.stringify(sid6)}, role:'assistant', content:'', parts:[] };
    st.setState({ sessions: { ...s0.sessions, claude: list.map(x => x.id === sess.id
      ? { ...x, messages:[...x.messages, msg] } : x) } });
    window.__VSTAMP__.id = ${JSON.stringify(sid6)};
    return 1;
  })()`);
  await cdp.eval(`window.__VSTAMP__.emit({ id: window.__VSTAMP__.id, event: { kind:'thinking', text:'penutup' } })`);
  await sleep(900);
  await cdp.eval(`window.__VSTAMP__.emit({ id: window.__VSTAMP__.id, done: true, cancelled: false })`);
  await sleep(350);
  ps = await readParts();
  const th6 = ps.found ? ps.parts.find(p => p.type === 'thinking') : null;
  check('V6', !!th6 && typeof th6.ms === 'number' && th6.ms >= 500,
    ps.found
      ? `thinking.ms=${th6?.ms ?? 'HILANG'} (butuh >=500)`
      : 'pesan uji tidak ditemukan');

  // ── Bersihkan sesi uji ─────────────────────────────────────────────────
  await cdp.eval(`window.__ZEPHYR_CLICHAT__.getState().clear('claude')`);
  cdp.close();

  const lulus = results.filter(r => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  process.exit(lulus === results.length ? 0 : 1);
};

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
