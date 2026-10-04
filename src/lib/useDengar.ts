import { useEffect, useRef, useState } from 'react';
import { aiTranscribe } from './commands';

/*
 * Voice dictation for the AI composer.
 *
 * TWO engines, tried in order, because the browser one is not dependable inside
 * a desktop shell:
 *
 * 1. The Web Speech API (`SpeechRecognition`). Chromium exposes it, and when it
 *    works it is the best option: free, streaming, no round trip. Inside
 *    WebView2 it is exposed and reports `granted` for the microphone, yet the
 *    recognition itself is served by a Google endpoint the embedded runtime does
 *    not reach - so `start()` fires and `onerror` arrives a moment later with
 *    nothing recorded. That failure mode is why the mic button appeared dead.
 *
 * 2. `MediaRecorder` + the app's own transcription. The recorder always works,
 *    because it only needs the microphone the host already grants. The audio is
 *    handed to the Rust side, which posts it to the configured provider's
 *    transcription endpoint and returns text.
 *
 * The hook reports which engine it is using so the UI can be honest about it,
 * and it never leaves the button lit when nothing is recording: a failure ends
 * the session and surfaces the reason.
 */

interface HasilUcapan {
  isFinal: boolean;
  0: { transcript: string };
}

interface PeristiwaUcapan {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: HasilUcapan;
  };
}

interface Pengenal {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: PeristiwaUcapan) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type CtorPengenal = new () => Pengenal;

function ambilCtor(): CtorPengenal | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: CtorPengenal;
    webkitSpeechRecognition?: CtorPengenal;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictation state for one composer.
 *
 * `tulis` is called with the text to insert; the hook never touches the
 * composer's state itself, so the caller keeps ownership of the draft.
 */
