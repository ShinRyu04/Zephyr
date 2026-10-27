<#
.SYNOPSIS
  Daftarkan Zephyr sebagai "Open with" untuk berkas teks/kode dan untuk folder.

.DESCRIPTION
  Kenapa lewat skrip dan bukan `tauri.conf.json`: menambah `fileAssociations` di
  sana mengubah ARTEFAK build, dan rilis 1.1.15 sudah dibangun serta dipakai
  latest.json. Asosiasi lewat registry bisa dipasang/dilepas tanpa menyentuh
  satu pun berkas rilis.

  Kenapa HKCU saja: seluruh kunci di bawah `HKCU:\Software\Classes` milik user
  yang sedang login, jadi tidak perlu admin dan tidak mengubah pilihan pengguna
  lain di mesin yang sama. Skrip ini tidak pernah meminta elevasi.

  Kenapa `OpenWithProgids` dan bukan nilai `(Default)` tiap ekstensi: nilai itu
  menunjuk program PEMBUKA UTAMA, dan menimpanya berarti merebut .md dari VS Code
  / Zed / TRAE tanpa bertanya. `OpenWithProgids` hanya MENAMBAH satu pilihan di
  menu "Open with"; pemilik lamanya tidak tersentuh.

  Yang TIDAK disentuh (sengaja): nilai apa pun milik ProgId lain - VSCode.md,
  Zed.md, Qoder.md, Trae.md, Orca.Markdown - dan kunci `Classes\<ext>` selain
  subkunci `OpenWithProgids` milik Zephyr.

.PARAMETER Pasang
  Daftarkan ProgId, OpenWithProgids untuk seluruh ekstensi, entri Applications,
  dan menu "Open with Zephyr" pada klik-kanan folder serta latar folder.
  Idempoten: boleh dijalankan berkali-kali.

.PARAMETER Lepas
  Hapus SEMUA yang dipasang skrip ini, dan hanya itu. Subkunci OpenWithProgids
  yang jadi kosong ikut dibuang; yang masih berisi ProgId lain dibiarkan.

.PARAMETER Status
  Cetak keadaan sekarang: exe yang terdeteksi, ProgId, jumlah ekstensi terdaftar,
  dan entri menu folder. Tidak mengubah apa pun.

.PARAMETER Exe
  Path zephyr.exe yang dipakai. Kosong = dideteksi sendiri (lihat Baca-ExeTerpasang).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\asosiasi-zephyr.ps1 -Status
  powershell -ExecutionPolicy Bypass -File scripts\asosiasi-zephyr.ps1 -Pasang
  powershell -ExecutionPolicy Bypass -File scripts\asosiasi-zephyr.ps1 -Lepas
#>
[CmdletBinding()]
param(
  [switch]$Pasang,
  [switch]$Lepas,
  [switch]$Status,
  [string]$Exe
)

$ErrorActionPreference = 'Stop'

# ProgId dipatok ke ".md" walau ia dipakai untuk semua ekstensi di bawah: nama ini
# sudah dipakai rilis sebelumnya, dan menggantinya hanya membuat pendaftaran lama
# (kalau ada) tertinggal sebagai entri yatim di OpenWithProgids.
$ProgId = 'Zephyr.md'
$NamaTampil = 'Zephyr'
$Label = 'Open with Zephyr'
$Kelas = 'HKCU:\Software\Classes'
$KeyProgId = Join-Path $Kelas $ProgId
$KeyAplikasi = Join-Path $Kelas 'Applications\zephyr.exe'

# Semua umum, mengikuti cakupan yang dipakai VS Code. Berkas yang paling sering
# dibuka dari Explorer dengan cara "Open with".
$Ekstensi = @(
  '.md', '.txt', '.json', '.jsonc', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.less', '.html', '.xml', '.yml', '.yaml', '.toml', '.ini',
  '.env', '.py', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
  '.php', '.rb', '.lua', '.sh', '.ps1', '.bat', '.sql', '.log', '.csv',
  '.gitignore', '.editorconfig'
)

