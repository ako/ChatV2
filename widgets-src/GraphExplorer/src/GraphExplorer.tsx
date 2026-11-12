import { ReactElement, useEffect, useRef, useState } from "react";
import { GraphExplorerContainerProps } from "../typings/GraphExplorerProps";
import { GraphApi, GraphView } from "./shared/graph/GraphView";
import { kindColor, NodeDetails, NodeFact, searchNodes } from "./shared/graph/api";
import { ModelView } from "./shared/model/ModelView";
import "./ui/GraphExplorer.css";

// The Product explorer: search a starting point, click nodes to expand them,
// switch relation types off, and read a node's details on the side. Data comes
// from the app's reference API with the user's own session, so a customer
// never sees other customers' orders here either.
//
// "3D" shows the last bike selected in the graph as a 3D model (shared/model):
// selecting a part in the graph highlights it on the bike, and clicking a part
// on the bike selects it in the graph.

function startFromUrl(): string | undefined {
    const ref = new URLSearchParams(window.location.search).get("ref") ?? "";
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(ref) ? ref : undefined;
}

export function GraphExplorer(props: GraphExplorerContainerProps): ReactElement {
    const api = useRef<GraphApi | null>(null);
    const [relations, setRelations] = useState<string[]>([]);
    const [kinds, setKinds] = useState<string[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [selected, setSelected] = useState<NodeDetails | null>(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<NodeFact[]>([]);
    const start = startFromUrl() ?? (props.startRef || "EB-200");
    const [view, setView] = useState<"graph" | "3d">("graph");
    const [bike, setBike] = useState<string>(start);
    const isBike = (n: NodeDetails | null): boolean => !!n && /bike/i.test(n.kind);
    useEffect(() => { if (selected && isBike(selected)) setBike(selected.ref); }, [selected]);
    const highlight = selected && !isBike(selected) && selected.ref ? [selected.ref] : [];

    useEffect(() => {
        if (query.trim().length < 2) { setResults([]); return; }
        const t = setTimeout(() => { searchNodes(query.trim()).then(setResults).catch(() => setResults([])); }, 250);
        return () => clearTimeout(t);
    }, [query]);

    const pick = (f: NodeFact): void => {
        if (!f.ref) return;
        api.current?.focus(f.ref, f.target || f.label, f.kind);
        setQuery(""); setResults([]);
    };
    const toggle = (rel: string): void => setHidden(h => (h.includes(rel) ? h.filter(x => x !== rel) : [...h, rel]));
    const values = selected?.facts.filter(f => f.dir === "value") ?? [];
    const links = selected?.facts.filter(f => f.ref && f.dir !== "value") ?? [];

    return (
        <div className={`gx-root ${props.class ?? ""}`}>
            <div className="gx-toolbar">
                <div className="gx-search">
                    <input type="search" placeholder="Search a product, part, supplier, issue or order" value={query}
                        onChange={e => setQuery(e.target.value)} aria-label="Search the product graph" />
                    {results.length > 0 && (
                        <ul className="gx-results" role="listbox">
                            {results.map(r => (
                                <li key={r.ref}>
                                    <button type="button" onClick={() => pick(r)}>
                                        <span className="gx-dot" style={{ background: kindColor(r.kind) }} />
                                        <span className="gx-result-label">{r.label}</span>
                                        <span className="gx-result-kind">{r.kind}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="gx-views" role="group" aria-label="View">
                    <button type="button" className={`gx-view${view === "graph" ? " gx-view-on" : ""}`} aria-pressed={view === "graph"} onClick={() => setView("graph")}>Graph</button>
                    <button type="button" className={`gx-view${view === "3d" ? " gx-view-on" : ""}`} aria-pressed={view === "3d"} onClick={() => setView("3d")}>3D</button>
                </div>
                <button type="button" className="btn mx-button" onClick={() => api.current?.fit()}>Fit</button>
                <button type="button" className="btn mx-button" onClick={() => { api.current?.clear(); setSelected(null); }}>Clear</button>
            </div>
            {relations.length > 0 && (
                <div className="gx-filters" aria-label="Relations">
                    {relations.map(r => (
                        <button type="button" key={r} className={`gx-chip${hidden.includes(r) ? " gx-chip-off" : ""}`} aria-pressed={!hidden.includes(r)} onClick={() => toggle(r)}>{r}</button>
                    ))}
                </div>
            )}
            <div className="gx-body">
                <div className="gx-main">
                    <div style={{ display: view === "graph" ? "block" : "none" }}>
                        <GraphView startRef={start} height={props.height ?? 620} hiddenRelations={hidden}
                            apiRef={a => { api.current = a; }} onSelect={setSelected}
                            onChange={(rel, k) => { setRelations(rel); setKinds(k); }} />
                    </div>
                    {view === "3d" && (
                        <ModelView key={bike} productRef={bike} highlight={highlight} height={(props.height ?? 620) - 110}
                            onSelectPart={ref => api.current?.focus(ref)} />
                    )}
                </div>
                <aside className="gx-panel">
                    {selected ? (
                        <>
                            <span className="gx-kind" style={{ background: kindColor(selected.kind) }}>{selected.kind}</span>
                            <h4 className="gx-title">{selected.label}</h4>
                            {values.length > 0 && (
                                <dl className="gx-values">
                                    {values.map((v, i) => {
                                        const [k, ...rest] = v.label.split(": ");
                                        return <div key={i}><dt>{k}</dt><dd>{rest.join(": ")}</dd></div>;
                                    })}
                                </dl>
                            )}
                            {links.length > 0 && (
                                <ul className="gx-links">
                                    {links.map((l, i) => (
                                        <li key={i}>
                                            <span className="gx-rel">{l.dir === "in" ? "← " : "→ "}{l.relation}</span>
                                            <button type="button" onClick={() => l.ref && api.current?.focus(l.ref, l.target, l.kind)}>
                                                <span className="gx-dot" style={{ background: kindColor(l.kind) }} />{l.target || l.ref}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        <p className="gx-hint">Click a node to expand it and see its details. Dashed nodes are not expanded yet.</p>
                    )}
                    {kinds.length > 0 && (
                        <ul className="gx-legend">
                            {kinds.map(k => <li key={k}><span className="gx-dot" style={{ background: kindColor(k) }} />{k}</li>)}
                        </ul>
                    )}
                </aside>
            </div>
        </div>
    );
}
