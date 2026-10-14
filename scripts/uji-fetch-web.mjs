/**
 * uji-fetch-web.mjs — bukti kemampuan AMBIL-WEB (`src/lib/zephyrTools/ambilWeb.ts`).
 *
 * Kenapa ini penting: AMBIL-WEB adalah satu-satunya jalan agen menarik isi dari
 * internet tanpa memanggil shell. Kalau gerbangnya bocor, yang bocor bukan cuma
 * satu halaman - agen bisa ditarik ke alamat internal mesin (metadata cloud
 * 169.254.169.254, layanan di 127.0.0.1), atau mengirim kredensial ke host yang
 * tidak pernah disetujui siapa pun. Uji ini menembak TIAP klaim itu, bukan
 * menyimpulkannya dari membaca kode.
 *
 * Yang diuji (33 pemeriksaan):
 *   A. Gerbang URL   : host luar izin, allowlist kosong, trik akhiran, http,
 *                      localhost/127.0.0.1/169.254/10.x/192.168/::1/.internal,
 *                      skema terlarang, port tak lazim, izin lokal wajib
 *   B. Keluaran      : potong byte, potong tidak memecah UTF-8, potong karakter,
 *                      JSON dibaca sebagai DATA, JSON rusak tidak dikarang,
 *                      JSON terpotong tidak menghasilkan data palsu, sensor
 *                      rahasia, batas dijepit ke plafon
 *   C. Waktu/redirect: batas waktu berlaku (transport menggantung), redirect
 *                      tiap hop diperiksa, rantai redirect dibatasi, redirect
 *                      sah diterima, transport gagal dilaporkan
 *   D. Disiplin      : server loopback NYATA (tanpa izin = nol permintaan),
 *                      jalur simpan berkas + gerbang jalur, determinisme,
 *                      nol shell, nol jaringan publik, nol baca .env/API key
 *   E. Pemeriksaan silang: `tsc --noEmit` 0 galat
 *
 * Deterministik & hermetik: transport jaringan DISUNTIK (peta tetap di memori),
 * kecuali SATU kasus yang memakai server `node:http` di 127.0.0.1 dengan port
 * ephemeral - bukan jaringan publik. Jaringan luar mesin ini dilarang keras oleh
 * jaring di bawah: setiap upaya menyentuh alamat non-loopback menambah hitungan
 * `jaringanPublik` DAN melempar.
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-fetch-web.mjs
 */
import { reporter, keluarBersih } from './lib-cdp.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import cp from 'node:child_process';

const R = reporter('ambil web (modul ambilWeb.ts)');
let gagal = false;
const checkAsli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  checkAsli(id, ok, detail);
};

/* ================================================================== */
/* Jaring 1: hitungan & larangan                                      */
/* ================================================================== */

const hitung = {
  shell: 0,
  shellNama: [],
  jaringanPublik: 0,
  jaringanNama: [],
  loopback: 0,
  bacaRahasia: 0,
  bacaRahasiaJalur: [],
};

const asli = {
  spawn: cp.spawn,
  spawnSync: cp.spawnSync,
  exec: cp.exec,
  execSync: cp.execSync,
  execFile: cp.execFile,
  execFileSync: cp.execFileSync,
  fork: cp.fork,
};

/* Shell: dilarang mutlak. Dipasang SEBELUM modul diimpor. */
for (const nama of Object.keys(asli)) {
  cp[nama] = () => {
    hitung.shell++;
    hitung.shellNama.push(nama);
    throw new Error(`SHELL DIPANGGIL: child_process.${nama}`);
  };
}

