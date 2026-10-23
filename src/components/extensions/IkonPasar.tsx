/*
 * Ikon baris Marketplace.
 *
 * Empat lapis, dipilih dari yang paling spesifik:
 *
 *   1. SWATCH TEMA — untuk tema bawaan, kotak berisi tiga pita warna
 *      (`--bg`, `--surface-2`, `--accent`) yang dibaca dengan `data-theme`
 *      tema itu sendiri. Jadi yang terlihat di daftar benar-benar warna tema
 *      tersebut, bukan tebakan.
 *   2. MEREK — tanda yang dikenali untuk server MCP dan keymap (GitHub, Figma,
 *      Slack, Vim, Emacs, …) yang punya identitas di dunia luar.
 *   3. LOGO SENDIRI — plugin dan skill yang Zephyr tulis sendiri tidak punya
 *      merek di dunia luar, jadi tandanya digambar di sini: koper untuk
 *      `cargo-test`, stetoskop untuk `diagnosing-skills`, perisai centang untuk
 *      `verification-before-completion`. Warnanya dari `--ikon-hue` (angka,
 *      bukan nilai warna) supaya tema terang/gelap tetap terbaca.
 *   4. MONOGRAM — dua huruf dengan warna dari hash id. Hanya untuk plugin/skill
 *      buatan user yang tidak kita kenal: tetap berwarna dan berbeda, tanpa
 *      mengarang logo untuk sesuatu yang belum pernah kita lihat.
 *
 * Aturan warna: komponen ini tidak menulis hex. Tanda merek memakai
 * `currentColor` yang diwarnai kelas CSS, logo sendiri memakai `hsl()` dari
 * variabel `--ikon-hue`, dan monogram memakai `--mono-hue`.
 */
import type { CSSProperties, ReactNode } from 'react';

export type JenisIkon =
  | 'plugins'
  | 'skills'
  | 'mcp'
  | 'icon-themes'
  | 'keymaps'
  | 'languages'
  | 'snippets'
  | 'themes';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Bagian yang diisi penuh, bukan digaris. */
function Isi({ d, tebal }: { d: string; tebal?: boolean }) {
  return <path d={d} fill="currentColor" stroke={tebal ? 'currentColor' : 'none'} strokeWidth={tebal ? 0.8 : 0} />;
}

/* ── Merek ─────────────────────────────────────────────────────────────────
   Satu entri = satu tanda. `isi` digambar dengan `currentColor`; warnanya
   datang dari kelas `is-<kunci>` di ext-marketplace.css untuk merek yang
   punya warna resmi, atau dari angka `hue` untuk logo buatan Zephyr. */

interface Merek {
  isi: ReactNode;
  /** Kunci kelas warna: `xmkt-merek is-github` dan seterusnya. */
  warna?: string;
  /** Derajat warna untuk logo sendiri (0..359). */
  hue?: number;
  /** Kotak penuh berwarna merek, untuk logo yang memang berbentuk kotak. */
  padat?: boolean;
}

/** Logo yang aslinya kotak berhuruf: TypeScript, C#, PHP, R, YAML. */
function kotak(teks: string, warna: string): Merek {
  return {
    warna,
    padat: true,
    isi: (
      <span className={`xmkt-tile-teks${teks.length > 2 ? ' is-kecil' : ''}`} aria-hidden="true">
        {teks}
      </span>
    ),
  };
}

