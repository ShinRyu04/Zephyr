import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import {
  useToolGate,
  TOOL_GROUPS,
  SEMUA_TOOL,
  SECTION_URUTAN,
  grupEkstensi,
} from '../../lib/toolGate';
import { POLA_AWALAN_MCP, TOOL_BY_NAME } from '../../lib/zephyrTools/catalog';
/*
 * Hook diimpor dari berkas Hook yang terpisah.
 *
 * `deskripsiTool.ts` sengaja murni data supaya `catalog.ts` tidak menarik
 * seluruh rantai aplikasi (store -> xterm -> CodeMirror), yang di Node membuat
 * skrip verifikasi katalog di `scripts/` gagal dimuat. Lihat komentar di
 * deskripsiToolHook.ts.
 */
import { useDeskripsiTool } from '../../lib/zephyrTools/deskripsiToolHook';
import AiIkon from './AiIkon';
import { useDragPopup } from '../../lib/useDragPopup';

/*
 * Floating tool gate.
 *
 * Sits over the editor rather than in the bottom dock: it is a decision the
 * user makes once and then closes, and a docked panel would compete with the
 * chat for the same strip of screen. The composer opens it, Escape closes it,
 * and the page behind dims so the list is the only thing being read.
 *
 * The counts are the point of the panel. "on/off" alone does not tell a reader
 * how much of the catalogue a worker can reach; `9/26` does, per group and in
 * total.
 */
