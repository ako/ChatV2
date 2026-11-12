"""Records a narrated walkthrough of the LIVE app from a beat spec, with the
narration WAVs made by make_voiceover_<name>.py (Chatterbox Turbo, on the Mac)
or by make_voiceover_kokoro.py (Kokoro, in the container).

    python3 demo/rec_live.py demo/servicedesk-copilot.json            # the film
    python3 demo/rec_live.py demo/servicedesk-copilot.json --silent   # timing test only

A variant of the prototype recorder (rec.py) for an app that has to run in real
time: Mendix's client, the AI answers and the workflow engine all keep their own
timers, so the page clock is not frozen. The browser is recorded in real time
(Playwright video), and each beat paints a coloured marker in the corner while
it is filmed. The beats are cut out of the take where the video shows their
marker (Playwright's video does not keep wall-clock time while the page is busy
waiting on an AI answer, so a clock map drifts by seconds); the film covers the
marker. Everything
between beats - waiting for an AI answer, switching user, waiting for a
workflow task - is off camera and never reaches the film.

Same rules as rec.py:
  * beat = one `say` line; its WAV is <work>/v-<sha1(say)[:10]>.wav
  * beat length = max(LEAD + voice + TAIL, last action + settle, min)
  * voice starts LEAD seconds into its beat; adelay + amix, no normalisation
  * NO fallback voice: a missing WAV stops the run before anything is recorded.
    (--silent writes silent placeholders to a separate test dir and output name,
    for checking the walk and its timing; that output is never the film.)

Spec additions for a live app (all optional per beat):
  prep   off-camera steps before the beat: {"login": [user, pw]}, {"logout": true},
         {"goto": url}, {"click_text": text}, {"click_button": name}, {"wait_ms": n},
         {"wait_answer": true}, {"scroll_last_card": true}, {"js": code},
         {"wait_js": expr, "timeout": s, "reload_click_text": text}
  check  {"js": expr, "why": text}: must be true before the beat is filmed, or the
         take stops (the line would say something the screen does not show)
  type   {"sel", "text", "at", "secs"}: types the text into a field during the beat
  send_at  seconds into the beat to press the chat's send button
"""
import hashlib, json, os, shutil, subprocess, sys, time
from playwright.sync_api import sync_playwright

LEAD, TAIL, SETTLE = 0.45, 0.9, 1.5
HOLD = 1.5                       # seconds held after each beat, off camera
ZOOM = 1.2                       # 1920x1080 video of a 1600x900 CSS layout
SIZE = {"width": 1920, "height": 1080}
CHROME = None   # None: the preinstalled Chromium that matches this Playwright

STAGE = r'''
if (!window.__recReady) { window.__recReady = true;
  const st = document.createElement('div'); st.id = 'stage';
  Object.assign(st.style, {position: 'fixed', left: '0', top: '0', width: '1600px', height: '900px', zIndex: 2147483000, pointerEvents: 'none'});
  document.body.append(st);
  // keep-alive: one pixel that always animates, so idle seconds are recorded as frames
  const ka = document.createElement('div');
  Object.assign(ka.style, {position: 'absolute', right: '0', bottom: '0', width: '1px', height: '1px', background: 'rgba(0,0,0,.02)', animation: 'recka 1s linear infinite'});
  const kst = document.createElement('style'); kst.textContent = '@keyframes recka { 50% { opacity: .2 } }';
  document.head.append(kst); st.append(ka);
  // beat marker: a block in the top-left corner whose colour names the beat
  // being filmed (blue between beats). The cut is found from it in the video
  // itself, and the film covers it.
  const mk = document.createElement('div'); mk.id = '__mark';
  Object.assign(mk.style, {position: 'absolute', left: '0', top: '0', width: '12px', height: '12px', background: 'rgb(0,0,255)', zIndex: 2147483647});
  st.append(mk);
  let n = 0;
  window.__sel = el => { if (!el) return '#__none__'; if (!el.dataset.rec) el.dataset.rec = 'r' + (++n); return '[data-rec="' + el.dataset.rec + '"]'; };
  // the newest answer in the conversation (the details panel has cards of its own)
  window.__last = () => { const a = document.querySelectorAll('.sd-conversation .crt-root'); return a[a.length - 1]; };
  window.__spot = el => { window.__unspot(); if (!el) return; const r = el.getBoundingClientRect(), k = st.getBoundingClientRect().width / 1600;
    const s = document.createElement('div'); s.id = '__spot';
    Object.assign(s.style, {position: 'absolute', left: (r.left / k - 6) + 'px', top: (r.top / k - 6) + 'px', width: (r.width / k + 12) + 'px', height: (Math.min(r.height, 900 * k - r.top) / k + 12) + 'px',
      border: '2px solid #4FD1C5', boxShadow: '0 0 0 4px rgba(79,209,197,.18)', borderRadius: '10px', opacity: '0', transition: 'opacity .35s ease'});
    st.append(s); requestAnimationFrame(() => { s.style.opacity = '1'; }); };
  window.__mark = i => { const m = document.getElementById('__mark'); if (m) m.style.background = i < 0 ? 'rgb(0,0,255)' : `rgb(${(i + 1) * 10},200,40)`; };
  window.__unspot = () => { const s = document.getElementById('__spot'); if (s) s.remove(); };
  window.__typeTo = (sel, text) => { const el = document.querySelector(sel); if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text); el.dispatchEvent(new Event('input', {bubbles: true})); };
  window.__commit = sel => { const el = document.querySelector(sel); if (el) el.dispatchEvent(new Event('change', {bubbles: true})); };
}
'''

