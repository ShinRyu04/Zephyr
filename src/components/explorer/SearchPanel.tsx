// SearchPanel.tsx — Global Search & Replace lewat ripgrep (fase 25).
//
// Menggantikan panel pencarian fase 04. Yang berubah secara mendasar:
//  * hasil MENGALIR (event `search-hit`) — daftar bertambah selagi rg jalan,
//    jadi tidak ada layar kosong menunggu repo besar selesai;
//  * hasil dikelompokkan per file dan bisa dilipat;
//  * daftar di-VIRTUALKAN: hanya baris yang terlihat dirender. Tanpa itu,
//    5000 hit = 5000 node DOM dan panel langsung tersendat.
//
// Virtualisasi ditulis sendiri (bukan react-window): daftarnya satu dimensi
// dengan tinggi baris seragam, jadi hitungannya sepele dan menambah
// dependensi hanya untuk ini tidak sebanding.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useSearch } from '../../lib/searchStore';
import { detectLang } from '../../lib/lang';
import FileIcon from '../editor/FileIcon';
import type { RgHit } from '../../lib/types';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
const dirOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]+$/, '');

/** Tinggi satu baris hasil (px) — harus cocok dengan .sr-hit di CSS. */
const TINGGI_BARIS = 22;
/** Tinggi header file (px) — .sr-file-head. */
const TINGGI_HEAD = 24;
/** Baris ekstra yang dirender di luar viewport supaya scroll tidak berkedip. */
const BUFFER = 8;

/** Satu baris datar untuk virtualisasi: header file ATAU satu match. */
type Baris =
  | { t: 'head'; path: string; jml: number; terbuka: boolean }
  | { t: 'hit'; path: string; hit: RgHit; idx: number };

/**
 * Potong preview supaya match terlihat, lalu bagi jadi segmen bertanda.
 *
 * `ranges` bisa memuat BEBERAPA match di satu baris — kalau hanya match
 * pertama yang disorot, baris seperti `foo foo foo` tampak salah.
 */
function segmen(hit: RgHit) {
  const teks = hit.preview;
  const mulai = Math.max(0, hit.col - 1);
  // Geser jendela bila match jauh di kanan.
  const awal = mulai > 60 ? mulai - 30 : 0;
  const potong = teks.slice(awal, awal + 200);

  const out: { s: string; mark: boolean }[] = [];
  let cur = 0;
  for (const [kol, len] of hit.ranges) {
    const a = kol - 1 - awal;
    const b = a + len;
    if (b <= 0 || a >= potong.length || len <= 0) continue;
    const aa = Math.max(0, a);
    if (aa > cur) out.push({ s: potong.slice(cur, aa), mark: false });
    out.push({ s: potong.slice(aa, Math.min(b, potong.length)), mark: true });
    cur = Math.min(b, potong.length);
  }
  if (cur < potong.length) out.push({ s: potong.slice(cur), mark: false });
  if (out.length === 0) out.push({ s: potong, mark: false });
  if (awal > 0) out.unshift({ s: '…', mark: false });
  return out;
}

