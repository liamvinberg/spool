import { type AgentExecutor, probeAgent } from "./agent-exec";
import { type AgentAsk, agentPromptLine, planAgentSpawn } from "./agent-spawn";

export type { AgentAsk };

/**
 * What a model picker picks from, and who knows it (#118, #199).
 *
 * Not spool. The binary knows, and it answers a question:
 *
 *   → {"type":"control_request","request_id":"req_1",
 *      "request":{"subtype":"list_models"}}
 *   ← {"models":[{"value":"opus[1m]","resolvedModel":"claude-opus-5[1m]",
 *                 "displayName":"Opus (1M context)",
 *                 "description":"Opus 5 with 1M context · Best for everyday, complex tasks",
 *                 "supportsEffort":true,
 *                 "supportedEffortLevels":["low","medium","high","xhigh","max"], …}, …]}
 *
 * `list_models` is a control request rather than a sentence to parse, and the
 * answer is the installed binary's rather than a table spool shipped. A new model
 * appears because the developer updated their CLI; a retired one disappears the
 * same way; spool cuts no release for either and caches nothing.
 *
 * **It answers with five choices, not with ten aliases.** `/model`'s usage line
 * accepts `sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m],
 * opusplan, default`; `list_models` offers five. The difference is inputs versus
 * choices, and it deletes two axes a picker would otherwise have invented: there
 * is no models-versus-policies split, because `default` comes back as an ordinary
 * row, and a 1M context window is one row rather than a model with a width switch
 * beside it.
 *
 * **Effort is a property of the model, as data.** Each entry carries
 * `supportsEffort` and its own `supportedEffortLevels`; `haiku` carries neither,
 * so on haiku there is no effort control to draw at all.
 */

/**
 * One offered choice, as much of `list_models` as anything reads.
 *
 * Optional where the reply omits rather than falsifies: `haiku` has no
 * `supportsEffort` key at all, so absence is the signal. The reply also carries
 * `supportsFastMode`, `supportsAdaptiveThinking` and `supportsAutoMode`, and none of
 * them is here: a field nothing renders is a field with no rule behind it, and the
 * reply is one request away for whichever ticket earns one.
 */
export interface AgentModel {
	readonly value: string;
	readonly resolvedModel: string;
	readonly displayName: string;
	readonly description: string;
	readonly supportsEffort?: boolean;
	readonly supportedEffortLevels?: readonly string[];
}

/**
 * What the binary says it is running, in its own words.
 *
 * The readout is drawn from this and from nothing spool decided, which is the whole
 * rule: a control that renders its own state is guessing, and one that renders the
 * report cannot be wrong. Measured, `/effort xhigh` against an exported
 * `CLAUDE_CODE_EFFORT_LEVEL=max` is refused and the variable is named in the
 * refusal, so what spool asked for and what is answering are two different facts.
 */
export interface AgentCurrent {
	/** the offered alias this resolves to, where the report names one */
	readonly value: string | null;
	/** the resolved model id `system/init` reported, which is the report itself */
	readonly resolved: string | null;
	/** the binary's own name for it, which is only read when no offered row matches */
	readonly name: string | null;
	readonly effort: string | null;
	/**
	 * The environment variable holding effort, which no in-session control can move.
	 *
	 * Read off the environment the daemon spawns with rather than out of a sentence,
	 * because it is a fact spool has directly. Measured on 2.1.220: with it exported,
	 * `/effort <level>` refuses and names it. Spool's own control goes the same route,
	 * so it is refused too — which is why the rows go dead rather than the menu
	 * pretending it can move something it cannot.
	 */
	readonly pin: string | null;
}

/** what one ask answers: what you may pick, and what is answering right now */
export interface AgentOffer {
	readonly models: readonly AgentModel[];
	readonly current: AgentCurrent;
}

/** one control request line, as the binary reads it off stdin */
export function listModelsRequestLine(request: string): string {
	return `${JSON.stringify({ type: "control_request", request_id: request, request: { subtype: "list_models" } })}\n`;
}

/**
 * The message the menu is a shortcut for.
 *
 * `/model haiku` and a click on `Haiku` are the same message to the same binary,
 * answered before the model ever sees it for zero turns and zero tokens — measured,
 * `num_turns: 0` and `total_cost_usd: 0`. The bare form is the question rather than
 * the change: it answers `Current model: Haiku 4.5 (effort: high)`, which is the one
 * place the binary reports both facts at once.
 */
