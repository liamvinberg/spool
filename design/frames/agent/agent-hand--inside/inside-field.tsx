import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import { KaffeHomeRev, REGION, type RegionId } from "./kaffe-home-rev";

/**
 * The canvas under this direction, and the one thing it does that
 * `shared/ui/spool-play-field.tsx` will not: it draws over the inside of a frame.
 *
 * The shared field hands an overlay only through `Outline`, which is a
 * thread-coloured box around an element a chip named. That is the right object for
 * a selection and the wrong one for this question, so the grid, the slot and the
 * label are copied from it verbatim — same 240×520 authored box, same 152px draw,
 * same 39% the header reads — and everything below `Interior` is new. Copying the
 * geometry rather than importing it keeps `shared/` untouched while the two
 * canvases stay comparable to the pixel.
 *
 * One row, three frames, the subject in the middle. There is no second row and no
 * camera: this turn never writes a frame that did not exist and never leaves the
 * page, so a field that could arrive one or fly to one would be drawing capability
 * nobody in this capture uses.
 */

const NAT_W = 240;
const NAT_H = 520;
const FW = 152;
const FH = 329;
const S = FW / NAT_W;

const COLS = [114, 310, 506] as const;
const ROW = 268;
const LABEL_LIFT = 22;

/**
 * The width below which a frame has no inside.
 *
 * The marks are drawn at screen scale, the way every other piece of selection
 * chrome on this canvas is, so they stay a hairline however far out the zoom goes
 * — and that is exactly what breaks them. A 6px inset is 4% of a frame at 39% zoom
 * and 12% of the same frame at 10%, where the inset rectangle stops reading as
 * something inside the design and starts reading as a second border around it. So
 * under this width the interior gives up: the marks collapse onto the frame's own
 * edge, the sweep is dropped because there is nothing to sweep, and an edit says
 * *this frame* instead of *this block*. Zoomed that far out, that is all anyone
 * could have read anyway.
 */
const ROOM = 100;

export interface FrameSpec {
	readonly name: string;
	readonly screen?: CoffeeScreenName;
	readonly subject?: boolean;
}

/** what the hands are doing to one frame right now, read off the capture by the frame that owns this */
export interface Marks {
	/**
	 * The agent is at this frame and has not left. Not a call and not a state a call
	 * ends: it spans the dead air between two calls, which is most of this turn.
	 */
	readonly held: boolean;
	/** the row taking the whole frame in; a key rather than a flag, so each row sweeps once */
	readonly read: string | null;
	/** the frame being photographed, and whether the picture has come back */
	readonly shot: { readonly key: string; readonly landed: boolean } | null;
	/** the writes that landed in the last beat, each naming the block it landed in */
	readonly edits: readonly { readonly key: string; readonly region: RegionId }[];
}

export const NOTHING: Marks = { held: false, read: null, shot: null, edits: [] };

export function InsideField({
	frames,
	rev,
	marks,
	selected = null,
	pointed = null,
}: {
	frames: readonly FrameSpec[];
	/** how many writes have landed on the subject, which is what makes it redraw */
	rev: number;
	marks: Marks;
	selected?: string | null;
	pointed?: string | null;
}) {
	return (
		<div className="absolute inset-0">
			{frames.map((frame, index) => (
				<Slot
					key={frame.name}
					left={COLS[index] ?? 0}
					name={frame.name}
					selected={selected === frame.name}
					pointed={pointed === frame.name}
					inside={frame.subject === true ? <Interior marks={marks} width={FW} height={FH} /> : null}
				>
					<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
						{frame.subject === true ? (
							<KaffeHomeRev rev={rev} />
						) : (
							<CoffeeScreen screen={frame.screen ?? "menu"} />
						)}
					</div>
				</Slot>
			))}
		</div>
	);
}

function Slot({
	left,
	name,
	selected,
	pointed,
	inside,
	children,
}: {
	left: number;
	name: string;
	selected: boolean;
	pointed: boolean;
	inside: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="absolute flex flex-col" style={{ left, top: ROW - LABEL_LIFT, width: FW }}>
			<div className="flex h-[22px] min-w-0 items-center font-mono text-xs leading-3">
				<span className={cn("min-w-0 truncate", selected || pointed ? "text-thread" : "text-text")}>{name}</span>
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				<div className="relative overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
					{children}
					{inside}
				</div>
				{selected || pointed ? (
					<span
						className={cn(
							"pointer-events-none absolute rounded-lg border border-thread",
							selected ? "opacity-55" : "opacity-35",
						)}
						style={{ inset: -1 }}
					/>
				) : null}
			</div>
		</div>
	);
}

