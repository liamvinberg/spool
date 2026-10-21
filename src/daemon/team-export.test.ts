import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { exportTeam, TeamExportError } from "./team-export";

/*
 * A team export against a fake spool.page that answers the export reads as spool-cloud does, a small page at a
 * time, written with real git.
 */

const TOKEN = "t".repeat(43);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

interface FakeSave {
	version: number;
	path: string;
	/** Null for a delete. */
	content: string | null;
	account: string;
	/** Milliseconds. */
	at: number;
	bundle?: number;
}

interface FakeProject {
	saves: FakeSave[];
	/** The team's files now, by path: what the saves leave, unless the history kept starts after some of them. */
	files: Record<string, { version: number; content: string | null }>;
}

/** The team the fake spool.page holds: its people and shares as the team file reads, and each project. */
interface FakeTeam {
	members: { name: string; email: string; role: string; joined: number }[];
	shares: unknown[];
	authors: Record<string, { name: string; email: string | null }>;
	projects: Record<string, FakeProject>;
}

/** The files a project's saves leave behind, by path. */
function filesOf(saves: FakeSave[]): FakeProject["files"] {
	const files: FakeProject["files"] = {};
	for (const save of saves) files[save.path] = { version: save.version, content: save.content };
	return files;
}

/** spool.page's export reads over a team, two saves or files a page and about 8 bytes of blobs an answer. */
function fakeCloud(team: FakeTeam, options: { delay?: () => Promise<void> } = {}) {
	const asked: string[] = [];
	const fetch = async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		asked.push(`${request.method} ${url.pathname}${url.search}`);
		await options.delay?.();
		if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) return Response.json({}, { status: 401 });
		const match = /^\/api\/teams\/tidemark\/export(?:\/projects\/([^/]+)\/(saves|files|blobs))?$/u.exec(url.pathname);
		if (!match) return Response.json({ error: "not_found" }, { status: 404 });
		const [, name, read] = match;
		if (name === undefined)
			return Response.json({
				team: { address: "tidemark", name: "Tidemark", purgeAfter: null },
				members: team.members,
				projects: Object.keys(team.projects).map((project) => ({ name: project })),
				shares: team.shares,
			});
		const project = team.projects[decodeURIComponent(name)];
		if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });
		const contents = new Map<string, string>();
		for (const save of project.saves) if (save.content !== null) contents.set(hash(save.content), save.content);
		for (const file of Object.values(project.files))
			if (file.content !== null) contents.set(hash(file.content), file.content);
		if (read === "saves") {
			const after = Number(url.searchParams.get("after") ?? 0);
			const rest = project.saves.filter((save) => save.version > after);
			const page = rest.slice(0, 2);
			return Response.json({
				saves: page.map((save) => ({
					version: save.version,
					path: save.path,
					hash: save.content === null ? null : hash(save.content),
					account: save.account,
					at: save.at,
					bundle: save.bundle ?? save.version,
				})),
				authors: Object.fromEntries(page.map((save) => [save.account, team.authors[save.account]])),
				next: rest.length > 2 ? (page.at(-1)?.version ?? null) : null,
			});
		}
		if (read === "files") {
			const after = url.searchParams.get("after") ?? "";
			const rest = Object.entries(project.files)
				.filter(([path]) => path > after)
				.sort(([a], [b]) => (a < b ? -1 : 1));
			const page = rest.slice(0, 2);
			return Response.json({
				files: page.map(([path, file]) => ({
					path,
					version: file.version,
					hash: file.content === null ? null : hash(file.content),
				})),
				next: rest.length > 2 ? (page.at(-1)?.[0] ?? null) : null,
			});
		}
		const { hashes } = (await request.json()) as { hashes: string[] };
		const blobs: { hash: string; bytes: Buffer }[] = [];
		const missing: string[] = [];
		let size = 0;
		for (const asked of hashes) {
			const content = contents.get(asked);
			if (content === undefined) {
				missing.push(asked);
				continue;
			}
			if (blobs.length > 0 && size + content.length > 8) break;
			blobs.push({ hash: asked, bytes: Buffer.from(content) });
			size += content.length;
		}
		const head = Buffer.from(
			JSON.stringify({ blobs: blobs.map((blob) => ({ hash: blob.hash, size: blob.bytes.length })), missing }),
		);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(head.length);
		return new Response(Buffer.concat([length, head, ...blobs.map((blob) => blob.bytes)]));
	};
	return {
		asked,
		cloud: {
			origin: "https://cloud.test",
			vault: { read: async () => TOKEN, write: async () => {}, delete: async () => {} },
			fetch,
		},
	};
}

const git = (repo: string, ...args: string[]) =>
	execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

