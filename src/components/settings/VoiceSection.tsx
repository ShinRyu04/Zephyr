/*
 * Settings > Voice.
 *
 * Two features that look like one and are not: dictation (the platform listens
 * and types what you said) and speaking (the platform reads the answer back).
 * They fail for different reasons and are configured by different engine
 * settings, so they are laid out as two groups rather than one list of switches.
 *
 * WHY THIS SECTION REPORTS CAPABILITY AT ALL
 *
 * Both features are provided by the WebView, not by Zeph, and the WebView does
 * not always have them: speech recognition is a network-backed Chromium feature
 * that a hardened or offline build may simply not expose, and a machine can have
 * a synthesizer with no voices installed. A settings page that hides this shows
 * the user a dead control and lets them conclude the feature is broken - when in
 * fact their WebView cannot do it and no setting would help. So each group says
 * plainly whether it is available, and why not when it is not.
 */

import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useBicara, type Suara } from '../../lib/useBicara';
import { aiTtsVoices, type NeuralVoice } from '../../lib/commands';
import { providerAktif } from '../../lib/useNeural';
import { Section, Row, Toggle, Select, NumberInput, TextInput, VoiceKeyRow } from './SettingsControls';

/**
 * The languages offered for dictation.
 *
 * Not every BCP-47 tag in the world: these are the ones Chromium's recognizer
 * actually ships models for and that are worth offering here. A free-text field
 * would let the user type `xx-XX` and get silent failure, which is the exact
 * failure mode this list exists to prevent.
 */
