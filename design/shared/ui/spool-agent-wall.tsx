import { motion, useReducedMotion } from "motion/react";
import { DOCS } from "shared/lib/agent-preflight";
import { cn } from "shared/lib/utils";
import { RailTabs } from "shared/ui/spool-canvas-chrome";

/**
 * The rail with no agent behind it.
 *
 * Two surfaces, and they are different shapes because the two states are known in
 * different ways — the argument is in lib/agent-preflight. A missing binary is a
 * fact about this machine, true before anyone types, so it takes the transcript's
 * place. A bad login is a fact inside another product, so it is a standing strip
 * over a log that still works.
 *
 * Neither is coloured. There is one accent in this product and it means a chip in
 * the composer and a box out on the canvas are the same object; spending it on a
 * state that is not an error — you have not installed something yet — would break
 * the only thing it says. Both of these step forward in brightness, which is the
 * whole of the emphasis the rest of the rail uses.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

/** the ring alone, for a check that is out: no row is running, so nothing settles into a tick */
function Looking({ className }: { className?: string }) {
	const still = useReducedMotion() === true;
	return (
		<motion.svg
			viewBox="0 0 14 14"
			className={cn("h-3 w-3 shrink-0 text-muted/60", className)}
			fill="none"
			aria-hidden="true"
			animate={still ? undefined : { rotate: 360 }}
			transition={still ? undefined : SPIN}
		>
			<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
			<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</motion.svg>
	);
}

/**
 * A quiet button in the rail's own weight: mono, small, and no border until you
 * are on it. The rail has exactly one filled control anywhere — the composer —
 * and a wall is not the place to introduce a second.
 */
function Quiet({
	label,
	busy,
	onClick,
}: {
	label: string;
	busy: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="-mr-1.5 flex h-6 items-center gap-2 rounded-sm px-1.5 font-mono text-text/70 text-2xs leading-3 transition-colors duration-150 hover:bg-surface hover:text-text"
		>
			{busy ? <Looking /> : null}
			{label}
		</button>
	);
}

/**
 * Nothing to spawn.
 *
 * The composer stays, and it is dead. Removing it would leave a tab with a
 * sentence in it and no evidence of what the tab is for; keeping it live would
 * collect a prompt for nobody. So it sits there at its resting height, dimmed,
 * saying what it will say once there is something behind it. That is the one
 * thing a wall owes you beyond the bad news: a picture of the good state.
 *
 * The check is allowed to fail forever. Installing takes minutes, so pressing it
 * twice in a row is the normal case, and the second press has to leave a mark or
 * the button reads as broken. It leaves one line, in the same mono the composer's
 * own hints use.
 */
export function InstallWall({
	checking,
	looked,
	onLook,
}: {
	checking: boolean;
	looked: boolean;
	onLook: () => void;
}) {
	const still = useReducedMotion() === true;
	return (
		<>
			<RailTabs tabs={["agent", "connections"]} active="agent" />
			<div className="flex min-h-0 flex-1 flex-col justify-center px-3.5">
				<motion.div
					className="flex flex-col gap-3"
					initial={still ? false : { opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={still ? { duration: 0 } : { duration: 0.34, ease: ARRIVE }}
				>
					<p className="text-base text-text leading-base">no claude on this machine</p>
					<p className="text-base text-muted leading-base">
						Spool runs the agent you already have, with the login you already made. There is nothing here to
						run yet.
					</p>
					<div className="flex flex-col gap-1.5 pt-1">
						<div className="flex items-center justify-between">
							<span className="font-mono text-2xs text-muted/45 leading-4">{DOCS}</span>
							<Quiet label={checking ? "looking" : "check again"} busy={checking} onClick={onLook} />
						</div>
						{looked && !checking ? (
							<motion.span
								className="font-mono text-2xs text-muted/45 leading-4"
								initial={still ? false : { opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={still ? { duration: 0 } : { duration: 0.2 }}
							>
								still nothing on your PATH
							</motion.span>
						) : null}
					</div>
				</motion.div>
			</div>
			<DeadComposer />
		</>
	);
}

/** the composer at rest and switched off, so the tab still shows what it is for */
function DeadComposer() {
	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex flex-col rounded-md border border-border/70 bg-surface/40 px-3 py-2.5">
				<span className="h-[60px] text-base text-muted/25 leading-base">say what to change</span>
			</div>
			<div className="flex h-[18px] items-center" />
		</div>
	);
}

/**
 * Signed out, as a standing fact.
 *
 * It is a strip rather than a wall because the log below it is not empty and must
 * not be: what the human typed is down there in their own voice, and so is the
 * moment the send bounced. The strip is the part that outlives that moment — the
 * same test #117 used to lift the plan out of the transcript and leave the
 * screenshot in it. It stays until it stops being true, and then it goes.
 *
 * It sits at the plan strip's height and in the plan strip's place, because the
 * rail has one shelf under the tabs and two things never want it at once: a plan
 * belongs to a turn that is running, and this exists precisely because none can.
 *
 * Two things on it and no third. The first draft put the *keys: none, ever*
 * promise here as a middle column and it truncated at 420px — which is the strip
 * telling you what it is: a fact and the one thing to do about it. The promise
 * moved into the log under the remedy, where it is read once by someone deciding
 * what to do rather than held on screen for as long as the state lasts.
 */
export function LoginStrip({
	checking,
	onCheck,
}: {
	checking: boolean;
	onCheck: () => void;
}) {
	return (
		<div className="flex h-[34px] shrink-0 items-center border-border border-b px-3.5">
			<span className="min-w-0 flex-1 truncate font-mono text-muted text-sm leading-4">signed out</span>
			<Quiet label={checking ? "looking" : "check again"} busy={checking} onClick={onCheck} />
		</div>
	);
}
