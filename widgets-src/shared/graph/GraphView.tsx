import { CSSProperties, ReactElement, useEffect, useRef } from "react";
import cytoscape, { Core, ElementDefinition, NodeSingular } from "cytoscape";
import { kindColor, loadNode, NodeDetails } from "./api";

// An expandable network of the product graph. Nodes are graph resources
// (products, parts, suppliers, issues, orders); edges are their links. A node
// shows its neighbours when it is expanded (clicked); literal facts such as a
// price stay out of the picture and go to onSelect. Shared by the chat's graph
// card and the Product explorer page.

export interface GraphApi {
    focus(ref: string, label?: string, kind?: string): void;
    fit(): void;
    clear(): void;
}

export interface GraphViewProps {
    startRef?: string;
    height: number;
    compact?: boolean;
    hiddenRelations?: string[];
    onSelect?: (node: NodeDetails) => void;
    onChange?: (relations: string[], kinds: string[]) => void;
    apiRef?: (api: GraphApi) => void;
    style?: CSSProperties;
}

function shortName(label: string, ref: string): string {
    const name = label.includes(" · ") ? label.split(" · ").slice(1).join(" · ") : label;
    const clean = name === ref ? "" : name;
    return clean.length > 22 ? clean.slice(0, 21) + "…" : clean;
}

