// CliAgentBar.tsx — pemilih jalur AI: Native (adapter API) vs CLI (akun
// langganan) + status login tiap CLI (T1.2/T1.5).
//
// KENAPA ada di header panel AI, bukan di Settings: pilihan ini diubah
// PER PERCAKAPAN (kadang mau pakai API key, kadang mau pakai akun Codex).
// Menaruhnya di Settings membuat user harus keluar dari chat untuk berganti.
//
// TAMPILAN: deretan chip. Chip aktif = jalur yang dipakai. CLI yang belum
// login tetap terlihat tapi nonaktif + alasan singkat, supaya user tahu apa
// yang harus dijalankan alih-alih menebak kenapa tidak muncul.

import { useEffect } from 'react';
import { useCliAgent } from '../../lib/cliAgentStore';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

export default function CliAgentBar() {
  const tr = useT();
  const agents = useCliAgent((s) => s.agents);
  const aktif = useCliAgent((s) => s.aktif);
  const sibuk = useCliAgent((s) => s.sibuk);
  const detect = useCliAgent((s) => s.detect);
  const setAktif = useCliAgent((s) => s.setAktif);
  const agentMode = useAi((s) => s.agentMode);

  // Deteksi sekali saat panel dibuka. Bukan di setiap render: panggilan ini
  // menelusuri PATH dan membaca metadata file.
  useEffect(() => {
    void detect();
  }, [detect]);

  // Tidak ada CLI terpasang sama sekali -> sembunyikan seluruh baris supaya
  // header tidak penuh chip yang tidak berguna.
  const adaYangTerpasang = agents.some((a) => a.terpasang);
  if (!adaYangTerpasang) return null;

  return (
    <div className="ai-cli-bar" data-testid="ai-cli-bar" role="group"
      aria-label={tr('Jalur AI')}>
      <button
        className={`ai-cli-chip${aktif === null ? ' is-on' : ''}`}
        data-testid="ai-cli-native"
        title={tr('Pakai adapter API (butuh API key)')}
        onClick={() => setAktif(null)}
      >
        {tr('Native')}
      </button>
      {agents.map((a) => {
        const bisa = a.terpasang && a.login;
        return (
          <button
            key={a.id}
            className={`ai-cli-chip${aktif === a.id ? ' is-on' : ''}${bisa ? '' : ' is-off'}`}
            data-testid={`ai-cli-${a.id}`}
            data-terpasang={a.terpasang}
            data-login={a.login}
            disabled={!bisa || sibuk}
            title={
              bisa
                ? `${a.label} — ${a.path ?? a.bin}`
                : a.catatan || tr('Belum siap')
            }
            onClick={() => setAktif(a.id)}
          >
            {a.label}
            {!a.login && a.terpasang && (
              <span className="ai-cli-warn" aria-hidden="true"> •</span>
            )}
          </button>
        );
      })}
      {aktif !== null && agentMode === 'chat' && (
        <span className="ai-cli-hint" data-testid="ai-cli-hint">
          {tr('mode CLI: kirim pesan untuk menjalankan CLI')}
        </span>
      )}
    </div>
  );
}
