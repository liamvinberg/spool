import { cn } from "../lib/utils";
import type { PlayEntry } from "../lib/turn-play";
import { CartEmptyRestrained } from "./coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "./spool-canvas-chrome";
import { ThreadIcon } from "./spool-icons";
import { PlayRail } from "./spool-play-rail";
import { SpoolShell } from "./spool-shell";

/**
 * The flow lens: what #146 looks like if the canvas at rest says nothing at all.
 *
 * The premise is that the two homeless facts — a walk that lands on another page,
 * a walk that lands on nothing — are *reading* work, not ambient work. You do
 * them when you are asking where this flow goes, and that is a different sitting
 * from arranging frames. So the resting canvas keeps every pixel it has today,
 * and the threads toggle already in the bar stops meaning "draw arrows" and
 * starts meaning "read the flow": covers fall back to quiet rectangles, and every
 * walk the project declares draws at full strength, including the two an arrow
 * could never carry.
 *
 * **Off the page keeps going.** This canvas already flows left to right, so a walk
 * that leaves the page carries on rightward and stops at the boundary in a tag
 * with the name it is going to and the page it lands on. The thread is the tag's
 * left edge, so the tag is the thread arriving rather than a label parked nearby.
 * Pressing it travels: the page follows, the arrival is centred, the target ends
 * up selected. Hovering it lights that page in the tree, which is the same pairing
 * a rail row already does (#143).
 *
 * **Broken stops.** A declared walk with nothing at the other end gets a stub, a
 * gap, and a cross, in grey rather than in the accent: the accent is the
 * selection's, and a name with a typo in it is not an alarm, it is a mistake the
 * developer made two minutes ago. The dead name sits after the cut — struck
 * through when no frame answers to it, printed as its source location when the
 * parser could not read it, because that location is the only true thing to say.
 * The two of them stop well short of the edge that the off-page pair reaches, and
 * that difference in *where the drawing ends* is the fact, read before any glyph.
 *
 * **The silence has one cost and the toggle pays it.** A canvas that says nothing
 * about broken walks is a canvas where a typo ships. So the lens's own handle
 * carries a four-pixel grey dot whenever this page has a walk that goes nowhere:
 * not a count, not a colour, just "the lens has something for you". It is per
 * page on purpose — the toggle and the zoom readout both belong to the focused
 * canvas — and hovering it says how many.
 *
 * **What it costs.** The bar's toggle used to hide arrows entirely, and that state
 * is gone here; dimming the covers is the better answer to a noisy canvas, but
 * somebody who wanted the arrows *off* has lost the switch. And the fact stays
 * invisible while the lens is off, which is the whole bet.
 */

/* ---------- the scene, fixed across every #146 candidate ---------- */

const NAT_W = 240;
const NAT_H = 520;
const FW = 158;
const S = FW / NAT_W;
const FH = Math.round(NAT_H * S);
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

interface SceneFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen?: CoffeeScreenName | undefined;
	readonly render?: (() => React.ReactNode) | undefined;
	readonly selected?: boolean | undefined;
	/** the canvas is not repainting this one; the shipped label wears a ▸ for it */
	readonly paused?: boolean | undefined;
}

const SCENE: readonly SceneFrame[] = [
	{ name: "menu", screen: "menu", x: 30, y: 96, paused: true },
	{ name: "cart", screen: "cart", x: 238, y: 132, selected: true },
	{ name: "receipt", screen: "receipt", x: 446, y: 72, paused: true },
	{ name: "cart--empty", render: CartEmptyRestrained, x: 446, y: 500, paused: true },
];

/**
 * Where `cart` goes that no arrow on this page can reach.
 *
 * `d` is the thread itself. Both leave `cart`'s right edge below the arrow that
 * is already there, thread the sixty-pixel corridor between `receipt` and
 * `cart--empty`, and dock at the boundary — which is what routing around the
 * frames in the way has to look like once there is more than one exit.
 */
const OFF_PAGE: readonly {
	target: string;
	page: string;
	certainty: "will" | "might";
	y: number;
	d: string;
}[] = [
	{
		target: "checkout",
		page: "shop",
		certainty: "will",
		y: 426,
		d: "M400 378C424 378 424 426 440 426L656 426",
	},
	{
		target: "home",
		page: "site",
		certainty: "might",
		y: 454,
		d: "M400 416C424 416 424 454 440 454L656 454",
	},
];

/** what `cart--empty` declares and never reaches */
const BROKEN: readonly { name: string; why: "missing" | "unreadable"; y: number }[] = [
	{ name: "chekout", why: "missing", y: 610 },
	{ name: "nav.tsx:12", why: "unreadable", y: 664 },
];

const PAGES_AT_REST: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "cart--empty", "menu", "receipt"], active: true, open: true },
	{ name: "shop", frames: ["checkout", "payment"] },
	{ name: "site", frames: ["home"] },
];