const GITHUB: Merek = {
  warna: 'github',
  isi: (
    <svg viewBox="0 0 16 16" width="19" height="19" fill="currentColor" aria-hidden="true">
      <path d="M8 1.3a6.7 6.7 0 0 0-2.1 13.1c.34.06.46-.15.46-.32v-1.25c-1.9.4-2.3-.8-2.3-.8-.3-.78-.75-1-.75-1-.6-.42.05-.41.05-.41.68.05 1.03.7 1.03.7.6 1.02 1.58.73 1.96.56.06-.44.23-.73.42-.9-1.5-.17-3.06-.75-3.06-3.33 0-.74.26-1.34.69-1.81-.07-.17-.3-.86.07-1.79 0 0 .56-.18 1.85.69a6.4 6.4 0 0 1 3.36 0c1.28-.87 1.84-.69 1.84-.69.37.93.14 1.62.07 1.79.43.47.69 1.07.69 1.81 0 2.59-1.57 3.16-3.07 3.33.24.21.46.62.46 1.25v1.85c0 .18.12.39.47.32A6.7 6.7 0 0 0 8 1.3z" />
    </svg>
  ),
};

/* ── Keymap: paket bawaan, tandanya sendiri ────────────────────────────── */
const KEYMAP: Record<string, Merek> = {
  'zephyr.keymap-sublime': kotak('S', 'sublime'),

  /* Vim: dua segitiga hijau yang membentuk V. */
  'zephyr.keymap-vim': {
    warna: 'vim',
    isi: (
      <Svg>
        <Isi d="M2.4 2.6h4.2L8 6.4l1.4-3.8h4.2L8 13.6z" />
        <path d="M2.4 2.6h4.2L8 6.4l1.4-3.8h4.2" />
      </Svg>
    ),
  },

  /* Emacs: kepala gnu, lambang GNU Emacs. */
  'zephyr.keymap-emacs': {
    warna: 'emacs',
    isi: (
      <Svg>
        <path d="M8 3.4c2.6 0 4.4 1.8 4.4 4.4 0 2.8-1.9 4.9-4.4 4.9s-4.4-2.1-4.4-4.9c0-2.6 1.8-4.4 4.4-4.4z" />
        <path d="M5.8 3.8C5.1 2.5 6.3 1.6 7.5 2.6M10.2 3.8c.7-1.3-.5-2.2-1.7-1.2" />
        <circle cx="6.6" cy="7.4" r="0.55" fill="currentColor" stroke="none" />
        <circle cx="9.4" cy="7.4" r="0.55" fill="currentColor" stroke="none" />
        <path d="M6.9 9.7c.7.5 1.5.5 2.2 0" />
      </Svg>
    ),
  },

  /* JetBrains: kotak gradasi empat nada. */
  'zephyr.keymap-ide': {
    warna: 'ide',
    isi: (
      <Svg>
        <rect x="2.6" y="2.6" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <rect
          x="8.4"
          y="2.6"
          width="5"
          height="5"
          rx="1"
          fill="currentColor"
          stroke="none"
          opacity="0.72"
        />
        <rect
          x="2.6"
          y="8.4"
          width="5"
          height="5"
          rx="1"
          fill="currentColor"
          stroke="none"
          opacity="0.5"
        />
        <rect
          x="8.4"
          y="8.4"
          width="5"
          height="5"
          rx="1"
          fill="currentColor"
          stroke="none"
          opacity="0.86"
        />
      </Svg>
    ),
  },
};

