import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadNode, NodeDetails } from "../graph/api";
import { buildBike, PartRef, Slot, slotKind } from "./bike";
import "./ModelView.css";

// The 3D product viewer: a bike from the product graph, built procedurally
// (bike.ts), with its parts highlighted, exploded and clickable. Shared by the
// chat's model card (ChatRichText) and the Product explorer (GraphExplorer).
//
// What the bike contains comes from the graph (GET rest/productgraph/v1/nodes/
// {ref}, with the user's session): "has component" parts are fitted; parts and
// accessories that are "compatible with" it are shown faintly when the viewer is
// asked what fits. A highlighted part glows and the rest turns see-through. A
// card can only highlight parts this bike has or that fit it; anything else is
// listed under the viewer instead of drawn.

export type ModelTone = "accent" | "warning" | "critical";

export interface ModelViewProps {
    productRef: string;
    highlight?: string[];
    tone?: ModelTone;
    height: number;
    onSelectPart?: (ref: string) => void;
}

const BASE_KINDS = new Set(["tyres", "tubes", "discbrakes", "rimbrakes", "seatpost"]);
const TONE_COLOR: Record<ModelTone, number> = { accent: 0x4fd1c5, warning: 0xf5b454, critical: 0xff6b6b };
const FRAME_COLORS = [0x1f6f68, 0x3b4a6b, 0x7a3b4a, 0x5a5f2b];

function isBike(kind: string): boolean {
    return /bike/i.test(kind);
}

/** The bike's parts from its graph facts: components, the standard parts that fit it, and accessories. */
export function partsOf(node: NodeDetails): { parts: PartRef[]; disc: boolean } {
    const parts: PartRef[] = [];
    // the graph labels nodes "SKU · name": keep the name
    const name = (ref: string, target?: string): string => (target || ref).replace(new RegExp(`^${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*·\\s*`), "");
    const seen = new Set<string>();
    for (const f of node.facts) {
        if (!f.ref || seen.has(f.ref)) continue;
        if (f.dir === "out" && f.relation === "has component") {
            parts.push({ ref: f.ref, label: name(f.ref, f.target), role: "component" });
            seen.add(f.ref);
        }
    }
    for (const f of node.facts) {
        if (!f.ref || seen.has(f.ref) || f.dir !== "in" || f.relation !== "compatible with") continue;
        const kind = slotKind(f.ref);
        parts.push({ ref: f.ref, label: name(f.ref, f.target), role: kind && BASE_KINDS.has(kind) ? "base" : "fits" });
        seen.add(f.ref);
    }
    const brakes = node.facts.find(f => f.dir === "value" && /^brakes:/i.test(f.label));
    return { parts, disc: brakes ? /disc/i.test(brakes.label) : true };
}

interface Look { color: THREE.Color; emissive: THREE.Color; opacity: number; transparent: boolean }

