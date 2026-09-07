import type { Spacing } from "../reference/frames/editing/gap";

// Read token metadata outside the zoomed canvas. Chrome quantizes layout inside
// CSS zoom, which made a declared 8px token read as 7.99px in the old picker.
// This affects the menu's measurement only. The declaration stays a reference.
export function spacingChoices(node: HTMLElement): Spacing[] {
	const style = getComputedStyle(node);
	const candidates = [...style]
		.filter((name) => name.startsWith("--spacing-"))
		.sort()
		.map((name) => ({ name: name.slice(2), css: `var(${name})` }));
	if (style.getPropertyValue("--spacing").trim()) {
		for (const step of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24])
			candidates.push({ name: `spacing-${step}`, css: `calc(var(--spacing) * ${step})` });
	}
	const probe = document.createElement("span");
	probe.style.cssText =
		"position:fixed;visibility:hidden;pointer-events:none;height:0;min-width:0;max-width:none;padding:0;border:0;zoom:1;";
	for (const name of style) if (name.startsWith("--")) probe.style.setProperty(name, style.getPropertyValue(name));
	probe.style.fontSize = style.fontSize;
	document.body.append(probe);
	try {
		return candidates.flatMap((item) => {
			probe.style.width = item.css;
			const resolved = getComputedStyle(probe).width;
			const px = Number.parseFloat(resolved);
			return resolved.endsWith("px") && Number.isFinite(px) && px >= 0 ? [{ ...item, px }] : [];
		});
	} finally {
		probe.remove();
	}
}
