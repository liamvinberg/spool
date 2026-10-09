import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { mountDesigner } from "./agent-designer";
import type { AgentEngine, AgentMessage } from "./agent-engine";
import { type AgentExecutor, type AgentProcess, probeAgent } from "./agent-exec";
import { type AgentAsk, type AgentModel, type AgentOffer, askFrom } from "./agent-offer";
import { piCommandLine, piModelValue } from "./agent-pi";
import { startPiTurn } from "./agent-pi-turn";
import { agentInstalled, type Look } from "./agent-preflight";
import { type AgentSpawn, piFraming } from "./agent-spawn";

/**
 * The person's own pi, driven through `pi --mode rpc` (#363).
 *
 * Everything is pi's: its login, its models, its settings and extensions, and its session
 * store. Spool adds its framing and a session id it chose, and keeps one thing of its own,
 * the exact file pi said each of spool's sessions lives in, so a thread continues in that
 * file and no other, wherever the person's pi keeps its sessions.
 *
 * Pi has no approvals and no permission modes, so its offer says so and the rail draws
 * no mode menu.
 */

export const PI_COMMAND = "pi";

/** a cold pi answers its first command in about three seconds; this is the backstop */
const PROBE_TIMEOUT_MS = 20_000;

/** where spool keeps each pi session's file, by the session id spool chose */
export function piSessionsFile(spoolDir: string): string {
	return join(spoolDir, "pi-sessions.json");
}

function readSessions(spoolDir: string): Record<string, string> {
	try {
		const data: unknown = JSON.parse(readFileSync(piSessionsFile(spoolDir), "utf8"));
		if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
		return Object.fromEntries(
			Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
		);
	} catch {
		return {};
	}
}

/**
 * The spawn for one pi process, in the project root.
 *
 * A session pi has written before is opened by its exact file. One it has not is created
 * under the id spool chose (`--session-id`), so the thread's id is the session's from its
 * first turn. A probe opens no session at all (`--no-session`): it asks pi a question
 * about itself and leaves nothing behind.
 *
 * A turn loads spool's designer extension (#367) from spool's state with `-e`, which pi
 * loads beside the person's own extensions without installing it anywhere.
 */
export function planPiSpawn(
	root: string,
	env: Readonly<Record<string, string | undefined>>,
	session: { readonly id: string; readonly file?: string } | null,
	ask: AgentAsk = {},
	designer?: string,
): AgentSpawn {
	return {
		command: PI_COMMAND,
		args: [
			"--mode",
			"rpc",
			...(session === null
				? ["--no-session"]
				: session.file === undefined
					? ["--session-id", session.id]
					: ["--session", session.file]),
			...(ask.value === undefined ? [] : ["--model", ask.value]),
			...(ask.effort === undefined ? [] : ["--thinking", ask.effort]),
			...(session === null || designer === undefined ? [] : ["-e", designer]),
			...(session === null ? [] : ["--append-system-prompt", piFraming()]),
		],
		cwd: root,
		env: { ...env },
	};
}

/** what one turn says, as pi's `prompt` command takes it */
export function piPrompt(said: readonly AgentMessage[]): Record<string, unknown> {
	const message = said
		.map((one) => (one.selection === "" ? one.prompt : `${one.selection}\n\n${one.prompt}`))
		.join("\n\n");
	const images = said.flatMap((one) =>
		(one.attachments ?? []).map((attachment) => ({
			type: "image",
			data: attachment.data,
			mimeType: attachment.media,
		})),
	);
	return { message, ...(images.length === 0 ? {} : { images }) };
}

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i;

/** a model whose endpoint is this machine: Ollama, LM Studio, llama.cpp and the like */
export function isLocalEndpoint(baseUrl: unknown): boolean {
	if (typeof baseUrl !== "string") return false;
	try {
		return LOOPBACK.test(new URL(baseUrl).hostname);
	} catch {
		return false;
	}
}

interface PiModel {
	readonly id?: unknown;
	readonly name?: unknown;
	readonly provider?: unknown;
	readonly baseUrl?: unknown;
}

interface PiReply {
	readonly id?: string;
	readonly type?: string;
	readonly success?: boolean;
	readonly data?: {
		readonly models?: readonly PiModel[];
		readonly levels?: readonly unknown[];
		readonly model?: PiModel;
		readonly thinkingLevel?: unknown;
	};
}

/** one model as the menu offers it, with the thinking levels pi reports for it */
function modelOf(model: PiModel, levels: readonly string[]): AgentModel | undefined {
	const value = piModelValue(model);
	if (value === null) return undefined;
	const effort = levels.filter((level) => level !== "off").length > 0;
	return {
		value,
		resolvedModel: value,
		displayName: typeof model.name === "string" && model.name !== "" ? model.name : value,
		description: typeof model.provider === "string" ? model.provider : "",
		...(effort ? { supportsEffort: true, supportedEffortLevels: levels } : {}),
		...(isLocalEndpoint(model.baseUrl) ? { local: true } : {}),
	};
}

