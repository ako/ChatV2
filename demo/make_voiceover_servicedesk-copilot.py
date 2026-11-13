"""Narration for the ServiceDesk Copilot demo video (servicedesk-copilot), one WAV per beat.

Runs on the Mac against oMLX (Chatterbox Turbo). Python standard library only.

    MODEL=chatterbox-turbo-fp16 BASE=http://localhost:8000 python3 make_voiceover_servicedesk-copilot.py

Writes servicedesk-copilot-beat-NN.wav next to this script. The recorder matches each
WAV to its beat by a hash of the exact text below: do not edit a line without
re-recording it.
"""
import json
import os
import urllib.request

BASE = os.environ.get("BASE", "http://localhost:8000").rstrip("/")
MODEL = os.environ.get("MODEL", "chatterbox-turbo-fp16")
VOICE = os.environ.get("VOICE")
HERE = os.path.dirname(os.path.abspath(__file__))

BEATS = {
    0: "This is Service Desk Copilot. A support assistant for an online bike shop, built in Agent Studio, on M X C L I two point oh.",
    1: "Ada is a customer. She starts by asking where her latest order is.",
    2: "Instead of a wall of text, the answer is a card, with every tracking scan of her parcel.",
    3: "Next, she asks how long her deliveries usually take.",
    4: "The assistant charts her own history. Ten orders, three point seven days on average.",
    5: "And where does the time go?",
    6: "Most of it is spent waiting at the carrier's hub. Venlo is the slowest.",
    7: "Now a product question, about the city e-bike.",
    8: "The answer is an outline: what ships with the bike, what fits it, and any recall.",
    9: "Every underlined name opens its details, straight from the product catalogue.",
    10: "Including what a recall means, and what to do about it.",
    11: "Then Ada wants to return a light set she never used.",
    12: "The assistant prepares the return, and asks her to confirm first.",
    13: "From here, a Mendix workflow takes over. An AI agent checks the request against the returns policy.",
    14: "Sam, on the support team, gets a task: approve the reply.",
    15: "The agent found the return eligible, explained why, and drafted the reply, with a return label.",
    16: "Sam reads it, and sends it with one click.",
    17: "On her Returns page, Ada already has the answer, and her return label.",
    18: "Cards, charts, outlines, and agents inside workflows. All grounded in the shop's own data.",
}

for index, text in BEATS.items():
    payload = {"model": MODEL, "input": text, "response_format": "wav"}
    if VOICE:
        payload["voice"] = VOICE
    request = urllib.request.Request(
        BASE + "/v1/audio/speech",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        audio = response.read()
    name = f"servicedesk-copilot-beat-{index:02d}.wav"
    with open(os.path.join(HERE, name), "wb") as f:
        f.write(audio)
    print(name, flush=True)
