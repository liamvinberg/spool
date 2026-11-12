import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";
import { type BeatPace, type FrameCensus, type FramePace, SLOW_PER_SECOND, scanPaces } from "./daemon/thumbs";
import type { Drawn } from "./runtime/frame-shim/census";

/** A frame the photo booth timed below `SLOW_PER_SECOND`, at rest or while one of its beats entered. */
export interface SlowFrame extends FramePace {
	/** The frame's name, its path under design/frames. */
	frame: string;
	/** The frame's entry, relative to the project root. */
	path: string;
	/** Whether it, or a file it imports, changed after it was timed, so the booth owes it a new timing. */
	editedSince: boolean;
}

/**
 * Every frame whose last timing (booth.ts) was slow. Only a running daemon times
 * a frame, after an edit; this reads what it recorded, so the check itself
 * stays offline and a project nobody has opened has nothing to say here.
 * `sourcesOf` names the files a frame imports, by absolute path, whose edits
 * make its timing as old as an edit of its own does.
 */
export function slowFrames(root: string, sourcesOf: (frame: string) => readonly string[] = () => []): SlowFrame[] {
	const designDir = realDesignDir(root);
	const slow: SlowFrame[] = [];
	for (const [frame, { timedAt, ...pace }] of scanPaces(root)) {
		if (!timedSlow(pace)) continue;
		let folder: string;
		try {
			folder = resolveDesignPath(designDir, join(designDir, "frames", frame));
		} catch (error) {
			if (error instanceof DesignBoundaryError) continue;
			throw error;
		}
		const own = lastChange(folder);
		// a pace outliving its frame is of nothing
		if (own === undefined) continue;
		const changed = Math.max(own, ...sourcesOf(frame).map(changedAt));
		slow.push({ ...pace, frame, path: join("design", "frames", frame, "frame.tsx"), editedSince: changed > timedAt });
	}
	return slow.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Whether a timing is slow at rest or as any beat entered. */
function timedSlow(pace: FramePace): boolean {
	return pace.perSecond < SLOW_PER_SECOND || (pace.beats ?? []).some((beat) => beat.perSecond < SLOW_PER_SECOND);
}

/** When any source directly in the frame's folder last changed, or nothing when it is no frame now. */
function lastChange(folder: string): number | undefined {
	try {
		const files = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile());
		if (!files.some((entry) => entry.name === "frame.tsx")) return undefined;
		// the sidecar is where the frame sits on the canvas, which no timing is of
		const sources = files.filter((entry) => entry.name !== "frame.json");
		return Math.max(...sources.map((entry) => statSync(join(folder, entry.name)).mtimeMs));
	} catch {
		return undefined;
	}
}

function changedAt(file: string): number {
	try {
		return statSync(file).mtimeMs;
	} catch {
		return 0;
	}
}

/**
 * The note `spool check` prints for one slow frame: a line for its pace at rest
 * and one for its slowest beat, when each was slow, each followed by what the
 * census says is the likely cause and what to do, one indented line apiece.
 * `slide` is its place in its talk, from 1, for a slide of one.
 */
export function describeSlowFrame(frame: SlowFrame, slide?: number): string {
	const subject: Subject = slide === undefined ? "frame" : "slide";
	const place = slide === undefined ? "" : `slide ${slide}, `;
	const stale = frame.editedSince ? " Timed before its latest edit." : "";
	const lines: string[] = [];
	if (frame.perSecond < SLOW_PER_SECOND) {
		lines.push(
			`${frame.path}: ${place}slow: drew ${rate(frame)} a second ${density(frame.scale)} when last timed (smooth is 60; its longest took ${frame.slowestMs} ms). While it plays it holds back the whole canvas.${stale}`,
			...indented(frame.census, frame.scale, subject),
		);
	}
	const slowBeats = (frame.beats ?? []).filter((beat) => beat.perSecond < SLOW_PER_SECOND);
	const worst = slowBeats.reduce<BeatPace | undefined>(
		(most, beat) => (most === undefined || beat.perSecond < most.perSecond ? beat : most),
		undefined,
	);
	if (worst !== undefined) {
		const others = slowBeats.filter((beat) => beat !== worst).map((beat) => beat.beat + 1);
		const too =
			others.length === 0
				? ""
				: ` ${others.length === 1 ? "Beat" : "Beats"} ${listed(others.map(String))} entered slow too.`;
		lines.push(
			`${frame.path}: ${place}slow while beat ${worst.beat + 1} ("${worst.name}") enters: drew ${rate(worst)} a second ${density(frame.scale)} when last timed (smooth is 60; its longest took ${worst.slowestMs} ms).${too}${stale}`,
			...indented(worst.census, frame.scale, subject),
		);
	}
	return lines.join("\n");
}

const rate = (pace: { perSecond: number }) => (pace.perSecond < 1 ? "under 1 frame" : `${pace.perSecond} frames`);
const density = (scale: number) => (scale === 2 ? "at Retina density" : `at ${scale}x density`);

function indented(census: FrameCensus | undefined, scale: number, subject: Subject): string[] {
	// a timing from before the booth took a census says nothing of why
	if (census === undefined) return [];
	return causesOf(census, scale, subject).map((cause) => `  ${cause}`);
}

type Subject = "slide" | "frame";

