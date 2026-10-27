import { useMemo, useState } from 'react';
import { useSubagentCustom, ALAT, type SubagentCustom } from '../../lib/subagentCustom';
import { PERAN } from '../../lib/subagentRoles';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';

/*
 * Halaman "Subagents" di Agent Customizations - bentuk ZCode.
 *
 * Bahasanya SAMA PERSIS dengan Skills / Computer Use / Browser di sebelahnya:
 * judul + hitungan, kotak cari di kanan, grup bernama ("Installed",
 * "Built-in subagents"), lalu kartu berikon (ikon kotak, nama tebal, chip
 * jumlah tool, keterangan satu-dua baris, aksi di kanan). Formulir New/Edit
 * memakai panel `.agc-zc-editor` yang sama dengan editor skill.
 *
 * Sebelumnya halaman ini punya keluarga kelas sendiri (`agc-sub-*`) dengan
 * tinggi baris, jarak, dan tombol yang berbeda - jadi walau isinya benar, ia
 * terbaca sebagai halaman lain, bukan bagian dari Agent Customizations.
 *
 * Peran bawaan ditampilkan dengan LABEL-nya (Search, Review, Plan, ...), bukan
 * id internal (`cari`, `telaah`). Id itu kunci prompt, bukan teks yang pantas
 * dibaca pengguna.
 *
 * Datanya dari `subagentCustom`; override model per peran disimpan di
 * localStorage (kunci `zephyr.subagent.roleModel`) dan dibaca subagentRouter.
 */

const KUNCI_ROLE_MODEL = 'zephyr.subagent.roleModel';

function bacaRoleModel(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KUNCI_ROLE_MODEL) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

const KOSONG: Omit<SubagentCustom, 'id'> = {
  nama: '',
  deskripsi: '',
  alat: [],
  prompt: '',
  model: '',
  provider: '',
  aktif: true,
  ikon: 'bot',
};

