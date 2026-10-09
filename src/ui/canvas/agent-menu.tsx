import { Fragment, type ReactNode, useEffect, useState } from "react";
import { AGENT_ENGINE_IDS, type AgentEngineId, isAgentEngineId } from "../../daemon/agent-engine";
import type { AgentLimit } from "../../daemon/agent-events";
import type { AgentAsk, AgentModel, AgentOffer } from "../../daemon/agent-offer";
import { chooseEngineModel, engineModelOffer, fetchAgentEngines, fetchAgentLogin } from "../api";
import { cn } from "../cn";
import { CheckIcon, PlusIcon, SearchIcon } from "../icons";
import { Chevron, CommandLine, Fade, RailMenu, Reveal, Versioned } from "./agent-float";
import { limitReadout, resetsIn } from "./agent-limit";
import { type AgentModelDeck, offerOf } from "./agent-model";
import type { LoginDeck } from "./agent-preflight";

/**
 * What the rail says about each agent spool drives (#363, #364), in one place: the name a
 * person reads, the vendor's own npm package that installs it, and how it signs in from a
 * terminal. `inside` is what to type inside the agent once the command has started it. Every
 * agent is listed whether or not the machine has it, because the wall and "Get more agents"
 * are about what you can install; the order is the fallback's, Claude Code, Codex, pi.
 */
export const ENGINES: Readonly<
	Record<AgentEngineId, { name: string; install: string; login: { command: string; inside?: string } }>
> = {
	claude: {
		name: "Claude Code",
		install: "npm i -g @anthropic-ai/claude-code",
		login: { command: "claude auth login" },
	},
	codex: { name: "Codex", install: "npm i -g @openai/codex", login: { command: "codex login" } },
	pi: { name: "pi", install: "npm i -g @earendil-works/pi-coding-agent", login: { command: "pi", inside: "/login" } },
};

/** an engine's name, or the raw id of one spool no longer runs (a legacy chat's "spool") */
export const engineName = (engine: string | undefined): string =>
	engine === undefined ? "" : isAgentEngineId(engine) ? ENGINES[engine].name : engine;

/** an agent's install line under its name, to copy into a terminal */
export function InstallLine({ engine }: { engine: AgentEngineId }) {
	const { name, install } = ENGINES[engine];
	return (
		<div data-agent-install={engine} className="flex flex-col gap-1.5">
			<span className="text-muted type-label">{name}</span>
			<CommandLine command={install} label={`Copy the ${name} install line`} />
		</div>
	);
}

/** what each effort level means, said as a person would; a level not here says nothing */
const EFFORT_SAYS: Readonly<Record<string, string>> = {
	off: "Answers straight away.",
	minimal: "Barely thinks before it answers.",
	low: "Quick, light thinking.",
	medium: "Thinks before most edits.",
	high: "Thinks longer before it edits.",
	xhigh: "Thinks longer still, for hard problems.",
	max: "Thinks as long as it needs. Slowest.",
};

/** past this many models in all, the menu offers a field to find one */
const FIND_AT = 12;

/** a model matches by what the agent calls it, the name a person reads, or its agent's name */
function matches(engine: string, model: AgentModel, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === "") return true;
	return (
		model.value.toLowerCase().includes(q) ||
		model.displayName.toLowerCase().includes(q) ||
		engineName(engine).toLowerCase().includes(q)
	);
}

/** a machine id rather than a display name, which is set in mono */
const machineWord = (name: string) => !/\s/.test(name) && /[-/:]/.test(name);

/** one other engine as the menu last read it */
interface Other {
	readonly offer: AgentOffer | null;
	/** null until the agent has said, and while it could not */
	readonly signedIn: boolean | null;
}

/**
 * The agent and model menu (#364): one list rising from the composer's model trigger,
 * every installed agent a group with its name over its models, this chat's own first.
 *
 * The chosen model carries a check and its effort, and the effort opens in place under
 * it. A model on another agent switches this chat in place while it is empty, and in a
 * started chat says first that it starts a new one. Past twelve models a field to find one
 * stands at the top. An agent that is signed out shows its login line; agents the machine
 * lacks are one quiet line at the foot that opens to their install lines.
 */
