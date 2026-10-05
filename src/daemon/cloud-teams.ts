import { basename } from "node:path";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import { type CloudRequestOptions, CloudSignedOut, cloudOrigin } from "../cloud-auth";
import { type CloudTeam, type CloudTeamInvite, CloudTeamRefused, cloudTeams, type TeamRole } from "../cloud-teams";
import { SpoolError } from "../errors";
import { createTeamProject } from "../init";
import type { OpenSyncSocket } from "./team-sync";

/** What Home's switcher and invite line show. */
export type CloudTeamsState =
	| { state: "signed-out" }
	/** Signed in as far as this Mac knows, but spool.page did not answer just now. */
	| { state: "unreachable" }
	| {
			state: "ready";
			teams: CloudTeam[];
			invites: CloudTeamInvite[];
			mayCreateTeam: boolean;
			/** Where a team's pages are in a browser: `<origin>/<address>`. */
			origin: string;
	  };

const ROLES: readonly TeamRole[] = ["admin", "editor", "viewer"];

const roleBody = validator("json", (value, c) => {
	const role = (value as { role?: unknown }).role;
	if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role))
		return c.json({ error: "invalid_role" }, 400);
	return { role: role as TeamRole };
});

/**
 * The daemon's side of Home's teams: it holds this Mac's device session, so Home asks it and it asks
 * spool.page. A refusal comes back as spool.page's own reason, for Home to say in its words.
 */
export function cloudTeamRoutes(options: {
	spoolDir: string;
	request?: CloudRequestOptions | undefined;
	openSocket?: OpenSyncSocket | undefined;
}) {
	const origin = () => options.request?.origin ?? cloudOrigin(process.env);
	const client = () => cloudTeams(options.spoolDir, { ...options.request, origin: origin() });
	const act = async (c: Context, action: () => Promise<unknown>) => {
		try {
			return c.json((await action()) ?? {});
		} catch (error) {
			if (error instanceof CloudTeamRefused)
				return c.json({ error: error.code }, error.status as ContentfulStatusCode);
			if (error instanceof CloudSignedOut) return c.json({ error: "signed_out" }, 401);
			return c.json({ error: "unreachable" }, 503);
		}
	};
	return (
		new Hono()
			.get("/teams", async (c) => {
				let state: CloudTeamsState;
				try {
					state = { state: "ready", ...(await client().list()), origin: origin() };
				} catch (error) {
					state = error instanceof CloudSignedOut ? { state: "signed-out" } : { state: "unreachable" };
				}
				return c.json(state);
			})
			.post(
				"/teams",
				validator("json", (value, c) => {
					const name = (value as { name?: unknown }).name;
					return typeof name === "string" ? { name } : c.json({ error: "invalid_name" }, 400);
				}),
				(c) => act(c, () => client().create(c.req.valid("json").name)),
			)
			.get("/teams/:team/people", (c) => act(c, () => client().people(c.req.param("team"))))
			// who is inside each of the team's projects now, for Home's covers
			.get("/teams/:team/here", (c) => act(c, () => client().here(c.req.param("team"))))
			.patch(
				"/teams/:team",
				validator("json", (value) => {
					const { name, address } = value as { name?: unknown; address?: unknown };
					return {
						...(typeof name === "string" ? { name } : {}),
						...(typeof address === "string" ? { address } : {}),
					};
				}),
				(c) => act(c, () => client().update(c.req.param("team"), c.req.valid("json"))),
			)
			.delete("/teams/:team", (c) => act(c, () => client().delete(c.req.param("team"))))
			.put(
				"/teams/:team/logo",
				validator("json", (value, c) => {
					const data = (value as { data?: unknown }).data;
					return typeof data === "string" && /^[A-Za-z0-9+/]*={0,2}$/u.test(data)
						? { bytes: new Uint8Array(Buffer.from(data, "base64")) }
						: c.json({ error: "invalid_logo" }, 400);
				}),
				(c) => act(c, () => client().setLogo(c.req.param("team"), c.req.valid("json").bytes)),
			)
			.delete("/teams/:team/logo", (c) => act(c, () => client().removeLogo(c.req.param("team"))))
			.post(
				"/teams/:team/invites",
				validator("json", (value, c) => {
					const { email, role } = value as { email?: unknown; role?: unknown };
					if (
						typeof email !== "string" ||
						typeof role !== "string" ||
						!(ROLES as readonly string[]).includes(role)
					)
						return c.json({ error: "invalid_mailbox" }, 400);
					return { email, role: role as TeamRole };
				}),
				(c) => {
					const { email, role } = c.req.valid("json");
					return act(c, () => client().invite(c.req.param("team"), email, role));
				},
			)
			.post("/teams/:team/invites/:invite/resend", (c) =>
				act(c, () => client().resendInvite(c.req.param("team"), c.req.param("invite"))),
			)
			.delete("/teams/:team/invites/:invite", (c) =>
				act(c, () => client().cancelInvite(c.req.param("team"), c.req.param("invite"))),
			)
			.patch("/teams/:team/members/:member", roleBody, (c) =>
				act(c, () => client().setRole(c.req.param("team"), c.req.param("member"), c.req.valid("json").role)),
			)
			.delete("/teams/:team/members/:member", (c) =>
				act(c, () => client().removeMember(c.req.param("team"), c.req.param("member"))),
			)
			// New project while the team is chosen in Home: a team project in a new folder, as `spool init --team` makes
			.post(
				"/teams/:team/projects",
				validator("json", (value, c) => {
					const { path, name } = value as { path?: unknown; name?: unknown };
					if (typeof path !== "string" || path === "" || typeof name !== "string")
						return c.json({ error: 'expected { "path": "/abs/dir", "name": "folder" }' }, 400);
					return { path, name };
				}),
				async (c) => {
					const { path, name } = c.req.valid("json");
					try {
						const { root } = await createTeamProject(path, name, options.spoolDir, {
							team: c.req.param("team"),
							origin: origin(),
							...(options.request === undefined ? {} : { request: options.request }),
							...(options.openSocket === undefined ? {} : { openSocket: options.openSocket }),
						});
						return c.json({ root, name: basename(root) });
					} catch (error) {
						if (error instanceof SpoolError) return c.json({ error: error.message }, 409);
						return c.json({ error: "spool.page could not be reached. Try again." }, 503);
					}
				},
			)
			.post("/invites/:invite/accept", (c) => act(c, () => client().acceptInvite(c.req.param("invite"))))
			.post("/invites/:invite/decline", (c) => act(c, () => client().declineInvite(c.req.param("invite"))))
	);
}
