// Loads the details of a product graph node from the app's REST endpoint
// (published REST service ServiceDesk.ProductGraphApi, mdlsource/17-...).
// The endpoint authenticates with the user's own session, so it needs the
// session's CSRF token; it decides itself what this user may see.

export interface NodeFact { label: string; ref?: string }
export interface NodeDetails { ref: string; label: string; kind: string; facts: NodeFact[] }

const cache = new Map<string, Promise<NodeDetails>>();

function csrfToken(): string | undefined {
    const mx = (window as unknown as { mx?: { session?: { getConfig?: (k: string) => unknown; sessionData?: { csrftoken?: string } } } }).mx;
    const fromConfig = mx?.session?.getConfig?.("csrftoken");
    return typeof fromConfig === "string" ? fromConfig : mx?.session?.sessionData?.csrftoken;
}

export function loadNode(ref: string): Promise<NodeDetails> {
    let pending = cache.get(ref);
    if (!pending) {
        const headers: Record<string, string> = { Accept: "application/json" };
        const token = csrfToken();
        if (token) headers["X-Csrf-Token"] = token;
        pending = fetch(`rest/productgraph/v1/nodes/${encodeURIComponent(ref)}`, { headers, credentials: "same-origin" })
            .then(r => {
                if (r.status === 404) throw new Error("Not found in the product graph.");
                if (!r.ok) throw new Error(`The product graph answered ${r.status}.`);
                return r.json() as Promise<NodeDetails>;
            })
            .then(d => ({ ref: d.ref ?? ref, label: d.label ?? ref, kind: d.kind ?? "", facts: Array.isArray(d.facts) ? d.facts : [] }));
        pending.catch(() => cache.delete(ref)); // retry on the next click
        cache.set(ref, pending);
    }
    return pending;
}
