# -*- coding: utf-8 -*-
"""
Tambah kunci i18n untuk fitur baru (sub-agent kustom + persona) ke i18n-extra.ts.

Konvensi proyek: kunci = teks Indonesia, tiap bahasa punya entri sendiri.
Skrip ini menyisipkan entri baru tepat sebelum penutup tiap blok bahasa, supaya
urutan dan format file tetap sama seperti tulisan tangan.
"""
import io
import re

P = 'src/lib/i18n-extra.ts'

# kunci -> { lang: terjemahan }
KUNCI = {
    # ---- Sub-agent kustom ----
    'Sub-agent kustom': {
        'en': 'Custom sub-agents', 'ja': 'カスタムサブエージェント', 'ko': '사용자 지정 하위 에이전트',
        'zh': '自定义子代理', 'es': 'Subagentes personalizados', 'fr': 'Sous-agents personnalisés',
        'de': 'Benutzerdefinierte Sub-Agents', 'pt': 'Subagentes personalizados', 'ar': 'وكلاء فرعيون مخصصون',
    },
    'Pekerja baca-saja buatanmu sendiri. AI bisa mendelegasikan ke yang aktif berdasarkan nama, di samping peran bawaan (Cari, Telaah, Rencana, Audit, Kerja, Jelajah).': {
        'en': 'Your own read-only workers. The AI can delegate to enabled ones by name, alongside the built-in roles (Cari, Telaah, Rencana, Audit, Kerja, Jelajah).',
        'ja': '独自の読み取り専用ワーカー。AI は有効なものを名前で委任できます（組み込みロールと併用）。',
        'ko': '직접 만든 읽기 전용 워커. AI가 이름으로 활성 워커에 위임할 수 있습니다.',
        'zh': '你自己的只读工作器。AI 可以按名称委派给已启用的工作器。',
        'es': 'Tus propios trabajadores de solo lectura. La IA puede delegar por nombre.',
        'fr': 'Vos propres travailleurs en lecture seule. L’IA peut déléguer par nom.',
        'de': 'Eigene Nur-Lese-Worker. Die KI kann nach Namen delegieren.',
        'pt': 'Seus próprios trabalhadores somente leitura. A IA pode delegar por nome.',
        'ar': 'عمالك الخاصون للقراءة فقط. يمكن للذكاء الاصطناعي التفويض بالاسم.',
    },
    'Belum ada sub-agent kustom. Buat satu untuk memberi AI pekerja khusus.': {
        'en': 'No custom sub-agents yet. Create one to give the AI a specialized worker.',
        'ja': 'カスタムサブエージェントはまだありません。作成して AI に専用ワーカーを与えましょう。',
        'ko': '사용자 지정 하위 에이전트가 없습니다. 만들어 AI에게 전용 워커를 제공하세요.',
        'zh': '还没有自定义子代理。创建一个，为 AI 提供专用工作器。',
        'es': 'Aún no hay subagentes personalizados. Crea uno para dar a la IA un trabajador especializado.',
        'fr': 'Aucun sous-agent personnalisé. Créez-en un pour donner à l’IA un travailleur spécialisé.',
        'de': 'Noch keine benutzerdefinierten Sub-Agents. Erstelle einen für einen spezialisierten Worker.',
        'pt': 'Ainda não há subagentes personalizados. Crie um para dar à IA um trabalhador especializado.',
        'ar': 'لا توجد وكلاء فرعيون مخصصون بعد. أنشئ واحدًا لمنح الذكاء الاصطناعي عاملًا متخصصًا.',
    },
    '+ Baru': {
        'en': '+ New', 'ja': '+ 新規', 'ko': '+ 새로 만들기', 'zh': '+ 新建',
        'es': '+ Nuevo', 'fr': '+ Nouveau', 'de': '+ Neu', 'pt': '+ Novo', 'ar': '+ جديد',
    },
    'Sub-agent baru': {
        'en': 'New sub-agent', 'ja': '新しいサブエージェント', 'ko': '새 하위 에이전트',
        'zh': '新建子代理', 'es': 'Nuevo subagente', 'fr': 'Nouveau sous-agent',
        'de': 'Neuer Sub-Agent', 'pt': 'Novo subagente', 'ar': 'وكيل فرعي جديد',
    },
    'Ubah sub-agent': {
        'en': 'Edit sub-agent', 'ja': 'サブエージェントを編集', 'ko': '하위 에이전트 편집',
        'zh': '编辑子代理', 'es': 'Editar subagente', 'fr': 'Modifier le sous-agent',
        'de': 'Sub-Agent bearbeiten', 'pt': 'Editar subagente', 'ar': 'تعديل الوكيل الفرعي',
    },
    'Alat': {
        'en': 'Tools', 'ja': 'ツール', 'ko': '도구', 'zh': '工具',
        'es': 'Herramientas', 'fr': 'Outils', 'de': 'Werkzeuge', 'pt': 'Ferramentas', 'ar': 'الأدوات',
    },
    'Hanya baca. Pilih minimal satu.': {
        'en': 'Read-only only. Pick at least one.',
        'ja': '読み取り専用のみ。少なくとも 1 つ選択してください。',
        'ko': '읽기 전용만. 최소 하나를 선택하세요.',
        'zh': '仅限只读。请至少选择一个。',
        'es': 'Solo lectura. Elige al menos una.',
        'fr': 'Lecture seule uniquement. Choisissez-en au moins un.',
        'de': 'Nur Lesen. Mindestens eines auswählen.',
        'pt': 'Somente leitura. Escolha pelo menos uma.',
        'ar': 'للقراءة فقط. اختر واحدًا على الأقل.',
    },
    'Persona dan aturan untuk pekerja ini. Ia berjalan dengan riwayat bersih dan hanya alat di atas.': {
        'en': 'Persona & rules for this worker. It runs with a fresh history and only the tools above.',
        'ja': 'このワーカーのペルソナとルール。履歴は新規で、上記のツールのみを使用します。',
        'ko': '이 워커의 페르소나와 규칙. 새 기록으로 실행되며 위 도구만 사용합니다.',
        'zh': '此工作器的角色与规则。以全新历史运行，仅使用上述工具。',
        'es': 'Persona y reglas para este trabajador. Se ejecuta con historial nuevo y solo las herramientas anteriores.',
        'fr': 'Persona et règles pour ce travailleur. Il s’exécute avec un historique neuf et uniquement les outils ci-dessus.',
        'de': 'Persona und Regeln für diesen Worker. Läuft mit frischem Verlauf und nur den obigen Werkzeugen.',
        'pt': 'Persona e regras para este trabalhador. Executa com histórico novo e apenas as ferramentas acima.',
        'ar': 'الشخصية والقواعد لهذا العامل. يعمل بسجل جديد وبالأدوات أعلاه فقط.',
    },
    'Jalankan pekerja ini di model sendiri (mis. yang lebih murah untuk pencarian besar). Bawaan = sama seperti chat.': {
        'en': 'Run this worker on its own model (e.g. a cheaper one for large searches). Default = same as chat.',
        'ja': 'このワーカーを独自のモデルで実行します（大規模検索には安価なモデルなど）。既定 = チャットと同じ。',
        'ko': '이 워커를 자체 모델로 실행합니다(대규모 검색에는 더 저렴한 모델 등). 기본 = 채팅과 동일.',
        'zh': '使用独立模型运行此工作器（例如用于大规模搜索的更便宜模型）。默认 = 与聊天相同。',
        'es': 'Ejecuta este trabajador con su propio modelo (p. ej. uno más barato para búsquedas grandes). Predeterminado = igual que el chat.',
        'fr': 'Exécuter ce travailleur sur son propre modèle (par ex. moins cher pour de grandes recherches). Par défaut = comme le chat.',
        'de': 'Diesen Worker mit eigenem Modell ausführen (z. B. günstigeres für große Suchen). Standard = wie im Chat.',
        'pt': 'Executar este trabalhador com o próprio modelo (por exemplo, um mais barato para buscas grandes). Padrão = igual ao chat.',
        'ar': 'تشغيل هذا العامل بنموذجه الخاص (مثل نموذج أرخص للبحث الكبير). الافتراضي = مثل الدردشة.',
    },
    'Sama seperti chat (bawaan)': {
        'en': 'Same as chat (default)', 'ja': 'チャットと同じ（既定）', 'ko': '채팅과 동일(기본)',
        'zh': '与聊天相同（默认）', 'es': 'Igual que el chat (predeterminado)',
        'fr': 'Comme le chat (par défaut)', 'de': 'Wie im Chat (Standard)',
        'pt': 'Igual ao chat (padrão)', 'ar': 'مثل الدردشة (افتراضي)',
    },
    'Nama itu sudah dipakai sub-agent lain.': {
        'en': 'That name is already used by another sub-agent.',
        'ja': 'その名前は別のサブエージェントが使用しています。',
        'ko': '그 이름은 다른 하위 에이전트가 사용 중입니다.',
        'zh': '该名称已被另一个子代理使用。',
        'es': 'Ese nombre ya lo usa otro subagente.',
        'fr': 'Ce nom est déjà utilisé par un autre sous-agent.',
        'de': 'Dieser Name wird bereits von einem anderen Sub-Agent verwendet.',
        'pt': 'Esse nome já é usado por outro subagente.',
        'ar': 'هذا الاسم مستخدم بالفعل من قبل وكيل فرعي آخر.',
    },
    'mis. Pemeta tes': {
        'en': 'e.g. Test mapper', 'ja': '例: テストマッパー', 'ko': '예: 테스트 매퍼',
        'zh': '例如：测试映射器', 'es': 'p. ej. Mapeador de pruebas', 'fr': 'ex. Cartographe de tests',
        'de': 'z. B. Test-Mapper', 'pt': 'ex.: Mapeador de testes', 'ar': 'مثال: مُخطِّط الاختبارات',
    },
    'Satu baris — AI membacanya untuk memutuskan kapan mendelegasikan ke sini': {
        'en': 'One line — the AI reads this to decide when to delegate here',
        'ja': '1 行 — AI がここに委任するタイミングを判断するために読みます',
        'ko': '한 줄 — AI가 여기에 위임할 시점을 판단하기 위해 읽습니다',
        'zh': '一行 — AI 读取它来决定何时委派到这里',
        'es': 'Una línea — la IA la lee para decidir cuándo delegar aquí',
        'fr': 'Une ligne — l’IA la lit pour décider quand déléguer ici',
        'de': 'Eine Zeile — die KI liest sie, um zu entscheiden, wann hierher delegiert wird',
        'pt': 'Uma linha — a IA lê isto para decidir quando delegar aqui',
        'ar': 'سطر واحد — يقرأه الذكاء الاصطناعي ليقرر متى يفوّض هنا',
    },
    # ---- Persona ----
    'Persona': {
        'en': 'Personas', 'ja': 'ペルソナ', 'ko': '페르소나', 'zh': '角色',
        'es': 'Personas', 'fr': 'Personas', 'de': 'Personas', 'pt': 'Personas', 'ar': 'الشخصيات',
    },
    'Kepribadian yang dipakai AI. Persona hanya mengganti cara bicara dan cara berpikir — daftar alat, aturan proyek, dan instruksimu tetap berlaku.': {
        'en': 'The personality the AI uses. A persona only replaces how it talks and thinks — the tool list, project rules and your own instructions still apply.',
        'ja': 'AI が使う性格。ペルソナは話し方と考え方だけを置き換えます — ツール一覧、プロジェクト規則、あなたの指示はそのまま有効です。',
        'ko': 'AI가 사용하는 성격. 페르소나는 말투와 사고방식만 바꿉니다 — 도구 목록, 프로젝트 규칙, 사용자 지침은 그대로 적용됩니다.',
        'zh': 'AI 使用的性格。角色只替换说话和思考方式 — 工具列表、项目规则和你的指令依然有效。',
        'es': 'La personalidad que usa la IA. Una persona solo reemplaza cómo habla y piensa — la lista de herramientas, las reglas del proyecto y tus instrucciones siguen aplicándose.',
        'fr': 'La personnalité utilisée par l’IA. Une persona ne remplace que la façon de parler et de penser — la liste d’outils, les règles du projet et vos instructions restent appliquées.',
        'de': 'Die Persönlichkeit der KI. Eine Persona ersetzt nur Sprech- und Denkweise — Werkzeugliste, Projektregeln und deine Anweisungen gelten weiter.',
        'pt': 'A personalidade que a IA usa. Uma persona só substitui como ela fala e pensa — a lista de ferramentas, as regras do projeto e as suas instruções continuam valendo.',
        'ar': 'الشخصية التي يستخدمها الذكاء الاصطناعي. الشخصية تستبدل طريقة الكلام والتفكير فقط — قائمة الأدوات وقواعد المشروع وتعليماتك تبقى سارية.',
    },
    '+ Persona baru': {
        'en': '+ New persona', 'ja': '+ 新しいペルソナ', 'ko': '+ 새 페르소나', 'zh': '+ 新建角色',
        'es': '+ Nueva persona', 'fr': '+ Nouvelle persona', 'de': '+ Neue Persona',
        'pt': '+ Nova persona', 'ar': '+ شخصية جديدة',
    },
    'Persona baru': {
        'en': 'New persona', 'ja': '新しいペルソナ', 'ko': '새 페르소나', 'zh': '新建角色',
        'es': 'Nueva persona', 'fr': 'Nouvelle persona', 'de': 'Neue Persona',
        'pt': 'Nova persona', 'ar': 'شخصية جديدة',
    },
    'Ubah persona': {
        'en': 'Edit persona', 'ja': 'ペルソナを編集', 'ko': '페르소나 편집', 'zh': '编辑角色',
        'es': 'Editar persona', 'fr': 'Modifier la persona', 'de': 'Persona bearbeiten',
        'pt': 'Editar persona', 'ar': 'تعديل الشخصية',
    },
    'Nama itu sudah dipakai persona lain.': {
        'en': 'That name is already used by another persona.',
        'ja': 'その名前は別のペルソナが使用しています。',
        'ko': '그 이름은 다른 페르소나가 사용 중입니다.',
        'zh': '该名称已被另一个角色使用。',
        'es': 'Ese nombre ya lo usa otra persona.',
        'fr': 'Ce nom est déjà utilisé par une autre persona.',
        'de': 'Dieser Name wird bereits von einer anderen Persona verwendet.',
        'pt': 'Esse nome já é usado por outra persona.',
        'ar': 'هذا الاسم مستخدم بالفعل من قبل شخصية أخرى.',
    },
    'Identitas': {
        'en': 'Identity', 'ja': 'アイデンティティ', 'ko': '정체성', 'zh': '身份',
        'es': 'Identidad', 'fr': 'Identité', 'de': 'Identität', 'pt': 'Identidade', 'ar': 'الهوية',
    },
    'Siapa AI ini. Kosongkan untuk memakai identitas bawaan Zephyr.': {
        'en': 'Who this AI is. Leave empty to use Zephyr’s built-in identity.',
        'ja': 'この AI が誰か。空欄にすると Zephyr の既定のアイデンティティを使います。',
        'ko': '이 AI가 누구인지. 비워 두면 Zephyr의 기본 정체성을 사용합니다.',
        'zh': '这个 AI 是谁。留空则使用 Zephyr 的默认身份。',
        'es': 'Quién es esta IA. Déjalo vacío para usar la identidad integrada de Zephyr.',
        'fr': 'Qui est cette IA. Laissez vide pour utiliser l’identité intégrée de Zephyr.',
        'de': 'Wer diese KI ist. Leer lassen für die eingebaute Identität von Zephyr.',
        'pt': 'Quem é esta IA. Deixe vazio para usar a identidade integrada do Zephyr.',
        'ar': 'من هذا الذكاء الاصطناعي. اتركه فارغًا لاستخدام هوية Zephyr المدمجة.',
    },
    'Cara kerja': {
        'en': 'How it works', 'ja': '進め方', 'ko': '작업 방식', 'zh': '工作方式',
        'es': 'Cómo trabaja', 'fr': 'Façon de travailler', 'de': 'Arbeitsweise',
        'pt': 'Como trabalha', 'ar': 'طريقة العمل',
    },
    'Bagaimana AI menjawab: panjang, bukti, urutan, nada. Kosongkan untuk bawaan.': {
        'en': 'How the AI answers: length, evidence, order, tone. Leave empty for the default.',
        'ja': 'AI の答え方: 長さ、根拠、順序、口調。空欄にすると既定値になります。',
        'ko': 'AI가 답하는 방식: 길이, 근거, 순서, 어조. 비워 두면 기본값입니다.',
        'zh': 'AI 如何回答：长度、证据、顺序、语气。留空则使用默认值。',
        'es': 'Cómo responde la IA: longitud, pruebas, orden, tono. Déjalo vacío para el valor predeterminado.',
        'fr': 'Comment l’IA répond : longueur, preuves, ordre, ton. Laissez vide pour la valeur par défaut.',
        'de': 'Wie die KI antwortet: Länge, Belege, Reihenfolge, Ton. Leer lassen für den Standard.',
        'pt': 'Como a IA responde: tamanho, evidências, ordem, tom. Deixe vazio para o padrão.',
        'ar': 'كيف يجيب الذكاء الاصطناعي: الطول، الأدلة، الترتيب، النبرة. اتركه فارغًا للافتراضي.',
    },
    'Aturan tambahan': {
        'en': 'Extra rules', 'ja': '追加ルール', 'ko': '추가 규칙', 'zh': '附加规则',
        'es': 'Reglas adicionales', 'fr': 'Règles supplémentaires', 'de': 'Zusätzliche Regeln',
        'pt': 'Regras adicionais', 'ar': 'قواعد إضافية',
    },
    'Aturan yang selalu berlaku untuk persona ini. Kosongkan kalau tidak ada.': {
        'en': 'Rules that always apply to this persona. Leave empty if there are none.',
        'ja': 'このペルソナに常に適用されるルール。なければ空欄にします。',
        'ko': '이 페르소나에 항상 적용되는 규칙. 없으면 비워 두세요.',
        'zh': '始终适用于此角色的规则。若没有则留空。',
        'es': 'Reglas que siempre se aplican a esta persona. Déjalo vacío si no hay.',
        'fr': 'Règles toujours appliquées à cette persona. Laissez vide s’il n’y en a pas.',
        'de': 'Regeln, die für diese Persona immer gelten. Leer lassen, wenn keine.',
        'pt': 'Regras que sempre se aplicam a esta persona. Deixe vazio se não houver.',
        'ar': 'قواعد تُطبق دائمًا على هذه الشخصية. اتركه فارغًا إن لم توجد.',
    },
    'Salin': {
        'en': 'Duplicate', 'ja': '複製', 'ko': '복제', 'zh': '复制',
        'es': 'Duplicar', 'fr': 'Dupliquer', 'de': 'Duplizieren', 'pt': 'Duplicar', 'ar': 'نسخ',
    },
    'bawaan': {
        'en': 'built-in', 'ja': '組み込み', 'ko': '기본 제공', 'zh': '内置',
        'es': 'integrado', 'fr': 'intégré', 'de': 'integriert', 'pt': 'integrado', 'ar': 'مدمج',
    },
    'Satu baris — muncul di daftar persona': {
        'en': 'One line — shown in the persona list',
        'ja': '1 行 — ペルソナ一覧に表示されます',
        'ko': '한 줄 — 페르소나 목록에 표시됩니다',
        'zh': '一行 — 显示在角色列表中',
        'es': 'Una línea — se muestra en la lista de personas',
        'fr': 'Une ligne — affichée dans la liste des personas',
        'de': 'Eine Zeile — wird in der Persona-Liste angezeigt',
        'pt': 'Uma linha — mostrada na lista de personas',
        'ar': 'سطر واحد — يظهر في قائمة الشخصيات',
    },
    'mis. Pengajar': {
        'en': 'e.g. Teacher', 'ja': '例: 教師', 'ko': '예: 교사', 'zh': '例如：教师',
        'es': 'p. ej. Maestro', 'fr': 'ex. Enseignant', 'de': 'z. B. Lehrer',
        'pt': 'ex.: Professor', 'ar': 'مثال: مُعلِّم',
    },
    # ---- Nama & deskripsi persona bawaan (dipakai lewat tr()) ----
    'Umum': {
        'en': 'General', 'ja': '汎用', 'ko': '일반', 'zh': '通用',
        'es': 'General', 'fr': 'Général', 'de': 'Allgemein', 'pt': 'Geral', 'ar': 'عام',
    },
    'Seimbang. Jawab langsung, jelaskan seperlunya.': {
        'en': 'Balanced. Answers directly, explains only as needed.',
        'ja': 'バランス型。直接答え、必要な分だけ説明します。',
        'ko': '균형형. 바로 답하고 필요한 만큼만 설명합니다.',
        'zh': '均衡。直接回答，只在需要时解释。',
        'es': 'Equilibrado. Responde directo y explica solo lo necesario.',
        'fr': 'Équilibré. Répond directement, explique seulement si nécessaire.',
        'de': 'Ausgewogen. Antwortet direkt, erklärt nur so viel wie nötig.',
        'pt': 'Equilibrado. Responde direto e explica só o necessário.',
        'ar': 'متوازن. يجيب مباشرة ويشرح عند الحاجة فقط.',
    },
    'Ringkas': {
        'en': 'Concise', 'ja': '簡潔', 'ko': '간결', 'zh': '简洁',
        'es': 'Conciso', 'fr': 'Concis', 'de': 'Knapp', 'pt': 'Conciso', 'ar': 'موجز',
    },
    'Jawaban pendek, tanpa basa-basi, langsung ke intinya.': {
        'en': 'Short answers, no filler, straight to the point.',
        'ja': '短い答え、無駄なし、要点だけ。',
        'ko': '짧은 답변, 군더더기 없이 핵심만.',
        'zh': '简短回答，没有废话，直奔重点。',
        'es': 'Respuestas cortas, sin relleno, directo al grano.',
        'fr': 'Réponses courtes, sans remplissage, droit au but.',
        'de': 'Kurze Antworten, kein Füllstoff, direkt auf den Punkt.',
        'pt': 'Respostas curtas, sem enrolação, direto ao ponto.',
        'ar': 'إجابات قصيرة بلا حشو، مباشرة إلى النقطة.',
    },
    'Teliti': {
        'en': 'Thorough', 'ja': '徹底', 'ko': '꼼꼼함', 'zh': '严谨',
        'es': 'Minucioso', 'fr': 'Méticuleux', 'de': 'Gründlich', 'pt': 'Minucioso', 'ar': 'دقيق',
    },
    'Periksa dulu sebelum menjawab. Tunjukkan bukti.': {
        'en': 'Checks first, then answers. Shows the evidence.',
        'ja': '答える前に確認します。根拠を示します。',
        'ko': '먼저 확인하고 답합니다. 근거를 제시합니다.',
        'zh': '先检查再回答。展示证据。',
        'es': 'Comprueba primero y luego responde. Muestra las pruebas.',
        'fr': 'Vérifie d’abord, puis répond. Montre les preuves.',
        'de': 'Prüft zuerst, antwortet dann. Zeigt die Belege.',
        'pt': 'Verifica primeiro, depois responde. Mostra as evidências.',
        'ar': 'يتحقق أولًا ثم يجيب. يعرض الأدلة.',
    },
    'Guru': {
        'en': 'Teacher', 'ja': '教師', 'ko': '교사', 'zh': '教师',
        'es': 'Maestro', 'fr': 'Enseignant', 'de': 'Lehrer', 'pt': 'Professor', 'ar': 'مُعلِّم',
    },
    'Jelaskan sambil mengerjakan, supaya pengguna ikut paham.': {
        'en': 'Explains while working, so the user learns too.',
        'ja': '作業しながら説明し、ユーザーも理解できるようにします。',
        'ko': '작업하면서 설명해 사용자도 이해하게 합니다.',
        'zh': '边做边解释，让用户也能理解。',
        'es': 'Explica mientras trabaja, para que el usuario también aprenda.',
        'fr': 'Explique en travaillant, pour que l’utilisateur apprenne aussi.',
        'de': 'Erklärt während der Arbeit, damit der Nutzer mitlernt.',
        'pt': 'Explica enquanto trabalha, para o usuário aprender também.',
        'ar': 'يشرح أثناء العمل ليفهم المستخدم أيضًا.',
    },
    # ---- Follow-up subagent ----
    'Kirim pesan lanjutan…': {
        'en': 'Send a follow-up…', 'ja': '追加メッセージを送信…', 'ko': '후속 메시지 보내기…',
        'zh': '发送后续消息…', 'es': 'Enviar un seguimiento…', 'fr': 'Envoyer un suivi…',
        'de': 'Folgenachricht senden…', 'pt': 'Enviar acompanhamento…', 'ar': 'أرسل رسالة متابعة…',
    },
    'Kirim': {
        'en': 'Send', 'ja': '送信', 'ko': '보내기', 'zh': '发送',
        'es': 'Enviar', 'fr': 'Envoyer', 'de': 'Senden', 'pt': 'Enviar', 'ar': 'إرسال',
    },
    # ---- Alat (label) ----
    'Baca berkas': {
        'en': 'Read file', 'ja': 'ファイルを読む', 'ko': '파일 읽기', 'zh': '读取文件',
        'es': 'Leer archivo', 'fr': 'Lire le fichier', 'de': 'Datei lesen',
        'pt': 'Ler arquivo', 'ar': 'قراءة ملف',
    },
    'Daftar folder': {
        'en': 'List dir', 'ja': 'ディレクトリ一覧', 'ko': '디렉터리 목록', 'zh': '列出目录',
        'es': 'Listar carpeta', 'fr': 'Lister le dossier', 'de': 'Verzeichnis auflisten',
        'pt': 'Listar pasta', 'ar': 'سرد المجلد',
    },
    'Jalankan perintah': {
        'en': 'Run command', 'ja': 'コマンド実行', 'ko': '명령 실행', 'zh': '运行命令',
        'es': 'Ejecutar comando', 'fr': 'Exécuter une commande', 'de': 'Befehl ausführen',
        'pt': 'Executar comando', 'ar': 'تشغيل أمر',
    },
    'Baca terminal': {
        'en': 'Read terminal', 'ja': 'ターミナルを読む', 'ko': '터미널 읽기', 'zh': '读取终端',
        'es': 'Leer terminal', 'fr': 'Lire le terminal', 'de': 'Terminal lesen',
        'pt': 'Ler terminal', 'ar': 'قراءة الطرفية',
    },
    'Diagnostik': {
        'en': 'Diagnostics', 'ja': '診断', 'ko': '진단', 'zh': '诊断',
        'es': 'Diagnóstico', 'fr': 'Diagnostics', 'de': 'Diagnose', 'pt': 'Diagnóstico', 'ar': 'التشخيص',
    },
    'Log output': {
        'en': 'Output log', 'ja': '出力ログ', 'ko': '출력 로그', 'zh': '输出日志',
        'es': 'Registro de salida', 'fr': 'Journal de sortie', 'de': 'Ausgabeprotokoll',
        'pt': 'Log de saída', 'ar': 'سجل الإخراج',
    },
    'Daftar skill': {
        'en': 'List skills', 'ja': 'スキル一覧', 'ko': '스킬 목록', 'zh': '列出技能',
        'es': 'Listar habilidades', 'fr': 'Lister les compétences', 'de': 'Fähigkeiten auflisten',
        'pt': 'Listar habilidades', 'ar': 'سرد المهارات',
    },
    'Baca memori': {
        'en': 'Read memory', 'ja': 'メモリを読む', 'ko': '메모리 읽기', 'zh': '读取记忆',
        'es': 'Leer memoria', 'fr': 'Lire la mémoire', 'de': 'Speicher lesen',
        'pt': 'Ler memória', 'ar': 'قراءة الذاكرة',
    },
    # ---- Alat (hint) ----
    'Buka isi satu berkas': {
        'en': 'Open the contents of one file', 'ja': '1 つのファイルの内容を開く',
        'ko': '파일 하나의 내용 열기', 'zh': '打开一个文件的内容',
        'es': 'Abrir el contenido de un archivo', 'fr': 'Ouvrir le contenu d’un fichier',
        'de': 'Inhalt einer Datei öffnen', 'pt': 'Abrir o conteúdo de um arquivo',
        'ar': 'افتح محتوى ملف واحد',
    },
    'Lihat isi sebuah folder': {
        'en': 'See what a folder contains', 'ja': 'フォルダの中身を見る',
        'ko': '폴더 내용 보기', 'zh': '查看文件夹内容',
        'es': 'Ver qué contiene una carpeta', 'fr': 'Voir le contenu d’un dossier',
        'de': 'Sehen, was ein Ordner enthält', 'pt': 'Ver o que uma pasta contém',
        'ar': 'اطّلع على محتوى مجلد',
    },
    'Cari lewat rg / git / find': {
        'en': 'Search with rg / git / find', 'ja': 'rg / git / find で検索',
        'ko': 'rg / git / find로 검색', 'zh': '用 rg / git / find 搜索',
        'es': 'Buscar con rg / git / find', 'fr': 'Rechercher avec rg / git / find',
        'de': 'Mit rg / git / find suchen', 'pt': 'Pesquisar com rg / git / find',
        'ar': 'ابحث باستخدام rg / git / find',
    },
    'Lihat keluaran terminal pane': {
        'en': 'See a terminal pane’s output', 'ja': 'ターミナルペインの出力を見る',
        'ko': '터미널 페인의 출력 보기', 'zh': '查看终端窗格的输出',
        'es': 'Ver la salida de un panel de terminal', 'fr': 'Voir la sortie d’un volet de terminal',
        'de': 'Ausgabe eines Terminal-Bereichs sehen', 'pt': 'Ver a saída de um painel de terminal',
        'ar': 'اطّلع على إخراج لوح الطرفية',
    },
    'Error dan peringatan editor': {
        'en': 'Editor errors and warnings', 'ja': 'エディタのエラーと警告',
        'ko': '편집기 오류 및 경고', 'zh': '编辑器错误和警告',
        'es': 'Errores y advertencias del editor', 'fr': 'Erreurs et avertissements de l’éditeur',
        'de': 'Fehler und Warnungen des Editors', 'pt': 'Erros e avisos do editor',
        'ar': 'أخطاء المحرر وتحذيراته',
    },
    'Kanal Output panel bawah': {
        'en': 'The Output channel in the bottom panel', 'ja': '下部パネルの出力チャネル',
        'ko': '하단 패널의 출력 채널', 'zh': '底部面板的输出通道',
        'es': 'El canal Salida del panel inferior', 'fr': 'Le canal Sortie du panneau inférieur',
        'de': 'Der Ausgabe-Kanal im unteren Bereich', 'pt': 'O canal Saída no painel inferior',
        'ar': 'قناة الإخراج في اللوحة السفلية',
    },
    'Skill yang tersedia': {
        'en': 'Available skills', 'ja': '利用可能なスキル', 'ko': '사용 가능한 스킬', 'zh': '可用技能',
        'es': 'Habilidades disponibles', 'fr': 'Compétences disponibles',
        'de': 'Verfügbare Fähigkeiten', 'pt': 'Habilidades disponíveis', 'ar': 'المهارات المتاحة',
    },
    'Catatan lintas sesi': {
        'en': 'Notes that persist across sessions', 'ja': 'セッションをまたぐメモ',
        'ko': '세션 간 유지되는 노트', 'zh': '跨会话保留的笔记',
        'es': 'Notas que persisten entre sesiones', 'fr': 'Notes conservées entre les sessions',
        'de': 'Notizen, die Sitzungen überdauern', 'pt': 'Notas que persistem entre sessões',
        'ar': 'ملاحظات تبقى بين الجلسات',
    },
}