/* Jaringan luar mesin: dilarang mutlak. Loopback tetap boleh (kasus W23-W24).
   Pagar dipasang di TINGKAT URL/host — http(s).request/get, net.createConnection,
   tls.connect, dns.lookup, fetch — bukan di net.Socket.prototype.connect.
   Alasannya empiris: Node memanggil prototype connect dengan opsi yang sudah
   ternormalisasi (host kosong), jadi pagar di sana memblokir koneksi loopback
   yang sah dan justru berbohong. Catatan jujur: `Agent.prototype.createConnection`
   disalin dari `net.createConnection` saat Node dimuat, jadi jalur itu lolos dari
   pagar ini. Karena itu bukti utama "nol jaringan publik" bukan pagar ini,
   melainkan W28: modul AMBIL-WEB tidak mengimpor apa pun. Pagar ini menangkap
   sentuhan publik yang tidak sengaja dari harness sendiri. */
function pagarJaringan(nama, host) {
  const h = String(host ?? '').replace(/^\[/, '').replace(/\]$/, '');
  if (h === '127.0.0.1' || h === '::1' || h === 'localhost') {
    hitung.loopback++;
    return;
  }
  hitung.jaringanPublik++;
  hitung.jaringanNama.push(`${nama}->${h || '(kosong)'}`);
  throw new Error(`JARINGAN PUBLIK DITOLAK DI UJI: ${nama} -> ${h || '(host kosong)'}`);
}
function hostDariHttp(input, options) {
  if (typeof input === 'string') {
    try {
      return new URL(input, 'http://localhost').hostname;
    } catch {
      return '';
    }
  }
  if (input instanceof URL) return input.hostname;
  if (input && typeof input === 'object') return input.hostname ?? input.host ?? '';
  return options?.hostname ?? options?.host ?? '';
}
function hostDariOpsi(a) {
  if (typeof a === 'string') return a;
  if (a && typeof a === 'object') return a.host ?? a.hostname ?? '';
  return '';
}

const httpRequestAsli = http.request.bind(http);
const httpGetAsli = http.get.bind(http);
http.request = (...a) => {
  pagarJaringan('http.request', hostDariHttp(a[0], a[1]));
  return httpRequestAsli(...a);
};
http.get = (...a) => {
  pagarJaringan('http.get', hostDariHttp(a[0], a[1]));
  return httpGetAsli(...a);
};
https.request = (...a) => {
  pagarJaringan('https.request', hostDariHttp(a[0], a[1]));
  throw new Error('https tidak dipakai di uji ini');
};
https.get = (...a) => {
  pagarJaringan('https.get', hostDariHttp(a[0], a[1]));
  throw new Error('https tidak dipakai di uji ini');
};
const createConnectionAsli = net.createConnection.bind(net);
net.createConnection = (...a) => {
  pagarJaringan('net.createConnection', hostDariOpsi(a[0]));
  return createConnectionAsli(...a);
};
tls.connect = (...a) => {
  pagarJaringan('tls.connect', hostDariOpsi(a[0]));
  throw new Error('tls tidak dipakai di uji ini');
};
const lookupAsli = dns.lookup;
dns.lookup = function (hostname, ...rest) {
  pagarJaringan('dns.lookup', hostname);
  return lookupAsli.call(dns, hostname, ...rest);
};
const fetchAsli = globalThis.fetch;
globalThis.fetch = (input) => {
  pagarJaringan('fetch', typeof input === 'string' ? new URL(input).hostname : '');
  return fetchAsli(input);
};

/* Membaca berkas rahasia: dilarang. Berkas biasa (sumber, temp) lolos. */
const POLA_RAHASIA_JALUR = /(^|[\\/])\.env([.\w-]*)$|\.(pem|key|p12|pfx)$|(^|[\\/])(id_rsa|id_ed25519|credentials|\.netrc|\.npmrc|\.git-credentials)$/i;
function panggungBaca(fn, ambilJalur) {
  return function (...args) {
    const jalur = ambilJalur(args);
    if (jalur && POLA_RAHASIA_JALUR.test(String(jalur))) {
      hitung.bacaRahasia++;
      hitung.bacaRahasiaJalur.push(String(jalur));
      throw new Error(`BACA RAHASIA DITOLAK: ${jalur}`);
    }
    return fn.apply(this, args);
  };
}
fs.readFileSync = panggungBaca(fs.readFileSync, (a) => a[0]);
fs.readFile = panggungBaca(fs.readFile, (a) => a[0]);
fs.openSync = panggungBaca(fs.openSync, (a) => a[0]);
fs.createReadStream = panggungBaca(fs.createReadStream, (a) => a[0]);
if (fs.promises && typeof fs.promises.readFile === 'function') {
  fs.promises.readFile = panggungBaca(fs.promises.readFile, (a) => a[0]);
}

