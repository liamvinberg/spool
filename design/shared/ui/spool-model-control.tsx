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
	const [over, setOver] = useState<Effort | null>(null);
	const current = modelOf(models, state.value);
	const line = readout(state, models);
	const label = engines ? `${engineLabel(state.engine)} · ${line}` : line;
	// the model says which levels it has, and haiku says it has none — so the whole
	// control is absent rather than present and inert
	const levels = current?.supportedEffortLevels ?? [];
	/** the tallest sentence this menu can be made to say, which is what it reserves room for */
	const longest = [...levels.map((level) => EFFORT_SAYS[level] ?? ""), `CLAUDE_CODE_EFFORT_LEVEL=${pin} is set in the environment`]
		.reduce((tallest, says) => (says.length > tallest.length ? says : tallest), "");

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
						{(models ?? []).map((model) => (
							<Row
								key={model.value}
								label={model.displayName}
								says={model.description}
								on={state.value === model.value}
								onPick={() => close({ value: model.value })}
							/>
						))}
						{levels.length === 0 ? null : (
							<>
								<Rule />
								{/* effort keeps the menu open on a pick: it is a refinement of the
								    model above it, not a second decision */}
								<Group label="effort" />
								<span className="flex flex-wrap items-center gap-0.5 px-1" onMouseLeave={() => setOver(null)}>
									{levels.map((level) => (
										<button
											key={level}
											type="button"
											disabled={pin !== null && pin !== level}
											onMouseEnter={() => setOver(level)}
											onClick={() => onPick({ effort: level })}
											className={cn(
												QUIET,
												"h-[20px] rounded-xs px-1.5 transition-colors duration-150",
												pin !== null && pin !== level
													? "text-muted/25"
													: state.effort === level
														? "bg-surface text-text"
														: "text-muted/50 hover:text-muted",
											)}
										>
											{level}
										</button>
									))}
								</span>
								{/*
								 * The sentence reserves the tallest thing it can ever say.
								 *
								 * These descriptions are the binary's and they are wildly uneven — `max`
								 * is 165 characters against `xhigh`'s 76 and `low`'s 57 — so a `min-h`
								 * let the line grow by three as the cursor crossed the row. The menu is
								 * `bottom-full`, so growing moves its *top* edge: hovering `max` shoved
								 * the model list up under the rail's own top and out of the frame. A
								 * pointer must never move what it is pointing at, so the block is sized
								 * for the longest sentence on offer and the live one is drawn over it,
								 * the same reserve `Prose` uses one file across.
								 */}
								<p className={cn(QUIET, "relative px-1.5 pt-1.5 pb-0.5 text-muted/40 leading-[1.5]")}>
									<span className="invisible" aria-hidden="true">
										{longest}
									</span>
									<span className="absolute inset-x-1.5 top-1.5">
										{pin === null
											? EFFORT_SAYS[over ?? state.effort]
											: `CLAUDE_CODE_EFFORT_LEVEL=${pin} is set in the environment`}
									</span>
								</p>
							</>
						)}
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
	onPick,
}: {
	label: string;
	says?: string | undefined;
	note?: string | undefined;
	on: boolean;
	dead?: boolean;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={dead}
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
