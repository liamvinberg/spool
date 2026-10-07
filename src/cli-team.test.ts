import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { spoolAsync } from "./cli-test-helpers";
import { makeTempDir } from "./test-helpers";

/**
 * Team projects through the real CLI: a stand-in spool.page over HTTPS and a stand-in Keychain on PATH, so every
 * message here is exactly what a person or an agent reads.
 */

interface Cloud {
	origin: string;
	/** Every path this spool.page was asked for. */
	asked: string[];
}

/** spool.page answering the team API: the account's teams, and its role in the one project there is. */
async function cloud(answers: { teams?: { name: string; role: string }[]; role?: string | null }): Promise<Cloud> {
	const dir = makeTempDir();
	const key = join(dir, "key.pem");
	const certificate = join(dir, "cert.pem");
	execFileSync(
		"openssl",
		["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1"].concat([
			"-keyout",
			key,
			"-out",
			certificate,
		]),
		{ stdio: "ignore" },
	);
	const asked: string[] = [];
	const server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, (request, response) => {
		asked.push(request.url ?? "");
		response.setHeader("content-type", "application/json");
		if (request.url === "/api/teams") {
			const teams = (answers.teams ?? []).map((team) => ({
				id: team.name,
				address: team.name.toLowerCase(),
				logo: null,
				people: 3,
				...team,
			}));
			return response.end(JSON.stringify({ teams, invites: [], mayCreateTeam: false }));
		}
		if (request.url === "/api/teams/devosurf/projects/checkout" && answers.role) {
			const url = `https://${request.headers.host}/devosurf/checkout`;
			return response.end(JSON.stringify({ id: "p", name: "checkout", team: "devosurf", url, role: answers.role }));
		}
		response.statusCode = 404;
		response.end(JSON.stringify({ error: "team_not_found" }));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	onTestFinished(() => new Promise<void>((done) => server.close(() => done())));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing address");
	return { origin: `https://127.0.0.1:${address.port}`, asked };
}

/** A machine's home with a Keychain that holds a session, or none. */
function machine(cloud: Cloud, signedIn: boolean) {
	const home = makeTempDir();
	const bin = join(home, "bin");
	mkdirSync(bin);
	writeFileSync(
		join(bin, "security"),
		signedIn ? `#!/bin/sh\nprintf '%s' "${"t".repeat(43)}"\n` : "#!/bin/sh\nexit 44\n",
	);
	chmodSync(join(bin, "security"), 0o755);
	const env = {
		PATH: `${bin}:${process.env.PATH ?? ""}`,
		SPOOL_CLOUD_ORIGIN: cloud.origin,
		NODE_TLS_REJECT_UNAUTHORIZED: "0",
		NODE_NO_WARNINGS: "1",
		...Object.fromEntries(
			[
				"CLAUDE_CODE_REMOTE",
				"AI_AGENT",
				"CLAUDECODE",
				"CODEX_SANDBOX",
				"CODEX_THREAD_ID",
				"CURSOR_AGENT",
				"COPILOT_AGENT",
			].map((name) => [name, ""]),
		),
	};
	return {
		home,
		run: (args: string[], cwd: string, extra: Record<string, string> = {}) =>
			spoolAsync(args, home, cwd, { ...env, ...extra }),
	};
}

/** A fresh clone of a repo whose design/ is a team project's: spool.json and nothing else. */
function clone(cloud: Cloud): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "spool.json"), `${JSON.stringify({ project: `${cloud.origin}/devosurf/checkout` })}\n`);
	return root;
}

describe("a fresh clone of a team project", { timeout: 60_000 }, () => {
	it("is fetched by any verb, which tells someone signed out to run spool login", async () => {
		const page = await cloud({});
		const { run } = machine(page, false);
		const root = clone(page);
		for (const args of [["open"], ["flows"], ["check"], ["shot", "home"]]) {
			const result = await run(args, join(root, "src"));
			expect(result.status, args.join(" ")).toBe(1);
			expect(result.stderr, args.join(" ")).toBe(
				`spool: ${page.origin}/devosurf/checkout is a team project; run \`spool login\` to fetch its design/\n`,
			);
		}
		expect(existsSync(join(root, "design"))).toBe(false);
	});

	it("tells a non-member to ask an admin, a viewer where to look, and a cloud agent it can't yet", async () => {
		const outsider = await cloud({ role: null });
		const root = clone(outsider);
		const notMember = await machine(outsider, true).run(["flows"], root);
		expect(notMember.stderr).toBe(
			`spool: ${outsider.origin}/devosurf/checkout isn't a team project you're in; ask an admin of devosurf to invite you\n`,
		);

		const viewing = await cloud({ role: "viewer" });
		const viewer = await machine(viewing, true).run(["open"], clone(viewing));
		expect(viewer.stderr).toBe(
			`spool: you're a viewer of devosurf; open ${viewing.origin}/devosurf/checkout in a browser to look\n`,
		);

		const agent = await machine(outsider, false).run(["shot", "home"], root, { CLAUDE_CODE_REMOTE: "true" });
		expect(agent.stderr).toBe(
			`spool: ${outsider.origin}/devosurf/checkout is a team project, and Claude Code on the web can't fetch a team project's design/ yet; work on it from a machine with spool signed in to devosurf\n`,
		);
		expect(existsSync(join(root, "design"))).toBe(false);
	});
});

describe("spool init", { timeout: 60_000 }, () => {
	it("is unchanged and asks spool.page nothing for someone signed out", async () => {
		const page = await cloud({ teams: [{ name: "Devosurf", role: "editor" }] });
		const root = makeTempDir();
		const result = await machine(page, false).run(["init"], root);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("initialized spool project at");
		expect(existsSync(join(root, "design/canvas.json"))).toBe(true);
		expect(existsSync(join(root, "spool.json"))).toBe(false);
		expect(page.asked).toEqual([]);
	});

	it("writes nothing for an editor in teams and names the choice; --local stays on this Mac, offline", async () => {
		const page = await cloud({
			teams: [
				{ name: "Tidemark", role: "admin" },
				{ name: "Devosurf", role: "editor" },
				{ name: "Northlight", role: "viewer" },
			],
		});
		const { run } = machine(page, true);
		const root = makeTempDir();
		const asked = await run(["init"], root);
		expect(asked.status).toBe(1);
		expect(asked.stderr).toBe(
			"spool: You're in Tidemark and Devosurf. Run again with `--team <name>`, or `--local`.\n",
		);
		expect(existsSync(join(root, "design"))).toBe(false);

		const before = page.asked.length;
		const local = await run(["init", "--local"], root);
		expect(local.status).toBe(0);
		expect(local.stdout).toContain("initialized spool project at");
		expect(existsSync(join(root, "spool.json"))).toBe(false);
		expect(page.asked.length).toBe(before);
	});

	it("is unchanged for someone signed in who edits in no team", async () => {
		const page = await cloud({ teams: [{ name: "Northlight", role: "viewer" }] });
		const root = makeTempDir();
		const result = await machine(page, true).run(["init"], root);
		expect(result.status).toBe(0);
		expect(existsSync(join(root, "design/canvas.json"))).toBe(true);
	});
});
