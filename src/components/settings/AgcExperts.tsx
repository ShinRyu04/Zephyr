import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useAi } from '../../lib/aiStore';
import * as cmd from '../../lib/commands';
import {
  AHLI,
  AHLI_BY_ID,
  ATURAN_MAKS,
  ATURAN_MAKS_CHAR,
  MAKS_INSTRUKSI,
  bacaCfgAhli,
  simpanCfgAhli,
  type AhliId,
} from '../../lib/expertsStore';
import { customAktif } from '../../lib/subagentCustom';
import { useSkills } from '../../lib/skillsStore';
import type { McpServer } from '../../lib/types';
import { IkonAhli } from '../ai/expertsBuka';

/*
 * Halaman Experts di Agent Customizations: satu kartu per ahli bawaan.
 *
 * Tiap kartu bisa dimatikan (Lead selalu hidup), dipin ke model lain (atau
 * dibiarkan Auto — router memilih model per tugas), diberi instruksi tambahan,
 * dan dibatasi ke Skills + server MCP tertentu. Semua itu menempel pada tugas
 * worker itu, bukan pada prompt global.
 *
 * Lead TIDAK bisa dikustomisasi (dokumen Qoder): field-nya tidak dirender dan
 * `simpanCfgAhli` menolak perubahan Lead, jadi nilai lama tidak bisa diam-diam
 * masih aktif.
 */
/*
 * Tingkat penalaran per ahli. `''` = ikut chip Reasoning global di composer,
 * yang berarti ahli ini tidak punya pendapat sendiri — dan itu memang bawaan
 * yang benar: kebanyakan ahli tidak perlu memaksa kedalaman apa pun.
 */
