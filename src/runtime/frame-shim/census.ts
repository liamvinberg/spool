/**
 * What a frame is doing while the photo booth times it (spool#318), counted
 * from the booth's isolated world of its tab, where the document is shared and
 * every global is native. These are facts about the frame's code: what runs and
 * how big it is, not how long anything took, so `spool check` can say why a
 * frame the booth timed slow is slow. The two the isolated world cannot see,
 * the frame's own requestAnimationFrame callbacks and its WebGL contexts, the
 * shim counts in the frame's world (`frameWork`).
 */

/** Running animations that animate the same properties, and whether they ever end. */
export interface AnimatedGroup {
	/** CSS property names, sorted. */
	properties: string[];
	/** How many elements run one of them. */
	elements: number;
	/** Whether they repeat for ever. */
	endless: boolean;
}

/** A picture or canvas: its own pixels, and the CSS pixels it is drawn over. */
export interface Drawn {
	width: number;
	height: number;
	drawnWidth: number;
	drawnHeight: number;
}

export interface Census {
	elements: number;
	animations: AnimatedGroup[];
	/** Canvases in the document. */
	canvasCount: number;
	/** The largest of them, largest first. */
	canvases: Drawn[];
	/** Videos playing. */
	videos: number;
	/** Images with far more pixels than the density they are drawn at shows, alike ones counted together. */
	oversized: (Drawn & { count: number })[];
}

/** More pixels than this many times what the image is drawn over, at the document's density, is far larger. */
const OVERSIZED_RATIO = 4;
/** An image smaller than this is no cost worth naming, however small it is drawn. */
const OVERSIZED_LEAST = 1_000_000;
/** The most of each list a census keeps: enough to name the worst. */
const KEPT = 8;

const NOT_PROPERTIES = new Set(["offset", "computedOffset", "easing", "composite"]);

const kebab = (name: string) => (name.startsWith("--") ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

export function census(): Census {
	// a transition is one animation per property, so what an element animates is gathered first
	const byElement = new Map<Element, { properties: Set<string>; endless: boolean }[]>();
	let animations: Animation[] = [];
	try {
		animations = document.getAnimations();
	} catch {}
	for (const animation of animations) {
		if (animation.playState !== "running") continue;
		const effect = animation.effect;
		if (!(effect instanceof KeyframeEffect) || effect.target === null) continue;
		let endless = false;
		try {
			endless = effect.getComputedTiming().iterations === Number.POSITIVE_INFINITY;
		} catch {}
		const runs = byElement.get(effect.target) ?? [];
		byElement.set(effect.target, runs);
		let run = runs.find((each) => each.endless === endless);
		if (run === undefined) {
			run = { properties: new Set<string>(), endless };
			runs.push(run);
		}
		// an animation whose keyframes say no property (as one of a registered custom property may) still runs
		try {
			for (const frame of effect.getKeyframes())
				for (const key of Object.keys(frame)) if (!NOT_PROPERTIES.has(key)) run.properties.add(kebab(key));
		} catch {}
	}
	const groups = new Map<string, AnimatedGroup>();
	for (const runs of byElement.values()) {
		for (const { properties, endless } of runs) {
			const sorted = [...properties].sort();
			const key = `${endless}:${sorted.join(",")}`;
			const group = groups.get(key) ?? { properties: sorted, elements: 0, endless };
			group.elements++;
			groups.set(key, group);
		}
	}
	const dpr = window.devicePixelRatio || 1;
	const canvases: Drawn[] = [];
	for (const canvas of document.querySelectorAll("canvas")) {
		const { width, height } = canvas.getBoundingClientRect();
		canvases.push({
			width: canvas.width,
			height: canvas.height,
			drawnWidth: Math.round(width),
			drawnHeight: Math.round(height),
		});
	}
	const oversized = new Map<string, Drawn & { count: number }>();
	for (const image of document.images) {
		const pixels = image.naturalWidth * image.naturalHeight;
		if (pixels < OVERSIZED_LEAST) continue;
		const { width, height } = image.getBoundingClientRect();
		if (width === 0 || height === 0) continue;
		if (pixels <= OVERSIZED_RATIO * width * height * dpr * dpr) continue;
		const drawn = {
			width: image.naturalWidth,
			height: image.naturalHeight,
			drawnWidth: Math.round(width),
			drawnHeight: Math.round(height),
		};
		const key = `${drawn.width}x${drawn.height}@${drawn.drawnWidth}x${drawn.drawnHeight}`;
		const alike = oversized.get(key);
		if (alike === undefined) oversized.set(key, { ...drawn, count: 1 });
		else alike.count++;
	}
	const bigFirst = (a: Drawn, b: Drawn) => b.width * b.height - a.width * a.height;
	let videos = 0;
	for (const video of document.querySelectorAll("video")) if (!video.paused && !video.ended) videos++;
	return {
		elements: document.getElementsByTagName("*").length,
		animations: [...groups.values()],
		canvasCount: canvases.length,
		canvases: canvases.sort(bigFirst).slice(0, KEPT),
		videos,
		oversized: [...oversized.values()].sort(bigFirst).slice(0, KEPT),
	};
}
