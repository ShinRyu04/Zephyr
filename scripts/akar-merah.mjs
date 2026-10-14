/*
 * akar-merah.mjs - alat bantu BUKTI untuk docs/LAPORAN-AKAR-MERAH.md.
 *
 * Hanya MEMBACA. Tidak pernah memanggil send/cancel/tool, jadi tidak mengubah
 * keadaan aplikasi maupun berkas repo. Dipakai untuk mengubah "skrip X merah"
 * menjadi "akar di berkas Y baris Z, ini angkanya".
 *
 * Pakai:
 *   node scripts/akar-merah.mjs state   # keadaan store AI saat ini (butuh app 9223)
 *   node scripts/akar-merah.mjs cap     # ukuran per-pesan kasus screenshot+tool
 *   node scripts/akar-merah.mjs fakta   # berkas sumber baru yang belum masuk indeks
 *   node scripts/akar-merah.mjs docs    # dokumen nyata vs dokumen terbundel
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const akar = process.cwd();
const mode = process.argv[2] || 'state';

const mtime = (p) => {
  try {
    return statSync(p).mtime.toISOString().slice(0, 19);
  } catch {
    return '(tidak ada)';
  }
};

/* ------------------------------------------------------------------ state */
async function state() {
  const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const kandidat = list.filter((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
  const page =
    kandidat.find((t) => /localhost:5173|Zephyr/.test(t.url + ' ' + (t.title || ''))) || kandidat[0];
  if (!page) throw new Error('tidak ada target page (app tidak hidup?)');
  console.log('target:', page.title, '|', page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const kirim = (m, p) =>
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

  /* HANYA baca. Tidak ada setState/send/cancel. */
  const expr = `(() => {
    const X = window.__ZEPHYR_AI__ || window.__ZEPHYR__ || {};
    const st = X.store.getState();
    const ses = st.sessions[st.activeId] || { messages: [] };
    const pesan = ses.messages || [];
    const akhir = pesan[pesan.length - 1] || {};
    let keys = [];
    try { keys = Object.keys(st).sort(); } catch (e) { keys = ['(gagal: ' + e.message + ')']; }
    return {
      agentBusy: st.agentBusy,
      agentMode: st.agentMode,
      provider: st.provider,
      model: st.model,
      pending: Array.isArray(st.pending) ? st.pending.length : (st.pending === undefined ? null : typeof st.pending),
      kunciMenarik: keys.filter(function (k) { return /busy|pending|antre|queue|approval|agent|batal|stop/i.test(k); }),
      jumlahPesan: pesan.length,
      pesanTerakhir: { role: akhir.role || null, streaming: !!akhir.streaming, err: akhir.error || null, panjangIsi: String(akhir.content || '').length },
      toast: st.toast || null,
      keysProvider: (function () {
        try { const k = JSON.parse(localStorage.getItem('zephyr.keys') || '{}'); return Object.keys(k).filter(function (n) { return k[n]; }); } catch (e) { return null; }
      })(),
      antrian: Array.isArray(st.antrian) ? st.antrian.length : (st.antrian === undefined ? null : typeof st.antrian),
      approvalMode: st.approvalMode,
      agentPhase: st.agentPhase,
      agentStopReason: st.agentStopReason,
      agentFailure: st.agentFailure || null,
      agentSteps: Array.isArray(st.agentSteps) ? st.agentSteps.length : null,
      activeId: st.activeId,
      jumlahSesi: st.sessions ? Object.keys(st.sessions).length : null,
      hasKey: (() => { try { return st.hasKey ? st.hasKey() : 'tidak ada fungsi'; } catch (e) { return 'error: ' + e.message; } })(),
      secretsProvider: (() => {
        try { const s = JSON.parse(window.__ZEPHYR_SECRETS__.snapshot()); return Object.keys(s).filter(function (n) { return s[n]; }); } catch (e) { return 'gagal: ' + e.message; }
      })(),
      idAktif: st.activeIds ? JSON.stringify(st.activeIds) : null,
    };
  })()`;
  const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true });
  ws.close();
  const nilai = r.result?.result?.value;
  if (!nilai || typeof nilai !== 'object') {
    console.log('GAGAL membaca store. mentah:', JSON.stringify(r).slice(0, 600));
    process.exit(1);
  }
  console.log(JSON.stringify(nilai, null, 2));
}

/* -------------------------------------------------------------------- cap */
async function cap() {
  const { build } = await import('esbuild');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'akar-cap-'));
  const out = join(dir, 'contextBudget.mjs');
  await build({
    entryPoints: ['src/lib/contextBudget.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: out,
    logLevel: 'silent',
  });
  const M = await import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());

  const pesan = [{ role: 'system', content: 'sys' }];
  for (let i = 0; i < 6; i++) {
    pesan.push({ role: 'user', content: 'lihat ini', images: ['A'.repeat(400000)] });
    pesan.push({ role: 'assistant', content: 'ok', toolCalls: [{ id: 'd' + i, type: 'function', function: { name: 'read_file', arguments: '{}' } }] });
    pesan.push({ role: 'tool', toolCallId: 'd' + i, name: 'read_file', content: 'y'.repeat(50000) });
  }
  const st = M.ringkasUkuran(pesan);
  const ukuran = JSON.stringify(st).length;
  console.log(`PAYLOAD_MAX_CHARS = ${M.PAYLOAD_MAX_CHARS}`);
  console.log(`ukuran hasil ringkasUkuran = ${ukuran}  (${ukuran <= M.PAYLOAD_MAX_CHARS ? 'DI BAWAH cap' : 'DI ATAS cap'})`);
  console.log('pesan yang tersisa:');
  st.forEach((m, i) => {
    const besar = JSON.stringify(m).length;
    console.log(`  [${i}] role=${m.role} ukuran=${besar} images=${Array.isArray(m.images) ? m.images.length : 0} panjangIsi=${String(m.content || '').length}${besar > M.PAYLOAD_MAX_CHARS / 2 ? '   <-- penyumbang utama' : ''}`);
  });
  console.log('\nkesimpulan: kalau ada SATU pesan ' + (18000) + '+ char yang tidak dipotong, cap mustahil dipenuhi.');
}