/** Each commit, oldest first: who, when (seconds), its message, and what it changed. */
function history(repo: string) {
	return git(repo, "log", "--reverse", "--format=%x00%an <%ae>|%at|%s", "--name-status")
		.split("\0")
		.filter(Boolean)
		.map((entry) => {
			const [head = "", ...changes] = entry.trim().split("\n");
			const [author, at, message] = head.split("|");
			return {
				author,
				at: Number(at),
				message,
				changes: changes.filter(Boolean).map((line) => line.replace("\t", " ")),
			};
		});
}

/** Every file in the last commit's tree, by path, with its text. */
function tree(repo: string): Record<string, string> {
	const paths = git(repo, "ls-tree", "-r", "--name-only", "HEAD").split("\n").filter(Boolean);
	return Object.fromEntries(paths.map((path) => [path, git(repo, "show", `HEAD:${path}`)]));
}

const ANA = "acct-ana";
const BEN = "acct-ben";
const T = 1_760_000_000_000;
const AUTHORS = {
	[ANA]: { name: "Ana Lind", email: "ana@tidemark.app" },
	[BEN]: { name: "Former member", email: null },
};
const NOW = new Date(2026, 9, 21, 15, 0);

function scratchTeam(): FakeTeam {
	const checkout: FakeSave[] = [
		{ version: 1, path: "canvas.json", content: '{"format":3}', account: ANA, at: T },
		{ version: 2, path: "frames/home/frame.tsx", content: "home 1", account: ANA, at: T + 60_000 },
		// a bundle of three, a move in say: one commit
		{ version: 3, path: "frames/menu/frame.tsx", content: "menu 1", account: BEN, at: T + 120_000, bundle: 3 },
		{ version: 4, path: "shared/tokens.css", content: "ink", account: BEN, at: T + 120_000, bundle: 3 },
		{ version: 5, path: "frames/home/frame.tsx", content: null, account: BEN, at: T + 120_000, bundle: 3 },
		{ version: 6, path: "frames/menu/frame.tsx", content: "menu 2", account: ANA, at: T + 180_000 },
	];
	return {
		members: [
			{ name: "Ana Lind", email: "ana@tidemark.app", role: "admin", joined: 1_750_000_000 },
			{ name: "Cleo", email: "cleo@tidemark.app", role: "viewer", joined: 1_755_000_000 },
		],
		shares: [
			{
				project: "checkout",
				pages: ["home"],
				people: null,
				link: "s1.onspool.page",
				made: 1,
				by: "Ana Lind",
				stopped: null,
			},
		],
		authors: AUTHORS,
		projects: { checkout: { saves: checkout, files: filesOf(checkout) } },
	};
}

