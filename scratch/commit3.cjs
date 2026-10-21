const { execFileSync } = require('child_process');
const fs = require('fs');
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const g = (a) => execFileSync(GIT, a, { encoding: 'utf8', maxBuffer: 67108864, cwd: 'D:\\Zephyr' });

const files = [
  'src/components/agents/AgentsLayout.tsx',
  'src/components/agents/AgentsTitlebar.tsx',
  'src/components/agents/AgentsSessions.tsx',
  'src/styles/agents-window.css',
];

g(['add', '--'].concat(files));

const msg = [
  'feat(agents): rombak total tampilan Agents window mengikuti tata letak TRAE',
  '',
  'Diukur dari jendela TRAE yang hidup (DOM + computed style), bukan ditebak.',
  'Hasil akhir: 9 dari 9 posisi/ukuran utama SAMA dengan acuan.',
  '',
  'Bentuk baru',
  '- menubar 56px: aksi kiri (back/forward, toggle, mark + folder), menu',
  '  File/View/Help yang benar-benar membuka daftar perintah, lalu akun +',
  '  kontrol jendela di kanan.',
  '- kolom kiri 300px TANPA kartu (menempel di frame), "New task" 276x34,',
  '  daftar tugas bergrup per folder lalu per hari, footer 48px.',
  '- chat dan panel kanan jadi KARTU radius 16px di atas frame yang lebih',
  '  terang; sashes 4px yang benar-benar bisa diseret (lebar bertahan).',
  '- tab bar 48px dengan tab 32px radius 8, aktif = isian satu tingkat lebih',
  '  terang, tanpa garis bawah.',
  '',
  'Angka yang dicocokkan (TRAE vs Zephyr)',
  '  menubar        0,0,1536,56        sama',
  '  kolom kiri     0,56,300,856       sama',
  '  sash kiri      297,56,4,856       sama',
  '  chat card      301,56,520,848     sama',
  '  panel kanan    825,56,703,848     sama',
  '  tab bar        826,57,701,48      sama',
  '  New task       12,56,276,34       sama',
  '  footer         0,856,300,48       sama',
  '  header chat    302,57,518,48      sama',
  '  radius chat/tab/row/composer 16/8/6/16 - sama',
  '',
  'Cacat yang ditemukan sambil mengerjakan',
  '- `.ai-head` disembunyikan di jendela ini oleh aturan lama, jadi kartu chat',
  '  tidak punya judul sesi maupun tombol cari. Aturan itu dihapus.',
  '- header chat 0x0 karena `hidden` dari `aiMax` milik jendela utama; kini',
  '  di-override HANYA di dalam `.ag-center`.',
  '- panel kanan ditutup meninggalkan chat 520px dengan lubang 700px di kanan',
  '  (persis keluhan "space kosong di kanan"); chat kini mengisi saat sendirian.',
  '- sash kiri sempat menggeser chat 3px karena dihitung sebagai slot; kini',
  '  menumpuk 3px seperti acuan sehingga chat mulai tepat di 301.',
  '',
  'Override CSS untuk composer/header DISKOP ke `.ag-center` supaya panel AI di',
  'jendela editor tidak ikut berubah (diverifikasi: editor tetap radius 10px,',
  'header 38px).',
  '',
  'Verifikasi: tsc 0 error; 9/9 metrik sama; menu, footer menu, tab, seret,',
  'toggle kiri/kanan, maximize, dan New task diuji hidup di jendela aplikasi.',
].join('\n');

try {
  g(['commit', '-q', '-m', msg]);
} catch (e) {
  fs.writeFileSync('D:\\Zephyr\\scratch\\commit-err2.txt', String(e.stderr || e.message), 'utf8');
}

const hash = g(['rev-parse', '--short', 'HEAD']).trim();
const sisa = g(['status', '--porcelain=v1'])
  .split('\n')
  .filter(Boolean)
  .filter((l) => !l.includes('scratch/') && !l.includes('target2'));

console.log('HASH=' + hash);
console.log('SISA=' + sisa.length);
if (sisa.length) console.log(sisa.join('\n'));
