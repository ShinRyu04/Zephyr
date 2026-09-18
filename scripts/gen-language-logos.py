#!/usr/bin/env python3
# gen-language-logos.py — bangun logo data URI untuk 101 language pack.
# Sumber (prioritas): Simple Icons > Devicon > VS Code Icons (file_type)
#                      > Material Icon Theme.
# Keluaran: src-tauri/src/ext_lang_icons.rs  (const LOGO_URI: &[(&str, &str)])
import base64, html, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SI_DIR = os.path.join(ROOT, ".si-tmp", "package", "icons")
DEV_DIR = os.path.join(ROOT, ".si-tmp", "devicon-svg")
VSC_DIR = os.path.join(ROOT, ".si-tmp", "vscode-svg")
MAT_DIR = os.path.join(ROOT, ".si-tmp", "material-svg")
OUT = os.path.join(ROOT, "src-tauri", "src", "ext_lang_icons.rs")

# id paket bahasa -> (sumber, nama ikon)
MODE_ICON = {
    # ===== Simple Icons (monochrome brand, paling akurat) =====
    "asterisk": ("si", "asterisk"), "clike": ("si", "cplusplus"),
    "clojure": ("si", "clojure"), "cmake": ("si", "cmake"),
    "coffeescript": ("si", "coffeescript"), "commonlisp": ("si", "commonlisp"),
    "crystal": ("si", "crystal"), "css": ("si", "css"),
    "cypher": ("si", "neo4j"), "d": ("si", "d"),
    "dockerfile": ("si", "docker"), "dtd": ("si", "xml"),
    "elm": ("si", "elm"), "erlang": ("si", "erlang"),
    "fortran": ("si", "fortran"), "gherkin": ("si", "cucumber"),
    "go": ("si", "go"), "groovy": ("si", "apachegroovy"),
    "haskell": ("si", "haskell"), "haxe": ("si", "haxe"),
    "javascript": ("si", "javascript"), "jinja2": ("si", "jinja"),
    "julia": ("si", "julia"), "lua": ("si", "lua"),
    "mathematica": ("si", "wolframmathematica"), "mllike": ("si", "ocaml"),
    "nginx": ("si", "nginx"), "nsis": ("si", "nsis"),
    "octave": ("si", "octave"), "perl": ("si", "perl"),
    "pug": ("si", "pug"), "puppet": ("si", "puppet"),
    "python": ("si", "python"), "r": ("si", "r"),
    "ruby": ("si", "ruby"), "rust": ("si", "rust"),
    "sass": ("si", "sass"), "shell": ("si", "gnubash"),
    "solr": ("si", "apachesolr"), "stex": ("si", "latex"),
    "stylus": ("si", "stylus"), "swift": ("si", "swift"),
    "tiddlywiki": ("si", "tiddlywiki"), "toml": ("si", "toml"),
    "velocity": ("si", "velocity"), "wast": ("si", "webassembly"),
    "xml": ("si", "xml"), "yaml": ("si", "yaml"),
    # ===== Devicon (berwarna) =====
    "apl": ("dev", "apl"), "cobol": ("dev", "cobol"),
    "powershell": ("dev", "powershell"), "sql": ("dev", "sql"),
    "vb": ("dev", "visualbasic"),
    # ===== VS Code Icons (file_type_*) =====
    "diff": ("vsc", "diff"), "dylan": ("vsc", "dylan"),
    "http": ("vsc", "http"), "livescript": ("vsc", "livescript"),
    "protobuf": ("vsc", "protobuf"), "sas": ("vsc", "sas"),
    "tcl": ("vsc", "tcl"), "textile": ("vsc", "textile"),
    "verilog": ("vsc", "verilog"), "vhdl": ("vsc", "vhdl"),
    "xquery": ("vsc", "xquery"), "sparql": ("vsc", "sparql"),
    "ttcn": ("vsc", "ttcn"), "ttcn-cfg": ("vsc", "ttcn"),
    "q": ("vsc", "q"), "gas": ("vsc", "assembly"),
    # ===== Material Icon Theme (pelengkap) =====
    "brainfuck": ("mat", "brainfuck"), "forth": ("mat", "forth"),
    "pascal": ("mat", "pascal"), "scheme": ("mat", "scheme"),
}


def baca(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def get_si(slug):
    return baca(os.path.join(SI_DIR, f"{slug}.svg"))


def get_dev(name):
    return baca(os.path.join(DEV_DIR, f"{name}.svg"))


def get_vsc(name):
    return baca(os.path.join(VSC_DIR, f"{name}.svg"))


def get_mat(name):
    return baca(os.path.join(MAT_DIR, f"{name}.svg"))


def svg_uri(svg: str) -> str:
    # kecilkan: buang judul/deskripsi/komentar/prolog & atribut tak perlu
    svg = re.sub(r"<title>.*?</title>", "", svg, flags=re.S)
    svg = re.sub(r"<desc>.*?</desc>", "", svg, flags=re.S)
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r"^\s*<\?xml.*?\?>", "", svg, flags=re.S)
    svg = re.sub(r"\sxmlns:xlink=\"[^\"]*\"", "", svg)
    svg = re.sub(r"\s(?:enable-background|version)=\"[^\"]*\"", "", svg)
    svg = svg.strip()
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def main():
    for d in (DEV_DIR, VSC_DIR, MAT_DIR):
        os.makedirs(d, exist_ok=True)
    out, missing = {}, []
    for mode, (src, name) in MODE_ICON.items():
        svg = {
            "si": get_si, "dev": get_dev, "vsc": get_vsc, "mat": get_mat,
        }[src](name)
        if svg:
            out[f"zephyr.lang-{mode}"] = svg_uri(svg)
        else:
            missing.append((mode, src, name))

    lines = [
        "// ext_lang_icons.rs — DIBANGKITKAN OTOMATIS oleh scripts/gen-language-logos.py.",
        "// Jangan edit manual. Ikon SVG asli (Simple Icons / Devicon / VS Code Icons /",
        "// Material Icon Theme) di-embed sebagai data URI supaya Marketplace offline.",
        "pub const LOGO_URI: &[(&str, &str)] = &[",
    ]
    for pid in sorted(out):
        lines.append(f'    ("{pid}", "{out[pid]}"),')
    lines.append("];")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"OK tulis {len(out)} logo -> {OUT} ({os.path.getsize(OUT) // 1024} KB)")
    if missing:
        print("MISSING:", missing)


if __name__ == "__main__":
    main()