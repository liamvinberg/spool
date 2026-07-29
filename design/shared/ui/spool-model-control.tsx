import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
	type ClaudeModel,
	EFFORT_SAYS,
	ENGINES,
	type Effort,
	type ModelState,
	engineLabel,
	modelOf,
	readout,
} from "../lib/agent-model";
import { cn } from "../lib/utils";
import { ChevronIcon } from "./spool-icons";

/**
 * Three answers to one question, drawn so they can be compared instead of
 * argued about.
 *
 * All three sit in the composer's footer, in the 18px line the send hint had,
 * wearing the same quiet mono. None of them uses the thread accent: chip and
 * outline are one object out on the canvas and they are the only colour on
 * screen, so a control about which machine is answering stays colourless like
 * everything else the agent does.
 *
 * Every name, description and effort level here arrives from `list_models` at
 * runtime. Nothing in this file knows what a model is called.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/** the footer's own voice, so the line reads as one line */
const QUIET = "font-mono text-2xs leading-3";

/**
 * The readout. A fact, not a control.
 *
 * Nothing to click because nothing needs clicking: the composer under it already
 * takes `/model sonnet`, the binary answers it locally for no turn and no token,
 * and this line then says what it changed to.
 */
export function ModelLine({ state, models }: { state: ModelState; models: readonly ClaudeModel[] | undefined }) {
	return <span className={cn(QUIET, "text-muted/45")}>{readout(state, models)}</span>;
}

/**
 * The readout, made a button.
 *
 * Five rows, because `list_models` offered five. No grouping, no width switch and
 * no policy section: the reply already resolved all of that, and every one of
 * those would have been Spool inventing structure it would then have to maintain.
 */
export function ModelMenu(props: PickerProps) {
	return <Picker {...props} engines={false} />;
}

/**
 * The same control with the third axis put back, so it can be looked at once.
 *
 * Two engines are greyed because they are not built. The effort row is greyed for
 * a realer reason: this machine exports `CLAUDE_CODE_EFFORT_LEVEL=max`, and the
 * environment outranks anything Spool draws.
 */
export function ModelAxes(props: PickerProps) {
	return <Picker {...props} engines={true} />;
}

interface PickerProps {
	state: ModelState;
	models: readonly ClaudeModel[] | undefined;
	pin?: Effort | null;
	onPick: (next: Partial<ModelState>) => void;
}