/** the tree's own answer, which covers the selection and nothing else (#144) */
const TARGETS: readonly Target[] = [
	{ frame: "receipt", certainty: "might" },
	{ frame: "checkout", certainty: "will" },
	{ frame: "home", certainty: "might" },
];

const OFF_PAGE_TAG_W = 116;
/**
 * The viewport's right side, which the off-page tags are welded to and the broken
 * chips stop short of. That gap is the whole difference between a walk that goes
 * somewhere you cannot see and a walk that goes nowhere at all.
 */
const EDGE_X = 772;

/* ---------- the handle ---------- */

/**
 * The threads toggle, which is now the lens.
 *
 * Off, it is the shipped button unchanged apart from the dot. On, it is a raised
 * pill — the canvas underneath has already changed beyond mistaking, so the
 * handle only has to look held down.
 */
function LensToggle({
	on,
	whisper,
	hint,
	onHint,
}: {
	on: boolean;
	whisper: boolean;
	hint: boolean;
	onHint?: ((open: boolean) => void) | undefined;
}) {
	return (
		<div className="flex items-center gap-3">
			{/* the dot's own answer, and it lands in the bar rather than in a bubble over
			    the canvas: there is a third of a screen of empty chrome to its left and
			    nothing under it to cover up */}
			{hint ? (
				<span className="whitespace-nowrap font-mono text-2xs text-muted leading-3">
					{BROKEN.length} walks on this page go nowhere
				</span>
			) : null}
			<button
				type="button"
				aria-label="Threads"
				aria-pressed={on}
				title={whisper ? `${BROKEN.length} walks on this page go nowhere` : "Threads"}
				onMouseEnter={onHint === undefined ? undefined : () => onHint(true)}
				onMouseLeave={onHint === undefined ? undefined : () => onHint(false)}
				className={cn(
					"relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-text transition-colors duration-150",
					on ? "border border-border-raised bg-raised" : "hover:bg-surface",
				)}
			>
				<ThreadIcon className="h-3.5 w-3.5" />
				{/* the glyph runs bottom-left to top-right and ends in an arrowhead, so the
				    dot goes low-right: any higher and the thread appears to terminate in a
				    ball instead of an arrow */}
				{whisper ? (
					<span className="absolute right-[3px] bottom-[3px] h-[5px] w-[5px] rounded-full bg-muted" />
				) : null}
			</button>
		</div>
	);
}

/* ---------- the canvas ---------- */

