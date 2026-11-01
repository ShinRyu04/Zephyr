import { POLA_AWALAN_MCP } from './awalan';

export { POLA_AWALAN_MCP };

/**
 * Deskripsi tampilan tool, dipisah dari katalog supaya bahasa bisa berganti.
 *
 * Kenapa dipisah:
 *
 *   `catalog.ts` tetap menjadi SATU-SATUNYA sumber kebenaran untuk hal yang
 *   menentukan perilaku: nama tool, kelompok, kelas efek samping, dan
 *   needsApproval. Yang TIDAK ikut tinggal di sana adalah teks yang dibaca
 *   manusia, karena teks itu tidak boleh ikut menentukan apa yang dijalankan.
 *
 *   Sebelumnya deskripsi tinggal sebagai elemen kelima di setiap baris katalog
 *   dan selalu berbahasa Indonesia. Akibatnya user berbahasa Inggris tetap
 *   melihat teks Indonesia di panel Tools, walaupun seluruh sisa antarmuka
 *   sudah mengikuti bahasa aktif.
 *
 * Peta di bawah tidak pernah menentukan tool mana yang ADA:
 *
 *   - `DESKRIPSI_TOOL_ID` memuat teks Indonesia apa adanya, disalin persis
 *     dari katalog, supaya `deskripsiTool` bisa mengembalikannya.
 *   - `DESKRIPSI_TOOL_EN` memuat padanan Inggrisnya.
 *   - `DESKRIPSI_TOOL_JA`, `_KO`, `_ZH`, `_ES`, `_FR`, `_DE`, `_PT`, `_AR`
 *     memuat delapan bahasa antarmuka lainnya, supaya panel Tools ikut berganti
 *     bahasa seperti sisa aplikasi.
 *   - Himpunan kunci SEMUA peta harus sama persis dengan nama tool di katalog.
 *     Kalau katalog menambah tool baru, kesepuluh peta ini yang harus menyusul.
 *
 * Dipakai lewat `deskripsiTool(nama, bahasa)`, supaya pemanggil tidak perlu
 * tahu peta mana yang berlaku. Kode bahasa yang dikenal sepuluh, sama persis
 * dengan `DICTS` di `i18n.ts`. Bahasa yang tidak punya peta - atau kunci yang
 * belum diterjemahkan di peta yang ada - memakai teks Inggris: Inggris adalah
 * bahasa cadangan, bukan salah satu dari sekian banyak pilihan, jadi tool yang
 * baru ditambahkan tetap punya deskripsi yang bisa dibaca.
 */

/** Deskripsi Indonesia asli, disalin persis dari catalog.ts. */
export const DESKRIPSI_TOOL_ID: Record<string, string> = {
  bash_job: 'Mulai perintah yang berjalan terus (dev server, watcher), baca lognya, hentikan, dan bersihkan',
  open_link: 'Buka URL di browser eksternal atau panel browser',
  zephyr_kode: 'Potongan baris BERKODE NOMOR dari sumber Zephyr sendiri (baca-kode): satu berkas, satu rentang baris, atau simbol',
  skill_view: 'Baca isi skill yang terdaftar, atau daftar skillnya',
  tool_search: 'Cari tool yang tidak ada di daftar utama (web, browser, SSH, MCP, jadwal)',
  tool_call: 'Panggil tool yang ditemukan lewat tool_search',
  read_file: 'Baca berkas dari disk, atau buffer editor yang belum tersimpan',
  list_directory: 'Daftar isi sebuah folder',
  write_file: 'Tulis berkas ke disk, atau buat berkas baru (folder induk dibuat otomatis)',
  move_file: 'Pindahkan atau ganti nama berkas/folder',
  copy_file: 'Salin berkas atau folder',
  delete_file: 'Hapus berkas atau folder',
  replace_in_files: 'Ganti teks atau pola di banyak berkas sekaligus',
  multi_edit: 'Beberapa penggantian pada satu berkas dalam satu langkah',
  grep: 'Cari teks di seluruh workspace',
  glob: 'Cari berkas berdasarkan pola nama atau jalur',
  bash_run: 'Jalankan perintah dan tunggu sampai selesai (termasuk perintah latar)',
  run_subagent: 'Jalankan satu subagent untuk tugas mandiri',
  todo_write: 'Ganti daftar tugas agen untuk tugas ini',
  ask_user:
    'Tanya user satu pertanyaan dan tunggu jawabannya. Pakai HANYA kalau pilihan yang mungkin benar-benar berbeda dan salah pilih akan membuang pekerjaan; jangan pakai untuk hal yang bisa kamu cek sendiri.',
  notes_write: 'Ubah catatan atau todo milik user',
  schedule_command: 'Jadwalkan, daftar, atau batalkan perintah terjadwal (action: list|add|cancel)',
  /* Pola OpenJarvis (think.py, Apache-2.0): scratchpad penalaran tanpa efek samping. */
  /* Pola OpenJarvis (calculator.py, Apache-2.0): aritmetika deterministik tanpa eval. */
  inspect: 'Periksa command, pane, tab, workspace, atau setelan yang tersedia',
  run_command: 'Jalankan sebuah command aplikasi berdasarkan id-nya',
  open_file: 'Buka berkas di editor, bisa langsung ke baris tertentu',
  workspace: 'Lihat, buat, atau ganti workspace',
  set_setting: 'Ubah satu preferensi aplikasi',
  extension: 'Lihat, aktifkan, atau nonaktifkan ekstensi',
  ssh: 'Buka atau pakai koneksi SSH tersimpan',
  read: 'Baca satu permukaan: terminal, buffer editor, atau DOM',
  sh: 'Jalankan perintah di pane terminal milik user',
  wait_for_terminal: 'Tunggu terminal selesai atau memunculkan teks tertentu',
  worktree: 'Kelola git worktree',
  focus_pane: 'Fokuskan sebuah pane tanpa mengklik',
  pane: 'Buka, bagi, tutup, atau susun pane',
  zephyr_self: 'Periksa Zephyr sendiri dari sumber milik aplikasi: setelan aktif, log, ekstensi, dokumen bundel, versi, dan indeks fakta',
  ingat: 'Simpan, cari, dan rapikan memori lintas sesi Zeph AI (berkas memori global + per-proyek)',
  lsp: "Tanya language server: simbol, referensi, definisi, tipe, diagnostik, atau hierarki panggilan",
  browser: "Kendalikan browser (tab editor): open, read, click, type, list, close, download",
  web: "Ambil dari internet: search (cari) atau fetch (isi satu URL)",
  apply_patch: "Ubah banyak berkas dalam satu panggilan patch (format OpenCode)",
  tunjuk: "Buka halaman atau panel yang pembaca maksud, dari keluhan berbahasa bebas",
  kotak: "Gambar kotak terstruktur di jawaban: judul, ringkasan, baris label/nilai",
  peta: "Cari di peta Zephyr: label, setelan, perintah, pintasan, panel, tool, berkas",
  execute: "Jalankan skrip yang memanggil beberapa tool sekaligus (Code Mode)",
};

