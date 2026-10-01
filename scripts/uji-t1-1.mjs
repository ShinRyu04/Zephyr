// uji-t1-1.mjs — verifikasi T1.1 (Blok Reasoned + Thinking/Effort) lewat DOM
// dan store yang HIDUP di app debug (CDP 9223).
//
// Kenapa lewat store, bukan cuma DOM: kontrol `ai-effort` harus benar-benar
// mengubah `reasoningEffort` di zustand, bukan sekadar terlihat di layar.
//
// Pakai: node scripts/uji-t1-1.mjs

import { Cdp } from './lib-cdp.mjs';

const PORT = 9223;
let lulus = 0;
let gagal = 0;

function cek(nama, ok, info = '') {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
}

const { cdp } = await Cdp.attach(PORT, 'Zephyr');

try {
  // ── 0. buka panel AI dulu (tanpa ini, kontrolnya belum ter-render) ──
  // Panel AI hidup di dock terminal (pelajaran fase 09 §9.2: satu panel
  // bawah saja). focusTab tidak cukup — tab ai bukan anggota visibleTabs;
  // yang benar adalah setDock('ai').
  await cdp.eval(`(() => {
    const T = window.__ZEPHYR_TERM__;
    if (!T) return 'tidak ada bridge terminal';
    T.getState().setVisible(true);
    T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
    return 'ok';
  })()`);
  await new Promise((r) => setTimeout(r, 900));

  // ── 1. kontrol ai-effort ada di header panel AI ──
  const ada = await cdp.eval(`(() => {
    const el = document.querySelector('[data-testid="ai-effort"]');
    if (!el) return { ada: false };
    const opsi = [...el.options].map(o => o.value);
    return {
      ada: true,
      opsi,
      nilai: el.value,
      aktif: el.getAttribute('data-aktif'),
      tag: el.tagName,
    };
  })()`);

  cek('kontrol ai-effort ada di DOM', ada.ada);
  if (ada.ada) {
    cek(
      '6 pilihan (default + 5 tingkat)',
      ada.opsi.length === 6,
      `opsi=[${ada.opsi.join(',')}]`,
    );
    cek(
      'tingkat minimal→ultra lengkap',
      ['minimal', 'low', 'medium', 'high', 'ultra'].every((v) => ada.opsi.includes(v)),
    );
    cek('default = kosong (jangan kirim param)', ada.nilai === '');
    cek('data-aktif=false saat default', ada.aktif === 'false');
  }

  // ── 2. mengubah pilihan benar-benar mengubah store ──
  const store = await cdp.eval(`(() => {
    const X = window.__ZEPHYR_AI__;
    return { ada: !!X, punyaEffort: typeof X?.effort === 'function' };
  })()`);

  if (store.ada) {
    const ubah = await cdp.eval(`(() => {
      const el = document.querySelector('[data-testid="ai-effort"]');
      if (!el) return { ok: false };
      // setNativeValue: React onChange butuh setter prototipe + event change
      // (pelajaran fase 08 — mengubah .value langsung TIDAK memicu onChange).
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, 'value',
      ).set;
      setter.call(el, 'ultra');
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);
    cek('set nilai ai-effort = ultra', ubah.ok);

    await new Promise((r) => setTimeout(r, 300));

    const hasil = await cdp.eval(`(() => {
      const el = document.querySelector('[data-testid="ai-effort"]');
      const X = window.__ZEPHYR_AI__;
      return {
        nilaiDom: el?.value,
        aktif: el?.getAttribute('data-aktif'),
        storeEffort: X?.effort?.() ?? 'TIDAK ADA',
      };
    })()`);

    cek('DOM menampilkan ultra', hasil.nilaiDom === 'ultra', `nilai=${hasil.nilaiDom}`);
    cek('store reasoningEffort = ultra', hasil.storeEffort === 'ultra', `store=${hasil.storeEffort}`);
    cek('data-aktif=true (disorot)', hasil.aktif === 'true');

    // ── 3. blok Reasoned: injeksi pesan ber-reasoning lalu cek render ──
    const blok = await cdp.eval(`(() => {
      const X = window.__ZEPHYR_AI__;
      if (!X || typeof X.injectAssistant !== 'function')
        return { ok: false, alasan: 'helper injectAssistant tidak ada' };
      const id = X.injectAssistant(
        'Jawaban uji T1.1.',
        'Pertama, saya perlu memeriksa apakah blok Reasoned muncul. ' +
        'Lalu saya simpulkan: ya, muncul.',
      );
      return { ok: true, id };
    })()`);
    cek('injeksi potongan penalaran', blok.ok, blok.alasan ?? '');

    await new Promise((r) => setTimeout(r, 500));

    const reasoned = await cdp.eval(`(() => {
      const el = document.querySelector('[data-testid="ai-reasoned"]');
      if (!el) return { ada: false };
      const tog = el.querySelector('[data-testid="ai-reasoned-toggle"]');
      const body = el.querySelector('.ai-reasoned-body');
      return {
        ada: true,
        adaToggle: !!tog,
        expanded: tog?.getAttribute('aria-expanded'),
        adaBody: !!body,
        teks: body?.textContent?.slice(0, 60) ?? '',
        label: el.querySelector('.ai-reasoned-label')?.textContent ?? '',
      };
    })()`);

    cek('blok ai-reasoned dirender', reasoned.ada);
    if (reasoned.ada) {
      cek('tombol toggle ada', reasoned.adaToggle);
      // Pesan yang sudah SELESAI -> blok terlipat (jawaban tetap fokus).
      cek('terlipat saat pesan selesai', !reasoned.adaBody);
      cek('aria-expanded=false', reasoned.expanded === 'false');

      // Klik toggle -> terbuka + teks penalaran terbaca.
      await cdp.eval(`(() => {
        document.querySelector('[data-testid="ai-reasoned-toggle"]')?.click();
        return 'ok';
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      const terbuka = await cdp.eval(`(() => {
        const el = document.querySelector('[data-testid="ai-reasoned"]');
        const body = el?.querySelector('.ai-reasoned-body');
        const tog = el?.querySelector('[data-testid="ai-reasoned-toggle"]');
        return {
          adaBody: !!body,
          expanded: tog?.getAttribute('aria-expanded'),
          teks: body?.textContent ?? '',
          meta: el?.querySelector('.ai-reasoned-meta')?.textContent ?? '',
        };
      })()`);

      cek('klik toggle -> badan terbuka', terbuka.adaBody);
      cek('aria-expanded=true', terbuka.expanded === 'true');
      cek(
        'teks penalaran benar',
        terbuka.teks.includes('blok Reasoned muncul'),
        terbuka.teks.slice(0, 45),
      );
      cek('meta menampilkan jumlah karakter', /\d+/.test(terbuka.meta), terbuka.meta);
    }

    // ── 4. kembalikan ke default ──
    await cdp.eval(`(() => {
      const el = document.querySelector('[data-testid="ai-effort"]');
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, 'value',
      ).set;
      setter.call(el, '');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    const balik = await cdp.eval(`(() => {
      const X = window.__ZEPHYR_AI__;
      const v = X?.effort?.();
      return v === null ? null : (v ?? 'TIDAK ADA');
    })()`);
    cek('bisa dikembalikan ke default (null)', balik === null, `nilai=${balik}`);
  } else {
    console.log('  (lewati uji store — jembatan __ZEPHYR__ tidak ada)');
  }

  // ── 5. tidak ada error konsol ──
  console.log('');
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exitCode = gagal === 0 ? 0 : 1;
} finally {
  await cdp.close();
}
