import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost";
import { HandLayer, handOf } from "./ghost-hand";
import { KaffeHomeGhost, WRITES } from "./kaffe-home-ghost";
import { KaffeAbout, KaffeHours } from "./site-frames";

/**
 * agent-hand--ghost — you see what was replaced, not only what arrived.
 *
 * Type anything and press Enter, and watch the middle frame. The agent takes hold
 * of `home` at 117ms and does not let go for thirty-seven seconds; in that time it
 * writes the geometry, photographs the frame, looks at the picture, and lands
 * thirteen writes on the source in runs of six, four and three. Every one of those
 * thirteen leaves the design it replaced faintly on top of the design it made, for
 * four hundred and twenty milliseconds, and then that is gone too.
 *
 * **The argument.** Every other direction in this round draws the new thing
 * landing. A frame that has just been rewritten then looks exactly like a frame
 * that was always that way, and the single most useful fact about a change — what
 * it used to be — is the one thing all of them throw away. An edit is a
 * substitution and only this drawing says so.
 *
 * **The mechanism is two renders and an opacity, and it is why this is cheap.**
 * Nothing here knows what changed. The layer is handed the same component at two
 * revisions, draws the older over the newer at 0.3, and lets them cancel — which
 * they do exactly, everywhere the write did not reach, because the same component
 * with the same props makes the same pixels. So the whole frame ghosts and only
 * what changed is visible, with no diff computed anywhere. That matters beyond this
 * frame: the other directions that want to say *this block* need a rectangle on a
 * rendered page derived from a byte offset in a source file, which is a source map
 * nobody has and the thing `agent-hand--inside` named as most likely to kill it.
 * Two renders need none of it.
 *
 * **The peak is capped at 0.3 and that is the whole defence against the bug
 * reading.** A rendering fault looks like two designs on screen at comparable
 * strength. Starting the old at full and dissolving is more literally the
 * substitution, and it was the first thing drawn here; it passes straight through
 * that moment, and it delays the new content by the length of its own fade. The cap
 * cannot reach it. What is on screen is one design with a thirty percent memory over
 * it: where the two agree the composite is the identity and the frame is untouched,
 * and where they disagree the old shows at 0.3 while the new is held 0.3 short of
 * full, which makes the substitution symmetric — the thing leaving and the thing
 * arriving are the same event drawn once.
 *
 * **420ms, and both ends of that number are measured.** The floor is 180ms:
 * `frame-shell.tsx:136-144` fades a frame's stored cover out over exactly that once
 * a rebooted document reports `loaded`, so 180 is spool's own measure of how long a
 * reboot's seam lasts, and a ghost shorter than the seam is a fade of nothing. The
 * ceiling is 573ms, the shortest interval between two writes in this capture — the
 * third and fourth calls of the first run, 8,758ms to 9,331ms — because a ghost
 * still alive when the next write lands is a ghost of the wrong revision. 420 is 140
 * held at the cap and 280 leaving on a curve that sheds most of the ink in its first
 * 90ms, so it is perceptually about a fifth of a second and there is never enough of
 * it on screen to stop and stare at. Staring is where a ghost becomes a bug.
 *
 * **What I did not expect: the ghost is the only mark in this family that is
 * correctly silent.** The turn opens with `write home` at 117ms against
 * `frames/home/frame.json` — geometry, not design — and nothing in the frame
 * changed. So there is no ghost, because there is nothing to be a ghost of. The
 * presence's grip still flicks, because a write did land. That is the one moment in
 * thirty-seven seconds where the two channels disagree, and the disagreement is the
 * information: **the posture says a write happened, the ghost says whether it
 * changed anything.** Every direction built on the call rather than on the content
 * flickers there and says something that is not true.
 *
 * **The loud case is reflow, and it is loud on purpose.** `kaffe-home-ghost.tsx`
 * lays the page out in flow rather than absolutely, which is the opposite of what
 * `--inside` did and is the point: four of the thirteen writes move everything under
 * them, and a ghost of a reflow doubles every block that moved. That is the most
 * expensive thing a write can do and the thing no still can tell you, so being loud
 * in proportion to how much moved is the correct volume. It is also, honestly, the
 * case most likely to be misread — a frame with five doubled blocks in it for a
 * fifth of a second is what a broken re-render looks like.
 *
 * **One thing the drawing caught that reasoning did not.** The reflow this file
 * originally staged for write 9 was the lede's measure narrowing from 216px to 148,
 * and the two renders came back identical: `text-balance` had already broken a
 * 59-character paragraph into two even lines well inside the wider column, so the
 * column could lose 68px without a single word moving. The ghost was correctly
 * invisible, which is the direction working — it reports the design and not the
 * call, so a write that a person would have sworn changed the layout showed nothing
 * because nothing changed. Write 9 adds a line under the button instead.
 *
 * **What the product would actually have to hold, because the old DOM is gone.** An
 * edit reboots the whole document: `frame-shell.tsx:157-165` renders the iframe with
 * `key={docNonce}` and `reloadFrameDocument` bumps that nonce, so React destroys and
 * recreates the element in one commit and there is no overlap window at all. Three
 * candidates, and only one of them survives contact.
 *
 * *The cover is not it.* A cover is one JPEG per frame at 800px wide, content
 * addressed, and `writeCover` deletes every prior file — there is no history to
 * reach back into. Worse, it is captured only by an opportunistic background errand
 * that borrows the frame, boots it out of sight, and photographs it after it settles
 * (`lifecycle.ts:375-377`, `442-449`), so it records a *freshly booted* frame rather
 * than the one on screen, and its age is unbounded: many edits and many minutes old
 * is normal. At the instant of an edit the stored cover is genuinely the pre-edit
 * image, which is the whole of the temptation, but pre-edit is not the same claim as
 * *what was there a moment ago*.
 *
 * *Snapshotting before teardown is not it either.* The serializer already exists and
 * already crosses the sandbox — `captureSource` clones the document, inlines the
 * fonts, and posts the result to the canvas as an SVG Blob, which
 * `sandbox="allow-scripts"` permits because Blobs are structured-cloneable. But it
 * awaits `document.fonts.ready`, every running animation, a 120ms mutation quiet
 * period and two rAFs before it starts, and the raster hop after it is budgeted at
 * 2,400ms. None of that fits before an unload, and the shim registers no
 * `beforeunload` or `pagehide` hook to run it in.
 *
 * *Keeping the outgoing iframe is it.* Do not unmount the old document: hold it
 * mounted under the incoming one for the length of the ghost, frozen with the
 * `freeze` message the protocol already carries so it stops burning rAF, and let it
 * keep compositing its last painted pixels. That is a pixel-exact previous state at
 * zero serialization cost, and it is the *interacted-with* state rather than a
 * booted one — if you edit a frame while it is showing step three of a flow, this is
 * the only candidate that ghosts step three. The cost is two documents alive for
 * 420ms and a hard-memoised shell taught to render two.
 *
 * **And the layer is already there.** `coverPlan` at `frame-shell.tsx:67` puts a
 * frame's cover over it the moment its iframe detaches and fades it out over 180ms
 * once the new document loads, which means the shipped canvas *already* draws a
 * still of the past over a rebooting frame. What this direction proposes is not new
 * machinery. It is the same layer with the right image in it, read as a statement
 * instead of as a curtain — today the cover is opaque and its job is to hide the
 * boot, and nothing about it says the picture underneath is the past.
 *
 * **The costs, plainly.** At 39% a frame is 152px and its body copy is five pixels
 * tall, so a ghost of replaced *text* is a smear rather than a word: at this zoom
 * the ghost is a **where**, not a **what**, and only inside an entered frame does it
 * become a what. It answers *something in the headline changed* and never *it used
 * to say this*, which is less than the pitch promises and more than any other
 * direction here delivers. `home` sits in the middle column, so the presence loses
 * its chip to the 44px gutter and the verb never appears on the canvas at all —
 * `look` and `logs` are one picture out here, and the rail carries the receipt. The
 * middle column also puts the head 21.5px above the arrowhead of the walk coming in
 * from `about`, because the presence docks at the frame's centre and
 * `spool-play-field.tsx` lands an incoming arrow at `ROW_1 + 186` — a known defect in
 * shared geometry that only a middle column ever puts next to anything, and not this
 * frame's to fix. And
 * the thing that most likely kills it: the ghost and a genuinely broken re-render
 * are distinguishable only by the cap and by the fact that it goes away, so it is
 * legible as information exactly as long as it stays under half a second and never
 * stacks. One revision back, always. Two ghosts are never alive at once here, which
 * is arithmetic on 420 against 573 rather than luck, but a faster agent breaks it and
 * the rule the layer holds is that a new ghost replaces the old rather than joining it.
 *
 * **Also fixed here rather than inherited:** the parent ran the `shot` grip around
 * the whole box at 6px of stand-off, and a closed rectangle outside a frame is a
 * selection ring — spool's own `Slot` draws that exact shape at `inset: -1` — held
 * for the 670 to 750ms a `spool shot` takes. It is four corners now. Not closed, so
 * not a ring at any weight.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled: nobody is ever at
 * the frame, and the ghost is disabled outright rather than degraded, because a jump
 * cut takes the revision from 0 to 13 in one commit and a ghost of the found design
 * over the finished one is the whole frame doubled — the rendering bug this direction
 * is accused of being, drawn on purpose at the one moment nobody wrote anything. What
 * stillness gets is the design the agent left, with nothing over it.
 */

