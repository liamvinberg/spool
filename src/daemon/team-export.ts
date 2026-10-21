import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import { authorizedCloudRequest, type CloudRequestOptions, CloudSignedOut } from "../cloud-auth";
import { CloudTeamRefused } from "../cloud-teams";
import { SpoolError } from "../errors";

/*
 * A team export (GLOSSARY: Team export): a team's data written out of Spool Cloud into a folder an admin picked, as
 * `<team address> export <date>/` holding `team.json` and one git repository per team project. Each repository holds
 * `design/` with the team's history as commits, made with `git fast-import`: one per applied save, one per bundle of
 * saves made together, each authored by whoever saved it as People names them, at the save's time. Everything is read
 * from spool.page's export reads a bounded page at a time, so no history is too long and no project too large.
 */

/** A refusal this Mac says itself, such as having no git. spool.page's own refusals are `CloudTeamRefused`. */
export class TeamExportError extends SpoolError {}

/** Who made a save, as People shows them; a deleted account is Former member, with no address. */
interface Author {
	name: string;
	email: string | null;
}

interface Save {
	version: number;
	path: string;
	hash: string | null;
	account: string;
	at: number;
	bundle: number;
}

interface CloudFile {
	path: string;
	version: number;
	hash: string | null;
}

/** The team file as spool.page reads it. */
interface TeamRead {
	team: { address: string; name: string; purgeAfter: number | null };
	members: unknown[];
	projects: { name: string }[];
	shares: unknown[];
}

/** How far the export has come: the project being written and how many of its saves are in. */
export interface TeamExportProgress {
	project: string;
	/** Which project of how many this is, from 1. */
	index: number;
	projects: number;
	saves: number;
}

export interface TeamExportOptions {
	spoolDir: string;
	cloud?: CloudRequestOptions | undefined;
	/** The team's address. */
	team: string;
	/** One project's name, for a project's Export…; every project of the team when absent. */
	project?: string | undefined;
	/** The folder the admin picked: the export is written into it. */
	into: string;
	now?: Date;
	signal?: AbortSignal | undefined;
	onProgress?: (progress: TeamExportProgress) => void;
	/** The git to run; `git` from the PATH unless a test says otherwise. */
	git?: string;
}

/** The author of a commit for files older than the history kept, and of the commit that squares the history up. */
const CLOUD: Author = { name: "Spool Cloud", email: null };

/**
 * Writes the team's export into `into` and says where. It is written under a hidden name and only takes its own
 * when every repository is done: a cancel or a failure removes it, so nothing half-written is ever named as an export.
 */
export async function exportTeam(options: TeamExportOptions): Promise<{ folder: string }> {
	const { into, signal } = options;
	const now = options.now ?? new Date();
	const git = options.git ?? "git";
	await gitVersion(git);
	signal?.throwIfAborted();
	const reads = exportReads(options);
	const team = await reads.team();
	const names = team.projects.map((project) => project.name);
	const projects = options.project === undefined ? names : [options.project];
	if (options.project !== undefined && !names.includes(options.project))
		throw new CloudTeamRefused("project_not_found", 404, {});
	const working = join(into, `.${options.team} export ${randomUUID()}.incomplete`);
	await mkdir(working, { recursive: true });
	try {
		await writeFile(
			join(working, "team.json"),
			`${JSON.stringify(
				{
					team: { address: team.team.address, name: team.team.name },
					exported: now.toISOString(),
					members: team.members,
					shares:
						options.project === undefined
							? team.shares
							: team.shares.filter((share) => sharedFrom(share) === options.project),
				},
				null,
				"\t",
			)}\n`,
		);
		for (const [index, project] of projects.entries()) {
			signal?.throwIfAborted();
			await exportProject(reads, project, join(working, project), {
				git,
				now,
				signal,
				progress: (saves) => options.onProgress?.({ project, index: index + 1, projects: projects.length, saves }),
			});
		}
		const folder = freeName(into, `${options.team} export ${day(now)}`);
		await rename(working, folder);
		return { folder };
	} catch (error) {
		await rm(working, { recursive: true, force: true });
		throw error;
	}
}

/** Which project a share in the team file is of. */
function sharedFrom(share: unknown): unknown {
	return typeof share === "object" && share !== null ? (share as { project?: unknown }).project : undefined;
}

