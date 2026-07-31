import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";

/**
 * The canvas under this direction, and the first one in this family that holds a
 * desktop frame.
 *
 * `shared/ui/spool-play-field.tsx` hard-codes `FW = 152` and `FH = 329` and draws three
 * of them in a row, which is a phone at 39% and nothing else. Every frame in this family
 * has inherited that, so the whole `agent-hand` round has been argued on one frame shape.
 * This field draws two: `home` at 1440×900 authored down to 886×554, and the same page at
 * 390×844 authored down to 240×520, both at the same 39%.
 *
 * **The arithmetic that decided the layout.** One scale for both, `S = 152 ÷ 240`, so the
 * zoom in the header stays one number. The phone draws 152×329. The desktop draws
 * **561×351**. The viewport is 1440 less the 248 Pages rail and the 420 agent rail, so
 * 772 wide by 856 tall. Two of those side by side is 561 + 44 of gutter + 152 = 757 of a
 * 772 viewport, which fits and leaves nothing: no margins, and no wall for the presence
 * to dock on, which needs 29. **So they cannot share a row, and the cost is stated
 * rather than hidden — a desktop frame takes 73% of the viewport's width at the zoom a
 * phone is comfortable at.** Stacked, they both fit with room to spare, and the second
 * row is where a canvas would really put them anyway.
 *
 * **The other thing the width buys, and it is not small.** `src/cover.ts:8` sets
 * `LIVE_MIN_CSS_PX` at 400 and `lifecycle.ts:245` enforces it as
 * `frame.w * camera.k < LIVE_MIN_CSS_PX`: under it a frame is a stored photograph, over
 * it a live document. A phone at 152 is under. **A desktop frame at 561 is over.** So on
 * one canvas at one zoom this field holds one frame whose thirteen writes really do
 * redraw it thirteen times and one whose picture follows the capture errand instead — and
 * every fiction this family has been carrying (`--accrue`'s lane heights, `--ghost-loud`'s
 * `DIAGRAM`, the three-photograph cadence) is a fiction about the phone only. Above 400
 * drawn pixels the lane's heights are obtainable, the document is there to resolve them
 * against, and the wipe is a wipe of the real thing.
 *
 * Both frames are drawn wiping. The phone one is `home` at phone width, and it is the one
 * declared fiction in this frame: the capture writes one file, and landing the same
 * thirteen writes on two frames is what makes a 152px sweep and a 561px sweep comparable
 * under one clock, which is the question. The presence and its channels dock on the
 * desktop frame alone, because the agent is at one frame and the capture names one.
 */

const PHONE_NAT = { w: 240, h: 520 } as const;
const WIDE_NAT = { w: 886, h: 554 } as const;

/** one scale for both, so the 39% in the header is one number */
export const S = 152 / PHONE_NAT.w;

export const PHONE_W = 152;
export const PHONE_H = Math.round(PHONE_NAT.h * S);
export const WIDE_W = Math.round(WIDE_NAT.w * S);
export const WIDE_H = Math.round(WIDE_NAT.h * S);

/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
export const VIEW_W = 772;

export const WIDE_X = 44;
export const ROW_1 = 38;
/**
 * The phone row, and the number is set from the bottom rather than the top: the tool bar
 * floats at `bottom-6` over a 44px body, so it reaches up to y 788 in a viewport 856 tall,
 * and a 329px frame starting at 438 ends at 767 with 21px to spare.
 */
export const ROW_2 = 438;
export const PHONE_COLS = [44, 240, 436] as const;
const LABEL_LIFT = 22;

export interface Neighbour {
	readonly name: string;
	readonly render: () => ReactNode;
}

export function WipeField({
	wide,
	phone,
	neighbours,
}: {
	/** the desktop subject, already wiping */
	wide: ReactNode;
	/** the same page at phone width, already wiping */
	phone: ReactNode;
	/** the two frames on the phone row nothing in this capture touches */
	neighbours: readonly Neighbour[];
}) {
	return (
		<div className="absolute inset-0">
			<Walks />
			<Slot left={WIDE_X} top={ROW_1} name="home" width={WIDE_W} height={WIDE_H}>
				<div
					className="origin-top-left"
					style={{ width: WIDE_NAT.w, height: WIDE_NAT.h, transform: `scale(${S})` }}
				>
					{wide}
				</div>
			</Slot>
			<Slot left={PHONE_COLS[0]} top={ROW_2} name="home--phone" width={PHONE_W} height={PHONE_H}>
				<div
					className="origin-top-left"
					style={{ width: PHONE_NAT.w, height: PHONE_NAT.h, transform: `scale(${S})` }}
				>
					{phone}
				</div>
			</Slot>
			{neighbours.map((frame, index) => (
				<Slot
					key={frame.name}
					left={PHONE_COLS[index + 1] ?? 0}
					top={ROW_2}
					name={frame.name}
					width={PHONE_W}
					height={PHONE_H}
				>
					<div
						className="origin-top-left"
						style={{ width: PHONE_NAT.w, height: PHONE_NAT.h, transform: `scale(${S})` }}
					>
						{frame.render()}
					</div>
				</Slot>
			))}
		</div>
	);
}

function Slot({
	left,
	top,
	name,
	width,
	height,
	children,
}: {
	left: number;
	top: number;
	name: string;
	width: number;
	height: number;
	children: ReactNode;
}) {
	return (
		<div className="absolute flex flex-col" style={{ left, top: top - LABEL_LIFT, width }}>
			<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
				<span className={cn("min-w-0 truncate text-text")}>{name}</span>
			</div>
			<div className="relative" style={{ width, height }}>
				<div className="overflow-hidden rounded-lg" style={{ width, height }}>
					{children}
				</div>
			</div>
		</div>
	);
}

/**
 * The link graph along the phone row, drawn by the shared field's own rule so the one
 * piece of geometry this direction inherits stays inherited: an edge leaves at
 * `x + w + 3`, `row + 158` and its head lands on the next frame's **left** wall at
 * `row + 186`. The first edge is unconditional and anything after it sits inside a branch
 * and draws faint.
 *
 * The desktop frame carries no walk here, and the tie-break it would have needed never
 * arises: a 561px frame at x 44 in a 772px viewport has 44 of wall on its left and 167 on
 * its right, so the presence docks right on the plain rule rather than on `--accrue`'s
 * one-character fix. What the fix protects against is a frame with equal gutters, which is
 * what a canvas of phones gives you and what a canvas holding one desktop frame never can.
 */
function Walks() {
	const edges = PHONE_COLS.slice(1).map((to, index) => {
		const from = PHONE_COLS[index] ?? 0;
		const x1 = from + PHONE_W + 3;
		const y1 = ROW_2 + 158;
		const x2 = to - 9;
		const y2 = ROW_2 + 186;
		return {
			d: `M${x1} ${y1}C${x1 + 16} ${y1} ${x2 - 12} ${y2} ${x2} ${y2}`,
			head: `m${x2 + 8} ${y2}-8-4.5v9Z`,
			faint: index > 0,
		};
	});
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			{edges.map((edge) => (
				<g key={edge.d} opacity={edge.faint ? 0.45 : 1}>
					<path d={edge.d} stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d={edge.head} fill="var(--color-thread)" />
				</g>
			))}
		</svg>
	);
}
