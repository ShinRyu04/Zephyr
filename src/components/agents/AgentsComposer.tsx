import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { bukaPanel } from '../../lib/bukaPanel';
import { useAgxDraft } from '../../lib/agentsDraft';
import { folderDialogOpen } from '../../lib/commands';
import type { ApprovalMode } from '../../lib/types';
import ModelSelector from '../ai/ModelSelector';
import { PROVIDER_BY_ID } from '../../lib/modelCatalog';
import { useT } from '../../lib/i18n';

/*
 * Composer jendela Agents.
 *
 * Bentuknya mengikuti `Referensi TRAE Agent Window`:
 *
 *   kondisi awal — judul "Build With Zephyr", KOTAK INPUT, lalu KOTAK TERPISAH
 *                  berisi `Local ▾` + folder, lalu 4 chip di bawahnya.
 *   sesudah kirim — judul dan 4 chip hilang, kotak turun ke bawah, dan kotak
 *                  `Local` + folder tetap ada di bawahnya sebagai kotak sendiri.
 *
 * Aturan yang tidak boleh dilanggar (keputusan user):
 * - TANPA mic dan tanpa ikon waveform.
 * - Tombol kirim POLOS, tanpa warna — bukan bulat hijau seperti acuan.
 * - `Local` + folder punya KOTAK SENDIRI, tidak menumpang kotak input.
 * - Model duduk di KANAN, tepat sebelum tombol kirim — sama seperti composer
 *   panel kanan di jendela utama.
 * - Izin memakai `PermissionMenu` yang sama dengan jendela utama.
 *
 * KOTAK INI MENGIRIM. Dulu ia hanya menampung teks sebagai bentuk "sudah pernah
 * menulis", dan itu sebabnya AI di jendela ini terasa mati: tidak ada
 * `ai_chat` yang dipanggil, tidak ada jawaban, tidak ada jejak di store. Sekarang
 * Enter/ tombol kirim memanggil `useAi.send(..., 'agents')` - permukaan yang
 * sama dengan yang dipakai sidebar untuk memilih percakapan - jadi percakapan,
 * tool, dan persetujuan berjalan seperti di panel jendela utama.
 *
 * Setelah pesan pertama, canvas menampilkan `AiPanel` untuk permukaan
 * `agents` (lihat `AgentsApp`): transkrip, kartu tool, pertanyaan agen, dan
 * kotak input berikutnya ada di sana. Layar awal ini tetap milik desain TRAE -
 * judul, kotak, strip `Local`, empat chip - dan kembali setiap "New task".
 */

/* Subjudul acuan, dipakai dua kali: sebagai kalimat di bawah judul pada
   kondisi awal, dan sebagai placeholder setelah judulnya hilang. */
const SUBJUDUL =
  'More than writing every line of code—delivering production-grade results end-to-end.';
const PLACEHOLDER_AWAL = '@ for context, / for commands and skills';

/* Empat chip kondisi awal. Acuannya punya Application Development / Project
   Understanding / Game Creativity / Automation Tools; teksnya diganti versi
   Zephyr atas permintaan user ("di ikutin tpi dgn kata" sndri"). */
const CHIP: { judul: string; ket: string; ikon: ReactNode }[] = [
  {
    judul: 'Build a feature',
    ket: 'From idea to working code',
    ikon: (
      <path d="M4.5 2.6h5l2.6 2.6v8.2h-7.6z M9.5 2.6v2.6h2.6 M6 8.4h4 M6 10.6h2.6" />
    ),
  },
  {
    judul: 'Understand the project',
    ket: 'Map the code before changing it',
    ikon: <path d="M8 2.2 2.6 5.1 8 8l5.4-2.9zM2.6 8 8 10.9 13.4 8M2.6 10.9 8 13.8l5.4-2.9" />,
  },
  {
    judul: 'Game creativity',
    ket: 'Mechanics, levels and loops',
    ikon: (
      <>
        <path d="M4 6.2h2.2v2.2H4z M9.8 6.2H12v2.2H9.8z" />
        <path d="M2.4 8.9c0-2 1.2-3.1 2.6-3.1h6c1.4 0 2.6 1.1 2.6 3.1s-1 3-2.4 3c-.9 0-1.4-.5-1.9-1H5.7c-.5.5-1 1-1.9 1-1.4 0-1.4-1-1.4-3z" />
      </>
    ),
  },
  {
    judul: 'Automate a task',
    ket: 'Turn a routine into a script',
    ikon: (
      <>
        <circle cx="8" cy="8" r="2.1" />
        <path d="M8 1.9v1.7M8 12.4v1.7M1.9 8h1.7M12.4 8h1.7M3.7 3.7l1.2 1.2M11.1 11.1l1.2 1.2M12.3 3.7l-1.2 1.2M4.9 11.1l-1.2 1.2" />
      </>
    ),
  },
];

