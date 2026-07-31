import type { ReactNode } from "react";

/**
 * The canvas under this direction, and the one thing `shared/ui/spool-play-field.tsx`
 * cannot do: place a frame that is not phone-shaped.
 *
 * That field hard-codes `FW = 152`, `FH = 329` and three columns at 114/310/506, and it
 * scales every frame from a 240×520 authored box. There is no seam in it for a second
 * shape, and `shared/` is not this frame's to change — so the grid, the slot, the name
 * and the walk graph are copied and adapted here, the way `--inside`, `--held` and
 * `--label` each copied it before. **One thing is deliberately identical: `S`.** Both
 * shapes are drawn at 152/240, so the 39% in the header is the same 39% for both and
 * nothing here is a comparison between two zooms.
 *
 * ## Can a phone and a desktop frame share a zoom
 *
 * Yes, and there are fifteen pixels left over for everything else. Here is the whole
 * arithmetic.
 *
 * The viewport is **772** wide: 1440 less the 248 Pages rail less the 420 agent rail.
 * A real 1440×900 desktop page authored at 0.615 is 886×554, drawn at `S` it is
 * **561×351**. A phone is 152×329. With the family's own 44px gutter between them,
 * 561 + 44 + 152 is **757**, and the margins are what is left.
 *
 *     14 + 561 + 44 + 152 + 1 = 772
 *
 * **The stand-off does not fit, and drawing it is what found that.** `--ghost-loud`
 * needed 15 of clear canvas outside a wall and this frame needs 12; two frames pressed
 * to the viewport need 24 and there are 15. So the slack goes entirely to the subject
 * — `home` stands 14 out so its `shot` sweep clears the left edge by two pixels — and
 * the phone is flush, one pixel from the right, with nowhere to put a presence of its
 * own. **On a canvas holding both shapes at an honest zoom, only one frame at a time
 * can be worked on where you can see it.** At 7 and 8, which is the symmetric placing,
 * the sweep's left arm runs to x −5 and is cut off by the Pages rail.
 *
 * The other cost is the gutters. With both frames on screen the outer walls are
 * against the viewport, so the only free vertical strip is the one between them, and
 * the walk graph is already in it. `--ghost-loud`'s stand-off arithmetic assumed two
 * spare gutters and a wall to choose between; at desktop shape there is one.
 *
 * The second surprise is vertical and it is a gift. A 900px desktop and an 844px phone
 * are nearly the same height, so at one zoom they draw **351 and 329** — a 22px
 * difference on frames whose widths differ by 3.7×. They sit in one row without
 * anything being cropped or floated, which is not what the shapes suggest.
 *
 * And the third: two desktop frames **cannot** sit side by side. 561 + 44 + 561 is
 * 1,166 against 772. Stacked they are 351 + 62 + 351 = 764 of 856 and fit with room
 * over. So a desktop page's neighbours are above and below, the gutter that matters is
 * horizontal, and it is **40px of clear air with the lower frame's 22px name standing
 * in it** rather than the 44 of empty canvas a phone row gives. Both are drawn.
 *
 * ## What the zoom does not buy
 *
 * A desktop frame at 39% is not more readable than a phone frame at 39%. Its body copy
 * is real 17px against the phone's real 13.8, so it draws at 6.6px against 5.4 — both
 * are smears. **The desktop frame is larger, not closer.**
 *
 * What it does cross is `LIVE_MIN_CSS_PX = 400` (`src/cover.ts:8`, enforced at
 * `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`). At 561 the desktop
 * frame has a live document; at 152 the phone beside it is a stored photograph. **One
 * canvas, one zoom, two regimes** — and the threshold that decides which is about the
 * frame's box while the thing that decides legibility is about its content, so a
 * desktop canvas pulls them apart. Everything `--accrue` and `--ghost-loud` had to fake
 * with a `DIAGRAM` constant is obtainable on the left of this canvas and still
 * unobtainable on the right.
 */

/* ---------- the one scale ---------- */

/** what the canvas draws every frame at, phone or not */
export const S = 152 / 240;

/** a phone frame: 390×844 real, 240×520 authored, drawn 152×329 */
export const FW = 152;
export const FH = 329;
/** a desktop frame: 1440×900 real, 886×554 authored, drawn 561×351 */
export const DW = 561;
export const DH = 351;

/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
export const VIEW_W = 772;
/** and 900 less the 44px shell bar */
export const VIEW_H = 856;

export const ROW_1 = 46;
export const ROW_2 = 459;
export const LABEL_LIFT = 22;
/** the frame's own corner, so anything struck outside it can be struck concentric */
export const RADIUS = 12;

