/*
 * Kunci kamus untuk setting General yang baru (confirmExit, minimizeToTray,
 * defaultTerminal, shellPath).
 *
 * Konvensi berkas ini: KUNCI = kalimat sumber (Inggris), nilai = terjemahan.
 * Kamus ID mendapat teks Indonesia karena itulah bahasa aslinya.
 *
 * Penjaga: MELEMPAR kalau ada kamus tanpa terjemahan. Menambah ke sebagian
 * kamus adalah bug yang sudah tiga kali terjadi di sesi ini (mcp.*, agents.*,
 * dan kunci antrean AI), dan gejalanya selalu sama: halaman berbahasa Indonesia
 * di sembilan bahasa lain.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const asli = readFileSync(BERKAS, 'utf8');

const KUNCI = [
  'Confirm before closing the window',
  'asks first if there are unsaved files; a window closed by mistake cannot be undone',
  'Keep running in the tray when closed',
  'not available yet: Zephyr has no tray icon, so a closed window could not be reopened. Coming once the tray is built.',
  'Default terminal',
  'which shell a new terminal starts; "Default" means the one this system already uses',
  'Default (auto-detect)',
  'Shell path',
  'leave empty to use the choice above; set it to point at a shell Zephyr cannot find on its own',
  'Close Zephyr?',
  'The window will close. Your files are already saved, so nothing is lost. Turn this question off in Settings, General if you do not want to be asked.',
  'Close',
];

const T = {
  ID: [
    'Konfirmasi sebelum menutup jendela',
    'bertanya dulu kalau ada berkas yang belum disimpan; jendela yang tertutup karena salah tidak bisa dibatalkan',
    'Tetap jalan di tray saat ditutup',
    'belum tersedia: Zephyr belum punya ikon tray, jadi jendela yang ditutup tidak bisa dibuka lagi. Menyusul setelah tray dibuat.',
    'Terminal bawaan',
    'shell apa yang dipakai terminal baru; "Bawaan" berarti yang sudah dipakai sistem ini',
    'Bawaan (deteksi otomatis)',
    'Jalur shell',
    'biarkan kosong untuk memakai pilihan di atas; isi untuk menunjuk shell yang tidak bisa Zephyr temukan sendiri',
    'Tutup Zephyr?',
    'Jendela akan ditutup. Berkasmu sudah tersimpan, jadi tidak ada yang hilang. Matikan pertanyaan ini di Pengaturan, Umum kalau tidak mau ditanya.',
    'Tutup',
  ],
  EN: [
    'Confirm before closing the window',
    'asks first if there are unsaved files; a window closed by mistake cannot be undone',
    'Keep running in the tray when closed',
    'not available yet: Zephyr has no tray icon, so a closed window could not be reopened. Coming once the tray is built.',
    'Default terminal',
    'which shell a new terminal starts; "Default" means the one this system already uses',
    'Default (auto-detect)',
    'Shell path',
    'leave empty to use the choice above; set it to point at a shell Zephyr cannot find on its own',
    'Close Zephyr?',
    'The window will close. Your files are already saved, so nothing is lost. Turn this question off in Settings, General if you do not want to be asked.',
    'Close',
  ],
  JA: [
    'ウィンドウを閉じる前に確認する',
    '未保存のファイルがある場合に確認します。誤って閉じたウィンドウは元に戻せません',
    '閉じてもトレイで実行を続ける',
    'まだ利用できません: Zephyr にはトレイアイコンがなく、閉じたウィンドウを再度開けません。トレイ実装後に提供予定です。',
    '既定のターミナル',
    '新しいターミナルが起動するシェル。「既定」はこのシステムが既に使っているものを意味します',
    '既定 (自動検出)',
    'シェルのパス',
    '空欄なら上の選択を使います。Zephyr が見つけられないシェルを指定する場合に入力します',
    'Zephyr を閉じますか?',
    'ウィンドウを閉じます。ファイルはすでに保存されているため失われるものはありません。この確認が不要な場合は設定の「一般」でオフにできます。',
    '閉じる',
  ],
  KO: [
    '창을 닫기 전에 확인',
    '저장되지 않은 파일이 있으면 먼저 묻습니다. 실수로 닫은 창은 되돌릴 수 없습니다',
    '닫아도 트레이에서 계속 실행',
    '아직 사용할 수 없습니다: Zephyr에는 트레이 아이콘이 없어 닫힌 창을 다시 열 수 없습니다. 트레이 구현 후 제공됩니다.',
    '기본 터미널',
    '새 터미널이 시작할 셸입니다. "기본"은 이 시스템이 이미 사용하는 셸을 뜻합니다',
    '기본 (자동 감지)',
    '셸 경로',
    '비워 두면 위 선택을 사용합니다. Zephyr가 스스로 찾지 못하는 셸을 지정할 때 입력하세요',
    'Zephyr를 닫을까요?',
    '창이 닫힙니다. 파일은 이미 저장되어 잃을 것이 없습니다. 이 질문이 필요 없으면 설정의 일반에서 끄세요.',
    '닫기',
  ],
  ZH: [
    '关闭窗口前确认',
    '有未保存的文件时会先询问；误关的窗口无法撤销',
    '关闭后仍在托盘中运行',
    '尚不可用：Zephyr 没有托盘图标，关闭的窗口无法重新打开。托盘完成后提供。',
    '默认终端',
    '新终端启动的 shell；“默认”指此系统已在使用的那个',
    '默认（自动检测）',
    'Shell 路径',
    '留空则使用上面的选择；填入以指定 Zephyr 无法自行找到的 shell',
    '关闭 Zephyr？',
    '窗口将关闭。你的文件已经保存，不会丢失任何内容。若不想被询问，可在设置的“常规”中关闭。',
    '关闭',
  ],
  ES: [
    'Confirmar antes de cerrar la ventana',
    'pregunta primero si hay archivos sin guardar; una ventana cerrada por error no se puede deshacer',
    'Seguir en la bandeja al cerrar',
    'aun no disponible: Zephyr no tiene icono de bandeja, asi que una ventana cerrada no se podria reabrir. Llegara cuando la bandeja este lista.',
    'Terminal predeterminada',
    'que shell inicia un terminal nuevo; "Predeterminada" significa el que este sistema ya usa',
    'Predeterminada (deteccion automatica)',
    'Ruta del shell',
    'dejalo vacio para usar la opcion de arriba; escribelo para senalar un shell que Zephyr no encuentra por si solo',
    'Cerrar Zephyr?',
    'La ventana se cerrara. Tus archivos ya estan guardados, asi que no se pierde nada. Desactiva esta pregunta en Ajustes, General si no quieres que se te pregunte.',
    'Cerrar',
  ],
  FR: [
    'Confirmer avant de fermer la fenetre',
    "demande d'abord s'il y a des fichiers non enregistres ; une fenetre fermee par erreur ne peut pas etre annulee",
    'Continuer dans la zone de notification apres fermeture',
    "pas encore disponible : Zephyr n'a pas d'icone de notification, donc une fenetre fermee ne pourrait pas etre rouverte. Previent quand la zone de notification sera en place.",
    'Terminal par defaut',
    'quel shell lance un nouveau terminal ; "Par defaut" designe celui que ce systeme utilise deja',
    'Par defaut (detection automatique)',
    'Chemin du shell',
    "laissez vide pour utiliser le choix ci-dessus ; renseignez-le pour indiquer un shell que Zephyr ne trouve pas seul",
    'Fermer Zephyr ?',
    "La fenetre va se fermer. Vos fichiers sont deja enregistres, rien n'est perdu. Desactivez cette question dans Parametres, General si vous ne voulez pas etre demande.",
    'Fermer',
  ],
  DE: [
    'Vor dem Schliessen des Fensters nachfragen',
    'fragt zuerst, wenn Dateien nicht gespeichert sind; ein versehentlich geschlossenes Fenster ist nicht wiederherstellbar',
    'Nach dem Schliessen im Infobereich weiterlaufen',
    'noch nicht verfuegbar: Zephyr hat kein Infobereich-Symbol, ein geschlossenes Fenster liesse sich nicht wieder oeffnen. Kommt, sobald der Infobereich steht.',
    'Standard-Terminal',
    'welche Shell ein neues Terminal startet; "Standard" bedeutet die, die dieses System bereits nutzt',
    'Standard (automatische Erkennung)',
    'Shell-Pfad',
    'leer lassen, um die Auswahl oben zu nutzen; eintragen, um auf eine Shell zu zeigen, die Zephyr nicht selbst findet',
    'Zephyr schliessen?',
    'Das Fenster wird geschlossen. Ihre Dateien sind bereits gespeichert, es geht nichts verloren. Schalten Sie diese Frage unter Einstellungen, Allgemein ab, wenn Sie nicht gefragt werden moechten.',
    'Schliessen',
  ],
  PT: [
    'Confirmar antes de fechar a janela',
    'pergunta primeiro se houver arquivos nao salvos; uma janela fechada por engano nao pode ser desfeita',
    'Continuar na bandeja ao fechar',
    'ainda nao disponivel: o Zephyr nao tem icone de bandeja, entao uma janela fechada nao poderia ser reaberta. Chega quando a bandeja estiver pronta.',
    'Terminal padrao',
    'qual shell inicia um terminal novo; "Padrao" significa o que este sistema ja usa',
    'Padrao (deteccao automatica)',
    'Caminho do shell',
    'deixe vazio para usar a escolha acima; preencha para apontar um shell que o Zephyr nao encontra sozinho',
    'Fechar o Zephyr?',
    'A janela vai fechar. Seus arquivos ja estao salvos, entao nada se perde. Desligue esta pergunta em Configuracoes, Geral se nao quiser ser perguntado.',
    'Fechar',
  ],
  AR: [
    'التأكيد قبل إغلاق النافذة',
    'يسأل أولا إذا كانت هناك ملفات غير محفوظة؛ النافذة المغلقة بالخطأ لا يمكن التراجع عنها',
    'الاستمرار في شريط النظام عند الإغلاق',
    'غير متاح بعد: لا يوجد لـ Zephyr رمز في شريط النظام، لذا لا يمكن إعادة فتح نافذة مغلقة. سيأتي بعد بناء شريط النظام.',
    'الطرفية الافتراضية',
    'أي صدفة تبدأ بها الطرفية الجديدة؛ "الافتراضي" يعني التي يستخدمها هذا النظام بالفعل',
    'الافتراضي (كشف تلقائي)',
    'مسار الصدفة',
    'اتركه فارغا لاستخدام الاختيار أعلاه؛ املأه للإشارة إلى صدفة لا يستطيع Zephyr إيجادها بنفسه',
    'إغلاق Zephyr؟',
    'سيتم إغلاق النافذة. ملفاتك محفوظة بالفعل، فلا شيء يضيع. أوقف هذا السؤال من الإعدادات، عام إذا كنت لا تريد أن تُسأل.',
    'إغلاق',
  ],
};

const batas = [...asli.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({ b: m[1], i: m.index }));
if (batas.length !== 10) {
  console.error('BERHENTI: mengharapkan 10 kamus, menemukan ' + batas.length);
  process.exit(1);
}
for (const b of batas) {
  if (!T[b.b]) {
    console.error('BERHENTI: tidak ada terjemahan untuk ' + b.b);
    process.exit(1);
  }
}

const baris = asli.split('\n');
const sisipan = [];

for (let i = 0; i < batas.length; i++) {
  const b = batas[i].b;
  const mulai = batas[i].i;
  const akhir = i + 1 < batas.length ? batas[i + 1].i : asli.length;
  const blok = asli.slice(mulai, akhir);
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const kurang = KUNCI.filter((k) => {
    const pola = new RegExp("^\\s{2}'" + esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\s*:", 'm');
    return !pola.test(blok);
  });
  if (!kurang.length) {
    console.log('  ' + b + ': lengkap');
    continue;
  }

  const barisMulai = asli.slice(0, mulai).split('\n').length - 1;
  const barisAkhir = i + 1 < batas.length ? asli.slice(0, akhir).split('\n').length - 1 : baris.length;

  /* Jangkar: kunci general.* terakhir, supaya kunci baru berada di dekat
     kerabatnya. Kalau tidak ada, kunci 'settings.general' atau baris pertama. */
  let jangkar = -1;
  for (const pola of [/^\s{2}'general\./, /^\s{2}'settings\.general'/]) {
    for (let n = barisAkhir - 1; n > barisMulai; n--) {
      if (pola.test(baris[n])) {
        jangkar = n;
        break;
      }
    }
    if (jangkar >= 0) break;
  }
  if (jangkar < 0) jangkar = barisMulai + 1;

  const kutip = (s) => "'" + esc(String(s)) + "'";
  sisipan.push({
    baris: jangkar,
    b,
    n: kurang.length,
    teks: kurang.map((k) => `  ${kutip(k)}: ${kutip(T[b][KUNCI.indexOf(k)])},`),
  });
}

sisipan.sort((a, b) => b.baris - a.baris);
for (const s of sisipan) {
  baris.splice(s.baris + 1, 0, ...s.teks);
  console.log('  ' + s.b + ': +' + s.n);
}

if (sisipan.length) {
  writeFileSync(BERKAS, baris.join('\n'), 'utf8');
  console.log('');
  console.log('Selesai: ' + sisipan.length + ' kamus diperbarui.');
} else {
  console.log('Tidak ada yang perlu diubah.');
}
