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

// `ref` names a node of the product graph (a SKU, issue id or order number).
// The widget turns it into a link that loads that node's details on demand.
export interface CardField { label: string; value: string; ref?: string }
export interface CardEvent { date: string; text: string }
export interface CardItem { title: string; text?: string; value?: string; ref?: string }

// A chart: one value per label, drawn as bars ("bars") or as one bar split
// into shares of the total ("stacked", for "where does the time go").
// share: the percentage of the total as the data source computed it; shown instead
// of one the widget would compute from (possibly rounded) values.
export interface ChartPoint { label: string; value: number; share?: number; ref?: string }
export interface Chart { kind: "bars" | "stacked"; unit?: string; points: ChartPoint[]; highlight?: string }

// An outline: a collapsible tree, e.g. a product with its components, parts
// and issues. Nodes nest up to OUTLINE_DEPTH levels.
export interface OutlineNode { label: string; value?: string; ref?: string; children: OutlineNode[] }

// A map: a route of stops (a parcel's tracking scans, oldest first) and/or
// points sized by a value (e.g. days waiting at each hub). Places are NAMES;
// the widget looks their coordinates up in the app (rest/places/v1), so a card
// can never put a made-up position on the map, and an unknown name is not drawn.
export interface MapStop { place: string; date?: string; text?: string; tone?: Tone }
export interface MapPoint { place: string; value?: number; label?: string }
export interface MapSpec { route: MapStop[]; points: MapPoint[]; unit?: string; highlight?: string }

// A 3D model of a product (a bike), with parts highlighted. The parts come from
// the product graph; the card only names which ones to light up.
export interface ModelSpec { ref: string; highlight: string[] }

// A side-by-side comparison of two or three products from the product graph.
// The card names them; their facts come from the graph.
export interface CompareSpec { refs: string[] }

export interface Card {
    type: string;
    title: string;
    subtitle?: string;
    status?: string;
    tone: Tone;
    fields: CardField[];
    timeline: CardEvent[];
    items: CardItem[];
    chart?: Chart;
    outline: OutlineNode[];
    // A network around one graph node, expandable in place.
    graph?: { ref: string };
    map?: MapSpec;
    model?: ModelSpec;
    compare?: CompareSpec;
    note?: string;
}

export type Segment =
    | { kind: "markdown"; text: string }
    | { kind: "details"; summary: string; text: string }
    | { kind: "cards"; cards: Card[] }
    | { kind: "suggestions"; items: string[] }
    | { kind: "pending" };

