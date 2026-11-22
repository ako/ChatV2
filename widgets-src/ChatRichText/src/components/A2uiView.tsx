import { CSSProperties, ReactElement, ReactNode, useMemo, useRef, useState } from "react";
import { A2uiComponent, Surface, absolute, asText, bindingPath, buildSurfaces, childEntries, resolve, setPath } from "./a2ui";
import { toCard } from "./segments";
import { CardView } from "./CardView";
import { sendToChat } from "./chatInput";

// Draws A2UI surfaces with this app's look: the basic catalog (Text, Image,
// Icon, Row, Column, List, Card, Tabs, Modal, Divider, Button, TextField,
// CheckBox, ChoicePicker, Slider, DateTimeInput) and this app's own catalog,
// whose one component, ServiceDeskCard, is any of the chat's cards:
//   {"id":"c","component":"ServiceDeskCard","card":{"type":"order","title":"SO-10002",…}}
//
// Inputs write to the surface's data model in the browser. A button's event
// action is sent back as the user's next chat message (its userMessage, or its
// name, with the context it names), which is how the agent that drew the form
// hears about it. Media come only from this app (relative URLs) or data: URLs,
// so a surface from another agent cannot make the browser call a third party.

export const SERVICEDESK_CATALOG = "https://servicedesk.example/a2ui/catalog/v1";
const MAX_DEPTH = 16;

const ICONS: Record<string, string> = {
    check: "✓", close: "✕", info: "ℹ", warning: "⚠", error: "⚠", star: "★", calendar: "📅", event: "📅",
    person: "👤", accountCircle: "👤", mail: "✉", email: "✉", phone: "☎", call: "☎", home: "⌂", search: "⌕",
    shoppingCart: "🛒", payment: "💳", locationOn: "📍", place: "📍", favorite: "♥", help: "?", settings: "⚙",
    arrowForward: "→", arrowBack: "←", add: "+", remove: "−", edit: "✎", delete: "🗑", share: "⇪", send: "➤"
};

function safeMedia(url: string): string | undefined {
    if (url.startsWith("data:image/") || url.startsWith("data:audio/") || url.startsWith("data:video/")) return url;
    if (/^\/(?!\/)/.test(url) || /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.%-]*)*$/.test(url)) return url;   // this app only
    return undefined;
}

function safeLink(url: string): string | undefined {
    return /^https:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : undefined;
}

function str(v: unknown, max = 2000): string {
    return asText(v).slice(0, max);
}

interface Ctx { surface: Surface; data: unknown; setAt: (pointer: string, value: unknown) => void; root: () => HTMLElement | null }

function flex(props: A2uiComponent): CSSProperties | undefined {
    const w = typeof props.weight === "number" && props.weight > 0 ? props.weight : undefined;
    return w ? { flex: `${w} 1 0` } : undefined;
}

const JUSTIFY: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", spaceBetween: "space-between", spaceAround: "space-around", spaceEvenly: "space-evenly", stretch: "stretch" };
const ALIGN: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", stretch: "stretch" };

function sendAction(c: A2uiComponent, ctx: Ctx, base: string): void {
    const action = (c.action ?? {}) as Record<string, unknown>;
    const ev = action.event as Record<string, unknown> | undefined;
    const fn = (action.functionCall ?? action.call) as Record<string, unknown> | undefined;
    if (fn && typeof fn === "object") {
        const name = fn["@call"] ?? fn.call;
        const args = (fn.args ?? {}) as Record<string, unknown>;
        const url = safeLink(str(resolve(args.url, ctx.data, base)));
        if (name === "openUrl" && url) window.open(url, "_blank", "noopener");
        return;
    }
    if (!ev || typeof ev !== "object") return;
    const name = str(ev.name, 80) || "action";
    const parts: string[] = [];
    const context = ev.context && typeof ev.context === "object" ? (ev.context as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(context).slice(0, 12)) {
        const value = resolve(v, ctx.data, base);
        parts.push(`${k}: ${Array.isArray(value) ? value.map(x => asText(x)).join(", ") : str(value, 200)}`);
    }
    const lead = str(resolve(ev.userMessage, ctx.data, base), 300) || name;
    sendToChat(parts.length ? `${lead} — ${parts.join("; ")}` : lead, ctx.root());
}

