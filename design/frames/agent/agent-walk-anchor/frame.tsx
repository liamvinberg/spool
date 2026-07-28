import { useState } from "react";
import type { PlayEntry } from "../../../shared/lib/turn-play";
import { cn } from "../../../shared/lib/utils";
import { CanvasChrome, type PageRow, type Target } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-walk-anchor — the walk lives on the button (#146).
 *
 * A frame does not walk. A button does. `data-go="checkout"` is written on one
 * element, spool already stamps every element with its source position, so the
 * canvas can find the exact pixels of the thing that navigates. Every other
 * candidate for #146 takes that fact, throws the position away, and re-prints it
 * as a count on the frame. This one keeps it: the interface sits where the walk
 * is.
 *
 * **What it draws.** Select a frame and every element in it that navigates gets
 * a rule under it, its own width, ending in a ring. The ring is where the walk
 * leaves. Three terminators, one family:
 *
 * - the target is on this page: solid thread rule, filled ring, and the canvas
 *   arrow starts from that ring rather than from the middle of a frame edge.
 *   `Pay with saved card` is why the dashed arrow to `receipt` exists, and now
 *   you can see that.
 * - the target is elsewhere: dashed rule at half strength, hollow ring. Nothing
 *   continues from it, because the far end is not on this canvas. Point it and
 *   it names itself, `checkout · shop`, and lights `shop` in the tree. Press and
 *   you travel.
 * - the target is not there at all: full strength, and the ring is struck
 *   through. `chekout` is a typo and prints struck; `nav.tsx:12` is a
 *   destination the parser cannot read, so the source location is the only true
 *   thing there is to say about it.
 *
 * **Broken never waits to be asked.** Off-page anchors appear on selection or
 * hover, because an off-page walk is something you go looking for. Broken ones
 * are drawn always, with their names already open, because a fault you have to
 * hover to find is not a fault report. That is the whole reason `cart--empty` is
 * legible here while it is a blank frame everywhere else: two dead walks, no
 * arrow, nothing selected, and it still says so.
 *
 * **What the frame level gets.** One thing, and only because it is this same
 * object degraded: below roughly 90px of drawn frame width the rings stop being
 * separable and merge into the frame's own hairline. That is `--far`.
 *
 * **What it costs.** The wordmark's ring is nine pixels tall at this zoom and it
 * is drawn here on purpose, because that is the honest floor: an anchor is as
 * big as the element under it, and some elements are small. It buys the thing no
 * list can say, which is that `kaffe` in the header walks to the marketing site.
 * Nobody reading a frame-level count would ever guess that.
 */

/* ---------- canvas geometry ---------- */

const NAT_W = 240;
const NAT_H = 520;
const FW = 158;
const S = FW / NAT_W;
const FH = Math.round(NAT_H * S);
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

interface Point {
	readonly x: number;
	readonly y: number;
}

const abs = (rect: Rect) => ({ position: "absolute" as const, left: rect.x, top: rect.y, width: rect.w, height: rect.h });

/** a rect written in a screen's own 240x520 space, moved onto the canvas */
function onCanvas(origin: Point, rect: Rect): Rect {
	return { x: origin.x + rect.x * S, y: origin.y + rect.y * S, w: rect.w * S, h: rect.h * S };
}

/**
 * The rule an anchor is drawn on: three pixels under the element, its own width.
 *
 * Under rather than around, because an element is usually a filled button and
 * anything drawn on top of one has to fight its fill. The rule lands on the
 * screen behind the element instead, where a hairline is a hairline.
 */
const ruleOf = (box: Rect) => ({ x1: box.x, x2: box.x + box.w, y: box.y + box.h + 3 });

/** where the walk leaves: the far end of the rule */
const exitOf = (box: Rect): Point => ({ x: box.x + box.w, y: box.y + box.h + 3 });

/* ---------- the elements that navigate ---------- */

const LOGO: Rect = { x: 16, y: 12, w: 50, h: 16 };
const PRIMARY: Rect = { x: 16, y: 402, w: 208, h: 34 };
const SAVED: Rect = { x: 16, y: 462, w: 208, h: 18 };
const BACK: Rect = { x: 14, y: 14, w: 26, h: 26 };

const ORIGIN = {
	menu: { x: 30, y: 96 },
	cart: { x: 238, y: 132 },
	receipt: { x: 446, y: 72 },
	"cart--empty": { x: 446, y: 500 },
} as const;

type AnchorState = "here" | "off" | "broken";

interface Anchor {
	readonly id: string;
	readonly frame: keyof typeof ORIGIN;
	readonly rect: Rect;
	readonly state: AnchorState;
	/** what the destination is called, or the site of a destination nothing can read */
	readonly name: string;
	readonly page?: string | undefined;
	/** a name no frame answers to, printed struck the way the inspector prints it */
	readonly struck?: boolean | undefined;
	readonly why?: string | undefined;
	/** the tail of a drawn arrow: shown even when nobody selected this frame */
	readonly tail?: boolean | undefined;
}

const ANCHORS: readonly Anchor[] = [
	{ id: "cart-logo", frame: "cart", rect: LOGO, state: "off", name: "home", page: "site" },
	{ id: "cart-primary", frame: "cart", rect: PRIMARY, state: "off", name: "checkout", page: "shop" },
	{ id: "cart-saved", frame: "cart", rect: SAVED, state: "here", name: "receipt", tail: true },
	{ id: "menu-primary", frame: "menu", rect: PRIMARY, state: "here", name: "cart", tail: true },
	{
		id: "empty-back",
		frame: "cart--empty",
		rect: BACK,
		state: "broken",
		name: "nav.tsx:12",
		why: "unreadable",
	},
	{
		id: "empty-primary",
		frame: "cart--empty",
		rect: PRIMARY,
		state: "broken",
		name: "chekout",
		struck: true,
		why: "missing",
	},
];

const SELECTED = "cart";

/* ---------- the scene ---------- */

interface SceneFrame {
	readonly name: keyof typeof ORIGIN;
	readonly screen: "menu" | "cart" | "receipt" | "empty";
	readonly paused?: boolean | undefined;
}

const SCENE: readonly SceneFrame[] = [
	{ name: "menu", screen: "menu", paused: true },
	{ name: "cart", screen: "cart" },
	{ name: "receipt", screen: "receipt", paused: true },
	{ name: "cart--empty", screen: "empty", paused: true },
];

const PAGES: readonly PageRow[] = [
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

/* ---------- the screens under the marks ---------- */

const SCREEN_BASE =
	"relative h-full w-full overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]";

function CartScreen() {
	return (
		<div className={SCREEN_BASE}>
			<span className="absolute flex items-center font-semibold text-[13px] leading-none tracking-tight" style={abs(LOGO)}>
				kaffe
			</span>
			<h1 className="absolute font-semibold text-[14px] leading-[18px] tracking-tight" style={{ left: 16, top: 56 }}>
				Your cart
			</h1>
			{[
				{ name: "1 × Cortado", price: "$4.20", y: 76 },
				{ name: "1 × Flat white", price: "$4.80", y: 112 },
			].map((line) => (
				<div
					key={line.name}
					className="absolute flex items-center justify-between rounded-md bg-[#EFEFF1] px-2.5"
					style={abs({ x: 16, y: line.y, w: 208, h: 30 })}
				>
					<span className="font-medium text-[10px] leading-3">{line.name}</span>
					<span className="text-[9px] text-[#86868B] leading-3">{line.price}</span>
				</div>
			))}
			<div
				className="absolute flex items-baseline justify-between px-1"
				style={abs({ x: 16, y: 156, w: 208, h: 16 })}
			>
				<span className="text-[10px] text-[#86868B] leading-3">Total</span>
				<span className="font-semibold text-[11px] leading-3">$9.00</span>
			</div>
			<div
				className="absolute flex items-center justify-center rounded-md bg-[#17171A] font-semibold text-[#FEFEFE] text-[10px] leading-3"
				style={abs(PRIMARY)}
			>
				Go to checkout
			</div>
			<div className="absolute flex items-center justify-center text-[9px] text-[#86868B] leading-3" style={abs(SAVED)}>
				Pay with saved card
			</div>
		</div>
	);
}

function MenuScreen() {
	return (
		<div className={SCREEN_BASE}>
			<span className="absolute flex items-center font-semibold text-[13px] leading-none tracking-tight" style={abs(LOGO)}>
				kaffe
			</span>
			<span className="absolute text-[9px] text-[#86868B] leading-3" style={{ left: 16, top: 38 }}>
				Torsgatan 11
			</span>
			{[
				{ name: "Cortado", price: "$4.20", y: 76 },
				{ name: "Flat white", price: "$4.80", y: 112 },
				{ name: "Filter coffee", price: "$3.20", y: 148 },
			].map((line) => (
				<div
					key={line.name}
					className="absolute flex items-center gap-2 rounded-md bg-[#EFEFF1] px-2"
					style={abs({ x: 16, y: line.y, w: 208, h: 30 })}
				>
					<span className="h-[18px] w-[18px] shrink-0 rounded-full bg-[#D9D9DE]" />
					<span className="min-w-0 flex-1 font-medium text-[10px] leading-3">{line.name}</span>
					<span className="text-[9px] text-[#86868B] leading-3">{line.price}</span>
				</div>
			))}
			<div
				className="absolute flex items-center justify-center rounded-md bg-[#17171A] font-semibold text-[#FEFEFE] text-[10px] leading-3"
				style={abs(PRIMARY)}
			>
				View cart · 2
			</div>
		</div>
	);
}

function ReceiptScreen() {
	return (
		<div className={cn(SCREEN_BASE, "flex flex-col items-center justify-center gap-2 px-5")}>
			<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#17171A]">
				<svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
					<path d="m3.5 8.4 3.1 3.1 6-6.4" stroke="#FEFEFE" strokeWidth="1.8" strokeLinecap="round" />
				</svg>
			</div>
			<h1 className="font-semibold text-[14px] leading-[18px] tracking-tight">Thanks!</h1>
			<p className="font-medium text-[10px] text-[#86868B] leading-3">Order #214</p>
			<p className="text-center text-[9px] text-[#86868B] leading-3">Your receipt is on its way by email</p>
		</div>
	);
}

function EmptyScreen() {
	return (
		<div className={SCREEN_BASE}>
			<div className="absolute inset-x-0 top-0 h-[54px] border-[#EFEFF1] border-b" />
			<span className="absolute flex items-center justify-center text-[#17171A]" style={abs(BACK)}>
				<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
					<path d="M7.6 2.2 3.6 6l4 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
				</svg>
			</span>
			<h1
				className="absolute flex items-center justify-center font-semibold text-[13px] leading-none tracking-tight"
				style={abs({ x: 40, y: 14, w: 160, h: 26 })}
			>
				Your cart
			</h1>
			<span
				className="absolute rounded-full border-[1.5px] border-[#D9D9DE]"
				style={abs({ x: 103, y: 196, w: 34, h: 34 })}
			/>
			<p
				className="absolute flex items-center justify-center text-[10px] text-[#86868B] leading-3"
				style={abs({ x: 16, y: 248, w: 208, h: 14 })}
			>
				Nothing in here yet
			</p>
			<div
				className="absolute flex items-center justify-center rounded-md bg-[#17171A] font-semibold text-[#FEFEFE] text-[10px] leading-3"
				style={abs(PRIMARY)}
			>
				Go to checkout
			</div>
		</div>
	);
}

const SCREENS = { menu: MenuScreen, cart: CartScreen, receipt: ReceiptScreen, empty: EmptyScreen };

/* ---------- the marks ---------- */

/**
 * One anchor: a rule under the element and a ring at the end of it.
 *
 * Both are drawn in canvas space at a fixed stroke, so they are the same size at
 * every zoom while their position stays true to the element.
 *
 * **The ink is near-black and it carries a casing.** An anchor lands on the
 * prototype's own surface, and that surface is whatever the frame happens to be.
 * White here, and a project on a dark theme tomorrow. So the ink is near-black
 * with a light casing under it: on a white screen you see the ink and the casing
 * is invisible, on a dark one the casing is what makes the ink legible. Neither
 * has to know what it landed on.
 */
const INK = "#0E0E0E";
const CASING = "#FFFFFF";

function AnchorGlyph({ anchor, box, pointed }: { anchor: Anchor; box: Rect; pointed: boolean }) {
	const rule = ruleOf(box);
	const here = anchor.state === "here";
	const broken = anchor.state === "broken";
	const strong = broken || pointed;
	const r = strong ? 4.4 : 3.6;
	const stop = Math.max(rule.x1, rule.x2 - r - 2.5);

	return (
		<g>
			<path d={`M${rule.x1} ${rule.y}H${rule.x2}`} stroke={CASING} strokeWidth="3" strokeOpacity="0.55" />
			<circle cx={rule.x2} cy={rule.y} r={r + 1.6} fill={CASING} fillOpacity="0.62" />
			<path
				d={`M${rule.x1} ${rule.y}H${stop}`}
				stroke={here ? "var(--color-thread)" : INK}
				strokeWidth="1.3"
				strokeOpacity={here ? 0.8 : strong ? 1 : 0.5}
				strokeDasharray={anchor.state === "off" ? "3 3" : undefined}
			/>
			{here ? (
				<circle cx={rule.x2} cy={rule.y} r="3" fill="var(--color-thread)" />
			) : (
				<circle cx={rule.x2} cy={rule.y} r={r} stroke={INK} strokeWidth={strong ? 1.5 : 1.2} />
			)}
			{broken ? (
				<path
					d={`M${rule.x2 - 6.2} ${rule.y + 6.2}L${rule.x2 + 6.2} ${rule.y - 6.2}`}
					stroke={INK}
					strokeWidth="1.5"
					strokeLinecap="round"
				/>
			) : null}
		</g>
	);
}

/** the root of a drawn arrow, which is on show whether or not anyone selected the frame */
function TailDot({ at }: { at: Point }) {
	return (
		<g>
			<circle cx={at.x} cy={at.y} r="4.6" fill={CASING} fillOpacity="0.62" />
			<circle cx={at.x} cy={at.y} r="3" fill="var(--color-thread)" />
		</g>
	);
}

/**
 * The name the anchor carries, placed against the element rather than against the
 * frame: above it when the screen has room above, below it when the element is
 * already at the top. Never on the frame edge, because the edge belongs to the
 * frame and this fact belongs to a button.
 */
function AnchorChip({ anchor, box, origin }: { anchor: Anchor; box: Rect; origin: Point }) {
	const above = box.y - 27 >= origin.y + 6;
	const top = above ? box.y - 27 : box.y + box.h + 12;
	const broken = anchor.state === "broken";
	return (
		<div
			className={cn(
				"pointer-events-none absolute z-30 flex h-5 items-center gap-1.5 rounded-xs border bg-raised px-1.5 font-mono text-2xs leading-3",
				broken ? "border-muted/60" : "border-border-raised",
			)}
			style={{ left: box.x, top }}
		>
			{/* the ring again, small, so the chip does not lean on the one twelve pixels away */}
			{broken ? (
				<svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 text-text" fill="none" aria-hidden="true">
					<circle cx="6" cy="6" r="3.6" stroke="currentColor" strokeWidth="1.3" />
					<path d="M1.6 10.4 10.4 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
				</svg>
			) : null}
			<span className={cn("text-text", anchor.struck === true && "line-through")}>{anchor.name}</span>
			{broken ? null : (
				<>
					<span className="text-muted/45">·</span>
					<span className="text-muted/75">{anchor.page}</span>
				</>
			)}
		</div>
	);
}

/* ---------- the frame's own chrome ---------- */

function FrameSelection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
			{["-left-[7px] -top-[7px]", "-right-[7px] -top-[7px]", "-bottom-[7px] -left-[7px]", "-bottom-[7px] -right-[7px]"].map(
				(position) => (
					<span
						key={position}
						className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
					/>
				),
			)}
			<span
				className="absolute left-1/2 -translate-x-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
				style={{ top: FH + 12 }}
			>
				390 × 844
			</span>
		</>
	);
}

