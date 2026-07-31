import { railEntries, type Script, type ToolRow, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { type ShotRef, type Turn, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { CoffeeScreen } from "../../../shared/ui/coffee-screens";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { DeskField, PLACED, type Placed } from "./desk-field";
import { DeskHandLayer, handOf } from "./desk-hand";
import { Ghosted, useGhost } from "./ghost";
import { KaffeDesk, KaffeDeskHours, LANDS, WRITES } from "./kaffe-desk";

/**
 * agent-hand--edit-desk — the same turn, on a desktop frame, and what the grammar
 * becomes when the rectangle stops being tall and narrow.
 *
 * Type anything and press Enter, and watch the frame on the left. It is `home` at
 * 1440×900, a real desktop page with a bar, two columns and a band of cards; the agent
 * takes hold of it at 117ms and lands thirteen writes on it over thirty-seven seconds.
 * `menu` beside it is a phone frame at the same zoom, and `hours` below it is a second
 * desktop frame in the only place a second desktop frame can go.
 *
 * **Twenty-two frames on this page draw portrait phones and nothing else.** Every
 * number in the grammar — 44px of gutter, 329px of wall, a 16px plate, 6px or 12px or
 * 15px of stand-off, a y-position that identifies a block — was tuned against one
 * rectangle. This frame starts from the other one.
 *
 * ## Can a phone and a desktop frame share a zoom
 *
 * **Yes, with fifteen pixels left over for everything else.** The viewport is 772 wide.
 * A desktop page carried into an authored box at the family's own 0.615 is 886×554 and
 * draws 561×351; a phone draws 152×329. With one 44px gutter the frames are 757, and
 * the whole margin is `14 + … + 1 = 15`.
 *
 * Two things fall out that the shapes do not suggest. A 900px desktop and an 844px
 * phone are nearly the same height, so at one zoom they draw **351 and 329** and sit in
 * one row with nothing cropped — the frames differ by 3.7× in width and by 22px in
 * height. And **two desktop frames cannot sit side by side at all**: 561 + 44 + 561 is
 * 1,166 against 772, while stacked they are 764 of 856 and fit with room over. So a
 * desktop page's neighbours are above and below, which is the fact that rotates
 * everything else.
 *
 * **What it costs is the stand-off, and only drawing it finds that.** Two frames pressed
 * to the viewport need 12 of clear canvas outside each outer wall and there are 15 all
 * told, so the slack goes entirely to the subject: `home` stands 14 out and its sweep
 * clears the left edge by two pixels, and `menu` is flush, one pixel from the right,
 * with nowhere to put a presence of its own. **At an honest zoom, a canvas holding both
 * shapes can only show the agent working on one of them.** Placed symmetrically at 7
 * and 8, which is the arrangement the arithmetic suggests, the sweep's left arm runs to
 * x −5 and is cut off by the Pages rail.
 *
 * The other cost is the gutters. With both frames on screen the only free vertical strip
 * left is the one between them, which the walk graph already uses. `--ghost-loud` spent
 * its whole argument on a 44px gutter it assumed there were two of. At desktop shape
 * there is one, and the frame has to find its room somewhere else. It does: on its own
 * bottom edge.
 *
 * ## Where the presence went, and why
 *
 * **The bottom edge.** `--roster` derived the axis from the subject's only free edge; a
 * desktop frame has two free edges, so that rule stops picking. The rule that replaces
 * it is in `desk-hand.tsx`: **the grip lies along the axis the page stacks along.** A
 * phone stacks down, so the grip is a vertical bar on the side wall. A desktop page
 * stacks across at its top level, so the grip is a horizontal line along the bottom. It
 * agrees with `--roster` wherever `--roster` had an answer and is derived from what the
 * frame contains rather than from the shape of its box.
 *
 * The bottom edge is also the one edge the frame's own name is not on, and that is what
 * settles the collision `--ghost-loud` proved insoluble. The `shot` posture here is a
 * **sweep**: two halves leaving the head, running out along the bottom, around both
 * bottom corners, up both side walls, and stopping where the top corners would begin. It
 * is one object, it is open by 612 of a 1,879px perimeter so it cannot be read as a
 * selection ring, and **it has no horizontal arm at the top at all** — which is the
 * whole of the fix, because the arm was what struck the name. `--ghost` broke the ring
 * into four corners and paid for it by losing the reading that the shot ink is the
 * grip's own leaving the wall; standing on the bottom edge gives that reading back.
 *
 * ## What replaces a y-position
 *
 * Nothing, and the premise was backwards. Counting how many of the page's nine blocks
 * each block's span overlaps: a mark on the **wall** cannot separate 1.33 blocks on
 * average, worst case 3; a mark on the **bottom edge** cannot separate 5.56, worst case
 * 8. **A height is four times better than a width on a desktop page**, because a desktop
 * page is still a stack of full-width bands and the columns live inside the bands.
 *
 * So the presence rotates and the lane must not, and they come apart onto two different
 * edges of the same frame. That is the whole result: on a phone six channels are forced
 * onto one wall and `--ghost-loud` correctly reported that two of them fit. Here the
 * presence, the word and the count are on the bottom, the lane is on the right wall, the
 * ghost is inside, and the ladder costs nothing. **All six are on, none was cut, and
 * nothing collides.** The compile did not fail because the grammar was too big. It
 * failed because the frame was too narrow.
 *
 * What a height loses is being an **identifier**. On a phone page the blocks are
 * sequential and a mark's y names exactly one. Here writes 7, 8 and 9 land in three
 * cards standing side by side and put three marks on the identical 57 drawn pixels of
 * wall, and writes 5 and 12 land in the image column, whose mark spans the headline, the
 * lede and the button as well. **A height on a desktop page names the band, not the
 * block.**
 *
 * ## The one thing that is not faked here
 *
 * `LIVE_MIN_CSS_PX` is 400. At 561 drawn pixels this frame has a live document, so the
 * lane's heights are obtainable rather than imagined — `--accrue` and `--ghost-loud`
 * both drew them behind a `DIAGRAM` constant and said so at the line that introduced it.
 * **There is no `DIAGRAM` in this frame.** And eight pixels to the right, `menu` at 152
 * is under the same threshold and is a stored photograph. One canvas, one zoom, two
 * regimes — because the threshold is about the frame's box while legibility is about its
 * content, and a desktop canvas pulls the two apart. The desktop frame is larger, not
 * closer: its body copy draws at 6.6px against the phone's 5.4, and both are smears.
 *
 * ## The ghost
 *
 * **Size-independent in the mechanism, confirmed.** Cancellation is per pixel, so it is
 * indifferent to how many pixels there are, and both of its constants — 180ms of cover
 * fade, 573ms to the tightest next write — are measured against the wire and the
 * document rather than against the box. It is also the only channel that needs no edge
 * at all, which on a canvas with one spare gutter is the difference between a channel
 * and a wish.
 *
 * **Shape-dependent in the reading, and it improves.** A reflow's blast radius is the
 * width of the column it happens in. Here that bounds a left-column reflow at **34.2%**
 * of the frame against a phone's **92.7%**, and the loudest of the thirteen writes
 * measures **14.1%** against `--ghost-loud`'s worst of 57.8%. The objection that most
 * nearly killed the direction — at 57.8% the frame is two whole pages printed over each
 * other and which one is the past is unanswerable — is a phone problem.
 *
 * ## What this frame does not fix, stated
 *
 * The outgoing walk to `menu` leaves the right wall at `x + w + 3`, `ROW_1 + 158`, which
 * on a 351px frame is authored y 249 — inside the image block, and inside the lane.
 * `--ghost-loud` measured the same crossing on a phone and it is inherited unchanged.
 *
 * The outgoing walk to `hours` leaves the bottom wall and crosses the grip, because on a
 * vertical stack the walk graph and the presence want the same edge and there is no
 * opposite wall to escape to. What makes it cheap rather than fatal is that they now
 * meet at a right angle: three pixels of overlap where the phone case had a 1.5px accent
 * line and a 3px lane running **parallel** in the same strip for the length of a mark.
 *
 * The rail's picture of a desktop frame is 120 by 75 and holds nothing you could read.
 * That is the same fact the canvas has, one order of magnitude further down, and no
 * frame in this family has an answer to it.
 *
 * ## Reduced motion
 *
 * `useTurn` jump-cuts to settled, so nobody is ever at the frame: no thread, no plate,
 * no sweep, no lane, and the ghost is disabled outright rather than degraded, because a
 * jump cut takes the revision from 0 to 13 in one commit and a ghost of the found design
 * over the finished one is the whole frame doubled. Six channels degrade to zero,
 * exactly as they do on the phone — the setting does not care what shape anything is.
 * What is left is the design the agent finished with, on a desktop page, with nothing
 * over it.
 */

/** the frame every one of this capture's twenty-one rows names */
const SUBJECT = "home";

const SHOT_W = 120;

/**
 * Writes landed on the frame's source, which is what makes it redraw.
 *
 * `--ghost`'s function, unchanged, and the spine of the whole family: thirteen writes,
 * thirteen re-renders. `write` is excluded and `edit` is not, because the capture's
 * single `write home` is the geometry sidecar and a ghost of a design that did not
 * change is nothing.
 */
function writesOn(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return Math.min(count, WRITES);
}

/** the revision the newest picture is of, so an older `look` in the log shows the newest picture */
function shotRev(script: Script, turn: Turn): number {
	const when = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	const tools = script.rows.filter((row): row is ToolRow => row.kind === "tool");
	const last = tools.filter((row) => row.verb === "shot" && row.doneCue !== null && turn.at(row.doneCue)).at(-1);
	if (last === undefined) return 0;
	const taken = when.get(last.cue) ?? 0;
	const by = (cue: string) => (when.get(cue) ?? Number.POSITIVE_INFINITY) <= taken;
	let count = 0;
	for (const row of tools) {
		if (row.verb !== "edit") continue;
		for (const child of row.children) if (by(child.cue)) count += 1;
	}
	return Math.min(count, WRITES);
}

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"] },
	{ name: "site", frames: PLACED.map((frame) => frame.name), active: true, open: true },
];

export default function AgentHandEditDeskFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	// the same rows the rail is reading, asked two different questions: where the agent
	// is, and which blocks it has changed recently enough for the wall to still say so
	const hand = handOf(script, turn, LANDS);
	const rev = writesOn(script, turn, SUBJECT);
	const ghost = useGhost(rev);

	// a picture is of the frame as it was when it was taken, and this turn rewrites that
	// frame thirteen times. At 120 wide a desktop page is 75 tall, which is the rail
	// meeting the same problem the canvas has and having less room to meet it in
	const shotAt = shotRev(script, turn);
	const picture = (shot: ShotRef, width = SHOT_W) => {
		if (shot.frame !== SUBJECT) return null;
		const scale = width / 886;
		return (
			<div style={{ width, height: Math.round(554 * scale) }}>
				<div className="origin-top-left" style={{ width: 886, height: 554, transform: `scale(${scale})` }}>
					<KaffeDesk rev={shotAt} />
				</div>
			</div>
		);
	};

	const draw = (frame: Placed) => {
		if (frame.name === SUBJECT) {
			return <Ghosted rev={rev} ghost={ghost} draw={(at) => <KaffeDesk rev={at} />} />;
		}
		if (frame.name === "hours") return <KaffeDeskHours />;
		return <CoffeeScreen screen="menu" />;
	};

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
				{/* nothing is selected anywhere in this frame, so every mark out here that is
				    not a name or a walk belongs to the agent */}
				<DeskField draw={draw} />
				<DeskHandLayer hand={hand} frames={PLACED} />
			</CanvasChrome>
		</SpoolShell>
	);
}
