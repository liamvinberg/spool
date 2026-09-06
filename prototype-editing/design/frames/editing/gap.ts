export type GapProperty = "column-gap" | "row-gap";
export type Spacing = { name: string; css: string; px: number };
export type GapBand = { left: number; top: number; width: number; height: number };
export const rounded = (n: number) => Number(n.toFixed(2));
export function gapProperty(style: CSSStyleDeclaration): GapProperty | null {
	return ["flex", "inline-flex"].includes(style.display)
		? style.flexDirection.startsWith("row")
			? "column-gap"
			: "row-gap"
		: null;
}
export function gapBinding(node: HTMLElement, property: GapProperty) {
	const authored = node.style.getPropertyValue(property);
	// Relative values need an explicit detach too. Never infer a binding from pixels.
	return authored && !/^\d*\.?\d+px$/.test(authored) && authored !== "normal" ? authored : null;
}

// This prototype discovers the fixture's live variables. The product will use
// the compiled project theme, including tokens not emitted into this page.
export function spacingChoices(node: HTMLElement): Spacing[] {
	const style = getComputedStyle(node);
	const names = [...style].filter((name) => name.startsWith("--spacing-")).sort();
	const candidates = names.map((name) => ({ name: name.slice(2), css: `var(${name})` }));
	if (style.getPropertyValue("--spacing").trim()) {
		for (const step of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24])
			candidates.push({ name: `spacing-${step}`, css: `calc(var(--spacing) * ${step})` });
	}
	const probe = document.createElement("span");
	probe.style.cssText =
		"position:absolute!important;visibility:hidden!important;pointer-events:none!important;height:0!important;min-width:0!important;max-width:none!important;padding:0!important;border:0!important;";
	node.append(probe);
	try {
		return candidates.flatMap((item) => {
			probe.style.setProperty("width", item.css, "important");
			const resolved = getComputedStyle(probe).width;
			const px = Number.parseFloat(resolved);
			return resolved.endsWith("px") && Number.isFinite(px) && px >= 0 ? [{ ...item, px: rounded(px) }] : [];
		});
	} finally {
		probe.remove();
	}
}

// Only literal gaps get a target. Distributed space, margins, wrapped lines,
// anonymous flex items and transformed layouts remain editable in the rail.
export function gapBands(node: HTMLElement, stage: HTMLElement, zoom: number): GapBand[] {
	const style = getComputedStyle(node);
	const property = gapProperty(style);
	if (
		!property ||
		style.flexWrap !== "nowrap" ||
		style.writingMode !== "horizontal-tb" ||
		style.justifyContent.startsWith("space-")
	)
		return [];
	if ([...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) return [];
	for (const pseudo of ["::before", "::after"]) {
		const content = getComputedStyle(node, pseudo).content;
		if (content !== "none" && content !== "normal") return [];
	}
	let ancestor: HTMLElement | null = node;
	while (ancestor && ancestor !== stage) {
		const ancestorStyle = getComputedStyle(ancestor);
		if (ancestorStyle.transform !== "none" || ancestorStyle.rotate !== "none" || ancestorStyle.scale !== "none")
			return [];
		ancestor = ancestor.parentElement;
	}
	const horizontal = property === "column-gap";
	const resolved = style.getPropertyValue(property);
	if (!resolved.endsWith("px")) return [];
	const value = Number.parseFloat(resolved);
	if (!Number.isFinite(value) || value * zoom < 6) return [];
	const boxes: DOMRect[] = [];
	for (const child of node.children) {
		if (!(child instanceof HTMLElement || child instanceof SVGElement)) return [];
		const cs = getComputedStyle(child);
		if (cs.display === "none" || ["absolute", "fixed"].includes(cs.position)) continue;
		if (
			cs.display === "contents" ||
			cs.visibility !== "visible" ||
			cs.transform !== "none" ||
			cs.translate !== "none" ||
			cs.rotate !== "none" ||
			cs.scale !== "none"
		)
			return [];
		if ((horizontal ? [cs.marginLeft, cs.marginRight] : [cs.marginTop, cs.marginBottom]).some((m) => m !== "0px"))
			return [];
		boxes.push(child.getBoundingClientRect());
	}
	boxes.sort((a, b) => (horizontal ? a.left - b.left : a.top - b.top));
	const origin = stage.getBoundingClientRect();
	const bands: GapBand[] = [];
	for (let i = 1; i < boxes.length; i++) {
		const a = boxes[i - 1];
		const b = boxes[i];
		if (!a || !b) continue;
		const start = horizontal ? a.right : a.bottom;
		const end = horizontal ? b.left : b.top;
		if (Math.abs(end - start - value * zoom) > 0.75) return [];
		const crossStart = Math.max(horizontal ? a.top : a.left, horizontal ? b.top : b.left);
		const crossEnd = Math.min(horizontal ? a.bottom : a.right, horizontal ? b.bottom : b.right);
		if (crossEnd - crossStart < 12) continue;
		bands.push(
			horizontal
				? {
						left: start - origin.left,
						top: crossStart - origin.top,
						width: end - start,
						height: crossEnd - crossStart,
					}
				: {
						left: crossStart - origin.left,
						top: start - origin.top,
						width: crossEnd - crossStart,
						height: end - start,
					},
		);
	}
	return bands;
}

export function gapValue(px: number, binding: string | null, choices: Spacing[]) {
	if (!binding) return `${rounded(Math.max(0, px))}px`;
	// Keep linked scrubbing on the same scale, or among authored named tokens.
	const current = choices.find((item) => item.css === binding);
	if (!current) return binding;
	const scale = binding.startsWith("calc(");
	const options = choices.filter((item) => item.css.startsWith("calc(") === scale);
	return options.reduce((best, item) => (Math.abs(item.px - px) < Math.abs(best.px - px) ? item : best), current).css;
}