/* ---------- the rail, which has nothing to do with any of this ---------- */

const SAID =
	"The header sits on 12px now and the total has a rule of its own under it. Nothing else on the page moved.";

const TURN: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "tighten the receipt header, the total is sitting on the rule" },
	{ key: "read", kind: "line", state: "done", verb: "read", subject: "receipt" },
	{ key: "edit", kind: "line", state: "done", verb: "edit", subject: "receipt ×2", count: 2 },
	{ key: "shot", kind: "line", state: "done", verb: "shot", subject: "receipt" },
	{ key: "said", kind: "prose", full: SAID, shown: SAID },
];

/* ---------- the window ---------- */

export default function AgentWalkAnchorFrame() {
	const [pointed, setPointed] = useState<string | null>("cart-primary");

	const boxes = new Map(ANCHORS.map((anchor) => [anchor.id, onCanvas(ORIGIN[anchor.frame], anchor.rect)]));
	const shown = ANCHORS.filter((anchor) => anchor.frame === SELECTED || anchor.state === "broken");
	const litPage = ANCHORS.find((anchor) => anchor.id === pointed)?.page ?? null;
	const pages = PAGES.map((page) => ({ ...page, lit: page.name === litPage }));

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="41%">
			<CanvasChrome
				pages={pages}
				selected={SELECTED}
				tool="select"
				targets={TARGETS}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				{/* the arrows, each one rooted on the element that causes it */}
				<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
					<path d="M177.5 385C202 385 212 290 230 290" stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d="m238 290-8-4.5v9Z" fill="var(--color-thread)" />
					<g opacity="0.75">
						<path
							d="M385.5 450C412 450 420 330 438 330"
							stroke="var(--color-thread)"
							strokeWidth="1.5"
							strokeDasharray="5 5"
						/>
						<path d="m446 330-8-4.5v9Z" fill="var(--color-thread)" />
					</g>
				</svg>

				{SCENE.map((frame) => {
					const origin = ORIGIN[frame.name];
					const Screen = SCREENS[frame.screen];
					const selected = frame.name === SELECTED;
					return (
						<div
							key={frame.name}
							className="absolute flex flex-col"
							style={{ left: origin.x, top: origin.y - LABEL_LIFT, width: FW }}
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
							<div className="relative" style={{ width: FW, height: FH }}>
								<div className="overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
									<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
										<Screen />
									</div>
								</div>
								{selected ? <FrameSelection /> : null}
							</div>
						</div>
					);
				})}

				{/* the anchors themselves, over every frame, in one coordinate space */}
				<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
					{ANCHORS.filter((anchor) => anchor.tail === true && !shown.includes(anchor)).map((anchor) => (
						<TailDot key={anchor.id} at={exitOf(boxes.get(anchor.id) as Rect)} />
					))}
					{shown.map((anchor) => (
						<AnchorGlyph
							key={anchor.id}
							anchor={anchor}
							box={boxes.get(anchor.id) as Rect}
							pointed={pointed === anchor.id}
						/>
					))}
				</svg>

				{shown.map((anchor) => {
					const box = boxes.get(anchor.id) as Rect;
					if (anchor.state === "here") return null;
					if (anchor.state === "off" && pointed !== anchor.id) return null;
					return <AnchorChip key={anchor.id} anchor={anchor} box={box} origin={ORIGIN[anchor.frame]} />;
				})}

				{/* the pointer targets: the ring is 8px of ink, so it gets 18px of reach */}
				{shown.map((anchor) => {
					const exit = exitOf(boxes.get(anchor.id) as Rect);
					if (anchor.state === "here") return null;
					return (
						<button
							key={anchor.id}
							type="button"
							aria-label={
								anchor.state === "off" ? `Go to ${anchor.name} on ${anchor.page}` : `${anchor.name} is ${anchor.why}`
							}
							onMouseEnter={() => setPointed(anchor.id)}
							onMouseLeave={() => setPointed(null)}
							className="absolute z-20 h-[18px] w-[18px] cursor-pointer rounded-full"
							style={{ left: exit.x - 9, top: exit.y - 9 }}
						/>
					);
				})}
			</CanvasChrome>
		</SpoolShell>
	);
}
