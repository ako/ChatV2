import { CSSProperties, ReactElement, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
import { ChatRichTextContainerProps } from "../typings/ChatRichTextProps";
import { splitMessage } from "./components/segments";
import { CardView } from "./components/CardView";
import { sendToChat } from "./components/chatInput";
import "./ui/ChatRichText.css";

// The same markdown setup as Mendix's Markdown viewer: raw HTML is escaped
// (html: false), links are recognised, typographic quotes are on.
const md = new MarkdownIt("default", { html: false, linkify: true, typographer: true });

/** Plain text of the markdown parts, for reading aloud (cards are skipped). */
function speakable(texts: string[]): string {
    return texts.join("\n")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#*_>`|~-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const Icon = {
    up: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9h3zm3 9h7.2a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.4 10H14l.8-4.2A1.6 1.6 0 0 0 13.2 4L9 9.6V20z" /></svg>,
    down: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4h3v9h-3zm-3-9H6.8a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 5.6 14H10l-.8 4.2a1.6 1.6 0 0 0 1.6 1.8l4.2-5.6V4z" /></svg>,
    speak: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" /></svg>,
    stop: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z" /></svg>
};

export function ChatRichText(props: ChatRichTextContainerProps): ReactElement | null {
    // The runtime always passes class and style; the generated typings leave them
    // out once the widget declares system properties.
    const { stringAttribute, class: className, style, onRateUp, onRateDown, readAloud } = props as ChatRichTextContainerProps & { class?: string; style?: CSSProperties };
    const value = stringAttribute.status === "available" ? stringAttribute.value ?? "" : "";
    const segments = useMemo(() => splitMessage(value), [value]);
    const root = useRef<HTMLDivElement>(null);
    const [rated, setRated] = useState<"up" | "down" | undefined>();
    const [speaking, setSpeaking] = useState(false);
    if (stringAttribute.status !== "available") return null;

    const complete = !segments.some(s => s.kind === "pending");
    const canSpeak = readAloud && typeof window !== "undefined" && "speechSynthesis" in window;
    const showToolbar = complete && value.trim() !== "" && (onRateUp || onRateDown || canSpeak);

    const rate = (which: "up" | "down"): void => {
        const action = which === "up" ? onRateUp : onRateDown;
        if (rated === which || !action?.canExecute) return;
        action.execute();
        setRated(which);
    };
    const toggleSpeak = (): void => {
        const synth = window.speechSynthesis;
        if (speaking) { synth.cancel(); setSpeaking(false); return; }
        const text = speakable(segments.filter(s => s.kind === "markdown").map(s => (s as { text: string }).text));
        if (!text) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = document.documentElement.lang || "en";
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        synth.cancel();
        synth.speak(u);
        setSpeaking(true);
    };

    return (
        <div ref={root} className={`widget-markdown crt-root ${className ?? ""}`} style={style}>
            {segments.map((s, i) => {
                if (s.kind === "markdown") {
                    return <div key={i} className="crt-md" dangerouslySetInnerHTML={{ __html: md.render(s.text) }} />;
                }
                if (s.kind === "details") {
                    return (
                        <details key={i} className="crt-details">
                            <summary>{s.summary}</summary>
                            <div className="crt-md" dangerouslySetInnerHTML={{ __html: md.render(s.text) }} />
                        </details>
                    );
                }
                if (s.kind === "pending") {
                    return <div key={i} className="crt-card crt-pending" aria-busy="true">Preparing a card…</div>;
                }
                if (s.kind === "suggestions") {
                    return (
                        <div key={i} className="crt-suggest" role="group" aria-label="Suggested follow-up questions">
                            {s.items.map((q, j) => (
                                <button type="button" key={j} className="crt-suggest-chip" onClick={() => sendToChat(q, root.current)}>{q}</button>
                            ))}
                        </div>
                    );
                }
                return (
                    <div key={i} className={s.cards.length > 1 ? "crt-cards crt-cards-multi" : "crt-cards"}>
                        {s.cards.map((c, j) => <CardView key={j} card={c} />)}
                    </div>
                );
            })}
            {showToolbar && (
                <div className="crt-toolbar">
                    {onRateUp && (
                        <button type="button" className={`crt-tool${rated === "up" ? " crt-tool-on" : ""}`} aria-pressed={rated === "up"} aria-label="Helpful" title="Helpful" onClick={() => rate("up")}>{Icon.up}</button>
                    )}
                    {onRateDown && (
                        <button type="button" className={`crt-tool${rated === "down" ? " crt-tool-on" : ""}`} aria-pressed={rated === "down"} aria-label="Not helpful" title="Not helpful" onClick={() => rate("down")}>{Icon.down}</button>
                    )}
                    {canSpeak && (
                        <button type="button" className={`crt-tool${speaking ? " crt-tool-on" : ""}`} aria-pressed={speaking} aria-label={speaking ? "Stop reading" : "Read aloud"} title={speaking ? "Stop reading" : "Read aloud"} onClick={toggleSpeak}>{speaking ? Icon.stop : Icon.speak}</button>
                    )}
                    {rated && <span className="crt-tool-note">Thanks for the feedback</span>}
                </div>
            )}
        </div>
    );
}
