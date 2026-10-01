// Build release/1.1.13/latest.json only after every referenced asset validates.
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const version = '1.1.13';
const dir = path.join(root, 'release', version);
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tauriVersion = JSON.parse(readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(
  readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8'),
)?.[1];
for (const [source, value] of [
  ['package.json', packageVersion],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['src-tauri/tauri.conf.json', tauriVersion],
]) {
  if (value !== version) throw new Error(`${source} version ${value ?? '(missing)'} is not ${version}`);
}

const requiredAssets = [
  `Zephyr_${version}_x64-setup.exe`,
  `Zephyr_${version}_x64-setup.exe.sig`,
  `linux/Zephyr_${version}_amd64.AppImage`,
  `linux/Zephyr_${version}_amd64.AppImage.sig`,
];
for (const relative of requiredAssets) {
  const file = path.join(dir, relative);
  if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0) {
    throw new Error(`Required release asset is missing or empty: ${file}`);
  }
}

const langs = ['en', 'id', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];
const notes = Object.fromEntries(langs.map((lang) => {
  const file = path.join(dir, 'notes', `RELEASE_NOTES_v${version}.${lang}.md`);
  if (!existsSync(file)) throw new Error(`Missing ${lang} release notes: ${file}`);
  const contents = readFileSync(file, 'utf8').trim();
  if (!contents) throw new Error(`Empty ${lang} release notes: ${file}`);
  return [lang, contents];
}));

function signature(relative) {
  const value = readFileSync(path.join(dir, relative), 'utf8').trim();
  if (value.length < 64) throw new Error(`Signature looks invalid: ${relative}`);
  return value;
}

const base = `https://github.com/ShinRyu04/Zephyr/releases/download/v${version}`;
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      // Tauri's Windows updater consumes the signed NSIS installer, never a
      // debug executable and never the marker-based portable zip.
      signature: signature(`Zephyr_${version}_x64-setup.exe.sig`),
      url: `${base}/Zephyr_${version}_x64-setup.exe`,
    },
    'linux-x86_64': {
      signature: signature(`linux/Zephyr_${version}_amd64.AppImage.sig`),
      url: `${base}/Zephyr_${version}_amd64.AppImage`,
    },
  },
};

const output = path.join(dir, 'latest.json');
const temporary = `${output}.tmp`;
writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
renameSync(temporary, output);
console.log(`latest.json : ${output}`);
console.log(`version     : ${version}`);
console.log(`notes       : ${Object.keys(notes).join(', ')} (${Object.keys(notes).length})`);
console.log('windows     : release NSIS signature validated');
console.log('linux       : release AppImage signature validated');
