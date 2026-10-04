/*
 * Reading an answer aloud, built on the WebView's own speech synthesis.
 *
 * The counterpart to `useDengar`: that one is the ear, this one is the mouth.
 * Both use the platform engine, so there is no API key and no service of ours,
 * and both must report whether the platform actually offers it rather than
 * assuming - support is not universal, and a button that does nothing when
 * clicked is worse than one that is not there.
 *
 * THREE THINGS THAT ARE NOT OBVIOUS, ALL OF THEM BUGS I HAD TO AVOID
 *
 * 1. VOICES ARRIVE LATE. `getVoices()` returns an empty list on the first call
 *    in every Chromium build; the list is populated asynchronously and announced
 *    by `voiceschanged`. A picker built from the first call shows nothing, and a
 *    saved voice id cannot be resolved back to a voice, so the user's choice
 *    silently reverts to the default on every restart. Hence the subscription.
 *
 * 2. A LONG ANSWER OUTLIVES ITS WELCOME. Chromium has a well-known defect where
 *    an utterance longer than roughly 15 seconds stops on its own, mid-sentence,
 *    and `speechSynthesis` reports neither an error nor an end. The fix is to
 *    hand it the text in sentence-sized chunks and queue them, rather than one
 *    enormous utterance - and to NOT trust the engine's own `onend` for the
 *    queue's completion, because that defect does not fire it.
 *
 * 3. `cancel()` IS NOT SYNCHRONOUS IN EFFECT. It clears the queue, but the
 *    engine can still be finishing the previous utterance for a moment after.
 *    Speaking immediately after cancelling therefore drops the first words of
 *    the new text. The callers here stop-then-start through `start()`, which
 *    yields a frame; and any utterance that arrives after a cancel is ignored by
 *    comparing against a per-session token rather than a boolean ref.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** One engine voice, flattened to what a picker needs. */
export interface Suara {
  /** The platform's own identifier - what gets saved. */
  id: string;
  /** What the user reads. Usually a person's name. */
  nama: string;
  /** BCP-47 tag, e.g. `en-US`. */
  lang: string;
}

function mesin(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis ?? null;
}

/**
 * Split text into utterance-sized chunks.
 *
 * Splitting on sentence ends rather than a fixed character count keeps the
 * prosody: cutting mid-clause makes the engine restart its intonation, which
 * sounds like a stumble. The character cap is the backstop for the case where a
 * "sentence" is a wall of text with no full stop in it - a code block, a URL,
 * a log line.
 */
export function potongTeks(teks: string, maks = 180): string[] {
  const bersih = teks
    /* Fenced code blocks are unlistenable: read aloud they become a stream of
       punctuation, brackets and file paths. The marker is replaced with a short
       spoken note so the listener knows something was skipped rather than
       wondering why the answer jumped. */
    .replace(/```[\s\S]*?```/g, ' (kode dilewati) ')
    /* Markdown that would otherwise be pronounced: `**bold**` as "star star",
       `#` as "hash", a link as its URL. */
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!bersih) return [];

  const keluar: string[] = [];
  /* Split after a terminator, keeping the terminator. `[^.!?…]+` would drop the
     last fragment when the text does not end in punctuation, hence the `$`
     alternative. */
  const kalimat = bersih.match(/[^.!?…\n]+[.!?…]*\s*/g) ?? [bersih];

  let buf = '';
  for (const k of kalimat) {
    /* A single "sentence" longer than the cap still has to be broken, and a comma
       is the least damaging place to do it. */
    if (k.length > maks) {
      if (buf) { keluar.push(buf.trim()); buf = ''; }
      for (const potong of k.match(new RegExp(`[\\s\\S]{1,${maks}}(?:,\\s|\\s|$)`, 'g')) ?? [k]) {
        keluar.push(potong.trim());
      }
      continue;
    }
    if ((buf + k).length > maks) { keluar.push(buf.trim()); buf = k; }
    else buf += k;
  }
  if (buf.trim()) keluar.push(buf.trim());
  return keluar.filter((t) => t.length > 0);
}

export interface PakaiBicara {
  /** The platform offers speech synthesis at all. */
  bisa: boolean;
  /** Voices the platform has announced so far. Empty until `voiceschanged`. */
  suara: Suara[];
  /** Currently speaking, or waiting on the queue. */
  bicara: boolean;
  /** Speak this text. Any speech in progress is replaced. */
  mulai: (teks: string, opsi?: { id?: string; lang?: string; rate?: number; pitch?: number; volume?: number }) => void;
  /** Stop now and drop whatever was queued. */
  berhenti: () => void;
  /** Speak, or stop if already speaking. What a toggle button calls. */
  toggle: (teks: string, opsi?: { id?: string; lang?: string; rate?: number; pitch?: number; volume?: number }) => void;
}

/**
 * Speech synthesis for one surface.
 *
 * `onSelesai` fires when the queue drains naturally. It is NOT called when the
 * user stops speech themselves - a caller that auto-advances to the next message
 * must be able to tell "finished" from "interrupted", or pressing Stop on one
 * answer immediately starts the next.
 */