function LensCanvas({
	lens,
	pointed,
	onPoint,
}: {
	lens: boolean;
	pointed: string | null;
	onPoint?: ((target: string | null) => void) | undefined;
}) {
	return (
		<>
			<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
				{/* the two walks this page can draw, at the weight the lens gives everything */}
				<path
					d="M192 252C208 252 216 292 230 292"
					stroke="var(--color-thread)"
					strokeWidth={lens ? 1.75 : 1.5}
				/>
				<path d="m238 292-8-4.5v9Z" fill="var(--color-thread)" />
				<g opacity={lens ? 1 : 0.75}>
					<path
						d="M400 300C416 300 424 244 438 244"
						stroke="var(--color-thread)"
						strokeWidth={lens ? 1.75 : 1.5}
						strokeDasharray="5 5"
					/>
					<path d="m446 244-8-4.5v9Z" fill="var(--color-thread)" />
				</g>
				{lens ? (
					<>
						{OFF_PAGE.map((walk) => (
							<path
								key={walk.target}
								d={walk.d}
								stroke="var(--color-thread)"
								strokeWidth={1.75}
								strokeDasharray={walk.certainty === "might" ? "5 5" : undefined}
							/>
						))}
						{BROKEN.map((walk) => (
							<g key={walk.name} stroke="var(--color-muted)" strokeWidth={1.6} strokeLinecap="round">
								<path d={`M608 ${walk.y}H630`} />
								<path d={`M636 ${walk.y - 5}l9 10M645 ${walk.y - 5}l-9 10`} />
							</g>
						))}
					</>
				) : null}
			</svg>

			{SCENE.map((frame) => (
				<div
					key={frame.name}
					className="absolute flex flex-col"
					style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: FW }}
				>
					{/* the label row is the same row in both states: this direction never writes on it */}
					<div className="flex h-4 w-full min-w-0 items-center gap-1.5 pb-2.5 font-mono text-sm leading-4">
						{frame.paused === true ? <span className="shrink-0 text-2xs text-muted leading-3">▸</span> : null}
						<span className={cn("min-w-0 truncate", frame.selected === true ? "text-thread" : "text-muted")}>
							{frame.name}
						</span>
						{frame.selected === true ? (
							<span className="ml-auto flex shrink-0 items-center gap-1 px-1 font-mono text-2xs text-muted leading-3">
								<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
									<path d="M2 1.2 8.4 5 2 8.8Z" />
								</svg>
								play
							</span>
						) : null}
					</div>
					<div className="relative" style={{ width: FW, height: FH }}>
						<div className="overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
							<div
								className={cn("origin-top-left transition-opacity duration-300", lens && "opacity-[0.14]")}
								style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}
							>
								{frame.render === undefined ? (
									<CoffeeScreen screen={frame.screen ?? "cart"} />
								) : (
									frame.render()
								)}
							</div>
						</div>
						{/* a cover this quiet still has to keep its rectangle: the threads land on it */}
						{lens ? (
							<div className="pointer-events-none absolute inset-0 rounded-lg border border-border-raised" />
						) : null}
						{frame.selected === true ? <FrameSelection /> : null}
					</div>
				</div>
			))}

			{lens
				? OFF_PAGE.map((walk) => (
						<button
							key={walk.target}
							type="button"
							title={`go to ${walk.target} on ${walk.page}`}
							onMouseEnter={onPoint === undefined ? undefined : () => onPoint(walk.target)}
							onMouseLeave={onPoint === undefined ? undefined : () => onPoint(null)}
							className={cn(
								"absolute flex h-5 cursor-pointer items-center gap-1.5 border-thread border-l-2 pr-2 pl-2.5 font-mono text-2xs leading-3 transition-colors duration-150",
								pointed === walk.target ? "bg-raised" : "bg-surface",
							)}
							style={{ left: EDGE_X - OFF_PAGE_TAG_W, top: walk.y - 10, width: OFF_PAGE_TAG_W }}
						>
							{/* at rest a destination is a fact; under the pointer it is a door, and the
							    page it opens lights two rails away */}
							<span className={cn("truncate", pointed === walk.target ? "text-text" : "text-text/70")}>
								{walk.target}
							</span>
							<span className="text-muted/45">·</span>
							<span className={cn(pointed === walk.target ? "text-muted" : "text-muted/70")}>
								{walk.page}
							</span>
						</button>
					))
				: null}

			{lens
				? BROKEN.map((walk) => (
						<div
							key={walk.name}
							className="absolute flex h-[22px] items-center rounded-xs border border-border-raised bg-surface px-2 font-mono text-2xs text-text leading-3"
							style={{ left: 654, top: walk.y - 11 }}
						>
							<span className={cn(walk.why === "missing" && "line-through decoration-muted")}>
								{walk.name}
							</span>
						</div>
					))
				: null}
		</>
	);
}

/** the shipped selection: hairline ring, four handles, the size under it */
function FrameSelection() {
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
				className="absolute left-1/2 -translate-x-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
				style={{ top: FH + 12 }}
			>
				390 × 844
			</span>
		</>
	);
}

/* ---------- the window ---------- */

const SAID =
	"The header sits on 12px now and the total has a rule of its own under it. Nothing else on the page moved.";

/** a turn that has landed and has nothing to do with walks, so the canvas carries itself */
const TURN: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "tighten the receipt header, the total is sitting on the rule" },
	{ key: "read", kind: "line", state: "done", verb: "read", subject: "receipt" },
	{ key: "edit", kind: "line", state: "done", verb: "edit", subject: "receipt ×2", count: 2 },
	{ key: "shot", kind: "line", state: "done", verb: "shot", subject: "receipt" },
	{ key: "said", kind: "prose", full: SAID, shown: SAID },
];

export function WalkLensWindow({
	lens,
	pointed = null,
	onPoint,
	hint = false,
	onHint,
}: {
	/** the lens is reading flow; off is the canvas exactly as it ships */
	lens: boolean;
	/** the off-page tag under the pointer, which lights the page it lands on */
	pointed?: string | null | undefined;
	onPoint?: ((target: string | null) => void) | undefined;
	/** the toggle's own answer to its dot, drawn open because a still cannot hover */
	hint?: boolean | undefined;
	onHint?: ((open: boolean) => void) | undefined;
}) {
	const litPage = OFF_PAGE.find((walk) => walk.target === pointed)?.page ?? null;
	const pages = PAGES_AT_REST.map((page) => ({ ...page, lit: lens && page.name === litPage }));
	return (
		<SpoolShell
			activeTab="kaffe"
			tabs={["kaffe", "spool"]}
			canvasControls={false}
			headerAccessory={
				<>
					<LensToggle on={lens} whisper={!lens} hint={hint} onHint={onHint} />
					<span className="min-w-9 text-right font-mono text-muted text-xs leading-xs">41%</span>
				</>
			}
		>
			<CanvasChrome
				pages={pages}
				selected="cart"
				tool="select"
				targets={TARGETS}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				<LensCanvas lens={lens} pointed={pointed} onPoint={onPoint} />
			</CanvasChrome>
		</SpoolShell>
	);
}