function Baca-ExeTerpasang {
  <#
    Urutan pencariannya sengaja: registry dulu, karena itu satu-satunya sumber
    yang tahu di mana PENGGUNA memasang Zephyr (bisa D:, bisa C:). `DisplayIcon`
    dan `MainBinaryName` ikut dibaca karena NSIS mengisi `InstallLocation` sebagai
    DIREKTORI, sedangkan dua nilai lain itu menunjuk berkasnya langsung - kalau
    bentuknya berubah di rilis berikutnya, skrip ini tetap menemukannya.
  #>
  $kandidatKunci = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Zephyr',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Zephyr',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Zephyr'
  )
  foreach ($kunci in $kandidatKunci) {
    if (-not (Test-Path $kunci)) { continue }
    $isi = Get-ItemProperty -Path $kunci -ErrorAction SilentlyContinue
    foreach ($nilai in @($isi.InstallLocation, $isi.DisplayIcon, $isi.MainBinaryName)) {
      if (-not $nilai) { continue }
      # NSIS menulis nilai ini BERKUTIP (REG_SZ: "D:\Desktop\Zephyr"), dan jalur
      # berkutip tidak pernah cocok dengan Test-Path.
      $jalur = ([string]$nilai).Replace('"', '').Trim()
      if (-not $jalur) { continue }
      if (Test-Path -LiteralPath $jalur -PathType Container) {
        $berkas = Join-Path $jalur 'zephyr.exe'
        if (Test-Path -LiteralPath $berkas -PathType Leaf) { return (Resolve-Path -LiteralPath $berkas).Path }
      } elseif (Test-Path -LiteralPath $jalur -PathType Leaf) {
        return (Resolve-Path -LiteralPath $jalur).Path
      }
    }
  }
  return $null
}

function Pilih-Exe {
  if ($Exe) {
    if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) {
      throw "-Exe menunjuk berkas yang tidak ada: $Exe"
    }
    return (Resolve-Path -LiteralPath $Exe).Path
  }
  $terpasang = Baca-ExeTerpasang
  if ($terpasang) { return $terpasang }
  $cadangan = Join-Path $env:LOCALAPPDATA 'Programs\Zephyr\bin\zephyr.exe'
  if (Test-Path -LiteralPath $cadangan -PathType Leaf) {
    return (Resolve-Path -LiteralPath $cadangan).Path
  }
  throw @"
zephyr.exe tidak ditemukan.
  Sudah dicoba: registry Uninstall\Zephyr (InstallLocation/DisplayIcon), lalu
  $cadangan
  Pasang rilisnya lebih dulu, atau sebut path-nya: -Exe "D:\path\ke\zephyr.exe"
"@
}

function Pastikan-Kunci {
  param([string]$Path)
  <#
    Kunci dibuat SEGMEN PER SEGMEN, dan yang sudah ada TIDAK disentuh.

    `New-Item -Force` pada provider registry bukan "buat kalau belum ada": ia
    membuat ulang kuncinya, dan nilai-nilai yang sudah ada di situ HILANG.
    Terbukti waktu skrip ini pertama dijalankan - (Default) `Zephyr.md` kosong
    karena kunci induknya dibuat ulang saat menulis DefaultIcon, dan
    `SupportedTypes` hanya menyisakan satu nilai (yang terakhir) karena tiap
    ekstensi membuat ulang kuncinya. Karena itu yang dipakai bukan -Force,
    melainkan pemeriksaan per segmen.
  #>
  $segmen = $Path.Split([char]92)
  $jalan = $segmen[0]
  for ($i = 1; $i -lt $segmen.Count; $i++) {
    $jalan = $jalan + [char]92 + $segmen[$i]
    if (-not (Test-Path -LiteralPath $jalan)) { New-Item -Path $jalan | Out-Null }
  }
}

