import { isAlive, readDaemonState, statusDaemon } from "./daemon/lifecycle";
import { CONTROL_HEADER } from "./daemon/security";
import { SpoolError } from "./errors";
import { forgetResolvedProject, resolveRegisteredRoot } from "./registry";

/** Forget a project and close its tab, without touching the project itself. */
export function removeProject(path: string, spoolDir: string): { root: string; removed: boolean } {
	const root = resolveRegisteredRoot(path);
	const result = forgetResolvedProject(spoolDir, root);
	return { root: result.root, removed: result.removed };
}

/**
 * `spool remove`: forget a project through the daemon when one runs, so it has stopped following the folder by the time
 * this returns, and a cleanup that deletes the folder next takes nothing from its team (#243). With no daemon, the
 * registry alone: a daemon that starts later never follows what it doesn't hold. A daemon that runs and doesn't say it
 * forgot is an error, never the registry alone, which it would read only after this had returned.
 */
export async function forgetProject(path: string, spoolDir: string): Promise<{ root: string; removed: boolean }> {
	const root = resolveRegisteredRoot(path);
	const recorded = readDaemonState(spoolDir);
	const daemon = await statusDaemon(spoolDir);
	const state = readDaemonState(spoolDir);
	if (!daemon.running || state?.pid !== daemon.pid) {
		// one recorded and alive that didn't answer may still follow the folder
		if (recorded !== undefined && isAlive(recorded.pid))
			throw new SpoolError(
				`the spool daemon (pid ${recorded.pid}) runs but didn't answer, so ${root} may still be followed; try again.`,
			);
		return removeProject(root, spoolDir);
	}
	let status: number;
	try {
		const response = await fetch(`${daemon.url}/api/projects/forget`, {
			method: "POST",
			headers: { [CONTROL_HEADER]: state.controlToken, "content-type": "application/json" },
			body: JSON.stringify({ root }),
			signal: AbortSignal.timeout(10_000),
		});
		status = response.status;
	} catch (error) {
		throw new SpoolError(
			`the spool daemon (pid ${daemon.pid}) didn't answer: ${String(error)}. ${root} may still be followed; try again.`,
		);
	}
	if (status === 204) return { root, removed: true };
	if (status === 404) return { root, removed: false };
	throw new SpoolError(`the spool daemon (pid ${daemon.pid}) couldn't forget ${root} (HTTP ${status}); try again.`);
}