export function modelCommand(value?: string): string {
	return value === undefined ? "/model" : `/model ${value}`;
}

export function effortCommand(level: string): string {
	return `/effort ${level}`;
}

/** the shape a level has to have to be an argument at all: one lowercase word */
const LEVEL = /^[a-z]+$/;

export function isEffortShaped(value: unknown): value is string {
	return typeof value === "string" && LEVEL.test(value);
}

/**
 * The shape an alias has to have to be an argument at all.
 *
 * Which aliases exist is the reply's business and never a list here — `askFrom` will not
 * keep one the binary did not resolve, so `--model` can only ever carry an offered row.
 * What this refuses is the one shape that is not a name: a leading dash, which is a
 * value being handed to argv where a flag would go.
 */
export function isModelShaped(value: unknown): value is string {
	return typeof value === "string" && value !== "" && !value.startsWith("-");
}

export function modelOf(models: readonly AgentModel[], value: string | null): AgentModel | undefined {
	return value === null ? undefined : models.find((model) => model.value === value);
}

const string = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const bool = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

function some<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
	return value === undefined ? ({} as { [P in K]?: V }) : ({ [key]: value } as { [P in K]?: V });
}

/**
 * The reply's models, read the way the adapter reads everything else: tolerantly.
 *
 * An entry with no `value` is not a choice — `/model` takes the value and a row
 * spool could not send is a row that lies when pressed — so it is dropped rather
 * than defaulted. Everything past that is optional in the reply and optional here.
 */
export function modelsOf(response: unknown): readonly AgentModel[] {
	if (typeof response !== "object" || response === null) return [];
	const listed = (response as { models?: unknown }).models;
	if (!Array.isArray(listed)) return [];
	const models: AgentModel[] = [];
	for (const raw of listed) {
		if (typeof raw !== "object" || raw === null) continue;
		const entry = raw as Record<string, unknown>;
		const value = string(entry.value);
		if (value === undefined || value === "") continue;
		const levels = Array.isArray(entry.supportedEffortLevels)
			? entry.supportedEffortLevels.filter((level): level is string => typeof level === "string")
			: undefined;
		models.push({
			value,
			resolvedModel: string(entry.resolvedModel) ?? value,
			// the name is the binary's own and there is nothing to fall back to but the
			// value, which is what `/model` takes and so is still the machine's own word
			displayName: string(entry.displayName) ?? value,
			description: string(entry.description) ?? "",
			...some("supportsEffort", bool(entry.supportsEffort)),
			...some("supportedEffortLevels", levels),
			...some("supportsFastMode", bool(entry.supportsFastMode)),
			...some("supportsAdaptiveThinking", bool(entry.supportsAdaptiveThinking)),
			...some("supportsAutoMode", bool(entry.supportsAutoMode)),
		});
	}
	return models;
}

/**
 * The effort the environment holds, or null where it holds none.
 *
 * Checked for shape and not for membership, for the same reason nothing else here is:
 * which levels exist is the binary's business, `/effort auto` is accepted and offered
 * by no model, and a list here would answer "that is not a pin" about a variable that
 * is plainly set. What the environment holds is what the menu says it holds.
 */
export function effortPin(env: Readonly<Record<string, string | undefined>>): string | null {
	const set = env.CLAUDE_CODE_EFFORT_LEVEL;
	return isEffortShaped(set) ? set : null;
}

/** `Current model: Haiku 4.5 (effort: high)` — the binary's own report, both facts */
const REPORT = /^Current model:\s*(.+?)(?:\s*\(effort:\s*([a-z]+)\))?\s*$/m;

/**
 * The two facts out of the bare `/model` reply.
 *
 * The name is the resolved product's rather than an offered row's, so it is only
 * ever the fallback: which row is current is answered by matching the resolved id
 * `system/init` reports, and this is what the footer says when nothing matches. The
 * effort clause is the only place any surface reports the level at all — `system/init`
 * carries no effort field, measured — so it is read here or nowhere.
 *
 * Absent where the reply is not that sentence. A shape that changed costs the effort
 * word, never the turn.
 */
