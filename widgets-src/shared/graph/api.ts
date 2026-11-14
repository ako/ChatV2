// The product graph, as the app's reference API serves it
// (published REST service ServiceDesk.ProductGraphApi, mdlsource/17-graph-node-api.mdl):
//   GET rest/productgraph/v1/nodes/{ref}  one node and its facts
//   GET rest/productgraph/v1/nodes?q=text search; the matches are the facts
//   GET rest/productgraph/v1/models/{ref} a bike's 3D model data (its BOM, mount slots and part shapes)
// The API authenticates with the user's own session (CSRF token) and decides
// itself what this user may see. Shared by ChatRichText and GraphExplorer.

export interface NodeFact {
    label: string;
    ref?: string;
    relation?: string;
    dir?: "out" | "in" | "value" | string;
    kind?: string;
    target?: string;
}
export interface NodeDetails { ref: string; label: string; kind: string; facts: NodeFact[] }

const cache = new Map<string, Promise<NodeDetails>>();

function csrfToken(): string | undefined {
    const mx = (window as unknown as { mx?: { session?: { getConfig?: (k: string) => unknown; sessionData?: { csrftoken?: string } } } }).mx;
    const fromConfig = mx?.session?.getConfig?.("csrftoken");
    return typeof fromConfig === "string" ? fromConfig : mx?.session?.sessionData?.csrftoken;
}

function get(url: string): Promise<NodeDetails> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = csrfToken();
    if (token) headers["X-Csrf-Token"] = token;
    return fetch(url, { headers, credentials: "same-origin" })
        .then(r => {
            if (r.status === 404) throw new Error("Not found in the product graph.");
            if (!r.ok) throw new Error(`The product graph answered ${r.status}.`);
            return r.json() as Promise<NodeDetails>;
        })
        .then(d => ({
            ref: d.ref ?? "",
            label: d.label ?? "",
            kind: d.kind ?? "",
            facts: Array.isArray(d.facts) ? d.facts.map(f => ({ ...f, ref: f.ref || undefined })) : []
        }));
}

export function loadNode(ref: string): Promise<NodeDetails> {
    let pending = cache.get(ref);
    if (!pending) {
        pending = get(`rest/productgraph/v1/nodes/${encodeURIComponent(ref)}`);
        pending.catch(() => cache.delete(ref)); // retry on the next request
        cache.set(ref, pending);
    }
    return pending;
}

const models = new Map<string, Promise<unknown | null>>();

/** A bike's 3D model data (mdlsource/26-bike-bom.mdl), or null when the product is not a bike with mount points. */
export function loadModel<T>(ref: string, version = ""): Promise<T | null> {
    const key = `${ref}|${version}`;
    let pending = models.get(key);
    if (!pending) {
        const headers: Record<string, string> = { Accept: "application/json" };
        const token = csrfToken();
        if (token) headers["X-Csrf-Token"] = token;
        pending = fetch(`rest/productgraph/v1/models/${encodeURIComponent(ref)}`, { headers, credentials: "same-origin" }).then(r => {
            if (r.status === 404) return null;
            if (!r.ok) throw new Error(`The 3D model service answered ${r.status}.`);
            return r.json();
        });
        pending.catch(() => models.delete(key));
        models.set(key, pending);
    }
    return pending as Promise<T | null>;
}

export function searchNodes(text: string): Promise<NodeFact[]> {
    return get(`rest/productgraph/v1/nodes?q=${encodeURIComponent(text)}`).then(d => d.facts);
}

/** The colour of a node kind (class label from the graph). */
export function kindColor(kind: string | undefined): string {
    switch ((kind ?? "").toLowerCase()) {
        case "bike": case "e-bike": return "#1f7a72";
        case "part": return "#4f6bd8";
        case "accessory": return "#9b5bb5";
        case "supplier": return "#c27c0e";
        case "known issue": return "#d4682a";
        case "recall": return "#c62828";
        case "order": return "#3d8b5a";
        default: return "#8a94a3";
    }
}
