import type { AgentProcess } from "./agent-exec";

/**
 * The JSON-RPC conversation `codex app-server` holds over stdio (#362).
 *
 * One JSON object per line in both directions. Spool's requests carry its own numeric ids
 * and get one response each; Codex sends notifications, and requests of its own (an
 * approval, an elicitation) that wait on a response from spool for as long as that takes.
 * The `"jsonrpc"` field is left off, as Codex leaves it off.
 *
 * This is transport only: what a method means is the turn runner's and the adapter's.
 */

export class CodexRpcError extends Error {
	constructor(
		readonly code: number | null,
		message: string,
	) {
		super(message);
	}
}

export type CodexRequestId = number | string;

export interface CodexRpc {
	request(method: string, params?: unknown): Promise<unknown>;
	notify(method: string, params?: unknown): void;
	/** answer a request Codex sent */
	respond(id: CodexRequestId, result: unknown): void;
	/** refuse a request Codex sent, so it never waits on spool for nothing */
	refuse(id: CodexRequestId, message: string): void;
	onNotification(cb: (method: string, params: unknown) => void): void;
	onRequest(cb: (id: CodexRequestId, method: string, params: unknown) => void): void;
	/** one line off stdout */
	read(line: string): void;
	/** the process is gone: every request still out is answered with this */
	close(message: string): void;
}

interface Pending {
	resolve(result: unknown): void;
	reject(error: Error): void;
}

export function createCodexRpc(proc: Pick<AgentProcess, "write">): CodexRpc {
	let next = 0;
	const pending = new Map<CodexRequestId, Pending>();
	let notification: (method: string, params: unknown) => void = () => {};
	let request: (id: CodexRequestId, method: string, params: unknown) => void = () => {};
	let closed: string | undefined;
	const send = (message: Record<string, unknown>) => proc.write(`${JSON.stringify(message)}\n`);
	return {
		request(method, params) {
			if (closed !== undefined) return Promise.reject(new CodexRpcError(null, closed));
			next += 1;
			const id = next;
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				send(params === undefined ? { id, method } : { id, method, params });
			});
		},
		notify(method, params) {
			send(params === undefined ? { method } : { method, params });
		},
		respond(id, result) {
			send({ id, result });
		},
		refuse(id, message) {
			send({ id, error: { code: -32601, message } });
		},
		onNotification(cb) {
			notification = cb;
		},
		onRequest(cb) {
			request = cb;
		},
		read(line) {
			let wire: { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: unknown };
			try {
				wire = JSON.parse(line);
			} catch {
				return;
			}
			if (typeof wire !== "object" || wire === null) return;
			const id = typeof wire.id === "number" || typeof wire.id === "string" ? wire.id : undefined;
			if (typeof wire.method === "string") {
				if (id === undefined) notification(wire.method, wire.params);
				else request(id, wire.method, wire.params);
				return;
			}
			if (id === undefined) return;
			const waiting = pending.get(id);
			if (waiting === undefined) return;
			pending.delete(id);
			if (wire.error !== undefined && wire.error !== null) {
				const error = wire.error as { code?: unknown; message?: unknown };
				waiting.reject(
					new CodexRpcError(
						typeof error.code === "number" ? error.code : null,
						typeof error.message === "string" ? error.message : "Codex refused the request.",
					),
				);
			} else waiting.resolve(wire.result);
		},
		close(message) {
			closed = message;
			for (const waiting of pending.values()) waiting.reject(new CodexRpcError(null, message));
			pending.clear();
		},
	};
}
