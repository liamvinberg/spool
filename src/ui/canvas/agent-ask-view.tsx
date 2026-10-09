import { type ReactNode, useState } from "react";
import type { AgentReply } from "../../daemon/agent-control";
import { cn } from "../cn";
import { type AskQuestion, approvalWhat, foldedApproval } from "./agent-ask";
import { Caret } from "./agent-said";
import type { AgentEntry, AgentTile } from "./agent-transcript";

/**
 * An ask, where the turn already has an anchor for it (#366).
 *
 * The ask is not a new block in the chat: it hangs off the thing it concerns. A turn has
 * two anchors, its line and its grid of frames, so an approval and a question about no
 * frame open out of the line — the ring held, "Waiting on you" or the question itself,
 * and the ask under it on the line's own thread — and a question whose options name the
 * turn's frames turns the grid into the choice. A designer's ask hangs off its own tile.
 * An ask with nothing to hang from, in a turn with no line yet, stands as a card. Once
 * answered, every one of them folds to one quiet line where it was asked.
 *
 * Every word in it is the agent's own — its one-line reason, its question, its options and
 * their descriptions — and spool adds only its controls and the name of what an approval
 * would let through. `design/frames/explore/agent-rail/ask` is the source of truth.
 */

export type AskEntry = Extract<AgentEntry, { kind: "ask" }>;

/** nobody has answered it and it is still there to answer */
export const waitingAsk = (entry: AskEntry): boolean => entry.state === "open" || entry.state === "arriving";

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/**
 * Which of the turn's frames each option names, or null where the question is not about
 * them. An option names a frame when its label is the frame's name or its take — "Timeline"
 * is `home--timeline` — and a question is about the frames only when every option names a
 * different one: a question half about pictures is a list.
 */
export function optionFrames(question: AskQuestion, tiles: readonly AgentTile[]): string[] | null {
	if (question.options.length < 2 || tiles.length === 0) return null;
	const taken = new Set<string>();
	const named: string[] = [];
	for (const option of question.options) {
		const label = slug(option.label);
		if (label === "") return null;
		const leaf = (frame: string) => slug(frame.split("/").pop() ?? frame);
		const take = (frame: string) => leaf(frame).split("--").pop() ?? "";
		const match =
			tiles.find((tile) => !taken.has(tile.frame) && (leaf(tile.frame) === label || take(tile.frame) === label)) ??
			tiles.find((tile) => !taken.has(tile.frame) && leaf(tile.frame).endsWith(`-${label}`));
		if (match === undefined) return null;
		taken.add(match.frame);
		named.push(match.frame);
	}
	return named;
}

/**
 * Where one ask is in being answered: which of its questions is being asked, what has been
 * picked so far, and what is ticked on a question that takes several.
 *
 * Held against the request rather than reset by it: the block outlives no ask, but a key
 * reused by a second thread's ask would otherwise arrive part-answered.
 */
export function useAsk(entry: AskEntry, onAnswer: (request: string, reply: AgentReply) => void) {
	const request = entry.request;
	const [given, setGiven] = useState<{
		request: string | null;
		picks: Record<string, string>;
		ticked: readonly string[];
	}>({ request, picks: {}, ticked: [] });
	const mine = given.request === request;
	const picks = mine ? given.picks : {};
	const ticked = mine ? given.ticked : [];
	const live = entry.questions.findIndex((one) => picks[one.question] === undefined);
	const question = live === -1 ? null : (entry.questions[live] ?? null);
	const answer = (reply: AgentReply) => {
		if (request !== null) onAnswer(request, reply);
	};
	const settle = (asked: string, label: string) => {
		const next = { ...picks, [asked]: label };
		if (entry.questions.every((one) => next[one.question] !== undefined)) answer({ kind: "picked", picks: next });
		else setGiven({ request, picks: next, ticked: [] });
	};
	return {
		open: entry.state === "open" && request !== null,
		question,
		picks,
		ticked,
		answer,
		/** a single pick answers; a pick on a question that takes several ticks it */
		pick: (label: string) => {
			if (question === null) return;
			if (!question.multi) return settle(question.question, label);
			setGiven({
				request,
				picks,
				ticked: ticked.includes(label) ? ticked.filter((one) => one !== label) : [...ticked, label],
			});
		},
		/** the ticked ones, sent as the one answer the tool reads for a question that takes several */
		send: () => {
			if (question !== null && ticked.length > 0) settle(question.question, ticked.join(", "));
		},
		dismiss: () => answer({ kind: "deny" }),
	};
}

