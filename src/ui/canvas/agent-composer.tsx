import { useEffect, useMemo, useRef, useState } from "react";
import { ATTACHMENT_MEDIA, type Attachment, isSendableAttachment } from "../../attachment";
import type { AgentReply } from "../../daemon/agent-control";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { AgentLimit } from "../../daemon/agent-events";
import type { SelectionEntry } from "../api";
import { cn } from "../cn";
import { CloseIcon } from "../icons";
import { type Chip as ChipWords, contextOf, type Strip, WHOLE_SELECTION } from "./agent-chips";
import { Fade, RailMenu } from "./agent-float";
import { AgentMenu } from "./agent-menu";
import type { AgentModelDeck } from "./agent-model";
import { useHeld } from "./agent-motion";
import { type PermissionDeck, PermissionMenu } from "./agent-permissions";
import type { LoginDeck } from "./agent-preflight";
import { Lightbox } from "./agent-shot";
import type { TurnPhase } from "./agent-stream";
import type { AgentSent } from "./agent-transcript";
import { ChevronIcon } from "./sidebar";

/* ---------- the composer ----------
 * One bounded box the whole message is typed into, with what rides along stacked
 * above the field it rides with. Enter sends what is in it verbatim, whatever that
 * is; shift-Enter is a newline.
 *
 * Enter has three meanings and the turn's own state resolves them (#170): answering
 * answers, busy queues, otherwise sends. Busy used to refuse — two agents writing one
 * repo is still not a thing to offer — but refusing threw away written words, so the
 * press is taken and held instead and the queue above the field is where it waits.
 * The hint below says which of the three is live, so a press is never a mystery. */

/**
 * What the hands are pointing at, and what the strip may do about it (#116, #139).
 *
 * The entries are the daemon's own enriched list rather than the canvas's raw
 * selection, because the strip is the promise of what the prompt will carry: what
 * is drawn here and what goes out are one list read twice.
 */
export interface Pointing {
	readonly entries: readonly SelectionEntry[];
	/**
	 * The list is the frame the hands stepped into rather than one they picked.
	 *
	 * It draws as an ordinary chip at full strength with the dismiss control taken
	 * off: entering is the most specific act the canvas has, and out there the only
	 * way to stop pointing at the frame you are inside is a mode change.
	 */
	readonly inside: boolean;
	/** the entry the pointer is over, in the rail or out on the canvas */
	readonly lit: string | null;
	readonly onLight: (id: string | null) => void;
	/** null drops the whole selection, which is the count chip's own ✕ */
	readonly onDrop: (id: string | null) => void;
}

/** the field's height, empty and at its tallest before it scrolls */
export const MIN_H = 60;
const MAX_H = 160;

/**
 * The stroke on the composer's top border, which is the whole of what says the agent is
 * alive.
 *
 * A thread is laid out of the left edge, carries at its full length, and is taken up into
 * the right edge as the head waits there for the tail. Spool means winding thread and this
 * product calls its conversations threads, so a stroke on the boundary is closer to what
 * the thing is than a spinner would be — and it says it without spending the logo or a
 * single pixel of the transcript, because it rides the hairline that was already there.
 *
 * **No word, and that is the point.** The stroke is the entire indicator. Idle draws the
 * border unchanged, and a request out, thinking, saying and doing all draw the same
 * laying-and-taking-up. A reader watching the edge of their own eye learns nothing from the
 * difference between a request being out and a `read` being open, because the answer to *do
 * I need to do anything* is no in both.
 *
 * **What it does now say is how long, and only that (#231).** The travel is untouched and
 * the strength ramps: 75% of the text colour at rest, full at thirty seconds of one
 * unbroken silence. That reasoning above holds for the four-second wait it was written
 * against and does not cover a two-and-a-half-minute one, where the peripheral question
 * stops being *do I need to act* and becomes *is this thing alive at all*. Strength answers
 * it in the direction that helps — the line gets more present the longer it has been — and
 * costs neither the accent nor a pixel of travel. `WindStroke` argues the property choice.
 *
 * **The one state that is a call to act gets a shape instead.** Parked on a request, the
 * stroke stops where it was and an 18px break opens in the line. Stopping is
 * `animation-play-state: paused`, which is literally "where it was" and needs no clock of
 * spool's; a break is static, which is correct for a thing that has stopped, and nothing
 * else in this rail is a discontinuous line.
 *
 * The animation is `ui.css`'s, keyframes on one element's `translateX` and `scaleX`. Its
 * cost is stated rather than hidden: 420px of peripheral travel every 1.6s at 0.26px/ms,
 * the largest moving thing in the rail. What it buys is that the transcript gives up
 * nothing at all.
 */
