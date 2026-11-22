// A2UI (Agent-to-User Interface) in a chat message: the data side.
//
// An answer can hold a block of A2UI messages:
//
//   ```a2ui
//   {"version":"1.0","createSurface":{"surfaceId":"fit","catalogId":"https://a2ui.org/specification/v1_0/basic_catalog.json"}}
//   {"version":"1.0","updateComponents":{"surfaceId":"fit","components":[{"id":"root","component":"Column","children":["t"]},{"id":"t","component":"Text","text":"Hello"}]}}
//   ```
//
// one JSON message per line (JSONL), or one JSON array of messages. The four
// server-to-client messages of A2UI 1.0 are applied in order: createSurface,
// updateComponents, updateDataModel, deleteSurface. The 0.9.1 spellings are
// read too ({"path": …} for {"@path": …}, {"call": …} for {"@call": …}).
//
// Like the cards, it is data, never markup: only the catalog's components are
// drawn, every value is shown as text, and nothing in it can run code.

export interface A2uiComponent { id: string; component: string; [prop: string]: unknown }
export interface Surface { id: string; catalogId?: string; components: Map<string, A2uiComponent>; data: unknown }

const MAX_MESSAGES = 200;
const MAX_SURFACES = 5;
const MAX_COMPONENTS = 300;

