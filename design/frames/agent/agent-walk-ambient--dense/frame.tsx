import type { PageRow } from "../../../shared/ui/spool-canvas-chrome";
import {
	type AmbientFrame,
	AmbientWindow,
	CanvasFrame,
	CartEmptyRestrained,
	type Exit,
	type Fault,
	WalkLayer,
	useLayer,
	walkSize,
} from "../agent-walk-ambient/dock";

/**
 * agent-walk-ambient--dense — the proof frame: thirty frames, ten off-page walks, two
 * broken, at 15%.
 *
 * This is the case an always-on layer has to survive, and the reason it survives is
 * that it is allowed to draw less. A tag is screen size and the frame under it is
 * not, so somewhere between the zoom you read a page at and the zoom you survey one
 * at the words become wider than the rectangle they belong to. `walkSize` puts that
 * crossover at 30%: above it a wall carries tags, below it the same wall carries the
 * leader with its words taken away. Nothing is hidden and nothing is added — the
 * mark degrades, the way the canvas already degrades a frame into its cover.
 *
 * **What you can still read at 15%.** Which frames leave this page: seven of the
 * thirty, wearing one or two nubs on the right wall. Roughly how much traffic each
 * one exports, because two stubs are visibly two. And where the page is broken: two
 * stops, one on `pay--error` in the top row and one on `address--new` in the third,
 * each a terminator at full size against nothing else on the canvas that shape. You
 * cannot read `chekout` and you were never going to at this zoom. You can see that
 * something in the top row does not connect, and that is the entire job of a fault
 * signal at survey distance.
 *
 * **What it costs.** Ten nubs and two stops: twelve marks in a 24 pixel gutter, all
 * of them 14 pixels or shorter, none of them touching a neighbour. A tag would have
 * been 118 pixels here and would have crossed two frames. That is the whole reason
 * the degrade exists rather than being a nicety.
 *
 * **The docking rule holds and the gutter is what pays for it.** The nub lives in the
 * gap between two frames, so the arrangement has to have a gap. This page has 24
 * pixels of it and needs 15. A page arranged edge to edge has nubs over its
 * neighbours' covers — which is survivable, because a 1.25px hairline on a cover is
 * still a hairline, and it is the honest limit: docking is cheap because it borrows
 * the gutter, and a canvas with no gutter has nothing to lend.
 *
 * **The nubs sit below the arrow line, not on it.** Twelve same-page arrows leave
 * these same right walls at the frame's mid-height. The nubs start 25 pixels under
 * them, which is the one placement decision the dense case forced that the four-frame
 * case never would have: at 41% an arrow and a leader could not have collided by
 * accident, and at 15% they share a 24 pixel channel.
 *
 * Nothing is selected. The Pages tree ticks nothing, which is the premise: the tree
 * can speak for the frame you picked, and this page is thirty frames you did not.
 */

/* ---------- the page ---------- */

const DW = 58;
const DH = 126;
const ORIGIN_X = 16;
/** 58 of frame and 24 of gutter: the nub needs 15 of that gutter and gets it */
const PITCH_X = 82;

/**
 * A human arranged this, so the rows are not a spreadsheet. The offsets are small
 * enough that the 44 pixel vertical gutter never closes below 32, and they are
 * vertical only: a nub reaches sideways, and sideways is where the tolerance is thin.
 */
const JITTER = [0, 5, -4, 3, -6, 2, -3, 6, -2] as const;

const PLAN: readonly { readonly y: number; readonly col: number; readonly names: readonly string[] }[] = [
	{
		y: 44,
		col: 0,
		names: ["menu", "menu--empty", "cart", "cart--empty", "pay", "pay--error", "product", "product--sold", "search"],
	},
	{
		y: 240,
		col: 0,
		names: [
			"search--empty",
			"order",
			"order--track",
			"orders",
			"receipt",
			"receipt--refund",
			"account",
			"account--signin",
			"address",
		],
	},
	{
		y: 436,
		col: 1,
		names: ["address--new", "cards", "cards--add", "favourites", "tips", "help", "about", "settings"],
	},
	{ y: 632, col: 3, names: ["notify", "legal", "support", "offline"] },
];