/** Padanan Inggrisnya, satu kunci untuk setiap nama tool di katalog. */
export const DESKRIPSI_TOOL_EN: Record<string, string> = {
  bash_job: 'Start a command that keeps running (dev server, watcher), read its logs, stop it, and clean it up',
  open_link: 'Open a URL in the external browser or the browser pane',
  zephyr_kode: 'Numbered-line slices of Zephyr own source (read-code): one file, one line range, or a symbol',
  skill_view: 'Read the contents of a listed skill, or list the skills',
  tool_search: 'Search for a tool not in the main list (web, browser, SSH, MCP, schedule)',
  tool_call: 'Call a tool found through tool_search',
  read_file: 'Read a file from disk, or an unsaved editor buffer',
  list_directory: 'List the contents of a folder',
  write_file: 'Write a file to disk, or create a new one',
  move_file: 'Move or rename a file or folder',
  copy_file: 'Copy a file or folder',
  delete_file: 'Delete a file or folder',
  replace_in_files: 'Replace text or a pattern across many files at once',
  multi_edit: 'Several replacements in one file, in a single step',
  grep: 'Search for text across the whole workspace',
  glob: 'Find files by name or path pattern',
  bash_run: 'Run a command and wait for it to finish',
  run_subagent: 'Run one subagent for a self-contained task',
  todo_write: "Replace the agent's task list for this task",
  ask_user:
    'Ask the user one question and wait for the answer. Use ONLY when the plausible choices really differ and picking wrong would waste work; never for something you can check yourself.',
  notes_write: "Change the user's notes or todos",
  schedule_command: 'Schedule a command to run later',
  inspect: 'Inspect the available commands, panes, tabs, workspaces, or settings',
  run_command: 'Run an application command by its id',
  open_file: 'Open a file in the editor, optionally at a specific line',
  workspace: 'View, create, or switch workspace',
  set_setting: 'Change a single application preference',
  extension: 'View, enable, or disable extensions',
  ssh: 'Open or use a saved SSH connection',
  read: 'Read one surface: terminal, editor buffer, or DOM',
  sh: "Run a command in the user's terminal pane",
  wait_for_terminal: 'Wait until the terminal finishes or prints certain text',
  worktree: 'Manage git worktrees',
  focus_pane: 'Focus a pane without clicking it',
  pane: 'Open, split, close, or arrange panes',
  zephyr_self: 'Inspect Zephyr itself from app-owned sources: live settings, log, extensions, bundled docs, version, fact index',
  ingat: 'Save, search, and tidy the cross-session memory of Zeph AI (global + per-project memory files)',
  lsp: "Ask the language server: symbols, references, definition, type, diagnostics, or call hierarchy",
  browser: "Control the browser (editor tab): open, read, click, type, list, close, download",
  web: "Get from the internet: search (find) or fetch (one URL contents)",
  apply_patch: "Edit many files in one patch call (OpenCode format)",
  tunjuk: "Open the page or panel the reader means, from a free-form complaint",
  kotak: "Draw a structured box in the answer: title, summary, label/value rows",
  peta: "Search the Zephyr map: labels, settings, commands, shortcuts, panels, tools, files",
  execute: "Run a script that calls several tools at once (Code Mode)",
};

