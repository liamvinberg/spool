import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frameFolder } from "../page-path";
import { frameRevision, isFrameSource } from "../team-sync-protocol";
import { realDesignDir } from "./design-path";

/**
 * A frame's source revision as this Mac's disk has it (spool#160): what a comment made on it now is made at, by the
 * same rule spool.page reads its copy with. Null when the frame isn't there.
 */
export async function frameRevisionOnDisk(root: string, frame: string): Promise<string | null> {
	const folder = frameFolder(frame);
	const hashes: string[] = [];
	let entry = false;
	const walk = (dir: string, under: string) => {
		for (const one of readdirSync(dir, { withFileTypes: true })) {
			const path = `${under}/${one.name}`;
			if (one.isDirectory()) walk(join(dir, one.name), path);
			else if (one.isFile() && isFrameSource(frame, path)) {
				if (path === `${folder}/frame.tsx`) entry = true;
				hashes.push(
					createHash("sha256")
						.update(readFileSync(join(dir, one.name)))
						.digest("hex"),
				);
			}
		}
	};
	try {
		walk(join(realDesignDir(root), ...folder.split("/")), folder);
	} catch {
		return null;
	}
	return entry ? frameRevision(hashes) : null;
}