const LOKAL = ['Local', 'Cloud', 'Worktree', 'Connect SSH', 'Connect WSL'];

/* Tiga tingkat izin + Custom, persis daftar yang dipakai panel kanan jendela
   utama (`ModeMenu.tsx`). Disalin, bukan diimpor: halaman ini satu bundel
   dengan editor, tapi composer ini harus tetap bisa berdiri sendiri. */
const APPROVAL: { id: ApprovalMode; label: string; hint: string; kelas: string }[] = [
  { id: 'ask', label: 'Manual Approval', hint: 'You confirm important actions', kelas: 'is-tanya' },
  {
    id: 'work',
    label: 'Auto Approval',
    hint: 'AI reviews actions and asks you when needed',
    kelas: 'is-kerja',
  },
  {
    id: 'auto',
    label: 'Full Access',
    hint: 'Run directly on your computer without approval',
    kelas: 'is-auto',
  },
];

/* Kunci permukaan Agents di `activeIds` — sama dengan yang dipakai sidebar. */
const COMPOSER = 'agents';

function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const namaFolder = (jalur: string) => {
  const bagian = jalur.split(/[\\/]+/).filter(Boolean);
  return bagian[bagian.length - 1] ?? jalur;
};

/* Dropdown izin. Isi dan gayanya sama dengan `PermissionMenu` di jendela
   utama, tapi memakai kelas `agx-*` supaya tidak bergantung pada CSS panel
   chat (yang tidak ada di jendela ini). */
function MenuIzin() {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const mode = useAi((s) => s.approvalMode ?? 'work');
  const setMode = useAi((s) => s.setApprovalMode);
  const aktif = APPROVAL.find((a) => a.id === mode) ?? APPROVAL[1];

  useEffect(() => {
    if (!buka) return;
    const luar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setBuka(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuka(false);
    };
    document.addEventListener('mousedown', luar);
    /* `window` + capture: Escape dari dalam textarea harus tetap tertangkap,
       dan di WebView2 listener level document sering terlewat. */
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', luar);
      window.removeEventListener('keydown', esc, true);
    };
  }, [buka]);

  return (
    <span className={`agx-comp-izin ${aktif.kelas}`} ref={ref}>
      <button
        className="agx-comp-izin-btn"
        data-testid="agx-comp-izin"
        data-approval={mode}
        aria-haspopup="menu"
        aria-expanded={buka}
        title={aktif.hint}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="agx-comp-dot" aria-hidden="true" />
        {aktif.label}
        <span className="agx-comp-caret">▾</span>
      </button>

      {buka && (
        <div className="agx-comp-menu is-izin" data-testid="agx-comp-izin-menu" role="menu">
          {APPROVAL.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitemradio"
              aria-checked={a.id === mode}
              className={`agx-comp-menu-item is-dua${a.id === mode ? ' is-on' : ''}`}
              data-testid={`agx-comp-izin-${a.id}`}
              onClick={() => {
                setMode(a.id);
                setBuka(false);
              }}
            >
              <span className="agx-comp-menu-teks">
                <b className={a.kelas === 'is-auto' ? 'is-warn' : undefined}>{a.label}</b>
                <i>{a.hint}</i>
              </span>
              {a.id === mode && <span className="agx-comp-centang">✓</span>}
            </button>
          ))}

          {/* Custom bukan mode: ia membuka editor aturan per-alat. */}
          <button
            type="button"
            role="menuitem"
            className="agx-comp-menu-item is-dua is-pisah"
            data-testid="agx-comp-izin-custom"
            onClick={() => {
              setBuka(false);
              bukaPanel('chat-settings', 'chat');
            }}
          >
            <span className="agx-comp-menu-teks">
              <b>Custom</b>
              <i>Set rules in a config file</i>
            </span>
          </button>
        </div>
      )}
    </span>
  );
}

