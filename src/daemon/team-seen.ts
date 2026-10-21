import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SeenAsk } from "../cloud-teams";
import { CANVAS_PATH, type SeenAnswer } from "../team-sync-protocol";

/**
 * A `design/` spool never synced, each file classed against the team's history before it first connects
 * (spool#196), so Get it brings it level with the team instead of pushing it up blind:
 *
 * - **same**: the team's current version. Kept.
 * - **older**: a version the team had at that path, a delete included. The team's current state lands over it, so
 *   nothing goes up and a frame the team deleted never comes back.
 * - **only**: a path the team never had, or one it deleted that this never matched: an edit beats a delete. Goes up.
 * - **changed**: the team has its own version there that this never matched. The team's lands, and this one is set
 *   aside with today's mark. `canvas.json` is the exception: it is merged key by key, never set aside.
 */
export type FileKind = "same" | "older" | "only" | "changed";

export interface ClassedFile {
	path: string;
	hash: string;
	kind: FileKind;
	/** What the team holds at the path now. */
	team: "file" | "deleted" | "none";
}

export interface DesignClasses {
	files: ClassedFile[];
	/** How many paths the team holds a file at. */
	held: number;
	/** How many of each kind, `canvas.json` aside: it is merged, whatever it is. */
	counts: Record<FileKind, number>;
	/** The frames here that are the team's frames too, or were: what ranks a checkout, and tells another project's. */
	common: number;
	/** The frames here. */
	frames: number;
}

/** The team's answer for a batch of files: `cloudTeams(…).seen` for a project. */
export type AskSeen = (files: readonly SeenAsk[]) => Promise<SeenAnswer>;

/** Each of `paths` in `designDir` classed against the team. */
export async function classDesign(designDir: string, paths: readonly string[], ask: AskSeen): Promise<DesignClasses> {
	const asked = paths.map((path) => ({
		path,
		hash: createHash("sha256")
			.update(readFileSync(join(designDir, ...path.split("/"))))
			.digest("hex"),
	}));
	const answer = await ask(asked);
	const told = new Map(answer.files.map((file) => [`${file.path}\0${file.hash}`, file]));
	const counts: Record<FileKind, number> = { same: 0, older: 0, only: 0, changed: 0 };
	let common = 0;
	let frames = 0;
	const files = asked.map(({ path, hash }): ClassedFile => {
		const said = told.get(`${path}\0${hash}`);
		const team = said?.team ?? "none";
		const kind: FileKind =
			said?.seen === "current" ? "same" : said?.seen === "had" ? "older" : team === "file" ? "changed" : "only";
		if (path !== CANVAS_PATH) counts[kind] += 1;
		if (path.startsWith("frames/")) {
			frames += 1;
			if (team !== "none") common += 1;
		}
		return { path, hash, kind, team };
	});
	return { files, held: answer.held, counts, common, frames };
}

/** Whether a folder classed is the team's exactly: every file current, and as many as the team holds. */
export function isIdentical(classes: DesignClasses): boolean {
	return classes.files.length === classes.held && classes.files.every((file) => file.kind === "same");
}

/** Whether a folder classed is another project's: frames of its own, and none the team has or had. */
export function isAnotherProject(classes: DesignClasses): boolean {
	return classes.frames > 0 && classes.common === 0;
}
