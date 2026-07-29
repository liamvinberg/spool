import { useCallback, useEffect, useRef, useState } from "react";
import { streamAgentTurn } from "../api";
import { type AgentEntry, fullyShown, type Stamped, transcriptOf } from "./agent-transcript";

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

export type TurnPhase = "idle" | "playing" | "settled";

export interface AgentTurn {
	readonly entries: readonly AgentEntry[];
	readonly phase: TurnPhase;
	/**
	 * Milliseconds since the send, and infinite once there is nothing left to pace —
	 * which is also what reduced motion asks for from the first frame, since a jump
	 * cut is the honest downgrade of an arrival rather than a slower one.
	 */
	readonly elapsed: number;
	/** when the last event landed, so a beat nobody closed still reads its real length */
	readonly last: number;
	readonly send: (text: string) => void;
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

	const send = useCallback(
		(text: string) => {
			abandon.current?.();
			events.current = [];
			started.current = Date.now();
			live.current = { open: true, prompt: text };
			setPrompt(text);
			setRun((current) => current + 1);
			setOpen(true);
			setMs(0);
			setDrained(false);
			const push = (event: Stamped["event"]) => {
				events.current.push({ at: Date.now() - started.current, event });
			};
			abandon.current = streamAgentTurn(project, text, {
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
			});
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
			const now = Date.now() - started.current;
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
	}, [run, drained, still]);

	// a turn belongs to the canvas that asked for it: navigating away ends it, and
	// the daemon takes the process with the request
	useEffect(() => () => abandon.current?.(), []);

	const transcript = transcriptOf(prompt, events.current);
	return {
		entries: run === 0 ? [] : transcript.entries,
		phase: run === 0 ? "idle" : open ? "playing" : "settled",
		elapsed: still || drained ? Number.POSITIVE_INFINITY : ms,
		last: transcript.last,
		send,
	};
}