export const DESKRIPSI_TOOL_JA: Record<string, string> = {
  bash_job: '継続実行されるコマンド（開発サーバー、ウォッチャー）を起動し、ログを読み、停止・クリーンアップする',
  open_link: 'URLを外部ブラウザーまたはブラウザーペインで開く',
  zephyr_kode: 'Zephyr 自身のソースの行番号付き抜粋（baca-kode）：1ファイル、1行範囲、またはシンボル',
  skill_view: '登録済みスキルの内容を読む、またはスキルの一覧を表示する',
  tool_search: 'メイン一覧にないツールを検索する（web、ブラウザー、SSH、MCP、スケジュール）',
  tool_call: 'tool_search で見つかったツールを呼び出す',
  read_file: 'ディスク上のファイル、または未保存のエディタバッファを読み込む',
  list_directory: 'フォルダの内容を一覧表示する',
  write_file: 'ファイルをディスクに書き込む、または新規作成する',
  move_file: 'ファイルやフォルダを移動または名前変更する',
  copy_file: 'ファイルまたはフォルダをコピーする',
  delete_file: 'ファイルまたはフォルダを削除する',
  replace_in_files: '複数ファイルのテキストやパターンを一括置換する',
  multi_edit: '1ファイル内の複数箇所を一度に置換する',
  grep: 'ワークスペース全体からテキストを検索する',
  glob: '名前やパスのパターンでファイルを検索する',
  bash_run: 'コマンドを実行し完了まで待機する',
  run_subagent: '独立したタスク用にサブエージェントを1つ実行する',
  todo_write: 'エージェントのこのタスク用タスク一覧を置き換える',
  ask_user:
    'ユーザーに1つ質問して回答を待つ。考えられる選択肢が本当に異なり、選び間違えると作業が無駄になる場合に限り使う。自分で確認できることに使わない。',
  notes_write: 'ユーザーのノートやタスクを変更する',
  schedule_command: 'コマンドを後で実行するようスケジュールする',
  inspect: '利用可能なコマンド、ペイン、タブ、ワークスペース、設定を調べる',
  run_command: 'IDでアプリのコマンドを実行する',
  open_file: 'エディタでファイルを開く（指定行も可）',
  workspace: 'ワークスペースを表示、作成、切り替える',
  set_setting: 'アプリの設定を1つ変更する',
  extension: '拡張機能を表示、有効化、無効化する',
  ssh: '保存済みのSSH接続を開くか使用する',
  read: 'ターミナル、エディタバッファ、DOMのいずれかを読む',
  sh: 'ユーザーのターミナルペインでコマンドを実行する',
  wait_for_terminal: 'ターミナルの終了または特定テキストの出力を待つ',
  worktree: 'git worktreeを管理する',
  focus_pane: 'クリックせずにペインへフォーカスする',
  pane: 'ペインを開く、分割、閉じる、配置する',
  zephyr_self: 'アプリ自身のソースから Zephyr を調査: 現在の設定・ログ・拡張機能・同梱ドキュメント・バージョン・事実インデックス',
  ingat: 'Zeph AI のセッションをまたぐメモリを保存・検索・整理（グローバル + プロジェクト別）',
  lsp: "言語サーバーに問い合わせる: シンボル、参照、定義、型、診断、呼び出し階層",
  browser: "ブラウザペインを操作: open, read, click, type, list, close, download",
  web: "インターネットから取得: search（検索）または fetch（1つのURLの内容）",
  apply_patch: "1回のパッチ呼び出しで複数ファイルを変更（OpenCode形式）",
  tunjuk: "自由な言葉の不満から、意図したページやパネルを開く",
  kotak: "回答に構造化ボックスを描く: タイトル、要約、ラベル/値の行",
  peta: "Zephyr の地図を検索: ラベル、設定、コマンド、ショートカット、パネル、ツール、ファイル",
  execute: "複数のツールを一度に呼ぶスクリプトを実行（Code Mode）",
};

export const DESKRIPSI_TOOL_KO: Record<string, string> = {
  bash_job: '계속 실행되는 명령(개발 서버, 워처)을 시작하고 로그를 읽고 중지·정리합니다',
  open_link: 'URL을 외부 브라우저나 브라우저 창으로 엽니다',
  zephyr_kode: 'Zephyr 자체 소스의 줄 번호가 붙은 발췌(baca-kode): 파일 하나, 줄 범위 하나, 또는 심볼',
  skill_view: '등록된 스킬의 내용을 읽거나 스킬 목록을 표시합니다',
  tool_search: '기본 목록에 없는 도구를 검색합니다 (web, 브라우저, SSH, MCP, 일정)',
  tool_call: 'tool_search로 찾은 도구를 호출합니다',
  read_file: '디스크의 파일 또는 저장되지 않은 편집기 버퍼를 읽습니다',
  list_directory: '폴더의 내용을 나열합니다',
  write_file: '파일을 디스크에 쓰거나 새 파일을 만듭니다',
  move_file: '파일이나 폴더를 이동하거나 이름을 바꿉니다',
  copy_file: '파일이나 폴더를 복사합니다',
  delete_file: '파일이나 폴더를 삭제합니다',
  replace_in_files: '여러 파일의 텍스트나 패턴을 한 번에 바꿉니다',
  multi_edit: '한 파일에서 여러 바꾸기를 한 번에 적용합니다',
  grep: '워크스페이스 전체에서 텍스트를 검색합니다',
  glob: '이름이나 경로 패턴으로 파일을 찾습니다',
  bash_run: '명령을 실행하고 끝날 때까지 기다립니다',
  run_subagent: '독립적인 작업을 위해 서브에이전트 하나를 실행합니다',
  todo_write: '이 작업의 에이전트 할 일 목록을 교체합니다',
  ask_user:
    '사용자에게 질문 하나를 던지고 답을 기다립니다. 가능한 선택지가 실제로 다르고 잘못 고르면 작업이 낭비될 때만 사용하세요. 직접 확인할 수 있는 일에는 쓰지 마세요.',
  notes_write: '사용자의 노트나 할 일을 수정합니다',
  schedule_command: '나중에 실행할 명령을 예약합니다',
  inspect: '사용 가능한 명령, 페인, 탭, 워크스페이스, 설정을 검사합니다',
  run_command: 'id로 애플리케이션 명령을 실행합니다',
  open_file: '편집기에서 파일을 열고 특정 줄로 이동할 수 있습니다',
  workspace: '워크스페이스를 보거나 만들거나 전환합니다',
  set_setting: '애플리케이션 환경설정 하나를 변경합니다',
  extension: '확장을 보거나 활성화하거나 비활성화합니다',
  ssh: '저장된 SSH 연결을 열거나 사용합니다',
  read: '터미널, 편집기 버퍼, DOM 중 하나를 읽습니다',
  sh: '사용자의 터미널 페인에서 명령을 실행합니다',
  wait_for_terminal: '터미널이 끝나거나 특정 텍스트를 출력할 때까지 기다립니다',
  worktree: 'git worktree를 관리합니다',
  focus_pane: '클릭하지 않고 페인에 포커스를 줍니다',
  pane: '페인을 열거나 분할하거나 닫거나 배치합니다',
  zephyr_self: '앱 자체 소스에서 Zephyr를 점검합니다: 현재 설정, 로그, 확장, 번들 문서, 버전, 사실 인덱스',
  ingat: 'Zeph AI의 세션 간 메모리를 저장·검색·정리합니다(전역 + 프로젝트별 메모리 파일)',
  lsp: "언어 서버에 질문: 심볼, 참조, 정의, 타입, 진단, 호출 계층",
  browser: "브라우저 페인 제어: open, read, click, type, list, close, download",
  web: "인터넷에서 가져오기: search(검색) 또는 fetch(URL 하나의 내용)",
  apply_patch: "한 번의 패치 호출로 여러 파일 수정 (OpenCode 형식)",
  tunjuk: "자유로운 표현의 불만에서 의도한 페이지나 패널을 엽니다",
  kotak: "답변에 구조화된 상자를 그립니다: 제목, 요약, 라벨/값 행",
  peta: "Zephyr 지도 검색: 라벨, 설정, 명령, 단축키, 패널, 도구, 파일",
  execute: "여러 도구를 한 번에 호출하는 스크립트 실행 (Code Mode)",
};

