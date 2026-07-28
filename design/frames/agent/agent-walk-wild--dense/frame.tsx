import { useState } from "react";
import type { PageRow, Target } from "../../../shared/ui/spool-canvas-chrome";
import {
	CanvasFrame,
	CartEmptyRestrained,
	EXITS,
	FAULTS,
	type WildFrame,
	WildWindow,
} from "../agent-walk-wild/plinth";

/**
 * agent-walk-wild--dense: the claim, at thirty frames and ten off-page walks.
 *
 * This is the case every candidate has to survive and it is the reason the floor
 * only speaks when spoken to. Thirty frames on one page. Ten walks leave it,
 * spread across seven of them. Two more go nowhere. On the canvas there are
 * exactly two floors: the one under the frame you are pointing at, and the one
 * under the frame that is broken.
 *
 * Count what a per-frame mark would have drawn instead: eight marks, permanently,
 * scattered through a field of thirty rectangles that are already only fifty-eight
 * pixels wide. A mark small enough not to shout at thirty is a mark you cannot
 * find, and a mark you can find at thirty is a rash.
 *
 * **`pay` is selected and its floor is open.** `checkout` on `shop`, `home` on
 * `site`, whole names at screen size, exactly as legible here as they are at 38%,
 * because the floor does not scale with the zoom. Point at any of the other six
 * frames that leave the page and its floor opens under it and this one stays,
 * because selection holds a floor open and the pointer only borrows one. There is
 * never more than one borrowed at a time, so the count is bounded by the pointer
 * rather than by the page.
 *
 * **`pay--error` is broken and did not wait to be asked.** From the far side of
 * the page you read one thing and it is not a word: a split rule, the only rule on
 * the canvas, under a frame in the middle row. That is the whole design of the
 * fault signal. At this zoom the names on every frame are already down to their
 * first four characters and any glyph a candidate hangs on one is three pixels and
 * gone; a 166 pixel rule with a nine pixel gap in it is not.
 *
 * **The gutter is the price, and it is drawn rather than argued.** A floor is
 * screen size and the frame it belongs to is not, so at 15% it is nearly three
 * times the frame's width and it needs 80 pixels of clear canvas under the row.
 * This page has 99, which is a comfortable layout and not a lucky one, but a page
 * packed tighter than that has floors that hang over the row below. They carry
 * `bg-canvas` and come forward, so they stay readable; what they cover while they
 * are open is somebody else's label.
 *
 * One thing this page proves by accident, and it is worth keeping: look at the
 * selected frame's own label. `pay` is three characters and it has been truncated
 * to one, because `play` takes the rest of a fifty-eight pixel row. The label row
 * at this zoom cannot hold the frame's name and the one verb it already carries.
 * That is the argument against putting anything else in it, made by the shipped
 * chrome rather than by me.
 *
 * The tree keeps its own answer underneath all of it: `shop` and `site` tick on
 * their collapsed rows because the selection lands there (#144). What the tree
 * cannot do is speak for a frame nobody selected, and it has no way at all to say
 * a walk is broken, which is the half of this ticket the canvas has to hold.
 */

/* ---------- the page ---------- */

const DW = 58;
const DH = 125;
const COLS = 10;
const PITCH_X = 76;
/**
 * The gutter is the whole layout decision. A floor is screen size and the frames
 * are not, so at 15% the space between two rows has to hold a full one: 99 pixels
 * of clear canvas under every row, against the 80 a selected floor takes.
 */
const PITCH_Y = 250;
const ORIGIN_X = 12;
const ORIGIN_Y = 46;

const NAMES = [
	"menu",
	"menu--empty",
	"cart",
	"cart--empty",
	"pay",
	"product--sold",
	"search",
	"search--empty",
	"product",
	"order",
	"receipt",
	"receipt--refund",
	"orders",
	"pay--error",
	"order--track",
	"account",
	"account--signin",
	"address",
	"address--new",
	"cards",
	"cards--add",
	"favourites",
	"tips",
	"help",
	"about",
	"settings",
	"notify",
	"legal",
	"support",
	"offline",
] as const;

/**
 * Seven frames leave this page, ten walks between them, and only the selected one
 * says so. The other six are in here so the count is real rather than claimed.
 */
const LEAVES = new Set([
	"product",
	"account",
	"orders",
	"cards",
	"pay",
	"search",
	"favourites",
]);

const SELECTED = "pay";
const BROKEN = "pay--error";

const SCREENS = ["menu", "cart", "receipt"] as const;

const SCENE: readonly WildFrame[] = NAMES.map((name, index) => {
	const col = index % COLS;
	const row = Math.floor(index / COLS);
	const base: WildFrame = {
		name,
		x: ORIGIN_X + col * PITCH_X,
		y: ORIGIN_Y + row * PITCH_Y,
		paused: name !== SELECTED,
		...(name.endsWith("--empty")
			? { render: CartEmptyRestrained }
			: { screen: SCREENS[index % SCREENS.length] }),
	};
	if (name === SELECTED) return { ...base, selected: true, exits: EXITS, paused: false };
	if (name === BROKEN) return { ...base, faults: FAULTS };
	if (LEAVES.has(name)) return { ...base, exits: EXITS };
	return base;
});

/** short same-page hops, drawn because a dense page is not an empty one */
const HOPS: readonly { from: number; certain: boolean }[] = [
	{ from: 0, certain: true },
	{ from: 1, certain: true },
	{ from: 2, certain: false },
	{ from: 4, certain: true },
	{ from: 6, certain: false },
	{ from: 7, certain: true },
	{ from: 10, certain: true },
	{ from: 11, certain: false },
	{ from: 13, certain: true },
	{ from: 15, certain: true },
	{ from: 16, certain: false },
	{ from: 18, certain: true },
	{ from: 21, certain: true },
	{ from: 22, certain: false },
	{ from: 25, certain: true },
	{ from: 26, certain: true },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: NAMES, active: true, open: true },
	{ name: "shop", frames: ["checkout", "payment", "basket", "confirm"] },
	{ name: "site", frames: ["home", "pricing", "changelog"] },
];

const TARGETS: readonly Target[] = [
	{ frame: "checkout", certainty: "will" },
	{ frame: "home", certainty: "might" },
];

export default function AgentWalkWildDenseFrame() {
	const [hovered, setHovered] = useState<string | null>(null);
	const [lit, setLit] = useState<string | null>(null);

	return (
		<WildWindow pages={PAGES} targets={TARGETS} selected={SELECTED} zoom="15%" litPage={lit}>
			<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
				{HOPS.map((hop) => {
					const col = hop.from % COLS;
					const row = Math.floor(hop.from / COLS);
					const x0 = ORIGIN_X + col * PITCH_X + DW;
					const x1 = ORIGIN_X + (col + 1) * PITCH_X;
					const y = ORIGIN_Y + row * PITCH_Y + 63;
					return (
						<g key={hop.from} opacity={hop.certain ? 1 : 0.75}>
							<path
								d={`M${x0} ${y}H${x1 - 8}`}
								stroke="var(--color-thread)"
								strokeWidth="1.5"
								strokeDasharray={hop.certain ? undefined : "4 4"}
							/>
							<path d={`m${x1} ${y}-8-4.5v9Z`} fill="var(--color-thread)" />
						</g>
					);
				})}
			</svg>
			{SCENE.map((frame) => (
				<CanvasFrame
					key={frame.name}
					frame={frame}
					w={DW}
					h={DH}
					hovered={hovered === frame.name}
					onHover={setHovered}
					onPoint={setLit}
				/>
			))}
		</WildWindow>
	);
}
