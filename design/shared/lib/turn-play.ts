import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The turn player behind the playable agent frames.
 *
 * A frame is not a still here: the human types in the composer, presses Enter,
 * and a real captured turn plays out in front of them. So the whole engine is
 * two small hooks and one rule — nothing on screen is a hard-coded end state,
 * every row is derived from how far the clock has got.
 *
 * `useTurn` is the clock. A script is a list of named cues measured in ms from
 * the send; `at(name)` answers whether that moment has passed. Both the rail and
 * the canvas read the same cues, which is why a row resolving in the rail and a
 * frame landing on the canvas can be the same instant rather than two guesses.
 *
 * The cues themselves are no longer authored. They are projected from a captured
 * Claude Code session (see claude-turn.ts), so the ordering and the intervals are
 * the ones that really happened.
 *
 * Reduced motion is not a downgrade path, it is a jump cut: every cue fires at
 * once and the turn is already settled, so someone who asked for stillness gets
 * the end state and no movement at all.
 */

export type TurnPhase = "idle" | "playing" | "settled";

/** a named moment in the turn, measured in ms from the send */
export interface Cue {
	readonly name: string;
	readonly at: number;
}

export interface Turn {
	/** idle until the first send, playing while it runs, settled once it lands */
	phase: TurnPhase;
	/** what the human typed, carried into their turn verbatim */
	prompt: string;
	/** has this cue fired yet */
	at: (name: string) => boolean;
	/** climbs per run, so children can reset with a key */
	run: number;
	/** the clock has reached something that waits on the developer (#145) */
	waiting: boolean;
	send: (text: string) => void;
	replay: () => void;
	/** let a held turn carry on, once the thing it was waiting for has happened */
	resume: () => void;
}

/**
 * The clock, and the one thing that can stop it.
 *
 * `hold` names a cue the turn parks on instead of playing through. It exists
 * because of #145: a question is the first state in this whole map that waits on
 * the person rather than being watched by them, and the capture cannot show it —
 * under `-p` nothing was there to answer, so the result landed 84ms later and the
 * options were on screen for a frame and a half. A held turn is what the same
 * events do with a client attached, which is the thing being designed.
 *
 * Parking is not a pause button: the cues before the hold still fire on their real
 * intervals, and releasing re-arms the rest from where the script had got to, so
 * the timing after the answer is the capture's own again.
 */
