/**
 * verify-todo-card.mjs - verifikasi hidup TodoCard + navigasi riwayat prompt.
 *
 * Menempel ke WebView2 lewat CDP (port 9223, sesuai AGENTS.md).
 * Bukti diambil dari DOM yang hidup dan store nyata, bukan "seharusnya jalan".
 *
 *   V1  bridge dev __ZEPHYR_TODO__ tersedia
 *   V2  lima todo masuk ke store
 *   V3  .todo-dock + .todo-dock-head ada di DOM
 *   V4  counter menampilkan "2/5"
 *   V5  lima baris .todo-row
 *   V6  ikon in_progress = .spin (1)
 *   V7  ikon pending = .todo-pend (2)
 *   V8  ikon done = svg centang (2)
 *   V9  teks status Done/Running/Waiting
 *   V10 label utuh (tidak terpotong)
 *   V11 durasi todo selesai terisi (mis. "1s")
 *   V12 durasi todo menunggu kosong
 *   V13 done punya startedAt + endedAt
 *   V14 in_progress punya startedAt, belum endedAt
 *   V15 pending tidak punya startedAt/endedAt
 *   V16 riwayat prompt: dedupe + urutan terbaru dulu
 *   V17 historyUp mengembalikan prompt terakhir
 *   V18 historyDown turun ke indeks berikut lalu null di ujung
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('todo-card');

const { cdp } = await Cdp.attach(PORT);
try {
  cdp.snapshot = null; // jangan pulihkan settings: harness ini tidak menyentuhnya

  const bridge = await cdp.eval(`!!window.__ZEPHYR_TODO__`);
  r.check('V1', bridge === true, 'bridge __ZEPHYR_TODO__ tersedia (mode dev)');
  if (!bridge) {
    r.selesai();
    await cdp.close();
    process.exit(1);
  }

  // Buka panel AI bila API-nya ada.
  await cdp.eval(`(() => {
    const ex = window.__ZEPHYR_EX__ || {};
    for (const k of ['setAiOpen', 'bukaAi', 'openAi']) {
      if (typeof ex[k] === 'function') { try { ex[k](true); return true; } catch {} }
    }
    const s = window.__ZEPHYR__;
    const st = s && s.getState && s.getState();
    if (st && typeof st.setAiOpen === 'function') { st.setAiOpen(true); return true; }
    return false;
  })()`);
  await sleep(400);

  /*
   * Kalau API di atas tidak ada (ya begitu di build sekarang), panel tetap
   * bisa dibuka lewat tombol Activity Bar - yang bersifat TOGGLE, jadi hanya
   * diklik kalau panel memang belum tampil. Klik buta akan menutup panel yang
   * kebetulan sudah terbuka, dan seluruh uiji berikutnya akan melaporkan
   * "tidak ada di DOM" untuk kode yang sebenarnya benar.
   */
  await cdp.eval(`(() => {
    if (document.querySelector('.ai-send-wrap')) return true;
    const btn = [...document.querySelectorAll('[aria-label]')]
      .find((e) => /AI \\/ MCP/i.test(e.getAttribute('aria-label') || ''));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  await sleep(1200);

  // V2: tulis lima todo
  const jumlah = await cdp.json(`return JSON.stringify(await (async () => {
    await window.__ZEPHYR_TODO__.bersih();
    await window.__ZEPHYR_TODO__.tulis([
      { content: 'Baca AGENTS.md dan petakan modul', status: 'done' },
      { content: 'Tambah startedAt/endedAt di aiStore', status: 'done' },
      { content: 'Adaptasi TodoCard ke TodoPanel', status: 'in_progress' },
      { content: 'Tulis harness verifikasi', status: 'pending' },
      { content: 'Commit fase todo card', status: 'pending' },
    ]);
    return window.__ZEPHYR_TODO__.baca().length;
  })())`);
  r.check('V2', jumlah === 5, `lima todo di store (dapat ${jumlah})`);
  await sleep(500);

  // V3-V12: struktur DOM
  const d = await cdp.json(`return JSON.stringify({
    card: !!document.querySelector('.todo-dock'),
    head: !!document.querySelector('.todo-dock .todo-dock-head'),
    // Struktur baru (ComposerStatusStack): counter "done/total" tinggal di
    // .composer-type-pill; .todo-count yang dicari harness lama sudah tidak ada.
    // Catatan: kode ini masuk lewat template literal, jadi \ harus ditulis \\.
    count: [...document.querySelectorAll('.todo-dock .composer-type-pill')]
      .map((x) => x.textContent || '')
      .find((t) => /\\d+\\/\\d+/.test(t)) || '',
    rows: document.querySelectorAll('.todo-dock .todo-row').length,
    spin: document.querySelectorAll('.todo-dock .todo-row.in_progress .spin').length,
    pend: document.querySelectorAll('.todo-dock .todo-row.pending .todo-pend').length,
    doneSvg: document.querySelectorAll('.todo-dock .todo-row.done svg').length,
    labels: [...document.querySelectorAll('.todo-dock .todo-label')].map((x) => x.textContent),
    statuses: [...document.querySelectorAll('.todo-dock .todo-status')].map((x) => x.textContent),
    durs: [...document.querySelectorAll('.todo-dock .todo-dur')].map((x) => x.textContent),
  })`);

  r.check('V3', d.card === true && d.head === true, '.todo-dock + .todo-dock-head di DOM');
  // Struktur baru (ComposerStatusStack): counter "done/total" ada di dalam
  // .composer-type-pill; harness lama mencari .todo-count yang sudah tidak ada.
  const pill = (d.count || '');
  r.check('V4', pill.includes('2/5'), `counter "2/5" di pill (dapat "${pill}")`);
  r.check('V5', d.rows === 5, `lima .todo-row (dapat ${d.rows})`);
  r.check('V6', d.spin === 1, `satu spinner in_progress (dapat ${d.spin})`);
  r.check('V7', d.pend === 2, `dua lingkaran putus pending (dapat ${d.pend})`);
  r.check('V8', d.doneSvg === 2, `dua centang svg done (dapat ${d.doneSvg})`);
  /*
   * Label status diterjemahkan sesuai bahasa AKTIF, bukan dipatok ke satu
   * bahasa.
   *
   * Uji sebelumnya mematok 'Done'/'Running'/'Waiting' - dan itu lulus hanya
   * karena bug: kunci Inggris itu tidak ada di kamus, jadi penerjemahnya
   * mengembalikan teks kunci apa adanya dan kebetulan cocok dengan harapan
   * ujinya. Uji yang mengunci bug seperti ini lebih buruk daripada tidak ada
   * uji: ia akan MENOLAK perbaikan yang benar.
   *
   * Sekarang yang diperiksa adalah terjemahan dari kamusnya sendiri, jadi
   * ujinya benar untuk bahasa apa pun yang sedang aktif.
   */
  const harap = await cdp.json(`return JSON.stringify(await (async () => {
    const i = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'i18n.ts');
    const s = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'store.ts');
    const lang = s.useStore.getState().settings.general.uiLang;
    return {
      lang,
      selesai: i.translate(lang, 'Selesai'),
      berjalan: i.translate(lang, 'Berjalan'),
      menunggu: i.translate(lang, 'Menunggu'),
    };
  })())`);

  r.check(
    'V9',
    d.statuses[0] === harap.selesai &&
      d.statuses[2] === harap.berjalan &&
      d.statuses[3] === harap.menunggu,
    `teks status sesuai kamus bahasa "${harap.lang}" (dapat ${JSON.stringify(d.statuses)}, harap ${JSON.stringify([harap.selesai, '…', harap.berjalan, harap.menunggu])})`,
  );
  r.check(
    'V10',
    d.labels[0] === 'Baca AGENTS.md dan petakan modul',
    `label utuh (dapat "${d.labels[0]}")`,
  );
  r.check('V11', /^\d+[sm]$/.test(d.durs[0] || ''), `durasi selesai terisi (dapat "${d.durs[0]}")`);
  r.check('V12', (d.durs[3] || '') === '', `durasi menunggu kosong (dapat "${d.durs[3]}")`);

  // V13-V15: timestamp di store
  const st = await cdp.json(`return JSON.stringify(window.__ZEPHYR_TODO__.baca().map((t) => ({
    s: t.status, a: !!t.startedAt, e: !!t.endedAt,
  })))`);
  r.check('V13', st[0].a === true && st[0].e === true, `done punya startedAt+endedAt (${JSON.stringify(st[0])})`);
  r.check('V14', st[2].a === true && st[2].e === false, `in_progress punya startedAt saja (${JSON.stringify(st[2])})`);
  r.check('V15', st[3].a === false && st[3].e === false, `pending tanpa timestamp (${JSON.stringify(st[3])})`);

  // V15b: lipat/buka lewat klik header
  await cdp.eval(`(() => {
    const b = document.querySelector('[data-testid="todo-lipat"]');
    if (!b) return false;
    if (b.getAttribute('aria-expanded') === 'false') b.click();
    return true;
  })()`);
  await sleep(250);

  const awal = await cdp.eval(`(() => {
    const b = document.querySelector('[data-testid="todo-lipat"]');
    const l = document.querySelector('[data-testid="ai-todos"]');
    return JSON.stringify({
      expanded: b ? b.getAttribute('aria-expanded') : null,
      hidden: l ? l.hasAttribute('hidden') : null,
      tinggi: Math.round(document.querySelector('.todo-dock').getBoundingClientRect().height),
      simpan: localStorage.getItem('zephyr.todoCard.collapsed'),
    });
  })()`);
  const a = JSON.parse(awal);
  r.check('V16', a.expanded === 'true' && a.hidden === false, `terbuka: aria-expanded=${a.expanded} hidden=${a.hidden}`);

  // klik untuk melipat
  await cdp.eval(`document.querySelector('[data-testid="todo-lipat"]').click()`);
  await sleep(300);

  const b = JSON.parse(await cdp.eval(`(() => {
    const btn = document.querySelector('[data-testid="todo-lipat"]');
    const l = document.querySelector('[data-testid="ai-todos"]');
    return JSON.stringify({
      expanded: btn ? btn.getAttribute('aria-expanded') : null,
      hidden: l ? l.hasAttribute('hidden') : null,
      tinggi: Math.round(document.querySelector('.todo-dock').getBoundingClientRect().height),
      barisTerlihat: [...document.querySelectorAll('.todo-dock .todo-row')].filter((x) => x.offsetParent !== null).length,
      simpan: localStorage.getItem('zephyr.todoCard.collapsed'),
    });
  })()`));

  r.check('V17', b.expanded === 'false' && b.hidden === true, `terlipat: aria-expanded=${b.expanded} hidden=${b.hidden}`);
  r.check('V18', b.barisTerlihat === 0, `tidak ada baris terlihat saat lipat (dapat ${b.barisTerlihat})`);
  r.check('V19', b.tinggi < a.tinggi, `kartu lebih pendek saat lipat (${a.tinggi}px -> ${b.tinggi}px)`);
  r.check('V20', b.simpan === '1', `pilihan lipat disimpan di localStorage (dapat "${b.simpan}")`);

  // buka kembali, dan pastikan tetap tersimpan sebagai terbuka
  await cdp.eval(`document.querySelector('[data-testid="todo-lipat"]').click()`);
  await sleep(250);
  const c = JSON.parse(await cdp.eval(`JSON.stringify({
    expanded: document.querySelector('[data-testid="todo-lipat"]').getAttribute('aria-expanded'),
    simpan: localStorage.getItem('zephyr.todoCard.collapsed'),
  })`));
  r.check('V21', c.expanded === 'true' && c.simpan === '0', `buka kembali + simpan "0" (${JSON.stringify(c)})`);

  // V22-V25: KAPSUL BERSAMBUNG.
  // Kartu tugas dan kotak ketik harus terbaca sebagai SATU kapsul, bukan dua
  // kotak menumpuk. Resepnya dari Hermes Agent:
  //   - sudut ATAS kartu membulat, sudut BAWAH-nya lurus (0px)
  //   - border bawah kartu DIHAPUS
  //   - tepi atas kotak ketik yang jadi garis pemisah bersama
  //   - tidak ada celah sama sekali di antara keduanya
  const ukur = await cdp.json(`return JSON.stringify((() => {
    // Radius atas kapsul milik kartu LUAR (.ai-work-stack), bukan section dalam
    // (.todo-dock / .composer-status-stack) yang memang radius 0 by design -
    // ia menempel ke section di atasnya lewat divider 1px. Mengukur section
    // dalam lalu menuntut 10px adalah mengukur tingkat yang salah.
    const b = document.querySelector('.ai-work-stack');
    const kotak = document.querySelector('.ai-input-row');
    if (!b || !kotak) return { ada: false, b: !!b, kotak: !!kotak };
    const g = (e) => {
      const c = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return {
        x: Math.round(r.x), w: Math.round(r.width),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        radius: c.borderRadius, latar: c.backgroundColor,
        // Warna tepi dibaca dari sisi yang BENAR-BENAR terlihat. Sisi yang
        // dihapus (width 0) melaporkan borderTopColor = currentColor, yang di
        // sini jatuh ke --fg0 terang dan bukan warna border sungguhan.
        warnaTepi:
          parseFloat(c.borderTopWidth) > 0 ? c.borderTopColor : c.borderBottomColor,
        bAtas: c.borderTopWidth, bBawah: c.borderBottomWidth,
      };
    };
    return { ada: true, kartu: g(b), kotak: g(kotak) };
  })())`);

  if (!ukur.ada) {
    r.check('V22', false, `elemen tidak ditemukan (dock=${ukur.b} kotak=${ukur.kotak})`);
    r.check('V23', false, 'dilewati');
    r.check('V24', false, 'dilewati');
    r.check('V25', false, 'dilewati');
  } else {
    const k = ukur.kartu;
    const q = ukur.kotak;

    // Sudut: kartu membulat di atas dan lurus di bawah; kotak ketik sebaliknya.
    // DPR 1.25 (layar 125%) membuat 10px terbaca 8px, jadi banding toleransi:
    // persamaan persis akan menolak keadaan yang benar.
    const sudut = (s) => String(s).trim().split(/\s+/).map((v) => parseFloat(v));
    const [ka, kb, kc, kd] = sudut(k.radius);
    const [qa2, qb2, qc, qd] = sudut(q.radius);
    const dekat = (a, b) => Math.abs(a - b) <= 2.5;
    const sudutBenar =
      dekat(ka, 10) && dekat(kb, 10) && kc === 0 && kd === 0 && dekat(qc, 10) && dekat(qd, 10);
    r.check(
      'V22',
      sudutBenar,
      `sudut menyambung: kartu="${k.radius}" kotak="${q.radius}"`,
    );

    // Sisi pertemuan (bawah kartu vs atas kotak): hanya SATU yang boleh punya
    // border di sana, kalau tidak garisnya dobel. Kartu berborder penuh di
    // ketiga sisanya (border-bottom:0), jadi sisi pertemuan milik kotak
    // (.ai-input-row border-top) - kebalikan dari asumsi harness lama.
    const tanpaDobel = k.bBawah === '0px' && q.bAtas !== '0px';
    r.check(
      'V23',
      tanpaDobel,
      `satu garis di pertemuan: bawah kartu ${k.bBawah}, atas kotak ${q.bAtas}`,
    );

    // Tidak ada celah, dan tepinya segaris: itu yang membuatnya satu kapsul.
    const celah = q.top - k.bottom;
    const segaris = k.x === q.x && k.w === q.w;
    r.check(
      'V24',
      celah === 0 && segaris,
      `menempel tanpa celah: celah=${celah}px, tepi kartu ${k.w}px@${k.x} vs kotak ${q.w}px@${q.x}`,
    );

    // Latar sama: dua permukaan yang menyatu tapi berbeda warna akan terlihat
    // sebagai tempelan, bukan satu benda.
    r.check(
      'V25',
      k.latar === q.latar && k.warnaTepi === q.warnaTepi,
      `permukaan sama: latar ${k.latar} vs ${q.latar}, tepi ${k.warnaTepi} vs ${q.warnaTepi}`,
    );
  }

  // V16-V18: riwayat prompt
  const hist = await cdp.json(`return JSON.stringify(await (async () => {
    const AI = window.__ZEPHYR_AI__ && window.__ZEPHYR_AI__.store;
    if (!AI || typeof AI.getState().addPromptHistory !== 'function') return { ada: false };
    const g = () => AI.getState();
    g().clearPromptHistory();
    g().addPromptHistory('pertanyaan satu');
    g().addPromptHistory('pertanyaan dua');
    g().addPromptHistory('pertanyaan satu');
    const list = g().promptHistory;
    const up1 = g().historyUp();
    const up2 = g().historyUp();
    const up3 = g().historyUp();
    const turun = g().historyDown();
    const turun2 = g().historyDown();
    return { ada: true, list, up1, up2, up3, turun, turun2 };
  })())`);

  if (!hist.ada) {
    r.check('V26', false, 'addPromptHistory tidak ada di store');
    r.check('V27', false, 'dilewati');
    r.check('V28', false, 'dilewati');
  } else {
    r.check(
      'V26',
      hist.list.length === 2 && hist.list[0] === 'pertanyaan satu' && hist.list[1] === 'pertanyaan dua',
      `dedupe + terbaru dulu (dapat ${JSON.stringify(hist.list)})`,
    );
    r.check(
      'V27',
      hist.up1 === 'pertanyaan satu' && hist.up2 === 'pertanyaan dua',
      `historyUp naik (dapat ${hist.up1} lalu ${hist.up2})`,
    );
    r.check(
      'V28',
      hist.up3 === 'pertanyaan dua' && hist.turun === 'pertanyaan satu' && hist.turun2 === null,
      `mentok di atas + historyDown turun lalu berhenti (dapat ${hist.up3}, ${hist.turun}, ${hist.turun2})`,
    );
  }
} finally {
  await cdp.close();
}

const { lulus, total } = r.selesai();
process.exit(lulus === total ? 0 : 1);
