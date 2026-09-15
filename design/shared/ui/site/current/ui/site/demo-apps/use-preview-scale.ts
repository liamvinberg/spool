import { useLayoutEffect, useRef } from "react";

/** Measure in layout pixels. Older Safari resolves viewport/container units
 * inside trigonometric CSS expressions as raw numbers rather than lengths. */
export function usePreviewScale(authoredWidth: number) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const host = ref.current;
		if (!host) return;
		const measure = () => {
			const width = host.clientWidth;
			if (width > 0) host.style.setProperty("--preview-scale", String(width / authoredWidth));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(host);
		return () => observer.disconnect();
	}, [authoredWidth]);
	return ref;
}
