import { type Box, correction, type Request, type Size, type Target, truthful } from "./geometry";

const targetIds = new WeakMap<Element, string>();
let nextTarget = 0;
function identity(el: Element) {
	let id = targetIds.get(el);
	if (!id) {
		id = `node-${++nextTarget}`;
		targetIds.set(el, id);
	}
	return id;
}
const box = (el: Element): Box => {
	const r = el.getBoundingClientRect();
	return { x: r.x, y: r.y, w: r.width, h: r.height };
};
export function scales(el: HTMLElement): Size {
	let w = 1,
		h = 1;
	for (let node: HTMLElement | null = el; node; node = node.parentElement) {
		const s = getComputedStyle(node);
		const zoom = Number.parseFloat(s.zoom) || 1;
		w *= zoom;
		h *= zoom;
		if (s.perspective !== "none" || s.rotate !== "none" || s.scale !== "none" || s.translate !== "none")
			throw new Error("individual/3d transform unsupported");
		if (s.transform !== "none") {
			const m = new DOMMatrixReadOnly(s.transform);
			if (!m.is2D || m.b !== 0 || m.c !== 0 || m.a <= 0 || m.d <= 0)
				throw new Error("rotation/skew/reflection unsupported");
			w *= m.a;
			h *= m.d;
		}
		if (s.writingMode !== "horizontal-tb") throw new Error("vertical writing unsupported");
	}
	return { w, h };
}
/** Same document, immediate rendered siblings and immediate parent only. Hidden,
 * fragmented, fixed-position, transformed non-axis-aligned targets are excluded. */
export function collect(el: HTMLElement): Target[] {
	const parent = el.parentElement;
	if (!parent) throw new Error("parent missing");
	const targets: Target[] = [];
	for (const sibling of parent.children) {
		if (sibling === el || !(sibling instanceof HTMLElement) || sibling.getClientRects().length !== 1) continue;
		const css = getComputedStyle(sibling);
		if (css.visibility !== "visible" || css.position === "fixed") continue;
		try {
			scales(sibling);
		} catch {
			continue;
		}
		const b = box(sibling);
		if (b.w > 0 && b.h > 0) targets.push({ id: identity(sibling), label: sibling.id || "sibling", box: b });
	}
	const css = getComputedStyle(parent),
		b = box(parent),
		scale = scales(parent);
	const bl = parseFloat(css.borderLeftWidth),
		br = parseFloat(css.borderRightWidth),
		bt = parseFloat(css.borderTopWidth),
		bb = parseFloat(css.borderBottomWidth),
		pl = parseFloat(css.paddingLeft),
		pr = parseFloat(css.paddingRight),
		pt = parseFloat(css.paddingTop),
		pb = parseFloat(css.paddingBottom);
	// offset/client dimensions are both rounded. Their difference preserves an
	// integral native border+scrollbar reservation, but must never supply the
	// fractional content size itself. Visible/clip axes reserve no scrollbar.
	const gutter = (axis: "x" | "y", borders: number) => {
		const overflow = axis === "x" ? css.overflowX : css.overflowY;
		if (overflow === "visible" || overflow === "clip") return 0;
		if (!Number.isInteger(borders)) return undefined;
		return Math.max(
			0,
			(axis === "x" ? parent.offsetHeight - parent.clientHeight : parent.offsetWidth - parent.clientWidth) - borders,
		);
	};
	const gx = gutter("y", bl + br),
		gy = gutter("x", bt + bb);
	if (gx === undefined || gy === undefined) return targets;
	const width = parseFloat(css.width) - (css.boxSizing === "border-box" ? bl + br + pl + pr + gx : 0),
		height = parseFloat(css.height) - (css.boxSizing === "border-box" ? bt + bb + pt + pb + gy : 0);
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		Math.abs(width + bl + br + pl + pr + gx - b.w / scale.w) > 0.02 ||
		Math.abs(height + bt + bb + pt + pb + gy - b.h / scale.h) > 0.02
	)
		return targets;
	if ((gx > 0 && !Number.isInteger(bl)) || (gy > 0 && !Number.isInteger(bt))) return targets;
	const left = bl + pl + (gx > 0 ? parent.clientLeft - bl : 0),
		top = bt + pt + (gy > 0 ? parent.clientTop - bt : 0);
	targets.push({
		id: identity(parent),
		label: "container-content",
		box: {
			x: b.x + (left - parent.scrollLeft) * scale.w,
			y: b.y + (top - parent.scrollTop) * scale.h,
			w: width * scale.w,
			h: height * scale.h,
		},
	});
	return targets;
}
export function measure(el: HTMLElement) {
	return box(el);
}
export function authoredSize(el: HTMLElement): Size {
	const s = getComputedStyle(el);
	return { w: parseFloat(s.width), h: parseFloat(s.height) };
}
export function borderToAuthored(el: HTMLElement, w: number, h: number): Size {
	const s = getComputedStyle(el),
		scale = scales(el);
	return {
		w:
			w / scale.w -
			(s.boxSizing === "content-box"
				? parseFloat(s.paddingLeft) +
					parseFloat(s.paddingRight) +
					parseFloat(s.borderLeftWidth) +
					parseFloat(s.borderRightWidth)
				: 0),
		h:
			h / scale.h -
			(s.boxSizing === "content-box"
				? parseFloat(s.paddingTop) +
					parseFloat(s.paddingBottom) +
					parseFloat(s.borderTopWidth) +
					parseFloat(s.borderBottomWidth)
				: 0),
	};
}
export interface Port {
	apply(size: Size): void;
}
/** No persistent snap feedback: each sample starts from the unsnapped pointer intent.
 * One 1px sensitivity sample and one candidate application; failed layout returns
 * to raw intent. This is a bounded trial, never a converging CSS solver. */
export function step(el: HTMLElement, raw: Size, request: Request, port: Port) {
	const began = performance.now();
	const scale = scales(el);
	if (el.getClientRects().length !== 1) throw new Error("fragmented selection unsupported");
	port.apply(raw);
	const baseline = box(el),
		targets = collect(el);
	port.apply({ w: raw.w + (request.sx ? 1 : 0), h: raw.h + (request.sy ? 1 : 0) });
	const shifted = box(el);
	const e = (b: Box, axis: "x" | "y", sign: number) =>
		axis === "x" ? b.x + (sign > 0 ? b.w : 0) : b.y + (sign > 0 ? b.h : 0);
	const sensitivity = {
		w: e(shifted, "x", request.sx) - e(baseline, "x", request.sx),
		h: e(shifted, "y", request.sy) - e(baseline, "y", request.sy),
	};
	port.apply(raw);
	const result = correction(baseline, raw, targets, request, sensitivity, scale);
	port.apply(result.size);
	let actual = box(el),
		fresh = collect(el);
	const ratioValid = !request.ratio || Math.abs(actual.w / actual.h - request.ratio) < 0.02;
	const accepted = truthful(result, actual, fresh, request, targets) && ratioValid;
	if (!accepted) {
		port.apply(raw);
		actual = box(el);
		fresh = collect(el);
		result.size = raw;
		result.v = [];
		result.h = [];
	}
	return {
		...result,
		actual,
		targets: fresh,
		originalTargets: targets,
		baseline,
		accepted,
		elapsedMs: performance.now() - began,
	};
}
