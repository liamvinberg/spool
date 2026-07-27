import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen } from "../../../shared/ui/coffee-screens";
import { CanvasChrome, type PageRow, RailTabs } from "../../../shared/ui/spool-canvas-chrome";
import { CloseIcon } from "../../../shared/ui/spool-icons";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { CartEmptyTakeA, CartEmptyTakeB } from "./cart-takes";

/**
 * agent-ticker — the embedded agent with no transcript column.
 *
 * The bet: on a canvas the transcript is not the artifact, the frames are. A
 * 300px column of chat competes with the thing you came to watch, and the
 * moment the agent writes three frames the interesting information is out on
 * the field, not in the log. So the work splits three ways:
 *
 *   the rail    drives. Sessions, the changed set, the approval, the composer
 *               and its selection chip. It takes the tab the inspector already
 *               owns rather than asking for a second column, because you type
 *               into it, you do not read it.
 *   the ticker  narrates. Floating bottom-left over the canvas, the same
 *               border/blur recipe as the tool bar, because it belongs to the
 *               canvas and not to the rail. Bounded height, scrolls back
 *               through the session, newest last.
 *   the canvas  shows. Every frame the agent touched this turn wears a thread
 *               ring, and the one still being written wears a sweep instead of
 *               a badge. The sub-agent authoring three takes is a dashed
 *               enclosure around three frames, one of them still arriving.
 *
 * Division of labour between the last two: the ticker keeps time, the canvas
 * keeps state. Frames do not move, so a canvas has no spatial channel for
 * order, and encoding recency as ring brightness only reads as noise. One ring
 * level, one question answered: did the agent touch this.
 *
 * The two things a missing transcript could lose, and where they went:
 *
 *   streamed prose      is a row type in the ticker, sans against the mono
 *                       tool rows, with the caret still going. It scrolls with
 *                       everything else, so nothing is dropped, it is just no
 *                       longer resident.
 *   pending approval    docks in the rail directly above the composer, where
 *                       your hands already are, with the command verbatim and
 *                       two buttons. Its ticker row wears the same thread
 *                       spine, so the log says a decision is waiting and the
 *                       rail is the only place it can be made.
 *
 * One detail worth keeping: `cart` carries a ring but is not in the rail's
 * changed set, because its own source never changed. `shared/ui/checkout-bar.tsx`
 * did. The canvas marks what changed on screen, the rail lists what changed on
 * disk, and shared files that have no frame of their own only ever surface in
 * the rail. That gap is why both exist.
 */

/* ---------- geometry ---------- */

/** frames are authored 240x520 and drawn at 40% of their real 390x844 */
const NAT_W = 240;
const NAT_H = 520;
const FW = 156;
const FH = 338;
const SCALE = FW / NAT_W;
/** where the shipped selection readout sits: just under the frame, clear of its ring */
const TAG_TOP = FH + 12;
/**
 * One ring level, not a recency ramp. Frames do not move, so brightness is the
 * only channel a canvas has for order, and three steps of red on near-black
 * read as noise rather than as a sequence. So the ring answers one question
 * only, "did the agent touch this in this turn", and the ticker keeps time.
 */
const RING = 0.5;

const TICKER_W = 360;

/* the shipped page list, unchanged except that the turn's four new frames have
   already landed in the tree: the rail reads the same disk the canvas does */
