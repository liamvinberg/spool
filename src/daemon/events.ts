import { watch } from "node:fs";
import { join, sep } from "node:path";

export type ChangeEvent = { kind: "frame"; frame: string } | { kind: "shared" };
type Listener = (event: ChangeEvent) => void;

interface RootWatch {
	listeners: Set<Listener>;
	stop(): void;
}

const DEBOUNCE_MS = 40;

/**
 * Push side of the agent loop: one recursive design/ watcher per project,
 * started on the first subscriber, coalescing editor write-bursts into one
 * event per changed frame. The pull side (the compile cache) rehashes on
 * request and never depends on these events — a missed event costs a refresh,
 * never a stale document.
 */
export function createChangeHub() {
	const roots = new Map<string, RootWatch>();

	function subscribe(root: string, listener: Listener): () => void {
		let entry = roots.get(root);
		if (entry === undefined) {
			entry = start(root);
			roots.set(root, entry);
		}
		entry.listeners.add(listener);
		return () => entry.listeners.delete(listener);
	}

	function start(root: string): RootWatch {
		const listeners = new Set<Listener>();
		const pending = new Map<string, ChangeEvent>();
		let timer: NodeJS.Timeout | undefined;
		const watcher = watch(join(root, "design"), { recursive: true }, (_type, filename) => {
			const event = classify(filename);
			if (event === undefined) return;
			pending.set(event.kind === "frame" ? `frame ${event.frame}` : "shared", event);
			timer ??= setTimeout(() => {
				timer = undefined;
				const batch = [...pending.values()];
				pending.clear();
				for (const change of batch) {
					for (const emit of listeners) emit(change);
				}
			}, DEBOUNCE_MS);
		});
		const stop = () => {
			watcher.close();
			if (timer !== undefined) clearTimeout(timer);
		};
		return { listeners, stop };
	}

	function close(): void {
		for (const entry of roots.values()) entry.stop();
		roots.clear();
	}

	return { subscribe, close };
}

export type ChangeHub = ReturnType<typeof createChangeHub>;

/**
 * Only source-relevant paths become events: a frame folder names its frame,
 * anything in shared/ can stale every document. App-owned state (.spool/,
 * canvas.json) never fires — thumbnail writes must not echo as edits.
 */
function classify(filename: string | null): ChangeEvent | undefined {
	if (filename === null) return { kind: "shared" };
	const [head, frame] = filename.split(sep);
	if (head === "frames" && frame !== undefined && frame !== "") return { kind: "frame", frame };
	if (head === "shared") return { kind: "shared" };
	return undefined;
}
