import type { ReactNode } from "react";
import { type Cell, CandidateStrip, type Held, type Row, StripMark } from "./marks";

/**
 * agent-nav-marks--held — what the threads mark says while the agent is waiting on
 * you (#161), drawn at the 14px it ships at.
 *
 * A sibling of `agent-nav-marks` rather than a section of it, because the object is
 * different. That sheet decided the *nav cell* — a glyph with a ring around it — and
 * #144 then deleted the tab row it stood in, so nothing on this page draws it any
 * more. What ships is `ThreadMark` in #136's strip: a bare 14px box holding a 9.2px
 * ring, a 5px disc, or nothing at all.
 *
 * **The state that is missing.** A thread parked on `AskUserQuestion` (#145) is
 * `running` as far as the strip is concerned, so it draws the turning ring — the same
 * drawing as a thread mid-turn burning tokens. It is the one state on this map that
 * is certainly costing nothing and certainly will not move again on its own.
 *
 * **Measured, and it is why this is not a small state.** The wait is unbounded by
 * default and the timeout is the *client's*, not the binary's. In 2.1.220 the AFK
 * auto-answer reads `TQf(k0e())` off the `askUserQuestionTimeout` setting, which maps
 * `60s | 5m | 10m` to milliseconds and **`never` or absent to `null`** — and the
 * hook's `enabled` is `(afkTimeoutMs !== null || CLAUDE_AFK_TIMEOUT_MS !== undefined)`,
 * so with no setting there is no timer at all. When there *is* one it belongs to
 * whoever renders the dialog, and under `-p` with `--permission-prompt-tool` that is
 * Spool. So the honest default is a thread stopped for as long as nobody comes back,
 * and the only reason it would ever resume itself is a clock Spool would have to
 * build. The TUI's own answer to the same problem is a **20-second countdown**
 * (`CLAUDE_AFK_COUNTDOWN_MS`, default 20000) drawn only in the last stretch — which is
 * a thing to show, not a reason not to show one.
 *
 * ## Two things on this sheet are disqualifiers, not comparisons
 *
 * **The `reduced` column.** It is the *working* mark as a `prefers-reduced-motion`
 * user sees it: `ThreadMark` drops the rotation and keeps the drawing, so ring *and
 * arc* stand still. Read it against each candidate's `waiting` cell. `still` is
 * pixel-identical to it. Freezing the spinner is the first instinct and it is not a
 * state — it is the working mark with a second meaning, for every reduced-motion
 * user, always.
 *
 * **The clearing rule.** `unread` clears when you *open* the thread; `useDeck` does
 * exactly that, and that is the whole of what the disc means. Waiting does not clear
 * when you open it — the question is still unanswered and the thread still cannot
 * move. So `same` (the ticket's "absence of the second") has to be special-cased out
 * of the one transition the disc exists for, and once it is, it is a third state
 * wearing the second one's clothes. Worse: opened once, the strip goes *silent* about
 * a thread that will never finish, which is precisely the case #136 built the strip
 * for.
 *
 * ## What is left is a choice between shape and weight
 *
 * The three states rank one way by loudness — turning > disc > outline — and the
 * opposite way by what they cost you: a working thread needs nothing from you, an
 * unread one has merely not been looked at, and a waiting one is *frozen*. So every
 * outline candidate draws the most consequential state as the quietest thing on the
 * strip.
 *
 * `ring` is the tidiest argument on paper. It is not new geometry: `StateMark` in the
 * rail already draws the ring with its arc taken off and already means *written down
 * and not started*, so the same picture would mean at-rest in both places the rail
 * counts, and it stays one object. But read the strips below rather than the rows.
 * Against the working mark it is the **same shape at a different weight**, and weight
 * is what a 14px mark has least of — which is the confusion this ticket exists to end,
 * softened rather than ended.
 *
 * **`held` is picked**, on the strip rather than on the sheet. It is the only candidate
 * that differs from working in *shape*, differs from unread in *shape*, and is louder
 * than both — which is the one ranking that matches what the three states cost. #144
 * rejected two objects in a 14px box, but what it rejected was a **satellite**: a mark
 * hung *under* a glyph, at a second position, pretending to be one thing. This is
 * concentric — a disc inside the ring that stopped around it — so it is one object with
 * something held in it, which is also what it means. It lives in `ThreadMark` now, and
 * the `held` row here draws the real mark rather than a copy, so the sheet cannot end
 * up arguing for something the rail does not draw.
 *
 * `open` and `hollow` stay drawn because the sheet is where the next session reads
 * what was already tried: the gap in a 9.2px ring and the hairline between a 5px disc
 * and a 5px outline are both invisible at ship size, and only the blow-up column makes
 * either look like a candidate.
 *
 * ## One reading, not one per reason
 *
 * #127's signed-out bounce is the same state and gets the same mark. It stopped, it is
 * burning nothing, and only a person moves it — the mark says *stopped, needs you* and
 * the log says which of the two it is, which is the division of labour the rail already
 * runs on. #122's wind-down is **not** a member: the agent is told to finish or
 * checkpoint and it does, so that thread completes and reads as unread or read like any
 * other. So the vocabulary gains one reading rather than one per cause.
 *
 * Nothing here is coloured. The one accent belongs to the selection (#136, #144), so
 * the bar under the open thread in the strips below is the only accent on the sheet.
 */

const STATES: readonly Cell[] = ["read", "working", "waiting", "unread"];

const BLOWN = 2.5;

function Sheet({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{children}
		</div>
	);
}

function Head({ title, note }: { title: string; note: string }) {
	return (
		<div className="flex shrink-0 items-baseline gap-3 border-border border-y bg-surface/40 px-5 py-1.5">
			<span className="font-mono text-sm text-text leading-4">{title}</span>
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/70 leading-3">{note}</span>
		</div>
	);
}