/**
 * Where the strength ramp tops out, in milliseconds of one silence.
 *
 * 30 seconds, off the thinking blocks in the captures rather than off taste: 22 of the 27
 * are 1,050 estimated tokens or fewer, which is under 18 seconds at the 16.7ms a token the
 * four sequential captures measure. So an ordinary turn lives in the bottom of the ramp
 * and never reaches the top, and the five long ones — up to 9,500 tokens, two minutes
 * thirty-nine — arrive there and stay.
 */
const WIND_FULL_AT = 30_000;
/** what the stroke has always been, and the floor the ramp starts from */
const WIND_FLOOR = 0.75;

/**
 * How present the stroke is, for a silence this long.
 *
 * Exported because it is the whole of the behaviour and the only part of it worth
 * asserting: mounted, the ramp can only be read at whatever instant a test happens to
 * catch, and the thirty seconds it is defined over cannot be waited for. So the
 * arithmetic is tested as arithmetic and the rail is tested for being wired to it.
 */
export function windStrength(waited: number, laying: boolean): number {
	if (!laying) return WIND_FLOOR;
	return WIND_FLOOR + (1 - WIND_FLOOR) * Math.max(0, Math.min(1, waited / WIND_FULL_AT));
}

function WindStroke({ phase, waited }: { phase: TurnPhase; waited: number }) {
	// every state of a turn in flight draws the same thing, and a parked one draws it
	// stopped: the animation is the same instance either way, so pausing freezes the two
	// ends exactly where the request caught them
	const laying = phase === "playing" || phase === "asking";
	const parked = phase === "asking";
	/*
	 * The one thing the stroke now says about how long (#231).
	 *
	 * Strength and never pace, and the reason is the complaint this came from: the rail
	 * read as stopped, and slowing the only moving thing in it to say so would have been
	 * answering *is this alive* with less evidence that it is. Brightening says the same
	 * thing in the opposite direction — the longer it has been, the more present the line
	 * — and it leaves the travel exactly where it was.
	 *
	 * It is opacity on the colour the stroke already had rather than a colour of its own.
	 * This palette has one accent and `--color-thread` means the human's own thread: on
	 * the human's words, on the chip's rule, on a hot meter. Spending it here would give
	 * it a second meaning that has nothing to do with the first. Red would be worse still,
	 * because a long thought is the product working rather than a fault.
	 *
	 * A transition and not a keyframe, which is also why this is not pace. Opacity
	 * interpolates continuously and costs nothing; `animation-duration` on a running
	 * keyframe animation remaps the phase, and the head visibly jumps backwards every time
	 * the number moves.
	 */
	const strength = windStrength(waited, laying);
	return (
		<>
			<span
				aria-hidden="true"
				data-agent-wind={parked ? "parked" : laying ? "laying" : "idle"}
				style={{ opacity: strength }}
				className={cn(
					// scaled to nothing at rest, so idle is the border and nothing else: the
					// keyframes take the transform over for as long as they are running.
					// `transform` rather than Tailwind's `scale-x-0`, which compiles to the
					// `scale` property and would multiply the animation's own scale by zero
					"pointer-events-none absolute -top-px left-0 block h-px w-full origin-left bg-text [transform:scaleX(0)]",
					// 400ms, so the ramp is a drift rather than a per-tick step: the rail
					// re-renders on the pace's own clock and an untransitioned opacity would
					// change sixty times a second
					"transition-opacity duration-400 ease-linear motion-reduce:transition-none",
					laying && "animate-agent-wind",
					parked && "[animation-play-state:paused]",
				)}
			/>
			{/* the break, held rather than mounted so it can open over 200ms rather than
			    appear: it is a piece of the page laid over the hairline */}
			<span
				aria-hidden="true"
				data-agent-wind-break=""
				className={cn(
					"pointer-events-none absolute -top-px left-1/2 block h-px w-[18px] -translate-x-1/2 bg-bg transition-opacity duration-200 motion-reduce:transition-none",
					parked ? "opacity-100" : "opacity-0",
				)}
			/>
		</>
	);
}