export const DESKRIPSI_TOOL_ZH: Record<string, string> = {
  bash_job: '启动持续运行的命令（开发服务器、监视器），读取日志、停止并清理',
  open_link: '在外部浏览器或浏览器面板中打开 URL',
  zephyr_kode: 'Zephyr 自身源码的带行号片段（baca-kode）：一个文件、一个行范围或一个符号',
  skill_view: '读取已注册技能的内容，或列出技能',
  tool_search: '搜索主列表之外的工具（web、浏览器、SSH、MCP、日程）',
  tool_call: '调用通过 tool_search 找到的工具',
  read_file: '从磁盘读取文件，或读取编辑器中未保存的缓冲区',
  list_directory: '列出某个文件夹的内容',
  write_file: '把文件写入磁盘，或新建一个文件',
  move_file: '移动或重命名文件或文件夹',
  copy_file: '复制文件或文件夹',
  delete_file: '删除文件或文件夹',
  replace_in_files: '在多个文件中同时替换文本或模式',
  multi_edit: '在一步中完成对同一文件的多次替换',
  grep: '在整个工作区中搜索文本',
  glob: '按文件名或路径模式查找文件',
  bash_run: '运行命令并等待其结束',
  run_subagent: '为独立任务运行一个子代理',
  todo_write: '替换该任务下代理的任务列表',
  ask_user:
    '向用户提出一个问题并等待回答。仅在可能的选择确实不同、选错会浪费工作时使用；能自己核实的事不要问。',
  notes_write: '修改用户的笔记或待办',
  schedule_command: '安排一条命令稍后执行',
  inspect: '查看可用的命令、窗格、标签页、工作区或设置',
  run_command: '按 id 运行一个应用命令',
  open_file: '在编辑器中打开文件，可直接定位到某一行',
  workspace: '查看、创建或切换工作区',
  set_setting: '修改一项应用偏好设置',
  extension: '查看、启用或禁用扩展',
  ssh: '打开或使用已保存的 SSH 连接',
  read: '读取一个界面：终端、编辑器缓冲区或 DOM',
  sh: '在用户的终端窗格中运行命令',
  wait_for_terminal: '等待终端结束或输出特定文本',
  worktree: '管理 git worktree',
  focus_pane: '无需点击即可聚焦某个窗格',
  pane: '打开、拆分、关闭或排列窗格',
  zephyr_self: '从应用自身来源检查 Zephyr：当前设置、日志、扩展、随附文档、版本、事实索引',
  ingat: '保存、检索和整理 Zeph AI 的跨会话记忆（全局 + 按项目的记忆文件）',
  lsp: "询问语言服务器：符号、引用、定义、类型、诊断或调用层级",
  browser: "控制浏览器窗格：open、read、click、type、list、close、download",
  web: "从互联网获取：search（搜索）或 fetch（获取单个 URL 的内容）",
  apply_patch: "一次补丁调用修改多个文件（OpenCode 格式）",
  tunjuk: "根据自由表达的困扰，打开用户想要的页面或面板",
  kotak: "在回答中绘制结构化方框：标题、摘要、标签/值行",
  peta: "搜索 Zephyr 地图：标签、设置、命令、快捷键、面板、工具、文件",
  execute: "运行一次调用多个工具的脚本（Code Mode）",
};

export const DESKRIPSI_TOOL_ES: Record<string, string> = {
  bash_job: 'Inicia un comando que sigue corriendo (servidor de desarrollo, watcher), lee su registro, deténelo y límpielo',
  open_link: 'Abre una URL en el navegador externo o en el panel del navegador',
  zephyr_kode: 'Fragmentos con numeros de linea del propio codigo de Zephyr (baca-kode): un archivo, un rango de lineas o un simbolo',
  skill_view: 'Lee el contenido de una habilidad registrada, o lista las habilidades',
  tool_search: 'Busca una herramienta que no está en la lista principal (web, navegador, SSH, MCP, agenda)',
  tool_call: 'Llama a una herramienta encontrada con tool_search',
  read_file: 'Leer un archivo del disco o un búfer sin guardar del editor',
  list_directory: 'Listar el contenido de una carpeta',
  write_file: 'Escribir un archivo en disco o crear uno nuevo',
  move_file: 'Mover o renombrar un archivo o carpeta',
  copy_file: 'Copiar un archivo o carpeta',
  delete_file: 'Eliminar un archivo o carpeta',
  replace_in_files: 'Reemplazar texto o un patrón en muchos archivos a la vez',
  multi_edit: 'Varios reemplazos en un solo archivo en un solo paso',
  grep: 'Buscar texto en todo el espacio de trabajo',
  glob: 'Buscar archivos por patrón de nombre o de ruta',
  bash_run: 'Ejecutar un comando y esperar a que termine',
  run_subagent: 'Ejecutar un subagente para una tarea autónoma',
  todo_write: 'Reemplazar la lista de tareas del agente para esta tarea',
  ask_user:
    'Preguntar al usuario una sola cosa y esperar su respuesta. Úsalo SOLO cuando las opciones plausibles difieran de verdad y elegir mal desperdicie trabajo; nunca para algo que puedas comprobar tú mismo.',
  notes_write: 'Cambiar las notas o tareas pendientes del usuario',
  schedule_command: 'Programar un comando para ejecutarlo más tarde',
  inspect: 'Inspeccionar los comandos, paneles, pestañas, espacios de trabajo o ajustes disponibles',
  run_command: 'Ejecutar un comando de la aplicación por su id',
  open_file: 'Abrir un archivo en el editor, opcionalmente en una línea concreta',
  workspace: 'Ver, crear o cambiar de espacio de trabajo',
  set_setting: 'Cambiar una preferencia de la aplicación',
  extension: 'Ver, activar o desactivar extensiones',
  ssh: 'Abrir o usar una conexión SSH guardada',
  read: 'Leer una superficie de la interfaz: terminal, búfer del editor o DOM',
  sh: 'Ejecutar un comando en el panel de terminal del usuario',
  wait_for_terminal: 'Esperar a que el terminal termine o muestre cierto texto',
  worktree: 'Gestionar los worktrees de git',
  focus_pane: 'Enfocar un panel sin hacer clic en él',
  pane: 'Abrir, dividir, cerrar u organizar paneles',
  zephyr_self: 'Inspeccionar el propio Zephyr desde fuentes de la app: ajustes actuales, registro, extensiones, documentos incluidos, versión e índice de datos',
  ingat: 'Guardar, buscar y ordenar la memoria entre sesiones de Zeph AI (archivos de memoria global y por proyecto)',
  lsp: "Preguntar al servidor de lenguaje: símbolos, referencias, definición, tipo, diagnósticos o jerarquía de llamadas",
  browser: "Controlar el panel del navegador: open, read, click, type, list, close, download",
  web: "Obtener de internet: search (buscar) o fetch (contenido de una URL)",
  apply_patch: "Editar muchos archivos en una llamada de parche (formato OpenCode)",
  tunjuk: "Abrir la página o el panel que el lector quiere, desde una queja libre",
  kotak: "Dibujar un cuadro estructurado en la respuesta: título, resumen, filas etiqueta/valor",
  peta: "Buscar en el mapa de Zephyr: etiquetas, ajustes, comandos, atajos, paneles, herramientas, archivos",
  execute: "Ejecutar un script que llama a varias herramientas a la vez (Code Mode)",
};