/* ── Server MCP: tanda merek ───────────────────────────────────────────── */
const PETA_MEREK: Record<string, Merek> = {
  github: GITHUB,
  git: {
    warna: 'git',
    isi: (
      <Svg>
        <circle cx="4.4" cy="4" r="1.6" />
        <circle cx="4.4" cy="12" r="1.6" />
        <circle cx="11.6" cy="6.4" r="1.6" />
        <path d="M4.4 5.6v4.8M4.4 8.6c0-1.6 1.4-2.2 3-2.2h2.6" />
      </Svg>
    ),
  },
  postgres: {
    warna: 'postgres',
    isi: (
      <Svg>
        <ellipse cx="8" cy="4.2" rx="4.6" ry="1.9" />
        <path d="M3.4 4.2v7.4c0 1.05 2.06 1.9 4.6 1.9s4.6-.85 4.6-1.9V4.2" />
        <path d="M3.4 7.9c0 1.05 2.06 1.9 4.6 1.9s4.6-.85 4.6-1.9" />
      </Svg>
    ),
  },
  sqlite: {
    warna: 'sqlite',
    isi: (
      <Svg>
        <ellipse cx="8" cy="4" rx="4.4" ry="1.8" />
        <path d="M3.6 4v8c0 1 1.97 1.8 4.4 1.8s4.4-.8 4.4-1.8V4" />
        <path d="M3.6 8c0 1 1.97 1.8 4.4 1.8s4.4-.8 4.4-1.8" />
      </Svg>
    ),
  },
  filesystem: {
    warna: 'folder',
    isi: (
      <Svg>
        <path d="M2.2 4.6a1 1 0 0 1 1-1h2.6l1.3 1.6h5.7a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1z" />
      </Svg>
    ),
  },
  memory: {
    warna: 'memory',
    isi: (
      <Svg>
        <rect x="4.4" y="4.4" width="7.2" height="7.2" rx="1.4" />
        <path d="M6.4 2.2v2.2M9.6 2.2v2.2M6.4 11.6v2.2M9.6 11.6v2.2M2.2 6.4h2.2M2.2 9.6h2.2M11.6 6.4h2.2M11.6 9.6h2.2" />
      </Svg>
    ),
  },
  'memory-bank': {
    warna: 'memory',
    isi: (
      <Svg>
        <ellipse cx="8" cy="4.4" rx="4.2" ry="1.8" />
        <path d="M3.8 4.4v6.4c0 1 1.88 1.8 4.2 1.8s4.2-.8 4.2-1.8V4.4" />
        <path d="M6.8 7.2h2.4M8 6v2.4" />
      </Svg>
    ),
  },
  puppeteer: {
    warna: 'puppeteer',
    isi: (
      <Svg>
        <rect x="2.8" y="4.4" width="10.4" height="7.8" rx="2" />
        <circle cx="6" cy="8.2" r="0.9" fill="currentColor" />
        <circle cx="10" cy="8.2" r="0.9" fill="currentColor" />
        <path d="M8 2.2v2.2M5.4 12.2v1.4M10.6 12.2v1.4" />
      </Svg>
    ),
  },
  playwright: {
    warna: 'playwright',
    isi: (
      <Svg>
        <path d="M2.4 5.2c1.9-1 4-1 6 0v5.4c-2 1-4.1 1-6 0z" />
        <path d="M11 6.2c1-.4 2-.4 2.9 0v3.6c-.9.4-1.9.4-2.9 0z" />
      </Svg>
    ),
  },
  'chrome-devtools': {
    warna: 'chrome',
    isi: (
      <Svg>
        <circle cx="8" cy="8" r="5.6" />
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 2.4 5.4 6.7M13.2 6.2H8.4M10.6 12.6 8 8.6" />
      </Svg>
    ),
  },
  'browser-tools': {
    warna: 'chrome',
    isi: (
      <Svg>
        <rect x="1.9" y="3" width="12.2" height="9.4" rx="1.6" />
        <path d="M1.9 5.6h12.2M4.2 4.3h.01M5.8 4.3h.01" />
      </Svg>
    ),
  },
  notion: {
    warna: 'notion',
    isi: (
      <Svg>
        <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1.6" />
        <path d="M5.8 11V5l4.4 6V5" />
      </Svg>
    ),
  },
  slack: {
    warna: 'slack',
    isi: (
      <Svg>
        <path d="M5.6 2.4v4.2M10.4 9.4v4.2M2.4 10.4h4.2M9.4 5.6h4.2" />
        <circle cx="5.6" cy="9.4" r="1.1" />
        <circle cx="10.4" cy="6.6" r="1.1" />
      </Svg>
    ),
  },
  figma: {
    warna: 'figma',
    isi: (
      <Svg>
        <path d="M8 2.6H6.2a1.7 1.7 0 0 0 0 3.4H8zM8 2.6h1.8a1.7 1.7 0 0 1 0 3.4H8zM8 6h1.8a1.7 1.7 0 1 1-1.8 1.7zM8 6H6.2a1.7 1.7 0 0 0 0 3.4H8zM6.2 9.4a1.7 1.7 0 1 0 1.8 1.7V9.4z" />
      </Svg>
    ),
  },
  'google-maps': {
    warna: 'maps',
    isi: (
      <Svg>
        <path d="M8 14s4.6-4.1 4.6-7.2A4.6 4.6 0 0 0 3.4 6.8C3.4 9.9 8 14 8 14z" />
        <circle cx="8" cy="6.6" r="1.6" />
      </Svg>
    ),
  },
  sentry: {
    warna: 'sentry',
    isi: (
      <Svg>
        <path d="M8 2.6 13.4 12H9.8L8 8.8 6.2 12H2.6z" />
      </Svg>
    ),
  },
  'brave-search': {
    warna: 'brave',
    isi: (
      <Svg>
        <path d="M8 2.2 12.8 4v4.2c0 2.9-2 4.8-4.8 5.6-2.8-.8-4.8-2.7-4.8-5.6V4z" />
        <circle cx="7" cy="7.2" r="1.4" />
        <path d="M8.2 8.4 9.8 10" />
      </Svg>
    ),
  },
  tavily: {
    warna: 'tavily',
    isi: (
      <Svg>
        <circle cx="7" cy="7" r="4.2" />
        <path d="M10.2 10.2 13.4 13.4M11.6 2.4l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
      </Svg>
    ),
  },
  context7: {
    warna: 'context7',
    isi: (
      <Svg>
        <path d="M8 2.4 13.4 5 8 7.6 2.6 5z" />
        <path d="M2.6 8 8 10.6 13.4 8M2.6 11 8 13.6 13.4 11" />
      </Svg>
    ),
  },
  deepwiki: {
    warna: 'deepwiki',
    isi: (
      <Svg>
        <path d="M8 4.2C6.6 3 4.4 2.8 2.6 3.4v8.2c1.8-.6 4-.4 5.4.8 1.4-1.2 3.6-1.4 5.4-.8V3.4C11.6 2.8 9.4 3 8 4.2z" />
        <path d="M8 4.2v8.2" />
      </Svg>
    ),
  },
  'sequential-thinking': {
    warna: 'seq',
    isi: (
      <Svg>
        <circle cx="3.6" cy="4" r="1.4" />
        <circle cx="12.4" cy="8" r="1.4" />
        <circle cx="3.6" cy="12" r="1.4" />
        <path d="M4.8 4.7 11.2 7.3M4.8 11.3 11.2 8.7" />
      </Svg>
    ),
  },
  everything: {
    warna: 'everything',
    isi: (
      <Svg>
        <circle cx="4.4" cy="4.4" r="1.2" />
        <circle cx="11.6" cy="4.4" r="1.2" />
        <circle cx="8" cy="8" r="1.2" />
        <circle cx="4.4" cy="11.6" r="1.2" />
        <circle cx="11.6" cy="11.6" r="1.2" />
      </Svg>
    ),
  },
  time: {
    warna: 'time',
    isi: (
      <Svg>
        <circle cx="8" cy="8" r="5.6" />
        <path d="M8 4.6V8l2.4 1.6" />
      </Svg>
    ),
  },
  fetch: {
    warna: 'fetch',
    isi: (
      <Svg>
        <path d="M8 2.6v7M5.2 6.8 8 9.6l2.8-2.8" />
        <path d="M2.8 11v1.6a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8V11" />
      </Svg>
    ),
  },
};

