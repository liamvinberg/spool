import { AGENT_ENGINE_IDS } from "../../daemon/agent-engine";
import { MIN_H } from "./agent-composer";
import { Spinner } from "./agent-marks";
import { ENGINES, InstallLine } from "./agent-menu";
import type { AgentModelDeck } from "./agent-model";
import type { InstallDeck, LoginDeck } from "./agent-preflight";
import type { Threads } from "./agent-thread-list";

/* ---------- the agent that is not there (#127, #201) ----------
 * Two surfaces, and they are different shapes because the two states are known in
 * different ways. A missing binary is a fact about this machine, true before anyone
 * types, so it takes the transcript's place. A bad login is a fact inside another
 * product, so it is a standing strip over a log that still works.
 *
 * Neither is coloured. There is one accent in this product and it means a chip in the
 * composer and a box out on the canvas are the same object; spending it on a state that
 * is not even a failure — you have not installed something yet — would break the only
 * thing it says. Both step forward in brightness, which is the whole of the emphasis the
 * rest of the rail uses. */

/**
 * Ask again: one control, in the rail's own weight, for both of these states.
 *
 * Mono, small, and no border until you are on it. The rail has exactly one filled control
 * anywhere — the composer — and neither of these states is the place to introduce a second.
 * It says what it is doing rather than what it is for while a check is out, because that
 * is the only thing on screen saying the press landed.
 */
function CheckAgain({ busy, onClick }: { busy: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			data-agent-check=""
			onClick={onClick}
			className="-mr-1.5 flex h-6 shrink-0 items-center gap-2 rounded-sm px-1.5 text-text transition-colors duration-150 hover:bg-surface hover:text-text type-detail"
		>
			{busy ? <Spinner className="h-3 w-3 text-muted/60" /> : null}
			{busy ? "looking" : "check again"}
		</button>
	);
}

/**
 * Nothing to spawn, from any agent spool runs (#201, #363).
 *
 * The composer stays, and it is dead. Removing it would leave the rail as a sentence with
 * no evidence of what the rail is for; leaving it live would collect a prompt for nobody.
 *
 * Spool ships no agent of its own, so the wall is the way to one: a line per agent to paste
 * into a terminal, and a check. The check also happens on its own when the window comes back
 * into focus, which is when the person has most likely just run one of the lines.
 */
export function InstallWall({ install }: { install: InstallDeck }) {
	return (
		<div data-agent-wall="" className="flex min-h-0 flex-1 flex-col justify-center px-3.5">
			<div className="animate-agent-entry flex flex-col gap-3">
				<p className="text-text type-body">No agent is installed</p>
				<p className="text-muted type-body">
					Spool works with the agent you already use. Install one in a terminal, then check again.
				</p>
				<div className="flex flex-col gap-2.5 pt-1">
					{AGENT_ENGINE_IDS.map((engine) => (
						<InstallLine key={engine} engine={engine} />
					))}
				</div>
				<div className="flex items-center justify-between pt-1">
					{/* the check is allowed to fail forever, and a press that leaves no mark reads
					    as a broken button — so it leaves one line, in the composer's own mono */}
					{install.foundNothing ? (
						<span data-agent-looked="" className="animate-agent-entry text-muted type-detail">
							still nothing on your PATH
						</span>
					) : (
						<span />
					)}
					<CheckAgain busy={install.checking} onClick={install.look} />
				</div>
			</div>
		</div>
	);
}

/** the composer at rest and switched off, so the rail still shows what it is for */
export function DeadComposer() {
	return (
		<div data-agent-dead="" className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex flex-col rounded-md border border-border/70 bg-surface/40 px-3 py-2.5">
				<span className="text-muted type-body" style={{ height: MIN_H }}>
					Say what to change
				</span>
			</div>
			<div className="flex h-[18px] items-center" />
		</div>
	);
}