/**
 * What the field says it is for, which is what the next press will do (#145, #200).
 *
 * Three, because Enter has three meanings here and the field is what each of them is
 * about: answering a question the turn is parked on, starting the thread again when its
 * session has aged out, and otherwise saying the next thing. A question wins over a
 * finished thread, because a parked turn is a live process and there is nothing to start.
 */
function fieldSays(answering: string | null, finished: boolean, running: boolean): string {
	if (answering !== null) return "Or type your own answer";
	// Enter queues while a turn runs, so the field asks for what follows it (#364)
	if (running) return "Say what comes next";
	return finished ? "Say what to change · this starts a new chat" : "Say what to change";
}
export function Composer({
	thread,
	ready,
	request,
	permissions,
	menu,
	onMenu,
	phase,
	waited,
	finished,
	answering,
	strip,
	pointing,
	draft,
	onDraft,
	attached,
	onAttach,
	model,
	limit,
	context,
	running,
	onSend,
	onQueue,
	onStop,
	onAnswer,
	onSwitch,
	onNewThread,
	login,
	preferred,
}: {
	thread: string;
	ready: boolean;
	request: string | undefined;
	permissions: PermissionDeck | undefined;
	menu: "models" | "permissions" | null;
	onMenu: (menu: "models" | "permissions" | null) => void;
	phase: TurnPhase;
	/** how long the request now out has been silent, which is all the stroke reads (#231) */
	waited: number;
	/**
	 * This thread's agent session is gone, so the next thing said starts a new one (#120).
	 *
	 * It is a hint rather than a refusal. The transcript is intact and worth reading, the
	 * words are not thrown away, and what the press will actually do is said out loud
	 * instead of a resume being offered that would fail.
	 */
	finished: boolean;
	/**
	 * The request Enter would answer, or null while Enter means what it always meant.
	 *
	 * A turn held at a question takes the press as the answer rather than as a new
	 * turn, and the tool prefers it that way: it tests a typed sentence before the
	 * picked options and tells the agent to read it carefully, because the person may
	 * ask for something else entirely. An option list was never the only way to answer.
	 */
	answering: string | null;
	strip: Strip;
	pointing: Pointing;
	/** controlled, because a take-back and a stop both write into the field (#170) */
	draft: string;
	onDraft: (text: string) => void;
	/**
	 * The reference riding with the words, which is bytes and never a path (#119).
	 *
	 * Controlled for the field's own reason: a message the queue held carries one, and
	 * taking it back has to put it where it came from rather than dropping it silently.
	 */
	attached: readonly Attachment[];
	onAttach: (update: (held: readonly Attachment[]) => readonly Attachment[]) => Promise<void>;
	model: AgentModelDeck;
	limit: AgentLimit | null;
	/** how full the window was after the last request, as a share, or null before one said */
	context: number | null;
	/** whether a turn is in flight at the instant of the press, off the turn itself (#234) */
	running: () => boolean;
	/** both of them say whether the words were taken, and the field empties on a yes (#234) */
	onSend: (text: string, sent: AgentSent) => boolean;
	onQueue: (text: string, sent: AgentSent) => boolean;
	onStop: () => void;
	onAnswer: (request: string, reply: AgentReply) => void;
	/** another agent was picked in the menu: in this chat while it is empty, or a new one; resolves once saved */
	onSwitch: (engine: AgentEngineId, fresh: boolean) => Promise<boolean>;
	onNewThread: () => void;
	/** whether this chat's agent is signed in, for the menu's group of it */
	login: LoginDeck;
	/** the machine's usual agent, which the model trigger names only another of (#364) */
	preferred: AgentEngineId | null | undefined;
}) {
	const [ringOpen, setRingOpen] = useState(false);
	const currentThread = useRef(thread);
	currentThread.current = thread;
	const field = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (!request) return;
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	}, [request]);
	const reading = useRef(0);
	const reads = useRef(Promise.resolve());
	const attachFiles = (files: readonly File[]) => {
		reading.current += 1;
		// Serial completion preserves paste order when a larger file reads last.
		reads.current = reads.current
			.then(async () => {
				try {
					const attached = await Promise.all(files.map(readAttachment));
					await onAttach((held) => [...held, ...attached]);
				} finally {
					reading.current -= 1;
				}
			})
			.catch(() => {});
	};
	/*
	 * A stop is offered against every turn that is still a process (#165, #180, #234).
	 *
	 * Parked included. A turn held at a question is spending nothing and moving nowhere,
	 * which is why the stroke stops there — but it is a live process standing in the repo
	 * with a queue behind it, and the question's own dismiss answers the question rather
	 * than ending the turn. The Stop button ends the turn and hands the queue back.
	 */
	const cutting = phase === "playing" || phase === "asking";

	const resize = (element: HTMLTextAreaElement) => {
		element.style.height = "auto";
		element.style.height = `${Math.max(MIN_H, Math.min(element.scrollHeight, MAX_H))}px`;
	};

	// words handed back arrive from outside the field, so it has to re-fit to them the
	// way it does to typing (#170)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the text is what decides the height — the box is measured through the ref
	useEffect(() => {
		const element = field.current;
		if (element !== null) resize(element);
	}, [draft]);

	const take = async (text: string) => {
		if (reading.current > 0) return false;
		// captured here rather than read later: the chips that were up are the bytes
		// that went out, and the line under the words has to say so afterwards. For a
		// message the queue holds that is the whole contract, because it fires against a
		// canvas the hands have moved on from
		const sent: AgentSent = { context: contextOf(strip), attached, selection: pointing.entries };
		/*
		 * Asked of the turn itself rather than of the last render (#234).
		 *
		 * A press lands between a stream closing and React drawing that, and in that window
		 * the rendered phase still says a turn is running while the queue has already fired:
		 * a message taken then was held for a turn that had ended, behind everything that had
		 * just gone out. The turn knows which it is at the instant of the press, and this asks
		 * it. A turn parked on a question still holds the press, because a parked turn is a
		 * live process — only a question with somewhere for words to go answers instead, and
		 * that is decided above.
		 */
		const took = running() ? onQueue(text, sent) : onSend(text, sent);
		// the field is emptied by something having taken the words and never by the press
		// alone (#234): a rail whose threads are still arriving has nowhere to put them, and
		// a box cleared over that is a sentence gone with no way back to it
		if (!took) return false;
		onDraft("");
		onAttach(() => []);
		return true;
	};

	const submit = (box: HTMLTextAreaElement | null) => {
		const text = draft.trim();
		if (text === "") return;
		// answering answers, busy queues, otherwise sends — the three meanings of
		// one press, resolved by what the turn is doing (#170)
		if (answering !== null) {
			onDraft("");
			if (box !== null) box.style.height = `${MIN_H}px`;
			onAnswer(answering, { kind: "said", text });
			return;
		}
		void take(text).then((took) => {
			if (took && box !== null) box.style.height = `${MIN_H}px`;
		});
	};
	const says = fieldSays(answering, finished, cutting);
	const file = useRef<HTMLInputElement>(null);
	const showRing = context !== null && context >= CONTEXT_SHOWN_AT;
	// what each control in the footer last drew, so one on its way out still draws it
	const ringAt = useHeld(showRing ? context : null);
	const engine = useHeld(ready ? model.engine : null);
	const modes = useHeld(permissions);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target is not a control, and its keyboard path is the paste the field already takes
		<div
			className="relative flex shrink-0 flex-col gap-2 px-3.5 pb-3.5"
			onDragOver={(event) => {
				// `items` rather than `files`: while a drag is in flight the data store is in
				// protected mode and `files` is empty, so a guard that read it would never
				// accept the drag and the browser would navigate to the dropped picture
				if (!draggingAttachment(event.dataTransfer)) return;
				event.preventDefault();
				event.stopPropagation();
			}}
			onDrop={(event) => {
				const files = attachmentsIn(event.dataTransfer);
				if (files.length === 0) return;
				event.preventDefault();
				event.stopPropagation();
				attachFiles(files);
			}}
		>
			{permissions?.reason ? (
				<p role="status" className="px-1 text-muted type-caption">
					{permissions.reason}
				</p>
			) : null}
			{/* the box's own frame, which the floats over it are placed against: the box is
			    not positioned itself, so a menu rising off its foot can stand outside it */}
			<div className="relative">
				{/* the stroke runs along the box's top hairline, inside its rounded corners */}
				<span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-px block">
					<WindStroke phase={phase} waited={waited} />
				</span>
				<div
					data-agent-composer=""
					className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-bg px-3 pt-3 pb-2 transition-colors duration-150 focus-within:border-muted/45"
				>
					{attached.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{attached.map((image, index) => (
								<Attached
									key={referenceKey(image)}
									attached={image}
									onDrop={() => onAttach((held) => held.filter((_, at) => at !== index))}
								/>
							))}
						</div>
					)}
					<SelectionStrip strip={strip} pointing={pointing} />
					{/*
					 * What the field is for, and what the press will do with it.
					 *
					 * #200's word about a thread whose session has aged out lives here: "this starts
					 * a new chat" is a fact about the words being typed rather than about which
					 * machine is answering. While a turn runs it asks for what comes next, because
					 * Enter then queues (#364).
					 */}
					<textarea
						ref={field}
						value={draft}
						rows={2}
						spellCheck={false}
						placeholder={says}
						aria-label={says}
						onChange={(event) => {
							onDraft(event.target.value);
							resize(event.target);
						}}
						onPaste={(event) => {
							// a screenshot in the clipboard is the commonest reference there is, and
							// pasting one is how it gets here: a browser never reveals a path, so
							// there is nothing else a paste could mean
							const files = attachmentsIn(event.clipboardData);
							if (files.length === 0) return;
							event.preventDefault();
							attachFiles(files);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter" || event.shiftKey) return;
							event.preventDefault();
							submit(event.currentTarget);
						}}
						className="w-full resize-none bg-transparent text-text outline-none placeholder:text-muted type-body"
						style={{ height: MIN_H }}
					/>
					{/* the foot: small grey controls, who answers and what it may do on the left,
					    how full the window is and the send on the right (#364) */}
					<div className="-mx-1 flex h-7 min-w-0 items-center justify-between gap-2">
						<div data-agent-foot="start" className="flex min-w-0 flex-1 items-center gap-0.5">
							<button
								type="button"
								aria-label="Attach an image"
								title="Attach an image"
								onClick={() => file.current?.click()}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
							>
								<ClipIcon />
							</button>
							<input
								ref={file}
								type="file"
								accept={[...ATTACHMENT_MEDIA].join(",")}
								multiple
								hidden
								onChange={(event) => {
									const files = [...(event.currentTarget.files ?? [])].filter((one) =>
										isSendableAttachment(one),
									);
									event.currentTarget.value = "";
									if (files.length > 0) attachFiles(files);
								}}
							/>
							{engine === null ? null : (
								<Fade inline open={ready && model.engine !== undefined} className="flex min-w-0">
									<AgentMenu
										project={model.project ?? ""}
										engine={engine}
										model={model}
										preferred={preferred}
										started={model.started === true}
										limit={limit}
										login={login}
										open={menu === "models"}
										onOpen={(next) => onMenu(next ? "models" : null)}
										onSwitch={onSwitch}
									/>
								</Fade>
							)}
							{modes === null ? null : (
								<Fade inline open={permissions !== undefined} className="flex shrink-0">
									<PermissionMenu
										permissions={modes}
										open={menu === "permissions"}
										onOpen={(next) => onMenu(next ? "permissions" : null)}
									/>
								</Fade>
							)}
						</div>
						<div data-agent-foot="end" className="flex shrink-0 items-center gap-1.5">
							{ringAt === null ? null : (
								<Fade inline open={showRing} className="flex">
									<ContextRing
										used={ringAt}
										open={ringOpen && showRing}
										onOpen={setRingOpen}
										onNewThread={onNewThread}
									/>
								</Fade>
							)}
							{/* Send and Stop trade places in one cell, the one going out over the one coming in */}
							<span className="relative flex h-7 w-7 shrink-0">
								<Fade inline open={cutting} className="absolute inset-0 flex">
									<StopButton onStop={onStop} />
								</Fade>
								<Fade inline open={!cutting} className="absolute inset-0 flex">
									<button
										type="button"
										aria-label="Send"
										data-agent-send=""
										disabled={draft.trim() === ""}
										onClick={() => submit(field.current)}
										className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-text text-bg transition-opacity duration-150 hover:opacity-90 disabled:bg-raised disabled:text-muted"
									>
										<SendIcon />
									</button>
								</Fade>
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/** past this share of the window the ring shows; under it there is nothing to act on (#364) */
export const CONTEXT_SHOWN_AT = 0.6;

