"""Fix the backslash levels in the newly added openai.rs repair step.

The shell/heredoc path collapsed one level of backslash inside the Rust char
literals and the two new tests, so the file no longer compiled. This script
writes the exact characters with chr(92) so nothing can be eaten again.
"""

import io
import re

P = 'src-tauri/src/adapters/openai.rs'
B = chr(92)

s = io.open(P, encoding='utf-8', newline='').read()

# 1. Every `'\'` in this file is the broken form; the valid form is `'\\'`.
sebelum = s.count("'" + B + "'")
s = s.replace("'" + B + "'", "'" + B + B + "'")
print('char literal diperbaiki:', sebelum)

# 2. Remove the duplicated #[test] that landed above the comment block.
dobel = "    #[test]" + chr(13) + chr(10) + "    /*" + chr(13) + chr(10) + "     * Kasus nyata (2026-10-26)"
if dobel in s:
    s = s.replace(dobel, "    /*" + chr(13) + chr(10) + "     * Kasus nyata (2026-10-26)", 1)
    print('atribut #[test] ganda dibuang')
else:
    print('PERINGATAN: pola #[test] ganda tidak ketemu')

# 3. Rewrite both tests: raw JSON args + expected values, exact.
awal = s.index('    fn repairs_invalid_backslash_escape() {')
akhir = s.index('    fn repairs_trailing_comma_in_tool_arguments() {')
# keep the doc comment block that precedes the first test (it ends before `#[test]`)
kepala = s.rindex('    /*', 0, awal)

args1 = 'r#"' + '{"path":"notes.md","content":"D:' + B + 'Zephyr' + B + 'src dan ' + B + 's+"}' + '"#'
harap1 = 'r"' + 'D:' + B + 'Zephyr' + B + 'src dan ' + B + 's+' + '"'

args2 = ('r#"' + '{"path":"a.txt","content":"satu' + B + 'ndua' + B + 'ttiga ' + B + '"kutip' + B + '" '
         + B + B + 'akhir"}' + '"#')
harap2 = ('"' + 'satu' + B + 'ndua' + B + 'ttiga ' + B + '"kutip' + B + '" ' + B + B + 'akhir"')

NL = chr(13) + chr(10)

tes = (
    '    /*' + NL
    + '     * Kasus nyata (2026-10-26): `multi_edit` gagal dengan "returned malformed' + NL
    + '     * JSON arguments" padahal JSON-nya hanya memuat backslash yang BUKAN escape' + NL
    + '     * JSON sah. Isi berkas yang menyebut path Windows atau regex (`D:' + B + 'Zephyr`,' + NL
    + '     * `' + B + 's+`, `' + B + 'd`) membuat serde menolak seluruh objek argumen, dan' + NL
    + '     * langkahnya mati - terbaca sebagai deretan merah di UI.' + NL
    + '     */' + NL
    + '    #[test]' + NL
    + '    fn repairs_invalid_backslash_escape() {' + NL
    + '        let args = ' + args1 + ';' + NL
    + '        let response = json!({' + NL
    + '            "choices": [{' + NL
    + '                "message": {' + NL
    + '                    "tool_calls": [{' + NL
    + '                        "id": "call-1",' + NL
    + '                        "function": { "name": "multi_edit", "arguments": args }' + NL
    + '                    }]' + NL
    + '                }' + NL
    + '            }]' + NL
    + '        });' + NL
    + NL
    + '        let hasil = parse_tool_response(&response).expect("escape liar harus diperbaiki");' + NL
    + '        assert_eq!(hasil.tool_calls[0].args["path"], "notes.md");' + NL
    + '        assert_eq!(hasil.tool_calls[0].args["content"], ' + harap1 + ');' + NL
    + '    }' + NL
    + NL
    + '    /*' + NL
    + '     * Kontrol negatif: perbaikan tadi hanya boleh menyentuh backslash yang TIDAK' + NL
    + '     * sah. Escape yang sah harus tetap berarti apa adanya - kalau tidak,' + NL
    + '     * perbaikan ini diam-diam mengubah isi berkas yang ditulis model.' + NL
    + '     */' + NL
    + '    #[test]' + NL
    + '    fn keeps_legal_escapes_meaning_the_same() {' + NL
    + '        let args = ' + args2 + ';' + NL
    + '        let response = json!({' + NL
    + '            "choices": [{' + NL
    + '                "message": {' + NL
    + '                    "tool_calls": [{' + NL
    + '                        "id": "call-1",' + NL
    + '                        "function": { "name": "write_file", "arguments": args }' + NL
    + '                    }]' + NL
    + '                }' + NL
    + '            }]' + NL
    + '        });' + NL
    + NL
    + '        let hasil = parse_tool_response(&response).expect("escape sah harus tetap sah");' + NL
    + '        assert_eq!(' + NL
    + '            hasil.tool_calls[0].args["content"],' + NL
    + '            ' + harap2 + NL
    + '        );' + NL
    + '    }' + NL
    + NL
)

s = s[:kepala] + tes + s[akhir:]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('tes ditulis ulang')
print('sisa char literal rusak:', len(re.findall(re.escape("'" + B + "'"), s)))
