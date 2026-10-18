#!/usr/bin/env node
/*
 * verify-lebar-konten.mjs — does a panel window USE the width it is given?
 *
 * THE BUG THIS LOCKS: Settings and AI Models, maximized, left a dead strip down
 * the right-hand side. Nothing overlapped and nothing errored - the content
 * column simply stopped at a `max-width` that was written when the page lived in
 * a ~900px editor area, while the window around it grew to 1500px+.
 *
 * WHY A DEDICATED HARNESS. This is the second time this class of bug was
 * reported ("masih ada space kosong di kanan", and before it "yang kiri ga
 * ketimpa" which was the same cap read from the other end). A type checker
 * cannot see it: `max-width: 780px` compiles perfectly. Only a measurement can
 * tell the difference between "the layout is fine" and "the layout is fine but
 * it only uses 60% of the window".
 *
 * TWO LAYERS, because the static one is cheap and the live one is honest:
 *
 *   1. STATIC - no panel page may reintroduce a pixel cap on its own content
 *      column. Prose measures (`ch` units) are allowed and expected: text needs
 *      one, controls do not.
 *   2. LIVE - with the app running, measure a panel window and assert the
 *      content actually reaches the window's right edge (within padding).
 *
 * Layer 2 SKIPS cleanly when no panel window is open, rather than failing: a
 * harness that cannot run must say so, not report a bug it never saw.
 *
 * Usage:
 *   node scripts/verify-lebar-konten.mjs
 *   node scripts/verify-lebar-konten.mjs --wajib   # layer 2 must not skip
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const wajib = process.argv.includes('--wajib');

let lulus = 0;
let gagal = 0;
let lewat = 0;
const kegagalan = [];

function cek(nama, fn) {
  try {
    const catatan = fn();
    lulus++;
    console.log(`[LULUS] ${nama}`);
    if (catatan) console.log(`        ${catatan}`);
  } catch (e) {
    gagal++;
    const pesan = e instanceof Error ? e.message : String(e);
    kegagalan.push({ nama, pesan });
    console.log(`[GAGAL] ${nama}`);
    console.log(`        ${pesan}`);
  }
}

function baca(rel) {
  return readFileSync(join(AKAR, rel), 'utf8');
}

function tanpaKomentar(isi) {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

console.log('=== verify-lebar-konten ===\n');
console.log('Lapis 1 - statis: tidak ada batas piksel pada kolom konten\n');

/*
 * The three columns that were capped. Each is a CONTENT COLUMN - the thing that
 * should stretch - not a prose block.
 */
const KOLOM = [
  { berkas: 'src/styles/settings.css', selektor: '.set-section' },
  { berkas: 'src/styles/settings.css', selektor: '.sp-root' },
  { berkas: 'src/styles/chat-settings.css', selektor: '.cset-content .set-section' },
  { berkas: 'src/styles/modal-popup.css', selektor: '.panel-page-body' },
];

for (const { berkas, selektor } of KOLOM) {
  cek(`${selektor} tidak dibatasi max-width piksel`, () => {
    const css = tanpaKomentar(baca(berkas));
    /* Find the rule body for this exact selector. `.set-section` also appears as
       a descendant in other rules, so the match is anchored at line start. */
    const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g');
    let m;
    let diperiksa = 0;
    while ((m = re.exec(css))) {
      diperiksa++;
      const isi = m[2];
      const batas = isi.match(/max-width:\s*(\d+)px/);
      if (batas) {
        throw new Error(
          `${selektor} masih punya max-width: ${batas[1]}px - itu yang menyisakan ruang kosong di kanan`,
        );
      }
    }
    if (!diperiksa) throw new Error(`aturan untuk ${selektor} tidak ditemukan di ${berkas}`);
    return `${diperiksa} aturan diperiksa`;
  });
}

cek('prosa TETAP punya batas ukur (ch), bukan piksel', () => {
  const css = tanpaKomentar(baca('src/styles/settings.css'));
  /* Readability needs a measure; the point of the change was to keep it where it
     belongs. If these ever lose their cap, long notes become unreadable lines. */
  const catatan = css.match(/\.set-note\s*\{[^}]*max-width:\s*(\d+)ch/);
  if (!catatan) throw new Error('.set-note kehilangan batas ukur - paragraf jadi terlalu lebar');
  return `.set-note = ${catatan[1]}ch`;
});

