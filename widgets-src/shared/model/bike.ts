import * as THREE from "three";

// A procedural, low-poly bike for the 3D product viewer. No model files: the
// bike is built from simple shapes, and every part the product graph names gets
// a SLOT, a group of meshes named after the part's SKU, so it can be highlighted,
// exploded and clicked. What a bike contains comes from the graph; this file
// only knows where each kind of part sits (by SKU prefix) and how it looks.
//
// Side view in the XY plane (metres, wheels on the ground at y = 0), Z across.

export type SlotRole = "base" | "component" | "fits";

export interface PartRef { ref: string; label: string; role: SlotRole }

export interface BikeSpec {
    ref: string;
    disc: boolean;                 // disc brakes (else rim brakes)
    parts: PartRef[];              // what the graph says, with the slot role
}

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

/** The slot a SKU belongs in, by its prefix; undefined when the viewer has no shape for it. */
export function slotKind(ref: string): string | undefined {
    const r = ref.toUpperCase();
    if (r.startsWith("BAT-")) return "battery";
    if (r.startsWith("CVR-")) return "cover";
    if (/^MOT-.*H$/.test(r)) return "hubmotor";
    if (/^MOT-.*M$/.test(r)) return "midmotor";
    if (r.startsWith("CHG-")) return "charger";
    if (r.startsWith("TYR-")) return "tyres";
    if (r.startsWith("TUB-")) return "tubes";
    if (r.startsWith("BRK-PAD")) return "discbrakes";
    if (r.startsWith("BRK-RIM")) return "rimbrakes";
    if (r.startsWith("SSP-")) return "seatpost";
    if (r.startsWith("RCK-")) return "rack";
    if (r.startsWith("BSK-")) return "basket";
    if (r.startsWith("CHS-")) return "childseat";
    if (r.startsWith("PAN-")) return "panniers";
    if (r.startsWith("LGT-")) return "lights";
    if (r.startsWith("LCK-")) return "lock";
    if (r.startsWith("HLM-")) return "helmet";
    return undefined;
}

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

/** A box along the line from a to b, raised `lift` above it. */
function along(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, d: number, lift: number, material: THREE.Material): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.BoxGeometry(dir.length() * w, h, d), material);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.rotation.z = Math.atan2(dir.y, dir.x);
    m.translateY(lift);
    return m;
}

function torus(center: THREE.Vector3, radius: number, tubeR: number, material: THREE.Material, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeR, 12, 48), material);
    m.position.set(center.x, center.y, center.z + z);
    return m;
}