export type Shape = "desk" | "phone";

export interface Placed {
	readonly name: string;
	readonly shape: Shape;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	/** the frame's own authored box, which is what a block's box is measured in */
	readonly nat: { readonly w: number; readonly h: number };
}

/**
 * Where the three frames are, and the arithmetic above made literal.
 *
 * `home` is the subject. `menu` is a real phone frame beside it at the same zoom, which
 * is the comparison the whole frame exists for. `hours` is a second desktop frame in
 * the only place a second desktop frame can go.
 */
export const PLACED: readonly Placed[] = [
	{ name: "home", shape: "desk", x: 14, y: ROW_1, w: DW, h: DH, nat: { w: 886, h: 554 } },
	{ name: "menu", shape: "phone", x: 619, y: ROW_1, w: FW, h: FH, nat: { w: 240, h: 520 } },
	{ name: "hours", shape: "desk", x: 14, y: ROW_2, w: DW, h: DH, nat: { w: 886, h: 554 } },
];

export function placedOf(name: string): Placed | null {
	return PLACED.find((frame) => frame.name === name) ?? null;
}

/* ---------- the walk graph ----------
 * Two edges, drawn the way the shared field draws them, and their collisions measured
 * rather than dodged.
 *
 * `home` → `menu` leaves the right wall at `x + w + 3`, `ROW_1 + 158`. That is the
 * shared field's own fraction and on a 351px frame it lands at authored y 249, inside
 * the hero image — so the outgoing edge crosses the lane exactly the way `--ghost-loud`
 * measured it crossing on a phone. **Inherited, unchanged, and not this frame's to
 * fix.**
 *
 * `home` → `hours` is the new one, and it is the edge a vertical stack produces. It
 * leaves the bottom wall, which is the wall this frame just moved the presence onto, so
 * the two want the same edge and there is no opposite wall to escape to. What saves it
 * is that they now meet at a right angle: a 1.5px accent line crossing a 3px grip is
 * three pixels of overlap, where on a phone the lane and the edge ran **parallel** in
 * the same 3px strip for the length of a mark. Rotating the presence turns a co-linear
 * conflict into a perpendicular one, and that is the cheapest thing that happened here. */

interface Edge {
	readonly d: string;
	readonly head: string;
	readonly faint: boolean;
}

const EDGES: readonly Edge[] = [
	{
		d: "M578 204C594 204 598 232 610 232",
		head: "M618 232 610 227.5v9Z",
		faint: false,
	},
	{
		d: "M394 400C394 418 394 432 394 450",
		head: "M394 458 389.5 450h9Z",
		faint: true,
	},
];

function Walks() {
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			{EDGES.map((edge) => (
				<g key={edge.d} opacity={edge.faint ? 0.45 : 1}>
					<path d={edge.d} stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d={edge.head} fill="var(--color-thread)" />
				</g>
			))}
		</svg>
	);
}

/* ---------- the field ---------- */

export function DeskField({ draw }: { draw: (frame: Placed) => ReactNode }) {
	return (
		<div className="absolute inset-0">
			<Walks />
			{PLACED.map((frame) => (
				<Slot key={frame.name} frame={frame}>
					<div
						className="origin-top-left"
						style={{ width: frame.nat.w, height: frame.nat.h, transform: `scale(${S})` }}
					>
						{draw(frame)}
					</div>
				</Slot>
			))}
		</div>
	);
}

/**
 * One frame and its name.
 *
 * The name is `spool-play-field.tsx`'s verbatim — 22px above the box, 12px mono, so its
 * line box runs from `y − 17` to `y − 5`. On a phone that box is 30px of a 152px top
 * edge and every mark struck outside the frame has to get past it. Here it is 30px of
 * **561**, which does not help at all, because a corner arm is struck at
 * `frame.x + RADIUS` whatever the frame's width is. The name is dodged in this frame by
 * leaving the top edge undrawn, not by having more of it. See `desk-hand.tsx`.
 */
function Slot({ frame, children }: { frame: Placed; children: ReactNode }) {
	return (
		<div className="absolute flex flex-col" style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: frame.w }}>
			<div className="flex h-[22px] min-w-0 items-center font-mono text-text text-xs leading-3">
				<span className="min-w-0 truncate">{frame.name}</span>
			</div>
			<div className="relative overflow-hidden rounded-lg" style={{ width: frame.w, height: frame.h }}>
				{children}
			</div>
		</div>
	);
}
