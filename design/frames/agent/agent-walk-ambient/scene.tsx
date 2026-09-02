import type { PageRow } from "shared/ui/spool-canvas-chrome";
import { type AmbientFrame, CartEmptyRestrained, EXITS, FAULTS } from "./dock";

/**
 * The standard scene, held constant across `#146`'s seven directions: four frames,
 * two of them ordinary, `cart` walking off the page twice, `cart--empty` declaring
 * two walks that go nowhere and drawing no arrow at all — which is the exact bug
 * `inspector.tsx:592` names, a frame whose only walks are unreadable reading as a
 * frame with no walks.
 *
 * **The two docks point in opposite directions and that is the finding.** A canvas
 * has no margin. It has whatever the arrangement left over, and here the leftovers
 * are a 60 pixel band between `receipt`'s bottom and `cart--empty`'s label, and the
 * open field under `cart`. So `cart` docks right into the band and `cart--empty`
 * docks left into the field, and the drawing is the same object either way: the side
 * is a property of the frame's situation, not of the mark.
 *
 * **The band is 60 pixels and two tags need 39.** Ten pixels of air at each end, and
 * the tag is 18 tall rather than 20 because 20 left seven. That is the honest cost of
 * docking a screen-size object to a frame that shrinks with the zoom, and it is why
 * the tag carries `bg-canvas`: on a page packed tighter than this one it comes forward
 * over a neighbour rather than interleaving with it.
 */

export const FW = 158;
export const FH = 342;

export const SCENE: readonly AmbientFrame[] = [
	{ name: "menu", screen: "menu", x: 30, y: 96, paused: true },
	{
		name: "cart",
		screen: "cart",
		x: 238,
		y: 132,
		paused: true,
		exits: EXITS,
		// the anchors sit low on the wall, where the walks leave; the tags sit in the
		// band, which is the only place on this arrangement that words fit
		dock: { side: "right", anchor: 305, tag: 301 },
	},
	{ name: "receipt", screen: "receipt", x: 446, y: 72, paused: true },
	{
		name: "cart--empty",
		render: CartEmptyRestrained,
		x: 446,
		y: 500,
		paused: true,
		faults: FAULTS,
		dock: { side: "left", anchor: 53, tag: 48 },
	},
];

export const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "cart--empty", "menu", "receipt"], active: true, open: true },
	{ name: "shop", frames: ["checkout", "payment"] },
	{ name: "site", frames: ["home"] },
];

/**
 * The two walks this page can draw, exactly as the canvas draws them: an
 * unconditional walk solid, a walk inside a branch dashed, both in the thread.
 * Nothing leaves `cart--empty`, because nothing it declares can be drawn.
 */
export function Arrows() {
	return (
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
	);
}