export function useDengar(
  tulis: (teks: string, final: boolean) => void,
  lang = 'en-US',
  /**
   * Where to send the audio once it is recorded.
   *
   * Passed in rather than read from the store here: the composer already knows
   * the active model and its endpoint, and looking them up a second time inside
   * the hook would create a second place that has to agree with the first.
   * Without a provider the recorder still runs, but the transcript cannot be
   * produced - which is reported rather than silently swallowed.
   */
  tujuan?: { provider: string; model?: string; baseUrl?: string },
) {
  const [dengar, setDengar] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const ref = useRef<Pengenal | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /*
   * "Throw this recording away" - written when `stop()` is called for a reason
   * other than the user finishing, and read inside `onstop`.
   *
   * It lives on the component, not inside the effect, because the effect cleanup
   * runs before `onstop` does: a local variable would already have been reassigned
   * by the time the handler could look at it, which is exactly how every clip was
   * being discarded.
   */
  const buangRef = useRef(false);

  // The callback is read at event time so a re-render mid-dictation does not
  // restart recognition (which would drop the sentence being spoken).
  const tulisRef = useRef(tulis);
  tulisRef.current = tulis;

  /*
   * Whether dictation is possible AT ALL.
   *
   * The check is for a microphone, not for `SpeechRecognition`: the recorder is
   * the engine that actually works in the desktop shell, and a browser that has
   * `getUserMedia` but no recogniser (which is exactly WebView2) can still
   * dictate. Reporting `false` there is what hid the button in a shell that
   * could record perfectly well.
   */
  const [bisa] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return typeof navigator.mediaDevices?.getUserMedia === 'function' || ambilCtor() !== null;
  });

  // Cleanup on unmount: an open recorder would keep the microphone indicator
  // on in the OS after the panel is gone.
  useEffect(() => {
    return () => {
      try { mediaRef.current?.stop(); } catch { /* already stopped */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { ref.current?.abort(); } catch { /* already stopped */ }
    };
  }, []);

  useEffect(() => {
    if (!dengar) return;
    let batal = false;
    setGalat(null);

    /* ---- Engine 2: the recorder, which is the one that works here ---- */
    /*
     * Started at most ONCE per session.
     *
     * Both `onerror` and `onend` of the recogniser fall back to the recorder, and
     * in WebView2 they fire back to back for the same failure: the recogniser
     * reports `network` (it cannot reach Google's endpoint from the embedded
     * runtime) and then ends immediately. Two calls meant two `getUserMedia`
     * streams and two live MediaRecorders fighting over one microphone, with the
     * second overwriting `mediaRef` - so pressing stop closed one of them and the
     * other kept the device open, and the transcript the user got was empty or
     * garbage. Measured, not guessed: the click trace showed
     * `rec.start` twice for a single press.
     */
    let sudahRekam = false;
    const mulaiRekam = async () => {
      if (sudahRekam || batal) return;
      sudahRekam = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (batal) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        chunksRef.current = [];
        const rec = new MediaRecorder(stream);
        mediaRef.current = rec;

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onerror = () => {
          setGalat('recorder');
          setDengar(false);
        };
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          chunksRef.current = [];
          /*
           * Why this handler ignores `buang`, and why it reads the DISCARD flag
           * from a ref rather than the closure:
           *
           * Stopping dictation flips `dengar` to false, which runs the effect
           * cleanup, which stops this recorder - so `onstop` always executes
           * after the cleanup has already run. Any variable the cleanup mutates
           * is therefore already changed by the time we get here, and the two
           * states we must tell apart (a real stop vs. a discarded teardown)
           * cannot be distinguished by reading them now.
           *
           * The decision was made at stop time, so it is recorded at stop time:
           * `buangRef.current` is written by whoever called `stop()` - the
           * cleanup on a teardown, nobody on a user stop - and read here. That
           * ordering is the whole point, and reading the closure instead is what
           * silently discarded every clip.
           */
          if (blob.size === 0) {
            setGalat('kosong');
            return;
          }
          if (buangRef.current) {
            buangRef.current = false;
            return;
          }

          /*
           * Hand the audio to the app's own transcription.
           *
           * The bytes go to Rust as a data URL: the panel has no way to upload a
           * Blob directly, and base64 is the one encoding both sides already
           * agree on. The command returns the text, which lands in the composer
           * as a finished segment.
           */
          try {
            const buf = await blob.arrayBuffer();
            /*
             * Chunked, NOT `btoa(String.fromCharCode(...new Uint8Array(buf)))`.
             *
             * Spread passes one argument per byte, and the argument list is
             * bounded (roughly 100k in V8). A clip longer than a few seconds
             * exceeds it and throws `RangeError: Maximum call stack size
             * exceeded` - which the catch below turns into the generic "gagal"
             * message. So the failure looked like a server problem and only
             * happened on longer dictation, which is exactly the kind of bug
             * that survives a quick test.
             */
            const bytes = new Uint8Array(buf);
            let biner = '';
            const POTONG = 8192;
            for (let i = 0; i < bytes.length; i += POTONG) {
              biner += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + POTONG)));
            }
            const b64 = btoa(biner);
            if (!tujuan?.provider) {
              setGalat('tanpa-provider');
              return;
            }
            const teks = await aiTranscribe({
              provider: tujuan.provider,
              model: tujuan.model,
              baseUrl: tujuan.baseUrl,
              audio: `data:${blob.type};base64,${b64}`,
              lang,
            });
            if (teks) tulisRef.current(teks, true);
            else setGalat('kosong');
          } catch (e) {
            /*
             * Keep the reason, not just a code.
             *
             * `gagal` alone is what made this feature undiagnosable: the user
             * saw a generic failure whether the server was down, the model was
             * missing, or the audio was rejected. Rust already returns a precise
             * message, so carry it through - the toast is the only place the
             * user can see it.
             */
            const m = e instanceof Error ? e.message : String(e);
            if (/tidak berlaku untuk endpoint audio/i.test(m)) setGalat('key-audio');
            else if (/No API key/i.test(m)) setGalat('tanpa-key');
            else setGalat(`gagal: ${m.slice(0, 200)}`);
          }
        };
        rec.start();
      } catch (e) {
        // Same reasoning: "izin" hid the difference between a denied
        // microphone and a device that could not be opened at all.
        const m = e instanceof Error ? e.message : String(e);
        setGalat(/NotAllowed|Permission/i.test(m) ? 'izin' : `mic gagal: ${m.slice(0, 160)}`);
        setDengar(false);
      }
    };

    /*
     * Engine 1 is tried only if the browser recogniser exists, and the recorder
     * is the fallback. The recogniser is preferred when it works because it
     * streams words as they are spoken; the recorder only delivers text at the
     * end. But the recogniser cannot be TRUSTED to report its own failure
     * quickly, so a session that produces no result and no error within a few
     * seconds is handed to the recorder rather than left hanging.
     */
    const Ctor = ambilCtor();
    /*
     * The recogniser is skipped inside the real desktop shell.
     *
     * It is exposed and even reports the microphone as granted, but its service
     * lives on a Google endpoint WebView2 does not reach - so every session began
     * with a guaranteed `network` error before the recorder could take over. That
     * delay is not harmless: the fallback fired twice from it (see `sudahRekam`
     * above), and the user pressed a button that sat silent for a second before
     * anything started. Going straight to the recorder that actually works is
     * both faster and the only engine that can succeed here.
     *
     * Kept for real browsers, where the recogniser is genuinely better: it
     * streams words as they are spoken instead of waiting for the whole clip.
     */
    const diTauri = typeof window !== 'undefined'
      && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    if (Ctor && !diTauri) {
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      let dapat = false;
      rec.onresult = (e) => {
        dapat = true;
        let sementara = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const teks = r[0]?.transcript ?? '';
          if (r.isFinal) final += teks;
          else sementara += teks;
        }
        if (sementara) tulisRef.current(sementara, false);
        if (final) tulisRef.current(final, true);
      };
      rec.onerror = (e) => {
        /*
         * A recogniser error is not the end of the session: it means engine 1
         * is unavailable, and engine 2 can still record. Only a microphone
         * error is fatal, because then there is nothing to record with.
         */
        const kode = e?.error ?? '';
        if (kode === 'not-allowed' || kode === 'service-not-allowed') {
          setGalat('izin');
          setDengar(false);
          return;
        }
        if (!batal) void mulaiRekam();
      };
      rec.onend = () => {
        if (!dapat && !batal) void mulaiRekam();
      };
      ref.current = rec;
      try {
        rec.start();
      } catch {
        void mulaiRekam();
      }
    } else {
      void mulaiRekam();
    }

    return () => {
      /*
       * Intent decides whether this cleanup ENDS the session or merely tears
       * down a throwaway mount.
       *
       * React StrictMode (dev only) mounts, unmounts and remounts every effect,
       * so this cleanup runs immediately after a normal start. Stopping the
       * recorder there would transcribe a clip the user never finished - and the
       * microphone indicator flickered on and off because of it. The session is
       * only really over when the user pressed stop, which is exactly when
       * `dengar` became false.
       *
       * So: transcribe on a user stop, stay silent on an accidental teardown.
       */
      batal = true;
      try { ref.current?.abort(); } catch { /* already stopped */ }
      ref.current = null;
      const rec = mediaRef.current;
      mediaRef.current = null;
      if (rec && rec.state !== 'inactive') {
        if (!dengar) {
          /*
           * User stop: `stop()` flushes the last chunk and then fires `onstop`,
           * where transcription lives. It must happen BEFORE `mediaRef` is
           * cleared, and the microphone tracks must NOT be killed here - that cut
           * the flush short and delivered empty clips. `onstop` stops the tracks
           * once the data is in hand.
           */
          try { rec.stop(); } catch { /* already stopped */ }
        } else {
          // Throwaway teardown: discard the recorder and release the device.
          buangRef.current = true;
          try { rec.stop(); } catch { /* already stopped */ }
          chunksRef.current = [];
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      } else {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [dengar, lang]);

  const toggle = () => setDengar((v) => !v);

  return { dengar, bisa, toggle, galat };
}
