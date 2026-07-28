import { useState } from "react";
import type { PlayEntry } from "../../../shared/lib/turn-play";
import { cn } from "../../../shared/lib/utils";
import { CartEmptyRestrained } from "../../../shared/ui/coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * The thread keeps going: what a walk looks like when the canvas cannot finish
 * drawing it (#146).
 *
 * Nothing new is added to the canvas. The arrow layer already answers "where does
 * this frame go", and it answers it with a line that starts at a wall and ends at
 * something. So the two facts with no home get their own ending inside that same
 * layer, and the layer grows a vocabulary of three:
 *
 *   lands here   a full stroke into an arrowhead against the frame it reaches
 *   keeps going  a stroke that thins away into nothing, and a tag where it went
 *   gets cut     a short stub, a hard bar across it, and the dead name at the bar
 *
 * You read them by how they end, which is where your eye already is: an arrow is
 * a thing you follow to its point. A landing thread has a point. A continuing
 * thread has no end at all. A cut thread has the only hard edge in a layer made
 * of tapers and curves.
 *
 * **The tag is the door, not the stroke.** A 1.5px line is not a control, and the
 * honest answer is that you never press one. The tag at the vanishing end is
 * 120 x 22, about 2600 square pixels, which is bigger than the play verb on the
 * selected frame's label and roughly a rail row. The thread also carries an
 * invisible 18px hit stroke, so running the cursor along it lights the tag it
 * belongs to, the same way hovering a rail row rings its frame (#143). Press and
 * you travel: the page follows, the arrival is centred, the target is selected.
 *
 * **Broken is loud without colour.** Red is the thread, and a thread means it
 * carries you somewhere, so a walk that carries nobody cannot be red. It is grey,
 * it is short, and it stops against a bright bar. The bar and the dead name are
 * the only full-strength marks anywhere on the canvas outside frame content, and
 * a hard perpendicular edge is a shape this layer never otherwise makes.
 *
 * **Where a thread leaves.** Through a wall with room, which is the routing the
 * drawn arrows already do. `cart` has receipt and a live dashed arrow across its
 * right wall, so its two off-page threads take the bottom. `cart--empty` has an
 * open right wall, so its two cut stubs take it.
 *
 * **The scene is the one every candidate is judged in.** Four frames, `cart`
 * selected and walking off the page twice, `cart--empty` declaring two walks that
 * reach nothing. In the shipped canvas `cart--empty` draws no arrow at all, which
 * is the exact bug `inspector.tsx:592` names: a frame whose only walks are
 * unreadable used to read as a frame with no walks. Here it has two.
 */

/* ---------- geometry ---------- */

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
	/** the canvas is not repainting this one; the shipped label wears a play caret */
	readonly paused?: boolean | undefined;
}

const SCENE: readonly SceneFrame[] = [
	{ name: "menu", screen: "menu", x: 30, y: 96, paused: true },
	{ name: "cart", screen: "cart", x: 238, y: 132, selected: true },
	{ name: "receipt", screen: "receipt", x: 446, y: 72, paused: true },
	{ name: "cart--empty", render: CartEmptyRestrained, x: 446, y: 500, paused: true },
];

interface OffPageWalk {
	readonly target: string;
	readonly page: string;
	readonly certainty: "will" | "might";
	/** the way out, in viewport pixels */
	readonly d: string;
	/** the wall it leaves and the point it is gone: the fade runs between these */
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	/** the tag's right edge and its vertical centre; the last inches run under it */
	readonly tag: readonly [number, number];
}

/** where `cart` goes that no arrow on this page can reach */
const OFF_PAGE: readonly OffPageWalk[] = [
	{
		target: "checkout",
		page: "shop",
		certainty: "will",
		d: "M248 474C248 508 238 532 216 548 196 562 176 569 152 572",
		from: [248, 474],
		to: [152, 572],
		tag: [166, 572],
	},
	{
		target: "home",
		page: "site",
		certainty: "might",
		d: "M270 474C270 524 262 566 246 604 232 638 212 664 186 674",
		from: [270, 474],
		to: [186, 674],
		tag: [200, 674],
	},
];

interface BrokenWalk {
	readonly name: string;
	readonly why: "missing" | "unreadable";
	/** the same short curve every drawn arrow leaves a wall with, and then nothing */
	readonly d: string;
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	/** the height the bar stands at, which the name is centred on */
	readonly cut: number;
}

/** what `cart--empty` declares and never reaches */
const BROKEN: readonly BrokenWalk[] = [
	{
		name: "chekout",
		why: "missing",
		d: "M604 566C622 566 630 554 652 554",
		from: [604, 566],
		to: [652, 554],
		cut: 554,
	},
	{
		name: "nav.tsx:12",
		why: "unreadable",
		d: "M604 650C622 650 630 662 652 662",
		from: [604, 650],
		to: [652, 662],
		cut: 662,
	},
];

/** where the bar stands: the 6px between it and the stroke is the cut */
const CUT_BAR = 658;

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

/* ---------- the arrow layer ---------- */

/**
 * Every stroke on the canvas, in one layer and one z-order.
 *
 * The two drawn arrows are the shipped canvas's own, unchanged: a walk that will
 * be taken is solid, a walk inside a branch is dashed and faint, both end in the
 * same 8px head. The off-page threads borrow that grammar exactly and drop the
 * head, because a head is the claim that the thing at the other end is here.
 */
function ThreadLayer({ hovered, onHover }: { hovered: string | null; onHover: (target: string | null) => void }) {
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			<defs>
				{OFF_PAGE.map((walk) => (
					<linearGradient
						key={walk.target}
						id={`fade-${walk.target}`}
						gradientUnits="userSpaceOnUse"
						x1={walk.from[0]}
						y1={walk.from[1]}
						x2={walk.to[0]}
						y2={walk.to[1]}
					>
						<stop offset="0" stopColor="var(--color-thread)" stopOpacity={walk.certainty === "will" ? 1 : 0.75} />
						<stop
							offset="0.45"
							stopColor="var(--color-thread)"
							stopOpacity={walk.certainty === "will" ? 0.45 : 0.32}
						/>
						<stop offset="1" stopColor="var(--color-thread)" stopOpacity="0" />
					</linearGradient>
				))}
				{/* a cut stub bleeds out rather than fades: it leaves the wall as a thread
				    and arrives at the bar as grey, which is what says it carries nobody */}
				{BROKEN.map((walk) => (
					<linearGradient
						key={walk.name}
						id={`cut-${walk.why}`}
						gradientUnits="userSpaceOnUse"
						x1={walk.from[0]}
						y1={walk.from[1]}
						x2={walk.to[0]}
						y2={walk.to[1]}
					>
						<stop offset="0" stopColor="var(--color-thread)" stopOpacity="0.9" />
						<stop offset="1" stopColor="var(--color-muted)" stopOpacity="0.6" />
					</linearGradient>
				))}
			</defs>

			{/* menu walks to cart, and it lands: a full stroke into a head */}
			<path d="M192 252C208 252 216 292 230 292" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m238 292-8-4.5v9Z" fill="var(--color-thread)" />
			<g opacity="0.75">
				<path
					d="M400 300C416 300 424 244 438 244"
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					strokeDasharray="5 5"
				/>
				<path d="m446 244-8-4.5v9Z" fill="var(--color-thread)" />
			</g>

			{OFF_PAGE.map((walk) => (
				<g key={walk.target}>
					<path
						d={walk.d}
						stroke={`url(#fade-${walk.target})`}
						strokeWidth="1.5"
						strokeLinecap="round"
						{...(walk.certainty === "might" ? { strokeDasharray: "5 5" } : {})}
					/>
					{/* the firm-up: a second stroke at full strength, faded in under the cursor */}
					<path
						d={walk.d}
						stroke="var(--color-thread)"
						strokeWidth="1.5"
						strokeLinecap="round"
						className="transition-opacity duration-200 ease-out"
						style={{ opacity: hovered === walk.target ? (walk.certainty === "will" ? 1 : 0.8) : 0 }}
						{...(walk.certainty === "might" ? { strokeDasharray: "5 5" } : {})}
					/>
					{/* what makes a hairline reachable at all: an invisible 18px hit stroke */}
					<path
						d={walk.d}
						stroke="transparent"
						strokeWidth="18"
						strokeLinecap="round"
						className="cursor-pointer"
						style={{ pointerEvents: "stroke" }}
						onMouseEnter={() => onHover(walk.target)}
						onMouseLeave={() => onHover(null)}
					/>
				</g>
			))}

			{BROKEN.map((walk) => (
				<g key={walk.name}>
					<path d={walk.d} stroke={`url(#cut-${walk.why})`} strokeWidth="1.5" />
					<path
						d={`M${CUT_BAR} ${walk.cut - 7}v14`}
						stroke="var(--color-text)"
						strokeOpacity="0.85"
						strokeWidth="2"
					/>
				</g>
			))}
		</svg>
	);
}

