import pathlib, sys
BASE = pathlib.Path(".").resolve()
SRC = BASE / "src"

def show(path, keywords, ctx=15):
    if not path.exists():
        print(f"FEHLT: {path}"); return
    lines = path.read_text(encoding="utf-8").splitlines()
    print(f"\n{'='*60}\nFILE: {path.name} ({len(lines)} Zeilen)\n{'='*60}")
    shown = set()
    for i, l in enumerate(lines):
        if any(kw.lower() in l.lower() for kw in keywords):
            s, e = max(0,i-3), min(len(lines),i+ctx)
            if s not in shown:
                print(f"\n  --- Zeile {s+1}-{e} ---")
                for j in range(s,e): print(f"  {'>>>' if j==i else '   '} {j+1:4}: {lines[j]}")
                shown.update(range(s,e))

show(SRC/"eml_parser.py", ["class ParsedEmail","body_plain","attachments","thread_messages","_extract_body","_parse_thread","dataclass"])
show(SRC/"classifier.py", ["body_plain","full_content","attachments","prompt","nachricht","betreff","def ","body"])

for fn in ["classifier.py","eml_parser.py"]:
    p = SRC/fn
    if p.exists():
        lines = p.read_text(encoding="utf-8").splitlines()
        print(f"\n{'='*60}\nSTRUKTUR: {fn}")
        for i,l in enumerate(lines,1):
            if l.strip().startswith(("def ","class ","async def ")): print(f"  {i:4}: {l}")
