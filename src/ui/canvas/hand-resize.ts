import { useEffect, useState } from "react";
import { screenConflict } from "../../daemon/class-write";
import type { CompiledTheme, HandOp, RungRead } from "../api";
import { fetchTheme, readRungs } from "../api";
import { lengthOf, lengthPx, scaleValue } from "./properties-families";
import { BASE, scopedClass } from "./properties-scope";
import { stepOf } from "./properties-theme";

/**
 * Resize by handle (#259), as decisions over data.
 *
 * The one canvas gesture that is genuinely better than a field: nudging a size
 * by feel is what a number box is bad at. A drag becomes a class edit when the
 * stamped host element has a literal or absent `className` and nothing else
 * pinning the dragged axis — which is checkable before the file is touched, so
 * the ring knows whether a handle is live before you grab it. There is never a
 * dead drag: a handle no write would take is simply not drawn.
 *
 * The decisions are pure over the read the lane already answers with (#256's
 * `RungRead`) and the numbers the pointer made; `useRing` is the one round
 * trip they need, which is that read and the step the theme resolves.
 */

/** -1 grabs the top or left side, 1 the bottom or right, 0 leaves the axis alone. */
export type Sign = -1 | 0 | 1;

/** Which of the ring's handles a write would take, known before the grab. */
export interface LiveHandles {
	w: boolean;
	h: boolean;
	rotate: boolean;
}

export const NO_HANDLES: LiveHandles = { w: false, h: false, rotate: false };

/** The smallest an element may be dragged to, in the document's own pixels. */
export const MIN_ELEMENT_PX = 8;

/** How far the box the document came back with may miss what was written. */
export const SIZE_SLACK_PX = 1.5;

export interface Size {
	w: number;
	h: number;
}

/**
 * Which handles the file leaves live on this rung.
 *
 * The rung's own refusal is the whole answer for all three — a computed
 * `className`, an inline style, spread props with no literal, a definition in
 * `shared/ui/*`, a stamp that hits nothing: none of them leaves an axis a
 * write could take. Past that the question is per axis, because a screen
 * variant pins one family at a time and a base class cannot honestly beat it.
 *
 * A rotation already worn takes the size handles off. The box the canvas has
 * is the document's own `getBoundingClientRect`, which for a rotated element
 * is the box around it rather than the box it is, so a drag would write a
 * width nobody asked for. The rail's number boxes still reach both axes.
 */
export function handlesFor(read: RungRead | undefined): LiveHandles {
	if (read === undefined || read.name === undefined || read.refusal !== undefined) return NO_HANDLES;
	const literal = read.className === "" ? null : read.className;
	const free = (token: string): boolean => screenConflict(literal, { token, scope: "" }) === undefined;
	const turned = rotationOf(read.className) !== 0;
	return { w: !turned && free("w-1"), h: !turned && free("h-1"), rotate: free("rotate-1") };
}

/** The degrees the base scope already carries, which a rotate drag starts from. */
export function rotationOf(className: string): number {
	const worn = lengthOf(scopedClass(className, BASE), "rotate");
	if (worn === null) return 0;
	const deg = lengthPx("deg", worn.value);
	return deg === null ? 0 : worn.negative ? -deg : deg;
}

/** The box a size drag is at, in the document's pixels. */
export function draggedSize(start: Size, sx: Sign, sy: Sign, dx: number, dy: number): Size {
	return {
		w: sx === 0 ? start.w : Math.max(MIN_ELEMENT_PX, Math.round(start.w + sx * dx)),
		h: sy === 0 ? start.h : Math.max(MIN_ELEMENT_PX, Math.round(start.h + sy * dy)),
	};
}

/**
 * The angle a rotate drag is at: whole degrees, wrapped to (-180, 180], and
 * snapped to 15° while shift is held.
 */
export function draggedAngle(base: number, from: number, to: number, snap: boolean): number {
	const turned = base + ((to - from) * 180) / Math.PI;
	const whole = snap ? Math.round(turned / 15) * 15 : Math.round(turned);
	return ((((whole + 180) % 360) + 360) % 360) - 180;
}

/**
 * The tokens a size drag is showing mid-drag: absolute pixels, always.
 *
 * The rail reads these while the pointer is down, so the field ticks in the
 * numbers the drag is actually making. Letting go rounds each axis onto the
 * scale, which is what `sizeTokens` writes.
 */
