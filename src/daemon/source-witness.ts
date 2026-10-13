import { type BigIntStats, lstatSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";
import {
	type FolderListing,
	type FrameSource,
	type ImportEdge,
	importCandidates,
	importKey,
	type LandingMemory,
} from "./nav-sites";

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
 * Two things a stat cannot show. A link anywhere on the way (a linked entry in
 * the folder, a linked candidate, a folder whose real path is not its own) can
 * be pointed elsewhere without moving anything above it, so it is refused
 * outright, and a frame touching one keeps the full proof on every read. And a
 * timestamp only orders changes coarser than its tick (4 ms on Linux, 2 s on
 * FAT), so two same-size writes inside one tick look like one: a stat only
 * stands for a path that last changed well before the read that built the
 * entry began, git's racy-clean rule. A path written moments before is proven
 * by its contents on every read, until it has settled.
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
			const key = landingKey(edge);
			if (landings.has(key)) return landings.get(key);
			const found = landingFolders(designDir, edge, looks);
			landings.set(key, found);
			return found;
		},

		/** A landing an earlier read found, whose folders have not moved since. */
		landed(edge: ImportEdge, folders: readonly string[]): void {
			landings.set(landingKey(edge), folders);
		},
	};
	return looks;
}

const landingKey = (edge: ImportEdge): string => `${importKey(edge.from, edge.specifier)}\0${edge.to ?? ""}`;

/** One import's landing as a read found it, and the folders that decide it as they stood. */
interface Landed {
	to: string | undefined;
	folders: readonly string[];
	identities: readonly string[];
}

/**
 * Landings kept across reads, as a witness keeps a frame: an import lands
 * where it did while the two folders every candidate lives in stand still, so
 * a frame read again after a shared file changed resolves nothing it already
 * resolved. A landing is only kept where a stat can speak for it, with no link
 * on the way and both folders settled before the read began. A read that
 * proves everything by its bytes recalls nothing, and learns what it finds.
 */
