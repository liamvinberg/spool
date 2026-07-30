import { Cell, Finding, Glyph, type Surface } from "./look";

/**
 * agent-wait-look — how six other surfaces draw the beat between a request going out
 * and an answer coming back, read at the source.
 *
 * A sheet in `agent-nav-strip`'s register, and it exists because round two cannot be
 * decided on taste. Round one drew five takes, measured four of them at zero movement,
 * and the winner was rejected anyway on a reason that reframed the question: the
 * objection is to an object that **comes and goes**, not to the pixels it moves when it
 * goes. So before drawing anything again, the same four questions were put to every
 * surface that solves this for real, and the answers had to come out of shipped source
 * rather than out of memory of a screenshot.
 *
 * **What was actually read, and how.** assistant-ui and Zed are open source and were
 * read on `main`. Claude Code is on this machine and is a 256MB Bun single-file
 * executable compiled to JSC bytecode, so `strings` fails on it; its literals were
 * recovered by parsing the JavaScriptCore string table directly, which yields 404,114
 * entries against `strings`' 394,254 and is the only reason the spinner glyphs and the
 * 186-word gerund list are quotable at all. Cursor is closed source and not installed,
 * so it gets one row of what its own changelog says about a different surface and
 * nothing else. Where an answer is inferred from identifier co-location rather than read
 * off render code it is drawn in italics, and where nothing could be verified the row
 * says so instead of guessing.
 *
 * **The result is one sentence and it is unanimous.** Of every surface that could be
 * read, **not one keeps a persistent indicator**. All of them mount something when the
 * request goes out and unmount it when the answer lands, which is exactly what spool
 * does today and exactly what was objected to. There is no prior art for the shape round
 * two is looking for, which cuts both ways: nobody has solved this, and nobody has tried.
 *
 * **And the second result kills a specific idea.** Not one of them draws its own brand
 * mark. The nearest thing in the whole reading is that Claude Code's spinner frames end
 * on `✻`, which is also the Claude figure glyph in its own symbol table — a text glyph
 * that happens to be the brand's, not a logo being animated, and the frame array could
 * not be tied to the request-waiting spinner specifically. That is the entire precedent
 * for a logo as a loading state.
 *
 * **What they do agree on is words.** Claude Code says a gerund, an escalating one when
 * it is slow, an elapsed clock, a token count and how to interrupt. Zed will say
 * `Awaiting Confirmation` and, behind a setting, an elapsed time and a token count. Both
 * of them put a number on the wait. Nothing here is a bare spinner and nothing here is
 * silent, which is the case against `agent-wait--mark` and the case for
 * `agent-wait--line`.
 */

const SURFACES: readonly Surface[] = [
	{
		name: "claude code",
		source: "2.1.220 · jsc string table · 0x7481560, 0xcac1880, 0x60a04a0",
		where: "fixed, below the log",
		whereHow: "inferred",
		always: false,
		alwaysNote: "showSpinner is a boolean",
		alwaysHow: "inferred",
		moves: "nothing is committed: the viewport repaints whole",
		movesHow: "inferred",
		says: "a star growing, one of 186 gerunds (Accomplishing … Zigzagging, Thinking, Working, Clauding), an elapsed clock, (N tokens), and an esc hint assembled from the keymap. slow turns escalate: thinking → still thinking → thinking some more. stalls say Waiting for API response.",
		glyphs: ["·", "✢", "✳", "✶", "✻", "✽"],
		cycle: 720,
	},
	{
		name: "claude desktop",
		source: "not verified",
		where: "unverified",
		whereHow: "unverified",
		always: null,
		alwaysNote: "unverified",
		alwaysHow: "unverified",
		moves: "unverified",
		movesHow: "unverified",
		says: "not read at the source. no claim is made here.",
		glyphs: null,
		cycle: 0,
	},
	{
		name: "chatgpt",
		source: "not verified",
		where: "unverified",
		whereHow: "unverified",
		always: null,
		alwaysNote: "unverified",
		alwaysHow: "unverified",
		moves: "unverified",
		movesHow: "unverified",
		says: "not read at the source. no claim is made here.",
		glyphs: null,
		cycle: 0,
	},
	{
		name: "cursor",
		source: "closed, not installed · cursor.com/changelog/cli-feb-18-2026",
		where: "unverified",
		whereHow: "unverified",
		always: false,
		alwaysNote: "its own changelog, about the cli",
		alwaysHow: "read",
		moves: "unverified",
		movesHow: "unverified",
		says: 'nothing verifiable about the panel. the one primary-source line is about the terminal: "the Generating... indicator clears as soon as the model finishes rather than waiting for the full stream to close."',
		glyphs: null,
		cycle: 0,
	},
	{
		name: "zed",
		source: "crates/agent_ui/src/conversation_view/thread_view.rs:7280",
		where: "in the list, one item past the end",
		whereHow: "read",
		always: false,
		alwaysNote: "list_state.splice() adds and removes it",
		alwaysHow: "read",
		moves: "ListAlignment::Top, so not while scrolled up. tail-follow reclaims its height at the bottom",
		movesHow: "inferred",
		says: "a braille spinner and no word at all. Awaiting Confirmation when it is blocked on you, typed in then cycling an ellipsis. elapsed time and N tokens only behind show_turn_stats.",
		glyphs: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
		cycle: 1000,
	},
	{
		name: "assistant-ui",
		source: "packages/core/src/react/primitives/message/MessageGroupedParts.tsx",
		where: "in the flow, inside the assistant message",
		whereHow: "read",
		always: false,
		alwaysNote: "shouldShowIndicator() gates the mount",
		alwaysHow: "read",
		moves: "the row is made when the request goes out and keeps its place. only the glyph leaves",
		movesHow: "read",
		says: "one pulsing filled circle, aria-label Assistant is working. no word, no clock, no count. it is dropped the moment a text part exists.",
		glyphs: ["●"],
		cycle: 2000,
		pulse: true,
	},
];