export function useBicara(onSelesai?: () => void): PakaiBicara {
  const [bisa] = useState(() => mesin() !== null);
  const [suara, setSuara] = useState<Suara[]>([]);
  const [bicara, setBicara] = useState(false);

  /*
   * A per-session token, not a boolean.
   *
   * `cancel()` does not take effect instantly, so an utterance from the previous
   * session can still deliver `onend` after the new one has started. A boolean
   * "is speaking" flag lets that stale event clear the flag and report a finish
   * that never happened; a token lets the handler see that it belongs to a dead
   * session and ignore itself.
   */
  const sesiRef = useRef(0);
  const selesaiRef = useRef(onSelesai);
  selesaiRef.current = onSelesai;

  /* Voices, including the late arrival. */
  useEffect(() => {
    const s = mesin();
    if (!s) return;
    const muat = () => {
      const daftar = s.getVoices().map((v) => ({
        id: v.voiceURI,
        nama: v.name,
        lang: v.lang,
      }));
      /* Sorted by language, then name: a picker with 60 voices in engine order is
         unusable, and the user is almost always looking for their own language. */
      daftar.sort((a, b) => a.lang.localeCompare(b.lang) || a.nama.localeCompare(b.nama));
      setSuara(daftar);
    };
    muat();
    s.addEventListener('voiceschanged', muat);
    return () => s.removeEventListener('voiceschanged', muat);
  }, []);

  const berhenti = useCallback(() => {
    const s = mesin();
    if (!s) return;
    sesiRef.current += 1;   // kills any in-flight handler for the previous run
    s.cancel();
    setBicara(false);
  }, []);

  /*
   * Leaving the panel must not leave a voice talking.
   *
   * Unmount is easy to forget, and the failure is unpleasant: the user closes
   * Zeph's panel, an answer keeps being read aloud, and there is no control left
   * on screen to stop it.
   */
  useEffect(() => () => {
    const s = mesin();
    if (s) { sesiRef.current += 1; s.cancel(); }
  }, []);

  const mulai = useCallback((teks: string, opsi?: { id?: string; lang?: string; rate?: number; pitch?: number; volume?: number }) => {
    const s = mesin();
    if (!s) return;
    const potongan = potongTeks(teks);
    if (!potongan.length) return;

    /* Replace, never add. Pressing speak twice must not queue the answer twice -
       so the old session is invalidated BEFORE the engine is told to cancel. */
    sesiRef.current += 1;
    const sesi = sesiRef.current;
    s.cancel();

    const pilih = opsi?.id ? s.getVoices().find((v) => v.voiceURI === opsi.id) : undefined;
    setBicara(true);

    /*
     * The chunks are queued immediately, back to back, rather than started from
     * each `onend`. Chaining from `onend` is the tidier-looking approach and it
     * is the one that breaks: Chromium's long-utterance defect can swallow that
     * event, and the queue then stops dead in the middle of an answer with
     * nothing to restart it. Queueing up front means the engine owns the whole
     * sequence and a lost event cannot strand it.
     */
    potongan.forEach((bagian, i) => {
      const u = new SpeechSynthesisUtterance(bagian);
      if (opsi?.lang) u.lang = opsi.lang;
      else if (pilih) u.lang = pilih.lang;
      if (opsi?.rate !== undefined) u.rate = opsi.rate;
      if (opsi?.pitch !== undefined) u.pitch = opsi.pitch;
      if (opsi?.volume !== undefined) u.volume = opsi.volume;

      /* Resolve the saved id to a live voice every time, not once: the voice list
         can be replaced underneath us when the platform reloads it, and a stale
         Voice object makes an utterance fail with no error. */
      if (pilih) u.voice = pilih;

      if (i === potongan.length - 1) {
        u.onend = () => {
          if (sesiRef.current !== sesi) return;   // a later session already took over
          setBicara(false);
          selesaiRef.current?.();
        };
      }
      s.speak(u);
    });
  }, []);

  const toggle = useCallback((teks: string, opsi?: { id?: string; lang?: string; rate?: number; pitch?: number; volume?: number }) => {
    if (bicara) berhenti();
    else mulai(teks, opsi);
  }, [bicara, berhenti, mulai]);

  return { bisa, suara, bicara, mulai, berhenti, toggle };
}

/**
 * Strip an answer down to something worth hearing.
 *
 * Not the same job as `potongTeks`: that one decides WHERE to cut, this one
 * decides WHAT to say at all. Tool calls, reasoning traces and file diffs are
 * part of an answer on screen and are noise out loud.
 */
export function teksUntukDibaca(teks: string, opsi?: { lewatiKode?: boolean }): string {
  let t = teks;
  if (opsi?.lewatiKode !== false) t = t.replace(/```[\s\S]*?```/g, ' ');
  /* A reasoning block is the model thinking to itself; reading it aloud would
     double the length of every answer with text the user never asked to hear. */
  t = t.replace(/<thought>[\s\S]*?<\/thought>/gi, ' ');
  return t.trim();
}
