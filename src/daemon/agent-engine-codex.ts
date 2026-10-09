import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { type CodexRpc, createCodexRpc } from "./agent-codex-rpc";
import {
	CODEX_COMMAND,
	CODEX_MIN_VERSION,
	codexHandshake,
	planCodexSpawn,
	versionAtLeast,
	versionIn,
} from "./agent-codex-spawn";
import { startCodexTurn } from "./agent-codex-turn";
import { mountDesigner } from "./agent-designer";
import type { AgentEngine, EngineDeps } from "./agent-engine";
import { type AgentExecutor, probeAgent } from "./agent-exec";
import type { AgentAsk, AgentModel, AgentOffer } from "./agent-offer";
import { type AgentLogin, agentInstalled } from "./agent-preflight";

/**
 * Codex, the person's own, through `codex app-server` (#362).
 *
 * Installed means on `PATH` and at least `CODEX_MIN_VERSION`, so an older Codex is neither
 * listed nor picked as the fallback; one whose version cannot be read is left to the
 * handshake, which checks again. Sign-in is Codex's own
 * (`codex login` in a terminal); spool asks `account/read` and never manages a login. The
 * offer is `model/list`, live, with each model's own reasoning efforts. A thread is Codex's
 * own thread, resumed by the id spool keeps for it in its state directory.
 */

export interface CodexEngineOptions extends EngineDeps {
	/** spool's own version, which Codex is told in the handshake */
	readonly version: string;
	/**
	 * The installed Codex's version, or null when it cannot say. By default the real one,
	 * `codex --version`; where a test's `look` made the binary up, nothing is run and the
	 * version is unknown.
	 */
	readonly codexVersion?: () => string | null;
}

/** how long a version too old to run is believed before Codex is asked again, after an update */
const STALE_VERSION_MS = 10_000;

/**
 * `codex --version`, asked once and kept: a version spool runs stays good for the daemon's
 * life, and an old or unreadable one is asked again after a while, so updating Codex and
 * pressing Check again is enough. It runs off `PATH` the way a spawn does.
 */
function codexVersionReader(): () => string | null {
	let known: { version: string | null; at: number } | undefined;
	const good = (version: string | null) => version !== null && versionAtLeast(version, CODEX_MIN_VERSION);
	return () => {
		if (known !== undefined && (good(known.version) || Date.now() - known.at < STALE_VERSION_MS))
			return known.version;
		let version: string | null;
		try {
			version = versionIn(
				execFileSync(CODEX_COMMAND, ["--version"], {
					encoding: "utf8",
					timeout: 5_000,
					stdio: ["ignore", "pipe", "ignore"],
					windowsHide: true,
				}),
			);
		} catch {
			version = null;
		}
		known = { version, at: Date.now() };
		return version;
	};
}

/** a probe is a local process answering about itself; a cold start is a few seconds */
const PROBE_TIMEOUT_MS = 20_000;

const NOBODY: AgentLogin = { signedIn: false, account: null };

/**
 * Codex's model session for each spool thread, one small file per thread under spool's state.
 *
 * Codex mints the session's id (its `thread` on the wire) on `thread/start`, so it cannot be
 * the rail's id the way Claude's session is: spool holds the exact reference and hands it to
 * `thread/resume`. The folder keeps the wire's name, `codex/threads/`, so what earlier
 * versions stored is still read.
 */
export function codexSessions(spoolDir: string) {
	const dir = join(spoolDir, "codex", "threads");
	const file = (session: string) => join(dir, `${session.replace(/[^\w-]/g, "")}.json`);
	return {
		read(session: string): string | undefined {
			try {
				const stored = JSON.parse(readFileSync(file(session), "utf8")) as { thread?: unknown };
				return typeof stored.thread === "string" ? stored.thread : undefined;
			} catch {
				return undefined;
			}
		},
		write(session: string, thread: string): void {
			writeAtomic(file(session), `${JSON.stringify({ thread })}\n`);
		},
	};
}

/** One probe connection: spawn, handshake, one question, gone. */
async function askCodex<T>(
	executor: AgentExecutor,
	root: string,
	version: string,
	question: (rpc: CodexRpc) => Promise<T>,
	signal?: AbortSignal,
): Promise<T | undefined> {
	let proc: Awaited<ReturnType<AgentExecutor>>;
	try {
		proc = await executor(planCodexSpawn(root, process.env));
	} catch {
		return undefined;
	}
	const rpc = createCodexRpc(proc);
	proc.onLine((line) => rpc.read(line));
	let answer: T | undefined;
	await probeAgent(
		proc,
		PROBE_TIMEOUT_MS,
		(done) => {
			void (async () => {
				await codexHandshake(rpc, version);
				answer = await question(rpc);
			})()
				.catch(() => {})
				.finally(done);
		},
		signal,
	);
	rpc.close("The probe is over.");
	return answer;
}

interface CodexModel {
	readonly model?: unknown;
	readonly id?: unknown;
	readonly displayName?: unknown;
	readonly description?: unknown;
	readonly hidden?: unknown;
	readonly isDefault?: unknown;
	readonly defaultReasoningEffort?: unknown;
	readonly supportedReasoningEfforts?: unknown;
}