const EFFORT_AHLI: { id: string; label: string }[] = [
  { id: '', label: 'Follow global' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
];

export default function AgcExperts() {
  const tr = useT();
  const [cfg, setCfg] = useState(bacaCfgAhli);
  const [terbuka, setTerbuka] = useState<AhliId | null>(null);
  const modelSesi = useAi((s) => s.model);
  const skills = useSkills((s) => s.daftar);
  const muatSkills = useSkills((s) => s.muat);
  const [mcpServer, setMcpServer] = useState<McpServer[]>([]);
  const kustom = customAktif();

  useEffect(() => {
    void muatSkills();
    void cmd
      .mcpClientList()
      .then(setMcpServer)
      .catch(() => {
        /* daftar server tak terbaca: bagian MCP tampil kosong, bukan crash */
      });
  }, [muatSkills]);

  const ubah = (id: AhliId, sebagian: Partial<(typeof cfg)[AhliId]>) => {
    simpanCfgAhli(id, sebagian);
    setCfg(bacaCfgAhli());
  };

  const toggleDaftar = (id: AhliId, kunci: 'skills' | 'mcp', nilai: string) => {
    const ada = cfg[id][kunci] ?? [];
    ubah(id, {
      [kunci]: ada.includes(nilai) ? ada.filter((x) => x !== nilai) : [...ada, nilai],
    } as never);
  };

  return (
    <div className="agc-pane" data-testid="agc-experts">
      <h2 className="agc-pane-title">{tr('Experts')}</h2>
      <p className="agc-pane-desc">
        {tr(
          'A built-in expert team. The Lead Agent breaks your goal into tasks; each expert runs with its own tools. Disable experts you never want picked, pin models (or let Auto route them), and choose which skills and MCP servers each expert may use.',
        )}
      </p>

      <div className="agc-experts-daftar">
        {AHLI.map((a) => {
          const c = cfg[a.id];
          const buka = terbuka === a.id;
          const lead = a.id === 'lead';
          const auto = c.model === 'auto';
          return (
            <div key={a.id} className={`agc-experts-kartu${buka ? ' is-buka' : ''}`} data-testid={`agc-experts-${a.id}`}>
              <button
                type="button"
                className="agc-experts-kepala"
                onClick={() => setTerbuka(buka ? null : a.id)}
                aria-expanded={buka}
              >
                <span className="agc-experts-avatar" data-ahli={a.id}>
                  <IkonAhli id={a.id} size={15} />
                </span>
                <span className="agc-experts-teks">
                  <b>{a.label}</b>
                  <i>{a.deskripsi}</i>
                </span>
                <span className="agc-experts-model-info">
                  {lead ? tr('Fixed') : auto ? tr('Auto') : c.model ? c.model : tr('Session model')}
                </span>
                {!lead && (
                  <span
                    role="switch"
                    aria-checked={c.aktif}
                    aria-label={tr('Enabled')}
                    className={`agc-zc-switch${c.aktif ? ' is-on' : ''}`}
                    data-testid={`agc-experts-switch-${a.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      ubah(a.id, { aktif: !c.aktif });
                    }}
                  />
                )}
                <span className="agc-experts-caret" aria-hidden="true">▾</span>
              </button>

              {buka && (
                <div className="agc-experts-badan">
                  {lead ? (
                    <p className="agc-experts-terkunci" data-testid="agc-experts-lead-terkunci">
                      {tr(
                        'The Lead Agent is fixed: it always uses the session model and the shipped orchestration prompt. It cannot be pinned, disabled, or given extra instructions.',
                      )}
                    </p>
                  ) : (
                    <>
                      <label className="agc-field">
                        <span>{tr('Model')}</span>
                        <div className="agc-experts-model-baris">
                          <input
                            value={c.model}
                            placeholder={tr(`empty = session model (${modelSesi})`)}
                            disabled={auto}
                            onChange={(e) => ubah(a.id, { model: e.currentTarget.value.trim(), provider: '' })}
                            data-testid={`agc-experts-model-${a.id}`}
                          />
                          <label className="agc-experts-auto" title={tr('Route each task to a suitable available model')}>
                            <input
                              type="checkbox"
                              checked={auto}
                              data-testid={`agc-experts-auto-${a.id}`}
                              onChange={(e) => ubah(a.id, { model: e.currentTarget.checked ? 'auto' : '', provider: '' })}
                            />
                            <span>{tr('Auto')}</span>
                          </label>
                        </div>
                      </label>
                      <label className="agc-field">
                        <span>{tr('Provider')}</span>
                        <input
                          value={c.provider}
                          placeholder={auto ? tr('Auto picks the provider') : tr('empty = session provider')}
                          disabled={auto}
                          onChange={(e) => ubah(a.id, { provider: e.currentTarget.value.trim() })}
                          data-testid={`agc-experts-provider-${a.id}`}
                        />
                      </label>
                      <label className="agc-field">
                        <span>{tr('Extra instructions')}</span>
                        <textarea
                          value={c.instruksi}
                          rows={3}
                          /* Batas 10.000 karakter sama dengan Additional Prompt di
                             produk rujukan; `simpanCfgAhli` tetap memotongnya kalau
                             nilai datang dari luar textarea. */
                          maxLength={MAKS_INSTRUKSI}
                          placeholder={tr('Standing note attached to every task this expert receives…')}
                          onChange={(e) => ubah(a.id, { instruksi: e.currentTarget.value })}
                          data-testid={`agc-experts-instruksi-${a.id}`}
                        />
                        <i
                          className="agc-field-hint"
                          data-testid={`agc-experts-instruksi-hitung-${a.id}`}
                        >
                          {c.instruksi.length.toLocaleString()} / {MAKS_INSTRUKSI.toLocaleString()}{' '}
                          {tr('characters')}
                        </i>
                      </label>
                      <label className="agc-field">
                        <span>{tr('Thinking effort')}</span>
                        <select
                          value={c.effort}
                          onChange={(e) =>
                            ubah(a.id, { effort: e.currentTarget.value as typeof c.effort })
                          }
                          data-testid={`agc-experts-effort-${a.id}`}
                        >
                          {EFFORT_AHLI.map((o) => (
                            <option key={o.id} value={o.id}>
                              {tr(o.label)}
                            </option>
                          ))}
                        </select>
                        <i className="agc-field-hint">
                          {tr(
                            'How hard this expert thinks before acting. "Follow global" uses the Reasoning chip in the composer.',
                          )}
                        </i>
                      </label>
                      <AturanAhli
                        id={a.id}
                        aturan={c.rules ?? []}
                        ubah={(rules) => ubah(a.id, { rules })}
                        tr={tr}
                      />
                    </>
                  )}

                  {/*
                    * Lead TIDAK punya Skills/MCP: orkestrasinya memakai prompt
                    * bawaan dan model sesi, dan `simpanCfgAhli`/`bacaCfgAhli`
                    * sudah menolak nilai Lead. Menampilkan chip yang tidak
                    * bisa disimpan hanya membuat pembaca mengira Lead bisa
                    * dikustomisasi.
                    */}
                  {!lead && (
                    <>
                  <div className="agc-experts-bagian">
                    <div className="agc-experts-bagian-judul">
                      {tr('Skills')}
                      <span className="agc-experts-bagian-hint">
                        {tr('The worker reads these first with skill_view.')}
                      </span>
                    </div>
                    {skills.length === 0 ? (
                      <span className="agc-experts-kosong">{tr('No skills installed yet.')}</span>
                    ) : (
                      <div className="agc-experts-chip">
                        {skills.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            className={`agc-experts-pil${(c.skills ?? []).includes(s.name) ? ' is-on' : ''}`}
                            title={s.description}
                            data-testid={`agc-experts-skill-${a.id}-${s.name}`}
                            onClick={() => toggleDaftar(a.id, 'skills', s.name)}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="agc-experts-bagian">
                    <div className="agc-experts-bagian-judul">
                      {tr('MCP servers')}
                      <span className="agc-experts-bagian-hint">
                        {tr('Nothing checked = every active server.')}
                      </span>
                    </div>
                    {mcpServer.length === 0 ? (
                      <span className="agc-experts-kosong">{tr('No MCP servers')}</span>
                    ) : (
                      <div className="agc-experts-chip">
                        {mcpServer.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`agc-experts-pil${(c.mcp ?? []).includes(s.id) ? ' is-on' : ''}`}
                            data-testid={`agc-experts-mcp-${a.id}-${s.id}`}
                            onClick={() => toggleDaftar(a.id, 'mcp', s.id)}
                          >
                            {s.label || s.id}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                    </>
                  )}

                  <div className="agc-experts-peran">
                    {tr('Underlying worker role')}: <code>{AHLI_BY_ID.get(a.id)?.peran}</code>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="agc-experts-kustom" data-testid="agc-experts-kustom">
        <b>{tr('Custom workers available to the Lead')}</b>
        {kustom.length === 0 ? (
          <span className="agc-experts-kosong">
            {tr('No active custom workers. Create one under Subagents and the Lead can assign it tasks.')}
          </span>
        ) : (
          <div className="agc-experts-chip">
            {kustom.map((c) => (
              <span key={c.id} className="agc-experts-pil is-on" title={c.deskripsi}>
                {c.nama}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/*
 * Editor aturan per ahli: daftar teks pendek yang WAJIB dipatuhi worker ini.
 *
 * Dibuat sebagai daftar (bukan satu textarea) karena aturan adalah syarat
 * terpisah — "jangan ubah migrasi", "selalu jalankan npm test" — dan
 * menumpuknya jadi satu paragraf membuat model membacanya sebagai cerita,
 * bukan daftar perintah. Chip yang bisa dihapus satu per satu juga membuat
 * pembaca berani menambah aturan tanpa takut kehilangan yang lama.
 */
function AturanAhli({
  id,
  aturan,
  ubah,
  tr,
}: {
  id: AhliId;
  aturan: string[];
  ubah: (aturan: string[]) => void;
  tr: (s: string) => string;
}) {
  const [draf, setDraf] = useState('');
  const penuh = aturan.length >= ATURAN_MAKS;
  const tambah = () => {
    const teks = draf.trim().slice(0, ATURAN_MAKS_CHAR);
    if (!teks || penuh) return;
    if (aturan.some((r) => r.toLowerCase() === teks.toLowerCase())) {
      setDraf('');
      return;
    }
    ubah([...aturan, teks]);
    setDraf('');
  };

  return (
    <div className="agc-experts-bagian" data-testid={`agc-experts-rules-${id}`}>
      <div className="agc-experts-bagian-judul">
        {tr('Rules')}
        <span className="agc-experts-bagian-hint">
          {tr('Hard constraints this expert must follow. Attached to every task it receives.')}
        </span>
      </div>
      {aturan.length > 0 && (
        <div className="agc-experts-chip">
          {aturan.map((r) => (
            <button
              key={r}
              type="button"
              className="agc-experts-pil is-on"
              title={`${r} — ${tr('click to remove')}`}
              data-testid={`agc-experts-rule-${id}-${r.slice(0, 24)}`}
              onClick={() => ubah(aturan.filter((x) => x !== r))}
            >
              {r.length > 48 ? `${r.slice(0, 48)}…` : r} <span aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}
      <div className="agc-experts-rule-tambah">
        <input
          value={draf}
          maxLength={ATURAN_MAKS_CHAR}
          placeholder={
            penuh
              ? tr(`Limit reached (${ATURAN_MAKS} rules)`)
              : tr('e.g. Never touch files under src-tauri/ without asking')
          }
          disabled={penuh}
          aria-label={tr('New rule')}
          data-testid={`agc-experts-rule-input-${id}`}
          onChange={(e) => setDraf(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              tambah();
            }
          }}
        />
        <button
          type="button"
          className="agc-experts-pil"
          disabled={penuh || !draf.trim()}
          data-testid={`agc-experts-rule-add-${id}`}
          onClick={tambah}
        >
          + {tr('Add rule')}
        </button>
      </div>
    </div>
  );
}
