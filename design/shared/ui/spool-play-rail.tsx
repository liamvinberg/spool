import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { PlayEntry, RowState, TurnPhase } from "../lib/turn-play";
import { RailTabs } from "./spool-canvas-chrome";
import { ChevronIcon, CloseIcon } from "./spool-icons";

/**
 * The agent rail, reduced to what a turn actually is.
 *
 * Three things render and nothing else: the human's words, the agent's words,
 * and a one-line row per tool call. A row is a mark, a verb and a subject, and
 * the verb and subject are spool's nouns rather than the filesystem's — `shot
 * home`, not `Bash(spool shot home 2>&1 | tail -20)`. The real path, the input
 * and the result live behind a disclosure that is shut by default and that nobody
 * has to open; a row with nothing worth opening is not a disclosure at all.
 *
 * Thinking gets one quiet line. `thinking_delta` carries an empty string and a
 * token estimate, so there is nothing to read and nothing to draw — a duration
 * is the honest whole of it.
 *
 * State is motion, not colour. A row is running while a colourless ring turns
 * and done once a check has drawn itself through it. The accent is reserved for
 * the selection, which is the one thing on screen the human owns.
 *
 * The vocabulary itself lives in lib/turn-play, because the projection off a real
 * capture and this rail have to agree on it.
 */

/* ---------- motion ----------
 * One easing for everything that arrives, one for everything that retires, and
 * a spin slow enough to read as work rather than as an alarm. */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
const RETIRE = [0.4, 0, 1, 1] as const;
const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

const MARK_W = 14;
const INDENT = MARK_W + 10;

/* ---------- the mark ----------
 * The most repeated moment in the interface is a row going from running to
 * done, so it is one gesture rather than two pictures: the ring keeps turning
 * as it shrinks away, and the check strokes through the space it is leaving.
 * The overlap is what makes it read as the same object settling.
 *
 * A plan's tasks need a third state the work rows never do: written down and not
 * started. That is the same ring with the arc taken off it and nothing turning,
 * so a checklist at rest has no motion in it at all. */

export function StateMark({ state, className }: { state: RowState; className?: string | undefined }) {
	const still = useReducedMotion() === true;
	const done = state === "done";
	const running = state === "running";
	return (
		<span className={cn("relative flex h-3.5 w-3.5 shrink-0", className)}>
			<motion.span
				className="absolute inset-0"
				initial={false}
				animate={{ opacity: done ? 0 : 1, scale: done ? 0.62 : 1 }}
				transition={still ? { duration: 0 } : { duration: 0.22, ease: RETIRE }}
			>
				<motion.svg
					viewBox="0 0 14 14"
					className={cn("h-full w-full", running ? "text-text/60" : "text-text/35")}
					fill="none"
					aria-hidden="true"
					animate={still || !running ? undefined : { rotate: 360 }}
					transition={still || !running ? undefined : SPIN}
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					{running ? (
						<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					) : null}
				</motion.svg>
			</motion.span>
			<motion.svg
				viewBox="0 0 14 14"
				className="absolute inset-0 h-full w-full text-muted"
				fill="none"
				aria-hidden="true"
				initial={false}
				animate={{ scale: done ? 1 : 0.86 }}
				transition={still ? { duration: 0 } : { duration: 0.34, delay: 0.06, ease: ARRIVE }}
			>
				<motion.path
					d="m3.4 7.2 2.4 2.4 4.8-5.2"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={false}
					animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
					transition={
						still
							? { duration: 0 }
							: {
									pathLength: { duration: 0.28, delay: 0.07, ease: ARRIVE },
									opacity: { duration: 0.1, delay: 0.07 },
								}
					}
				/>
			</motion.svg>
		</span>
	);
}

/** a text caret blinks square, never fades */
function Caret() {
	const still = useReducedMotion() === true;
	return (
		<motion.span
			className="ml-[3px] inline-block h-[12px] w-[2px] translate-y-[1px] rounded-[1px] bg-text/70 align-baseline"
			animate={still ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
			transition={
				still
					? undefined
					: { duration: 1.06, times: [0, 0.49, 0.5, 1], repeat: Number.POSITIVE_INFINITY, ease: "linear" }
			}
		/>
	);
}

/* ---------- the rail ---------- */

export function PlayRail({
	entries,
	phase,
	chip,
	run,
	onSend,
	onReplay,
}: {
	entries: readonly PlayEntry[];
	phase: TurnPhase;
	/** the selection riding in the composer, when there is one */
	chip?: string | undefined;
	run: number;
	onSend: (text: string) => void;
	onReplay: () => void;
}) {
	const field = useRef<HTMLTextAreaElement>(null);
	const reach = (event: { target: EventTarget | null }) => {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest("button, textarea") !== null) return;
		field.current?.focus();
	};
	return (
		<>
			<RailTabs tabs={["agent", "connections"]} active="agent" />
			<Transcript entries={entries} run={run} onReach={reach} />
			<Composer field={field} chip={chip} phase={phase} onSend={onSend} onReplay={onReplay} onReach={reach} />
		</>
	);
}