/* ================================================================== */
/* Modul yang diuji                                                    */
/* ================================================================== */

const M = await import('../src/lib/zephyrTools/ambilWeb.ts');

/* ================================================================== */
/* Alat bantu uji                                                      */
/* ================================================================== */

const HOST = 'uji.contoh.org';
const base = (p) => `https://${HOST}${p}`;

/** Transport berbasis peta tetap. `catat` merekam URL+opsi tiap panggilan. */
function transportPeta(peta, catat = []) {
  return async (url, opsi) => {
    catat.push({ url, opsi });
    const isi = peta.get(url);
    if (!isi) return { status: 404, header: {}, body: '', url };
    if (typeof isi === 'function') return isi(url, opsi);
    return { status: 200, header: {}, body: '', url, ...isi };
  };
}

const peta = new Map();
const panggilan = [];

peta.set(base('/data.json'), {
  status: 200,
  header: { 'content-type': 'application/json' },
  body: JSON.stringify({ total: 42, items: [{ n: 1 }, { n: 2 }], kunci: 'sk-abcdefghijklmnopqrstuvwxyz012345' }),
});
peta.set(base('/teks.html'), {
  status: 200,
  header: { 'content-type': 'text/html' },
  body: '<html><body><h1>Halo</h1><p>teks biasa</p></body></html>',
});
peta.set(base('/rusak.json'), {
  status: 200,
  header: { 'content-type': 'application/json' },
  body: 'bukan-json-sama-sekali',
});
peta.set(base('/besar.json'), {
  status: 200,
  header: { 'content-type': 'application/json' },
  body: JSON.stringify({ isi: 'x'.repeat(20000) }),
});
peta.set(base('/besar.txt'), {
  status: 200,
  header: { 'content-type': 'text/plain' },
  body: 'a'.repeat(50000),
});
peta.set(base('/putar-luar'), {
  status: 302,
  header: { location: 'https://luar.jahat.com/curi' },
  body: '',
});
peta.set(base('/putar-izin'), {
  status: 302,
  header: { location: base('/data.json') },
  body: '',
});
for (let i = 0; i < 8; i++) {
  peta.set(base(`/r${i}`), { status: 302, header: { location: base(`/r${i + 1}`) }, body: '' });
}
peta.set(base('/r8'), { status: 200, header: { 'content-type': 'text/plain' }, body: 'ujung' });

const izin = M.izinHost([HOST]);
const ambil = (permintaan) => M.ambilWeb(permintaan, transportPeta(peta, panggilan));

/* ================================================================== */
/* A. Gerbang URL — transport TIDAK boleh pernah dipanggil             */
/* ================================================================== */

const nolTransport = () => {
  const sebelum = panggilan.length;
  return async (permintaan) => {
    const hasil = await ambil(permintaan);
    return { hasil, dipanggil: panggilan.length - sebelum };
  };
};