export function useTurn(cues: readonly Cue[], hold?: string): Turn {
	const still = useReducedMotion() === true;
	const [state, setState] = useState<{ run: number; phase: TurnPhase; prompt: string }>({
		run: 0,
		phase: "idle",
		prompt: "",
	});
	const [fired, setFired] = useState<readonly string[]>([]);
	/** the script time this leg starts from; `n` climbs so releasing re-arms the timers */
	const [leg, setLeg] = useState<{ n: number; from: number }>({ n: 0, from: 0 });
	const [waiting, setWaiting] = useState(false);

	const send = useCallback((text: string) => {
		setFired([]);
		setWaiting(false);
		setLeg({ n: 0, from: 0 });
		setState((prev) => ({ run: prev.run + 1, phase: "playing", prompt: text }));
	}, []);

	const replay = useCallback(() => {
		setFired([]);
		setWaiting(false);
		setLeg({ n: 0, from: 0 });
		setState((prev) => ({ run: prev.run + 1, phase: "playing", prompt: prev.prompt }));
	}, []);

	const { run, phase, prompt } = state;
	// a number rather than the cue, so the effect below has a stable dependency
	const stopAt = hold === undefined ? null : (cues.find((cue) => cue.name === hold)?.at ?? null);

	useEffect(() => {
		if (run === 0) return;
		if (still) {
			setFired(cues.map((cue) => cue.name));
			setState((prev) => ({ ...prev, phase: "settled" }));
			return;
		}
		const parks = stopAt !== null && leg.from <= stopAt;
		const timers: number[] = [];
		for (const cue of cues) {
			if (cue.at < leg.from) continue;
			// nothing past the hold is scheduled at all, so a question cannot be answered
			// by the turn moving on underneath it
			if (parks && stopAt !== null && cue.at > stopAt) continue;
			timers.push(
				window.setTimeout(() => {
					setFired((prev) => (prev.includes(cue.name) ? prev : [...prev, cue.name]));
				}, cue.at - leg.from),
			);
		}
		if (parks && stopAt !== null) {
			timers.push(window.setTimeout(() => setWaiting(true), stopAt - leg.from));
		} else {
			const last = cues.reduce((longest, cue) => Math.max(longest, cue.at), 0);
			timers.push(
				window.setTimeout(() => setState((prev) => ({ ...prev, phase: "settled" })), Math.max(0, last - leg.from) + 60),
			);
		}
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [run, still, cues, leg, stopAt]);

	const resume = useCallback(() => {
		if (stopAt === null) return;
		setWaiting(false);
		setLeg((prev) => ({ n: prev.n + 1, from: stopAt + 1 }));
	}, [stopAt]);

	const at = useCallback((name: string) => fired.includes(name), [fired]);
	return { phase, prompt, at, run, waiting, send, replay, resume };
}

/**
 * One ticker for the whole turn rather than a clock per row, because how many
 * rows a turn has is not known until the capture has been read and hooks cannot
 * come and go. It returns ms since the send; under reduced motion it returns
 * infinity, which reads out as every duration already final.
 */
export function useTicker(run: number, total: number, waiting = false): number {
	const still = useReducedMotion() === true;
	const [ms, setMs] = useState(0);
	/** script time already played, so a held turn resumes its durations rather than restarting them */
	const played = useRef(0);
	useEffect(() => {
		setMs(0);
		played.current = 0;
	}, [run]);
	useEffect(() => {
		// the clock stops with the turn: however long someone takes to answer, the
		// durations are the capture's and a thought must not read as finished because
		// the person was slow (#145)
		if (run === 0 || still || waiting) return;
		const started = Date.now() - played.current;
		const timer = window.setInterval(() => {
			const elapsed = Date.now() - started;
			setMs(elapsed);
			if (elapsed > total) window.clearInterval(timer);
		}, 100);
		return () => {
			played.current = Date.now() - started;
			window.clearInterval(timer);
		};
	}, [run, still, total, waiting]);
	return still ? Number.POSITIVE_INFINITY : ms;
}

/**
 * A duration as the capture measured it, not as the replay played it. Tenths
 * while a thought is short enough to read as tenths, whole seconds once it is
 * not, minutes once a wait has become the kind you go and do something else
 * during — which, in this capture, it does.
 */
export function duration(ms: number): string {
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	const whole = Math.round(ms / 1000);
	if (whole < 60) return `${whole}s`;
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/* ---------- what a transcript is made of ----------
 * The rail renders these and nothing else: the human's words, the agent's words,
 * and a one-line row per tool call. The vocabulary lives here rather than in the
 * rail because it is the turn's shape, and both the projection and the rail have
 * to agree on it. */

/**
 * `failed` is not an MCP state, it is the state every errored call was already in
 * and the rail drew as a check (#142). Two errored `tool_result`s sit in
 * `claude-fanout.json` — a refused `Edit` — and both read as done, because the
 * projection only ever asked whether a result had landed. A refused MCP call is
 * the same shape, and it is the one the developer most needs to be able to see.
 */
export type RowState = "pending" | "running" | "done" | "failed";

export interface RowChild {
	/** stable across the child's own state changes — its name is not, so keying on
	 * the name would remount a task the moment it starts running and arrive it twice */
	readonly id: string;
	readonly name: string;
	readonly state: RowState;
}

/** the agent read a picture back; the payload is elided in the capture, so the row holds its place */
export interface ShotRef {
	readonly path: string;
	readonly media: string;
	/**
	 * The frame the picture is of. Every image in both parent captures — 18 of 18 —
	 * came back from a Read of `.spool/verify/<frame>.png`, so the path always
	 * names a frame and the rail never has to say `.png` at all.
	 */
	readonly frame: string | null;
}

/**
 * A tool that is not spool's and not the agent's own (#142).
 *
 * The rail's rule is spool's nouns, and an `mcp__claude_ai_Google_Drive__search_files`
 * call has none — but Spool does not have to invent one, because the binary sends
 * one. `tool_use_meta` rides on the same `assistant` event as the `tool_use`
 * block, keyed by the call's id, and carries the server's own name, the tool's own
 * name, and a favicon URL. Measured: present on all four MCP calls in
 * `claude-mcp.json`, absent on all thirty-three calls that are not, and reproduced
 * on a plain spawn with no `--permission-prompt-tool`, so it is ordinary stream
 * output rather than something the permission tool adds.
 *
 * The two names are not equally good, and that is the whole of the design
 * question. `server` is written by whoever registered the connector and reads like
 * a product every time: `Notion`, `Google Drive`, `Eidra Artifacts`. `tool` is
 * written by whoever wrote the server and arrives however they typed it:
 * `Notion-Search`, `Search Files`, `artifact_help` — three conventions in three
 * servers. So a row built on the tool's name reads like a function a third of the
 * time, and a row built on the server's reads like a place every time.
 */
export interface Foreign {
	/** the server's own name, as the binary reports it */
	readonly server: string;
	/** the tool's own name, as its author typed it */
	readonly tool: string;
	/** the wire name, `mcp__<server>__<tool>`, with every character outside [A-Za-z0-9_-] replaced */
	readonly raw: string;
}

/**
 * One of the developer's MCP servers, as the binary reports it (#142).
 *
 * The inventory does not come from `init`. #141 measured the same binary reporting
 * fifteen servers, five and two across six spawns, because connectors are fetched
 * from the account and connected lazily, so whether one appears at `init` depends
 * on a race. `mcp_status` is a control command over the stdio the adapter already
 * opens and it answers with the whole estate plus a human-readable error per
 * server, which is the only reason a strip of these is drawable at all.
 *
 * The name here is the *configured* name and not the one a row prints: this
 * capture's `mcp_status` says `claude.ai Notion` where `tool_use_meta` says
 * `Notion`. Two vocabularies for one thing, which is the cost of holding both.
 */
export interface Connector {
	readonly name: string;
	readonly status: "connected" | "needs-auth" | "failed" | "pending";
	/** the binary's own sentence about why, present only when something is wrong */
	readonly error?: string | undefined;
}

/** one of the two-to-four choices a question offers, in the agent's own words */
export interface AskOption {
	readonly label: string;
	/** a whole sentence or three, and the half of the option that carries the cost */
	readonly description: string;
}

/**
 * A question the agent stopped to ask (#145).
 *
 * Not a permission ask and not a stranger's: `AskUserQuestion` arrives down the
 * same `can_use_tool` channel #121 wired, but with `requires_user_interaction:
 * true` and — measured across all twelve asks in `claude-mcp.json` — **no
 * `description` and no `permission_suggestions`**, which are the two fields an
 * approval row is built out of. So the channel is shared and the row cannot be.
 *
 * Every word here is the agent's own, which is what separates this from an
 * `elicitation`. The rail is already full of the agent's words.
 *
 * The binary bounds it: `validationErrorSteer` rejects a question with fewer
 * than two options before the person ever sees it, and the schema caps it at
 * four. So the option list is 2 to 4, always, and `header` is the agent's own
 * ≤12-character name for the decision.
 */
export interface Question {
	/** the agent's own short name for the decision — 12 characters at most */
	readonly header: string;
	readonly question: string;
	readonly options: readonly AskOption[];
	/** set when more than one option may be picked; false in the one captured ask */
	readonly multi: boolean;
}

/**
 * The plan, as an object rather than as a row.
 *
 * Seven TaskCreate calls in nine seconds are one list, and that list then runs
 * the next nine minutes: in the Streak capture task 1 starts 1m34s after the
 * plan is written and lands 7m54s after that, twenty-eight rows further down.
 * Nothing else in a turn behaves like that, which is why the plan is the one
 * thing the transcript can hold and still lose.
 */
export interface Plan {
	readonly total: number;
	readonly done: number;
	/** the agent's own present-participle phrasing for whatever is running */
	readonly running: string | null;
	readonly children: readonly RowChild[];
}

export type PlayEntry =
	| { readonly key: string; readonly kind: "user"; readonly text: string; readonly context?: string | undefined }
	| {
			readonly key: string;
			readonly kind: "line";
			readonly state: RowState;
			readonly verb: string;
			/** arrives a beat after the verb: content_block_start names a tool with an empty input */
			readonly subject?: string | undefined;
			/**
			 * The frame the subject names, when it names one (#143).
			 *
			 * Separate from the subject because they answer different questions: the
			 * subject is what to print and every row has one, this is whether the thing
			 * printed is a place. `read pnpm-lock.yaml` prints a subject and names no
			 * frame; `edit home ×6` prints one subject for six calls and names the frame
			 * all six touched, which #135 measured a run can never span two of.
			 */
			readonly frame?: string | null | undefined;
			/**
			 * How many calls a run collapsed (#135). It is already inside `subject` as
			 * `home ×6`, and it is here as well because the two halves of that string
			 * belong to different objects: `home` is the frame and `×6` is the count of
			 * calls made to it, so anything that treats the name as a place has to be able
			 * to leave the count out of it.
			 */
			readonly count?: number | undefined;
			/**
			 * Set when the call went to a server that is not spool's (#142). The rail picks
			 * which of the three names it prints; the row carries all three, because which
			 * one belongs in the subject is the question and not the projection's to settle.
			 */
			readonly foreign?: Foreign | undefined;
			/** the one line behind the disclosure */
			readonly detail?: string | undefined;
			/** a plan's tasks or a delegation's steps, which are the disclosure in their own right */
			readonly children?: readonly RowChild[] | undefined;
			/** a picture the agent looked at, standing in for a payload the capture elides */
			readonly shot?: ShotRef | undefined;
			/** opened by the turn rather than by a click; a click still wins after that */
			readonly open?: boolean | undefined;
			/** thinking sits a shade under the work */
			readonly quiet?: boolean | undefined;
	  }
	| { readonly key: string; readonly kind: "prose"; readonly full: string; readonly shown: string }
	/**
	 * The turn stopping to ask (#145).
	 *
	 * The fifth kind, and it is here rather than folded into `line` because a line
	 * is a receipt for something that already happened and this is the one thing in
	 * the log that has not happened yet. Everything else the rail draws is past
	 * tense.
	 *
	 * It types itself in like any other tool's arguments — `input_json_delta` splits
	 * the question across eleven fragments in the capture — so `shown` is how much of
	 * it has arrived, on the same three beats every other call gets: the tool
	 * appears, its subject types itself in, it runs.
	 *
	 * `state` carries all three endings the binary actually has. `running` is live
	 * and answerable, `done` is answered, and `failed` is the one nobody expects:
	 * `The user did not answer the questions.` — which under `-p` lands 84ms after
	 * the ask, because nothing is there to answer it.
	 */
	| {
			readonly key: string;
			readonly kind: "ask";
			readonly state: RowState;
			readonly ask: Question;
			/** how much of the question has typed itself in so far */
			readonly shown: string;
			/** the options have landed, so there is something to press */
			readonly live: boolean;
	  }
	/**
	 * Spool's own words, which are neither the human's nor the agent's.
	 *
	 * The fourth kind, and it took a real one to earn it: a model switch is not a
	 * tool call and nobody said it. `rule` is the difference between a boundary
	 * and a reply — a switch applies to everything under it, so it draws across
	 * the log, while a slash command answered locally is just an answer and sits
	 * where it fell.
	 */
	| {
			readonly key: string;
			readonly kind: "note";
			readonly text: string;
			/** the line the human typed to cause it, kept above the answer and in their voice */
			readonly said?: string | undefined;
			readonly rule?: boolean | undefined;
	  };
