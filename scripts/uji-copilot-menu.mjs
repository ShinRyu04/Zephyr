import { Cdp } from './lib-cdp.mjs';
import { readFileSync } from 'node:fs';

/*
 * Uji composer/menu bergaya VS Code Copilot (permintaan Ryu, 2026-10-13).
 *
 * Tiga hal yang diukur, semuanya dari DOM aplikasi yang benar-benar jalan
 * (bukan dari kode sumber):
 *
 *   U1  Tab panel AI tidak lagi berlabel "Chat" - labelnya "Agent" (mode chat
 *       dipensiunkan). Testid-nya TETAP `ai-host-tab-chat` supaya harness lama
 *       tidak pecah; yang berubah hanya teks yang dibaca pembaca.
 *   U2  Menu persona tidak lagi dibuka dengan judul seksi "PERSONA" di atas
 *       daftar (itu yang diminta dihapus): baris pertama popup langsung baris
 *       persona, dan centang ✓ masih menandai yang aktif.
 *   U3  Baris "Configure Custom Agents…" ala Copilot kini ADA di menu persona
 *       (`ai-mode-manage`), sebagai baris terakhir - tempat yang benar, karena
 *       menu itulah yang MEMILIH persona.
 *   U4  Baris yang sama TIDAK lagi menempel di menu izin (tempat lamanya).
 *   U5  Klik baris itu masih membuka Settings -> Agents (bukti bahwa
 *       pemindahannya tidak memutus jalurnya). Tab asal dipulihkan setelahnya.
 *   U6  Baris "Dispatch" di Chat Settings kini menyatakan fakta, bukan sakelar:
 *       tanpa kontrol (button/select) dan tanpa tombol Reset.
 *   U7  Tombol kirim memakai label agen ("Run"), bukan label chat.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info) => {
  if (ok) {
    lulus += 1;
    console.log(`LULUS  ${nama}${info ? ` — ${info}` : ''}`);
  } else {
    gagal += 1;
    console.log(`GAGAL  ${nama}${info ? ` — ${info}` : ''}`);
  }
};

/* Panel AI harus terlihat dulu: kalau host-nya tertutup, semua tombol di
   bawah tidak ada dan hasilnya cuma "tombol tidak ketemu" yang menyesatkan. */
await cdp.runAsync(`
  const host = q('[data-testid="ai-host"]');
  if (host) {
    const pane = q('[data-testid="ai-host-pane-chat"]');
    if (!pane) q('[data-testid="ai-host-tab-chat"]')?.click();
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(400);
  return true;
`, 20000);

/* ── U1: label tab ────────────────────────────────────────────────────── */
const u1 = await cdp.runAsync(`
  const tab = q('[data-testid="ai-host-tab-chat"]');
  return tab ? { teks: tab.textContent.trim(), ketemu: true } : { ketemu: false };
`, 20000);
cek('U1 tab panel AI berlabel "Agent"', u1.ketemu && u1.teks === 'Agent', JSON.stringify(u1));

/* ── U7: label tombol kirim (jalur agen) ──────────────────────────────── */
const u7 = await cdp.runAsync(`
  const b = q('[data-testid="ai-send"]') || q('[data-testid="ai-stop"]');
  return b ? { aria: b.getAttribute('aria-label'), judul: b.getAttribute('title') } : { ketemu: false };
`, 20000);
cek(
  'U7 tombol kirim berlabel "Run"',
  !!u7.aria && u7.aria.trim() === 'Run',
  JSON.stringify(u7),
);

/* ── U2 / U3: menu persona ────────────────────────────────────────────── */
const menu = await cdp.runAsync(`
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(300);
  const chip = q('[data-testid="ai-mode-menu"]');
  if (!chip) return { tahap: 'chip persona tidak ada' };
  chip.click();
  await wait(900);
  const pop = q('[data-testid="ai-mode-pop"]');
  if (!pop) return { tahap: 'popup persona tidak terbuka' };

  const seksi = [...pop.querySelectorAll('.pick-seksi')].map((e) => e.textContent.trim());
  const baris = [...pop.querySelectorAll('.mode-item')];
  const aktif = baris.find((b) => b.classList.contains('is-on'));
  const kelola = pop.querySelector('[data-testid="ai-mode-manage"]');
  const anak = [...pop.children];
  const pertama = anak[0];

  return {
    tahap: 'ok',
    chipTeks: chip.textContent.trim(),
    dataPersona: chip.getAttribute('data-persona'),
    seksi,
    kelasAnakPertama: pertama ? String(pertama.className || pertama.tagName).slice(0, 30) : null,
    teksAnakPertama: pertama ? pertama.textContent.trim().slice(0, 40) : null,
    jmlBaris: baris.length,
    adaCentang: !!pop.querySelector('.pick-check'),
    aktifId: aktif ? aktif.getAttribute('data-testid') : null,
    aktifTeks: aktif ? aktif.textContent.trim().slice(0, 30) : null,
    kelola: kelola ? kelola.textContent.trim().slice(0, 70) : null,
    kelolaTerakhir: !!kelola && kelola === anak[anak.length - 1],
    // Komentar kode pernah ikut ter-render sebagai baris pertama popup (blok
    // komentar sebagai anak JSX, bukan sebagai ekspresi) - jadi ini dijaga.
    adaKomentarMentah: (pop.textContent || '').includes('/*') || (pop.textContent || '').includes('*/'),
  };
`, 40000);

