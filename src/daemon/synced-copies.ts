import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * Which local copies on this machine have synced with which team project, by root, kept in the state folder rather
 * than in `design/.spool`, so a copy whose record of the team is lost (`sync.json` deleted, or naming another
 * project) is still known here as one that synced (#204, #117 open question 1). Such a copy takes the team's version
 * and keeps its differences as set-aside marks; one this machine never synced keeps the Get it rule.
 */
export interface SyncedCopies {
	/** Whether this machine has caught up a copy at `root` with the project at `url`. */
	before(root: string, url: string): boolean;
	/** A copy at `root` caught up with the project at `url`. */
	now(root: string, url: string): void;
}

export function syncedCopies(spoolDir: string): SyncedCopies {
	const file = join(spoolDir, "synced-copies.json");
	let known: Record<string, string> | undefined;
	const read = (): Record<string, string> => {
		if (known !== undefined) return known;
		try {
			const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
			known =
				typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
					? Object.fromEntries(
							Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
						)
					: {};
		} catch {
			known = {};
		}
		return known;
	};
	return {
		before: (root, url) => read()[root] === url,
		now(root, url) {
			const copies = read();
			if (copies[root] === url) return;
			copies[root] = url;
			try {
				writeAtomic(file, `${JSON.stringify(copies, null, "\t")}\n`);
			} catch {
				// a state folder that can't be written leaves a lost record to the Get it rule
			}
		},
	};
}