export default function SearchPanel() {
  const workspace = useStore((s) => s.workspace);

  const query = useSearch((s) => s.query);
  const replaceWith = useSearch((s) => s.replaceWith);
  const caseSensitive = useSearch((s) => s.caseSensitive);
  const wholeWord = useSearch((s) => s.wholeWord);
  const regex = useSearch((s) => s.regex);
  const include = useSearch((s) => s.include);
  const exclude = useSearch((s) => s.exclude);
  const respectGitignore = useSearch((s) => s.respectGitignore);
  const running = useSearch((s) => s.running);
  const grup = useSearch((s) => s.grup);
  const total = useSearch((s) => s.total);
  const summary = useSearch((s) => s.summary);
  const error = useSearch((s) => s.error);
  const rg = useSearch((s) => s.rg);
  const riwayat = useSearch((s) => s.riwayat);
  const replaceTerbuka = useSearch((s) => s.replaceTerbuka);
  const replaceTerakhir = useSearch((s) => s.replaceTerakhir);

  const setQuery = useSearch((s) => s.setQuery);
  const setReplaceWith = useSearch((s) => s.setReplaceWith);
  const setInclude = useSearch((s) => s.setInclude);
  const setExclude = useSearch((s) => s.setExclude);
  const toggleCase = useSearch((s) => s.toggleCase);
  const toggleWholeWord = useSearch((s) => s.toggleWholeWord);
  const toggleRegex = useSearch((s) => s.toggleRegex);
  const toggleGitignore = useSearch((s) => s.toggleGitignore);
  const setReplaceTerbuka = useSearch((s) => s.setReplaceTerbuka);
  const toggleGrup = useSearch((s) => s.toggleGrup);
  const jalankan = useSearch((s) => s.jalankan);
  const batalkan = useSearch((s) => s.batalkan);
  const bukaHit = useSearch((s) => s.bukaHit);
  const cekRg = useSearch((s) => s.cekRg);
  const replaceSatuFile = useSearch((s) => s.replaceSatuFile);
  const replaceSemua = useSearch((s) => s.replaceSemua);
  const undoReplace = useSearch((s) => s.undoReplace);

  const [opsiTerbuka, setOpsiTerbuka] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [tinggiViewport, setTinggiViewport] = useState(400);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void cekRg();
  }, [cekRg]);

  // Debounce saat mengetik. Toggle (case/word/regex/glob) memicu ulang juga.
  useEffect(() => {
    if (!query.trim()) return;
    const t = window.setTimeout(() => void jalankan(), 350);
    return () => window.clearTimeout(t);
  }, [query, include, exclude, caseSensitive, wholeWord, regex, respectGitignore, jalankan]);

  // Ukur viewport untuk virtualisasi.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ukur = () => setTinggiViewport(el.clientHeight || 400);
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Ratakan grup jadi daftar baris — dasar virtualisasi. */
  const baris = useMemo<Baris[]>(() => {
    const out: Baris[] = [];
    for (const g of grup) {
      out.push({ t: 'head', path: g.path, jml: g.hits.length, terbuka: g.terbuka });
      if (g.terbuka) {
        g.hits.forEach((h, i) => out.push({ t: 'hit', path: g.path, hit: h, idx: i }));
      }
    }
    return out;
  }, [grup]);

  // Tinggi kumulatif: header dan hit beda tinggi, jadi offset dihitung sekali
  // per perubahan daftar (bukan per frame scroll).
  const { offsets, totalTinggi } = useMemo(() => {
    const o = new Array<number>(baris.length + 1);
    o[0] = 0;
    for (let i = 0; i < baris.length; i++) {
      o[i + 1] = o[i] + (baris[i].t === 'head' ? TINGGI_HEAD : TINGGI_BARIS);
    }
    return { offsets: o, totalTinggi: o[baris.length] };
  }, [baris]);

  const cariIndeks = (y: number) => {
    let lo = 0;
    let hi = baris.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, Math.max(0, baris.length - 1));
  };

  const mulai = Math.max(0, cariIndeks(scrollTop) - BUFFER);
  const akhir = Math.min(baris.length, cariIndeks(scrollTop + tinggiViewport) + BUFFER + 1);
  const terlihat = baris.slice(mulai, akhir);

  const jmlFile = grup.length;

  return (
    <div className="side-panel search-panel" data-testid="search-panel">
      <div className="side-section">
        <div className="side-title">Search</div>

        {!workspace && (
          <p className="side-muted">Buka folder dulu untuk mencari di workspace.</p>
        )}

        <div className="search-row">
          <button
            className="find-toggle"
            title={replaceTerbuka ? 'Sembunyikan replace' : 'Tampilkan replace'}
            aria-expanded={replaceTerbuka}
            data-testid="search-toggle-replace"
            onClick={() => setReplaceTerbuka(!replaceTerbuka)}
          >
            {replaceTerbuka ? '▾' : '▸'}
          </button>
          <input
            className="search-input"
            placeholder="Cari di workspace"
            aria-label="Cari di workspace"
            data-testid="search-input"
            list="zephyr-search-riwayat"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void jalankan();
            }}
          />
          {/* Riwayat query: <datalist> memberi dropdown native tanpa
              menambah widget yang harus diurus fokus & keyboard-nya. */}
          <datalist id="zephyr-search-riwayat">
            {riwayat.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <button
            className={`find-flag${caseSensitive ? ' is-on' : ''}`}
            title="Match Case"
            aria-pressed={caseSensitive}
            data-testid="search-case"
            onClick={toggleCase}
          >
            Aa
          </button>
          <button
            className={`find-flag${wholeWord ? ' is-on' : ''}`}
            title="Whole Word"
            aria-pressed={wholeWord}
            data-testid="search-word"
            onClick={toggleWholeWord}
          >
            ab
          </button>
          <button
            className={`find-flag${regex ? ' is-on' : ''}`}
            title="Regular Expression"
            aria-pressed={regex}
            data-testid="search-regex"
            onClick={toggleRegex}
          >
            .*
          </button>
        </div>

        {replaceTerbuka && (
          <div className="search-row">
            <span className="find-toggle" aria-hidden="true" />
            <input
              className="search-input"
              placeholder={regex ? 'Ganti dengan (boleh $1, $2)' : 'Ganti dengan'}
              aria-label="Ganti dengan"
              data-testid="search-replace-input"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
            />
            <button
              className="find-btn find-btn-wide"
              title="Ganti di semua file hasil pencarian"
              data-testid="search-replace-all"
              disabled={total === 0}
              onClick={() => void replaceSemua()}
            >
              Semua
            </button>
            {replaceTerakhir && replaceTerakhir.some((h) => h.snapshot) && (
              <button
                className="find-btn"
                title="Batalkan replace terakhir (dari Local History)"
                data-testid="search-undo"
                onClick={() => void undoReplace()}
              >
                undo
              </button>
            )}
          </div>
        )}

        <button
          className="search-opsi-toggle"
          aria-expanded={opsiTerbuka}
          data-testid="search-toggle-opsi"
          onClick={() => setOpsiTerbuka((v) => !v)}
        >
          {opsiTerbuka ? '▾' : '▸'} files to include / exclude
        </button>

        {opsiTerbuka && (
          <>
            <div className="search-row">
              <span className="find-toggle" aria-hidden="true" />
              <input
                className="search-input"
                placeholder="include: *.ts, src/**"
                aria-label="files to include"
                data-testid="search-include"
                value={include}
                onChange={(e) => setInclude(e.target.value)}
              />
            </div>
            <div className="search-row">
              <span className="find-toggle" aria-hidden="true" />
              <input
                className="search-input"
                placeholder="exclude: *.min.js, dist/**"
                aria-label="files to exclude"
                data-testid="search-exclude"
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
              />
            </div>
            <label className="search-cek">
              <input
                type="checkbox"
                checked={respectGitignore}
                data-testid="search-gitignore"
                onChange={toggleGitignore}
              />
              Hormati .gitignore
            </label>
          </>
        )}

        <div className="search-meta" data-testid="search-meta">
          {running ? (
            <>
              mencari…{' '}
              <button className="find-btn" data-testid="search-cancel" onClick={() => void batalkan()}>
                batal
              </button>
            </>
          ) : error ? (
            <span className="search-err" data-testid="search-error">
              {error}
            </span>
          ) : query && summary ? (
            `${total}${summary.truncated ? '+' : ''} hasil di ${jmlFile} file · ${summary.elapsedMs}ms`
          ) : rg && !rg.ada ? (
            'ripgrep belum terpasang — memakai pencarian bawaan'
          ) : (
            ''
          )}
        </div>
      </div>

      <div
        className="search-results"
        data-testid="sr-results"
        ref={scroller}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        {/* Spacer setinggi seluruh daftar; baris diposisikan absolut di dalamnya.
            Ini yang membuat scrollbar tetap benar walau isinya sedikit. */}
        <div className="sr-spacer" style={{ height: totalTinggi }} data-testid="sr-spacer">
          {terlihat.map((b, i) => {
            const idx = mulai + i;
            const top = offsets[idx];
            if (b.t === 'head') {
              return (
                <div
                  className="sr-file-head"
                  key={`h-${b.path}`}
                  style={{ top }}
                  title={b.path}
                  data-testid="sr-file"
                  data-sr-file={b.path}
                >
                  <button
                    className="sr-fold"
                    aria-expanded={b.terbuka}
                    title={b.terbuka ? 'Lipat' : 'Buka'}
                    onClick={() => toggleGrup(b.path)}
                  >
                    {b.terbuka ? '▾' : '▸'}
                  </button>
                  <FileIcon lang={detectLang(b.path)} name={b.path} />
                  <span className="sr-file-name">{baseOf(b.path)}</span>
                  <span className="sr-file-dir">{dirOf(b.path)}</span>
                  <span className="sr-count">{b.jml}</span>
                  {replaceTerbuka && (
                    <button
                      className="sr-replace"
                      title="Ganti semua di file ini"
                      data-testid="sr-replace-file"
                      onClick={() => void replaceSatuFile(b.path)}
                    >
                      ganti
                    </button>
                  )}
                </div>
              );
            }
            return (
              <button
                className="sr-hit"
                key={`x-${b.path}-${b.hit.line}-${b.idx}`}
                style={{ top }}
                title={`${b.path}:${b.hit.line}:${b.hit.col}`}
                data-testid="sr-hit"
                data-sr-line={b.hit.line}
                onClick={() => void bukaHit(b.hit)}
              >
                <span className="sr-line">{b.hit.line}</span>
                <span className="sr-text">
                  {segmen(b.hit).map((s, j) =>
                    s.mark ? (
                      <mark className="sr-mark" key={j}>
                        {s.s}
                      </mark>
                    ) : (
                      <span key={j}>{s.s}</span>
                    ),
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