cek('U2 menu persona terbuka', menu.tahap === 'ok', String(menu.tahap));
cek(
  'U2 judul seksi "PERSONA" sudah hilang dari daftar',
  menu.tahap === 'ok' && !menu.seksi.some((s) => s.toLowerCase() === 'persona'),
  `seksi=${JSON.stringify(menu.seksi)}`,
);
cek(
  'U2 popup tidak memuat komentar kode sebagai teks',
  menu.tahap === 'ok' && menu.adaKomentarMentah === false,
  `adaKomentarMentah=${menu.adaKomentarMentah}`,
);
cek(
  'U2 baris pertama popup = baris persona (bukan judul)',
  menu.tahap === 'ok' &&
    (String(menu.kelasAnakPertama).includes('mode-item') ||
      String(menu.teksAnakPertama).toLowerCase().includes('your own')),
  `pertama=${menu.kelasAnakPertama} "${menu.teksAnakPertama}"`,
);
cek(
  'U3 centang ✓ menandai persona aktif',
  menu.tahap === 'ok' && menu.adaCentang && String(menu.aktifId).startsWith('ai-persona-'),
  `aktif=${menu.aktifId}`,
);
cek(
  'U3 baris "Manage personas & sub-agents" ada di menu persona',
  menu.tahap === 'ok' && String(menu.kelola).includes('Manage personas'),
  `teks=${menu.kelola}`,
);
cek(
  'U3 baris itu duduk sebagai baris terakhir',
  menu.tahap === 'ok' && menu.kelolaTerakhir === true,
  `kelolaTerakhir=${menu.kelolaTerakhir}`,
);

/* ── U4: menu izin tidak lagi memuat baris itu ────────────────────────── */
const izin = await cdp.runAsync(`
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(300);
  const chip = q('[data-testid="ai-izin-menu"]');
  if (!chip) return { tahap: 'chip izin tidak ada' };
  chip.click();
  await wait(900);
  const pop = q('[data-testid="ai-izin-pop"]');
  if (!pop) return { tahap: 'popup izin tidak terbuka' };
  return {
    tahap: 'ok',
    jmlItem: pop.querySelectorAll('.mode-item').length,
    adaKelola: !!pop.querySelector('[data-testid="ai-mode-manage"]'),
    teks: pop.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90),
  };
`, 40000);
cek('U4 menu izin terbuka', izin.tahap === 'ok', String(izin.tahap));
cek(
  'U4 baris kelola persona sudah pindah keluar dari menu izin',
  izin.tahap === 'ok' && izin.adaKelola === false,
  `adaKelola=${izin.adaKelola} teks="${izin.teks}"`,
);

/* ── U6: baris Dispatch di Chat Settings = fakta, bukan sakelar ───────── */
const baris = await cdp.runAsync(`
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(300);
  const more = q('[data-testid="ai-more"]');
  if (!more) return { tahap: 'tombol ⋯ tidak ada' };
  more.click();
  await wait(700);
  const item = q('[data-testid="ai-open-chat-settings"]');
  if (!item) return { tahap: 'item Chat Settings tidak ada' };
  item.click();
  await wait(1200);
  const cari = q('.cset-cari input');
  if (!cari) return { tahap: 'Chat Settings tidak terbuka' };
  cari.focus();
  cari.value = 'dispatch';
  cari.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(700);
  const row = q('[data-testid="cset-row-dispatch"]');
  if (!row) return { tahap: 'baris Dispatch tidak muncul saat dicari' };
  const kontrol = row.querySelector('button, select, input');
  return {
    tahap: 'ok',
    teks: row.textContent.replace(/\\s+/g, ' ').trim().slice(0, 110),
    kontrol: kontrol ? kontrol.tagName + '.' + String(kontrol.className).slice(0, 24) : null,
    nilai: (q('[data-testid="cset-mode"]')?.textContent || '').trim().slice(0, 60),
  };
`, 40000);
cek('U6 baris Dispatch ketemu lewat pencarian', baris.tahap === 'ok', String(baris.tahap));
cek(
  'U6 baris Dispatch tanpa kontrol apa pun (bukan sakelar)',
  baris.tahap === 'ok' && baris.kontrol === null,
  `kontrol=${baris.kontrol}`,
);
cek(
  'U6 baris Dispatch menyatakan fakta mode agen',
  baris.tahap === 'ok' && baris.nilai.toLowerCase().includes('agent'),
  `nilai="${baris.nilai}"`,
);

/* Tutup Chat Settings lewat Escape (penanganannya ada di komponennya). */
await cdp.runAsync(`
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(500);
  return !q('.cset-page');
`, 20000);

