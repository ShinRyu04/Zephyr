/*
 * Bukti: Ctrl+Shift+B menjalankan program di TERMINAL yang bisa diketik,
 * bukan di panel Output yang hanya menampilkan teks.
 *
 *   R1  run membuat pane terminal (bukan hanya kanal Output)
 *   R2  perintah compile+run ditulis ke pane, di folder sumber
 *   R3  program yang meminta input MENERIMA ketikan dan menyelesaikan output
 *   R3b output program benar
 *   R4  setelah program selesai status kembali "ok" dan pane dilepas
 *   R5  run.stop menutup pane (program ikut berhenti)
 *
 * Fixture dibuat oleh harness ini sendiri di `scratch/uji-run/` - BUKAN di
 * `testfiles/`, karena Vite memantau folder itu dan file .py yang sedang
 * dieksekusi membuat dev server crash EBUSY lalu jendela Agents mati.
 *
 * Prasyarat: app dev + port debug 9223, g++ dan python di PATH.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const DIR = 'D:/Zephyr/scratch/uji-run';
const CPP = `${DIR}/uji-run-interaktif.cpp`;
const PY = `${DIR}/uji-run-input.py`;
mkdirSync(DIR, { recursive: true });
writeFileSync(
  CPP,
  '#include <iostream>\n#include <string>\nusing namespace std;\nint main(){string n;int u=0;cout<<"Nama: ";if(!(cin>>n))return 2;cout<<"Umur: ";if(!(cin>>u))return 3;cout<<"Halo "<<n<<", umur kamu "<<u<<" tahun."<<endl;return 0;}\n',
  'utf8',
);

const list = async () => (await (await fetch('http://127.0.0.1:9223/json/list')).json()).filter((t) => t.type === 'page');
const main = (await list()).find((t) => !(t.url ?? '').includes('from=') && !(t.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(main.webSocketDebuggerUrl);

async function J(expr, ms = 180000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/* Jalankan satu file di terminal, kirim dua baris, kembalikan buktinya. */
async function jalankanInteraktif(path, balasan) {
  return J(`await (async () => {
    const run = (window.__ZEPHYR_RUN__.store ?? window.__ZEPHYR_RUN__);
    const term = (window.__ZEPHYR_TERM__.store ?? window.__ZEPHYR_TERM__);
    const PTY = window.__ZEPHYR_PTY__;
    run.getState().reset();
    await wait(500);
    const paneSebelum = term.getState().allPanes().length;
    const ok = await run.getState().jalankan(${JSON.stringify(path)});
    const paneId = run.getState().paneId;
    const out = {
      ok,
      paneDibuat: !!paneId && term.getState().allPanes().length > paneSebelum,
      paneKind: paneId ? (term.getState().findPane(paneId)?.kind ?? null) : null,
      terminalTerlihat: term.getState().visible,
    };
    if (!paneId) return out;

    let buf = '';
    for (let i = 0; i < 80; i += 1) {
      await wait(250);
      buf = PTY.read(paneId, 80) || '';
      if (buf.includes('Nama:')) break;
    }
    out.perintahDitulis = PTY.read(paneId, 120).split('\\n').join('').includes('uji-run-interaktif.cpp');

    let siap = false;
    for (let i = 0; i < 240; i += 1) {
      await wait(250);
      buf = PTY.read(paneId, 80) || '';
      if (buf.includes('Nama:')) { siap = true; break; }
      if (run.getState().status !== 'running') break;
    }
    out.promptMuncul = siap;
    if (siap) {
      for (let i = 0; i < 6; i += 1) {
        await PTY.write(paneId, ${JSON.stringify(balasan[0])} + '\\r');
        await wait(400);
        if ((PTY.read(paneId, 80) || '').includes('Umur:')) break;
      }
      for (let i = 0; i < 6; i += 1) {
        await PTY.write(paneId, ${JSON.stringify(balasan[1])} + '\\r');
        await wait(400);
        if ((PTY.read(paneId, 80) || '').replace(/\\s+/g, '').includes('Halo${'$'}{${JSON.stringify(balasan[0])}}'.replace(/\\s+/g, ''))) break;
      }
      for (let i = 0; i < 160 && run.getState().status === 'running'; i += 1) await wait(250);
    }
    buf = PTY.read(paneId, 160) || '';
    const rapat = buf.replace(/\\s+/g, '');
    out.ketikanDiterima = rapat.includes(${JSON.stringify(balasan[0])}) && rapat.includes(${JSON.stringify(balasan[1])});
    out.outputBenar = rapat.includes('Halo' + ${JSON.stringify(balasan[0])}) && rapat.includes('umurkamu' + ${JSON.stringify(balasan[1])} + 'tahun');
    out.statusAkhir = run.getState().status;
    out.paneDilepas = run.getState().paneId === null;
    return out;
  })()`);
}