/**
 * The column titles. `working ⃰` is the same working mark with the rotation off, which
 * is what reduced motion already renders — it is here to be compared against, not
 * chosen.
 */
function Legend() {
	return (
		<div className="flex shrink-0 items-center px-5 py-1">
			<span className="w-[96px] shrink-0" />
			{STATES.map((state) => (
				<span key={state} className="w-[52px] shrink-0 text-center font-mono text-2xs text-muted/45 leading-3">
					{state}
				</span>
			))}
			<span className="w-[52px] shrink-0 text-center font-mono text-2xs text-muted/45 leading-3">reduced</span>
			<span className="w-[68px] shrink-0 pl-3 font-mono text-2xs text-muted/45 leading-3">2.5×</span>
			<span className="font-mono text-2xs text-muted/45 leading-3">what it says</span>
		</div>
	);
}

/** a real 34px cell of the real strip, so nothing is judged on white space */
function CellBox({ children }: { children: ReactNode }) {
	return <span className="flex h-[34px] w-[52px] shrink-0 items-center justify-center">{children}</span>;
}

type Verdict = "out" | "live" | "picked";

const CANDIDATES: readonly { kind: Held; name: string; note: string; verdict: Verdict }[] = [
	{
		kind: "same",
		name: "same",
		verdict: "out",
		note: "the disc, borrowed — but the disc clears on open and this does not",
	},
	{
		kind: "still",
		name: "still",
		verdict: "out",
		note: "the spinner frozen: identical to the reduced column for every reduced-motion user",
	},
	{
		kind: "ring",
		name: "ring",
		verdict: "live",
		note: "the arc taken off — the rail's at-rest mark, but working's shape at a lighter weight",
	},
	{
		kind: "open",
		name: "open",
		verdict: "out",
		note: "a loop you are the missing quarter of; the gap is invisible at 14px",
	},
	{
		kind: "held",
		name: "held",
		verdict: "picked",
		note: "the thing that stopped it, inside the turn it stopped — the only one louder than unread",
	},
	{
		kind: "hollow",
		name: "hollow",
		verdict: "out",
		note: "unread's sibling at unread's size — told apart from it by a hairline",
	},
	{
		kind: "bar",
		name: "bar",
		verdict: "out",
		note: "a media player's pause; nothing paused it and no button resumes it",
	},
];

const TONE: Record<Verdict, string> = {
	out: "text-muted/45",
	live: "text-muted",
	picked: "text-thread",
};

const SAID: Record<Verdict, string> = {
	out: "out",
	live: "live",
	picked: "picked",
};

function CandidateRow({ kind, name, note, verdict }: { kind: Held; name: string; note: string; verdict: Verdict }) {
	return (
		<div className="flex h-[62px] shrink-0 items-center px-5">
			<span className="flex w-[96px] shrink-0 flex-col gap-0.5">
				<span className="font-mono text-sm text-text/85 leading-4">{name}</span>
				<span className={`font-mono text-2xs leading-3 ${TONE[verdict]}`}>{SAID[verdict]}</span>
			</span>
			{STATES.map((state) => (
				<CellBox key={state}>
					<StripMark state={state} kind={kind} />
				</CellBox>
			))}
			<CellBox>
				<StripMark state="working" kind={kind} frozen />
			</CellBox>
			<span className="flex w-[68px] shrink-0 items-center justify-start pl-3">
				<StripMark state="waiting" kind={kind} scale={BLOWN} />
			</span>
			<span className="min-w-0 flex-1 font-mono text-2xs text-muted leading-4">{note}</span>
		</div>
	);
}

/**
 * The deck the strips stand up with. One thread open and streaming, one parked on a
 * question, one that finished unlooked-at, one an hour old — which is the case the
 * whole ticket is about: two of these are stopped and only one of them will ever move
 * again by itself.
 *
 * The asks are the ones already in `agent-threads.ts`, so the strip reads as the same
 * deck the rest of the page plays.
 */
const DECK: readonly Row[] = [
	{ id: "live", ask: "plan the whole build before you write anything", state: "working" },
	{ id: "takes", ask: "three takes on the empty cart", state: "waiting" },
	{ id: "home", ask: "shoot home and fix what reads wrong", state: "unread" },
	{ id: "deck", ask: "write the swedish copy deck", state: "read" },
];

const STANDING: readonly Held[] = ["ring", "open", "held", "hollow"];

export default function AgentHeldMarkFrame() {
	return (
		<Sheet>
			<Head title="the threads mark, waiting" note="#161 — the reading #136 has no drawing for, at 14px in a 34px strip" />
			<Legend />
			{CANDIDATES.map((row) => (
				<CandidateRow key={row.kind} kind={row.kind} name={row.name} note={row.note} verdict={row.verdict} />
			))}

			<Head
				title="standing up"
				note="the real 420px strip: working, waiting, unread — and the read one over the edge, as #136 measured"
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-3">
				{STANDING.map((kind) => (
					<div key={kind} className="flex items-center gap-4">
						<span className="w-[96px] shrink-0 font-mono text-sm text-text/85 leading-4">{kind}</span>
						<CandidateStrip rows={DECK} open="live" kind={kind} />
						<span className="min-w-0 flex-1 font-mono text-2xs text-muted/60 leading-4">
							{kind === "ring"
								? "second and third read as two weights of the same thing, which they are"
								: kind === "open"
									? "the gap is invisible at this size until you know to look for it"
									: kind === "held"
										? "the only candidate louder than unread, which is the only correct ranking"
										: "5px against 5px: the two stopped threads are told apart by a hairline"}
						</span>
					</div>
				))}
			</div>
		</Sheet>
	);
}
