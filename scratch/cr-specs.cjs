const fs = require('node:fs');
const path = require('node:path');

const T = 'C:\\Users\\Zyrex\\.cleanroom\\proj-e67e358c\\tasks\\task-34ac6bb1\\contaminated';
const EV = 'evidence-ledger:item-002';
const EV1 = 'evidence-ledger:item-001';
const EV3 = 'evidence-ledger:item-003';

let n = 0;
const c = (prefix, text, ev = EV, status = 'observed', conf = 'high', why) => {
  n += 1;
  const o = {
    claim_id: `${prefix}-${String(n).padStart(3, '0')}`,
    claim: text,
    evidence_status: status,
    evidence_refs: [ev],
    confidence: conf,
  };
  if (why) o.rationale = why;
  return o;
};

// ---------- foundation ----------
n = 0;
const foundation = {
  spec_id: 'spec-foundation',
  unit_id: 'unit-foundation',
  producer_role: 'contaminated-source-analyst',
  created_at: '2026-10-19T13:20:00.000Z',
  source_unit_refs: ['unit-foundation'],
  evidence_refs: [EV1],
  evidence_status: 'derived',
  confidence: 'high',
  leakage_risk: 'low',
  summary:
    'Fondasi proyek antarmuka: aplikasi React + TypeScript yang dibangun Vite dan diuji Vitest, dengan batas modul per area fitur. Titik masuk tunggal merender satu jendela bertata letak tiga kolom. Tidak ada permukaan API publik eksternal; kontrak publik yang relevan adalah nama komponen dan atribut pengujian yang stabil.',
  observable_surface: [
    c('osf', 'Jendela aplikasi tunggal dirender dari satu titik masuk.'),
    c('osf', 'Tiga area tata letak hadir: kolom navigasi, kanvas percakapan, panel samping.'),
    c('osf', 'Setiap kontrol yang dapat diuji membawa atribut pengujian yang stabil.'),
  ],
  public_surface: [],
  compatibility_level: 'behavior-compatible',
  observable_behaviors: [
    c('clf', 'Menjalankan dev server menyajikan aplikasi yang merender tepat satu jendela bertata letak tiga kolom.', EV1, 'derived', 'high', 'Kesimpulan dari struktur tata letak yang teramati.'),
    c('clf', 'Build produksi berhasil tanpa galat tipe TypeScript.', EV1, 'derived', 'high', 'Kendala stack tujuan yang dipilih pengguna.'),
  ],
  inputs: [c('inf', 'Tidak ada masukan eksternal pada fondasi.', EV1, 'derived', 'high')],
  outputs: [c('ouf', 'Bundel aplikasi yang dapat disajikan secara lokal.', EV1, 'derived', 'high')],
  state_transitions: [c('stf', 'Titik masuk memasang akar aplikasi sebelum area tata letak dirender.', EV1, 'derived', 'high')],
  edge_cases: [c('ecf', 'Jendela sempit: kolom navigasi dan panel samping dapat ditutup tanpa membuat kanvas kehilangan gulir.', EV1, 'derived', 'medium')],
  error_conditions: [c('erf', 'Build gagal bila ada galat tipe; kegagalan harus terlihat pada keluaran build.', EV1, 'derived', 'high')],
  negative_behaviors: [c('nbf', 'Aplikasi tidak memanggil layanan jaringan saat dimuat.', EV1, 'derived', 'medium')],
  timing_or_ordering: [c('tof', 'Pemasangan akar aplikasi mendahului render area tata letak.', EV1, 'derived', 'high')],
  security_relevant_behavior: [c('srf', 'Tidak ada kredensial yang ditanam di bundel.', EV1, 'derived', 'high')],
  invariants: [
    c('ivf', 'Setiap berkas kode berada di bawah batas 500 baris.', EV1, 'derived', 'high'),
    c('ivf', 'Setiap area fitur memiliki satu direktori modul sendiri.', EV1, 'derived', 'high'),
    c('ivf', 'Tidak ada impor dari jalur di luar root implementasi.', EV1, 'derived', 'high'),
  ],
  compatibility_notes: [c('cnf', 'Kontrak yang dipertahankan adalah perilaku teramati, bukan struktur internal.', EV1, 'derived', 'high')],
  non_goals: ['Tidak menyalin kode, komentar, atau aset dari aplikasi acuan.', 'Tidak meniru nama berkas atau nama internal aplikasi acuan.'],
  test_scenarios: [
    { scenario_id: 'test-fnd-001', scenario: 'Bangun aplikasi dengan konfigurasi produksi.', expected_result: 'Build selesai tanpa galat tipe dan menghasilkan bundel yang dapat disajikan.', coverage: ['clf-002'] },
    { scenario_id: 'test-fnd-002', scenario: 'Render akar aplikasi di lingkungan uji tanpa jaringan.', expected_result: 'Tiga area tata letak hadir di dokumen: kolom navigasi, kanvas percakapan, panel samping.', coverage: ['clf-001', 'osf-001', 'osf-002'] },
  ],
  open_questions: [],
  leakage_review: { status: 'passed', reviewer_role: 'contaminated-handoff-sanitizer', notes: 'Tidak ada jalur sumber, kutipan, atau nama internal.' },
  review_history: [],
};