const PAGES: readonly PageRow[] = [
	{
		name: "app",
		frames: ["cart", "cart--empty", "cart--empty-b", "cart--empty-c", "cart--old", "menu", "receipt"],
		active: true,
		open: true,
	},
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

/* ---------- frame ---------- */

export default function AgentTickerFrame() {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="40%">
			<CanvasChrome pages={PAGES} selected="cart" tool="select" railLabel="Agent" rail={<AgentRail />}>
				<CanvasField />
				<Ticker />
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- the canvas: where the turn actually lands ---------- */

function CanvasField() {
	return (
		<div className="absolute inset-0">
			{/* the sub-agent, made spatial: one enclosure, three frames, one of
			    them still arriving. Three lines of log would say less. */}
			<div
				className="absolute rounded-lg border border-thread/25 border-dashed"
				style={{ left: 364, top: 140, width: 522, height: 406 }}
			/>
			<div className="absolute flex items-center gap-2" style={{ left: 366, top: 122 }}>
				<LivePip />
				<span className="font-mono text-2xs text-thread/85 leading-3">agent</span>
				<span className="font-mono text-2xs text-muted/50 leading-3">·</span>
				<span className="font-mono text-2xs text-muted leading-3">3 variants</span>
			</div>

			{/* cart's own source never changed; the shared bar under it did, so the
			    ring says repainted and the rail carries the diff */}
			<FrameBox left={20} top={140} name="cart" badge="repainted" ring={RING} holdsSelection overlay={<ElementSelection />}>
				<CoffeeScreen screen="cart" />
			</FrameBox>

			<FrameBox left={192} top={140} name="cart--old" dim dashed tag="delete pending">
				<CoffeeScreen screen="cart" />
			</FrameBox>

			<FrameBox left={374} top={194} name="cart--empty" badge="new" ring={RING}>
				<CartEmptyTakeA />
			</FrameBox>

			<FrameBox left={546} top={194} name="cart--empty-b" badge="new" ring={RING}>
				<CartEmptyTakeB />
			</FrameBox>

			<FrameBox left={718} top={194} name="cart--empty-c" badge="writing" ring={RING} writing>
				<div className="h-full w-full rounded-lg border border-[#E4E4E7] bg-[#FEFEFE]" />
			</FrameBox>
		</div>
	);
}

function FrameBox({
	left,
	top,
	name,
	badge,
	ring,
	dim = false,
	dashed = false,
	writing = false,
	holdsSelection = false,
	tag,
	overlay,
	children,
}: {
	left: number;
	top: number;
	name: string;
	badge?: string;
	/** opacity of the just-written ring: recency, read as brightness */
	ring?: number;
	dim?: boolean;
	dashed?: boolean;
	writing?: boolean;
	holdsSelection?: boolean;
	/** the shipped readout chip, under the frame where the size tag sits */
	tag?: string;
	/** spool's own chrome over the frame, drawn at screen scale like the real canvas */
	overlay?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top: top - 18, width: FW }}>
			<div className="flex min-w-0 items-center gap-1.5 font-mono text-xs leading-3">
				{writing ? (
					<LivePip />
				) : ring === undefined ? (
					<span className="h-[5px] w-[5px] shrink-0 rounded-full border border-thread/50" />
				) : (
					<span className="h-[5px] w-[5px] shrink-0 rounded-full bg-thread" style={{ opacity: 0.35 + ring }} />
				)}
				<span className={cn("min-w-0 shrink truncate", holdsSelection ? "text-thread" : "text-text")}>{name}</span>
				{badge === undefined ? null : (
					<span className="ml-auto shrink-0 truncate font-mono text-2xs text-muted leading-3">{badge}</span>
				)}
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				<div className={cn("overflow-hidden rounded-lg", dim && "opacity-40")} style={{ width: FW, height: FH }}>
					<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${SCALE})` }}>
						{children}
					</div>
				</div>
				{ring === undefined ? null : (
					<span
						className="pointer-events-none absolute -inset-[3px] rounded-[13px] border border-thread"
						style={{ opacity: ring }}
					/>
				)}
				{dashed ? (
					<span className="pointer-events-none absolute -inset-[3px] rounded-[13px] border border-thread/50 border-dashed" />
				) : null}
				{writing ? <WriteSweep /> : null}
				{overlay}
				{tag === undefined ? null : (
					<span
						className="-translate-x-1/2 pointer-events-none absolute left-1/2 whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
						style={{ top: TAG_TOP }}
					>
						{tag}
					</span>
				)}
			</div>
		</div>
	);
}

/** the file is still being written, so the frame is up but has nothing to paint */
function WriteSweep() {
	const reduced = useReducedMotion();
	return (
		<span className="pointer-events-none absolute top-3 right-3 left-3 h-[2px] overflow-hidden rounded-full bg-thread/20">
			<motion.span
				className="absolute inset-y-0 w-12 rounded-full bg-thread"
				initial={{ x: -48 }}
				animate={reduced === true ? { x: FW / 2 - 48 } : { x: [-48, FW - 24] }}
				transition={{ duration: 2.4, repeat: reduced === true ? 0 : Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			/>
		</span>
	);
}

/**
 * What the chip in the composer points at, drawn where it lives. Selection
 * chrome is spool's, so it sits above the scaled frame at screen scale: a 1px
 * outline stays 1px however far out the canvas is zoomed.
 */
function ElementSelection() {
	const box = { left: 16 * SCALE, top: (NAT_H - 46) * SCALE, width: (NAT_W - 32) * SCALE, height: 30 * SCALE };
	return (
		<>
			<span className="pointer-events-none absolute rounded-[3px] border border-thread" style={box} />
			<span
				className="pointer-events-none absolute whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
				style={{ left: box.left, top: TAG_TOP }}
			>
				checkout-bar
			</span>
		</>
	);
}

/* ---------- the ticker: the turn, narrated, over the canvas ---------- */

const VARIANTS = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

function Ticker() {
	return (
		<div
			className="absolute bottom-6 left-6 z-20 flex flex-col overflow-hidden rounded-lg border border-border-raised bg-bg/90 backdrop-blur"
			style={{ width: TICKER_W }}
		>
			{/* the session keeps going above the fold: the strip scrolls, so the turn
			    before this one is clipped rather than gone */}
			<div className="relative h-[22px] shrink-0 overflow-hidden">
				<div className="absolute inset-x-3 top-[7px] flex items-center gap-2 opacity-30">
					<span className="h-[5px] w-[5px] shrink-0 rounded-full border border-muted" />
					<span className="w-[46px] shrink-0 font-mono text-muted text-xs leading-3">write</span>
					<span className="truncate font-mono text-text text-xs leading-3">frames/app/cart/frame.tsx</span>
				</div>
				<div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-bg to-transparent" />
			</div>

			<div className="flex flex-col gap-1.5 px-3 pb-1">
				<div className="flex items-baseline gap-1.5">
					<span className="shrink-0 font-mono text-muted/70 text-sm leading-base">&gt;</span>
					<p className="min-w-0 flex-1 text-base text-text leading-base">now try three variants of the empty state</p>
					<span className="shrink-0 font-mono text-2xs text-muted leading-3">0:14</span>
				</div>
				<div className="flex items-center gap-1.5 pl-[13px] font-mono text-2xs leading-3">
					<span className="text-muted">cart</span>
					<span className="text-muted/40">·</span>
					<span className="text-thread/85">checkout-bar</span>
					<span className="text-muted/40">·</span>
					<span className="text-muted">34-41</span>
				</div>
			</div>

			<div className="mx-3 my-2 h-px bg-border" />

			{/* streamed prose is a row type, not a column: sans against the mono
			    tool rows, caret still going, scrolling with everything else */}
			<p className="px-3 text-text text-xs leading-xs">
				Reading the cart frame and the shared bar, then branching three takes
				<Caret />
			</p>

			<div className="flex flex-col pt-2 pb-2">
				<Step state="done" verb="read" target="frames/app/cart/frame.tsx" />
				<Step state="done" verb="edit" target="shared/ui/checkout-bar.tsx" meta="+6 -2" />
				<Step state="run" verb="grep" target="checkout-bar" meta="design/" />
				{/* the names, verbatim, so the eye can carry them out to the three
				    frames on the field and back */}
				<Step state="run" verb="agent" target="3 variants">
					<div className="flex items-center gap-1 pt-1">
						{VARIANTS.map((name) => (
							<span
								key={name}
								className="rounded-xs border border-border-raised bg-surface px-1 py-[2px] font-mono text-2xs text-muted leading-3"
							>
								{name}
							</span>
						))}
					</div>
				</Step>
				{/* the block itself: same thread spine the rail's approval wears, so
				    the log says a decision is waiting and points at where it lives */}
				<div className="relative mt-1.5 bg-thread/[0.07] py-1.5 pr-3 pl-3">
					<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
					<div className="flex items-center gap-2">
						<span className="h-[5px] w-[5px] shrink-0 rounded-full bg-thread" />
						<span className="w-[46px] shrink-0 font-mono text-thread text-xs leading-3">ask</span>
						<span className="font-mono text-2xs text-muted leading-3">answer in the rail</span>
					</div>
					<p className="truncate pt-1 pl-[27px] font-mono text-text text-xs leading-3">
						rm -rf design/frames/app/cart--old
					</p>
				</div>
			</div>
		</div>
	);
}

function Step({
	state,
	verb,
	target,
	meta,
	children,
}: {
	state: "done" | "run";
	verb: string;
	target: string;
	meta?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="px-3 py-1">
			<div className="flex items-center gap-2">
				{state === "run" ? (
					<LivePip />
				) : (
					<span className="h-[5px] w-[5px] shrink-0 rounded-full border border-muted/55" />
				)}
				<span className="w-[46px] shrink-0 font-mono text-muted text-xs leading-3">{verb}</span>
				<span className={cn("min-w-0 truncate font-mono text-xs leading-3", state === "run" ? "text-text" : "text-muted")}>
					{target}
				</span>
				{meta === undefined ? null : (
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/70 leading-3">{meta}</span>
				)}
			</div>
			{children === undefined ? null : <div className="pl-[27px]">{children}</div>}
		</div>
	);
}

/* ---------- the rail: everything you need to drive, nothing to read ---------- */

const PRIOR_SESSIONS: readonly { label: string; frames: string }[] = [
	{ label: "checkout bar sticky", frames: "2 frames" },
	{ label: "empty states", frames: "3 frames" },
	{ label: "portal chip copy", frames: "1 frame" },
];

const CHANGED: readonly { name: string; dir?: string; meta: string; live?: boolean; pending?: boolean }[] = [
	{ name: "checkout-bar.tsx", dir: "shared/ui/", meta: "+6 -2" },
	{ name: "cart--empty", meta: "new" },
	{ name: "cart--empty-b", meta: "new" },
	{ name: "cart--empty-c", meta: "writing", live: true },
	{ name: "cart--old", meta: "delete pending", pending: true },
];

function AgentRail() {
	return (
		<>
			{/* the agent takes the tab the inspector already had: a cockpit this thin
			    does not need a column of its own, and the strip stays the strip */}
			<RailTabs tabs={["agent", "elements", "connections"]} active="agent" />
			<Sessions />
			<TurnFiles />
			<Approval />
			<Composer />
		</>
	);
}

function RailLabel({ children, count }: { children: string; count: number | string }) {
	return (
		<div className="flex items-center justify-between px-4 pt-2 pb-1">
			<span className="font-mono text-2xs text-muted leading-3">{children}</span>
			<span className="font-mono text-2xs text-muted/45 leading-3">{count}</span>
		</div>
	);
}

function Sessions() {
	return (
		<div className="shrink-0 border-border border-b pb-2">
			<RailLabel count={PRIOR_SESSIONS.length + 1}>sessions</RailLabel>
			<div className="relative flex flex-col gap-0.5 bg-surface py-1.5 pr-3 pl-4">
				<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
				<span className="truncate font-mono text-sm text-text leading-sm">cart empty state</span>
				<div className="flex items-center gap-2">
					<LivePip />
					<span className="font-mono text-2xs text-muted leading-3">running</span>
					{/* stop belongs on the session it kills, the way play lives on the
					    selection rather than guessing from a bar */}
					<button
						type="button"
						className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-xs border border-border-raised px-1.5 py-[2px] font-mono text-2xs text-muted leading-3 transition-colors hover:border-thread/60 hover:text-thread"
					>
						<span className="h-[6px] w-[6px] rounded-[1px] bg-current" />
						stop
					</button>
				</div>
			</div>
			{PRIOR_SESSIONS.map((session) => (
				<div key={session.label} className="flex h-7 items-center gap-2 pr-3 pl-4">
					<span className="min-w-0 flex-1 truncate font-mono text-muted text-sm leading-sm">{session.label}</span>
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{session.frames}</span>
				</div>
			))}
		</div>
	);
}

function TurnFiles() {
	return (
		/* the live end of the rail collects at the bottom, next to the composer
		   and the hands, and the quiet sits above it as its own bounded band */
		<div className="flex min-h-0 flex-1 flex-col justify-end">
			<div className="border-border border-t pb-3">
				<RailLabel count={CHANGED.length}>this turn</RailLabel>
				{CHANGED.map((row) => (
					<div key={row.name} className="flex items-start gap-2 py-1 pr-3 pl-4">
						<div className="flex min-w-0 flex-1 flex-col">
							<span className={cn("truncate font-mono text-sm leading-sm", row.pending === true ? "text-muted" : "text-text")}>
								{row.name}
							</span>
							{/* the one file with no frame of its own, so the rail is the
							    only place it can ever appear */}
							{row.dir === undefined ? null : (
								<span className="truncate font-mono text-2xs text-muted/50 leading-3">{row.dir}</span>
							)}
						</div>
						{row.live === true ? <LivePip className="mt-1.5" /> : null}
						<span
							className={cn(
								"mt-[3px] shrink-0 font-mono text-2xs leading-3",
								row.pending === true ? "text-thread/85" : "text-muted/70",
							)}
						>
							{row.meta}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function Approval() {
	return (
		<div className="relative shrink-0 border-border border-t bg-surface px-4 py-3">
			<span className="absolute top-3 bottom-3 left-0 w-[2px] rounded-full bg-thread" />
			<div className="flex items-center gap-2">
				<span className="h-[5px] w-[5px] shrink-0 rounded-full bg-thread" />
				<span className="font-mono text-thread text-xs leading-3">waiting on you</span>
			</div>
			<p className="break-all pt-2 font-mono text-sm text-text leading-sm">rm -rf design/frames/app/cart--old</p>
			<div className="flex items-center gap-1.5 pt-2.5">
				<button
					type="button"
					className="flex h-7 cursor-pointer items-center rounded-sm bg-thread px-2.5 font-mono text-2xs text-on-thread leading-3 transition-opacity hover:opacity-90"
				>
					allow once
				</button>
				<button
					type="button"
					className="flex h-7 cursor-pointer items-center rounded-sm border border-border-raised px-2.5 font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
				>
					deny
				</button>
			</div>
		</div>
	);
}

function Composer() {
	return (
		<div className="shrink-0 border-border border-t px-3 pt-2.5 pb-3">
			{/* what the human last pointed at, pushed into the prompt invisibly and
			    shown here so it is never a surprise */}
			<div className="flex w-fit max-w-full items-center gap-1.5 rounded-sm border border-border-raised bg-raised py-1 pr-1.5 pl-2 font-mono text-2xs leading-3">
				<span className="h-[5px] w-[5px] shrink-0 rounded-full bg-thread" />
				<span className="text-muted">cart</span>
				<span className="text-muted/40">·</span>
				<span className="text-text">checkout-bar</span>
				<span className="text-muted/40">·</span>
				<span className="text-muted">34-41</span>
				<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted/60">
					<CloseIcon className="h-2 w-2" />
				</span>
			</div>
			<div className="mt-2 rounded-md border border-border-raised bg-surface px-2.5 pt-2 pb-1.5">
				<p className="text-base text-muted/55 leading-base">describe the change</p>
				<div className="flex items-center justify-end pt-2">
					<span className="font-mono text-2xs text-muted/50 leading-3">&#8629; queue</span>
				</div>
			</div>
		</div>
	);
}

/* ---------- shared pieces ---------- */

function LivePip({ className }: { className?: string }) {
	const reduced = useReducedMotion();
	return (
		<motion.span
			className={cn("h-[5px] w-[5px] shrink-0 rounded-full bg-thread", className)}
			animate={reduced === true ? { opacity: 1 } : { opacity: [1, 0.3, 1] }}
			transition={{ duration: 1.6, repeat: reduced === true ? 0 : Number.POSITIVE_INFINITY, ease: "easeInOut" }}
		/>
	);
}

function Caret() {
	const reduced = useReducedMotion();
	return (
		<motion.span
			className="ml-[3px] inline-block h-[10px] w-[4px] translate-y-[1px] rounded-[1px] bg-thread/80 align-baseline"
			animate={reduced === true ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
			transition={{
				duration: 1,
				times: [0, 0.49, 0.5, 1],
				repeat: reduced === true ? 0 : Number.POSITIVE_INFINITY,
				ease: "linear",
			}}
		/>
	);
}
