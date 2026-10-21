import { type CloudRequestOptions, CloudSignedOut } from "../cloud-auth";
import { CloudShareRefused, cloudShares } from "../cloud-shares";
import { frameNames } from "./projection";
import { followedLink } from "./team-sync";
import { readCoverImage, scanStills } from "./thumbs";

/**
 * A team project's covers in Spool Cloud, which never photographs a frame itself: each member's daemon sends
 * the cover its photo booth took, filed under the version of the frame it is of (`CompiledFrameDocument.source`).
 * The first daemon to send a version's cover is the one the cloud keeps; every other daemon that shoots the same
 * version asks first, finds it there, and sends nothing.
 *
 * A still taken before its project joined a team, or one the cloud refused, or a frame the booth never shot, would
 * never get there by new shots alone: so whenever a team project is first seen, it is brought level with the cloud
 * once, in one ask of which cover the cloud keeps per frame.
 */
export interface TeamCovers {
	/** A cover the booth stored for a frame of a registered project: sent on when the project is a team's. */
	stored(root: string, frame: string, source: string, bytes: Uint8Array): void;
	/**
	 * The registered projects: each team project none of them followed before is brought level with the cloud, once,
	 * through the first of them that follows it (a checkout and its worktrees follow the same one).
	 */
	keeping(roots: readonly string[]): void;
	/** Every send asked for so far, finished. */
	settled(): Promise<void>;
}

/** Why a frame is owed a sitting: it has no still, or one of a version nobody can say. */
export type CoverOwed = "missing" | "stale";

export interface TeamCoversOptions {
	spoolDir: string;
	/** Where spool.page is, the session vault and the fetch: the machine's own unless a test hands in a fake. */
	request: () => CloudRequestOptions & { origin: string };
	/** A frame of a team project the cloud has no cover for, and no still here can be sent of: the booth owes it. */
	owe?: (root: string, frame: string, why: CoverOwed) => void;
	log?: (line: string) => void;
}

export function createTeamCovers({ spoolDir, request, owe = () => {}, log = () => {} }: TeamCoversOptions): TeamCovers {
	/** One send at a time, in the order the booth stored them: a first pass through a project is hundreds. */
	let queue: Promise<void> = Promise.resolve();
	/** The team projects brought level with the cloud since the daemon started, or being brought level now. */
	const level = new Set<string>();

	/** Where a root's covers go, when it is a team project on this cloud: a solo project's, an ended copy's and another cloud's stay. */
	function placeOf(root: string) {
		const link = followedLink(root);
		const options = request();
		if (link === undefined || link.origin !== options.origin) return undefined;
		return {
			link,
			cloud: cloudShares(spoolDir, options),
			at: { kind: "team", team: link.team, project: link.project } as const,
			key: `${link.origin}\0${link.team}\0${link.project}`,
		};
	}

	async function send(root: string, frame: string, source: string, bytes: Uint8Array): Promise<void> {
		const place = placeOf(root);
		if (place === undefined) return;
		const { cloud, at, link } = place;
		try {
			if (await cloud.knowsCover(at, source)) return;
			await cloud.putCover(at, source, frame, bytes);
		} catch (error) {
			// a version of the frame other than the one spool.page's files make now (409 cover_stale) is no failure,
			// nor a frame not there yet; signed out, or out of reach, the next shot of a new version tries again
			if (error instanceof CloudShareRefused) {
				if (error.code !== "cover_stale" && error.code !== "frame_not_found")
					log(`the cover of ${frame} wasn't sent to ${link.team}: ${error.status}`);
			} else if (!(error instanceof CloudSignedOut))
				log(`the cover of ${frame} wasn't sent: ${(error as Error).message}`);
		}
	}

	/**
	 * One team project brought level with the cloud through one of its roots: a still here of another version than
	 * the cloud keeps is sent, and a frame the cloud has no cover for, with no still here or one of a version nobody
	 * can say, is owed a sitting, whose still goes up as it lands. True once done, or once the cloud says it can't
	 * list covers; false when it couldn't be asked, to ask again later.
	 */
	async function bringLevel(root: string): Promise<boolean> {
		const place = placeOf(root);
		if (place === undefined) return true;
		let kept: Record<string, string>;
		try {
			kept = await place.cloud.covers(place.at);
		} catch (error) {
			// a spool.page from before the list, or a project it doesn't have: nothing to bring level with
			if (error instanceof CloudShareRefused && error.status === 404) return true;
			if (!(error instanceof CloudSignedOut))
				log(
					`the covers of ${place.link.project} weren't read from ${place.link.team}: ${(error as Error).message}`,
				);
			return false;
		}
		let stills: Awaited<ReturnType<typeof scanStills>>;
		let frames: string[];
		try {
			stills = await scanStills(root);
			frames = frameNames(root) ?? [];
		} catch {
			// a project whose design folder went strange owes nothing it can be asked
			return true;
		}
		for (const frame of frames) {
			const cloudHas = kept[frame];
			const still = stills.get(frame);
			if (still?.source !== undefined) {
				if (still.source === cloudHas) continue;
				const image = readCoverImage(root, frame, still.hash);
				if (image !== undefined) await send(root, frame, still.source, image.bytes);
			} else if (cloudHas === undefined) {
				// a frame the booth failed on would only fail again: an edit asks for it
				if (still === undefined) owe(root, frame, "missing");
				else if (!still.failed) owe(root, frame, "stale");
			}
		}
		return true;
	}

	return {
		stored(root, frame, source, bytes) {
			queue = queue.then(() => send(root, frame, source, bytes));
		},
		keeping(roots) {
			const followed = new Map<string, string>();
			for (const root of roots) {
				let key: string | undefined;
				try {
					key = placeOf(root)?.key;
				} catch {
					key = undefined;
				}
				if (key !== undefined && !followed.has(key)) followed.set(key, root);
			}
			// a project no root follows any more is brought level again if one comes back
			for (const key of [...level]) if (!followed.has(key)) level.delete(key);
			for (const [key, root] of followed) {
				if (level.has(key)) continue;
				level.add(key);
				queue = queue.then(async () => {
					const done = await bringLevel(root).catch(() => false);
					if (!done) level.delete(key);
				});
			}
		},
		settled: () => queue,
	};
}