/* ---------- the transcript ----------
 * Bottom-anchored, so a turn grows up off the top the way a scrolled log does
 * and the live end never moves. Every entry arrives inside a box that opens to
 * its own height, which means the rows above it glide rather than jump: the
 * shift is real layout, not an animation chasing one. */

function Transcript({
	entries,
	run,
	onReach,
}: {
	entries: readonly PlayEntry[];
	run: number;
	onReach: (event: { target: EventTarget | null }) => void;
}) {
	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" onMouseDown={onReach}>
			<div key={run} className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3.5 pt-6 pb-4">
				{entries.map((entry, index) => (
					<Arrive key={entry.key} gap={gapBefore(entries[index - 1], entry)}>
						<Entry entry={entry} />
					</Arrive>
				))}
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
		</div>
	);
}

/** consecutive machine work reads as one run, so it sits tighter than a turn boundary */
function gapBefore(previous: PlayEntry | undefined, entry: PlayEntry): number {
	if (previous === undefined) return 0;
	if (previous.kind === "line" && entry.kind === "line") return 6;
	return 14;
}

function Arrive({ gap, children }: { gap: number; children: ReactNode }) {
	const still = useReducedMotion() === true;
	return (
		<motion.div
			className="shrink-0 overflow-hidden"
			initial={still ? false : { height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
			transition={
				still
					? { duration: 0 }
					: { height: { duration: 0.28, ease: ARRIVE }, opacity: { duration: 0.2, ease: "linear" } }
			}
		>
			<motion.div
				style={{ paddingTop: gap }}
				initial={still ? false : { y: 6 }}
				animate={{ y: 0 }}
				transition={still ? { duration: 0 } : { duration: 0.34, ease: ARRIVE }}
			>
				{children}
			</motion.div>
		</motion.div>
	);
}

function Entry({ entry }: { entry: PlayEntry }) {
	if (entry.kind === "user") {
		return (
			<div className="relative flex flex-col gap-1.5 pl-3.5">
				<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
				<p className="whitespace-pre-wrap text-base text-text leading-base">{entry.text}</p>
				{entry.context === undefined ? null : (
					<span className="truncate font-mono text-2xs text-muted/55 leading-3">{entry.context}</span>
				)}
			</div>
		);
	}
	if (entry.kind === "prose") {
		// the full sentence holds the block's height from the first word, so the
		// stream never shoves the rows above it a line at a time
		const streaming = entry.shown.length < entry.full.length;
		return (
			<p className="relative text-base text-text/90 leading-base">
				<span className="invisible" aria-hidden="true">
					{entry.full}
				</span>
				<span className="absolute inset-0">
					{entry.shown}
					{streaming ? <Caret /> : null}
				</span>
			</p>
		);
	}
	return <Line entry={entry} />;
}

/* ---------- one line ----------
 * mark, verb, subject. The subject can land a beat after the verb because that
 * is how it arrives on the wire: the tool block opens with a name and an empty
 * input, and its argument streams in behind. */

function Line({ entry }: { entry: Extract<PlayEntry, { kind: "line" }> }) {
	const still = useReducedMotion() === true;
	const [clicked, setClicked] = useState<boolean | undefined>(undefined);
	const expandable = entry.detail !== undefined || entry.children !== undefined || entry.shot !== undefined;
	const open = expandable && (clicked ?? entry.open ?? false);

	const body = (
		<>
			<StateMark state={entry.state} />
			<span className="flex min-w-0 items-baseline gap-1.5">
				<span
					className={cn(
						"shrink-0 font-mono text-sm leading-4",
						entry.quiet === true ? "text-muted/70" : "text-muted",
					)}
				>
					{entry.verb}
				</span>
				{entry.subject === undefined ? null : (
					<motion.span
						className={cn(
							"min-w-0 truncate font-mono text-sm leading-4",
							entry.quiet === true ? "text-muted/60 tabular-nums" : "text-text/85",
						)}
						initial={still ? false : { opacity: 0, x: -3 }}
						animate={{ opacity: 1, x: 0 }}
						transition={still ? { duration: 0 } : { duration: 0.3, ease: ARRIVE }}
					>
						{entry.subject}
					</motion.span>
				)}
			</span>
			{/* the affordance stays with the phrase it opens, not out at the rail edge */}
			{expandable ? <ChevronIcon open={open} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" /> : null}
		</>
	);

	const row = "-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 text-left";
	return (
		<div className="flex flex-col">
			{expandable ? (
				<button type="button" onClick={() => setClicked(!open)} className={cn(row, "hover:bg-surface")}>
					{body}
				</button>
			) : (
				<div className={row}>{body}</div>
			)}
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={still ? { duration: 0 } : { duration: 0.24, ease: ARRIVE }}
					>
						<div className="pt-0.5 pb-1" style={{ paddingLeft: INDENT }}>
							{entry.shot !== undefined ? (
								<Picture path={entry.shot.path} media={entry.shot.media} />
							) : entry.children === undefined ? (
								<span className="block truncate font-mono text-2xs text-muted/55 leading-4">
									{entry.detail}
								</span>
							) : (
								<div className="relative flex flex-col">
									<span className="absolute top-1 bottom-2 left-0 w-px bg-border-raised" />
									{/* a task appends when its TaskCreate fires, so each one arrives on its
									    own the way a row does — the list writing itself rather than a block
									    of them appearing at once */}
									{entry.children.map((child) => (
										<Arrive key={child.id} gap={0}>
											<span className="flex h-[22px] items-center gap-2 pl-2.5">
												<StateMark state={child.state} className="h-3 w-3" />
												<span className="truncate font-mono text-2xs text-muted leading-3">
													{child.name}
												</span>
											</span>
										</Arrive>
									))}
								</div>
							)}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/**
 * The agent read a picture back.
 *
 * `spool shot home` writes a PNG and the next thing the agent does is Read it, so
 * a tool_result comes back holding an image block instead of text. A log that says
 * `look home.png` and nothing else loses the only moment in a turn where the
 * agent is looking at its own work, so the disclosure holds the picture's place: a
 * frame-shaped well at the ratio spool shoots, and the path beside it. The well
 * stays empty because the capture elides the base64 payload — it is a place the
 * picture was, not a thumbnail pretending to be one.
 */
function Picture({ path, media }: { path: string; media: string }) {
	return (
		<span className="flex items-start gap-2.5 pt-0.5">
			<span className="h-[74px] w-[34px] shrink-0 rounded-xs border border-border-raised bg-surface" />
			<span className="flex min-w-0 flex-col gap-1 pt-px">
				<span className="truncate font-mono text-2xs text-muted/55 leading-4">{path}</span>
				<span className="font-mono text-2xs text-muted/35 leading-4">{media}</span>
			</span>
		</span>
	);
}

/* ---------- the composer ----------
 * A field, not a slot: three rows at rest, growing to eight before it scrolls
 * inside itself, with the selection chip in the same bounded box as the prompt
 * because chip and prompt go out as one message. Enter sends what is in it
 * verbatim, whatever that is. */

const MIN_H = 60;
const MAX_H = 160;

function Composer({
	field,
	chip,
	phase,
	onSend,
	onReplay,
	onReach,
}: {
	field: RefObject<HTMLTextAreaElement | null>;
	chip: string | undefined;
	phase: TurnPhase;
	onSend: (text: string) => void;
	onReplay: () => void;
	onReach: (event: { target: EventTarget | null }) => void;
}) {
	const [value, setValue] = useState("");
	const busy = phase === "playing";

	const fit = (element: HTMLTextAreaElement) => {
		element.style.height = "auto";
		element.style.height = `${Math.max(MIN_H, Math.min(element.scrollHeight, MAX_H))}px`;
	};

	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5" onMouseDown={onReach}>
			<div className="flex flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5 transition-colors duration-150 focus-within:border-muted/45">
				{chip === undefined ? null : <SelectionChip label={chip} />}
				<textarea
					ref={field}
					value={value}
					rows={3}
					spellCheck={false}
					placeholder="say what to change"
					aria-label="say what to change"
					onChange={(event) => {
						setValue(event.target.value);
						fit(event.target);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						const text = value.trim();
						if (text === "" || busy) return;
						setValue("");
						event.currentTarget.style.height = `${MIN_H}px`;
						onSend(text);
					}}
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: MIN_H }}
				/>
			</div>
			<div className="flex h-[18px] items-center justify-between">
				<span className="font-mono text-2xs text-muted/45 leading-3">{busy ? "" : "enter to send"}</span>
				{phase === "settled" ? (
					<button
						type="button"
						onClick={onReplay}
						className="font-mono text-2xs text-muted/45 leading-3 transition-colors duration-150 hover:text-muted"
					>
						replay
					</button>
				) : null}
			</div>
		</div>
	);
}

/**
 * The selection, sitting in the composer and going out with the message without
 * being asked for. Its accent is the same one the element wears out on the
 * canvas, because the chip and the outline are one object.
 */
function SelectionChip({ label }: { label: string }) {
	return (
		<span className="flex h-6 w-fit max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-1 pl-2">
			<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread" />
			<span className="min-w-0 truncate font-mono text-text/85 text-xs leading-4">{label}</span>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50">
				<CloseIcon className="h-2 w-2" />
			</span>
		</span>
	);
}