/** The date as the folder names it, on this Mac's calendar. */
function day(date: Date): string {
	const two = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The folder's name, or the same with " 2", " 3"… after it when an export of that day is there already. */
function freeName(into: string, name: string): string {
	for (let count = 1; ; count += 1) {
		const path = join(into, count === 1 ? name : `${name} ${count}`);
		if (!existsSync(path)) return path;
	}
}

/** git's version, or a plain refusal when this Mac has none to run. */
async function gitVersion(git: string): Promise<void> {
	try {
		await promisify(execFile)(git, ["--version"]);
	} catch {
		throw new TeamExportError(
			"Exporting a team needs git, and this Mac has none. Install it with `xcode-select --install` in Terminal, then export again.",
		);
	}
}

/** spool.page's export reads, as this Mac's device session reaches them. */
function exportReads(options: Pick<TeamExportOptions, "spoolDir" | "cloud" | "team" | "signal">) {
	const base = `/api/teams/${encodeURIComponent(options.team)}/export`;
	const ask = async (path: string, init: RequestInit = {}): Promise<Response> => {
		const response = await authorizedCloudRequest(
			options.spoolDir,
			`${base}${path}`,
			{ ...init, ...(options.signal ? { signal: options.signal } : {}) },
			{ timeoutMs: 120_000, ...options.cloud },
		);
		options.signal?.throwIfAborted();
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
			throw new CloudTeamRefused(
				typeof body?.error === "string" ? body.error : "unavailable",
				response.status,
				body ?? {},
			);
		}
		return response;
	};
	const project = (name: string) => `/projects/${encodeURIComponent(name)}`;
	return {
		team: async () => (await (await ask("")).json()) as TeamRead,
		saves: async (name: string, after: number) =>
			(await (await ask(`${project(name)}/saves?after=${after}`)).json()) as {
				saves: Save[];
				authors: Record<string, Author>;
				next: number | null;
			},
		files: async (name: string, after: string) =>
			(await (await ask(`${project(name)}/files?after=${encodeURIComponent(after)}`)).json()) as {
				files: CloudFile[];
				next: string | null;
			},
		/** The bytes of as many of the hashes as one answer carries, by hash, and the hashes spool.page never kept. */
		blobs: async (name: string, hashes: string[]) => {
			const body = new Uint8Array(
				await (
					await ask(`${project(name)}/blobs`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ hashes }),
					})
				).arrayBuffer(),
			);
			const length = new DataView(body.buffer, body.byteOffset).getUint32(0);
			const head = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + length))) as {
				blobs: { hash: string; size: number }[];
				missing: string[];
			};
			const blobs = new Map<string, Uint8Array>();
			let at = 4 + length;
			for (const { hash, size } of head.blobs) {
				blobs.set(hash, body.subarray(at, at + size));
				at += size;
			}
			return { blobs, missing: head.missing };
		},
	};
}

type Reads = ReturnType<typeof exportReads>;

/** The most hashes one blobs ask names: spool.page's own bound. */
const BLOB_HASHES = 256;

