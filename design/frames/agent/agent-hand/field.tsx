import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { PHONE, WIDE } from "./kaffe-page";

/**
 * The canvas under this direction, and the first one in this family that holds a
 * desktop frame.
 *
 * `shared/ui/spool-play-field.tsx` hard-codes `FW = 152`, `FH = 329` and three equal
 * columns, which is a phone and only a phone. Everything below is that file's grid,
 * slot and label with the one assumption taken out: a frame's drawn size comes from
 * what it is authored at. `--inside`, `--held` and `--label` all copied the field for
 * smaller reasons; this is the same move.
 *
 * ## The zoom, which had to be decided before anything could be drawn
 *
 * A frame here is authored at 0.615 of a real device and drawn at whatever the camera
 * is, so the header's percentage is drawn-over-real. The family draws at **39%**: a
 * phone is 240 authored and 152 on screen.
 *
 * A real 1440×900 desktop page is **886×554 authored**, and at that same 39% it draws
 * **561 wide**. The viewport is 1440 less the 248 Pages rail and the 420 agent rail =
 * **772**. So a phone and a desktop side by side with the family's own 44px gutter come
 * to **757 of 772**, which fits, and leaves **7.5 pixels of margin on each side**. Both
 * frames would be touching both rails, and the presence assembly wants 18 of them on
 * the wall it docks to. Three ways out, and the third is the one taken:
 *
 *   - **Two zooms.** A canvas has one. Not available.
 *   - **A smaller desktop frame.** Authoring the page at less than 1440 makes the
 *     comparison a lie about the thing being compared.
 *   - **One lower zoom.** At **34%** the phone is 132 and the desktop 487, they sum to
 *     663, and the margins are 55 and 54 with a 44 gutter between them.
 *
 * **What 34% costs is the phone.** Its body copy is authored at 8.5px, so it draws at
 * **4.7 pixels** against the family's already marginal 5.2 at 39%. The desktop's own
 * body copy is authored at 12 and draws at 6.6, which is the larger frame's whole
 * advantage: **the same page is 40% more legible at the wide breakpoint on the same
 * canvas.** Nothing about this is the mark's doing and every direction on this page
 * pays it the moment a desktop frame is on screen.
 *
 * ## The threshold falls between the two frames, and that decides more than the zoom
 *
 * `src/cover.ts:8` sets `LIVE_MIN_CSS_PX` to 400 and `lifecycle.ts:245` enforces it as
 * `frame.w * camera.k < LIVE_MIN_CSS_PX`: under that, a frame is a stored photograph
 * rather than a mounted document. The phone draws at 132 and the desktop at **487**.
 *
 * So on this canvas the desktop frame has a DOM and the phone does not, and it is not
 * a near thing. In the real product a 390pt phone needs **103% zoom** to cross that
 * line and a 1440 desktop page needs **28%** — so at every zoom from 28% to 103%, which
 * is every zoom anybody works at, **a canvas holding both holds one live frame and one
 * picture.** Every located mark this family has designed was measured against the frame
 * where it cannot be located.
 *
 * ## What this field does not draw, and why
 *
 * There are two frames and no walk between them, because they are one page at two
 * breakpoints rather than two steps of a flow. So the incoming arrowhead that
 * `spool-play-field.tsx` lands on a frame's **left** wall at `ROW_1 + 186`, and that
 * `--accrue` broke the dock tie right to avoid, is not on this canvas at all. The docks
 * here are set by the gutters instead: the phone's outer margin is 55 against the 44
 * between the frames, so it docks left, and the desktop's outer margin is 54, so it
 * docks right. **Both objects end up on the outside walls and the gutter between the
 * frames stays empty**, which is where a walk would have gone.
 */

const S = 0.55;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;
const GUTTER = 44;
const ROW = 285;
const LABEL_LIFT = 22;

const PHONE_W = Math.round(PHONE.w * S);
const WIDE_W = Math.round(WIDE.w * S);
const MARGIN = Math.round((VIEW_W - PHONE_W - GUTTER - WIDE_W) / 2);

export interface FrameSlot {
	readonly name: string;
	/** what the frame is authored at, which is what its drawn size comes from */
	readonly nat: { readonly w: number; readonly h: number };
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	/** which wall the agent's object stands on, decided by which gutter is wider */
	readonly dock: "left" | "right";
	/** the frame has a mounted document at this size, so its geometry can be asked for */
	readonly live: boolean;
}

/** `frame.w * camera.k < LIVE_MIN_CSS_PX` — `src/cover.ts:8`, enforced at `lifecycle.ts:245` */
const LIVE_MIN_CSS_PX = 400;

function slot(name: string, nat: { w: number; h: number }, x: number, dock: "left" | "right"): FrameSlot {
	const w = Math.round(nat.w * S);
	return { name, nat, x, y: ROW, w, h: Math.round(nat.h * S), dock, live: w >= LIVE_MIN_CSS_PX };
}

export const SCALE = S;

export const SLOTS: readonly FrameSlot[] = [
	slot("home", PHONE, MARGIN, "left"),
	slot("home--wide", WIDE, MARGIN + PHONE_W + GUTTER, "right"),
];

export function HandField({
	draw,
	overlay,
}: {
	draw: (slot: FrameSlot) => ReactNode;
	/** the agent's layer, drawn in the same coordinates rather than inside a slot */
	overlay?: ReactNode;
}) {
	return (
		<div className="absolute inset-0">
			{SLOTS.map((frame) => (
				<div key={frame.name} className="absolute flex flex-col" style={{ left: frame.x, top: frame.y - LABEL_LIFT }}>
					<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3" style={{ width: frame.w }}>
						<span className={cn("min-w-0 truncate text-text")}>{frame.name}</span>
					</div>
					<div className="relative overflow-hidden rounded-lg" style={{ width: frame.w, height: frame.h }}>
						<div
							className="origin-top-left"
							style={{ width: frame.nat.w, height: frame.nat.h, transform: `scale(${S})` }}
						>
							{draw(frame)}
						</div>
					</div>
				</div>
			))}
			{overlay}
		</div>
	);
}