/* ── Bahasa & keymap masuk tabel yang sama ─────────────────────────────── */
Object.assign(PETA_MEREK, KEYMAP);

/* ── Plugin & skill bawaan Zephyr: logo digambar sendiri ──────────────── */

const BAWAAN: Record<string, Merek> = {
  /* Plugin */
  'conventional-commits': {
    hue: 210,
    isi: (
      <Svg>
        <circle cx="4" cy="8" r="1.9" />
        <path d="M5.9 8h7.3M9.2 5.3h4M7.4 10.7h6.5" />
      </Svg>
    ),
  },
  'code-reviewer': {
    hue: 265,
    isi: (
      <Svg>
        <circle cx="6.8" cy="6.8" r="3.7" />
        <path d="M9.6 9.6 13.6 13.6" strokeWidth="1.4" />
        <path d="M5.4 5.9 5 6.8l.4.9M8.2 5.9 8.6 6.8l-.4.9" strokeWidth="1.05" />
      </Svg>
    ),
  },
  'test-first': {
    hue: 145,
    isi: (
      <Svg>
        <path d="M6.2 2.2h3.6M6.8 2.2v4L3.3 11.9a1.4 1.4 0 0 0 1.2 2.1h7a1.4 1.4 0 0 0 1.2-2.1L9.2 6.2v-4" />
        <path d="M5.1 9.9h5.8" />
        <circle cx="7" cy="11.8" r="0.6" fill="currentColor" stroke="none" />
      </Svg>
    ),
  },
  'security-pass': {
    hue: 8,
    isi: (
      <Svg>
        <path d="M8 1.9 13 3.9v4.3c0 2.9-2 5-5 5.9-3-.9-5-3-5-5.9V3.9z" />
        <path d="M5.9 7.9 7.4 9.4l3-3.1" strokeWidth="1.35" />
      </Svg>
    ),
  },
  'docs-writer': {
    hue: 220,
    isi: (
      <Svg>
        <path d="M3.2 2.4h5.6l3.2 3.2v3.1" />
        <path d="M8.8 2.4v3.2h3.2" />
        <path d="M3.2 2.4v11.2h3.6" />
        <path d="M8.2 13.7l.7-2.6 3.2-3.2 2 2-3.2 3.2z" />
      </Svg>
    ),
  },
  'git-hygiene': {
    hue: 25,
    isi: (
      <Svg>
        <circle cx="4.6" cy="3.6" r="1.5" />
        <circle cx="4.6" cy="12.4" r="1.5" />
        <circle cx="11.2" cy="6.6" r="1.5" />
        <path d="M4.6 5.1v5.8M4.6 8.9c0-1.6 1.3-2.3 3-2.3h1.3" />
        <path d="M12.4 10.4v2.2M11 11.5h2.8M12.4 2.8v1.6" strokeWidth="1.1" />
      </Svg>
    ),
  },
  'performance-pass': {
    hue: 300,
    isi: (
      <Svg>
        <path d="M2.4 11.6a5.7 5.7 0 1 1 11.2 0" />
        <path d="M8 11.6 10.9 7.5" strokeWidth="1.5" />
        <circle cx="8" cy="11.6" r="1" fill="currentColor" stroke="none" />
      </Svg>
    ),
  },

  /* Skill */
  'academy-guide': {
    hue: 45,
    isi: (
      <Svg>
        <Isi d="M2.3 6.3 8 3.3l5.7 3L8 9.3z" />
        <path d="M4.6 7.7v2.6c0 1.1 1.5 1.9 3.4 1.9s3.4-.8 3.4-1.9V7.7" />
        <path d="M13.7 6.3v3.4" />
      </Svg>
    ),
  },
  brainstorming: {
    hue: 50,
    isi: (
      <Svg>
        <path d="M8 2.2a3.6 3.6 0 0 1 2.2 6.4c-.4.3-.6.8-.6 1.2H6.4c0-.4-.2-.9-.6-1.2A3.6 3.6 0 0 1 8 2.2z" />
        <path d="M6.5 11.7h3M7 13.6h2" />
        <path d="M2.4 4.6 3.6 5.4M13.6 4.6 12.4 5.4M8 .9V2" strokeWidth="1" />
      </Svg>
    ),
  },
  'cargo-test': {
    hue: 20,
    isi: (
      <Svg>
        <path d="M2.6 5.4 8 2.6l5.4 2.8v5.2L8 13.4l-5.4-2.8z" />
        <path d="M2.6 5.4 8 8.2l5.4-2.8M8 8.2v5.2" />
        <path d="M5.4 7 8 8.4l2.6-1.4" opacity="0.55" />
      </Svg>
    ),
  },
  'commit-style': {
    hue: 205,
    isi: (
      <Svg>
        <circle cx="8" cy="8" r="2.4" />
        <path d="M8 1.6v4M8 10.4v4" strokeWidth="1.3" />
      </Svg>
    ),
  },
  'diagnosing-skills': {
    hue: 165,
    isi: (
      <Svg>
        <path d="M4.4 2.4v4.2a2.7 2.7 0 0 0 5.4 0V2.4" />
        <path d="M3.4 2.4h2M8.8 2.4h2" />
        <path d="M7.1 9.3v1.5a2.4 2.4 0 0 0 4.8 0V9" />
        <circle cx="11.9" cy="8" r="1.1" />
      </Svg>
    ),
  },
  'dispatching-parallel-agents': {
    hue: 275,
    isi: (
      <Svg>
        <circle cx="3.4" cy="8" r="1.7" />
        <circle cx="12.4" cy="3.9" r="1.7" />
        <circle cx="12.4" cy="12.1" r="1.7" />
        <path d="M4.9 7.2 10.8 4.5M4.9 8.8l5.9 2.7" />
      </Svg>
    ),
  },
  'executing-plans': {
    hue: 190,
    isi: (
      <Svg>
        <rect x="3.2" y="3.6" width="9.6" height="10" rx="1.5" />
        <path d="M6 2.2h4v2.6H6z" />
        <Isi d="M6.8 8.3 11 10.6l-4.2 2.3z" />
      </Svg>
    ),
  },
  'finishing-a-development-branch': {
    hue: 120,
    isi: (
      <Svg>
        <path d="M8 2.4v5" />
        <path d="M5.6 5.2 8 7.6l2.4-2.4" strokeWidth="1.3" />
        <path d="M2.8 12.4h10.4" strokeWidth="1.4" />
        <circle cx="4.2" cy="10.6" r="0.9" />
        <circle cx="11.8" cy="10.6" r="0.9" />
      </Svg>
    ),
  },
  'internet-reach': {
    hue: 200,
    isi: (
      <Svg>
        <circle cx="8" cy="8" r="5.7" />
        <path d="M2.4 8h11.2" />
        <path d="M8 2.3c1.8 1.6 2.7 3.5 2.7 5.7S9.8 12.1 8 13.7C6.2 12.1 5.3 10.2 5.3 8s.9-4.1 2.7-5.7z" />
      </Svg>
    ),
  },
  modlens: {
    hue: 280,
    isi: (
      <Svg>
        <path d="M1.7 8S4.2 3.7 8 3.7 14.3 8 14.3 8 11.8 12.3 8 12.3 1.7 8 1.7 8z" />
        <circle cx="8" cy="8" r="2.1" />
        <circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none" />
      </Svg>
    ),
  },
  'receiving-code-review': {
    hue: 210,
    isi: (
      <Svg>
        <path d="M8 2.2v6.6M5.4 6.2 8 8.8l2.6-2.6" strokeWidth="1.3" />
        <path d="M2.6 9.7v2.5a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2V9.7" />
      </Svg>
    ),
  },
  'requesting-code-review': {
    hue: 235,
    isi: (
      <Svg>
        <Isi d="M13.6 2.4 2.5 7.3l4.1 1.6 1.4 4z" />
        <path d="M6.6 8.9 13.6 2.4" />
      </Svg>
    ),
  },
  'run-tests': {
    hue: 140,
    isi: (
      <Svg>
        <circle cx="8" cy="8" r="5.6" />
        <Isi d="M6.5 5.3 11 8l-4.5 2.7z" />
      </Svg>
    ),
  },
  'subagent-driven-development': {
    hue: 260,
    isi: (
      <Svg>
        <rect x="3.2" y="5.3" width="9.6" height="7.2" rx="1.9" />
        <path d="M8 2.1v3.2" />
        <circle cx="8" cy="1.7" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="6.1" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
        <circle cx="9.9" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
        <path d="M6.7 10.6h2.6" />
      </Svg>
    ),
  },
  'systematic-debugging': {
    hue: 0,
    isi: (
      <Svg>
        <circle cx="8" cy="9" r="3.4" />
        <path d="M8 5.6V2.9M6 2.3l1.4 1.4M10 2.3 8.6 3.7" />
        <path d="M4.7 7.5 2.4 6.3M4.5 9.4H2M4.7 11.3 2.4 12.5M11.3 7.5l2.3-1.2M11.5 9.4H14M11.3 11.3l2.3 1.2" />
      </Svg>
    ),
  },
  'test-driven-development': {
    hue: 110,
    isi: (
      <Svg>
        <path d="M4.4 2.4h2.8v8.2a1.4 1.4 0 0 1-2.8 0z" />
        <path d="M4.4 8.4h2.8" />
        <path d="M9.8 4.6h2.2v6.2a1.1 1.1 0 0 1-2.2 0z" />
        <path d="M9.8 9.2h2.2" />
      </Svg>
    ),
  },
  'using-git-worktrees': {
    hue: 30,
    isi: (
      <Svg>
        <path d="M2.4 4.4a1 1 0 0 1 1-1h2.5l1.2 1.5h5.4a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1z" />
        <circle cx="6.6" cy="9.4" r="0.9" />
        <circle cx="10.4" cy="7.6" r="0.9" />
        <path d="M6.6 8.5v3.1M6.6 9.9c0-.9.6-1.4 1.6-1.4h1.3" />
      </Svg>
    ),
  },
  'using-skills': {
    hue: 320,
    isi: (
      <Svg>
        <path d="M8 4.3C6.6 3.1 4.4 2.9 2.6 3.5v8.2c1.8-.6 4-.4 5.4.8 1.4-1.2 3.6-1.4 5.4-.8V3.5C11.6 2.9 9.4 3.1 8 4.3z" />
        <path d="M8 4.3v8.2" />
        <path d="M11.9 1.4l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" strokeWidth="0.9" />
      </Svg>
    ),
  },
  'verification-before-completion': {
    hue: 150,
    isi: (
      <Svg>
        <path d="M8 1.9 9.8 3.3l2.3.3.3 2.3L13.9 8l-1.5 1.9-.3 2.3-2.3.3L8 14.1 6.2 12.5l-2.3-.3-.3-2.3L2.1 8l1.5-1.9.3-2.3 2.3-.3z" />
        <path d="M5.8 8.1 7.4 9.7l3-3.2" strokeWidth="1.35" />
      </Svg>
    ),
  },
  'writing-plans': {
    hue: 250,
    isi: (
      <Svg>
        <path d="M2.4 4.2 6.4 2.6v9.6l-4 1.6zM6.4 2.6 10.2 4.2v9.6L6.4 12.2z" />
        <path d="M10.2 4.2l3.4-1.6v9.6l-3.4 1.6" />
        <path d="M4 6.6c1.6-.4 2.6.5 2.6 2.1s1 2.4 2.6 2" opacity="0.6" strokeDasharray="1.4 1.4" />
      </Svg>
    ),
  },
  'writing-skills': {
    hue: 340,
    isi: (
      <Svg>
        <path d="M2.6 13.4 4 9.6l6.2-6.2 2.6 2.6-6.2 6.2z" />
        <path d="M9.4 2.9 12 5.5" />
        <path d="M2.6 13.4l2.7-.7" />
      </Svg>
    ),
  },
};

