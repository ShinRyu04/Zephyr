import os, sys, importlib.util
H = r"C:\Users\Zyrex\.cache\clean-room-cli\node_modules\clean-room-skill\hooks"
sys.path.insert(0, H)

cands = [
    r"C:\Users\Zyrex\.cleanroom\artifacts\docs",
    r"C:\Users\Zyrex\.cleanroom\docs\refs",
    r"C:\Users\Zyrex\.cleanroom\artifacts\src",
    r"C:\Users\Zyrex\.cleanroom\outputs\docs",
    r"C:\Users\Zyrex\.cleanroom\spec\docs",
]
for c in cands:
    os.environ["CLEAN_ROOM_SOURCE_ROOTS"] = r"D:\Zephyr\src" + os.pathsep + c
    spec = importlib.util.spec_from_file_location("leak_" + str(abs(hash(c))), os.path.join(H, "check-artifact-leakage.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    terms = [t for t, _ in m.compile_source_name_terms()]
    print(c, "->", terms)