/** what `model/list` lists, every page of it, in Codex's order */
async function listModels(rpc: CodexRpc): Promise<CodexModel[]> {
	const models: CodexModel[] = [];
	let cursor: string | null = null;
	for (let page = 0; page < 20; page += 1) {
		const listed = (await rpc.request("model/list", cursor === null ? {} : { cursor })) as {
			data?: unknown;
			nextCursor?: unknown;
		} | null;
		if (Array.isArray(listed?.data)) models.push(...(listed.data as CodexModel[]));
		cursor = typeof listed?.nextCursor === "string" ? listed.nextCursor : null;
		if (cursor === null) break;
	}
	return models;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/** Codex's models as the menu's rows: each with the efforts that model reports. */
export function codexModelsOf(listed: readonly CodexModel[]): AgentModel[] {
	const models: AgentModel[] = [];
	for (const one of listed) {
		const value = text(one.model) ?? text(one.id);
		if (value === undefined || one.hidden === true || models.some((model) => model.value === value)) continue;
		const levels = Array.isArray(one.supportedReasoningEfforts)
			? one.supportedReasoningEfforts
					.map((level) => text((level as { reasoningEffort?: unknown })?.reasoningEffort))
					.filter((level) => level !== undefined)
			: [];
		models.push({
			value,
			resolvedModel: value,
			displayName: text(one.displayName) ?? value,
			description: text(one.description) ?? "",
			supportsEffort: levels.length > 0,
			supportedEffortLevels: levels,
		});
	}
	return models;
}

/**
 * What answers a turn: the asked model and effort where Codex offers them, else what the
 * person's own Codex config names, else Codex's default model at its default effort.
 */
export function codexOffer(
	listed: readonly CodexModel[],
	config: { model?: unknown; model_reasoning_effort?: unknown } | undefined,
	ask: AgentAsk,
): AgentOffer {
	const models = codexModelsOf(listed);
	const offered = (value: string | undefined) => models.find((model) => model.value === value);
	const fallback = listed.find((one) => one.isDefault === true);
	const model =
		offered(ask.value) ?? offered(text(config?.model)) ?? offered(text(fallback?.model) ?? text(fallback?.id));
	const levels = model?.supportedEffortLevels ?? [];
	const own = listed.find((one) => (text(one.model) ?? text(one.id)) === model?.value);
	const effort = [ask.effort, text(config?.model_reasoning_effort), text(own?.defaultReasoningEffort)].find(
		(level) => level !== undefined && levels.includes(level),
	);
	return {
		models,
		current: {
			value: model?.value ?? null,
			resolved: model?.value ?? null,
			name: model?.displayName ?? null,
			effort: effort ?? null,
			pin: null,
		},
	};
}

/**
 * What the ask becomes: only a model Codex lists, and only an effort that model lists.
 * An effort carries over to another model that has it and is dropped where it does not,
 * so the model's own default answers.
 */
export function codexChoice(offer: AgentOffer, wanted: AgentAsk, held: AgentAsk): AgentAsk {
	const value = wanted.value ?? held.value;
	const model = offer.models.find((one) => one.value === value);
	const effort = wanted.effort ?? held.effort;
	const levels = (model ?? offer.models.find((one) => one.value === offer.current.value))?.supportedEffortLevels ?? [];
	return {
		...(model === undefined ? {} : { value: model.value }),
		...(effort !== undefined && levels.includes(effort) ? { effort } : {}),
	};
}

export function createCodexEngine({
	executor,
	spoolDir,
	version,
	look,
	codexVersion = look === undefined ? codexVersionReader() : () => null,
}: CodexEngineOptions): AgentEngine {
	const sessions = codexSessions(spoolDir);
	/** each spool thread's "Allow for this chat" answers, kept in memory and written nowhere */
	const allowed = new Map<string, Set<string>>();
	const allowedIn = (thread: string) => {
		const scopes = allowed.get(thread) ?? new Set<string>();
		allowed.set(thread, scopes);
		return scopes;
	};
	return {
		id: "codex",
		installed: () => {
			if (!agentInstalled(process.env, CODEX_COMMAND, look)) return false;
			const installed = codexVersion();
			return installed === null || versionAtLeast(installed, CODEX_MIN_VERSION);
		},
		account: async (root, signal) => {
			const read = await askCodex(
				executor,
				root,
				version,
				(rpc) => rpc.request("account/read", {}) as Promise<{ account?: unknown } | null>,
				signal,
			);
			const account = read?.account;
			if (typeof account !== "object" || account === null) return NOBODY;
			const who = account as { email?: unknown; type?: unknown };
			return { signedIn: true, account: text(who.email) ?? null };
		},
		offer: async ({ root, ask, choose, signal }) => {
			const answer = await askCodex(
				executor,
				root,
				version,
				async (rpc) => {
					const listed = await listModels(rpc);
					const config = (await rpc.request("config/read", { cwd: root }).catch(() => undefined)) as
						| { config?: { model?: unknown; model_reasoning_effort?: unknown } }
						| undefined;
					return { listed, config: config?.config };
				},
				signal,
			);
			return codexOffer(answer?.listed ?? [], answer?.config, { ...ask, ...choose });
		},
		choice: codexChoice,
		continuable: (_root, session) => sessions.read(session.id) !== undefined,
		start: ({ root, session, said, ask, permissions }) =>
			startCodexTurn({
				executor,
				root,
				env: process.env,
				said,
				ask,
				permissions,
				session: sessions.read(session.id) ?? null,
				onSession: (thread) => sessions.write(session.id, thread),
				version,
				designer: mountDesigner(spoolDir, "codex"),
				allowed: allowedIn(session.id),
			}),
	};
}