Object.assign(PETA_MEREK, BAWAAN);

/* Kunci pencarian merek: id polos untuk MCP, tanpa awalan untuk bahasa/paket. */
function kunciMerek(jenis: JenisIkon, id: string, nama: string): string | null {
  const polos = id.replace(/^(paket:|lsp:|tema:|ikon:|bahasa:|katalog:)/, '');
  if (PETA_MEREK[polos]) return polos;
  /* Plugin/skill tidak punya id merek; cocokkan nama yang jelas-jelas merek. */
  const namaKecil = nama.toLowerCase();
  if (jenis === 'plugins' || jenis === 'skills') {
    const hurufKecil = polos.toLowerCase();
    if (PETA_MEREK[hurufKecil]) return hurufKecil;
    if (namaKecil.includes('github') || namaKecil.includes('gh-')) return 'github';
    if (namaKecil.includes('git')) return 'git';
    if (namaKecil.includes('postgres')) return 'postgres';
    if (namaKecil.includes('figma')) return 'figma';
    if (namaKecil.includes('slack')) return 'slack';
    if (namaKecil.includes('notion')) return 'notion';
    if (namaKecil.includes('sentry')) return 'sentry';
    if (namaKecil.includes('docker')) return 'docker';
    if (namaKecil.includes('playwright')) return 'playwright';
  }
  return null;
}