/** One project's repository: its history replayed into `git fast-import`, then its files checked out. */
async function exportProject(
	reads: Reads,
	project: string,
	repo: string,
	options: { git: string; now: Date; signal?: AbortSignal | undefined; progress: (saves: number) => void },
): Promise<void> {
	const { git, signal } = options;
	await mkdir(repo, { recursive: true });
	await run(git, ["init", "--quiet", "--initial-branch=main"], repo);

	// the team's files now, by path
	const current = new Map<string, CloudFile>();
	for (let after: string | null = ""; after !== null; ) {
		const page = await reads.files(project, after);
		for (const file of page.files) current.set(file.path, file);
		after = page.next;
	}

	const importer = new FastImport(spawnImport(git, repo, signal));
	/** Each hash's mark in the import, once its bytes are written. */
	const marks = new Map<string, number>();
	/** Hashes spool.page no longer keeps: a change to one is left out, and the last commit squares the files up. */
	const lost = new Set<string>();
	/** What the history so far leaves, by path. */
	const replayed = new Map<string, string>();
	let commits = 0;

	const writeBlobs = async (hashes: Iterable<string>) => {
		let wanted = [...new Set(hashes)].filter((hash) => !marks.has(hash) && !lost.has(hash));
		while (wanted.length > 0) {
			const { blobs, missing } = await reads.blobs(project, wanted.slice(0, BLOB_HASHES));
			for (const hash of missing) lost.add(hash);
			for (const [hash, bytes] of blobs) marks.set(hash, await importer.blob(bytes));
			wanted = wanted.filter((hash) => !marks.has(hash) && !lost.has(hash));
			if (blobs.size === 0 && missing.length === 0)
				throw new TeamExportError("Spool Cloud sent none of the files asked for.");
		}
	};
	const commit = async (
		author: Author,
		at: number,
		message: string,
		changes: { path: string; hash: string | null }[],
	) => {
		await writeBlobs(changes.flatMap((change) => (change.hash === null ? [] : [change.hash])));
		const lines: string[] = [];
		for (const { path, hash } of changes) {
			if (hash === null) {
				lines.push(`D ${quoted(`design/${path}`)}`);
				replayed.delete(path);
				continue;
			}
			const mark = marks.get(hash);
			if (mark === undefined) continue;
			lines.push(`M 100644 :${mark} ${quoted(`design/${path}`)}`);
			replayed.set(path, hash);
		}
		await importer.commit(author, Math.floor(at / 1000), message, lines);
		commits += 1;
	};

	let read = 0;
	let first = true;
	/** A bundle whose saves may go on in the next page. */
	let open: { saves: Save[]; author: Author } | null = null;
	const close = async () => {
		if (open === null) return;
		const { saves, author } = open;
		open = null;
		const only = saves.length === 1 ? saves[0] : undefined;
		await commit(
			author,
			saves[0]?.at ?? 0,
			only ? `${only.hash === null ? "Delete" : "Save"} ${only.path}` : `Save ${saves.length} files together`,
			saves.map(({ path, hash }) => ({ path, hash })),
		);
	};
	for (let after: number | null = 0; after !== null; ) {
		const page = await reads.saves(project, after);
		if (first) {
			first = false;
			// the files older than the first save kept: Spool Cloud has them, but not how they came to be
			const start = page.saves[0];
			const older = [...current.values()].filter(
				(file) => file.hash !== null && (start === undefined || file.version < start.version),
			);
			if (older.length > 0 && start !== undefined) {
				const at = start.at;
				await commit(
					CLOUD,
					at,
					`design/ as Spool Cloud held it on ${new Date(at).toISOString().slice(0, 10)}`,
					older,
				);
			}
		}
		for (const save of page.saves) {
			if (open !== null && open.saves[0]?.bundle !== save.bundle) await close();
			open ??= { saves: [], author: page.authors[save.account] ?? { name: "Former member", email: null } };
			open.saves.push(save);
		}
		read += page.saves.length;
		options.progress(read);
		after = page.next;
	}
	await close();

	// the last commit's tree is the team's files: whatever the history doesn't account for is squared up here
	const squaring: { path: string; hash: string | null }[] = [];
	for (const file of current.values())
		if (file.hash !== null && replayed.get(file.path) !== file.hash)
			squaring.push({ path: file.path, hash: file.hash });
	for (const path of replayed.keys())
		if ((current.get(path)?.hash ?? null) === null) squaring.push({ path, hash: null });
	if (squaring.length > 0)
		await commit(
			CLOUD,
			options.now.getTime(),
			`design/ as Spool Cloud holds it on ${options.now.toISOString().slice(0, 10)}`,
			squaring,
		);
	await importer.done();
	if (commits > 0) await run(git, ["reset", "--quiet", "--hard", "main"], repo);
}

/** A path as fast-import reads one: quoted, with its quotes, backslashes and line ends escaped. */
function quoted(path: string): string {
	return `"${path.replace(/[\\"]/gu, (character) => `\\${character}`).replace(/\n/gu, "\\n")}"`;
}

/** A name or address as a git ident carries one: no angle brackets or line ends. */
function ident(text: string): string {
	return text.replace(/[<>\n]/gu, "").trim();
}

function spawnImport(git: string, repo: string, signal: AbortSignal | undefined): ChildProcessWithoutNullStreams {
	return spawn(git, ["fast-import", "--quiet", "--date-format=raw", "--done"], {
		cwd: repo,
		stdio: ["pipe", "pipe", "pipe"],
		...(signal ? { signal } : {}),
	});
}

/** `git fast-import` fed its stream as the history is read, waiting for it to take each write in. */
class FastImport {
	private next = 1;
	private readonly exited: Promise<void>;
	private failed: Error | undefined;

	constructor(private readonly process: ChildProcessWithoutNullStreams) {
		let stderr = "";
		process.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		process.stdout.resume();
		process.stdin.on("error", () => {});
		this.exited = new Promise((resolve, reject) => {
			process.on("error", (error) => {
				this.failed = error;
				reject(error);
			});
			process.on("close", (code) => {
				if (code === 0) resolve();
				else {
					this.failed ??= new TeamExportError(`git fast-import failed: ${stderr.trim() || `exit ${code}`}`);
					reject(this.failed);
				}
			});
		});
		this.exited.catch(() => {});
	}

