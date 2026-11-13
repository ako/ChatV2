import { ReactElement, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapSpec } from "./segments";
import { lookupPlaces, PlacePoint } from "./places";

// A map card: Leaflet on Esri's Gray Canvas basemap (dark or light to match the
// theme), with its label layer on top. Keyless, with attribution. (CARTO's
// basemaps were the first choice, but they now draw "API KEY REQUIRED" on
// every tile without a key: FINDINGS.md.)
//   route   numbered stops joined by a line, oldest first; the last one pulses
//           as the current position; a stop with tone "warning" (a delay) is amber
//   points  circles sized by value, e.g. days waiting at each hub; the largest
//           (or the card's "highlight") is emphasised
// Places are looked up by name in the app; an unknown name is listed under the
// map instead of drawn. Text from the card goes into tooltips as text nodes,
// never as HTML. The wheel zooms only after a click, so the chat still scrolls.

const ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";

function textEl(lines: Array<string | undefined>, strongFirst = true): HTMLElement {
    const el = document.createElement("div");
    lines.filter((l): l is string => !!l).forEach((l, i) => {
        const line = document.createElement(i === 0 && strongFirst ? "strong" : "div");
        line.textContent = l;
        el.append(line);
    });
    return el;
}

function fmt(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function MapView({ map: spec, height }: { map: MapSpec; height: number }): ReactElement {
    const box = useRef<HTMLDivElement>(null);
    const [missing, setMissing] = useState<string[]>([]);
    const [failed, setFailed] = useState<string | undefined>();

    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const style = getComputedStyle(el);
        const rgb = (style.color.match(/\d+(\.\d+)?/g) || ["27", "36", "48"]).slice(0, 3).map(Number);
        const dark = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 140;
        const accent = style.getPropertyValue("--crt-accent").trim() || "#4FD1C5";
        const warn = "#F5B454";

        const lmap = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, center: [51.9, 5.5], zoom: 6 });
        const shade = dark ? "World_Dark_Gray" : "World_Light_Gray";
        L.tileLayer(`${ESRI}/${shade}_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: ATTRIBUTION }).addTo(lmap);
        L.tileLayer(`${ESRI}/${shade}_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(lmap);
        lmap.on("click", () => lmap.scrollWheelZoom.enable());
        lmap.on("mouseout", () => lmap.scrollWheelZoom.disable());
        // the card may first render in a hidden tab or a narrow panel
        const ro = new ResizeObserver(() => lmap.invalidateSize());
        ro.observe(el);

        let cancelled = false;
        const names = [...spec.route.map(s => s.place), ...spec.points.map(p => p.place)];
        lookupPlaces(names).then(found => {
            if (cancelled) return;
            const at = (name: string): PlacePoint | undefined => found.get(name.toLowerCase());
            const bounds: L.LatLngExpression[] = [];
            setMissing([...new Set(names.filter(n => !at(n)))]);

            const stops = spec.route.map(s => ({ s, p: at(s.place) })).filter((x): x is { s: typeof x.s; p: PlacePoint } => !!x.p);
            if (stops.length > 1) {
                L.polyline(stops.map(x => [x.p.lat, x.p.lon] as L.LatLngTuple), { color: accent, weight: 3, opacity: 0.85, dashArray: "6 6" }).addTo(lmap);
            }
            stops.forEach((x, i) => {
                const last = i === stops.length - 1;
                const tone = x.s.tone === "warning" || x.s.tone === "critical" ? "warn" : "ok";
                const icon = L.divIcon({
                    className: `crt-map-stop crt-map-stop--${tone}${last ? " crt-map-stop--current" : ""}`,
                    html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13]
                });
                L.marker([x.p.lat, x.p.lon], { icon, keyboard: true, title: x.p.name, zIndexOffset: last ? 1000 : 0 })
                    .bindTooltip(textEl([x.p.name, [x.s.date, x.s.text].filter(Boolean).join(" · ") || undefined]), { direction: "top", offset: [0, -12], className: "crt-map-tip" })
                    .addTo(lmap);
                bounds.push([x.p.lat, x.p.lon]);
            });

            const pts = spec.points.map(pt => ({ pt, p: at(pt.place) })).filter((x): x is { pt: typeof x.pt; p: PlacePoint } => !!x.p);
            const max = Math.max(0, ...pts.map(x => x.pt.value ?? 0));
            const top = spec.highlight?.toLowerCase() ?? (max > 0 ? pts.find(x => x.pt.value === max)?.p.name.toLowerCase() : undefined);
            pts.forEach(x => {
                const v = x.pt.value ?? 0;
                const isTop = x.p.name.toLowerCase() === top;
                const radius = 7 + (max > 0 ? Math.sqrt(v / max) * 20 : 0);
                L.circleMarker([x.p.lat, x.p.lon], {
                    radius, color: isTop ? warn : accent, weight: isTop ? 3 : 2, fillColor: isTop ? warn : accent, fillOpacity: isTop ? 0.45 : 0.28
                })
                    .bindTooltip(textEl([x.p.name, x.pt.value !== undefined ? `${fmt(x.pt.value)}${spec.unit ? " " + spec.unit : ""}` : undefined, x.pt.label]),
                        { direction: "top", permanent: pts.length <= 6, offset: [0, -radius], className: "crt-map-tip" })
                    .addTo(lmap);
                bounds.push([x.p.lat, x.p.lon]);
            });

            if (bounds.length === 1) lmap.setView(bounds[0], 9);
            // room above for the labels that sit on top of the hub circles
            else if (bounds.length > 1) lmap.fitBounds(L.latLngBounds(bounds), { paddingTopLeft: [40, pts.length ? 78 : 40], paddingBottomRight: [40, 30], maxZoom: 10 });
        }).catch((e: Error) => { if (!cancelled) setFailed(e.message); });

        return () => { cancelled = true; ro.disconnect(); lmap.remove(); };
    // the card's content does not change once rendered
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="crt-map-wrap">
            <div ref={box} className="crt-map" style={{ height }} role="region" aria-label="Map" />
            {failed && <p className="crt-map-note">The map could not be loaded: {failed}</p>}
            {!failed && missing.length > 0 && <p className="crt-map-note">Not on the map: {missing.join(", ")}</p>}
        </div>
    );
}
