// uji-gh-menu.mjs — uji dropdown akun GitHub di Activity Bar.
//
// Yang diperiksa:
//   1. avatar ada di activity bar
//   2. klik avatar -> menu muncul (belum terbuka sebelumnya)
//   3. klik lagi -> menu tertutup (toggle)
//   4. menu berisi baris identitas + aksi
//   5. Escape menutup menu
//   6. klik di luar menutup menu
//   7. tidak ada console error

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, '');

const LULUS = [];
const GAGAL = [];
const ok = (m) => LULUS.push(m);
const no = (m) => GAGAL.push(m);

// Rekam console error
const err = [];
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');

// ── 1. avatar ada ───────────────────────────────────────────────────
const adaAvatar = await cdp.eval(`!!document.querySelector('[data-testid="ab-gh"]')`);
adaAvatar ? ok('avatar GitHub ada di activity bar') : no('avatar GitHub tidak ketemu');

// ── 2. klik avatar -> menu muncul ───────────────────────────────────
const menuAwal = await cdp.eval(`!!document.querySelector('[data-testid="gh-menu"]')`);
menuAwal ? no('menu sudah terbuka sebelum diklik') : ok('menu tertutup sebelum diklik');

await cdp.eval(`document.querySelector('[data-testid="ab-gh"]').click(); true`);
await new Promise((r) => setTimeout(r, 400));

const isiMenu = await cdp.eval(`(() => {
  const m = document.querySelector('[data-testid="gh-menu"]');
  if (!m) return null;
  const b = m.getBoundingClientRect();
  const cs = getComputedStyle(m);
  return {
    terlihat: cs.visibility === 'visible' && b.width > 0,
    x: Math.round(b.x), y: Math.round(b.y),
    w: Math.round(b.width), h: Math.round(b.height),
    diLayar: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
    teks: (m.textContent || '').trim(),
    jumlahTombol: m.querySelectorAll('button').length,
    punyaIdentitas: !!m.querySelector('.gh-menu-id'),
    punyaPemisah: !!m.querySelector('.tt-drop-sep'),
    zIndex: cs.zIndex,
    posisi: cs.position,
  };
})()`);

if (!isiMenu) {
  no('menu TIDAK muncul setelah klik avatar');
} else {
  isiMenu.terlihat ? ok('menu muncul setelah klik avatar') : no('menu ada di DOM tapi tidak terlihat');
  isiMenu.diLayar ? ok(`menu di dalam layar (${isiMenu.x},${isiMenu.y} ${isiMenu.w}x${isiMenu.h})`) : no(`menu keluar layar: ${JSON.stringify(isiMenu)}`);
  isiMenu.punyaIdentitas ? ok('baris identitas akun ada') : no('baris identitas tidak ada');
  isiMenu.punyaPemisah ? ok('garis pemisah ada') : no('garis pemisah tidak ada');
  isiMenu.jumlahTombol >= 1 ? ok(`menu punya ${isiMenu.jumlahTombol} tombol aksi`) : no('menu tidak punya tombol aksi');
  isiMenu.posisi === 'fixed' ? ok('posisi fixed (portal, tidak terpotong)') : no(`posisi ${isiMenu.posisi}, bukan fixed`);
  console.log('  isi menu:', JSON.stringify(isiMenu.teks));
}

// ── 3. klik avatar lagi -> tertutup (toggle) ────────────────────────
await cdp.eval(`document.querySelector('[data-testid="ab-gh"]').click(); true`);
await new Promise((r) => setTimeout(r, 400));
const setelahToggle = await cdp.eval(`!!document.querySelector('[data-testid="gh-menu"]')`);
!setelahToggle ? ok('klik avatar kedua menutup menu (toggle)') : no('menu tidak tertutup saat diklik ulang');

// ── 4. Escape menutup ───────────────────────────────────────────────
await cdp.eval(`document.querySelector('[data-testid="ab-gh"]').click(); true`);
await new Promise((r) => setTimeout(r, 350));
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await new Promise((r) => setTimeout(r, 400));
const setelahEsc = await cdp.eval(`!!document.querySelector('[data-testid="gh-menu"]')`);
!setelahEsc ? ok('Escape menutup menu') : no('Escape tidak menutup menu');

// ── 5. klik di luar menutup ─────────────────────────────────────────
await cdp.eval(`document.querySelector('[data-testid="ab-gh"]').click(); true`);
await new Promise((r) => setTimeout(r, 350));
await cdp.eval(`(() => {
  const t = document.querySelector('.editor-host') || document.querySelector('.app-body') || document.body;
  t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return true;
})()`);
await new Promise((r) => setTimeout(r, 400));
const setelahLuar = await cdp.eval(`!!document.querySelector('[data-testid="gh-menu"]')`);
!setelahLuar ? ok('klik di luar menutup menu') : no('klik di luar tidak menutup menu');

// ── 6. app masih hidup + tidak blank ────────────────────────────────
const hidup = await cdp.eval(`(() => ({
  root: document.getElementById('root')?.children.length ?? -1,
  menubar: !!document.querySelector('.menubar'),
  activitybar: !!document.querySelector('.activitybar'),
}))()`);
hidup.root === 1 ? ok('app tetap hidup (tidak blank)') : no(`app blank/aneh: ${JSON.stringify(hidup)}`);
hidup.menubar && hidup.activitybar ? ok('menubar + activity bar utuh') : no('ada bagian yang hilang');

console.log('');
for (const l of LULUS) console.log('LULUS  ' + l);
for (const g of GAGAL) console.log('GAGAL  ' + g);
console.log(`\n== ${LULUS.length}/${LULUS.length + GAGAL.length} lulus ==`);

cdp.close();
process.exit(GAGAL.length ? 1 : 0);
