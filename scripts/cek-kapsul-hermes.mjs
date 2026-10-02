/**
 * cek-kapsul-hermes.mjs - buktikan kapsul status menyatu dengan kotak input.
 *
 *   node scripts/cek-kapsul-hermes.mjs [port]
 *
 * ## Kenapa memakai bridge dev, bukan import()
 *
 * Percobaan pertama berkas ini menulis daftar tugas lewat `import()` dari skrip
 * CDP, lalu heran karena kapsulnya tidak muncul walaupun store berisi. Sebabnya:
 * `import('/src/lib/aiStore.ts')` dari luar aplikasi membuat Vite memuat modul
 * BARU di luar grafik modul yang sudah jalan - jadi skrip menulis ke satu store,
 * sementara komponen membaca store yang lain. Komponennya sehat; ukurannya yang
 * salah.
 *
 * Karena itu semua penulisan lewat `window.__ZEPHYR_TODO__`, yang memakai modul
 * yang SUDAH dimuat aplikasi - store yang sama dengan yang dibaca komponen.
 *
 * Ditulis sebagai satu sambungan: di mesin ini WebView2 menutup CDP saat idle,
 * jadi memisahkan tulis dan baca ke dua proses membuat sambungan kedua gagal.
 *
 * Yang diperiksa bukan "apakah elemennya ada", melainkan apakah ia benar-benar
 * TERBACA SEBAGAI SATU KAPSUL. Dua kotak bisa punya kelas yang tepat dan tetap
 * terlihat terpisah - itu masalah yang sedang diperbaiki, jadi mengukur
 * keberadaan kelas saja tidak membuktikan apa pun.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const h = await cdp.json(`return JSON.stringify(await (async () => {
  const tulis = await window.__ZEPHYR_TODO__.tulis([
    { id: 'k1', title: 'Periksa kapsul bersatu', status: 'completed' },
    { id: 'k2', title: 'Ukur radius dan celah', status: 'in_progress' },
    { id: 'k3', title: 'Bandingkan tepi kiri', status: 'pending' },
  ]);
  await new Promise((r) => setTimeout(r, 700));

  const k = document.querySelector('.composer-status-stack');
  const input = document.querySelector('.ai-input-row');
  const has = { kapsul: !!k, input: !!input, tulis: String(tulis).slice(0, 100) };
  if (!k || !input) return { ...has, error: 'kapsul atau input tidak ada' };

  const ck = getComputedStyle(k);
  const ci = getComputedStyle(input);
  const rk = k.getBoundingClientRect();
  const ri = input.getBoundingClientRect();

  return {
    ...has,
    radiusAtasKapsul: ck.borderTopLeftRadius,
    radiusBawahKapsul: ck.borderBottomLeftRadius,
    radiusAtasInput: ci.borderTopLeftRadius,
    radiusBawahInput: ci.borderBottomLeftRadius,
    lebarKapsul: Math.round(rk.width),
    lebarInput: Math.round(ri.width),
    tepiKiriSelisih: Math.abs(rk.left - ri.left),
    celahVertikal: Math.round(ri.top - rk.bottom),
    barisTugas: k.querySelectorAll('.todo-row').length,
    menuTitikTiga: !!k.querySelector('.composer-action-btn'),
    popoverSubagents: !!document.querySelector('[data-testid="ai-subagents-trigger"]'),
  };
})())`);

let lulus = 0;
let gagal = 0;
const cek = (nama, syarat, rincian) => {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + JSON.stringify(rincian) : ''));
  }
};

if (h.error) {
  console.log('  GAGAL  ' + h.error);
  console.log('\n== 0/1 lulus ==');
  await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TODO__.bersih())`);
  await cdp.close();
  process.exit(1);
}

const num = (v) => parseFloat(v) || 0;

console.log('\n== Bentuk kapsul bersatu ==');
cek('kapsul atas melengkung', num(h.radiusAtasKapsul) > 0, { dapat: h.radiusAtasKapsul });
cek('kapsul bawah LURUS (menempel input)', num(h.radiusBawahKapsul) === 0, { dapat: h.radiusBawahKapsul });
cek('input atas LURUS (menyambung kapsul)', num(h.radiusAtasInput) === 0, { dapat: h.radiusAtasInput });
cek('input bawah melengkung', num(h.radiusBawahInput) > 0, { dapat: h.radiusBawahInput });
cek('lebar kapsul = lebar input', h.lebarKapsul === h.lebarInput, {
  kapsul: h.lebarKapsul,
  input: h.lebarInput,
});
cek('tepi kiri sejajar', h.tepiKiriSelisih <= 1, { selisih: h.tepiKiriSelisih });
cek('tidak ada celah vertikal', h.celahVertikal <= 1, { celah: h.celahVertikal });

console.log('\n== Isi kapsul ==');
cek('tiga baris tugas tampil', h.barisTugas === 3, { dapat: h.barisTugas });
cek('menu titik tiga ada', h.menuTitikTiga);
cek('popover subagents hilang', h.popoverSubagents === false);

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');

await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TODO__.bersih())`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