export const DESKRIPSI_TOOL_FR: Record<string, string> = {
  bash_job: 'Lance une commande qui tourne en continu (serveur de dev, watcher), lit ses logs, l\u2019arrête et nettoie',
  open_link: 'Ouvre une URL dans le navigateur externe ou le panneau navigateur',
  zephyr_kode: 'Extraits avec numeros de ligne du code source de Zephyr (baca-kode) : un fichier, une plage de lignes ou un symbole',
  skill_view: "Lit le contenu d'une compétence enregistrée, ou liste les compétences",
  tool_search: 'Cherche un outil absent de la liste principale (web, navigateur, SSH, MCP, planning)',
  tool_call: 'Appelle un outil trouvé via tool_search',
  read_file: 'Lire un fichier sur le disque, ou un tampon d\'éditeur non enregistré',
  list_directory: 'Lister le contenu d\'un dossier',
  write_file: 'Écrire un fichier sur le disque, ou en créer un nouveau',
  move_file: 'Déplacer ou renommer un fichier ou un dossier',
  copy_file: 'Copier un fichier ou un dossier',
  delete_file: 'Supprimer un fichier ou un dossier',
  replace_in_files: 'Remplacer un texte ou un motif dans plusieurs fichiers à la fois',
  multi_edit: 'Plusieurs remplacements dans un même fichier en une seule étape',
  grep: 'Rechercher un texte dans tout l\'espace de travail',
  glob: 'Trouver des fichiers par nom ou motif de chemin',
  bash_run: 'Exécuter une commande et attendre la fin',
  run_subagent: 'Lancer un sous-agent pour une tâche autonome',
  todo_write: 'Remplacer la liste de tâches de l\'agent pour cette tâche',
  ask_user:
    'Poser une seule question à l\'utilisateur et attendre sa réponse. À utiliser UNIQUEMENT quand les choix plausibles diffèrent vraiment et qu\'un mauvais choix gâcherait du travail ; jamais pour ce que tu peux vérifier toi-même.',
  notes_write: 'Modifier les notes ou tâches de l\'utilisateur',
  schedule_command: 'Programmer une commande pour une exécution ultérieure',
  inspect: 'Inspecter les commandes, volets, onglets, espaces de travail ou réglages disponibles',
  run_command: 'Lancer une commande de l\'application par son identifiant',
  open_file: 'Ouvrir un fichier dans l\'éditeur, éventuellement à une ligne précise',
  workspace: 'Voir, créer ou changer d\'espace de travail',
  set_setting: 'Modifier une préférence de l\'application',
  extension: 'Voir, activer ou désactiver des extensions',
  ssh: 'Ouvrir ou utiliser une connexion SSH enregistrée',
  read: 'Lire une surface : terminal, tampon d\'éditeur ou DOM',
  sh: 'Exécuter une commande dans le volet terminal de l\'utilisateur',
  wait_for_terminal: 'Attendre que le terminal finisse ou affiche un texte précis',
  worktree: 'Gérer les git worktrees',
  focus_pane: 'Donner le focus à un volet sans cliquer',
  pane: 'Ouvrir, diviser, fermer ou organiser les volets',
  zephyr_self: 'Inspecter Zephyr lui-même depuis les sources de l’application : réglages actifs, journal, extensions, documents embarqués, version, index des faits',
  ingat: 'Enregistrer, rechercher et ranger la mémoire inter-sessions de Zeph AI (fichiers mémoire globaux et par projet)',
  lsp: "Interroger le serveur de langage : symboles, références, définition, type, diagnostics ou hiérarchie des appels",
  browser: "Contrôler le volet navigateur : open, read, click, type, list, close, download",
  web: "Récupérer depuis internet : search (rechercher) ou fetch (contenu d'une URL)",
  apply_patch: "Modifier plusieurs fichiers en un seul appel de patch (format OpenCode)",
  tunjuk: "Ouvrir la page ou le volet voulu, à partir d'une plainte en langage libre",
  kotak: "Dessiner un encadré structuré dans la réponse : titre, résumé, lignes libellé/valeur",
  peta: "Rechercher dans la carte Zephyr : libellés, réglages, commandes, raccourcis, panneaux, outils, fichiers",
  execute: "Exécuter un script qui appelle plusieurs outils à la fois (Code Mode)",
};