export function ModelView(props: ModelViewProps): ReactElement {
    const box = useRef<HTMLDivElement>(null);
    const stage = useRef<{ slots: Slot[]; root: THREE.Group; apply: () => void } | null>(null);
    const [product, setProduct] = useState<NodeDetails | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error" | "nobike">("loading");
    const [message, setMessage] = useState("");
    const [explode, setExplode] = useState(0);
    const [showFits, setShowFits] = useState(false);
    const [picked, setPicked] = useState<string | undefined>();
    const [pickedInfo, setPickedInfo] = useState<NodeDetails | null>(null);
    const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
    const [slotList, setSlotList] = useState<PartRef[]>([]);
    const [unplaced, setUnplaced] = useState<PartRef[]>([]);
    const highlightKey = (props.highlight ?? []).join("|");
    const live = useRef({ explode, showFits, picked, highlight: props.highlight ?? [], tone: props.tone ?? "accent" as ModelTone });
    live.current = { explode, showFits, picked, highlight: props.highlight ?? [], tone: props.tone ?? "accent" };

    // load the product
    useEffect(() => {
        let cancelled = false;
        setStatus("loading");
        loadNode(props.productRef).then(node => {
            if (cancelled) return;
            setProduct(node);
            if (!isBike(node.kind)) { setStatus("nobike"); setMessage(`${node.label} has no 3D model: only bikes do.`); return; }
            setStatus("ready");
        }).catch((e: Error) => { if (!cancelled) { setStatus("error"); setMessage(e.message); } });
        return () => { cancelled = true; };
    }, [props.productRef]);

    // build the scene once the product is known
    useEffect(() => {
        const el = box.current;
        if (!el || !product || status !== "ready") return;
        const { parts, disc } = partsOf(product);
        // a highlight the bike does not have or fit is not drawn: list it
        const known = new Set(parts.map(p => p.ref.toUpperCase()));
        const foreign = (props.highlight ?? []).filter(h => !known.has(h.toUpperCase())).map(h => ({ ref: h, label: h, role: "fits" as const }));
        const color = FRAME_COLORS[[...props.productRef].reduce((a, c) => a + c.charCodeAt(0), 0) % FRAME_COLORS.length];
        const { root, slots, unplaced: left } = buildBike({ ref: props.productRef, disc, parts }, color);
        setSlotList(slots.map(s => ({ ref: s.ref, label: s.label, role: s.role })));
        setUnplaced([...left.filter(p => p.role !== "fits"), ...foreign]);

        const scene = new THREE.Scene();
        scene.add(root);
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f2b, 1.2));
        const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(2, 3, 2.5); scene.add(sun);
        const rim = new THREE.DirectionalLight(0x4fd1c5, 0.6); rim.position.set(-2, 1.5, -2); scene.add(rim);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
        ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; scene.add(ground);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, props.height);
        el.append(renderer.domElement);
        const camera = new THREE.PerspectiveCamera(32, el.clientWidth / props.height, 0.05, 50);
        camera.position.set(1.0, 1.05, 2.9);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.5, 0);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.9;
        controls.minDistance = 1.0; controls.maxDistance = 5;
        controls.addEventListener("start", () => { controls.autoRotate = false; });
        controls.update();

        // remember each mesh's own look, to restore it after a highlight
        const looks = new Map<THREE.Mesh, Look>();
        root.traverse(o => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const material = (m.material as THREE.MeshStandardMaterial).clone();
            m.material = material;
            looks.set(m, { color: material.color.clone(), emissive: material.emissive.clone(), opacity: material.opacity, transparent: material.transparent });
        });
        const slotOf = new Map<string, Slot>(slots.map(s => [s.ref.toUpperCase(), s]));

        const apply = (): void => {
            const { explode: e, showFits: fits, picked: pick, highlight, tone } = live.current;
            const lit = new Set([...highlight, ...(pick ? [pick] : [])].map(h => h.toUpperCase()));
            const glow = new THREE.Color(TONE_COLOR[pick && !highlight.length ? "accent" : tone]);
            for (const s of slots) {
                s.group.position.copy(s.home).addScaledVector(s.explode, e * 0.6);
                s.group.visible = s.role !== "fits" || fits || lit.has(s.ref.toUpperCase());
            }
            looks.forEach((look, m) => {
                const ref = (m.userData.ref as string | undefined)?.toUpperCase();
                const material = m.material as THREE.MeshStandardMaterial;
                const slot = ref ? slotOf.get(ref) : undefined;
                material.color.copy(look.color);
                material.emissive.copy(look.emissive);
                material.emissiveIntensity = 1;
                let opacity = look.opacity, transparent = look.transparent;
                if (lit.size) {
                    if (ref && lit.has(ref)) {
                        material.emissive.copy(glow).multiplyScalar(0.55);
                        material.color.lerp(glow, 0.35);
                        opacity = 1; transparent = false;
                    } else {
                        opacity = 0.24; transparent = true;
                    }
                } else if (slot?.role === "fits") {
                    opacity = 0.45; transparent = true;
                }
                material.opacity = opacity;
                material.transparent = transparent;
                material.depthWrite = !transparent;
            });
        };
        stage.current = { slots, root, apply };
        apply();

        // hover and click on parts
        const ray = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const hit = (ev: PointerEvent): Slot | undefined => {
            const r = renderer.domElement.getBoundingClientRect();
            pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
            ray.setFromCamera(pointer, camera);
            const targets = slots.filter(s => s.group.visible).flatMap(s => s.meshes);
            const first = ray.intersectObjects(targets, false)[0];
            return first ? slotOf.get(String(first.object.userData.ref).toUpperCase()) : undefined;
        };
        let downAt = { x: 0, y: 0 };
        const onMove = (ev: PointerEvent): void => {
            const s = hit(ev);
            renderer.domElement.style.cursor = s ? "pointer" : "grab";
            const r = renderer.domElement.getBoundingClientRect();
            setHover(s ? { x: ev.clientX - r.left, y: ev.clientY - r.top, text: `${s.ref} · ${s.label}` } : null);
        };
        const onDown = (ev: PointerEvent): void => { downAt = { x: ev.clientX, y: ev.clientY }; };
        const onUp = (ev: PointerEvent): void => {
            if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 5) return;   // a drag, not a click
            const s = hit(ev);
            if (!s) return;
            setPicked(s.ref);
            props.onSelectPart?.(s.ref);
        };
        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointerup", onUp);
        renderer.domElement.addEventListener("pointerleave", () => setHover(null));

        // render only while on screen
        let visible = true;
        const io = new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); });
        io.observe(el);
        renderer.setAnimationLoop(() => { if (!visible) return; controls.update(); renderer.render(scene, camera); });
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth;
            if (!w) return;
            renderer.setSize(w, props.height);
            camera.aspect = w / props.height;
            camera.updateProjectionMatrix();
        });
        ro.observe(el);
        // for browser tests
        (el as unknown as { __model?: unknown }).__model = { slots, scene, camera };

        return () => {
            renderer.setAnimationLoop(null);
            io.disconnect(); ro.disconnect(); controls.dispose();
            scene.traverse(o => {
                const m = o as THREE.Mesh;
                if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
            });
            renderer.dispose();
            renderer.domElement.remove();
            stage.current = null;
        };
    // rebuilt only for another product; highlight changes go through apply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product, status, props.height]);

    // highlight, explode, what fits, the picked part: re-apply the look
    useEffect(() => { stage.current?.apply(); }, [explode, showFits, picked, highlightKey, props.tone]);

    // a highlight from outside (the explorer) replaces a part picked here
    useEffect(() => { setPicked(undefined); }, [highlightKey]);

    // details of the picked part
    useEffect(() => {
        if (!picked) { setPickedInfo(null); return; }
        let cancelled = false;
        loadNode(picked).then(d => { if (!cancelled) setPickedInfo(d); }).catch(() => { if (!cancelled) setPickedInfo(null); });
        return () => { cancelled = true; };
    }, [picked]);

    const chips = useMemo(() => slotList.filter(s => s.role !== "fits" || showFits), [slotList, showFits]);
    const lit = new Set([...(props.highlight ?? []), ...(picked ? [picked] : [])].map(h => h.toUpperCase()));

    if (status === "error" || status === "nobike") {
        return <p className="mv-note">{status === "error" ? `The 3D view could not be loaded: ${message}` : message}</p>;
    }
    return (
        <div className="mv-root">
            <div className="mv-stage" ref={box} style={{ height: props.height }} aria-label={product ? `3D model of ${product.label}` : "3D model"} role="img">
                {status === "loading" && <span className="mv-loading">Loading the 3D model…</span>}
                {hover && <span className="mv-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>{hover.text}</span>}
            </div>
            <div className="mv-controls">
                <label className="mv-explode">
                    <span>Exploded</span>
                    <input type="range" min={0} max={1} step={0.01} value={explode} onChange={e => setExplode(Number(e.target.value))} />
                </label>
                <label className="mv-fits">
                    <input type="checkbox" checked={showFits} onChange={e => setShowFits(e.target.checked)} />
                    <span>Show what fits</span>
                </label>
            </div>
            {chips.length > 0 && (
                <div className="mv-parts" aria-label="Parts">
                    {chips.map(c => (
                        <button type="button" key={c.ref} className={`mv-chip mv-chip--${c.role}${lit.has(c.ref.toUpperCase()) ? " mv-chip--lit" : ""}`}
                            aria-pressed={picked === c.ref} onClick={() => setPicked(p => (p === c.ref ? undefined : c.ref))}>
                            {c.ref}<span>{c.label}</span>
                        </button>
                    ))}
                </div>
            )}
            {pickedInfo && (
                <div className="mv-info">
                    <strong>{pickedInfo.label}</strong>
                    <ul>
                        {pickedInfo.facts.filter(f => f.dir === "value").slice(0, 6).map((f, i) => <li key={i}>{f.label}</li>)}
                    </ul>
                </div>
            )}
            {unplaced.length > 0 && <p className="mv-note">Not in the 3D model: {unplaced.map(u => u.ref).join(", ")}</p>}
        </div>
    );
}
