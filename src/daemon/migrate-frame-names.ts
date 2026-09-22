import { rmSync } from "node:fs";
import { pageName } from "../page-path";
import { FORMAT_VERSION } from "../templates";
import { canvasFile, readCanvasFields, writeCanvasField } from "./canvas-file";
import { retargetLinks } from "./frame-links";
import { frameNames } from "./projection";
import { carrySeen, forgetSeen } from "./seen";
import { carryCover, coverDir } from "./thumbs";

/**
 * The one-time move from folder names to path names (#336).
 *
 * Until format 2 a frame was named by its folder alone and that name had to be
 * unique across the project, so every walk said `checkout` wherever the frame
 * sat. Now a frame is named by its path, and the walks into a frame on a page
 * have to say `shop/checkout`. The old names were unique, so each one points at
 * exactly one frame, and this writes every walk target at that frame's path:
 * the same rewrite a move makes (`frame-links.ts`), with every nested frame
 * moving from its folder name to its path. The seen marks and covers keyed by
 * the old names follow them the same way.
 *
 * It runs once, the first time this version reads a project, and the format
 * stamp going to 2 is its last write, so a project it did not finish runs it
 * again. Running it twice is harmless: a path is never taken for a folder name,
 * and a frame on the root page already answers to its old name. Nothing here
 * can make an old name mean another frame: a name no frame answered before
 * still answers nothing, and the flow map reports it missing, which is the
 * repair list for anything this could not write.
 */

/** The format this migrates from; anything else is left exactly alone. */
export const FOLDER_NAMES_FORMAT = 1;

export interface FrameNamesMigration {
	/** Design-relative source files whose walk targets were rewritten. */
	files: string[];
	/** Folder names more than one frame has: walks naming them are left to the author. */
	ambiguous: string[];
}

export function migrateFrameNames(root: string): FrameNamesMigration | undefined {
	if (readCanvasFields(root).format !== FOLDER_NAMES_FORMAT) return undefined;
	const frames = frameNames(root) ?? [];
	const byFolder = new Map<string, string[]>();
	for (const frame of frames) {
		const folder = pageName(frame);
		byFolder.set(folder, [...(byFolder.get(folder) ?? []), frame]);
	}
	const renamed = [...byFolder].flatMap(([folder, [only, ...rest]]) =>
		only !== undefined && rest.length === 0 && only !== folder ? [{ from: folder, to: only }] : [],
	);
	const shared = [...byFolder].flatMap(([folder, holders]) => (holders.length > 1 ? [folder] : []));
	// what was stored under a shared folder name dates from before the clash hid
	// both frames, so which of them it belongs to is unknowable: it goes
	for (const folder of shared) rmSync(coverDir(root, folder), { recursive: true, force: true });
	forgetSeen(root, shared);
	// the marks move before the rewrite, which keeps a frame it touches seen
	for (const { from, to } of renamed) carryCover(root, from, to);
	carrySeen(root, renamed);
	const moves = new Map(renamed.map(({ from, to }) => [from, to]));
	const ambiguous = new Set<string>();
	const rewritten = retargetLinks(root, (target) => {
		if (shared.includes(target)) ambiguous.add(target);
		return moves.get(target);
	});
	writeCanvasField(canvasFile(root), "format", FORMAT_VERSION);
	return { files: rewritten, ambiguous: [...ambiguous].sort() };
}

/** What a migration did, said once for a log or a terminal. */
export function describeMigration(root: string, done: FrameNamesMigration): string {
	const files = done.files.length === 1 ? "1 file" : `${done.files.length} files`;
	const head = `frames in ${root} are named by their path now; walk targets rewritten in ${files}`;
	if (done.ambiguous.length === 0) return head;
	const names = done.ambiguous.map((name) => `"${name}"`).join(", ");
	return `${head}; ${names} is the folder name of more than one frame, so walks to it were left as written: check them with \`spool flows\``;
}
