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
    const mulaiRekam = async () => {
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
          if (batal || blob.size === 0) return;

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
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
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
          } catch {
            setGalat('gagal');
          }
        };
        rec.start();
      } catch {
        setGalat('izin');
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
    if (Ctor) {
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
      batal = true;
      try { ref.current?.abort(); } catch { /* already stopped */ }
      ref.current = null;
      try {
        if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
      } catch { /* already stopped */ }
      mediaRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [dengar, lang]);

  const toggle = () => setDengar((v) => !v);

  return { dengar, bisa, toggle, galat };
}
