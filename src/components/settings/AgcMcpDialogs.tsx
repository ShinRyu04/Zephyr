import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { KATALOG_MCP_SERVER, bisaDipasang, type KatalogMcpEntry } from '../../lib/katalogMcpServer';
import * as cmd from '../../lib/commands';
import AiIkon from '../ai/AiIkon';
import { IkonPasar } from '../extensions/IkonPasar';

/*
 * "+ Add MCP Servers" - the two doors the reference offers.
 *
 * MARKET: the shipped catalogue (`katalogMcpServer.ts`), searchable, one `+` per
 * row. Installing writes to `settings.mcp.servers`, which is the SAME list the
 * agent checklist reads - so a server added here appears above immediately.
 *
 * MANUAL: paste the `mcpServers` JSON every MCP server's README hands out. This
 * is the powerful and dangerous door: a pasted `command` is a program Zephyr
 * will run. It therefore (a) shows the exact command lines before confirming,
 * and (b) requires a second, explicit click - the same "confirm the source and
 * identify risks" warning the reference shows.
 *
 * Both doors end in `mcpClientSave`, so validation lives in one place (Rust) and
 * a hand-written server is stored exactly like a catalogue one.
 */

export interface HasilPasang {
  /** Ids that were installed, so the caller can tick them. */
  ids: string[];
}

