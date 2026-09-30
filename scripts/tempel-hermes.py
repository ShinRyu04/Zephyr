import io, re

SRC = 'C:/Users/home/Downloads/Hermes Agent Logo - Black - zonalogo.com.svg'
DST = 'D:/Zephyr/src/components/terminal/PaneIcons.tsx'

svg = io.open(SRC, encoding='utf-8').read()
# Buang wrapper: ambil isi tiap <g>, buang transform-nya (viewBox 0 0 200 200
# = koordinat 0..24 x 8.3333, jadi path-nya langsung dipakai di viewBox 24).
groups = re.findall(r'<g[^>]*>(.*?)</g>', svg, re.S)
paths = []
for g in groups:
    for d in re.findall(r'\sd="([^"]+)"', g):
        paths.append(d)
print('path dari file user:', len(paths))

tsx = io.open(DST, encoding='utf-8', newline='').read()
crlf = '\r\n' in '\n'
start = tsx.index("    case 'hermes':")
end = tsx.index("    case 'grok':")

body = ''.join(
    '          <path fill="currentColor" d="%s" />\n' % d
    for d in paths
)

blok = """    case 'hermes':
      /*
       * The mark as its owner ships it: `Hermes Agent Logo - Black`, the asset
       * from zonalogo.com. Copied verbatim, all three paths, transform wrapper
       * dropped — the file's viewBox is 200 square around 24-unit coordinates
       * scaled by 8.333, so the same coordinates sit in a 24 viewBox.
       *
       * Filled in `currentColor` rather than black: the download is the black
       * cut, meant for light backgrounds, and a black mark on a dark sidebar is
       * an invisible mark. Inheriting the panel's ink is what the asset intends.
       */
      return (
        <svg {...p} viewBox="0 0 24 24" aria-label="Hermes Agent">
%s        </svg>
      );
""" % body

tsx = tsx[:start] + blok + tsx[end:]
io.open(DST, 'w', encoding='utf-8', newline='').write(tsx)
print('PaneIcons ditulis ulang')
