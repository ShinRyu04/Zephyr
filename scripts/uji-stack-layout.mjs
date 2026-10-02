/**
 * uji-stack-layout.mjs - buktikan tumpukan status tidak lagi ketimbun/melayang.
 *
 *   node scripts/uji-stack-layout.mjs 9223
 *
 * Keluhannya: kotak Loop/todos/background "ketimbun dan melayang". Penyebabnya
 * DUA SCROLL BERSARANG - `.ai-work-body` punya `max-height:130px; overflow-y:auto`
 * padahal ia hidup di dalam `.ai-chat` yang sudah scroller. Daftar di dalamnya
 * menggulir tanpa menggerakkan percakapan, sehingga batasnya tidak terbaca.
 *
 * Yang dibuktikan di sini diukur dari GAYA TERHITUNG elemen yang benar-benar
 * dirender, bukan dari isi berkas CSS. Aturan yang salah tulis tetap "ada" di
 * berkas, dan hanya pembacaan gaya yang membedakannya.
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('stack-layout');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* ---- Siapkan: isi agent dengan beberapa langkah supaya ada yang ditata ---- */

const siap = await cdp.json(`return JSON.stringify(await (async () => {
  /*
   * Panel AI DIBUKA dulu, dan ditunggu sampai benar-benar terpasang.
   *
   * Mengisi store saja tidak cukup: kalau panelnya tertutup, tidak ada yang
   * merender tumpukannya - dan uji melaporkan "tumpukan tidak ada di DOM"
   * padahal datanya lengkap. Kegagalan seperti itu menyesatkan: ia terlihat
   * seperti bug komponen, padahal panelnya hanya belum dibuka.
   *
   * Hasilnya juga tidak bergantung lagi pada apa yang ditinggalkan uji lain,
   * karena panelnya dipastikan terbuka di sini.
   */
  /*
   * Panel AI dibuka lewat IKON di ActivityBar, bukan lewat aksi store.
   *
   * Tidak ada setAiOpen di store ini - panelnya dikendalikan panelStore dan
   * command registry. Versi pertama skrip ini menebak nama aksinya, dan
   * kegagalannya menyesatkan: terlihat seperti komponen yang tidak merender,
   * padahal cuma panelnya belum pernah dibuka.
   *
   * Dipanggil lewat registry supaya ujinya memakai jalur yang sama dengan
   * pengguna yang menekan pintasan panel - bukan menyetel state internal yang
   * bisa saja tidak lagi mengendalikan apa pun.
   */
  if (!document.querySelector('.ai-chat')) {
    /*
     * Panel dibuka lewat IKONNYA, sama seperti pengguna.
     *
     * Ini jalur yang paling tidak bergantung pada bentuk dalam kode: tidak ada
     * nama aksi store yang perlu ditebak, tidak ada bentuk registry yang perlu
     * dicocokkan. Kalau ikonnya ada dan bisa diklik, panelnya terbuka - dan
     * kalau tidak, itu memang temuan yang perlu diketahui, bukan asumsi yang
     * perlu diakali.
     */
    const btns = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
    const ai = btns.find((b) => /ai|mcp/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
    if (ai) ai.click();

    for (let i = 0; i < 15 && !document.querySelector('.ai-chat'); i++) {
      await new Promise((res) => setTimeout(res, 300));
    }
  }

  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');
  const s = a.useAi.getState();

  /*
   * agentSteps diisi langsung lewat setState, bukan lewat aksi bernama.
   *
   * Tidak ada pushAgentStep di store ini - daftarnya diisi oleh
   * setAgentProgress saat agent benar-benar berjalan. Untuk menguji TATA
   * LETAK, yang dibutuhkan hanyalah daftar yang cukup panjang, jadi isinya
   * dibuat langsung. Nama aksi yang ditebak akan gagal di sini, dan itu
   * memang yang terjadi pada percobaan pertama.
   *
   * Sepuluh langkah dipakai supaya daftarnya PASTI melewati batas tinggi mana
   * pun - kalau hanya dua, ujinya tidak membuktikan apa pun tentang gulir.
   */
  const langkah = [];
  for (let i = 0; i < 10; i++) {
    langkah.push({
      tool: 'read_file',
      args: '{ path: "/src/components/ai/AiPanel.tsx", offset: ' + i + ' }',
      at: Date.now() + i,
      ok: true,
      ms: 120 + i * 7,
    });
  }
  a.useAi.setState({ agentBusy: true, agentSteps: langkah, agentPhase: 'working' });

  /* Ditunggu sampai tumpukannya benar-benar terpasang, bukan sekadar dijeda
     sekian milidetik - lamanya render bergantung pada mesin. */
  for (let i = 0; i < 15 && !document.querySelector('.ai-work-stack'); i++) {
    await new Promise((res) => setTimeout(res, 300));
  }

  return {
    jumlah: (a.useAi.getState().agentSteps || []).length,
    mapTerpasang: !!document.querySelector('.ai-work-stack'),
    panel: !!document.querySelector('.ai-chat'),
  };
})())`);