	async blob(bytes: Uint8Array): Promise<number> {
		const mark = this.next;
		this.next += 1;
		await this.write(Buffer.from(`blob\nmark :${mark}\ndata ${bytes.byteLength}\n`));
		await this.write(bytes);
		await this.write(Buffer.from("\n"));
		return mark;
	}

	/** A commit on main, after the one before it, with its changes as fast-import lines. */
	async commit(author: Author, seconds: number, message: string, changes: string[]): Promise<void> {
		const who = `${ident(author.name)} <${author.email === null ? "" : ident(author.email)}> ${seconds} +0000`;
		const text = Buffer.from(message);
		await this.write(
			Buffer.from(
				`commit refs/heads/main\nauthor ${who}\ncommitter ${who}\ndata ${text.byteLength}\n${message}\n${changes.map((line) => `${line}\n`).join("")}\n`,
			),
		);
	}

	async done(): Promise<void> {
		await this.write(Buffer.from("done\n"));
		this.process.stdin.end();
		await this.exited;
	}

	private async write(bytes: Uint8Array): Promise<void> {
		if (this.failed) throw this.failed;
		if (this.process.stdin.write(bytes)) return;
		await new Promise<void>((resolve, reject) => {
			const settle = () => {
				this.process.stdin.off("drain", settle);
				this.process.off("close", settle);
				if (this.failed) reject(this.failed);
				else resolve();
			};
			this.process.stdin.once("drain", settle);
			this.process.once("close", settle);
		});
	}
}

/** A git command in the repository, its failure said with what git said. */
async function run(git: string, args: string[], cwd: string): Promise<void> {
	try {
		await promisify(execFile)(git, args, { cwd });
	} catch (error) {
		throw new TeamExportError(`git ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** A running export, by the id the app gave it: how far it has come, and its cancel. */
interface RunningExport {
	team: string;
	progress: TeamExportProgress | null;
	controller: AbortController;
}

/**
 * The daemon's side of a team export: Home asks it to export into a folder, reads its progress while it runs, and
 * may cancel it. spool.page's refusal comes back as its own reason; this Mac's (no git, say) as words to show.
 */
export function teamExportRoutes(options: { spoolDir: string; cloud?: CloudRequestOptions | undefined }) {
	const running = new Map<string, RunningExport>();
	return new Hono()
		.post(
			"/teams/:team/export",
			validator("json", (value, c) => {
				const { into, project, transfer } = (value ?? {}) as {
					into?: unknown;
					project?: unknown;
					transfer?: unknown;
				};
				if (typeof transfer !== "string" || !/^[a-zA-Z0-9-]{1,100}$/u.test(transfer))
					return c.json({ error: "An export id is required.", code: "invalid_export" }, 400);
				if (project !== undefined && typeof project !== "string")
					return c.json({ error: "Name a project to export.", code: "invalid_export" }, 400);
				const folder = typeof into === "string" ? expandHome(into) : "";
				if (!isAbsolute(folder) || !isDirectory(folder))
					return c.json({ error: "Choose a folder to export into.", code: "invalid_folder" }, 400);
				return { into: folder, project, transfer };
			}),
			async (c) => {
				const { into, project, transfer } = c.req.valid("json");
				if (running.has(transfer))
					return c.json({ error: "This export is already running.", code: "export_running" }, 409);
				const job: RunningExport = { team: c.req.param("team"), progress: null, controller: new AbortController() };
				running.set(transfer, job);
				try {
					return c.json(
						await exportTeam({
							spoolDir: options.spoolDir,
							cloud: options.cloud,
							team: job.team,
							project,
							into,
							signal: job.controller.signal,
							onProgress: (progress) => {
								job.progress = progress;
							},
						}),
					);
				} catch (error) {
					if (job.controller.signal.aborted)
						return c.json({ error: "Export cancelled.", code: "export_cancelled", cancelled: true }, 409);
					if (error instanceof CloudTeamRefused)
						return c.json({ error: error.code }, error.status as ContentfulStatusCode);
					if (error instanceof CloudSignedOut) return c.json({ error: "signed_out" }, 401);
					if (error instanceof SpoolError) return c.json({ error: error.message, code: "export_failed" }, 400);
					return c.json({ error: "unreachable" }, 503);
				} finally {
					running.delete(transfer);
				}
			},
		)
		.get("/exports/:transfer", (c) => {
			const job = running.get(c.req.param("transfer"));
			return job ? c.json({ team: job.team, progress: job.progress }) : c.json({ error: "no_export" }, 404);
		})
		.post("/exports/:transfer/cancel", (c) => {
			running.get(c.req.param("transfer"))?.controller.abort();
			return c.json({ cancelled: true });
		});
}

function expandHome(path: string): string {
	return path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
