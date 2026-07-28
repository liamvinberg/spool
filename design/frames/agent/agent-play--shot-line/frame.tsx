import { railEntries, useCapture, useFanoutScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--shot-line — the picture does not go in the rail at all.
 *
 * Type anything and press Enter, and watch the fifth row: `look cart`. One line,
 * no chevron, nothing to open. The agent shot a frame and read the PNG back, and
 * the rail says so in the same six words it gives every other tool call.
 *
 * The argument is two hundred pixels to the left. `cart` is on the canvas — it
 * is the frame the shot is of, it is four times the size a rail can hold, it is
 * live rather than a still, and it is more current than the picture, because the
 * agent goes on editing after it looks. A thumbnail here is a smaller, staler
 * copy of something already on screen.
 *
 * That is not a guess about this capture. Eighteen images across both parent
 * sessions, and eighteen of eighteen came back from a Read of
 * `.spool/verify/<frame>.png` — no reference images, no attachments, nothing
 * from outside the project. In a design tool the agent looking at a picture is
 * always the agent looking at a frame, and the canvas is where frames are.
 *
 * The line changes with it. `look cart.png` is a filename and this rail speaks
 * frames, so once the picture is not being drawn the row goes back to naming the
 * frame: `shot cart` then `look cart`, the same object twice, named the same way
 * both times. The path is derivable, always — that is what makes the noun safe.
 *
 * Its two rivals are to the right: shot-open puts the picture behind the
 * disclosure, shot-inline puts it in the row.
 */

const PROJECT: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
];

const TAKES = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

export default function AgentShotLineFrame() {
	const capture = useCapture("claude-fanout");
	const script = useFanoutScript(capture);
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const takes = TAKES.map((name) => {
		const take = script.takes.find((candidate) => candidate.name === name);
		return {
			name,
			arrived: take !== undefined && turn.at(take.arriveCue),
			painted: take?.paintCue != null && turn.at(take.paintCue),
			revision: take === undefined ? 0 : take.changeCues.filter((cue) => turn.at(cue)).length,
		};
	});

	const pages: readonly PageRow[] = [
		{
			name: "root",
			frames: [
				...PROJECT.map((frame) => frame.name),
				...takes.filter((take) => take.arrived).map((take) => take.name),
			].sort(),
			active: true,
			open: true,
		},
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
						shot="line"
						phase={turn.phase}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField base={PROJECT} takes={takes} />
			</CanvasChrome>
		</SpoolShell>
	);
}
