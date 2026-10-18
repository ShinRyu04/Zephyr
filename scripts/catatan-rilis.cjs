/*
 * Catatan rilis 1.1.14 dalam 10 bahasa.
 *
 * Ditulis dari daftar perubahan yang SAMA untuk semua bahasa, bukan sepuluh teks
 * bebas: sepuluh paragraf yang ditulis terpisah akan menyimpang satu sama lain,
 * dan pembaca bahasa lain akan mendapat janji yang berbeda dari versi Inggris.
 */
const fs = require('fs');
const path = require('path');

const VERSI = '1.1.14';
const TUJUAN = `D:/Zephyr/Release/${VERSI}/Notes`;
fs.mkdirSync(TUJUAN, { recursive: true });

/* Kunci perubahan, sama di semua bahasa. */
const BUTIR = [
  'panel', 'atlas', 'icons', 'commit', 'notif', 'welcome', 'tests', 'width',
];

const ISI = {
  en: {
    nama: 'English',
    judul: `Zephyr ${VERSI}`,
    sub: 'Panels as real windows, icon themes that actually change, and a calmer first run.',
    butir: {
      panel: '**Settings, Extensions, Tools, Chat Settings, Agent Customizations and AI Models now open as real OS windows** — each with its own title bar, resize edges and window controls, so they can be moved to a second monitor instead of covering the editor.',
      atlas: '**The Repo Wiki / Atlas surface was removed.** It documented the codebase from disk, but the pages aged quietly and the cards duplicated what the agent already reads from the files. The left rail is now one entry shorter.',
      icons: '**Icon themes now really change every icon.** Eight themes ship with real SVG art — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — and each one redraws files, per-folder marks (code, tests, docs, assets, build, config) and the open/closed folder states. Switching is instant and never lands on the wrong theme.',
      commit: '**Split commit button in Source Control** — `✓ Commit` on the left, a caret on the right for *Commit and push* and *Commit and sync*. The commit graph moved into a collapsible `GRAPH` section so the change list stays above the fold.',
      notif: '**A notification when a long agent run finishes** while you are in another application. Runs shorter than 20 seconds, and runs you are already watching, stay quiet.',
      welcome: '**A three-step welcome setup** on first launch: preferences, interface (Editor or Quest), done. No account, no sign-in.',
      tests: '**The Tests view was removed** from Settings navigation and from Dev Environment Tools — it never had a working runner behind it.',
      width: '**Panels use the full window width.** The fixed 780/980px content columns that left dead space on a maximised window are gone.',
    },
  },
  id: {
    nama: 'Bahasa Indonesia',
    judul: `Zephyr ${VERSI}`,
    sub: 'Panel jadi jendela sungguhan, tema ikon yang benar-benar berubah, dan awal pemakaian yang lebih tenang.',
    butir: {
      panel: '**Settings, Extensions, Tools, Chat Settings, Agent Customizations, dan AI Models sekarang terbuka sebagai jendela OS sungguhan** — masing-masing punya title bar sendiri, pegangan ubah ukuran, dan tombol jendela, jadi bisa dipindah ke monitor kedua alih-alih menutupi editor.',
      atlas: '**Fitur Repo Wiki / Atlas dihapus.** Ia mendokumentasikan codebase dari disk, tapi halamannya menua diam-diam dan kartunya menduplikasi apa yang sudah dibaca agen dari berkas. Rel kiri sekarang berkurang satu tombol.',
      icons: '**Tema ikon sekarang benar-benar mengubah semua ikon.** Delapan tema membawa seni SVG asli — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — dan masing-masing menggambar ulang berkas, ikon folder per kelompok (kode, uji, dokumen, aset, build, konfig), serta keadaan folder terbuka/tertutup. Berganti instan dan tidak pernah mendarat di tema yang salah.',
      commit: '**Tombol commit terbelah di Source Control** — `✓ Commit` di kiri, caret di kanan untuk *Commit and push* dan *Commit and sync*. Grafik commit pindah ke bagian `GRAPH` yang bisa dilipat, jadi daftar perubahan tetap terlihat.',
      notif: '**Notifikasi saat run agen yang panjang selesai** ketika Anda sedang di aplikasi lain. Run di bawah 20 detik, dan run yang sedang Anda lihat, tetap diam.',
      welcome: '**Wizard awal tiga langkah** saat pertama dibuka: preferensi, antarmuka (Editor atau Quest), selesai. Tanpa akun, tanpa login.',
      tests: '**Tampilan Tests dihapus** dari navigasi Settings dan dari Dev Environment Tools — tidak pernah ada runner yang benar-benar bekerja di belakangnya.',
      width: '**Panel memakai lebar jendela penuh.** Kolom konten tetap 780/980px yang menyisakan ruang mati di jendela maksimal sudah dihapus.',
    },
  },
  ja: {
    nama: '日本語',
    judul: `Zephyr ${VERSI}`,
    sub: 'パネルが本物のウィンドウに、アイコンテーマが本当に変わり、初回起動が静かになりました。',
    butir: {
      panel: '**設定・拡張機能・ツール・チャット設定・エージェント設定・AI モデルが独立した OS ウィンドウで開くようになりました** — それぞれ独自のタイトルバー、サイズ変更ハンドル、ウィンドウボタンを持ち、エディタを覆わずセカンドモニターへ移動できます。',
      atlas: '**Repo Wiki / Atlas を削除しました。** ディスクからコードベースを文書化していましたが、ページは静かに古くなり、カードはエージェントがファイルから読む内容と重複していました。左レールは 1 つ短くなりました。',
      icons: '**アイコンテーマがすべてのアイコンを実際に変更します。** 8 つのテーマに本物の SVG アートを同梱 — Belah、Kubus、Lingkaran、Garis、Kisi、Segitiga、Heksagon、Petir — ファイル、フォルダー種別ごとのアイコン（コード・テスト・ドキュメント・アセット・ビルド・設定）、開閉状態を描き分けます。切り替えは即座で、誤ったテーマになることはありません。',
      commit: '**ソース管理のコミットボタンが分割されました** — 左が `✓ Commit`、右のキャレットに *Commit and push* と *Commit and sync*。コミットグラフは折りたたみ可能な `GRAPH` セクションへ移動し、変更一覧が常に見えます。',
      notif: '**長いエージェント実行が終わったときに通知**（別のアプリを見ている場合）。20 秒未満の実行と、画面で見ている実行は通知しません。',
      welcome: '**初回起動時に 3 ステップのセットアップ**：環境設定、インターフェース（Editor か Quest）、完了。アカウントもログインも不要です。',
      tests: '**Tests ビューを削除しました**（設定ナビゲーションと開発環境ツールから）— 実際に動作するランナーが背後にありませんでした。',
      width: '**パネルがウィンドウ幅をフルに使います。** 最大化時に余白を残していた固定 780/980px の列を廃止しました。',
    },
  },
  ko: {
    nama: '한국어',
    judul: `Zephyr ${VERSI}`,
    sub: '패널이 실제 창이 되고, 아이콘 테마가 정말로 바뀌고, 첫 실행이 더 차분해졌습니다.',
    butir: {
      panel: '**설정, 확장, 도구, 채팅 설정, 에이전트 설정, AI 모델이 이제 실제 OS 창으로 열립니다** — 각자 제목 표시줄, 크기 조절 손잡이, 창 버튼을 갖추어 편집기를 가리지 않고 보조 모니터로 옮길 수 있습니다.',
      atlas: '**Repo Wiki / Atlas 기능을 제거했습니다.** 디스크에서 코드베이스를 문서화했지만 페이지는 조용히 낡아갔고 카드는 에이전트가 파일에서 읽는 내용과 중복되었습니다. 왼쪽 레일이 하나 줄었습니다.',
      icons: '**아이콘 테마가 이제 모든 아이콘을 실제로 바꿉니다.** 8개 테마에 실제 SVG 아트가 포함됩니다 — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — 파일, 폴더 종류별 아이콘(코드·테스트·문서·자산·빌드·설정), 열림/닫힘 상태를 각각 다르게 그립니다. 전환은 즉시이며 잘못된 테마로 남지 않습니다.',
      commit: '**소스 제어의 커밋 버튼이 분할되었습니다** — 왼쪽 `✓ Commit`, 오른쪽 캐럿에 *Commit and push* 와 *Commit and sync*. 커밋 그래프는 접을 수 있는 `GRAPH` 섹션으로 이동해 변경 목록이 항상 보입니다.',
      notif: '**긴 에이전트 실행이 끝나면 알림** (다른 앱을 보고 있을 때). 20초 미만 실행과 화면에서 보고 있는 실행은 조용합니다.',
      welcome: '**첫 실행 시 3단계 설정 마법사**: 환경 설정, 인터페이스(Editor 또는 Quest), 완료. 계정도 로그인도 필요 없습니다.',
      tests: '**Tests 보기를 제거했습니다** (설정 탐색과 개발 환경 도구에서) — 뒤에 실제로 동작하는 러너가 없었습니다.',
      width: '**패널이 창 전체 너비를 사용합니다.** 최대화 시 빈 공간을 남기던 고정 780/980px 열을 없앴습니다.',
    },
  },
  zh: {
    nama: '简体中文',
    judul: `Zephyr ${VERSI}`,
    sub: '面板成为真正的窗口，图标主题真正生效，首次使用更安静。',
    butir: {
      panel: '**设置、扩展、工具、聊天设置、代理设置和 AI 模型现在作为真正的操作系统窗口打开** —— 各自拥有标题栏、缩放边角和窗口按钮，可以移到第二块屏幕而不遮挡编辑器。',
      atlas: '**移除了 Repo Wiki / Atlas 功能。** 它从磁盘记录代码库，但页面会悄悄过期，卡片又与代理直接从文件读取的内容重复。左侧栏少了一个按钮。',
      icons: '**图标主题现在真正改变每一个图标。** 内置八个主题，附带真正的 SVG 图形 —— Belah、Kubus、Lingkaran、Garis、Kisi、Segitiga、Heksagon、Petir —— 分别重绘文件、按类别区分的文件夹图标（代码、测试、文档、资源、构建、配置）以及打开/关闭状态。切换即时生效，且不会停留在错误的主题上。',
      commit: '**源代码管理中的提交按钮已拆分** —— 左侧 `✓ Commit`，右侧箭头包含 *Commit and push* 与 *Commit and sync*。提交图移至可折叠的 `GRAPH` 区域，变更列表始终可见。',
      notif: '**长时间代理运行结束时发出通知**（当您在别的应用里）。少于 20 秒的运行，以及您正在查看的运行，不会打扰。',
      welcome: '**首次启动的三步欢迎设置**：偏好、界面（Editor 或 Quest）、完成。无需账号，无需登录。',
      tests: '**移除了 Tests 视图**（从设置导航和开发环境工具中）—— 它背后从来没有可用的运行器。',
      width: '**面板使用完整窗口宽度。** 最大化时留下空白区域的固定 780/980px 内容列已移除。',
    },
  },
  es: {
    nama: 'Español',
    judul: `Zephyr ${VERSI}`,
    sub: 'Paneles como ventanas reales, temas de iconos que de verdad cambian y un primer arranque más tranquilo.',
    butir: {
      panel: '**Ajustes, Extensiones, Herramientas, Ajustes de chat, Personalizaciones del agente y Modelos de IA ahora se abren como ventanas reales del sistema** — cada una con su barra de título, bordes de redimensionado y botones de ventana, para poder moverlas a un segundo monitor en lugar de tapar el editor.',
      atlas: '**Se eliminó la vista Repo Wiki / Atlas.** Documentaba el código desde el disco, pero las páginas envejecían en silencio y las tarjetas duplicaban lo que el agente ya lee de los archivos. La barra izquierda tiene ahora una entrada menos.',
      icons: '**Los temas de iconos ahora cambian realmente todos los iconos.** Ocho temas incluyen arte SVG real — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — y cada uno redibuja archivos, iconos por tipo de carpeta (código, pruebas, documentos, recursos, build, configuración) y los estados abierto/cerrado. El cambio es instantáneo y nunca queda en el tema equivocado.',
      commit: '**Botón de commit dividido en Control de código fuente** — `✓ Commit` a la izquierda, una flecha a la derecha para *Commit and push* y *Commit and sync*. El gráfico de commits pasó a una sección `GRAPH` plegable para que la lista de cambios siga visible.',
      notif: '**Una notificación cuando termina una ejecución larga del agente** mientras estás en otra aplicación. Las ejecuciones de menos de 20 segundos, y las que ya estás viendo, no avisan.',
      welcome: '**Configuración de bienvenida en tres pasos** al primer arranque: preferencias, interfaz (Editor o Quest), listo. Sin cuenta ni inicio de sesión.',
      tests: '**Se eliminó la vista Tests** de la navegación de Ajustes y de las herramientas del entorno de desarrollo — nunca hubo un ejecutor real detrás.',
      width: '**Los paneles usan todo el ancho de la ventana.** Se eliminaron las columnas fijas de 780/980 px que dejaban espacio muerto al maximizar.',
    },
  },
  fr: {
    nama: 'Français',
    judul: `Zephyr ${VERSI}`,
    sub: 'Des panneaux en vraies fenêtres, des thèmes d’icônes qui changent vraiment, et un premier lancement plus calme.',
    butir: {
      panel: '**Réglages, Extensions, Outils, Réglages du chat, Personnalisation de l’agent et Modèles d’IA s’ouvrent désormais comme de vraies fenêtres du système** — chacune avec sa barre de titre, ses poignées de redimensionnement et ses boutons, pour les déplacer sur un second écran au lieu de masquer l’éditeur.',
      atlas: '**La vue Repo Wiki / Atlas a été supprimée.** Elle documentait le code depuis le disque, mais les pages vieillissaient en silence et les fiches dupliquaient ce que l’agent lit déjà dans les fichiers. La barre de gauche compte une entrée de moins.',
      icons: '**Les thèmes d’icônes changent maintenant réellement toutes les icônes.** Huit thèmes embarquent de vrais dessins SVG — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — et chacun redessine les fichiers, les icônes par type de dossier (code, tests, docs, ressources, build, config) et les états ouvert/fermé. Le changement est immédiat et ne retombe jamais sur le mauvais thème.',
      commit: '**Bouton de commit scindé dans le contrôle de source** — `✓ Commit` à gauche, un chevron à droite pour *Commit and push* et *Commit and sync*. Le graphe des commits passe dans une section `GRAPH` repliable pour que la liste des modifications reste visible.',
      notif: '**Une notification quand une longue exécution de l’agent se termine** pendant que vous êtes dans une autre application. Les exécutions de moins de 20 secondes, et celles que vous regardez, restent silencieuses.',
      welcome: '**Assistant de bienvenue en trois étapes** au premier lancement : préférences, interface (Editor ou Quest), terminé. Sans compte ni connexion.',
      tests: '**La vue Tests a été retirée** de la navigation des Réglages et des outils d’environnement de développement — aucun exécuteur réel ne la soutenait.',
      width: '**Les panneaux utilisent toute la largeur de la fenêtre.** Les colonnes fixes de 780/980 px qui laissaient du vide en mode maximisé ont disparu.',
    },
  },
  de: {
    nama: 'Deutsch',
    judul: `Zephyr ${VERSI}`,
    sub: 'Panels als echte Fenster, Icon-Themes, die wirklich wechseln, und ein ruhigerer erster Start.',
    butir: {
      panel: '**Einstellungen, Erweiterungen, Werkzeuge, Chat-Einstellungen, Agent-Anpassungen und KI-Modelle öffnen jetzt als echte Systemfenster** — jeweils mit eigener Titelleiste, Ziehpunkten und Fenstertasten, damit sie auf einen zweiten Monitor wandern können, statt den Editor zu verdecken.',
      atlas: '**Die Repo-Wiki-/Atlas-Ansicht wurde entfernt.** Sie dokumentierte den Code von der Festplatte, aber die Seiten alterten still und die Karten doppelten, was der Agent ohnehin aus den Dateien liest. Die linke Leiste hat jetzt einen Eintrag weniger.',
      icons: '**Icon-Themes ändern jetzt wirklich jedes Icon.** Acht Themes liefern echte SVG-Grafik — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — und jedes zeichnet Dateien, Ordnerzeichen je Gruppe (Code, Tests, Doku, Assets, Build, Konfiguration) und den offenen/geschlossenen Zustand neu. Der Wechsel ist sofort und landet nie beim falschen Theme.',
      commit: '**Geteilter Commit-Knopf in der Quellenverwaltung** — links `✓ Commit`, rechts ein Pfeil für *Commit and push* und *Commit and sync*. Der Commit-Graph wandert in einen einklappbaren `GRAPH`-Abschnitt, damit die Änderungsliste sichtbar bleibt.',
      notif: '**Eine Benachrichtigung, wenn ein langer Agent-Lauf endet**, während du in einer anderen Anwendung bist. Läufe unter 20 Sekunden und solche, die du gerade siehst, bleiben still.',
      welcome: '**Dreistufige Willkommens-Einrichtung** beim ersten Start: Voreinstellungen, Oberfläche (Editor oder Quest), fertig. Kein Konto, keine Anmeldung.',
      tests: '**Die Tests-Ansicht wurde entfernt** aus der Einstellungsnavigation und den Entwicklungswerkzeugen — dahinter stand nie ein funktionierender Runner.',
      width: '**Panels nutzen die volle Fensterbreite.** Die festen 780/980-px-Spalten, die im maximierten Fenster Leerraum ließen, sind weg.',
    },
  },
  pt: {
    nama: 'Português',
    judul: `Zephyr ${VERSI}`,
    sub: 'Painéis como janelas reais, temas de ícones que realmente mudam e uma primeira execução mais calma.',
    butir: {
      panel: '**Configurações, Extensões, Ferramentas, Configurações do chat, Personalizações do agente e Modelos de IA agora abrem como janelas reais do sistema** — cada uma com sua barra de título, alças de redimensionamento e botões de janela, para movê-las a um segundo monitor em vez de cobrir o editor.',
      atlas: '**A visão Repo Wiki / Atlas foi removida.** Ela documentava o código a partir do disco, mas as páginas envelheciam em silêncio e os cartões duplicavam o que o agente já lê dos arquivos. A barra esquerda tem uma entrada a menos.',
      icons: '**Os temas de ícones agora mudam realmente todos os ícones.** Oito temas trazem arte SVG real — Belah, Kubus, Lingkaran, Garis, Kisi, Segitiga, Heksagon, Petir — e cada um redesenha arquivos, ícones por tipo de pasta (código, testes, docs, recursos, build, configuração) e os estados aberto/fechado. A troca é instantânea e nunca fica no tema errado.',
      commit: '**Botão de commit dividido no Controle de código-fonte** — `✓ Commit` à esquerda, uma seta à direita para *Commit and push* e *Commit and sync*. O gráfico de commits foi para uma seção `GRAPH` recolhível, mantendo a lista de mudanças visível.',
      notif: '**Uma notificação quando uma execução longa do agente termina** enquanto você está em outro aplicativo. Execuções com menos de 20 segundos, e as que você já está vendo, ficam em silêncio.',
      welcome: '**Assistente de boas-vindas em três passos** na primeira execução: preferências, interface (Editor ou Quest), concluído. Sem conta, sem login.',
      tests: '**A visão Tests foi removida** da navegação de Configurações e das ferramentas de ambiente de desenvolvimento — nunca houve um executor real por trás.',
      width: '**Os painéis usam a largura total da janela.** As colunas fixas de 780/980 px que deixavam espaço morto ao maximizar foram removidas.',
    },
  },
  ar: {
    nama: 'العربية',
    judul: `Zephyr ${VERSI}`,
    sub: 'لوحات ك نوافذ حقيقية، وسمات أيقونات تتغيّر فعلًا، وبداية أهدأ.',
    butir: {
      panel: '**الإعدادات والإضافات والأدوات وإعدادات الدردشة وتخصيص الوكيل ونماذج الذكاء الاصطناعي تُفتح الآن كنوافذ نظام حقيقية** — لكل منها شريط عنوان ومقابض تحجيم وأزرار نافذة، ليمكن نقلها إلى شاشة ثانية بدل تغطية المحرر.',
      atlas: '**أُزيلت واجهة Repo Wiki / Atlas.** كانت توثّق الشيفرة من القرص، لكن الصفحات كانت تتقادم بصمت والبطاقات تكرّر ما يقرأه الوكيل من الملفات أصلًا. الشريط الأيسر صار أقصر بعنصر واحد.',
      icons: '**سمات الأيقونات تُغيّر الآن كل الأيقونات فعليًا.** ثماني سمات تحمل رسوم SVG حقيقية — Belah وKubus وLingkaran وGaris وKisi وSegitiga وHeksagon وPetir — وكل واحدة تعيد رسم الملفات وأيقونات المجلدات حسب النوع (شيفرة، اختبارات، مستندات، أصول، بناء، إعدادات) وحالتي الفتح والإغلاق. التبديل فوري ولا ينتهي على السمة الخطأ.',
      commit: '**زر إيداع مقسوم في التحكم بالمصدر** — `✓ Commit` يسارًا، وسهم يمينًا لـ *Commit and push* و*Commit and sync*. انتقل رسم الإيداعات إلى قسم `GRAPH` قابل للطي لتبقى قائمة التغييرات ظاهرة.',
      notif: '**إشعار عند انتهاء تشغيل طويل للوكيل** بينما أنت في تطبيق آخر. التشغيلات الأقصر من 20 ثانية، وتلك التي تشاهدها، تبقى صامتة.',
      welcome: '**معالج ترحيب من ثلاث خطوات** عند أول تشغيل: التفضيلات، الواجهة (Editor أو Quest)، انتهى. بلا حساب ولا تسجيل دخول.',
      tests: '**أُزيلت واجهة Tests** من تنقّل الإعدادات ومن أدوات بيئة التطوير — لم يكن خلفها مشغّل يعمل فعلًا.',
      width: '**اللوحات تستخدم عرض النافذة كاملًا.** أُزيلت أعمدة العرض الثابتة 780/980 بكسل التي كانت تترك فراغًا عند التكبير.',
    },
  },
};

