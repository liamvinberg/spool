import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import type { PlayEntry } from "../../../shared/lib/turn-play";
import { cn } from "../../../shared/lib/utils";
import { CartEmptyRestrained } from "../../../shared/ui/coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import { CanvasChrome, type PageRow, type Target } from "../../../shared/ui/spool-canvas-chrome";
import { ConnectionsIcon } from "../../../shared/ui/spool-icons";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-walk-reveal — the shared drawing for the family (#146).
 *
 * One idea, three triggers. A frame's unreachable walks are not printed anywhere
 * until you ask for that one frame, and when they come they come in the language
 * spool already annotates in: a dot on the thing, a hairline with one bend, a
 * shelf, mono labels. The frames beside this file change only what counts as
 * asking.
 *
 * **Why the annotation language and not a panel.** `site-hub--composed` already
 * teaches a reader that a dot, a leader and a mono label mean *this pixel, and
 * here is what it is*. A walk that leaves the page is exactly that shape of fact:
 * it belongs to one frame and it has a name. Reusing the drawing means the reveal
 * needs no border, no fill and no surface of its own — it lands on bare canvas as
 * ink, which is the only way a second object can appear next to a frame without
 * becoming a card floating over the work.
 *
 * **What is different from the coaching layer.** These leaders are pressable. A
 * coaching annotation is a statement and closing it means doing what it says; a
 * walk label is an address, and pressing it travels — the page follows, the
 * arrival is centred, the target ends up selected. So the row lights on hover and
 * lights its page in the Pages tree with it (#143), which is what earns the second
 * word on every label.
 *
 * **Rule above, rows below.** The coaching layer puts one label on top of its
 * shelf. A frame can declare five walks, and a stack that grows upward from the
 * shelf grows back into the frame it came from. So the shelf is drawn as a rule
 * and the rows hang under it, which is the other half of the same language:
 * `MarginNote` is a rule with its text below. Growth is away from the frame, and
 * the first row is the first walk.
 *
 * **The shelf is as wide as its widest label, and that is the whole width rule.**
 * Five walks make the block taller, never wider, and one frame reveals at a time,
 * so the worst case on a canvas is one block of one column. A label past the cap
 * truncates its name; the page it lands on never truncates, because a half-read
 * address is worse than a half-read name.
 *
 * **Broken is never gated.** Off-page walks wait to be asked. A walk with nothing
 * at the other end draws permanently, on any frame, selected or not, in the same
 * leader with a crossed anchor and its rows at full text strength. A fault you
 * have to find is not a fault report. It stays grey: the accent is the selection's
 * and nothing else may borrow it, which is also why the anchor dot is only red
 * while the frame it sits on is red.
 */

/* ---------- canvas geometry, copied from the shared scene ---------- */

const NAT_W = 240;
const NAT_H = 520;
const FW = 158;
const S = FW / NAT_W;
const FH = Math.round(NAT_H * S);
/** the shipped label row: 16px of line plus the 10px it stands off the frame */
const LABEL_LIFT = 26;

const EASE = [0.22, 1, 0.36, 1] as const;

/** 11px Fragment Mono, one advance — what the shelf is measured in */
const CH = 6.6;
/** the shelf never runs past this, and a name truncates before it does */
const SHELF_CAP = 224;
/** one row of labels, hanging under the shelf */
const ROW = 20;

export interface Point {
	readonly x: number;
	readonly y: number;
}

/* ---------- what a leader carries ---------- */

export interface WalkRow {
	readonly name: string;
	/** the page a walk lands on: the one fact no arrow on this canvas can carry */
	readonly page?: string | undefined;
	readonly certainty?: "will" | "might" | undefined;
	/** a fault named the way the inspector names it */
	readonly why?: string | undefined;
	/** a name no frame answers to, struck the way the inspector strikes it */
	readonly struck?: boolean | undefined;
}

export interface Leader {
	readonly kind: "off" | "broken";
	/** where the dot sits: on the frame edge the walks leave from */
	readonly anchor: Point;
	/** the single bend, where the leader arrives and the shelf starts */
	readonly bend: Point;
	readonly rows: readonly WalkRow[];
}

/**
 * The shelf continues in the direction the leader was already travelling, so the
 * rule never runs back over the line that drew it. That one rule is what lets the
 * same object be placed on either side of a frame: the labels hang from whichever
 * end of the shelf is further from the anchor, always left-aligned, because a
 * ragged left edge on a list of names is unreadable.
 */
function shelfOf(leader: Leader): { readonly left: number; readonly width: number; readonly name: number } {
	const { name, shelf } = measure(leader.rows);
	const away = leader.bend.x >= leader.anchor.x ? 1 : -1;
	return { left: away === 1 ? leader.bend.x : leader.bend.x - shelf, width: shelf, name };
}

type Tone = "full" | "faint" | "fault";

/**
 * Three strengths, and the strength is the state.
 *
 * `faint` is a preview and has to look like one without disappearing; `full` is a
 * reveal you asked for; `fault` is louder than either and gets there on ink weight
 * alone, because the accent is the selection's and a broken walk may not borrow it.
 */
const HAIRLINE: Record<Tone, string> = {
	full: "color-mix(in srgb, var(--color-text) 28%, transparent)",
	faint: "color-mix(in srgb, var(--color-text) 17%, transparent)",
	fault: "color-mix(in srgb, var(--color-text) 40%, transparent)",
};

const NAME_TONE: Record<Tone, string> = {
	full: "text-text/90",
	faint: "text-muted/65",
	fault: "text-text",
};

const META_TONE: Record<Tone, string> = {
	full: "text-muted/70",
	faint: "text-muted/40",
	fault: "text-muted/75",
};

/** the certainty arrow follows the leader it belongs to, so it never out-shouts a name */
const GLYPH_TONE: Record<Tone, Record<"will" | "might", string>> = {
	full: { will: "text-muted/75", might: "text-muted/50" },
	faint: { will: "text-muted/50", might: "text-muted/32" },
	fault: { will: "text-muted", might: "text-muted" },
};

/** what the second word is: the page a walk lands on, or the fault it landed in */
const tailOf = (row: WalkRow): string => (row.page === undefined ? (row.why ?? "") : `· ${row.page}`);

/**
 * The block measures itself once and every row obeys it.
 *
 * Names are set in a column as wide as the longest one, so the pages line up under
 * each other instead of stepping in and out with the name lengths. Five addresses
 * read as five addresses that way; ragged, they read as prose. The shelf is that
 * column plus the second one plus a fixed overhang, which is the whole width rule:
 * the block is as wide as its widest label and no wider, however many rows it has.
 */
function measure(rows: readonly WalkRow[]): { readonly name: number; readonly shelf: number } {
	const chars = (pick: (row: WalkRow) => string) => rows.reduce((wide, row) => Math.max(wide, pick(row).length), 0);
	// the column is set in `ch` so it is exact in the real font; CH only has to be
	// close enough to size the rule that sits over it
	const name = chars((row) => row.name);
	const tail = chars(tailOf);
	return { name, shelf: Math.min(Math.round(16 + (name + tail) * CH + 6 + 22), SHELF_CAP) };
}

/* ---------- the row glyphs: the canvas's own arrow, one row long ---------- */

function CertaintyGlyph({ certainty, className }: { certainty: "will" | "might"; className?: string }) {
	return (
		<svg viewBox="0 0 11 8" className={className} fill="none" aria-hidden="true">
			<path
				d="M0.6 4h6.2"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeDasharray={certainty === "might" ? "2 2" : undefined}
			/>
			<path d="m10.4 4-3-1.8v3.6Z" fill="currentColor" />
		</svg>
	);
}

/** nothing at the far end: the same two strokes the rail settles a failed call with */
function FaultGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path d="M1.6 1.6 8.4 8.4M8.4 1.6 1.6 8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

/* ---------- the leader ---------- */

/**
 * One frame's worth of unreachable walks: a dot on the frame edge, a 1px hairline
 * with a single bend, a shelf, and the rows hanging under it.
 *
 * It draws outward from the anchor and retracts label-first, so the thing you were
 * reading leaves before the line that pointed at it — the same order the coaching
 * layer retires in.
 */
function LeaderGroup({
	leader,
	tone,
	pointed,
	onPoint,
}: {
	leader: Leader;
	tone: Tone;
	pointed: string | null;
	onPoint: (row: string | null, page: string | null) => void;
}) {
	const { anchor, bend, rows } = leader;
	const shelf = shelfOf(leader);
	const far = bend.x >= anchor.x ? shelf.left + shelf.width : shelf.left;
	// half-pixel offsets keep a 1px stroke on one device pixel
	const d = `M ${anchor.x + 0.5} ${anchor.y + 0.5} L ${bend.x + 0.5} ${bend.y + 0.5} L ${far + 0.5} ${bend.y + 0.5}`;
	const fault = leader.kind === "broken";

	return (
		<div className="pointer-events-none absolute inset-0">
			<svg className="absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
				<motion.path
					d={d}
					stroke={HAIRLINE[tone]}
					strokeWidth={1}
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={{ pathLength: 0 }}
					animate={{ pathLength: 1 }}
					exit={{ pathLength: 0, transition: { duration: 0.24, ease: EASE, delay: 0.12 } }}
					transition={{ duration: 0.42, ease: EASE }}
				/>
				<motion.g
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: 0.16, delay: 0.2 } }}
					transition={{ duration: 0.22 }}
				>
					{fault ? (
						<path
							d={`M${anchor.x - 3.4} ${anchor.y - 3.4}L${anchor.x + 3.4} ${anchor.y + 3.4}M${anchor.x + 3.4} ${anchor.y - 3.4}L${anchor.x - 3.4} ${anchor.y + 3.4}`}
							stroke="var(--color-muted)"
							strokeWidth={1.4}
							strokeLinecap="round"
						/>
					) : (
						<circle
							cx={anchor.x + 0.5}
							cy={anchor.y + 0.5}
							r={2.5}
							fill={tone === "full" ? "var(--color-thread)" : "var(--color-muted)"}
							fillOpacity={tone === "full" ? 1 : 0.7}
						/>
					)}
				</motion.g>
			</svg>

			{rows.map((row, index) => {
				const id = `${leader.kind}:${row.name}`;
				const lit = pointed === id;
				const glyph = fault ? (
					// the marker is not the weakest thing on a row that reports a fault
					<FaultGlyph className="h-2.5 w-2.5 shrink-0 text-muted" />
				) : (
					<CertaintyGlyph
						certainty={row.certainty ?? "will"}
						className={cn(
							"h-2 w-2.5 shrink-0",
							GLYPH_TONE[tone][row.certainty ?? "will"],
							lit && "text-text/70",
						)}
					/>
				);
				const body = (
					<>
						{glyph}
						<span
							className={cn(
								"min-w-0 truncate",
								NAME_TONE[tone],
								lit && "text-text",
								row.struck === true && "line-through",
							)}
							style={{ minWidth: `${shelf.name}ch` }}
						>
							{row.name}
						</span>
						<span className={cn("shrink-0", META_TONE[tone], lit && "text-text/70")}>{tailOf(row)}</span>
					</>
				);
				const box = "absolute flex h-4 items-center gap-1.5 whitespace-nowrap font-mono text-xs leading-4";
				const place = { left: shelf.left + 6, top: bend.y + 5 + index * ROW, maxWidth: shelf.width - 12 };
				return (
					<motion.div
						key={id}
						className="pointer-events-none absolute inset-0"
						initial={{ opacity: 0, x: -6 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -4, transition: { duration: 0.14 } }}
						transition={{ duration: 0.3, ease: EASE, delay: 0.24 + index * 0.05 }}
					>
						{/* a walk that lands somewhere is an address and travels; a walk that
						    lands nowhere has nothing to press, so it is not a button */}
						{fault ? (
							<div className={box} style={place}>
								{body}
							</div>
						) : (
							<button
								type="button"
								aria-label={`Go to ${row.name} on ${row.page ?? "this page"}`}
								onMouseEnter={() => onPoint(id, row.page ?? null)}
								onMouseLeave={() => onPoint(null, null)}
								className={cn(box, "pointer-events-auto cursor-pointer text-left")}
								style={place}
							>
								{body}
							</button>
						)}
					</motion.div>
				);
			})}
		</div>
	);
}

