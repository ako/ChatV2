import { ReactElement, useState } from "react";
import { ModelPreviewContainerProps } from "../typings/ModelPreviewProps";
import { ModelView } from "./shared/model/ModelView";

// The catalog workspace's 3D preview (mdlsource/27-catalog-workspace.mdl): the
// shared bike viewer bound to page data. The bike, the highlighted parts and a
// version come from expressions; when the version changes (the catalog manager
// saved a slot, BOM line or shape), the model is fetched again and redrawn.

export function ModelPreview(props: ModelPreviewContainerProps): ReactElement {
    // fetched fresh for every page visit: a saved part shape changes the bike too
    const [opened] = useState(() => String(Date.now()));
    const ref = props.bikeRef.status === "available" ? props.bikeRef.value ?? "" : "";
    const highlight = props.highlight?.status === "available" && props.highlight.value
        ? props.highlight.value.split(",").map(s => s.trim()).filter(Boolean) : [];
    const version = `${opened}|${props.version?.status === "available" ? props.version.value ?? "" : ""}`;
    if (!ref) return <p className="mv-note">Choose a bike to preview.</p>;
    return <div className={props.class}><ModelView key={`${ref}|${version}`} productRef={ref} version={version} highlight={highlight} height={props.height} /></div>;
}
