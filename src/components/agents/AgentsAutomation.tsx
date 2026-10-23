import { useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import {
  jalankanTugas,
  labelJadwal,
  useAutomation,
  type AutomationTask,
  type Jadwal,
} from '../../lib/automationStore';

/*
 * Halaman Automation di jendela Agents — mengikuti acuan TRAE:
 * judul + subjudul, tombol "Create manually" / "Create in chat", lalu tiga tab
 * (Configured · Run History · Task Template).
 *
 * Semua tugas disimpan di `automationStore` (localStorage) dan benar-benar
 * dijalankan: penjadwal membuka chat baru di permukaan `agents` lalu mengirim
 * prompt tugas itu. Karena itu tiap baris punya Run now, toggle aktif, dan
 * riwayat di tab Run History.
 */

type Tab = 'configured' | 'history' | 'template';

function Ikon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
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

/* Ikon kecil di kartu template — bentuknya hanya pembeda, isinya teks. */
const IKON_TEMPLATE = {
  ai: <path d="M8 2.4v2M8 11.6v2M2.4 8h2M11.6 8h2M4.4 4.4l1.4 1.4M10.2 10.2l1.4 1.4M11.6 4.4l-1.4 1.4M5.8 10.2l-1.4 1.4" />,
  tren: <path d="M3 11.6l3-3 2.2 2.2 4.4-4.6" />,
  target: <>
    <circle cx="8" cy="8" r="5.4" />
    <circle cx="8" cy="8" r="1.6" />
  </>,
  grafik: <path d="M3 12V8M6.4 12V5.4M9.8 12V7M13.2 12V3.8" />,
  perisai: <path d="M8 2.4 13 4.6v4.2c0 2.6-2.2 4.2-5 4.8-2.8-.6-5-2.2-5-4.8V4.6z" />,
  kutu: <>
    <rect x="2.8" y="2.8" width="10.4" height="10.4" rx="1.4" />
    <path d="M5.6 8.2l1.6 1.6 3.2-3.4" />
  </>,
  kaca: <>
    <circle cx="7" cy="7" r="3.8" />
    <path d="M9.8 9.8l3 3" />
  </>,
  ringkas: <>
    <rect x="2.8" y="3" width="10.4" height="10" rx="1.4" />
    <path d="M5.4 6h5.2M5.4 8.2h5.2M5.4 10.4h3" />
  </>,
} as const;

interface Template {
  id: string;
  nama: string;
  ket: string;
  ikon: keyof typeof IKON_TEMPLATE;
  prompt: string;
  jadwal: Jadwal;
}

const TEMPLATE: Template[] = [
  {
    id: 'ai-news',
    nama: 'Daily AI News Briefing',
    ket: 'Daily morning push of AI industry hot news summaries and trend analysis',
    ikon: 'ai',
    jadwal: 'harian',
    prompt:
      'Search the web for today\'s AI industry news, then write a short morning briefing: the 5 most important items with one-paragraph summaries and a closing note on the trend they share.',
  },
  {
    id: 'brand-sentiment',
    nama: 'Brand Sentiment Weekly Report',
    ket: 'Weekly automatic tracking of brand mentions and reviews across social media and communities',
    ikon: 'tren',
    jadwal: 'mingguan',
    prompt:
      'Collect this week\'s public mentions and reviews of our brand across social media and communities, then write a weekly sentiment report: overall tone, recurring complaints, praise, and three actionable suggestions.',
  },
  {
    id: 'competitor',
    nama: 'Weekly Competitor Tracking',
    ket: 'Regularly track competitor product updates, community feedback and important news',
    ikon: 'target',
    jadwal: 'mingguan',
    prompt:
      'Track this week\'s competitor product updates, release notes, community feedback and important news. Summarize what changed, how it compares to our product, and what we should watch.',
  },
  {
    id: 'stocks',
    nama: 'Stock Price Monitor & Alerts',
    ket: 'Daily tracking of stock price movements with automatic alerts for unusual volatility',
    ikon: 'grafik',
    jadwal: 'harian',
    prompt:
      'Check today\'s closing prices for the tickers I follow, flag any move above 3% with the likely reason from the news, and note anything that deserves a closer look tomorrow.',
  },
  {
    id: 'security',
    nama: 'Security Vulnerability Scan',
    ket: 'Periodically scan codebase to discover verified medium-high severity security vulnerabilities',
    ikon: 'perisai',
    jadwal: 'harian',
    prompt:
      'Scan this repository for security issues: injection paths, unsafe deserialization, secret leakage, path traversal, and dependency advisories. Report only findings you can point to in the code, with file and line, severity, and a concrete fix.',
  },
  {
    id: 'commit-bugs',
    nama: 'Commit Scan for Bugs',
    ket: 'Analyze recent code commits to discover high-risk bugs with severe consequences',
    ikon: 'kutu',
    jadwal: 'harian',
    prompt:
      'Review the commits from the last 24 hours and look for high-risk bugs: wrong conditions, unhandled errors, races, and broken edge cases. For each finding give the commit, the file, why it is a real defect, and a suggested fix.',
  },
  {
    id: 'coverage',
    nama: 'Test Coverage Gap Filler',
    ket: 'Identify high-risk code lacking tests in recent changes and auto-generate tests',
    ikon: 'kaca',
    jadwal: 'harian',
    prompt:
      'Find the riskiest code changed recently that has no tests, then write tests for it that match the project\'s existing test style. Run the tests and report the result.',
  },
  {
    id: 'digest',
    nama: 'Daily Change Digest',
    ket: 'Daily summary of repository changes, generating a team-readable engineering digest',
    ikon: 'ringkas',
    jadwal: 'harian',
    prompt:
      'Summarize the repository changes from the last 24 hours as a team-readable engineering digest: what shipped, what is in progress, notable refactors, and anything that needs review attention.',
  },
];

const jamSekarang = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function waktu(ms: number): string {
  const d = new Date(ms);
  const hari = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${hari} ${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export default function AgentsAutomation({ onKeChat }: { onKeChat: () => void }) {
  const tasks = useAutomation((s) => s.tasks);
  const runs = useAutomation((s) => s.runs);
  const tambah = useAutomation((s) => s.tambah);
  const hapus = useAutomation((s) => s.hapus);
  const toggle = useAutomation((s) => s.toggle);

  const [tab, setTab] = useState<Tab>('configured');
  const [dialog, setDialog] = useState<null | { dari?: Template }>(null);
  const [nama, setNama] = useState('');
  const [prompt, setPrompt] = useState('');
  const [jadwal, setJadwal] = useState<Jadwal>('harian');
  const [jam, setJam] = useState(jamSekarang());
  const [hari, setHari] = useState(1);

  const bukaDialog = (dari?: Template) => {
    setNama(dari?.nama ?? '');
    setPrompt(dari?.prompt ?? '');
    setJadwal(dari?.jadwal ?? 'harian');
    setJam(jamSekarang());
    setHari(1);
    setDialog({ dari });
  };

  const simpan = () => {
    if (!prompt.trim()) return;
    tambah({ nama, prompt: prompt.trim(), jadwal, jam, hari });
    setDialog(null);
    setTab('configured');
  };

  /* "Create in chat": buka percakapan baru dengan draft yang sudah berisi
     permintaan membuat automation — bukan dijalankan otomatis. */
  const buatDiChat = () => {
    const ai = useAi.getState();
    ai.newChat('agents');
    ai.setDraft(
      'Create an automation task for me. Ask what it should do, how often it should run, and then save it to Automation.',
      'agents',
    );
    onKeChat();
  };

  const kosong = (
    <div className="agx-auto-kosong" data-testid="agx-auto-kosong">
      <span className="agx-auto-kosong-ikon" aria-hidden="true">
        <Ikon size={22}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.6V8l2.4 1.6" />
        </Ikon>
      </span>
      <div className="agx-auto-kosong-judul">
        {tab === 'history' ? 'No automation runs yet.' : 'No automation tasks configured yet.'}
      </div>
      <button
        className="agx-auto-tombol is-terang"
        data-testid="agx-auto-dari-template"
        onClick={() => setTab('template')}
      >
        Create from a template
        <Ikon size={13}>
          <path d="M3.4 8h9.2M9.2 4.6 12.6 8l-3.4 3.4" />
        </Ikon>
      </button>
    </div>
  );

  return (
    <div className="agx-auto" data-testid="agx-auto">
      <div className="agx-auto-kepala">
        <div className="agx-auto-kepala-teks">
          <h1>Automation</h1>
          <p>Configure and manage automated tasks to allow Zephyr to execute workflows on schedule.</p>
        </div>
        <div className="agx-auto-kepala-aksi">
          <button
            className="agx-auto-tombol"
            data-testid="agx-auto-manual"
            onClick={() => bukaDialog()}
          >
            Create manually
          </button>
          <button
            className="agx-auto-tombol is-terang"
            data-testid="agx-auto-chat"
            onClick={buatDiChat}
          >
            <Ikon size={13}>
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5.4V8l1.8 1.2" />
            </Ikon>
            Create in chat
          </button>
        </div>
      </div>

      <div className="agx-auto-tabs" role="tablist">
        {(
          [
            ['configured', 'Configured'],
            ['history', 'Run History'],
            ['template', 'Task Template'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`agx-auto-tab${tab === id ? ' is-aktif' : ''}`}
            data-testid={`agx-auto-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="agx-auto-isi" data-testid="agx-auto-isi">
        {tab === 'configured' &&
          (tasks.length === 0 ? (
            kosong
          ) : (
            <div className="agx-auto-daftar">
              {tasks.map((t) => (
                <article className="agx-auto-tugas" key={t.id} data-testid="agx-auto-tugas">
                  <div className="agx-auto-tugas-kepala">
                    <span className="agx-auto-tugas-nama">{t.nama}</span>
                    <button
                      className="agx-auto-toggle"
                      role="switch"
                      aria-checked={t.aktif}
                      data-testid="agx-auto-tugas-toggle"
                      title={t.aktif ? 'Pause this task' : 'Enable this task'}
                      onClick={() => toggle(t.id)}
                    >
                      <span className="agx-auto-toggle-pin" />
                    </button>
                  </div>
                  <div className="agx-auto-tugas-jadwal">
                    {labelJadwal(t)}
                    {t.aktif && t.berikut > 0 ? ` · next ${waktu(t.berikut)}` : ''}
                  </div>
                  <p className="agx-auto-tugas-prompt">{t.prompt}</p>
                  <div className="agx-auto-tugas-aksi">
                    <button
                      className="agx-auto-mini"
                      data-testid="agx-auto-run"
                      onClick={() => void jalankanTugas(t, 'manual')}
                    >
                      Run now
                    </button>
                    <button
                      className="agx-auto-mini is-bahaya"
                      data-testid="agx-auto-hapus"
                      onClick={() => hapus(t.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ))}

        {tab === 'history' &&
          (runs.length === 0 ? (
            kosong
          ) : (
            <div className="agx-auto-daftar">
              {runs.map((r) => (
                <div className="agx-auto-run" key={r.id} data-testid="agx-auto-run-baris">
                  <span className={`agx-auto-run-status is-${r.status}`} aria-hidden="true" />
                  <span className="agx-auto-run-nama">{r.nama}</span>
                  <span className="agx-auto-run-waktu">{waktu(r.mulai)}</span>
                  <span className="agx-auto-run-keadaan">
                    {r.status === 'jalan' ? 'Running…' : r.status === 'selesai' ? 'Finished' : 'Failed'}
                    {r.pesan && r.status !== 'jalan' ? ` · ${r.pesan}` : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}

        {tab === 'template' && (
          <div className="agx-auto-grid" data-testid="agx-auto-template">
            {TEMPLATE.map((tpl) => (
              <button
                className="agx-auto-kartu"
                key={tpl.id}
                data-testid="agx-auto-template-kartu"
                onClick={() => bukaDialog(tpl)}
              >
                <span className="agx-auto-kartu-ikon" aria-hidden="true">
                  <Ikon size={18}>{IKON_TEMPLATE[tpl.ikon]}</Ikon>
                </span>
                <span className="agx-auto-kartu-nama">{tpl.nama}</span>
                <span className="agx-auto-kartu-ket">{tpl.ket}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {dialog && (
        <div className="agx-auto-lapis" data-testid="agx-auto-dialog">
          <div className="agx-auto-dialog" role="dialog" aria-modal="true">
            <div className="agx-auto-dialog-kepala">
              <h2>{dialog.dari ? 'New automation from template' : 'New automation'}</h2>
              <button
                className="agx-auto-dialog-tutup"
                aria-label="Close"
                data-testid="agx-auto-dialog-tutup"
                onClick={() => setDialog(null)}
              >
                <Ikon size={13}>
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </Ikon>
              </button>
            </div>

            <label className="agx-auto-lapangan">
              <span>Name</span>
              <input
                data-testid="agx-auto-nama"
                value={nama}
                placeholder="Untitled automation"
                onChange={(e) => setNama(e.target.value)}
              />
            </label>

            <label className="agx-auto-lapangan">
              <span>What should it do?</span>
              <textarea
                data-testid="agx-auto-prompt"
                rows={5}
                value={prompt}
                placeholder="Describe the task the agent should run each time."
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>

            <div className="agx-auto-baris">
              <label className="agx-auto-lapangan is-sempit">
                <span>Schedule</span>
                <select
                  data-testid="agx-auto-jadwal"
                  value={jadwal}
                  onChange={(e) => setJadwal(e.target.value as Jadwal)}
                >
                  <option value="manual">Manual only</option>
                  <option value="jam">Every hour</option>
                  <option value="harian">Every day</option>
                  <option value="mingguan">Every week</option>
                </select>
              </label>
              {(jadwal === 'harian' || jadwal === 'mingguan') && (
                <label className="agx-auto-lapangan is-sempit">
                  <span>Time</span>
                  <input
                    type="time"
                    data-testid="agx-auto-jam"
                    value={jam}
                    onChange={(e) => setJam(e.target.value)}
                  />
                </label>
              )}
              {jadwal === 'mingguan' && (
                <label className="agx-auto-lapangan is-sempit">
                  <span>Day</span>
                  <select
                    data-testid="agx-auto-hari"
                    value={hari}
                    onChange={(e) => setHari(parseInt(e.target.value, 10))}
                  >
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                      (n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}
            </div>

            <div className="agx-auto-dialog-aksi">
              <button className="agx-auto-tombol" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="agx-auto-tombol is-terang"
                data-testid="agx-auto-simpan"
                disabled={!prompt.trim()}
                onClick={simpan}
              >
                Save automation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { AutomationTask };
