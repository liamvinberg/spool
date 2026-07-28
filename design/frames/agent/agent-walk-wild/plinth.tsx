import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";
import type { PlayEntry } from "../../../shared/lib/turn-play";
import { CartEmptyRestrained } from "../../../shared/ui/coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * The plinth: the strip of canvas a frame stands on (#146).
 *
 * Every other candidate hangs an object off the frame and keeps it there. This
 * one takes the opposite bet: a walk that leaves the page is worth no permanent
 * ink at all, and a walk that is broken is worth all of it.
 *
 * **The channel.** Under the frame, where the selection already prints its size,
 * is the one piece of canvas that no arrow crosses and no name competes for. The
 * label above is the frame's identity and the edges are the arrow layer. The
 * floor is empty. Give a frame a floor, draw it only when it has something the
 * arrows could not say, and the resting canvas is byte for byte what it is
 * today, at four frames and at forty.
 *
 * **Two voices, one channel.**
 *
 * *Exits* answer "where does this go", so they appear when you ask about that
 * frame: on hover, and held while it is selected. One frame at a time, ever. That
 * buys the room to print whole names rather than a count, so nothing has to be
 * pressed to be read, and the press is left to mean travel and nothing else.
 *
 * *Faults* answer nothing you asked. A walk with no target is source that will
 * not run, so it is drawn like one: always, unbidden, on the frame that owns it.
 * A page carrying ten of these is a page somebody is midway through renaming, and
 * loud is the correct behaviour there.
 *
 * **The crack is the fault signal.** The accent belongs to the selection, so this
 * cannot be red. What it is instead is structural: the plinth's rule is the base
 * the frame stands on, whole under exits and split under a fault. A rule with a
 * gap in it is the most zoom-robust mark there is, it counter-scales with the
 * label so it is 1.5 by 168 pixels at 12% and at 200%, and it is the only rule
 * anywhere on the canvas. You read it from across the page without reading a word.
 *
 * **The floor is canvas, not an object.** It carries `bg-canvas` and sits above
 * the frames, so where there is nothing behind it you cannot see it at all, and
 * where a neighbour is close it reads as the canvas coming forward rather than as
 * a card landing on top. No border, no radius, no surface.
 */

/* ---------- the cast, copied so a parallel session cannot move it ---------- */

export interface Exit {
	readonly target: string;
	readonly page: string;
	readonly certainty: "will" | "might";
}

export interface Fault {
	readonly name: string;
	readonly why: "missing" | "unreadable";
}

/** where `cart` goes that no arrow on this page can reach */
export const EXITS: readonly Exit[] = [
	{ target: "checkout", page: "shop", certainty: "will" },
	{ target: "home", page: "site", certainty: "might" },
];

/** what `cart--empty` declares and never reaches */
export const FAULTS: readonly Fault[] = [
	{ name: "chekout", why: "missing" },
	{ name: "nav.tsx:12", why: "unreadable" },
];

/* ---------- the plinth ---------- */

/**
 * Screen size, like the label. The frame under it shrinks with the zoom and this
 * does not, which is the whole reason a fault stays legible at 20%.
 */
export const PLINTH_W = 166;

/** how far under the frame the rule sits, and how far when the selection's size chip is in the way */
export const PLINTH_DROP = 8;
export const PLINTH_DROP_SELECTED = 34;

/**
 * The certainty mark, which is the canvas's own edge one row long: a solid stroke
 * for a walk that will be taken, the same stroke broken for one that sits inside a
 * branch. Drawn rather than set, because `→` and `⇢` are two characters a mono
 * face renders at two different weights and the difference has to be the dashes.
 */
function EdgeMark({ certain }: { certain: boolean }) {
	return (
		<svg
			viewBox="0 0 10 8"
			className={cn("h-2 w-2.5 shrink-0", certain ? "text-muted/80" : "text-muted/45")}
			fill="none"
			aria-hidden="true"
		>
			<path d="M0.5 4h6" stroke="currentColor" strokeWidth="1.5" strokeDasharray={certain ? undefined : "2 2"} />
			<path d="m9.5 4-3-1.8v3.6Z" fill="currentColor" />
		</svg>
	);
}

function Rule({ cracked }: { cracked: boolean }) {
	if (!cracked) {
		return <span className="block h-[1.5px] w-full bg-muted/40" aria-hidden="true" />;
	}
	return (
		<span className="flex w-full items-stretch" aria-hidden="true">
			<span className="h-[1.5px] w-[34%] bg-muted/75" />
			<span className="w-[9px] shrink-0" />
			<span className="h-[1.5px] flex-1 bg-muted/75" />
		</span>
	);
}