function Picker({ state, models, pin = null, onPick, engines }: PickerProps & { engines: boolean }) {
	const still = useReducedMotion() === true;
	const [open, setOpen] = useState(false);
	const [over, setOver] = useState<string | null>(null);
	const current = modelOf(models, state.value);
	const line = readout(state, models);
	const label = engines ? `${engineLabel(state.engine)} · ${line}` : line;
	// the model says which levels it has, and haiku says it has none — so the whole
	// control is absent rather than present and inert
	const levels = current?.supportedEffortLevels ?? [];

	/*
	 * What the one slot is saying (#186).
	 *
	 * `over` is whatever the cursor is on, and it is one state rather than two
	 * because the slot is one slot: a model's `value` and an effort level cannot
	 * collide, since the levels are a closed set the binary names and a model value
	 * is an alias like `opus[1m]`. With nothing hovered it describes the model that
	 * is set, which is the one thing the menu is already asserting by highlighting
	 * a row — so the slot is never empty and never has to reserve for empty.
	 *
	 * The environment wins over all of it: an exported `CLAUDE_CODE_EFFORT_LEVEL`
	 * outranks anything spool draws (#118), so when it is pinned the slot says that
	 * instead of describing a level nobody can pick.
	 */
	const hovered = over === null ? null : (EFFORT_SAYS[over as Effort] ?? modelOf(models, over)?.description ?? null);
	const says =
		pin !== null
			? `CLAUDE_CODE_EFFORT_LEVEL=${pin} is set in the environment`
			: (hovered ?? current?.description ?? null);
	/** the tallest sentence this menu can be made to say, which is what it reserves room for */
	const longest = [
		...(models ?? []).map((model) => model.description),
		...levels.map((level) => EFFORT_SAYS[level] ?? ""),
		`CLAUDE_CODE_EFFORT_LEVEL=${pin} is set in the environment`,
	].reduce((tallest, sentence) => (sentence.length > tallest.length ? sentence : tallest), "");

	const close = (next: Partial<ModelState>) => {
		onPick(next);
		setOpen(false);
	};

	return (
		<span className="relative">
			{open ? (
				<button
					type="button"
					aria-label="close the model menu"
					className="fixed inset-0 z-10 cursor-default"
					onClick={() => setOpen(false)}
				/>
			) : null}
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className={cn(
					QUIET,
					"flex items-center gap-1 transition-colors duration-150",
					open ? "text-muted" : "text-muted/45 hover:text-muted",
				)}
			>
				{label}
				<ChevronIcon open={open} className="h-2 w-2 shrink-0" />
			</button>
			<AnimatePresence>
				{open ? (
					<motion.div
						className="absolute bottom-full left-0 z-20 mb-2 w-[300px] rounded-md border border-border-raised bg-raised p-1.5"
						initial={still ? false : { opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={still ? { opacity: 0 } : { opacity: 0, y: 4 }}
						transition={still ? { duration: 0 } : { duration: 0.18, ease: ARRIVE }}
						onMouseLeave={() => setOver(null)}
					>
						{engines ? (
							<>
								<Group label="engine" />
								{ENGINES.map((entry) => (
									<Row
										key={entry.id}
										label={entry.label}
										note={entry.note}
										on={state.engine === entry.id}
										dead={!entry.configured}
										onPick={() => close({ engine: entry.id })}
									/>
								))}
								<Rule />
								<Group label="model" />
							</>
						) : null}
						{/*
						 * One sentence for the whole menu (#186).
						 *
						 * A row is its name and nothing else, and the line at the bottom describes
						 * whatever the cursor is on — a model or an effort level, the same slot
						 * either way. That kills four complaints with one move. The list stops
						 * repeating itself, which it did literally: `Default (Recommended)` and
						 * `Opus (1M context)` resolve to the same model and so carried the same
						 * sentence, word for word, on adjacent rows. Rows stop being ragged, since
						 * a description wrapped to one line or two depending on where the sentence
						 * fell and gave five rows five heights. And effort stops being a second
						 * shape: it was a strip of chips under a list of rows, two vocabularies in
						 * one menu, and now both halves are rows feeding one slot.
						 *
						 * It is not a new idea. The effort row already worked this way and was the
						 * only part of the menu nobody objected to; this is that, applied to all of
						 * it. What it gives up is comparing two descriptions without moving the
						 * cursor — which the old menu did not really offer either, two of its five
						 * sentences being the same sentence.
						 */}
						{(models ?? []).map((model) => (
							<Row
								key={model.value}
								label={model.displayName}
								on={state.value === model.value}
								onOver={() => setOver(model.value)}
								onPick={() => close({ value: model.value })}
							/>
						))}
						{levels.length === 0 ? null : (
							<>
								<Rule />
								{/* effort keeps the menu open on a pick: it is a refinement of the
								    model above it, not a second decision */}
								<Group label="effort" />
								{levels.map((level) => (
									<Row
										key={level}
										label={level}
										on={state.effort === level}
										dead={pin !== null && pin !== level}
										onOver={() => setOver(level)}
										onPick={() => onPick({ effort: level })}
									/>
								))}
							</>
						)}
						{/*
						 * The slot, reserving the tallest thing it can ever say.
						 *
						 * Everything it can say is the binary's own words and they are wildly uneven:
						 * `max` runs 165 characters against `xhigh`'s 76 and `low`'s 57, and the
						 * model sentences are longer again. With a `min-h` the line grew by three as
						 * the cursor crossed a row — and the menu is `bottom-full`, so growing moves
						 * its *top* edge and shoved the list up out of the frame. A pointer must
						 * never move what it is pointing at, so the block is sized for the longest
						 * sentence on offer and the live one is drawn over it, the same reserve
						 * `Prose` uses one file across.
						 *
						 * It sits outside the effort block because a model with no effort levels
						 * still has a description: `haiku` reports no `supportedEffortLevels` at
						 * all, and #118 settled that the control is then absent rather than greyed.
						 * Its sentence is not.
						 */}
						<p className={cn(QUIET, "relative px-1.5 pt-1.5 pb-0.5 text-muted/40 leading-[1.5]")}>
							<span className="invisible" aria-hidden="true">
								{longest}
							</span>
							<span className="absolute inset-x-1.5 top-1.5">{says}</span>
						</p>
					</motion.div>
				) : null}
			</AnimatePresence>
		</span>
	);
}

/**
 * One row. The name and the sentence under it are both the binary's.
 *
 * `note` is the other kind of second line: a reason a row cannot be picked, which
 * only the engine list has, and which sits at the end rather than underneath
 * because it qualifies the row instead of describing it.
 */
function Row({
	label,
	says,
	note,
	on,
	dead = false,
	onOver,
	onPick,
}: {
	label: string;
	says?: string | undefined;
	note?: string | undefined;
	on: boolean;
	dead?: boolean;
	/** the row reports the cursor; the menu owns the one slot that answers it (#186) */
	onOver?: (() => void) | undefined;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={dead}
			onMouseEnter={onOver}
			onClick={onPick}
			className={cn(
				"flex w-full min-w-0 flex-col gap-0.5 rounded-xs px-1.5 py-1 text-left transition-colors duration-150",
				dead ? "text-muted/30" : on ? "bg-surface text-text" : "text-text/70 hover:bg-surface/60",
			)}
		>
			<span className="flex w-full min-w-0 items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-mono text-xs leading-4">{label}</span>
				{note === undefined ? null : <span className={cn(QUIET, "shrink-0 text-muted/30")}>{note}</span>}
			</span>
			{says === undefined ? null : (
				<span className={cn(QUIET, "line-clamp-2 w-full text-muted/40 leading-[1.5]")}>{says}</span>
			)}
		</button>
	);
}

function Group({ label }: { label: string }) {
	return <span className={cn(QUIET, "block px-1.5 pt-1 pb-1.5 text-muted/35")}>{label}</span>;
}

function Rule() {
	return <span className="my-1 block h-px bg-border" />;
}