/**
 * How full the context window is, as a ring with the used share filled in as a wedge, so it
 * reads as an amount and never as the turning working ring (#364). It shows only past
 * 60%, and pressed it says how full and the one thing to do about it.
 */
function ContextRing({
	used,
	open,
	onOpen,
	onNewThread,
}: {
	used: number;
	open: boolean;
	onOpen: (open: boolean) => void;
	onNewThread: () => void;
}) {
	const share = Math.min(1, Math.max(0, used));
	const said = `${Math.round(share * 100)}% of context used.`;
	const turn = share * 2 * Math.PI;
	const r = 3.5;
	const x = 7 + r * Math.sin(turn);
	const y = 7 - r * Math.cos(turn);
	const wedge =
		share >= 0.999
			? `M7 ${7 - r}A${r} ${r} 0 1 1 6.99 ${7 - r}Z`
			: `M7 7V${7 - r}A${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`;
	return (
		<span className="flex">
			<RailMenu
				open={open}
				onOpen={onOpen}
				role="dialog"
				label="Context"
				className="absolute right-0 bottom-full z-30 mb-2 w-[288px] max-w-full"
				panel={{ "data-agent-context-note": "" }}
				trigger={(props) => (
					<button
						type="button"
						{...props}
						aria-label={said}
						title={said}
						data-agent-context-ring={Math.round(share * 100)}
						className="relative z-30 flex h-7 w-7 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text aria-expanded:bg-surface aria-expanded:text-text"
					>
						<svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true">
							<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.25" />
							<path d={wedge} fill="currentColor" />
						</svg>
					</button>
				)}
			>
				<div className="flex flex-row items-center gap-4 py-3 pr-3 pl-4">
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-text type-control tabular-nums">{said}</span>
						<span className="text-muted type-label">A new chat starts fresh.</span>
					</span>
					<button
						type="button"
						onClick={() => {
							onOpen(false);
							onNewThread();
						}}
						className="h-7 shrink-0 rounded-sm border border-border px-2.5 text-text transition-colors duration-150 hover:bg-raised type-control"
					>
						New chat
					</button>
				</div>
			</RailMenu>
		</span>
	);
}

