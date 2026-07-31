import { useMemo, useState } from "react";
import { railEntries, type Script, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { type FrameSpec, InsideField, type Marks } from "./inside-field";
import { EDITS } from "./kaffe-home-rev";

/**
 * agent-hand--inside — the mark goes over the design, and the design is what it is
 * allowed to say something about.
 *
 * Type anything and press Enter. `home` is the middle frame and the agent spends
 * the whole two minutes there: it writes the geometry, photographs it, looks at
 * the picture, and then lands thirteen writes on the source in runs of six, four
 * and three. Watch the frame, not the rail.
 *
 * **The argument for spending the interior is that it is the only surface that can
 * say *where*.** A badge on a corner, a glow on a border, a line in the transcript
 * — all of them can say `edit home ×6` and none of them can say that four of those
 * six landed in the headline and the button and two in the hours. The interior is
 * 152×329 at this zoom, which is 90% of everything the canvas is drawing, and the
 * other directions leave all of it alone. The argument against it is that the
 * interior *is* the design, and a canvas whose job is to show you a design must not
 * be the thing standing in front of it.
 *
 * **So the rule this direction commits to is that nothing drawn inside a frame is
 * ever opaque, and the worst case is stated rather than avoided.** Worst momentary
 * occlusion is the read band: the accent at 16% over 24% of the frame's height,
 * zero at both of its edges, travelling top to bottom in 860ms and gone. Worst
 * sustained occlusion is the wash a `shot` holds for the length of the call, and it
 * is 4% — measured off the played frame, paper under it reads #FEF6F5 against
 * #FEFEFE. The loudest single mark is an edit's 2px rule down the side of a block,
 * over a 7% wash, for 1.1s. Nothing is ever hidden, in any state, at any moment:
 * the paragraph under the band is still readable while it passes.
 *
 * **Four states, one geometry.** A rectangle inset into the frame carries all of
 * it: presence is that rectangle whole and faint, a `shot` is the same rectangle
 * with only its corners left and hardened, a `read` is a band travelling down it,
 * an `edit` is a smaller rectangle inside it. Four unrelated glyphs in a 152px box
 * would be four things to learn in a space with no room for a legend, and the
 * corners of a viewfinder being the corners of the thing already on screen is the
 * one relationship that needed no explaining at all. The edit rule lands on the
 * presence line rather than beside it, which was an accident and is kept: a block's
 * left edge is 12 units in and the hold is 6px in, so at this zoom they meet, and
 * what you read is the agent's hold thickening at the block that just changed. A
 * fifth object would have said less.
 *
 * **`edit` rides the real re-render rather than replacing it.** `kaffe-home-rev.tsx`
 * is the frame as thirteen patches over one content object; the count comes off the
 * capture's own run children, which is the same number `edit home ×6` prints in the
 * rail. So the frame on the canvas genuinely redraws thirteen times over the minute
 * — headline, subhead, button, hero, hours, footer — and the mark's whole job is to
 * catch your eye on the block that moved. That is not a flourish: `spool` re-renders
 * a live frame when its source changes, so a canvas that animated a stand-in for
 * that would be drawing over a real event with a fake one.
 *
 * **What I did not know before drawing it: the first row of this turn is a write
 * the interior has nothing to say about.** `write home` is `frames/home/frame.json`
 * — geometry, not design. The rail says work is happening to `home` and the inside
 * of `home` is correct to stay perfectly still, because nothing in there changed;
 * what moved was the rectangle. That is the case that decided presence. Without a
 * presence object those first seconds read as the canvas failing to keep up, and
 * with one they read as what they are: the agent is at this frame and this
 * particular write did not touch the picture.
 *
 * **The second thing I did not know: there is no `read home` in this capture at
 * all.** Nothing ever reads `frames/home/frame.tsx`; the agent wrote it, so it
 * already knows. What the read family does hold is four `look home` rows — a Read
 * of `.spool/verify/home.png`, the whole frame taken in at once — and one `logs
 * home`. The band fires on those, and it is the right mark for them: a look at a
 * full-frame screenshot touches everything, changes nothing, and is over in a beat.
 * A frame that draws `read` on a verb that never fires would be drawing nothing.
 *
 * **The cost, plainly.** This is the only direction whose mark can be *wrong* about
 * the design rather than merely noisy about the call: the edit rule points at a
 * block, and pointing at the wrong block is worse than pointing at nothing. Here the
 * regions are true by construction, because the frame is authored with absolute
 * boxes and the patch names its own box. In the product they would have to come from
 * the diff, and a `str_replace` gives a byte offset in a source file, not a
 * rectangle on a rendered page. Between those two is a source map nobody has, and
 * without it this direction degrades to marking the whole interior, which is a wash
 * over the design that says exactly what a border could have said. **That is the
 * thing most likely to kill it.**
 *
 * **One prop on the rail moved, and it moved because of what is drawn out here.**
 * A `look` row takes `shot="line"` rather than #194's `open`: the picture is of a
 * rectangle sitting 150 pixels away, live, at a revision the still is already
 * behind, and the brackets that closed over it are what said the picture was taken.
 * `shot-open`'s own doc left this as the open question it could not answer by
 * drawing nothing. The honest alternative here was `well`, the default, which is
 * the empty box #194 called the one thing that is definitely wrong — and a real
 * thumbnail cannot be supplied at all, because `shotView` is handed a path and not
 * a row, so every one of the four looks would draw the same picture and only the
 * last of them would be true. `say="read"` is the other non-default, and it is only
 * #148's winner, which most frames on this page still default away from.
 *
 * **Zoom.** Every mark is drawn at screen scale, the way selection chrome is, so a
 * 6px inset is 4% of the frame at 39% and 12% of it at 10%. `inside-field.tsx`
 * gives up below 100px of frame width: the marks collapse onto the frame's own
 * edge, the band is dropped, and an edit says *this frame* rather than *this block*.
 * Which is to say that far out this direction becomes one of the other four, and it
 * should.
 *
 * **Reduced motion.** The house contract here is a jump cut, not a downgrade —
 * `useTurn` fires every cue at once and `useTicker` returns infinity — so somebody
 * who asked for stillness gets the end of the turn and *no interior mark is ever
 * drawn over the design at all*. Every mark still has a static form in the code
 * (the band becomes the presence rectangle at full strength, the brackets and the
 * edit box hold rather than fade), because a mark whose only body is a sweep is not
 * a mark. But the honest sentence is that under this setting the whole of this
 * direction is invisible and the design is untouched, which is the one setting where
 * that is the correct answer.
 *
 * The capture is `claude-edits.json`, the same two minutes as
 * `agent-play--jump-name` and `agent-play--edit-run`.
 */

/** the frame the whole capture is about */
const SUBJECT = "home";

const SITE: readonly FrameSpec[] = [
	{ name: "menu", screen: "menu" },
	{ name: SUBJECT, subject: true },
	{ name: "order", screen: "cart" },
];

/**
 * A `look` is a Read of the frame's own verify shot, so it is a read of this
 * rectangle by another route; `logs` is a read of what it printed while it booted.
 * Neither changes anything, both take the whole frame in, and this capture holds no
 * source read of `home` at all.
 */
const TAKES_IN = new Set(["read", "look", "logs"]);

/** how long a write stays marked, and how long a landed picture takes to release */
const EDIT_FOR = 1150;
const SWEEP_FOR = 1000;
const SHUTTER_FOR = 400;

export default function AgentHandInsideFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const [landed, setLanded] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);

	const cueAt = useMemo(() => new Map(script.cues.map((cue) => [cue.name, cue.at])), [script.cues]);

	/*
	 * What the inside of `home` is doing, derived from the same cues the rail reads.
	 * Not a second script and not a schedule of its own: a row resolving in the
	 * transcript and a mark leaving the frame are the same instant because they are
	 * the same cue.
	 */
	const rev = countWrites(script, turn, SUBJECT);
	const marks: Marks = {
		held: turn.phase === "playing" && startedOn(script, turn, SUBJECT),
		read: freshRow(script, turn, cueAt, elapsed, SUBJECT, (verb) => TAKES_IN.has(verb), SWEEP_FOR),
		shot: shotOn(script, turn, cueAt, elapsed, SUBJECT),
		edits: freshWrites(script, turn, cueAt, elapsed, SUBJECT),
	};

	const pages: readonly PageRow[] = [
		{ name: "app", frames: ["receipt", "checkout", "signin"] },
		{ name: "site", frames: SITE.map((frame) => frame.name), active: true, open: true },
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
						say="read"
						shot="line"
						jump="name"
						have={SITE.map((frame) => frame.name)}
						pointed={pointed}
						onPoint={setPointed}
						onJump={(frame) => {
							setLanded(frame);
							setPointed(null);
						}}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<InsideField frames={SITE} rev={rev} marks={marks} selected={landed} pointed={pointed} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/** the tool rows this turn has reached that name one frame */
function rowsOn(script: Script, turn: Turn, frame: string) {
	return script.rows.filter((row) => row.kind === "tool" && row.frame === frame && turn.at(row.cue));
}

function startedOn(script: Script, turn: Turn, frame: string): boolean {
	return rowsOn(script, turn, frame).length > 0;
}

/**
 * How many writes have landed on the frame, which is what makes it redraw.
 *
 * The run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6` — one number, two surfaces. The `frame.json`
 * write is deliberately not counted: geometry moves the rectangle and leaves the
 * design alone.
 */
function countWrites(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return count;
}

/** the writes still inside their beat, each carrying the block the patch named */
function freshWrites(
	script: Script,
	turn: Turn,
	cueAt: ReadonlyMap<string, number>,
	elapsed: number,
	frame: string,
): Marks["edits"] {
	const fresh: { key: string; region: (typeof EDITS)[number]["region"] }[] = [];
	let index = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) {
			if (!turn.at(child.cue)) continue;
			const edit = EDITS[index];
			index += 1;
			if (edit === undefined) continue;
			if (elapsed - (cueAt.get(child.cue) ?? 0) < EDIT_FOR) fresh.push({ key: child.key, region: edit.region });
		}
	}
	return fresh;
}

