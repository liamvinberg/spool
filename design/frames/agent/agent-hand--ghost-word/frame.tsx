import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Ghosted, useGhost } from "./ghost";
import { KaffeHome, WRITES } from "./kaffe-home";
import { KaffeAbout, KaffeHours } from "./site-frames";
import { HandLayer, handOf } from "./word";

/**
 * agent-hand--ghost-word — the wall says it as it happens, the picture shows it when
 * it can.
 *
 * Type anything and press Enter, and watch the middle frame and the strip of canvas
 * to the right of it. The agent takes hold of `home` at 274ms and does not let go for
 * thirty-seven seconds. In that time the wall carries a word for 37.43 of the 37.70
 * seconds with no holes in it, changing thirteen times and counting up three times
 * inside that; the picture changes three times. **That gap is the frame.**
 *
 * **What this round adds is `edit ×4`, and it adds it by deleting a condition.** The
 * parent computed its word as `open === null ? null : open.verb` and so drew nothing
 * between calls; `agent-hand--presence` before it drew the word in a horizontal chip
 * that needs 64px of gutter, which the middle column does not have. This computes
 * `on.verb` off the row the presence is already standing on, and sets it along the
 * wall instead of across it. Both problems were the same problem: the word was being
 * treated as a caption for the open call rather than as the wall's own account of the
 * frame.
 *
 * **The 44px, measured rather than reasoned about.** Fragment Mono advances 6.183px at
 * 10px, measured in this frame's own boot — `agent-hand--plate` had it right at 6.18
 * and `--presence` and `--label` both compute off 7.06 at 12px where the truth is 7.42,
 * 5% low. So `edit` is 24.73px, `edit ×6` is 43.27, `edit ×13` is 49.45, and a chip
 * around any of them adds its own 12px of padding: 55.3 against a 44px gutter, which
 * is why every round-three frame dropped the word. Turned a quarter turn the string's
 * length becomes height and the line box becomes the width, measured at 12.00px
 * exactly. The whole object then reaches 22.5px out from the wall and the longest
 * string this vocabulary can produce claims not one pixel more. **The count is free in
 * the dimension that was short and costs 18.5px in the dimension with 329 of it.**
 *
 * **What the count counts, and why it is worth more out here than in the rail.** It is
 * the run's own count, the same arithmetic `railEntries` does to print `edit home ×6`,
 * so one number reaches two surfaces and they can never disagree. What differs is what
 * it is worth. At 39% a frame is 152 drawn pixels and `cover.ts:8` sets
 * `LIVE_MIN_CSS_PX` to 400, so the thing on the canvas is a stored photograph, not a
 * document — and a photograph is 2.55s behind at best, because `CAPTURE_AFTER_READY_MS`
 * is 1500, the errand takes 660 to 1437ms, and any write inside that window restarts
 * it. **Thirteen writes produce three photographs**, at 14.5s, 26.8s and 35.4s, each
 * carrying a whole run. So one picture arrives holding six changes and looks exactly
 * like a picture holding one. The count is the only thing on the canvas that says
 * which, and the rail is not where you are looking when you are watching the canvas.
 *
 * **The count climbs, because a number that arrives whole is a number the canvas knew
 * before the work happened.** The six writes of the first run land 1.6s, 0.6s, 0.6s,
 * 0.8s and 1.3s apart, so the wall reads `edit`, then `edit ×2` at 8.8s, `×3` at 9.3s,
 * `×4` at 9.9s, `×5` at 10.7s, `×6` at 12.0s. The digit rolls rather than blinking: the
 * old one leaves along the word's own reading direction and the new one arrives behind
 * it over 160ms, against a 573ms shortest gap, so two digits are never in the air at
 * once. Nothing else about the string moves, because the verb has not changed.
 *
 * **The moment the whole direction is for is 14.5 seconds.** The last write of the run
 * lands at 12.0s and the wall says `edit ×6`. The picture does not move. It does not
 * move for another 2.5 seconds, and then the photograph arrives and the ghost draws six
 * writes' worth of replaced design over the new one at once: a headline gone up a size,
 * a lede gone to two lines, a button refilled and renamed, a hero recoloured, a row of
 * days rewritten. `edit ×6` is still on the wall when it happens, with 728ms to spare
 * before the next call takes the word. **The wall promised six and the picture paid
 * six, two and a half seconds apart.** That is what the count buys and it is the whole
 * argument for the word existing.
 *
 * **It does not always land, and the miss is drawn rather than hidden.** `edit ×3` is
 * on the wall from 32.8s and the third photograph arrives at 35.4s, 479ms before the
 * word moves on, so that one lands too. The middle one does not: `edit ×4` finishes at
 * 24.9s, the agent photographs the frame itself at 25.9s, and by the time the canvas's
 * own photograph lands at 26.8s the wall has said `shot` for 831ms. Two of three. The
 * miss is the honest reading of what this object is: **the word is a report on the
 * wire, not a caption for the picture**, and the two coincide only when the agent goes
 * quiet after writing, which is most of the time and not all of it.
 *
 * **What the word says between calls, which is 53% of the turn.** It says the last
 * thing the agent did, set back to 55% ink. Measured, the parent's rule leaves 15.15
 * seconds of blank in **sixteen separate holes**, the shortest 6ms and the longest
 * 2.24s, and a word that blinks out sixteen times in thirty-seven seconds is a flicker
 * rather than a report. Nothing is lost by holding it, because the live channel is
 * already spoken for: the grip's ink goes from 0.85 to 0.34 the instant the call
 * lands, and the word going back with it is the same fact said twice on one object
 * rather than a new claim. `agent-hand--presence` filled that air with `working`, which
 * is a fourth way of saying the head is there; this says something the head does not
 * know.
 *
 * **A thought stays off the wall, and that was the one real temptation.** 4.9 seconds
 * of this turn has a thinking row open and the rail prints `thinking` for it eight
 * pixels away, so the word could have been continuous by a second route. It is
 * refused because everything this object draws is about one frame and a thought has no
 * frame: `handOf` has never looked at a row whose `frame` is null, and admitting one
 * would be an exception to the rule rather than a use of it. The turn's own state is
 * the transcript's.
 *
 * **The ghost is unchanged in mechanism and re-clocked.** Two renders of the same
 * component at two revisions, the older over the newer at a hard 0.3 cap, cancelling
 * exactly everywhere the change did not reach. No box, no source map, no accent. What
 * moved is that it now fires on photographs rather than on writes, which is what the
 * canvas really does at this size. That released its constant: 420ms was capped by the
 * 573ms shortest gap between two writes, and at twelve-second gaps that ceiling is
 * twenty times away. **It was not spent.** The ghost now carries a whole run at once,
 * which is the loudest and most misreadable thing it can draw, so being handed more
 * room to show it was a reason to keep the number rather than to raise it.
 *
 * **Do the two channels fight?** They cannot, and the reason is structural rather than
 * lucky. A photograph cannot complete until 2.55s after the last write, so the grip is
 * never at full ink for a write while a ghost is on screen; measured across this
 * capture all three photographs land with no call open at all. So the ghost fires only
 * while the wall has gone quiet, and the wall's loudest moments — a digit rolling, the
 * ink coming up — happen while the picture is frozen. They are also on different
 * surfaces and in different palettes: the ghost is inside the rectangle in kaffe's own
 * paper and ink, the word is outside it in the canvas's, and they share no pixels. One
 * report, told twice at two speeds.
 *
 * **The costs.** The word is a receipt, and the parent's own sharpest complaint about
 * `--presence` was that a receipt is what the rail is for; the defence is only that out
 * here it is next to the thing rather than in a list, and that the count is a fact the
 * picture cannot carry. Holding it means the wall is 2.2 seconds stale at its worst,
 * which the dimmed ink states and does not repair. Moving the ghost to the photograph
 * cadence **loses the parent's best moment**: it drew nothing at the opening
 * `write home`, because that write is `frames/home/frame.json` and geometry moves the
 * rectangle rather than the design, and the disagreement between a grip that flicked
 * and a ghost that stayed silent was the finding. At the photograph cadence the ghost
 * is silent for the whole first 14.5 seconds anyway, so that disagreement is no longer
 * visible as one. And the thing most likely to kill the direction is unchanged: a ghost
 * and a broken re-render are told apart only by the cap and by the fact that it goes
 * away, and one revision back is the rule the layer holds.
 *
 * **Two residuals in shared geometry, named because they are not this frame's to fix.**
 * The dock tie goes right, since `spool-play-field.tsx` lands an incoming arrowhead on
 * the left wall at `ROW_1 + 186` and the parent's left-first rule parks the presence
 * under it. The right wall then has the outgoing edge on it, leaving at `ROW_1 + 158`,
 * which is why the word grows up rather than down: it clears the departing thread by
 * 5px, and the head is grazed by it at 0.1px in the worst column.
 *
 * Under `prefers-reduced-motion` the turn is a jump cut to settled, so nobody is ever
 * at the frame, no word is drawn and the ghost is disabled outright — a ghost of the
 * found design over the finished one is the whole frame doubled. That is the page-wide
 * gap and not this frame's to close. Worth recording anyway: **the word is the one
 * channel in this family with a still form.** A static `edit ×6` is exactly as true as
 * a moving one, where a cross-fade has nothing to show at rest and `agent-hand--accrue`
 * measured that a decaying trace's end state is nothing at all. If the jump cut is ever
 * fixed, the word needs no degrade path; the ghost still will.
 *
 * The capture is `claude-edits.json`, the same 37.7 seconds the rest of the family
 * plays. One brief clash, recorded: the brief writes the count as `edit x4`, and the
 * three runs here are six, four and three, so `edit ×4` is the second one and reaches
 * the wall at 24.2s. The multiplication sign is `×`, as `railEntries` prints it.
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

export default function AgentHandGhostWordFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked a different question: not what happened,
	// but where the agent is, what it last did there, and how many times
	const hand = handOf(script, turn);

	// what the canvas is showing, which is not what the file says
	const shown = photographed(elapsed);
	const ghost = useGhost(shown);

	// a picture is of the frame as it was when it was taken, and the agent's own `shot`
	// boots the frame from source rather than reading the canvas — so the thumbnail in
	// the rail is fresher than the large picture beside it
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 240;
		return (
			<div style={{ width, height: Math.round(520 * scale) }}>
				<div className="origin-top-left" style={{ width: 240, height: 520, transform: `scale(${scale})` }}>
					<KaffeHome rev={shotAt} />
				</div>
			</div>
		);
	};

	const base: readonly BaseFrame[] = SITE.map((frame) =>
		frame.name === SUBJECT
			? { ...frame, render: () => <Ghosted rev={shown} ghost={ghost} draw={(at) => <KaffeHome rev={at} />} /> }
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
				    that are not names or walks are the agent, its word, and what it replaced */}
				<PlayField base={base} />
				<HandLayer hand={hand} base={SITE.map((frame) => frame.name)} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * When the canvas gets a new photograph of `home`, and how many writes are in it.
 *
 * Below 400 drawn pixels the frame is a stored still, so the picture does not follow
 * the source, it follows the capture errand: `lifecycle.ts:66` waits
 * `CAPTURE_AFTER_READY_MS` of 1500 after ready, the errand itself takes 660 to 1437ms,
 * and any write landing inside that window bumps the nonce at `canvas.tsx:522` and
 * starts it over. Thirteen writes, three photographs, one per run — not a coincidence,
 * since a run ends when the agent stops writing and goes to look, which is the same
 * silence the errand is waiting for.
 *
 * These three numbers are `agent-hand--accrue`'s, re-derived rather than borrowed:
 * they fall out of the capture's own run boundaries at 12.76s, 24.90s and 33.73s plus
 * the errand's floor.
 */
const PHOTOS: readonly (readonly [at: number, writes: number])[] = [
	[14500, 6],
	[26800, 10],
	[35400, 13],
];

/** what the canvas is currently showing, which is not what the file says */
function photographed(elapsed: number): number {
	let shown = 0;
	for (const [at, writes] of PHOTOS) if (elapsed >= at) shown = writes;
	return Math.min(shown, WRITES);
}

/**
 * The revision the newest picture in the rail is of.
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