const COLS = "260px 190px 190px 300px 1fr 90px";

function Head() {
	return (
		<div className="grid items-baseline gap-x-6 border-border border-b pb-2" style={{ gridTemplateColumns: COLS }}>
			{["surface", "in the flow or fixed", "always there", "does it move the words", "what it says", "look"].map(
				(label) => (
					<span key={label} className="font-mono text-2xs text-muted/45 leading-4">
						{label}
					</span>
				),
			)}
		</div>
	);
}

function Line({ surface }: { surface: Surface }) {
	return (
		<div className="grid items-start gap-x-6 border-border/40 border-b py-3" style={{ gridTemplateColumns: COLS }}>
			<div className="flex min-w-0 flex-col gap-1">
				<span className="font-mono text-sm text-text leading-4">{surface.name}</span>
				<span className="break-words font-mono text-2xs text-muted/35 leading-4">{surface.source}</span>
			</div>
			<Cell text={surface.where} how={surface.whereHow} />
			<div className="flex min-w-0 flex-col gap-1">
				<Cell
					text={surface.always === null ? "unverified" : surface.always ? "yes" : "no, it is made and unmade"}
					how={surface.alwaysHow}
					className={surface.always === false ? "text-thread" : undefined}
				/>
				<span className="font-mono text-2xs text-muted/35 leading-4">{surface.alwaysNote}</span>
			</div>
			<Cell text={surface.moves} how={surface.movesHow} />
			<p className="font-mono text-2xs text-muted/70 leading-5">{surface.says}</p>
			<div className="flex h-5 items-center">
				{surface.glyphs === null ? (
					<span className="font-mono text-2xs text-muted/25 leading-4">none</span>
				) : (
					<Glyph frames={surface.glyphs} cycle={surface.cycle} pulse={surface.pulse ?? false} />
				)}
			</div>
		</div>
	);
}

export default function AgentWaitLookFrame() {
	return (
		<div className="flex h-full w-full flex-col gap-5 overflow-hidden bg-canvas px-8 py-6 font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex items-baseline gap-3">
				<span className="font-mono text-sm text-text leading-4">wait look</span>
				<span className="font-mono text-2xs text-muted/70 leading-3">
					#149 round two. six surfaces, four questions, read at the source. italic is inferred, grey is unverified.
					the look column runs the real frame arrays.
				</span>
			</div>
			<div className="flex min-h-0 flex-col overflow-hidden">
				<Head />
				{SURFACES.map((surface) => (
					<Line key={surface.name} surface={surface} />
				))}
			</div>
			<div className="grid min-h-0 shrink-0 grid-cols-3 gap-8">
				<Finding
					title="nobody keeps one"
					body="three of the six could be read at the source and all three mount an indicator when the request goes out and unmount it when the answer lands. cursor's own changelog says the same about its cli. spool does exactly this today and it is what was objected to, so the always-present shape round two is looking for has no prior art anywhere. that is not an argument against it: none of these solved the blinking either, they just never treated it as a problem."
				/>
				<Finding
					title="nobody uses their logo"
					body="not one draws its own brand mark while it waits. the closest in the whole reading is that claude code's frames end on ✻, which is also the claude glyph in its own figure table: a text character that happens to be the brand's, in an array that could not be tied to the request-waiting spinner. that is the entire precedent for the logo idea, and it is thin."
				/>
				<Finding
					title="the two that say anything say words and a number"
					body="claude code prints a gerund, escalates it when the turn drags, and carries an elapsed clock and a token count. zed will say Awaiting Confirmation and put elapsed time behind a setting. both spend characters rather than glyphs on the wait, and both put a number on it. a bare spinner is what zed does when it has nothing to add, never what either does when it does."
				/>
			</div>
			<div className="flex shrink-0 flex-col gap-2 border-border border-t pt-3">
				<span className="font-mono text-sm text-text leading-4">what it decides on the row below</span>
				<p className="max-w-[1500px] font-mono text-2xs text-muted/70 leading-5">
					the surface this rail is being written inside puts a word, a clock and a count in a fixed region under the
					log, which is agent-wait--line's slot to the pixel. it differs from that take in one thing only: it mounts
					when the request goes out. so the take with the most support here is the one that keeps claude code's
					placement and its words and drops the mounting, and the take with the least is agent-wait--mark, which is the
					one thing every readable surface agrees not to do and the one thing none of them says anything with. that is
					not a reason to leave it undrawn. it is the reason it is drawn beside a frame that says idle, working and
					waiting 1.4s in the same pixels.
				</p>
			</div>
		</div>
	);
}
