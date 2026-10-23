/*
 * Shell integration (OSC 633 / OSC 7).
 *
 * WHY a parser at all: a terminal that only carries bytes knows the starting
 * folder and nothing else. As soon as the reader types `cd ..`, the pane's
 * `cwd` is a lie, and the exit status of what they just ran is invisible unless
 * it printed something. VS Code solved this with escape sequences the SHELL
 * emits (OSC 633); this module reads them.
 *
 * The sequences are never rendered: xterm consumes OSC inside `writeTo` before
 * painting, and this scanner runs on the same raw payload. Nothing is stripped
 * here — xterm already refuses to draw them.
 *
 * Only two pieces of information are taken:
 *   - `633 ; D ; <exit>`     the previous command finished with this code
 *   - `633 ; P ; Cwd=<path>` the shell's current folder
 *   - `7 ; file://<host><path>` the POSIX way of publishing the folder
 *
 * A chunk can end in the middle of a sequence (a PTY delivers whatever the
 * program wrote, split wherever the pipe happened to break), so the tail of an
 * unfinished OSC is kept per pane and prepended to the next chunk.
 */

export interface InfoShell {
  cwd?: string;
  exitCode?: number;
  /** Teks perintah dari `633 ; E ; <cmd>`, bila shell mengirimkannya. */
  command?: string;
}

const ESC = '\x1b';
const BEL = '\x07';

/** Sisa potongan OSC yang belum lengkap, per pane. */
const sisa = new Map<string, string>();

/** Buang state satu pane (dipanggil saat pane ditutup). */
export function lupakanIntegrasi(id: string) {
  sisa.delete(id);
}

function dariFileUri(uri: string): string | null {
  /* `file://host/c:/dir` → `c:/dir`; host dibuang karena shell lokal. */
  const tanpaSkema = uri.replace(/^file:\/\//i, '');
  const garis = tanpaSkema.indexOf('/');
  const jalur = garis >= 0 ? tanpaSkema.slice(garis) : tanpaSkema;
  let hasil = jalur;
  try {
    hasil = decodeURIComponent(jalur);
  } catch {
    /* persen yang tidak valid dibiarkan apa adanya */
  }
  /* Bentuk Windows dari URI: `/c:/Users/...` → `c:/Users/...`. */
  if (/^\/[a-zA-Z]:[\\/]/.test(hasil)) hasil = hasil.slice(1);
  /* Git Bash/WSL memberi `/c/Users/...`; itu tidak bisa dipakai sebagai path
     Windows, jadi dibiarkan sebagai path POSIX apa adanya. */
  return hasil || null;
}

/**
 * Baca satu potongan output PTY; kembalikan info terakhir yang ditemukan.
 *
 * `null` berarti potongan itu tidak membawa informasi apa pun — pemanggil tidak
 * perlu menyentuh store, dan sebagian besar potongan memang begitu.
 */
export function bacaIntegrasiShell(id: string, data: string): InfoShell | null {
  const gabung = (sisa.get(id) ?? '') + data;
  const info: InfoShell = {};

  /* Simpan ekor yang belum ditutup SEBELUM memindai, supaya potongan yang
     berakhir di tengah `ESC ] 6 ...` tidak hilang ke potongan berikutnya. */
  const mulaiTerakhir = gabung.lastIndexOf(`${ESC}]`);
  if (mulaiTerakhir >= 0) {
    const ekor = gabung.slice(mulaiTerakhir);
    const tertutup = ekor.includes(BEL) || ekor.includes(`${ESC}\\`);
    sisa.set(id, tertutup ? '' : ekor.slice(0, 512));
  } else {
    sisa.set(id, '');
  }

  const pola = /\x1b\](633|7);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(gabung)) !== null) {
    const jenis = m[1];
    const isi = m[2] ?? '';

    if (jenis === '7') {
      const p = dariFileUri(isi);
      if (p) info.cwd = p;
      continue;
    }

    const kode = isi.slice(0, 1);
    const sisaIsi = isi.slice(1).replace(/^;/, '');

    if (kode === 'D') {
      const n = Number(sisaIsi);
      /* `D` tanpa angka berarti "selesai tanpa kode"; bukan 0, karena 0 berarti
         sukses dan itu klaim yang tidak dibuat shell-nya. */
      info.exitCode = Number.isFinite(n) && sisaIsi.trim() !== '' ? n : undefined;
    } else if (kode === 'P') {
      if (/^Cwd=/i.test(sisaIsi)) {
        const p = sisaIsi.slice(4);
        if (p) info.cwd = p;
      }
    } else if (kode === 'E') {
      if (sisaIsi) info.command = sisaIsi;
    }
  }

  return Object.keys(info).length > 0 ? info : null;
}