/** a paperclip on the 16 grid: attach */
function ClipIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
			<path
				d="m12.75 7.5-4.9 4.9a3 3 0 0 1-4.25-4.25l5.3-5.3a2 2 0 0 1 2.83 2.83L6.5 10.9a1 1 0 0 1-1.41-1.41l4.6-4.6"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** an arrow up: send */
function SendIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
			<path
				d="M8 12.5v-9M4 7.5l4-4 4 4"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/**
 * The way out of a turn that is already running (#165): Send becomes Stop for as long as
 * the turn is a process (#364). Stopping requires this button; Escape only dismisses or
 * leaves UI surfaces.
 */
function StopButton({ onStop }: { onStop: () => void }) {
	return (
		<button
			type="button"
			aria-label="Stop"
			data-agent-stop=""
			onClick={onStop}
			className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-text transition-opacity duration-150 hover:opacity-90"
		>
			<span className="h-2 w-2 rounded-[1.5px] bg-bg" />
		</button>
	);
}

/* ---------- the reference that rides along (#119) ----------
 * Look-only, and nothing lands. The bytes go down the same stdin the prompt does,
 * so the project gains no file, no inbox and no deleter — the agent's own
 * transcript is the durable copy, outside the repo. The cost is stated rather than
 * hidden: a browser never reveals a dropped file's path, so a logo cannot be added
 * to the project this way, and adding an asset is already a deliberate import into
 * `design/shared/assets/`.
 *
 * It arrives by paste, by drop, or by the attach button at the head of the foot (#364),
 * which opens the file picker on the same image types. */

