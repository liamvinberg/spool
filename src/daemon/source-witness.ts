import { type BigIntStats, lstatSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";
import { type FolderListing, type FrameSource, type ImportEdge, importCandidates, importKey } from "./nav-sites";

/**
 * Proof that a frame's source half is still the one the kept graph holds,
 * without reading a byte of it (#109).
 *
 * The kept graph used to prove it by reading and digesting every file in every
 * frame's graph, listing every frame folder and re-resolving every import on
 * each read. That is the safe answer and the slow one: 370 ms on a 1449-frame
 * project with nothing changed, most of it listings and stats rather than
 * digests. The fs watcher could say what moved for free, but it is a courtesy
 * (`events.ts`): it runs only while somebody subscribes, it answers tens of
 * milliseconds after the write, and an agent that writes a file and reads the
 * graph straight after must see its own write. So nothing here trusts it.
 *
 * What a witness trusts instead is what git's index trusts: a path's identity
 * on disk. Every input the source half is a function of is a path whose
 * identity moves when it does:
 *
 *   - each file in the graph, for its bytes: a write moves its size, mtime or
 *     ctime, and a replacement moves its inode. ctime is set by the kernel and
 *     no tool can put it back, so a copy that keeps the old mtime still shows;
 *   - each folder in the frame folder's tree, for which files are its own: a
 *     name added, removed or renamed in a folder moves that folder's mtime;
 *   - for each import, the folder the specifier sits in and the folder it
 *     names, for where it lands: every candidate the resolver tries lives in
 *     one of the two, so a candidate appearing or vanishing moves one of them.
 *
 * Two things a stat cannot show are refused outright, and a frame touching
 * either keeps the full proof on every read. A link anywhere on the way (a
 * linked entry in the folder, a linked candidate, a folder whose real path is
 * not its own) can be pointed elsewhere without moving anything above it. And
 * a timestamp only orders changes coarser than its tick (4 ms on Linux, 2 s on
 * FAT), so two same-size writes inside one tick look like one: a witness is
 * only taken of paths that last changed well before the read that built the
 * entry began, git's racy-clean rule. A path written moments before is proven
 * by its bytes again next read, until it has settled.
 *
 * "Began" is read off the file system's own clock, never the machine's: a
 * mount whose server runs behind, or a wall clock stepped back, would make a
 * write landing during the read look settled against `Date.now()`. A probe file
 * is written as the read begins, and its timestamps are the file system's now.
 */

/** How long a path must have stood still before its stat speaks for its
 * contents: past FAT's two-second tick, with room to spare. */
export const SETTLED_MS = 3000;

/**
 * The file system's now, in epoch milliseconds, from a probe written in the
 * project's own app state; nothing when it cannot be written, and then no
 * witness is taken this read. `.spool/` is never history and never an edit, so
 * the write is invisible to everything but this clock.
 */
export function diskNow(designDir: string): number | undefined {
	try {
		const spool = resolveDesignPath(designDir, join(designDir, ".spool"));
		mkdirSync(spool, { recursive: true });
		const probe = resolveDesignPath(designDir, join(spool, "clock"));
		writeFileSync(probe, "");
		const stat = statSync(probe, { bigint: true });
		return Number((stat.mtimeNs > stat.ctimeNs ? stat.mtimeNs : stat.ctimeNs) / 1_000_000n);
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return undefined;
	}
}

/** One path's identity on disk, and when it last changed. */
interface Look {
	identity: string;
	/** The later of its mtime and ctime, in epoch milliseconds; 0 when absent. */
	changed: number;
}

const ABSENT: Look = { identity: "absent", changed: 0 };

/** One stat of one path, through a link or of the link itself. */
function look(path: string, follow = true): Look {
	let stat: BigIntStats;
	try {
		stat = follow ? statSync(path, { bigint: true }) : lstatSync(path, { bigint: true });
	} catch {
		return ABSENT;
	}
	const changed = stat.mtimeNs > stat.ctimeNs ? stat.mtimeNs : stat.ctimeNs;
	return {
		identity: `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,
		changed: Number(changed / 1_000_000n),
	};
}

/** A memo of one question per path, asked at most once. */
function memo<T>(ask: (path: string) => T): (path: string) => T {
	const answers = new Map<string, T>();
	return (path) => {
		if (answers.has(path)) return answers.get(path) as T;
		const answer = ask(path);
		answers.set(path, answer);
		return answer;
	};
}

/**
 * The disk as one read of the project sees it: a shared component in a
 * thousand frames' graphs is asked about once, and one read sees one disk.
 */
export function createLooks() {
	const landings = new Map<string, readonly string[] | undefined>();
	const looks = {
		/** The path's identity now. */
		at: memo((path) => look(path)),

		/** The path's own identity now, a link's rather than what it points at. */
		itself: memo((path) => look(path, false)),

		/** Whether the path is itself a link, which can be pointed elsewhere unseen. */
		isLink: memo((path) => {
			try {
				return lstatSync(path).isSymbolicLink();
			} catch {
				return false;
			}
		}),

		/**
		 * Whether a folder's real path is its own: no link anywhere on the way. A
		 * folder that is not there has no link on its way yet; its absence is in
		 * the witness, and it appearing moves it.
		 */
		isOwnPath: memo((directory) => {
			try {
				return realpathSync(directory) === directory;
			} catch {
				return true;
			}
		}),

		/**
		 * The folders one import's landing depends on, or nothing when a link on
		 * the way means no folder can vouch for it. Asked per import edge and
		 * answered per folder and specifier, under the key the source pass
		 * resolves by: frames share most of their imports, so a cold read asks
		 * this tens of thousands of times.
		 */
		landing(designDir: string, edge: ImportEdge): readonly string[] | undefined {
			const key = `${importKey(edge.from, edge.specifier)}\0${edge.to ?? ""}`;
			if (landings.has(key)) return landings.get(key);
			const found = landingFolders(designDir, edge, looks);
			landings.set(key, found);
			return found;
		},
	};
	return looks;
}

export type Looks = ReturnType<typeof createLooks>;

/** See `landing`. */
function landingFolders(designDir: string, edge: ImportEdge, looks: Looks): readonly string[] | undefined {
	const candidates = importCandidates(designDir, edge.from, edge.specifier);
	// a package touches no folder
	if (candidates === undefined) return [];
	const [holding, named] = candidates.folders;
	if (!looks.isOwnPath(holding) || !looks.isOwnPath(named)) return undefined;
	for (const candidate of candidates.tried) {
		if (looks.isLink(candidate)) return undefined;
		if (candidate === edge.to) break;
	}
	if (edge.to !== undefined && !candidates.tried.includes(edge.to)) return undefined;
	return candidates.folders;
}

/**
 * Every path the source half depends on, with the identity it had, and the
 * frame folder's own identity besides. That one is taken of the folder itself,
 * never through it: a folder swapped for a link is a frame the boundary has to
 * be asked about again, and a witness that holds is asked instead of it.
 */
export interface SourceWitness {
	frameDir: string;
	itself: string;
	paths: ReadonlyMap<string, string>;
}

/** Whether no path the witness names has moved. */
export function witnessHolds(witness: SourceWitness, looks: Looks): boolean {
	if (looks.itself(witness.frameDir).identity !== witness.itself) return false;
	for (const [path, identity] of witness.paths) if (looks.at(path).identity !== identity) return false;
	return true;
}

/**
 * A witness for one frame's source half, read off disk after the half was
 * built, or nothing when a stat cannot vouch for it. `listing` is the frame
 * folder's listing the half was built from. `since` is the file system's time
 * when the read that built it began, nothing when it could not be told: a path
 * that changed after that, or too near before it, may hold bytes the build
 * never saw, so it is left to the full proof.
 */
export function witnessSource(
	designDir: string,
	frameDir: string,
	listing: FolderListing,
	source: Pick<FrameSource, "files" | "imports">,
	since: number | undefined,
	looks: Looks,
): SourceWitness | undefined {
	if (since === undefined || listing.folders === undefined || listing.linked) return undefined;
	if (!looks.isOwnPath(frameDir)) return undefined;
	const paths = new Set<string>(listing.folders);
	for (const file of source.files) paths.add(file);
	for (const edge of source.imports) {
		const folders = looks.landing(designDir, edge);
		if (folders === undefined) return undefined;
		for (const folder of folders) paths.add(folder);
	}
	const witness = new Map<string, string>();
	for (const path of paths) {
		const found = looks.at(path);
		if (found.changed >= since - SETTLED_MS) return undefined;
		witness.set(path, found.identity);
	}
	return { frameDir, itself: looks.itself(frameDir).identity, paths: witness };
}
