/**
 * uji-tool-pill.mjs - uji tampilan pill keadaan di kartu tool.
 *
 *   node scripts/uji-tool-pill.mjs 9223
 *
 * Elemennya disuntik sementara ke DOM, dibaca gaya terhitungnya, lalu dibuang.
 * Cara ini membuktikan CSS-nya BENAR-BENAR berlaku - bukan sekadar ada di
 * berkas. Aturan yang salah tulis tetap "ada", dan hanya pembacaan gaya yang
 * membedakannya.
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('tool-pill');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const t = document.createElement('article');
  t.className = 'w4-tool-card';
  const b = document.createElement('button');
  b.className = 'w4-tool-head';
  b.innerHTML =
    '<span class="w4-tool-name">shell_exec</span>' +
    '<span class="w4-tool-pill is-jalan">Jalan</span>' +
    '<span class="w4-tool-pill is-beres">Beres</span>' +
    '<span class="w4-tool-pill is-gagal">Gagal</span>';
  t.appendChild(b);

  /* Ditaruh di dalam kolom percakapan supaya warisan gayanya realistis. */
  const induk = document.querySelector('.ai-chat') || document.body;
  induk.appendChild(t);
  await new Promise((res) => setTimeout(res, 250));

  const baca = (sel) => {
    const e = t.querySelector(sel);
    if (!e) return null;
    const c = getComputedStyle(e);
    const rkt = e.getBoundingClientRect();
    return {
      latar: c.backgroundColor,
      warna: c.color,
      radius: c.borderTopLeftRadius,
      tebal: c.fontWeight,
      animasi: c.animationName,
      lebar: Math.round(rkt.width),
      tinggi: Math.round(rkt.height),
    };
  };

  const kartu = getComputedStyle(t);
  const keluar = {
    kartu: { lebar: Math.round(t.getBoundingClientRect().width), maxWidth: kartu.maxWidth, boxSizing: kartu.boxSizing },
    nama: (() => {
      const e = t.querySelector('.w4-tool-name');
      const c = getComputedStyle(e);
      return { flex: c.flexGrow, minWidth: c.minWidth, ellipsis: c.textOverflow };
    })(),
    jalan: baca('.is-jalan'),
    beres: baca('.is-beres'),
    gagal: baca('.is-gagal'),
  };

  t.remove();
  return keluar;
})())`);

/* Lebar dikunci: kartu tidak boleh melar mengikuti isinya. */
r.check(
  'P1',
  hasil.kartu.maxWidth === '100%' && hasil.kartu.boxSizing === 'border-box',
  `lebar kartu dikunci: max-width=${hasil.kartu.maxWidth}, box-sizing=${hasil.kartu.boxSizing}, lebar=${hasil.kartu.lebar}px`,
);

r.check(
  'P2',
  hasil.nama.ellipsis === 'ellipsis' && hasil.nama.flex === '1' && hasil.nama.minWidth === '0px',
  `nama tool melipat, bukan melebarkan kartu (flex=${hasil.nama.flex}, min-width=${hasil.nama.minWidth}, ${hasil.nama.ellipsis})`,
);

/* Tiga pill harus benar-benar berbeda - itu inti perbaikannya. */
const g = hasil.gagal;
const j = hasil.jalan;
const b = hasil.beres;

r.check(
  'P3',
  g.latar !== j.latar && j.latar !== b.latar && g.latar !== b.latar,
  `tiga pill punya latar berbeda: gagal=${g.latar} jalan=${j.latar} beres=${b.latar}`,
);

r.check(
  'P4',
  g.warna !== j.warna && j.warna !== b.warna,
  `tiga pill punya warna teks berbeda: gagal=${g.warna} jalan=${j.warna} beres=${b.warna}`,
);

/* Gagal harus SOLID, bukan sekadar bergaris. */
const alfa = (w) => {
  const m = /^rgba?\(([^)]+)\)$/.exec((w || '').trim());
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    return p.length <= 3 ? 1 : Number(p[3]);
  }
  const c = /^color\(([^)]+)\)$/.exec((w || '').trim());
  if (c) {
    const s = c[1].indexOf('/');
    return s < 0 ? 1 : Number(c[1].slice(s + 1).trim());
  }
  return null;
};

r.check('P5', alfa(g.latar) === 1, `pill gagal SOLID, bukan bergaris: alfa=${alfa(g.latar)} (${g.latar})`);

/* Bentuk pil, bukan kotak bersudut tajam. */
r.check(
  'P6',
  parseFloat(g.radius) >= 8 && g.radius === j.radius && j.radius === b.radius,
  `ketiganya berbentuk pil dengan radius sama: ${g.radius}`,
);

r.check(
  'P7',
  g.tebal === '600' && j.tebal === '600' && b.tebal === '600',
  `teks pill ditebalkan supaya terbaca di antara kartu: ${g.tebal}`,
);

/* Hanya "jalan" yang berdenyut: kartu yang sudah selesai tidak boleh bergerak. */
const jJalan = j.animasi && j.animasi !== 'none';
const jDiam = (!b.animasi || b.animasi === 'none') && (!g.animasi || g.animasi === 'none');
r.check('P8', jJalan && jDiam, `hanya pill "jalan" yang berdenyut (jalan=${j.animasi}, beres=${b.animasi}, gagal=${g.animasi})`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
