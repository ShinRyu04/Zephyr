/*
 * Catatan rilis 1.1.13, 10 bahasa.
 *
 * Isinya HANYA yang benar-benar berubah dan sudah dibuktikan - bukan rencana,
 * bukan "seharusnya". Setiap butir di bawah punya uji atau bukti dari aplikasi
 * yang hidup; yang belum terbukti tidak ditulis di sini.
 */
import fs from 'node:fs';

const VERSI = '1.1.13';
const DIR = `release/${VERSI}/notes`;
fs.mkdirSync(DIR, { recursive: true });

const catatan = {
  en: `# Zephyr v${VERSI}

## AI

- A provider that accepts the connection and then goes quiet no longer locks the
  app. The retry ladder now has a total budget, so Zephyr always reports back
  before the UI gives up. Previously the frontend could stop waiting while Rust
  was still running, and late text landed on whatever you were typing.
- Continue appears when a run times out on its FIRST step. It used to require
  reply text, so the button was missing exactly when a big payload was refused -
  the case it exists for.
- The reason for a failure appears once. It used to be printed twice: as the
  bubble and again as the error chip underneath.
- Text and tool calls that already arrived are kept when an error comes in the
  same packet. Narrative ("Let me check the folder, then continue") no longer
  disappears, and the tool the model asked for actually runs.
- Reasoning is visible while the model is thinking, not only after it finishes -
  and it is no longer shown twice.
- Tool descriptions are translated into all 10 languages. 448 descriptions, one
  per tool per language. Previously 8 languages silently fell back to English,
  which changed the model's answers, not just the screen.

## Fixes

- The Run tool executed in the installation folder when the workspace was not
  yet synced. It now uses the workspace root, and refuses clearly instead of
  running somewhere unexpected.
- A persona no longer deletes the operational rules. Custom instructions used to
  replace the built-in "one step, one tool call, report failures" block entirely.
- The Active workspace is visible on first launch instead of only after
  switching.
- DeepSeek tool markers no longer leak into the chat as raw text.
- The browser pane stops at a page instead of scrolling forever when it gets a
  redirect loop.

## Verified

- 290 Rust unit tests, 0 TypeScript errors.
- Windows and Linux bundles built and signed.
`,

  id: `# Zephyr v${VERSI}

## AI

- Provider yang menerima koneksi lalu diam tidak lagi mengunci aplikasi. Tangga
  ulang sekarang punya anggaran waktu total, jadi Zephyr selalu melapor sebelum
  antarmuka menyerah. Sebelumnya frontend bisa berhenti menunggu sementara Rust
  masih bekerja, dan teks yang terlambat menempel ke apa yang sedang Anda ketik.
- Tombol Lanjut muncul saat sebuah run habis waktu di LANGKAH PERTAMA. Dulu ia
  mensyaratkan ada teks balasan, jadi tombolnya hilang justru saat payload besar
  ditolak - kasus yang membuat tombol itu ada.
- Alasan kegagalan tampil sekali. Sebelumnya tercetak dua kali: sebagai bubble
  dan lagi sebagai chip error di bawahnya.
- Teks dan tool call yang sudah datang tetap disimpan ketika error menyusul di
  paket yang sama. Narasi ("Aku cek dulu isi foldernya, lalu lanjut") tidak lagi
  hilang, dan tool yang diminta model benar-benar dijalankan.
- Penalaran terlihat sementara model berpikir, bukan hanya setelah selesai - dan
  tidak lagi tampil dua kali.
- Deskripsi tool diterjemahkan ke seluruh 10 bahasa. 448 deskripsi, satu per tool
  per bahasa. Sebelumnya 8 bahasa diam-diam jatuh ke Inggris, dan itu mengubah
  jawaban model, bukan hanya tampilan.

## Perbaikan

- Tool Run berjalan di folder instalasi ketika workspace belum tersinkron.
  Sekarang memakai akar workspace, dan menolak dengan jelas alih-alih berjalan di
  tempat yang tidak Anda duga.
- Persona tidak lagi menghapus aturan operasional. Instruksi khusus dulu
  menggantikan seluruh blok bawaan "satu langkah, satu tool call, sebutkan
  kegagalan".
- Workspace aktif terlihat sejak awal, bukan hanya setelah berpindah.
- Marker tool DeepSeek tidak lagi bocor ke percakapan sebagai teks mentah.
- Pane browser berhenti di halaman, tidak menggulir terus saat menemui
  pengalihan berulang.

## Terverifikasi

- 290 tes unit Rust, 0 error TypeScript.
- Bundel Windows dan Linux dibangun dan ditandatangani.
`,

  ja: `# Zephyr v${VERSI}

## AI

- 接続は受け付けるが応答しないプロバイダでアプリが固まらなくなりました。再試行のはしごに総時間の上限を設けたため、Zephyr は UI が諦める前に必ず報告します。以前は Rust がまだ動いているのにフロントエンドが待つのをやめ、遅れて届いたテキストが入力中の文章に紛れ込むことがありました。
- 最初のステップでタイムアウトしたときに「続行」が表示されます。以前は返答テキストが必要条件だったため、大きなペイロードが拒否されたまさにその場面でボタンが出ませんでした。
- 失敗の理由は一度だけ表示されます。以前はバブルと下のエラーチップで二重に出ていました。
- 同じパケットでエラーが来ても、すでに届いたテキストとツール呼び出しは保持されます。ナレーション（「まずフォルダを確認します」）が消えなくなり、モデルが求めたツールが実際に実行されます。
- 推論はモデルが考えている間から見えます。終わってからだけではなく、二重表示もなくなりました。
- ツールの説明を 10 言語すべてに翻訳しました。448 件、ツールごとに各言語 1 件。以前は 8 言語が英語に戻り、画面だけでなくモデルの回答も変わっていました。

## 修正

- ワークスペースが未同期のとき、実行ツールがインストール先フォルダで動いていました。今はワークスペースのルートを使い、想定外の場所で動かす代わりに明確に拒否します。
- ペルソナが運用ルールを削除しなくなりました。
- アクティブなワークスペースが起動直後から見えます。
- DeepSeek のツールマーカーが生テキストとして漏れなくなりました。
- ブラウザペインはリダイレクトループでも無限にスクロールせず停止します。

## 検証済み

- Rust 単体テスト 290 件、TypeScript エラー 0 件。
- Windows と Linux のバンドルをビルドして署名済み。
`,

  ko: `# Zephyr v${VERSI}

## AI

- 연결은 받지만 응답하지 않는 공급자 때문에 앱이 멈추지 않습니다. 재시도 사다리에 전체 시간 예산을 두어 Zephyr가 항상 UI보다 먼저 보고합니다. 이전에는 Rust가 아직 실행 중인데 프런트엔드가 먼저 포기했고, 늦게 도착한 텍스트가 입력 중인 문장에 섞였습니다.
- 첫 단계에서 시간 초과되면 이어하기가 나타납니다. 이전에는 답변 텍스트가 조건이어서, 큰 페이로드가 거부된 바로 그 상황에서 버튼이 없었습니다.
- 실패 이유가 한 번만 표시됩니다. 이전에는 버블과 아래 오류 칩에 두 번 나왔습니다.
- 같은 패킷에 오류가 와도 이미 도착한 텍스트와 도구 호출은 보존됩니다. 내레이션("먼저 폴더를 확인할게요")이 사라지지 않고, 모델이 요청한 도구가 실제로 실행됩니다.
- 추론은 모델이 생각하는 동안 보입니다. 끝난 뒤에만 보이던 것과 중복 표시가 모두 사라졌습니다.
- 도구 설명이 10개 언어 모두로 번역되었습니다. 448개, 도구마다 언어별 1개. 이전에는 8개 언어가 영어로 되돌아갔고, 이는 화면뿐 아니라 모델의 답변도 바꿨습니다.

## 수정

- 워크스페이스가 동기화되지 않았을 때 실행 도구가 설치 폴더에서 동작했습니다. 이제 워크스페이스 루트를 사용하고, 예상 밖의 위치에서 실행하는 대신 명확히 거부합니다.
- 페르소나가 운영 규칙을 더 이상 삭제하지 않습니다.
- 활성 워크스페이스가 첫 실행부터 보입니다.
- DeepSeek 도구 마커가 원시 텍스트로 새지 않습니다.
- 브라우저 페인이 리디렉션 루프에서 무한 스크롤하지 않고 멈춥니다.

## 검증됨

- Rust 단위 테스트 290개, TypeScript 오류 0개.
- Windows와 Linux 번들 빌드 및 서명 완료.
`,

  zh: `# Zephyr v${VERSI}

## AI

- 接受连接后却不响应的提供方不再让应用卡住。重试阶梯现在有总时间预算，因此 Zephyr 总是在界面放弃之前先回报。此前 Rust 仍在运行时前端就可能停止等待，迟到的文本会混进你正在输入的内容。
- 在第一步超时后会出现"继续"。此前它要求有回复文本，所以恰恰在大负载被拒时按钮消失了。
- 失败原因只显示一次。此前会显示两次：气泡里一次，下面的错误条里又一次。
- 同一个包里带着错误一起到达的文本和工具调用会被保留。叙述（"我先看一下文件夹，然后继续"）不再消失，模型请求的工具也会真正执行。
- 模型思考期间就能看到推理过程，而不只是结束后；重复显示也已修正。
- 工具描述已翻译为全部 10 种语言。448 条，每个工具每种语言一条。此前 8 种语言会静默回退到英语，这改变的不只是界面，还有模型的回答。

## 修复

- 工作区尚未同步时，运行工具会在安装目录里执行。现在使用工作区根目录，并明确拒绝，而不是在你没预料的位置执行。
- 角色设定不再删除操作规则。
- 活动工作区在首次启动时即可见。
- DeepSeek 工具标记不再以原始文本泄漏到对话中。
- 浏览器面板遇到重定向循环时停止，而不是一直滚动。

## 已验证

- 290 个 Rust 单元测试，0 个 TypeScript 错误。
- Windows 与 Linux 安装包已构建并签名。
`,

  es: `# Zephyr v${VERSI}

## IA

- Un proveedor que acepta la conexión y luego se queda callado ya no bloquea la
  aplicación. La escalera de reintentos ahora tiene un presupuesto total, así que
  Zephyr siempre responde antes de que la interfaz se rinda. Antes el frontend
  podía dejar de esperar mientras Rust seguía trabajando, y el texto tardío caía
  sobre lo que estuvieras escribiendo.
- Continuar aparece cuando una ejecución agota el tiempo en su PRIMER paso. Antes
  exigía texto de respuesta, así que faltaba justo cuando se rechaza un payload
  grande, que es el caso para el que existe.
- El motivo del fallo aparece una vez. Antes se imprimía dos veces: en la burbuja
  y otra vez en el aviso de error debajo.
- El texto y las llamadas a herramientas que ya llegaron se conservan cuando el
  error viene en el mismo paquete. La narración ("Voy a revisar la carpeta y
  sigo") ya no desaparece, y la herramienta que pidió el modelo se ejecuta.
- El razonamiento se ve mientras el modelo piensa, no solo al terminar, y ya no
  se muestra dos veces.
- Las descripciones de herramientas están traducidas a los 10 idiomas. 448
  descripciones, una por herramienta y idioma. Antes 8 idiomas caían en inglés en
  silencio, lo que cambiaba las respuestas del modelo, no solo la pantalla.

## Correcciones

- La herramienta Run se ejecutaba en la carpeta de instalación cuando el
  workspace aún no estaba sincronizado. Ahora usa la raíz del workspace y se
  niega con claridad en lugar de ejecutarse en un lugar inesperado.
- Una persona ya no borra las reglas operativas.
- El workspace activo se ve desde el primer arranque.
- Los marcadores de herramientas de DeepSeek ya no se filtran como texto.
- El panel del navegador se detiene ante un bucle de redirección.

## Verificado

- 290 pruebas unitarias de Rust, 0 errores de TypeScript.
- Paquetes de Windows y Linux compilados y firmados.
`,

  fr: `# Zephyr v${VERSI}

## IA

- Un fournisseur qui accepte la connexion puis reste silencieux ne bloque plus
  l'application. L'échelle de nouvelles tentatives a désormais un budget total,
  donc Zephyr répond toujours avant que l'interface abandonne. Auparavant le
  frontend pouvait cesser d'attendre alors que Rust travaillait encore, et le
  texte tardif arrivait dans ce que vous étiez en train d'écrire.
- Continuer apparaît quand une exécution expire à sa PREMIÈRE étape. Il fallait
  auparavant du texte de réponse, donc le bouton manquait précisément quand une
  grosse charge utile était refusée, le cas pour lequel il existe.
- La raison d'un échec s'affiche une seule fois. Elle s'imprimait deux fois :
  dans la bulle et de nouveau dans l'étiquette d'erreur en dessous.
- Le texte et les appels d'outils déjà reçus sont conservés quand l'erreur arrive
  dans le même paquet. La narration ("Je vérifie le dossier, puis je continue")
  ne disparaît plus, et l'outil demandé par le modèle s'exécute réellement.
- Le raisonnement est visible pendant que le modèle réfléchit, pas seulement à la
  fin, et ne s'affiche plus deux fois.
- Les descriptions d'outils sont traduites dans les 10 langues. 448 descriptions,
  une par outil et par langue. Auparavant 8 langues retombaient en anglais, ce
  qui changeait les réponses du modèle, pas seulement l'écran.

## Corrections

- L'outil Run s'exécutait dans le dossier d'installation quand l'espace de
  travail n'était pas encore synchronisé. Il utilise maintenant la racine de
  l'espace de travail et refuse clairement au lieu de s'exécuter ailleurs.
- Un persona ne supprime plus les règles opérationnelles.
- L'espace de travail actif est visible dès le premier lancement.
- Les marqueurs d'outils DeepSeek ne fuient plus en texte brut.
- Le volet navigateur s'arrête sur une boucle de redirection.

## Vérifié

- 290 tests unitaires Rust, 0 erreur TypeScript.
- Paquets Windows et Linux compilés et signés.
`,

  de: `# Zephyr v${VERSI}

## KI

- Ein Anbieter, der die Verbindung annimmt und dann schweigt, blockiert die
  Anwendung nicht mehr. Die Wiederholungsleiter hat jetzt ein Gesamtbudget, daher
  meldet Zephyr immer, bevor die Oberfläche aufgibt. Zuvor konnte das Frontend
  aufhören zu warten, während Rust noch lief, und spät eintreffender Text landete
  in dem, was Sie gerade tippten.
- Weiter erscheint, wenn ein Lauf im ERSTEN Schritt ausläuft. Zuvor war
  Antworttext nötig, daher fehlte die Schaltfläche genau dann, wenn eine große
  Nutzlast abgelehnt wurde - der Fall, für den sie existiert.
- Der Grund eines Fehlers erscheint einmal. Zuvor wurde er zweimal ausgegeben: in
  der Blase und noch einmal im Fehlerhinweis darunter.
- Text und Werkzeugaufrufe, die bereits angekommen sind, bleiben erhalten, wenn
  der Fehler im selben Paket kommt. Die Erzählung ("Ich sehe kurz im Ordner nach
  und mache dann weiter") verschwindet nicht mehr, und das angeforderte Werkzeug
  wird tatsächlich ausgeführt.
- Die Denkspur ist sichtbar, während das Modell denkt, nicht erst danach, und
  wird nicht mehr doppelt angezeigt.
- Werkzeugbeschreibungen sind in alle 10 Sprachen übersetzt. 448 Beschreibungen,
  eine pro Werkzeug und Sprache. Zuvor fielen 8 Sprachen still auf Englisch
  zurück, was die Antworten des Modells änderte, nicht nur den Bildschirm.

## Korrekturen

- Das Run-Werkzeug lief im Installationsordner, wenn der Arbeitsbereich noch
  nicht abgeglichen war. Jetzt nutzt es die Arbeitsbereichswurzel und lehnt klar
  ab, statt an einem unerwarteten Ort zu laufen.
- Eine Persona löscht nicht mehr die Betriebsregeln.
- Der aktive Arbeitsbereich ist ab dem ersten Start sichtbar.
- DeepSeek-Werkzeugmarker gelangen nicht mehr als Rohtext in den Chat.
- Der Browserbereich bleibt bei einer Weiterleitungsschleife stehen.

## Geprüft

- 290 Rust-Unit-Tests, 0 TypeScript-Fehler.
- Windows- und Linux-Pakete gebaut und signiert.
`,

  pt: `# Zephyr v${VERSI}

## IA

- Um provedor que aceita a conexão e depois fica em silêncio não trava mais o
  aplicativo. A escada de tentativas agora tem um orçamento total, então o Zephyr
  sempre responde antes de a interface desistir. Antes o frontend podia parar de
  esperar enquanto o Rust ainda trabalhava, e o texto atrasado caía no que você
  estava digitando.
- Continuar aparece quando uma execução expira no PRIMEIRO passo. Antes exigia
  texto de resposta, então o botão faltava justamente quando um payload grande é
  recusado, o caso para o qual ele existe.
- O motivo da falha aparece uma vez. Antes era impresso duas vezes: no balão e de
  novo no aviso de erro abaixo.
- Texto e chamadas de ferramenta que já chegaram são mantidos quando o erro vem
  no mesmo pacote. A narração ("Vou verificar a pasta e sigo") não desaparece
  mais, e a ferramenta pedida pelo modelo realmente executa.
- O raciocínio fica visível enquanto o modelo pensa, não só no fim, e não é mais
  mostrado duas vezes.
- As descrições das ferramentas estão traduzidas nos 10 idiomas. 448 descrições,
  uma por ferramenta e idioma. Antes 8 idiomas caiam em inglês em silêncio, o que
  mudava as respostas do modelo, não só a tela.

## Correções

- A ferramenta Run executava na pasta de instalação quando o workspace ainda não
  estava sincronizado. Agora usa a raiz do workspace e recusa claramente em vez
  de rodar em um lugar inesperado.
- Uma persona não apaga mais as regras operacionais.
- O workspace ativo fica visível desde a primeira inicialização.
- Marcadores de ferramenta do DeepSeek não vazam mais como texto.
- O painel do navegador para em um loop de redirecionamento.

## Verificado

- 290 testes unitários Rust, 0 erros de TypeScript.
- Pacotes Windows e Linux compilados e assinados.
`,

  ar: `# Zephyr v${VERSI}

## الذكاء الاصطناعي

- لم يعد مزوّد يقبل الاتصال ثم يلتزم الصمت يُجمّد التطبيق. أصبح لسلّم إعادة المحاولة ميزانية زمنية إجمالية، فيبلّغ Zephyr دائمًا قبل أن تتخلى الواجهة. سابقًا كان بإمكان الواجهة الأمامية أن تتوقف عن الانتظار بينما لا يزال Rust يعمل، فيصل النص المتأخر إلى ما تكتبه.
- يظهر زر المتابعة عندما تنتهي مهلة تشغيل في الخطوة الأولى. سابقًا كان يشترط وجود نص رد، فكان الزر غائبًا تحديدًا عند رفض حمولة كبيرة، وهي الحالة التي وُجد من أجلها.
- يظهر سبب الفشل مرة واحدة. سابقًا كان يُطبع مرتين: في الفقاعة ومرة أخرى في شريط الخطأ أسفلها.
- يُحتفظ بالنص واستدعاءات الأدوات التي وصلت بالفعل عندما يأتي الخطأ في الحزمة نفسها. لم يعد السرد ("سأتحقق من المجلد ثم أكمل") يختفي، وتُنفَّذ الأداة التي طلبها النموذج فعلاً.
- الاستدلال ظاهر أثناء تفكير النموذج، لا بعده فقط، ولم يعد يُعرض مرتين.
- وُصفت الأدوات في اللغات العشر كلها. 448 وصفًا، واحد لكل أداة لكل لغة. سابقًا كانت 8 لغات تعود إلى الإنجليزية بصمت، وكان ذلك يغيّر ردود النموذج لا الشاشة فقط.

## إصلاحات

- كانت أداة التشغيل تُنفَّذ في مجلد التثبيت عندما لا تكون مساحة العمل متزامنة بعد. تستخدم الآن جذر مساحة العمل وترفض بوضوح بدلاً من التنفيذ في مكان غير متوقع.
- لم تعد الشخصية تحذف القواعد التشغيلية.
- مساحة العمل النشطة ظاهرة منذ أول تشغيل.
- لم تعد علامات أدوات DeepSeek تتسرب كنص خام.
- يتوقف جزء المتصفح عند حلقة إعادة توجيه.

## تم التحقق

- 290 اختبار وحدة Rust، و0 خطأ TypeScript.
- حزم Windows وLinux مبنية وموقّعة.
`,
};

for (const [kode, isi] of Object.entries(catatan)) {
  fs.writeFileSync(`${DIR}/RELEASE_NOTES_${VERSI}.${kode}.md`, isi);
}
console.log(`ditulis ${Object.keys(catatan).length} berkas catatan: ${Object.keys(catatan).join(', ')}`);
