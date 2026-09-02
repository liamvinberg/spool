import { mkdirSync, watch } from "node:fs";
import { mutateMachineState, type SessionMutationResult } from "../machine-state";
import { type AppSession, type Registry, readMachineRegistry, readMachineSession } from "../machine-state-files";

/**
 * The app session in ~/.spool/session.json: which projects are open as tabs
 * (#4 — one tab per open project, session restored on relaunch; #12 — the
 * daemon page behaves like the app, so the session is machine-global while
 * focus stays per-browser). `spool init` and `spool open` write the registry
 * and session together; the daemon watches both files only to notify pages.
 */

export type { AppSession, SessionMutationResult };

const SESSION_FILE = "session.json";
const DEBOUNCE_MS = 40;

export type AppEvent =
	| { kind: "registry" }
	| { kind: "session" }
	| { kind: "update"; latest: string }
	// the checkout rebuilt its UI bundle under the pages already running the old
	// one. Only `pnpm dev serve --foreground` can say this; a published daemon
	// serves a bundle that never moves and emits it never.
	| { kind: "ui" };

export interface MachineStateWatchAdapter {
	subscribe(
		spoolDir: string,
		changed: (filename: string | null) => void,
		failed: (error: Error) => void,
	): { close(): void };
	schedule(reconcile: () => void): { cancel(): void };
}

interface MachineStateWatchOptions {
	adapter?: MachineStateWatchAdapter;
	onError?: (error: Error) => void;
}

const nodeMachineStateWatch: MachineStateWatchAdapter = {
	subscribe: (spoolDir, changed, failed) => {
		const watcher = watch(spoolDir, { encoding: "utf8" }, (_type, filename) => changed(filename));
		watcher.on("error", failed);
		return { close: () => watcher.close() };
	},
	schedule: (reconcile) => {
		const timer = setTimeout(reconcile, DEBOUNCE_MS);
		return { cancel: () => clearTimeout(timer) };
	},
};

export function readSession(spoolDir: string): AppSession {
	return readMachineSession(spoolDir);
}

export function writeSession(spoolDir: string, session: AppSession): void {
	mutateMachineState(spoolDir, { kind: "write-session", session });
}

/** Register one canonical project root and durably open its tab as one mutation. */
export function registerAndOpenProject(spoolDir: string, root: string): void {
	mutateMachineState(spoolDir, { kind: "register-and-open-project", root });
}

/** Open or close one tab against the current list, preserving concurrent changes. */
export function updateSession(spoolDir: string, root: string, open: boolean): SessionMutationResult {
	return mutateMachineState(spoolDir, { kind: "update-session", root, open });
}

/** Arrange the tabs somebody dragged, opening and closing nothing. */
export function orderSession(spoolDir: string, order: readonly string[]): AppSession {
	return mutateMachineState(spoolDir, { kind: "order-session", order });
}

/**
 * Observe ~/.spool registry and session writes and notify already-running
 * pages. Commands own the state transition; the watcher never infers one file
 * from the timing of the other.
 */
export function watchMachineState(
	spoolDir: string,
	emit: (event: AppEvent) => void,
	options?: MachineStateWatchOptions,
): {
	stop(): void;
	acknowledgeRegistry(registry: Registry): void;
	acknowledgeSession(session: AppSession): void;
} {
	mkdirSync(spoolDir, { recursive: true });
	let registry = registrySnapshot(spoolDir);
	let session = readSession(spoolDir);
	let pending: { cancel(): void } | undefined;
	let subscription: { close(): void } | undefined;
	let stopped = false;
	const adapter = options?.adapter ?? nodeMachineStateWatch;
	const reportError =
		options?.onError ?? ((error: Error) => console.error(`spool: machine-state watch failed: ${error.message}`));

	const startedSubscription = adapter.subscribe(
		spoolDir,
		(filename) => {
			if (stopped) return;
			if (filename !== null && !filename.startsWith("registry.json") && !filename.startsWith(SESSION_FILE)) {
				return;
			}
			if (pending === undefined) {
				let ranSynchronously = false;
				const scheduled = adapter.schedule(() => {
					ranSynchronously = true;
					pending = undefined;
					reconcile();
				});
				if (!ranSynchronously) pending = scheduled;
			}
		},
		(error) => {
			if (stopped) return;
			stop();
			reportError(error);
		},
	);
	if (stopped) startedSubscription.close();
	else {
		subscription = startedSubscription;
		reconcile();
	}

	function reconcile(): void {
		if (stopped) return;
		let nextRegistry: Map<string, string>;
		let nextSession: AppSession;
		try {
			nextRegistry = registrySnapshot(spoolDir);
			nextSession = readSession(spoolDir);
		} catch (error) {
			reportError(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		const registryChanged = !sameRegistry(nextRegistry, registry);
		const sessionChanged = !sameSession(nextSession, session);
		registry = nextRegistry;
		session = nextSession;

		if (registryChanged) emit({ kind: "registry" });
		if (sessionChanged) emit({ kind: "session" });
	}

	function stop(): void {
		if (stopped) return;
		stopped = true;
		subscription?.close();
		subscription = undefined;
		pending?.cancel();
		pending = undefined;
	}

	return {
		stop,
		// API mutations publish immediately. Keep this watcher snapshot at the exact
		// state just written, so its later filesystem notification is not replayed.
		// A concurrent external write remains different from this known snapshot.
		acknowledgeRegistry: (written) => {
			registry = registryEntries(written);
		},
		acknowledgeSession: (written) => {
			session = written;
		},
	};
}

function sameRegistry(left: Map<string, string>, right: Map<string, string>): boolean {
	return left.size === right.size && [...left].every(([root, openedAt]) => right.get(root) === openedAt);
}

function sameSession(left: AppSession, right: AppSession): boolean {
	return left.open.length === right.open.length && left.open.every((root, index) => root === right.open[index]);
}

function registrySnapshot(spoolDir: string): Map<string, string> {
	return registryEntries(readMachineRegistry(spoolDir));
}

function registryEntries(registry: Registry): Map<string, string> {
	return new Map(registry.projects.map((project) => [project.root, project.openedAt]));
}