export function GraphView(props: GraphViewProps): ReactElement {
    const box = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const expanded = useRef(new Set<string>());
    const running = useRef<cytoscape.Layouts | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;

    useEffect(() => {
        if (!box.current) return;
        const ink = getComputedStyle(box.current).color || "#1b2430";
        // On a dark theme the text is light: give labels and node rims a dark
        // backing instead of white boxes.
        const rgb = (ink.match(/\d+(\.\d+)?/g) || ["27", "36", "48"]).slice(0, 3).map(Number);
        const darkTheme = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 140;
        const backing = darkTheme ? "#0b1020" : "#ffffff";
        const selectedRim = darkTheme ? "#e8ecf6" : "#111111";
        const cy = cytoscape({
            container: box.current,
            wheelSensitivity: 0.25,
            minZoom: 0.25,
            maxZoom: 2.5,
            style: [
                { selector: "node", style: {
                    "background-color": "data(color)", "label": "data(caption)", "color": ink,
                    "font-size": props.compact ? 9 : 11, "text-valign": "bottom", "text-margin-y": 4,
                    "text-wrap": "wrap", "text-max-width": "120px", "width": 22, "height": 22,
                    "border-width": 2, "border-color": backing, "text-background-color": backing,
                    "text-background-opacity": 0.7, "text-background-padding": "1px"
                } },
                { selector: "node.collapsed", style: { "background-opacity": 0.55, "border-style": "dashed", "border-color": "data(color)" } },
                { selector: "node.center", style: { "width": 32, "height": 32, "font-weight": "bold" } },
                { selector: "node:selected", style: { "border-color": selectedRim, "border-width": 3 } },
                { selector: "edge", style: {
                    "width": 1.4, "line-color": "#b8c0ca", "target-arrow-color": "#b8c0ca", "target-arrow-shape": "triangle",
                    "arrow-scale": 0.8, "curve-style": "bezier", "label": "", "font-size": 9, "color": "#5b6675",
                    "text-rotation": "autorotate", "text-background-color": backing, "text-background-opacity": 0.85
                } },
                { selector: "edge.lit, edge:selected", style: { "label": "data(relation)", "line-color": "#5b6675", "target-arrow-color": "#5b6675", "width": 2 } },
                { selector: ".hidden", style: { "display": "none" } }
            ],
            layout: { name: "preset" },
            // smoother pan and zoom: draw a cached bitmap while the view moves
            textureOnViewport: true,
            motionBlur: false
        });
        cyRef.current = cy;
        // for browser tests: the container carries its graph
        (box.current as unknown as { __cy?: Core }).__cy = cy;

        const report = (): void => {
            const rel = new Set<string>(), kinds = new Set<string>();
            cy.edges().forEach(e => { rel.add(e.data("relation")); });
            cy.nodes().forEach(n => { if (n.data("kind")) kinds.add(n.data("kind")); });
            propsRef.current.onChange?.([...rel].sort(), [...kinds].sort());
        };
        const applyHidden = (): void => {
            const hidden = new Set(propsRef.current.hiddenRelations ?? []);
            cy.edges().forEach(e => { e.toggleClass("hidden", hidden.has(e.data("relation"))); });
            // a node no visible edge reaches, other than an expanded one, goes too
            cy.nodes().forEach(n => {
                const visible = n.connectedEdges().filter(e => !e.hasClass("hidden")).length > 0;
                n.toggleClass("hidden", !visible && !expanded.current.has(n.id()) && cy.nodes().length > 1);
            });
        };
        // The force layout is computed first and then played as ONE eased move
        // of every node (and the view), instead of redrawing each of its
        // iterations, which is what made it stutter. New nodes fade in on the
        // way. A layout still running is stopped first, so two never fight.
        const relayout = (around?: NodeSingular, fresh?: cytoscape.CollectionReturnValue): void => {
            running.current?.stop();
            const layout = cy.layout({
                name: "cose", animate: "end", animationDuration: 600, animationEasing: "ease-in-out-cubic",
                randomize: false, fit: true, padding: 24, numIter: 1500,
                nodeRepulsion: () => 9000, idealEdgeLength: () => (propsRef.current.compact ? 70 : 95), nodeDimensionsIncludeLabels: true
            } as cytoscape.LayoutOptions);
            running.current = layout;
            layout.one("layoutstop", () => { if (running.current === layout) running.current = null; });
            fresh?.animate({ style: { opacity: 1 } }, { duration: 500, easing: "ease-out-cubic" });
            layout.run();
            if (around) { cy.elements().unselect(); around.select(); }
        };
        const addNode = (ref: string, label: string, kind: string, near?: NodeSingular): NodeSingular => {
            const existing = cy.getElementById(ref);
            if (existing.nonempty()) return existing as NodeSingular;
            const p = near ? near.position() : { x: 0, y: 0 };
            const def: ElementDefinition = {
                group: "nodes",
                data: { id: ref, label, kind, color: kindColor(kind), caption: [ref, shortName(label, ref)].filter(Boolean).join("\n") },
                // start on the node that brought it in (a hair apart, so the
                // layout can separate them), and fade in from there
                position: { x: p.x + (Math.random() - 0.5) * 8, y: p.y + (Math.random() - 0.5) * 8 },
                style: near ? { opacity: 0 } : undefined,
                classes: "collapsed"
            };
            return cy.add(def) as unknown as NodeSingular;
        };
        const expand = (ref: string): void => {
            loadNode(ref).then(details => {
                const node = addNode(ref, details.label, details.kind);
                node.data({ label: details.label, kind: details.kind, color: kindColor(details.kind), caption: [ref, shortName(details.label, ref)].filter(Boolean).join("\n") });
                node.removeClass("collapsed");
                expanded.current.add(ref);
                const before = cy.elements();
                for (const f of details.facts) {
                    if (!f.ref || f.dir === "value") continue;
                    addNode(f.ref, f.target || f.ref, f.kind || "", node);
                    const [src, dst] = f.dir === "in" ? [f.ref, ref] : [ref, f.ref];
                    const id = `${src}|${f.relation}|${dst}`;
                    if (cy.getElementById(id).empty()) {
                        cy.add({ group: "edges", data: { id, source: src, target: dst, relation: f.relation || "" } });
                    }
                }
                applyHidden();
                report();
                const fresh = cy.elements().difference(before);
                fresh.edges().style("opacity", 0);
                relayout(node, fresh);
                propsRef.current.onSelect?.(details);
            }).catch(() => { /* the node keeps its collapsed look; nothing else to do */ });
        };

        cy.on("tap", "node", evt => {
            const n = evt.target as NodeSingular;
            if (expanded.current.has(n.id())) {
                loadNode(n.id()).then(d => propsRef.current.onSelect?.(d)).catch(() => undefined);
            } else {
                expand(n.id());
            }
        });
        cy.on("mouseover", "node", evt => { (evt.target as NodeSingular).connectedEdges().addClass("lit"); });
        cy.on("mouseout", "node", evt => { (evt.target as NodeSingular).connectedEdges().removeClass("lit"); });

        const api: GraphApi = {
            focus(ref, label, kind) {
                const n = addNode(ref, label ?? ref, kind ?? "");
                n.addClass("center");
                expand(ref);
            },
            fit() { cy.animate({ fit: { eles: cy.elements(":visible"), padding: 24 } }, { duration: 400, easing: "ease-in-out-cubic" }); },
            clear() { running.current?.stop(); cy.elements().remove(); expanded.current.clear(); report(); }
        };
        (cy as unknown as { __apply: () => void }).__apply = applyHidden;
        props.apiRef?.(api);
        if (props.startRef) api.focus(props.startRef);
        return () => { running.current?.stop(); cy.destroy(); cyRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const cy = cyRef.current as unknown as { __apply?: () => void } | null;
        cy?.__apply?.();
    }, [props.hiddenRelations]);

    return <div ref={box} className="gx-canvas" style={{ height: props.height, ...props.style }} />;
}
