/**
 * Uji: tombol "Open Browser Tab" membuka TAB browser yang benar-benar memuat.
 *
 * Dulu tombol ini menambah pane browser di dalam tab terminal dengan url
 * 'about:blank', jadi pane-nya hitam. Sekarang browser hidup sebagai tab di
 * area editor; yang harus dibuktikan sama: URL bukan about:blank, child
 * webview benar-benar dibuat, dan tidak ada layar galat.
 *
 * Uji ini sengaja membaca DOM saja (tanpa __ZEPHYR_TERM__ / __ZEPHYR__):
 * devBridge di-tree-shake dari build rilis, dan skrip ini dipakai untuk
 * memeriksa build rilis.
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9350';

async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.url.includes('tauri.localhost'));
  if (!t) throw new Error('target utama tidak ada');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  return { ws, send };
}
async function ev(send, expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.text };
  return r.result?.result?.value;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { ws, send } = await connect();
  const hasil = [];

  const cek = (nama, ok, info) => {
    hasil.push({ nama, ok, info });
    console.log((ok ? '  LULUS  ' : '  GAGAL  ') + nama + (info ? '  (' + info + ')' : ''));
  };

  // Buka panel terminal. Tombolnya hanya ada saat tab Terminal aktif DAN
  // pane-nya kosong, jadi kita tunggu sampai benar-benar muncul - kalau tidak,
  // uji ini gagal karena waktu, bukan karena bug.
  await ev(send, `(()=>{const b=[...document.querySelectorAll('.pts-tab')].find(x=>/^Terminal$/i.test(x.textContent.trim())); if(b) b.click(); return 1;})()`);

  let tadi = false;
  for (let i = 0; i < 40; i++) {
    tadi = await ev(send, `!!document.querySelector('[data-testid="empty-split-browser"]')`);
    if (tadi) break;
    await wait(500);
  }
  cek('tombol Open Browser Tab tersedia di panel', tadi === true, 'tunggu sampai ada');

  // Klik tombolnya: sekarang membuka tab browser di area editor.
  const klik = await ev(send, `(()=>{
    const b=document.querySelector('[data-testid="empty-split-browser"]');
    if(!b) return {ada:false};
    b.click(); return {ada:true};
  })()`);
  cek('tombol Open Browser Tab ditemukan', klik?.ada === true, JSON.stringify(klik));
  await wait(7000);

  // 1. URL di toolbar tab browser tidak boleh about:blank.
  //
  // CATATAN: `window.__ZEPHYR_TERM__` hanya ada di mode dev (devBridge di
  // tree-shake dari build rilis). Di rilis kita baca store lewat jalur yang
  // selalu tersedia: DOM. Tab browser dikenali dari host-nya (.bp-tab-host,
  // lihat SplitEditor) atau dari kelas .bp-tab-pane di root komponennya.
  const paneInfo = await ev(send, `(()=>{
    const panes=[...document.querySelectorAll('[data-pane-kind]')].map(e=>({
      kind:e.getAttribute('data-pane-kind'),
      id:e.getAttribute('data-pane-body')||e.getAttribute('data-pane-id')||null,
    }));
    const bp=document.querySelector('.browser-pane.bp-tab-pane')||document.querySelector('.bp-tab-host .browser-pane');
    const st=document.querySelector('[data-testid="bp-stage"]');
    const bar=document.querySelector('[data-testid="bp-url"]');
    return {
      panes,
      // Panel bawah kini hanya berisi pane PTY; browser tidak lagi di sana.
      adaPaneBrowserDiPanel: [...document.querySelectorAll('[data-pane-kind]')].some(e=>e.getAttribute('data-pane-kind')==='browser'),
      adaBrowserTab: !!bp,
      adaHostTab: !!document.querySelector('.bp-tab-host'),
      urlDiBar: bar ? (bar.value||'').trim() : null,
      adaStage: !!st,
      stageRect: st ? (r=>({w:Math.round(r.width),h:Math.round(r.height)}))(st.getBoundingClientRect()) : null,
    };
  })()`);
  console.log('    [info tab] ' + JSON.stringify(paneInfo));

  const url = paneInfo?.urlDiBar || '';
  cek('tab browser ter-render di area editor', paneInfo?.adaBrowserTab === true && paneInfo?.adaHostTab === true,
      'adaBrowserTab=' + paneInfo?.adaBrowserTab + ' adaHostTab=' + paneInfo?.adaHostTab);
  cek('panel terminal TIDAK lagi memuat pane browser', paneInfo?.adaPaneBrowserDiPanel === false,
      'adaPaneBrowserDiPanel=' + paneInfo?.adaPaneBrowserDiPanel);
  cek('url di toolbar BUKAN about:blank / kosong',
      !!url && url !== 'about:blank' && !url.startsWith('about:'),
      'url=' + (url || '-'));
  cek('stage browser punya ukuran', paneInfo?.adaStage === true && (paneInfo?.stageRect?.w ?? 0) > 100,
      JSON.stringify(paneInfo?.stageRect));

  // 2. child webview benar-benar dibuat (target CDP bertambah)
  const l2 = await (await fetch(CDP + '/json/list')).json();
  const anak = l2.filter(t => !t.url.includes('tauri.localhost'));
  const isiAnak = anak.map(t => t.url).filter(u => u && u !== 'about:blank' && !u.startsWith('devtools'));
  cek('child webview dibuat (target CDP baru)', anak.length >= 1, 'target=' + l2.length + ' anak=' + anak.length);
  cek('webview memuat halaman NYATA (bukan kosong)', isiAnak.length >= 1, JSON.stringify(isiAnak.slice(0, 3)));

  // 3. tidak ada pesan error di pane
  const galat = await ev(send, `(()=>{
    const e=document.querySelector('[data-testid="bp-error"]');
    return {adaError:!!e, teks:e?e.innerText.slice(0,150):null, blank:!!document.querySelector('[data-testid="bp-blank"]')};
  })()`);
  cek('tidak ada pesan error di pane', galat?.adaError === false, JSON.stringify(galat));
  cek('bukan layar kosong (.bp-blank tidak muncul)', galat?.blank === false, 'blank=' + galat?.blank);

  const lulus = hasil.filter(h => h.ok).length;
  console.log('');
  console.log('== ' + lulus + '/' + hasil.length + ' lulus ==');
  ws.close();
  if (lulus !== hasil.length) process.exitCode = 1;
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
