import { readFileSync, statSync } from "node:fs";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { CloudSignedOut, originOf } from "../cloud-auth";
import { CloudTeamRefused, cloudTeams } from "../cloud-teams";
import { SpoolError } from "../errors";
import { type CloneProgress, cloneInto } from "../git-clone";
import { expandHome } from "../paths";
import type { DaemonCloud } from "./app";
import { findOpenable, type TeamStanding } from "./open-finding";
import { importProject, TRANSFER_LIMITS } from "./project-transfer";

/**
 * Open… over HTTP, mounted under `/api/projects` beside Home's own routes: read what was handed over into a
 * finding, and the two acts only it has, cloning a git link and importing a `.spool` file by its path. Opening a
 * project, designing in a folder and getting a team's project are the routes Home already had.
 */
export function openRoutes(deps: {
	spoolDir: string;
	home: string;
	cloud?: DaemonCloud | undefined;
	location: () => string;
	/** Whether a git link answers; git's ls-remote by default. */
	remote?: (url: string) => Promise<{ branch: string | null } | undefined>;
}) {
	const origin = () => originOf(deps.cloud);
	const standing = async (team: string, project: string): Promise<TeamStanding> => {
		try {
			const found = await cloudTeams(deps.spoolDir, { ...deps.cloud, origin: origin() }).project(team, project);
			return found.role === "viewer" ? "viewer" : "editor";
		} catch (error) {
			if (error instanceof CloudSignedOut) return "signed-out";
			if (error instanceof CloudTeamRefused && (error.status === 404 || error.status === 403)) return "missing";
			return "unreachable";
		}
	};
	const find = (given: string) =>
		findOpenable(given, {
			spoolDir: deps.spoolDir,
			home: deps.home,
			location: expandHome(deps.location()),
			origin: origin(),
			team: standing,
			...(deps.remote === undefined ? {} : { remote: deps.remote }),
		});
	/** Each clone under way, by the id its sheet asks after. */
	const clones = new Map<string, CloneProgress>();
	return new Hono()
		.get("/find", async (c) => {
			const given = c.req.query("given");
			if (given === undefined) return c.json({ error: "expected ?given=<path or link>" }, 400);
			try {
				return c.json(await find(given));
			} catch (error) {
				if (!(error instanceof SpoolError)) throw error;
				return c.json({ kind: "nothing", says: error.message });
			}
		})
		.post(
			"/clone",
			validator("json", (value, c) => {
				const parsed = z
					.object({ url: z.string().min(1), transfer: z.string().regex(/^[\w-]{1,100}$/u) })
					.safeParse(value);
				return parsed.success ? parsed.data : c.json({ error: 'expected { "url", "transfer" }' }, 400);
			}),
			async (c) => {
				const { url, transfer } = c.req.valid("json");
				const found = await find(url);
				if (found.kind !== "repo") return c.json(found);
				clones.set(transfer, { line: `cloning into ${found.into}`, done: 0 });
				try {
					await cloneInto(found.url, found.into, {
						signal: c.req.raw.signal,
						progress: (progress) => clones.set(transfer, progress),
					});
				} catch (error) {
					if (!(error instanceof SpoolError)) throw error;
					return c.json({ error: error.message }, 409);
				} finally {
					clones.delete(transfer);
				}
				// cloned: read again, as if the folder had been handed over
				return c.json(await find(found.into));
			},
		)
		.get("/clone/progress", (c) => c.json(clones.get(c.req.query("transfer") ?? "") ?? null))
		.post(
			"/import/path",
			validator("json", (value, c) => {
				const parsed = z.object({ path: z.string().min(1) }).safeParse(value);
				return parsed.success ? parsed.data : c.json({ error: 'expected { "path" }' }, 400);
			}),
			async (c) => {
				const found = await find(c.req.valid("json").path);
				if (found.kind !== "file") return c.json({ error: "Choose a .spool project file." }, 400);
				try {
					if (statSync(found.path).size > TRANSFER_LIMITS.compressedBytes)
						return c.json({ error: "The archive exceeds the compressed size limit." }, 400);
					return c.json(
						await importProject(readFileSync(found.path), deps.location(), deps.spoolDir, c.req.raw.signal),
					);
				} catch (error) {
					return c.json({ error: error instanceof Error ? error.message : "Import failed." }, 400);
				}
			},
		);
}
