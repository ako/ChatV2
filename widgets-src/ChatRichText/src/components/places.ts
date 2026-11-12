// Coordinates for the map cards, from the app's places API
// (published REST service ServiceDesk.PlacesApi, mdlsource/22-places-map.mdl):
//   GET rest/places/v1/places?names=Leipzig,Venlo  ->  {"places": [{"name", "lat", "lon"}]}
// Only places the app knows come back; the card's own text never supplies a
// coordinate. Authenticated with the user's session (CSRF token), like the
// product graph API.

export interface PlacePoint { name: string; lat: number; lon: number }

const known = new Map<string, PlacePoint | null>();

function csrfToken(): string | undefined {
    const mx = (window as unknown as { mx?: { session?: { getConfig?: (k: string) => unknown; sessionData?: { csrftoken?: string } } } }).mx;
    const fromConfig = mx?.session?.getConfig?.("csrftoken");
    return typeof fromConfig === "string" ? fromConfig : mx?.session?.sessionData?.csrftoken;
}

/** The coordinates of the given place names, by lower-case name. Unknown names map to nothing. */
export async function lookupPlaces(names: string[]): Promise<Map<string, PlacePoint>> {
    const wanted = [...new Set(names.map(n => n.toLowerCase()))];
    const missing = wanted.filter(n => !known.has(n));
    if (missing.length) {
        const headers: Record<string, string> = { Accept: "application/json" };
        const token = csrfToken();
        if (token) headers["X-Csrf-Token"] = token;
        const r = await fetch(`rest/places/v1/places?names=${encodeURIComponent(missing.join(","))}`, { headers, credentials: "same-origin" });
        if (!r.ok) throw new Error(`The places service answered ${r.status}.`);
        const body = (await r.json()) as { places?: Array<{ name?: string; lat?: number | string; lon?: number | string }> };
        for (const p of body.places ?? []) {
            const lat = Number(p.lat), lon = Number(p.lon);
            if (p.name && Number.isFinite(lat) && Number.isFinite(lon)) known.set(p.name.toLowerCase(), { name: p.name, lat, lon });
        }
        for (const n of missing) if (!known.has(n)) known.set(n, null);
    }
    const out = new Map<string, PlacePoint>();
    for (const n of wanted) {
        const p = known.get(n);
        if (p) out.set(n, p);
    }
    return out;
}