export const DESKRIPSI_TOOL_DE: Record<string, string> = {
  bash_job: 'Startet einen dauerhaft laufenden Befehl (Dev-Server, Watcher), liest seine Logs, stoppt und räumt auf',
  open_link: 'Öffnet eine URL im externen Browser oder im Browser-Panel',
  zephyr_kode: 'Zeilenweise nummerierte Ausschnitte aus Zephyrs eigenem Quellcode (baca-kode): eine Datei, ein Zeilenbereich oder ein Symbol',
  skill_view: 'Liest den Inhalt eines registrierten Skills oder listet die Skills auf',
  tool_search: 'Sucht ein Werkzeug, das nicht in der Hauptliste steht (Web, Browser, SSH, MCP, Zeitplan)',
  tool_call: 'Ruft ein über tool_search gefundenes Werkzeug auf',
  read_file: 'Eine Datei von der Festplatte oder einen ungespeicherten Editor-Puffer lesen',
  list_directory: 'Den Inhalt eines Ordners auflisten',
  write_file: 'Eine Datei auf die Festplatte schreiben oder neu anlegen',
  move_file: 'Eine Datei oder einen Ordner verschieben oder umbenennen',
  copy_file: 'Eine Datei oder einen Ordner kopieren',
  delete_file: 'Eine Datei oder einen Ordner löschen',
  replace_in_files: 'Text oder ein Muster in vielen Dateien auf einmal ersetzen',
  multi_edit: 'Mehrere Ersetzungen in einer Datei in einem Schritt',
  grep: 'Text im gesamten Workspace suchen',
  glob: 'Dateien anhand eines Namens- oder Pfadmusters finden',
  bash_run: 'Einen Befehl ausführen und auf den Abschluss warten',
  run_subagent: 'Einen Subagenten für eine eigenständige Aufgabe ausführen',
  todo_write: 'Die Aufgabenliste des Agenten für diese Aufgabe ersetzen',
  ask_user:
    'Dem Nutzer eine einzige Frage stellen und auf die Antwort warten. NUR verwenden, wenn die möglichen Optionen wirklich verschieden sind und eine falsche Wahl Arbeit verschwendet; nie für etwas, das du selbst prüfen kannst.',
  notes_write: 'Die Notizen oder Aufgaben des Nutzers ändern',
  schedule_command: 'Einen Befehl für die spätere Ausführung planen',
  inspect: 'Verfügbare Befehle, Panes, Tabs, Workspaces oder Einstellungen prüfen',
  run_command: 'Einen Anwendungsbefehl anhand seiner ID ausführen',
  open_file: 'Eine Datei im Editor öffnen, optional an einer bestimmten Zeile',
  workspace: 'Einen Workspace anzeigen, anlegen oder wechseln',
  set_setting: 'Eine einzelne Anwendungseinstellung ändern',
  extension: 'Erweiterungen anzeigen, aktivieren oder deaktivieren',
  ssh: 'Eine gespeicherte SSH-Verbindung öffnen oder nutzen',
  read: 'Eine Oberfläche lesen: Terminal, Editor-Puffer oder DOM',
  sh: 'Einen Befehl im Terminal-Pane des Nutzers ausführen',
  wait_for_terminal: 'Warten, bis das Terminal fertig ist oder bestimmten Text ausgibt',
  worktree: 'Git-Worktrees verwalten',
  focus_pane: 'Ein Pane fokussieren, ohne es anzuklicken',
  pane: 'Panes öffnen, teilen, schließen oder anordnen',
  zephyr_self: 'Zephyr selbst aus app-eigenen Quellen prüfen: aktive Einstellungen, Log, Erweiterungen, mitgelieferte Doku, Version, Faktenindex',
  ingat: 'Sitzungsübergreifenden Speicher von Zeph AI speichern, durchsuchen und aufräumen (globale und projektspezifische Speicherdateien)',
  lsp: "Den Language-Server fragen: Symbole, Referenzen, Definition, Typ, Diagnose oder Aufrufhierarchie",
  browser: "Den Browser-Bereich steuern: open, read, click, type, list, close, download",
  web: "Aus dem Internet holen: search (suchen) oder fetch (Inhalt einer URL)",
  apply_patch: "Viele Dateien in einem Patch-Aufruf ändern (OpenCode-Format)",
  tunjuk: "Die gemeinte Seite oder den Bereich aus einer freien Beschwerde öffnen",
  kotak: "Eine strukturierte Box in der Antwort zeichnen: Titel, Zusammenfassung, Label/Wert-Zeilen",
  peta: "Die Zephyr-Karte durchsuchen: Labels, Einstellungen, Befehle, Tastenkürzel, Bereiche, Werkzeuge, Dateien",
  execute: "Ein Skript ausführen, das mehrere Werkzeuge auf einmal aufruft (Code Mode)",
};

