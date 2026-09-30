import { useEffect, useRef, useState } from 'react';

/*
 * Voice dictation for the AI composer, built on the Web Speech API.
 *
 * The WebView supplies the recognition engine, so this needs no API key and no
 * service of ours — but support is not universal, which is why `bisa` is
 * reported rather than assumed: the button disables itself and says why instead
 * of failing silently when clicked.
 *
 * Results are delivered as interim + final segments. Interim text is written to
 * the draft as it is recognised and replaced when the final segment lands, so
 * the composer shows the words as they are spoken without leaving duplicates
 * behind.
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
  onerror: (() => void) | null;
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
export function useDengar(tulis: (teks: string, final: boolean) => void, lang = 'id-ID') {
  const [bisa] = useState(() => ambilCtor() !== null);
  const [dengar, setDengar] = useState(false);
  const ref = useRef<Pengenal | null>(null);

  // The callback is read at event time so a re-render mid-dictation does not
  // restart recognition (which would drop the sentence being spoken).
  const tulisRef = useRef(tulis);
  tulisRef.current = tulis;

  useEffect(() => {
    if (!dengar) return;
    const Ctor = ambilCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
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

    // Errors end the session: a rejected mic permission would otherwise leave
    // the button lit and nothing happening.
    rec.onerror = () => setDengar(false);
    rec.onend = () => setDengar(false);

    ref.current = rec;
    try {
      rec.start();
    } catch {
      setDengar(false);
      return;
    }

    return () => {
      try {
        rec.abort();
      } catch {
        // Sudah berhenti: tidak ada yang perlu dibersihkan.
      }
      ref.current = null;
    };
  }, [dengar, lang]);

  const toggle = () => setDengar((v) => !v);

  return { dengar, bisa, toggle };
}
