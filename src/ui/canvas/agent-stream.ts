import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentReply } from "../../daemon/agent-control";
import { answerAgentTurn, streamAgentTurn } from "../api";
import {
	type AgentEntry,
	type AgentPlan,
	type AgentSent,
	fullyShown,
	type Stamped,
	transcriptOf,
} from "./agent-transcript";

/**
 * One turn, from the composer to the log (#192).
 *
 * The hook owns three things and nothing else: the events as they land, the clock
 * they are read against, and the request itself. Everything the rail draws is
 * derived — the transcript is projected fresh from the events on every tick, so
 * there is one source of truth and no second copy to keep in step.
 *
 * The clock is the pace's clock. #149's smoother is a closed-form function of
 * elapsed milliseconds rather than an accumulator, so a tick is a read rather than
 * a step: a dropped frame costs nothing and the edge lands where it would have.
 */

/**
 * How often the log is read, at the pace's own resolution.
 *
 * The edge moves at 83 characters a second at its floor, so ten reads a second is
 * about eight characters a tick — a word. Faster buys sub-word steps nobody can
 * see; slower turns a stream into a slideshow.
 */
const TICK_MS = 100;

/**
 * What the turn is doing, and the one member that is about the person (#145).
 *
 * `asking` is not a slower `playing`. A turn parked on a request is spending nothing
 * and moving nowhere, and it is the only state in this rail that ends when somebody
 * acts rather than when something arrives — which is why Enter changes meaning in it
 * and why the clock stops. It is deliberately not called `waiting`: the union already
 * has a `waiting`, and that one is the model composing.
 */
export type TurnPhase = "idle" | "playing" | "asking" | "settled";

export interface AgentTurn {
	readonly entries: readonly AgentEntry[];
	/**
	 * The plan the turn wrote, which is not in the entries and is the point of it: it
	 * goes on changing for the rest of the turn, so it sits on the shelf above the log
	 * rather than scrolling off the top of one (#117, #194).
	 */
	readonly plan: AgentPlan | null;
	readonly phase: TurnPhase;
	/**
	 * Milliseconds since the send, and infinite once there is nothing left to pace —
	 * which is also what reduced motion asks for from the first frame, since a jump
	 * cut is the honest downgrade of an arrival rather than a slower one.
	 */
	readonly elapsed: number;
	/** when the last event landed, so a beat nobody closed still reads its real length */
	readonly last: number;
	/**
	 * Send what was typed, and with it whatever the composer was holding (#116, #119).
	 *
	 * `sent` is captured here rather than read later because the selection is a live
	 * thing and a turn is a record: the chips that were up are the bytes that went
	 * out, and the line under the words says so for as long as the log lasts.
	 */
	readonly send: (text: string, sent?: AgentSent) => void;
	/**
	 * What the person said to a request the turn is parked on (#121, #145).
	 *
	 * It goes up its own door rather than down the stream that asked, and nothing is
	 * drawn from it here: the daemon says the request was answered on the same stream
	 * everything else arrives on, so the log stays one fold over one sequence.
	 */
	readonly answer: (request: string, reply: AgentReply) => void;
}

const stillness = () =>
	typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

