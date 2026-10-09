import { isAbsolute, join, relative } from "node:path";
import type { AgentPermissions } from "../settings/registry";
import { createBackgroundHold } from "./agent-background";
import { type CodexAdapter, type CodexItem, callsOf, createCodexAdapter } from "./agent-codex";
import { type CodexRequestId, type CodexRpc, createCodexRpc } from "./agent-codex-rpc";
import {
	CODEX_MIN_VERSION,
	CODEX_MODES,
	codexHandshake,
	planCodexSpawn,
	SPOOL_READ_VERBS,
	versionAtLeast,
} from "./agent-codex-spawn";
import type { AgentReply } from "./agent-control";
import type { AgentMessage } from "./agent-engine";
import type { AgentAsking, AgentEvent, AgentRecovery } from "./agent-events";
import type { AgentExecutor, AgentProcess } from "./agent-exec";
import type { AgentAsk } from "./agent-spawn";
import type { AgentTurn } from "./agent-turn";

/**
 * One Codex turn, over `codex app-server` (#362).
 *
 * The same contract as Claude's runner in `agent-turn.ts`: start returns at once, events
 * come back in the order they arrive, answers and Stop go back up the same stdin. The
 * difference is the wire. A Claude turn is one prompt line and one stream; this is a
 * JSON-RPC conversation (handshake, sign-in check, thread start or resume, turn start),
 * and Codex's approvals are requests spool answers by id.
 *
 * One process per turn, as with Claude. The thread lives on in Codex's own session store
 * and the next turn resumes it by id, with that turn's mode, so a mode picked mid-turn
 * takes effect at the next turn boundary without anything being changed live.
 */

/** the grace an ended turn's process gets to exit on its own, as in `agent-turn.ts` */
const EXIT_GRACE_MS = 10_000;

/**
 * How long a turn whose sub-agents have all landed waits before it ends (#365). Codex does
 * not wake the main thread for a child that finished in the background, so this is only
 * long enough for a reply already on its way.
 */
const SETTLE_MS = 3_000;

export interface CodexTurnOptions {
	readonly executor: AgentExecutor;
	readonly root: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly said: readonly AgentMessage[];
	readonly ask: AgentAsk;
	readonly permissions: AgentPermissions;
	/** Codex's own thread id for a thread that already ran, to resume */
	readonly thread: string | null;
	/** Codex named the thread: the daemon keeps the id to resume it next turn */
	readonly onThread: (thread: string) => void;
	/** spool's version, for Codex's client info */
	readonly version: string;
	/** spool's designer role layer, in spool's state (#367) */
	readonly designer?: string;
}

/** what a signed-out Codex turn bounces as: the rail's sign-in recovery, Codex's own words */
const SIGNED_OUT: AgentRecovery = { kind: "login", account: "Codex", scope: "account" };

/** The person's input, as Codex's `UserInput` list: pictures first, then the words. */
export function codexInput(said: readonly AgentMessage[]): unknown[] {
	const input: unknown[] = [];
	for (const one of said) {
		for (const attachment of one.attachments ?? [])
			input.push({ type: "image", url: `data:${attachment.media};base64,${attachment.data}` });
		input.push({
			type: "text",
			text: one.selection === "" ? one.prompt : `${one.selection}\n\n${one.prompt}`,
			text_elements: [],
		});
	}
	return input;
}

/** a path inside the project's design/ folder, which never asks */
export function inDesign(root: string, path: string): boolean {
	const from = relative(join(root, "design"), isAbsolute(path) ? path : join(root, path));
	return from !== "" && !from.startsWith("..") && !isAbsolute(from);
}

