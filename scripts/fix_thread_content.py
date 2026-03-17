import pathlib, sys
BASE = pathlib.Path(".").resolve()
CLASSIFIER = BASE / "src" / "classifier.py"
content = CLASSIFIER.read_text(encoding="utf-8")

OLD = "        # E-Mail-Content k\u00fcrzen\n        content = truncate_text(parsed_email.body_plain, 2000)"
NEW = (
    "        # Vollst\u00e4ndiger Inhalt: body_plain + eingebettete Thread-Nachrichten\n"
    "        _parts = [parsed_email.body_plain or \"\"]\n"
    "        for _tm in (parsed_email.thread_messages or []):\n"
    "            if _tm.body and _tm.body.strip():\n"
    "                _header = f\"--- Von: {_tm.sender} ---\" if _tm.sender else \"--- Weitergeleitet ---\"\n"
    "                _parts.append(_header)\n"
    "                _parts.append(_tm.body.strip())\n"
    "        _full = \"\\n\\n\".join(p for p in _parts if p.strip())\n"
    "        content = truncate_text(_full, 4000)"
)

if OLD in content:
    CLASSIFIER.write_text(content.replace(OLD, NEW), encoding="utf-8")
    print("OK: classifier.py gepatcht")
elif "thread_messages or []" in content:
    print("OK: bereits gepatcht")
else:
    lines = content.splitlines()
    for i, l in enumerate(lines):
        if "truncate_text" in l and "body_plain" in l:
            print(f"FEHLER: Pattern nicht exakt. Zeile {i+1}: {repr(l)}")
            break
    sys.exit(1)