export type AskState = ReturnType<typeof useAsk>;

/** the ring held inside the waiting ring: only a person can move this */
export function WaitingMark({ className }: { className?: string | undefined }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			data-agent-waiting-mark=""
			className={cn("h-3.5 w-3.5 shrink-0 text-text", className)}
		>
			<circle className="animate-agent-breathe" cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.4" />
			<circle cx="6" cy="6" r="2.1" fill="currentColor" />
		</svg>
	);
}

/** the turn's line, opened into what it waits on */
export function WaitingRow({
	words,
	meta,
	arriving = false,
}: {
	words: ReactNode;
	meta?: string | undefined;
	arriving?: boolean;
}) {
	return (
		<div data-agent-status="waiting" className="-mx-1.5 flex min-h-[26px] items-center gap-2 px-1.5">
			<WaitingMark />
			<span className="min-w-0 flex-1 text-text type-control">
				{words}
				{arriving ? <Caret /> : null}
			</span>
			{meta === undefined ? null : <span className="shrink-0 tabular-nums text-muted type-detail">{meta}</span>}
			<svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0 rotate-90 text-muted" fill="none">
				<path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			</svg>
		</div>
	);
}

/** what the line opens into, on a thread from its ring */
export function Thread({ children, tight = false }: { children: ReactNode; tight?: boolean }) {
	return (
		<div
			className={cn(
				"ml-[6.25px] flex animate-agent-ring-open flex-col border-border-raised border-l-[1.5px] py-1",
				tight ? "gap-2 pl-[6.75px]" : "gap-3 pl-[12.75px]",
			)}
		>
			{children}
		</div>
	);
}

/** what an approval would let through, behind a quiet disclosure */
function Disclosure({ label, detail }: { label: string; detail: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex flex-col">
			<button
				type="button"
				aria-expanded={open}
				data-agent-ask-detail={open ? "open" : "shut"}
				onClick={() => setOpen((was) => !was)}
				className="-mx-1 flex w-fit items-center gap-1 rounded-xs px-1 text-muted transition-colors duration-150 hover:text-text type-detail"
			>
				{label}
				<svg
					viewBox="0 0 12 12"
					aria-hidden="true"
					className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-90")}
					fill="none"
				>
					<path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
				</svg>
			</button>
			<div
				aria-hidden={!open}
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-150",
					open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<code className="block break-words pt-1 font-mono text-text text-xs leading-4">{detail}</code>
				</div>
			</div>
		</div>
	);
}

/** a button of the same weight as its neighbours: no answer to an ask is the default */
export function AskButton({
	label,
	option,
	title,
	disabled = false,
	quiet = false,
	onPress,
}: {
	label: string;
	/** the answer it gives, which is what a test or a reader finds it by */
	option?: string;
	title?: string;
	disabled?: boolean;
	quiet?: boolean;
	onPress: () => void;
}) {
	return (
		<button
			type="button"
			data-agent-option={option}
			title={title}
			disabled={disabled}
			onClick={onPress}
			className={cn(
				"h-7 shrink-0 rounded-sm px-2.5 transition-colors duration-150 type-control disabled:opacity-45",
				quiet
					? "text-muted hover:bg-control hover:text-text"
					: "border border-border-raised text-text hover:bg-control",
			)}
		>
			{label}
		</button>
	);
}

