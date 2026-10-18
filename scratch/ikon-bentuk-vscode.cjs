// Tulis ulang paket ikon dalam BENTUK VS CODE yang benar.
//
// Kenapa diubah: bentuk lama memakai `folderNames` berisi NAMA DEFINISI
// ("folder"), padahal loader membacanya sebagai objek ikon. Akibatnya ikon
// folder per-nama tidak pernah terpetakan, dan pohon berkas tidak berubah.
//
// Bentuk yang benar (dan yang dipakai semua paket marketplace sungguhan):
//
//   iconDefinitions  nama -> { iconPath } atau { fontCharacter, fontColor }
//   file             nama definisi untuk berkas umum
//   folder           nama definisi folder tertutup
//   folderExpanded   nama definisi folder terbuka
//   fileExtensions   ekstensi -> nama definisi
//   fileNames        nama berkas -> nama definisi
//   folderNames      nama folder -> nama definisi
//
// Loader sudah menangani bentuk ini (dan itulah jalur yang dipakai paket VS Code
// asli), jadi memakai bentuk yang sama berarti satu jalur, bukan dua.
const fs = require('fs');
const paket = JSON.parse(fs.readFileSync('scratch/ikon/paket.json', 'utf8'));

/**
 * Ikon teks jadi definisi. `fontCharacter` dipakai karena itu field yang dibaca
 * loader untuk glif; glifnya sendiri adalah karakter Unicode, bukan escape.
 */
function definisi(glif, warna) {
  const cp = glif.codePointAt(0) ?? 0x25a0;
  return {
    fontCharacter: `\\${cp.toString(16)}`,
    fontColor: warna,
  };
}

const daftarManifest = [];

for (const p of paket) {
  const asli = JSON.parse(p.json);
  const icons = asli.icons ?? {};
  const fileNames = asli.fileNames ?? {};
  const folderNamesAsli = asli.folderNames ?? {};

  /* Definisi unik per (glif, warna) supaya tidak ada ratusan entri kembar. */
  const defs = {};
  const kunciDef = (glif, warna) => `_${glif.codePointAt(0).toString(16)}_${warna.replace(/[^a-z0-9]/gi, '')}`;
  const defUntuk = (glif, warna) => {
    const k = kunciDef(glif, warna);
    if (!defs[k]) defs[k] = definisi(glif, warna);
    return k;
  };

  const fileExtensions = {};
  let fileUmum = null;

  for (const [kunci, ik] of Object.entries(icons)) {
    if (!ik || typeof ik !== 'object') continue;
    const glif = ik.glyph;
    if (!glif) continue;
    const warna = ik.color ?? 'var(--fg2)';

    if (kunci === 'file') {
      fileUmum = defUntuk(glif, warna);
      continue;
    }
    if (kunci === 'folder' || kunci === 'folder-open') {
      continue; /* ditangani di bawah, dari asli.folder / folder-open */
    }
    fileExtensions[kunci] = defUntuk(glif, warna);
  }

  /* Folder: ambil dari kunci tingkat atas yang memang berisi objek ikon. */
  const folderDef = asli.folder
    ? defUntuk(asli.folder.glyph ?? p.folder, asli.folder.color ?? 'var(--accent)')
    : defUntuk(p.folder, 'var(--accent)');
  const folderOpenDef = asli['folder-open']
    ? defUntuk(asli['folder-open'].glyph ?? p.folderOpen, asli['folder-open'].color ?? 'var(--accent)')
    : defUntuk(p.folderOpen, 'var(--accent)');

  /* Nama berkas: petakan ke definisi ekstensinya, atau ke definisi umum. */
  const fileNamesBaru = {};
  for (const [nama, target] of Object.entries(fileNames)) {
    if (typeof target === 'string' && fileExtensions[target]) {
      fileNamesBaru[nama] = fileExtensions[target];
    } else {
      fileNamesBaru[nama] = fileUmum ?? defUntuk(p.file, 'var(--fg2)');
    }
  }

  /* Nama folder: SEMUA ke definisi folder (itu inti perbaikannya). */
  const folderNamesBaru = {};
  for (const nama of Object.keys(folderNamesAsli)) {
    folderNamesBaru[nama] = folderDef;
  }

  const benar = {
    iconDefinitions: defs,
    file: fileUmum ?? defUntuk(p.file, 'var(--fg2)'),
    folder: folderDef,
    folderExpanded: folderOpenDef,
    fileExtensions,
    fileNames: fileNamesBaru,
    folderNames: folderNamesBaru,
  };

  daftarManifest.push({
    id: p.id,
    label: p.label,
    manifest: p.manifest,
    json: JSON.stringify(benar, null, 2),
  });
}

fs.writeFileSync('scratch/ikon/paket.json', JSON.stringify(daftarManifest, null, 2), 'utf8');

/* Laporkan apa yang dihasilkan, apa adanya. */
const c = JSON.parse(daftarManifest[0].json);
console.log('paket:', daftarManifest.length);
console.log('contoh', daftarManifest[0].id, ':');
console.log('  iconDefinitions :', Object.keys(c.iconDefinitions).length);
console.log('  fileExtensions  :', Object.keys(c.fileExtensions).length);
console.log('  fileNames       :', Object.keys(c.fileNames).length);
console.log('  folderNames     :', Object.keys(c.folderNames).length);
console.log('  folder          :', c.folder, '->', JSON.stringify(c.iconDefinitions[c.folder]));
console.log('  folderExpanded  :', c.folderExpanded);
console.log('  folderNames.src :', c.folderNames.src, '->', JSON.stringify(c.iconDefinitions[c.folderNames.src]));
console.log('  fileExtensions.ts:', c.fileExtensions.ts, '->', JSON.stringify(c.iconDefinitions[c.fileExtensions.ts]));
