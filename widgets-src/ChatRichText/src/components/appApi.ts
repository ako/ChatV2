// Calls to the app's own REST services (chat actions, citations), with the
// user's session: the CSRF token Mendix requires on a session-authenticated call.

function csrfToken(): string | undefined {
    const mx = (window as unknown as { mx?: { session?: { getConfig?: (k: string) => unknown; sessionData?: { csrftoken?: string } } } }).mx;
    const fromConfig = mx?.session?.getConfig?.("csrftoken");
    return typeof fromConfig === "string" ? fromConfig : mx?.session?.sessionData?.csrftoken;
}

function headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (json) h["Content-Type"] = "application/json";
    const token = csrfToken();
    if (token) h["X-Csrf-Token"] = token;
    return h;
}

export async function getJson<T>(url: string): Promise<T> {
    const r = await fetch(url, { headers: headers(false), credentials: "same-origin" });
    if (!r.ok) throw new Error(`The app answered ${r.status}.`);
    return r.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
    const r = await fetch(url, { method: "POST", headers: headers(true), credentials: "same-origin", body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`The app answered ${r.status}.`);
    return r.json() as Promise<T>;
}