/** ten walks leave this page, spread across seven frames */
const WALKS: Readonly<Record<string, readonly Exit[]>> = {
	pay: [
		{ target: "checkout", page: "shop", certainty: "will" },
		{ target: "home", page: "site", certainty: "might" },
	],
	product: [
		{ target: "gallery", page: "shop", certainty: "will" },
		{ target: "home", page: "site", certainty: "might" },
	],
	account: [
		{ target: "signin", page: "site", certainty: "will" },
		{ target: "history", page: "shop", certainty: "might" },
	],
	orders: [{ target: "invoice", page: "shop", certainty: "will" }],
	cards: [{ target: "billing", page: "site", certainty: "might" }],
	search: [{ target: "results", page: "shop", certainty: "will" }],
	favourites: [{ target: "home", page: "site", certainty: "might" }],
};

/** two of them go nowhere, one of each kind, at opposite ends of the page */
const BREAKS: Readonly<Record<string, readonly Fault[]>> = {
	"pay--error": [{ name: "chekout", why: "missing" }],
	"address--new": [{ name: "nav.tsx:12", why: "unreadable" }],
};

const SCREENS = ["menu", "cart", "receipt"] as const;

const SCENE: readonly AmbientFrame[] = PLAN.flatMap((row, rowIndex) =>
	row.names.map((name, index): AmbientFrame => {
		const col = row.col + index;
		const spot = JITTER[(col * 3 + rowIndex * 5) % JITTER.length] ?? 0;
		const exits = WALKS[name];
		const faults = BREAKS[name];
		return {
			name,
			x: ORIGIN_X + col * PITCH_X,
			y: row.y + spot,
			paused: true,
			...(name.endsWith("--empty")
				? { render: CartEmptyRestrained }
				: { screen: SCREENS[(rowIndex + index) % SCREENS.length] }),
			...(exits === undefined ? {} : { exits }),
			...(faults === undefined ? {} : { faults }),
			// the arrows already own the wall's mid-height; the nubs sit under them
			dock: { side: "right", anchor: 88, tag: 84 },
		};
	}),
);

const AT = new Map(SCENE.map((frame) => [frame.name, frame]));

/** short same-page hops, drawn because a dense page is not an empty one */
const HOPS: readonly { readonly from: string; readonly to: string; readonly certain: boolean }[] = [
	{ from: "menu", to: "menu--empty", certain: true },
	{ from: "cart", to: "cart--empty", certain: false },
	{ from: "product", to: "product--sold", certain: false },
	{ from: "search--empty", to: "order", certain: true },
	{ from: "receipt", to: "receipt--refund", certain: false },
	{ from: "account", to: "account--signin", certain: true },
	{ from: "address--new", to: "cards", certain: true },
	{ from: "cards--add", to: "favourites", certain: true },
	{ from: "tips", to: "help", certain: false },
	{ from: "about", to: "settings", certain: true },
	{ from: "notify", to: "legal", certain: true },
	{ from: "support", to: "offline", certain: false },
];

const NAMES = SCENE.map((frame) => frame.name);

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: NAMES, active: true, open: true },
	{ name: "shop", frames: ["checkout", "gallery", "history", "invoice", "results"] },
	{ name: "site", frames: ["billing", "home", "signin"] },
];

const FAULT_COUNT = Object.values(BREAKS).reduce((total, list) => total + list.length, 0);

export default function AgentWalkAmbientDenseFrame() {
	const layer = useLayer(true);

	return (
		<AmbientWindow pages={PAGES} zoom="15%" on={layer.on} faults={FAULT_COUNT} onToggle={layer.toggle}>
			{layer.on ? (
				<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
					{HOPS.map((hop) => {
						const from = AT.get(hop.from);
						const to = AT.get(hop.to);
						if (from === undefined || to === undefined) return null;
						const x0 = from.x + DW;
						const y0 = from.y + DH / 2;
						const x1 = to.x;
						const y1 = to.y + DH / 2;
						return (
							<g key={`${hop.from}/${hop.to}`} opacity={hop.certain ? 1 : 0.75}>
								<path
									d={`M${x0} ${y0}C${x0 + 10} ${y0} ${x1 - 18} ${y1} ${x1 - 8} ${y1}`}
									stroke="var(--color-thread)"
									strokeWidth="1.5"
									strokeDasharray={hop.certain ? undefined : "4 4"}
								/>
								<path d={`m${x1} ${y1}-8-4.5v9Z`} fill="var(--color-thread)" />
							</g>
						);
					})}
				</svg>
			) : null}
			{SCENE.map((frame) => (
				<CanvasFrame key={frame.name} frame={frame} w={DW} h={DH} />
			))}
			{layer.on ? <WalkLayer scene={SCENE} w={DW} size={walkSize(DW)} /> : null}
		</AmbientWindow>
	);
}
