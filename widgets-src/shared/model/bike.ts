import * as THREE from "three";

// A low-poly bike for the 3D product viewer, assembled from the app's BOM data
// (GET rest/productgraph/v1/models/{ref}, mdlsource/26-bike-bom.mdl). The frame,
// wheels and controls are drawn here; every part comes from data: the bike's
// MOUNT SLOTS (named points on the frame, with fit sizes), its BOM LINES (fitted
// and standard parts) and each part's MODEL (the slot it mounts at, its fit size,
// its explode direction and its shape as primitives placed relative to the slot).
// Each placed part becomes a SLOT here: a group of meshes named after its SKU, so
// it can be highlighted, exploded and clicked. A part this bike cannot take (no
// such mount point, a different fit size, no shape) is returned as unplaced, with
// the reason.
//
// Side view in the XY plane (metres, wheels on the ground at y = 0), Z across.

export type SlotRole = "base" | "component" | "fits";

export interface PartRef { ref: string; label: string; role: SlotRole }

/** One primitive of a part's shape; position relative to the part's mount slot, angles in degrees. */
export interface ShapeSpec {
    kind: "Box" | "Cylinder" | "Torus" | "Dome";
    finish: "Matte" | "Metal" | "Rubber";
    color: string;
    emissive?: string;
    glow?: number;
    opacity?: number;
    wireframe?: boolean;
    pos: number[];
    size: number[];                 // Box: w h d; Cylinder: top radius, bottom radius, length; Torus: radius, tube; Dome: radius
    rot: number[];
    segments?: number;
    detail?: number;
}

export interface MountSlot { code: string; name: string; pos: number[]; fit?: number }

export interface PartModel extends PartRef {
    quantity?: number;
    slot?: string;                  // the mount slot code; none when the part has no 3D model
    fit?: number;                   // the fit size it needs, mm (a seat post's diameter)
    explode?: number[];
    shapes: ShapeSpec[];
}

export interface BikeModel { ref: string; label: string; slots: MountSlot[]; parts: PartModel[] }

export interface Unplaced extends PartRef { reason: string }

export interface Slot {
    ref: string;
    label: string;
    role: SlotRole;
    group: THREE.Group;
    home: THREE.Vector3;           // the group's position on the bike
    explode: THREE.Vector3;        // where it goes when the bike is exploded
    meshes: THREE.Mesh[];
}

const R = 0.35;                                // wheel radius
const REAR = new THREE.Vector3(-0.55, R, 0);
const FRONT = new THREE.Vector3(0.55, R, 0);
const BB = new THREE.Vector3(0, 0.3, 0);       // bottom bracket
const SEAT = new THREE.Vector3(-0.13, 0.86, 0); // top of the seat tube
const HEAD_TOP = new THREE.Vector3(0.42, 0.93, 0);
const HEAD_LOW = new THREE.Vector3(0.46, 0.76, 0);

const FINISH: Record<string, { roughness: number; metalness: number }> = {
    Matte: { roughness: 0.55, metalness: 0.25 },
    Metal: { roughness: 0.35, metalness: 0.7 },
    Rubber: { roughness: 0.9, metalness: 0 }
};

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}

/** A cylinder from a to b. */
function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 14), material);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return m;
}

function torus(center: THREE.Vector3, radius: number, tubeR: number, material: THREE.Material, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeR, 12, 48), material);
    m.position.set(center.x, center.y, center.z + z);
    return m;
}

/** One primitive of a part, in bike coordinates. */
export function shapeMesh(s: ShapeSpec, anchor: THREE.Vector3): THREE.Mesh {
    const [a = 0, b = 0, c = 0] = s.size;
    let geometry: THREE.BufferGeometry;
    switch (s.kind) {
        case "Box": geometry = new THREE.BoxGeometry(a, b, c); break;
        case "Cylinder": geometry = new THREE.CylinderGeometry(a, b, c, s.segments || 16); break;
        case "Torus": geometry = new THREE.TorusGeometry(a, b, s.detail || 12, s.segments || 48); break;
        default: geometry = new THREE.SphereGeometry(a, s.segments || 24, s.detail || 12, 0, Math.PI * 2, 0, Math.PI / 2); break;
    }
    const opacity = s.opacity ?? 1;
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.color),
        ...(FINISH[s.finish] ?? FINISH.Matte),
        ...(s.emissive ? { emissive: new THREE.Color(s.emissive), emissiveIntensity: s.glow ?? 1 } : {}),
        ...(opacity < 1 ? { transparent: true, opacity } : {}),
        ...(s.wireframe ? { wireframe: true } : {})
    });
    const m = new THREE.Mesh(geometry, material);
    m.position.set(anchor.x + (s.pos[0] ?? 0), anchor.y + (s.pos[1] ?? 0), anchor.z + (s.pos[2] ?? 0));
    m.rotation.set(THREE.MathUtils.degToRad(s.rot[0] ?? 0), THREE.MathUtils.degToRad(s.rot[1] ?? 0), THREE.MathUtils.degToRad(s.rot[2] ?? 0));
    return m;
}