function Node({ id, base, ctx, depth }: { id: string; base: string; ctx: Ctx; depth: number }): ReactElement | null {
    const c = ctx.surface.components.get(id);
    if (!c || depth > MAX_DEPTH) return null;
    const val = (v: unknown): unknown => resolve(v, ctx.data, base);
    const kids = (v: unknown): ReactNode[] => childEntries(v, ctx.data, base).map((e, i) => <Node key={`${e.id}-${i}`} id={e.id} base={e.base} ctx={ctx} depth={depth + 1} />);
    const one = (v: unknown): ReactNode => (typeof v === "string" ? <Node id={v} base={base} ctx={ctx} depth={depth + 1} /> : null);
    const bound = (v: unknown): string | undefined => { const p = bindingPath(v); return p ? absolute(p, base) : undefined; };
    const style = flex(c);

    switch (c.component) {
        case "Text": {
            const variant = str(c.variant ?? c.usageHint, 20);
            const text = str(val(c.text));
            if (/^h[1-5]$/.test(variant)) return <div className={`crt-a2-heading crt-a2-${variant}`} style={style}>{text}</div>;
            return <p className={`crt-a2-text${variant === "caption" ? " crt-a2-caption" : ""}`} style={style}>{text}</p>;
        }
        case "Image": {
            const url = safeMedia(str(val(c.url)));
            const alt = str(val(c.description), 300);
            return url ? <img className={`crt-a2-img crt-a2-img-${str(c.variant, 20) || "mediumFeature"}`} style={style} src={url} alt={alt} /> : (alt ? <span className="crt-a2-caption" style={style}>{alt}</span> : null);
        }
        case "Icon": {
            const name = str(val(c.name), 40);
            return ICONS[name] ? <span className="crt-a2-icon" aria-hidden="true" style={style}>{ICONS[name]}</span> : null;
        }
        case "Video":
        case "AudioPlayer": {
            const url = safeMedia(str(val(c.url)));
            if (!url) { const d = str(val(c.description), 300); return d ? <span className="crt-a2-caption" style={style}>{d}</span> : null; }
            return c.component === "Video" ? <video className="crt-a2-media" style={style} src={url} controls /> : <audio className="crt-a2-media" style={style} src={url} controls />;
        }
        case "Row":
        case "Column":
        case "List": {
            const horizontal = c.component === "Row" || (c.component === "List" && c.direction === "horizontal");
            return (
                <div className={`crt-a2-${c.component.toLowerCase()}`} style={{ ...style, display: "flex", flexDirection: horizontal ? "row" : "column", justifyContent: JUSTIFY[str(c.justify, 20)] ?? undefined, alignItems: ALIGN[str(c.align, 20)] ?? undefined }}>
                    {kids(c.children)}
                </div>
            );
        }
        case "Card":
            return <div className="crt-a2-card" style={style}>{one(c.child)}</div>;
        case "Divider":
            return <hr className={`crt-a2-divider${c.axis === "vertical" ? " crt-a2-divider-v" : ""}`} style={style} />;
        case "Tabs":
            return <A2Tabs c={c} base={base} ctx={ctx} depth={depth} />;
        case "Modal":
            return <A2Modal c={c} base={base} ctx={ctx} depth={depth} />;
        case "Button":
            return (
                <button type="button" className={`btn mx-button crt-a2-button${c.variant === "primary" ? " btn-primary" : c.variant === "borderless" ? " crt-a2-borderless" : ""}`} style={style} onClick={() => sendAction(c, ctx, base)}>
                    {one(c.child) ?? str(val(c.label), 80)}
                </button>
            );
        case "TextField": {
            const at = bound(c.value);
            const value = str(val(c.value));
            const variant = str(c.variant, 20);
            const common = { value, placeholder: str(val(c.placeholder), 120), readOnly: !at, onChange: (e: { target: { value: string } }) => at && ctx.setAt(at, variant === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value) };
            return (
                <label className="crt-a2-field" style={style}>
                    <span>{str(val(c.label), 120)}</span>
                    {variant === "longText"
                        ? <textarea className="form-control" rows={3} {...common} />
                        : <input className="form-control" type={variant === "number" ? "number" : variant === "obscured" ? "password" : "text"} {...common} />}
                </label>
            );
        }
        case "CheckBox": {
            const at = bound(c.value);
            return (
                <label className="crt-a2-check" style={style}>
                    <input type="checkbox" checked={val(c.value) === true} disabled={!at} onChange={e => at && ctx.setAt(at, e.target.checked)} />
                    <span>{str(val(c.label), 200)}</span>
                </label>
            );
        }
        case "ChoicePicker": {
            const at = bound(c.value);
            const current = val(c.value);
            const chosen = Array.isArray(current) ? current.map(x => asText(x)) : current !== undefined && current !== "" ? [asText(current)] : [];
            const multi = c.variant === "multipleSelection";
            const options = Array.isArray(c.options) ? c.options.slice(0, 30) as Array<Record<string, unknown>> : [];
            const pick = (v: string, on: boolean): void => { if (at) ctx.setAt(at, multi ? (on ? [...chosen, v] : chosen.filter(x => x !== v)) : [v]); };
            return (
                <fieldset className={`crt-a2-choices${c.displayStyle === "chips" ? " crt-a2-chips" : ""}`} style={style}>
                    {c.label !== undefined && <legend>{str(val(c.label), 120)}</legend>}
                    {options.map((o, i) => {
                        const v = asText(o?.value);
                        return (
                            <label key={i} className={chosen.includes(v) ? "crt-a2-on" : undefined}>
                                <input type={multi ? "checkbox" : "radio"} name={`${ctx.surface.id}-${c.id}-${base}`} checked={chosen.includes(v)} disabled={!at} onChange={e => pick(v, e.target.checked)} />
                                <span>{str(val(o?.label), 120)}</span>
                            </label>
                        );
                    })}
                </fieldset>
            );
        }
        case "Slider": {
            const at = bound(c.value);
            const v = Number(val(c.value) ?? 0);
            const min = typeof c.min === "number" ? c.min : 0;
            const max = typeof c.max === "number" ? c.max : 100;
            const step = typeof c.steps === "number" && c.steps >= 1 ? (max - min) / c.steps : "any";
            return (
                <label className="crt-a2-field" style={style}>
                    <span>{str(val(c.label), 120)} <b>{Number.isFinite(v) ? v : ""}</b></span>
                    <input type="range" min={min} max={max} step={step} value={Number.isFinite(v) ? v : min} disabled={!at} onChange={e => at && ctx.setAt(at, Number(e.target.value))} />
                </label>
            );
        }
        case "DateTimeInput": {
            const at = bound(c.value);
            const type = c.enableDate === true && c.enableTime === true ? "datetime-local" : c.enableTime === true ? "time" : "date";
            return (
                <label className="crt-a2-field" style={style}>
                    <span>{str(val(c.label), 120)}</span>
                    <input className="form-control" type={type} value={str(val(c.value), 40)} readOnly={!at} onChange={e => at && ctx.setAt(at, e.target.value)} />
                </label>
            );
        }
        case "ServiceDeskCard": {
            const card = toCard(val(c.card));
            return card ? <div className="crt-a2-sdcard" style={style}><CardView card={card} /></div> : null;
        }
        default:
            return null;   // a component outside the catalogs this renderer knows: left out, as the spec asks
    }
}

