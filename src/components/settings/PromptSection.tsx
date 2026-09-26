import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { PROMPT_BAWAAN, systemPromptFor, blokIdentitasModel } from '../../lib/systemPrompt';
import { useAi } from '../../lib/aiStore';
import { AGENT_TOOLS } from '../../lib/agentTools';
import { isDestructive } from '../../lib/aiStore';

function BagianPrompt({
  judul,
  keterangan,
  nilai,
  bawaan,
  onUbah,
  testid,
}: {
  judul: string;
  keterangan: string;
  nilai: string;
  bawaan: string;
  onUbah: (v: string) => void;
  testid: string;
}) {
  const tr = useT();
  const pakaiBawaan = !nilai.trim();
  return (
    <div className="sp-bagian" data-testid={testid}>
      <div className="sp-bagian-head">
        <span className="sp-bagian-judul">{tr(judul)}</span>
        <span className={`sp-badge${pakaiBawaan ? '' : ' is-ubah'}`} data-testid={`${testid}-status`}>
          {pakaiBawaan ? tr('default') : tr('modified')}
        </span>
        <span className="sp-spacer" />
        {!pakaiBawaan && (
          <button
            className="btn btn-sm"
            data-testid={`${testid}-reset`}
            title={tr('Reset this section to default')}
            onClick={() => onUbah('')}
          >
            {tr('Reset to default')}
          </button>
        )}
      </div>
      <p className="sp-ket">{tr(keterangan)}</p>
      <textarea
        className="sp-area"
        data-testid={`${testid}-area`}
        spellCheck={false}
        rows={6}
        value={nilai}
        placeholder={bawaan}
        onChange={(e) => onUbah(e.target.value)}
      />
    </div>
  );
}

export default function PromptSection() {
  const tr = useT();
  const aiPrompt = useStore((s) => s.settings.aiPrompt);
  const applySettings = useStore((s) => s.applySettings);
  const [bukaPratinjau, setBukaPratinjau] = useState(false);
  const [salin, setSalin] = useState(false);

  const modelAktif = useAi((s) => s.model);
  const providerAktif = useAi((s) => s.provider);

  const p = aiPrompt ?? { identitas: '', caraKerja: '', aturan: '', instruksi: '' };

  const ubah = (kunci: 'identitas' | 'caraKerja' | 'aturan' | 'instruksi') => (v: string) =>
    void applySettings({ aiPrompt: { [kunci]: v } } as never);

  const resetSemua = () =>
    void applySettings({ aiPrompt: { identitas: '', caraKerja: '', aturan: '', instruksi: '' } } as never);

  const pratinjau = useMemo(
    () => systemPromptFor('follow', '', '', modelAktif, providerAktif),

    [p.identitas, p.caraKerja, p.aturan, p.instruksi, modelAktif, providerAktif],
  );

  const adaPerubahan =
    !!p.identitas.trim() || !!p.caraKerja.trim() || !!p.aturan.trim() || !!p.instruksi.trim();

  return (
    <div className="sp-root" data-testid="prompt-section">
      <h2 className="set-h2">{tr('Prompt AI')}</h2>
      <p className="set-note">
        {tr(
          'This prompt is sent to the model on every conversation. Leave it empty to use the Zephyr default - the default is tuned to work well across all models.',
        )}
      </p>

      <div className="sp-ringkas" data-testid="sp-ringkas">
        <span>
          {tr('Tools introduced to the model')}: <b>{AGENT_TOOLS.length}</b>
        </span>
        <span className="sp-spacer" />
        <span>
          {tr('Current prompt length')}: <b>{pratinjau.length.toLocaleString('id-ID')}</b>{' '}
          {tr('characters')}
        </span>
        {adaPerubahan && (
          <button className="btn btn-sm" data-testid="sp-reset-semua" onClick={resetSemua}>
            {tr('Reset everything to default')}
          </button>
        )}
      </div>

      {/* What the AI answers when asked "what model are you". This block is NOT
          bisa diedit: isinya fakta dari konfigurasi (Settings → Model AI),
          bukan teks yang bisa ditulis ulang. Kalau bisa diedit, user bisa
          membuat AI mengaku sebagai model lain - dan itu justru masalah yang
          blok ini selesaikan. */}
      <div className="sp-bagian" data-testid="sp-model-info">
        <div className="sp-bagian-head">
          <span className="sp-bagian-judul">{tr('Model that runs the AI')}</span>
          <span className="sp-spacer" />
          <span className="sp-badge" data-testid="sp-model-badge">
            {modelAktif || tr('not selected yet')}
          </span>
        </div>
        <p className="sp-ket">
          {tr(
            'If you ask "what model are you", Zeph answers from these facts - not by guessing. Change it in Settings → AI Models. This block is intentionally not editable so the AI never claims to be another model.',
          )}
        </p>
        <pre className="sp-pre sp-pre-model" data-testid="sp-model-pre">
          {blokIdentitasModel(providerAktif, modelAktif) || tr('(no model selected yet)')}
        </pre>
      </div>

      <BagianPrompt
        judul="Identity"
        keterangan="Who this AI is and the environment it works in. Change it if you use Zephyr for something special (e.g. data analysis only, not code editing)."
        nilai={p.identitas}
        bawaan={PROMPT_BAWAAN.identitas}
        onUbah={ubah('identitas')}
        testid="sp-identitas"
      />

      <BagianPrompt
        judul="Workflow"
        keterangan="The sequence of steps to follow. Removing steps here gives the AI more freedom, but also makes it easier to lose track on long tasks."
        nilai={p.caraKerja}
        bawaan={PROMPT_BAWAAN.caraKerja}
        onUbah={ubah('caraKerja')}
        testid="sp-carakerja"
      />

      <BagianPrompt
        judul="Rules"
        keterangan="Hard limits. It is best not to remove them entirely - some rules (do not show API keys, confirm destructive commands) protect you."
        nilai={p.aturan}
        bawaan={PROMPT_BAWAAN.aturan}
        onUbah={ubah('aturan')}
        testid="sp-aturan"
      />

      <BagianPrompt
        judul="Additional instructions"
        keterangan="Always appended at the end of the prompt. Use this for your project habits (e.g. 'always use pnpm', 'comments in Indonesian'). This section does NOT replace anything - it is added."
        nilai={p.instruksi}
        bawaan=""
        onUbah={ubah('instruksi')}
        testid="sp-instruksi"
      />

      <div className="sp-pratinjau">
        <button
          className="btn btn-sm"
          data-testid="sp-lihat"
          aria-expanded={bukaPratinjau}
          onClick={() => setBukaPratinjau((v) => !v)}
        >
          {bukaPratinjau ? tr('Hide preview') : tr('View full prompt')}
        </button>
        {bukaPratinjau && (
          <button
            className="btn btn-sm"
            data-testid="sp-salin"
            onClick={() => {
              void navigator.clipboard?.writeText(pratinjau).catch(() => {});
              setSalin(true);
              window.setTimeout(() => setSalin(false), 1600);
            }}
          >
            {salin ? tr('Copied') : tr('Copy')}
          </button>
        )}
        <span className="sp-catatan">
          {tr('This is what is actually sent to the model (without project rules & context).')}
        </span>
      </div>

      {bukaPratinjau && (
        <pre className="sp-pre" data-testid="sp-pre">
          {pratinjau}
        </pre>
      )}

      <IzinPerintah />
    </div>
  );
}