/** Properties a browser can animate without laying out or painting again, on the compositor. */
const COMPOSITED = new Set(["transform", "opacity", "translate", "rotate", "scale", "filter"]);
/** Properties that move or size boxes, so animating one lays the page out again every frame. */
const LAYOUT =
	/^(?:(?:min-|max-)?(?:width|height|block-size|inline-size)|top|left|right|bottom|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|border(?:-[a-z]+)*-width|border-width|font-size|font-weight|line-height|letter-spacing|word-spacing|flex(?:-.+)?|grid(?:-.+)?|gap|row-gap|column-gap|aspect-ratio)$/u;

/** Elements in one place hold more than this, and their number is itself a cost worth naming. */
const MANY_ELEMENTS = 3000;
/** How many of a list a cause names before it counts the rest. */
const NAMED = 3;

/**
 * What a census of a frame the booth timed slow says is likely making it slow,
 * and what to do about each, one line apiece, most likely first. A census holds
 * facts about the code (what animates, what loops, how big its pictures are),
 * so each line says what the frame does and what that costs, never that it is
 * certainly why. `scale` is the density it was timed at.
 */
export function causesOf(census: FrameCensus, scale: number, subject: Subject): string[] {
	const causes: string[] = [];
	const layout = animated(census, (property) => LAYOUT.test(property));
	const paint = animated(
		census,
		(property) => !property.startsWith("--") && !COMPOSITED.has(property) && !LAYOUT.test(property),
	);
	if (layout !== undefined)
		causes.push(
			`animates ${layout.properties} on ${count(layout.elements, "element")}: these re-lay the page out every frame; move and size with transform`,
		);
	if (paint !== undefined)
		causes.push(
			`animates ${paint.properties} on ${count(paint.elements, "element")}: these repaint every frame; animate opacity or transform instead`,
		);
	if (census.loop)
		causes.push(
			`its own requestAnimationFrame loop runs every frame, so the ${subject} never rests; stop it once its motion is done`,
		);
	const endless = census.animations.filter((group) => group.endless).reduce((sum, group) => sum + group.elements, 0);
	if (endless > 0) {
		const when = subject === "slide" ? "while you talk" : "while it is on screen";
		causes.push(
			`${endless === 1 ? "an animation that never ends keeps" : `animations that never end, on ${endless} elements, keep`} the ${subject} drawing ${when}; let it end, unless the ${subject} is about that motion`,
		);
	}
	if (census.webgl > 1) causes.push(`runs ${census.webgl} WebGL scenes at once; one per ${subject} at most`);
	const [largest] = census.canvases;
	if (census.canvasCount > 1 && largest !== undefined)
		causes.push(
			`draws ${census.canvasCount} canvases (the largest ${largest.width} by ${largest.height} pixels); one per ${subject} at most`,
		);
	for (const canvas of census.canvases.filter((canvas) => pixels(canvas) > 4 * drawnPixels(canvas, scale)))
		causes.push(
			`a canvas of ${canvas.width} by ${canvas.height} pixels drawn at ${canvas.drawnWidth} by ${canvas.drawnHeight}; size it to ${sizeFor(canvas, scale)}`,
		);
	for (const image of census.oversized.slice(0, NAMED)) {
		const one = image.count === 1;
		const some = one ? "a" : `${image.count} images of`;
		const kind = one ? " image" : "";
		const sharp =
			scale === 1
				? ""
				: `, ${scale === 2 ? "twice" : `${scale} times`} ${one ? "its" : "their"} drawn size, for a sharp screen`;
		causes.push(
			`${some} ${image.width} by ${image.height}${kind} drawn at ${image.drawnWidth} by ${image.drawnHeight}; make ${one ? "it" : "them"} about ${sizeFor(image, scale)}${sharp}`,
		);
	}
	if (census.videos > 1) causes.push(`plays ${census.videos} videos at once; one at a time`);
	if (census.elements > MANY_ELEMENTS)
		causes.push(`holds ${census.elements} elements, each one more to style and paint; draw fewer`);
	if (causes.length === 0)
		causes.push(
			"nothing the booth counts explains it (no layout or paint animation, endless animation, drawing loop or oversized picture): look at what its code does every frame",
		);
	return causes;
}

/** The properties of one kind the census saw animating, named, and how many elements animate them. */
function animated(census: FrameCensus, kind: (property: string) => boolean) {
	const properties = new Set<string>();
	let elements = 0;
	for (const group of census.animations) {
		const of = group.properties.filter(kind);
		if (of.length === 0) continue;
		for (const property of of) properties.add(property);
		elements += group.elements;
	}
	if (properties.size === 0) return undefined;
	const names = [...properties].sort();
	const shown = names.length > NAMED ? [...names.slice(0, NAMED), `${names.length - NAMED} more`] : names;
	return { properties: listed(shown), elements };
}

const pixels = (drawn: Drawn) => drawn.width * drawn.height;
const drawnPixels = (drawn: Drawn, scale: number) => drawn.drawnWidth * drawn.drawnHeight * scale * scale;
const sizeFor = (drawn: Drawn, scale: number) =>
	`${Math.round(drawn.drawnWidth * scale)} by ${Math.round(drawn.drawnHeight * scale)}`;

function listed(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