/**
 * The tag at the vanishing end: the destination, the page it is on, and the door.
 *
 * The thread's last inches run under it, so the tag is where the thread went
 * rather than a note about it. It carries no certainty glyph because the stroke
 * arriving into it is already solid or dashed, and it carries no count because
 * one thread is one walk.
 */
function ThreadTag({
	target,
	page,
	right,
	middle,
	hovered,
	onHover,
}: {
	target: string;
	page: string;
	right: number;
	middle: number;
	hovered: boolean;
	onHover: (target: string | null) => void;
}) {
	return (
		<button
			type="button"
			aria-label={`Go to ${target} on ${page}`}
			onMouseEnter={() => onHover(target)}
			onMouseLeave={() => onHover(null)}
			style={{ left: right, top: middle }}
			className={cn(
				"absolute z-20 flex h-[22px] -translate-x-full -translate-y-1/2 cursor-pointer items-center gap-1.5",
				"rounded-sm border px-2 font-mono text-2xs leading-3 transition-colors duration-150 ease-out",
				hovered ? "border-muted/50 bg-raised" : "border-border-raised bg-surface",
			)}
		>
			<span className={cn("transition-colors duration-150", hovered ? "text-text" : "text-muted")}>{target}</span>
			<span className="text-muted/30">·</span>
			<span className={cn("transition-colors duration-150", hovered ? "text-muted" : "text-muted/55")}>{page}</span>
		</button>
	);
}