export default function AgentsComposer() {
  /*
   * Draft disimpan di store modul (`useAgxDraft`), bukan `useState` lokal:
   * menu klik kanan pohon File di panel kanan menitipkan path lewat
   * "Add to Chat", dan komponen itu tidak bisa menjangkau state di sini.
   */
  const draft = useAgxDraft((s) => s.draft);
  const setDraft = useAgxDraft((s) => s.setDraft);
  const [lokal, setLokal] = useState('Local');
  const [bukaLokal, setBukaLokal] = useState(false);
  const [bukaFolder, setBukaFolder] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [cariFolder, setCariFolder] = useState('');
  const akar = useRef<HTMLDivElement | null>(null);

  const workspace = useStore((s) => s.workspace);
  const sessions = useAi((s) => s.sessions);
  /* Percakapan yang sedang dibuka di jendela ini. Penanda "sudah pernah
     menulis" diturunkan dari jumlah pesan percakapan itu, bukan disimpan
     sebagai state sendiri: kalau disimpan, "New task" tetap menampilkan kotak
     mode chat padahal percakapannya baru dan kosong. Selector mengembalikan
     angka/string saja — zustand v5 membandingkan hasilnya dengan `===`. */
  const jumlahPesan = useAi(
    (s) => s.sessions.find((x) => x.id === s.activeIds[COMPOSER])?.messages.length ?? 0,
  );
  /*
   * Provider yang dipilih belum punya API key.
   *
   * Gerbang yang sama dengan panel AI (`keys` dari `get_public_models`), tapi
   * ditaruh DI SINI karena layar awal jendela ini adalah tempat model dipilih:
   * tanpa peringatan, satu-satunya umpan balik adalah bubble error provider
   * setelah menunggu request gagal, dan orang menyimpulkan aplikasinya rusak.
   * `keys.length > 0` penting — sebelum `init()` selesai, daftar kosong berarti
   * "belum tahu", bukan "tidak punya key", dan menganggapnya peringatan akan
   * menyalakan strip itu di setiap pembukaan jendela.
   *
   * Dua selector primitif (bukan satu objek) supaya zustand v5 tetap
   * membandingkan hasilnya dengan `===` (pelajaran fase 09).
   */
  const tr = useT();
  const tanpaKey = useAi(
    (s) => s.keys.length > 0 && !s.keys.some((k) => k.provider === s.provider && k.hasKey),
  );
  const providerAktif = useAi((s) => s.provider);

  /* Daftar folder = workspace yang pernah dipakai, diambil dari sesi. Path
     dinormalkan supaya satu folder tidak muncul dua kali dengan garis miring
     berbeda (kasus nyata: `D:\Zephyr` dan `D:/Zephyr`). */
  const daftarFolder = [...new Map(
    sessions
      .filter((s) => !!s.workspace)
      .map((s) => [(s.workspace ?? '').replace(/[\\/]+/g, '/').toLowerCase(), s.workspace as string]),
  ).values()];

  useEffect(() => {
    if (!bukaLokal && !bukaFolder) return;
    const keluar = (e: MouseEvent) => {
      if (akar.current && !akar.current.contains(e.target as Node)) {
        setBukaLokal(false);
        setBukaFolder(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBukaLokal(false);
        setBukaFolder(false);
      }
    };
    document.addEventListener('mousedown', keluar);
    /* `keydown` dipasang di `window`, bukan `document`: di WebView2 event yang
       di-dispatch ke `window` tidak sampai ke listener level document, jadi
       Escape tidak menutup apa pun. Fase capture dipakai supaya Escape dari
       dalam textarea juga tertangkap. */
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', keluar);
      window.removeEventListener('keydown', esc, true);
    };
  }, [bukaLokal, bukaFolder]);

  const folderAktif = folder ?? workspace ?? null;

  /*
   * Membuka folder kerja dari baris `Local` + folder.
   *
   * Dulu "Select a folder" hanya menutup menunya sendiri (`setBukaFolder(false)`),
   * jadi tombolnya terlihat mati: dialog tidak pernah terbuka dan folder yang
   * ditampilkan tidak berubah. Sekarang dialog OS dibuka lewat `folderDialogOpen`,
   * lalu folder itu benar-benar DIBUKA (`openWorkspace`) — bukan sekadar
   * mengganti label. Tanpa itu tugas tetap berjalan di folder lama, dan label
   * yang berbeda dari tempat kerja sebenarnya adalah kebohongan yang mahal:
   * agen menulis berkas di proyek yang tidak dilihat pembaca.
   *
   * Dialog yang dibatalkan tidak mengubah apa pun (null), dan kegagalan dialog
   * ditelan seperti pemanggil lain di aplikasi ini.
   */
  const pilihFolder = async () => {
    setBukaFolder(false);
    try {
      const dir = await folderDialogOpen();
      if (!dir) return;
      setFolder(dir);
      await useStore.getState().openWorkspace(dir);
    } catch {
      /* dialog ditutup atau gagal dibuka: tidak ada yang berubah */
    }
  };
  /* Penanda "sudah pernah menulis" DITURUNKAN dari percakapan yang benar-benar
     tersimpan di store - bukan state lokal. Begitu `send` membuat sesi dan
     menaruh pesan pertama di dalamnya, layar awal ini berganti sendiri ke
     transkrip, dan "New task" (sesi kosong baru) mengembalikannya. */
  const modeChat = jumlahPesan > 0;

  const kirim = () => {
    const teks = draft.trim();
    if (!teks) return;
    /* Dropdown `Local`/folder dan menu izin sudah menulis ke store masing-masing;
       yang perlu dikirim hanyalah teks dan PERMUKAAN-nya. `'agents'` adalah
       kunci `activeIds` yang sama dengan yang dipakai sidebar: percakapan baru
       muncul di sana sebagai satu baris, bukan menumpang percakapan jendela
       utama. */
    setDraft('');
    void useAi
      .getState()
      .send(teks, undefined, COMPOSER)
      .then((terkirim) => {
        /* Kalau pengiriman ditolak (belum ada model/key, atau antrean penuh),
           teksnya dikembalikan ke kotak. Menghapus ketikan tanpa mengirim
           apa pun adalah cara tercepat membuat orang mengetik ulang. */
        if (!terkirim) setDraft(teks);
      });
  };

  return (
    <div
      className={`agx-comp${modeChat ? ' is-chat' : ''}`}
      data-testid="agx-comp"
      ref={akar}
    >
      {!modeChat && (
        <header className="agx-comp-kepala" data-testid="agx-comp-kepala">
          <h1 className="agx-comp-judul">Build With Zephyr</h1>
          <p className="agx-comp-sub">{SUBJUDUL}</p>
        </header>
      )}

      {/* Satu bungkus untuk kotak input + strip `Local`. Keduanya tetap dua
          elemen terpisah (strip di BAWAH kotak, bukan di dalamnya — seperti
          TRAE), tapi satu bingkai luar membungkus keduanya supaya terbaca
          sebagai satu blok composer. */}
      <div className="agx-comp-gabung" data-testid="agx-comp-gabung">
        <div className="agx-comp-kotak" data-testid="agx-comp-kotak">
          <textarea
            className="agx-comp-input"
            data-testid="agx-comp-input"
            spellCheck={false}
            value={draft}
            placeholder={modeChat ? SUBJUDUL : PLACEHOLDER_AWAL}
            aria-label="Message for the agent"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                kirim();
              }
            }}
          />

          <div className="agx-comp-bar" data-testid="agx-comp-bar">
            <button className="agx-comp-plus" data-testid="agx-comp-plus" title="Add context">
              <Ikon>
                <path d="M8 3.4v9.2M3.4 8h9.2" />
              </Ikon>
            </button>

            <MenuIzin />

            {/* Kanan: model tepat di samping tombol kirim, seperti composer
                panel kanan di jendela utama. `margin-left: auto` ada di sini,
                bukan di tombol kirim, supaya keduanya terdorong bersama. */}
            <span className="agx-comp-kanan" data-testid="agx-comp-kanan">
              <ModelSelector />
              <button
                className="agx-comp-kirim"
                data-testid="agx-comp-kirim"
                title="Send"
                aria-label="Send"
                disabled={!draft.trim()}
                onClick={kirim}
              >
                <Ikon>
                  <path d="M8 12.6V3.6M4.4 7.2 8 3.6l3.6 3.6" />
                </Ikon>
              </button>
            </span>
          </div>
        </div>

        {/* Peringatan key: di BAWAH kotak, di atas strip `Local`, dan HANYA saat
            provider terpilih memang belum punya key. Pintu keluarnya jendela
            AI Models (`bukaPanel('models')`) — bukan Settings, karena kartu
            provider beserta API key tinggal di sana. */}
        {tanpaKey && (
          <div className="agx-nokey" data-testid="agx-nokey" role="status">
            <span className="agx-nokey-teks">
              {tr('This provider does not have an API key yet')} —{' '}
              <strong>{PROVIDER_BY_ID.get(providerAktif)?.label ?? providerAktif}</strong>.{' '}
              {tr('Sending will fail until a key is added.')}
            </span>
            <button
              type="button"
              className="agx-nokey-btn"
              data-testid="agx-nokey-buka"
              onClick={() => bukaPanel('models')}
            >
              {tr('AI Models')}
            </button>
          </div>
        )}

        {/* Strip `Local` + folder: kotak TERPISAH di bawah kotak input (persis
            TRAE), hanya berbagi bingkai luar dengan kotak di atasnya.
            HILANG setelah pesan pertama — di TRAE composer mode chat polos,
            tanpa strip di bawahnya. */}
        {!modeChat && (
        <div className="agx-comp-lokasi" data-testid="agx-comp-kaki">
        <span className="agx-comp-dd">
          <button
            className="agx-comp-dd-btn"
            data-testid="agx-comp-lokal"
            aria-expanded={bukaLokal}
            title={lokal}
            onClick={() => {
              setBukaFolder(false);
              setBukaLokal((v) => !v);
            }}
          >
            <Ikon>
              {/* Ikon komputer (monitor + kaki), bukan titik bulat. */}
              <rect x="1.6" y="2.6" width="12.8" height="8.6" rx="1.4" />
              <path d="M8 11.2v2.2M5.4 13.4h5.2" />
            </Ikon>
            <span className="agx-comp-dd-teks">{lokal}</span>
            <span className="agx-comp-caret">▾</span>
          </button>
          {bukaLokal && (
            <div className="agx-comp-menu" data-testid="agx-comp-lokal-menu" role="menu">
              {LOKAL.map((l, i) => (
                <button
                  key={l}
                  role="menuitemradio"
                  aria-checked={l === lokal}
                  className={`agx-comp-menu-item${l === lokal ? ' is-on' : ''}${
                    i === 3 ? ' is-pisah' : ''
                  }${i > 2 ? ' is-tambah' : ''}`}
                  data-testid={`agx-comp-lokal-${l.toLowerCase().replace(/ /g, '-')}`}
                  onClick={() => {
                    setLokal(l);
                    setBukaLokal(false);
                  }}
                >
                  <span className="agx-comp-menu-teks-ikon">
                    <Ikon>
                      {l === 'Local' && <rect x="1.6" y="2.6" width="12.8" height="8.6" rx="1.4" />}
                      {l === 'Cloud' && <path d="M4.5 12.2h7a2.7 2.7 0 0 0 .3-5.4 4 4 0 0 0-7.7 1A2.2 2.2 0 0 0 4.5 12.2z" />}
                      {l === 'Worktree' && <path d="M4.5 3v10M4.5 9.5a2 2 0 1 0 0 .01M11.5 3.5v3a2 2 0 0 1-2 2h-3" />}
                      {l === 'Connect SSH' && <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2M3.5 7h9v6h-9z" />}
                      {l === 'Connect WSL' && <path d="M2.5 4.5l3 3-3 3M7.5 11.5h6" />}
                    </Ikon>
                    {l}
                  </span>
                  {l === lokal && <span className="agx-comp-centang">✓</span>}
                </button>
              ))}
            </div>
          )}
        </span>

        <span className="agx-comp-dd">
          <button
            className="agx-comp-dd-btn is-folder"
            data-testid="agx-comp-folder"
            aria-expanded={bukaFolder}
            title={folderAktif ?? 'Select a folder (optional)'}
            onClick={() => {
              setBukaLokal(false);
              setBukaFolder((v) => !v);
            }}
          >
            <Ikon>
              <path d="M2.4 4.6h4l1.3 1.6h5.9v6.2H2.4z" />
            </Ikon>
            <span className="agx-comp-folder-nama">
              {folderAktif ? namaFolder(folderAktif) : 'Select a folder (optional)'}
            </span>
            <span className="agx-comp-caret">▾</span>
          </button>
          {bukaFolder && (
            <div className="agx-comp-menu is-folder" data-testid="agx-comp-folder-menu" role="menu">
              <label className="agx-comp-folder-cari">
                <Ikon>
                  <path d="M2.4 4.6h4l1.3 1.6h5.9v6.2H2.4z" />
                </Ikon>
                <input
                  type="text"
                  placeholder="Search folders"
                  value={cariFolder}
                  onChange={(e) => setCariFolder(e.target.value)}
                  data-testid="agx-comp-folder-input"
                  autoFocus
                />
              </label>
              {daftarFolder
                .filter((f) => f.toLowerCase().includes(cariFolder.trim().toLowerCase()))
                .map((f) => (
                <button
                  key={f}
                  role="menuitemradio"
                  aria-checked={f === folderAktif}
                  className={`agx-comp-menu-item${
                    f.toLowerCase() === (folderAktif ?? '').replace(/[\\/]+/g, '/').toLowerCase()
                      ? ' is-on'
                      : ''
                  }`}
                  data-testid="agx-comp-folder-item"
                  title={f}
                  onClick={() => {
                    setFolder(f);
                    setBukaFolder(false);
                    /* Folder terakhir ikut DIBUKA, bukan cuma dipajang di baris:
                       satu klik pada riwayat berarti "lanjutkan di proyek ini". */
                    void useStore.getState().openWorkspace(f);
                  }}
                >
                  <span className="agx-comp-folder-nama">{namaFolder(f)}</span>
                  <span className="agx-comp-folder-jalur">{f}</span>
                </button>
              ))}
              {daftarFolder.length === 0 && (
                <div className="agx-comp-menu-kosong">No recent folders</div>
              )}
              <button
                className="agx-comp-menu-item is-pisah"
                data-testid="agx-comp-folder-pilih"
                onClick={() => void pilihFolder()}
              >
                <span className="agx-comp-menu-teks-ikon">
                  <Ikon>
                    <path d="M8 3.2v9.6M3.2 8h9.6" />
                  </Ikon>
                  Select a folder
                </span>
              </button>
            </div>
          )}
        </span>
        </div>
        )}
      </div>

      {!modeChat && (
        <div className="agx-comp-chip" data-testid="agx-comp-chip">
          {CHIP.map((c) => (
            <button
              key={c.judul}
              className="agx-comp-chip-item"
              data-testid="agx-comp-chip-item"
              title={c.ket}
            >
              <Ikon>{c.ikon}</Ikon>
              <span className="agx-comp-chip-teks">{c.judul}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