/** how wide the tile is: enough to recognise a screenshot, not enough to read it */
const ATTACHED_W = 44;

/**
 * The tile has two things to do, so it has two targets.
 *
 * The picture is the press, because at this size it can be recognised and not checked,
 * and checking it is what a reference is for: it goes up over the rail in the same
 * overlay a tool call's screenshot goes up in. Taking the reference back is the ✕ in
 * the corner, the smaller target, because it is the rarer intent and the only one of
 * the two that cannot be undone.
 *
 * The ✕ is on hover, in the vocabulary the ✕ on a thread and on a chip already uses.
 * It carries a plate the chip's does not, because it sits on a picture rather than on
 * a surface, and an unbacked glyph over arbitrary pixels is not always there.
 */
const referenceKeys = new WeakMap<Attachment, string>();
function referenceKey(image: Attachment): string {
	let key = referenceKeys.get(image);
	if (!key) {
		key = crypto.randomUUID();
		referenceKeys.set(image, key);
	}
	return key;
}

function Attached({ attached, onDrop }: { attached: Attachment; onDrop: () => void }) {
	const [big, setBig] = useState(false);
	// held across renders for the reason `Shot` holds its own: the rail re-projects on
	// a clock and the string is the size of the picture, now read in two places
	const src = useMemo(() => `data:${attached.media};base64,${attached.data}`, [attached.media, attached.data]);
	return (
		<>
			<span
				data-agent-attached=""
				className="group relative flex w-fit shrink-0 overflow-hidden rounded-xs border border-border-raised bg-bg"
				style={{ width: ATTACHED_W, height: ATTACHED_W }}
			>
				{/* the picture is its own label: `image/png` is a fact about a file and this is a
				    thing you can see */}
				<button type="button" onClick={() => setBig(true)} className="flex h-full w-full cursor-zoom-in">
					<img src={src} alt="attached reference" className="h-full w-full object-cover" />
				</button>
				<button
					type="button"
					onClick={onDrop}
					aria-label="drop the attached image"
					className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-xs bg-bg/0 text-muted/0 transition-colors duration-150 hover:text-text group-hover:bg-bg/70 group-hover:text-muted/70"
				>
					<CloseIcon />
				</button>
			</span>
			{/* beside the tile rather than inside it: the tile clips to 44px, and a picture held
			    over the whole rail cannot hang off something that small.
			    No caption, because a browser never reveals a dropped file's path and there is
			    nothing else to say that the picture is not already saying */}
			<Lightbox open={big} onClose={() => setBig(false)} caption={null}>
				<img src={src} alt="attached reference" className="block max-h-full max-w-full" />
			</Lightbox>
		</>
	);
}

