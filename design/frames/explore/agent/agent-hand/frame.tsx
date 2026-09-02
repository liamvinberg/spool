import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import { Ghosted, useGhost } from "./ghost";
import { KaffePhone, KaffeWide, phoneLayout, wideLayout, WRITES } from "./kaffe-page";
import { HandField } from "./field";
import { type Change, changesAt, HandLayer, handOf, writesOn } from "./hand";

/**
 * agent-hand — how the canvas shows what the agent is doing to a frame.
 *
 * Type anything and press Enter, and watch both frames. The agent takes hold of `home` at
 * 117ms and does not let go for thirty-seven seconds: it writes the geometry, photographs
 * the frame, looks at the picture, and lands thirteen writes on the source in runs of
 * six, four and three. The canvas is never behind the file — every write redraws both
 * frames, because one page at two breakpoints is one component.
 *
 * **This is the compile the family arrived at**, after twenty-eight explorations and a
 * sheet that ran them side by side on one clock. Three tool calls, five objects, no words
 * anywhere:
 *
 * | what the agent does | what the canvas draws |
 * | --- | --- |
 * | takes the frame in (`look`, `logs`) | the thread runs the frame's whole height |
 * | changes it (`edit`, `write`) | the thread runs a 76px segment, and every write plates the block it changed |
 * | photographs it (`shot`) | the ink leaves the wall and strikes four corners around the frame |
 *
 * The vocabulary and its reasoning are in `hand.tsx`. What is worth reading here is what
 * the compile decided and what it left open.
 *
 * ## Presence is a fact about the transcript; a change is a fact about the pixels
 *
 * They are deliberately not drawn on the same frames. The wire names one frame, so the
 * thread and the node stand beside `home` and nowhere else. The write lands in a
 * component two frames read, so **both** frames plate. A canvas holding one page at two
 * breakpoints therefore has a frame visibly redrawing with nothing beside it saying why,
 * and that is correct rather than a gap: the agent is not at that frame, and the canvas
 * should not claim it is.
 *
 * ## The threshold falls between the two frames, and in the product it always does
 *
 * `src/cover.ts:8` puts `LIVE_MIN_CSS_PX` at 400 and `lifecycle.ts:245` enforces it as
 * `frame.w * camera.k < LIVE_MIN_CSS_PX`: below that a frame is a stored photograph with
 * no document in it. The phone here draws at 132 and the desktop at **487**.
 *
 * A real 390pt phone needs 103% zoom to cross that line and a real 1440 desktop page
 * needs 28%. **At every zoom anybody works at, a canvas holding both holds one live frame
 * and one picture.** So the located mark — the plate, and the lane's heights — is
 * obtainable on the desktop frame and fictional on the phone, and this whole family spent
 * twenty-eight frames designing it against the frame where it cannot be located.
 *
 * That is not fatal and it is the shape of the implementation question: a plate needs a
 * box, a box needs a document, and the frames that most need a mark are the ones drawn
 * too small to have one. The two channels that need nothing located — the thread and the
 * corners — are the ones that survive at any zoom.
 *
 * ## What is still open, and belongs in a grilling rather than in this frame
 *
 * **The lane and the plate say the same thing.** Kept together here because they differ
 * in tense — a plate is a pointer at 860ms, a lane is a ledger at 6 seconds — and because
 * the rail already prints `edit home ×6`, which makes it a third copy. `hand.tsx` states
 * both sides.
 *
 * **The plate is over the design.** Every earlier direction kept the mark outside the
 * rectangle or in the seams; this one puts ink on the thing that changed, at 0.15 for
 * 860ms, up to 33% of the frame's area on the hero.
 *
 * **Nothing here has a name on it.** The verb was on the wall in `--plate` and on the
 * frame's name row in `--loud-flat`, and it is gone: the rail is six inches away and
 * already says which call is open. What that costs is that the three postures have to be
 * learned rather than read.
 *
 * ## What this frame fakes, stated
 *
 * **The second frame.** `claude-edits.json` edits `frames/home/frame.tsx` and knows
 * nothing about a desktop sibling. `home--wide` and the arrangement where one write
 * re-renders both are this frame's addition, and they are necessary rather than
 * convenient: a located mark cannot be judged without a page that has columns.
 *
 * **The block a write landed in.** `LANDS` is the family's staging and the boxes come
 * from `phoneLayout` and `wideLayout` rather than from a stamp resolved in a live
 * document. Writes 7 and 8 are the exception and are drawn as the stamp would actually
 * resolve them, which is at the frame's own root.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame and thirteen writes land
 * in one commit. Every plate would strike at once and the whole page would be tinted at
 * the one moment nothing was written, so the layer is disabled outright rather than
 * degraded. What stillness gets is two frames showing the design the agent left, with
 * nothing over them and nothing beside them. Page-wide gap, named rather than fixed.
 *
 * The capture is `claude-edits.json`, the same 37.7 seconds every frame in this family
 * plays.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";
/** its desktop sibling, which the capture does not know about */
const WIDE = "home--wide";

const SHOT_W = 120;

export default function AgentHandFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked where the agent is rather than what happened
	const hand = handOf(script, turn);

	// how many of the thirteen design writes have landed. `write home` at 117ms is
	// `frames/home/frame.json`, so it is not one of them and neither the spans nor the
	// ghost has anything to say about the first thing this turn does
	const rev = writesOn(script, turn, SUBJECT, WRITES);
	const ghost = useGhost(rev);

	// one write, two frames: the same count read through two layout tables, because the
	// block that changed sits in a different place on each page
	const changes = new Map<string, readonly Change[]>([
		[SUBJECT, changesAt(rev, phoneLayout)],
		[WIDE, changesAt(rev, wideLayout)],
	]);

	// a picture is of the frame as it was when it was taken, and this turn rewrites that
	// frame thirteen times, so the thumbnail is drawn at the revision the last `shot`
	// caught rather than at the one on the canvas now
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffePhone rev={shotAt} />
				</div>
			</div>
		);
	};

	const pages: readonly PageRow[] = [
		{ name: "app", frames: ["cart", "menu", "receipt"] },
		{ name: "site", frames: [SUBJECT, WIDE], active: true, open: true },
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="34%">
			<CanvasChrome
				pages={pages}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						say="read"
						shot="open"
						shotView={picture}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				{/* nothing is selected anywhere in this frame, so every mark out here that is
				    not a name belongs to the agent */}
				<HandField
					draw={(slot) =>
						slot.name === SUBJECT ? (
							<Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffePhone rev={at} />} />
						) : (
							<Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeWide rev={at} />} />
						)
					}
					overlay={<HandLayer hand={hand} changes={changes} />}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * The revision the newest picture is of.
 *
 * One number for every row rather than one per row, so an older `look` in the log shows
 * the newest picture. That is this frame's stand-in being cheap rather than the
 * direction saying anything: `ShotRef` carries a path, a media type and a frame, and
 * nothing that tells two shots of one frame apart.
 */
function shotRev(script: Script, turn: Turn): number {
	const at = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	const tools = script.rows.filter((row): row is ToolRow => row.kind === "tool");
	const last = tools.filter((row) => row.verb === "shot" && row.doneCue !== null && turn.at(row.doneCue)).at(-1);
	if (last === undefined) return 0;
	const when = at.get(last.cue) ?? 0;
	const by = (cue: string) => (at.get(cue) ?? Number.POSITIVE_INFINITY) <= when;
	let count = 0;
	for (const row of tools) {
		if (row.verb !== "edit") continue;
		for (const child of row.children) if (by(child.cue)) count += 1;
	}
	return Math.min(count, WRITES);
}
