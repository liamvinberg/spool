import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { answerFits } from "./agent-control";
import type { AgentEngine, AgentLoginProgress } from "./agent-engine";
import type { AgentAsking, AgentEvent } from "./agent-events";
import type { AgentOffer } from "./agent-offer";
import type { AgentLogin } from "./agent-preflight";
import type { AgentTurn } from "./agent-turn";
import type { BundledReply, BundledRequest, HostOutput } from "./bundled-protocol";
import { privateDirectory } from "./bundled-store";

/** Only OS necessities enter the host; provider variables and user config roots stay out. */
export function bundledEnvironment(directory: string): NodeJS.ProcessEnv {
	const home = join(directory, "home");
	privateDirectory(home);
	const env: NodeJS.ProcessEnv = {
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: home,
		PI_CODING_AGENT_DIR: directory,
		SPOOL_BUNDLED_STATE: directory,
		PI_OFFLINE: "1",
	};
	for (const name of ["PATH", "SystemRoot", "WINDIR", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"]) {
		if (process.env[name] !== undefined) env[name] = process.env[name];
	}
	return env;
}

export type BundledLaunch = (directory: string) => ChildProcess;
function launch(directory: string): ChildProcess {
	const source = import.meta.url.endsWith(".ts");
	return fork(fileURLToPath(new URL(source ? "./bundled-host.ts" : "./bundled-host.js", import.meta.url)), [], {
		cwd: directory,
		env: bundledEnvironment(directory),
		execArgv: source ? ["--import", import.meta.resolve("tsx")] : [],
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
}

/** One lazy child, supervised by the daemon. A crash settles turns and never replays them. */
export class BundledHostClient {
	private child: ChildProcess | undefined;
	private readonly requests = new Map<
		string,
		{ resolve: (value: BundledReply) => void; reject: (error: Error) => void }
	>();
	private readonly turns = new Map<string, (event: AgentEvent) => void>();
	constructor(
		readonly directory: string,
		private readonly start = launch,
	) {}
	private host(): ChildProcess {
		if (this.child !== undefined) return this.child;
		privateDirectory(this.directory);
		const child = this.start(this.directory);
		this.child = child;
		child.on("message", (message: HostOutput) => {
			if (message.kind === "event") {
				this.turns.get(message.id)?.(message.event);
				if (message.event.kind === "closed") this.turns.delete(message.id);
				return;
			}
			const request = this.requests.get(message.id);
			this.requests.delete(message.id);
			if (message.kind === "reply") request?.resolve(message.value);
			else {
				request?.reject(new Error(message.message));
				this.turns.get(message.id)?.({ kind: "closed", code: 1, message: message.message, parent: null });
				this.turns.delete(message.id);
			}
		});
		const failed = () => {
			if (this.child !== child) return;
			this.child = undefined;
			for (const request of this.requests.values())
				request.reject(new Error("The bundled engine stopped. Try again."));
			this.requests.clear();
			for (const emit of this.turns.values())
				emit({
					kind: "closed",
					code: 1,
					message: "The bundled engine stopped. Send another message to continue.",
					parent: null,
				});
			this.turns.clear();
		};
		child.once("error", failed);
		child.once("exit", failed);
		return child;
	}
	request(request: BundledRequest): Promise<BundledReply> {
		return new Promise((resolve, reject) => {
			const child = this.host();
			const id = randomUUID();
			this.requests.set(id, { resolve, reject });
			child.send({ id, request }, (error) => {
				if (error) {
					this.requests.delete(id);
					reject(error);
				}
			});
		});
	}
	turn(request: Extract<BundledRequest, { kind: "turn" }>): AgentTurn {
		const id = randomUUID();
		const queue: AgentEvent[] = [];
		let wake: (() => void) | undefined;
		let finished = false;
		const asking = new Map<string, AgentAsking>();
		let applied = request.options.permissions;
		const emit = (event: AgentEvent) => {
			if (finished) return;
			if (event.kind === "asking") asking.set(event.request, event);
			if (event.kind === "answered") asking.delete(event.request);
			queue.push(event);
			if (event.kind === "closed") {
				finished = true;
				asking.clear();
				this.turns.delete(id);
			}
			wake?.();
		};
		// Deferring dispatch gives the daemon its ownership reservation before startup.
		queueMicrotask(() => {
			if (finished) return;
			try {
				this.turns.set(id, emit);
				this.host().send({ id, request }, (error) => {
					if (error)
						emit({ kind: "closed", code: 1, message: "Could not start the bundled engine", parent: null });
				});
			} catch {
				emit({ kind: "closed", code: 1, message: "Could not start the bundled engine", parent: null });
			}
		});
		const stop = () => {
			if (finished) return false;
			queueMicrotask(() => {
				void this.request({ kind: "stop", turn: id }).catch(() => {});
			});
			return true;
		};
		return {
			events: {
				async *[Symbol.asyncIterator]() {
					for (;;) {
						while (queue.length) {
							const event = queue.shift();
							if (event !== undefined) yield event;
						}
						if (finished) return;
						await new Promise<void>((resolve) => {
							wake = resolve;
						});
					}
				},
			},
			answer: (request, reply) => {
				const held = asking.get(request);
				if (!held || !answerFits(held, reply)) return false;
				asking.delete(request);
				void this.request({ kind: "answer", turn: id, request, reply }).catch(() => stop());
				return true;
			},
			permissions: {
				get applied() {
					return applied;
				},
				apply: async (mode) => {
					const result = await this.request({ kind: "permissions", turn: id, mode });
					if (result !== mode) throw new Error("Permission mode was not applied");
					applied = mode;
					return applied;
				},
			},
			interrupt: stop,
			abandon: () => {
				stop();
				emit({ kind: "closed", code: null, parent: null });
				this.turns.delete(id);
			},
		};
	}
	close(): void {
		const child = this.child;
		if (child === undefined) return;
		void this.request({ kind: "close" }).catch(() => child.kill());
		const timeout = setTimeout(() => child.kill(), 5_000);
		timeout.unref();
		child.once("exit", () => clearTimeout(timeout));
	}
}

export function createSpoolEngine(
	directory: string,
	client = new BundledHostClient(join(directory, "bundled")),
): AgentEngine {
	return {
		id: "spool",
		installed: () => true,
		account: async () => (await client.request({ kind: "account" })) as AgentLogin,
		offer: async ({ signal: _signal, ...options }) =>
			(await client.request({ kind: "offer", options })) as AgentOffer,
		choice: (offer, _wanted, _held) => ({
			...(offer.current.value === null ? {} : { value: offer.current.value }),
			...(offer.current.effort === null ? {} : { effort: offer.current.effort }),
		}),
		start: (options) => client.turn({ kind: "turn", options }),
		continuable: (_root, session) => existsSync(join(client.directory, "sessions", `${session.id}.jsonl`)),
		close: () => client.close(),
		authentication: {
			kind: "managed",
			start: async (provider, method) =>
				(await client.request({ kind: "login", provider, method })) as AgentLoginProgress,
			poll: async (id) => (await client.request({ kind: "login-poll", id })) as AgentLoginProgress,
			input: async (id, value, revision) =>
				(await client.request({
					kind: "login-input",
					id,
					value,
					...(revision === undefined ? {} : { revision }),
				})) as AgentLoginProgress,
			cancel: async (id) => {
				await client.request({ kind: "login-cancel", id });
			},
			logout: async (provider) => {
				await client.request({ kind: "disconnect", provider });
			},
		},
	};
}
