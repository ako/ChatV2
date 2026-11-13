"""Narration WAVs for a beat spec, made with Kokoro (kokoro-onnx) in the container.

    python3 demo/make_voiceover_kokoro.py demo/servicedesk-copilot.json \
        --model <dir>/kokoro-v1.0.onnx --voices <dir>/voices-v1.0.bin [--voice af_heart] [--speed 1.0]

Writes /home/claude/rec/<name>/v-<sha1(say)[:10]>.wav for every beat, the
names rec_live.py looks for, and skips a line whose WAV already exists (pass
--force to remake them). The model files come from the kokoro-onnx releases
(model-files-v1.0); they are not committed.
"""
import argparse, hashlib, json, os, sys

import soundfile as sf
from kokoro_onnx import Kokoro


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    spec = json.load(open(a.spec))
    work = f"/home/claude/rec/{spec['name']}"
    os.makedirs(work, exist_ok=True)
    tts = Kokoro(a.model, a.voices)
    for i, beat in enumerate(spec["beats"]):
        say = beat["say"]
        path = f"{work}/v-{hashlib.sha1(say.encode()).hexdigest()[:10]}.wav"
        if os.path.exists(path) and not a.force:
            print(f"beat {i:02d}: kept {os.path.basename(path)}")
            continue
        samples, rate = tts.create(say, voice=a.voice, speed=a.speed, lang="en-us")
        sf.write(path, samples, rate)
        print(f"beat {i:02d}: {len(samples) / rate:5.1f}s  {say[:70]}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