export function AgentMenu({
	project,
	engine: own,
	model,
	preferred,
	started,
	limit,
	login,
	open,
	onOpen,
	onSwitch,
}: {
	project: string;
	/** this chat's own agent, as loaded: the menu is drawn only once it is known (#361) */
	engine: AgentEngineId;
	/** what this chat's agent offered */
	model: AgentModelDeck;
	/** the machine's usual agent: the trigger names an agent only when it is another */
	preferred: AgentEngineId | null | undefined;
	/** the chat has had its first message, so it keeps its agent */
	started: boolean;
	limit: AgentLimit | null;
	login?: LoginDeck | undefined;
	open: boolean;
	onOpen: (open: boolean) => void;
	/**
	 * Another agent was picked: in this chat while it is empty, or in a new one. It resolves
	 * once the choice is saved, with whether the daemon confirmed it, and the menu stays
	 * open until then (#361).
	 */
	onSwitch: (engine: AgentEngineId, fresh: boolean) => Promise<boolean>;
}) {
	const { offer, levels } = model;
	const [engines, setEngines] = useState<readonly { id: AgentEngineId; installed: boolean }[] | null>(null);
	const [others, setOthers] = useState<Readonly<Record<string, Other>>>({});
	const [effortOpen, setEffortOpen] = useState(false);
	const [pending, setPending] = useState<{ engine: AgentEngineId; value: string } | null>(null);
	const [more, setMore] = useState(false);
	const [query, setQuery] = useState("");
	const [looks, setLooks] = useState(0);
	/** the agent being saved as the machine's, or one whose save the daemon did not confirm */
	const [switching, setSwitching] = useState<{ engine: AgentEngineId; failed: boolean } | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `looks` is the cue to read again, not a value read here
	useEffect(() => {
		if (!open) return;
		let live = true;
		void fetchAgentEngines(project).then((reading) => {
			const listed = reading?.engines;
			if (!live || listed === undefined) return;
			setEngines(listed);
			for (const one of listed) {
				if (one.id === own || !one.installed) continue;
				void Promise.all([engineModelOffer(project, one.id), fetchAgentLogin(project, one.id)]).then(
					([body, account]) => {
						if (!live) return;
						setOthers((all) => ({
							...all,
							[one.id]: { offer: offerOf(body), signedIn: account?.signedIn ?? null },
						}));
					},
				);
			}
		});
		return () => {
			live = false;
		};
	}, [open, project, own, looks]);

	const show = (next: boolean) => {
		onOpen(next);
		if (next) {
			setQuery("");
			setPending(null);
			setMore(false);
			setSwitching(null);
			model.refresh();
		}
	};

	const installed = (engines ?? [{ id: own, installed: true }]).filter((one) => one.installed || one.id === own);
	const groups = [own, ...installed.map((one) => one.id).filter((id) => id !== own)];
	// every agent spool can be pointed at that is not here, the wall's list (#363), as soon
	// as the machine has said what is: one the daemon does not run yet is still installable
	const lacking =
		engines === null
			? []
			: AGENT_ENGINE_IDS.filter((id) => id !== own && !engines.some((has) => has.id === id && has.installed));
	const modelsOf = (engine: string) => (engine === own ? offer.models : (others[engine]?.offer?.models ?? []));
	const total = groups.reduce((sum, engine) => sum + modelsOf(engine).length, 0);
	const findable = total > FIND_AT;
	const usage = usageOf(limit, login);
	const current = offer.models.find((entry) => entry.value === offer.current.value);
	const name =
		current?.displayName ??
		offer.current.name ??
		offer.current.resolved ??
		(model.loading ? "Loading…" : "Choose model");
	const unusual = preferred !== undefined && preferred !== null && own !== preferred;
	// a model that reports no levels has no effort control, whatever level the report still
	// carries from the model before it
	const effort = levels.length === 0 ? null : (offer.current.effort ?? "auto");
	const pin = offer.current.pin;

	const pick = (engine: AgentEngineId, entry: AgentModel) => {
		if (engine === own) {
			// the effort held carries over where the new model has that level, and otherwise
			// the agent's own default answers
			const held = offer.current.effort;
			const keeps = held !== null && entry.supportedEffortLevels?.includes(held) === true;
			model.choose({ value: entry.value, ...(keeps ? { effort: held } : {}) });
			show(false);
			return;
		}
		if (started) {
			setPending((was) =>
				was?.engine === engine && was.value === entry.value ? null : { engine, value: entry.value },
			);
			return;
		}
		void switchTo(engine, entry.value, false);
	};

	/**
	 * Another agent, on one of its models, or on whatever it answers with where it offered
	 * none. The menu closes only once the choice is saved and confirmed (#361), so the next
	 * chat really starts on it; one the daemon did not take keeps the menu open, saying so.
	 */
	const switchTo = async (engine: AgentEngineId, value: string | null, fresh: boolean) => {
		if (switching !== null && !switching.failed) return;
		setSwitching({ engine, failed: false });
		if (value !== null) {
			const ask: AgentAsk = { value };
			await chooseEngineModel(project, engine, ask);
		}
		const saved = await onSwitch(engine, fresh);
		if (saved) {
			setSwitching(null);
			show(false);
		} else setSwitching({ engine, failed: true });
	};

	const group = (engine: AgentEngineId, index: number) => {
		const mine = engine === own;
		// an agent that answered with nothing to list, or whose list could not be read, is
		// still an agent to pick, on whatever it answers with by default
		const bare = !mine && others[engine] !== undefined && (others[engine]?.offer?.models.length ?? 0) === 0;
		const { login: signIn } = ENGINES[engine];
		const signedOut = mine ? login?.out === true : others[engine]?.signedIn === false;
		const models = modelsOf(engine).filter((entry) => matches(engine, entry, query));
		// a group the search empties folds away rather than vanishing, and one the machine has
		// just said is there unfolds into place
		const found = models.length > 0 || signedOut || query.trim() === "";
		return (
			<Fade key={engine} fold open={found}>
				<div data-agent-group={engine} className={cn("flex flex-col", index > 0 && "pt-1")}>
					<div
						role="presentation"
						className={cn(
							"flex h-8 shrink-0 items-center justify-between gap-2 pr-2 pl-7",
							findable && "sticky top-0 z-[1] bg-surface",
						)}
					>
						<span className="text-muted type-label">{engineName(engine)}</span>
						{signedOut ? (
							<Quiet>signed out</Quiet>
						) : started && !mine ? (
							<Quiet>new chat</Quiet>
						) : findable && modelsOf(engine).length > 6 ? (
							<Quiet>{modelsOf(engine).length} models</Quiet>
						) : null}
					</div>
					{mine && usage !== null ? (
						<p data-agent-usage="" className="truncate pr-2 pb-1.5 pl-7 text-muted type-detail">
							{usage}
						</p>
					) : null}
					{signedOut ? (
						<div data-agent-signed-out={engine} className="flex flex-col gap-2 pt-0.5 pr-2 pb-2 pl-7">
							<p className="text-muted type-label">
								{engineName(engine)} is signed out. Sign in from a terminal and its models show up here.
							</p>
							<CommandLine command={signIn.command} />
							{signIn.inside === undefined ? null : (
								<p className="text-muted type-label">
									then <span className="type-detail">{signIn.inside}</span>
								</p>
							)}
							<span>
								<button
									type="button"
									onClick={() => (mine ? login?.check() : setLooks((count) => count + 1))}
									className="h-7 rounded-sm border border-border px-2.5 text-text transition-colors duration-150 hover:bg-raised type-control"
								>
									Check again
								</button>
							</span>
						</div>
					) : (
						models.map((entry) => {
							const chosen = mine && entry.value === offer.current.value;
							const waiting = pending?.engine === engine && pending.value === entry.value;
							return (
								<Fragment key={entry.value}>
									<div
										data-active={waiting || undefined}
										className={cn(
											"group flex h-8 shrink-0 items-center rounded-sm transition-colors duration-150 hover:bg-raised",
											waiting && "bg-raised",
										)}
									>
										<button
											type="button"
											role="menuitemradio"
											aria-checked={chosen}
											aria-current={chosen}
											data-agent-model-row={entry.displayName}
											data-agent-model-engine={engine}
											title={entry.description || undefined}
											onClick={() => pick(engine, entry)}
											className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm pl-2 text-left outline-none focus-visible:bg-raised"
										>
											<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
												{chosen ? <CheckIcon className="h-3.5 w-3.5 text-text" /> : null}
											</span>
											<ModelName name={entry.displayName} hit={query} />
											{/* a model that runs on this machine says so, quietly, after its name (#363) */}
											{entry.local ? (
												<span data-agent-model-local="" className="shrink-0 text-muted type-caption">
													local
												</span>
											) : null}
										</button>
										{chosen && effort !== null ? (
											<button
												type="button"
												aria-label={`Effort, ${effort}`}
												aria-expanded={effortOpen}
												data-agent-effort-toggle=""
												onClick={() => setEffortOpen((was) => !was)}
												className="mr-1 flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text aria-expanded:text-text type-value"
											>
												{effort}
												<Chevron open={effortOpen} />
											</button>
										) : null}
									</div>
									{chosen && levels.length > 0 ? (
										<Reveal open={effortOpen}>
											<div className="flex flex-col gap-1 pt-0.5 pr-2 pb-2 pl-6">
												<div
													role="radiogroup"
													aria-label="Effort levels"
													className="flex flex-wrap items-center gap-0.5"
												>
													{levels.map((level) => (
														<button
															key={level}
															type="button"
															aria-pressed={offer.current.effort === level}
															data-agent-effort={level}
															title={EFFORT_SAYS[level]}
															disabled={pin !== null && pin !== level}
															onClick={() => model.choose({ effort: level })}
															className={cn(
																"flex h-6 items-center rounded-sm px-2 transition-colors duration-150 type-value disabled:opacity-40",
																offer.current.effort === level
																	? "bg-raised text-text"
																	: "text-muted hover:text-text",
															)}
														>
															{level}
														</button>
													))}
												</div>
												{pin !== null ? (
													<p role="status" className="pl-2 text-muted type-caption">
														{`CLAUDE_CODE_EFFORT_LEVEL=${pin} is set in the environment.`}
													</p>
												) : offer.current.effort !== null && EFFORT_SAYS[offer.current.effort] ? (
													<p
														key={offer.current.effort}
														className="animate-agent-fade-in pl-2 text-muted type-label"
													>
														{EFFORT_SAYS[offer.current.effort]}
													</p>
												) : null}
											</div>
										</Reveal>
									) : null}
									{started && !mine ? (
										<Reveal open={waiting}>
											<NewThreadNote
												engine={engine}
												onAccept={() => void switchTo(engine, entry.value, true)}
											/>
										</Reveal>
									) : null}
								</Fragment>
							);
						})
					)}
					{bare && !signedOut && query.trim() === "" ? (
						/* an agent with nothing to list is still an agent to pick: the row names it, and
					   it answers on its own default */
						<button
							type="button"
							role="menuitemradio"
							aria-checked={false}
							data-agent-model-row={engineName(engine)}
							data-agent-model-engine={engine}
							onClick={() =>
								started
									? setPending((was) => (was?.engine === engine ? null : { engine, value: "" }))
									: void switchTo(engine, null, false)
							}
							className={cn(
								"flex h-8 shrink-0 items-center gap-2 rounded-sm pl-2 text-left text-text outline-none transition-colors duration-150 hover:bg-raised focus-visible:bg-raised type-control",
								pending?.engine === engine && "bg-raised",
							)}
						>
							<span className="h-3.5 w-3.5 shrink-0" />
							{engineName(engine)}
						</button>
					) : null}
					{bare && started ? (
						<Reveal open={pending?.engine === engine && pending.value === ""}>
							<NewThreadNote engine={engine} onAccept={() => void switchTo(engine, null, true)} />
						</Reveal>
					) : null}
					{mine && !signedOut && models.length === 0 && query.trim() === "" ? (
						<p className="px-7 py-2 text-muted type-label">
							{model.loading ? "Loading models…" : "No models offered."}
						</p>
					) : null}
				</div>
			</Fade>
		);
	};

	const shown = groups.map(group);
	const nothingFound =
		query.trim() !== "" &&
		groups.every((engine) => {
			const signedOut = engine === own ? login?.out === true : others[engine]?.signedIn === false;
			return !signedOut && !modelsOf(engine).some((entry) => matches(engine, entry, query));
		});
	return (
		<span data-agent-model={model.readout} className="flex min-w-0">
			<RailMenu
				open={open}
				onOpen={show}
				label="Agent and model"
				className="absolute bottom-full left-0 z-30 mb-2 w-[384px] max-w-full overflow-hidden"
				panel={{ "data-agent-model-menu": "" }}
				busy={switching !== null && !switching.failed}
				trigger={(props) => (
					<button
						type="button"
						{...props}
						aria-label="Choose model"
						title={[engineName(own), name, effort].filter(Boolean).join(" · ")}
						className="relative z-30 flex h-7 min-w-0 max-w-[200px] items-center gap-1.5 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text aria-expanded:bg-surface aria-expanded:text-text type-control"
					>
						{usage !== null ? (
							<span
								data-agent-limit-dot=""
								aria-hidden="true"
								className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted"
							/>
						) : null}
						<span className="min-w-0 truncate">
							{unusual ? (
								<>
									<span data-agent-trigger-engine="">{engineName(own)}</span>
									<span className="px-1 text-muted/60">·</span>
								</>
							) : null}
							{machineWord(name) ? <span className="type-value">{name}</span> : <Versioned name={name} />}
						</span>
						<Chevron open={open} />
					</button>
				)}
			>
				<Fade fold open={findable}>
					<label className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3">
						<SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Find a model"
							aria-label="Find a model"
							spellCheck={false}
							autoComplete="off"
							className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted type-control [&::-webkit-search-cancel-button]:hidden"
						/>
					</label>
				</Fade>
				<div
					className={cn("pages-scrollbar overflow-y-auto p-1", findable ? "max-h-[360px] pt-0" : "max-h-[420px]")}
				>
					{shown}
					{nothingFound ? <p className="px-7 py-3 text-muted type-label">No models match “{query}”.</p> : null}
					{switching?.failed ? (
						<p role="status" data-agent-switch-failed="" className="px-7 py-2 text-muted type-label">
							Spool could not save {engineName(switching.engine)} as your agent. Try again.
						</p>
					) : null}
				</div>
				{lacking.length === 0 ? null : (
					<div className="flex flex-col border-border border-t p-1">
						<button
							type="button"
							aria-expanded={more}
							onClick={() => setMore((was) => !was)}
							className="group flex h-8 items-center gap-2 rounded-sm px-2 text-left text-muted transition-colors duration-150 hover:bg-raised hover:text-text"
						>
							<span className="flex h-3.5 w-3.5 items-center justify-center transition-transform duration-[160ms] group-aria-expanded:rotate-45 motion-reduce:transition-none">
								<PlusIcon />
							</span>
							<span className="type-label">Get more agents</span>
						</button>
						<Reveal open={more}>
							<div className="flex flex-col gap-3 pt-1 pr-2 pb-2 pl-7">
								{lacking.map((id) => (
									<InstallLine key={id} engine={id} />
								))}
								<span>
									<button
										type="button"
										onClick={() => setLooks((count) => count + 1)}
										className="h-7 rounded-sm border border-border px-2.5 text-text transition-colors duration-150 hover:bg-raised type-control"
									>
										Check again
									</button>
								</span>
							</div>
						</Reveal>
					</div>
				)}
			</RailMenu>
		</span>
	);
}