function Tulis-Nilai {
  param([string]$Path, [string]$Name, [string]$Value)
  Pastikan-Kunci -Path $Path
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType String -Force | Out-Null
}

function Tulis-Default {
  param([string]$Path, [string]$Value)
  Pastikan-Kunci -Path $Path
  # Lewat nama '(default)', bukan `Set-Item -Value`: bentuk itu yang jelas
  # menyatakan "ini nilai bawaan kunci", dan jenisnya ikut dituliskan.
  Set-ItemProperty -Path $Path -Name '(default)' -Value $Value -Type String
}

function Pasang-Asosiasi {
  $exe = Pilih-Exe
  # Dijadikan variabel, BUKAN ditulis inline sebagai `-Value '"' + $exe + '...'`:
  # dalam mode argumen PowerShell tidak mengenal operator '+', jadi nilai yang
  # tersimpan cuma tanda kutip pertama (terbukti: command jadi '"').
  $perintah = '"' + $exe + '" "%1"'
  Write-Host "exe: $exe"

  # 1. ProgId: nama yang muncul di menu, ikonnya, dan perintah buka berkas.
  Tulis-Default -Path $KeyProgId -Value 'Zephyr Markdown'
  Tulis-Nilai -Path $KeyProgId -Name 'DefaultIcon' -Value ('"' + $exe + '",0')
  Tulis-Default -Path (Join-Path $KeyProgId 'shell\open\command') -Value $perintah

  # 2. OpenWithProgids per ekstensi: MENAMBAH pilihan, tidak merebut pemiliknya.
  $terdaftar = 0
  foreach ($ext in $Ekstensi) {
    $keyOwp = Join-Path (Join-Path $Kelas $ext) 'OpenWithProgids'
    New-Item -Path $keyOwp -Force | Out-Null
    # Nilainya sengaja KOSONG: yang dibaca Windows adalah NAMA nilainya (ProgId),
    # bukan isinya.
    New-ItemProperty -Path $keyOwp -Name $ProgId -Value '' -PropertyType String -Force | Out-Null
    $terdaftar++
  }
  Write-Host "OpenWithProgids terdaftar di $terdaftar ekstensi"

  # 3. Applications: supaya "Open with > Choose another app" mengenali Zephyr
  #    beserta tipe berkas yang didukungnya.
  Tulis-Nilai -Path $KeyAplikasi -Name 'FriendlyAppName' -Value $NamaTampil
  Tulis-Default -Path (Join-Path $KeyAplikasi 'shell\open\command') -Value $perintah
  foreach ($ext in $Ekstensi) {
    Tulis-Nilai -Path (Join-Path $KeyAplikasi 'SupportedTypes') -Name $ext -Value ''
  }

  # 4. Klik-kanan folder. `%1` = folder yang diklik, `%V` = folder yang sedang
  #    dibuka (klik-kanan di latar dalam folder).
  $keyFolder = Join-Path $Kelas 'Directory\shell\Zephyr'
  Tulis-Default -Path $keyFolder -Value $Label
  Tulis-Default -Path (Join-Path $keyFolder 'command') -Value $perintah

  $keyLatar = Join-Path $Kelas 'Directory\Background\shell\Zephyr'
  Tulis-Default -Path $keyLatar -Value $Label
  # '%V' = folder yang SEDANG dibuka, bukan yang diklik: klik-kanan di latar
  # dalam sebuah folder harus membuka folder ITU.
  Tulis-Default -Path (Join-Path $keyLatar 'command') -Value ('"' + $exe + '" "%V"')

  Write-Host 'SELESAI. Cek dengan: -Status'
}

function Hapus-Kunci {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item -Path $Path -Recurse -Force
    Write-Host "dihapus: $Path"
  }
}

