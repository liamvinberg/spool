import type { ReactNode } from "react";

/**
 * The canvas under this direction, and the first one in this family that holds a
 * frame which is not a phone.
 *
 * `shared/ui/spool-play-field.tsx` hard-codes `FW = 152`, `FH = 329` and a three
 * column grid, because every frame it has ever drawn was authored 240x520. That is
 * the assumption this direction had to break, so the grid, the slot and the label are
 * copied from it verbatim — same 39%, same 22px label row, same 12px corner — and one
 * thing is new: **a slot carries its own natural size and every slot shares one
 * scale.** Copying rather than importing keeps `shared/` untouched while the two
 * canvases stay comparable to the pixel.
 *
 * ## The arithmetic, and it decided the layout rather than describing it
 *
 * A frame is authored at 0.615 of the real page and drawn at `152 / 240 = 0.6333`,
 * which is 39% of real. So a 390x844 phone is 240x520 authored and **152x329 drawn**,
 * and a 1440x900 desktop is 886x554 authored and **561x351 drawn**. The canvas
 * viewport is 1440 less the 248 Pages rail and the 420 agent rail: **772 wide**.
 *
 *   8 margin + 152 phone + 44 gutter + 561 desktop + 7 margin = 772
 *
 * There is no other arrangement. One phone frame and one desktop frame at the zoom
 * this whole family has measured at consume the entire viewport, leaving the honest
 * 44px gutter between them and seven pixels on the right. **A third frame does not
 * fit, and neither does a margin.**
 *
 * That is the finding, and it lands hardest on the directions that do not draw
 * inside a frame. Everything in the `--ghost-loud` compile lives on a wall: the lane
 * claims wall + 0 to 5, a slack thread claims its centre ± 4 plus a 2px stroke, the
 * plate claims its centre ± 8, and the whole assembly is 23 wide against a 44px
 * gutter. Beside a desktop frame **the right wall is seven pixels**. The dock
 * tie-break is inherited and never fires, because there is no tie: the only wall with
 * room is the left one, which is the wall an incoming walk arrowhead lands on.
 *
 * ## One row, two frames, no walk graph
 *
 * There is no second row and no camera: this turn never writes a frame that did not
 * exist and never leaves the page. There are no arrows either, and that is not a
 * saving — the page holds one design at two widths and there is no journey between
 * two widths of the same page. The wall arithmetic above is measured against where a
 * walk *would* dock rather than against one drawn here.
 */

const S = 152 / 240;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;
const LABEL_LIFT = 22;
/** the frame's own corner, so anything struck around it can be concentric with it */
export const RADIUS = 12;

/** the row's top, which centres a 351px desktop frame in the 856px the chrome leaves */
export const ROW = 232;

export interface LiftSlot {
	readonly name: string;
	/** what the page is authored at, which is 0.615 of the real device */
	readonly nat: { readonly w: number; readonly h: number };
	readonly left: number;
}

export const SLOTS: readonly LiftSlot[] = [
	{ name: "home--sm", nat: { w: 240, h: 520 }, left: 8 },
	{ name: "home", nat: { w: 886, h: 554 }, left: 204 },
];

/** a slot's box on the canvas, which every layer over the field measures from */
export function boxOf(slot: LiftSlot): { x: number; y: number; w: number; h: number } {
	return { x: slot.left, y: ROW, w: Math.round(slot.nat.w * S), h: Math.round(slot.nat.h * S) };
}

/** what the canvas is drawing a frame at, which the lift needs to spend a screen pixel */
export const SCALE = S;

/**
 * How much open canvas each wall of a slot has.
 *
 * Kept because it is the number that kills the wall channels beside a wide frame, and
 * because it is derived rather than asserted: it is the same arithmetic
 * `spool-play-field.tsx`'s own neighbours produce, with the frames no longer the same
 * width as each other.
 */
export function wallsOf(index: number): { left: number; right: number } {
	const here = SLOTS[index];
	if (here === undefined) return { left: 0, right: 0 };
	const box = boxOf(here);
	const before = SLOTS[index - 1];
	const after = SLOTS[index + 1];
	const left = before === undefined ? box.x : box.x - (boxOf(before).x + boxOf(before).w);
	const right = after === undefined ? VIEW_W - (box.x + box.w) : boxOf(after).x - (box.x + box.w);
	return { left, right };
}

export function LiftField({ draw }: { draw: (slot: LiftSlot) => ReactNode }) {
	return (
		<div className="absolute inset-0">
			{SLOTS.map((slot) => {
				const box = boxOf(slot);
				return (
					<div
						key={slot.name}
						className="absolute flex flex-col"
						style={{ left: box.x, top: box.y - LABEL_LIFT, width: box.w }}
					>
						<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
							<span className="min-w-0 truncate text-text">{slot.name}</span>
						</div>
						<div
							className="overflow-hidden rounded-lg"
							style={{ width: box.w, height: box.h, borderRadius: RADIUS }}
						>
							<div
								className="origin-top-left"
								style={{ width: slot.nat.w, height: slot.nat.h, transform: `scale(${S})` }}
							>
								{draw(slot)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
