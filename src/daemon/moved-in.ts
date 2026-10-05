import { existsSync, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { isTeamProject, PROJECT_LINK } from "../team-project";
import { watchFolder } from "./watch-tree";

/**
 * A teammate's project moved into its team (DEV-190), seen from this Mac: pulling the move commit takes `design/` out
 * of git, so git deletes it here and lays `spool.json` down. That is git's doing and no one's save, and nothing here
 * syncs it: the folder is refilled from the team instead, and from then on it is a local copy like any other.
 *
 * Every registered project that isn't a team project yet is watched for its `spool.json` arriving (one watch on the
 * root folder itself, not its tree). A team project with no `design/` on this Mac, found on start or on arrival, is
 * handed to `refill`; one that already has its `design/` to `arrived`, so the daemon follows it.
 */
export function watchForMoves(deps: {
	refill: (root: string) => Promise<void>;
	arrived: (root: string) => void;
	notice?: (message: string) => void;
}) {
	const watched = new Map<string, FSWatcher>();
	const refilling = new Set<string>();
	const settling = new Map<string, NodeJS.Timeout>();
	let closed = false;

	const look = (root: string) => {
		if (closed || !isTeamProject(root)) return;
		watched.get(root)?.close();
		watched.delete(root);
		if (existsSync(join(root, "design", "canvas.json"))) return deps.arrived(root);
		if (refilling.has(root)) return;
		refilling.add(root);
		void deps
			.refill(root)
			.catch((error: unknown) =>
				(deps.notice ?? console.error)(
					`couldn't refill ${root} from its team: ${error instanceof Error ? error.message : String(error)}`,
				),
			)
			.finally(() => refilling.delete(root));
	};

	return {
		keeping(roots: readonly string[]): void {
			if (closed) return;
			for (const [root, watcher] of watched)
				if (!roots.includes(root)) {
					watcher.close();
					watched.delete(root);
				}
			for (const root of roots) {
				if (isTeamProject(root)) {
					if (!existsSync(join(root, "design", "canvas.json"))) look(root);
					continue;
				}
				if (watched.has(root)) continue;
				try {
					const watcher = watchFolder(root, {}, (_type, name) => {
						if (name !== null && name !== PROJECT_LINK) return;
						// git lays spool.json down and takes design/ away in one checkout: let it finish first
						clearTimeout(settling.get(root));
						const timer = setTimeout(() => {
							settling.delete(root);
							look(root);
						}, 300);
						timer.unref?.();
						settling.set(root, timer);
					});
					watcher.on("error", () => {
						watcher.close();
						watched.delete(root);
					});
					watched.set(root, watcher);
				} catch {
					// a root that can't be watched is looked at again on the next start
				}
			}
		},
		close(): void {
			closed = true;
			for (const watcher of watched.values()) watcher.close();
			watched.clear();
			for (const timer of settling.values()) clearTimeout(timer);
			settling.clear();
		},
	};
}
