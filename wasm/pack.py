"""Packs a Statico site folder into one JSON file for the playground:
{"path": {"text": "..."} or {"base64": "..."}}. Text files stay readable
(and editable); fonts and images travel as base64."""
import base64, json, os, sys

src, out = sys.argv[1], sys.argv[2]
skip_dirs = {"_site", "node_modules", ".git", ".statico"}
files = {}
for base, dirs, names in os.walk(src):
    dirs[:] = sorted(d for d in dirs if d not in skip_dirs)
    for name in sorted(names):
        if name in (".DS_Store", ".gitignore", "README.md"):
            continue
        path = os.path.join(base, name)
        rel = os.path.relpath(path, src).replace(os.sep, "/")
        data = open(path, "rb").read()
        try:
            files[rel] = {"text": data.decode("utf-8")}
        except UnicodeDecodeError:
            files[rel] = {"base64": base64.b64encode(data).decode("ascii")}
with open(out, "w") as f:
    json.dump(files, f, ensure_ascii=False, separators=(",", ":"))
print(f"{out}: {len(files)} files")