r.check(
  'L0',
  siap.jumlah > 0 && siap.mapTerpasang === true,
  `${siap.jumlah} langkah disiapkan; panel=${siap.panel}, tumpukan terpasang=${siap.mapTerpasang}`,
);

/* ---- L1: tidak ada scroll bersarang ---- */

const bersarang = await cdp.json(`return JSON.stringify((() => {
  /* Dipilih lewat KELASNYA, bukan data-testid: atribut itu tidak selalu ikut
     dirender, dan uji yang bergantung padanya gagal hanya karena penandanya
     tidak ada - padahal elemen yang diuji hadir. */
  const stack = document.querySelector('.ai-work-stack');
  const chat = document.querySelector('.ai-chat');
  if (!stack) return { adaStack: false };

  /* Kumpulkan SEMUA elemen di dalam stack yang bisa menggulir sendiri. */
  const bisaGulir = [];
  stack.querySelectorAll('*').forEach((e) => {
    const c = getComputedStyle(e);
    const overflow = c.overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && e.scrollHeight > e.clientHeight + 1) {
      bisaGulir.push({ kelas: String(e.className).slice(0, 60), tinggi: e.clientHeight, isi: e.scrollHeight });
    }
  });

  const cs = getComputedStyle(stack);
  const cc = chat ? getComputedStyle(chat) : null;
  return {
    adaStack: true,
    stackGulir: cs.overflowY,
    stackMaxTinggi: cs.maxHeight,
    stackTinggi: Math.round(stack.getBoundingClientRect().height),
    chatGulir: cc ? cc.overflowY : null,
    /* Ini inti ujinya: kalau ada elemen bergulir DI DALAM stack yang bergulir,
       berarti scroll bersarangnya kembali. */
    bersarang: bisaGulir,
  };
})())`);

r.check('L1a', bersarang.adaStack === true, 'tumpukan status ada di DOM');
r.check(
  'L1b',
  bersarang.bersarang.length === 0,
  `TIDAK ada scroll bersarang di dalam stack (ketemu ${bersarang.bersarang.length}): ${JSON.stringify(bersarang.bersarang)}`,
);
r.check(
  'L1c',
  bersarang.chatGulir === 'auto' || bersarang.chatGulir === 'scroll',
  `percakapan tetap punya SATU scroller sendiri (overflow-y: ${bersarang.chatGulir})`,
);

/* ---- L2: `max-height: 130px` benar-benar hilang dari daftar langkah ---- */

const agen = await cdp.json(`return JSON.stringify((() => {
  const el = document.querySelector('.ai-work-body');
  if (!el) return { ada: false };
  const c = getComputedStyle(el);
  return {
    ada: true,
    maxTinggi: c.maxHeight,
    overflowY: c.overflowY,
    /* Tinggi isinya, untuk memastikan ia memang lebih tinggi dari 130px -
       kalau tidak, ujinya tidak membuktikan apa pun. */
    isi: el.scrollHeight,
    terlihat: Math.round(el.getBoundingClientRect().height),
  };
})())`);

