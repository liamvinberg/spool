import type { ReactNode } from "react";
import { useState } from "react";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { cn } from "shared/lib/utils";
import { CartEmptyRestrained } from "shared/ui/demo/coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "shared/ui/spool/canvas-chrome";
import { ConnectionsIcon } from "shared/ui/spool/icons";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * agent-walk-ambient — the flow map draws everything it knows, always (#146).
 *
 * The canvas already draws every walk it can reach with an arrow. Two facts it
 * knows and cannot draw that way: a walk that lands on another page, and a walk
 * whose destination does not exist. Every candidate before this one tried to earn
 * those two facts back with a gesture — a verb on the label, a hover, a lens, a
 * selection. This one pays for them out of the layer that already exists. Off-page
 * walks and broken walks are drawn at rest, on every frame that has them, and the
 * threads toggle that already governs the arrows governs them too.
 *
 * **Tags dock, never float.** A walk that leaves the page is a short leader off the
 * frame's wall ending in a mono tag welded to that frame's geometry, the way the
 * name row is welded 10px above it. It moves when the frame moves and it is never
 * out in the field looking for its owner. The leader is the coaching layer's, one
 * for one: 2.5px anchor dot, 1px hairline, one bend, mono label at the end
 * (`site-hub--composed`). What is different is the reach — 20 pixels, not 60. A
 * coaching annotation points across a page it owns; a tag belongs to a rectangle
 * with neighbours on four sides.
 *
 * **A tag is ink at rest and a surface under the pointer.** This layer is always
 * on, so it has to cost what the label costs: mono text on canvas, no border, no
 * fill, nothing to un-see. The press affordance arrives with the pointer, because
 * pressing a tag travels — the page follows, the arrival is centred, the target
 * ends up selected — and a thing that travels has to look pressable while you are
 * about to press it and not before. Ten chips on one page is a rash; ten labels is
 * a page with ten labels on it.
 *
 * **Broken is the same drawing, fault-toned, and the terminator is why.** An
 * off-page leader runs into its tag: the tag is a door. A broken leader stops
 * dead — a cross where the name answers to nothing, a bar where the parser could
 * not read the site — and its tag sits past the stop as a report rather than a
 * destination. So the reason it cannot be pressed is drawn instead of discovered.
 * It stays grey and takes full text strength instead: the accent is the
 * selection's, and on a healthy canvas the only loud thing is a fault.
 *
 * **Below readable size the tags degrade to nubs.** The canvas already draws less
 * once frames stop being readable, and this layer obeys the same law: the words go
 * and the stub on the wall stays, so the shape of the page — which frames leave it,
 * how often — survives all the way out. Fault stubs keep their terminator, which is
 * the whole point of having one: at 15% you cannot read `chekout`, and you can still
 * see the walk that stops.
 *
 * **Nothing here waits for a selection.** Not the tags, not the faults, not the
 * nubs. The Pages tree can already speak for the frame you picked (#144); what it
 * has never been able to do is speak for the twenty-nine you did not, and it has no
 * way at all to say a walk is broken. That gap is the whole ticket, so the answer
 * cannot itself be gated on picking something.
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

/* ---------- the frame under it ---------- */

const NAT_W = 240;
const NAT_H = 520;
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

export type Side = "right" | "left";

/**
 * Where a frame's walks dock.
 *
 * `anchor` and `tag` are both measured down from the frame's own top edge, so the
 * whole block travels with the frame and the drawing survives a drag. They are two
 * numbers rather than one because the leader has to bend: the anchor sits where the
 * walks leave the wall, the tag sits where there is room for words, and the bend is
 * the sentence joining them.
 */
export interface Dock {
	readonly side: Side;
	readonly anchor: number;
	readonly tag: number;
}

export interface AmbientFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen?: CoffeeScreenName | undefined;
	/** a frame the coffee screens do not hold, drawn at the same natural size */
	readonly render?: (() => ReactNode) | undefined;
	readonly exits?: readonly Exit[] | undefined;
	readonly faults?: readonly Fault[] | undefined;
	readonly dock?: Dock | undefined;
	/** the canvas is not repainting this one; the shipped label wears a ▸ for it */
	readonly paused?: boolean | undefined;
}

/* ---------- the leader's geometry ---------- */

/** the diagonal step off the wall, where the one bend lands */
const BEND = 11;
/** where the leader ends: docked short, a third of the reach the coaching layer takes */
const REACH = 20;
/**
 * A fault's stop stands well off its tag. Six pixels was drawn first and is the
 * reason this is nine: a stop that close to the last word reads as punctuation
 * rather than as the end of a line.
 */
const TERM_GAP = 9;
/** a tag is the label row's line box, so a tag and a name read as one family */
const TAG_H = 18;
/** walks on one wall stack, and the pitch is one tag plus the gap between two */
const TAG_STEP = 21;
/** the anchors sit tighter than the tags: the wall is short and the fan does the spreading */
const ANCHOR_STEP = 13;

/** the hairline's two strengths — a fault is heavier ink, never a different colour */
const HAIRLINE = {
	exit: "color-mix(in srgb, var(--color-text) 30%, transparent)",
	fault: "color-mix(in srgb, var(--color-text) 55%, transparent)",
} as const;

const DEFAULT_DOCK: Dock = { side: "right", anchor: 0, tag: 0 };

/** the widest tag this cast draws: `→ checkout · shop` at 10px mono with its padding */
export const WIDEST_TAG = 118;

/**
 * When a tag stops being worth its ink.
 *
 * The rule scales itself rather than naming a zoom. A tag is screen size and the
 * frame it docks to is not, so there is a point where the words are wider than the
 * rectangle they belong to — past it they are no longer labelling a frame, they are
 * covering the page. A 390-wide frame reaches 118 pixels at 30% zoom, which sits
 * comfortably under the 41% a page is read at and well over the 15% a page is
 * surveyed at, so the degrade lands where nobody was reading words anyway.
 */
export function walkSize(frameWidth: number): "readable" | "nub" {
	return frameWidth >= WIDEST_TAG ? "readable" : "nub";
}

interface Placed {
	readonly key: string;
	readonly exit: Exit | null;
	readonly fault: Fault | null;
	readonly side: Side;
	readonly d: string;
	/** the anchor, on the wall */
	readonly ax: number;
	readonly ay: number;
	/** the leader's far end: where a tag begins, or where a broken walk stops */
	readonly ex: number;
	readonly ey: number;
	readonly tagX: number;
}

/**
 * One frame's walks, from its own coordinates into the canvas's.
 *
 * The diagonal is what lets a stack fan: two anchors 13 pixels apart on the wall
 * reach two tags 23 apart, and the leaders spread rather than run parallel into each
 * other's labels. Half-pixel offsets keep a 1px stroke on one device pixel.
 */
function place(frame: AmbientFrame, w: number): readonly Placed[] {
	const dock = frame.dock ?? DEFAULT_DOCK;
	const dir = dock.side === "right" ? 1 : -1;
	const wall = frame.x + (dock.side === "right" ? w : 0);
	const rows: readonly { key: string; exit: Exit | null; fault: Fault | null }[] = [
		...(frame.exits ?? []).map((exit) => ({ key: `exit:${exit.target}`, exit, fault: null })),
		...(frame.faults ?? []).map((fault) => ({ key: `fault:${fault.name}`, exit: null, fault })),
	];
	return rows.map((row, index) => {
		const ay = frame.y + dock.anchor + index * ANCHOR_STEP;
		const ey = frame.y + dock.tag + index * TAG_STEP;
		const bx = wall + dir * BEND;
		const ex = wall + dir * REACH;
		return {
			key: row.key,
			exit: row.exit,
			fault: row.fault,
			side: dock.side,
			d: `M ${wall + 0.5} ${ay + 0.5} L ${bx + 0.5} ${ey + 0.5} L ${ex + 0.5} ${ey + 0.5}`,
			ax: wall,
			ay,
			ex,
			ey,
			tagX: row.fault === null ? ex : ex + dir * TERM_GAP,
		};
	});
}

/* ---------- the marks a leader carries ---------- */

/**
 * The certainty mark: the canvas's own edge, one row long. Solid for a walk that
 * will be taken, the same stroke broken for one inside a branch — drawn rather than
 * set, because `→` and `⇢` are two characters a mono face renders at two different
 * weights and the difference has to be the dashes.
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

/**
 * The stop, at the end of a leader that goes nowhere.
 *
 * One shape for both kinds of fault, and it is the same two strokes the rail settles
 * a failed call with. A bar was drawn for `unreadable` first, so that the two kinds
 * differed without words, and it lost: a vertical rule sitting after `unreadable`
 * reads as a text caret, not as a line that stopped. Which kind of broken it is
 * belongs to the words, which is where the difference is actionable — the stop only
 * has to survive to the far side of the page, and eight pixels of crossed stroke do.
 */
function Terminator({ x, y }: { x: number; y: number }) {
	return (
		<path
			d={`M${x - 3.6} ${y - 3.6}L${x + 3.6} ${y + 3.6}M${x + 3.6} ${y - 3.6}L${x - 3.6} ${y + 3.6}`}
			stroke="var(--color-muted)"
			strokeWidth={1.4}
			strokeLinecap="round"
		/>
	);
}

/* ---------- the docked tags ---------- */

function tagBox(placed: Placed) {
	return {
		left: placed.tagX,
		top: placed.ey - TAG_H / 2,
		height: TAG_H,
		...(placed.side === "left" ? { transform: "translateX(-100%)" } : {}),
	};
}

/**
 * A walk that leaves the page: an address, and pressing it travels.
 *
 * `bg-canvas` rather than nothing, so a tag that ends up over a neighbour on a page
 * somebody packed tighter than this one stays readable instead of becoming two fonts
 * on top of each other. On open canvas it is invisible, which is the point.
 */
function ExitTag({
	exit,
	placed,
	lit,
	onPoint,
}: {
	exit: Exit;
	placed: Placed;
	lit: boolean;
	onPoint?: ((page: string | null) => void) | undefined;
}) {
	return (
		<button
			type="button"
			title={`go to ${exit.target} on ${exit.page}`}
			onMouseEnter={onPoint === undefined ? undefined : () => onPoint(exit.page)}
			onMouseLeave={onPoint === undefined ? undefined : () => onPoint(null)}
			className={cn(
				"absolute z-20 flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs px-1.5 font-mono text-2xs leading-3 transition-colors duration-150",
				lit ? "bg-surface" : "bg-canvas",
			)}
			style={tagBox(placed)}
		>
			<EdgeMark certain={exit.certainty === "will"} />
			<span className={lit ? "text-text" : "text-text/85"}>{exit.target}</span>
			<span className="text-muted/40">·</span>
			<span className={lit ? "text-muted" : "text-muted/70"}>{exit.page}</span>
		</button>
	);
}

/**
 * A walk with nothing at the other end. Not a button: there is nowhere to go, which
 * is what `inspector.tsx:564` disables these rows for. Full text strength, and the
 * name struck exactly the way the inspector strikes it.
 */
function FaultTag({ fault, placed }: { fault: Fault; placed: Placed }) {
	return (
		<div
			className="absolute z-20 flex items-center gap-2 whitespace-nowrap bg-canvas px-1.5 font-mono text-2xs leading-3"
			style={tagBox(placed)}
		>
			<span className={cn("text-text", fault.why === "missing" && "line-through decoration-text/55")}>
				{fault.name}
			</span>
			<span className="text-muted/75">{fault.why}</span>
		</div>
	);
}

/* ---------- what a tag becomes below readable size ---------- */

const NUB_LEN = 10;
const NUB_FAULT_LEN = 8;
const NUB_STEP = 6;

/**
 * The nub: the leader with its words taken away.
 *
 * No bend, because there is nothing to bend towards, and no fan, because six pixels
 * of stack is a fan nobody can read. What survives is that walks leave this wall and
 * how many — and, on a fault, the stop, at exactly the size it had when the words
 * were still there. The stub is 1.25px against the hairline's 1px: it is the only
 * thing left, so it may carry a quarter pixel more ink than the drawing it replaces.
 */
function Nubs({ frame, w }: { frame: AmbientFrame; w: number }) {
	const dock = frame.dock ?? DEFAULT_DOCK;
	const dir = dock.side === "right" ? 1 : -1;
	const wall = frame.x + (dock.side === "right" ? w : 0);
	return (
		<>
			{place(frame, w).map((placed, index) => {
				const y = frame.y + dock.anchor + index * NUB_STEP;
				const end = wall + dir * (placed.fault === null ? NUB_LEN : NUB_FAULT_LEN);
				return (
					<g key={placed.key}>
						<circle cx={wall + 0.5} cy={y + 0.5} r={1.5} fill="var(--color-muted)" fillOpacity={0.8} />
						<path
							d={`M ${wall + 0.5} ${y + 0.5} L ${end + 0.5} ${y + 0.5}`}
							stroke={placed.fault === null ? HAIRLINE.exit : HAIRLINE.fault}
							strokeWidth={1.25}
						/>
						{placed.fault === null ? null : <Terminator x={end + dir * 3} y={y} />}
					</g>
				);
			})}
		</>
	);
}

/* ---------- a frame on the canvas ---------- */

export function CanvasFrame({ frame, w, h }: { frame: AmbientFrame; w: number; h: number }) {
	const scale = w / NAT_W;
	return (
		<div className="absolute flex flex-col" style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: w }}>
			<div className="flex h-4 w-full min-w-0 items-center gap-1.5 pb-2.5 font-mono text-sm leading-4">
				{frame.paused === true ? <span className="shrink-0 text-2xs text-muted leading-3">▸</span> : null}
				<span className="min-w-0 truncate text-muted">{frame.name}</span>
			</div>
			<div className="overflow-hidden rounded-lg" style={{ width: w, height: h }}>
				<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${scale})` }}>
					{frame.render === undefined ? <CoffeeScreen screen={frame.screen ?? "cart"} /> : frame.render()}
				</div>
			</div>
		</div>
	);
}

/* ---------- the layer ---------- */

/**
 * Every leader on the page in one coordinate space, over every frame.
 *
 * One SVG rather than one per frame: a leader leaves its frame's box by design, and
 * a stack of overflowing SVGs is a stack of z-index arguments nobody wins.
 */
export function WalkLayer({
	scene,
	w,
	size = "readable",
	lit = null,
	onPoint,
}: {
	scene: readonly AmbientFrame[];
	w: number;
	/** below readable, the words go and the stub stays — the law the covers already obey */
	size?: "readable" | "nub" | undefined;
	lit?: string | null | undefined;
	onPoint?: ((page: string | null) => void) | undefined;
}) {
	const marked = scene.filter((frame) => frame.exits !== undefined || frame.faults !== undefined);
	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{marked.map((frame) =>
					size === "nub" ? (
						<Nubs key={frame.name} frame={frame} w={w} />
					) : (
						<g key={frame.name}>
							{place(frame, w).map((placed) => (
								<g key={placed.key}>
									<path
										d={placed.d}
										stroke={placed.fault === null ? HAIRLINE.exit : HAIRLINE.fault}
										strokeWidth={1}
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<circle
										cx={placed.ax + 0.5}
										cy={placed.ay + 0.5}
										r={2.5}
										fill="var(--color-muted)"
										fillOpacity={placed.fault === null ? 0.85 : 1}
									/>
									{placed.fault === null ? null : <Terminator x={placed.ex} y={placed.ey} />}
								</g>
							))}
						</g>
					),
				)}
			</svg>
			{size === "nub"
				? null
				: marked.flatMap((frame) =>
						place(frame, w).map((placed) =>
							placed.exit !== null ? (
								<ExitTag
									key={`${frame.name}/${placed.key}`}
									exit={placed.exit}
									placed={placed}
									lit={lit === placed.exit.page}
									onPoint={onPoint}
								/>
							) : placed.fault !== null ? (
								<FaultTag key={`${frame.name}/${placed.key}`} fault={placed.fault} placed={placed} />
							) : null,
						),
					)}
		</>
	);
}

/* ---------- the handle ---------- */

/**
 * The threads toggle, re-iconed.
 *
 * It already governs the arrows, and the arrows and the tags are one layer now, so
 * it governs both — which makes the flow glyph the wrong glyph. The `edge` mark from
 * `agent-nav-marks` is what the layer actually is: a frame, a walk, and the frame at
 * the other end, whether or not this canvas can show that other end.
 *
 * Off, it keeps a five-pixel grey dot while the layer it is hiding contains a fault.
 * Grey because the accent belongs to the selection, and top-right because both of
 * the glyph's own rings sit on the other diagonal. The dot says only that something
 * is there; the count is one press away, which is the right price for a notice on a
 * canvas you turned quiet on purpose.
 */
export function WalkToggle({
	on,
	faults,
	onToggle,
}: {
	on: boolean;
	/** how many walks the hidden layer would report as broken; 0 draws no dot */
	faults: number;
	onToggle?: (() => void) | undefined;
}) {
	const notice = !on && faults > 0;
	return (
		<button
			type="button"
			aria-label="Threads"
			aria-pressed={on}
			title={notice ? `${faults} walks on this page go nowhere` : "Threads"}
			onClick={onToggle}
			className={cn(
				"relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm transition-colors duration-150 hover:bg-surface",
				on ? "text-text" : "text-muted",
			)}
		>
			<ConnectionsIcon className="h-3.5 w-3.5" />
			{notice ? <span className="absolute top-[3px] right-[3px] h-[5px] w-[5px] rounded-full bg-muted" /> : null}
		</button>
	);
}

/* ---------- the rail, which has nothing to do with any of this ---------- */

const SAID =
	"The header sits on 12px now and the total has a rule of its own under it. Nothing else on the page moved.";

/**
 * A turn that has landed and says nothing about walks.
 *
 * It is here so the rail is honest rather than helpful: if the agent had just
 * explained where `cart` goes, the canvas would not be carrying its own weight and
 * the layer would be untested.
 */
const TURN: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "tighten the receipt header, the total is sitting on the rule" },
	{ key: "read", kind: "line", state: "done", verb: "read", subject: "receipt" },
	{ key: "edit", kind: "line", state: "done", verb: "edit", subject: "receipt ×2", count: 2 },
	{ key: "shot", kind: "line", state: "done", verb: "shot", subject: "receipt" },
	{ key: "said", kind: "prose", full: SAID, shown: SAID },
];

/* ---------- the window ---------- */

const NO_TARGETS: readonly Target[] = [];

/**
 * The shipped shell, the Pages tree, the canvas, and the agent holding the right
 * rail whole, which is the premise this ticket exists under.
 *
 * Nothing is selected anywhere in this family. The tree therefore ticks nothing, and
 * every mark out on the canvas is there because the map knows it rather than because
 * somebody asked.
 */
export function AmbientWindow({
	pages,
	zoom,
	on,
	faults,
	onToggle,
	litPage = null,
	children,
}: {
	pages: readonly PageRow[];
	zoom: string;
	on: boolean;
	faults: number;
	onToggle?: (() => void) | undefined;
	litPage?: string | null | undefined;
	children: ReactNode;
}) {
	const lit = pages.map((page) => ({ ...page, lit: page.name === litPage }));
	return (
		<SpoolShell
			activeTab="kaffe"
			tabs={["kaffe", "spool"]}
			canvasControls={false}
			headerAccessory={
				<>
					<WalkToggle on={on} faults={faults} onToggle={onToggle} />
					<span className="min-w-9 text-right font-mono text-muted text-xs leading-xs">{zoom}</span>
				</>
			}
		>
			<CanvasChrome
				pages={lit}
				tool="select"
				targets={NO_TARGETS}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				{children}
			</CanvasChrome>
		</SpoolShell>
	);
}

/** the toggle is real in every frame of this family: press it and the layer goes */
export function useLayer(seed: boolean): { readonly on: boolean; readonly toggle: () => void } {
	const [on, setOn] = useState(seed);
	return { on, toggle: () => setOn((was) => !was) };
}

export { CartEmptyRestrained };
