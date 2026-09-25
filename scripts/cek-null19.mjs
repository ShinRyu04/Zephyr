// cek-null19.mjs — dari mana nilai "null" di verify19?
//
// verify19 melaporkan tombol kartu berlabel "null", data-ext-theme="null",
// dan konfirmasi uninstall berbunyi "null". Skrip ini mereproduksi langkahnya
// satu per satu dan mencetak nilai mentah tiap field, supaya terlihat field
// mana yang benar-benar null dan dari pemanggilan yang mana.

import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  const r = await cdp.runAsync(`
    // Buka halaman Extensions seperti verify19.
    S.getState().setSettingsOpen(true);
    await wait(400);
    await import('/src/lib/settingsStore.ts').then(({ useSettingsUi }) =>
      useSettingsUi.getState().setSection('extensions'));
    await wait(900);

    // Tab marketplace + katalog.
    const tabs = qa('[data-testid^="ext-tab"]').map((el) => ({
      testid: el.dataset.testid, teks: el.textContent.trim().slice(0, 30),
    }));

    // Kartu yang ada sekarang.
    const kartu = qa('[data-testid^="ext-card"], .ext-card').slice(0, 4).map((el) => {
      const tombol = el.querySelector('button');
      return {
        teksKartu: el.textContent.trim().slice(0, 60),
        labelTombol: tombol ? tombol.textContent.trim() : null,
        terpasang: el.getAttribute('data-terpasang'),
        enabled: el.getAttribute('data-enabled'),
      };
    });

    // Cari elemen yang punya teks persis "null".
    const adaNull = qa('*').filter((el) =>
      el.children.length === 0 && el.textContent.trim() === 'null'
    ).slice(0, 6).map((el) => ({
      tag: el.tagName, kelas: (el.className || '').toString().slice(0, 60),
      testid: el.dataset.testid ?? null,
    }));

    // Nilai atribut yang mengandung "null".
    const attrNull = qa('[data-ext-theme], [data-terpasang], [data-enabled]')
      .filter((el) => /null/.test(el.getAttribute('data-ext-theme') ?? '')
        || /null/.test(el.getAttribute('data-terpasang') ?? '')
        || /null/.test(el.getAttribute('data-enabled') ?? ''))
      .slice(0, 6).map((el) => ({
        testid: el.dataset.testid ?? null,
        extTheme: el.getAttribute('data-ext-theme'),
        terpasang: el.getAttribute('data-terpasang'),
        enabled: el.getAttribute('data-enabled'),
      }));

    // Registry tema + bahasa (untuk V3/V5).
    const tema = window.__ZEPHYR_EXT19__?.temaTerdaftar?.() ?? null;
    const bahasa = window.__ZEPHYR_EXT19__?.bahasaTerdaftar?.() ?? null;

    return JSON.stringify({ tabs, kartu, adaNull, attrNull, tema, bahasa });
  `);

  const d = JSON.parse(r);
  console.log('tab        :', JSON.stringify(d.tabs));
  console.log('');
  console.log('kartu      :');
  for (const k of d.kartu) console.log('  ', JSON.stringify(k));
  console.log('');
  console.log('elemen berteks "null":', JSON.stringify(d.adaNull, null, 1));
  console.log('');
  console.log('atribut bernilai null:', JSON.stringify(d.attrNull, null, 1));
  console.log('');
  console.log('tema terdaftar :', JSON.stringify(d.tema));
  console.log('bahasa terdaftar:', JSON.stringify(d.bahasa));
  cdp.close();
};

main().catch((e) => {
  console.error('cek-null19 error:', e.message ?? e);
  process.exitCode = 2;
});