export const DESKRIPSI_TOOL_PT: Record<string, string> = {
  bash_job: 'Inicia um comando que continua rodando (servidor de dev, watcher), lê o log, para e limpa',
  open_link: 'Abre uma URL no navegador externo ou no painel do navegador',
  zephyr_kode: 'Trechos com numeros de linha do proprio codigo do Zephyr (baca-kode): um arquivo, um intervalo de linhas ou um simbolo',
  skill_view: 'Lê o conteúdo de uma habilidade registrada, ou lista as habilidades',
  tool_search: 'Procura uma ferramenta fora da lista principal (web, navegador, SSH, MCP, agenda)',
  tool_call: 'Chama uma ferramenta encontrada via tool_search',
  read_file: 'Ler um arquivo do disco, ou um buffer do editor ainda não salvo',
  list_directory: 'Listar o conteúdo de uma pasta',
  write_file: 'Gravar um arquivo no disco, ou criar um novo',
  move_file: 'Mover ou renomear um arquivo ou pasta',
  copy_file: 'Copiar um arquivo ou pasta',
  delete_file: 'Excluir um arquivo ou pasta',
  replace_in_files: 'Substituir texto ou padrão em vários arquivos de uma vez',
  multi_edit: 'Várias substituições em um arquivo, em um único passo',
  grep: 'Procurar texto em todo o workspace',
  glob: 'Achar arquivos por padrão de nome ou caminho',
  bash_run: 'Executar um comando e esperar até terminar',
  run_subagent: 'Executar um subagente para uma tarefa autocontida',
  todo_write: 'Substituir a lista de tarefas do agente para esta tarefa',
  ask_user:
    'Perguntar ao usuário uma única coisa e esperar a resposta. Use SOMENTE quando as opções plausíveis diferirem de fato e escolher errado desperdiçar trabalho; nunca para algo que você mesmo pode verificar.',
  notes_write: 'Alterar as notas ou tarefas do usuário',
  schedule_command: 'Agendar um comando para rodar mais tarde',
  inspect: 'Inspecionar comandos, painéis, abas, workspaces ou configurações disponíveis',
  run_command: 'Executar um comando do aplicativo pelo id',
  open_file: 'Abrir um arquivo no editor, opcionalmente em uma linha específica',
  workspace: 'Ver, criar ou trocar de workspace',
  set_setting: 'Alterar uma preferência do aplicativo',
  extension: 'Ver, ativar ou desativar extensões',
  ssh: 'Abrir ou usar uma conexão SSH salva',
  read: 'Ler uma superfície: terminal, buffer do editor ou DOM',
  sh: 'Executar um comando no painel de terminal do usuário',
  wait_for_terminal: 'Esperar o terminal terminar ou imprimir um texto específico',
  worktree: 'Gerenciar worktrees do git',
  focus_pane: 'Focar um painel sem clicar nele',
  pane: 'Abrir, dividir, fechar ou organizar painéis',
  zephyr_self: 'Inspecionar o próprio Zephyr a partir de fontes do app: configurações ativas, log, extensões, documentos incluídos, versão e índice de fatos',
  ingat: 'Salvar, pesquisar e organizar a memória entre sessões do Zeph AI (arquivos de memória global e por projeto)',
  lsp: "Perguntar ao servidor de linguagem: símbolos, referências, definição, tipo, diagnósticos ou hierarquia de chamadas",
  browser: "Controlar o painel do navegador: open, read, click, type, list, close, download",
  web: "Obter da internet: search (pesquisar) ou fetch (conteúdo de uma URL)",
  apply_patch: "Editar muitos arquivos em uma chamada de patch (formato OpenCode)",
  tunjuk: "Abrir a página ou o painel que o leitor quer, a partir de uma queixa livre",
  kotak: "Desenhar uma caixa estruturada na resposta: título, resumo, linhas rótulo/valor",
  peta: "Pesquisar no mapa do Zephyr: rótulos, ajustes, comandos, atalhos, painéis, ferramentas, arquivos",
  execute: "Executar um script que chama várias ferramentas de uma vez (Code Mode)",
};

export const DESKRIPSI_TOOL_AR: Record<string, string> = {
  bash_job: 'يبدأ أمرًا يعمل باستمرار (خادم تطوير، مراقب)، ويقرأ سجله، ويوقفه وينظفه',
  open_link: 'يفتح رابط URL في المتصفح الخارجي أو لوحة المتصفح',
  zephyr_kode: 'مقتطفات مرقمة الأسطر من مصدر Zephyr نفسه (baca-kode): ملف واحد أو نطاق أسطر أو رمز',
  skill_view: 'يقرأ محتوى مهارة مسجلة، أو يعرض قائمة المهارات',
  tool_search: 'يبحث عن أداة غير موجودة في القائمة الرئيسية (ويب، متصفح، SSH، MCP، جدول)',
  tool_call: 'يستدعي أداة عُثر عليها عبر tool_search',
  read_file: 'يقرأ ملفاً من القرص أو من المخزن المؤقت غير المحفوظ للمحرر',
  list_directory: 'يسرد محتويات مجلد',
  write_file: 'يكتب ملفاً على القرص أو ينشئ ملفاً جديداً',
  move_file: 'ينقل أو يعيد تسمية ملف أو مجلد',
  copy_file: 'ينسخ ملفاً أو مجلداً',
  delete_file: 'يحذف ملفاً أو مجلداً',
  replace_in_files: 'يستبدل نصاً أو نمطاً في عدة ملفات دفعة واحدة',
  multi_edit: 'ينفّذ عدة استبدالات في ملف واحد بخطوة واحدة',
  grep: 'يبحث عن نص في كل مساحة العمل',
  glob: 'يبحث عن ملفات بنمط الاسم أو المسار',
  bash_run: 'يشغّل أمراً وينتظر انتهاءه',
  run_subagent: 'يشغّل وكيلاً فرعياً لمهمة مستقلة',
  todo_write: 'يستبدل قائمة مهام الوكيل لهذه المهمة',
  ask_user:
    'اسأل المستخدم سؤالاً واحداً وانتظر جوابه. استخدمه فقط عندما تكون الخيارات المحتملة مختلفة فعلاً واختيار الخطأ يهدر العمل؛ لا تستخدمه لما يمكنك التحقق منه بنفسك.',
  notes_write: 'يغيّر ملاحظات المستخدم أو مهامه',
  schedule_command: 'يُجدول أمراً ليعمل لاحقاً',
  inspect: 'يفحص الأوامر أو الأجزاء أو التبويبات أو مساحات العمل أو الإعدادات',
  run_command: 'يشغّل أمراً في التطبيق بواسطة معرّفه',
  open_file: 'يفتح ملفاً في المحرر، ويمكن فتحه عند سطر محدد',
  workspace: 'يعرض مساحة العمل أو ينشئها أو يبدّلها',
  set_setting: 'يغيّر تفضيلاً واحداً في التطبيق',
  extension: 'يعرض الإضافات أو يفعّلها أو يعطّلها',
  ssh: 'يفتح اتصال SSH محفوظاً أو يستخدمه',
  read: 'يقرأ سطحاً واحداً: الطرفية أو المخزن المؤقت للمحرر أو DOM',
  sh: 'يشغّل أمراً في جزء الطرفية الخاصة بالمستخدم',
  wait_for_terminal: 'ينتظر حتى تنتهي الطرفية أو تطبع نصاً معيناً',
  worktree: 'يدير أشجار عمل git',
  focus_pane: 'يركّز على جزء دون النقر عليه',
  pane: 'يفتح الأجزاء أو يقسّمها أو يغلقها أو يرتبها',
  zephyr_self: 'افحص Zephyr نفسه من مصادر التطبيق: الإعدادات الحالية والسجل والإضافات والمستندات المضمّنة والإصدار وفهرس الحقائق',
  ingat: 'احفظ وابحث ونظّم ذاكرة Zeph AI عبر الجلسات (ملفات ذاكرة عامة ولكل مشروع)',
  lsp: "اسأل خادم اللغة: الرموز، المراجع، التعريف، النوع، التشخيصات، أو تسلسل النداءات",
  browser: "تحكم في جزء المتصفح: open، read، click، type، list، close، download",
  web: "اجلب من الإنترنت: search (بحث) أو fetch (محتوى رابط واحد)",
  apply_patch: "عدّل ملفات كثيرة في نداء تصحيح واحد (صيغة OpenCode)",
  tunjuk: "افتح الصفحة أو الجزء المقصود من شكوى بالكلمات الحرة",
  kotak: "ارسم صندوقاً منظّماً في الإجابة: عنوان، ملخص، صفوف تسمية/قيمة",
  peta: "ابحث في خريطة Zephyr: التسميات، الإعدادات، الأوامر، الاختصارات، الأجزاء، الأدوات، الملفات",
  execute: "شغّل نصاً يستدعي عدة أدوات دفعة واحدة (Code Mode)",
};