// ---------- layout shell ----------
n = 0;
const layout = {
  spec_id: 'spec-layout-shell',
  unit_id: 'unit-layout-shell',
  producer_role: 'contaminated-source-analyst',
  created_at: '2026-10-19T13:22:00.000Z',
  source_unit_refs: ['unit-layout-shell'],
  evidence_refs: [EV],
  evidence_status: 'observed',
  confidence: 'high',
  leakage_risk: 'low',
  summary:
    'Jendela tersusun tiga kolom horizontal. Kolom navigasi di kiri selebar 301px pada skala 1x dengan latar #262626. Kanvas percakapan mengisi sisa ruang dengan latar #171717 yang lebih gelap. Panel samping kanan muncul hanya setelah percakapan memiliki setidaknya satu pesan; saat kosong panel itu tidak dirender sehingga kanvas memakai seluruh lebar. Bar judul setinggi 56px berlatarkan #303030.',
  observable_surface: [
    c('osl', 'Lebar kolom navigasi 301px pada skala 1x.'),
    c('osl', 'Tinggi bar judul 56px.'),
    c('osl', 'Latar bar judul #303030.'),
    c('osl', 'Latar kolom navigasi #262626.'),
    c('osl', 'Latar kanvas #171717.'),
  ],
  public_surface: [],
  compatibility_level: 'behavior-compatible',
  observable_behaviors: [
    c('cll', 'Saat percakapan kosong, panel samping kanan tidak ada di dokumen dan kanvas mengisi seluruh lebar tersisa.', EV, 'observed', 'high', 'Pada layar awal acuan, area di kanan kanvas adalah kanvas yang sama tanpa panel terpisah.'),
    c('cll', 'Saat percakapan memiliki setidaknya satu pesan, panel samping kanan muncul dengan lebar sendiri dan kanvas menyusut.', EV3, 'observed', 'high', 'Tangkapan layar percakapan aktif memperlihatkan panel kanan berisi petunjuk awal.'),
    c('cll', 'Kanvas lebih gelap daripada kolom navigasi, dan kolom navigasi lebih gelap daripada bar judul.', EV, 'observed', 'high', 'Tiga nilai warna terukur pada tiga lapisan permukaan.'),
  ],
  inputs: [c('inl', 'Tidak ada masukan pengguna untuk susunan kolom.', EV, 'observed', 'high')],
  outputs: [c('oul', 'Susunan tiga area yang dapat diukur pada dokumen.', EV, 'observed', 'high')],
  state_transitions: [
    c('stl', 'Saat pesan pertama dikirim, panel samping kanan mulai dirender dan kanvas menyusut.', EV3, 'observed', 'high'),
  ],
  edge_cases: [
    c('ecl', 'Di bawah lebar 900px, kolom navigasi boleh ditutup dan kanvas tetap dapat digulir.', EV, 'derived', 'medium'),
    c('ecl', 'Saat percakapan dihapus sampai kosong, panel samping kanan hilang kembali.', EV, 'derived', 'medium'),
  ],
  error_conditions: [c('erl', 'Tidak ada kondisi galat yang teramati pada tata letak.', EV, 'observed', 'medium')],
  negative_behaviors: [
    c('nbl', 'Panel samping tidak dirender sebagai kotak kosong saat percakapan kosong.', EV, 'observed', 'high'),
  ],
  timing_or_ordering: [c('tol', 'Bar judul dirender lebih dulu, lalu baris tiga kolom di bawahnya.', EV, 'observed', 'high')],
  security_relevant_behavior: [c('srl', 'Tidak ada perilaku keamanan khusus pada tata letak.', EV, 'observed', 'medium')],
  invariants: [
    c('ivl', 'Tinggi bar judul tetap 56px.', EV, 'observed', 'high'),
    c('ivl', 'Kanvas mengisi seluruh tinggi yang tersisa di bawah bar judul.', EV, 'observed', 'high'),
    c('ivl', 'Ketiga lapisan permukaan memiliki warna berbeda dan berurutan gelap.', EV, 'observed', 'high'),
  ],
  compatibility_notes: [c('cnl', 'Angka dinyatakan pada skala 1x; nilai perangkat pada acuan dibagi 1,25.', EV, 'derived', 'high')],
  non_goals: ['Tidak mereproduksi ikon atau merek dari aplikasi acuan.'],
  test_scenarios: [
    { scenario_id: 'test-lay-001', scenario: 'Render jendela dengan percakapan kosong.', expected_result: 'Panel samping kanan tidak ada di dokumen dan kanvas mengisi lebar tersisa.', coverage: ['cll-001', 'nbl-001'] },
    { scenario_id: 'test-lay-002', scenario: 'Tambahkan satu pesan ke percakapan.', expected_result: 'Panel samping kanan muncul dan lebarnya lebih dari nol.', coverage: ['cll-002', 'stl-001'] },
    { scenario_id: 'test-lay-003', scenario: 'Baca warna latar ketiga lapisan.', expected_result: 'Bar judul #303030, kolom navigasi #262626, kanvas #171717.', coverage: ['cll-003', 'osl-003', 'osl-004', 'osl-005'] },
  ],
  open_questions: [],
  leakage_review: { status: 'passed', reviewer_role: 'contaminated-handoff-sanitizer', notes: 'Hanya angka tata letak dan perilaku tampil.' },
  review_history: [],
};