/** the agent's reason, what it would let through, and Allow, Allow for this chat, Deny */
export function ApprovalBody({
	entry,
	ask,
	permissions,
}: {
	entry: AskEntry;
	ask: AskState;
	permissions?: (() => void) | undefined;
}) {
	const detail = entry.detail ?? entry.access?.command ?? entry.access?.path ?? null;
	const what = approvalWhat(entry.tool ?? null, detail);
	const always =
		entry.access === undefined
			? "The same again, for the rest of this chat"
			: `${entry.access.kind === "command" ? "Commands" : "Edits"} in ${entry.access.scope} for the rest of this chat`;
	return (
		<>
			{entry.access?.unavailable ? (
				<p className="text-text type-body">spool can’t restrict commands to design/ on this computer.</p>
			) : null}
			<div className="flex flex-col gap-1">
				{entry.asked === null ? null : <p className="text-pretty text-text type-body">{entry.asked}</p>}
				{detail === null ? (
					entry.asked === null ? (
						<p className="text-muted type-detail">{what}</p>
					) : null
				) : (
					<Disclosure label={what} detail={detail} />
				)}
			</div>
			{ask.open ? (
				<div className="flex flex-wrap gap-1.5">
					<AskButton label="Allow" option="Allow" onPress={() => ask.answer({ kind: "allow" })} />
					{/* absent rather than dead where the request suggested no rule: spool never
					    composes one of its own to fill the gap. It lasts the chat and is written to
					    no file, because the complaint is repetition */}
					{entry.always ? (
						<AskButton
							label="Allow for this chat"
							option="Allow for this chat"
							title={always}
							onPress={() => ask.answer({ kind: "always" })}
						/>
					) : null}
					<AskButton label="Deny" option="Deny" onPress={() => ask.answer({ kind: "deny" })} />
				</div>
			) : null}
			{ask.open && permissions !== undefined ? (
				<button
					type="button"
					onClick={permissions}
					className="w-fit text-muted transition-colors hover:text-text type-detail"
				>
					Change permissions…
				</button>
			) : null}
		</>
	);
}

/** one option: its number, its label, and the agent's description under it */
function OptionRow({
	label,
	description,
	n,
	multi,
	chosen,
	onPick,
}: {
	label: string;
	description: string;
	n: number;
	multi: boolean;
	chosen: boolean;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			{...(multi
				? { role: "menuitemcheckbox", "aria-checked": chosen }
				: { role: "menuitemradio", "aria-checked": chosen })}
			data-agent-option={label}
			onClick={onPick}
			className="group/opt flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-control aria-checked:bg-control"
		>
			{multi ? (
				<span className="flex h-5 shrink-0 items-center">
					<span
						data-agent-tick={chosen ? "on" : "off"}
						className={cn(
							"flex h-3.5 w-3.5 items-center justify-center rounded-xs border transition-colors duration-150",
							chosen ? "border-transparent bg-text text-bg" : "border-muted",
						)}
					>
						{chosen ? (
							<svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3" fill="none">
								<path d="M3 6.2 5 8.2 9 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
							</svg>
						) : null}
					</span>
				</span>
			) : (
				<span className="flex h-5 w-3 shrink-0 items-center justify-center tabular-nums text-muted type-detail group-aria-checked/opt:text-text">
					{n}
				</span>
			)}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-text type-control">{label}</span>
				{description === "" ? null : <span className="text-pretty text-muted type-detail">{description}</span>}
			</span>
		</button>
	);
}

/** a question's quiet way out: it refuses the question whole, so it is never shaped like an option */
export function Dismiss({ onPress }: { onPress: () => void }) {
	return (
		<button
			type="button"
			data-agent-dismiss=""
			onClick={onPress}
			className="-mr-1.5 h-7 shrink-0 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-control hover:text-text type-control"
		>
			Dismiss
		</button>
	);
}

/** the questions already settled in a call that asks several, each keeping its sentence and its answer */
export function Settled({ entry, ask }: { entry: AskEntry; ask: AskState }) {
	const done = entry.questions.filter((one) => ask.picks[one.question] !== undefined);
	if (done.length === 0) return null;
	return (
		<div className="flex flex-col gap-1">
			{done.map((one) => (
				<div key={one.question} className="flex flex-col">
					<p className="text-muted type-detail">{one.question}</p>
					<Folded>You picked {ask.picks[one.question]}</Folded>
				</div>
			))}
		</div>
	);
}

