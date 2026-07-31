import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixtureAgentExecutor, loginAgentExecutor, makeApp, makeProject, makeTempDir, until } from "../test-helpers";
import { agentInstalled, askAgentLogin, loginOf, planAgentLogin } from "./agent-preflight";

/**
 * The two ways there is no agent to talk to (#201).
 *
 * The split is the thing under test. Whether a command is on PATH is a fact about this
 * machine, so it is looked up and it is stable. Whether it is signed in is a fact inside
 * another product, so it is asked of the binary — and the reply here is `claude auth
 * status --json` verbatim from 2.1.220, with the account's own email in it.
 */

/** the reply, whole, as the installed binary prints it */
const SIGNED_IN = `{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "ada@kaffe.se",
  "orgId": "5a33271d-37ab-4827-9d20-de83aa27a741",
  "orgName": "Kaffe AB",
  "subscriptionType": "team"
}`;

const SIGNED_OUT = `{
  "loggedIn": false,
  "apiProvider": "firstParty"
}`;

/** a directory holding one runnable file by that name, which is what being installed is */
function bin(name: string): string {
	const dir = join(makeTempDir(), "bin");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, name);
	writeFileSync(path, "#!/bin/sh\nexit 0\n");
	chmodSync(path, 0o755);
	return dir;
}

describe("is the agent on this machine", () => {
	it("finds the bare name on a PATH entry", () => {
		const dir = bin("claude");

		expect(agentInstalled({ PATH: `${join(dir, "nope")}${delimiter}${dir}` })).toBe(true);
	});

	it("answers no when nothing on PATH carries the name", () => {
		expect(agentInstalled({ PATH: bin("cloud") })).toBe(false);
		expect(agentInstalled({ PATH: "" })).toBe(false);
		expect(agentInstalled({})).toBe(false);
	});

	/**
	 * A file with the right name and no executable bit is not a command, and the check has
	 * to agree with the spawn about that or the wall goes down and the send fails instead.
	 */
	it("does not take a file it could not run", () => {
		const dir = join(makeTempDir(), "bin");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "claude"), "not a program\n");
		chmodSync(join(dir, "claude"), 0o644);

		expect(agentInstalled({ PATH: dir })).toBe(false);
	});

	/**
	 * An empty PATH entry means the working directory to a shell, and spool is not a shell:
	 * resolving it would make a `claude` file somebody committed into a project the thing
	 * spool reports as installed.
	 */
	it("never resolves a bare name against the working directory", () => {
		const looked: string[] = [];
		agentInstalled({ PATH: `${delimiter}${delimiter}/usr/bin` }, (path) => {
			looked.push(path);
			return false;
		});

		expect(looked).toEqual([join("/usr/bin", "claude")]);
	});
});

describe("whose login it is", () => {
	it("asks the binary and never a file beside it", async () => {
		const fixture = loginAgentExecutor(SIGNED_IN);

		const login = await askAgentLogin({ executor: fixture.executor, root: "/project", env: { HOME: "/home/ada" } });

		expect(login).toEqual({ signedIn: true, account: "ada@kaffe.se" });
		// the whole of what it runs: no session, no prompt, no model, no turn
		expect(fixture.spawned[0]?.spawn.args).toEqual(["auth", "status", "--json"]);
		expect(fixture.spawned[0]?.spawn.command).toBe("claude");
		expect(fixture.spawned[0]?.inputs).toEqual([]);
	});

	it("takes the binary's own no for an answer", async () => {
		const login = await askAgentLogin({
			executor: loginAgentExecutor(SIGNED_OUT).executor,
			root: "/project",
			env: {},
		});

		expect(login).toEqual({ signedIn: false, account: null });
	});

	/** a shape that changed costs the account its name, never the rail its render */
	it("reads nobody out of a reply it cannot read", () => {
		expect(loginOf("not json at all")).toEqual({ signedIn: false, account: null });
		expect(loginOf("[]")).toEqual({ signedIn: false, account: null });
		expect(loginOf("null")).toEqual({ signedIn: false, account: null });
		// signed in is the claim that runs a held prompt, so it is never inferred from an
		// email the binary declined to call a login
		expect(loginOf('{"email":"ada@kaffe.se"}')).toEqual({ signedIn: false, account: null });
		expect(loginOf('{"loggedIn":true}')).toEqual({ signedIn: true, account: null });
		expect(loginOf('{"loggedIn":true,"email":""}')).toEqual({ signedIn: true, account: null });
	});

	it("answers nobody when there is no binary to ask", async () => {
		const login = await askAgentLogin({
			executor: () => Promise.reject(new Error("spawn claude ENOENT")),
			root: "/project",
			env: {},
		});

		expect(login).toEqual({ signedIn: false, account: null });
	});

	/** the probe gives up rather than holding the door open on a process that never speaks */
	it("gives up on a binary that never answers", async () => {
		const login = await askAgentLogin({
			executor: () =>
				Promise.resolve({ write: () => {}, end: () => {}, kill: () => {}, onLine: () => {}, onExit: () => {} }),
			root: "/project",
			env: {},
			timeoutMs: 20,
		});

		expect(login).toEqual({ signedIn: false, account: null });
	});

	it("stands in the project root with the daemon's own environment", () => {
		expect(planAgentLogin("/project", { HOME: "/home/ada" })).toEqual({
			command: "claude",
			args: ["auth", "status", "--json"],
			cwd: "/project",
			env: { HOME: "/home/ada" },
		});
	});
});