/*
 * Skrip PowerShell yang mengirim penanda di atas.
 *
 * Disimpan sebagai berkas di folder data dan di-dot-source oleh pane yang
 * memakai integrasi, BUKAN ditulis ke `$PROFILE` pengguna: mengubah profil
 * orang lain dari dalam editor adalah hal yang tidak boleh dilakukan tanpa
 * diminta, dan pane yang dibuka tanpa integrasi harus tetap bersih.
 *
 * Prompt asli TIDAK diganti: ia disimpan lalu dipanggil, jadi tema prompt,
 * Oh-My-Posh, dan modul pengguna tetap bekerja. Yang ditambahkan hanya empat
 * penanda di sekeliling teks prompt yang sudah ada.
 */
export const SKRIP_PS1 = `# Zephyr shell integration (PowerShell).
# Dot-source this file from a shell to let Zephyr follow the working folder and
# the exit status of each command. It wraps the existing prompt and never
# replaces it.
if (-not $global:__zephyrPromptAsli) {
  $global:__zephyrPromptAsli = $function:prompt
}
$__zephyrEsc = [char]27
$__zephyrBel = [char]7

function global:prompt {
  $kode = $LASTEXITCODE
  if ($?) {
    if ($null -eq $kode) { $kode = 0 }
  } elseif ($null -eq $kode -or $kode -eq 0) {
    $kode = 1
  }
  $awal = "$__zephyrEsc]633;D;$kode$__zephyrBel$__zephyrEsc]633;P;Cwd=$($PWD.Path)$__zephyrBel$__zephyrEsc]633;A$__zephyrBel"
  $teks = & $global:__zephyrPromptAsli
  "$awal$teks$__zephyrEsc]633;B$__zephyrBel"
}
`;

/**
 * Base64 UTF-16LE, format yang diminta `powershell -EncodedCommand`.
 *
 * KENAPA dienkode, bukan skrip ditempel atau ditulis ke berkas:
 *
 *  - menulis `.ps1` ke folder data ditolak penjaga path (tulis di luar
 *    workspace), dan melonggarkan penjaga itu untuk kenyamanan bukan tukar
 *    yang sepadan;
 *  - `-Command ". 'C:\\...\'"` bergantung pada kutip dan backslash yang
 *    berbeda antara PowerShell 5.1 dan 7;
 *  - teks yang dienkode tidak pernah melewati parser shell untuk kedua kalinya.
 */
function base64Utf16Le(teks: string): string {
  const bytes = new Uint8Array(teks.length * 2);
  for (let i = 0; i < teks.length; i++) {
    const c = teks.charCodeAt(i);
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Argumen PowerShell untuk pane dengan integrasi, atau `null` bila pane ini
 * bukan PowerShell atau integrasinya dimatikan.
 *
 * Semua masukan datang dari pemanggil (bukan dibaca dari store di sini) supaya
 * modul ini tetap bisa diuji tanpa store dan tidak menambah siklus impor ke
 * `terminalStore`.
 */
export function argumenIntegrasi(opsi: {
  aktif: boolean;
  /** Shell yang dipilih untuk pane: id ('pwsh'/'powershell') atau path. */
  shell: string;
  /** Pilihan default di Settings (dipakai bila `shell` kosong). */
  defaultTerminal?: string;
  /** Path shell eksplisit di Settings. */
  shellPath?: string;
}): string[] | null {
  if (!opsi.aktif) return null;

  const pilihan = (opsi.shell || opsi.defaultTerminal || '').toLowerCase();
  const eksplisit = opsi.shellPath?.trim() || '';
  const adalahPs =
    pilihan === 'pwsh' ||
    pilihan === 'powershell' ||
    pilihan === 'default' ||
    pilihan === '' ||
    /powershell\.exe$|pwsh\.exe$/i.test(pilihan) ||
    /powershell\.exe$|pwsh\.exe$/i.test(eksplisit);
  if (!adalahPs) return null;

  return ['-NoLogo', '-NoExit', '-EncodedCommand', base64Utf16Le(SKRIP_PS1)];
}