/** the usage line, verbatim from the agent's own window, or null while it has not warned */
function usageOf(limit: AgentLimit | null, login: LoginDeck | undefined): string | null {
	const recovery = login?.recovery;
	if (recovery?.kind === "limit") {
		const reset = resetsIn(recovery.resetsAt, Date.now());
		return `${recovery.account} limit reached${reset ? ` · resets ${reset}` : ""}`;
	}
	return limit === null ? null : limitReadout(limit, Date.now());
}

/** a model on another agent, picked in a started chat: what happens, and the one act */
function NewThreadNote({ engine, onAccept }: { engine: string; onAccept: () => void }) {
	return (
		<div data-agent-new-thread={engine} className="flex items-center gap-3 pt-1 pr-1 pb-2 pl-7">
			<p className="min-w-0 flex-1 text-muted type-label">
				Starts a new chat on {engineName(engine)}. This one stays in your chats.
			</p>
			<button
				type="button"
				onClick={onAccept}
				className="h-7 shrink-0 rounded-sm bg-text px-2.5 text-bg transition-opacity duration-150 hover:opacity-90 type-control"
			>
				New chat
			</button>
		</div>
	);
}

function Quiet({ children }: { children: ReactNode }) {
	return <span className="whitespace-nowrap pr-1 text-muted/70 type-label">{children}</span>;
}

/** a model as its agent names it: a machine id in mono, a name with its version kept legible */
function ModelName({ name, hit }: { name: string; hit: string }) {
	return (
		<span className={cn("min-w-0 truncate text-text", machineWord(name) ? "type-value" : "type-control")}>
			{machineWord(name) ? <Marked text={name} hit={hit} /> : <Versioned name={name} hit={hit} />}
		</span>
	);
}

/** a machine id with what a search found in it marked */
function Marked({ text, hit }: { text: string; hit: string }) {
	const q = hit.trim().toLowerCase();
	const at = q === "" ? -1 : text.toLowerCase().indexOf(q);
	if (at < 0) return text;
	return (
		<>
			{text.slice(0, at)}
			<mark className="rounded-[2px] bg-raised text-text">{text.slice(at, at + q.length)}</mark>
			{text.slice(at + q.length)}
		</>
	);
}