describe("the two doors", () => {
	it("says whether there is an agent on this machine", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		vi.stubEnv("PATH", bin("claude"));
		expect(await (await app.request(`/api/p/${name}/agent/installed`)).json()).toEqual({ installed: true });

		vi.stubEnv("PATH", bin("cloud"));
		expect(await (await app.request(`/api/p/${name}/agent/installed`)).json()).toEqual({ installed: false });

		vi.unstubAllEnvs();
	});

	it("names the account the binary reported", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: loginAgentExecutor(SIGNED_IN).executor });

		const res = await app.request(`/api/p/${name}/agent/login`);

		expect(await res.json()).toEqual({ signedIn: true, account: "ada@kaffe.se" });
	});

	/**
	 * The probe belongs to the press that asked for it, and to nothing else.
	 *
	 * It is a whole binary, spawned to answer one question for one page. A page that
	 * navigated off, or a rail that was closed, is nobody waiting — and the process would
	 * otherwise sit there for the length of its own timeout answering into a socket that
	 * is gone.
	 */
	it("takes the probe with the request that asked for it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		// a binary that answers nothing, which is the window this is about
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const leaving = new AbortController();

		const asked = app.request(`/api/p/${name}/agent/login`, { signal: leaving.signal });
		await until(() => agent.spawned.length === 1);
		leaving.abort();
		await asked;

		expect(agent.spawned[0]?.killed).toBe(true);
	});
});

/**
 * The promise, tested rather than stated (#201).
 *
 * *Spool never reads the agent's credential or config files* is a claim about the whole
 * source, not about one module: the moment somebody parses `~/.claude.json` for its
 * `oauthAccount` to save a spawn, spool owns a private format it does not control and
 * breaks the week that format changes. So the check is over every file that ships.
 *
 * Comments are stripped first, because the reasoning has to be allowed to name what it
 * forbids — three modules explain the refusal, and one of them is the module the check
 * lives beside. What is left is code, and code may not name them at all.
 */
describe("the files spool does not read", () => {
	const FORBIDDEN = [".claude.json", ".credentials.json", "oauthAccount"];

	function sources(dir: string, found: string[] = []): string[] {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) sources(path, found);
			else if (/\.tsx?$/.test(entry.name)) found.push(path);
		}
		return found;
	}

	/** block comments and whole-line ones: what is left is every line that runs */
	const code = (text: string): string =>
		text
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("//"))
			.join("\n");

	it("names none of the agent's own private files in code anywhere in the product", () => {
		const offenders: string[] = [];
		for (const path of sources(join(import.meta.dirname, ".."))) {
			// this file names them in order to forbid them
			if (path === import.meta.filename) continue;
			const text = code(readFileSync(path, "utf8"));
			for (const name of FORBIDDEN) if (text.includes(name)) offenders.push(`${path}: ${name}`);
		}

		expect(offenders).toEqual([]);
	});
});