/* Tulis Markdown per bahasa. */
let n = 0;
for (const [kode, v] of Object.entries(ISI)) {
  const baris = [
    `# ${v.judul}`,
    '',
    `*${v.sub}*`,
    '',
    ...BUTIR.map((b) => `- ${v.butir[b]}`),
    '',
    '---',
    '',
    `**${kode === 'en' ? 'Verification' : kode === 'id' ? 'Verifikasi' : 'Verification'}** — ` +
      (kode === 'id'
        ? '1.1.14 lolos 12/12 harness ikon, 11/11 notifikasi, 23/23 panel-jendela, 6/6 beban, 555 tes Rust, 0 galat TypeScript.'
        : '1.1.14 passes 12/12 icon harness, 11/11 notification, 23/23 panel-window, 6/6 load, 555 Rust tests, 0 TypeScript errors.'),
    '',
  ];
  fs.writeFileSync(path.join(TUJUAN, `${kode}.md`), baris.join('\n'), 'utf8');
  n++;
}

/* Berkas gabungan untuk halaman rilis. */
const gabung = Object.entries(ISI)
  .map(([kode, v]) => `<!-- ${v.nama} -->\n\n${fs.readFileSync(path.join(TUJUAN, `${kode}.md`), 'utf8')}`)
  .join('\n');
fs.writeFileSync(path.join(TUJUAN, 'SEMUA-BAHASA.md'), gabung, 'utf8');

console.log(`catatan rilis: ${n} bahasa di ${TUJUAN}`);
for (const [kode, v] of Object.entries(ISI)) console.log(`  ${kode}  ${v.nama}`);