{
  const uji = await nolTransport()({ url: base('/data.json'), izin: M.izinHost(['lain.org']) });
  R.check('W01', !uji.hasil.ok && uji.hasil.sebab.includes('allowlist') && uji.dipanggil === 0,
    `host luar izin ditolak, transport 0x (${uji.dipanggil}) — ${uji.hasil.sebab}`);

  const kosong = await nolTransport()({ url: base('/data.json'), izin: M.IZIN_TOLAK });
  R.check('W02', !kosong.hasil.ok && kosong.hasil.sebab.includes('allowlist host kosong') && kosong.dipanggil === 0,
    `allowlist kosong = tolak semua, transport 0x (${kosong.dipanggil}) — ${kosong.hasil.sebab}`);

  const trik = M.periksaUrlAmbilWeb('https://uji.contoh.org.jahat.com/x', izin);
  R.check('W03', !trik.ok,
    `trik akhiran "contoh.org.jahat.com" ditolak — ${trik.sebab}`);

  const http = M.periksaUrlAmbilWeb('http://uji.contoh.org/data.json', izin);
  R.check('W04', !http.ok && http.sebab.includes('https'),
    `http (bukan https) ditolak — ${http.sebab}`);

  const lokal = [];
  for (const u of [
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://[::1]/x',
    'https://172.20.3.4/x',
    'https://router.internal/x',
    'https://box.local/x',
    'https://100.100.100.100/x',
  ]) {
    const izinLokalList = M.izinHost([new URL(u).hostname.replace(/^\[/, '').replace(/\]$/, '')]);
    const hasil = M.periksaUrlAmbilWeb(u, izinLokalList);
    lokal.push({ u, ok: hasil.ok, sebab: hasil.sebab });
  }
  const lokalDitolak = lokal.filter((l) => !l.ok).length;
  R.check('W05', lokalDitolak === lokal.length,
    `10/10 alamat lokal/privat/link-local ditolak tanpa izin (${lokalDitolak}/${lokal.length}); contoh — ${lokal[2].sebab}`);

  const skema = [];
  for (const u of ['file:///etc/passwd', 'data:text/html,<b>x</b>', 'javascript:alert(1)', 'C:\\Users\\rahasia.txt', 'uji.contoh.org/data.json', 'ftp://uji.contoh.org/x']) {
    skema.push({ u, ok: M.periksaUrlAmbilWeb(u, izin).ok });
  }
  R.check('W06', skema.every((s) => !s.ok),
    `skema/bentuk terlarang ditolak: ${skema.filter((s) => s.ok).length === 0 ? 'semua 6' : 'BOCOR ' + JSON.stringify(skema.filter((s) => s.ok))}`);

  const port = M.periksaUrlAmbilWeb('https://uji.contoh.org:8443/x', izin);
  R.check('W07', !port.ok && port.sebab.includes('port'),
    `port tak lazim ditolak — ${port.sebab}`);

  const lokalTanpaIzin = M.periksaUrlAmbilWeb('http://127.0.0.1:4321/x', M.izinHost(['127.0.0.1']));
  const lokalDenganIzin = M.periksaUrlAmbilWeb('http://127.0.0.1:4321/x', M.izinLokalDev(['127.0.0.1']));
  R.check('W08', !lokalTanpaIzin.ok && lokalDenganIzin.ok,
    `host lokal butuh izin eksplisit — tanpa: ${lokalTanpaIzin.sebab} | dengan: ok=${lokalDenganIzin.ok}`);
}

/* ================================================================== */
/* B. Keluaran, pemotongan, JSON sebagai data                          */
/* ================================================================== */

