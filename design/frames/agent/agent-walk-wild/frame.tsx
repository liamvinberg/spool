import { useState } from "react";
import type { PageRow, Target } from "../../../shared/ui/spool-canvas-chrome";
import {
	CanvasFrame,
	CartEmptyRestrained,
	EXITS,
	FAULTS,
	type WildFrame,
	WildWindow,
} from "./plinth";

/**
 * agent-walk-wild: the frame's floor, drawn only when it has to be.
 *
 * The bet: an off-page walk is worth no permanent ink, and a broken walk is worth
 * all of it. So the canvas at rest here is exactly the canvas that ships. `menu`
 * and `receipt` declare only what the two arrows already draw and carry nothing.
 * Nothing new is added to a label, an edge, a rail, or the arrow layer.
 *
 * **`cart` is selected, so its exits stand under it.** Whole names, the page each
 * one lands on, in the strip of canvas below the frame that no arrow crosses.
 * `checkout` on `shop` will be walked and `home` on `site` sits inside a branch,
 * and each row leads with the canvas's own edge one row long, solid or broken the
 * way the two real arrows above them are. Hover either row and its page lights in
 * the tree, the pairing #143 already ships for a rail row naming a frame. Press
 * either row and you travel: the page follows, the arrival is centred, the target
 * ends up selected. That landing is not new and is not re-drawn here,
 * `agent-play--jump-row` is it.
 *
 * The frame is live. Point at any frame that has exits and its floor appears
 * under it, then goes when you leave. Selection is only what holds it open.
 *
 * **`cart--empty` is not selected and speaks anyway.** Two walks that go nowhere,
 * and the base it stands on is split. Everything else on this canvas is muted and
 * these names are at full strength, `chekout` struck through because no frame
 * answers to it and `nav.tsx:12` left alone because the name is not wrong, only
 * unreadable, and a source location is the entire truth there is about it. Neither
 * row is pressable, because there is nowhere to go.
 *
 * That frame is the exact bug `inspector.tsx:592` names: a frame whose only walks
 * are unreadable used to draw as a frame with no walks at all. Here it is the only
 * thing on the page you can see from the far side of the room.
 *
 * **What does the reading at distance is the rule, not the words.** It counter-
 * scales with the label, so it is 1.5 by 166 pixels at 12% and at 200%, and it is
 * the only rule anywhere on the canvas. Whole under exits, split under a fault.
 * You never have to read a name to know which one you are looking at.
 *
 * **What it costs when it is quiet.** Nothing. Not a glyph, not a count, not a
 * chip, not a pixel. `agent-walk-wild--dense` is that claim at thirty frames.
 *
 * **Where it collides.** The selection already prints `390 × 844` in this channel,
 * so a selected frame's floor drops below the chip rather than moving it. And the
 * floor carries `bg-canvas` and sits above the frames, which is why it can hang
 * over a close neighbour and still be read.
 */

const FW = 148;
const FH = 321;

const SCENE: readonly WildFrame[] = [
	{ name: "menu", screen: "menu", x: 40, y: 72, paused: true },
	{ name: "cart", screen: "cart", x: 236, y: 100, selected: true, exits: EXITS },
	{ name: "receipt", screen: "receipt", x: 432, y: 44, paused: true },
	{ name: "cart--empty", render: CartEmptyRestrained, x: 432, y: 408, paused: true, faults: FAULTS },
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

export default function AgentWalkWildFrame() {
	const [hovered, setHovered] = useState<string | null>(null);
	const [lit, setLit] = useState<string | null>(null);

	return (
		<WildWindow pages={PAGES} targets={TARGETS} selected="cart" zoom="38%" litPage={lit}>
			{/* the shipped arrows: unconditional solid, a walk inside a branch faint,
			    both in the thread. Nothing leaves `cart--empty`, because nothing it
			    declares can be drawn. */}
			<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
				<path d="M188 232C204 232 212 260 228 260" stroke="var(--color-thread)" strokeWidth="1.5" />
				<path d="m236 260-8-4.5v9Z" fill="var(--color-thread)" />
				<g opacity="0.75">
					<path
						d="M384 260C400 260 412 204 424 204"
						stroke="var(--color-thread)"
						strokeWidth="1.5"
						strokeDasharray="5 5"
					/>
					<path d="m432 204-8-4.5v9Z" fill="var(--color-thread)" />
				</g>
			</svg>
			{SCENE.map((frame) => (
				<CanvasFrame
					key={frame.name}
					frame={frame}
					w={FW}
					h={FH}
					hovered={hovered === frame.name}
					onHover={setHovered}
					onPoint={setLit}
				/>
			))}
		</WildWindow>
	);
}