/* ── U5: klik baris kelola -> Settings -> Agents, lalu tab dipulihkan ─── */
const kelola = await cdp.runAsync(`
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(400);
  const tabAwal = q('.tab.is-active, [data-testid^="tab-"].is-active');
  const tabAwalTeks = tabAwal ? tabAwal.textContent.trim().slice(0, 40) : null;

  const chip = q('[data-testid="ai-mode-menu"]');
  if (!chip) return { tahap: 'chip persona tidak ada' };
  chip.click();
  await wait(800);
  const b = q('[data-testid="ai-mode-manage"]');
  if (!b) return { tahap: 'baris kelola tidak ada' };
  b.click();
  await wait(1500);

  const hasil = {
    tahap: 'ok',
    tabAwalTeks,
    setTopbar: !!q('.set-topbar'),
    navAktif: (q('.set-nav-item.is-active')?.textContent || '').trim().slice(0, 30),
    kartuPersona: !!q('[data-testid="persona-new"]'),
    popupPersonaMasihTerbuka: !!q('[data-testid="ai-mode-pop"]'),
  };

  /* Pulihkan: kembali ke tab editor yang aktif sebelum uji ini. */
  if (tabAwalTeks) {
    const lagi = [...document.querySelectorAll('.tab, [data-testid^="tab-"]')].find(
      (t) => t.textContent.trim() === tabAwalTeks,
    );
    if (lagi) { lagi.click(); await wait(600); }
  }
  hasil.tabSetelahPulih = (q('.tab.is-active, [data-testid^="tab-"].is-active')?.textContent || '').trim().slice(0, 40);
  return hasil;
`, 50000);
cek('U5 klik baris kelola tidak error', kelola.tahap === 'ok', String(kelola.tahap));
cek('U5 Settings terbuka', kelola.tahap === 'ok' && kelola.setTopbar === true, `setTopbar=${kelola.setTopbar}`);
cek(
  'U5 mendarat di seksi Agents (kartu persona ada)',
  kelola.tahap === 'ok' && kelola.kartuPersona === true,
  `nav="${kelola.navAktif}" kartu=${kelola.kartuPersona}`,
);
cek(
  'U5 menu persona ikut tertutup setelah diklik',
  kelola.tahap === 'ok' && kelola.popupPersonaMasihTerbuka === false,
  `masihTerbuka=${kelola.popupPersonaMasihTerbuka}`,
);

/* ── U8 / U9 / U10: mode chat benar-benar dipensiunkan ────────────────── */
const pensiun = await cdp.runAsync(`
  const aiStore = X.store;
  const sebelum = aiStore.getState().agentMode;

  /* setAgentMode('chat') harus dikoersi jadi agen - inilah yang membuat
     "chat" tidak bisa lagi jadi pilihan, bukan cuma disembunyikan di UI. */
  aiStore.getState().setAgentMode('chat');
  await wait(400);
  const sesudah = aiStore.getState().agentMode;
  const lsSesudah = localStorage.getItem('zephyr.ai.mode');
  return { sebelum, sesudah, lsSesudah };
`, 30000);
cek(
  'U8 setAgentMode("chat") dikoersi jadi "agent"',
  pensiun.sebelum === 'agent' && pensiun.sesudah === 'agent',
  JSON.stringify(pensiun),
);
cek(
  'U9 pilihan yang tersimpan pun tidak bisa lagi "chat"',
  pensiun.lsSesudah !== 'chat',
  `localStorage=${pensiun.lsSesudah}`,
);

/* Jalur boot tidak bisa diuji dari store (bootAgentMode() fungsi modul, bukan
   aksi - ia cuma dipakai saat store dibuat). Jadi yang diperiksa: badan
   fungsinya memang tidak punya cabang 'chat' lagi. Kalau suatu hari cabang itu
   kembali, pemeriksaan ini jatuh. */
const sumber = readFileSync('D:/Zephyr/src/lib/aiStore.ts', 'utf8');
const badanBoot = sumber.match(/function bootAgentMode\(\)[^{]*\{([\s\S]{0,200}?)\}/);
cek(
  'U9 bootAgentMode() hanya bisa mengembalikan "agent"',
  !!badanBoot && badanBoot[1].includes("return 'agent';") && !/return 'chat'/.test(badanBoot[1]),
  badanBoot ? badanBoot[1].replace(/\s+/g, ' ').trim().slice(0, 60) : 'fungsi tidak ketemu',
);

const tabs = await cdp.runAsync(`
  return [...document.querySelectorAll('[data-testid^="ai-host-tab-"]')].map((t) => t.textContent.trim());
`, 20000);
cek(
  'U10 tidak ada tab berlabel "Chat" lagi',
  Array.isArray(tabs) && !tabs.some((t) => /\bchat\b/i.test(t)),
  JSON.stringify(tabs),
);

console.log(`\n== UJI COPILOT: ${lulus} lulus / ${gagal} gagal ==`);
await cdp.send('Page.captureScreenshot', { format: 'png' }).then((s) => {
  if (s?.result?.data) {
    import('node:fs').then((fs) =>
      fs.writeFileSync('D:/Zephyr/uji-copilot-menu.png', Buffer.from(s.result.data, 'base64')),
    );
  }
});
cdp.close();
process.exit(gagal === 0 ? 0 : 1);