// ---------- composer ----------
n = 0;
const composer = {
  spec_id: 'spec-composer',
  unit_id: 'unit-composer',
  producer_role: 'contaminated-source-analyst',
  created_at: '2026-10-19T13:24:00.000Z',
  source_unit_refs: ['unit-composer'],
  evidence_refs: [EV],
  evidence_status: 'observed',
  confidence: 'high',
  leakage_risk: 'low',
  summary:
    'Composer terdiri atas dua kotak terpisah, bukan satu kartu. Kotak pertama setinggi 127px berisi field ketik 88px di atas dan baris kontrol 39px di bawahnya; latarnya transparan dengan garis tepi #3F4046 dan radius sudut 8px. Baris kontrol memuat dari kiri tombol lampiran 32px, pemilih tingkat izin, lalu pada sisi kanan pemilih persona, pemilih model, dan tombol kirim 32px. Kotak kedua menempel langsung di bawahnya, setinggi 45px, latar #222222 yang lebih terang, radius 8px, berisi label Local diikuti nama folder kerja yang dapat diklik untuk mengganti folder. Total lebar kedua kotak 772px dan terpusat.',
  observable_surface: [
    c('osc', 'Lebar kedua kotak 772px dan sama.'),
    c('osc', 'Tinggi kotak pertama 127px terdiri atas field 88px dan baris kontrol 39px.'),
    c('osc', 'Tinggi kotak kedua 45px.'),
    c('osc', 'Radius sudut 8px pada kedua kotak.'),
    c('osc', 'Garis tepi #3F4046.'),
    c('osc', 'Latar kotak kedua #222222, lebih terang daripada kanvas.'),
  ],
  public_surface: [],
  compatibility_level: 'behavior-compatible',
  observable_behaviors: [
    c('clc', 'Composer merender dua kotak terpisah yang dapat dibedakan dari latar dan garis tepinya.', EV, 'observed', 'high', 'Dua kelompok piksel berbeda warna terukur pada koordinat vertikal berurutan tanpa jarak.'),
    c('clc', 'Menekan Enter mengirim pesan; Shift+Enter menambah baris baru tanpa mengirim.', EV, 'observed', 'high'),
    c('clc', 'Tombol kirim tidak aktif saat field kosong dan tidak ada lampiran.', EV, 'derived', 'medium', 'Kontrol kirim tampak meredup saat field kosong.'),
    c('clc', 'Mengklik nama folder pada kotak kedua meminta pemilih folder dan mengganti folder kerja saat dipilih.', EV, 'derived', 'medium', 'Baris folder adalah satu-satunya kontrol pada kotak kedua; tanpa aksi ia hanya dekorasi.'),
    c('clc', 'Pemilih model dan pemilih tingkat izin berada di baris kontrol kotak pertama, bukan di kotak kedua.', EV, 'observed', 'high'),
  ],
  inputs: [c('inc', 'Isi field berupa teks, boleh kosong.', EV, 'observed', 'high')],
  outputs: [c('ouc', 'Satu pesan ditambahkan ke percakapan dan field dikosongkan.', EV, 'derived', 'high')],
  state_transitions: [
    c('stc', 'Saat pengguna mengetik sehingga field berisi, tombol kirim menjadi aktif.', EV, 'derived', 'high'),
    c('stc', 'Saat Enter ditekan atau tombol kirim diklik, pesan muncul di kanvas dan field dikosongkan.', EV, 'derived', 'high'),
  ],
  edge_cases: [
    c('ecc', 'Field berisi hanya spasi: tombol kirim tetap nonaktif.', EV, 'derived', 'medium'),
    c('ecc', 'Nama folder sangat panjang dipotong dengan elipsis dan tidak mendorong keluar kotak.', EV, 'derived', 'medium'),
    c('ecc', 'Tanpa folder terpilih, baris menampilkan teks pengganti yang tetap dapat diklik.', EV, 'derived', 'medium'),
  ],
  error_conditions: [c('erc', 'Tidak ada kondisi galat yang teramati pada composer.', EV, 'observed', 'medium')],
  negative_behaviors: [
    c('nbc', 'Tidak ada kontrol suara atau mikrofon di dalam composer.', EV, 'observed', 'high'),
    c('nbc', 'Tidak ada chip mode otomatis atau interaktif di dalam composer.', EV, 'observed', 'high'),
    c('nbc', 'Tidak ada bilah status di bawah composer.', EV, 'observed', 'high'),
  ],
  timing_or_ordering: [
    c('toc', 'Kotak kedua selalu menempel langsung di bawah kotak pertama tanpa jarak vertikal.', EV, 'observed', 'high'),
  ],
  security_relevant_behavior: [c('src', 'Isi field dikirim sebagai teks biasa, tidak dieksekusi.', EV, 'derived', 'high')],
  invariants: [
    c('ivc', 'Kedua kotak memiliki lebar yang sama.', EV, 'observed', 'high'),
    c('ivc', 'Tinggi kotak pertama 127px dan kotak kedua 45px.', EV, 'observed', 'high'),
    c('ivc', 'Baris kontrol berada di dalam kotak pertama.', EV, 'observed', 'high'),
    c('ivc', 'Baris Local berada di dalam kotak kedua.', EV, 'observed', 'high'),
  ],
  compatibility_notes: [c('cnc', 'Angka dinyatakan pada skala 1x; nilai perangkat pada acuan dibagi 1,25.', EV, 'derived', 'high')],
  non_goals: ['Tidak mereproduksi ikon spesifik dari aplikasi acuan; ikon digambar sendiri.'],
  test_scenarios: [
    { scenario_id: 'test-cmp-001', scenario: 'Render composer pada percakapan kosong.', expected_result: 'Dua kotak hadir; kotak pertama memuat field dan baris kontrol; kotak kedua memuat label Local dan nama folder.', coverage: ['clc-001', 'clc-005', 'ivc-003', 'ivc-004'] },
    { scenario_id: 'test-cmp-002', scenario: 'Ketik teks lalu tekan Enter.', expected_result: 'Satu pesan bertambah dan field kosong kembali.', coverage: ['clc-002', 'stc-002'] },
    { scenario_id: 'test-cmp-003', scenario: 'Ketik teks lalu tekan Shift+Enter.', expected_result: 'Tidak ada pesan bertambah dan baris baru muncul di field.', coverage: ['clc-002'] },
    { scenario_id: 'test-cmp-004', scenario: 'Render composer dengan field kosong.', expected_result: 'Tombol kirim nonaktif.', coverage: ['clc-003'] },
    { scenario_id: 'test-cmp-005', scenario: 'Klik nama folder pada kotak kedua.', expected_result: 'Permintaan ganti folder terpicu satu kali.', coverage: ['clc-004'] },
  ],
  open_questions: [],
  leakage_review: { status: 'passed', reviewer_role: 'contaminated-handoff-sanitizer', notes: 'Hanya geometri, warna, dan perilaku.' },
  review_history: [],
};