/* ------------------------------------------------------------------ fakta */
function fakta() {
  const LEWATI = new Set(['node_modules', 'dist', 'target', '.git', 'coverage', '.vite', 'build']);
  const HASIL = new Set(['src/lib/zephyrFakta.ts', 'src/lib/zephyrIndeks.ts']);
  const sumber = [];
  const jelajah = (rel) => {
    for (const n of readdirSync(join(akar, rel), { withFileTypes: true })) {
      if (LEWATI.has(n.name)) continue;
      const r = `${rel}/${n.name}`;
      if (n.isDirectory()) jelajah(r);
      else if (/\.(ts|tsx|rs)$/.test(n.name) && !HASIL.has(r)) sumber.push(r);
    }
  };
  jelajah('src');
  jelajah('src-tauri/src');
  sumber.sort();

  const teks = readFileSync(join(akar, 'src/lib/zephyrIndeks.ts'), 'utf8');
  const kode = new Set();
  const re = /\["kode","([^"]+)"/g;
  let m;
  while ((m = re.exec(teks))) kode.add(m[1]);
  const hilang = sumber.filter((f) => !kode.has(f));
  const idxM = mtime(join(akar, 'src/lib/zephyrIndeks.ts'));
  console.log(`indeks (zephyrIndeks.ts) mtime = ${idxM}`);
  console.log(`berkas sumber di disk = ${sumber.length}, peta kode di indeks = ${kode.size}, hilang = ${hilang.length}`);
  console.log('hilang + mtime (sesudah mtime indeks = pasti BERKAS BARU -> basi):');
  for (const f of hilang) {
    const mt = mtime(join(akar, f));
    console.log(`  ${mt} ${mt > idxM ? 'BARU ' : 'LAMA '} ${f}`);
  }
}

/* ------------------------------------------------------------------- docs */
function docs() {
  const dir = join(akar, 'docs');
  const nyata = [];
  /* Rekursif: uji cek-bundel-docs menghitung docs/**\/*.md + CHANGELOG/README. */
  const jelajahDocs = (rel) => {
    for (const n of readdirSync(join(akar, rel), { withFileTypes: true })) {
      const r = `${rel}/${n.name}`;
      if (n.isDirectory()) jelajahDocs(r);
      else if (n.isFile() && n.name.endsWith('.md')) nyata.push(r);
    }
  };
  jelajahDocs('docs');
  for (const n of ['CHANGELOG.md', 'README.md']) if (statSync(join(akar, n), { throwIfNoEntry: false })) nyata.push(n);
  nyata.sort();

  const teks = readFileSync(join(akar, 'src/lib/zephyrDokumenData.ts'), 'utf8');
  const bundel = new Set();
  const re = /\["([^"]+\.md)"/g;
  let m;
  while ((m = re.exec(teks))) bundel.add(m[1]);
  const dataM = mtime(join(akar, 'src/lib/zephyrDokumenData.ts'));
  const hilang = nyata.filter((f) => !bundel.has(f));
  console.log(`zephyrDokumenData.ts mtime = ${dataM}`);
  console.log(`dokumen nyata = ${nyata.length}, terdaftar di bundel (per regex) = ${bundel.size}, tidak ada di bundel = ${hilang.length}`);
  for (const f of hilang) console.log(`  ${mtime(join(akar, f))} ${f}`);
}

if (mode === 'state') await state();
else if (mode === 'cap') await cap();
else if (mode === 'fakta') fakta();
else if (mode === 'docs') docs();
else {
  console.log('mode: state | cap | fakta | docs');
  process.exit(2);
}
