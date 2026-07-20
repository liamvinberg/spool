// Instrumented srcdoc per frame, computed once at module load so React renders
// never rebuild them (a changed srcDoc attribute = full iframe reload).

import { sceneFrames } from "./scene";
import { instrument } from "./screens";

export const DOCS: Record<string, string> = Object.fromEntries(
	sceneFrames.map((f) => [f.id, instrument(f.kind, f.id)]),
);
