import { ReactElement, useEffect, useState } from "react";
import { Citation } from "./segments";
import { getJson } from "./appApi";

// Citations under an answer: the passage of the policy document that contains
// the quoted words, looked up in the document itself (GET rest/chatactions/v1/
// cite). The quote is marked inside it. A quote the documents do not contain is
// shown as not found: the answer's claim cannot be checked against the policy.

interface Found { found?: boolean; title?: string; passage?: string }

function Marked({ text, quote }: { text: string; quote: string }): ReactElement {
    const norm = (s: string): string => s.replace(/\s+/g, " ");
    const t = norm(text), q = norm(quote).trim();
    const at = t.toLowerCase().indexOf(q.toLowerCase());
    if (at < 0) return <>{t}</>;
    return <>{t.slice(0, at)}<mark>{t.slice(at, at + q.length)}</mark>{t.slice(at + q.length)}</>;
}

function OneCitation({ c }: { c: Citation }): ReactElement {
    const [found, setFound] = useState<Found | null>(null);
    useEffect(() => {
        getJson<Found>(`rest/chatactions/v1/cite?doc=${encodeURIComponent(c.doc)}&quote=${encodeURIComponent(c.quote)}`)
            .then(setFound).catch(() => setFound({ found: false }));
    }, [c.doc, c.quote]);
    if (!found) return <li className="crt-cite crt-cite-loading">Checking the policy…</li>;
    if (!found.found) {
        return <li className="crt-cite crt-cite-missing">“{c.quote}” <span>is not in the policy documents{c.doc ? ` (looked for ${c.doc})` : ""}.</span></li>;
    }
    return (
        <li className="crt-cite">
            <details>
                <summary><span className="crt-cite-source">{found.title}</span> “{c.quote}”</summary>
                <blockquote><Marked text={found.passage ?? ""} quote={c.quote} /></blockquote>
            </details>
        </li>
    );
}

export function CitationList({ citations }: { citations: Citation[] }): ReactElement {
    return (
        <div className="crt-cites">
            <span className="crt-cites-label">From the policy</span>
            <ul>{citations.map((c, i) => <OneCitation key={i} c={c} />)}</ul>
        </div>
    );
}
