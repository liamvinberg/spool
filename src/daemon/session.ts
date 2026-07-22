import { readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { readRegistry } from "../registry";

/**
 * The app session in ~/.spool/session.json: which projects are open as tabs
 * (#4 — one tab per open project, session restored on relaunch; #12 — the
 * daemon page behaves like the app, so the session is machine-global while
 * focus stays per-browser). `spool open` is daemon-less and writes only the
 * registry; the daemon watches the registry file and opens the tab itself —
 * that watch is what "open registers live via SSE" rides on.
 */

export interface AppSession {
	open: string[];
}

const SESSION_FILE = "session.json";
const DEBOUNCE_MS = 40;

export type AppEvent = { kind: "registry" } | { kind: "session" } | { kind: "update"; latest: string };

export function readSession(spoolDir: string): AppSession {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(join(spoolDir, SESSION_FILE), "utf8"));
	} catch {
		return { open: [] };
	}
	if (typeof parsed !== "object" || parsed === null) return { open: [] };
	const open = (parsed as Record<string, unknown>).open;
	if (!Array.isArray(open) || !open.every((root) => typeof root === "string")) return { open: [] };
	return { open };
}

export function writeSession(spoolDir: string, session: AppSession): void {
	writeAtomic(join(spoolDir, SESSION_FILE), `${JSON.stringify(session, null, "\t")}\n`);
}

/**
 * Watch ~/.spool for registry writes. A project whose openedAt is new or
 * bumped was just init'd or opened — ensure its tab exists (background: the
 * session gains it, no browser's focus moves) and tell every connected page.
 */
export function watchRegistry(spoolDir: string, emit: (event: AppEvent) => void): () => void {
	let snapshot = registrySnapshot(spoolDir);
	let timer: NodeJS.Timeout | undefined;

	let watcher: ReturnType<typeof watch> | undefined;
	try {
		watcher = watch(spoolDir, (_type, filename) => {
			if (filename !== null && !filename.startsWith("registry.json")) return;
			timer ??= setTimeout(() => {
				timer = undefined;
				settle();
			}, DEBOUNCE_MS);
		});
	} catch {
		// ~/.spool not there yet: no registry to watch — first write recreates
		// the daemon's interest on next boot; the API paths still work
		return () => {};
	}
	watcher.on("error", () => stop());

	function settle(): void {
		const next = registrySnapshot(spoolDir);
		const opened = [...next.entries()]
			.filter(([root, openedAt]) => snapshot.get(root) !== openedAt)
			.map(([root]) => root);
		if (opened.length === 0 && next.size === snapshot.size) return;
		snapshot = next;
		emit({ kind: "registry" });
		const session = readSession(spoolDir);
		const missing = opened.filter((root) => !session.open.includes(root));
		if (missing.length > 0) {
			writeSession(spoolDir, { open: [...session.open, ...missing] });
			emit({ kind: "session" });
		}
	}

	function stop(): void {
		watcher?.close();
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	return stop;
}

function registrySnapshot(spoolDir: string): Map<string, string> {
	try {
		return new Map(readRegistry(spoolDir).projects.map((project) => [project.root, project.openedAt]));
	} catch {
		return new Map();
	}
}