# The prototype recorder's cursor, ripple and title card, unchanged.
HELP = r'''
if (!window.__cur && window.__curInit !== true) { window.__curInit = true; window.__cur = null; }
window.__click = (sel, also) => {
  const st = document.querySelector('#stage'); const el = document.querySelector(sel); if (!el) { console.error('no '+sel); return; }
  if (!__cur) { __cur = document.createElement('div'); __cur.id='__cur';
    __cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 8.5-6.6 1.6L9 18.5z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(__cur.style,{position:'absolute',left:'800px',top:'520px',zIndex:9999,pointerEvents:'none',transition:'left .6s cubic-bezier(.3,.1,.2,1), top .6s cubic-bezier(.3,.1,.2,1)',filter:'drop-shadow(0 2px 3px rgba(0,0,0,.3))'});
    st.append(__cur); }
  const k = st.getBoundingClientRect().width / 1600, sr = st.getBoundingClientRect(), r = el.getBoundingClientRect();
  __cur.style.left = ((r.left + r.width/2 - sr.left)/k - 4) + 'px'; __cur.style.top = ((r.top + r.height/2 - sr.top)/k - 2) + 'px';
  setTimeout(() => {
    const rp = document.createElement('div'); Object.assign(rp.style,{position:'absolute',left:(parseFloat(__cur.style.left)-12)+'px',top:(parseFloat(__cur.style.top)-12)+'px',width:'30px',height:'30px',borderRadius:'50%',background:'rgba(79,209,197,.4)',zIndex:9998,pointerEvents:'none',transition:'transform .45s ease-out, opacity .45s ease-out'});
    st.append(rp); requestAnimationFrame(()=>{ rp.style.transform='scale(2.2)'; rp.style.opacity='0'; }); setTimeout(()=>rp.remove(),600);
    el.click(); if (also) also();
  }, 700);
};
window.__card = (title, sub, out) => {
  let c = document.querySelector('#__card');
  if (!c) { c = document.createElement('div'); c.id='__card';
    Object.assign(c.style,{position:'absolute',inset:'0',zIndex:10000,background:'radial-gradient(1200px 700px at 30% 30%,#1d232b,#101316)',color:'#e9ecef',fontFamily:'Inter,sans-serif',display:'flex',flexDirection:'column',justifyContent:'center',padding:'0 130px',borderRadius:'12px',transition:'opacity .6s ease',opacity:'0'});
    document.querySelector('#stage').append(c); }
  if (!out) c.innerHTML = `<div style="font-size:18px;letter-spacing:.2em;color:#e0a43a;font-weight:600">MENDIX · AGENT DX</div><div style="font-size:120px;font-weight:700;letter-spacing:-.03em;margin-top:8px">Agent <span style="color:#5b9bff">Studio</span></div><div style="font-family:IBM Plex Mono,monospace;font-size:20px;color:#7d8790;margin-top:4px">built on mxcli 2.0</div><div style="font-size:34px;color:#aab3bc;margin-top:14px">${title}</div><div style="font-size:22px;color:#7d8790;margin-top:10px">${sub||''}</div>`;
  requestAnimationFrame(()=>{ c.style.opacity = out ? '0' : '1'; });
};
'''


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def voice_files(spec, work, silent):
    voices, missing = [], []
    for i, b in enumerate(spec["beats"]):
        p = f"{work}/v-{hashlib.sha1(b['say'].encode()).hexdigest()[:10]}.wav"
        if not os.path.exists(p):
            if not silent:
                missing.append((i, b["say"]))
                continue
            secs = max(1.5, len(b["say"].split()) / 2.5)   # placeholder length: 2.5 words per second
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                            "-t", f"{secs:.2f}", p], check=True)
        voices.append((p, probe_duration(p)))
    if missing:
        print("Missing narration WAVs - nothing recorded. Ask for these lines:")
        for i, say in missing:
            print(f"  beat {i:02d}: {say}")
        sys.exit(2)
    return voices


