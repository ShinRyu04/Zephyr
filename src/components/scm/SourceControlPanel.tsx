// SourceControlPanel.tsx — panel Source Control di sidebar kiri (fase 10).
//
// Susunan dari atas: baris GitHub (login) → kotak pesan commit + tombol
// Commit → tombol aksi (Sync/Pull/Push + kebab) → daftar perubahan
// (Staged Changes / Changes). Belum repo → hanya tombol Initialize.
//
// CATATAN UI (aturan user, sudah pernah kena di fase 08): semua navigasi &
// aksi ada di SATU tempat — panel ini. Jangan duplikasi tombol GitHub ke
// halaman Settings; Settings hanya menyimpan identitas commit & defaultBranch.

import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useGit } from '../../lib/gitStore';
import { useStore } from '../../lib/store';
import type { GitChange } from '../../lib/types';

/** Warna badge status mengikuti token tema (dilarang hex di komponen). */
const STATUS_CLASS: Record<string, string> = {
  M: 'is-modified',
  A: 'is-added',
  D: 'is-deleted',
  R: 'is-renamed',
  C: 'is-renamed',
  U: 'is-conflict',
  T: 'is-modified',
  '?': 'is-untracked',
};

const STATUS_TITLE: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Conflict — selesaikan lalu stage',
  T: 'Type changed',
  '?': 'Untracked',
};

const baseOf = (p: string) => p.split('/').pop() || p;
const dirOf = (p: string) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};

// ───────────────────────── ikon kecil ─────────────────────────

