import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { CartEmptyRestrained } from "shared/ui/demo/coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "shared/ui/spool/canvas-chrome";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * What survives of connections once the agent owns the rail (#146).
 *
 * The canvas draws an arrow only when both ends are on the page you are looking
 * at. Two facts have nowhere left to live, and they are the two an arrow could
 * never carry anyway: a walk that lands on another page, and a walk whose
 * destination does not exist. So one mark rides the frame, and this file holds
 * the drawing of it plus the window every candidate is judged in.
 *
 * **One family, two terminators.** The mark is the settled `edge` glyph from
 * `agent-nav-marks` — a frame, a walk, and the frame at the other end — with the
 * far end saying which of the two facts this is. Off the page, the far frame is
 * a dashed ring: it is there, you cannot see it from here. Broken, it is a
 * cross: there is nothing at the other end at all.
 *
 * **Loud without colour.** The accent belongs to the selection, so a broken walk
 * cannot be red. It gets a hairline chip and full text strength instead, and the
 * off-page mark stays bare and muted. Chipped against bare is the difference you
 * can read across a whole canvas at 41%; a four-pixel change of terminator is
 * not.
 *
 * **The scene is fixed across the candidates.** Four frames, two of them
 * ordinary, `cart` selected and walking off the page twice, `cart--empty`
 * carrying two walks that go nowhere and no drawn arrow at all — which is the
 * exact bug `inspector.tsx:592` names: a frame whose only walks are unreadable
 * used to read as a frame with no walks.
 *
 * The Pages tree already ticks where the *selected* frame lands (#144). That
 * overlap is real and it is drawn here rather than argued: `receipt` wears a
 * tick, `shop` and `site` wear one on their collapsed rows. What the tree cannot
 * do is speak for a frame nobody selected, and it has no way at all to say a
 * walk is broken.
 */

/* ---------- the glyphs ---------- */

/**
 * A walk that leaves the page: the settled `edge` glyph, with the far frame a
 * shade down because it is real and this canvas cannot show it.
 *
 * A dashed far ring was drawn first and is the reason this one is solid. At the
 * size it ships, four dashes around a 2.3 radius come out as three specks and
 * read as a rendering fault rather than as a frame you cannot see.
 */
export function OffPageGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="4.4" cy="4.4" r="2.3" stroke="currentColor" strokeWidth="1.35" />
			<path d="M6.15 6.15 9.85 9.85" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			<circle cx="11.6" cy="11.6" r="2.3" stroke="currentColor" strokeWidth="1.35" strokeOpacity="0.55" />
		</svg>
	);
}

/**
 * A walk with nothing at the far end: a name no frame answers to, or a
 * destination the parser cannot read. Same two strokes the rail settles a failed
 * call with, so a cross means the same thing in both places.
 */
export function BrokenGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="4.4" cy="4.4" r="2.3" stroke="currentColor" strokeWidth="1.35" />
			<path d="M6.15 6.15 9.1 9.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			<path
				d="M9.7 9.7 13.9 13.9M13.9 9.7 9.7 13.9"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/* ---------- what a frame declares ---------- */

export type WalkKind = "off" | "broken";

export interface Walk {
	readonly kind: WalkKind;
	/** how many walks of this kind the frame declares; the mark says only how many */
	readonly count: number;
}

export interface SceneFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen?: CoffeeScreenName | undefined;
	/** a frame the coffee screens do not hold, drawn at the same natural size */
	readonly render?: (() => ReactNode) | undefined;
	readonly walk?: Walk | undefined;
	readonly selected?: boolean | undefined;
	/** the canvas is not repainting this one; the shipped label wears a ▸ for it */
	readonly paused?: boolean | undefined;
}

const NAT_W = 240;
const NAT_H = 520;
const FW = 158;
const S = FW / NAT_W;
const FH = Math.round(NAT_H * S);
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

export const SCENE: readonly SceneFrame[] = [
	{ name: "menu", screen: "menu", x: 30, y: 96, paused: true },
	{ name: "cart", screen: "cart", x: 238, y: 132, selected: true, walk: { kind: "off", count: 2 } },
	{ name: "receipt", screen: "receipt", x: 446, y: 72, paused: true },
	{
		name: "cart--empty",
		render: CartEmptyRestrained,
		x: 446,
		y: 500,
		paused: true,
		walk: { kind: "broken", count: 2 },
	},
];