export default function ToolGatePanel() {
  const { popupRef: dragRef, onPointerDown: dragStart } = useDragPopup();
  const tr = useT();
  /* Deskripsi tool ikut bahasa antarmuka yang aktif. */
  const deskripsi = useDeskripsiTool();
  const buka = useToolGate((s) => s.buka);
  const setBuka = useToolGate((s) => s.setBuka);
  const cari = useToolGate((s) => s.cari);
  const setCari = useToolGate((s) => s.setCari);
  const aktif = useToolGate((s) => s.aktif);
  const tutup = useToolGate((s) => s.tutup);
  const balik = useToolGate((s) => s.balik);
  const setGrup = useToolGate((s) => s.setGrup);
  const semua = useToolGate((s) => s.semua);
  const lipat = useToolGate((s) => s.lipat);

  const cariRef = useRef<HTMLInputElement | null>(null);
  const [sorot, setSorot] = useState(0);
  const [bagianTertutup, setBagianTertutup] = useState<Set<string>>(new Set());

  /* Focus the filter on open, so typing narrows without a click. */
  useEffect(() => {
    if (!buka) return;
    setCari('');
    setSorot(0);
    const t = window.setTimeout(() => cariRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [buka, setCari]);

  /* Escape closes; the listener lives only while the panel is up. */
  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setBuka(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, setBuka]);

  /*
   * Baris yang ditampilkan, dikelompokkan dua tingkat: bagian dulu, lalu
   * kelompok di dalamnya.
   *
   * Pemisahan bagian BUKAN hiasan. Dengan 51 tool, daftar pipih menjadi dinding
   * nama yang tidak bisa dipindai - dan ketika satu tool tidak berfungsi,
   * pertanyaan pertamanya selalu "ini tool siapa". Kepala bagian menjawabnya
   * sebelum daftarnya dibaca.
   */
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    /*
     * Grup EKSTENSI dibaca dari registry runtime, bukan dari TOOL_GROUPS:
     * kelompok itu tidak ada di katalog (katalog dibekukan saat build) dan
     * berubah saat paket dipasang/dilepas. Membacanya dari TOOL_GROUPS membuat
     * bagian EXTENSIONS selalu kosong walau ada paket yang membawa tool.
     */
    const semuaGrup = [...TOOL_GROUPS, ...grupEkstensi()];
    const perBagian = SECTION_URUTAN.map((s) => ({
      ...s,
      grup: semuaGrup.filter((g) => g.section === s.id)
        .map((g) => ({
          ...g,
          isi: g.tools.filter((t) => (q ? t.toLowerCase().includes(q) : true)),
          nyala: g.tools.filter((t) => aktif.has(t)).length,
        }))
        .filter((g) => g.isi.length > 0),
    })).filter((s) => s.grup.length > 0);

    return { perBagian };
  }, [cari, aktif]);

  const totalNyala = SEMUA_TOOL.filter((t) => aktif.has(t)).length;

  /*
   * Tombol "All on" menyalakan semuanya sekaligus - termasuk tool yang menulis
   * berkas, mendownload, atau menjalankan perintah di mesin ini. Yang belum
   * menyala itu daftar kerja tombol ini, jadi peringatannya menyebut angka
   * nyata (bukan "hati-hati") tepat di atas tombolnya: user tahu apa yang
   * didapat sebelum menekan, bukan sesudah.
   *
   * Dihitung dari katalog, bukan dari daftar nama yang ditulis tangan, supaya
   * peringatan tidak bisa berbohong ketika katalognya berubah.
   */
  const matiWajibIzin = SEMUA_TOOL.filter(
    (t) => !aktif.has(t) && TOOL_BY_NAME.get(t)?.needsApproval,
  );

  /*
   * Awalan MCP adalah detail protokol, bukan nama yang perlu dibaca user.
   *
   * Model tetap menerima `mcp__zephyr__inspect` agar kontrak dispatch tidak
   * berubah. Picker hanya menampilkan `inspect`, seperti daftar rujukan. Pola
   * ini juga tetap menerima awalan lama, supaya nama yang tersimpan di versi
   * sebelumnya tidak muncul mentah-mentah di baris picker.
   */
  const namaTampil = (nama: string): string => nama.replace(POLA_AWALAN_MCP, '');

  /*
   * Keyboard navigation walks the flattened, filtered list.
   *
   * The rows are buttons, so Tab would also reach them — but stepping through
   * thirty rows one Tab at a time is unusable, and the arrow keys are what a
   * reader who is already typing in the filter expects.
   */
  const datar = useMemo(
    () =>
      tampil.perBagian.flatMap((s) =>
        bagianTertutup.has(s.id)
          ? []
          : s.grup.flatMap((g) => (tutup.has(g.id) ? [] : g.isi)),
      ),
    [tampil, tutup, bagianTertutup],
  );

  const lipatBagian = (id: string) => {
    setBagianTertutup((sekarang) => {
      const next = new Set(sekarang);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setBagian = (id: string, nyala: boolean) => {
    const grup = TOOL_GROUPS.filter((g) => g.section === id);
    for (const g of grup) {
      if (nyala || g.optional) setGrup(g.id, nyala);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (datar.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSorot((i) => (i + 1) % datar.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSorot((i) => (i - 1 + datar.length) % datar.length);
    } else if (e.key === ' ') {
      e.preventDefault();
      const nama = datar[sorot];
      if (nama) balik(nama);
    }
  };

  if (!buka) return null;

  return (
    <>
      {/* Scrim: closes on click and dims the editor so the list leads. */}
      <div className="tg-scrim" data-testid="toolgate-scrim" onClick={() => setBuka(false)} />

      <div
        ref={dragRef}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        className="tg-panel"
        data-testid="toolgate"
        role="dialog"
        aria-label={tr('AI tools')}
        onKeyDown={onKeyDown}
      >
        <div className="tg-head" data-drag-handle onPointerDown={dragStart} style={{ cursor: 'grab' }}>
          <AiIkon name="wrench" size={14} />
          {/* A word next to the spanner: the icon alone reads as "settings". */}
          <span className="tg-judul">{tr('AI tools')}</span>
          <input
            ref={cariRef}
            className="tg-cari"
            data-testid="toolgate-cari"
            placeholder={tr('Filter tools')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            spellCheck={false}
          />
          <button
            className="tg-x"
            data-testid="toolgate-tutup"
            title={tr('Close')}
            onClick={() => setBuka(false)}
          >
            <AiIkon name="x" size={13} />
          </button>
        </div>

        <div className="tg-list" data-testid="toolgate-list">
          {tampil.perBagian.length === 0 && <p className="tg-kosong">{tr('No tool matches that filter.')}</p>}

          {tampil.perBagian.map((s) => {
            const lipatBagianIni = bagianTertutup.has(s.id);
            const jumlah = s.grup.reduce((n, g) => n + g.tools.length, 0);
            const nyala = s.grup.reduce((n, g) => n + g.nyala, 0);
            return (
              <div className="tg-bagian" key={s.id} data-testid={`toolgate-bagian-${s.id}`}>
                <div className="tg-bagian-head">
                  <button
                    className={`tg-caret${lipatBagianIni ? ' is-lipat' : ''}`}
                    onClick={() => lipatBagian(s.id)}
                    aria-expanded={!lipatBagianIni}
                    aria-label={`${s.label} ${tr('section')}`}
                  >
                    <AiIkon name="chev-down" size={11} />
                  </button>
                  <input
                    type="checkbox"
                    className="tg-cek"
                    data-testid={`toolgate-bagian-cek-${s.id}`}
                    checked={nyala === jumlah}
                    disabled={s.id === 'mcp'}
                    ref={(el) => {
                      if (el) el.indeterminate = nyala > 0 && nyala < jumlah;
                    }}
                    onChange={(e) => setBagian(s.id, e.target.checked)}
                    aria-label={s.label}
                  />
                  <button className="tg-bagian-nama" onClick={() => lipatBagian(s.id)}>
                    {s.label}
                  </button>
                  <span className="tg-bagian-angka">{nyala}/{jumlah}</span>
                </div>

                {!lipatBagianIni && s.grup.map((g) => {
                  const lipatIni = tutup.has(g.id);
                  return (
                    <div className="tg-grup" key={g.id} data-testid={`toolgate-grup-${g.id}`}>
                      <div className="tg-grup-head">
                        <button
                          className={`tg-caret${lipatIni ? ' is-lipat' : ''}`}
                          onClick={() => lipat(g.id)}
                          aria-expanded={!lipatIni}
                          tabIndex={-1}
                        >
                          <AiIkon name="chev-down" size={11} />
                        </button>
                        <input
                          type="checkbox"
                          className="tg-cek"
                          data-testid={`toolgate-grup-cek-${g.id}`}
                          checked={g.nyala === g.tools.length}
                          disabled={!g.optional}
                          ref={(el) => {
                            if (el) el.indeterminate = g.nyala > 0 && g.nyala < g.tools.length;
                          }}
                          onChange={(e) => setGrup(g.id, e.target.checked)}
                        />
                        <button className="tg-nama-grup" onClick={() => lipat(g.id)} tabIndex={-1}>
                          {tr(g.label)}
                        </button>
                        <span className="tg-angka" data-nyala={g.nyala === g.tools.length}>
                          {g.nyala}/{g.tools.length}
                        </span>
                      </div>

                      {!lipatIni && (
                        <div className="tg-isi">
                          {g.isi.map((nama) => {
                            const idx = datar.indexOf(nama);
                            return (
                              <button
                                key={nama}
                                className={`tg-row${aktif.has(nama) ? ' is-on' : ''}${idx === sorot ? ' is-sorot' : ''}`}
                                data-testid={`toolgate-${nama}`}
                                data-on={aktif.has(nama)}
                                onClick={() => balik(nama)}
                                onMouseEnter={() => setSorot(idx)}
                                role="switch"
                                aria-checked={aktif.has(nama)}
                                disabled={false}
                              >
                                <span className="tg-kotak" aria-hidden="true">
                                  {aktif.has(nama) && <AiIkon name="check" size={9} />}
                                </span>
                                <span className="tg-nama">{namaTampil(nama)}</span>
                                {deskripsi(nama) && deskripsi(nama) !== '—' && (
                                  <span className="tg-objek">{deskripsi(nama)}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {matiWajibIzin.length > 0 && (
          <p className="tg-awas" data-testid="toolgate-all-on-awas">
            {tr(
              'All on sends all {n} tool schemas on every request, and {m} of them ask for approval before running:',
            )
              .replace('{n}', String(SEMUA_TOOL.length))
              .replace('{m}', String(matiWajibIzin.length))}{' '}
            <code className="tg-awas-nama">
              {matiWajibIzin.slice(0, 4).map(namaTampil).join(', ')}
              {matiWajibIzin.length > 4 ? ', ...' : ''}
            </code>
          </p>
        )}

        <div className="tg-foot">
          <span className="tg-total" data-testid="toolgate-total">
            {tr('{n} of {total} on').replace('{n}', String(totalNyala)).replace('{total}', String(SEMUA_TOOL.length))}
          </span>
          <div className="tg-aksi">
            <button className="tg-btn" data-testid="toolgate-all-on" onClick={() => semua(true)}>
              {tr('All on')}
            </button>
            <button className="tg-btn" data-testid="toolgate-all-off" onClick={() => semua(false)}>
              {tr('All off')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
