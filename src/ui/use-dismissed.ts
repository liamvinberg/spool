import { type RefObject, useEffect, useRef } from "react";

/** A menu open under its button closes on a press anywhere else, or on Esc. The element holding both. */
export function useDismissed(open: boolean, close: () => void): RefObject<HTMLSpanElement | null> {
	const held = useRef<HTMLSpanElement>(null);
	const latest = useRef(close);
	latest.current = close;
	useEffect(() => {
		if (!open) return;
		const away = (event: PointerEvent) => {
			if (event.target instanceof Node && held.current?.contains(event.target)) return;
			latest.current();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			latest.current();
		};
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key, true);
		return () => {
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [open]);
	return held;
}
