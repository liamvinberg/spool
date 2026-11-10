import { readDaemonState, statusDaemon } from "./daemon/lifecycle";
import { CONTROL_HEADER } from "./daemon/security";
import { forgetResolvedProject, resolveRegisteredRoot } from "./registry";

/** Forget a project and close its tab, without touching the project itself. */
export function removeProject(path: string, spoolDir: string): { root: string; removed: boolean } {
	const root = resolveRegisteredRoot(path);
	const result = forgetResolvedProject(spoolDir, root);
	return { root: result.root, removed: result.removed };
}

/**
 * `spool remove`: forget a project through the daemon when one runs, so it has stopped following the folder by the time
 * this returns, and a cleanup that deletes the folder next takes nothing from its team (#243). With no daemon, or one
 * that can't be reached, the registry alone; a daemon that starts later never follows what it doesn't hold.
 */
export async function forgetProject(path: string, spoolDir: string): Promise<{ root: string; removed: boolean }> {
	const root = resolveRegisteredRoot(path);
	const daemon = await statusDaemon(spoolDir);
	const state = readDaemonState(spoolDir);
	if (daemon.running && state?.pid === daemon.pid) {
		try {
			const response = await fetch(`${daemon.url}/api/projects/forget`, {
				method: "POST",
				headers: { [CONTROL_HEADER]: state.controlToken, "content-type": "application/json" },
				body: JSON.stringify({ root }),
				signal: AbortSignal.timeout(5_000),
			});
			if (response.status === 204) return { root, removed: true };
			if (response.status === 404) return { root, removed: false };
		} catch {
			// the daemon didn't answer: the registry alone, which its watch reads in a moment
		}
	}
	return removeProject(root, spoolDir);
}