describe("a team export", () => {
	it("writes the team file and each project as a git repository: a commit per save or bundle, authored and dated, ending at the team's files", async () => {
		const into = makeTempDir();
		const { cloud } = fakeCloud(scratchTeam());

		const { folder } = await exportTeam({ spoolDir: makeTempDir(), cloud, team: "tidemark", into, now: NOW });

		expect(folder).toBe(join(into, "tidemark export 2026-10-21"));
		expect(readdirSync(into)).toEqual(["tidemark export 2026-10-21"]);
		expect(readdirSync(folder).sort()).toEqual(["checkout", "team.json"]);
		expect(JSON.parse(readFileSync(join(folder, "team.json"), "utf8"))).toEqual({
			team: { address: "tidemark", name: "Tidemark" },
			exported: NOW.toISOString(),
			members: scratchTeam().members,
			shares: scratchTeam().shares,
		});

		const repo = join(folder, "checkout");
		const seconds = T / 1000;
		expect(history(repo)).toEqual([
			{
				author: "Ana Lind <ana@tidemark.app>",
				at: seconds,
				message: "Save canvas.json",
				changes: ["A design/canvas.json"],
			},
			{
				author: "Ana Lind <ana@tidemark.app>",
				at: seconds + 60,
				message: "Save frames/home/frame.tsx",
				changes: ["A design/frames/home/frame.tsx"],
			},
			{
				author: "Former member <>",
				at: seconds + 120,
				message: "Save 3 files together",
				changes: ["D design/frames/home/frame.tsx", "A design/frames/menu/frame.tsx", "A design/shared/tokens.css"],
			},
			{
				author: "Ana Lind <ana@tidemark.app>",
				at: seconds + 180,
				message: "Save frames/menu/frame.tsx",
				changes: ["M design/frames/menu/frame.tsx"],
			},
		]);
		expect(tree(repo)).toEqual({
			"design/canvas.json": '{"format":3}',
			"design/frames/menu/frame.tsx": "menu 2",
			"design/shared/tokens.css": "ink",
		});
		// the files are there to open, not only in the history
		expect(readFileSync(join(repo, "design/frames/menu/frame.tsx"), "utf8")).toBe("menu 2");
		expect(git(repo, "status", "--porcelain")).toBe("");
	});

	it("puts the files older than the history Spool Cloud kept into a first commit", async () => {
		const team = scratchTeam();
		const kept = team.projects.checkout?.saves.slice(3) ?? [];
		team.projects.checkout = {
			saves: kept,
			files: {
				...filesOf(kept),
				"canvas.json": { version: 1, content: '{"format":3}' },
				"shared/old.css": { version: 2, content: "old" },
			},
		};
		const into = makeTempDir();

		const { folder } = await exportTeam({
			spoolDir: makeTempDir(),
			cloud: fakeCloud(team).cloud,
			team: "tidemark",
			into,
			now: NOW,
		});

		const commits = history(join(folder, "checkout"));
		expect(commits[0]).toEqual({
			author: "Spool Cloud <>",
			at: (T + 120_000) / 1000,
			message: `design/ as Spool Cloud held it on ${new Date(T + 120_000).toISOString().slice(0, 10)}`,
			changes: ["A design/canvas.json", "A design/shared/old.css"],
		});
		expect(commits).toHaveLength(3);
		expect(tree(join(folder, "checkout"))).toEqual({
			"design/canvas.json": '{"format":3}',
			"design/frames/menu/frame.tsx": "menu 2",
			"design/shared/old.css": "old",
			"design/shared/tokens.css": "ink",
		});
	});

	it("squares the last commit up with the team's files where the history kept doesn't reach them", async () => {
		const team = scratchTeam();
		const checkout = team.projects.checkout;
		if (!checkout) throw new Error("no checkout");
		// the team's menu file now is bytes no save in the history carries
		checkout.files["frames/menu/frame.tsx"] = { version: 6, content: "menu as the team has it" };
		const into = makeTempDir();

		const { folder } = await exportTeam({
			spoolDir: makeTempDir(),
			cloud: fakeCloud(team).cloud,
			team: "tidemark",
			into,
			now: NOW,
		});

		const repo = join(folder, "checkout");
		expect(history(repo).at(-1)).toEqual({
			author: "Spool Cloud <>",
			at: Math.floor(NOW.getTime() / 1000),
			message: `design/ as Spool Cloud holds it on ${NOW.toISOString().slice(0, 10)}`,
			changes: ["M design/frames/menu/frame.tsx"],
		});
		expect(tree(repo)["design/frames/menu/frame.tsx"]).toBe("menu as the team has it");
	});

	it("exports one project when asked for it, beside the team file", async () => {
		const team = scratchTeam();
		team.projects.menu = { saves: [], files: {} };
		const into = makeTempDir();
		const { folder } = await exportTeam({
			spoolDir: makeTempDir(),
			cloud: fakeCloud(team).cloud,
			team: "tidemark",
			project: "checkout",
			into,
			now: NOW,
		});
		expect(readdirSync(folder).sort()).toEqual(["checkout", "team.json"]);
	});

	it("names a second export of the same day apart from the first", async () => {
		const into = makeTempDir();
		const { cloud } = fakeCloud(scratchTeam());
		await exportTeam({ spoolDir: makeTempDir(), cloud, team: "tidemark", into, now: NOW });
		const again = await exportTeam({ spoolDir: makeTempDir(), cloud, team: "tidemark", into, now: NOW });
		expect(again.folder).toBe(join(into, "tidemark export 2026-10-21 2"));
	});

	it("leaves nothing named as complete when cancelled, and says so", async () => {
		const into = makeTempDir();
		const controller = new AbortController();
		let reads = 0;
		const { cloud } = fakeCloud(scratchTeam(), {
			delay: async () => {
				reads += 1;
				// cancelled partway through the history
				if (reads === 5) controller.abort();
			},
		});
		await expect(
			exportTeam({ spoolDir: makeTempDir(), cloud, team: "tidemark", into, now: NOW, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(readdirSync(into)).toEqual([]);
	});

	it("says plainly when this Mac has no git, before writing anything", async () => {
		const into = makeTempDir();
		const { cloud, asked } = fakeCloud(scratchTeam());
		const failed = exportTeam({
			spoolDir: makeTempDir(),
			cloud,
			team: "tidemark",
			into,
			now: NOW,
			git: "/nowhere/git",
		});
		await expect(failed).rejects.toBeInstanceOf(TeamExportError);
		await expect(failed).rejects.toThrow(/git/u);
		expect(asked).toEqual([]);
		expect(existsSync(into) && readdirSync(into)).toEqual([]);
	});

	it("passes on spool.page's refusal of an editor or viewer", async () => {
		const into = makeTempDir();
		const { cloud } = fakeCloud(scratchTeam());
		const refusing = {
			...cloud,
			fetch: async () => Response.json({ error: "admin_required" }, { status: 403 }),
		};
		await expect(
			exportTeam({ spoolDir: makeTempDir(), cloud: refusing, team: "tidemark", into, now: NOW }),
		).rejects.toMatchObject({ code: "admin_required" });
		expect(readdirSync(into)).toEqual([]);
	});
});
