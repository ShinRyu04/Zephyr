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
          {pakaiBawaan ? tr('bawaan') : tr('diubah')}
        </span>
        <span className="sp-spacer" />
        {!pakaiBawaan && (
          <button
            className="btn btn-sm"
            data-testid={`${testid}-reset`}
            title={tr('Kembalikan bagian ini ke bawaan')}
            onClick={() => onUbah('')}
          >
            {tr('Kembalikan bawaan')}
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
          'Prompt ini dikirim ke model di setiap percakapan. Biarkan kosong untuk memakai bawaan Zephyr — bawaan sudah disusun supaya bekerja baik di semua model.',
        )}
      </p>

      <div className="sp-ringkas" data-testid="sp-ringkas">
        <span>
          {tr('Tool yang dikenalkan ke model')}: <b>{AGENT_TOOLS.length}</b>
        </span>
        <span className="sp-spacer" />
        <span>
          {tr('Panjang prompt sekarang')}: <b>{pratinjau.length.toLocaleString('id-ID')}</b>{' '}
          {tr('karakter')}
        </span>
        {adaPerubahan && (
          <button className="btn btn-sm" data-testid="sp-reset-semua" onClick={resetSemua}>
            {tr('Kembalikan semua ke bawaan')}
          </button>
        )}
      </div>

      {/* What the AI answers when asked "what model are you". This block is NOT
          bisa diedit: isinya fakta dari konfigurasi (Settings → Model AI),
          bukan teks yang bisa ditulis ulang. Kalau bisa diedit, user bisa
          membuat AI mengaku sebagai model lain — dan itu justru masalah yang
          blok ini selesaikan. */}
      <div className="sp-bagian" data-testid="sp-model-info">
        <div className="sp-bagian-head">
          <span className="sp-bagian-judul">{tr('Model yang menjalankan AI')}</span>
          <span className="sp-spacer" />
          <span className="sp-badge" data-testid="sp-model-badge">
            {modelAktif || tr('belum dipilih')}
          </span>
        </div>
        <p className="sp-ket">
          {tr(
            'Kalau kamu bertanya "kamu model apa", Zeph menjawab dari fakta ini — bukan menebak. Ubah di Settings → Model AI. Blok ini sengaja tidak bisa diedit supaya AI tidak pernah mengaku sebagai model lain.',
          )}
        </p>
        <pre className="sp-pre sp-pre-model" data-testid="sp-model-pre">
          {blokIdentitasModel(providerAktif, modelAktif) || tr('(belum ada model yang dipilih)')}
        </pre>
      </div>

      <BagianPrompt
        judul="Identitas"
        keterangan="Siapa AI ini dan di lingkungan apa ia bekerja. Ubah kalau kamu memakai Zephyr untuk hal khusus (mis. hanya analisis data, bukan mengedit kode)."
        nilai={p.identitas}
        bawaan={PROMPT_BAWAAN.identitas}
        onUbah={ubah('identitas')}
        testid="sp-identitas"
      />

      <BagianPrompt
        judul="Cara kerja"
        keterangan="Urutan langkah yang harus diikuti. Menghapus langkah di sini membuat AI lebih bebas, tapi juga lebih mudah kehilangan arah pada tugas panjang."
        nilai={p.caraKerja}
        bawaan={PROMPT_BAWAAN.caraKerja}
        onUbah={ubah('caraKerja')}
        testid="sp-carakerja"
      />

      <BagianPrompt
        judul="Aturan"
        keterangan="Batas keras. Sebaiknya jangan dihapus seluruhnya — beberapa aturan (jangan menampilkan API key, konfirmasi perintah merusak) melindungi kamu."
        nilai={p.aturan}
        bawaan={PROMPT_BAWAAN.aturan}
        onUbah={ubah('aturan')}
        testid="sp-aturan"
      />

      <BagianPrompt
        judul="Instruksi tambahan"
        keterangan="Selalu ditempel di akhir prompt. Pakai ini untuk kebiasaan proyek kamu (mis. 'selalu pakai pnpm', 'komentar dalam bahasa Indonesia'). Bagian ini TIDAK menggantikan apa pun — ia ditambahkan."
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
          {bukaPratinjau ? tr('Sembunyikan pratinjau') : tr('Lihat prompt lengkap')}
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
            {salin ? tr('Tersalin') : tr('Salin')}
          </button>
        )}
        <span className="sp-catatan">
          {tr('Ini yang benar-benar dikirim ke model (tanpa aturan proyek & konteks).')}
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
        tr('Perintah ini terlalu pendek — tulis lebih spesifik (mis. "npm run build", bukan "n").'),
      );
      return;
    }
    if (isDestructive(v)) {
      setPesan(tr('Perintah yang merusak tidak bisa dimasukkan ke daftar izin.'));
      return;
    }
    if (daftar.includes(v)) {
      setPesan(tr('Sudah ada di daftar.'));
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
        <span className="sp-bagian-judul">{tr('Izin perintah')}</span>
        <span className="sp-spacer" />
        <span className="sp-badge" data-testid="sp-izin-jumlah">
          {daftar.length}
        </span>
      </div>
      <p className="sp-ket">
        {tr(
          'Perintah yang selalu diizinkan tanpa bertanya lagi. Perintah yang merusak (hapus rekursif, reset keras) TETAP ditanya — pengaman itu tidak bisa dimatikan dari sini.',
        )}
      </p>

      <div className="sp-tambah">
        <input
          type="text"
          className="sp-input"
          data-testid="sp-izin-input"
          placeholder={tr('Tambah perintah…')}
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
          {tr('Tambah')}
        </button>
      </div>
      {pesan && (
        <p className="sp-pesan" data-testid="sp-izin-pesan">
          {pesan}
        </p>
      )}

      {daftar.length === 0 ? (
        <p className="sp-kosong" data-testid="sp-izin-kosong">
          {tr('Belum ada perintah yang diizinkan.')}
        </p>
      ) : (
        <div className="sp-daftar" data-testid="sp-izin-daftar">
          {daftar.map((v) => (
            <div className="sp-item" key={v} data-testid="sp-izin-item" data-izin={v}>
              <code className="sp-item-kode">{v}</code>
              <button
                className="sp-item-x"
                data-testid="sp-izin-hapus"
                title={tr('Hapus izin')}
                aria-label={tr('Hapus izin')}
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