const Shell = ({
  judul,
  onTutup,
  children,
  testid,
}: {
  judul: string;
  onTutup: () => void;
  children: React.ReactNode;
  testid: string;
}) => (
  <div className="modal-backdrop" role="presentation" onMouseDown={onTutup}>
    <div
      className="modal subagent-modal"
      role="dialog"
      aria-modal="true"
      aria-label={judul}
      data-testid={testid}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="subagent-head">
        <h2 className="modal-title">{judul}</h2>
        <button type="button" className="btn btn-icon" data-testid={`${testid}-tutup`} onClick={onTutup}>
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

/* ── Market ───────────────────────────────────────────────────────────────── */

/**
 * Which shelf a catalogue entry belongs on.
 *
 * `repo` - the server lives in someone's repository and is fetched/run from
 * there (its `rumah` points at a GitHub URL). `lokal` - it is bundled with
 * Zephyr or ships as a local package. The reader is about to run this code, so
 * the two are never shown as one undifferentiated list.
 */
export function sumberMcp(e: KatalogMcpEntry): 'repo' | 'lokal' {
  const rumah = String((e as { rumah?: string }).rumah ?? '');
  return /^https?:\/\/(www\.)?github\.com\//i.test(rumah) ? 'repo' : 'lokal';
}

export function McpMarket({
  sudahAda,
  onPasang,
  onTutup,
}: {
  /** Ids already configured: shown as "installed" instead of a `+`. */
  sudahAda: string[];
  onPasang: (e: KatalogMcpEntry) => Promise<void>;
  onTutup: () => void;
}) {
  const tr = useT();
  const [cari, setCari] = useState('');
  const [sibuk, setSibuk] = useState<string | null>(null);

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return KATALOG_MCP_SERVER.filter((e) => {
      if (!q) return true;
      return (
        e.nama.toLowerCase().includes(q) ||
        e.deskripsi.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    });
  }, [cari]);

  return (
    <Shell judul={tr('MCP Marketplace')} onTutup={onTutup} testid="agx-mcp-market">
      <label className="subagent-field">
        <input
          className="input"
          data-testid="agx-mcp-market-cari"
          value={cari}
          placeholder={tr('Search')}
          autoFocus
          onChange={(e) => setCari(e.target.value)}
        />
      </label>

      {/*
        * Grouped by SOURCE, because that is the difference that matters when
        * installing: a repository server is someone else's code running on this
        * machine, and a local one is a file the reader already has. Mixing them
        * in one list hides that distinction exactly where it is about to be
        * acted on. New servers added through this dialog start as local, so the
        * split stays true as the list grows.
        */}
      <div className="agset-daftar agset-daftar-gulir" data-testid="agx-mcp-market-daftar">
        {daftar.length === 0 ? (
          <span className="agset-muted">{tr('No servers match that search.')}</span>
        ) : (
          (['repo', 'lokal'] as const).map((kel) => {
            const isi = daftar.filter((e) => sumberMcp(e) === kel);
            if (isi.length === 0) return null;
            return (
              <div key={kel} className="agset-grup" data-testid={`agx-mcp-grup-${kel}`}>
                <h4 className="agset-grup-judul">
                  {kel === 'repo' ? tr('From repository') : tr('Local / built here')}
                </h4>
                {isi.map((e) => {
                  const terpasang = sudahAda.includes(e.id);
                  const bisa = bisaDipasang(e);
                  return (
                    <div className="agset-baris" key={e.id} data-testid={`agx-mcp-market-${e.id}`}>
                      <IkonPasar jenis="mcp" id={e.id} nama={e.nama} />
                      <div className="agset-baris-teks">
                        <span className="agset-baris-nama">{e.nama}</span>
                        <span className="agset-baris-desk">{e.deskripsi}</span>
                        {e.catatan && (
                          <span className="agset-muted" data-testid={`agx-mcp-market-catatan-${e.id}`}>
                            {e.catatan}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        data-testid={`agx-mcp-pasang-${e.id}`}
                        disabled={terpasang || !bisa || sibuk === e.id}
                        title={terpasang ? tr('Already installed') : bisa ? tr('Add') : tr('Not available')}
                        onClick={() => {
                          setSibuk(e.id);
                          void onPasang(e).finally(() => setSibuk(null));
                        }}
                      >
                        {terpasang ? tr('Installed') : sibuk === e.id ? '…' : '+'}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn" data-testid="agx-mcp-market-batal" onClick={onTutup}>
          {tr('Close')}
        </button>
      </div>
    </Shell>
  );
}

/* ── Manual ───────────────────────────────────────────────────────────────── */

interface EntriManual {
  id: string;
  label: string;
  command?: string;
  args?: string[];
  url?: string;
  token?: string;
  env?: Record<string, string>;
}

/**
 * Parse the `mcpServers` document the MCP ecosystem publishes.
 *
 * Accepts the two shapes people actually paste: the wrapped
 * `{"mcpServers": {...}}` from a README, and a bare `{name: {...}}` map.
 * Returns an error instead of a best guess - a server created from a
 * half-understood document fails later, at run time, where the cause is gone.
 */
export function parseMcpManual(teks: string): EntriManual[] {
  let v: unknown;
  try {
    v = JSON.parse(teks);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('Expected a JSON object.');
  }
  const akar = v as Record<string, unknown>;
  const isi =
    akar.mcpServers && typeof akar.mcpServers === 'object' && !Array.isArray(akar.mcpServers)
      ? (akar.mcpServers as Record<string, unknown>)
      : akar;

  const hasil: EntriManual[] = [];
  for (const [nama, nilai] of Object.entries(isi)) {
    if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai)) continue;
    const s = nilai as Record<string, unknown>;
    const command = typeof s.command === 'string' ? s.command.trim() : '';
    const url = typeof s.url === 'string' ? s.url.trim() : '';
    if (!command && !url) continue;
    const envMasuk = s.env;
    const env =
      envMasuk && typeof envMasuk === 'object' && !Array.isArray(envMasuk)
        ? Object.fromEntries(
            Object.entries(envMasuk as Record<string, unknown>).map(([k, val]) => [k, String(val)]),
          )
        : undefined;
    hasil.push({
      id: nama.trim(),
      label: nama.trim(),
      command: command || undefined,
      args: Array.isArray(s.args) ? s.args.map(String) : undefined,
      url: url || undefined,
      token: typeof s.token === 'string' ? s.token : undefined,
      env,
    });
  }
  if (hasil.length === 0) {
    throw new Error('No server with a "command" or "url" was found in that JSON.');
  }
  return hasil;
}

export function McpManual({
  onPasang,
  onTutup,
}: {
  onPasang: (e: EntriManual) => Promise<void>;
  onTutup: () => void;
}) {
  const tr = useT();
  const [teks, setTeks] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [calon, setCalon] = useState<EntriManual[] | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const periksa = () => {
    setGalat(null);
    try {
      setCalon(parseMcpManual(teks));
    } catch (e) {
      setCalon(null);
      setGalat((e as Error).message);
    }
  };

  const konfirmasi = async () => {
    if (!calon) return;
    setSibuk(true);
    try {
      for (const e of calon) await onPasang(e);
      onTutup();
    } catch (e) {
      setGalat(String((e as { message?: string })?.message ?? e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Shell judul={tr('Configure Manually')} onTutup={onTutup} testid="agx-mcp-manual">
      <p className="agset-muted">
        {tr(
          "Paste the server's `mcpServers` JSON (preferably an NPX or UVX config) from its documentation.",
        )}
      </p>
      <label className="subagent-field">
        <textarea
          className="input subagent-prompt"
          data-testid="agx-mcp-manual-teks"
          rows={10}
          spellCheck={false}
          value={teks}
          placeholder={'{\n  "mcpServers": {\n    "example-server": {\n      "command": "npx",\n      "args": ["-y", "mcp-server-example"]\n    }\n  }\n}'}
          onChange={(e) => {
            setTeks(e.target.value);
            setCalon(null);
            setGalat(null);
          }}
        />
      </label>

      {galat && (
        <p className="agset-galat" data-testid="agx-mcp-manual-galat">
          {galat}
        </p>
      )}

      {/*
        * The confirmation step, and it is not decoration.
        *
        * A `command` here is a program Zephyr will run on this machine. The
        * reference shows the same warning ("confirm the source and identify
        * risks"); showing the exact command lines is the part that makes the
        * warning checkable instead of ceremonial.
        */}
      {calon && (
        <div className="agset-kotak" data-testid="agx-mcp-manual-konfirmasi">
          <div className="agset-kotak-head">
            <strong>{tr('These programs will be run')}</strong>
          </div>
          <div className="agset-kotak-isi">
            {calon.map((e) => (
              <div key={e.id} className="agset-tool-baris">
                <span className="agset-tool-nama">{e.label}</span>
                <span className="agset-muted">
                  {e.command ? `$ ${e.command} ${(e.args ?? []).join(' ')}`.trim() : e.url}
                </span>
              </div>
            ))}
          </div>
          <p className="agset-muted">
            {tr('Confirm you trust the source before adding it.')}
          </p>
        </div>
      )}

      <div className="modal-actions">
        <span className="subagent-spacer" />
        {calon ? (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="agx-mcp-manual-konfirmasi-tombol"
            disabled={sibuk}
            onClick={() => void konfirmasi()}
          >
            {sibuk ? tr('Saving…') : tr('Confirm')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="agx-mcp-manual-periksa"
            disabled={!teks.trim()}
            onClick={periksa}
          >
            {tr('Review')}
          </button>
        )}
        <button type="button" className="btn" data-testid="agx-mcp-manual-batal" onClick={onTutup}>
          {tr('Cancel')}
        </button>
      </div>
    </Shell>
  );
}

/** Install one catalogue entry. Shared by the market dialog. */
export async function pasangDariKatalog(e: KatalogMcpEntry): Promise<void> {
  if (!bisaDipasang(e)) return;
  if (e.transport === 'stdio') {
    await cmd.mcpClientSave({
      id: e.id,
      label: e.nama,
      url: '',
      token: '',
      command: e.command,
      args: e.args,
    });
  } else {
    await cmd.mcpClientSave({ id: e.id, label: e.nama, url: e.url, token: '' });
  }
}

/** Install one manually written entry. */
export async function pasangManual(e: EntriManual): Promise<void> {
  await cmd.mcpClientSave({
    id: e.id,
    label: e.label,
    url: e.url ?? '',
    token: e.token ?? '',
    command: e.command ?? '',
    args: e.args ?? [],
    env: e.env,
  });
}

export type { EntriManual };

/** Kept so the icon import is not dropped when the rows lose theirs. */
void AiIkon;
