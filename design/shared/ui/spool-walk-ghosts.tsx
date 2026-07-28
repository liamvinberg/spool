import { useState } from "react";
import type { PlayEntry } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { CartEmptyRestrained } from "./coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "./spool-canvas-chrome";
import { PlayRail } from "./spool-play-rail";
import { SpoolShell } from "./spool-shell";

/**
 * Ghost frames: the destination stands on the page it cannot be seen from (#146).
 *
 * Every other candidate for this ticket puts a *mark on the source* and asks you
 * to press it to find out where the walk lands. This one refuses the indirection.
 * The canvas already has a language for "this walk goes there", and it is an
 * arrow with a frame at the end of it. So a walk that leaves the page gets an
 * arrow with a frame at the end of it. The frame is just not real.
 *
 * A ghost is a stand-in for a destination: it holds a position on this canvas,
 * carries the destination's name and the page it actually lives on, and it is the
 * thing the arrow terminates in. Press it and you travel: the page follows, the
 * arrival is centred, the target is selected. A broken walk gets a ghost too, and
 * that is the point of the whole direction. `cart--empty` declares two walks that
 * nothing answers, and on the shipped canvas it draws no arrow at all, which is
 * exactly the bug `inspector.tsx:592` names: a frame whose only walks are
 * unreadable reads as a frame with no walks. Here it draws two, and they die in
 * public.
 *
 * ## Never a frame
 *
 * The whole direction rests on one risk, so the risk is what the drawing spends
 * itself on. A ghost cannot be confused for a frame, and it especially cannot be
 * confused for a frame that has not painted yet, which is a real state spool has:
 * frames are blank until React commits. That rules out the obvious drawing. A
 * dimmed, dashed, phone-shaped rectangle is precisely what a booting frame looks
 * like, so the ghost is not phone-shaped at all.
 *
 * Six things separate them, and the first one alone does the job at any zoom:
 *
 * 1. **Height.** Thirty pixels against three hundred and forty two. A ghost is a
 *    frame's footprint with the body drained out of it, and no amount of zooming
 *    turns one into the other.
 * 2. **Width.** Exactly one frame wide, which is the only thing it borrows. That
 *    is what makes it read as a stand-in rather than as a chip that floated in.
 * 3. **No label row.** Every real frame on this canvas wears its name floating
 *    above it. A ghost has its name inside, because a ghost is all label.
 * 4. **No picture.** A frame on this canvas is opaque and full of its own screen.
 *    A ghost has a plain surface at most, and the void has not even that.
 * 5. **Smaller type.** Ten pixels against the label row's twelve.
 * 6. **No selection.** A ghost takes no handles and reports no size, because there
 *    is nothing here to resize.
 *
 * ## Off the page against broken
 *
 * The accent belongs to the selection, so a broken walk cannot be red. It gets
 * three quiet differences that all say the same thing, which is how a fact
 * survives being small:
 *
 * The **arrow does not land**. A working walk arrives in the thread with a head on
 * it, solid when it always happens and dashed when it sits inside a branch, which
 * is the shipped arrow unchanged. A broken walk arrives in grey and hits a stop
 * bar. Grey against thread, and a bar against a head, is the difference you read
 * from across the canvas before you have read a single name.
 *
 * The **plate has nothing in it**. Substance runs one way and only one way. A real
 * frame is opaque and carries its own screen. A frame you cannot see from here
 * keeps the body and loses the picture. A frame that does not exist loses the body
 * too, so the canvas runs straight through the outline. It is six values of grey
 * and it will never be the thing you notice first, but it is never wrong either,
 * and it is what makes the two kinds hold apart once you are looking at them.
 *
 * The **reason is loud and the name is dead**. A destination that does not exist
 * is written struck through and faint, and the diagnosis next to it, `missing` or
 * `unreadable`, is the only full-strength text in the whole ghost. That inverts
 * the usual weighting on purpose: the name is not the useful part of a typo.
 *
 * ## What it costs
 *
 * Canvas space, and that is not a small bill. Four off-page walks here take two
 * columns of real estate that the human did not put anything in, and a ghost that
 * lands where a frame is about to be dragged has to move or be moved. It also
 * scales with the canvas rather than counter-scaling like the label row, which is
 * the honest choice, since a ghost occupies a place, and the consequence is that
 * it goes unreadable at the zooms where the label row still works.
 */

/* ---------- the scene ---------- */

const NAT_W = 240;
const NAT_H = 520;
const FW = 158;
const S = FW / NAT_W;
const FH = Math.round(NAT_H * S);
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

/** a ghost is exactly one frame wide and one label row tall */
const GW = FW;
const GH = 30;