/** a question about no frame, as numbered rows with the agent's descriptions */
export function OptionList({ ask }: { ask: AskState }) {
	const question = ask.question;
	if (question === null) return null;
	return (
		<>
			<div role="menu" aria-label={question.question} className="flex flex-col">
				{question.options.map((option, index) => (
					<OptionRow
						key={option.label}
						label={option.label}
						description={option.description}
						n={index + 1}
						multi={question.multi}
						chosen={question.multi && ask.ticked.includes(option.label)}
						onPick={() => ask.pick(option.label)}
					/>
				))}
			</div>
			<div className="flex items-center justify-between gap-2">
				<Dismiss onPress={ask.dismiss} />
				{question.multi ? (
					<AskButton label={`Send ${ask.ticked.length}`} disabled={ask.ticked.length === 0} onPress={ask.send} />
				) : null}
			</div>
		</>
	);
}

/** the one quiet line an answered ask folds to, where it was asked */
export function Folded({ children, mark = "done" }: { children: ReactNode; mark?: "done" | "stopped" | "failed" }) {
	return (
		<div data-agent-folded={mark} className="flex min-h-[26px] items-center gap-2">
			<svg viewBox="0 0 14 14" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none">
				{mark === "done" ? (
					<path d="M3.5 7.4 5.9 9.8 10.5 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				) : mark === "stopped" ? (
					<rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
				) : (
					<path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				)}
			</svg>
			<span className="min-w-0 flex-1 text-muted type-control">{children}</span>
		</div>
	);
}

/** what became of an ask nobody is waiting on any more */
export function FoldedAsk({ entry, words }: { entry: AskEntry; words?: ReactNode }) {
	const detail = entry.detail ?? entry.access?.command ?? entry.access?.path ?? null;
	switch (entry.state) {
		case "answered":
			// a sentence the person typed lands in the shape the rail gives the person's words
			return words ?? <Folded>You picked {entry.words}</Folded>;
		case "dropped":
			return <Folded mark="failed">Nobody answered</Folded>;
		case "denied":
			return entry.question ? (
				<Folded mark="stopped">Dismissed</Folded>
			) : (
				<Folded mark="stopped">{foldedApproval("denied", entry.tool ?? null, detail).words}</Folded>
			);
		case "allowed":
		case "always": {
			const folded = foldedApproval(entry.state === "always" ? "always" : "allowed", entry.tool ?? null, detail);
			return (
				<Folded>
					{folded.words}
					{folded.mono === null ? null : (
						<>
							{" "}
							<span className="break-all font-mono text-muted text-xs">{folded.mono}</span>
						</>
					)}
				</Folded>
			);
		}
		default:
			return null;
	}
}

/**
 * An ask about nothing the turn can anchor it to: its own card, the same controls in it.
 * On the canvas the card floats a step up, with the float's shadow, and its notch points up
 * at the frame it hangs from.
 */
export function AskCard({
	entry,
	ask,
	permissions,
	notch,
	float = false,
}: {
	entry: AskEntry;
	ask: AskState;
	permissions?: (() => void) | undefined;
	/** the notch's centre, as a share of the card's width; none for a card hanging from nothing */
	notch?: number | undefined;
	float?: boolean;
}) {
	return (
		<section
			data-agent-ask={entry.state}
			data-agent-ask-look="card"
			className={cn(
				"relative flex flex-col gap-3 rounded-lg p-4",
				float
					? "animate-agent-ring-open border border-border bg-surface shadow-agent-float"
					: "animate-agent-ring-open border border-border",
			)}
		>
			{notch === undefined ? null : (
				<span
					aria-hidden="true"
					className={cn(
						"-top-[6px] absolute size-[11px] rotate-45 border-border border-t border-l",
						float ? "bg-surface" : "bg-bg",
					)}
					style={{ left: `calc(${notch * 100}% - 5.5px)` }}
				/>
			)}
			<AskInside entry={entry} ask={ask} permissions={permissions} />
		</section>
	);
}

/** whatever the ask is, inside a card: an approval's reason and answers, or a question's options */
export function AskInside({
	entry,
	ask,
	permissions,
}: {
	entry: AskEntry;
	ask: AskState;
	permissions?: (() => void) | undefined;
}) {
	if (!entry.question) return <ApprovalBody entry={entry} ask={ask} permissions={permissions} />;
	return (
		<>
			<Settled entry={entry} ask={ask} />
			<p className="text-pretty text-text type-body">
				{ask.question?.question ?? entry.asked}
				{entry.state === "arriving" ? <Caret /> : null}
			</p>
			{ask.open ? <OptionList ask={ask} /> : null}
		</>
	);
}