export function reportOf(reply: string): { name: string | null; effort: string | null } {
	const found = REPORT.exec(reply);
	if (found === null) return { name: null, effort: null };
	return { name: found[1]?.trim() ?? null, effort: found[2] ?? null };
}

/**
 * Which offered row is answering, given what the binary resolved.
 *
 * Two rows can resolve to the same model — `Default (recommended)` and `Opus (1M
 * context)` both resolve to `claude-opus-5[1m]`, and the parenthetical is the only
 * thing telling them apart — so the ask breaks the tie: having asked for `opus[1m]`
 * and been given that model, the row answering is the one that was asked for. With
 * nothing asked the first match wins, which is `default`, and `Default
 * (recommended)` is the honest name for a machine nobody chose.
 */
export function offeredValue(
	models: readonly AgentModel[],
	resolved: string | null,
	asked: string | undefined,
): string | null {
	if (resolved === null) return asked !== undefined && models.some((m) => m.value === asked) ? asked : null;
	const matching = models.filter((model) => model.resolvedModel === resolved);
	if (matching.length === 0) return models.some((model) => model.value === resolved) ? resolved : null;
	if (asked !== undefined && matching.some((model) => model.value === asked)) return asked;
	return matching[0]?.value ?? null;
}

export interface AgentOfferOptions {
	readonly executor: AgentExecutor;
	readonly root: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	/** what the hands have asked for so far, which the probe is asked to confirm */
	readonly ask?: AgentAsk;
	/** the change being made, sent as the message the menu is a shortcut for */
	readonly choose?: AgentAsk;
	/** how long the binary gets to answer before the probe gives up on it */
	readonly timeoutMs?: number;
}

/** long enough for a cold spawn — measured at 1.4s on the machine this was written on */
const OFFER_TIMEOUT_MS = 15_000;

/** one id, because one probe asks one control request and quotes it back once */
const REQUEST = "spool-list-models";

interface WireResponse {
	readonly type?: string;
	readonly subtype?: string;
	readonly response?: { readonly subtype?: string; readonly request_id?: string; readonly response?: unknown };
	readonly model?: string;
	readonly result?: string;
	readonly is_error?: boolean;
}

/**
 * One spawn that answers the whole menu (#199).
 *
 * It asks three things of one process and spends no turn and no token on any of
 * them: the control request for what is offered, the change itself where one is
 * being made, and the bare `/model` for what is answering afterwards. Sending the
 * change as a *message* is what keeps the menu a shortcut rather than a second
 * source of truth — `/model haiku` typed into the composer is the same bytes — and
 * it is also what lets the binary refuse: an effort the environment holds is turned
 * down here, so spool never records a level it then passes to a spawn.
 *
 * Its own spawn rather than the turn's, because a turn is a process that lives as
 * long as the turn and the menu opens when nothing is running. The executor is the
 * same injectable seam the turn uses, so CI never spawns an agent for this either.
 */