const TONES: Tone[] = ["neutral", "good", "warning", "critical", "info"];
const OUTLINE_DEPTH = 4;
const MAX_POINTS = 24;
const MAX_PLACES = 30;
const FENCE = /^(`{3,}|~{3,})[ \t]*(card|cards)[ \t]*$/i;
// A collapsible section: ~~~details <summary> ... ~~~ (markdown inside; use a
// tilde fence so the body can hold ``` code blocks).
const DETAILS = /^(~{3,}|`{3,})[ \t]*details(?:[ \t]+(.*))?$/i;
// Follow-up questions the user can send with one click: ```suggestions with a
// JSON array of short strings.
const SUGGEST = /^(`{3,}|~{3,})[ \t]*suggestions[ \t]*$/i;
const MAX_SUGGESTIONS = 4;

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

/** A reference to a graph node: letters, digits and - _ . : only, so it is safe in a URL path. */
export function cleanRef(v: unknown): string | undefined {
    const s = str(v)?.trim();
    return s && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(s) ? s : undefined;
}

function num(v: unknown): number | undefined {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
    return Number.isFinite(n) ? n : undefined;
}

function toChart(o: Record<string, unknown>): Chart | undefined {
    const source = o.data ?? o.series ?? (o.chart && typeof o.chart === "object" ? (o.chart as Record<string, unknown>).data : undefined);
    const points = list(source, p => {
        if (!p || typeof p !== "object") return undefined;
        const r = p as Record<string, unknown>;
        const label = str(r.label), value = num(r.value);
        return label !== undefined && value !== undefined && value >= 0 ? { label, value, share: num(r.share), ref: cleanRef(r.ref) } : undefined;
    }).slice(0, MAX_POINTS);
    if (!points.length) return undefined;
    const kindRaw = (str(typeof o.chart === "string" ? o.chart : o.kind) ?? "bars").toLowerCase();
    return { kind: kindRaw === "stacked" ? "stacked" : "bars", unit: str(o.unit), points, highlight: str(o.highlight) };
}

/** A place name: letters (any script), digits, spaces and . ' - only. */
export function cleanPlace(v: unknown): string | undefined {
    const s = str(v)?.trim();
    return s && /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{0,59}$/u.test(s) ? s : undefined;
}

function toMap(o: Record<string, unknown>): MapSpec | undefined {
    const route = list(o.route, s => {
        if (typeof s === "string") { const place = cleanPlace(s); return place ? { place } : undefined; }
        if (!s || typeof s !== "object") return undefined;
        const r = s as Record<string, unknown>;
        const place = cleanPlace(r.place);
        const toneRaw = (str(r.tone) ?? "").toLowerCase();
        return place ? { place, date: str(r.date), text: str(r.text), tone: (TONES as string[]).includes(toneRaw) ? (toneRaw as Tone) : undefined } : undefined;
    }).slice(0, MAX_PLACES);
    const points = list(o.points, s => {
        if (!s || typeof s !== "object") return undefined;
        const r = s as Record<string, unknown>;
        const place = cleanPlace(r.place);
        const value = num(r.value);
        return place ? { place, value: value !== undefined && value >= 0 ? value : undefined, label: str(r.label) } : undefined;
    }).slice(0, MAX_PLACES);
    if (!route.length && !points.length) return undefined;
    return { route, points, unit: str(o.unit), highlight: cleanPlace(o.highlight) };
}

function toOutline(v: unknown, depth: number): OutlineNode[] {
    if (depth > OUTLINE_DEPTH) return [];
    return list(v, n => {
        if (typeof n === "string") return { label: n, children: [] };
        if (!n || typeof n !== "object") return undefined;
        const r = n as Record<string, unknown>;
        const label = str(r.label) ?? str(r.title);
        return label !== undefined ? { label, value: str(r.value), ref: cleanRef(r.ref), children: toOutline(r.children, depth + 1) } : undefined;
    });
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
            return label !== undefined && value !== undefined ? { label, value, ref: cleanRef(r.ref) } : undefined;
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
            return title !== undefined ? { title, text: str(r.text), value: str(r.value), ref: cleanRef(r.ref) } : undefined;
        }),
        chart: toChart(o),
        outline: toOutline(o.outline, 1),
        graph: (str(o.type) ?? "").toLowerCase() === "graph" && cleanRef(o.ref) ? { ref: cleanRef(o.ref) as string } : undefined,
        map: toMap(o),
        model: (str(o.type) ?? "").toLowerCase() === "model" && cleanRef(o.ref)
            ? { ref: cleanRef(o.ref) as string, highlight: (Array.isArray(o.highlight) ? list(o.highlight, h => cleanRef(h)) : [cleanRef(o.highlight)].filter((h): h is string => !!h)).slice(0, 12) }
            : undefined,
        compare: (str(o.type) ?? "").toLowerCase() === "compare"
            ? (() => { const refs = list(o.refs, r => cleanRef(r)).slice(0, 3); return refs.length >= 2 ? { refs } : undefined; })()
            : undefined,
        note: str(o.note)
    };
    const empty = !card.title && !card.fields.length && !card.timeline.length && !card.items.length && !card.chart && !card.outline.length && !card.graph && !card.map && !card.model && !card.compare && !card.note;
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
        const det = DETAILS.exec(lines[i].trim());
        if (det) {
            const fence = det[1];
            let j = i + 1;
            const body: string[] = [];
            while (j < lines.length && lines[j].trim() !== fence) { body.push(lines[j]); j++; }
            flushMd();
            if (j >= lines.length) { out.push({ kind: "pending" }); return out; }
            out.push({ kind: "details", summary: (det[2] ?? "").trim() || "Details", text: body.join("\n") });
            i = j;
            continue;
        }
        const sug = SUGGEST.exec(lines[i].trim());
        if (sug) {
            let j = i + 1;
            const body: string[] = [];
            while (j < lines.length && !lines[j].trim().startsWith(sug[1].slice(0, 3))) { body.push(lines[j]); j++; }
            flushMd();
            if (j >= lines.length) return out;   // still streaming: show them once complete
            try {
                const parsed: unknown = JSON.parse(body.join("\n"));
                const items = list(parsed, s => { const v = str(s)?.trim(); return v && v.length <= 120 ? v : undefined; }).slice(0, MAX_SUGGESTIONS);
                if (items.length) out.push({ kind: "suggestions", items });
            } catch { /* not a list: leave it out */ }
            i = j;
            continue;
        }
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