/**
 * Whether a drag in flight is carrying something that could ride along.
 *
 * A dragging browser keeps its data store in protected mode, so `files` is empty
 * until the drop and only each item's `kind` and `type` can be read — which is
 * exactly enough, and reading `files` here would refuse every drag.
 */
function draggingAttachment(data: DataTransfer | null): boolean {
	return Array.from(data?.items ?? []).some((item) => item.kind === "file" && ATTACHMENT_MEDIA.has(item.type));
}

/**
 * The picture in a drop or a paste, if it is one spool can send.
 *
 * The composer refuses exactly what the daemon refuses (`src/attachment.ts`), so a
 * tile never draws for something the turn would be turned away for: nothing appearing
 * is a smaller cost than a prompt lost to a refusal after Enter.
 */
function attachmentsIn(data: DataTransfer | null): File[] {
	return Array.from(data?.files ?? []).filter((file) => isSendableAttachment(file));
}

/** The browser reads and encodes image bytes asynchronously. */
function readAttachment(file: File): Promise<Attachment> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== "string") return reject(new Error("Could not read the image"));
			resolve({ media: file.type, data: reader.result.slice(reader.result.indexOf(",") + 1) });
		};
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject(new Error("Image read was cancelled"));
		reader.readAsDataURL(file);
	});
}

/* ---------- what the hands are pointing at ----------
 * The selection sits in the composer and goes out with the message without being
 * asked for. Its accent is the one the entry wears out on the canvas, because the
 * chip and the outline are one object — which is why hovering either lights the
 * other, and why a chip that cannot be paired with a box out there is a chip that
 * should not be drawn.
 *
 * One line, always. Either the chips fit on it or the strip is a count; the composer
 * never grows downward to make room for context, because the space below is the
 * prompt's. Opening the count is the human asking for the list, and then it is a
 * list: hoverable, individually droppable, eight rows before it scrolls inside
 * itself and no bar when it does. */

/** rows the open list shows before it starts scrolling under a fade */
const ROWS_SHOWN = 8;

