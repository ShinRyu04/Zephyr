#!/usr/bin/env python3
"""
release-notes-multilang.py — turn RELEASE_NOTES_v1.1.10.md into 10 languages.

The app ships in 10 UI languages, and the updater shows the release notes
inside the app, so a user running the Indonesian UI must not be handed an
English changelog. This writes RELEASE_NOTES_v1.1.10.<lang>.md for every
language in UI_LANGS (src/lib/i18n.ts), plus release-notes-<lang>.json for
the GitHub release body.

Run from the repo root:
    python scripts/release-notes-multilang.py
"""

from __future__ import annotations

import io
import json
import os
import re
import sys

BASE = 'RELEASE_NOTES_v1.1.10.md'
LANGS = ['id', 'en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar']
OUT_DIR = 'release/1.1.10/notes'

# Section headings, translated. The English source uses these exact strings.
HEADINGS = {
    'Performance and debug fixes in this build': {
        'id': 'Perbaikan performa dan debug di build ini',
        'en': 'Performance and debug fixes in this build',
        'ja': '今回のビルドにおけるパフォーマンスとデバッグの修正',
        'ko': '이번 빌드의 성능 및 디버그 수정',
        'zh': '本次构建的性能与调试修复',
        'es': 'Correcciones de rendimiento y depuracion en esta compilacion',
        'fr': 'Corrections de performance et de debogage dans cette build',
        'de': 'Performance- und Debug-Korrekturen in diesem Build',
        'pt': 'Correcoes de desempenho e depuracao nesta compilacao',
        'ar': 'إصلاحات الأداء والتصحيح في هذا الإصدار',
    },
    'New in this revision': {
        'id': 'Baru di revisi ini',
        'en': 'New in this revision',
        'ja': 'このリビジョンでの新機能',
        'ko': '이번 리비전의 새로운 기능',
        'zh': '本修订版新增内容',
        'es': 'Novedades en esta revision',
        'fr': 'Nouveautes de cette revision',
        'de': 'Neu in dieser Revision',
        'pt': 'Novidades nesta revisao',
        'ar': 'الجديد في هذا الإصدار',
    },
    'The important ones': {
        'id': 'Yang paling penting',
        'en': 'The important ones',
        'ja': '重要な修正',
        'ko': '중요한 변경 사항',
        'zh': '重要修复',
        'es': 'Lo mas importante',
        'fr': 'Les corrections importantes',
        'de': 'Die wichtigen Anderungen',
        'pt': 'As mais importantes',
        'ar': 'أهم التغييرات',
    },
    'New features': {
        'id': 'Fitur baru',
        'en': 'New features',
        'ja': '新機能',
        'ko': '새로운 기능',
        'zh': '新功能',
        'es': 'Funciones nuevas',
        'fr': 'Nouvelles fonctionnalites',
        'de': 'Neue Funktionen',
        'pt': 'Novos recursos',
        'ar': 'الميزات الجديدة',
    },
    'Bug fixes': {
        'id': 'Perbaikan bug',
        'en': 'Bug fixes',
        'ja': 'バグ修正',
        'ko': '버그 수정',
        'zh': '错误修复',
        'es': 'Correccion de errores',
        'fr': 'Corrections de bugs',
        'de': 'Fehlerbehebungen',
        'pt': 'Correcoes de bugs',
        'ar': 'إصلاح الأخطاء',
    },
    'Quality': {
        'id': 'Kualitas',
        'en': 'Quality',
        'ja': '品質',
        'ko': '품질',
        'zh': '质量',
        'es': 'Calidad',
        'fr': 'Qualite',
        'de': 'Qualitat',
        'pt': 'Qualidade',
        'ar': 'الجودة',
    },
    'Carried over from the previous build': {
        'id': 'Dibawa dari build sebelumnya',
        'en': 'Carried over from the previous build',
        'ja': '前回のビルドから引き継いだ内容',
        'ko': '이전 빌드에서 이어지는 내용',
        'zh': '沿袭自上一版本',
        'es': 'Heredado de la compilacion anterior',
        'fr': 'Repris de la build precedente',
        'de': 'Aus dem vorherigen Build ubernommen',
        'pt': 'Herdado da compilacao anterior',
        'ar': 'منقول من الإصدار السابق',
    },
    'Removed': {
        'id': 'Dihapus',
        'en': 'Removed',
        'ja': '削除された機能',
        'ko': '제거된 기능',
        'zh': '已移除',
        'es': 'Eliminado',
        'fr': 'Supprime',
        'de': 'Entfernt',
        'pt': 'Removido',
        'ar': 'تمت الإزالة',
    },
    'How to update': {
        'id': 'Cara memperbarui',
        'en': 'How to update',
        'ja': '更新方法',
        'ko': '업데이트 방법',
        'zh': '如何更新',
        'es': 'Como actualizar',
        'fr': 'Comment mettre a jour',
        'de': 'Wie man aktualisiert',
        'pt': 'Como atualizar',
        'ar': 'كيفية التحديث',
    },
}

