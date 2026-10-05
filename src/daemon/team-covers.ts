import { authorizedCloudRequest, type CloudRequestOptions, CloudSignedOut } from "../cloud-auth";
import { localCopyOf } from "../team-project";
import { hasEnded } from "./team-sync";

/**
 * A team project's covers in Spool Cloud, which never photographs a frame itself: each member's daemon sends
 * the cover its photo booth took, filed under the version of the frame it is of (`CompiledFrameDocument.source`).
 * The first daemon to send a version's cover is the one the cloud keeps; every other daemon that shoots the same
 * version asks first, finds it there, and sends nothing.
 */
export interface TeamCovers {
	/** A cover the booth stored for a frame of a registered project: sent on when the project is a team's. */
	stored(root: string, frame: string, source: string, bytes: Uint8Array): void;
	/** Every send asked for so far, finished. */
	settled(): Promise<void>;
}

export interface TeamCoversOptions {
	spoolDir: string;
	/** Where spool.page is, the Keychain and the fetch: the machine's own unless a test hands in a fake. */
	request: () => CloudRequestOptions & { origin: string };
	log?: (line: string) => void;
}

/** The path a version's cover is filed under at spool.page. */
export function coverPath(team: string, project: string, source: string): string {
	return `/api/teams/${encodeURIComponent(team)}/projects/${encodeURIComponent(project)}/covers/${source}`;
}

export function createTeamCovers({ spoolDir, request, log = () => {} }: TeamCoversOptions): TeamCovers {
	/** One send at a time, in the order the booth stored them: a first pass through a project is hundreds. */
	let queue: Promise<void> = Promise.resolve();

	async function send(root: string, frame: string, source: string, bytes: Uint8Array): Promise<void> {
		const link = localCopyOf(root);
		const options = request();
		// a solo project's covers stay here, and so do an ended copy's and those of a team on another cloud
		if (link === undefined || hasEnded(root) || link.origin !== options.origin) return;
		const path = coverPath(link.team, link.project, source);
		try {
			const asked = await authorizedCloudRequest(spoolDir, path, { method: "HEAD" }, options);
			if (asked.ok) return;
			if (asked.status !== 404) return;
			const sent = await authorizedCloudRequest(
				spoolDir,
				`${path}?${new URLSearchParams({ frame })}`,
				{ method: "PUT", headers: { "content-type": "application/octet-stream" }, body: Buffer.from(bytes) },
				options,
			);
			if (!sent.ok) log(`the cover of ${frame} wasn't sent to ${link.team}: ${sent.status}`);
		} catch (error) {
			// signed out, or spool.page out of reach: the next shot of a new version tries again
			if (!(error instanceof CloudSignedOut)) log(`the cover of ${frame} wasn't sent: ${(error as Error).message}`);
		}
	}

	return {
		stored(root, frame, source, bytes) {
			queue = queue.then(() => send(root, frame, source, bytes));
		},
		settled: () => queue,
	};
}
