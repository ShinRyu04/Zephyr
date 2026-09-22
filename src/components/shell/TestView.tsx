// TestView.tsx — Test Explorer (T2.4).
//
// KENAPA panel terpisah dari terminal: menjalankan test adalah aksi yang
// diulang puluhan kali sehari. Membuka terminal + mengetik perintah tiap kali
// itu gesekan yang tidak perlu — di sini cukup satu klik.
//
// PENTING: runner dideteksi dari file project (Rust: `test_detect`), bukan
// ditebak. Kalau project tidak punya `scripts.test`, tombolnya tidak muncul —
// supaya user tidak menekan tombol lalu dapat "missing script: test".

import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import * as cmd from '../../lib/commands';
import { useTasks } from '../../lib/tasksStore';
import { useT } from '../../lib/i18n';

/** Satu runner test dari Rust. */
interface TestRunner {
  id: string;
  nama: string;
  command: string;
  args: string[];
  cwd: string;
  penanda: string;
  catatan: string;
}

/** Satu hasil menjalankan test. */
interface Hasil {
  id: string;
  nama: string;
  keluaran: string;
  ok: boolean;
  berjalan: boolean;
  ms: number;
}

export default function TestView() {
  const tr = useT();
  const workspace = useStore((s) => s.workspace);
  const [runners, setRunners] = useState<TestRunner[]>([]);
  const [hasil, setHasil] = useState<Hasil[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [dimuat, setDimuat] = useState(false);

  // Deteksi ulang saat workspace berubah.
  useEffect(() => {
    let batal = false;
    void (async () => {
      if (!workspace) {
        setRunners([]);
        setDimuat(true);
        return;
      }
      try {
        const r = await cmd.testDetect(workspace);
        if (!batal) {
          setRunners(r);
          setDimuat(true);
          setGalat(null);
        }
      } catch (e) {
        if (!batal) {
          setGalat(cmd.asZephyrError(e).message);
          setDimuat(true);
        }
      }
    })();
    return () => {
      batal = true;
    };
  }, [workspace]);

  const jalankan = async (r: TestRunner) => {
    const id = `t-${Date.now().toString(36)}`;
    setHasil((h) => [
      { id, nama: r.nama, keluaran: '', ok: false, berjalan: true, ms: 0 },
      ...h,
    ]);
    const mulai = Date.now();
    try {
      // WAJIB lewat tasksStore, bukan `tasksRun` langsung: store yang membuat
      // peta id->label + channel output `task:<label>`. Memanggil Rust langsung
      // membuat event `task-output` datang dengan id tak dikenal, dan seluruh
      // output test hilang tanpa jejak.
      const perintah = [r.command, ...r.args].join(' ');
      await useTasks.getState().jalankanAdHoc({
        label: r.nama,
        command: r.command,
        args: r.args,
        cwd: r.cwd || undefined,
      });
      setHasil((h) =>
        h.map((x) =>
          x.id === id
            ? {
                ...x,
                berjalan: false,
                ok: true,
                ms: Date.now() - mulai,
                keluaran: `${tr('Dijalankan di terminal:')} ${perintah}`,
              }
            : x,
        ),
      );
    } catch (e) {
      setHasil((h) =>
        h.map((x) =>
          x.id === id
            ? {
                ...x,
                berjalan: false,
                ok: false,
                ms: Date.now() - mulai,
                keluaran: cmd.asZephyrError(e).message,
              }
            : x,
        ),
      );
    }
  };

  if (!workspace) {
    return (
      <div className="test-view http-kosong" data-testid="test-view">
        <p>{tr('Buka folder project untuk mendeteksi test.')}</p>
      </div>
    );
  }

  return (
    <div className="test-view" data-testid="test-view">
      <div className="test-head">
        <span className="test-judul">{tr('Test Explorer')}</span>
        <span className="test-jumlah">
          {runners.length} {tr('runner')}
        </span>
        <span className="sub-spacer" />
        <button
          className="btn btn-sm"
          data-testid="test-refresh"
          onClick={() => {
            setDimuat(false);
            void (async () => {
              try {
                const r = await cmd.testDetect(workspace);
                setRunners(r);
              } catch (e) {
                setGalat(cmd.asZephyrError(e).message);
              } finally {
                setDimuat(true);
              }
            })();
          }}
        >
          {tr('Deteksi ulang')}
        </button>
      </div>

      {galat && (
        <div className="http-err" data-testid="test-error">
          {galat}
        </div>
      )}

      {!dimuat ? (
        <div className="http-kosong">
          <p>{tr('Mendeteksi…')}</p>
        </div>
      ) : runners.length === 0 ? (
        <div className="http-kosong" data-testid="test-empty">
          <p>{tr('Tidak ada runner test terdeteksi di folder ini.')}</p>
          <p className="http-hint">
            {tr('Didukung: package.json, Cargo.toml, go.mod, pytest, composer.json, Makefile')}
          </p>
        </div>
      ) : (
        <div className="test-daftar" data-testid="test-list">
          {runners.map((r) => (
            <div key={r.id} className="test-item" data-testid={`test-${r.id}`}>
              <div className="test-item-head">
                <span className="test-nama">{r.nama}</span>
                <span className="test-penanda">{r.penanda}</span>
                {r.catatan && <span className="test-catatan">{r.catatan}</span>}
                <span className="sub-spacer" />
                <button
                  className="btn btn-sm btn-primary"
                  data-testid={`test-run-${r.id}`}
                  onClick={() => void jalankan(r)}
                >
                  ▶ {tr('Jalankan')}
                </button>
              </div>
              <code className="test-perintah">
                {r.command} {r.args.join(' ')}
              </code>
            </div>
          ))}
        </div>
      )}

      {hasil.length > 0 && (
        <div className="test-hasil" data-testid="test-results">
          <div className="test-head">
            <span className="test-judul">{tr('Riwayat')}</span>
            <span className="sub-spacer" />
            <button className="api-mini" onClick={() => setHasil([])}>
              ✕
            </button>
          </div>
          {hasil.map((h) => (
            <div
              key={h.id}
              className={`test-run${h.ok ? ' is-ok' : ' is-err'}`}
              data-testid={`test-run-${h.id}`}
            >
              <span className="test-run-ikon">{h.berjalan ? '◔' : h.ok ? '✓' : '✕'}</span>
              <span className="test-run-nama">{h.nama}</span>
              <span className="test-run-ms">{h.ms}ms</span>
              <pre className="test-run-out">{h.keluaran}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