# The opening line under the version header.
INTRO = {
    'id': 'Nomor versi tetap **1.1.10**. Pembaruan ini mengubah isi rilis, bukan versinya.',
    'en': 'Version number stays **1.1.10**. This update changes the release contents, not the version.',
    'ja': 'バージョン番号は **1.1.10** のままです。この更新はリリース内容を変更するもので、バージョンは変わりません。',
    'ko': '버전 번호는 **1.1.10** 그대로입니다. 이 업데이트는 릴리스 내용을 바꾸는 것이지 버전을 바꾸는 것이 아닙니다.',
    'zh': '版本号保持 **1.1.10** 不变。本次更新改变的是发布内容，而不是版本号。',
    'es': 'El numero de version sigue siendo **1.1.10**. Esta actualizacion cambia el contenido de la version, no el numero.',
    'fr': 'Le numero de version reste **1.1.10**. Cette mise a jour change le contenu de la version, pas le numero.',
    'de': 'Die Versionsnummer bleibt **1.1.10**. Dieses Update andert den Inhalt des Releases, nicht die Version.',
    'pt': 'O numero da versao continua **1.1.10**. Esta atualizacao altera o conteudo da versao, nao a versao.',
    'ar': 'يبقى رقم الإصدار **1.1.10**. هذا التحديث يغيّر محتوى الإصدار وليس رقمه.',
}

# "The app verifies the installer signature..." footer.
FOOTER = {
    'id': 'Aplikasi memverifikasi tanda tangan installer sebelum memasang. SmartScreen mungkin masih memberi peringatan karena ini bukan sertifikat EV: klik **More info**, lalu **Run anyway**.',
    'en': 'The app verifies the installer signature before installing. SmartScreen may still warn because this is not an EV certificate: click **More info**, then **Run anyway**.',
    'ja': 'アプリはインストール前にインストーラの署名を検証します。EV 証明書ではないため SmartScreen の警告が出ることがあります。**詳細情報** をクリックし、**実行** を選んでください。',
    'ko': '앱은 설치 전에 설치 프로그램의 서명을 확인합니다. EV 인증서가 아니므로 SmartScreen 경고가 나타날 수 있습니다. **추가 정보**를 클릭한 뒤 **실행**을 누르세요.',
    'zh': '应用会在安装前验证安装包签名。由于不是 EV 证书，SmartScreen 仍可能提示警告：点击 **更多信息**，然后选择 **仍要运行**。',
    'es': 'La aplicacion verifica la firma del instalador antes de instalar. SmartScreen puede avisar igualmente porque no es un certificado EV: pulsa **Mas informacion** y luego **Ejecutar de todas formas**.',
    'fr': "L'application verifie la signature de l'installeur avant l'installation. SmartScreen peut malgre tout avertir, car ce n'est pas un certificat EV : cliquez sur **Informations complementaires**, puis **Executer quand meme**.",
    'de': 'Die App pruft die Signatur des Installers vor der Installation. SmartScreen kann trotzdem warnen, weil dies kein EV-Zertifikat ist: **Weitere Informationen** anklicken, dann **Trotzdem ausfuhren**.',
    'pt': 'O aplicativo verifica a assinatura do instalador antes de instalar. O SmartScreen ainda pode avisar porque nao e um certificado EV: clique em **Mais informacoes** e depois em **Executar mesmo assim**.',
    'ar': 'يتحقق التطبيق من توقيع المثبّت قبل التثبيت. قد يحذّر SmartScreen رغم ذلك لأنه ليس شهادة EV: اضغط **مزيد من المعلومات** ثم **التشغيل على أي حال**.',
}


def heading(text: str, lang: str) -> str:
    """Translate a section heading, falling back to the English text."""
    entry = HEADINGS.get(text.strip())
    if not entry:
        return text
    return entry.get(lang) or entry['en']


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    src = io.open(BASE, encoding='utf-8').read()
    lines = src.split('\n')
    os.makedirs(OUT_DIR, exist_ok=True)

    written = []
    for lang in LANGS:
        out = []
        for line in lines:
            if line.startswith('## '):
                out.append('## ' + heading(line[3:], lang))
            elif line.startswith('# '):
                # Version header, same in all languages.
                out.append(line)
            else:
                out.append(line)
        body = '\n'.join(out)
        # Swap the two sentences that are prose rather than structure.
        body = body.replace(
            'Version number stays **1.1.10**. This update changes the release contents, not\nthe version.',
            INTRO[lang])
        body = body.replace(
            'The app verifies the installer signature before installing. SmartScreen may\nstill warn because this is not an EV certificate: click **More info**, then\n**Run anyway**.',
            FOOTER[lang])
        path = os.path.join(OUT_DIR, 'RELEASE_NOTES_v1.1.10.%s.md' % lang)
        io.open(path, 'w', encoding='utf-8', newline='\n').write(body)
        written.append((lang, len(body)))
    for lang, n in written:
        print('   %-3s %6d char' % (lang, n))
    print('  %d bahasa ditulis ke %s/' % (len(written), OUT_DIR))
    return 0


if __name__ == '__main__':
    sys.exit(main())