export async function askAgentOffer({
	executor,
	root,
	env,
	ask,
	choose,
	timeoutMs = OFFER_TIMEOUT_MS,
}: AgentOfferOptions): Promise<AgentOffer> {
	const pin = effortPin(env);
	/**
	 * The probe is the turn's own spawn, and then the change on top of it.
	 *
	 * It carries the standing ask as flags because that is what the next turn will
	 * carry: a probe that started bare would report the binary's default on whichever
	 * axis was not being changed, so picking an effort level would flip the readout back
	 * to a model nobody had chosen — which is what a live daemon did before this line.
	 * The *change* is still a message, so the binary is still the one that decides.
	 *
	 * It carries no thread, and that is the one way it is not the turn's spawn (#200). A
	 * probe asks a question about the binary rather than continuing a conversation, and
	 * `/model haiku` is a local command the runtime records in whatever session it lands
	 * in — so resuming the thread's own session would write the menu's plumbing into the
	 * transcript the rail draws, and would put a second process on a session a turn may
	 * be holding.
	 */
	const spawn = planAgentSpawn(root, env, null, ask ?? {});
	let proc: Awaited<ReturnType<AgentExecutor>>;
	try {
		proc = await executor(spawn);
	} catch {
		// there is no binary to ask, which is the state #201 is about. Here it is an
		// offer with nothing in it: the menu opens on its usage line and offers no row,
		// rather than the door failing and the footer having nothing to say at all
		return { models: [], current: { value: null, resolved: null, name: null, effort: pin, pin } };
	}

	const wanted = choose ?? {};
	/** the change, then the question — in that order, so the report is of the change */
	const messages: string[] = [];
	if (wanted.value !== undefined) messages.push(modelCommand(wanted.value));
	// an effort the environment holds is not asked for: the refusal is already known,
	// and asking would put a sentence about it in a log nobody opened a menu to read
	if (wanted.effort !== undefined && pin === null) messages.push(effortCommand(wanted.effort));
	messages.push(modelCommand());

	let models: readonly AgentModel[] = [];
	let resolved: string | null = null;
	const replies: string[] = [];
	/** the control request has been answered, whether or not the answer held models */
	let listed = false;

	await probeAgent(proc, timeoutMs, (done) => {
		proc.onLine((line) => {
			let wire: WireResponse;
			try {
				wire = JSON.parse(line) as WireResponse;
			} catch {
				return;
			}
			if (wire.type === "control_response" && wire.response?.request_id === REQUEST) {
				listed = true;
				models = modelsOf(wire.response.response);
				return;
			}
			// every message boundary re-reports the model, so the last init is the model
			// the change landed on rather than the one the process started at
			if (wire.type === "system" && wire.subtype === "init" && typeof wire.model === "string") {
				resolved = wire.model;
				return;
			}
			if (wire.type !== "result") return;
			if (typeof wire.result === "string") replies.push(wire.result);
			// both halves have to have landed: the replies say what is answering and the
			// control response says what may be picked, and their order is the binary's
			if (listed && replies.length >= messages.length) done();
		});
		proc.write(listModelsRequestLine(REQUEST));
		for (const message of messages) proc.write(agentPromptLine([{ type: "text", text: message }]));
		proc.end();
	});

	const report = reportOf(replies.at(-1) ?? "");
	const value = offeredValue(models, resolved, wanted.value ?? ask?.value);
	return {
		models,
		current: {
			value,
			resolved,
			name: report.name,
			// the pin outranks the report, and the report agrees with it: what is drawn is
			// the level that is actually answering either way
			effort: pin ?? report.effort,
			pin,
		},
	};
}

/**
 * What the ask becomes once the binary has answered it.
 *
 * **The model the binary reported is the model the next spawn asks for**, which is the
 * same rule the readout is under and is why they cannot disagree. A change it refused
 * outright leaves the report where it was, because the probe started from the standing
 * ask; a change it resolved somewhere else — `/model opusplan` is accepted and lands on
 * Sonnet — leaves the report on where it landed, and the ask follows it rather than
 * insisting on a name the binary did not keep.
 *
 * **Effort is kept only where it was asked for and the report agrees.** Two things fall
 * out of that. A level the environment holds never becomes a flag: measured, `--effort`
 * outranks `CLAUDE_CODE_EFFORT_LEVEL`, so a flag off an unconfirmed ask would quietly
 * beat the variable that had just refused the same change in session. And the binary's
 * own default is never handed back to it as a flag, which would freeze a default that
 * can move.
 *
 * The model's own list is what says a level exists at all, so `auto` never becomes a
 * flag — `/effort auto` is accepted by the command and offered by no model — and a level
 * a later CLI adds needs no change here. A model reporting no levels carries none, so
 * switching to haiku drops the effort with it.
 */
export function askFrom(offer: AgentOffer, wanted: AgentAsk, held: AgentAsk): AgentAsk {
	// nothing asked carries nothing: handing the binary its own default back as a flag
	// would freeze a default that can move, and the readout reads it off the report anyway
	const asked = wanted.value ?? held.value;
	const level = wanted.effort ?? held.effort;
	const offered = modelOf(offer.models, offer.current.value)?.supportedEffortLevels ?? [];
	const levelled =
		level !== undefined && offer.current.pin === null && offer.current.effort === level && offered.includes(level);
	return {
		...some("value", asked === undefined ? undefined : (offer.current.value ?? undefined)),
		...some("effort", levelled ? level : undefined),
	};
}
