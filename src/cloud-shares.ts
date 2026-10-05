import { authorizedCloudRequest, type CloudRequestOptions } from "./cloud-auth";
import { CloudTeamRefused } from "./cloud-teams";
import type { ShareRequest, ShareView } from "./share-view";

/** Whose shares: a team project's, by its team and name, or a solo project's, by the id spool.page gave it. */
export type SharePlace = { kind: "team"; team: string; project: string } | { kind: "solo"; id: string };

/**
 * spool.page's shares, as this Mac's device session reaches them: a team project's (its editors and admins
 * change them) or a solo project's (its own account's), and a solo project's upload of the files its shared pages
 * are made of. A refusal is `CloudTeamRefused`, with spool.page's own reason.
 */
export function cloudShares(spoolDir: string, options: CloudRequestOptions = {}) {
	async function call<T>(method: string, path: string, body?: unknown, contentType = "application/json"): Promise<T> {
		const response = await authorizedCloudRequest(
			spoolDir,
			`/api/${path}`,
			{
				method,
				...(body === undefined
					? {}
					: {
							headers: { "content-type": contentType },
							body: body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body),
						}),
			},
			options,
		);
		const text = await response.text();
		let parsed: unknown = null;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch {
			parsed = null;
		}
		if (!response.ok) {
			const answer = parsed as { error?: unknown; missing?: unknown } | null;
			const code = typeof answer?.error === "string" ? answer.error : "unavailable";
			throw new CloudShareRefused(code, response.status, Array.isArray(answer?.missing) ? answer.missing : []);
		}
		return parsed as T;
	}
	const place = (at: SharePlace) =>
		at.kind === "team"
			? `teams/${encodeURIComponent(at.team)}/projects/${encodeURIComponent(at.project)}`
			: `solo/projects/${encodeURIComponent(at.id)}`;
	const solo = (id: string) => `solo/projects/${encodeURIComponent(id)}`;
	return {
		list: (at: SharePlace) => call<{ shares: ShareView[] }>("GET", `${place(at)}/shares`),
		create: (at: SharePlace, request: ShareRequest) => call<ShareView>("POST", `${place(at)}/shares`, request),
		/** Name more people on a people share, or fewer. */
		change: (at: SharePlace, share: string, change: { add?: string[]; remove?: string[] }) =>
			call<null>("PATCH", `${place(at)}/shares/${encodeURIComponent(share)}`, change),
		/** Stop a share: everyone it shows stops seeing it at once. */
		stop: (at: SharePlace, share: string) => call<null>("DELETE", `${place(at)}/shares/${encodeURIComponent(share)}`),
		/** A solo project of this account's at spool.page, to share from. */
		createSolo: (name: string) => call<{ id: string; name: string }>("POST", "solo/projects", { name }),
		/** Of these content hashes, the ones spool.page lacks. */
		lacking: (id: string, hashes: string[]) =>
			call<{ missing: string[] }>("POST", `${solo(id)}/source/lacking`, { hashes }),
		putBlob: (id: string, hash: string, bytes: Uint8Array) =>
			call<null>("PUT", `${solo(id)}/blobs/${hash}`, bytes, "application/octet-stream"),
		/** The files the shared pages are made of, path by hash: spool.page's copy becomes exactly these. */
		putSource: (id: string, files: Record<string, string>) =>
			call<{ head: number }>("PUT", `${solo(id)}/source`, { files }),
		/** Whether spool.page holds this version's cover already. */
		hasCover: async (id: string, source: string) => {
			try {
				await call<null>("HEAD", `${solo(id)}/covers/${source}`);
				return true;
			} catch (error) {
				if (error instanceof CloudShareRefused && (error.status === 404 || error.status === 410)) return false;
				throw error;
			}
		},
		putCover: (id: string, source: string, frame: string, bytes: Uint8Array) =>
			call<null>(
				"PUT",
				`${solo(id)}/covers/${source}?${new URLSearchParams({ frame })}`,
				bytes,
				"application/octet-stream",
			),
	};
}

export type CloudSharesClient = ReturnType<typeof cloudShares>;

/** spool.page said no to a share, or to an upload; `missing` names the bytes it still lacks. */
export class CloudShareRefused extends CloudTeamRefused {
	constructor(
		code: string,
		status: number,
		readonly missing: string[] = [],
	) {
		super(code, status);
	}
}