function Icon({ d, w = 1.3 }: { d: string; w?: number }) {
  return (
    <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

const I = {
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  discard: 'M13 8a5 5 0 11-1.8-3.85M13 2.5V6h-3.5',
  sync: 'M13 8a5 5 0 01-8.2 3.9M3 8a5 5 0 018.2-3.9M11.2 4.1V1.6M4.8 11.9v2.5',
  down: 'M8 3v8M4.5 7.5L8 11l3.5-3.5',
  up: 'M8 13V5M4.5 8.5L8 5l3.5 3.5',
  kebab: 'M8 4.2h.01M8 8h.01M8 11.8h.01',
  branch: 'M5 3.5v9M11 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11 6.5c0 2-1.5 3-6 3',
  check: 'M3.5 8.5L6.5 11.5 12.5 5',
};

// ───────────────────────── baris GitHub ─────────────────────────

function GitHubRow() {
  const gh = useGit((s) => s.gh);
  const ghDevice = useGit((s) => s.ghDevice);
  const ghMessage = useGit((s) => s.ghMessage);
  const patFormOpen = useGit((s) => s.patFormOpen);
  const busy = useGit((s) => s.busy);
  const setPatFormOpen = useGit((s) => s.setPatFormOpen);
  const savePat = useGit((s) => s.savePat);
  const loginDevice = useGit((s) => s.loginDevice);
  const logoutGh = useGit((s) => s.logoutGh);
  const testGh = useGit((s) => s.testGh);
  const setClientId = useGit((s) => s.setClientId);
  const clientIdSaved = useStore((s) => s.settings.git.github?.clientId ?? '');

  const [pat, setPat] = useState('');
  const [cid, setCid] = useState(clientIdSaved);
  const [cidOpen, setCidOpen] = useState(false);

  useEffect(() => setCid(clientIdSaved), [clientIdSaved]);

  const label = (() => {
    if (!gh?.signedIn) return 'Belum login';
    const who = gh.user ? `@${gh.user}` : 'akun GitHub';
    if (gh.method === 'pat') return `Login as ${who} · PAT`;
    const exp = gh.expiresAt
      ? ` (exp ${new Date(gh.expiresAt * 1000).toLocaleString()})`
      : '';
    return `Login as ${who} · OAuth${exp}`;
  })();

  return (
    <div className="scm-section scm-github" data-testid="scm-github">
      <div className="scm-sec-head">
        <span className="scm-sec-title">GitHub</span>
        <span
          className={`scm-gh-state ${gh?.signedIn ? (gh.expired ? 'is-warn' : 'is-ok') : 'is-off'}`}
          data-testid="scm-gh-state"
        >
          {label}
        </span>
      </div>

      <div className="scm-gh-actions">
        {!gh?.signedIn ? (
          <>
            <button
              className="btn btn-sm btn-primary"
              data-testid="scm-gh-signin"
              disabled={!gh?.oauthConfigured}
              title={
                gh?.oauthConfigured
                  ? 'Login lewat GitHub Device Flow'
                  : 'Set client_id dulu (GitHub OAuth App dengan Device Flow aktif)'
              }
              onClick={() => void loginDevice()}
            >
              Sign in with GitHub
            </button>
            <button
              className="btn btn-sm"
              data-testid="scm-gh-pat"
              onClick={() => setPatFormOpen(!patFormOpen)}
            >
              Use a token
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-sm"
              data-testid="scm-gh-test"
              disabled={busy}
              onClick={() => void testGh()}
            >
              Test
            </button>
            <button
              className="btn btn-sm btn-danger"
              data-testid="scm-gh-signout"
              onClick={() => void logoutGh()}
            >
              Sign out
            </button>
          </>
        )}
        <button
          className="btn btn-sm btn-ghost"
          title="Client ID OAuth App (opsional)"
          onClick={() => setCidOpen(!cidOpen)}
        >
          client_id
        </button>
      </div>

      {cidOpen && (
        <div className="scm-gh-form">
          <input
            className="input input-sm"
            data-testid="scm-gh-clientid"
            placeholder="Ov23li… (GitHub OAuth App)"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
          />
          <button
            className="btn btn-sm"
            onClick={() => {
              void setClientId(cid);
              setCidOpen(false);
            }}
          >
            Simpan
          </button>
        </div>
      )}

      {patFormOpen && (
        <form
          className="scm-gh-form"
          onSubmit={(e) => {
            e.preventDefault();
            void savePat(pat).then((ok) => ok && setPat(''));
          }}
        >
          <input
            className="input input-sm"
            type="password"
            data-testid="scm-gh-token"
            placeholder="ghp_… / github_pat_…"
            autoComplete="off"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
          />
          <button className="btn btn-sm btn-primary" type="submit" disabled={busy || !pat.trim()}>
            Verify &amp; save
          </button>
        </form>
      )}

      {ghDevice && (
        <div className="scm-gh-device" data-testid="scm-gh-device">
          <span className="scm-gh-code" data-testid="scm-gh-code">
            {ghDevice.userCode}
          </span>
          <button
            className="btn btn-sm"
            onClick={() => void openUrl(ghDevice.verificationUri)}
          >
            Buka github.com/login/device
          </button>
          <span className="scm-spin" aria-hidden="true" />
        </div>
      )}

      {ghMessage && (
        <p className="scm-gh-msg" data-testid="scm-gh-msg">
          {ghMessage}
        </p>
      )}
    </div>
  );
}

// ───────────────────────── satu baris file ─────────────────────────

function ChangeRow({ c }: { c: GitChange }) {
  const stage = useGit((s) => s.stage);
  const unstage = useGit((s) => s.unstage);
  const openDiff = useGit((s) => s.openDiff);
  const setConfirm = useGit((s) => s.setConfirm);
  const diff = useGit((s) => s.diff);
  const active = diff?.path === c.path && diff?.staged === c.staged;

  return (
    <li>
      <div
        className={`scm-row ${active ? 'is-active' : ''}`}
        data-testid="scm-row"
        data-path={c.path}
        data-staged={c.staged ? '1' : '0'}
        data-status={c.status}
      >
        <button
          className="scm-row-main"
          title={`${c.path}${c.origPath ? ` (dulu ${c.origPath})` : ''}`}
          onClick={() => void openDiff(c)}
        >
          <span className="scm-name">{baseOf(c.path)}</span>
          <span className="scm-dir">{dirOf(c.path)}</span>
        </button>

        <div className="scm-row-actions">
          {!c.staged && (
            <button
              className="ex-btn scm-mini"
              title="Buang perubahan (permanen)"
              aria-label={`Discard ${c.path}`}
              data-testid="scm-discard"
              onClick={() => setConfirm({ kind: 'discard', paths: [c.path] })}
            >
              <Icon d={I.discard} />
            </button>
          )}
          <button
            className="ex-btn scm-mini"
            title={c.staged ? 'Unstage' : 'Stage'}
            aria-label={`${c.staged ? 'Unstage' : 'Stage'} ${c.path}`}
            data-testid={c.staged ? 'scm-unstage' : 'scm-stage'}
            onClick={() => void (c.staged ? unstage([c.path]) : stage([c.path]))}
          >
            <Icon d={c.staged ? I.minus : I.plus} />
          </button>
          <span
            className={`scm-badge ${STATUS_CLASS[c.status] ?? ''}`}
            title={STATUS_TITLE[c.status] ?? c.status}
          >
            {c.status}
          </span>
        </div>
      </div>
    </li>
  );
}

function Group({
  title,
  items,
  staged,
}: {
  title: string;
  items: GitChange[];
  staged: boolean;
}) {
  const stage = useGit((s) => s.stage);
  const unstage = useGit((s) => s.unstage);
  const setConfirm = useGit((s) => s.setConfirm);
  if (items.length === 0) return null;
  const paths = items.map((c) => c.path);

  return (
    <div className="scm-section">
      <div className="scm-sec-head">
        <span className="scm-sec-title">{title}</span>
        <span className="scm-count" data-testid={staged ? 'scm-staged-count' : 'scm-unstaged-count'}>
          {items.length}
        </span>
        <div className="scm-sec-actions">
          {!staged && (
            <button
              className="ex-btn scm-mini"
              title="Buang semua perubahan (permanen)"
              aria-label="Discard all"
              data-testid="scm-discard-all"
              onClick={() => setConfirm({ kind: 'discard-all', paths })}
            >
              <Icon d={I.discard} />
            </button>
          )}
          <button
            className="ex-btn scm-mini"
            title={staged ? 'Unstage semua' : 'Stage semua'}
            aria-label={staged ? 'Unstage all' : 'Stage all'}
            data-testid={staged ? 'scm-unstage-all' : 'scm-stage-all'}
            onClick={() => void (staged ? unstage(paths) : stage(paths))}
          >
            <Icon d={staged ? I.minus : I.plus} />
          </button>
        </div>
      </div>
      <ul className="scm-list">
        {items.map((c) => (
          <ChangeRow key={`${c.staged ? 's' : 'w'}:${c.path}`} c={c} />
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── branch switcher ─────────────────────────

function BranchMenu() {
  const branches = useGit((s) => s.branches);
  const open = useGit((s) => s.branchMenuOpen);
  const setOpen = useGit((s) => s.setBranchMenuOpen);
  const checkout = useGit((s) => s.checkout);
  const setConfirm = useGit((s) => s.setConfirm);
  if (!open || !branches) return null;

  const shortRemote = (r: string) => r.replace(/^origin\//, '');

  return (
    <div className="scm-menu" data-testid="scm-branch-menu" role="menu">
      <div className="scm-menu-title">Local</div>
      {branches.locals.map((b) => (
        <div className="scm-menu-row" key={b}>
          <button
            className={`scm-menu-item ${b === branches.current ? 'is-current' : ''}`}
            role="menuitem"
            data-testid="scm-branch-item"
            data-branch={b}
            onClick={() => void checkout(b)}
          >
            <span className="scm-menu-ico">{b === branches.current ? <Icon d={I.check} /> : null}</span>
            {b}
          </button>
          {b !== branches.current && (
            <button
              className="ex-btn scm-mini"
              title={`Hapus branch ${b}`}
              aria-label={`Hapus branch ${b}`}
              data-testid="scm-branch-del"
              data-branch={b}
              onClick={() => {
                setOpen(false);
                setConfirm({ kind: 'delete-branch', name: b });
              }}
            >
              <Icon d="M4 4l8 8M12 4l-8 8" />
            </button>
          )}
        </div>
      ))}

      {branches.remotes.length > 0 && (
        <>
          <div className="scm-menu-title">Remote</div>
          {branches.remotes.map((r) => (
            <button
              className="scm-menu-item"
              role="menuitem"
              key={r}
              data-testid="scm-branch-item"
              data-branch={r}
              title={`Checkout ${r} sebagai branch lokal`}
              onClick={() => void checkout(shortRemote(r))}
            >
              <span className="scm-menu-ico" />
              {r}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function NewBranchDialog() {
  const open = useGit((s) => s.newBranchOpen);
  const setOpen = useGit((s) => s.setNewBranchOpen);
  const createBranch = useGit((s) => s.createBranch);
  const [name, setName] = useState('');
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="nb-title">
        <h2 className="modal-title" id="nb-title">
          Branch baru
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (n) {
              void createBranch(n);
              setName('');
            }
          }}
        >
          <input
            className="input"
            autoFocus
            data-testid="scm-newbranch-input"
            placeholder="feat-x"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
              Buat &amp; pindah
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setOpen(false);
                setName('');
              }}
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────────────────── panel utama ─────────────────────────

export default function SourceControlPanel() {
  const workspace = useStore((s) => s.workspace);
  const status = useGit((s) => s.status);
  const message = useGit((s) => s.message);
  const setMessage = useGit((s) => s.setMessage);
  const busy = useGit((s) => s.busy);
  const scmError = useGit((s) => s.scmError);
  const scmInfo = useGit((s) => s.scmInfo);
  const commit = useGit((s) => s.commit);
  const sync = useGit((s) => s.sync);
  const pull = useGit((s) => s.pull);
  const push = useGit((s) => s.push);
  const init = useGit((s) => s.refreshAll);
  const branchMenuOpen = useGit((s) => s.branchMenuOpen);
  const setBranchMenuOpen = useGit((s) => s.setBranchMenuOpen);
  const setNewBranchOpen = useGit((s) => s.setNewBranchOpen);
  const setConfirm = useGit((s) => s.setConfirm);
  // Hindari selector yang membuat array baru (zustand v5 → max update depth).
  const stagedCount = useGit((s) => s.status?.changes.filter((c) => c.staged).length ?? 0);
  const [kebab, setKebab] = useState(false);

  const changes = status?.changes ?? [];
  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => !c.staged);
  const canCommit = stagedCount > 0 && message.trim().length > 0 && !busy;

  if (!workspace) {
    return (
      <div className="side-panel">
        <div className="side-section">
          <div className="side-title">Source Control</div>
          <p className="side-muted">Buka folder dulu untuk memakai git.</p>
        </div>
      </div>
    );
  }

  if (status && !status.isRepo) {
    return (
      <div className="side-panel" data-testid="scm-empty">
        <div className="side-section">
          <div className="side-title">Source Control</div>
          <p className="side-muted">Folder ini belum jadi repositori git.</p>
          <div className="side-actions">
            <button
              className="btn btn-primary"
              data-testid="scm-init"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  const { gitInit } = await import('../../lib/commands');
                  await gitInit();
                  await init();
                })()
              }
            >
              Initialize Repository
            </button>
          </div>
        </div>
        <GitHubRow />
      </div>
    );
  }

  return (
    <div className="scm" data-testid="scm-panel">
      <div className="scm-head">
        <span className="scm-title">Source Control</span>
        <div className="scm-head-actions">
          <button
            className="ex-btn"
            title={busy ? `Menjalankan git…` : 'Sync (pull lalu push)'}
            aria-label="Sync"
            data-testid="scm-sync"
            disabled={busy}
            onClick={() => void sync()}
          >
            <span className={busy ? 'scm-rot' : ''}>
              <Icon d={I.sync} />
            </span>
          </button>
          <button
            className="ex-btn"
            title="Pull"
            aria-label="Pull"
            data-testid="scm-pull"
            disabled={busy}
            onClick={() => void pull(false)}
          >
            <Icon d={I.down} />
          </button>
          <button
            className="ex-btn"
            title="Push"
            aria-label="Push"
            data-testid="scm-push"
            disabled={busy}
            onClick={() => void push(false)}
          >
            <Icon d={I.up} />
          </button>
          <button
            className="ex-btn"
            title="Menu lain"
            aria-label="Menu lain"
            data-testid="scm-kebab"
            onClick={() => setKebab(!kebab)}
          >
            <Icon d={I.kebab} w={2} />
          </button>
        </div>
      </div>

      {kebab && (
        <div className="scm-menu scm-kebab-menu" role="menu" data-testid="scm-kebab-menu">
          <button
            className="scm-menu-item"
            role="menuitem"
            data-testid="scm-pull-rebase"
            onClick={() => {
              setKebab(false);
              void pull(true);
            }}
          >
            Pull with rebase
          </button>
          <button
            className="scm-menu-item"
            role="menuitem"
            data-testid="scm-newbranch"
            onClick={() => {
              setKebab(false);
              setNewBranchOpen(true);
            }}
          >
            New Branch…
          </button>
          <button
            className="scm-menu-item"
            role="menuitem"
            data-testid="scm-switch"
            onClick={() => {
              setKebab(false);
              setBranchMenuOpen(!branchMenuOpen);
            }}
          >
            Branch switcher
          </button>
          <button
            className="scm-menu-item is-danger"
            role="menuitem"
            data-testid="scm-discard-all-menu"
            disabled={unstaged.length === 0}
            onClick={() => {
              setKebab(false);
              setConfirm({ kind: 'discard-all', paths: unstaged.map((c) => c.path) });
            }}
          >
            Discard All…
          </button>
        </div>
      )}

      <div className="scm-branchbar">
        <button
          className="scm-branch-btn"
          data-testid="scm-branch"
          title="Ganti branch"
          onClick={() => setBranchMenuOpen(!branchMenuOpen)}
        >
          <Icon d={I.branch} />
          <span data-testid="scm-branch-name">{status?.branch ?? '(detached)'}</span>
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span className="scm-ab" data-testid="scm-ab">
              {status.ahead > 0 && `↑${status.ahead}`}
              {status.behind > 0 && `↓${status.behind}`}
            </span>
          )}
        </button>
        {status?.conflicted && (
          <span className="scm-conflict" data-testid="scm-conflict">
            konflik — selesaikan lalu stage
          </span>
        )}
      </div>
      <BranchMenu />

      <div className="scm-commit">
        <textarea
          className="scm-msg"
          data-testid="scm-message"
          rows={2}
          placeholder="Pesan commit (Ctrl+Enter untuk commit)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canCommit) {
              e.preventDefault();
              void commit();
            }
          }}
        />
        <button
          className="btn btn-primary btn-block"
          data-testid="scm-commit"
          disabled={!canCommit}
          title={
            stagedCount === 0
              ? 'Stage dulu (klik + di file)'
              : message.trim()
                ? 'Commit perubahan yang di-stage'
                : 'Tulis pesan commit dulu'
          }
          onClick={() => void commit()}
        >
          Commit{stagedCount > 0 ? ` (${stagedCount})` : ''}
        </button>
      </div>

      {scmError && (
        <p className="scm-error" data-testid="scm-error">
          {scmError}
        </p>
      )}
      {scmInfo && !scmError && (
        <p className="scm-info" data-testid="scm-info">
          {scmInfo}
        </p>
      )}

      <div className="scm-body">
        <Group title="Staged Changes" items={staged} staged />
        <Group title="Changes" items={unstaged} staged={false} />
        {changes.length === 0 && (
          <p className="side-muted scm-clean" data-testid="scm-clean">
            Tidak ada perubahan — working tree bersih.
          </p>
        )}
      </div>

      <GitHubRow />
      <NewBranchDialog />
    </div>
  );
}
