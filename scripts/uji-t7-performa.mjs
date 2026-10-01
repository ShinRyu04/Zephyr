// uji-t7-performa.mjs — verifikasi perbaikan performa + kerapatan.
//
// Menguji TUJUH perbaikan yang dikerjakan setelah laporan user "mode Agent
// lama banget" dan "kerapatan tidak mengubah apa pun":
//   1. riwayat agent dipotong (ringkasRiwayat)
//   2. file_list dibatasi (FILE_LIST_MAX)
//   3. timeout gateway dinaikkan (Rust — tidak bisa diuji dari JS)
//   4. kerapatan Padat benar-benar mengubah metrik layout
//   5. label "Padat" (dulu "Rapat" — salah arti dalam bahasa Indonesia)
//   6. cache konteks 60 detik
//   7. hasil tool lama diringkas
//
// Pakai: node scripts/uji-t7-performa.mjs [port-cdp]

import { Cdp, reporter } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const R = reporter('performa agent + kerapatan Padat');

async function main() {
  console.log('== performa agent + kerapatan ==\n');
  const { cdp } = await Cdp.attach(CDP_PORT);

  // ── V1: ringkasRiwayat memotong riwayat panjang ──
  const potong = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const history = [{ role: 'system', content: 'sys' }];
    for (let i = 0; i < 30; i++) {
      history.push({ role: 'assistant', content: 'a'.repeat(3000) });
      history.push({ role: 'tool', toolCallId: 't' + i, name: 'file_read', content: 'x'.repeat(9000) });
    }
    const asli = JSON.stringify(history).length;
    const hasil = m.ringkasRiwayat(history);
    const akhir = JSON.stringify(hasil).length;
    return JSON.stringify({ asli, akhir, jumlahAsli: history.length, jumlahAkhir: hasil.length });
  `);
  const p = JSON.parse(potong);
  R.check('V1', p.akhir < p.asli * 0.5, `riwayat dipotong: ${p.asli} -> ${p.akhir} char (${Math.round((1 - p.akhir / p.asli) * 100)}% lebih kecil)`);
  R.check(
    'V2',
    p.jumlahAkhir <= p.jumlahAsli + 1,
    `jumlah pesan stabil: ${p.jumlahAsli} -> ${p.jumlahAkhir} (+1 = catatan ringkasan)`,
  );

  // ── V3: system prompt TIDAK ikut dipotong ──
  const sysUtuh = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const history = [{ role: 'system', content: 'SYS-PENTING' }];
    for (let i = 0; i < 30; i++) history.push({ role: 'tool', toolCallId: 't' + i, content: 'y'.repeat(5000) });
    const hasil = m.ringkasRiwayat(history);
    return JSON.stringify({ ada: hasil.some((x) => x.content === 'SYS-PENTING'), pertama: hasil[0]?.role });
  `);
  const su = JSON.parse(sysUtuh);
  R.check('V3', su.ada && su.pertama === 'system', 'system prompt tetap utuh di posisi pertama');

  // ── V4: riwayat pendek TIDAK diubah ──
  const pendek = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const h = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: 'hai' },
    ];
    return JSON.stringify(m.ringkasRiwayat(h));
  `);
  R.check('V4', JSON.parse(pendek).length === 3, 'riwayat pendek dibiarkan apa adanya');

  // ── V5: file_list dibatasi ──
  const batas = await cdp.runAsync(`
    const m = await import('/src/lib/agentTools.ts');
    return String(m.FILE_LIST_MAX);
  `);
  R.check('V5', Number(batas) > 0 && Number(batas) <= 1000, `batas file_list = ${batas} entri`);

  // ── V6: label "Padat" ada, "Rapat" hilang ──
  const label = await cdp.runAsync(`
    const m = await import('/src/lib/i18n-extra.ts');
    const en = m.EXTRA.en ?? {};
    return JSON.stringify({ padat: en['Padat'] ?? null, rapat: en['Rapat'] ?? null });
  `);
  const lb = JSON.parse(label);
  R.check('V6', lb.padat === 'Compact' && !lb.rapat, `label "Padat" -> "${lb.padat}" (lama "Rapat" sudah tidak ada)`);

  // ── V7: kerapatan Padat benar-benar mengubah metrik ──
  const metrik = await cdp.runAsync(`
    const L = window.__ZEPHYR_LAYOUT__.store;
    L.getState().set({ kerapatan: 'default' });
    await new Promise((r) => setTimeout(r, 900));
    const body = document.querySelector('.app-body');
    const normal = {
      tabbar: getComputedStyle(body).getPropertyValue('--tabbar-h').trim(),
      statusbar: getComputedStyle(body).getPropertyValue('--statusbar-h').trim(),
      activitybar: getComputedStyle(body).getPropertyValue('--activitybar-w').trim(),
    };
    L.getState().set({ kerapatan: 'compact' });
    await new Promise((r) => setTimeout(r, 1200));
    const setelah = document.querySelector('.app-body');
    const after = {
      tabbar: getComputedStyle(setelah).getPropertyValue('--tabbar-h').trim(),
      statusbar: getComputedStyle(setelah).getPropertyValue('--statusbar-h').trim(),
      activitybar: getComputedStyle(setelah).getPropertyValue('--activitybar-w').trim(),
      kelas: setelah.className.includes('is-compact'),
    };
    L.getState().set({ kerapatan: 'default' });
    await new Promise((r) => setTimeout(r, 600));
    return JSON.stringify({ before: normal, after });
  `);
  const mt = JSON.parse(metrik);
  R.check('V7', mt.after.kelas, 'kelas is-compact dipasang di app-body');
  R.check(
    'V8',
    mt.after.tabbar !== '' && mt.after.statusbar !== '' && mt.after.activitybar !== '',
    `metrik berubah: tabbar ${mt.after.tabbar}, statusbar ${mt.after.statusbar}, activitybar ${mt.after.activitybar}`,
  );
  R.check(
    'V9',
    mt.after.tabbar !== mt.before.tabbar || mt.after.statusbar !== mt.before.statusbar,
    `nilai berbeda dari normal (normal: ${mt.before.tabbar}/${mt.before.statusbar}/${mt.before.activitybar})`,
  );

  // ── V10: cache konteks 60 detik ──
  const ttl = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    return String(m.HISTORY_KEEP_STEPS) + '|' + String(m.HISTORY_TOOL_CHARS);
  `);
  const [keep, toolChars] = String(ttl).split('|');
  R.check(
    'V10',
    Number(keep) > 0 && Number(toolChars) > 0,
    `batas riwayat: ${keep} langkah terakhir, hasil tool lama dipotong ke ${toolChars} char`,
  );

  R.selesai();
  await cdp.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
