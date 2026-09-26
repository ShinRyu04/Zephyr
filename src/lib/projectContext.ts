import { listWorkspaceFiles } from './commands';
import { useStore } from './store';

const CTX_TTL_MS = 60_000;

interface RingkasanProyek {
  teks: string;
  at: number;
}

let cache: RingkasanProyek | null = null;
let sedangHitung: Promise<string> | null = null;

const PENANDA: Record<string, string> = {
  'package.json': 'Node.js / JavaScript',
  'tsconfig.json': 'TypeScript',
  'cargo.toml': 'Rust',
  'go.mod': 'Go',
  'pyproject.toml': 'Python',
  'requirements.txt': 'Python',
  'pom.xml': 'Java (Maven)',
  'build.gradle': 'Java/Kotlin (Gradle)',
  'composer.json': 'PHP',
  'gemfile': 'Ruby',
  'pubspec.yaml': 'Dart / Flutter',
  'tauri.conf.json': 'Tauri desktop app',
  'next.config.js': 'Next.js',
  'next.config.mjs': 'Next.js',
  'vite.config.ts': 'Vite',
  'vite.config.js': 'Vite',
  'angular.json': 'Angular',
  'vue.config.js': 'Vue',
  'svelte.config.js': 'Svelte',
  'dockerfile': 'Docker',
  'docker-compose.yml': 'Docker Compose',
  'makefile': 'Make',
  'cmakelists.txt': 'CMake / C++',
};

const ENTRY_KANDIDAT = [
  'src/main.rs',
  'src/lib.rs',
  'src/main.ts',
  'src/main.tsx',
  'src/index.ts',
  'src/index.tsx',
  'src/index.js',
  'src/App.tsx',
  'src/app.tsx',
  'main.py',
  'app.py',
  'src/app.py',
  'main.go',
  'cmd/main.go',
  'index.js',
  'server.js',
];

const MAKS_FILE = 150;
const MAKS_STRUKTUR_CHARS = 4000;

const ABAIKAN = new Set([
  'node_modules',
  '.vite',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  '.idea',
  '.vs',
  'out',
  'bin',
  'obj',
  '.svelte-kit',
  'release',
]);

function disaring(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  const segmen = p.split('/');
  return segmen.some((s) => ABAIKAN.has(s));
}

async function hitung(workspace: string): Promise<string> {
  const bagian: string[] = [];

  let files: string[] = [];
  try {
    const daftar = await listWorkspaceFiles(1000);
    files = (daftar ?? [])
      .map((f) => (f.path ?? '').replace(/\\/g, '/'))
      .filter(Boolean)
      .filter((f) => !disaring(f));
  } catch {
    files = [];
  }

  if (files.length === 0) return '';

  const namaBawah = files.map((f) => f.split('/').pop()!.toLowerCase());
  const teknologi: string[] = [];
  for (const [penanda, label] of Object.entries(PENANDA)) {
    if (namaBawah.includes(penanda) && !teknologi.includes(label)) {
      teknologi.push(label);
    }
  }
  bagian.push(
    `- Folder aktif: ${workspace.replace(/\\/g, '/')}`,
    `- Terdeteksi: ${teknologi.length ? teknologi.join(', ') : 'tidak ada penanda teknologi umum'}`,
    `- Jumlah file terindeks: ${files.length}${files.length >= MAKS_FILE ? '+' : ''}`,
  );

  const entry = ENTRY_KANDIDAT.filter((e) => files.includes(e));
  if (entry.length) {
    bagian.push(`- Titik masuk yang lazim: ${entry.join(', ')}`);
  }

  const level: Record<string, Set<string>> = {};
  for (const f of files) {
    const p = f.split('/');
    if (p.length < 2) continue;
    const top = p[0];
    if (!level[top]) level[top] = new Set();
    if (p.length >= 3) level[top].add(p[1]);
  }
  const peta = Object.entries(level)
    .slice(0, 15)
    .map(([top, anak]) => {
      const isi = [...anak].slice(0, 6).join(', ');
      return `${top}/` + (isi ? ` (${isi}${anak.size > 6 ? ', …' : ''})` : '');
    });
  if (peta.length) {
    let blokPeta = peta.join('\n  ');
    if (blokPeta.length > MAKS_STRUKTUR_CHARS) {
      blokPeta = blokPeta.slice(0, MAKS_STRUKTUR_CHARS) + '\n  …';
    }
    bagian.push(`- Struktur level atas:\n  ${blokPeta}`);
  }

  const KODE = /\.(rs|ts|tsx|js|jsx|py|go|java|kt|rb|php|c|cpp|h|cs|swift|dart|vue|svelte|sql|sh|ps1)$/i;
  const prioritas = files
    .filter((f) => KODE.test(f))
    .sort((a, b) => {
      const aSrc = a.includes('/src/') || a.startsWith('src/') ? 0 : 1;
      const bSrc = b.includes('/src/') || b.startsWith('src/') ? 0 : 1;
      return aSrc - bSrc;
    });
  const contoh = (prioritas.length ? prioritas : files).slice(0, 50);
  bagian.push(`- Contoh file:\n  ${contoh.join(', ')}${prioritas.length > 50 ? ', …' : ''}`);

  return bagian.join('\n');
}

export async function ringkasanProyek(): Promise<string> {
  const ws = useStore.getState().workspace;
  if (!ws) return '';

  const now = Date.now();
  if (cache && now - cache.at < CTX_TTL_MS) return cache.teks;
  if (sedangHitung) return sedangHitung;

  sedangHitung = hitung(ws)
    .then((teks) => {
      cache = { at: Date.now(), teks };
      return teks;
    })
    .catch(() => cache?.teks ?? '')
    .finally(() => {
      sedangHitung = null;
    });

  return sedangHitung;
}

export function resetRingkasanProyek() {
  cache = null;
}