function IzinPerintah() {
  const tr = useT();

  const daftar = useStore((s) => s.settings.allowCommands) ?? [];
  const applySettings = useStore((s) => s.applySettings);
  const [draft, setDraft] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);

  const tambah = () => {
    const v = draft.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (v.length < 3) {
      setPesan(
        tr('This command is too short - write something more specific (e.g. "npm run build", not "n").'),
      );
      return;
    }
    if (isDestructive(v)) {
      setPesan(tr('Destructive commands cannot be added to the allow list.'));
      return;
    }
    if (daftar.includes(v)) {
      setPesan(tr('Already in the list.'));
      return;
    }
    setPesan(null);
    setDraft('');
    void applySettings({ allowCommands: [...daftar, v] } as never);
  };

  const hapus = (v: string) =>
    void applySettings({ allowCommands: daftar.filter((x) => x !== v) } as never);

  return (
    <div className="sp-bagian" data-testid="sp-izin">
      <div className="sp-bagian-head">
        <span className="sp-bagian-judul">{tr('Command permissions')}</span>
        <span className="sp-spacer" />
        <span className="sp-badge" data-testid="sp-izin-jumlah">
          {daftar.length}
        </span>
      </div>
      <p className="sp-ket">
        {tr(
          'Commands that are always allowed without asking again. Destructive commands (recursive delete, hard reset) are STILL asked - that safety net cannot be turned off from here.',
        )}
      </p>

      <div className="sp-tambah">
        <input
          type="text"
          className="sp-input"
          data-testid="sp-izin-input"
          placeholder={tr('Add a command…')}
          value={draft}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setPesan(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') tambah();
          }}
        />
        <button
          className="btn btn-sm"
          data-testid="sp-izin-tambah"
          onClick={tambah}
        >
          {tr('Add')}
        </button>
      </div>
      {pesan && (
        <p className="sp-pesan" data-testid="sp-izin-pesan">
          {pesan}
        </p>
      )}

      {daftar.length === 0 ? (
        <p className="sp-kosong" data-testid="sp-izin-kosong">
          {tr('No allowed commands yet.')}
        </p>
      ) : (
        <div className="sp-daftar" data-testid="sp-izin-daftar">
          {daftar.map((v) => (
            <div className="sp-item" key={v} data-testid="sp-izin-item" data-izin={v}>
              <code className="sp-item-kode">{v}</code>
              <button
                className="sp-item-x"
                data-testid="sp-izin-hapus"
                title={tr('Remove permission')}
                aria-label={tr('Remove permission')}
                onClick={() => hapus(v)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
