import { shimConfig } from "./natives";

/**
 * A pointer trap is the same failure as a zoom trap: entered, the frame owns
 * every press, so the canvas would have no way to pan out from under it. The
 * middle button is the one gesture no app binds, so it stays the canvas's.
 * Screen coordinates travel: the host only ever wants the delta.
 */
let panning = false;

export function relayMiddlePan(): void {
	addEventListener(
		"pointerdown",
		(event) => {
			if (window.parent === window || event.button !== 1) return;
			event.preventDefault();
			panning = true;
			window.parent.postMessage(
				{ spool: "pan", frame: shimConfig().frame, phase: "start", x: event.screenX, y: event.screenY },
				"*",
			);
		},
		true,
	);

	addEventListener(
		"pointermove",
		(event) => {
			if (!panning) return;
			window.parent.postMessage(
				{ spool: "pan", frame: shimConfig().frame, phase: "move", x: event.screenX, y: event.screenY },
				"*",
			);
		},
		true,
	);

	const endPan = (): void => {
		if (!panning) return;
		panning = false;
		window.parent.postMessage({ spool: "pan", frame: shimConfig().frame, phase: "end", x: 0, y: 0 }, "*");
	};
	addEventListener("pointerup", endPan, true);
	addEventListener("pointercancel", endPan, true);
}
