"""Copies the narration WAVs into the recorder's work dir under their beat hash.

    python3 demo/wire_voice.py demo/servicedesk-copilot.json <dir-with-attachments> [prefix]

Attachments arrive as <hash>-<video>-beat-NN.wav; they are matched on the part
after the hash prefix (prefix defaults to "<video>-beat-"). Each is copied to
/home/claude/rec/<name>/v-<sha1(say)[:10]>.wav for the beat NN it belongs to.
Reports every beat that still has no WAV; never makes one up.
"""
import hashlib, json, os, re, shutil, sys

spec = json.load(open(sys.argv[1]))
src = sys.argv[2]
prefix = sys.argv[3] if len(sys.argv) > 3 else spec["name"] + "-beat-"
work = f"/home/claude/rec/{spec['name']}"
os.makedirs(work, exist_ok=True)
pattern = re.compile(r"(?:^|-)" + re.escape(prefix) + r"(\d{2})\.wav$")
found = {}
for f in sorted(os.listdir(src)):
    m = pattern.search(f)
    if m:
        found[int(m.group(1))] = os.path.join(src, f)
missing = []
for i, beat in enumerate(spec["beats"]):
    dst = f"{work}/v-{hashlib.sha1(beat['say'].encode()).hexdigest()[:10]}.wav"
    if i in found:
        shutil.copyfile(found[i], dst)
        print(f"beat {i:02d}  {os.path.basename(found[i])} -> {os.path.basename(dst)}")
    elif not os.path.exists(dst):
        missing.append(i)
if missing:
    print("still missing:", ", ".join(f"{i:02d}" for i in missing))
    sys.exit(2)
print("every beat has its narration")
