#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Poll the 咕咕嘎嘎 3D job until DONE, then download result files to public/."""
import io, os, sys, json, time, urllib.request

# ensure utf-8
if sys.stdout.encoding and sys.stdout.encoding.lower().replace('-', '') != 'utf8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower().replace('-', '') != 'utf8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

SRC = r"D:/Program Files/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/buddy-multimodal-generation/scripts/buddy-cloud.py"
PUBLIC = r"F:/算法/游戏/SBGame/public"
os.makedirs(PUBLIC, exist_ok=True)

token = sys.stdin.read().strip()
if not token:
    print("[ERR] no token on stdin", file=sys.stderr); sys.exit(2)

ns = {"__name__": "__not_main__"}
with open(SRC, "r", encoding="utf-8") as f:
    src = f.read()
exec(compile(src, SRC, "exec"), ns)

_call_api = ns["_call_api"]
_poll_job = ns["_poll_job"]
_PROVIDER_MAP = ns["_PROVIDER_MAP"]
cfg = _PROVIDER_MAP["3d"]
endpoint = ns["_DEFAULT_ENDPOINT"]
provider = cfg["provider"]; service = cfg["service"]; version = cfg["version"]
query_action = cfg["query_action"]

JOB_ID = "1467733422763819008"

print(f"[INFO] endpoint={endpoint}", file=sys.stderr)
result = _poll_job(endpoint, provider, service, version, query_action, JOB_ID, token, 5, 600)
print("[INFO] JOB DONE", file=sys.stderr)
print(json.dumps(result, ensure_ascii=False, indent=2))

# Extract result files
files = result.get("ResultFile3Ds") or result.get("ResultFile3D") or []
if isinstance(files, dict):
    files = [files]
# also check generic url fields
for uf in ("ResultUrl", "ModelUrl", "ResultModelUrl"):
    if result.get(uf) and not files:
        files = [result[uf]]

print(f"[INFO] found {len(files)} result file(s)", file=sys.stderr)
saved = []
for i, f in enumerate(files):
    url = None
    if isinstance(f, str):
        url = f
    elif isinstance(f, dict):
        # common shapes: {"Url":..., "FileName":...} / {"FileUrl":...}
        url = f.get("Url") or f.get("FileUrl") or f.get("url") or f.get("DownloadUrl")
    if not url:
        print(f"[WARN] file {i} has no url: {f}", file=sys.stderr)
        continue
    # pick a sensible filename
    fname = None
    if isinstance(f, dict):
        fname = f.get("FileName") or f.get("FileName") or f.get("name")
    if not fname:
        # derive from url
        base = url.split("?")[0].rstrip("/").split("/")[-1]
        fname = base or f"gugugaga_{i}"
    # normalize extension
    lname = fname.lower()
    if not (lname.endswith(".glb") or lname.endswith(".gltf") or lname.endswith(".obj")):
        fname = "gugugaga.glb" if i == 0 else f"gugugaga_{i}.glb"
    if "gugugaga" in fname:
        dest = os.path.join(PUBLIC, fname)
    else:
        ext = os.path.splitext(fname)[1] or ".glb"
        dest = os.path.join(PUBLIC, f"gugugaga_{i}{ext}")
    print(f"[INFO] downloading -> {dest}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    with open(dest, "wb") as out:
        out.write(data)
    saved.append(dest)
    print(f"[OK] saved {os.path.getsize(dest)} bytes -> {dest}", file=sys.stderr)

print(json.dumps({"saved": saved}, ensure_ascii=False))
