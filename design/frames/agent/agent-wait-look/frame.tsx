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
 * **The two desktop apps nearly did not get read at all, and the first answer about them
 * was wrong.** A fast check said both were Electron shells loading the web app: they do
 * `loadURL` remote origins and `ChatGPT.app` even announces itself with
 * `x-i-am-a-browser: true`. That was a real string leading to a false conclusion. Both
 * ship their conversation locally. `Claude.app` serves its renderer over its own `app://`
 * protocol out of `Contents/Resources/ion-dist/`, and the remote `claude.ai` strings are
 * auth callbacks; `ChatGPT.app` bundles a webview titled Codex with local
 * `chatgpt-conversation-page` chunks and uses `chatgpt.com` only as an API base. The
 * lesson is the page's own rule: a string is not a finding, and the row that would have
 * gone in on the first reading would have been the two most important rows here, blank.
 *
 * **Because these two reverse the headline.** The shape round two is looking for is not
 * unprecedented. It is what both of them ship. Claude keeps its label mounted and swaps
 * only the shimmer wrapper around it (`a?jsx(Mr,{paused:_,children:l}):l`), and its newer
 * fixed status row is purely a state change — opacity for presence, a class for the
 * shimmer, no unmount anywhere. Codex is the same and more explicit about it: the
 * animation is applied by `classList.add` and taken off by `classList.remove` on a node
 * that never goes. So **two of the surfaces read here keep a persistent object and change
 * its state, and three mount and unmount one.** The always-present direction has prior
 * art, in the two surfaces closest to what spool is.
 *
 * **The second result stands and it kills a specific idea.** Not one of the five draws its
 * own brand mark. The nearest thing in the whole reading is that Claude Code's spinner
 * frames end on `✻`, which is also the Claude figure glyph in its own symbol table: a text
 * character that happens to be the brand's, not a logo being animated, and the array could
 * not be tied to the request-waiting spinner specifically. Claude's *web* transcript has no
 * `animate-pulse` classname anywhere and no spinner and no dots at all. That is the entire
 * precedent for a logo as a loading state, and it is nothing.
 *
 * **What they agree on is a word.** Claude Code says a gerund, escalates it when the turn
 * drags, and adds a clock and a token count. Claude Desktop says `Thinking...` and
 * shimmers it. Codex says `Thinking` and shimmers it on a cadence. Zed will say `Awaiting
 * Confirmation`. Four of the five spend characters rather than glyphs, and the two that
 * are closest to spool's own shape spend them on **one word with light moving across it**
 * — which is `agent-wait--shimmer`, a frame that exists because this reading turned it up.
 */

const SURFACES: readonly Surface[] = [
	{
		name: "claude code",
		source: "2.1.220 · jsc string table · 0x7481560, 0xcac1880, 0x60a04a0",
		where: "fixed, below the log",
		whereHow: "inferred",
		always: "no, it is made and unmade",
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
		source: "Claude.app · ion-dist/assets/v1/shared-5-UQAFGbWu.js, c360a9e1c-DrYIyI47.js",
		where: "both: a block in the turn, and a fixed row outside the transcript region",
		whereHow: "read",
		always: "yes",
		alwaysNote: "a?jsx(Mr,{paused:_,children:l}):l",
		alwaysHow: "read",
		moves: "the label shifts left by 20px and a gap: the icon slot is only supplied while streaming",
		movesHow: "read",
		says: "the word Thinking..., shimmering, then a summary or Thought process crossfaded in its place. an elapsed clock only after ten seconds. the fixed row pulses its colour instead of sweeping. no spinner and no dots in the transcript at all.",
		glyphs: ["Thinking"],
		cycle: 2250,
		sweep: true,
	},
	{
		name: "chatgpt · codex",
		source: "ChatGPT.app · webview/assets/app-initial-BHB6SClA.js",
		where: "unverified for the word; the fixed scroll button is read",
		whereHow: "unverified",
		always: "yes",
		alwaysNote: "classList.add/remove, never remounted",
		alwaysHow: "read",
		moves: "no. the sweep is an absolute overlay and the text is duplicated rather than replaced",
		movesHow: "read",
		says: "the word Thinking, shimmering on a cadence rather than continuously: 600ms of delay, one second of sweep, every four seconds. stepped on purpose, steps(48,end). skipped whole under prefers-reduced-motion.",
		glyphs: ["Thinking"],
		cycle: 2000,
		sweep: true,
	},
	{
		name: "cursor",
		source: "closed, not installed · cursor.com/changelog/cli-feb-18-2026",
		where: "unverified",
		whereHow: "unverified",
		always: "no, it is made and unmade",
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
		always: "no, it is made and unmade",
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
		always: "no, it is made and unmade",
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
					text={surface.always}
					how={surface.alwaysHow}
					className={surface.always.startsWith("no,") ? "text-thread" : undefined}
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
					title="two of five keep one, three do not"
					body="zed splices a list item in and out, assistant-ui gates a mount, claude code flips a showSpinner boolean. but claude desktop and codex both keep the object mounted and change only whether the animation runs, classList.add and classList.remove on a node that never goes. so the always-present shape has prior art, and it is in the two surfaces closest to what spool is."
				/>
				<Finding
					title="nobody uses their logo"
					body="not one of the five draws its own brand mark while it waits. the closest in the whole reading is that claude code's frames end on ✻, which is also the claude glyph in its own figure table: a text character that happens to be the brand's, in an array that could not be tied to the request-waiting spinner. claude's web transcript has no spinner, no dots and no animate-pulse classname at all. that is the entire precedent for the logo idea, and it is nothing."
				/>
				<Finding
					title="four of five spend characters, not glyphs"
					body="claude code says a gerund and escalates it, and adds a clock and a token count. claude desktop says Thinking... and shimmers it. codex says Thinking and shimmers it one second in every four. zed will say Awaiting Confirmation. only zed's ordinary case is a bare wordless spinner, and it is the one that admits it has nothing to add."
				/>
			</div>
			<div className="flex shrink-0 flex-col gap-2 border-border border-t pt-3">
				<span className="font-mono text-sm text-text leading-4">what it decides on the row below</span>
				<p className="max-w-[1500px] font-mono text-2xs text-muted/70 leading-5">
					the surface this rail is being written inside puts a word, a clock and a count in a fixed region under the
					log, which is agent-wait--line's slot to the pixel, and it differs from that take in one thing only: it
					mounts when the request goes out. the two that never mount anything say one word and move light across it,
					which is agent-wait--shimmer and is the only frame on the row below that this reading invented rather than
					judged. between them they leave one real disagreement, and it is what the row has to settle: line proves it
					is alive with a digit changing every hundred milliseconds, shimmer proves it with a sweep and gives the
					number up. agent-wait--mark has the least support of anything here. it is the one thing no readable surface
					does and the one thing none of them says anything with, which is not a reason to leave it undrawn. it is the
					reason it is drawn beside two frames that say idle, working and waiting in the same pixels.
				</p>
			</div>
		</div>
	);
}
