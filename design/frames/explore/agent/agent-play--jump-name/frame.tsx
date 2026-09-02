import { useState } from "react";
import { railEntries, useCapture, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { KaffeHome } from "shared/ui/demo/kaffe-home";
import { type BaseFrame, PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * agent-play--jump-name — the recommendation. The name is the place; the rest of
 * the row is still the call.
 *
 * Play it and hover `home` anywhere it appears. Click the name and you are there:
 * the page follows, the frame lands in the middle, and it is selected. Click the
 * verb, the count or the chevron instead and you get what you have always got,
 * the path.
 *
 * **The question only exists because the click is already spent.** A connections
 * row has nothing else a click could mean, so `openConnection` at
 * `canvas.tsx:2233` could just take it — *"A connection row is a place on the
 * canvas, never a walk: land there and select it."* A log row is different:
 * [#135](https://github.com/liamvinberg/spool/issues/135) gave every frame-naming
 * row a disclosure holding its path, so `edit home ×6` was already a button
 * before anybody asked whether it was also a door.
 *
 * **So the row is split where its own grammar splits.** The verb and the count
 * are about the call — six edits happened, here is the file they happened to. The
 * name is about the frame, and the frame outlives the call. Two objects, two
 * targets, and the seam was already drawn: `spool-play-rail.tsx` has printed the
 * verb in `text-muted` and the subject in `text-text/85` since the first row.
 *
 * **What the click does is not invented.** It is `openConnection`, unchanged:
 * switch the page if the frame is on another one, land the arrival centred, clear
 * the pick, select the frame, keep the zoom. Landing on a frame is going to where
 * it is, never deciding how close you wanted to be — so nothing here zooms.
 *
 * **A run row is not a special case.** `edit home ×6` names one frame, because
 * #135 measured that a run cannot span two files: 51 writes made 29 runs across
 * both parent captures and not one run ever touched two. So the collapse that
 * made six rows into one made six identical targets into one, which is the
 * easiest thing this question had to answer.
 *
 * **Hover exists because it is free and it is honest.** It is the gesture #116
 * already put in this rail: a chip lights its box out on the canvas rather than
 * moving anything, so pointing and going are different acts and only one of them
 * costs you your view. The ring it draws is the weaker one, because pointing at a
 * frame is a weaker claim than having gone to it.
 *
 * **And hovering found the case the ticket did not ask about.** A row can only
 * light a frame that is on screen, and #136 made off-screen the normal case, so
 * for every row in this transcript there is no box out there to light. The answer
 * is not to draw nothing: it lights the *page* in the Pages rail, which is where
 * the frame is, and `PageRow.lit` already existed for something outside that rail
 * pointing at one of its rows. Pointing gets answered wherever the answer can be
 * drawn, which is the whole reason hover is worth having on a rail whose subject
 * is usually somewhere else.
 *
 * The cost, and it is the reason the two frames to the right exist: the name is
 * a target inside a target. A span with a role, not a nested button, because a
 * button inside a button is not a thing — and the word is forty pixels wide in a
 * twenty-six pixel row.
 *
 * The capture is `claude-edits.json`, the same two minutes as
 * `agent-play--edit-run`. Every row in it names `home`, which lives on the `site`
 * page — so every jump here crosses a page, which is the case
 * [#136](https://github.com/liamvinberg/spool/issues/136) accepted on purpose
 * when it left a thread unbound to a page.
 */

const APP: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
	{ name: "receipt", screen: "receipt" },
];

/** one frame, and the one every row in this transcript is about */
const SITE: readonly BaseFrame[] = [{ name: "home", screen: "menu", render: KaffeHome }];

const OF: Record<string, string> = { cart: "app", menu: "app", receipt: "app", home: "site" };

export default function AgentPlayJumpNameFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [here, setHere] = useState("app");
	const [landed, setLanded] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);

	// hovering a row can only light a frame that is on screen, and the frame every
	// row here names is one page over. So the pairing lands on the page instead —
	// `PageRow.lit` exists for exactly this, something outside that rail pointing at
	// one of its rows — and pointing is answered wherever the answer can be drawn
	const litPage = pointed === null ? null : (OF[pointed] ?? null);
	const pages: readonly PageRow[] = [
		{ name: "app", frames: APP.map((frame) => frame.name), active: here === "app", open: true },
		{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
		{
			name: "site",
			frames: SITE.map((frame) => frame.name),
			active: here === "site",
			open: here === "site",
			lit: litPage === "site",
		},
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				selected={landed ?? undefined}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						jump="name"
						have={[...APP, ...SITE].map((frame) => frame.name)}
						pointed={pointed}
						onPoint={setPointed}
						onJump={(frame) => {
							setHere(OF[frame] ?? here);
							setLanded(frame);
							setPointed(null);
						}}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* a new page is a new canvas, so the field remounts rather than panning
				    across the gap between two pages nobody travelled */}
				<PlayField
					key={here}
					base={here === "site" ? SITE : APP}
					selected={landed === null ? [] : [landed]}
					pointed={pointed}
					center={landed}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}