/** where `cart` goes that no arrow on this page can reach */
export const OFF_PAGE: readonly { target: string; page: string; certainty: "will" | "might" }[] = [
	{ target: "checkout", page: "shop", certainty: "will" },
	{ target: "home", page: "site", certainty: "might" },
];

/** what `cart--empty` declares and never reaches */
export const BROKEN: readonly { name: string; why: "missing" | "unreadable" }[] = [
	{ name: "chekout", why: "missing" },
	{ name: "nav.tsx:12", why: "unreadable" },
];

export const PAGES_AT_REST: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "cart--empty", "menu", "receipt"], active: true, open: true },
	{ name: "shop", frames: ["checkout", "payment"] },
	{ name: "site", frames: ["home"] },
];

/** the tree's own answer, which covers the selection and nothing else (#144) */
export const TARGETS: readonly Target[] = [
	{ frame: "receipt", certainty: "might" },
	{ frame: "checkout", certainty: "will" },
	{ frame: "home", certainty: "might" },
];

/* ---------- the mark ---------- */

/**
 * The mark itself, wherever a candidate hangs it.
 *
 * `bare` is the label row, where the canvas background is not behind it and a
 * chip would be a second object next to the name. `door` is the frame edge,
 * where the mark is floating over the canvas and has to carry its own surface.
 */
export function WalkMark({
	walk,
	shape = "bare",
	open = false,
	onPress,
	onLeave,
}: {
	walk: Walk;
	shape?: "bare" | "door";
	open?: boolean;
	onPress?: (() => void) | undefined;
	onLeave?: (() => void) | undefined;
}) {
	const broken = walk.kind === "broken";
	const Glyph = broken ? BrokenGlyph : OffPageGlyph;
	return (
		<button
			type="button"
			onClick={onPress}
			onMouseLeave={onLeave}
			aria-label={broken ? `${walk.count} walks go nowhere` : `${walk.count} walks leave this page`}
			title={broken ? `${walk.count} walks go nowhere` : `${walk.count} walks leave this page`}
			className={cn(
				// the border is always there and usually transparent, so pressing a bare
				// mark cannot move the name next to it by two pixels
				"flex shrink-0 cursor-pointer items-center gap-1 border font-mono text-2xs leading-3 transition-colors duration-150",
				shape === "door" ? "h-5 rounded-r-sm border-l-0 pr-1.5 pl-1" : "rounded-xs px-1 py-[2px]",
				shape === "door"
					? broken
						? "border-muted/45 bg-surface"
						: "border-border-raised bg-raised"
					: broken
						? "border-border-raised bg-surface"
						: "border-transparent",
				broken ? "text-text hover:text-text" : "text-muted/70 hover:text-text",
				// pressed has to read on both, and the broken mark is already wearing a
				// chip, so the lift is the surface under it rather than a surface arriving
				open && "border-muted/50 bg-raised text-text",
			)}
		>
			<Glyph className="h-3.5 w-3.5" />
			<span className="tabular-nums">{walk.count}</span>
		</button>
	);
}

/* ---------- the pressed state ---------- */

/**
 * What the mark opens: the list the rail used to hold, one frame's worth of it.
 *
 * The rows are the shipped inspector's rows unchanged — certainty as the leading
 * glyph, a missing name struck through, an unreadable site named by its source
 * location, because that location is the only thing there is to say about it.
 * All that is added is the page a target lands on, which is the fact the arrow
 * could not draw.
 */