const cpp = await jalankanInteraktif(CPP, ['Budi', '20']);

/* R5: Stop pada run baru harus menutup pane-nya */
const stop = await J(`await (async () => {
  const run = (window.__ZEPHYR_RUN__.store ?? window.__ZEPHYR_RUN__);
  const term = (window.__ZEPHYR_TERM__.store ?? window.__ZEPHYR_TERM__);
  run.getState().reset();
  await wait(400);
  const ok2 = await run.getState().jalankan(${JSON.stringify(CPP)});
  const paneId2 = run.getState().paneId;
  for (let i = 0; i < 40; i += 1) {
    await wait(250);
    if (paneId2 && term.getState().findPane(paneId2)?.status === 'live') break;
  }
  const dihentikan = await run.getState().hentikan();
  await wait(800);
  const hasil = {
    ok2,
    dihentikan,
    paneHilang: !!paneId2 && !term.getState().findPane(paneId2),
    statusSetelahStop: run.getState().status,
  };
  run.getState().reset();
  return hasil;
})()`);

/* Bahasa kedua (Python): membuktikan jalur ini bukan khusus C/C++. */
writeFileSync(PY, 'nama = input("Nama: ")\numur = input("Umur: ")\nprint(f"Halo {nama}, umur kamu {umur} tahun.")\n', 'utf8');
const py = await J(`await (async () => {
  const run = (window.__ZEPHYR_RUN__.store ?? window.__ZEPHYR_RUN__);
  const term = (window.__ZEPHYR_TERM__.store ?? window.__ZEPHYR_TERM__);
  const PTY = window.__ZEPHYR_PTY__;
  run.getState().reset();
  await wait(400);
  const ok = await run.getState().jalankan(${JSON.stringify(PY)});
  const paneId = run.getState().paneId;
  if (!paneId) return { ok, paneId: null };
  let buf = '';
  let siap = false;
  for (let i = 0; i < 240; i += 1) {
    await wait(250);
    buf = PTY.read(paneId, 80) || '';
    if (buf.includes('Nama:')) { siap = true; break; }
    if (run.getState().status !== 'running') break;
  }
  if (siap) {
    for (let i = 0; i < 6; i += 1) {
      await PTY.write(paneId, 'Sinta\\r');
      await wait(400);
      if ((PTY.read(paneId, 80) || '').includes('Umur:')) break;
    }
    for (let i = 0; i < 6; i += 1) {
      await PTY.write(paneId, '19\\r');
      await wait(400);
      if ((PTY.read(paneId, 80) || '').replace(/\\s+/g, '').includes('HaloSinta')) break;
    }
    for (let i = 0; i < 120 && run.getState().status === 'running'; i += 1) await wait(250);
  }
  const rapat = (PTY.read(paneId, 160) || '').replace(/\\s+/g, '');
  const hasil = { ok, siap, outputBenar: rapat.includes('HaloSinta'), status: run.getState().status };
  run.getState().reset();
  return hasil;
})()`);

cdp.close();
try { rmSync(DIR, { recursive: true, force: true }); } catch { /* file bisa masih dipegang program */ }

console.log(JSON.stringify({ cpp, stop, py }, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek('R1 run membuat pane terminal', cpp?.ok === true && cpp?.paneDibuat === true, `kind=${cpp?.paneKind}`);
cek('R2 perintah compile+run ditulis ke pane sumber', cpp?.perintahDitulis === true, '');
cek('R3 program menerima ketikan user', cpp?.promptMuncul === true && cpp?.ketikanDiterima === true, `prompt=${cpp?.promptMuncul} ketik=${cpp?.ketikanDiterima}`);
cek('R3b output program benar', cpp?.outputBenar === true, '');
cek('R4 status kembali ok dan pane dilepas', cpp?.statusAkhir === 'ok' && cpp?.paneDilepas === true, `status=${cpp?.statusAkhir}`);
cek('R5 Stop menutup pane dan menghentikan program', stop?.dihentikan === true && stop?.paneHilang === true, `status=${stop?.statusSetelahStop}`);
cek('R6 bahasa lain (Python) juga interaktif', py?.ok === true && py?.siap === true && py?.outputBenar === true && py?.status === 'ok', `status=${py?.status}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);