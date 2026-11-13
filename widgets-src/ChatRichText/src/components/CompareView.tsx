import { ReactElement, useEffect, useState } from "react";
import { loadNode, NodeDetails } from "../shared/graph/api";
import { ModelView } from "../shared/model/ModelView";
import { MaybeRef } from "./RefLink";

// A comparison card: two or three products side by side, from the product
// graph (their values and their components). Rows where they differ are
// marked. A bike can be opened in 3D under the table.

interface Row { label: string; values: string[]; refs: (string | undefined)[]; differs: boolean }

const name = (ref: string, label: string): string => label.replace(new RegExp(`^${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*·\\s*`), "");

function rowsOf(nodes: NodeDetails[]): Row[] {
    const rows = new Map<string, Row>();
    const put = (key: string, i: number, value: string, ref?: string): void => {
        const r = rows.get(key) ?? { label: key, values: nodes.map(() => ""), refs: nodes.map(() => undefined), differs: false };
        r.values[i] = r.values[i] ? `${r.values[i]}, ${value}` : value;
        if (ref) r.refs[i] = ref;
        rows.set(key, r);
    };
    nodes.forEach((n, i) => {
        for (const f of n.facts) {
            if (f.dir === "value") {
                const [k, ...v] = f.label.split(": ");
                put(k, i, v.join(": "));
            } else if (f.dir === "out" && f.relation && f.relation !== "in order") {
                const target = f.ref ? name(f.ref, f.target || f.ref) : f.target || "";
                put(f.relation, i, target, f.ref);
            }
        }
    });
    const out = [...rows.values()];
    out.forEach(r => { r.differs = new Set(r.values.map(v => v.toLowerCase())).size > 1; });
    return out;
}

export function CompareView({ refs }: { refs: string[] }): ReactElement {
    const [nodes, setNodes] = useState<NodeDetails[] | null>(null);
    const [error, setError] = useState<string | undefined>();
    const [model, setModel] = useState<string | undefined>();
    useEffect(() => {
        let cancelled = false;
        Promise.all(refs.map(r => loadNode(r)))
            .then(ns => { if (!cancelled) setNodes(ns); })
            .catch((e: Error) => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [refs.join("|")]);
    if (error) return <p className="crt-note">The comparison could not be loaded: {error}</p>;
    if (!nodes) return <p className="crt-compare-loading">Loading the comparison…</p>;
    const rows = rowsOf(nodes);
    const bikes = nodes.filter(n => /bike/i.test(n.kind));
    return (
        <div className="crt-compare">
            <div className="crt-compare-scroll">
                <table>
                    <thead>
                        <tr>
                            <th scope="col"><span className="crt-sr">Property</span></th>
                            {nodes.map(n => <th scope="col" key={n.ref}><MaybeRef refId={n.ref}>{n.ref}</MaybeRef><span>{name(n.ref, n.label)}</span></th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.label} className={r.differs ? "crt-differs" : undefined}>
                                <th scope="row">{r.label}</th>
                                {r.values.map((v, i) => <td key={i}>{r.refs[i] ? <MaybeRef refId={r.refs[i]}>{v}</MaybeRef> : v || "–"}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="crt-compare-foot">
                <span className="crt-differs-key" aria-hidden="true" /> differs
                {bikes.map(b => (
                    <button type="button" key={b.ref} className="crt-compare-3d" aria-pressed={model === b.ref} onClick={() => setModel(m => (m === b.ref ? undefined : b.ref))}>
                        {model === b.ref ? "Hide" : "View"} {b.ref} in 3D
                    </button>
                ))}
            </p>
            {model && <ModelView key={model} productRef={model} height={280} />}
        </div>
    );
}
