"""Wrapper: reads base64 from temp file, calls buddy-cloud.py 3d with --image-base64."""
import base64, subprocess, sys, os

SKILL_DIR = "D:/Program Files/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/buddy-multimodal-generation"
SCRIPT = os.path.join(SKILL_DIR, "scripts", "buddy-cloud.py")

# Read base64 from file
b64_path = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/z/.workbuddy/tmp_b64.txt"
with open(b64_path, "r") as f:
    b64 = f.read().strip()

token = input().strip()  # read token from stdin

cmd = [
    sys.executable, SCRIPT, "3d",
    "--image-base64", b64,
    "--generate-type", "LowPoly",
    "--model", "3.0",
    "--face-count", "30000",
    "--token-stdin"
]

proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
out, _ = proc.communicate(input=token, timeout=600)
print(out)