{
  const besar = await ambil({ url: base('/besar.txt'), izin, batasByte: 4000 });
  R.check('W09', besar.ok && besar.terpotong && besar.byte === 4000 && besar.totalByte === 50000 && besar.isi.length < 50000,
    `isi 50.000 byte dipotong di batas byte — terpotong=${besar.terpotong} byte=${besar.byte}/${besar.totalByte} keluaran=${besar.isi.length} char`);

  const petaUtf8 = new Map([[base('/utf8.txt'), { status: 200, header: { 'content-type': 'text/plain' }, body: 'é'.repeat(3000) }]]);
  const utf8 = await M.ambilWeb({ url: base('/utf8.txt'), izin: M.izinHost([HOST]), batasByte: 1001 }, transportPeta(petaUtf8));
  R.check('W10', utf8.ok && utf8.byte === 1000 && !utf8.isi.includes('\uFFFD'),
    `potong 1001 byte dari 3000x'é' menghasilkan ${utf8.byte} byte utuh tanpa U+FFFD (char=${utf8.isi.length})`);

  const kar = await ambil({ url: base('/besar.txt'), izin, maksKarakter: 200 });
  R.check('W11', kar.ok && kar.dipotongKarakter && kar.isi.startsWith('a'.repeat(200)) && kar.isi.includes('dipotong'),
    `batas karakter 200 berlaku, penanda ada — char=${kar.isi.length}, dipotong=${kar.dipotongKarakter}`);

  const json = await ambil({ url: base('/data.json'), izin });
  const data = json.data;
  const tipeBenar = json.ok && json.json === true && data !== null && typeof data === 'object' &&
    typeof data.total === 'number' && data.total === 42 && Array.isArray(data.items) &&
    typeof data.items[0].n === 'number' && JSON.parse(json.isi).total === 42;
  R.check('W12', tipeBenar,
    `JSON terbaca sebagai DATA: data.total=${typeof data?.total} (${data?.total}), data.items[0].n=${typeof data?.items?.[0]?.n}, dan isi bisa di-JSON.parse ulang`);

  const html = await ambil({ url: base('/teks.html'), izin });
  R.check('W13', html.ok && html.json === false && html.data === null,
    `isi bukan JSON tidak dikarang jadi data — json=${html.json} data=${String(html.data)}`);

  const rusak = await ambil({ url: base('/rusak.json'), izin });
  R.check('W14', rusak.ok && rusak.json === false && rusak.data === null && rusak.isi.includes('bukan-json'),
    `content-type JSON tapi isi rusak: tidak ada data palsu — sebab="${rusak.sebab}"`);

  const potongJson = await ambil({ url: base('/besar.json'), izin, batasByte: 500 });
  R.check('W15', potongJson.ok && potongJson.terpotong && potongJson.json === false && potongJson.data === null,
    `JSON terpotong tidak menghasilkan data separuh — terpotong=${potongJson.terpotong} sebab="${potongJson.sebab}"`);

  R.check('W16', json.data.kunci === M.PENANDA_SENSOR,
    `token di dalam JSON disensor dan JSON tetap sah — data.kunci="${json.data.kunci}" (parse ulang ${typeof JSON.parse(json.isi)} ok)`);

  const jepit = [
    M.batasByteTerapkan(10 ** 9) === M.BATAS_BYTE_MAKS,
    M.waktuTungguMs(10 ** 9) === M.WAKTU_MAKS_MS,
    M.maksKarakterTerapkan(0) === M.MAKS_KARAKTER_BAWAAN,
    M.batasByteTerapkan(undefined) === M.BATAS_BYTE_BAWAAN,
  ].every(Boolean);
  R.check('W17', jepit,
    `batas dijepit ke plafon: byte<=${M.BATAS_BYTE_MAKS} waktu<=${M.WAKTU_MAKS_MS}ms karakter<=${M.MAKS_KARAKTER_BAWAAN}`);
}

/* ================================================================== */
/* C. Batas waktu, redirect, transport gagal                           */
/* ================================================================== */

{
  const t0 = Date.now();
  const gantung = await M.ambilWeb(
    { url: base('/data.json'), izin, waktuMs: 150 },
    () => new Promise(() => {}),
  );
  const jangka = Date.now() - t0;
  R.check('W18', !gantung.ok && gantung.sebab.includes('waktu tunggu habis') && jangka < 2000,
    `transport yang menggantung dipotong modul sendiri setelah ${jangka} ms (bawaan ${M.WAKTU_BAWAAN_MS} ms); sebab="${gantung.sebab}"`);

  const lompat = await ambil({ url: base('/putar-luar'), izin });
  R.check('W19', !lompat.ok && lompat.dilalui.length === 1 && lompat.urlAkhir.includes('luar.jahat.com'),
    `redirect ke host luar izin ditolak DI HOP-nya (dilalui=${JSON.stringify(lompat.dilalui)}) — ${lompat.sebab}`);

  const rantai = await ambil({ url: base('/r0'), izin });
  R.check('W20', !rantai.ok && rantai.sebab.includes('redirect'),
    `rantai redirect > ${M.MAKS_REDIRECT} hop ditolak — ${rantai.sebab}`);

  const sah = await ambil({ url: base('/putar-izin'), izin });
  R.check('W21', sah.ok && sah.json === true && sah.dilalui.length === 2,
    `redirect yang sah diterima, tiap hop dicatat — dilalui=${JSON.stringify(sah.dilalui)}`);

  const putus = await M.ambilWeb({ url: base('/data.json'), izin }, () => Promise.reject(new Error('kabel putus')));
  R.check('W22', !putus.ok && putus.sebab.includes('transport gagal'),
    `transport yang melempar dilaporkan, tidak menjatuhkan pemanggil — ${putus.sebab}`);
}