/**
 * The most recent row of a family that is still inside its beat.
 *
 * A key rather than a flag, because the band sweeps once per row and remounting is
 * what restarts it. Read off the row's own start rather than its resolution: how
 * long a Read of a 150 KB picture takes is not how long looking at it takes.
 */
function freshRow(
	script: Script,
	turn: Turn,
	cueAt: ReadonlyMap<string, number>,
	elapsed: number,
	frame: string,
	wanted: (verb: string) => boolean,
	within: number,
): string | null {
	let key: string | null = null;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || !wanted(row.verb)) continue;
		if (!turn.at(row.cue)) continue;
		if (elapsed - (cueAt.get(row.cue) ?? 0) < within) key = row.key;
	}
	return key;
}

/**
 * The frame being photographed, and the beat after the picture comes back.
 *
 * `spool shot` boots the frame headless and rasterises it, so for those seconds this
 * rectangle is genuinely the subject of an event and the brackets hold for as long
 * as the call does. The release is the shutter: they pull 3px in and go.
 */
function shotOn(
	script: Script,
	turn: Turn,
	cueAt: ReadonlyMap<string, number>,
	elapsed: number,
	frame: string,
): Marks["shot"] {
	let held: Marks["shot"] = null;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "shot") continue;
		if (!turn.at(row.cue)) continue;
		const doneAt = row.doneCue === null ? null : turn.at(row.doneCue) ? (cueAt.get(row.doneCue) ?? 0) : null;
		if (doneAt === null) held = { key: row.key, landed: false };
		else if (elapsed - doneAt < SHUTTER_FOR) held = { key: row.key, landed: true };
	}
	return held;
}
