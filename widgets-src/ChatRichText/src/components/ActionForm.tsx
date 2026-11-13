import { FormEvent, ReactElement, useEffect, useId, useState } from "react";
import { CardAction } from "./segments";
import { getJson, postJson } from "./appApi";

// A button on a card that opens a small form in the card. The AI proposed the
// action and pre-filled it; the user checks it, fills in the rest and submits.
// The app (POST rest/chatactions/v1/actions) runs a fixed microflow per action
// with the user's own permissions and says what happened.

const REASONS = ["Never used", "Wrong size or model", "Arrived damaged", "Stopped working", "Changed my mind", "Other"];

interface Result { ok?: boolean; message?: string }
interface Slot { start: string; label: string }

export function ActionButtons({ actions }: { actions: CardAction[] }): ReactElement {
    const [open, setOpen] = useState<number | undefined>();
    return (
        <div className="crt-actions">
            <div className="crt-action-buttons">
                {actions.map((a, i) => (
                    <button type="button" key={i} className={`crt-action-btn${open === i ? " crt-action-btn-on" : ""}`} aria-expanded={open === i}
                        onClick={() => setOpen(o => (o === i ? undefined : i))}>{a.label}</button>
                ))}
            </div>
            {open !== undefined && <ActionForm key={open} action={actions[open]} onCancel={() => setOpen(undefined)} />}
        </div>
    );
}

function ActionForm({ action, onCancel }: { action: CardAction; onCancel: () => void }): ReactElement {
    const id = useId();
    const v = action.values;
    const [item, setItem] = useState(v.item ?? "");
    const [reason, setReason] = useState(REASONS.find(r => r.toLowerCase() === (v.reason ?? "").toLowerCase()) ?? (action.action === "return" ? REASONS[0] : v.reason ?? ""));
    const [details, setDetails] = useState(v.details ?? "");
    const [subject, setSubject] = useState(v.subject ?? "");
    const [description, setDescription] = useState(v.description ?? "");
    const [slots, setSlots] = useState<Slot[] | null>(null);
    const [slot, setSlot] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<Result | null>(null);

    useEffect(() => {
        if (action.action !== "appointment") return;
        getJson<{ slots?: Slot[] }>("rest/chatactions/v1/slots")
            .then(d => { const s = d.slots ?? []; setSlots(s); if (s.length) setSlot(s[0].start); })
            .catch(() => setSlots([]));
    }, [action.action]);

    const submit = (e: FormEvent): void => {
        e.preventDefault();
        setBusy(true);
        postJson<Result>("rest/chatactions/v1/actions", {
            action: action.action, ref: action.ref, item, reason, details, subject, description,
            slotStart: slot || undefined, product: v.product ?? "", photo: v.photo ?? ""
        })
            .then(r => setResult(r))
            .catch((err: Error) => setResult({ ok: false, message: err.message }))
            .finally(() => setBusy(false));
    };

    if (result?.ok) {
        return <p className="crt-action-result crt-action-ok" role="status">{result.message}</p>;
    }
    return (
        <form className="crt-action-form" onSubmit={submit} aria-label={action.label}>
            <p className="crt-action-for">{action.action === "appointment" ? "Workshop appointment" : action.action === "ticket" ? "New ticket" : "Return"} · order {action.ref}</p>
            {action.action === "return" && (
                <>
                    <label htmlFor={`${id}-item`}>Item</label>
                    <input id={`${id}-item`} value={item} onChange={e => setItem(e.target.value)} required maxLength={500} />
                    <label htmlFor={`${id}-reason`}>Reason</label>
                    <select id={`${id}-reason`} value={reason} onChange={e => setReason(e.target.value)}>
                        {REASONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <label htmlFor={`${id}-details`}>Anything else? <span>(optional)</span></label>
                    <textarea id={`${id}-details`} value={details} onChange={e => setDetails(e.target.value)} rows={2} maxLength={4000} />
                </>
            )}
            {action.action === "ticket" && (
                <>
                    <label htmlFor={`${id}-subject`}>Subject</label>
                    <input id={`${id}-subject`} value={subject} onChange={e => setSubject(e.target.value)} required maxLength={200} />
                    <label htmlFor={`${id}-desc`}>What happened?</label>
                    <textarea id={`${id}-desc`} value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={4000} />
                </>
            )}
            {action.action === "appointment" && (
                <>
                    <label htmlFor={`${id}-slot`}>Time</label>
                    {slots === null ? <p className="crt-action-note">Loading free times…</p> : slots.length === 0 ? <p className="crt-action-note">No free times in the next two weeks.</p> : (
                        <select id={`${id}-slot`} value={slot} onChange={e => setSlot(e.target.value)}>
                            {slots.map(s => <option key={s.start} value={s.start}>{s.label}</option>)}
                        </select>
                    )}
                    <label htmlFor={`${id}-why`}>Reason</label>
                    <input id={`${id}-why`} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
                </>
            )}
            {result && !result.ok && <p className="crt-action-result crt-action-err" role="alert">{result.message}</p>}
            <div className="crt-action-row">
                <button type="submit" className="crt-action-submit" disabled={busy || (action.action === "appointment" && !slot)}>{busy ? "Sending…" : action.label}</button>
                <button type="button" className="crt-action-cancel" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}