export function createLandingMemory() {
	const kept = new Map<string, Landed>();
	return (designDir: string, looks: Looks, since: number | undefined, full: boolean): LandingMemory => ({
		recall(fromFile, specifier) {
			if (full) return undefined;
			const key = importKey(fromFile, specifier);
			const landed = kept.get(key);
			if (landed === undefined) return undefined;
			if (!landed.folders.every((folder, at) => looks.at(folder).identity === landed.identities[at])) {
				kept.delete(key);
				return undefined;
			}
			looks.landed({ from: fromFile, specifier, to: landed.to }, landed.folders);
			return { to: landed.to };
		},
		learn(fromFile, specifier, to) {
			if (since === undefined) return;
			const folders = looks.landing(designDir, { from: fromFile, specifier, to });
			if (folders === undefined || folders.length === 0) return;
			const found = folders.map((folder) => looks.at(folder));
			if (found.some((look) => look.changed >= since - SETTLED_MS)) return;
			kept.set(importKey(fromFile, specifier), { to, folders, identities: found.map((look) => look.identity) });
		},
	});
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
 *
 * A path's identity is only half of what it vouches with. The other half is
 * what the path holds, which a read can always check where a stat cannot: a
 * file's digest, a frame folder's listing, and for a folder an import lands
 * by, where each of those imports still lands. So a path whose stat moved is
 * asked about its contents rather than failing the whole frame: one write to
 * a shared folder moves the folder of every frame importing anything beside
 * it, and only the frames whose graph holds the written file have really
 * changed. A path too fresh for its stat to speak for keeps no identity at
 * all and is asked about its contents on every read until it settles.
 */
export interface SourceWitness {
	frameDir: string;
	itself: string;
	/** Each path's identity, or nothing while it is too fresh to be one. */
	paths: ReadonlyMap<string, string | undefined>;
	/** The digest of each file in the graph. */
	digests: ReadonlyMap<string, string>;
	/** The frame folder's own listing: its source files and its folders. */
	tree: { files: readonly string[]; folders: readonly string[] };
	/** The imports whose landing each folder decides. */
	landings: ReadonlyMap<string, readonly ImportEdge[]>;
}

/** What proves a path by its contents: one read of the project, as the graph has it. */
export interface ContentProof {
	designDir: string;
	digest(file: string): string;
	listing(frameDir: string): FolderListing;
	resolve(fromFile: string, specifier: string): string | undefined;
}

/**
 * The witness as of this read when it still holds, or nothing when the frame
 * has to be proven by its bytes. Unmoved, it is the same witness; a path whose
 * stat moved and whose contents did not is taken again, so the next read asks
 * a stat once more instead of its contents.
 */
export function witnessHolds(
	witness: SourceWitness,
	looks: Looks,
	proof: ContentProof,
	since: number | undefined,
): SourceWitness | undefined {
	if (looks.itself(witness.frameDir).identity !== witness.itself) return undefined;
	let retaken: Map<string, string | undefined> | undefined;
	for (const [path, identity] of witness.paths) {
		const found = looks.at(path);
		if (identity !== undefined && found.identity === identity) continue;
		if (since === undefined || !holdsTheSame(witness, path, looks, proof)) return undefined;
		retaken ??= new Map(witness.paths);
		retaken.set(path, found.changed >= since - SETTLED_MS ? undefined : found.identity);
	}
	return retaken === undefined ? witness : { ...witness, paths: retaken };
}

/** Whether a path holds what it held when the witness was taken, read rather than stat'd. */
function holdsTheSame(witness: SourceWitness, path: string, looks: Looks, proof: ContentProof): boolean {
	const digest = witness.digests.get(path);
	const folder = witness.tree.folders.includes(path);
	const landing = witness.landings.get(path);
	if (digest === undefined && !folder && landing === undefined) return false;
	if (digest !== undefined && proof.digest(path) !== digest) return false;
	if (folder) {
		const now = proof.listing(witness.frameDir);
		if (now.linked || now.folders === undefined) return false;
		if (!same(now.files, witness.tree.files) || !same(now.folders, witness.tree.folders)) return false;
	}
	for (const edge of landing ?? []) {
		if (proof.resolve(edge.from, edge.specifier) !== edge.to) return false;
		if (looks.landing(proof.designDir, edge) === undefined) return false;
	}
	return true;
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((item, at) => item === b[at]);

/**
 * A witness for one frame's source half, read off disk after the half was
 * built, or nothing when a stat cannot vouch for it. `listing` is the frame
 * folder's listing the half was built from, and `digest` the graph's files as
 * the build read them. `since` is the file system's time when the read that
 * built it began, nothing when it could not be told: a path that changed after
 * that, or too near before it, may hold bytes the build never saw, so its
 * stat is not taken as its identity until it has settled.
 */
export function witnessSource(
	designDir: string,
	frameDir: string,
	listing: FolderListing,
	source: Pick<FrameSource, "files" | "imports">,
	since: number | undefined,
	looks: Looks,
	digest: (file: string) => string,
): SourceWitness | undefined {
	if (since === undefined || listing.folders === undefined || listing.linked) return undefined;
	if (!looks.isOwnPath(frameDir)) return undefined;
	const paths = new Set<string>(listing.folders);
	const digests = new Map<string, string>();
	for (const file of source.files) {
		paths.add(file);
		digests.set(file, digest(file));
	}
	const landings = new Map<string, ImportEdge[]>();
	for (const edge of source.imports) {
		const folders = looks.landing(designDir, edge);
		if (folders === undefined) return undefined;
		for (const folder of folders) {
			paths.add(folder);
			const edges = landings.get(folder);
			if (edges === undefined) landings.set(folder, [edge]);
			else edges.push(edge);
		}
	}
	const witness = new Map<string, string | undefined>();
	for (const path of paths) {
		const found = looks.at(path);
		witness.set(path, found.changed >= since - SETTLED_MS ? undefined : found.identity);
	}
	return {
		frameDir,
		itself: looks.itself(frameDir).identity,
		paths: witness,
		digests,
		tree: { files: listing.files, folders: listing.folders },
		landings,
	};
}
