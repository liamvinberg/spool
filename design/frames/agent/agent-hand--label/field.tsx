import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";

/**
 * The canvas, and the label that is the whole of this direction.
 *
 * It is its own copy rather than `shared/ui/spool-play-field.tsx` because the one
 * thing being changed lives inside that file's private `Slot`, and this page's
 * rule is that a direction owns its own mark. Geometry, ring and screen scale are
 * that file's unchanged, so what differs between this frame and its siblings is
 * the label row and nothing else.
 *
 * **The label is drawn at screen size over a frame drawn at 39%.** That is not a
 * flourish here, it is the property the direction rests on:
 * `src/ui/canvas/frame-label.tsx:38` counter-scales the whole row by `1/k` and
 * pre-multiplies its layout width by `k`, so the words stay 12px and the row stays
 * exactly as wide as the frame however far out the canvas is zoomed. A stroke on
 * the frame shrinks with the frame. A word does not.
 */

const NAT_W = 240;
const NAT_H = 520;
const FW = 152;
const FH = 329;
const S = FW / NAT_W;

/** three frames centred in the 772px the pages rail and the agent rail leave */
const COLS = [114, 310, 506] as const;
const ROW = 264;
/** the label row plus the 10px it stands off the frame, `frame-label.tsx`'s own `pb-2.5` */
const LABEL_LIFT = 22;

export interface FieldFrame {
	readonly name: string;
	readonly screen?: CoffeeScreenName | undefined;
	readonly render?: (() => ReactNode) | undefined;
}

export function HandField({
	frames,
	hand,
	verb,
	selected = null,
	pointed = null,
}: {
	frames: readonly FieldFrame[];
	/** the frame the agent is on, which outlives any one call it makes there */
	hand?: string | null | undefined;
	/** what it is doing on that frame this second, or null in the dead air between calls */
	verb?: string | null | undefined;
	selected?: string | null | undefined;
	pointed?: string | null | undefined;
}) {
	return (
		<div className="absolute inset-0">
			<Threads count={frames.length} />
			{frames.map((frame, index) => (
				<Slot
					key={frame.name}
					left={COLS[index] ?? 0}
					frame={frame}
					held={hand === frame.name}
					verb={hand === frame.name ? (verb ?? null) : null}
					selected={selected === frame.name}
					pointed={pointed === frame.name}
				/>
			))}
		</div>
	);
}

function Slot({
	left,
	frame,
	held,
	verb,
	selected,
	pointed,
}: {
	left: number;
	frame: FieldFrame;
	held: boolean;
	verb: string | null;
	selected: boolean;
	pointed: boolean;
}) {
	/*
	 * Three states on one axis, and the axis is already there.
	 *
	 * `frame-label.tsx:50` draws a resting name at `text-muted` and only lifts it to
	 * `text-text` under the pointer, so the canvas's quiet strength is the *name's*
	 * strength and the loud one is unspent. This takes it:
	 *
	 *   one word, muted            a frame, and nothing is happening to it
	 *   two words, second muted    the agent is here and is not in a call
	 *   two words, second at text  the agent is doing this, right now
	 *
	 * No colour is added, no stroke, and no frame of motion — a word swap is an
	 * instant cut, because at 12px a crossfade is two words on top of each other and
	 * neither of them is readable. That is why `prefers-reduced-motion` costs this
	 * direction nothing: there is nothing here to turn off.
	 *
	 * The accent stays the selection's. It is the one strength above `text-text` and
	 * spending it on the agent would leave the human's own mark with nowhere louder
	 * to go.
	 */
	const marked = selected || pointed;
	return (
		<div className="absolute flex flex-col" style={{ left, top: ROW - LABEL_LIFT, width: FW }}>
			{/*
			 * The gap is 10px and it was 6px first, which is `frame-label.tsx`'s own and is
			 * wrong here for a reason worth writing down: Fragment Mono advances 7.06px at
			 * 12px, so a 6px gap is *tighter than a word space* and `home working` read as
			 * one compound name. Ten is a space and a half and the two words separate.
			 */}
			<div className="flex h-[22px] w-full min-w-0 items-center gap-2.5 font-mono text-sm leading-3">
				<span className={cn("min-w-0 truncate", marked ? "text-thread" : "text-muted")}>{frame.name}</span>
				{/*
				 * The verb never truncates and the name always can, which is #184's shape
				 * exactly: the identity gives way and the transient fact stays whole. Fragment
				 * Mono at 12px advances 7.06px, so this 152px row holds 21 characters:
				 * `home edit ×6` wants 84 and has 68 to spare, and the row only ever runs out
				 * on a name as long as `cart--empty-c` under a run past ten.
				 */}
				{verb !== null ? <span className="shrink-0 text-text">{verb}</span> : null}
				{verb === null && held ? <span className="shrink-0 text-muted">working</span> : null}
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				<div className="overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
					<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
						{frame.render === undefined ? <CoffeeScreen screen={frame.screen ?? "menu"} /> : frame.render()}
					</div>
				</div>
				{marked ? (
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

/** the page's own walks, drawn the way the canvas draws them, so the frames read as a site */
function Threads({ count }: { count: number }) {
	const edges = Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
		const from = COLS[index] ?? 0;
		const to = COLS[index + 1] ?? 0;
		const x1 = from + FW + 3;
		const y1 = ROW + 158;
		const x2 = to - 9;
		const y2 = ROW + 186;
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