export function WalkSheet({
	kind,
	onPoint,
	style,
}: {
	kind: WalkKind;
	/** hovering a destination lights its page in the tree, the way a rail row does (#143) */
	onPoint?: ((page: string | null) => void) | undefined;
	style?: React.CSSProperties | undefined;
}) {
	return (
		<div
			className="absolute z-30 w-[216px] rounded-md border border-border-raised bg-raised p-unit"
			style={style}
			onMouseLeave={onPoint === undefined ? undefined : () => onPoint(null)}
		>
			<p className="px-2 pt-1 pb-1.5 font-mono text-2xs text-muted/70 leading-3">
				{kind === "off" ? `${OFF_PAGE.length} walks leave this page` : `${BROKEN.length} walks go nowhere`}
			</p>
			{kind === "off"
				? OFF_PAGE.map((row) => (
						<button
							key={row.target}
							type="button"
							onMouseEnter={onPoint === undefined ? undefined : () => onPoint(row.page)}
							className="group flex h-[26px] w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-surface"
						>
							<span
								className={cn(
									"shrink-0 text-xs leading-3",
									row.certainty === "will" ? "text-thread/70" : "text-muted/45",
								)}
							>
								{row.certainty === "will" ? "→" : "⇢"}
							</span>
							<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
								{row.target}
							</span>
							<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{row.page}</span>
						</button>
					))
				: BROKEN.map((row) => (
						<div key={row.name} className="flex h-[26px] w-full items-center gap-2 px-2">
							<span className="shrink-0 text-xs text-muted/45 leading-3">
								{row.why === "missing" ? "→" : "⇠"}
							</span>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-2xs text-muted/45 leading-3",
									row.why === "missing" && "line-through",
								)}
							>
								{row.name}
							</span>
							<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{row.why}</span>
						</div>
					))}
		</div>
	);
}

/* ---------- the canvas under it ---------- */

/**
 * The four frames, their two drawable arrows, and a slot per marked frame.
 *
 * The arrows are the shipped canvas's own: an unconditional walk solid, a walk
 * inside a branch dashed, both in the thread. Nothing leaves `cart--empty`,
 * because nothing it declares can be drawn.
 */
export function WalkCanvas({
	place,
	renderMark,
	overlay,
}: {
	place: "label" | "edge";
	renderMark: (frame: SceneFrame, walk: Walk) => ReactNode;
	overlay?: ReactNode;
}) {
	return (
		<>
			<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
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
			</svg>
			{SCENE.map((frame) => (
				<div
					key={frame.name}
					className="absolute flex flex-col"
					style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: FW }}
				>
					<div className="flex h-4 w-full min-w-0 items-center gap-1.5 pb-2.5 font-mono text-sm leading-4">
						{frame.paused === true ? (
							<span className="shrink-0 text-2xs text-muted leading-3">▸</span>
						) : null}
						<span className={cn("min-w-0 truncate", frame.selected === true ? "text-thread" : "text-muted")}>
							{frame.name}
						</span>
						{place === "label" && frame.walk !== undefined ? renderMark(frame, frame.walk) : null}
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
						{place === "edge" && frame.walk !== undefined ? (
							<div className="absolute" style={{ left: FW - 1, top: Math.round(FH * 0.62) }}>
								{renderMark(frame, frame.walk)}
							</div>
						) : null}
					</div>
				</div>
			))}
			{overlay}
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
					className={cn(
						"absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
						position,
					)}
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
 * A turn that has landed and has nothing to do with the marks.
 *
 * It is here so the rail is honest rather than helpful: if the agent had just
 * explained where `cart` goes, the canvas would not be carrying its own weight
 * and the mark would be untested.
 */
const TURN: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "tighten the receipt header, the total is sitting on the rule" },
	{ key: "read", kind: "line", state: "done", verb: "read", subject: "receipt" },
	{ key: "edit", kind: "line", state: "done", verb: "edit", subject: "receipt ×2", count: 2 },
	{ key: "shot", kind: "line", state: "done", verb: "shot", subject: "receipt" },
	{ key: "said", kind: "prose", full: SAID, shown: SAID },
];

/**
 * The window every candidate is drawn in: the shipped shell, the Pages tree, the
 * canvas, and the agent holding the whole right rail, which is the premise this
 * ticket exists under.
 */
export function MarkWindow({
	place,
	renderMark,
	overlay,
	litPage = null,
}: {
	place: "label" | "edge";
	renderMark: (frame: SceneFrame, walk: Walk) => ReactNode;
	overlay?: ReactNode;
	/** a page paired with something out on the canvas pointing at it */
	litPage?: string | null | undefined;
}) {
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
				<WalkCanvas place={place} renderMark={renderMark} overlay={overlay} />
			</CanvasChrome>
		</SpoolShell>
	);
}
