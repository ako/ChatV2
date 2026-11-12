import { ReactElement } from "react";
import { OutlineNode } from "./segments";
import { MaybeRef } from "./RefLink";

function Node({ node, depth }: { node: OutlineNode; depth: number }): ReactElement {
    const label = (
        <span className="crt-outline-label">
            <MaybeRef refId={node.ref}>{node.label}</MaybeRef>
            {node.value && <span className="crt-outline-value">{node.value}</span>}
        </span>
    );
    if (!node.children.length) return <li className="crt-outline-leaf">{label}</li>;
    return (
        <li>
            <details open={depth === 1}>
                <summary>{label} <span className="crt-outline-count">{node.children.length}</span></summary>
                <ul>{node.children.map((c, i) => <Node key={i} node={c} depth={depth + 1} />)}</ul>
            </details>
        </li>
    );
}

/** A collapsible tree; the first level starts open. */
export function OutlineView({ nodes }: { nodes: OutlineNode[] }): ReactElement {
    return <ul className="crt-outline">{nodes.map((n, i) => <Node key={i} node={n} depth={1} />)}</ul>;
}