interface SceneFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen?: CoffeeScreenName | undefined;
	/** a frame the coffee screens do not hold, drawn at the same natural size */
	readonly render?: (() => React.ReactNode) | undefined;
	readonly selected?: boolean | undefined;
	/** the canvas is not repainting this one; the shipped label wears a play caret for it */
	readonly paused?: boolean | undefined;
}

const SCENE: readonly SceneFrame[] = [
	{ name: "menu", screen: "menu", x: 22, y: 112, paused: true },
	{ name: "cart", screen: "cart", x: 248, y: 152, selected: true },
	{ name: "receipt", screen: "receipt", x: 608, y: 96, paused: true },
	{ name: "cart--empty", render: CartEmptyRestrained, x: 22, y: 500, paused: true },
];

type GhostKind = "off" | "broken";

interface Ghost {
	readonly id: string;
	readonly kind: GhostKind;
	readonly name: string;
	/** the page it lands on, or what is wrong with it */
	readonly tail: string;
	/** a name no frame answers to is written dead */
	readonly struck?: boolean | undefined;
	/** the page that lights in the tree while this ghost is pointed at */
	readonly page?: string | undefined;
	/** where the walk is written: the only move a void leaves you */
	readonly site?: string | undefined;
	readonly x: number;
	readonly y: number;
}

/**
 * Two real destinations `cart` reaches that this page cannot show, and two
 * `cart--empty` declares and never reaches.
 *
 * They stand in their source frame's own gutter rather than at the viewport's
 * edge. A page boundary is a fiction on an infinite canvas, so "in the direction
 * of travel" only means anything locally: just past the frame, on the side its
 * arrows already leave from.
 */
const GHOSTS: readonly Ghost[] = [
	{ id: "checkout", kind: "off", name: "checkout", tail: "shop", page: "shop", x: 556, y: 452 },
	{ id: "home", kind: "off", name: "home", tail: "site", page: "site", x: 556, y: 500 },
	{
		id: "chekout",
		kind: "broken",
		name: "chekout",
		tail: "missing",
		struck: true,
		site: "cart--empty/frame.tsx:31",
		x: 226,
		y: 612,
	},
	{
		id: "nav",
		kind: "broken",
		name: "nav.tsx:12",
		tail: "unreadable",
		site: "cart--empty/nav.tsx:12",
		x: 226,
		y: 660,
	},
];

const PAGES_AT_REST: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "cart--empty", "menu", "receipt"], active: true, open: true },
	{ name: "shop", frames: ["checkout", "payment"] },
	{ name: "site", frames: ["home"] },
];

/**
 * The tree's own answer, which covers the selection and nothing else (#144).
 *
 * It is kept because it shipped, and drawn rather than argued: with ghosts on the
 * canvas the ticks on `shop` and `site` now say a second time what the eye has
 * already read at the end of an arrow. That redundancy is a real finding and it
 * belongs to whoever picks this direction, not to this frame.
 */
const TARGETS: readonly Target[] = [
	{ frame: "receipt", certainty: "might" },
	{ frame: "checkout", certainty: "will" },
	{ frame: "home", certainty: "might" },
];

/* ---------- the ghost ---------- */

function GhostPlate({
	ghost,
	lit,
	onPoint,
}: {
	ghost: Ghost;
	lit: boolean;
	onPoint: (id: string | null) => void;
}) {
	const broken = ghost.kind === "broken";
	return (
		<div className="absolute" style={{ left: ghost.x, top: ghost.y }}>
			<button
				type="button"
				onMouseEnter={() => onPoint(ghost.id)}
				onMouseLeave={() => onPoint(null)}
				aria-label={
					broken ? `${ghost.name} is ${ghost.tail}` : `Go to ${ghost.name} on page ${ghost.tail}`
				}
				style={{ width: GW, height: GH }}
				className={cn(
					"flex cursor-pointer items-center gap-2 rounded-md border px-2 text-left transition-colors duration-150",
					lit ? "border-solid" : "border-dashed",
					// the ladder of substance, top to bottom: a real frame is opaque and
					// full of its own screen, a frame you cannot see from here has a body
					// but no picture, and a frame that does not exist has nothing at all,
					// so the canvas runs straight through it
					broken
						? lit
							? "border-muted/55"
							: "border-muted/30"
						: lit
							? "border-muted/75 bg-raised"
							: "border-muted/35 bg-surface",
				)}
			>
				<span
					className={cn(
						"min-w-0 truncate font-mono text-2xs leading-3",
						broken
							? cn("text-muted/50", ghost.struck === true && "line-through")
							: lit
								? "text-text"
								: "text-muted",
					)}
				>
					{ghost.name}
				</span>
				<span
					className={cn(
						"ml-auto shrink-0 font-mono text-2xs leading-3",
						broken ? "text-text/80" : lit ? "text-text/75" : "text-muted/70",
					)}
				>
					{ghost.tail}
				</span>
			</button>
			{/* A void cannot be travelled to, so pointing at one offers the only move
			    there is: the line the walk is written on, and a press opens it there.
			    It is placed rather than inserted, so nothing shifts, and it runs off
			    the plate's side rather than under it, because under it is where the
			    next void in the stack already is. */}
			{broken && lit && ghost.site !== undefined ? (
				<span
					className="absolute whitespace-nowrap font-mono text-2xs text-muted/50 leading-3"
					style={{ left: GW + 10, top: (GH - 12) / 2 }}
				>
					{ghost.site}
				</span>
			) : null}
		</div>
	);
}