/* ---------- the scene, held constant across the family ---------- */

export interface SceneFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen?: CoffeeScreenName | undefined;
	/** a frame the coffee screens do not hold, drawn at the same natural size */
	readonly render?: (() => ReactNode) | undefined;
	/** the canvas is not repainting this one; the shipped label wears a ▸ for it */
	readonly paused?: boolean | undefined;
	readonly leader?: Leader | undefined;
}

/** where `cart` goes that no arrow on this page can reach */
export const OFF_PAGE_TWO: readonly WalkRow[] = [
	{ name: "checkout", page: "shop", certainty: "will" },
	{ name: "home", page: "site", certainty: "might" },
];

/** the same frame after a week of work, which is where the width worry lives */
export const OFF_PAGE_FIVE: readonly WalkRow[] = [
	{ name: "checkout", page: "shop", certainty: "will" },
	{ name: "orders", page: "shop", certainty: "might" },
	{ name: "home", page: "site", certainty: "might" },
	{ name: "profile", page: "site", certainty: "might" },
	{ name: "search", page: "shop", certainty: "might" },
];

/** what `cart--empty` declares and never reaches */
export const BROKEN_ROWS: readonly WalkRow[] = [
	{ name: "chekout", why: "missing", struck: true },
	{ name: "nav.tsx:12", why: "unreadable" },
];

