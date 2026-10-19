import { useMemo, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { useAgentCustom, type AgentCustomSection } from '../../lib/agentCustomStore';
import AiIkon, { type NamaAiIkon } from '../ai/AiIkon';
import SessionContextMenu from './SessionContextMenu';

/*
 * The left column — the TASK LIST.
 *
 * ## Measured shape (from the reference layout)
 *
 *   column          300px, no card of its own: it sits on the window frame
 *   "New task" row  276x34 at x=12, radius 6, icon 20px then 14px label
 *   list heading    12px, colour #737373, padding 4px 4px 4px 8px
 *   group header    32px, chevron + folder + count, colour #737373
 *   session row     32px, radius 6, one line, no subtitle
 *   footer          48px, pinned to the bottom, one row of account controls
 *
 * ## What changed, and why
 *
 * The old column had its own header ("Sessions" + a `+` button) and a search
 * box, then a Customizations block at the bottom. The reference has NONE of
 * that: it opens with a single "New task" row, groups the list by project, and
 * puts a footer at the bottom holding the account.
 *
 * The search box is gone from here because it moved into the chat panel's header,
 * where the reference keeps it. Customizations moved to the footer's `…` menu —
 * a full list of eight sections in a 300px column was competing with the thing
 * the column exists for (the task list).
 */

/** Customizations entries, opened from the footer menu. */
type Custom = { label: string; section: AgentCustomSection; icon: NamaAiIkon };

const CUSTOMS: Custom[] = [
  { label: 'Overview', section: 'overview', icon: 'robot' },
  { label: 'Plugins', section: 'plugins', icon: 'link' },
  { label: 'MCP Servers', section: 'mcp', icon: 'terminal' },
  { label: 'Skills', section: 'skills', icon: 'thought' },
  { label: 'Instructions', section: 'instructions', icon: 'doc' },
  { label: 'Agents', section: 'agents', icon: 'robot' },
  { label: 'Hooks', section: 'hooks', icon: 'queue' },
  { label: 'Tools', section: 'tools', icon: 'wrench' },
];

/** Last path segment of a workspace, for the group header. */
function namaFolder(label: string): string {
  const bersih = label.replace(/[\\/]+$/, '');
  const bagian = bersih.split(/[\\/]/).filter(Boolean);
  return bagian[bagian.length - 1] || label;
}

/** "Today" / "Yesterday" / a date — the heading the reference draws above a group. */
function judulGrup(ms: number, tr: (s: string) => string): string {
  const hari = Math.floor((Date.now() - ms) / 86_400_000);
  if (hari <= 0) return tr('Today');
  if (hari === 1) return tr('Yesterday');
  if (hari < 7) return `${hari} ${tr('days ago')}`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AgentsSessions() {
  const tr = useT();
  const sesi = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeIds?.['agents'] ?? s.activeId);
  const selectChat = useAi((s) => s.selectChat);
  const newChat = useAi((s) => s.newChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const renameChat = useAi((s) => s.renameChat);
  const duplicateChat = useAi((s) => s.duplicateChat);
  const setChatPinned = useAi((s) => s.setChatPinned);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const bukaCustom = useAgentCustom((s) => s.buka);
  const workspaceAktif = useStore((s) => s.workspace);

  const [menu, setMenu] = useState<{ id: string; judul: string; dipin: boolean; x: number; y: number } | null>(null);
  const [gantiNama, setGantiNama] = useState<{ id: string; teks: string } | null>(null);
  const [lipat, setLipat] = useState<Record<string, boolean>>({});
  const [menuFooter, setMenuFooter] = useState(false);

  /* Newest activity first — a conversation you just had is the one you want. */
  const urut = useMemo(() => {
    const arr = [...sesi];
    arr.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (
        (b.messages[b.messages.length - 1]?.at ?? b.createdAt) -
        (a.messages[a.messages.length - 1]?.at ?? a.createdAt)
      );
    });
    return arr;
  }, [sesi]);

  /*
   * Group by the workspace folder each conversation belongs to, and by DAY
   * inside it — which is the two-level grouping the reference draws.
   *
   * A session that RECORDED a folder belongs to that folder, full stop; one with
   * no recorded folder goes to "Chats" rather than to whichever folder happens
   * to be open, because the old fallback made old conversations silently MOVE
   * between groups as the reader switched folders.
   */
  const grup = useMemo(() => {
    const peta = new Map<string, typeof urut>();
    for (const s of urut) {
      const kosong = s.messages.length === 0;
      if (kosong && s.id !== activeId) continue;
      const label = s.workspace || tr('Chats');
      const arr = peta.get(label);
      if (arr) arr.push(s);
      else peta.set(label, [s]);
    }
    return [...peta.entries()].sort((a, b) => {
      if (a[0] === workspaceAktif) return -1;
      if (b[0] === workspaceAktif) return 1;
      if (a[0] === tr('Chats')) return 1;
      if (b[0] === tr('Chats')) return -1;
      const terbaru = (arr: typeof urut) =>
        Math.max(...arr.map((s) => s.messages[s.messages.length - 1]?.at ?? s.createdAt));
      return terbaru(b[1]) - terbaru(a[1]);
    });
  }, [urut, workspaceAktif, activeId, tr]);

  return (
    <div className="ag-sesi" data-testid="ag-sessions">
      {/* "New task" — the first row, exactly as the reference opens the column. */}
      <div className="ag-sesi-atas">
        <button
          className="ag-sesi-baru"
          data-testid="ag-new-session"
          onClick={() => newChat('agents')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-sesi-baru-ic">
            <path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
          <span className="ag-sesi-baru-teks">{tr('New task')}</span>
        </button>
      </div>

      <div className="ag-sesi-list">
        {grup.length === 0 && <p className="ag-sesi-kosong">{tr('No conversations yet')}</p>}
        {grup.map(([label, items]) => {
          const terlipat = !!lipat[label] && label !== workspaceAktif;

          /*
           * Inside a folder, rows are bucketed by day and each bucket gets a
           * 12px grey heading. That is the reference's shape, and it is useful
           * on its own: a list of forty titles with no date anchor is hard to
           * scan for "the one from this morning".
           */
          const perHari = new Map<string, typeof items>();
          for (const s of items) {
            const kunci = judulGrup(s.messages[s.messages.length - 1]?.at ?? s.createdAt, tr);
            const arr = perHari.get(kunci);
            if (arr) arr.push(s);
            else perHari.set(kunci, [s]);
          }

          return (
            <div key={label} className="ag-sesi-grup" data-grup={label}>
              <div
                className="ag-sesi-grup-head"
                data-testid="ag-sesi-grup-head"
                data-grup={label}
                data-terlipat={terlipat ? 'ya' : 'tidak'}
                title={label}
                role="button"
                tabIndex={0}
                aria-expanded={!terlipat}
                onClick={() => setLipat((s) => ({ ...s, [label]: !terlipat }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLipat((s) => ({ ...s, [label]: !terlipat }));
                  }
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className={`ag-sesi-grup-chev${terlipat ? '' : ' is-buka'}`}>
                  <path d="M6 3.6L10.4 8L6 12.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-sesi-grup-ic">
                  <path
                    d="M1.8 4.6A1.2 1.2 0 0 1 3 3.4h3l1.2 1.4h5.8A1.2 1.2 0 0 1 14.2 6v5.4A1.2 1.2 0 0 1 13 12.6H3a1.2 1.2 0 0 1-1.2-1.2z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="ag-sesi-grup-nama">{namaFolder(label)}</span>
              </div>

              {!terlipat &&
                [...perHari.entries()].map(([hari, isi]) => (
                  <div key={hari} className="ag-sesi-hari">
                    <div className="ag-sesi-hari-judul">{hari}</div>
                    {isi.map((s) => (
                      <button
                        key={s.id}
                        className={`ag-sesi-row${s.id === activeId ? ' is-aktif' : ''}`}
                        data-testid={`ag-sesi-${s.id}`}
                        title={s.title}
                        onClick={() => selectChat(s.id, 'agents')}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ id: s.id, judul: s.title || tr('Untitled'), dipin: !!s.pinned, x: e.clientX, y: e.clientY });
                        }}
                        onDoubleClick={() => setGantiNama({ id: s.id, teks: s.title || '' })}
                      >
                        {gantiNama?.id === s.id ? (
                          <input
                            className="ag-sesi-row-input"
                            data-testid="ag-sesi-rename-input"
                            value={gantiNama.teks}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setGantiNama({ id: s.id, teks: e.target.value })}
                            onBlur={() => {
                              renameChat(s.id, gantiNama.teks);
                              setGantiNama(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameChat(s.id, gantiNama.teks);
                                setGantiNama(null);
                              }
                              if (e.key === 'Escape') setGantiNama(null);
                            }}
                          />
                        ) : (
                          <span className="ag-sesi-row-teks">{s.title || tr('Untitled')}</span>
                        )}
                        {s.pinned && (
                          <svg viewBox="0 0 16 16" aria-hidden="true" className="ag-sesi-row-pin" data-testid="ag-sesi-pin">
                            <path
                              d="M9.6 2.2 13.8 6.4l-1.6 1.6-.6-.6-2.6 2.6.2 2.2-1 1-3.4-3.4 1-1 2.2.2 2.6-2.6-.6-.6z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.1"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {menu && (
        <SessionContextMenu
          x={menu.x}
          y={menu.y}
          judul={menu.judul}
          dipin={menu.dipin}
          onAksi={(aksi) => {
            const id = menu.id;
            switch (aksi) {
              case 'rename':
                setGantiNama({ id, teks: menu.judul });
                break;
              case 'duplicate':
                duplicateChat(id);
                break;
              case 'pin':
                setChatPinned(id, true);
                break;
              case 'unpin':
                setChatPinned(id, false);
                break;
              case 'copyTitle':
                void navigator.clipboard?.writeText(menu.judul).catch(() => undefined);
                break;
              case 'copyId':
                void navigator.clipboard?.writeText(id).catch(() => undefined);
                break;
              case 'delete':
                deleteChat(id);
                break;
            }
          }}
          onTutup={() => setMenu(null)}
        />
      )}

      {/* ── Footer: 48px, account + the `…` menu ───────────────────────────── */}
      <div className="ag-sesi-footer">
        <button
          className="ag-sesi-akun"
          data-testid="ag-footer-akun"
          title={workspaceAktif ?? tr('No folder')}
          onClick={() => setSettingsOpen(true)}
        >
          <span className="ag-sesi-akun-avatar" aria-hidden="true">
            {(namaFolder(workspaceAktif ?? 'Z') || 'Z').slice(0, 1).toUpperCase()}
          </span>
          <span className="ag-sesi-akun-teks">{namaFolder(workspaceAktif ?? '') || tr('No folder')}</span>
        </button>

        <div className="ag-sesi-footer-menuwrap">
          <button
            className="ag-sesi-footer-ikon"
            data-testid="ag-footer-more"
            aria-label={tr('Customizations')}
            aria-haspopup="menu"
            aria-expanded={menuFooter}
            onClick={() => setMenuFooter((v) => !v)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="3.2" cy="8" r="1.2" fill="currentColor" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              <circle cx="12.8" cy="8" r="1.2" fill="currentColor" />
            </svg>
          </button>
          {menuFooter && (
            <div className="ag-sesi-footer-menu" role="menu" data-testid="ag-footer-dropdown">
              {CUSTOMS.map((c) => (
                <button
                  key={c.section}
                  role="menuitem"
                  className="ag-sesi-footer-item"
                  data-testid={`ag-cust-${c.section}`}
                  onClick={() => {
                    setMenuFooter(false);
                    setSettingsOpen(false);
                    bukaCustom(c.section);
                  }}
                >
                  <span className="ag-sesi-footer-item-ikon" aria-hidden="true">
                    <AiIkon name={c.icon} size={14} />
                  </span>
                  <span>{tr(c.label)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
