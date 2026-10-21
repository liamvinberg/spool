import { createHash } from "node:crypto";
import { authorizedCloudRequest, type CloudRequestOptions } from "../cloud-auth";
import type { ProjectLink } from "../team-project";

/*
 * The team history's reads as this Mac's daemon makes them for itself (spool#188, spool#189): what the files stood
 * at a version, the save made at exactly one, and the bytes behind a hash, checked against it. Restore and Compare
 * with now both read the past through these.
 */

/** The most paths and prefixes one read of the files at a version names, as spool.page takes them. */
const READ_PATHS = 200;
const PAGE = 500;

/** The team history couldn't be read: spool.page answered this status. */
export class HistoryUnread extends Error {
	constructor(readonly status: number) {
		super(`the team history answered ${status}`);
	}
}

export function teamHistoryReads(deps: { spoolDir: string; request: () => CloudRequestOptions }) {
	/** One of the team history's reads, as this Mac's account. */
	const history = async (link: ProjectLink, read: string, query: URLSearchParams): Promise<Response> =>
		authorizedCloudRequest(
			deps.spoolDir,
			`/api/teams/${encodeURIComponent(link.team)}/projects/${encodeURIComponent(link.project)}/history${read}?${query}`,
			{},
			deps.request(),
		);

	const json = async <T>(response: Response): Promise<T> => {
		if (!response.ok) throw new HistoryUnread(response.status);
		return (await response.json()) as T;
	};

	/** What each path named, or under a prefix named, held at a version: its hash, null where it was deleted. */
	const filesAt = async (link: ProjectLink, to: number, paths: string[], prefixes: string[]) => {
		const held = new Map<string, string | null>();
		const asks = [...prefixes.map((prefix) => ({ prefix })), ...paths.map((path) => ({ path }))];
		for (let at = 0; at < asks.length; at += READ_PATHS) {
			let after: string | null = "";
			while (after !== null) {
				const query = new URLSearchParams({ at: String(to), limit: String(PAGE) });
				if (after !== "") query.set("after", after);
				for (const ask of asks.slice(at, at + READ_PATHS))
					if ("prefix" in ask) query.append("prefix", ask.prefix);
					else query.append("path", ask.path);
				const page: { files: { path: string; hash: string | null }[]; next: string | null } = await json(
					await history(link, "/files", query),
				);
				for (const file of page.files) held.set(file.path, file.hash);
				after = page.next;
			}
		}
		return held;
	};

	/** What a path held at exactly `to` when that version is a save to it, set aside or not: a set-aside put back. */
	const savedAt = async (link: ProjectLink, path: string, to: number) => {
		const query = new URLSearchParams({ path, before: String(to + 1), limit: "1" });
		const page: { saves: { version: number; hash: string | null }[] } = await json(
			await history(link, "/saves", query),
		);
		const [save] = page.saves;
		return save?.version === to ? save : undefined;
	};

	/** The bytes behind a hash, read from the team history and checked against it. */
	const blob = async (link: ProjectLink, hash: string): Promise<Uint8Array> => {
		const response = await history(link, `/blobs/${hash}`, new URLSearchParams());
		if (!response.ok) throw new HistoryUnread(response.status);
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new HistoryUnread(502);
		return bytes;
	};

	return { filesAt, savedAt, blob };
}