const NOTHING: AgentOffer = {
	models: [],
	current: { value: null, resolved: null, name: null, effort: null, pin: null },
	modes: false,
};

/**
 * Ask pi what it offers, one command at a time (#363).
 *
 * `get_available_models` lists only models pi has a login or key for, so an empty list is
 * also the account answer. Thinking levels are per model and only pi knows them: each
 * model is set in this throwaway session and asked, which persists nothing because the
 * process opened no session and RPC never saves a default.
 */
export async function askPiOffer(
	executor: AgentExecutor,
	root: string,
	ask: AgentAsk,
	options: { levels: boolean; signal?: AbortSignal },
): Promise<AgentOffer> {
	let proc: AgentProcess;
	try {
		proc = await executor(planPiSpawn(root, process.env, null, ask));
	} catch {
		return NOTHING;
	}
	let state: PiReply["data"] | undefined;
	let listed: readonly PiModel[] = [];
	const models: AgentModel[] = [];
	await probeAgent(
		proc,
		PROBE_TIMEOUT_MS,
		(done) => {
			let asked = 0;
			const replies = new Map<string, (reply: PiReply) => void>();
			const send = (command: Record<string, unknown>) =>
				new Promise<PiReply>((resolve) => {
					const id = `spool-${++asked}`;
					replies.set(id, resolve);
					proc.write(piCommandLine({ id, ...command }));
				});
			proc.onLine((line) => {
				let wire: PiReply;
				try {
					wire = JSON.parse(line) as PiReply;
				} catch {
					return;
				}
				if (wire.type !== "response" || wire.id === undefined) return;
				replies.get(wire.id)?.(wire);
				replies.delete(wire.id);
			});
			void (async () => {
				state = (await send({ type: "get_state" })).data;
				listed = (await send({ type: "get_available_models" })).data?.models ?? [];
				for (const model of listed) {
					let levels: readonly string[] = [];
					if (options.levels) {
						const set = await send({ type: "set_model", provider: model.provider, modelId: model.id });
						if (set.success === true) {
							const reply = await send({ type: "get_available_thinking_levels" });
							levels = (reply.data?.levels ?? []).filter((level): level is string => typeof level === "string");
						}
					}
					const offered = modelOf(model, levels);
					if (offered !== undefined) models.push(offered);
				}
				proc.end();
				done();
			})();
		},
		options.signal,
	);
	const value = piModelValue(state?.model);
	return {
		models,
		current: {
			value: value !== null && models.some((model) => model.value === value) ? value : null,
			resolved: value,
			name: typeof state?.model?.name === "string" ? state.model.name : null,
			effort: typeof state?.thinkingLevel === "string" ? state.thinkingLevel : null,
			pin: null,
		},
		modes: false,
	};
}

export function createPiEngine(spoolDir: string, executor: AgentExecutor, look?: Look): AgentEngine {
	function remember(id: string, file: string): void {
		const sessions = readSessions(spoolDir);
		if (sessions[id] === file) return;
		writeAtomic(piSessionsFile(spoolDir), `${JSON.stringify({ ...sessions, [id]: file }, null, "\t")}\n`);
	}
	return {
		id: "pi",
		// pi signs in from inside its own session, with `/login`
		authentication: { kind: "external", command: "pi" },
		installed: () => agentInstalled(process.env, look, PI_COMMAND),
		account: async (root, signal) => {
			const offer = await askPiOffer(executor, root, {}, { levels: false, ...(signal ? { signal } : {}) });
			return { signedIn: offer.models.length > 0, account: null };
		},
		offer: ({ root, ask, choose, signal }) =>
			askPiOffer(executor, root, { ...ask, ...choose }, { levels: true, ...(signal ? { signal } : {}) }),
		choice: askFrom,
		continuable: (_root, session) => {
			const file = readSessions(spoolDir)[session.id];
			return file !== undefined && existsSync(file);
		},
		start: ({ root, session, said, ask }) => {
			const file = readSessions(spoolDir)[session.id];
			return startPiTurn({
				executor,
				spawn: planPiSpawn(
					root,
					process.env,
					file !== undefined && existsSync(file) ? { id: session.id, file } : { id: session.id },
					ask,
					mountDesigner(spoolDir).pi,
				),
				prompt: piPrompt(said),
				...(ask.value === undefined ? {} : { model: ask.value }),
				onSession: ({ id, file: written }) => {
					// pi names the session it opened; spool keeps where, under the id it chose
					if (id === session.id) remember(id, written);
				},
			});
		},
	};
}
