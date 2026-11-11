// Splits a chat message into markdown and card segments.
//
// A card block is a fenced code block whose info string is `card` (one card)
// or `cards` (a JSON array of cards):
//
//   ```card
//   {"type":"order","title":"SO-10002","status":"Shipped","tone":"warning",
//    "fields":[{"label":"Total","value":"EUR 89.50"}]}
//   ```
//
// The content is data, never markup: it is parsed as JSON and every value is
// rendered as text, so a model cannot inject HTML through a card.
// While a message streams in, a card block that has opened but not yet closed
// is reported as "pending" so the UI can show a placeholder instead of raw JSON.

export type Tone = "neutral" | "good" | "warning" | "critical" | "info";

export interface CardField { label: string; value: string }
export interface CardEvent { date: string; text: string }
export interface CardItem { title: string; text?: string; value?: string }

export interface Card {
    type: string;
    title: string;
    subtitle?: string;
    status?: string;
    tone: Tone;
    fields: CardField[];
    timeline: CardEvent[];
    items: CardItem[];
    note?: string;
}

export type Segment =
    | { kind: "markdown"; text: string }
    | { kind: "cards"; cards: Card[] }
    | { kind: "pending" };

const TONES: Tone[] = ["neutral", "good", "warning", "critical", "info"];
const FENCE = /^(`{3,}|~{3,})[ \t]*(card|cards)[ \t]*$/i;

function str(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "string") return v.trim() === "" ? undefined : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return undefined;
}

function list<T>(v: unknown, map: (x: unknown) => T | undefined): T[] {
    if (!Array.isArray(v)) return [];
    const out: T[] = [];
    for (const x of v) {
        const m = map(x);
        if (m !== undefined) out.push(m);
    }
    return out;
}

/** Turns one parsed JSON value into a Card, or undefined when it has nothing to show. */
export function toCard(raw: unknown): Card | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const toneRaw = (str(o.tone) ?? "neutral").toLowerCase();
    const card: Card = {
        type: (str(o.type) ?? "info").toLowerCase(),
        title: str(o.title) ?? "",
        subtitle: str(o.subtitle),
        status: str(o.status),
        tone: (TONES as string[]).includes(toneRaw) ? (toneRaw as Tone) : "neutral",
        fields: list(o.fields, f => {
            if (!f || typeof f !== "object") return undefined;
            const r = f as Record<string, unknown>;
            const label = str(r.label), value = str(r.value);
            return label !== undefined && value !== undefined ? { label, value } : undefined;
        }),
        timeline: list(o.timeline, e => {
            if (!e || typeof e !== "object") return undefined;
            const r = e as Record<string, unknown>;
            const text = str(r.text);
            return text !== undefined ? { date: str(r.date) ?? "", text } : undefined;
        }),
        items: list(o.items, i => {
            if (typeof i === "string") return { title: i };
            if (!i || typeof i !== "object") return undefined;
            const r = i as Record<string, unknown>;
            const title = str(r.title);
            return title !== undefined ? { title, text: str(r.text), value: str(r.value) } : undefined;
        }),
        note: str(o.note)
    };
    const empty = !card.title && !card.fields.length && !card.timeline.length && !card.items.length && !card.note;
    return empty ? undefined : card;
}

export function splitMessage(content: string): Segment[] {
    const lines = (content ?? "").split("\n");
    const out: Segment[] = [];
    let md: string[] = [];
    const flushMd = (): void => {
        const text = md.join("\n");
        if (text.trim() !== "") out.push({ kind: "markdown", text });
        md = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const open = FENCE.exec(lines[i].trim());
        if (!open) { md.push(lines[i]); continue; }

        const fence = open[1];
        const plural = open[2].toLowerCase() === "cards";
        let j = i + 1;
        const body: string[] = [];
        while (j < lines.length && !lines[j].trim().startsWith(fence.slice(0, 3)) ) { body.push(lines[j]); j++; }

        if (j >= lines.length) { // still streaming: the fence has not closed yet
            flushMd();
            out.push({ kind: "pending" });
            return out;
        }

        let cards: Card[] = [];
        try {
            const parsed: unknown = JSON.parse(body.join("\n"));
            const arr = plural || Array.isArray(parsed) ? (Array.isArray(parsed) ? parsed : [parsed]) : [parsed];
            cards = list(arr, toCard);
        } catch {
            cards = [];
        }
        if (cards.length) {
            flushMd();
            out.push({ kind: "cards", cards });
        } else {
            // Not valid card data: keep it visible as an ordinary code block.
            md.push("```json", ...body, "```");
        }
        i = j;
    }
    flushMd();
    return out;
}