/**
 * The name at the cut.
 *
 * A name nothing answers to is struck through and called missing. A destination
 * the parser cannot read has no name to print, so its source location stands in
 * and it is called unreadable, which is the inspector's own two rows. Neither is
 * a button: there is nowhere to go, and the value here is the string you need in
 * order to go fix it.
 */
function CutName({ name, why, left, middle }: { name: string; why: string; left: number; middle: number }) {
	return (
		<div
			className="absolute z-20 flex -translate-y-1/2 flex-col items-start gap-[3px]"
			style={{ left, top: middle }}
		>
			<span
				className={cn(
					"font-mono text-2xs text-text leading-3",
					why === "missing" && "line-through decoration-muted/80",
				)}
			>
				{name}
			</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">{why}</span>
		</div>
	);
}

/** the four frames, drawn over the layer the way the canvas draws them */
function SceneFrames() {
	return (
		<>
			{SCENE.map((frame) => (
				<div
					key={frame.name}
					className="absolute flex flex-col"
					style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: FW }}
				>
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
							<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
								{frame.render === undefined ? <CoffeeScreen screen={frame.screen ?? "cart"} /> : frame.render()}
							</div>
						</div>
						{frame.selected === true ? <FrameSelection /> : null}
					</div>
				</div>
			))}
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

/**
 * A turn that has landed and has nothing to do with the threads.
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

/**
 * The shipped window: the Pages tree, the canvas, and the agent holding the whole
 * right rail, which is the premise this ticket exists under.
 *
 * `start` pins one destination lit on arrival so a still can show the reach. Real
 * hover takes over the moment the cursor moves.
 */
export function WalkThreadWindow({ start = null }: { start?: string | null | undefined }) {
	const [hovered, setHovered] = useState<string | null>(start);
	const reaching = OFF_PAGE.find((walk) => walk.target === hovered);
	const pages = PAGES_AT_REST.map((page) => ({ ...page, lit: page.name === reaching?.page }));

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="41%">
			<CanvasChrome
				pages={pages}
				selected="cart"
				tool="select"
				targets={TARGETS}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				<ThreadLayer hovered={hovered} onHover={setHovered} />
				<SceneFrames />
				{OFF_PAGE.map((walk) => (
					<ThreadTag
						key={walk.target}
						target={walk.target}
						page={walk.page}
						right={walk.tag[0]}
						middle={walk.tag[1]}
						hovered={hovered === walk.target}
						onHover={setHovered}
					/>
				))}
				{BROKEN.map((walk) => (
					<CutName key={walk.name} name={walk.name} why={walk.why} left={CUT_BAR + 10} middle={walk.cut} />
				))}
			</CanvasChrome>
		</SpoolShell>
	);
}
