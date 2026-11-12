import { CSSProperties, ReactElement, useEffect, useRef, useState } from "react";
import { ChatCompanionContainerProps } from "../typings/ChatCompanionProps";
import "./ui/ChatCompanion.css";

// Two helpers for the chat page:
//  - a microphone button that types what the user says into Conversational
//    UI's message box (the browser's speech recognition; the user still sends
//    it, so nothing is sent by mistake). Hidden where the browser has none.
//  - a refresh action run every few seconds while the page is visible, so a
//    reply a person writes into the chat appears without reloading the page.

interface Recognition {
    lang: string; interimResults: boolean; continuous: boolean;
    onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
    onend: (() => void) | null; onerror: (() => void) | null;
    start(): void; stop(): void;
}

function recognitionClass(): (new () => Recognition) | undefined {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function messageBox(from: Element | null): HTMLTextAreaElement | null {
    const scope = from?.closest(".sd-conversation, .chat-container") ?? document;
    return scope.querySelector<HTMLTextAreaElement>(".mx-name-textAreaUserPrompt textarea, textarea[placeholder]");
}

function setBox(box: HTMLTextAreaElement, text: string, commit: boolean): void {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    if (commit) box.dispatchEvent(new Event("change", { bubbles: true }));
}

export function ChatCompanion(props: ChatCompanionContainerProps): ReactElement | null {
    const { voiceInput, refreshAction, refreshSeconds, class: className, style } = props as ChatCompanionContainerProps & { class?: string; style?: CSSProperties };
    const root = useRef<HTMLSpanElement>(null);
    const rec = useRef<Recognition | null>(null);
    const [listening, setListening] = useState(false);
    const Recognition = typeof window !== "undefined" ? recognitionClass() : undefined;

    // live refresh
    const action = useRef(refreshAction);
    action.current = refreshAction;
    useEffect(() => {
        if (!refreshAction) return;
        const ms = Math.max(2, refreshSeconds ?? 5) * 1000;
        const t = setInterval(() => {
            const a = action.current;
            if (document.visibilityState === "visible" && a?.canExecute && !a.isExecuting) a.execute();
        }, ms);
        return () => clearInterval(t);
    }, [!!refreshAction, refreshSeconds]);

    useEffect(() => () => rec.current?.stop(), []);

    const toggle = (): void => {
        if (listening) { rec.current?.stop(); return; }
        if (!Recognition) return;
        const box = messageBox(root.current);
        if (!box) return;
        const before = box.value ? box.value.replace(/\s*$/, " ") : "";
        const r = new Recognition();
        r.lang = document.documentElement.lang || "en-US";
        r.interimResults = true;
        r.continuous = false;
        let finalText = "";
        r.onresult = e => {
            let interim = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) finalText += t; else interim += t;
            }
            setBox(box, before + finalText + interim, false);
        };
        r.onend = () => { setListening(false); setBox(box, (before + finalText).trim(), true); box.focus(); };
        r.onerror = () => setListening(false);
        rec.current = r;
        r.start();
        setListening(true);
    };

    if (!voiceInput || !Recognition) return refreshAction ? <span className="ccomp-hidden" /> : null;
    return (
        <span ref={root} className={`ccomp ${className ?? ""}`} style={style}>
            <button type="button" className={`ccomp-mic${listening ? " ccomp-mic-on" : ""}`} aria-pressed={listening}
                aria-label={listening ? "Stop listening" : "Speak your message"} title={listening ? "Stop listening" : "Speak your message"} onClick={toggle}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2z" /></svg>
            </button>
        </span>
    );
}