function Lepas-Asosiasi {
  Hapus-Kunci -Path $KeyProgId
  Hapus-Kunci -Path $KeyAplikasi

  # Subkunci OpenWithProgids hanya dibuang kalau benar-benar kosong. Kalau
  # penerap lain menaruh ProgId-nya di situ, membuang seluruh kunci akan
  # menghapus pilihan MEREKA juga.
  $sisa = 0
  foreach ($ext in $Ekstensi) {
    $keyExt = Join-Path $Kelas $ext
    $keyOwp = Join-Path $keyExt 'OpenWithProgids'
    if (-not (Test-Path $keyOwp)) { continue }
    $prop = Get-ItemProperty -Path $keyOwp -ErrorAction SilentlyContinue
    if ($prop -and ($prop.PSObject.Properties.Name -contains $ProgId)) {
      Remove-ItemProperty -Path $keyOwp -Name $ProgId -Force
    }
    $sisaProps = @((Get-Item -Path $keyOwp).Property | Where-Object { $_ }).Count
    $sisaAnak = (Get-ChildItem -Path $keyOwp -ErrorAction SilentlyContinue | Measure-Object).Count
    if ($sisaProps -eq 0 -and $sisaAnak -eq 0) {
      Remove-Item -Path $keyOwp -Force
      $sisa++
    }
  }
  Write-Host "OpenWithProgids kosong yang dibuang: $sisa"

  Hapus-Kunci -Path (Join-Path $Kelas 'Directory\shell\Zephyr')
  Hapus-Kunci -Path (Join-Path $Kelas 'Directory\Background\shell\Zephyr')
  Write-Host 'SELESAI. Sisanya (VSCode/Zed/TRAE/Qoder/Orca) tidak disentuh.'
}

function Tampilkan-Status {
  try {
    $exe = Pilih-Exe
    Write-Host "exe terdeteksi    : $exe"
  } catch {
    Write-Host "exe terdeteksi    : TIDAK ADA ($($_.Exception.Message.Split([char]10)[0]))"
  }
  Write-Host "ProgId            : $(if (Test-Path $KeyProgId) { 'ADA' } else { 'tidak ada' }) ($ProgId)"
  Write-Host "Applications      : $(if (Test-Path $KeyAplikasi) { 'ADA' } else { 'tidak ada' })"

  $ada = @()
  foreach ($ext in $Ekstensi) {
    $keyOwp = Join-Path (Join-Path $Kelas $ext) 'OpenWithProgids'
    if (-not (Test-Path $keyOwp)) { continue }
    $prop = Get-ItemProperty -Path $keyOwp -ErrorAction SilentlyContinue
    if ($prop -and ($prop.PSObject.Properties.Name -contains $ProgId)) { $ada += $ext }
  }
  Write-Host "OpenWithProgids   : $($ada.Count)/$($Ekstensi.Count) ekstensi"
  Write-Host "                    $($ada -join ' ')"
  $kurang = $Ekstensi | Where-Object { $ada -notcontains $_ }
  if ($kurang.Count) { Write-Host "belum terdaftar   : $($kurang -join ' ')" }

  Write-Host "menu folder       : $(if (Test-Path (Join-Path $Kelas 'Directory\shell\Zephyr')) { 'ADA' } else { 'tidak ada' })"
  Write-Host "menu latar folder: $(if (Test-Path (Join-Path $Kelas 'Directory\Background\shell\Zephyr')) { 'ADA' } else { 'tidak ada' })"

  # Bukti bahwa pendaftaran ini TIDAK merebut pemilik sebelumnya.
  $mdDefault = (Get-ItemProperty -Path (Join-Path $Kelas '.md') -ErrorAction SilentlyContinue).'(default)'
  if ($mdDefault) { Write-Host "pembuka .md utama: $mdDefault (tidak diubah)" }
}

if ($Pasang) {
  Pasang-Asosiasi
} elseif ($Lepas) {
  Lepas-Asosiasi
} elseif ($Status) {
  Tampilkan-Status
} else {
  Write-Host 'Pilih satu: -Pasang | -Lepas | -Status  (opsional: -Exe "<path zephyr.exe>")'
}