/** The meshes of one kind of part, in bike coordinates, and the direction it moves when exploded. */
function partShape(kind: string): { meshes: THREE.Mesh[]; explode: THREE.Vector3 } | undefined {
    const dark = mat(0x2a3142);
    const metal = mat(0xb9c2cf, { metalness: 0.7, roughness: 0.35 });
    const rubber = mat(0x1a1d24, { roughness: 0.9, metalness: 0 });
    switch (kind) {
        case "battery": {
            const b = along(BB, HEAD_LOW, 0.62, 0.075, 0.085, 0.06, mat(0x3a4256));
            const cap = along(BB, HEAD_LOW, 0.12, 0.078, 0.088, 0.06, mat(0x4fd1c5, { emissive: 0x0d3b37 }));
            cap.position.lerp(HEAD_LOW, 0.12);
            return { meshes: [b, cap], explode: new THREE.Vector3(0.05, 0.35, 0.35) };
        }
        case "cover":
            return { meshes: [along(BB, HEAD_LOW, 0.66, 0.1, 0.11, 0.06, mat(0x5b6680, { transparent: true, opacity: 0.55 }))], explode: new THREE.Vector3(0.1, 0.55, 0.5) };
        case "hubmotor": {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.075, 28), dark);
            m.rotation.x = Math.PI / 2; m.position.copy(REAR);
            const ring = torus(REAR, 0.085, 0.008, metal);
            return { meshes: [m, ring], explode: new THREE.Vector3(-0.25, 0.25, 0.45) };
        }
        case "midmotor": {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.1), dark);
            m.position.set(BB.x + 0.03, BB.y - 0.02, 0);
            m.rotation.z = -0.35;
            return { meshes: [m], explode: new THREE.Vector3(0.1, -0.2, 0.45) };
        }
        case "charger": {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.08), dark);
            body.position.set(-0.15, 0.02, 0.42);
            const cable = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 24), rubber);
            cable.rotation.x = Math.PI / 2; cable.position.set(-0.32, 0.01, 0.42);
            return { meshes: [body, cable], explode: new THREE.Vector3(0, 0.15, 0.3) };
        }
        case "tyres":
            return { meshes: [torus(REAR, R - 0.02, 0.026, rubber), torus(FRONT, R - 0.02, 0.026, rubber)], explode: new THREE.Vector3(0, 0, 0.45) };
        case "tubes":
            return { meshes: [torus(REAR, R - 0.022, 0.014, mat(0x7a4b2a)), torus(FRONT, R - 0.022, 0.014, mat(0x7a4b2a))], explode: new THREE.Vector3(0, 0, 0.8) };
        case "discbrakes": {
            const meshes: THREE.Mesh[] = [];
            for (const c of [REAR, FRONT]) {
                const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.004, 32), metal);
                rotor.rotation.x = Math.PI / 2; rotor.position.set(c.x, c.y, 0.055);
                const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), mat(0xd4682a));
                caliper.position.set(c.x - 0.06, c.y + 0.05, 0.055);
                meshes.push(rotor, caliper);
            }
            return { meshes, explode: new THREE.Vector3(0, 0, -0.45) };
        }
        case "rimbrakes": {
            const pad = (x: number, y: number): THREE.Mesh => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.06), mat(0xd4682a)); m.position.set(x, y, 0); return m; };
            return { meshes: [pad(REAR.x + 0.12, REAR.y + R - 0.03), pad(FRONT.x - 0.06, FRONT.y + R - 0.03)], explode: new THREE.Vector3(0, 0.25, -0.4) };
        }
        case "seatpost": {
            const top = SEAT.clone().add(new THREE.Vector3(-0.04, 0.16, 0));
            const post = tube(SEAT.clone().add(new THREE.Vector3(0.02, -0.08, 0)), top, 0.016, metal);
            const spring = torus(SEAT.clone().add(new THREE.Vector3(-0.02, 0.07, 0)), 0.022, 0.006, mat(0xd4682a));
            spring.rotation.x = Math.PI / 2;
            return { meshes: [post, spring], explode: new THREE.Vector3(-0.1, 0.35, 0) };
        }
        case "rack": {
            const y = REAR.y + R + 0.06;
            const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.14), metal);
            top.position.set(REAR.x + 0.02, y, 0);
            const strut1 = tube(new THREE.Vector3(REAR.x + 0.1, y, 0.06), REAR.clone().setZ(0.06), 0.008, metal);
            const strut2 = tube(new THREE.Vector3(REAR.x + 0.1, y, -0.06), REAR.clone().setZ(-0.06), 0.008, metal);
            const stay = tube(new THREE.Vector3(REAR.x + 0.2, y, 0), SEAT.clone().add(new THREE.Vector3(0, -0.06, 0)), 0.007, metal);
            return { meshes: [top, strut1, strut2, stay], explode: new THREE.Vector3(-0.2, 0.35, 0) };
        }
        case "basket": {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), mat(0x9b5bb5, { wireframe: true }));
            b.position.set(HEAD_TOP.x + 0.22, HEAD_TOP.y - 0.02, 0);
            return { meshes: [b], explode: new THREE.Vector3(0.35, 0.15, 0) };
        }
        case "childseat": {
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.28), mat(0x9b5bb5));
            seat.position.set(REAR.x + 0.02, REAR.y + R + 0.12, 0);
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.28), mat(0x9b5bb5));
            back.position.set(REAR.x - 0.14, REAR.y + R + 0.28, 0);
            return { meshes: [seat, back], explode: new THREE.Vector3(-0.15, 0.55, 0) };
        }
        case "panniers": {
            const bag = (z: number): THREE.Mesh => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.09), mat(0x2f6f5e)); m.position.set(REAR.x + 0.02, REAR.y + R - 0.12, z); return m; };
            return { meshes: [bag(0.13), bag(-0.13)], explode: new THREE.Vector3(-0.1, 0.1, 0.4) };
        }
        case "lights": {
            const front = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 16), mat(0xfff3c4, { emissive: 0xffe08a, emissiveIntensity: 0.6 }));
            front.rotation.z = Math.PI / 2; front.position.set(HEAD_TOP.x + 0.08, HEAD_TOP.y + 0.02, 0);
            const rear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), mat(0xff5a5a, { emissive: 0xc62828, emissiveIntensity: 0.6 }));
            rear.position.copy(SEAT).add(new THREE.Vector3(-0.06, 0.02, 0));
            return { meshes: [front, rear], explode: new THREE.Vector3(0.2, 0.25, 0) };
        }
        case "lock": {
            const coil = torus(new THREE.Vector3(BB.x - 0.06, BB.y + 0.28, 0), 0.06, 0.012, mat(0xd4682a));
            coil.rotation.y = Math.PI / 2;
            return { meshes: [coil], explode: new THREE.Vector3(-0.3, 0.1, 0.25) };
        }
        case "helmet": {
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4f6bd8));
            h.position.set(HEAD_TOP.x - 0.04, HEAD_TOP.y + 0.08, 0.2);
            return { meshes: [h], explode: new THREE.Vector3(0, 0.3, 0.3) };
        }
        default:
            return undefined;
    }
}

/** The bike's own frame, wheels and controls: not parts of the graph, not selectable. */
function frame(spec: BikeSpec, color: number): THREE.Group {
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
    // a plain seat post when the graph names none
    if (!spec.parts.some(p => slotKind(p.ref) === "seatpost")) g.add(tube(SEAT, SEAT.clone().add(new THREE.Vector3(-0.04, 0.16, 0)), 0.014, metal));
    return g;
}

/** Builds the bike: its frame plus one slot per part with a shape. Parts without a shape come back in `unplaced`. */
export function buildBike(spec: BikeSpec, frameColor: number): { root: THREE.Group; slots: Slot[]; unplaced: PartRef[] } {
    const root = new THREE.Group();
    root.add(frame(spec, frameColor));
    const slots: Slot[] = [];
    const unplaced: PartRef[] = [];
    const used = new Set<string>();
    for (const p of spec.parts) {
        let kind = slotKind(p.ref);
        if (kind === "discbrakes" && !spec.disc) kind = undefined;
        if (kind === "rimbrakes" && spec.disc) kind = undefined;
        if (!kind || used.has(kind)) { unplaced.push(p); continue; }
        const shape = partShape(kind);
        if (!shape) { unplaced.push(p); continue; }
        used.add(kind);
        const group = new THREE.Group();
        group.name = p.ref;
        for (const m of shape.meshes) { m.userData.ref = p.ref; group.add(m); }
        root.add(group);
        slots.push({ ref: p.ref, label: p.label, role: p.role, group, home: group.position.clone(), explode: shape.explode, meshes: shape.meshes });
    }
    return { root, slots, unplaced };
}
