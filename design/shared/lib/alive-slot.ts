import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * What the always-present indicator costs its own box, and how often it rewrites itself.
 *
 * Round two settled the placement and `wait-churn.ts` settled the shape: fixed above the
 * composer, mounted before the first keystroke, never unmounted. Which means the churn
 * meter now reads 0 enters, 0 leaves and 100% on screen for **every** take on the row —
 * it has become a gate rather than a discriminator, and a number that is identical across
 * ten frames decides nothing.
 *
 * So this is the third instrument, and it measures the two things that separate one
 * always-present indicator from another.
 *
 * **The box.** A take that changes the width of the thing it draws is a take that would
 * push anything sitting beside it. Nothing sits beside it in the slot as drawn, so the
 * shift meter reads a flat zero and says nothing useful; the width is watched directly
 * instead. `widest` is the largest the occupant ever got, `jump` is the largest single
 * step it took, `jumps` is how many steps it took at all. A word swapping from `idle` to
 * `working` is a step of about 21px. A mono cell cycling six glyphs is a step of zero,
 * because the cell is a fixed box. Animating a font weight is a step every frame.
 *
 * **The writes.** How many times the contents of the slot changed in the DOM over one
 * turn, counted as `childList` and `characterData` mutations. This is the number that
 * separates the takes that are pure compositor work from the ones that are re-rendering
 * text sixty or eight times a second: a transform-driven take writes **nothing** for the
 * whole turn, a glyph cycling at 120ms writes about a hundred times, and a rotating word
 * set both writes and replaces its element.
 *
 * **What it cannot see, stated rather than hidden.** `attributes` is deliberately not
 * observed. Every motion-driven transform writes the `style` attribute on every frame, so
 * observing attributes would report ~800 mutations for all ten takes and rank them
 * identically — the opposite of the problem this instrument exists to fix. The cost of
 * that choice is that a take which animates a CSS property rather than the text (a font
 * weight, say) reads 0 writes here and has to be caught by `jump` and by whether it lays
 * out, both of which it is.
 */

export interface Slot {
	/** the widest the occupant ever got, px */
	readonly widest: number;
	/** the largest single width step it took, px */
	readonly jump: number;
	/** how many steps it took at all */
	readonly jumps: number;
	/** contents changed in the DOM this many times over the turn */
	readonly writes: number;
}

const NONE: Slot = { widest: 0, jump: 0, jumps: 0, writes: 0 };

/** a step smaller than this is subpixel layout, not the box changing */
const FLOOR = 0.5;

export function useSlot(node: RefObject<HTMLElement | null>, run: number, watching: boolean): Slot {
	const [shown, setShown] = useState<Slot>(NONE);
	const tally = useRef({ widest: 0, jump: 0, jumps: 0, writes: 0 });
	const last = useRef<number | null>(null);

	useEffect(() => {
		tally.current = { widest: 0, jump: 0, jumps: 0, writes: 0 };
		last.current = null;
		setShown(NONE);
	}, [run]);

	useEffect(() => {
		const box = node.current;
		if (!watching || box === null) return;

		const read = (): Slot => ({
			widest: Math.round(tally.current.widest * 10) / 10,
			jump: Math.round(tally.current.jump * 10) / 10,
			jumps: tally.current.jumps,
			writes: tally.current.writes,
		});

		const width = (px: number) => {
			if (px > tally.current.widest) tally.current.widest = px;
			const before = last.current;
			if (before !== null) {
				const step = Math.abs(px - before);
				if (step > FLOOR) {
					tally.current.jumps += 1;
					if (step > tally.current.jump) tally.current.jump = step;
				}
			}
			last.current = px;
		};

		width(box.getBoundingClientRect().width);
		const sizes = new ResizeObserver((records) => {
			for (const record of records) width(record.target.getBoundingClientRect().width);
		});
		sizes.observe(box);

		const writes = new MutationObserver((records) => {
			for (const record of records) {
				if (record.type === "characterData") tally.current.writes += 1;
				else tally.current.writes += record.addedNodes.length + record.removedNodes.length;
			}
		});
		writes.observe(box, { childList: true, characterData: true, subtree: true });

		const flush = window.setInterval(() => setShown(read()), 200);
		return () => {
			sizes.disconnect();
			writes.disconnect();
			window.clearInterval(flush);
			// the turn ending is when the number stops being provisional
			setShown(read());
		};
	}, [node, watching]);

	return shown;
}
