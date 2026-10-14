/**
 * How tall a frame's content runs, or null when it has no bottom of its own (a
 * viewport-sized app that does not scroll). The shim answers the canvas's
 * content-size ask with it, and the photo booth runs the same function in its
 * isolated world for the content height `spool shot` reports, so the two never
 * disagree.
 *
 * Read the page, not #root: spool's root always fills the viewport. A
 * viewport-sized app has no independent bottom unless a full-height column
 * scrolls: then its content says where resizing can make scrolling stop.
 * Fixed overlays and fixed-size scrolling panels do not extend the page.
 */
export function contentHeight(): number | null {
	const root = document.getElementById("root");
	if (!root) return null;
	let scrollBottom = 0;
	function scrollingBottom(el: Element, rect: DOMRect, style: CSSStyleDeclaration): void {
		if (style.overflowY !== "auto" && style.overflowY !== "scroll") return;
		if (Math.abs(rect.top + scrollY) > 1 || Math.abs(rect.bottom + scrollY - innerHeight) > 1) return;
		const height = String(el.computedStyleMap().get("height"));
		if (height !== "auto" && !height.includes("%")) return;
		// scrollHeight is at least clientHeight, so it forgets the content's
		// end once the frame is taller. Read the laid-out content instead,
		// in scroll coordinates, leaving stretched decorations out of it.
		let end = 0;
		for (const child of el.children) {
			const childStyle = getComputedStyle(child);
			if (childStyle.position === "absolute" || childStyle.position === "fixed") continue;
			// A child sized against the scroller follows every resize rather
			// than supplying an independent content bottom.
			const size = child.computedStyleMap();
			if (
				String(size.get("height")).includes("%") ||
				String(size.get("min-height")).includes("%") ||
				parseFloat(childStyle.flexGrow) > 0
			)
				continue;
			const bottom = bottomOf(child);
			if (!(bottom > 0)) continue;
			end = Math.max(
				end,
				bottom - (rect.top + scrollY + el.clientTop) + el.scrollTop + (parseFloat(childStyle.marginBottom) || 0),
			);
		}
		if (end > 0)
			scrollBottom = Math.max(
				scrollBottom,
				innerHeight - el.clientHeight + end + (parseFloat(style.paddingBottom) || 0),
			);
	}
	function bottomOf(el: Element): number {
		const style = getComputedStyle(el);
		if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") return 0;
		const rect = el.getBoundingClientRect();
		let bottom = rect.width > 0 || rect.height > 0 ? rect.bottom + scrollY : 0;
		if (style.overflowY === "visible" || style.overflowY === "") {
			for (const child of el.children) bottom = Math.max(bottom, bottomOf(child));
		} else scrollingBottom(el, rect, style);
		return bottom;
	}
	let bottom = 0;
	let fillsViewport = false;
	for (const child of root.children) {
		const childBottom = bottomOf(child);
		if (!(childBottom > 0)) continue;
		bottom = Math.max(bottom, childBottom);
		const rect = child.getBoundingClientRect();
		const style = child.computedStyleMap();
		const height = String(style.get("height"));
		const minHeight = String(style.get("min-height"));
		if (
			Math.abs(rect.bottom + scrollY - innerHeight) <= 1 &&
			(height !== "auto" || minHeight.includes("%") || parseFloat(minHeight) >= innerHeight)
		)
			fillsViewport = true;
	}
	if (fillsViewport && Math.abs(bottom - innerHeight) <= 1) return scrollBottom > 0 ? Math.ceil(scrollBottom) : null;
	if (!(bottom > 0)) return null;
	return Math.ceil(bottom);
}
