import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as cmd from '../../lib/commands';
import { useT } from '../../lib/i18n';
import { notifyInfo, notifyError } from '../../lib/notificationStore';

/*
 * Dev-only panel: rebuild Zephyr and swap the running binary without leaving
 * the app.
 *
 * The honest shape of this, which the UI states outright before the user
 * commits:
 *   - the build runs here, and a failed build changes nothing;
 *   - the swap cannot happen in this process (Windows locks a running exe),
 *     so a detached helper waits for Zephyr to exit, replaces the file, and
 *     relaunches it;
 *   - everything in %APPDATA%\zephyr\ survives; live terminal sessions, running
 *     tasks and unsaved buffers do not, because they only ever existed in the
 *     memory of the process being replaced.
 *
 * The section renders nothing at all in a release build, or when the exe is
 * not sitting inside a Zephyr repo, so a packaged install never sees a button
 * that cannot work.
 */
export function DevUpdateSection() {
  const tr = useT();
  const [info, setInfo] = useState<cmd.DevUpdateInfo | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<'build' | 'apply' | 'rollback' | null>(null);
  const [langkah, setLangkah] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    cmd
      .devUpdateInfo()
      .then((i) => {
        if (hidup) setInfo(i);
      })
      .catch((e) => {
        if (hidup) setGalat(String(e));
      });
    return () => {
      hidup = false;
    };
  }, []);

  /*
   * The build runs for minutes and the only progress signal is the tail of the
   * helper log, so it is polled rather than awaited blindly. Polling stops the
   * moment the request settles, and never runs during the swap itself: the
   * helper logs only after this process is gone.
   */
  useEffect(() => {
    if (sibuk !== 'build') return;
    let hidup = true;
    const t = window.setInterval(() => {
      cmd
        .devUpdateLog(15)
        .then((teks) => {
          if (!hidup || !teks) return;
          setLangkah(teks.split('\n').filter((l) => l.trim()).slice(-12));
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      hidup = false;
      window.clearInterval(t);
    };
  }, [sibuk]);

  const build = useCallback(async () => {
    setSibuk('build');
    setPesan(null);
    setLangkah([]);
    try {
      const hasil = await cmd.devUpdateBuild();
      setLangkah(hasil.langkah);
      setPesan(hasil.pesan);
      if (hasil.ok) notifyInfo(tr('devupdate.buildDone'));
      else notifyError(tr('devupdate.buildFailedCheckLog'));
    } catch (e) {
      setPesan(tr('devupdate.buildFailed') + ': ' + String(e));
    } finally {
      setSibuk(null);
    }
  }, []);

  const apply = useCallback(async () => {
    setSibuk('apply');
    try {
      const hasil = await cmd.devUpdateApply(true);
      setLangkah(hasil.langkah);
      setPesan(hasil.pesan);
      // Give the helper a moment to spawn before this window goes away,
      // otherwise the app can exit and take the spawn down with it.
      window.setTimeout(() => {
        void getCurrentWindow().close();
      }, 1200);
    } catch (e) {
      setPesan(tr('devupdate.installFailed') + ': ' + String(e));
      setSibuk(null);
    }
  }, []);

  const rollback = useCallback(async () => {
    setSibuk('rollback');
    try {
      const hasil = await cmd.devUpdateRollback(true);
      setLangkah(hasil.langkah);
      setPesan(hasil.pesan);
      window.setTimeout(() => {
        void getCurrentWindow().close();
      }, 1200);
    } catch (e) {
      setPesan(tr('devupdate.rollbackFailed') + ': ' + String(e));
      setSibuk(null);
    }
  }, []);

  if (galat) {
    return (
      <div className="settings-section">
        <h2 className="set-h2">{tr('settings.devupdate')}</h2>
        <p className="settings-hint">{tr('devupdate.notAvailable')}: {galat}</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="settings-section">
        <h2 className="set-h2">{tr('settings.devupdate')}</h2>
        <p className="settings-hint">{tr('Memeriksa...')}</p>
      </div>
    );
  }

  // Release build, or an exe outside the repo: say why, offer nothing.
  if (!info.tersedia) {
    return (
      <div className="settings-section">
        <h2 className="set-h2">{tr('settings.devupdate')}</h2>
        <p className="settings-hint">
          {info.alasan ?? tr('devupdate.cannotSelfUpdate')}
        </p>
        <dl className="devupdate-meta">
          <dt>{tr('Versi')}</dt>
          <dd>
            {info.versi} ({info.profile})
          </dd>
          <dt>exe</dt>
          <dd title={info.exe}>{info.exe}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="settings-section" data-testid="devupdate-section">
      <h2 className="set-h2">{tr('settings.devupdate')}</h2>
      <p className="settings-hint">
        {tr('devupdate.cannotSelfUpdateHint')}
      </p>

      <dl className="devupdate-meta">
        <dt>{tr('Versi')}</dt>
        <dd data-testid="devupdate-versi">
          {info.versi} ({info.profile})
        </dd>
        <dt>{tr('Repo')}</dt>
        <dd title={info.repo ?? ''}>{info.repo ?? '-'}</dd>
        <dt>exe</dt>
        <dd title={info.exe}>{info.exe}</dd>
        <dt>{tr('Cadangan')}</dt>
        <dd title={info.backup}>{info.backup}</dd>
      </dl>

      <div className="devupdate-aksi">
        <button
          className="btn"
          data-testid="devupdate-build"
          disabled={sibuk !== null}
          onClick={build}
        >
          {sibuk === 'build' ? tr('Membangun...') : tr('1. Build')}
        </button>
        <button
          className="btn btn-primary"
          data-testid="devupdate-apply"
          disabled={sibuk !== null}
          onClick={apply}
        >
          {sibuk === 'apply' ? tr('Memasang...') : tr('devupdate.installAndRestart')}
        </button>
        <button
          className="btn"
          data-testid="devupdate-rollback"
          disabled={sibuk !== null}
          onClick={rollback}
          title={tr('devupdate.rollbackHint')}
        >
          {sibuk === 'rollback' ? tr('Mengembalikan...') : tr('Rollback')}
        </button>
      </div>

      {pesan && (
        <p className="settings-hint" data-testid="devupdate-pesan">
          {pesan}
        </p>
      )}

      {langkah.length > 0 && (
        <pre className="devupdate-log" data-testid="devupdate-log">
          {langkah.join('\n')}
        </pre>
      )}
    </div>
  );
}
