import { ReactElement } from "react";
import { Card } from "./segments";
import { ChartView } from "./ChartView";
import { OutlineView } from "./OutlineView";
import { MaybeRef } from "./RefLink";
import { GraphView } from "../shared/graph/GraphView";
import { MapView } from "./MapView";
import { ModelView } from "../shared/model/ModelView";

const TYPE_LABEL: Record<string, string> = {
    order: "Order", parcel: "Parcel", product: "Product", part: "Part", recall: "Recall",
    issue: "Known issue", ticket: "Ticket", refund: "Refund", policy: "Policy", info: "Info",
    chart: "Chart", outline: "Outline", supplier: "Supplier", delivery: "Delivery", graph: "Connections", map: "Map", model: "3D view"
};

function label(type: string): string {
    return TYPE_LABEL[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export function CardView({ card }: { card: Card }): ReactElement {
    return (
        <article className={`crt-card crt-tone-${card.tone} crt-type-${card.type}`} aria-label={`${label(card.type)} ${card.title}`}>
            <header className="crt-card-head">
                <div className="crt-card-heading">
                    <span className="crt-eyebrow">{label(card.type)}</span>
                    {card.title && <span className="crt-title">{card.title}</span>}
                    {card.subtitle && <span className="crt-subtitle">{card.subtitle}</span>}
                </div>
                {card.status && <span className="crt-status">{card.status}</span>}
            </header>
            {card.fields.length > 0 && (
                <dl className="crt-fields">
                    {card.fields.map((f, i) => (
                        <div className="crt-field" key={i}>
                            <dt>{f.label}</dt>
                            <dd><MaybeRef refId={f.ref}>{f.value}</MaybeRef></dd>
                        </div>
                    ))}
                </dl>
            )}
            {card.items.length > 0 && (
                <ul className="crt-items">
                    {card.items.map((it, i) => (
                        <li key={i}>
                            <span className="crt-item-title"><MaybeRef refId={it.ref}>{it.title}</MaybeRef></span>
                            {it.text && <span className="crt-item-text">{it.text}</span>}
                            {it.value && <span className="crt-item-value">{it.value}</span>}
                        </li>
                    ))}
                </ul>
            )}
            {card.chart && <ChartView chart={card.chart} />}
            {card.outline.length > 0 && <OutlineView nodes={card.outline} />}
            {card.graph && (
                <div className="crt-graph">
                    <GraphView startRef={card.graph.ref} height={300} compact />
                    <div className="crt-graph-foot">
                        <span>Click a node to show what it connects to.</span>
                        <a href={`p/product-explorer?ref=${encodeURIComponent(card.graph.ref)}`}>Open in the product explorer</a>
                    </div>
                </div>
            )}
            {card.model && (
                <ModelView productRef={card.model.ref} highlight={card.model.highlight} height={320}
                    tone={card.tone === "critical" ? "critical" : card.tone === "warning" ? "warning" : "accent"} />
            )}
            {card.map && <MapView map={card.map} height={card.type === "map" ? 300 : 220} />}
            {card.timeline.length > 0 && (
                <ol className="crt-timeline">
                    {card.timeline.map((ev, i) => (
                        <li key={i} className={i === card.timeline.length - 1 ? "crt-latest" : undefined}>
                            {ev.date && <time>{ev.date}</time>}
                            <span>{ev.text}</span>
                        </li>
                    ))}
                </ol>
            )}
            {card.note && <p className="crt-note">{card.note}</p>}
        </article>
    );
}
