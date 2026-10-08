import { useEffect, useRef, useState } from "react";
import { useStillness } from "./stillness";

/**
 * How long a float or a fade takes to leave, matching `--animate-agent-float-out`,
 * `--animate-agent-drop-out` and `--animate-agent-fade-out` in `ui.css` (#364).
 */
export const FLOAT_OUT_MS = 120;
export const FADE_OUT_MS = 160;

/**
 * Whether something that comes and goes is drawn, and how (#364).
 *
 * Nothing in the rail shows or hides in one frame: a thing that is asked to go stays
 * mounted for its exit, drawn `leaving`, and only then unmounts. A thing asked back while
 * it leaves is simply `open` again. Null is gone. Where stillness was asked for the exit
 * is a cut, so it goes at once.
 */
export function useLeaving(open: boolean, ms: number = FLOAT_OUT_MS): "open" | "leaving" | null {
	const still = useStillness();
	const [leaving, setLeaving] = useState(false);
	const was = useRef(open);
	useEffect(() => {
		const before = was.current;
		was.current = open;
		if (open || !before || still) {
			setLeaving(false);
			return;
		}
		setLeaving(true);
		const timer = setTimeout(() => setLeaving(false), ms);
		return () => clearTimeout(timer);
	}, [open, ms, still]);
	if (open) return "open";
	if (still) return null;
	// the frame the close lands on is already the first frame of the exit
	return leaving || was.current ? "leaving" : null;
}

/**
 * The last value something showed, kept while it leaves: a list or a popover on its way
 * out draws what it held rather than going blank under the exit.
 */
export function useHeld<T>(value: T | null | undefined): T | null {
	const held = useRef<T | null>(null);
	if (value !== null && value !== undefined) held.current = value;
	return held.current;
}
