/**
 * A slide's last picture, kept when it breaks on screen (spool#265): the room goes on showing what the slide showed,
 * as a still copy of its document, never an error. A copy is made the moment React gives up on the slide, while its
 * last picture is still the document: elements cloned, canvases drawn across, form fields and scrolls carried, and
 * every animation stopped where it stood.
 */

import { webglOf } from "./stage-webgl";

/** What became of the slide's canvases in the copy. */
export type KeptCanvases = "all" | "without-webgl";

export interface KeptPicture {
	readonly nodes: readonly Node[];
	readonly canvases: KeptCanvases;
	/** puts back what only exists once the copy is in the document: scroll positions */
	readonly placed: () => void;
}

/** A still copy of everything `box` holds, made while it still shows the slide's last picture. */
export function keepPicture(box: Element): KeptPicture {
	const originals = [...box.childNodes];
	const nodes = originals.map((node) => node.cloneNode(true));
	const from: Element[] = [];
	const to: Element[] = [];
	originals.forEach((node, index) => {
		const copy = nodes[index];
		if (node instanceof Element && copy instanceof Element) pair(node, copy, from, to);
	});
	let canvases: KeptCanvases = "all";
	const scrolls: [Element, number, number][] = [];
	const frozen = new Map<Element, Map<string, string>>();
	for (const animation of box.getAnimations({ subtree: true })) {
		const effect = animation.effect;
		if (!(effect instanceof KeyframeEffect) || effect.target === null || effect.pseudoElement !== null) continue;
		const properties = frozen.get(effect.target) ?? new Map<string, string>();
		const computed = getComputedStyle(effect.target);
		for (const frame of effect.getKeyframes()) {
			for (const key of Object.keys(frame)) {
				if (key === "offset" || key === "computedOffset" || key === "easing" || key === "composite") continue;
				const property =
					key === "cssFloat" ? "float" : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
				properties.set(property, computed.getPropertyValue(property));
			}
		}
		frozen.set(effect.target, properties);
	}
	from.forEach((original, index) => {
		const copy = to[index];
		if (copy === undefined) return;
		if (original instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
			if (!copyCanvas(original, copy)) canvases = "without-webgl";
		} else if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
			copy.value = original.value;
			copy.checked = original.checked;
		} else if (original instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
			copy.value = original.value;
		} else if (original instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
			copy.selectedIndex = original.selectedIndex;
		}
		if (original.scrollTop !== 0 || original.scrollLeft !== 0)
			scrolls.push([copy, original.scrollTop, original.scrollLeft]);
		const properties = frozen.get(original);
		if (copy instanceof HTMLElement || copy instanceof SVGElement) {
			// a still copy plays nothing: what is moving stops where it stood
			if (properties !== undefined)
				for (const [property, value] of properties) copy.style.setProperty(property, value);
			copy.style.setProperty("animation", "none", "important");
			copy.style.setProperty("transition", "none", "important");
		}
		if (copy instanceof HTMLMediaElement) copy.autoplay = false;
	});
	return {
		nodes,
		canvases,
		placed: () => {
			for (const [element, top, left] of scrolls) {
				element.scrollTop = top;
				element.scrollLeft = left;
			}
		},
	};
}

/** The original and its copy, element by element, in the same order. */
function pair(original: Element, copy: Element, from: Element[], to: Element[]): void {
	from.push(original);
	to.push(copy);
	const a = original.children;
	const b = copy.children;
	for (let index = 0; index < a.length; index++) {
		const left = a[index];
		const right = b[index];
		if (left !== undefined && right !== undefined) pair(left, right, from, to);
	}
}

/** Draws a canvas into its copy; false when what it showed cannot be read back. */
function copyCanvas(original: HTMLCanvasElement, copy: HTMLCanvasElement): boolean {
	copy.width = original.width;
	copy.height = original.height;
	const gl = webglOf(original);
	if (gl?.isContextLost() === true) return false;
	const preserved = gl === undefined || gl.getContextAttributes()?.preserveDrawingBuffer === true;
	try {
		copy.getContext("2d")?.drawImage(original, 0, 0);
	} catch {
		return false;
	}
	return preserved;
}
