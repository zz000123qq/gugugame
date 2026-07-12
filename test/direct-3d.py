"""Direct 3D generation: reads base64 from file, token from stdin, calls API directly.
   Avoids Windows CLI length limit (~32KB) by not passing base64 as argument."""
import sys, os, json, time, base64 as _b64

# Add buddy-cloud scripts to path so we can import its helpers
SCRIPT_DIR = "D:/Program Files/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/buddy-multimodal-generation/scripts"
sys.path.insert(0, SCRIPT_DIR)

# We need to import the internal functions from buddy-cloud.py
# But since it has a main() guard, we can import the functions we need
import importlib.util
spec = importlib.util.spec_from_file_location("buddy_cloud", os.path.join(SCRIPT_DIR, "buddy-cloud.py"))
bc = importlib.util.module_from_spec(spec)
# Don't execute module-level code (the main() call at bottom)
# Instead just load the functions we need

# Read the source and extract what we need
with open(os.path.join(SCRIPT_DIR, "buddy-cloud.py"), "r", encoding="utf-8") as f:
    source = f.read()

# Execute the source in our own namespace to get the helper functions
ns = {"__name__": "direct_3d", "sys": sys, "os": os, "json": json, "time": time, "_b64": _b64}
exec(source, ns)

# Now use the internal functions
b64_path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.workbuddy/tmp_b64.txt")
with open(b64_path, "r") as f:
    image_b64 = f.read().strip()

token = sys.stdin.readline().strip()
endpoint = ns["_DEFAULT_ENDPOINT"]
cfg = ns["_PROVIDER_MAP"]["3d"]

print(f"[INFO] Base64 size: {len(image_b64)} chars", file=sys.stderr)
print("[INFO] Submitting 3D generation request...", file=sys.stderr)

body = ns["_build_3d_body"](
    model="3.0",
    image_base64=image_b64,
    generate_type="LowPoly",
    face_count=30000,
)

submit_resp = ns["_call_api"](
    endpoint, cfg["provider"], cfg["service"], cfg["version"],
    cfg["submit_action"], body, token
)
print(json.dumps(submit_resp), flush=True)

if submit_resp.get("error"):
    sys.exit(1)

job_id = submit_resp.get("job_id")
if not job_id:
    print("[ERROR] No job_id in response", file=sys.stderr)
    sys.exit(1)

print(f"[INFO] Job submitted: {job_id}, polling...", file=sys.stderr)

# Poll for result
for attempt in range(120):  # max 10 minutes (5s * 120)
    time.sleep(5)
    poll_resp = ns["_poll_job"](
        endpoint, cfg["provider"], cfg["service"], cfg["version"],
        cfg["query_action"], job_id, token
    )
    status = poll_resp.get("status", "")
    print(f"[POLL] attempt={attempt+1} status={status}", file=sys.stderr)
    if status in ("DONE", "SUCCESS", "success"):
        print(json.dumps(poll_resp), flush=True)
        sys.exit(0)
    elif status in ("FAILED", "failed", "error"):
        print(json.dumps(poll_resp), flush=True)
        sys.exit(1)

print("[TIMEOUT] 3D generation took too long", file=sys.stderr)
sys.exit(1)