/* ================================================================== */
/* D. Server loopback nyata, simpan berkas, disiplin                   */
/* ================================================================== */

const permintaanLokal = [];
const server = http.createServer((req, res) => {
  permintaanLokal.push({ url: req.url, header: req.headers });
  if (req.url === '/data.json') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ total: 7, dari: 'server-nyata' }));
    return;
  }
  res.statusCode = 404;
  res.end('tidak ada');
});
await new Promise((selesai) => server.listen(0, '127.0.0.1', selesai));
const portLokal = server.address().port;
const urlLokal = `http://127.0.0.1:${portLokal}/data.json`;

/** Transport NYATA: satu-satunya jalur jaringan sungguhan di harness ini. */
const transportNode = (url, opsi) =>
  new Promise((selesai, gagal) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { accept: 'application/json, text/plain, */*', 'user-agent': 'Zephyr-uji-fetch-web/1' },
      },
      (res) => {
        const bagian = [];
        let byte = 0;
        const tutup = () =>
          selesai({
            status: res.statusCode ?? 0,
            header: res.headers,
            body: Buffer.concat(bagian).toString('utf8'),
            url,
          });
        res.on('data', (c) => {
          byte += c.length;
          if (byte <= opsi.maksByte) bagian.push(c);
          else res.destroy();
        });
        res.on('end', tutup);
        res.on('error', tutup);
      },
    );
    req.on('error', gagal);
    req.end();
  });

