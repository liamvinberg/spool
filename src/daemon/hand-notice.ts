import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { historyEnabled } from "./history";

/**
 * The one line a project with history off has earned (#253).
 *
 * Hand edits are ordinary working-tree changes, and in a project that keeps
 * history the daemon's own commits are what catch them. A project with
 * `history: false` has nothing catching them, which is worth saying — once.
 * Not a toast and not once a session: once per project, so the mark lives on
 * disk beside the rest of the app-owned state.
 */

function noticeFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "hands.json"));
}

/** Whether this write is the one that says it, and marks the project as told. */
export function uncaughtNotice(root: string): boolean {
	if (historyEnabled(root)) return false;
	try {
		const file = noticeFile(root);
		if (existsSync(file)) return false;
		writeAtomic(file, `${JSON.stringify({ uncaught: true }, null, "\t")}\n`);
		return true;
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		// an unwritable mark is not worth a refused edit: the notice is a
		// courtesy, and saying it twice is better than losing the write
		return true;
	}
}
