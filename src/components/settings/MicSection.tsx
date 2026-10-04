import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { Section, Row, Toggle, Select, TextInput, VoiceKeyRow } from './SettingsControls';
import { useAi } from '../../lib/aiStore';

const BAHASA_UJAR = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'es-ES', label: 'Espanol' },
  { value: 'fr-FR', label: 'Francais' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'pt-BR', label: 'Portugues (BR)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'ar-SA', label: 'العربية' },
];

type HasilTes = 'idle' | 'mendengar' | 'ok' | 'sunyi' | 'ditolak';

export default function MicSection() {
  const tr = useT();
  const m = useStore((s) => s.settings?.mic);
  const bahasaLama = useStore((s) => s.settings?.voice?.inputLang ?? 'en-US');
  const patch = useStore((s) => s.applySettings);
  const [hasil, setHasil] = useState<HasilTes>('idle');

  const set = (bagian: NonNullable<typeof m>) => patch({ mic: bagian });
  /*
   * Same provider set as the voice section, and it has to stay the same:
   * a provider missing here but present there (or the reverse) reads as a bug,
   * because both controls answer the same question - where does audio go.
   *
   * Groq was removed deliberately: it has no local mode and its TTS/STT quota is
   * separate from the chat key, so offering it invited a 401 that looked like a
   * broken app. Ollama carries "(local, no key)" because a local server has no
   * key to enter, and the label is what stops the user hunting for one.
   */
  const SUARA_PROVIDERS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'ollama', label: 'Ollama (local, no key)' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'custom', label: 'Custom (OpenAI-compatible server)' },
    { value: 'local', label: 'Local' },
  ];
  const opsiSttProvider = [{ value: '', label: tr('Follow chat provider') }].concat(SUARA_PROVIDERS);


  const aktif = m?.enabled !== false;
  const bahasa = m?.lang ?? bahasaLama;

  const bisaMic = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return typeof navigator.mediaDevices?.getUserMedia === 'function';
  }, []);

  const tes = async () => {
    if (!bisaMic) return;
    setHasil('mendengar');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const potongan: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) potongan.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const total = potongan.reduce((n, b) => n + b.size, 0);
        setHasil(total > 500 ? 'ok' : 'sunyi');
      };
      rec.start();
      window.setTimeout(() => { try { rec.stop(); } catch { setHasil('sunyi'); } }, 3000);
    } catch {
      setHasil('ditolak');
    }
  };

  return (
    <Section title={tr('settings.mic')} ikon={undefined}>
      <Row
        label={tr('Enable microphone')}
        hint={tr('Show the mic button in the chat composer. Off hides it.')}
      >
        <Toggle
          label={tr('Enable microphone')}
          testid="mic-enabled"
          checked={aktif}
          onChange={(on) => set({ ...m, enabled: on })}
        />
      </Row>

      {aktif && (
        <>
          <Row
            label={tr('Voice provider')}
            hint={tr('Empty follows the chat provider. The key comes from that provider.')}
          >
            <Select
              label={tr('Voice provider')}
              testid="mic-provider"
              value={m?.provider ?? ''}
              onChange={(id) => set({ ...m, provider: id })}
              options={opsiSttProvider}
            />
          </Row>

          {(m?.provider || '') === 'ollama' ? (
            <Row
              label={tr('Voice API key')}
              hint={tr('Ollama runs on this machine and needs no key. Leave the field empty.')}
            >
              <span data-testid="mic-key-lokal">
                {tr('No key needed (local)')}
              </span>
            </Row>
          ) : (
          <Row
            label={tr('Voice API key')}
            hint={tr('Saved like a chat key. Empty means use the provider key above. Local servers usually need no key.')}
          >
            <VoiceKeyRow
              provider={(m?.provider || useAi.getState().provider || 'custom') + '-voice'}
              testid="mic-key"
            />
          </Row>
          )}

          {/* Labelled "Mic server URL", not the borrowed "Voice server URL":
              this field feeds dictation, and naming it after the other feature
              sent people to the wrong setting when their mic stopped working. */}
          <Row
            label={tr('Mic server URL')}
            hint={tr('Own endpoint for dictation, e.g. a local STT server. Empty means the chat provider address.')}
          >
            <TextInput
              label={tr('Mic server URL')}
              testid="mic-baseurl"
              mono
              value={m?.baseUrl ?? ''}
              placeholder="http://127.0.0.1:8881/v1"
              onChange={(s) => set({ ...m, baseUrl: s })}
            />
          </Row>

          <Row
            label={tr('Mic model')}
            hint={tr('Transcription model on that server. Typed by hand. Empty means the provider default.')}
          >
            <TextInput
              label={tr('Mic model')}
              testid="mic-model"
              mono
              value={m?.model ?? ''}
              placeholder="whisper-turbo"
              onChange={(s) => set({ ...m, model: s })}
            />
          </Row>

          <Row
            label={tr('Dictation language')}
            hint={tr('The recogniser listens for one language at a time and does not switch by itself.')}
          >
            <Select
              label={tr('Dictation language')}
              testid="mic-lang"
              value={bahasa}
              onChange={(lang) => set({ ...m, lang })}
              options={BAHASA_UJAR}
            />
          </Row>

          <Row
            label={tr('Auto-send after dictation')}
            hint={tr('Send the transcript to the AI as soon as you stop speaking.')}
          >
            <Toggle
              label={tr('Auto-send after dictation')}
              testid="mic-auto-send"
              checked={m?.autoSend === true}
              onChange={(on) => set({ ...m, autoSend: on })}
            />
          </Row>

          <Row
            label={tr('Test microphone')}
            hint={
              hasil === 'ok' ? tr('Microphone hears you.')
              : hasil === 'sunyi' ? tr('Nothing recorded - check the Windows microphone level.')
              : hasil === 'ditolak' ? tr('Microphone permission was refused.')
              : hasil === 'mendengar' ? tr('Speak now - recording 3 seconds...')
              : tr('Record 3 seconds to check the microphone works.')
            }
          >
            <button
              className="btn"
              data-testid="mic-test"
              disabled={!bisaMic || hasil === 'mendengar'}
              onClick={() => void tes()}
            >
              {hasil === 'mendengar' ? '...' : tr('Test')}
            </button>
          </Row>

          {!bisaMic && (
            <Row label={tr('Microphone is not available in this WebView')}>
              <span data-testid="mic-tidak-ada" className="set-warn">
                {tr('unavailable')}
              </span>
            </Row>
          )}
        </>
      )}
    </Section>
  );
}
