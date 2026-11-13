import { ReactElement, ReactNode, useState } from "react";
import { loadNode, NodeDetails } from "./refs";

const MAX_DEPTH = 3;

type State = { status: "closed" } | { status: "loading" } | { status: "open"; node: NodeDetails } | { status: "error"; message: string };

/** Text that opens the details of a product graph node below it. Details can be opened again from inside, up to MAX_DEPTH levels. */
export function RefLink({ refId, children, depth = 1 }: { refId: string; children: ReactNode; depth?: number }): ReactElement {
    const [state, setState] = useState<State>({ status: "closed" });
    const toggle = (): void => {
        if (state.status === "open" || state.status === "loading") { setState({ status: "closed" }); return; }
        setState({ status: "loading" });
        loadNode(refId).then(
            node => setState({ status: "open", node }),
            (e: Error) => setState({ status: "error", message: e.message })
        );
    };
    const open = state.status !== "closed";
    return (
        <span className="crt-ref-wrap">
            <button type="button" className={`crt-ref${open ? " crt-ref-open" : ""}`} aria-expanded={open} onClick={toggle} title={`Details of ${refId}`}>
                {children}
            </button>
            {state.status === "loading" && <span className="crt-ref-panel crt-ref-loading" role="status">Loading {refId}…</span>}
            {state.status === "error" && <span className="crt-ref-panel crt-ref-error" role="status">{state.message}</span>}
            {state.status === "open" && (
                <span className="crt-ref-panel" role="region" aria-label={`Details of ${state.node.label}`}>
                    <span className="crt-ref-head">
                        {state.node.kind && <span className="crt-eyebrow">{state.node.kind}</span>}
                        <span className="crt-ref-title">{state.node.label}</span>
                    </span>
                    {state.node.facts.length === 0 ? (
                        <span className="crt-ref-empty">No further details.</span>
                    ) : (
                        <span className="crt-ref-facts">
                            {state.node.facts.map((f, i) => (
                                <span className="crt-ref-fact" key={i}>
                                    {f.ref && depth < MAX_DEPTH ? <RefLink refId={f.ref} depth={depth + 1}>{f.label}</RefLink> : f.label}
                                </span>
                            ))}
                        </span>
                    )}
                </span>
            )}
        </span>
    );
}

/** The text as a RefLink when it has a reference, plain text otherwise. */
export function MaybeRef({ refId, children }: { refId?: string; children: ReactNode }): ReactElement {
    return refId ? <RefLink refId={refId}>{children}</RefLink> : <>{children}</>;
}
