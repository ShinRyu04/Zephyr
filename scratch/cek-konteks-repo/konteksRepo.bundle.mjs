// src/lib/agentGuard.ts
function bentukBanding(p) {
  let s = p.replace(/\\/g, "/");
  s = s.replace(/^\/\/\?\//, "/");
  s = s.replace(/^[a-zA-Z]:/, "");
  s = s.split("/").map((seg) => {
    const colon = seg.indexOf(":");
    return colon === -1 ? seg : seg.slice(0, colon);
  }).join("/");
  s = s.split("/").map((seg) => seg.replace(/[.\s]+$/, "")).join("/");
  s = s.replace(/\/{2,}/g, "/");
  s = s.toLowerCase();
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function basename(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}
var POLA_RAHASIA = [
  /^\.env(\..+)?(?:[.\s:]|$)/i,
  /^.*\.pem(?:[.\s:]|$)/i,
  /^.*\.key(?:[.\s:]|$)/i,
  /^.*\.p12(?:[.\s:]|$)/i,
  /^.*\.pfx(?:[.\s:]|$)/i,
  /^.*\.asc(?:[.\s:]|$)/i,
  /^.*\.gpg(?:[.\s:]|$)/i,
  /^.*\.keystore(?:[.\s:]|$)/i,
  /^.*\.jks(?:[.\s:]|$)/i,
  /^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?(?:[.\s:]|$)/i,
  /^known_hosts(?:[.\s:]|$)/i,
  /^authorized_keys(?:[.\s:]|$)/i,
  /^htpasswd(?:[.\s:]|$)/i,
  /^\.netrc(?:[.\s:]|$)/i,
  /^_netrc(?:[.\s:]|$)/i,
  /^credentials(?:[.\s:]|$)/i,
  /^\.pgpass(?:[.\s:]|$)/i,
  /^\.npmrc(?:[.\s:]|$)/i,
  /^\.pypirc(?:[.\s:]|$)/i,
  /^secrets?\.(json|ya?ml|toml|env)(?:[.\s:]|$)/i,
  /^service[-_]?account.*\.json(?:[.\s:]|$)/i,
  /^\.git-credentials(?:[.\s:]|$)/i
];
var DIR_TERPROTEKSI = [
  "/.ssh",
  "/.gnupg",
  "/.aws",
  "/.azure",
  "/.kube",
  "/.docker",
  "/.config/gh",
  "/.config/git",
  "/.config/gcloud",
  "/.config/op",
  "/.git",
  "/.terraform.d",
  "/library/keychains",
  "/library/cookies",
  "/etc",
  "/private/etc",
  "/proc",
  "/sys",
  "/var/db",
  "/var/root",
  "/private/var/db",
  "/private/var/root",
  "/appdata/roaming/microsoft/credentials",
  "/appdata/local/microsoft/credentials",
  "/appdata/roaming/gcloud"
];
function diDalamTerproteksi(cmp, dir) {
  return `${cmp}/`.includes(`${dir}/`);
}
function sebut(dir) {
  return dir.replace(/^\//, "");
}
function periksaBaca(path) {
  if (typeof path !== "string" || path.length === 0) {
    return { ok: false, alasan: "ditolak: jalur kosong." };
  }
  if (/[\x00-\x1f]/.test(path)) {
    return { ok: false, alasan: "ditolak: jalur memuat byte kontrol." };
  }
  const nama = basename(path);
  for (const re of POLA_RAHASIA) {
    if (re.test(nama)) {
      return {
        ok: false,
        alasan: `ditolak: "${nama}" cocok dengan pola berkas rahasia.`
      };
    }
  }
  const cmp = bentukBanding(path);
  for (const dir of DIR_TERPROTEKSI) {
    if (diDalamTerproteksi(cmp, dir)) {
      return {
        ok: false,
        alasan: `ditolak: jalur berada di direktori terproteksi (${sebut(dir)}).`
      };
    }
  }
  return { ok: true };
}

// src/lib/konteksRepo.ts
var BATAS_PINDAI_BERKAS = 5e3;
var BATAS_BERKAS_TAMPIL = 300;
var BATAS_BYTE_TAMPIL = 8 * 1024 * 1024;
var BATAS_UKURAN_BERKAS = 1024 * 1024;
var BATAS_CHAR_RINGKASAN = 6e3;
var BATAS_BARIS_STRUKTUR = 40;
var BATAS_BAHASA = 12;
var BATAS_GITIGNORE_BYTE = 64 * 1024;
var BATAS_STAT_BERKAS = 300;
var KONTEKS_REPO_VERSI = 1;
var POLA_RAHASIA_TAMBAHAN = [
  /^.*\.(kdbx|ppk|age|ovpn|p8|tfstate|tfvars|mobileprovision)(?:[.\s:]|$)/i,
  /^.*keychain(-db)?(?:[.\s:]|$)/i
];
var POLA_RAHASIA_EFEKTIF = [
  ...POLA_RAHASIA,
  ...POLA_RAHASIA_TAMBAHAN,
  // Nama berkas yang rahasia tanpa melihat ekstensi. `.env` sudah ada di
  // daftar bersama; yang di sini adalah bentuk yang tidak ditangkapnya.
  /^(secrets?|credentials?|passwords?|tokens?)\.(json|ya?ml|toml|ini|cfg|conf|txt|xml|properties)(?:[.\s:]|$)/i,
  /^(\.aws|\.dockercfg|\.gitconfig|\.git-credentials|\.node_repl_history)(?:[.\s:]|$)/i,
  /^\.?htpasswd(?:[.\s:]|$)/i
];
var ABAIKAN_SEGMEN = [
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "target",
  "out",
  "obj",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".parcel-cache",
  ".cache",
  ".turbo",
  ".vercel",
  ".netlify",
  "coverage",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  "venv",
  ".venv",
  "vendor",
  "Pods",
  ".gradle",
  ".idea",
  ".vs",
  ".dart_tool",
  ".expo",
  ".terraform",
  ".yarn",
  ".pnpm-store"
];
var HIMPUNAN_ABAIKAN = new Set(ABAIKAN_SEGMEN.map((s) => s.toLowerCase()));
var BAHASA_AKHIRAN = {
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript (React)",
  mjs: "JavaScript",
  cjs: "JavaScript",
  rs: "Rust",
  py: "Python",
  pyi: "Python",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  c: "C",
  h: "C/C++ (header)",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++ (header)",
  hh: "C++ (header)",
  cs: "C#",
  swift: "Swift",
  dart: "Dart",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  ps1: "PowerShell",
  psm1: "PowerShell",
  bat: "Batch",
  cmd: "Batch",
  sql: "SQL",
  lua: "Lua",
  zig: "Zig",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  hs: "Haskell",
  clj: "Clojure",
  scala: "Scala",
  pl: "Perl",
  r: "R",
  jl: "Julia",
  nim: "Nim",
  v: "V",
  groovy: "Groovy",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  md: "Markdown",
  mdx: "Markdown",
  markdown: "Markdown",
  rst: "reStructuredText",
  adoc: "AsciiDoc",
  txt: "Teks",
  json: "JSON",
  jsonc: "JSON",
  json5: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  ini: "INI",
  cfg: "Konfigurasi",
  conf: "Konfigurasi",
  env: "Konfigurasi",
  properties: "Konfigurasi",
  xml: "XML",
  svg: "SVG",
  csv: "CSV",
  tsv: "TSV",
  lock: "Lockfile",
  proto: "Protobuf",
  graphql: "GraphQL",
  gql: "GraphQL",
  tf: "Terraform",
  hcl: "HCL",
  nix: "Nix",
  cmake: "CMake",
  mk: "Make",
  dockerfile: "Dockerfile",
  ipynb: "Notebook",
  wasm: "WebAssembly",
  wat: "WebAssembly",
  ttf: "Font",
  otf: "Font",
  woff: "Font",
  woff2: "Font",
  png: "Gambar",
  jpg: "Gambar",
  jpeg: "Gambar",
  gif: "Gambar",
  webp: "Gambar",
  ico: "Gambar",
  bmp: "Gambar",
  avif: "Gambar",
  mp3: "Audio",
  wav: "Audio",
  ogg: "Audio",
  flac: "Audio",
  mp4: "Video",
  webm: "Video",
  mov: "Video",
  pdf: "PDF",
  zip: "Arsip",
  gz: "Arsip",
  tar: "Arsip",
  "7z": "Arsip",
  rar: "Arsip",
  exe: "Biner",
  dll: "Biner",
  so: "Biner",
  dylib: "Biner",
  a: "Biner",
  lib: "Biner",
  node: "Biner",
  pyc: "Biner",
  class: "Biner",
  o: "Biner",
  map: "Source map",
  snap: "Snapshot",
  log: "Log"
};
var BAHASA_NAMA = {
  dockerfile: "Dockerfile",
  "dockerfile.dev": "Dockerfile",
  "docker-compose.yml": "Docker Compose",
  "docker-compose.yaml": "Docker Compose",
  makefile: "Make",
  gnumakefile: "Make",
  cmakelists: "CMake",
  "cmakelists.txt": "CMake",
  "cargo.toml": "TOML (Rust manifest)",
  "cargo.lock": "Lockfile",
  "package.json": "JSON (npm manifest)",
  "package-lock.json": "Lockfile",
  "pnpm-lock.yaml": "Lockfile",
  "yarn.lock": "Lockfile",
  "tsconfig.json": "JSON (TS config)",
  "tauri.conf.json": "JSON (Tauri config)",
  "go.mod": "Go module",
  "go.sum": "Lockfile",
  "pyproject.toml": "TOML (Python manifest)",
  "requirements.txt": "Python requirements",
  gemfile: "Ruby (Bundler)",
  "gemfile.lock": "Lockfile",
  "pom.xml": "XML (Maven)",
  "build.gradle": "Gradle",
  "build.gradle.kts": "Gradle",
  "pubspec.yaml": "YAML (Flutter)",
  "composer.json": "JSON (Composer)",
  "gradlew": "Shell",
  vagrantfile: "Ruby",
  "procfile": "Konfigurasi",
  "procfile.dev": "Konfigurasi",
  ".editorconfig": "Konfigurasi",
  ".gitignore": "Konfigurasi",
  ".gitattributes": "Konfigurasi",
  ".dockerignore": "Konfigurasi",
  ".npmignore": "Konfigurasi",
  ".prettierrc": "Konfigurasi",
  ".eslintrc": "Konfigurasi",
  ".babelrc": "Konfigurasi",
  ".nvmrc": "Konfigurasi",
  ".tool-versions": "Konfigurasi",
  ".python-version": "Konfigurasi",
  ".rustfmt.toml": "TOML",
  "rust-toolchain": "Konfigurasi",
  "rust-toolchain.toml": "TOML"
};
var PENANDA_TEKNOLOGI = [
  ["package.json", "Node.js"],
  ["tsconfig.json", "TypeScript"],
  ["cargo.toml", "Rust / Cargo"],
  ["tauri.conf.json", "Tauri"],
  ["tauri.release.conf.json", "Tauri (release)"],
  ["go.mod", "Go modules"],
  ["pyproject.toml", "Python (PEP 621)"],
  ["setup.py", "Python (setuptools)"],
  ["requirements.txt", "Python (pip)"],
  ["poetry.lock", "Python (Poetry)"],
  ["pom.xml", "Java (Maven)"],
  ["build.gradle", "Java/Kotlin (Gradle)"],
  ["build.gradle.kts", "Kotlin (Gradle)"],
  ["composer.json", "PHP (Composer)"],
  ["gemfile", "Ruby (Bundler)"],
  ["pubspec.yaml", "Dart / Flutter"],
  ["mix.exs", "Elixir (Mix)"],
  ["cmakelists.txt", "CMake"],
  ["makefile", "Make"],
  ["dockerfile", "Docker"],
  ["docker-compose.yml", "Docker Compose"],
  ["vite.config.ts", "Vite"],
  ["vite.config.js", "Vite"],
  ["next.config.js", "Next.js"],
  ["next.config.mjs", "Next.js"],
  ["nuxt.config.ts", "Nuxt"],
  ["angular.json", "Angular"],
  ["vue.config.js", "Vue CLI"],
  ["svelte.config.js", "SvelteKit"],
  ["astro.config.mjs", "Astro"],
  ["tailwind.config.js", "Tailwind CSS"],
  ["tailwind.config.ts", "Tailwind CSS"],
  ["postcss.config.js", "PostCSS"],
  ["jest.config.js", "Jest"],
  ["vitest.config.ts", "Vitest"],
  ["playwright.config.ts", "Playwright"],
  ["cypress.config.ts", "Cypress"],
  ["eslint.config.js", ".eslintrc", "ESLint"],
  ["serverless.yml", "Serverless Framework"],
  ["wrangler.toml", "Cloudflare Workers"],
  ["netlify.toml", "Netlify"],
  ["vercel.json", "Vercel"],
  ["fly.toml", "Fly.io"],
  ["rust-toolchain.toml", "Rust toolchain pin"],
  ["tsconfig.node.json", "TypeScript (node side)"]
];
function normalJalur(p) {
  let s = String(p ?? "").replace(/\\/g, "/");
  s = s.replace(/^\.\//, "");
  s = s.replace(/\/{2,}/g, "/");
  s = s.replace(/^\/+/, "");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function basename2(p) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
function dirname(p) {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "";
}
function bahasaDariJalur(rel) {
  const p = normalJalur(rel);
  const nama = basename2(p).toLowerCase();
  const khusus = BAHASA_NAMA[nama];
  if (khusus) return khusus;
  const titik = nama.lastIndexOf(".");
  if (titik > 0 && titik < nama.length - 1) {
    const ext = nama.slice(titik + 1);
    const ada = BAHASA_AKHIRAN[ext];
    if (ada) return ada;
    return `Lainnya (.${ext})`;
  }
  if (nama.startsWith(".")) return "Konfigurasi";
  return "Tanpa ekstensi";
}
function ringkasByte(byte) {
  if (!Number.isFinite(byte) || byte < 0) return "?";
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  if (byte < 1024 * 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
  return `${(byte / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function waktuUbahIso(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "?";
  try {
    return `${new Date(ms).toISOString().slice(0, 19)}Z`;
  } catch {
    return "?";
  }
}
function diabaikanStruktur(rel) {
  const seg = normalJalur(rel).toLowerCase().split("/");
  for (let i = 0; i < seg.length - 1; i++) {
    if (HIMPUNAN_ABAIKAN.has(seg[i])) return true;
  }
  return false;
}
function alasanBlokirRahasia(rel, akar = "") {
  const p = normalJalur(rel);
  if (!p) return "jalur-terlarang";
  const mentah = String(rel ?? "").replace(/\\/g, "/");
  if (mentah.startsWith("/") || /^[A-Za-z]:\//.test(mentah)) return "jalur-terlarang";
  if (p === ".." || p.startsWith("../") || p.split("/").includes("..")) return "jalur-terlarang";
  if (/%2e|%2f|%5c/i.test(p)) return "jalur-terlarang";
  const nama = basename2(p);
  for (const re of POLA_RAHASIA_EFEKTIF) {
    if (re.test(nama)) return "rahasia-nama";
  }
  const relCmp = bentukBanding(p);
  const cmpAkar = akar ? bentukBanding(normalJalur(akar)) : "";
  for (const dir of DIR_TERPROTEKSI) {
    const d = bentukBanding(dir);
    if (!d) continue;
    if (d.includes("/.")) {
      if (`/${relCmp}/`.includes(`${d}/`)) return "rahasia-folder";
      continue;
    }
    if (cmpAkar && (cmpAkar === d || cmpAkar.startsWith(`${d}/`) || cmpAkar.endsWith(d) || cmpAkar.includes(`${d}/`))) {
      return "rahasia-folder";
    }
  }
  const gerbang = periksaBaca(p);
  if (!gerbang.ok && !gerbang.alasan.includes("direktori terproteksi")) return "jalur-terlarang";
  return null;
}
function escapeRe(c) {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function reDariGlob(pola) {
  let out = "";
  for (let i = 0; i < pola.length; i++) {
    const c = pola[i];
    if (c === "*") {
      if (pola[i + 1] === "*") {
        i++;
        if (pola[i + 1] === "/") {
          i++;
          out += "(?:.*/)?";
          continue;
        }
        out += ".*";
        continue;
      }
      out += "[^/]*";
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      continue;
    }
    if (c === "[") {
      const tutup = pola.indexOf("]", i + 1);
      if (tutup > i + 1) {
        let isi = pola.slice(i + 1, tutup);
        const neg = isi.startsWith("!") || isi.startsWith("^");
        if (neg) isi = isi.slice(1);
        isi = isi.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
        out += `[${neg ? "^" : ""}${isi}]`;
        i = tutup;
        continue;
      }
      out += "\\[";
      continue;
    }
    out += escapeRe(c);
  }
  return new RegExp(`^${out}$`);
}
function susunAturanGitignore(entri) {
  const dasar = [...entri].map((e) => ({ base: normalJalur(e.base ?? ""), isi: String(e.isi ?? "") })).sort((a, b) => a.base.split("/").length - b.base.split("/").length || (a.base < b.base ? -1 : a.base > b.base ? 1 : 0));
  const aturan = [];
  for (const { base, isi } of dasar) {
    const dipotong = isi.length > BATAS_GITIGNORE_BYTE ? isi.slice(0, BATAS_GITIGNORE_BYTE) : isi;
    for (const barisMentah of dipotong.split(/\r?\n/)) {
      let baris = barisMentah;
      if (baris.startsWith("\\#") || baris.startsWith("\\!")) baris = baris.slice(1);
      else if (baris.startsWith("#")) continue;
      baris = baris.replace(/\s+$/, "");
      if (!baris.trim()) continue;
      let negasi = false;
      if (baris.startsWith("!")) {
        negasi = true;
        baris = baris.slice(1);
      }
      if (baris.startsWith("/")) baris = baris.replace(/^\/+/, "");
      let hanyaDir = false;
      if (baris.endsWith("/")) {
        hanyaDir = true;
        baris = baris.replace(/\/+$/, "");
      }
      if (!baris) continue;
      aturan.push({
        base,
        negasi,
        pola: baris,
        hanyaDir,
        berakar: baris.includes("/"),
        re: reDariGlob(baris)
      });
    }
  }
  return aturan;
}
function calonCocok(rel, berakar, hanyaDir) {
  const seg = rel.split("/");
  if (!hanyaDir) {
    if (berakar) return [rel];
    const keluar2 = [];
    for (let i = 0; i < seg.length; i++) keluar2.push(seg.slice(i).join("/"));
    return keluar2;
  }
  const keluar = [];
  const mulai = berakar ? [0] : seg.map((_, i) => i);
  for (const i of mulai) {
    for (let j = i + 1; j <= seg.length - 1; j++) keluar.push(seg.slice(i, j).join("/"));
  }
  return keluar;
}
function satuAturanCocok(a, rel) {
  let ak = rel;
  if (a.base) {
    if (!rel.startsWith(`${a.base}/`)) return false;
    ak = rel.slice(a.base.length + 1);
  }
  if (!ak) return false;
  for (const c of calonCocok(ak, a.berakar, a.hanyaDir)) {
    if (c && a.re.test(c)) return true;
  }
  return false;
}
function diabaikanOlehGitignore(aturan, rel) {
  const p = normalJalur(rel);
  let putusan = false;
  for (const a of aturan) {
    if (satuAturanCocok(a, p)) putusan = !a.negasi;
  }
  return putusan;
}
var AKAR_PENTING = /* @__PURE__ */ new Set([
  "readme.md",
  "readme",
  "package.json",
  "cargo.toml",
  "tsconfig.json",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "gemfile",
  "pubspec.yaml",
  "makefile",
  "dockerfile",
  "agents.md",
  "architecture.md"
]);
var AKHIRAN_KODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|rs|py|pyi|go|java|kt|kts|rb|php|c|h|cc|cpp|cxx|hpp|cs|swift|dart|vue|svelte|astro|sh|bash|ps1|sql|lua|zig|ex|exs|hs|scala|pl|r|jl|nim|groovy|tf|hcl|nix|proto|graphql)$/i;
var AKHIRAN_BINER = /\.(png|jpe?g|gif|webp|avif|bmp|ico|icns|tiff?|psd|exe|dll|so|dylib|bin|wasm|zip|gz|tgz|bz2|xz|7z|rar|tar|pdf|mp3|wav|ogg|flac|m4a|mp4|mov|mkv|webm|avi|ttf|otf|woff2?|eot|db|sqlite3?|pdb|class|jar|dat|pak|dmg|msi|iso)$/i;
function skorPrioritasBerkas(rel) {
  const p = normalJalur(rel);
  const nama = basename2(p).toLowerCase();
  if (!p.includes("/")) return AKAR_PENTING.has(nama) ? 0 : 1;
  if (AKHIRAN_KODE.test(p)) return p.startsWith("src/") || /(^|\/)src\//.test(p) ? 2 : 3;
  if (/\.(md|mdx|rst|adoc)$/i.test(p)) return 4;
  if (/\.(json|ya?ml|toml|ini|cfg|conf|xml|lock|properties)$/i.test(p)) return 5;
  return 6;
}
function bandingBerkas(a, b) {
  const sa = skorPrioritasBerkas(a.rel);
  const sb = skorPrioritasBerkas(b.rel);
  if (sa !== sb) return sa - sb;
  return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
}
function normalAkar(akar) {
  return String(akar ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
}
function saring(masukan) {
  const akar = normalAkar(masukan.akar);
  const aturan = susunAturanGitignore(masukan.gitignore ?? []);
  const stat = {
    dipindai: 0,
    diabaikanStruktur: 0,
    diabaikanGitignore: 0,
    diblokirRahasia: 0,
    blokirPerJenis: {},
    dilewatiBesar: 0,
    tampil: 0,
    byteTampil: 0,
    byteBinerTampil: 0,
    terpotongPindai: false,
    terpotongJumlah: false,
    terpotongByte: false,
    terpotongChar: false
  };
  const kandidat = [];
  const sudah = /* @__PURE__ */ new Set();
  const mentah = masukan.berkas ?? [];
  if (mentah.length > BATAS_PINDAI_BERKAS) stat.terpotongPindai = true;
  for (const b of mentah.slice(0, BATAS_PINDAI_BERKAS)) {
    const relMentah = String(b?.rel ?? "");
    if (relMentah) {
      const blokirMentah = alasanBlokirRahasia(relMentah, akar);
      if (blokirMentah) {
        stat.diblokirRahasia++;
        stat.blokirPerJenis[blokirMentah] = (stat.blokirPerJenis[blokirMentah] ?? 0) + 1;
        continue;
      }
    }
    const rel = normalJalur(relMentah);
    if (!rel || rel.endsWith("/")) continue;
    if (sudah.has(rel)) continue;
    sudah.add(rel);
    stat.dipindai++;
    if (diabaikanStruktur(rel)) {
      stat.diabaikanStruktur++;
      continue;
    }
    if (diabaikanOlehGitignore(aturan, rel)) {
      stat.diabaikanGitignore++;
      continue;
    }
    const blokir = alasanBlokirRahasia(rel, akar);
    if (blokir) {
      stat.diblokirRahasia++;
      stat.blokirPerJenis[blokir] = (stat.blokirPerJenis[blokir] ?? 0) + 1;
      continue;
    }
    const ukuran = Number.isFinite(b?.ukuran) && b.ukuran >= 0 ? Math.trunc(b.ukuran) : -1;
    if (ukuran > BATAS_UKURAN_BERKAS) {
      stat.dilewatiBesar++;
      continue;
    }
    const mtimeMs = Number.isFinite(b?.mtimeMs) && b.mtimeMs > 0 ? Math.trunc(b.mtimeMs) : 0;
    kandidat.push({ rel, bahasa: bahasaDariJalur(rel), ukuran, mtimeMs });
  }
  return { kandidat, stat };
}
function susunStruktur(berkas) {
  const peta = /* @__PURE__ */ new Map();
  for (const b of berkas) {
    const seg = b.rel.split("/");
    const atas = seg.length > 1 ? seg[0] : "(akar repo)";
    let masuk = peta.get(atas);
    if (!masuk) {
      masuk = { berkas: 0, anak: /* @__PURE__ */ new Set() };
      peta.set(atas, masuk);
    }
    masuk.berkas++;
    if (seg.length >= 3) masuk.anak.add(seg[1]);
  }
  return [...peta.entries()].map(([folder, v]) => ({ folder, berkas: v.berkas, anak: [...v.anak].sort() })).sort((a, b) => b.berkas - a.berkas || (a.folder < b.folder ? -1 : 1));
}
function susunPenanda(berkas) {
  const namaAda = new Set(berkas.map((b) => basename2(b.rel).toLowerCase()));
  const keluar = [];
  for (const item of PENANDA_TEKNOLOGI) {
    const label = item[item.length - 1];
    const nama = item.slice(0, -1);
    if (nama.some((n) => namaAda.has(n))) {
      if (!keluar.includes(label)) keluar.push(label);
    }
  }
  return keluar;
}
function susunBahasa(berkas) {
  const hitung = /* @__PURE__ */ new Map();
  for (const b of berkas) hitung.set(b.bahasa, (hitung.get(b.bahasa) ?? 0) + 1);
  const urut = [...hitung.entries()].map(([bahasa, berkas2]) => ({ bahasa, berkas: berkas2 })).sort((a, b) => b.berkas - a.berkas || (a.bahasa < b.bahasa ? -1 : 1));
  const rinci = urut.slice(0, BATAS_BAHASA);
  const sisa = urut.slice(BATAS_BAHASA).reduce((n, x) => n + x.berkas, 0);
  return { bahasa: rinci, lainnya: sisa };
}
function angkaRibu(n) {
  const s = String(Math.trunc(Math.abs(n)));
  let keluar = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) keluar += ".";
    keluar += s[i];
  }
  return `${n < 0 ? "-" : ""}${keluar}`;
}
function susunRingkasan(k) {
  const s = k.stat;
  const baris = [];
  baris.push("Repository context (the folder the user has open - NOT the Zephyr source tree).");
  baris.push(`- Root: ${k.akar || "(unknown)"}`);
  baris.push(
    `- Files: ${s.dipindai} examined, ${s.tampil} listed here, ${s.diblokirRahasia} hidden as secret/protected, ${s.diabaikanGitignore} ignored by .gitignore, ${s.diabaikanStruktur} ignored as build/dependency folders, ${s.dilewatiBesar} over ${ringkasByte(BATAS_UKURAN_BERKAS)}.`
  );
  if (k.bahasa.length) {
    const bhs = k.bahasa.map((b) => `${b.bahasa} ${b.berkas}`).join(", ");
    baris.push(`- Languages (files): ${bhs}${k.bahasaLainnya ? `, +${k.bahasaLainnya} other` : ""}`);
  }
  if (k.penanda.length) baris.push(`- Markers: ${k.penanda.join(", ")}`);
  if (k.struktur.length) {
    baris.push("- Layout (files per top folder):");
    for (const t of k.struktur.slice(0, BATAS_BARIS_STRUKTUR)) {
      const anak = t.anak.length ? `; subfolders: ${t.anak.slice(0, 6).join(", ")}${t.anak.length > 6 ? ", \u2026" : ""}` : "";
      baris.push(`  ${t.folder} (${t.berkas} ${t.berkas === 1 ? "file" : "files"}${anak})`);
    }
    if (k.struktur.length > BATAS_BARIS_STRUKTUR) {
      baris.push(`  \u2026 and ${k.struktur.length - BATAS_BARIS_STRUKTUR} more folders`);
    }
  }
  const potong = [];
  if (s.terpotongJumlah) potong.push(`at most ${BATAS_BERKAS_TAMPIL} files are listed`);
  if (s.terpotongByte) potong.push(`the listed corpus is capped at ${ringkasByte(BATAS_BYTE_TAMPIL)}`);
  if (s.terpotongPindai) potong.push(`only the first ${angkaRibu(BATAS_PINDAI_BERKAS)} entries were examined`);
  if (potong.length) baris.push(`- Truncated: ${potong.join("; ")}.`);
  if (s.byteBinerTampil > 0 && s.byteBinerTampil * 2 > BATAS_BYTE_TAMPIL) {
    baris.push(
      `- Note: binaries take ${ringkasByte(s.byteBinerTampil)} of the ${ringkasByte(BATAS_BYTE_TAMPIL)} listed corpus budget; source files are ranked first, so they keep their slots.`
    );
  }
  baris.push(
    "- Secret material (environment files, private keys, credential stores, and the",
    "  protected dot-folders) is NEVER listed and never read: if a path is missing from",
    "  this list, do not guess at it and do not ask the user to paste it in."
  );
  if (k.berkas.length) {
    baris.push(`- Files (path | language | size | last modified) - ${k.berkas.length} of ${s.tampil}:`);
    for (const b of k.berkas) {
      baris.push(`  ${b.rel} | ${b.bahasa} | ${ringkasByte(b.ukuran)} | ${waktuUbahIso(b.mtimeMs)}`);
    }
  } else {
    baris.push("- Files: none survived the filters above.");
  }
  let teks = baris.join("\n");
  let terpotong = false;
  if (teks.length > BATAS_CHAR_RINGKASAN) {
    let penanda = "";
    let dipotong = "";
    for (let putaran = 0; putaran < 3; putaran += 1) {
      const ruang = Math.max(0, BATAS_CHAR_RINGKASAN - penanda.length);
      dipotong = teks.slice(0, ruang);
      const barisTerakhir = dipotong.lastIndexOf("\n");
      if (barisTerakhir > 0) dipotong = dipotong.slice(0, barisTerakhir);
      const dibuang = teks.length - dipotong.length;
      const baru = `
\u2026 (summary cut at ${BATAS_CHAR_RINGKASAN} characters; ${dibuang} characters dropped)`;
      const stabil = baru.length === penanda.length;
      penanda = baru;
      if (stabil) break;
    }
    teks = dipotong + penanda;
    terpotong = true;
  }
  return { teks, terpotong };
}
function bangunKonteksRepo(masukan) {
  const akar = normalAkar(masukan?.akar ?? "");
  const { kandidat, stat } = saring({ ...masukan, akar });
  kandidat.sort(bandingBerkas);
  const tampil = [];
  let byteTampil = 0;
  let byteBinerTampil = 0;
  for (const k of kandidat) {
    if (tampil.length >= BATAS_BERKAS_TAMPIL) {
      stat.terpotongJumlah = true;
      break;
    }
    if (k.ukuran > 0 && byteTampil + k.ukuran > BATAS_BYTE_TAMPIL) {
      stat.terpotongByte = true;
      continue;
    }
    if (k.ukuran > 0) byteTampil += k.ukuran;
    if (k.ukuran > 0 && AKHIRAN_BINER.test(k.rel)) byteBinerTampil += k.ukuran;
    tampil.push(k);
  }
  stat.tampil = tampil.length;
  stat.byteTampil = byteTampil;
  stat.byteBinerTampil = byteBinerTampil;
  const bhs = susunBahasa(kandidat);
  const kerangka = {
    versi: KONTEKS_REPO_VERSI,
    akar,
    bahasa: bhs.bahasa,
    bahasaLainnya: bhs.lainnya,
    penanda: susunPenanda(kandidat),
    struktur: susunStruktur(kandidat),
    berkas: tampil,
    stat
  };
  const { teks, terpotong } = susunRingkasan(kerangka);
  stat.terpotongChar = terpotong;
  return { ...kerangka, ringkasan: teks };
}
function isiDari(hasil) {
  if (typeof hasil === "string") return hasil;
  return String(hasil?.content ?? "");
}
async function pindaiKonteksRepo(akar, cmd, opsi = {}) {
  const peringatan = [];
  const akarNormal = normalAkar(akar);
  const batasPindai = opsi.batasPindai ?? BATAS_PINDAI_BERKAS;
  const batasStat = opsi.batasStat ?? BATAS_STAT_BERKAS;
  let daftar = [];
  try {
    daftar = await cmd.listWorkspaceFiles(batasPindai) ?? [];
  } catch (e) {
    peringatan.push(`listWorkspaceFiles gagal: ${pesan(e)}`);
    return {
      konteks: bangunKonteksRepo({ akar: akarNormal, berkas: [], gitignore: [] }),
      peringatan
    };
  }
  const jalur = /* @__PURE__ */ new Map();
  let diLuarAkar = 0;
  for (const f of daftar) {
    const relMentah = String(f?.rel ?? "").trim();
    const absMentah = String(f?.path ?? "").trim().replace(/\\/g, "/");
    let r = normalJalur(relMentah || absMentah || String(f?.name ?? ""));
    if (!relMentah && absMentah) {
      const bawah = akarNormal ? `${akarNormal}/` : "";
      if (bawah && absMentah.toLowerCase().startsWith(bawah.toLowerCase())) {
        r = normalJalur(absMentah.slice(bawah.length));
      } else if (!bawah) {
        r = normalJalur(absMentah);
      } else {
        diLuarAkar += 1;
        continue;
      }
    }
    if (!r || r.endsWith("/")) continue;
    const abs = absMentah || `${akarNormal}/${r}`;
    if (!jalur.has(r)) jalur.set(r, abs.replace(/\\/g, "/"));
  }
  if (diLuarAkar > 0) peringatan.push(`${diLuarAkar} berkas di luar akar diabaikan`);
  const berkasMentah = [...jalur.keys()].map((r) => ({ rel: r, ukuran: -1, mtimeMs: 0 }));
  const gitignore = [];
  if (opsi.bacaGitignore !== false) {
    for (const r of berkasMentah) {
      if (basename2(r.rel).toLowerCase() !== ".gitignore") continue;
      try {
        gitignore.push({ base: dirname(r.rel), isi: isiDari(await cmd.fsRead(jalur.get(r.rel) ?? r.rel)) });
      } catch (e) {
        peringatan.push(`.gitignore ${r.rel} tidak terbaca (${pesan(e)}) - pola di dalamnya tidak berlaku`);
      }
    }
  }
  const tahap1 = bangunKonteksRepo({ akar: akarNormal, berkas: berkasMentah, gitignore });
  const akanDiStat = tahap1.berkas.slice(0, batasStat).map((b) => b.rel);
  if (tahap1.berkas.length > batasStat) {
    peringatan.push(`hanya ${batasStat} berkas pertama di-stat (sisanya dilaporkan tanpa ukuran)`);
  }
  const info = /* @__PURE__ */ new Map();
  for (const r of akanDiStat) {
    try {
      const st = await cmd.fsStat(jalur.get(r) ?? r);
      if (st && !st.isDir) info.set(r, { ukuran: Number(st.size) || 0, mtimeMs: Number(st.mtime) || 0 });
    } catch (e) {
      peringatan.push(`fsStat ${r} gagal: ${pesan(e)}`);
    }
  }
  const berkasFinal = berkasMentah.map((b) => {
    const i = info.get(b.rel);
    return i ? { rel: b.rel, ukuran: i.ukuran, mtimeMs: i.mtimeMs } : b;
  });
  return { konteks: bangunKonteksRepo({ akar: akarNormal, berkas: berkasFinal, gitignore }), peringatan };
}
function pesan(e) {
  if (e instanceof Error) return e.message;
  return String(e);
}
export {
  ABAIKAN_SEGMEN,
  BATAS_BAHASA,
  BATAS_BARIS_STRUKTUR,
  BATAS_BERKAS_TAMPIL,
  BATAS_BYTE_TAMPIL,
  BATAS_CHAR_RINGKASAN,
  BATAS_GITIGNORE_BYTE,
  BATAS_PINDAI_BERKAS,
  BATAS_STAT_BERKAS,
  BATAS_UKURAN_BERKAS,
  DIR_TERPROTEKSI,
  KONTEKS_REPO_VERSI,
  POLA_RAHASIA,
  POLA_RAHASIA_EFEKTIF,
  POLA_RAHASIA_TAMBAHAN,
  alasanBlokirRahasia,
  bahasaDariJalur,
  bangunKonteksRepo,
  diabaikanOlehGitignore,
  diabaikanStruktur,
  normalJalur,
  pindaiKonteksRepo,
  ringkasByte,
  skorPrioritasBerkas,
  susunAturanGitignore,
  waktuUbahIso
};
