import os, sys, importlib.util
H = r"C:\Users\Zyrex\.cache\clean-room-cli\node_modules\clean-room-skill\hooks"
sys.path.insert(0, H)
os.environ["CLEAN_ROOM_SOURCE_ROOTS"] = r"D:\Zephyr\src" + os.pathsep + r"C:\Users\Zyrex\.cleanroom\visual-evidence"
spec = importlib.util.spec_from_file_location("leak", os.path.join(H, "check-artifact-leakage.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
terms = m.compile_source_name_terms()
print("TERMS:", [t for t, _ in terms])
for probe in ["evidence_refs", "evidence-ledger:item-001", "visual-index:batch-0001", "spec-foundation", "unit-foundation", "evidence-ledger:visual-001", "evidence-ledger:item-visual-001"]:
    hits = [t for t, p in terms if p.search(probe)]
    print(repr(probe), "->", hits)