/**
 * Signed out, as a standing fact.
 *
 * A strip rather than a wall because the log below it is not empty and must not be: what
 * the human typed is down there in their own voice, and so is the moment the send
 * bounced. The strip is the part that outlives that moment — the same test #117 used to
 * lift the plan out of the transcript and leave the screenshot in it.
 *
 * It sits at the plan strip's height and in the plan strip's place, because the rail has
 * one shelf and those two never want it at once: a plan belongs to a turn that is running,
 * and this exists precisely because none can.
 *
 * Two things on it and no third. The promise about keys is in the log under the remedy,
 * where somebody deciding what to do reads it once, rather than held on screen for as long
 * as the state lasts.
 */
export function LoginStrip({ login }: { login: LoginDeck }) {
	return (
		<div data-agent-login="" className="flex h-[34px] shrink-0 items-center border-border border-b px-3.5">
			<span className="min-w-0 flex-1 truncate text-muted type-value">signed out</span>
			<CheckAgain busy={login.checking} onClick={login.check} />
		</div>
	);
}

export function RecoveryView({
	install,
	login,
	model,
	onModels,
	onNew,
}: {
	install: InstallDeck;
	login: LoginDeck;
	model: AgentModelDeck;
	onModels: () => void;
	onNew: Threads["onNew"];
}) {
	const recovery = login.recovery;
	const engine = model.engine;
	const action = "font-mono text-2xs leading-3 text-muted hover:text-text disabled:opacity-50";
	const changed = recovery?.offer && model.offer.current.value !== recovery.offer;
	if (engine !== undefined && (install.missing || login.out || recovery?.kind === "login")) {
		const { name, login: signIn } = ENGINES[engine];
		return (
			<div data-recovery={engine} className="flex flex-col gap-3">
				<p className="text-base text-text leading-base">
					{install.missing ? `${name} isn’t installed.` : `Sign in to ${name} to continue.`}
				</p>
				{install.missing ? (
					<InstallLine engine={engine} />
				) : (
					// each agent signs in in its own terminal flow: spool holds no login of its own
					<p className="text-base text-muted leading-base">
						Run <code className="font-mono text-xs">{signIn.command}</code> in a terminal
						{signIn.inside === undefined ? null : (
							<>
								, then <code className="font-mono text-xs">{signIn.inside}</code>
							</>
						)}
						.
					</p>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-agent-check=""
						className={action}
						disabled={install.checking || login.checking}
						onClick={install.missing ? install.look : login.check}
					>
						{install.checking || login.checking ? "checking…" : "check again"}
					</button>
					<button type="button" className={action} onClick={() => onNew()}>
						new thread
					</button>
				</div>
				{install.foundNothing ? (
					<p data-agent-looked="" className="font-mono text-2xs text-muted">
						{name} is still not installed.
					</p>
				) : null}
			</div>
		);
	}
	if (!recovery) return null;
	if (changed && recovery.scope === "model")
		return (
			<button type="button" className={action} onClick={login.retry}>
				continue with this model
			</button>
		);
	const reset =
		recovery.resetsAt === undefined
			? null
			: new Date(recovery.resetsAt * 1000).toLocaleTimeString("en-GB", {
					hour: "2-digit",
					minute: "2-digit",
					...(recovery.resetsAt * 1000 - Date.now() >= 24 * 3600 * 1000
						? ({ day: "numeric", month: "short" } as const)
						: {}),
				});
	return (
		<div data-recovery="limit" className="flex flex-col gap-3">
			<p className="text-base text-text leading-base">{recovery.account} rate limit reached.</p>
			{reset === null ? null : <p className="text-base text-muted leading-base">Try again at {reset}.</p>}
			<div className="flex items-center gap-3">
				<button type="button" className={action} onClick={login.retry}>
					retry
				</button>
				<button type="button" className={action} onClick={onModels}>
					choose model
				</button>
			</div>
		</div>
	);
}