export function Plinth({
	width = PLINTH_W,
	exits,
	faults,
	onPoint,
}: {
	width?: number | undefined;
	exits?: readonly Exit[] | undefined;
	faults?: readonly Fault[] | undefined;
	/** hovering a destination lights its page in the tree, the pairing #143 already ships */
	onPoint?: ((page: string | null) => void) | undefined;
}) {
	return (
		<div
			className="flex flex-col gap-1 bg-canvas pt-px pb-1.5"
			style={{ width }}
			onMouseLeave={onPoint === undefined ? undefined : () => onPoint(null)}
		>
			<Rule cracked={faults !== undefined} />
			<div className="flex flex-col">
				{exits?.map((exit) => (
					<button
						key={exit.target}
						type="button"
						onMouseEnter={onPoint === undefined ? undefined : () => onPoint(exit.page)}
						className="group flex h-[17px] w-full cursor-pointer items-center gap-1.5 rounded-xs pr-1 pl-0.5 text-left hover:bg-surface"
					>
						<EdgeMark certain={exit.certainty === "will"} />
						<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
							{exit.target}
						</span>
						<span className="shrink-0 font-mono text-2xs text-muted/50 leading-3">{exit.page}</span>
					</button>
				))}
				{/* a fault is not a button: there is nowhere to go, which is what
				    `inspector.tsx:564` disables these rows for */}
				{faults?.map((fault) => (
					<div key={fault.name} className="flex h-[17px] w-full items-center gap-1.5 pr-1 pl-[20px]">
						<span
							className={cn(
								"min-w-0 flex-1 truncate font-mono text-2xs text-text leading-3",
								fault.why === "missing" && "line-through decoration-text/55",
							)}
						>
							{fault.name}
						</span>
						<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{fault.why}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/* ---------- a frame on the canvas ---------- */

export interface WildFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen?: CoffeeScreenName | undefined;
	/** a frame the coffee screens do not hold, drawn at the same natural size */
	readonly render?: (() => ReactNode) | undefined;
	readonly exits?: readonly Exit[] | undefined;
	readonly faults?: readonly Fault[] | undefined;
	readonly selected?: boolean | undefined;
	/** the canvas is not repainting this one; the shipped label wears a ▸ for it */
	readonly paused?: boolean | undefined;
}

const NAT_W = 240;
const NAT_H = 520;
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

export function CanvasFrame({
	frame,
	w,
	h,
	hovered,
	onHover,
	onPoint,
}: {
	frame: WildFrame;
	w: number;
	h: number;
	hovered: boolean;
	onHover?: ((name: string | null) => void) | undefined;
	onPoint?: ((page: string | null) => void) | undefined;
}) {
	const scale = w / NAT_W;
	const selected = frame.selected === true;
	// exits are asked for; faults are told to you
	const showExits = frame.exits !== undefined && (selected || hovered);
	const standing = showExits || frame.faults !== undefined;
	const drop = selected ? PLINTH_DROP_SELECTED : PLINTH_DROP;
	return (
		<div
			className="absolute flex flex-col"
			// a floor is wider than the frame it belongs to and reaches past it, so the
			// frame that has one comes forward and its neighbours stay where they are
			style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: w, zIndex: standing ? 30 : undefined }}
			onMouseEnter={onHover === undefined ? undefined : () => onHover(frame.name)}
			onMouseLeave={onHover === undefined ? undefined : () => onHover(null)}
		>
			<div className="flex h-4 w-full min-w-0 items-center gap-1.5 pb-2.5 font-mono text-sm leading-4">
				{frame.paused === true ? <span className="shrink-0 text-2xs text-muted leading-3">▸</span> : null}
				<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-muted")}>{frame.name}</span>
				{selected ? (
					<span className="ml-auto flex shrink-0 items-center gap-1 px-1 font-mono text-2xs text-muted leading-3">
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</span>
				) : null}
			</div>
			<div className="relative" style={{ width: w, height: h }}>
				<div className="overflow-hidden rounded-lg" style={{ width: w, height: h }}>
					<div
						className="origin-top-left"
						style={{ width: NAT_W, height: NAT_H, transform: `scale(${scale})` }}
					>
						{frame.render === undefined ? <CoffeeScreen screen={frame.screen ?? "cart"} /> : frame.render()}
					</div>
				</div>
				{selected ? <FrameSelection h={h} /> : null}
				{standing ? (
					<div className="absolute left-0" style={{ top: h + drop }}>
						<Plinth exits={showExits ? frame.exits : undefined} faults={frame.faults} onPoint={onPoint} />
					</div>
				) : null}
			</div>
		</div>
	);
}

/** the shipped selection: hairline ring, four handles, the size under it */
function FrameSelection({ h }: { h: number }) {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
			{[
				"-left-[7px] -top-[7px]",
				"-right-[7px] -top-[7px]",
				"-bottom-[7px] -left-[7px]",
				"-bottom-[7px] -right-[7px]",
			].map((position) => (
				<span
					key={position}
					className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
				/>
			))}
			<span
				className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
				style={{ top: h + 12 }}
			>
				390 × 844
			</span>
		</>
	);
}

/* ---------- the window ---------- */

const SAID =
	"The header sits on 12px now and the total has a rule of its own under it. Nothing else on the page moved.";

/**
 * A turn that has landed and has nothing to do with the plinth.
 *
 * It is here so the rail is honest rather than helpful: if the agent had just
 * explained where `cart` goes, the canvas would not be carrying its own weight.
 */
const TURN: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "tighten the receipt header, the total is sitting on the rule" },
	{ key: "read", kind: "line", state: "done", verb: "read", subject: "receipt" },
	{ key: "edit", kind: "line", state: "done", verb: "edit", subject: "receipt ×2", count: 2 },
	{ key: "shot", kind: "line", state: "done", verb: "shot", subject: "receipt" },
	{ key: "said", kind: "prose", full: SAID, shown: SAID },
];

/** the shipped shell, the Pages tree, the canvas, and the agent holding the rail whole */
export function WildWindow({
	pages,
	targets,
	selected,
	zoom,
	litPage = null,
	children,
}: {
	pages: readonly PageRow[];
	targets: readonly Target[];
	selected: string;
	zoom: string;
	litPage?: string | null | undefined;
	children: ReactNode;
}) {
	const lit = pages.map((page) => ({ ...page, lit: page.name === litPage }));
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom={zoom}>
			<CanvasChrome
				pages={lit}
				selected={selected}
				tool="select"
				targets={targets}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				{children}
			</CanvasChrome>
		</SpoolShell>
	);
}

export { CartEmptyRestrained };