export default function AgcSubagents() {
  const tr = useT();
  const daftar = useSubagentCustom((s) => s.daftar);
  const simpanStore = useSubagentCustom((s) => s.simpan);
  const hapus = useSubagentCustom((s) => s.hapus);

  const [cari, setCari] = useState('');
  const [baru, setBaru] = useState(false);
  const [idEdit, setIdEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<SubagentCustom, 'id'>>(KOSONG);
  const [roleModel, setRoleModel] = useState<Record<string, string>>(bacaRoleModel);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return daftar;
    return daftar.filter((d) => `${d.nama} ${d.deskripsi}`.toLowerCase().includes(q));
  }, [daftar, cari]);

  const mulaiBaru = () => {
    setDraft(KOSONG);
    setIdEdit(null);
    setBaru(true);
  };

  const mulaiEdit = (d: SubagentCustom) => {
    setDraft({ ...d });
    setIdEdit(d.id);
    setBaru(true);
  };

  const kirimForm = async () => {
    if (!draft.nama.trim()) return;
    /* Edit = upsert: set `sunting` dulu supaya store mengganti yang lama. */
    if (idEdit) useSubagentCustom.setState({ sunting: idEdit });
    await simpanStore(draft);
    setBaru(false);
    setDraft(KOSONG);
    setIdEdit(null);
  };

  const setRole = (peran: string, model: string) => {
    const berikut = { ...roleModel, [peran]: model };
    setRoleModel(berikut);
    try {
      localStorage.setItem(KUNCI_ROLE_MODEL, JSON.stringify(berikut));
    } catch {
      /* sesi ini saja */
    }
  };

  return (
    <div className="agc-pane agc-skills" data-testid="agc-subagents">
      <div className="agc-zc-atas">
        <h2 className="agc-zc-judul">{tr('Subagents')}</h2>
        <span className="agc-zc-hitung">{daftar.length}</span>
        <input
          className="agc-zc-cari"
          data-testid="agc-sub-cari"
          placeholder={tr('Search subagents…')}
          aria-label={tr('Search subagents…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>
      <p className="agc-zc-desk-satu">
        {tr('Dedicated workers the agent can delegate to. Built-in roles, plus workers you define.')}
      </p>

      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">
          {tr('Installed')} <span className="agc-zc-hitung">{tersaring.length}</span>
        </span>
        <button
          type="button"
          className="agc-zc-btn is-utama agc-zc-dorong"
          data-testid="agc-sub-baru"
          disabled={baru}
          onClick={mulaiBaru}
        >
          + {tr('New')}
        </button>
      </div>

      {tersaring.length === 0 && !baru ? (
        <div className="agc-zc-kosong-kecil" data-testid="agc-sub-kosong">
          {cari.trim() ? tr('Nothing matches that search.') : tr('No subagents yet.')}{' '}
          <button type="button" className="agc-zc-link" onClick={mulaiBaru}>
            {tr('New subagent')}
          </button>
        </div>
      ) : (
        <div className="agc-zc-daftar" data-testid="agc-sub-daftar">
          {tersaring.map((d) => (
            <div className="agc-zc-kartu" key={d.id} data-testid={`agc-sub-kartu-${d.id}`}>
              <span className="agc-zc-ikon" aria-hidden="true">
                <AiIkon name="robot" size={15} />
              </span>
              <div className="agc-zc-isi">
                <div className="agc-zc-judulbaris">
                  <span className="agc-zc-kartu-head">{d.nama}</span>
                  <span className="agc-zc-chip">
                    {d.alat.length} {tr('tools')}
                  </span>
                  {!d.aktif && <span className="agc-zc-chip">{tr('off')}</span>}
                </div>
                <div className="agc-zc-desk">{d.deskripsi || tr('(no description)')}</div>
              </div>
              <div className="agc-zc-aksi">
                <button
                  type="button"
                  className="agc-zc-btn"
                  data-testid={`agc-sub-edit-${d.id}`}
                  onClick={() => mulaiEdit(d)}
                >
                  {tr('Edit')}
                </button>
                <button
                  type="button"
                  className="agc-zc-ikon-hapus"
                  data-testid={`agc-sub-hapus-${d.id}`}
                  title={tr('Delete')}
                  aria-label={tr('Delete')}
                  onClick={() => void hapus(d.id)}
                >
                  <AiIkon name="trash" size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {baru && (
        <section className="agc-zc-editor" data-testid="agc-sub-form">
          <div className="agc-zc-grub-judul">
            {idEdit ? `${tr('Edit')}: ${draft.nama || tr('Subagent')}` : tr('New subagent')}
          </div>

          <div className="agc-zc-baris-dua">
            <label className="agc-zc-field">
              <span>{tr('Name')}</span>
              <input
                className="agc-field"
                data-testid="agc-sub-nama"
                value={draft.nama}
                onChange={(e) => setDraft({ ...draft, nama: e.target.value })}
                placeholder="code-reviewer"
              />
            </label>
            <label className="agc-zc-field">
              <span>{tr('Model')}</span>
              <input
                className="agc-field"
                data-testid="agc-sub-model"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder={tr('Inherit')}
              />
            </label>
          </div>

          <label className="agc-zc-field">
            <span>{tr('Description')}</span>
            <input
              className="agc-field"
              data-testid="agc-sub-deskripsi"
              value={draft.deskripsi}
              onChange={(e) => setDraft({ ...draft, deskripsi: e.target.value })}
              placeholder={tr('Short description shown to the model')}
            />
          </label>

          <div className="agc-zc-grub-judul">{tr('Allowed tools')}</div>
          <div className="agc-zc-alat" data-testid="agc-sub-alat">
            {ALAT.map((a) => (
              <label key={a.id} className="agc-zc-alat-item" title={tr(a.hint)}>
                <input
                  type="checkbox"
                  checked={draft.alat.includes(a.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      alat: e.target.checked
                        ? [...draft.alat, a.id]
                        : draft.alat.filter((x) => x !== a.id),
                    })
                  }
                />
                {tr(a.label)}
              </label>
            ))}
          </div>

          <label className="agc-zc-field">
            <span>{tr('System prompt')}</span>
            <textarea
              className="agc-field agc-field-area"
              data-testid="agc-sub-prompt"
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              placeholder={tr("Describe this subagent's role and rules…")}
              rows={6}
            />
          </label>

          <div className="agc-zc-aksi-bawah">
            <button
              type="button"
              className="agc-zc-btn"
              onClick={() => {
                setBaru(false);
                setIdEdit(null);
                setDraft(KOSONG);
              }}
            >
              {tr('Cancel')}
            </button>
            <button
              type="button"
              className="agc-zc-btn is-utama"
              data-testid="agc-sub-simpan"
              disabled={!draft.nama.trim()}
              onClick={() => void kirimForm()}
            >
              {tr('Save')}
            </button>
          </div>
        </section>
      )}

      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">
          {tr('Built-in subagents')} <span className="agc-zc-hitung">{PERAN.length}</span>
        </span>
      </div>
      <div className="agc-zc-daftar" data-testid="agc-sub-bawaan">
        {PERAN.map((p) => (
          <div className="agc-zc-kartu" key={p.id} data-testid={`agc-sub-bawaan-${p.id}`}>
            <span className="agc-zc-ikon" aria-hidden="true">
              <AiIkon name="robot" size={15} />
            </span>
            <div className="agc-zc-isi">
              <div className="agc-zc-judulbaris">
                <span className="agc-zc-kartu-head">{tr(p.label)}</span>
                <span className="agc-zc-chip">{p.id}</span>
              </div>
              <div className="agc-zc-desk">{tr(p.hint)}</div>
            </div>
            <div className="agc-zc-aksi">
              <select
                className="agc-zc-pil"
                data-testid={`agc-sub-model-${p.id}`}
                aria-label={tr(p.label)}
                value={roleModel[p.id] ?? ''}
                onChange={(e) => setRole(p.id, e.target.value)}
              >
                <option value="">{tr('Inherit default')}</option>
                <option value="follow">{tr('Follow chat')}</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
