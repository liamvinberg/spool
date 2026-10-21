import { type Context, Hono } from "hono";
import { authorizedCloudRequest, type CloudRequestOptions, originOf } from "../cloud-auth";
import type { ProjectLink } from "../team-project";

/*
 * The team history (spool#114): every save to a team project for 90 days, applied or set aside, kept by its sync
 * object at spool.page. This Mac reads it with its device session, for `spool history` and the History pane, and
 * never writes through it: a restore is ordinary saves on the local copy's sync connection.
 */

/** The reads the team's history routes answer, and the only ones the daemon passes on. */
const READS = /^\/(saves|files|blobs\/[0-9a-f]{64})$/u;

/** One save as the team history answers it. */
export interface TeamHistorySave {
	version: number;
	path: string;
	hash: string | null;
	at: number;
	outcome: "applied" | "set_aside";
	by: { accountId: string; name: string; device: string };
}

/**
 * The project's history reads, passed on to spool.page as this Mac's account: `/saves`, `/files` and `/blobs/<hash>`
 * under `/api/p/<project>/history`, with their query as given. A project that isn't a team's has no team history.
 */
export function teamHistoryRoutes(deps: {
	spoolDir: string;
	request: () => CloudRequestOptions;
	resolve: (c: Context, name: string) => { root: string } | { response: Response };
	link: (root: string) => ProjectLink | undefined;
}) {
	return new Hono().get("/:project/history/*", async (c) => {
		const project = deps.resolve(c, c.req.param("project") ?? "");
		if ("response" in project) return project.response;
		const link = deps.link(project.root);
		if (link === undefined)
			return c.json({ error: "not_team", message: "this project isn't a team project: its history is git's" }, 404);
		const url = new URL(c.req.url);
		const read = url.pathname.slice(url.pathname.indexOf("/history/") + "/history".length);
		if (!READS.test(read)) return c.json({ error: "not_found" }, 404);
		const request = deps.request();
		// a link to another cloud is never sent this Mac's session
		if (link.origin !== originOf(request))
			return c.json({ error: "other_cloud", message: `this project lives at ${link.origin}` }, 404);
		let response: Response;
		try {
			response = await authorizedCloudRequest(
				deps.spoolDir,
				`/api/teams/${encodeURIComponent(link.team)}/projects/${encodeURIComponent(link.project)}/history${read}${url.search}`,
				{},
				request,
			);
		} catch (error) {
			return c.json({ error: "offline", message: error instanceof Error ? error.message : String(error) }, 503);
		}
		const body = new Uint8Array(await response.arrayBuffer());
		return c.body(body, response.status as 200, {
			"content-type": response.headers.get("content-type") ?? "application/octet-stream",
		});
	});
}
