import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { authorizedCloudRequest, type CloudRequestOptions } from "../cloud-auth";
import type { ProjectLink } from "../team-project";

/**
 * The still a team comment kept of its frame when it was made, for Compare beside the frame now (spool#160). The team
 * keeps it; this Mac asks for it once, with its device session, and keeps it in its own state beside the comments, so
 * Compare shows it offline after that. A comment's still never changes, so one kept is never asked for again.
 */
export function keptStillFile(spoolDir: string, link: ProjectLink, comment: string): string {
	return join(spoolDir, "comment-stills", new URL(link.origin).host, link.team, link.project, comment);
}

/** A comment's still as an image; undefined when it kept none, or it can't be had now. */
export async function commentStill(
	spoolDir: string,
	link: ProjectLink,
	comment: string,
	request: CloudRequestOptions & { origin: string },
): Promise<{ type: string; bytes: Uint8Array } | undefined> {
	if (!/^[a-z0-9]{1,64}$/u.test(comment)) return undefined;
	const file = keptStillFile(spoolDir, link, comment);
	const kept = read(file);
	if (kept !== undefined) return kept;
	// a link to another cloud is never sent this Mac's session
	if (link.origin !== request.origin) return undefined;
	let response: Response;
	try {
		response = await authorizedCloudRequest(
			spoolDir,
			`/api/teams/${encodeURIComponent(link.team)}/projects/${encodeURIComponent(link.project)}/comments/${comment}/still`,
			{},
			request,
		);
	} catch {
		return undefined;
	}
	if (!response.ok) return undefined;
	const bytes = new Uint8Array(await response.arrayBuffer());
	const type = stillType(bytes);
	if (type === undefined) return undefined;
	mkdirSync(dirname(file), { recursive: true });
	writeAtomic(file, Buffer.from(bytes));
	return { type, bytes };
}

function read(file: string): { type: string; bytes: Uint8Array } | undefined {
	let bytes: Uint8Array;
	try {
		bytes = readFileSync(file);
	} catch {
		return undefined;
	}
	const type = stillType(bytes);
	return type === undefined ? undefined : { type, bytes };
}

/** A still's image type, PNG or JPEG as a booth takes them, by its first bytes. */
function stillType(bytes: Uint8Array): string | undefined {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
	return undefined;
}