/* Warna monogram: angka 0..359 dari hash id. Stabil antar render & sesi. */
function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function inisial(nama: string, jenis: JenisIkon): string {
  if (jenis === 'snippets') return '{}';
  if (jenis === 'keymaps') return '⌨';
  if (jenis === 'skills') return '✦';
  if (jenis === 'icon-themes') return '◧';
  const kata = nama.trim().split(/[\s._/-]+/).filter(Boolean);
  if (kata.length >= 2) return (kata[0][0] + kata[1][0]).toUpperCase();
  return (kata[0] ?? '?').slice(0, 2).toUpperCase();
}

/**
 * Baris Marketplace satu ikon.
 *
 * `tema` hanya dipakai untuk tema bawaan (id `tema:<id>`): kotak tiga pita
 * warna tema itu. Paket berlogo sendiri tetap memakai `IkonExt` di pemanggil.
 */
export function IkonPasar({
  jenis,
  id,
  nama,
}: {
  jenis: JenisIkon;
  id: string;
  nama: string;
}) {
  if (jenis === 'themes' && id.startsWith('tema:')) {
    return (
      <span
        className="xmkt-swatch"
        data-theme={id.slice(5)}
        data-ikon="swatch"
        aria-hidden="true"
      >
        <span className="xmkt-swatch-atas" />
        <span className="xmkt-swatch-tengah" />
        <span className="xmkt-swatch-bawah" />
      </span>
    );
  }

  const kunci = kunciMerek(jenis, id, nama);
  if (kunci) {
    const merek = PETA_MEREK[kunci];
    /* Warna: kelas merek (warna resmi) atau hue untuk logo buatan sendiri. */
    const kelas = [
      'xmkt-merek',
      merek.warna ? `is-${merek.warna}` : '',
      merek.hue !== undefined ? 'is-hue' : '',
      merek.padat ? 'is-padat' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const gaya =
      merek.hue !== undefined
        ? ({ '--ikon-hue': merek.hue } as CSSProperties)
        : undefined;
    return (
      <span className={kelas} style={gaya} data-ikon={kunci} aria-hidden="true">
        {merek.isi}
      </span>
    );
  }

  return (
    <span
      className="xmkt-mono"
      data-ikon="mono"
      aria-hidden="true"
      style={{ '--mono-hue': hue(id) } as CSSProperties}
    >
      {inisial(nama, jenis)}
    </span>
  );
}
