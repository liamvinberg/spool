/*
 * A team version as the History pane shows it (task 225): the project as it stood at a version, beside the version
 * just before it and the team's files now. Pure: which frames stood then, what that version did to each, which of
 * them stand the same now, and what a restore of it would change, frame by frame.
 */

/** Files at a moment: a design/-relative path to the hash of its bytes, present files only. */
export type MomentFiles = Readonly<Record<string, string>>;

/** What a version did to a frame, from the version before it. */
export type VersionDid = "added" | "changed" | "deleted";

/** What restoring a version would do to a frame that stands differently now. */
export type VersionChange = "changed" | "back" | "gone";

export interface VersionFrame {
	name: string;
	/** whether it stood at the version, just before it, and now */
	then: boolean;
	before: boolean;
	now: boolean;
	/** it stood then exactly as it stands now: its own files, and every shared file */
	same: boolean;
	did: VersionDid | null;
}

export interface VersionRead {
	/** the frames on the page asked for, at the version, before it or now, by name */
	frames: VersionFrame[];
	/** every frame in the project a restore of the version would change, by name */
	differs: { frame: string; change: VersionChange }[];
	/** the shared files a restore of the version would change, offered beside the frames */
	shared: string[];
}

const ENTRY = /^frames\/(.+)\/frame\.tsx$/u;

/** The frames standing in a moment's files: each folder under frames/ holding a frame.tsx. */
export function framesIn(files: MomentFiles): Set<string> {
	const names = new Set<string>();
	for (const path of Object.keys(files)) {
		const name = ENTRY.exec(path)?.[1];
		if (name !== undefined) names.add(name);
	}
	return names;
}

/** The page a frame stands on: its name's parent, "" for the root page. */
export const pageOfFrame = (frame: string) => (frame.includes("/") ? frame.slice(0, frame.lastIndexOf("/")) : "");

/** The frame a path is its own file of: the deepest frame whose folder holds it; undefined outside every frame. */
function ownerOf(path: string, frames: readonly string[]): string | undefined {
	let owner: string | undefined;
	for (const frame of frames)
		if (path.startsWith(`frames/${frame}/`) && (owner === undefined || frame.length > owner.length)) owner = frame;
	return owner;
}

/** A frame's own files at a moment, as one string: two moments with the same one hold the same frame. */
function ownKey(files: MomentFiles, frame: string, frames: readonly string[]): string {
	return Object.keys(files)
		.filter((path) => ownerOf(path, frames) === frame)
		.sort()
		.map((path) => `${path}\0${files[path]}`)
		.join("\n");
}

/** The paths under a prefix whose hash differs between two moments, either side missing included. */
function changedUnder(a: MomentFiles, b: MomentFiles, prefix: string): string[] {
	const paths = new Set([...Object.keys(a), ...Object.keys(b)].filter((path) => path.startsWith(prefix)));
	return [...paths].filter((path) => a[path] !== b[path]).sort();
}

/** The project at a version, beside the version before it and now, with the frames on `page` drawn out. */
export function readVersion(input: {
	then: MomentFiles;
	before: MomentFiles;
	now: MomentFiles;
	page: string;
}): VersionRead {
	const { then, before, now, page } = input;
	const atThen = framesIn(then);
	const atBefore = framesIn(before);
	const atNow = framesIn(now);
	const all = [...new Set([...atThen, ...atBefore, ...atNow])].sort();
	const shared = changedUnder(then, now, "shared/");
	const key = (files: MomentFiles, frame: string) => ownKey(files, frame, all);
	const frames = all
		.filter((name) => pageOfFrame(name) === page)
		.map((name): VersionFrame => {
			const wasThen = atThen.has(name);
			const wasBefore = atBefore.has(name);
			const isNow = atNow.has(name);
			const did: VersionDid | null =
				wasThen && !wasBefore
					? "added"
					: !wasThen && wasBefore
						? "deleted"
						: wasThen && key(then, name) !== key(before, name)
							? "changed"
							: null;
			return {
				name,
				then: wasThen,
				before: wasBefore,
				now: isNow,
				same: wasThen && isNow && shared.length === 0 && key(then, name) === key(now, name),
				did,
			};
		});
	const differs = all.flatMap((frame): VersionRead["differs"] => {
		const wasThen = atThen.has(frame);
		const isNow = atNow.has(frame);
		if (wasThen && !isNow) return [{ frame, change: "back" }];
		if (!wasThen && isNow) return [{ frame, change: "gone" }];
		if (wasThen && key(then, frame) !== key(now, frame)) return [{ frame, change: "changed" }];
		return [];
	});
	return { frames, differs, shared };
}
