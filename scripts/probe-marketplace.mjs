// probe-marketplace.mjs — verifikasi Marketplace bahasa + logo + rekomendasi.
import { Cdp } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const r = await cdp.json(
  `
  const out = {};
  const E = window.__ZEPHYR_EXT19__;
  S.getState().setSettingsOpen(false);
  S.getState().setActivity('extensions');
  if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
  await wait(500);

  // Paksa refresh katalog + pindah tab Marketplace
  await E.refresh();
  E.setTab('marketplace');
  await wait(900);

  const tabs = qa('.xv-tab');
  out.tabs = tabs.map((t) => t.textContent.trim());

  // Kartu yang tampil sekarang
  const kartu = qa('[data-ext-card]');
  out.kartuTampil = kartu.length;

  // State store extensions19: entri marketplace (katalog remote+bundled)
  const st = E.state();
  out.katalogRemote = Array.isArray(st.remote) ? st.remote.length : null;
  out.terpasang = E.terpasang().map((x) => x.id);

  // Logo asli: <img> di kartu bahasa
  const imgs = kartu.filter((k) => k.querySelector('img'));
  out.kartuDenganImg = imgs.length;
  out.contohLogo = imgs.slice(0, 4).map((k) => ({
    id: k.getAttribute('data-ext-card') || k.textContent.slice(0, 24),
    imgSrc: (k.querySelector('img')?.getAttribute('src') || '').slice(0, 50),
  }));

  // Cek beberapa bahasa penting ada di store (dari remote catalog 106)
  const cari = (id) => {
    const semua = [...(st.remote || []), ...(st.katalog || [])];
    return semua.find((x) => x.id === id) || null;
  };
  out.cekBahasa = ['zephyr.lang-rust','zephyr.lang-python','zephyr.lang-go','zephyr.lang-javascript','zephyr.lang-css','zephyr.lang-sql','zephyr.lang-cobol']
    .map((id) => {
      const e = cari(id);
      return { id, ada: !!e, iconUrl: e ? (e.iconUrl || '').slice(0, 45) : null, logoColor: e ? e.logoColor : null };
    });

  return JSON.stringify(out);
`,
  90000,
);
console.log(JSON.stringify(r, null, 1));
await cdp.close();