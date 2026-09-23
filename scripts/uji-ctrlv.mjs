// uji-ctrlv.mjs — bukti bug "Ctrl+V dobel" mati.
//
// Dua tes, masing-masing di PANE BARU supaya scrollback tes sebelumnya tidak
// ikut terhitung (jebakan: MARK dari tes A bikin hitungan tes B melambung).
//
//   A. jalur paste NATIF xterm masih hidup? (kalau ya, jalur kedua ada)
//   B. Ctrl+V asli → hanya SATU tempelan, keydown di-preventDefault, dan
//      event `paste` bawaan TIDAK pernah sampai ke textarea.
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
await sleep(400);

const MARKS = `UJICTRLV${Math.floor(Math.random() * 9000 + 1000)}`;

/** Buka pane shell baru + tunggu prompt siap. */
async function paneBaru() {
  return cdp.json(`
    S.getState().setSettingsOpen(false);
    await wait(300);
    window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
    TS().setVisible(true);
    const paneId = await TS().addPane('shell');
    await wait(3800);
    await wait(600);
    const ta = q('[data-pane-body="' + paneId + '"] .xterm-helper-textarea');
    if (!ta) return JSON.stringify({ error: 'textarea xterm tidak ketemu' });
    await PTY.write(paneId, '\\\\r');
    await wait(900);
    return JSON.stringify({ paneId });
  `, 60000);
}

/** Tutup pane supaya batas maxPanes tidak kena. */
async function tutupPane(paneId) {
  await cdp.runAsync(`TS().closePane(${JSON.stringify(paneId)}); await wait(500); return 'ok';`, 15000);
}

// ── TES A: apakah listener paste natif xterm masih terpasang? ──
const pa = await paneBaru();
if (pa.error) {
  console.log('GAGAL menyiapkan pane:', pa.error);
  process.exit(1);
}

const A = await cdp.json(`
  const paneId = ${JSON.stringify(pa.paneId)};
  const ta = q('[data-pane-body="' + paneId + '"] .xterm-helper-textarea');
  ta.focus();
  await wait(150);
  const dt = new DataTransfer();
  dt.setData('text/plain', ${JSON.stringify(MARKS)} + 'NATIF');
  ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await wait(1500);
  const buf = PTY.read(paneId, 60);
  const n = (buf.match(new RegExp(${JSON.stringify(MARKS)} + 'NATIF', 'g')) || []).length;
  return JSON.stringify({ natif: n });
`, 40000);

console.log('=== TES A: jalur paste natif xterm ===');
console.log(`  pane                 : ${pa.paneId}`);
console.log(`  teks natif sampai PTY: ${A.natif}x  ${A.natif > 0 ? '(jalur kedua ADA — preventDefault wajib)' : '(tidak aktif)'}`);
await tutupPane(pa.paneId);

// ── TES B: Ctrl+V asli di pane BERSIH ──
const pb = await paneBaru();
if (pb.error) {
  console.log('GAGAL menyiapkan pane B:', pb.error);
  process.exit(1);
}

// Perekam: hitung event `paste` bawaan + status defaultPrevented pada keydown.
await cdp.runAsync(`
  window.__CV = { pasteEvents: 0, prevented: null };
  const paneId = ${JSON.stringify(pb.paneId)};
  const ta = q('[data-pane-body="' + paneId + '"] .xterm-helper-textarea');
  ta.focus();
  ta.addEventListener('paste', () => { window.__CV.pasteEvents++; }, true);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'v') window.__CV.prevented = e.defaultPrevented;
  }, false);
  await wait(200);
  return 'ok';
`, 20000);

await cdp.runAsync(`
  await PTY.clipWrite(${JSON.stringify(MARKS)});
  return 'ok';
`, 15000);
await sleep(300);

await cdp.send('Input.dispatchKeyEvent', {
  type: 'rawKeyDown',
  modifiers: 2,
  windowsVirtualKeyCode: 86,
  nativeVirtualKeyCode: 86,
  key: 'v',
  code: 'KeyV',
});
await sleep(220);
await cdp.send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  modifiers: 2,
  windowsVirtualKeyCode: 86,
  nativeVirtualKeyCode: 86,
  key: 'v',
  code: 'KeyV',
});
await sleep(1800);

const B = await cdp.json(`
  const paneId = ${JSON.stringify(pb.paneId)};
  const buf = PTY.read(paneId, 80);
  const n = (buf.match(new RegExp(${JSON.stringify(MARKS)}, 'g')) || []).length;
  const rec = window.__CV || {};
  delete window.__CV;
  return JSON.stringify({ n, pasteEvents: rec.pasteEvents, prevented: rec.prevented, ekor: buf.slice(-200) });
`, 30000);

console.log('');
console.log('=== TES B: Ctrl+V asli (pane bersih) ===');
console.log(`  keydown di-preventDefault : ${B.prevented}`);
console.log(`  event paste bawaan lolos  : ${B.pasteEvents}x  ${B.pasteEvents === 0 ? '(dicegah — benar)' : '(MASIH LOLOS — dobel!)'}`);
console.log(`  teks muncul di buffer     : ${B.n}x`);
console.log('');
console.log('  ekor buffer:');
for (const l of String(B.ekor ?? '').split('\n').slice(-4)) console.log(`    ${l.slice(0, 110)}`);

await tutupPane(pb.paneId);

const lulus = B.n === 1 && B.prevented === true && B.pasteEvents === 0;
console.log('');
console.log(
  lulus
    ? '== LULUS: Ctrl+V menempel SEKALI, paste bawaan dicegah =='
    : `== GAGAL: buffer=${B.n}x (harus 1), prevented=${B.prevented}, pasteEvents=${B.pasteEvents} (harus 0) ==`,
);
process.exitCode = lulus ? 0 : 1;
cdp.close();