/** Why this bike cannot take the part, or undefined when it can. */
export function whyNot(part: PartModel, slots: Map<string, MountSlot>): string | undefined {
    if (!part.slot || part.shapes.length === 0) return "has no 3D model";
    const slot = slots.get(part.slot);
    if (!slot) return `this bike has no ${part.slot.replace(/_/g, " ")} mount`;
    if (part.fit != null && slot.fit != null && Math.abs(part.fit - slot.fit) > 0.05) return `needs ${part.fit} mm; this bike's ${slot.name.replace(/ \(.*\)$/, "").toLowerCase()} is ${slot.fit} mm`;
    return undefined;
}

/** The bike's own frame, wheels and controls: not parts of the graph, not selectable. */
function frame(color: number, plainSeatPost: boolean): THREE.Group {
    const g = new THREE.Group();
    const paint = mat(color, { metalness: 0.45, roughness: 0.4 });
    const metal = mat(0xb9c2cf, { metalness: 0.7, roughness: 0.35 });
    const dark = mat(0x1f2430);
    g.add(tube(BB, SEAT, 0.022, paint));                                  // seat tube
    g.add(tube(BB, HEAD_LOW, 0.028, paint));                              // down tube
    g.add(tube(SEAT.clone().add(new THREE.Vector3(0, -0.12, 0)), HEAD_TOP.clone().add(new THREE.Vector3(0, -0.05, 0)), 0.02, paint)); // low top tube
    g.add(tube(HEAD_LOW, HEAD_TOP, 0.03, paint));                         // head tube
    for (const z of [0.05, -0.05]) {
        g.add(tube(BB, REAR.clone().setZ(z), 0.012, paint));               // chain stays
        g.add(tube(SEAT.clone().add(new THREE.Vector3(0, -0.04, 0)), REAR.clone().setZ(z), 0.011, paint)); // seat stays
        g.add(tube(HEAD_LOW, FRONT.clone().setZ(z), 0.013, paint));        // fork
    }
    for (const c of [REAR, FRONT]) {
        g.add(torus(c, R - 0.045, 0.012, metal));                         // rim
        for (let i = 0; i < 18; i++) {                                    // spokes
            const a = (i / 18) * Math.PI * 2;
            g.add(tube(c, new THREE.Vector3(c.x + Math.cos(a) * (R - 0.05), c.y + Math.sin(a) * (R - 0.05), (i % 2 ? 0.02 : -0.02)), 0.0025, metal));
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12), metal);
        hub.rotation.x = Math.PI / 2; hub.position.copy(c);
        g.add(hub);
    }
    // drive: chainring, cranks, pedals, chain
    g.add(torus(BB, 0.09, 0.008, metal, 0.06));
    const crank1 = tube(BB.clone().setZ(0.08), new THREE.Vector3(BB.x + 0.12, BB.y - 0.12, 0.08), 0.01, dark);
    const crank2 = tube(BB.clone().setZ(-0.08), new THREE.Vector3(BB.x - 0.12, BB.y + 0.12, -0.08), 0.01, dark);
    g.add(crank1, crank2);
    g.add(tube(new THREE.Vector3(BB.x, BB.y + 0.09, 0.06), new THREE.Vector3(REAR.x, REAR.y + 0.05, 0.06), 0.004, dark));
    g.add(tube(new THREE.Vector3(BB.x, BB.y - 0.09, 0.06), new THREE.Vector3(REAR.x, REAR.y - 0.05, 0.06), 0.004, dark));
    // cockpit: stem, bar, grips
    const stemTop = HEAD_TOP.clone().add(new THREE.Vector3(-0.02, 0.1, 0));
    g.add(tube(HEAD_TOP, stemTop, 0.016, metal));
    g.add(tube(stemTop.clone().setZ(-0.28), stemTop.clone().setZ(0.28), 0.014, dark));
    // saddle (the seat post is a slot)
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.13), dark);
    saddle.position.copy(SEAT).add(new THREE.Vector3(-0.06, 0.18, 0));
    g.add(saddle);
    // a plain seat post when no seat post is mounted
    if (plainSeatPost) g.add(tube(SEAT, SEAT.clone().add(new THREE.Vector3(-0.04, 0.16, 0)), 0.014, metal));
    return g;
}

/** Builds the bike: its frame plus one slot per part it can take. The others come back in `unplaced`, with the reason. */
export function buildBike(model: BikeModel, frameColor: number): { root: THREE.Group; slots: Slot[]; unplaced: Unplaced[] } {
    const mounts = new Map(model.slots.map(s => [s.code, s]));
    const root = new THREE.Group();
    const slots: Slot[] = [];
    const unplaced: Unplaced[] = [];
    for (const p of model.parts) {
        const reason = whyNot(p, mounts);
        if (reason) { unplaced.push({ ref: p.ref, label: p.label, role: p.role, reason }); continue; }
        const mount = mounts.get(p.slot as string) as MountSlot;
        const anchor = new THREE.Vector3(mount.pos[0], mount.pos[1], mount.pos[2]);
        const group = new THREE.Group();
        group.name = p.ref;
        const meshes = p.shapes.map(s => shapeMesh(s, anchor));
        for (const m of meshes) { m.userData.ref = p.ref; group.add(m); }
        root.add(group);
        const e = p.explode ?? [0, 0.3, 0.3];
        slots.push({ ref: p.ref, label: p.label, role: p.role, group, home: group.position.clone(), explode: new THREE.Vector3(e[0], e[1], e[2]), meshes });
    }
    root.add(frame(frameColor, !slots.some(s => model.parts.find(p => p.ref === s.ref)?.slot === "seat_tube")));
    return { root, slots, unplaced };
}