/*
 * `POLA_AWALAN_MCP` sekarang datang dari `awalan.ts` - satu definisi untuk
 * seluruh aplikasi. Diekspor ulang dari sini karena `deskripsiToolHook.ts` dan
 * `verify-deskripsi-tool-8bahasa.mjs` mengimpornya lewat berkas ini.
 *
 * Kenapa tidak diimpor dari `catalog.ts` saja: katalog sudah mengimpor berkas
 * ini, jadi arah sebaliknya akan membuat lingkaran impor.
 */

/**
 * Kode bahasa -> peta deskripsi.
 *
 * Kuncinya persis kode bahasa yang dipakai `i18n.ts` (`DICTS`) dan
 * `i18n-extra.ts` (`EXTRA`): id, en, ja, ko, zh, es, fr, de, pt, ar. Menambah
 * bahasa di antarmuka TIDAK otomatis menambah peta di sini - bahasa yang tidak
 * terdaftar jatuh ke Inggris, dan itu memang perilaku yang diinginkan: lebih
 * baik membaca Inggris daripada tidak membaca apa pun.
 */
const PETA_DESKRIPSI: Record<string, Record<string, string>> = {
  id: DESKRIPSI_TOOL_ID,
  en: DESKRIPSI_TOOL_EN,
  ja: DESKRIPSI_TOOL_JA,
  ko: DESKRIPSI_TOOL_KO,
  zh: DESKRIPSI_TOOL_ZH,
  es: DESKRIPSI_TOOL_ES,
  fr: DESKRIPSI_TOOL_FR,
  de: DESKRIPSI_TOOL_DE,
  pt: DESKRIPSI_TOOL_PT,
  ar: DESKRIPSI_TOOL_AR,
};

/**
 * Deskripsi satu tool dalam bahasa yang diminta.
 *
 * Bahasa selain `id` memakai teks Inggris. Nama yang tidak dikenal
 * mengembalikan string kosong, bukan teks Indonesia: deskripsi kosong membuat
 * panel menyembunyikan barisnya (lihat ToolGatePanel), sedangkan teks asing
 * yang muncul begitu saja lebih membingungkan daripada tidak ada teks.
 */
export function deskripsiTool(nama: string, bahasa: string): string {
  /*
   * Awalan protokol MCP dilepas di sini.
   *
   * Katalog menyimpan tool MCP dengan nama lengkap `mcp__zephyr__inspect`,
   * sedangkan semua peta di atas memakai nama polos `inspect` - nama polos itu
   * yang bermakna bagi pembaca. Tanpa pelepasan ini, keempat belas tool MCP
   * tampil TANPA deskripsi: terbukti dari uji, 14 deskripsi kosong dan
   * semuanya berawalan `mcp__zephyr__`.
   */
  const polos = nama.replace(POLA_AWALAN_MCP, '');

  /*
   * Bahasa aktif dicoba LEBIH DULU, lalu Inggris sebagai jaring terakhir.
   *
   * Sebelumnya baris ini hanya mengenal dua peta (`id` dan `en`), sehingga
   * delapan bahasa yang lain - yang di antarmuka sudah diterjemahkan penuh,
   * lihat `i18n-extra.ts` - membaca teks Inggris di panel Tools. Keluhannya
   * sama dengan yang dulu melahirkan `cek-panel-tools-bahasa.mjs` ("tools nya
   * masih bahasa indonesia"), hanya berpindah bahasa.
   *
   * Urutannya `PETA[bahasa] ?? EN`, bukan `PETA[bahasa] ?? ''`: kunci yang
   * belum ada terjemahannya harus jatuh ke Inggris, bukan menghilang. Deskripsi
   * kosong membuat panel MENYEMBUNYIKAN barisnya (lihat ToolGatePanel), jadi
   * kegagalan menerjemahkan satu kunci akan tampak seperti tool yang tidak ada.
   *
   * `nama` (lengkap, berawalan) dicoba sebagai cadangan terakhir: kunci peta
   * memang nama polos, tapi kalau suatu saat ada entri yang sengaja ditulis
   * dengan awalan, pencarian ini yang menemukannya.
   */
  const peta = PETA_DESKRIPSI[bahasa];
  return peta?.[polos] ?? DESKRIPSI_TOOL_EN[polos] ?? peta?.[nama] ?? DESKRIPSI_TOOL_EN[nama] ?? '';
}

