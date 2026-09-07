import { randomUUID } from "node:crypto";
import type { SourceOccurrence } from "../source-edit";

/** A source owner challenges the initiating canvas, which reads its original
 * iframe lease. HTTP occurrence fields alone cannot mint or complete a read. */
export function createSourceObservers() {
	const clients = new Map<
		string,
		{ root: string; send: (challenge: { id: string; frame: string; generation: number }) => void }
	>();
	const pending = new Map<
		string,
		{ root: string; observer: string; finish: (original: SourceOccurrence | undefined) => void }
	>();
	function connect(
		root: string,
		observer: string,
		send: (challenge: { id: string; frame: string; generation: number }) => void,
	) {
		const client = { root, send };
		clients.set(observer, client);
		return () => {
			if (clients.get(observer) !== client) return;
			clients.delete(observer);
			for (const held of pending.values()) if (held.observer === observer) held.finish(undefined);
		};
	}
	function verify(
		root: string,
		frame: string,
		generation: number,
		observer: string,
	): Promise<SourceOccurrence | undefined> {
		const client = clients.get(observer);
		if (!client || client.root !== root) return Promise.resolve(undefined);
		return new Promise((resolve) => {
			const id = randomUUID();
			const timer = setTimeout(() => finish(undefined), 4000);
			timer.unref();
			const finish = (original: SourceOccurrence | undefined) => {
				clearTimeout(timer);
				pending.delete(id);
				resolve(original);
			};
			pending.set(id, { root, observer, finish });
			client.send({ id, frame, generation });
		});
	}
	function reply(root: string, observer: string, id: string, original: SourceOccurrence | undefined): void {
		const held = pending.get(id);
		if (held?.root === root && held.observer === observer) held.finish(original);
	}
	return { connect, verify, reply };
}