/** the site page, with `home` between two frames nothing happens to */
const SITE: readonly BaseFrame[] = [
	{ name: "about", screen: "menu", render: KaffeAbout },
	{ name: "home", screen: "menu" },
	{ name: "hours", screen: "menu", render: KaffeHours },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"] },
	{ name: "site", frames: SITE.map((frame) => frame.name), active: true, open: true },
];

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

const SHOT_W = 120;

export default function AgentHandGhostFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what
	// happened, but where the agent is and whether it is doing anything there
	const hand = handOf(script, turn);

	// how many of the thirteen design writes have landed. `write home` at 117ms is
	// `frames/home/frame.json` and is deliberately not one of them, which is why the
	// ghost has nothing to say about the first thing this turn does
	const rev = writesOn(script, turn, SUBJECT);
	const ghost = useGhost(rev);

	// a picture is of the frame as it was when it was taken, and this turn rewrites
	// that frame thirteen times, so the thumbnail is drawn at the revision the last
	// `shot` caught rather than at the one on the canvas now
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHomeGhost rev={shotAt} />
				</div>
			</div>
		);
	};

	const base: readonly BaseFrame[] = SITE.map((frame) =>
		frame.name === SUBJECT
			? { ...frame, render: () => <Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeHomeGhost rev={at} />} /> }
			: frame,
	);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
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
				{/* nothing is selected anywhere in this frame, so the only marks out here
				    that are not names or walks are the agent and what it replaced */}
				<PlayField base={base} />
				<HandLayer hand={hand} base={SITE.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * A run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6` — one number, two surfaces. `write` is excluded
 * and `edit` is not: the capture's single `write home` is the geometry sidecar, and
 * a ghost of a design that did not change is nothing, which is the correct drawing
 * of it.
 */
function writesOn(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return Math.min(count, WRITES);
}

/**
 * The revision the newest picture is of.
 *
 * One number for every row rather than one per row, so an older `look` in the log
 * shows the newest picture. That is this frame's stand-in being cheap rather than the
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
