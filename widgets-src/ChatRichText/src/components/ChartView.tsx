import { ReactElement } from "react";
import { Chart } from "./segments";
import { MaybeRef } from "./RefLink";

const PALETTE = 6; // crt-series-0..5 in the stylesheet

function fmt(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 1 : 0);
}

/** Bars scaled to the largest value, or one bar split into shares of the total. Values are drawn as given; the widget does no other maths. */
export function ChartView({ chart }: { chart: Chart }): ReactElement {
    const unit = chart.unit ? ` ${chart.unit}` : "";
    if (chart.kind === "stacked") {
        const total = chart.points.reduce((s, p) => s + p.value, 0) || 1;
        return (
            <figure className="crt-chart crt-chart-stacked">
                <div className="crt-stack" role="img" aria-label={chart.points.map(p => `${p.label} ${fmt(p.value)}${unit}`).join(", ")}>
                    {chart.points.map((p, i) => (
                        <span key={i} className={`crt-stack-seg crt-series-${i % PALETTE}`} style={{ width: `${(p.value / total) * 100}%` }} />
                    ))}
                </div>
                <ul className="crt-legend">
                    {chart.points.map((p, i) => (
                        <li key={i} className={p.label === chart.highlight ? "crt-highlight" : undefined}>
                            <span className={`crt-swatch crt-series-${i % PALETTE}`} aria-hidden="true" />
                            <span className="crt-legend-label"><MaybeRef refId={p.ref}>{p.label}</MaybeRef></span>
                            <span className="crt-legend-value">{fmt(p.value)}{unit} · {Math.round(p.share ?? (p.value / total) * 100)}%</span>
                        </li>
                    ))}
                </ul>
            </figure>
        );
    }
    const max = Math.max(...chart.points.map(p => p.value)) || 1;
    return (
        <figure className="crt-chart crt-chart-bars">
            {chart.points.map((p, i) => (
                <div key={i} className={`crt-bar-row${p.label === chart.highlight ? " crt-highlight" : ""}`}>
                    <span className="crt-bar-label"><MaybeRef refId={p.ref}>{p.label}</MaybeRef></span>
                    <span className="crt-bar-track" aria-hidden="true">
                        <span className="crt-bar" style={{ width: `${Math.max((p.value / max) * 100, 1.5)}%` }} />
                    </span>
                    <span className="crt-bar-value">{fmt(p.value)}{unit}</span>
                </div>
            ))}
        </figure>
    );
}