def main(spec_path, silent=False):
    spec = json.load(open(spec_path))
    name = spec["name"] + ("-TEST" if silent else "")
    work = f"/home/claude/rec/{name}"
    os.makedirs(work, exist_ok=True)
    voices = voice_files(spec, work, silent)
    raw = f"{work}/raw"
    shutil.rmtree(raw, ignore_errors=True)
    os.makedirs(raw)
    base = spec["url"].rstrip("/")

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        t_open = time.time()
        ctx = browser.new_context(viewport=SIZE, record_video_dir=raw, record_video_size=SIZE)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        def ready():
            pg.add_style_tag(content=f"html{{zoom:{ZOOM}}}")
            pg.evaluate(STAGE + HELP + ";0")

        def answers():
            return pg.evaluate("document.querySelectorAll('.sd-conversation .crt-root').length")

        state = {"answers": 0}

        def step(s):
            if "login" in s:
                u, pw = s["login"]
                pg.goto(base + "/login.html", wait_until="networkidle")
                pg.fill("#usernameInput", u); pg.fill("#passwordInput", pw); pg.click("#loginButton")
                pg.wait_for_timeout(4500); ready()
            elif "logout" in s:
                try:
                    pg.evaluate("mx.logout()")
                except Exception:
                    pass
                pg.wait_for_timeout(2500)
            elif "goto" in s:
                pg.goto(s["goto"], wait_until="networkidle"); ready()
            elif "click_text" in s:
                pg.get_by_text(s["click_text"], exact=True).first.click(); pg.wait_for_timeout(1500); ready()
            elif "click_button" in s:
                pg.get_by_role("button", name=s["click_button"]).first.click(); pg.wait_for_timeout(1500); ready()
            elif "check_setup" in s:
                if not pg.evaluate(s["check_setup"]):
                    raise SystemExit("INVALID take: setup did not reach its starting state")
            elif "wait_ms" in s:
                pg.wait_for_timeout(s["wait_ms"])
            elif "js" in s:
                pg.evaluate(s["js"])
            elif "wait_answer" in s:
                # the newest answer exists and has stopped changing (streaming finished)
                last, stable, deadline = "", 0, time.time() + 240
                while time.time() < deadline and stable < 3:
                    pg.wait_for_timeout(2000)
                    if answers() <= state["answers"]:
                        continue
                    txt = pg.evaluate("__last().innerText")
                    stable = stable + 1 if txt == last and txt and "Preparing a card" not in txt else 0
                    last = txt
                if stable < 3:
                    raise SystemExit("INVALID take: the answer did not arrive")
            elif "scroll_last_card" in s:
                pg.evaluate("(() => { const c = __last() && (__last().querySelector('.crt-card') || __last()); if (c) c.scrollIntoView({block: 'start'}); })()")
                pg.wait_for_timeout(900)
            elif "wait_js" in s:
                deadline = time.time() + s.get("timeout", 120)
                while not pg.evaluate(s["wait_js"]):
                    if time.time() > deadline:
                        raise SystemExit(f"INVALID take: timed out waiting for {s['wait_js'][:80]}")
                    pg.wait_for_timeout(3000)
                    if s.get("reload_click_text"):
                        pg.get_by_text(s["reload_click_text"], exact=True).first.click(); pg.wait_for_timeout(2500); ready()
            else:
                raise SystemExit(f"unknown step {s}")

        pg.goto(base + "/login.html", wait_until="networkidle")
        ready()
        for s in spec.get("setup", []):
            step(s)

        windows = []
        for i, bt in enumerate(spec["beats"]):
            for s in bt.get("prep", []):
                step(s)
            ready()
            chk = bt.get("check")
            if chk and not pg.evaluate(chk["js"]):
                raise SystemExit(f"INVALID take at beat {i}: {chk['why']} does not hold on screen")
            state["answers"] = answers()
            steps = [(float(t), js) for t, js in bt.get("do", [])]
            ty = bt.get("type")
            if ty:
                n = max(1, int(ty["secs"] * 8))
                sel = json.dumps(ty["sel"])
                for k in range(1, n + 1):
                    part = ty["text"][: round(len(ty["text"]) * k / n)]
                    steps.append((ty["at"] + ty["secs"] * k / n, f"__typeTo({sel}, {json.dumps(part)})"))
                steps.append((ty["at"] + ty["secs"] + 0.05, f"__commit({sel})"))
            if "send_at" in bt:
                steps.append((float(bt["send_at"]), "__click('.mx-name-btnSendMessage')"))
            steps.sort(key=lambda x: x[0])
            vdur = voices[i][1]
            dur = max(LEAD + vdur + TAIL, (steps[-1][0] + bt.get("settle", SETTLE)) if steps else 0, bt.get("min", 0))
            pg.evaluate("__mark(%d)" % i)
            t0 = time.time()
            for t, js in steps:
                wait = t0 + t - time.time()
                if wait > 0:
                    pg.wait_for_timeout(wait * 1000)
                pg.evaluate("(() => { " + js + "\n})()")
            rest = t0 + dur - time.time()
            if rest > 0:
                pg.wait_for_timeout(rest * 1000)
            pg.evaluate("__mark(-1)")
            windows.append((t0 - t_open, dur))
            print(name, "beat", i, round(dur, 1), "s", flush=True)
            # Hold still before the next off-camera step: the cut is placed on a
            # measured clock map, and a fraction of a second of drift must land
            # on this beat's last frame, not on a logout or a page change.
            pg.wait_for_timeout(HOLD * 1000)
        try:
            pg.evaluate("mx.logout()")
        except Exception:
            pass
        pg.wait_for_timeout(500)
        t_close = time.time()
        video = pg.video.path()
        ctx.close()
        browser.close()

    # Find each beat in the video by its marker colour. Playwright's video does
    # not keep wall-clock time while the page is busy (waiting on an AI answer),
    # so a clock map drifts by seconds; the marker cannot.
    vlen = probe_duration(video)
    FPS = 30
    raw_px = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", video, "-vf",
                             f"fps={FPS},crop=8:8:2:2,scale=1:1:flags=area,format=rgb24", "-f", "rawvideo", "-"],
                            capture_output=True, check=True).stdout
    px = [tuple(raw_px[k:k + 3]) for k in range(0, len(raw_px) - 2, 3)]

    def beat_of(c):
        r, g, b = c
        if b > 150 or g < 140:
            return -1
        return round(r / 10) - 1

    found = {}
    for f, c in enumerate(px):
        k = beat_of(c)
        if k >= 0:
            found.setdefault(k, [f, f])[1] = f
    missing = [j for j in range(len(windows)) if j not in found]
    if missing:
        raise SystemExit(f"beat markers not found in the video for beats {missing}")
    parts = []
    for j, (_, dur) in enumerate(windows):
        f0, f1 = found[j]
        start, seen = f0 / FPS, (f1 - f0 + 1) / FPS
        take = min(dur, seen)
        part = f"{work}/beat-{j:02d}.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", video, "-t", f"{take:.3f}",
                        "-vf", f"fps=30,drawbox=x=0:y=0:w=20:h=20:color=0x070B16@1:t=fill,tpad=stop_mode=clone:stop_duration={max(0, dur - take):.3f},format=yuv420p",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", part], check=True)
        parts.append(part)
    scale = vlen / (t_close - t_open)
    with open(f"{work}/parts.txt", "w") as f:
        f.writelines(f"file '{x}'\n" for x in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{work}/parts.txt",
                    "-c", "copy", f"{work}/picture.part.mp4"], check=True)
    starts, acc = [], 0.0
    for _, dur in windows:
        starts.append(acc); acc += dur
    total = probe_duration(f"{work}/picture.part.mp4")
    ins = sum([["-i", v[0]] for v in voices], [])
    flt = "".join(f"[{j}:a]adelay={int((s + LEAD) * 1000)}:all=1[a{j}];" for j, s in enumerate(starts)) \
        + "".join(f"[a{j}]" for j in range(len(voices))) \
        + f"amix=inputs={len(voices)}:normalize=0,apad=whole_dur={total:.3f}[m]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *ins, "-filter_complex", flt, "-map", "[m]", "-ar", "48000",
                    f"{work}/voice.wav"], check=True)
    out = f"/home/claude/rec/{name}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{work}/picture.part.mp4", "-i", f"{work}/voice.wav",
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
                    out + ".part.mp4"], check=True)
    os.replace(out + ".part.mp4", out)
    json.dump({"windows": windows, "starts": starts, "scale": scale, "voices": voices}, open(f"{work}/beats.json", "w"), indent=1)
    print(name, "done", round(total, 1), "s  scale", round(scale, 4), " page errors:", errs[:5])


if __name__ == "__main__":
    main(sys.argv[1], silent="--silent" in sys.argv)