/** shell syntax that could make a spool verb do more than read */
const SHELL = /[;&|<>`$(){}\n\\]/;

/** one command that is exactly a spool read-only verb, nothing chained or redirected */
export function isSpoolRead(command: string): boolean {
	const words = command.trim().split(/\s+/);
	if (SHELL.test(command) || words[0] !== "spool") return false;
	return words[1] !== undefined && SPOOL_READ_VERBS.includes(words[1]);
}

/**
 * Whether spool answers an approval itself, before the person sees it.
 *
 * A file change is quiet when every file it touches is in `design/`; Codex's request
 * carries no path, so the item Codex reported before asking is where the paths come from.
 * A command is quiet when every command Codex split it into is one of spool's read-only
 * verbs. Nothing else is, in any mode.
 */
export function quietApproval(
	root: string,
	method: string,
	params: Record<string, unknown>,
	item?: CodexItem,
): boolean {
	if (method === "item/fileChange/requestApproval") {
		const changes = Array.isArray(item?.changes) ? item.changes : [];
		return (
			changes.length > 0 &&
			changes.every((change) => {
				const path = (change as { path?: unknown })?.path;
				return typeof path === "string" && inDesign(root, path);
			})
		);
	}
	const actions = Array.isArray(params.commandActions) ? params.commandActions : [];
	const commands = actions.map((action) => (action as { command?: unknown })?.command);
	return commands.length > 0 && commands.every((command) => typeof command === "string" && isSpoolRead(command));
}

const DECISIONS = { allow: "accept", always: "acceptForSession", deny: "decline" } as const;

export function startCodexTurn(options: CodexTurnOptions): AgentTurn {
	const { executor, root, env, said, ask, permissions } = options;
	const adapter: CodexAdapter = createCodexAdapter();
	const queue: AgentEvent[] = [];
	let waiting: (() => void) | undefined;
	let finished = false;
	let stopped = false;
	let ended = false;
	let proc: AgentProcess | undefined;
	let rpc: CodexRpc | undefined;
	/** the turn Codex is running, which is what a Stop names */
	let turn: string | undefined;
	let interrupts = 0;
	let sent = 0;
	let leaving: ReturnType<typeof setTimeout> | undefined;
	/** what is waiting on the person, by the id an answer names */
	const asking = new Map<string, { id: CodexRequestId; event: AgentAsking }>();
	/** each sub-agent thread's running turn, which a Stop interrupts too (#365) */
	const children = new Map<string, string>();
	/**
	 * The turn lasts until the sub-agents it spawned have finished, not until the main
	 * thread's turn completes (#365): Codex completes the parent's turn while a child it
	 * did not wait for runs on.
	 */
	const background = createBackgroundHold({
		settleMs: SETTLE_MS,
		onSettled: (ending) => {
			push(ending);
			if (proc !== undefined) end(proc);
		},
	});

	function push(event: AgentEvent): void {
		if (finished) return;
		queue.push(event);
		waiting?.();
		waiting = undefined;
	}

	function finish(): void {
		if (finished) return;
		finished = true;
		waiting?.();
		waiting = undefined;
	}

	/** every press not yet sent, once there is a turn to name */
	function interruptSent(): void {
		if (rpc === undefined || adapter.main === null || turn === undefined) return;
		while (sent < interrupts) {
			sent += 1;
			rpc.request("turn/interrupt", { threadId: adapter.main, turnId: turn }).catch(() => {});
		}
		if (interrupts > 0) {
			// a stop ends the sub-agents the turn started as well
			for (const task of background.running()) {
				const child = children.get(task);
				if (child !== undefined) rpc.request("turn/interrupt", { threadId: task, turnId: child }).catch(() => {});
			}
			const held = background.stop();
			if (held !== undefined && proc !== undefined) {
				push(held);
				end(proc);
			}
		}
	}

	/** the turn is over: no more input, and the process is left to go */
	function end(target: AgentProcess): void {
		if (ended) return;
		ended = true;
		asking.clear();
		background.close();
		target.end();
		leaving ??= setTimeout(() => target.kill(), EXIT_GRACE_MS);
		leaving.unref?.();
	}

	function failed(target: AgentProcess, reason: string, recovery?: AgentRecovery): void {
		push({
			kind: "ended",
			ending: "failed",
			reason,
			stopReason: null,
			...(recovery === undefined ? {} : { recovery }),
			parent: null,
		});
		end(target);
	}

	function request(target: CodexRpc, id: CodexRequestId, method: string, raw: unknown): void {
		const params = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
		if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
			const itemId = typeof params.itemId === "string" ? params.itemId : undefined;
			const reported = itemId === undefined ? undefined : adapter.item(itemId);
			if (quietApproval(root, method, params, reported)) {
				target.respond(id, { decision: "accept" });
				return;
			}
			const item: CodexItem =
				reported ??
				(method === "item/fileChange/requestApproval"
					? { type: "fileChange", id: itemId ?? String(id), changes: [] }
					: { type: "commandExecution", id: itemId ?? String(id), ...params });
			const call = callsOf(item)[0];
			const offered = Array.isArray(params.availableDecisions)
				? params.availableDecisions.includes("acceptForSession")
				: method === "item/fileChange/requestApproval";
			const event: AgentAsking = {
				kind: "asking",
				request: String(id),
				call: itemId ?? null,
				tool: call?.tool ?? (method === "item/fileChange/requestApproval" ? "Edit" : "Bash"),
				display: null,
				input: call?.input ?? {},
				description: typeof params.reason === "string" ? params.reason : null,
				interaction: false,
				// "Allow for this chat" is Codex's own session-scoped accept, where it offers one
				suggestions: offered ? [{ decision: "acceptForSession" }] : [],
				parent: adapter.parentOf(typeof params.threadId === "string" ? params.threadId : undefined),
			};
			asking.set(event.request, { id, event });
			push(event);
			return;
		}
		// a connector's own form is declined where it arrives, as Claude's are
		if (method === "mcpServer/elicitation/request") {
			target.respond(id, { action: "decline", content: null, _meta: null });
			return;
		}
		// a request for wider sandbox permissions is granted nothing: the mode is the person's
		if (method === "item/permissions/requestApproval") {
			target.respond(id, { permissions: {}, scope: "turn" });
			return;
		}
		// anything else spool does not take part in is refused, so nothing waits on it
		target.refuse(id, `spool does not handle ${method}`);
	}

	async function run(started: AgentProcess, target: CodexRpc): Promise<void> {
		const handshake = await codexHandshake(target, options.version);
		if (handshake.version !== null && !versionAtLeast(handshake.version, CODEX_MIN_VERSION)) {
			failed(
				started,
				`Codex ${handshake.version} is older than ${CODEX_MIN_VERSION}, the oldest spool runs. Update it with npm i -g @openai/codex.`,
			);
			return;
		}
		// an older or odd Codex that cannot say who is signed in is asked nothing more: the
		// turn itself is the question then, as it is for Claude
		const account = (await target.request("account/read", {}).catch(() => undefined)) as
			| { account?: unknown; requiresOpenaiAuth?: unknown }
			| null
			| undefined;
		if (account?.account === null && account.requiresOpenaiAuth !== false) {
			failed(started, "Sign in to Codex to continue.", SIGNED_OUT);
			return;
		}
		const mode = CODEX_MODES[permissions];
		const settings = {
			cwd: root,
			approvalPolicy: mode.approvalPolicy,
			sandbox: mode.sandbox,
			...(ask.value === undefined ? {} : { model: ask.value }),
		};
		let opened: {
			thread?: { id?: unknown; cwd?: unknown };
			model?: unknown;
			approvalPolicy?: unknown;
			sandbox?: unknown;
		};
		try {
			opened = (await (options.thread === null
				? target.request("thread/start", settings)
				: target.request("thread/resume", {
						threadId: options.thread,
						excludeTurns: true,
						...settings,
					}))) as typeof opened;
		} catch (error) {
			// a thread Codex no longer has (its first turn never ran, or its session was removed)
			// starts again rather than refusing the person's message
			if (options.thread === null) throw error;
			opened = (await target.request("thread/start", settings)) as typeof opened;
		}
		const thread = typeof opened?.thread?.id === "string" ? opened.thread.id : undefined;
		if (thread === undefined) throw new Error("Codex started no thread.");
		adapter.main = thread;
		options.onThread(thread);
		const sandbox = (opened.sandbox as { type?: unknown } | undefined)?.type;
		push({
			kind: "ready",
			session: thread,
			model: typeof opened.model === "string" ? opened.model : null,
			cwd: typeof opened.thread?.cwd === "string" ? opened.thread.cwd : root,
			version: handshake.version,
			permissionMode: `${String(opened.approvalPolicy ?? mode.approvalPolicy)} ${String(sandbox ?? mode.sandbox)}`,
			apiKeySource: null,
			capabilities: [],
			parent: null,
		});
		const begun = (await target.request("turn/start", {
			threadId: thread,
			input: codexInput(said),
			...(ask.effort === undefined ? {} : { effort: ask.effort }),
		})) as { turn?: { id?: unknown } } | null;
		if (typeof begun?.turn?.id === "string") turn = begun.turn.id;
		interruptSent();
	}

	void (async () => {
		let started: AgentProcess;
		try {
			started = await executor(
				planCodexSpawn(root, env, {
					permissions,
					...(options.designer === undefined ? {} : { designer: options.designer }),
				}),
			);
		} catch (error) {
			push({
				kind: "closed",
				code: null,
				message: error instanceof Error ? error.message : String(error),
				parent: null,
			});
			finish();
			return;
		}
		proc = started;
		if (stopped) {
			started.kill();
			return;
		}
		const target = createCodexRpc(started);
		rpc = target;
		target.onRequest((id, method, params) => request(target, id, method, params));
		target.onNotification((method, params) => {
			// a turn that is over says nothing more, whatever a sub-agent still streams
			if (ended) return;
			const wire = (typeof params === "object" && params !== null ? params : {}) as {
				threadId?: unknown;
				turn?: { id?: unknown };
			};
			if (method === "turn/started" && wire.threadId === adapter.main && typeof wire.turn?.id === "string") {
				turn ??= wire.turn.id;
				interruptSent();
			}
			if (
				method === "turn/started" &&
				typeof wire.threadId === "string" &&
				wire.threadId !== adapter.main &&
				typeof wire.turn?.id === "string"
			)
				children.set(wire.threadId, wire.turn.id);
			for (const event of adapter.read(method, params)) {
				const read = background.read(event);
				for (const one of read.events) push(one);
				if (read.over) end(started);
			}
		});
		started.onLine((line) => target.read(line));
		started.onExit((code, message) => {
			if (leaving !== undefined) clearTimeout(leaving);
			asking.clear();
			target.close(message ?? "Codex exited.");
			push({ kind: "closed", code, ...(message === undefined ? {} : { message }), parent: null });
			finish();
		});
		try {
			await run(started, target);
		} catch (error) {
			if (!ended && !finished) failed(started, error instanceof Error ? error.message : String(error));
		}
	})();

	async function* events(): AsyncGenerator<AgentEvent> {
		for (;;) {
			while (queue.length > 0) yield queue.shift() as AgentEvent;
			if (finished) return;
			await new Promise<void>((resolve) => {
				waiting = resolve;
			});
		}
	}

	function answer(request: string, reply: AgentReply): boolean {
		const held = asking.get(request);
		if (held === undefined || rpc === undefined) return false;
		if (reply.kind !== "allow" && reply.kind !== "always" && reply.kind !== "deny") return false;
		if (reply.kind === "always" && held.event.suggestions.length === 0) return false;
		asking.delete(request);
		rpc.respond(held.id, { decision: DECISIONS[reply.kind] });
		push({ kind: "answered", request, answer: reply.kind, words: null, parent: held.event.parent });
		return true;
	}

	return {
		events: { [Symbol.asyncIterator]: () => events() },
		answer,
		interrupt: () => {
			if (finished || ended) return false;
			interrupts += 1;
			interruptSent();
			return true;
		},
		abandon: () => {
			stopped = true;
			background.close();
			if (leaving !== undefined) clearTimeout(leaving);
			asking.clear();
			rpc?.close("The turn was given up.");
			proc?.kill();
			finish();
		},
	};
}