function SelectionStrip({ strip, pointing }: { strip: Strip; pointing: Pointing }) {
	const [open, setOpen] = useState(false);
	if (strip.kind === "none") return null;

	// no wrap: the strip is chips because they fit on one line, and a second line
	// would be the rule breaking quietly rather than the count taking over. If the
	// estimate is off by a few pixels a chip truncates instead
	if (strip.kind === "chips") {
		return (
			<span data-agent-chips="" className="flex min-w-0 items-center gap-1.5">
				{strip.chips.map((chip) => (
					<Chip
						key={chip.id}
						words={chip}
						lit={pointing.lit === chip.id}
						onLight={pointing.onLight}
						// the entered frame is the one chip whose ✕ has nowhere to land:
						// removal mirrors the canvas, and out there the only way to stop
						// pointing at the frame you are inside is to leave it (#139)
						onDrop={strip.inside ? undefined : () => pointing.onDrop(chip.id)}
					/>
				))}
			</span>
		);
	}

	return (
		<span data-agent-chips="" className="flex min-w-0 flex-col gap-1.5">
			<span className="flex min-w-0 items-center">
				{/* the whole list rather than an entry's own id: the cursor on a count lights
				    every box the count stands for */}
				<Chip
					words={{ id: WHOLE_SELECTION, label: strip.label }}
					lit={pointing.lit !== null}
					open={open}
					onOpen={() => setOpen(!open)}
					onLight={pointing.onLight}
					// the count's own ✕ drops the whole selection, which is the one act the
					// canvas cannot do for you while you are standing inside a frame
					onDrop={() => pointing.onDrop(null)}
				/>
			</span>
			{open ? (
				/* Eight rows and then it scrolls, and it scrolls without a bar: the list is
				   for reaching one member, never for reading forty, and a native scrollbar in
				   a 420 rail is a grey slab across the only accent on screen. The fade says
				   there is more the way the transcript's does. */
				<span className="relative flex flex-col">
					<span className="flex max-h-[208px] flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{strip.chips.map((chip) => (
							<button
								key={chip.id}
								type="button"
								data-agent-chip-row={chip.label}
								onMouseEnter={() => pointing.onLight(chip.id)}
								onMouseLeave={() => pointing.onLight(null)}
								onClick={() => pointing.onDrop(chip.id)}
								className={cn(
									"group flex h-[26px] shrink-0 items-center gap-2 rounded-xs px-1 text-left",
									pointing.lit === chip.id && "bg-surface",
								)}
							>
								<span
									className={cn(
										"h-2.5 w-[2px] shrink-0 rounded-full",
										pointing.lit === chip.id ? "bg-thread" : "bg-thread/40",
									)}
								/>
								<span className="min-w-0 flex-1 truncate text-text type-value">{chip.label}</span>
								<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/0 group-hover:text-muted">
									<CloseIcon />
								</span>
							</button>
						))}
					</span>
					{strip.chips.length > ROWS_SHOWN ? (
						<span className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-surface to-transparent" />
					) : null}
				</span>
			) : null}
		</span>
	);
}

function Chip({
	words,
	lit,
	open,
	onOpen,
	onLight,
	onDrop,
}: {
	words: ChipWords;
	lit: boolean;
	open?: boolean;
	onOpen?: () => void;
	onLight: (id: string | null) => void;
	/** absent when there is nothing a ✕ could do — then the chip has no ✕ at all */
	onDrop?: (() => void) | undefined;
}) {
	const body = (
		<>
			<span className={cn("h-3 w-[2px] shrink-0 rounded-full", lit ? "bg-thread" : "bg-thread/55")} />
			<span className="min-w-0 truncate text-text type-value">{words.label}</span>
			{onOpen === undefined ? null : (
				<ChevronIcon open={open ?? false} className="h-2.5 w-2.5 shrink-0 text-muted/40" />
			)}
		</>
	);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the cursor lighting the box out on the canvas is a hover reading, and its own controls are buttons
		<span
			data-agent-chip={words.label}
			className={cn(
				"flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border bg-raised pl-2 transition-colors duration-150",
				// the ✕'s own padding goes with it, or the chip keeps a gap it no longer uses
				onDrop === undefined ? "pr-2.5" : "pr-1",
				lit ? "border-thread/45" : "border-border-raised",
			)}
			onMouseEnter={() => onLight(words.id)}
			onMouseLeave={() => onLight(null)}
		>
			{onOpen === undefined ? (
				body
			) : (
				<button
					type="button"
					onClick={onOpen}
					aria-expanded={open ?? false}
					className="flex min-w-0 items-center gap-2 text-left"
				>
					{body}
				</button>
			)}
			{onDrop === undefined ? null : (
				<button
					type="button"
					onClick={onDrop}
					aria-label={`drop ${words.label}`}
					className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<CloseIcon />
				</button>
			)}
		</span>
	);
}