cek('tabel model memakai lebar penuh', () => {
  const css = tanpaKomentar(baca('src/styles/ai.css'));
  const tabel = css.match(/\.aim-table\s*\{([^}]*)\}/);
  if (!tabel) throw new Error('.aim-table tidak ditemukan');
  if (!/width:\s*100%/.test(tabel[1])) {
    throw new Error('.aim-table tidak width:100% - tabel akan menyisakan ruang di kanan');
  }
  return 'width: 100%';
});

/* ── Layer 2: live measurement ──────────────────────────────────────────── */

console.log('\nLapis 2 - live: jendela panel benar-benar memakai lebarnya\n');

let target = null;
try {
  const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  target = daftar.find((t) => t.type === 'page' && (t.url ?? '').includes('#panel=')) ?? null;
} catch {
  target = null;
}

if (!target) {
  if (wajib) {
    console.log('[GAGAL] tidak ada jendela panel terbuka, dan --wajib diminta');
    gagal++;
  } else {
    console.log('[LEWAT] tidak ada jendela panel terbuka - jalankan dengan app hidup dan');
    console.log('        salah satu panel dibuka (gear / ikon Extensions / Tools) lalu ulangi.');
    lewat++;
  }
} else {
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  try {
    const hasil = await cdp.json(
      `return JSON.stringify(await (async () => {
      const q = (s) => document.querySelector(s);
      const ukur = (sel) => {
        const el = q(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), right: Math.round(r.right) };
      };
      return {
        url: location.hash,
        lebarJendela: window.innerWidth,
        /* The window's own scroll container. Every panel page sits inside one of
           these, whichever panel this is. */
        bar: ukur('.ptb'),
        body: ukur('.panel-win') ?? ukur('.panel-page-body') ?? ukur('.agc-page'),
        /* The column that used to be capped. */
        kolom:
          ukur('.set-section') ??
          ukur('.cset-content .set-section') ??
          ukur('.panel-page-body > *') ??
          null,
      };
    })())`,
      30000,
    );

    cek('jendela panel punya title bar', () => {
      if (!hasil.bar) throw new Error('.ptb tidak ada - jendela ini bukan panel window?');
      return `${hasil.bar.w}px`;
    });

    cek('body panel mengisi lebar jendela', () => {
      if (!hasil.body) throw new Error('body panel tidak ditemukan');
      /* Within a couple of pixels of the viewport: the body is the window. */
      if (Math.abs(hasil.body.w - hasil.lebarJendela) > 4) {
        throw new Error(`body ${hasil.body.w}px vs jendela ${hasil.lebarJendela}px`);
      }
      return `${hasil.body.w}px = jendela`;
    });

    cek('kolom konten TIDAK menyisakan ruang kosong di kanan', () => {
      if (!hasil.kolom) {
        throw new Error('tidak ada kolom konten yang bisa diukur di panel ini');
      }
      /*
       * The column must reach the right edge of the window minus the page's own
       * padding. A 780px cap inside a 1500px window leaves ~700px - an order of
       * magnitude more than any padding, so a 64px tolerance is generous and
       * still catches the real bug.
       */
      const sisa = hasil.lebarJendela - hasil.kolom.right;
      if (sisa > 64) {
        throw new Error(
          `kolom berhenti ${sisa}px sebelum tepi kanan (${hasil.kolom.w}px dari ${hasil.lebarJendela}px) - ` +
            'itu ruang kosong yang dilaporkan',
        );
      }
      return `sisa ${sisa}px (kolom ${hasil.kolom.w}px)`;
    });
  } finally {
    try {
      cdp.close?.();
    } catch {
      /* sudah tutup */
    }
  }
}

console.log(`\n== ${lulus}/${lulus + gagal} lulus${lewat ? `, ${lewat} lewat` : ''} ==`);
if (gagal) {
  console.log('\nKegagalan:');
  for (const k of kegagalan) console.log(`  - ${k.nama}: ${k.pesan}`);
}
keluarBersih(gagal ? 1 : 0);
