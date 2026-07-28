import { railEntries, useCapture, useFanoutScript } from "../../../shared/lib/claude-turn";
import type { ShotRef } from "../../../shared/lib/turn-play";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, FrameThumb, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--shot-inline — the picture in the row, and what that costs.
 *
 * Type anything and press Enter. When the image comes back it lands under its
 * line, unasked, and stays. Nothing is behind a chevron: the only moment in a
 * turn where the agent looks at its own work is the one moment worth breaking
 * the log's rhythm for, and a disclosure nobody opens is a picture nobody sees.
 *
 * The cost is drawn rather than argued. A frame is 240x520, so any width that
 * makes it legible makes it tall — this one is 84px wide and 182 tall, which is
 * five rows of transcript for one row of tool call. It pushes everything above
 * it off the top, and it does that every time the agent looks: in the fan-out
 * parent, `cart--empty` alone is read back four times, so four of these stack up
 * in one session, all of the same frame.
 *
 * There is one thing only this version has. It puts the shot and the frame side
 * by side at the same instant, so `cart` in the rail and `cart` on the canvas can
 * be compared without opening anything — and after a few more edits they will not
 * match, because the still is what the agent saw and the canvas is what is there
 * now.
 *
 * Its rivals are to the left: shot-open puts the same picture behind the
 * disclosure, shot-line draws none at all.
 */

const PROJECT: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
];

const TAKES = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

/** small enough that a row still reads as a row, large enough to recognise the frame */
const SHOT_W = 84;

const picture = (shot: ShotRef) => (shot.frame === null ? null : <FrameThumb name={shot.frame} width={SHOT_W} />);

export default function AgentShotInlineFrame() {
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
						shot="inline"
						shotView={picture}
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