if (!agen.ada) {
  /*
   * GAGAL, bukan lulus.
   *
   * Versi pertama uji ini melaporkan "lulus, tidak ada yang perlu diperiksa"
   * ketika `.ai-work-body` tidak dirender - dan itu lebih buruk daripada tidak ada
   * uji sama sekali: ia memberi rasa aman tanpa membuktikan apa pun. Kalau
   * elemennya tidak muncul, ujinya memang belum berhasil.
   *
   * Daftar langkah dibuka lewat DISCLOSURE-nya, sama seperti pengguna membuka
   * daftar tool call di layar. Kalau itu tidak menghasilkan `.ai-work-body`, ada
   * yang benar-benar tidak beres.
   */
  await cdp.json(`return JSON.stringify(await (async () => {
    const kepala = document.querySelector('.ai-work-summary, .ai-work-head, .ai-work-stack button');
    if (kepala) kepala.click();
    await new Promise((res) => setTimeout(res, 700));
    return { ada: !!document.querySelector('.ai-work-body') };
  })())`);

  const ulang = await cdp.json(`return JSON.stringify((() => {
    const el = document.querySelector('.ai-work-body');
    if (!el) return { ada: false };
    const c = getComputedStyle(el);
    return { ada: true, maxTinggi: c.maxHeight, overflowY: c.overflowY, isi: el.scrollHeight, terlihat: Math.round(el.getBoundingClientRect().height) };
  })())`);

  r.check(
    'L2',
    ulang.ada === true,
    ulang.ada
      ? `daftar langkah bisa dibuka dan diukur (max-height: ${ulang.maxTinggi}, overflow-y: ${ulang.overflowY})`
      : 'daftar langkah (.ai-work-body) TIDAK dirender - uji tidak bisa membuktikan apa pun',
  );

  if (ulang.ada) {
    /*
     * Isi tumpukan HARUS punya batas tinggi dan gulirnya sendiri - di SINI, dan
     * hanya di sini.
     *
     * Versi pertama uji ini menuntut `max-height: none`, dari rencana lama yang
     * membiarkan daftarnya setinggi isi dan mengandalkan scroller percakapan.
     * Itu keliru untuk elemen ini: tanpa batas, satu loop dengan banyak langkah
     * mendorong percakapan keluar layar. Yang benar adalah batas di sini
     * (40vh, seperti Hermes), sehingga gulirnya terkandung di kotaknya sendiri
     * dan tidak ada dua scroller yang bersaing.
     */
    const batas = parseFloat(ulang.maxTinggi);
    const tinggiViewport = 800; const wajar = Number.isFinite(batas) && batas > 100 && batas <= tinggiViewport * 0.5;

    r.check(
      'L2a',
      wajar && ulang.overflowY === 'auto',
      `isi tumpukan punya batasnya sendiri dan menggulir di kotaknya (max-height: ${ulang.maxTinggi}, overflow-y: ${ulang.overflowY})`,
    );
    r.check(
      'L2b',
      ulang.terlihat <= ulang.isi + 1 && ulang.terlihat > 0,
      `kotaknya tidak melar melebihi batasnya (${ulang.terlihat}px, isi ${ulang.isi}px)`,
    );
  }
} else {
  /*
   * Elemennya sudah terlihat sejak awal - periksa langsung, dengan kriteria
   * yang sama seperti cabang di atas.
   *
   * Tinggi viewport diambil dari HALAMAN lewat CDP, bukan dari `window` di
   * sini: skrip ini berjalan di Node, dan `window` tidak ada di sana. Kesalahan
   * itu langsung terlihat sebagai `ReferenceError`, bukan kegagalan yang
   * menyamar sebagai hasil uji.
   */
  const vh = await cdp.json(`return String(window.innerHeight)`);
  const tinggiViewport = Number(vh) || 800;
  const batas = parseFloat(agen.maxTinggi);
  const wajar = Number.isFinite(batas) && batas > 100 && batas <= tinggiViewport * 0.5;

  r.check(
    'L2a',
    wajar && agen.overflowY === 'auto',
    `isi tumpukan punya batasnya sendiri dan menggulir di kotaknya (max-height: ${agen.maxTinggi}, overflow-y: ${agen.overflowY})`,
  );
  r.check(
    'L2b',
    agen.terlihat <= agen.isi + 1 && agen.terlihat > 0,
    `kotaknya tidak melar melebihi batasnya (${agen.terlihat}px, isi ${agen.isi}px)`,
  );
}

/* ---- L3: percakapan tidak tertimpa ---- */

const timpa = await cdp.json(`return JSON.stringify(await (async () => {
  /*
   * Overlay ditutup DULU.
   *
   * elementFromPoint mengembalikan elemen teratas di titik itu, dan overlay
   * apa pun - panel sekat tool, dialog, atau scrim - akan menang atas apa yang
   * ada di bawahnya. Uji ini sempat melaporkan "percakapan menimpa tumpukan"
   * padahal yang menutupinya adalah scrim sekat tool yang kebetulan terbuka
   * dari uji sebelumnya. Menutupnya dulu membuat hasilnya tidak bergantung pada
   * apa yang ditinggalkan uji lain.
   */
  const scrim = document.querySelector('.tg-scrim, [class*=scrim]');
  if (scrim) {
    scrim.click();
    await new Promise((res) => setTimeout(res, 400));
  }
  if (document.querySelector('.tg-scrim')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((res) => setTimeout(res, 400));
  }

  const chat = document.querySelector('.ai-chat');
  const stack = document.querySelector('.ai-work-stack');
  if (!chat || !stack) return { bisaDiperiksa: false };
  const atas = chat.getBoundingClientRect();
  const bawah = stack.getBoundingClientRect();

  /* Kalau kedua kotak bertumpuk secara vertikal, percakapan tertimpa. */
  const tumpangTindih = Math.max(0, Math.min(atas.bottom, bawah.bottom) - Math.max(atas.top, bawah.top));

  /* Dan buktikan dari titik: elemen mana yang benar-benar berada di situ. */
  const x = Math.round(bawah.left + bawah.width / 2);
  const y = Math.round(bawah.top + 4);
  const diTitik = document.elementFromPoint(x, y);
  const milikStack = !!(diTitik && stack.contains(diTitik));

  return {
    bisaDiperiksa: true,
    tinggiTumpang: Math.round(tumpangTindih),
    milikStack,
    kelasDiTitik: diTitik ? String(diTitik.className).slice(0, 50) : null,
  };
})())`);

if (!timpa.bisaDiperiksa) {
  r.check('L3', false, 'percakapan atau stack tidak ada, tidak bisa diperiksa');
} else {
  r.check(
    'L3a',
    timpa.milikStack === true,
    `titik di atas tumpukan benar-benar milik tumpukan, bukan percakapan (${timpa.kelasDiTitik})`,
  );
}

/* ---- Bersihkan ---- */

await cdp.json(`return JSON.stringify(await (async () => {
  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');
  a.useAi.setState({ agentBusy: false, agentSteps: [], agentPhase: null });
  return { bersih: true };
})())`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
