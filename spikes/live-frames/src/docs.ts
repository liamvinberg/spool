// Instrumented srcdoc per frame, computed once at module load so React renders
// never rebuild them (a changed srcDoc attribute = full iframe reload).
//
// Two variants share the map: vanilla (the #8 baseline) and react (#17), picked
// by ?frames=react at page load. Node importers (playwright-shots) get vanilla.

import { reactDoc } from "./docs-react";
import { sceneFrames } from "./scene";
import { instrument } from "./screens";

export type FrameVariant = "vanilla" | "react";

export const VARIANT: FrameVariant =
	typeof location !== "undefined" && new URLSearchParams(location.search).get("frames") === "react"
		? "react"
		: "vanilla";

export const DOCS: Record<string, string> = Object.fromEntries(
	sceneFrames.map((f) => [f.id, VARIANT === "react" ? reactDoc(f.kind, f.id) : instrument(f.kind, f.id)]),
);