/**
 * Both blocks report leftward, into the open canvas under `menu`.
 *
 * The coaching layer always runs its shelf to the right because a landing page has
 * a margin there. A canvas has no margin: it has whatever the arrangement left
 * over, and here that is the bottom-left. So the direction is derived from where
 * the leader was already heading rather than declared, and the drawing is the same
 * object either way.
 */
const BROKEN_LEADER: Leader = {
	kind: "broken",
	anchor: { x: 446, y: 748 },
	bend: { x: 424, y: 708 },
	rows: BROKEN_ROWS,
};

export function buildScene(offPage: readonly WalkRow[]): readonly SceneFrame[] {
	return [
		{ name: "menu", screen: "menu", x: 30, y: 96, paused: true },
		{
			name: "cart",
			screen: "cart",
			x: 238,
			y: 132,
			// the dot clears the bottom-right resize handle, and the drop passes to the
			// right of the selection's own size chip rather than through it
			leader: { kind: "off", anchor: { x: 378, y: 474 }, bend: { x: 350, y: 534 }, rows: offPage },
		},
		{ name: "receipt", screen: "receipt", x: 446, y: 72, paused: true },
		{ name: "cart--empty", render: CartEmptyRestrained, x: 446, y: 500, paused: true, leader: BROKEN_LEADER },
	];
}

