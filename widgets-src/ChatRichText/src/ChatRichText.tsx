import { CSSProperties, ReactElement, useMemo } from "react";
import MarkdownIt from "markdown-it";
import { ChatRichTextContainerProps } from "../typings/ChatRichTextProps";
import { splitMessage } from "./components/segments";
import { CardView } from "./components/CardView";
import "./ui/ChatRichText.css";

// The same markdown setup as Mendix's Markdown viewer: raw HTML is escaped
// (html: false), links are recognised, typographic quotes are on.
const md = new MarkdownIt("default", { html: false, linkify: true, typographer: true });

export function ChatRichText(props: ChatRichTextContainerProps): ReactElement | null {
    // The runtime always passes class and style; the generated typings leave them
    // out once the widget declares system properties.
    const { stringAttribute, class: className, style } = props as ChatRichTextContainerProps & { class?: string; style?: CSSProperties };
    const value = stringAttribute.status === "available" ? stringAttribute.value ?? "" : "";
    const segments = useMemo(() => splitMessage(value), [value]);
    if (stringAttribute.status !== "available") return null;

    return (
        <div className={`widget-markdown crt-root ${className ?? ""}`} style={style}>
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
                return (
                    <div key={i} className={s.cards.length > 1 ? "crt-cards crt-cards-multi" : "crt-cards"}>
                        {s.cards.map((c, j) => <CardView key={j} card={c} />)}
                    </div>
                );
            })}
        </div>
    );
}