export function previewTokens(size: Size, sx: Sign, sy: Sign): string[] {
	const tokens: string[] = [];
	if (sx !== 0) tokens.push(`w-[${size.w}px]`);
	if (sy !== 0) tokens.push(`h-[${size.h}px]`);
	return tokens;
}

/**
 * The tokens a size drag writes when it is let go.
 *
 * Scale or arbitrary is policy rather than capability: v4 bare steps take
 * quarter multiples, so on a 4px step every whole pixel is expressible as a
 * bare class. It is written as pixels off integer steps anyway — a whole step
 * gets the bare class because it is byte-identical to what the frame's author
 * would have written, and anything else stays `w-[347px]` because the drag
 * meant absolute pixels and a bare class silently rescales if `--spacing`
 * moves. The step comes from the compiled stylesheet, never from an assumption.
 */
export function sizeTokens(size: Size, sx: Sign, sy: Sign, step: number): string[] {
	const tokens: string[] = [];
	if (sx !== 0) tokens.push(`w-${scaleValue(size.w, step)}`);
	if (sy !== 0) tokens.push(`h-${scaleValue(size.h, step)}`);
	return tokens;
}

/** The token a rotate drag is showing, or nothing where it is back at rest. */
export function rotateTokens(deg: number): string[] {
	return deg === 0 ? [] : [`${deg < 0 ? "-" : ""}rotate-${Math.abs(deg)}`];
}

/** Every token as a `set-class` op at the base scope, which is one patch. */
export function sizeOps(source: string, tokens: readonly string[]): HandOp[] {
	return tokens.map((token) => ({ kind: "set-class", source, token, scope: "" }));
}

/** A rotation back at rest takes the family away rather than writing a zero. */
export function rotateOps(source: string, deg: number): HandOp[] {
	const tokens = rotateTokens(deg);
	const written = tokens[0];
	return written === undefined
		? [{ kind: "set-class", source, token: "rotate-0", scope: "", remove: true }]
		: [{ kind: "set-class", source, token: written, scope: "" }];
}

/**
 * Whether the box the reloaded document came back with is the size that was
 * written (#259's measure after apply).
 *
 * Load-bearing rather than paranoia: utilities land in `@layer utilities`, so
 * an unlayered rule in a project's `tokens.css` beats the written class
 * silently, and layout — `flex-basis`, grid tracks, min and max clamps — can
 * ignore or clamp what the class states. Only the dragged axes are asked
 * about: the other one was never written and whatever it does is the layout's
 * own business.
 */
export function landed(intent: Size, sx: Sign, sy: Sign, measured: Size): boolean {
	if (sx !== 0 && Math.abs(measured.w - intent.w) > SIZE_SLACK_PX) return false;
	if (sy !== 0 && Math.abs(measured.h - intent.h) > SIZE_SLACK_PX) return false;
	return true;
}

/**
 * What the ring needs before a grab: which handles the file leaves live, and
 * the step a whole class is measured in.
 *
 * Asked per held rung and again whenever that frame's document reloads, since
 * the literal it answers about is one of that document's own inputs. Nothing
 * until the read lands, which is a ring with no handles rather than one
 * offering a drag the file would refuse.
 */
export function useRing(
	project: string,
	held: { frame: string; source: string } | null,
	revision: number,
): { live: LiveHandles; step: number; rotation: number } {
	const [read, setRead] = useState<RungRead | undefined>(undefined);
	const [theme, setTheme] = useState<CompiledTheme | null>(null);
	const asked = held === null ? "" : `${revision}\n${held.frame}\n${held.source}`;
	useEffect(() => {
		const [, frame, source] = asked.split("\n");
		if (frame === undefined || source === undefined) {
			setRead(undefined);
			return;
		}
		let live = true;
		void readRungs(project, frame, [source]).then((rungs) => {
			if (live) setRead(rungs?.[0]);
		});
		return () => {
			live = false;
		};
	}, [project, asked]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is not read in here, it is the trigger — a document that reloaded may have reloaded because tokens.css changed
	useEffect(() => {
		let live = true;
		void fetchTheme(project).then((answered) => {
			if (live && answered !== undefined) setTheme(answered);
		});
		return () => {
			live = false;
		};
	}, [project, revision]);
	return {
		live: handlesFor(read),
		step: stepOf(theme),
		rotation: read === undefined ? 0 : rotationOf(read.className),
	};
}