export const PAGES_TWO: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "cart--empty", "menu", "receipt"], active: true, open: true },
	{ name: "shop", frames: ["checkout", "payment"] },
	{ name: "site", frames: ["home"] },
];

export const PAGES_FIVE: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "cart--empty", "menu", "receipt"], active: true, open: true },
	{ name: "shop", frames: ["checkout", "orders", "payment", "search"] },
	{ name: "site", frames: ["home", "profile"] },
];

/** the tree's own answer, which covers the selection and nothing else (#144) */
export const TARGETS_TWO: readonly Target[] = [
	{ frame: "receipt", certainty: "might" },
	{ frame: "checkout", certainty: "will" },
	{ frame: "home", certainty: "might" },
];

export const TARGETS_FIVE: readonly Target[] = [
	{ frame: "receipt", certainty: "might" },
	{ frame: "checkout", certainty: "will" },
	{ frame: "orders", certainty: "might" },
	{ frame: "search", certainty: "might" },
	{ frame: "home", certainty: "might" },
	{ frame: "profile", certainty: "might" },
];

/* ---------- the frame's own chrome ---------- */

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

/**
 * The shipped label row, plus one verb.
 *
 * `play` is the selection's own verb and it sits at the far end of its own row, so
 * a second verb has one obvious home: beside it. `walks` reads as the noun and the
 * doing at once, and it only appears on a frame that has walks to show, so its
 * presence already says there is something to reveal and the number says how much.
 * Pressed, it takes the surface under it rather than a colour, because the colour
 * is the selection's.
 */
function FrameRow({
	frame,
	selected,
	hovered,
	verb,
	pinned,
	onVerb,
}: {
	frame: SceneFrame;
	selected: boolean;
	hovered: boolean;
	verb: number | null;
	pinned: boolean;
	onVerb?: (() => void) | undefined;
}) {
	return (
		<div className="flex h-4 w-full min-w-0 items-center gap-1.5 pb-2.5 font-mono text-sm leading-4">
			{frame.paused === true ? <span className="shrink-0 text-2xs text-muted leading-3">▸</span> : null}
			<span className={cn("min-w-0 truncate", selected ? "text-thread" : hovered ? "text-text" : "text-muted")}>
				{frame.name}
			</span>
			{selected ? (
				<span className="ml-auto flex shrink-0 items-center gap-1">
					{verb === null ? null : (
						<button
							type="button"
							aria-pressed={pinned}
							aria-label={`Show the ${verb} walks that leave this page`}
							onPointerDown={(event) => {
								event.stopPropagation();
								onVerb?.();
							}}
							className={cn(
								"flex cursor-pointer items-center gap-1 rounded-xs px-1 font-mono text-2xs leading-3 transition-colors duration-150",
								pinned ? "bg-raised text-text" : "text-muted hover:text-thread",
							)}
						>
							{/* the settled `edge` glyph, at the 12px it was drawn to survive */}
							<ConnectionsIcon className="h-3 w-3" />
							walks
							<span className="tabular-nums">{verb}</span>
						</button>
					)}
					<span className="flex items-center gap-1 px-1 font-mono text-2xs text-muted leading-3">
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</span>
				</span>
			) : null}
		</div>
	);
}

/* ---------- the pointer, drawn where the still needs one ---------- */

