import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { Row, Select, TextInput } from './SettingsControls';
import { useT } from '../../lib/i18n';
import { useDevenv } from '../../lib/devenvStore';
import { credentialsList, credentialsSet, credentialsDelete, type CredentialInfo } from '../../lib/commands';

/**
 * Settings for the Dev Environment panel plus the credential store.
 *
 * The panel itself edits the layout; this page owns the values that outlive a
 * session: where the environment lives, which server fronts it, which domain
 * suffix projects get, and the secrets a connection needs.
 */
export default function DevEnvSettingsSection() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const muat = useDevenv((s) => s.muat);

  const dv = (settings as unknown as { devenv?: Record<string, unknown> }).devenv ?? {};
  const rootFolder = String(dv.rootFolder ?? 'D:\\DevEnv');
  const domain = String(dv.domain ?? '.test');
  const server = String(dv.server ?? 'nginx');

  const [kredensial, setKredensial] = useState<CredentialInfo[]>([]);
  const [pesan, setPesan] = useState('');
  const [idBaru, setIdBaru] = useState('');
  const [nilaiBaru, setNilaiBaru] = useState('');

  const tarik = async () => {
    try {
      setKredensial((await credentialsList()) ?? []);
    } catch {
      setPesan('could not read the credential store');
    }
  };

  useEffect(() => {
    void tarik();
  }, []);

  // Persist on every change, but rescan only after typing pauses. Each scan
  // spawns a `--version` per runtime plus a services sweep (~3s), so calling it
  // per keystroke made the field unusable while the user typed a path.
  const jedaWaktu = useRef<number | null>(null);
  const pindaiTertunda = useRef(false);

  useEffect(() => {
    return () => {
      if (jedaWaktu.current !== null) window.clearTimeout(jedaWaktu.current);
      // A scan queued by the last keystroke still has to run, or the panel keeps
      // the old path after the user navigates away.
      if (pindaiTertunda.current) void muat(true);
    };
  }, [muat]);

  const pindaiSetelahJeda = () => {
    pindaiTertunda.current = true;
    if (jedaWaktu.current !== null) window.clearTimeout(jedaWaktu.current);
    jedaWaktu.current = window.setTimeout(() => {
      jedaWaktu.current = null;
      pindaiTertunda.current = false;
      void muat(true);
    }, 700);
  };

  const simpanRoot = (v: string) => {
    void applySettings({ devenv: { rootFolder: v } as never }).then(pindaiSetelahJeda);
  };
  // Domain and the server choice do not change what a scan finds, so they only
  // need to be stored.
  const simpanDomain = (v: string) => {
    void applySettings({ devenv: { domain: v } as never });
  };
  const simpanServer = (v: string) => {
    void applySettings({ devenv: { server: v } as never });
  };

  const tambah = async () => {
    const id = idBaru.trim();
    if (!id || !nilaiBaru) {
      setPesan('an id and a secret are both required');
      return;
    }
    try {
      await credentialsSet(id, id, 'password', nilaiBaru);
      setIdBaru('');
      setNilaiBaru('');
      setPesan('');
      await tarik();
    } catch {
      setPesan('could not save the credential');
    }
  };

  const hapus = async (id: string) => {
    try {
      await credentialsDelete(id);
      await tarik();
    } catch {
      setPesan('could not delete the credential');
    }
  };

  return (
    <div className="set-section" data-testid="set-devenv">
      <h2 className="set-h2">{tr('Dev Environment')}</h2>
      <p className="set-note">
        {tr(
          'Where the local environment lives and how its projects are addressed. The panel itself opens from the Activity Bar.',
        )}
      </p>

      <Row label={tr('Root folder')} hint={tr('Runtimes, projects, databases and logs live here.')} testid="dv-set-root">
        <TextInput value={rootFolder} onChange={simpanRoot} label={tr('Root folder')} mono testid="dv-set-root-input" />
      </Row>

      <Row label={tr('Domain')} hint={tr('Appended to each project name to build its URL.')} testid="dv-set-domain">
        <TextInput value={domain} onChange={simpanDomain} label={tr('Domain')} mono testid="dv-set-domain-input" />
      </Row>

      <Row label={tr('Server')} hint={tr('The web server that fronts the projects.')} testid="dv-set-server">
        <Select
          value={server}
          options={[
            { value: 'nginx', label: 'nginx' },
            { value: 'apache', label: 'apache' },
            { value: 'none', label: tr('none') },
          ]}
          onChange={simpanServer}
          label={tr('Server')}
          testid="dv-set-server-input"
        />
      </Row>

      <h3 className="set-h2">{tr('Credentials')}</h3>
      <p className="set-hint">
        {tr(
          'Database passwords and other secrets. Stored encrypted in credentials.json, separate from the model API keys, and never written to a log.',
        )}
      </p>

      {kredensial.length === 0 && <p className="set-hint">{tr('No credentials stored yet.')}</p>}

      {kredensial.map((k) => (
        <Row key={k.id} label={k.label} hint={k.kind} testid={`dv-cred-${k.id}`}>
          <span className="set-hint" data-testid={`dv-cred-${k.id}-state`}>
            {k.has ? tr('saved') : tr('empty')}
          </span>
          <button className="btn btn-sm" data-testid={`dv-cred-${k.id}-del`} onClick={() => void hapus(k.id)}>
            {tr('Delete')}
          </button>
        </Row>
      ))}

      <Row label={tr('Add a credential')} testid="dv-cred-add">
        <input
          className="set-input"
          data-testid="dv-cred-id"
          placeholder={tr('e.g. mysql/local')}
          value={idBaru}
          onChange={(e) => setIdBaru(e.target.value)}
        />
        <input
          className="set-input"
          type="password"
          data-testid="dv-cred-secret"
          placeholder={tr('secret')}
          value={nilaiBaru}
          onChange={(e) => setNilaiBaru(e.target.value)}
        />
        <button className="btn btn-sm" data-testid="dv-cred-save" onClick={() => void tambah()}>
          {tr('Save')}
        </button>
      </Row>

      {pesan && (
        <p className="set-hint" data-testid="dv-set-pesan" role="status">
          {pesan}
        </p>
      )}
    </div>
  );
}