{
  permintaanLokal.length = 0;
  const tanpaIzin = await M.ambilWeb({ url: urlLokal, izin: M.izinHost(['127.0.0.1']) }, transportNode);
  R.check('W23', !tanpaIzin.ok && permintaanLokal.length === 0,
    `server nyata TIDAK dihubungi tanpa izin (${permintaanLokal.length} permintaan) — ${tanpaIzin.sebab}`);

  permintaanLokal.length = 0;
  const denganIzin = await M.ambilWeb({ url: urlLokal, izin: M.izinLokalDev(['127.0.0.1']) }, transportNode);
  const headerReq = permintaanLokal[0]?.header ?? {};
  const kunciHeader = Object.keys(headerReq).map((k) => k.toLowerCase());
  const adaRahasia = kunciHeader.some((k) => /authorization|x-api-key|api-key|cookie|token|secret/.test(k));
  R.check('W24', denganIzin.ok && denganIzin.data?.total === 7 && permintaanLokal.length === 1 && !adaRahasia,
    `izin eksplisit menembus loopback: body nyata terbaca (total=${denganIzin.data?.total}), header permintaan=${JSON.stringify(kunciHeader)}, tanpa kredensial`);

  const kunciOpsi = Object.keys(panggilan[0]?.opsi ?? {}).sort().join(',');
  R.check('W25', kunciOpsi === 'maksByte,waktuMs',
    `transport hanya menerima ${kunciOpsi} — tidak ada slot kredensial`);

  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'uji-fetch-web-'));
  const jalur = path.join(dir, 'hasil.json');
  const tulisNyata = (j, isi) => fs.writeFileSync(j, isi, 'utf8');
  const hasilTulis = await M.tulisHasilAmbilWeb('hasil.json', denganIzin.isi, (j, isi) =>
    tulisNyata(path.join(dir, j), isi),
  );
  const dibaca = fs.existsSync(jalur) ? fs.readFileSync(jalur, 'utf8') : '<<BERKAS TIDAK DIBUAT>>';
  const tolakJalur = ['.env', '.env.local', 'C:\\Users\\Zyrex\\.env', '/etc/passwd', '../luar.json', '.ssh/id_rsa', '.git/config', 'server.pem'];
  const ditolak = tolakJalur.filter((j) => !M.periksaJalurSimpan(j).ok);
  R.check('W26', hasilTulis.ok && dibaca === denganIzin.isi && dibaca.length > 0 && ditolak.length === tolakJalur.length,
    `hasil ditulis ke berkas nyata (${hasilTulis.byte} byte, dibaca ulang ${dibaca === denganIzin.isi ? 'identik' : 'BEDA'}) & ${ditolak.length}/${tolakJalur.length} jalur rahasia ditolak`);
  fs.rmSync(dir, { recursive: true, force: true });

  const tiga = [];
  for (let i = 0; i < 3; i++) {
    const h = await ambil({ url: base('/data.json'), izin });
    tiga.push(JSON.stringify({ ...h, durasiMs: 0 }));
  }
  R.check('W27', tiga[0] === tiga[1] && tiga[1] === tiga[2],
    `determinisme: 3 panggilan identik menghasilkan JSON identik (${tiga[0].length} byte) setelah durasiMs dinolkan`);

  const sumber = fs.readFileSync('src/lib/zephyrTools/ambilWeb.ts', 'utf8');
  const kode = sumber
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
  const terlarang = ['process.env', 'node:child_process', 'node:fs', 'node:http', 'require(', 'curl', 'bash -c', 'sh -c']
    .filter((p) => kode.includes(p));
  const adaImpor = /^\s*import\s/m.test(kode);
  R.check('W28', hitung.shell === 0 && terlarang.length === 0 && !adaImpor,
    `nol shell (${hitung.shell} panggilan child_process) & modul tanpa impor; pola terlarang: ${terlarang.length === 0 ? 'tidak ada' : terlarang.join(', ')}`);

  R.check('W29', hitung.jaringanPublik === 0 && hitung.loopback > 0,
    `nol jaringan publik (${hitung.jaringanPublik}), hanya loopback (${hitung.loopback} koneksi) — ${hitung.jaringanNama.join(',') || 'bersih'}`);

  R.check('W30', hitung.bacaRahasia === 0,
    `nol upaya membaca .env/kunci (${hitung.bacaRahasia}) setelah semua kasus — jejak: ${hitung.bacaRahasiaJalur.join(',') || 'bersih'}`);
}

await new Promise((selesai) => server.close(selesai));

/* ================================================================== */
/* E. Pemeriksaan silang: tsc                                          */
/* ================================================================== */

const tsc = asli.spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
  encoding: 'utf8',
  timeout: 240000,
});
const keluaranTsc = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
const galatTsc = keluaranTsc.split('\n').filter((b) => /error TS/.test(b));
const galatMilikModul = galatTsc.filter((b) => b.includes('ambilWeb.ts'));
const berkasLain = [...new Set(galatTsc.filter((b) => !b.includes('ambilWeb.ts')).map((b) => b.split('(')[0]))];
R.check('W31', galatMilikModul.length === 0,
  `src/lib/zephyrTools/ambilWeb.ts: ${galatMilikModul.length} galat tsc`);
R.check('W32', galatTsc.length === 0,
  galatTsc.length === 0
    ? 'seluruh repo: npx tsc --noEmit -> 0 galat'
    : `seluruh repo: ${galatTsc.length} galat — semuanya di ${berkasLain.join(', ')} (BUKAN berkas lane ini)`);

const catat = `\n  catatan: transport jaringan disuntik; satu server node:http di 127.0.0.1:${portLokal}\n  catatan: ${panggilan.length} panggilan transport tercatat selama uji\n`;
process.stdout.write(catat);

R.selesai();
keluarBersih(gagal ? 1 : 0);