/** The messages of an a2ui block: a JSON array, one JSON object, or one object per line. Undefined when nothing parses. */
export function parseA2ui(text: string): unknown[] | undefined {
    const body = text.trim();
    if (!body) return undefined;
    try {
        const whole: unknown = JSON.parse(body);
        const list = Array.isArray(whole) ? whole : [whole];
        return list.length ? list.slice(0, MAX_MESSAGES) : undefined;
    } catch { /* not one JSON value: try JSONL */ }
    const out: unknown[] = [];
    for (const line of body.split("\n")) {
        const l = line.trim();
        if (!l) continue;
        try { out.push(JSON.parse(l)); } catch { return undefined; }
        if (out.length >= MAX_MESSAGES) break;
    }
    return out.length ? out : undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function idOf(v: unknown): string | undefined {
    return typeof v === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : undefined;
}

function addComponents(s: Surface, list: unknown): void {
    if (!Array.isArray(list)) return;
    for (const c of list) {
        const o = obj(c);
        const id = idOf(o?.id);
        const type = typeof o?.component === "string" ? (o.component as string) : undefined;
        if (!o || !id || !type) continue;
        if (!s.components.has(id) && s.components.size >= MAX_COMPONENTS) continue;
        s.components.set(id, { ...o, id, component: type });
    }
}

/** Applies the messages in order and returns the surfaces that remain, in the order they were created. */
export function buildSurfaces(messages: unknown[]): Surface[] {
    const surfaces = new Map<string, Surface>();
    const surface = (id: string): Surface | undefined => {
        let s = surfaces.get(id);
        if (!s && surfaces.size < MAX_SURFACES) {
            // An update for a surface that was never created still draws: lenient, like the reference renderers' buffering.
            s = { id, components: new Map(), data: {} };
            surfaces.set(id, s);
        }
        return s;
    };
    for (const m of messages) {
        const msg = obj(m);
        if (!msg) continue;
        const create = obj(msg.createSurface) ?? obj(msg.beginRendering);
        const update = obj(msg.updateComponents) ?? obj(msg.surfaceUpdate);
        const data = obj(msg.updateDataModel);
        const del = obj(msg.deleteSurface);
        if (create) {
            const id = idOf(create.surfaceId);
            if (!id) continue;
            const s = surface(id);
            if (!s) continue;
            if (typeof create.catalogId === "string") s.catalogId = create.catalogId;
            if (create.dataModel !== undefined) s.data = create.dataModel;
            addComponents(s, create.components);
        } else if (update) {
            const id = idOf(update.surfaceId);
            const s = id ? surface(id) : undefined;
            if (s) addComponents(s, update.components);
        } else if (data) {
            const id = idOf(data.surfaceId);
            const s = id ? surface(id) : undefined;
            if (!s) continue;
            const path = typeof data.path === "string" ? data.path : "/";
            s.data = setPath(s.data, path, data.value === null ? undefined : data.value);
        } else if (del) {
            const id = idOf(del.surfaceId);
            if (id) surfaces.delete(id);
        }
    }
    return [...surfaces.values()];
}

function segments(pointer: string): string[] {
    if (pointer === "" || pointer === "/") return [];
    return pointer.replace(/^\//, "").split("/").map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** The value at a JSON pointer, or undefined. */
export function getPath(data: unknown, pointer: string): unknown {
    let cur: unknown = data;
    for (const key of segments(pointer)) {
        if (Array.isArray(cur)) cur = cur[Number(key)];
        else if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[key];
        else return undefined;
    }
    return cur;
}

/** A copy of data with the value at pointer set; undefined removes it. Missing objects on the way are created. */
export function setPath(data: unknown, pointer: string, value: unknown): unknown {
    const keys = segments(pointer);
    if (!keys.length) return value === undefined ? {} : value;
    const [key, ...rest] = keys;
    const restPointer = rest.length ? "/" + rest.join("/") : "";
    if (Array.isArray(data) && /^\d+$/.test(key)) {
        const copy = data.slice();
        const i = Number(key);
        if (!rest.length && value === undefined) copy.splice(i, 1);
        else copy[i] = rest.length ? setPath(copy[i], restPointer, value) : value;
        return copy;
    }
    const base = data && typeof data === "object" && !Array.isArray(data) ? { ...(data as Record<string, unknown>) } : {};
    if (!rest.length && value === undefined) { delete base[key]; return base; }
    base[key] = rest.length ? setPath(base[key], restPointer, value) : value;
    return base;
}

/** A binding's absolute pointer: "/x" is absolute, "x" is relative to the current template item at base. */
export function absolute(path: string, base: string): string {
    if (path.startsWith("/")) return path;
    return (base.endsWith("/") ? base : base + "/") + path;
}

/** The pointer a value is bound to ({"@path": …} or {"path": …}), or undefined for a literal. */
export function bindingPath(v: unknown): string | undefined {
    const o = obj(v);
    if (!o) return undefined;
    const p = o["@path"] ?? o.path;
    return typeof p === "string" && Object.keys(o).length === 1 ? p : undefined;
}

/** Text for any value: numbers and booleans as usual, null and undefined as "", objects as JSON. */
export function asText(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try { return JSON.stringify(v); } catch { return ""; }
}

/** Resolves a dynamic value: a literal, a data binding, or one of the few functions this renderer evaluates (formatString). */
export function resolve(v: unknown, data: unknown, base: string): unknown {
    const p = bindingPath(v);
    if (p !== undefined) return getPath(data, absolute(p, base));
    const o = obj(v);
    if (o) {
        const call = o["@call"] ?? o.call;
        if (typeof call === "string") {
            const args = obj(o.args) ?? {};
            if (call === "formatString") {
                const tpl = typeof args.value === "string" ? args.value : typeof args.template === "string" ? args.template : typeof args.text === "string" ? args.text : "";
                return tpl.replace(/\$\{([^}]+)\}/g, (_m, ptr: string) => asText(getPath(data, absolute(ptr.trim(), base))));
            }
            return undefined;   // other functions are not evaluated here
        }
    }
    return v;
}

/** The children of a container: a list of ids, or a template {path, componentId} repeated per item at path. */
export function childEntries(children: unknown, data: unknown, base: string): Array<{ id: string; base: string }> {
    if (Array.isArray(children)) return children.map(idOf).filter((id): id is string => !!id).map(id => ({ id, base }));
    const t = obj(children);
    if (!t) return [];
    const path = typeof t["@path"] === "string" ? (t["@path"] as string) : typeof t.path === "string" ? (t.path as string) : undefined;
    const componentId = idOf(t.componentId);
    if (!path || !componentId) return [];
    const at = absolute(path, base);
    const items = getPath(data, at);
    if (!Array.isArray(items)) return [];
    return items.slice(0, 100).map((_x, i) => ({ id: componentId, base: `${at}/${i}` }));
}
