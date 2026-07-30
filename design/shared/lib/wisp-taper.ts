import { type RefObject, useEffect, useState } from "react";
import { STRAND_SPANS } from "./ribbon-strands";

/**
 * Round five. The taper and the waist, borrowed as numbers, drawn at a sixteenth of the logo.
 *
 * Round four drew the real `SPOOL_MARK_PATH` split into its nine strands and the answer was
 * that it felt big:
 *
 *   "they all just feel a bit big with the icon, it doesnt have to be the exact logo, just
 *    using it as inspiration in some kind of way, like 'spool'."
 *
 * Read against round three, that names a target between two rejections rather than one. Round
 * three's `--fold` reduced the ribbon to three hairlines and was rejected for not being spool's
 * identity at all; round four's takes *were* the identity and were rejected for bulk. So the
 * borrow has to be narrower than a silhouette and more specific than "three bars".
 *
 * **What is actually distinctive is measurable, and it is already measured.** The nine spans in
 * `ribbon-strands.ts` run 395, 416, 321, 224, 180, 165, 269, 392, 446: the mark is a cascade
 * that tapers to a waist and opens again. Nine strands are not the signature — that is only how
 * many the logo has, and thirty pixels is what nine strands cost to tell apart. The *taper* and
 * the *waist* are the signature, and both are numbers rather than pixels.
 *
 * So nothing in this round draws `SPOOL_MARK_PATH`, and nothing in it invents a wave either.
 * Every mark's proportions are sampled from `STRAND_SPANS` itself, so the shape is derived from
 * the identity even where the drawing is two strokes.
 *
 * **And the taper turns out to be one function.** A gaussian pinch of depth 0.62 centred on the
 * narrowest of five sampled strands reproduces those five measured spans to within 0.06 of a
 * stroke's width (`PINCH_FIT`, computed rather than claimed). That is what makes a *moving*
 * waist possible at all: the logo's own taper is one value of a parameter, so sliding the
 * parameter is still the logo's taper, somewhere else.
 */

/** the long axis of every mark on this row. Round four's was 30, and this is the headline. */
export const WISP_W = 16;

const WIDEST = Math.max(...STRAND_SPANS);

/**
 * `count` of the nine measured spans, evenly sampled, as fractions of the widest.
 *
 * Downsampling rather than redrawing is the whole method: five strokes at these five widths is
 * the cascade's own proportion with eight fewer elements, and at 16px five is already near the
 * limit of what separates.
 */
export function taperOf(count: number): readonly number[] {
	const last = STRAND_SPANS.length - 1;
	return Array.from({ length: count }, (_, index) => {
		const at = Math.round((index / (count - 1)) * last);
		return (STRAND_SPANS[at] ?? WIDEST) / WIDEST;
	});
}

/** 0.89, 0.72, 0.40, 0.60, 1.00 — the cascade in five */
export const TAPER_5 = taperOf(5);
/** 0.89, 0.50, 0.37, 1.00 — the cascade in four, which leans harder */
export const TAPER_4 = taperOf(4);
/** 0.89, 0.40, 1.00 — wide, waist, wide. The fewest strokes that still have a middle. */
export const TAPER_3 = taperOf(3);

/** which of the five is the narrowest, found rather than assumed */
export const WAIST_5 = TAPER_5.reduce((at, span, index) => (span < (TAPER_5[at] ?? 2) ? index : at), 0);

/** the depth the identity's own waist is worth, at five strokes */
export const WAIST_DEPTH = 0.62;

/**
 * A gaussian pinch: the taper's own shape, with the waist wherever you put it.
 *
 * One expression carries the whole family. `pinch(i, WAIST_5, WAIST_DEPTH)` is the logo's
 * proportion; moving `centre` moves the waist without the shape stopping being that proportion;
 * deepening `depth` cuts the cascade in two at the waist.
 */
export function pinch(index: number, centre: number, depth: number, spread = 0.9): number {
	const away = (index - centre) / spread;
	return 1 - depth * Math.exp(-0.5 * away * away);
}

/** how far the pinch at the identity's own waist misses the measured spans, worst stroke */
export const PINCH_FIT =
	Math.round(Math.max(...TAPER_5.map((span, index) => Math.abs(span - pinch(index, WAIST_5, WAIST_DEPTH)))) * 100) /
	100;

/* ---------- the aperture's mask, three tapered slots ---------- */

export const SLIT_BOX = { w: WISP_W, h: 10 } as const;

export interface Slit {
	readonly y: number;
	readonly h: number;
	/** the fraction of the box this slot runs, off the sampled spans */
	readonly w: number;
}

export const SLITS: readonly Slit[] = TAPER_3.map((w, index) => ({ y: 0.5 + index * 3.5, h: 2, w }));

/** each slot tapers to 40% of its own height at the far end, which is what makes the band dwell */
const SLIT_TIP = 0.4;

/**
 * A slot, centred rather than left-aligned.
 *
 * Left-aligned, three bars of different lengths are a text-lines glyph — the icon every app uses
 * for a list — and the taper is invisible inside that reading. Correction made off the first still
 * rather than reasoned in advance; the same fix applies to `waist` and `drift`.
 */
function slitPath(slit: Slit): string {
	const run = slit.w * SLIT_BOX.w;
	const near = (SLIT_BOX.w - run) / 2;
	const far = near + run;
	const inset = (slit.h * (1 - SLIT_TIP)) / 2;
	return `M${near} ${slit.y} L${far} ${slit.y + inset} L${far} ${slit.y + slit.h - inset} L${near} ${slit.y + slit.h} Z`;
}

/**
 * The three slots as a `mask-image`, painted once and never touched.
 *
 * Round four's `--aperture` was the one mechanism the brief said might survive shrinking, and
 * this is why: the moving part is one ordinary element carrying one static gradient, so there is
 * no gradient paint to animate and nothing that can freeze mid-sweep the way
 * `agent-say-arrive`'s `edge` did when the wire paused. Two DOM nodes, at any size.
 */
export const SLIT_MASK = `url("data:image/svg+xml,${encodeURIComponent(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLIT_BOX.w} ${SLIT_BOX.h}"><path fill="#000" d="${SLITS.map(slitPath).join(" ")}"/></svg>`,
)}")`;

/** the lit area of the mask, exactly: three trapezoids rather than a raster */
export const SLIT_AREA = Math.round(
	SLITS.reduce((sum, slit) => sum + slit.w * SLIT_BOX.w * slit.h * ((1 + SLIT_TIP) / 2), 0),
);

/* ---------- what a mark actually measured ---------- */

export interface Drawn {
	readonly w: number;
	readonly h: number;
}

/**
 * The mark's own box, read off the browser.
 *
 * `alive-slot.ts` watches the slot's width because that is what a take could push its
 * neighbours with. This round's complaint is bulk, so the number on the frame has to be the
 * whole box and it has to be measured — a declared height is exactly the kind of claim round
 * four's own footer measurement caught being wrong.
 */
export function useDrawn(node: RefObject<HTMLElement | null>): Drawn {
	const [box, setBox] = useState<Drawn>({ w: 0, h: 0 });

	useEffect(() => {
		const mark = node.current;
		if (mark === null) return;
		const read = () => {
			const rect = mark.getBoundingClientRect();
			setBox({ w: Math.round(rect.width * 10) / 10, h: Math.round(rect.height * 10) / 10 });
		};
		read();
		const watch = new ResizeObserver(read);
		watch.observe(mark);
		return () => watch.disconnect();
	}, [node]);

	return box;
}