function A2Tabs({ c, base, ctx, depth }: { c: A2uiComponent; base: string; ctx: Ctx; depth: number }): ReactElement {
    const tabs = Array.isArray(c.tabs) ? (c.tabs.slice(0, 8) as Array<Record<string, unknown>>) : [];
    const [on, setOn] = useState(0);
    const tab = tabs[on];
    return (
        <div className="crt-a2-tabs">
            <div className="crt-a2-tablist" role="tablist">
                {tabs.map((t, i) => (
                    <button type="button" role="tab" key={i} aria-selected={i === on} className={i === on ? "crt-a2-on" : undefined} onClick={() => setOn(i)}>{str(resolve(t.title, ctx.data, base), 60)}</button>
                ))}
            </div>
            {tab && typeof tab.child === "string" && <Node id={tab.child} base={base} ctx={ctx} depth={depth + 1} />}
        </div>
    );
}

function A2Modal({ c, base, ctx, depth }: { c: A2uiComponent; base: string; ctx: Ctx; depth: number }): ReactElement {
    const [open, setOpen] = useState(false);
    return (
        <div className="crt-a2-modal">
            <div onClick={() => setOpen(o => !o)}>{typeof c.trigger === "string" && <Node id={c.trigger} base={base} ctx={ctx} depth={depth + 1} />}</div>
            {open && <div className="crt-a2-modal-body">{typeof c.content === "string" && <Node id={c.content} base={base} ctx={ctx} depth={depth + 1} />}</div>}
        </div>
    );
}

function SurfaceView({ surface }: { surface: Surface }): ReactElement {
    const [data, setData] = useState<unknown>(surface.data);
    const ref = useRef<HTMLDivElement>(null);
    const ctx: Ctx = {
        surface, data, root: () => ref.current,
        setAt: (pointer, value) => setData((d: unknown) => setPath(d, pointer, value))
    };
    const rootId = surface.components.has("root") ? "root" : surface.components.keys().next().value;
    return (
        <div ref={ref} className="crt-a2-surface" data-surface={surface.id}>
            {rootId ? <Node id={rootId} base="" ctx={ctx} depth={0} /> : null}
        </div>
    );
}

export function A2uiView({ messages }: { messages: unknown[] }): ReactElement | null {
    const surfaces = useMemo(() => buildSurfaces(messages), [messages]);
    if (!surfaces.length) return null;
    return (
        <div className="crt-a2">
            {surfaces.map(s => <SurfaceView key={s.id} surface={s} />)}
        </div>
    );
}
