import sys, os, re
sys.path.insert(0, r"C:\Users\Zyrex\.cache\clean-room-cli\node_modules\clean-room-skill\hooks")
import importlib.util
spec = importlib.util.spec_from_file_location("leak", r"C:\Users\Zyrex\.cache\clean-room-cli\node_modules\clean-room-skill\hooks\check-artifact-leakage.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

print("GENERIC_PATH_TOKENS:", sorted(m.GENERIC_PATH_TOKENS))

os.environ["CLEAN_ROOM_SOURCE_ROOTS"] = r"D:\Zephyr\src" + os.pathsep + r"D:\Referensi TRAE Agent Window"
terms = m.compile_source_name_terms()
print("TERMS:", [t for t, _ in terms])

candidates = [
    "CLEAN_ROOM_IMPLEMENTATION_ROOTS[0]",
    "implementation-root-1",
    "read-write-for-agent-3",
]
for c in candidates:
    hits = [t for t, p in terms if p.search(c)]
    print(repr(c), "->", hits)