export default function VoiceSection() {
  const tr = useT();
  const v = useStore((s) => s.settings?.voice);
  const patch = useStore((s) => s.applySettings);

  /*
   * A whole-object patch, not a field-by-field one.
   *
   * `deep_merge` on the Rust side merges keys, so sending `{ voice: { rate: 1.2 } }`
   * would leave the other voice fields alone - which sounds correct until a user
   * turns a switch OFF, because `false` and a missing key are not the same thing
   * to a merge. Sending the whole object each time keeps every write idempotent
   * and makes a switch that is off actually write `false`.
   */
  const set = (bagian: NonNullable<typeof v>) => patch({ voice: bagian });

  const aktif = v?.enabled !== false;
  const { bisa: bisaBicara, suara } = useBicara();

  /*
   * Whether dictation exists, asked the same way `useDengar` asks it.
   *
   * It cannot be done from `useDengar` itself: that hook binds a live recognizer
   * on mount, and calling it here would start listening for the settings page.
   * The capability check is duplicated, and deliberately so - the alternative is
   * a hook that guesses at construction time whether it should attach.
   */


  /*
   * Voices arrive asynchronously, so the picker is built from the list AND from
   * the saved id: a voice that has been chosen but is not in the list yet still
   * needs to be shown, or the select renders blank and the user thinks their
   * choice was lost.
   */
  const [suaraLengkap, setSuaraLengkap] = useState<Suara[]>(suara);
  useEffect(() => {
    if (suara.length) setSuaraLengkap(suara);
  }, [suara]);

  const pilihanSuara = useMemo(() => {
    const opsi = suaraLengkap.map((s) => ({ value: s.id, label: `${s.nama} (${s.lang})` }));
    const terpilih = v?.voiceId ?? '';
    if (terpilih && !opsi.some((o) => o.value === terpilih)) {
      opsi.unshift({ value: terpilih, label: tr('(saved voice, not available on this machine)') });
    }
    return opsi;
  }, [suaraLengkap, v?.voiceId, tr]);

  const SUARA_PROVIDERS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'ollama', label: 'Ollama (local, no key)' },
    { value: 'groq', label: 'Groq' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'custom', label: 'Custom' },
    { value: 'local', label: 'Local' },
  ];
  const opsiTtsProvider = [{ value: '', label: tr('Follow chat provider') }].concat(SUARA_PROVIDERS);

  const neuralAktif = v?.neuralEnabled === true;
  const [suaraNeural, setSuaraNeural] = useState<NeuralVoice[]>([]);

  /*
   * The voice catalogue belongs to a specific endpoint, so anything that
   * redirects the request has to re-fetch it.
   *
   * The old effect depended on `[neuralAktif]` alone, which meant the list was
   * fetched once and then never again: switching the provider, retyping the
   * server URL, or changing the model left the dropdown showing the FIRST
   * server's voices. It looked like "every provider has the same voices" - the
   * exact complaint - and it was not even a caching bug so much as a
   * dependency bug: the request was never re-issued.
   *
   * The base URL also has to be resolved the same way the speaker resolves it
   * (`useNeural.providerAktif`), or the picker lists voices from the chat
   * provider while speech goes to the voice server.
   */
  const neuralProvider = v?.neuralProvider ?? '';
  const neuralBaseUrl = v?.neuralBaseUrl ?? '';
  const neuralModel = v?.neuralModel ?? '';

  useEffect(() => {
    if (!neuralAktif) return;
    const { provider, baseUrl } = providerAktif();
    let batal = false;
    aiTtsVoices({ provider, baseUrl })
      .then((d) => { if (!batal) setSuaraNeural(d); })
      .catch(() => { if (!batal) setSuaraNeural([]); });
    return () => { batal = true; };
  }, [neuralAktif, neuralProvider, neuralBaseUrl, neuralModel, aktif]);

  const pilihanNeural = useMemo(() => {
    const opsi = suaraNeural.map((s) => {
      const label = s.lang ? `${s.nama} (${s.lang})` : s.nama;
      return { value: s.id, label: s.keterangan ? `${label} - ${s.keterangan}` : label };
    });
    const terpilih = v?.neuralVoiceId ?? '';
    if (terpilih && !opsi.some((o) => o.value === terpilih)) {
      opsi.unshift({ value: terpilih, label: terpilih });
    }
    return opsi;
  }, [suaraNeural, v?.neuralVoiceId]);

  return (
    <Section title={tr('Voice')} ikon={undefined}>
      <Row
        label={tr('Enable voice')}
        hint={tr('Dictate messages and read answers aloud. Uses the WebView speech engine, no key needed.')}
      >
        <Toggle
          label={tr('Enable voice')}
          testid="voice-enabled"
          checked={aktif}
          onChange={(on) => set({ ...v, enabled: on })}
        />
      </Row>

      {aktif && (
        <>
          {/* ---- Speaking (the platform reads the answer) ---- */}
          <div className="set-h2 set-h2-sub" data-testid="voice-grup-bicara">
            {tr('Speaking')}
          </div>

          {!bisaBicara && (
            <Row label={tr('Speech output is not available in this WebView')}>
              <span data-testid="voice-tts-tidak-ada" className="set-warn">
                {tr('unavailable')}
              </span>
            </Row>
          )}

          <Row
            label={tr('Speak replies automatically')}
            hint={tr('Read each new answer as it arrives. Off by default, so Zeph does not start talking on its own.')}
          >
            <Toggle
              label={tr('Speak replies automatically')}
              testid="voice-speak-replies"
              checked={v?.speakReplies === true}
              disabled={!bisaBicara}
              onChange={(on) => set({ ...v, speakReplies: on })}
            />
          </Row>

          <Row
            label={tr('Voice')}
            hint={
              suaraLengkap.length
                ? tr('Which voice reads the answer')
                : tr('Loading the list of voices from the WebView...')
            }
          >
            <Select
              label={tr('Voice')}
              testid="voice-pilih-suara"
              value={v?.voiceId ?? ''}
              disabled={!bisaBicara}
              onChange={(id) => set({ ...v, voiceId: id })}
              options={[{ value: '', label: tr('Default voice') }, ...pilihanSuara]}
            />
          </Row>

          <Row label={tr('Speed')} hint={tr('0.5x is slow, 2x is fast')}>
            <NumberInput
              label={tr('Speed')}
              testid="voice-rate"
              min={0.5}
              max={2}
              step={0.1}
              value={v?.rate ?? 1}
              disabled={!bisaBicara}
              onChange={(n) => set({ ...v, rate: n })}
            />
          </Row>

          <Row label={tr('Volume')}>
            <NumberInput
              label={tr('Volume')}
              testid="voice-volume"
              min={0}
              max={1}
              step={0.1}
              value={v?.volume ?? 1}
              disabled={!bisaBicara}
              onChange={(n) => set({ ...v, volume: n })}
            />
          </Row>

          <Row
            label={tr('Skip code blocks')}
            hint={tr('Read the explanation without the code. A code block read aloud is punctuation and file paths.')}
          >
            <Toggle
              label={tr('Skip code blocks')}
              testid="voice-skip-code"
              checked={v?.skipCode !== false}
              disabled={!bisaBicara}
              onChange={(on) => set({ ...v, skipCode: on })}
            />
          </Row>

          <div className="set-h2 set-h2-sub" data-testid="voice-grup-neural">
            {tr('Neural voice')}
          </div>

          <Row
            label={tr('Use neural voice')}
            hint={tr('Speak with the active provider instead of the WebView voice. Billed per character on your API key.')}
          >
            <Toggle
              label={tr('Use neural voice')}
              testid="voice-neural-enabled"
              checked={neuralAktif}
              onChange={(on) => set({ ...v, neuralEnabled: on })}
            />
          </Row>

          {neuralAktif && (
            <>
              <Row
                label={tr('Voice provider')}
                hint={tr('Empty follows the chat provider. The key comes from that provider.')}
              >
                <Select
                  label={tr('Voice provider')}
                  testid="voice-neural-provider"
                  value={v?.neuralProvider ?? ''}
                  onChange={(id) => set({ ...v, neuralProvider: id })}
                  options={opsiTtsProvider}
                />
              </Row>

              {(v?.neuralProvider || '') === 'ollama' ? (
                <Row
                  label={tr('Voice API key')}
                  hint={tr('Ollama runs on this machine and needs no key. Leave the field empty.')}
                >
                  <span data-testid="voice-neural-key-lokal">
                    {tr('No key needed (local)')}
                  </span>
                </Row>
              ) : (
              <Row
                label={tr('Voice API key')}
                hint={tr('Saved like a chat key. Empty means use the provider key above. Local servers usually need no key.')}
              >
                <VoiceKeyRow
                  provider={(v?.neuralProvider || providerAktif().provider) + '-voice'}
                  testid="voice-neural-key"
                />
              </Row>
              )}

              <Row
                label={tr('Voice server URL')}
                hint={tr('Own endpoint for speech, e.g. a local TTS server. Empty means the chat provider address.')}
              >
                <TextInput
                  label={tr('Voice server URL')}
                  testid="voice-neural-baseurl"
                  mono
                  value={v?.neuralBaseUrl ?? ''}
                  placeholder="http://127.0.0.1:11434/v1"
                  onChange={(s) => set({ ...v, neuralBaseUrl: s })}
                />
              </Row>

              <Row
                label={tr('Voice model')}
                hint={tr('Typed by hand. Empty means the provider default.')}
              >
                <TextInput
                  label={tr('Voice model')}
                  testid="voice-neural-model"
                  mono
                  value={v?.neuralModel ?? ''}
                  placeholder="tts-1"
                  onChange={(s) => set({ ...v, neuralModel: s })}
                />
              </Row>

              <Row
                label={tr('Neural voice')}
                hint={tr('Which voice reads the answer. Follows the provider list.')}
              >
                <Select
                  label={tr('Neural voice')}
                  testid="voice-neural-id"
                  value={v?.neuralVoiceId ?? ''}
                  onChange={(id) => set({ ...v, neuralVoiceId: id })}
                  options={[{ value: '', label: tr('Provider default') }, ...pilihanNeural]}
                />
              </Row>

              <Row
                label={tr('Follow answer language')}
                hint={tr('A Japanese answer is read with a Japanese voice, an Indonesian one with an Indonesian voice.')}
              >
                <Toggle
                  label={tr('Follow answer language')}
                  testid="voice-neural-follow"
                  checked={v?.neuralFollowLang !== false}
                  onChange={(on) => set({ ...v, neuralFollowLang: on })}
                />
              </Row>

              <Row label={tr('Neural volume')} hint={tr('Above 1 boosts. The WebView slider cannot do this.')}>
                <NumberInput
                  label={tr('Neural volume')}
                  testid="voice-neural-volume"
                  min={0}
                  max={2}
                  step={0.1}
                  value={v?.neuralVolume ?? 1}
                  onChange={(n) => set({ ...v, neuralVolume: n })}
                />
              </Row>
            </>
          )}
        </>
      )}
    </Section>
  );
}
