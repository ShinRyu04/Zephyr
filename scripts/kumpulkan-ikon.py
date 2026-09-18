#!/usr/bin/env python3
# kumpulkan-ikon.mjs? no — Python. Fetch Simple Icons: slug + path + hex.
# Dipakai offline script buat generate logo data URI untuk 101 language pack.
import json, urllib.request, re, sys

URL = "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/_data/simple-icons.json"
try:
    with urllib.request.urlopen(URL, timeout=30) as r:
        data = json.load(r)
    icons = data.get("icons", data) if isinstance(data, dict) else data
    # slug bisa di "slug" atau turunan dari title
    res = {}
    for ic in icons:
        slug = ic.get("slug") or re.sub(r"[^a-z0-9]+", "", ic.get("title","").lower())
        if not slug:
            continue
        res[slug] = {"title": ic.get("title",""), "hex": ic.get("hex",""), "path": ic.get("path","")}
    with open("simple-icons-dump.json","w",encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, sort_keys=True)
    print(f"OK {len(res)} icons -> simple-icons-dump.json")
except Exception as e:
    print("GAGAL:", e)
    sys.exit(1)