export function useAgentTurn(project: string): AgentTurn {
	const [still] = useState(stillness);
	const events = useRef<Stamped[]>([]);
	const started = useRef(0);
	const abandon = useRef<(() => void) | null>(null);
	const [prompt, setPrompt] = useState("");
	/** what rode with those words, held for as long as the log holds them */
	const [carried, setCarried] = useState<AgentSent>({});
	/** climbs per send, which is what re-arms the clock */
	const [run, setRun] = useState(0);
	const [open, setOpen] = useState(false);
	const [ms, setMs] = useState(0);
	/** the stream is closed and the edge has caught up with it: nothing left to read */
	const [drained, setDrained] = useState(false);
	/**
	 * What the clock reads, written by the stream rather than by a render.
	 *
	 * It cannot be a mirror of the state above: a render is when React chooses, and the
	 * clock ticks whether or not one has happened. Under batching a whole turn's worth
	 * of ticks can run before the render that would have told them the stream had
	 * closed, and every one of them would decide there was more coming.
	 */
	const live = useRef({ open: false, prompt: "" });
	/**
	 * The time the turn spent waiting on the person, which is time the log never had.
	 *
	 * A question stops the clock. Everything the transcript reads is measured from the
	 * send — a beat's length, the rate a message is paced at — and none of it should
	 * count the seconds somebody spent deciding: the agent is not thinking during them
	 * and nothing is arriving. So the clock is the wall clock minus what was parked,
	 * and the same reading stamps every event and drives every tick.
	 */
	const parked = useRef<{ total: number; since: number | null }>({ total: 0, since: null });
	const clock = useCallback(
		() =>
			Date.now() -
			started.current -
			parked.current.total -
			(parked.current.since === null ? 0 : Date.now() - parked.current.since),
		[],
	);
	/**
	 * The requests nobody has answered yet, and the call each is about.
	 *
	 * The clock runs again the moment the last of them is gone, and that is not the same
	 * as somebody answering: an unanswered request is neither a state nor a stall, and
	 * measured, the agent takes the cautious option itself and its result lands 84ms
	 * later. A clock that only ever restarted on an answer would freeze for the rest of
	 * a turn nobody answered, which is the turn every capture in the repo records.
	 */
	const waitingOn = useRef(new Map<string, string | null>());

	const send = useCallback(
		(text: string, sent: AgentSent = {}) => {
			abandon.current?.();
			events.current = [];
			started.current = Date.now();
			parked.current = { total: 0, since: null };
			waitingOn.current = new Map();
			live.current = { open: true, prompt: text };
			setPrompt(text);
			setCarried(sent);
			setRun((current) => current + 1);
			setOpen(true);
			setMs(0);
			setDrained(false);
			const push = (event: Stamped["event"]) => {
				// the clock stops on the request and starts again on whatever released it: an
				// answer, the call's own result where nobody answered, or the turn ending under
				// it. The same three the transcript settles a waiting block on
				if (event.kind === "asking") waitingOn.current.set(event.request, event.call);
				if (event.kind === "answered") waitingOn.current.delete(event.request);
				if (event.kind === "result") {
					for (const [request, call] of waitingOn.current)
						if (call === event.id) waitingOn.current.delete(request);
				}
				if (event.kind === "ended" || event.kind === "closed") waitingOn.current.clear();
				if (waitingOn.current.size > 0) parked.current.since ??= Date.now();
				else if (parked.current.since !== null) {
					parked.current = { total: parked.current.total + (Date.now() - parked.current.since), since: null };
				}
				events.current.push({ at: clock(), event });
			};
			abandon.current = streamAgentTurn(
				project,
				{ prompt: text, attached: sent.attached ?? undefined },
				{
					event: push,
					/*
					 * The stream is the turn's whole life, so its end has to leave the log
					 * saying why. The daemon ends every turn with a `closed` event; a stream
					 * that stops without one stopped on this side, and the union already has
					 * the member for a process that is gone.
					 */
					end: (error) => {
						if (error !== undefined) push({ kind: "closed", code: null, message: error, parent: null });
						else if (events.current.at(-1)?.event.kind !== "closed") {
							push({ kind: "closed", code: null, message: "the turn stream ended", parent: null });
						}
						live.current = { ...live.current, open: false };
						setOpen(false);
					},
				},
			);
		},
		[project, clock],
	);

	const answer = useCallback(
		(request: string, reply: AgentReply) => {
			// nothing is drawn from the reply here: the daemon pushes an `answered` down
			// the stream when it reaches the process, so one fold still draws the log
			void answerAgentTurn(project, request, reply);
		},
		[project],
	);

	/*
	 * The clock, and the one thing that stops it.
	 *
	 * It runs under reduced motion too, which is not a contradiction: the tick is what
	 * puts arriving events on screen, and the pace is what `elapsed` decides. Stopping
	 * the tick would leave a still-preferring reader looking at their own sentence and
	 * nothing else until the process exited, then the whole turn at once.
	 *
	 * It outlives the stream on purpose: the pace is up to 0.8s behind the wire, so the
	 * last words of a message arrive after the process has gone. It stops when the edge
	 * has reached the end of every message, which is the only moment at which there is
	 * nothing left to draw.
	 */
	useEffect(() => {
		if (run === 0 || drained) return;
		const timer = setInterval(() => {
			const now = clock();
			setMs(now);
			if (live.current.open) return;
			const { entries } = transcriptOf(live.current.prompt, events.current);
			if (
				entries.some(
					(entry) => entry.kind === "prose" && !fullyShown(entry, still ? Number.POSITIVE_INFINITY : now),
				)
			)
				return;
			setDrained(true);
		}, TICK_MS);
		return () => clearInterval(timer);
	}, [run, drained, still, clock]);

	// a turn belongs to the canvas that asked for it: navigating away ends it, and
	// the daemon takes the process with the request
	useEffect(() => () => abandon.current?.(), []);

	const transcript = transcriptOf(prompt, events.current, carried);
	return {
		entries: run === 0 ? [] : transcript.entries,
		plan: run === 0 ? null : transcript.plan,
		phase: run === 0 ? "idle" : transcript.asking !== null ? "asking" : open ? "playing" : "settled",
		elapsed: still || drained ? Number.POSITIVE_INFINITY : ms,
		last: transcript.last,
		send,
		answer,
	};
}
