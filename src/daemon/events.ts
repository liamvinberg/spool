import { watch } from "node:fs";
import { join, sep } from "node:path";
import { frameKind } from "./projection";

export type ChangeEvent =
	| { kind: "frame"; frame: string }
	| { kind: "shared" }
	| { kind: "thumb"; frame: string }
	// a hands write to a frame.json sidecar (#23), published by the geometry
	// API so other browsers see the move — never emitted by the fs watcher
	| { kind: "geometry"; frame: string }
	// a session witnessed an edge (#25), published by the walked API — .spool
	// is invisible to the watcher, so the store announces its own writes
	| { kind: "walked" };
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
		const entry = roots.get(root) ?? start(root);
		roots.set(root, entry);
		entry.listeners.add(listener);
		return () => {
			entry.listeners.delete(listener);
			// the last subscriber takes the watcher with it — an idle daemon holds no fs handles
			if (entry.listeners.size === 0 && roots.get(root) === entry) {
				entry.stop();
				roots.delete(root);
			}
		};
	}

	function start(root: string): RootWatch {
		const listeners = new Set<Listener>();
		const pending = new Map<string, ChangeEvent>();
		let timer: NodeJS.Timeout | undefined;
		const entry: RootWatch = { listeners, stop: () => clear() };

		let watcher: ReturnType<typeof watch> | undefined;
		try {
			watcher = watch(join(root, "design"), { recursive: true }, (_type, filename) => {
				const event = classify(root, filename);
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
		} catch {
			// design/ vanished after registration: push degrades to silence — the
			// pull side (compile-on-request) stays the truth, so never crash for this
			return entry;
		}
		// an unhandled "error" event would kill the daemon; drop the watcher and
		// let the next subscriber start a fresh one
		watcher.on("error", () => {
			clear();
			if (roots.get(root) === entry) roots.delete(root);
		});

		function clear(): void {
			watcher?.close();
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
		}
		return entry;
	}

	function close(): void {
		for (const entry of roots.values()) entry.stop();
		roots.clear();
	}

	/**
	 * Daemon-originated events (thumbnail writes) ride the same stream as fs
	 * changes — .spool is invisible to the watcher by design, so the store
	 * announces its own writes.
	 */
	function publish(root: string, event: ChangeEvent): void {
		const entry = roots.get(root);
		if (entry === undefined) return;
		for (const emit of entry.listeners) emit(event);
	}

	return { subscribe, publish, close };
}

export type ChangeHub = ReturnType<typeof createChangeHub>;

/**
 * Only source-relevant paths become events: a frame folder names its frame,
 * anything in shared/ can stale every document. App-owned state (.spool/,
 * canvas.json) never fires — thumbnail writes must not echo as edits — and
 * neither does frame.json: geometry is hands-owned (#3), so a sidecar fill or
 * a resize must never read as a source edit and reload the frame. A top-level
 * folder without frame.tsx is a page (#39): its frame folders sit one deeper,
 * and the sidecar exemption moves down with them. A path a delete has made
 * unreadable may misname its frame — any frame event refreshes discovery, so
 * over-firing is safe and guessing wrong is cheap.
 */
function classify(root: string, filename: string | null): ChangeEvent | undefined {
	if (filename === null) return { kind: "shared" };
	const parts = filename.split(sep);
	const [head, first] = parts;
	if (head === "frames" && first !== undefined && first !== "") {
		if (parts.length >= 3 && frameKind(join(root, "design", "frames", first)) === undefined) {
			const second = parts[2];
			if (second === undefined || second === "") return { kind: "frame", frame: first };
			if (parts.length === 4 && parts[3]?.startsWith("frame.json") === true) return undefined;
			return { kind: "frame", frame: second };
		}
		if (parts.length === 3 && parts[2]?.startsWith("frame.json") === true) return undefined;
		return { kind: "frame", frame: first };
	}
	if (head === "shared") return { kind: "shared" };
	return undefined;
}