/**
 * The reader's own pointer, on the canvas rather than in a caption.
 *
 * White body, near-black casing: it has to read on the canvas and on a white
 * prototype screen without knowing which it landed on. It is drawing, not state —
 * the moment a real pointer moves in this frame it goes away.
 */
function DrawnPointer({ at }: { at: Point }) {
	return (
		<svg
			viewBox="0 0 24 24"
			className="pointer-events-none absolute z-40 h-[19px] w-[19px]"
			style={{ left: at.x - 3, top: at.y - 3 }}
			aria-hidden="true"
		>
			<path
				d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"
				fill="#FFFFFF"
				stroke="#0E0E0E"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
		</svg>
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

export type Trigger = "selection" | "verb" | "hover";

export interface RevealSpec {
	/** what counts as asking for a frame's walks */
	readonly trigger: Trigger;
	readonly scene: readonly SceneFrame[];
	readonly pages: readonly PageRow[];
	readonly targets: readonly Target[];
	readonly selected?: string | undefined;
	readonly hovered?: string | undefined;
	/** the verb's pressed state, which the verb trigger seeds true */
	readonly pinned?: boolean | undefined;
	/** the row the still shows under the pointer, `kind:name` */
	readonly seedPointed?: string | undefined;
	readonly seedPage?: string | undefined;
	readonly pointer?: Point | undefined;
}

export function RevealWindow(spec: RevealSpec) {
	const [selected, setSelected] = useState<string | null>(spec.selected ?? null);
	const [hovered, setHovered] = useState<string | null>(spec.hovered ?? null);
	const [pinned, setPinned] = useState(spec.pinned === true);
	const [pointed, setPointed] = useState<{ row: string | null; page: string | null }>({
		row: spec.seedPointed ?? null,
		page: spec.seedPage ?? null,
	});
	/** a real pointer has arrived, so the drawn one and its seeded states retire */
	const [live, setLive] = useState(false);

	const shows = (frame: SceneFrame): boolean => {
		if (frame.leader === undefined) return false;
		if (frame.leader.kind === "broken") return true;
		if (spec.trigger === "hover") return hovered === frame.name;
		if (spec.trigger === "verb") return selected === frame.name && pinned;
		return selected === frame.name;
	};

	const toneOf = (frame: SceneFrame, leader: Leader): Tone => {
		if (leader.kind === "broken") return "fault";
		return selected === frame.name ? "full" : "faint";
	};

	const litPage = live ? pointed.page : (spec.seedPage ?? null);
	const litRow = live ? pointed.row : (spec.seedPointed ?? null);
	const pages = spec.pages.map((page) => ({ ...page, lit: page.name === litPage }));

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="41%">
			<CanvasChrome
				pages={pages}
				{...(selected === null ? {} : { selected })}
				tool="select"
				targets={selected === null ? [] : spec.targets}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				{/* bare canvas is a target: pressing it drops the selection, and with it the reveal */}
				<div
					className="absolute inset-0"
					onPointerDown={() => setSelected(null)}
					onPointerMove={() => setLive(true)}
				/>

				{/* the two walks this page can draw: unconditional solid, branched dashed */}
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

				{spec.scene.map((frame) => {
					const isSelected = selected === frame.name;
					const walks = frame.leader?.kind === "off" ? frame.leader.rows.length : null;
					return (
						<div
							key={frame.name}
							className="absolute flex flex-col"
							style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: FW }}
							onMouseEnter={() => setHovered(frame.name)}
							onMouseLeave={() => setHovered(null)}
						>
							<FrameRow
								frame={frame}
								selected={isSelected}
								hovered={hovered === frame.name}
								verb={spec.trigger === "verb" ? walks : null}
								pinned={pinned}
								onVerb={() => setPinned((was) => !was)}
							/>
							<div
								className="relative"
								style={{ width: FW, height: FH }}
								onPointerDown={(event) => {
									event.stopPropagation();
									setSelected(frame.name);
								}}
							>
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
								{isSelected ? <FrameSelection /> : null}
							</div>
						</div>
					);
				})}

				{/* every leader in one coordinate space, over every frame */}
				{spec.scene.map((frame) => (
					<AnimatePresence key={frame.name} initial={false}>
						{frame.leader !== undefined && shows(frame) ? (
							<LeaderGroup
								key={frame.name}
								leader={frame.leader}
								tone={toneOf(frame, frame.leader)}
								pointed={litRow}
								onPoint={(row, page) => setPointed({ row, page })}
							/>
						) : null}
					</AnimatePresence>
				))}

				{spec.pointer === undefined || live ? null : <DrawnPointer at={spec.pointer} />}
			</CanvasChrome>
		</SpoolShell>
	);
}
