import { useState } from "react";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { KaffeHome } from "../../../shared/ui/kaffe-home";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--jump-quiet — the honest no. Pointing is answered; nothing travels.
 *
 * Hover a row and the page holding its frame lights in the Pages rail. Click and
 * you get the path, the same as you always did. Nothing moves the canvas, ever.
 *
 * **This is a real answer and not a straw one.** The rail's whole job is to say
 * what the agent did to a canvas you are already looking at, and the frame
 * repainting under you while the transcript streams is the product's best moment.
 * A rail that can move the camera can move it out from under a frame you were
 * watching — and it will, because a row you click is a row about work that has
 * already happened, so the reward for reading the log is losing your view of it.
 *
 * **It also costs nothing to be wrong about.** Every frame the transcript names is
 * in the Pages rail two hundred pixels away, and clicking it there already selects
 * it. So the jump is a shortcut rather than a capability, and a shortcut that can
 * take your camera is a worse trade than one keystroke saved.
 *
 * **What kills it, and it is one number.** The Pages rail is a flat list of every
 * frame in the project, and a project is not three frames. Finding `home` in it
 * means knowing which page it is on — which is exactly the thing the row already
 * told you and the thing you would otherwise have to go and learn.
 *
 * The two frames to the left take the click. This one is what they have to beat.
 */

const APP: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
	{ name: "receipt", screen: "receipt" },
];

const SITE: readonly BaseFrame[] = [{ name: "home", screen: "menu", render: KaffeHome }];

const OF: Record<string, string> = { cart: "app", menu: "app", receipt: "app", home: "site" };

export default function AgentPlayJumpQuietFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [pointed, setPointed] = useState<string | null>(null);
	const litPage = pointed === null ? null : (OF[pointed] ?? null);

	const pages: readonly PageRow[] = [
		{ name: "app", frames: APP.map((frame) => frame.name), active: true, open: true },
		{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
		{ name: "site", frames: SITE.map((frame) => frame.name), lit: litPage === "site" },
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						jump="quiet"
						have={[...APP, ...SITE].map((frame) => frame.name)}
						pointed={pointed}
						onPoint={setPointed}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* the camera never moves here, which is the proposal */}
				<PlayField base={APP} pointed={pointed} />
			</CanvasChrome>
		</SpoolShell>
	);
}