/**
 * Everything this direction draws, and all of it lives over the design.
 *
 * One geometry carries the lot: a rectangle inset into the frame. Presence is that
 * rectangle whole and faint, a shot is the same rectangle with only its corners
 * left and hardened, a read is a band travelling down it, and an edit is a smaller
 * rectangle inside it around the block that changed. They are one family on
 * purpose — four unrelated glyphs inside a 152px box would be four things to learn
 * in a space that cannot hold one legend.
 *
 * Nothing here is ever opaque. The largest thing drawn is the read band, 24% of the
 * frame's height at 16% of the accent at its centre and nothing at its edges; the
 * loudest is a 2px rule down the side of a block. Text under every one of them is
 * still text.
 */
function Interior({ marks, width, height }: { marks: Marks; width: number; height: number }) {
	const still = useReducedMotion() === true;
	const fine = width >= ROOM;
	const inset = fine ? 6 : 0;
	const radius = fine ? 6 : 12;
	const scale = width / NAT_W;
	const band = Math.round(height * 0.24);

	return (
		<div className="pointer-events-none absolute inset-0">
			{marks.held ? (
				<motion.span
					className="absolute border border-thread"
					style={{ inset, borderRadius: radius }}
					initial={{ opacity: 0.3 }}
					animate={still ? { opacity: 0.42 } : { opacity: [0.3, 0.55, 0.3] }}
					transition={
						still
							? { duration: 0 }
							: { duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
					}
				/>
			) : null}

			{marks.read !== null && fine && !still ? (
				<motion.span
					key={marks.read}
					className="absolute block"
					style={{
						left: inset,
						width: width - inset * 2,
						height: band,
						top: inset - band,
						background:
							"linear-gradient(180deg, rgba(245,57,26,0) 0%, rgba(245,57,26,0.16) 52%, rgba(245,57,26,0) 100%)",
					}}
					initial={{ y: 0, opacity: 0 }}
					animate={{ y: height - inset * 2 + band, opacity: [0, 1, 1, 0] }}
					transition={{
						y: { duration: 0.86, ease: [0.4, 0, 0.2, 1] },
						opacity: { duration: 0.86, times: [0, 0.14, 0.78, 1] },
					}}
				/>
			) : null}

			{marks.shot !== null ? (
				<motion.div
					key={marks.shot.key}
					className="absolute"
					initial={{ opacity: 0, top: inset, right: inset, bottom: inset, left: inset }}
					animate={
						marks.shot.landed
							? { opacity: 0, top: inset + 3, right: inset + 3, bottom: inset + 3, left: inset + 3 }
							: { opacity: 1, top: inset, right: inset, bottom: inset, left: inset }
					}
					transition={{ duration: still ? 0 : marks.shot.landed ? 0.22 : 0.16, ease: "easeOut" }}
				>
					<span className="absolute inset-0 bg-thread/[0.04]" style={{ borderRadius: radius }} />
					<Bracket corner="tl" />
					<Bracket corner="tr" />
					<Bracket corner="bl" />
					<Bracket corner="br" />
				</motion.div>
			) : null}

			{marks.edits.map((edit) => {
				const box = REGION[edit.region];
				return (
					<motion.span
						key={edit.key}
						className="absolute block"
						style={
							fine
								? { left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }
								: { inset }
						}
						initial={{ opacity: 0 }}
						animate={{ opacity: still ? 1 : [0, 1, 1, 0] }}
						transition={still ? { duration: 0 } : { duration: 1.1, times: [0, 0.07, 0.6, 1], ease: "easeOut" }}
					>
						<span className="absolute inset-0 block bg-thread/[0.07]" />
						<span className="absolute top-0 bottom-0 left-0 block w-[2px] bg-thread" />
					</motion.span>
				);
			})}
		</div>
	);
}

/** the presence rectangle with everything but one corner taken away */
const ARM = 12;

function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
	const top = corner === "tl" || corner === "tr";
	const leftSide = corner === "tl" || corner === "bl";
	const y = top ? { top: 0 } : { bottom: 0 };
	const x = leftSide ? { left: 0 } : { right: 0 };
	return (
		<>
			<span className="absolute block h-px bg-thread" style={{ ...y, ...x, width: ARM }} />
			<span className="absolute block w-px bg-thread" style={{ ...y, ...x, height: ARM }} />
		</>
	);
}