# Urutan blok bahasa di i18n-extra.ts
BLOK = {
    'id': 'const ID: Dict = {',
    'en': 'const EN: Dict = {',
    'ja': 'const JA: Dict = {',
    'ko': 'const KO: Dict = {',
    'zh': 'const ZH: Dict = {',
    'es': 'const ES: Dict = {',
    'fr': 'const FR: Dict = {',
    'de': 'const DE: Dict = {',
    'pt': 'const PT: Dict = {',
    'ar': 'const AR: Dict = {',
}

teks = io.open(P, encoding='utf-8', newline='').read()

def esc(v):
    """Escape satu nilai supaya aman jadi literal string JS single-quote."""
    return v.replace('\\', '\\\\').replace("'", "\\'")

total = 0
for lang, header in BLOK.items():
    i = teks.find(header)
    if i == -1:
        print('  ! blok', lang, 'tidak ketemu')
        continue
    # akhir blok = '};' pertama setelah header
    j = teks.find('};', i)
    if j == -1:
        print('  ! penutup blok', lang, 'tidak ketemu')
        continue

    baris = []
    for kunci, terjemahan in KUNCI.items():
        if lang == 'id':
            nilai = kunci  # blok ID memetakan kunci ke dirinya sendiri
        else:
            nilai = terjemahan.get(lang)
            if nilai is None:
                continue
        baris.append("  '%s': '%s'," % (esc(kunci), esc(nilai)))

    if not baris:
        continue

    sisip = '\n' + '\n'.join(baris)
    teks = teks[:j] + sisip + '\n' + teks[j:]
    total += len(baris)
    print('  +', lang, ':', len(baris), 'kunci')

io.open(P, 'w', encoding='utf-8', newline='').write(teks)
print('  total entri ditambahkan:', total)