/* ---------- the arrows ---------- */

/**
 * The four the shipped canvas would draw plus the two it cannot.
 *
 * `menu` to `cart` is unconditional and solid; `cart` to `receipt` sits inside a
 * branch and is dashed, both in the thread. The two ghosts `cart` reaches keep
 * that language exactly, because those walks work. The two leaving `cart--empty`
 * are grey and end on a bar instead of a head.
 */
function ArrowLayer({ lit }: { lit: string | null }) {
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			<path d="M184 280C206 280 218 310 240 310" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m248 310-8-4.5v9Z" fill="var(--color-thread)" />
			<g opacity="0.75">
				<path
					d="M410 250C470 250 545 200 600 200"
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					strokeDasharray="5 5"
				/>
				<path d="m608 200-8-4.5v9Z" fill="var(--color-thread)" />
			</g>
			{/* pointing at a ghost thickens the walk that reaches it, so the pairing
			    reads from the plate back to the frame as well as the other way */}
			<g opacity={lit === "checkout" ? 1 : 0.9}>
				<path
					d="M410 450C450 450 500 467 548 467"
					stroke="var(--color-thread)"
					strokeWidth={lit === "checkout" ? 2.25 : 1.5}
				/>
				<path d="m556 467-8-4.5v9Z" fill="var(--color-thread)" />
			</g>
			<g opacity={lit === "home" ? 1 : 0.7}>
				<path
					d="M410 486C450 486 500 515 548 515"
					stroke="var(--color-thread)"
					strokeWidth={lit === "home" ? 2.25 : 1.5}
					strokeDasharray="5 5"
				/>
				<path d="m556 515-8-4.5v9Z" fill="var(--color-thread)" />
			</g>
			{/* no head, and it stops eight pixels short of the plate: the walk is
			    declared, it is drawn, and it does not arrive */}
			<g opacity={lit === "chekout" ? 1 : 0.8}>
				<path d="M184 632C198 632 204 627 216 627" stroke="var(--color-muted)" strokeWidth="1.5" />
				<path d="M218 619v16" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round" />
			</g>
			<g opacity={lit === "nav" ? 1 : 0.8}>
				<path d="M184 688C198 688 204 675 216 675" stroke="var(--color-muted)" strokeWidth="1.5" />
				<path d="M218 667v16" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round" />
			</g>
		</svg>
	);
}

/* ---------- the canvas ---------- */

function GhostCanvas({ pointed, onPoint }: { pointed: string | null; onPoint: (id: string | null) => void }) {
	return (
		<>
			<ArrowLayer lit={pointed} />
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
							<div
								className="origin-top-left"
								style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}
							>
								{frame.render === undefined ? (
									<CoffeeScreen screen={frame.screen ?? "cart"} />
								) : (
									frame.render()
								)}
							</div>
						</div>
						{frame.selected === true ? <FrameSelection /> : null}
					</div>
				</div>
			))}
			{GHOSTS.map((ghost) => (
				<GhostPlate key={ghost.id} ghost={ghost} lit={pointed === ghost.id} onPoint={onPoint} />
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
 * A turn that has landed and has nothing to do with the ghosts.
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
 * The shipped shell, the Pages tree, the canvas, and the agent holding the whole
 * right rail, which is the premise this ticket exists under.
 *
 * Pointing at a ghost lights the page it lands on, the way a rail row does
 * (#143). That pairing is what teaches the second word on a plate: the first time
 * `shop` lights in the tree while the pointer is on `checkout shop`, the column
 * stops being two names and starts being an address.
 */
export function GhostWindow({ initialPointed = null }: { initialPointed?: string | null | undefined }) {
	const [pointed, setPointed] = useState<string | null>(initialPointed);
	const litPage = GHOSTS.find((ghost) => ghost.id === pointed)?.page ?? null;
	const pages = PAGES_AT_REST.map((page) => ({ ...page, lit: page.name === litPage }));
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
				<GhostCanvas pointed={pointed} onPoint={setPointed} />
			</CanvasChrome>
		</SpoolShell>
	);
}