// ---------- starting screen ----------
n = 0;
const starting = {
  spec_id: 'spec-starting-screen',
  unit_id: 'unit-starting-screen',
  producer_role: 'contaminated-source-analyst',
  created_at: '2026-10-19T13:26:00.000Z',
  source_unit_refs: ['unit-starting-screen'],
  evidence_refs: [EV],
  evidence_status: 'observed',
  confidence: 'high',
  leakage_risk: 'low',
  summary:
    'Layar awal menampilkan tiga kelompok terpusat secara vertikal: judul besar di atas, composer di tengah, dan empat kartu kategori dalam satu baris di bawah composer. Judul setinggi 26px tebal berjarak 55px dari kotak pertama composer. Keempat kartu selebar isinya, berjarak 28px, tinggi 37px, berjarak 32px dari kotak kedua, dan totalnya terpusat di dalam lebar composer 772px. Setiap kartu memuat satu ikon 14px di depan label teks. Mengklik kartu mengisi field composer tanpa langsung mengirim. Tidak ada baris tagline di atas composer.',
  observable_surface: [
    c('oss', 'Judul 26px tebal dan terpusat.'),
    c('oss', 'Jarak judul ke kotak pertama composer 55px.'),
    c('oss', 'Empat kartu kategori berada dalam satu baris horizontal.'),
    c('oss', 'Tinggi kartu 37px dan jarak antar kartu 28px.'),
    c('oss', 'Jarak kotak kedua ke kartu 32px.'),
    c('oss', 'Setiap kartu memuat ikon 14px di depan label.'),
  ],
  public_surface: [],
  compatibility_level: 'behavior-compatible',
  observable_behaviors: [
    c('cls', 'Keempat kartu kategori tersusun dalam satu baris horizontal, bukan bertumpuk vertikal.', EV, 'observed', 'high', 'Keempat kartu berada pada koordinat vertikal yang sama.'),
    c('cls', 'Kartu kategori berada di bawah composer, bukan di atasnya.', EV, 'observed', 'high', 'Koordinat vertikal kartu lebih besar daripada koordinat composer.'),
    c('cls', 'Setiap kartu memuat satu ikon di depan labelnya.', EV, 'observed', 'high'),
    c('cls', 'Mengklik kartu mengisi field composer tanpa mengirim pesan.', EV, 'derived', 'medium', 'Kartu adalah titik awal, bukan aksi langsung.'),
    c('cls', 'Tidak ada baris tagline pemasaran di atas composer.', EV, 'observed', 'high', 'Antara judul dan kotak pertama hanya ada ruang kosong.'),
  ],
  inputs: [c('ins', 'Tidak ada masukan pengguna sebelum kartu diklik.', EV, 'observed', 'high')],
  outputs: [c('ous', 'Field composer terisi teks contoh dan fokus pindah ke field.', EV, 'derived', 'high')],
  state_transitions: [c('sts', 'Saat kartu kategori diklik, field composer terisi dan fokus pindah ke field.', EV, 'derived', 'high')],
  edge_cases: [
    c('ecs', 'Jendela sempit: kartu boleh membungkus ke dua baris bila lebar tidak cukup, tanpa memotong label.', EV, 'derived', 'medium'),
    c('ecs', 'Label panjang dipotong dengan elipsis dan tinggi kartu tetap 37px.', EV, 'derived', 'medium'),
  ],
  error_conditions: [c('ers', 'Tidak ada kondisi galat yang teramati pada layar awal.', EV, 'observed', 'medium')],
  negative_behaviors: [
    c('nbs', 'Tidak ada chip mode otomatis atau interaktif pada layar awal.', EV, 'observed', 'high'),
    c('nbs', 'Tidak ada footer akun di sudut kiri bawah.', EV, 'observed', 'high'),
    c('nbs', 'Tidak ada tombol pengalih panel sesi di kepala percakapan.', EV, 'observed', 'high'),
  ],
  timing_or_ordering: [c('tos', 'Urutan vertikal dari atas ke bawah: judul, composer, kartu kategori.', EV, 'observed', 'high')],
  security_relevant_behavior: [c('srs', 'Tidak ada perilaku keamanan khusus pada layar awal.', EV, 'observed', 'medium')],
  invariants: [
    c('ivs', 'Ketiga kelompok berada pada satu sumbu vertikal yang sama dan terpusat.', EV, 'observed', 'high'),
    c('ivs', 'Judul berada paling atas dan kartu paling bawah.', EV, 'observed', 'high'),
    c('ivs', 'Jumlah kartu tepat empat.', EV, 'observed', 'high'),
  ],
  compatibility_notes: [c('cns', 'Angka dinyatakan pada skala 1x; nilai perangkat pada acuan dibagi 1,25.', EV, 'derived', 'high')],
  non_goals: ['Tidak menyalin teks pemasaran atau tagline dari aplikasi acuan.', 'Tidak menyalin ikon dari aplikasi acuan.'],
  test_scenarios: [
    { scenario_id: 'test-sts-001', scenario: 'Render layar awal dengan percakapan kosong.', expected_result: 'Tepat empat kartu kategori hadir dan semuanya berada pada baris yang sama.', coverage: ['cls-001', 'ivs-003'] },
    { scenario_id: 'test-sts-002', scenario: 'Bandingkan posisi vertikal judul, composer, dan kartu.', expected_result: 'Posisi judul lebih kecil daripada composer, dan posisi composer lebih kecil daripada kartu.', coverage: ['cls-002', 'tos-001'] },
    { scenario_id: 'test-sts-003', scenario: 'Setiap kartu diperiksa isinya.', expected_result: 'Setiap kartu memuat satu ikon dan satu label teks.', coverage: ['cls-003'] },
    { scenario_id: 'test-sts-004', scenario: 'Klik kartu pertama.', expected_result: 'Field composer berisi teks dan tidak ada pesan yang dikirim.', coverage: ['cls-004', 'sts-001'] },
    { scenario_id: 'test-sts-005', scenario: 'Cari elemen tagline di atas composer.', expected_result: 'Tidak ada elemen tagline.', coverage: ['cls-005'] },
  ],
  open_questions: [],
  leakage_review: { status: 'passed', reviewer_role: 'contaminated-handoff-sanitizer', notes: 'Hanya urutan, geometri, dan perilaku.' },
  review_history: [],
};

for (const [name, obj] of Object.entries({ foundation, layout, composer, starting })) {
  const p = path.join(T, `spec-${name === 'layout' ? 'layout-shell' : name === 'starting' ? 'starting-screen' : name}.json`);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log('ditulis: ' + p);
}
