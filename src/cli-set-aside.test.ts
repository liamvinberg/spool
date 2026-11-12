import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { spoolAsync } from "./cli-test-helpers";
import { serveDaemon } from "./daemon/server";
import { initTeamProject } from "./init";
import { fetchLocalCopy, openProject } from "./open";
import { fakeTeam, TEAM_ORIGIN } from "./team-sync-test-harness";
import { makeTempDir } from "./test-helpers";

/**
 * A save of an agent's that lost a collision, as the agent meets it through the real CLI: told once on its next
 * command, failing `spool check` while it stands, listed and settled by `spool set-aside`. Ana and Ben each have a
 * served daemon on the fake spool.page; Ben's agent is the one whose saves are set aside.
 */

function repo(): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(root);
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", "."], { cwd: root });
	return realpathSync(root);
}

const RECEIPT = "frames/receipt/frame.tsx";
const MENU = "frames/menu/frame.tsx";
const page = (words: string) =>
	`export default function Page() {\n\treturn (\n\t\t<main>\n\t\t\t<h2>${words}</h2>\n\t\t</main>\n\t);\n}\n`;

async function until(holds: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
	const start = Date.now();
	while (!(await holds())) {
		if (Date.now() - start > ms) throw new Error("it never held");
		await new Promise((wake) => setTimeout(wake, 25));
	}
}

async function team() {
	const cloud = fakeTeam();
	const machines = { ana: cloud.machine("ana"), ben: cloud.machine("ben") };
	const states = { ana: join(makeTempDir(), ".spool"), ben: join(makeTempDir(), ".spool") };
	const { root: ana } = await initTeamProject(repo(), states.ana, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: machines.ana.request,
		openSocket: machines.ana.openSocket,
	});
	const ben = repo();
	copyFileSync(join(ana, "spool.json"), join(ben, "spool.json"));
	await fetchLocalCopy(ben, states.ben, {
		origin: TEAM_ORIGIN,
		request: machines.ben.request,
		openSocket: machines.ben.openSocket,
	});
	openProject(ben, states.ben);
	for (const who of ["ana", "ben"] as const) {
		const daemon = await serveDaemon({
			spoolDir: states[who],
			version: "0.0.0-test",
			host: "127.0.0.1",
			port: 0,
			cloud: machines[who].cloud,
			teamNotice: () => {},
		});
		onTestFinished(() => daemon.close());
	}
	const write = (root: string, path: string, text: string) => {
		mkdirSync(dirname(join(root, "design", path)), { recursive: true });
		writeFileSync(join(root, "design", path), text);
	};
	const text = (root: string, path: string) =>
		existsSync(join(root, "design", path)) ? readFileSync(join(root, "design", path), "utf8") : undefined;
	const home = makeTempDir();
	return {
		ana,
		ben,
		write,
		text,
		/** Ben's agent at a terminal in his checkout. */
		spool: (...args: string[]) => spoolAsync(args, home, ben, { SPOOL_DIR: states.ben }),
		/** Both change the same line of each file while Ben is away: Ana's reach the team first. */
		async collide(writes: Record<string, string>) {
			const back = cloud.offline("ben");
			for (const [path, words] of Object.entries(writes)) write(ben, path, page(`${words} by ben`));
			for (const [path, words] of Object.entries(writes)) write(ana, path, page(`${words} by ana`));
			await until(() =>
				Object.entries(writes).every(([path, words]) => cloud.file("checkout", path) === page(`${words} by ana`)),
			);
			await new Promise((wake) => setTimeout(wake, 300));
			back();
			await until(() =>
				Object.entries(writes).every(([path, words]) => text(ben, path) === page(`${words} by ana`)),
			);
			await until(() => {
				const marks = join(ben, "design/.spool/set-aside/marks.json");
				return existsSync(marks) && Object.keys(writes).every((path) => readFileSync(marks, "utf8").includes(path));
			});
		},
	};
}

describe("spool set-aside", { timeout: 120_000 }, () => {
	it("tells the agent once, fails check while it stands, and settles it either way", async () => {
		const { ana, ben, write, text, spool, collide } = await team();
		write(ana, RECEIPT, page("Thanks"));
		write(ana, MENU, page("Menu"));
		await until(() => text(ben, RECEIPT) === page("Thanks") && text(ben, MENU) === page("Menu"));

		await collide({ [RECEIPT]: "Paid" });
		const told =
			/your change to design\/frames\/receipt\/frame\.tsx was set aside: ana changed the same lines and reached the team first, so the file on disk is theirs now and yours is kept in design\/\.spool\/set-aside\/[0-9a-f-]+\/frame\.tsx\. Redo your change on top of the file and save it, or settle it: `spool set-aside mine frames\/receipt\/frame\.tsx` puts yours back over it, `spool set-aside theirs frames\/receipt\/frame\.tsx` lets yours go/u;

		// the agent's next command says so, once
		const first = await spool("selection");
		expect(first.stderr).toMatch(told);
		expect((await spool("selection")).stderr).not.toContain("set aside");

		// check fails on it, every time, with the same words
		const checked = await spool("check");
		expect(checked.status).toBe(1);
		expect(checked.stderr).toMatch(told);
		expect((await spool("check")).status).toBe(1);

		const listed = await spool("set-aside");
		expect(listed.status).toBe(0);
		expect(listed.stdout).toMatch(told);

		// mine: Ben's version goes up as a new save on top, and reaches Ana
		const mine = await spool("set-aside", "mine", `design/${RECEIPT}`);
		expect(mine.stdout).toBe(`put your design/${RECEIPT} back: it goes to the team as a new save\n`);
		await until(() => text(ana, RECEIPT) === page("Paid by ben"));
		expect((await spool("set-aside")).stdout).toBe("nothing is set aside in this copy\n");

		// theirs lets one go; saving the other again settles it as the answer
		await collide({ [RECEIPT]: "Refunded", [MENU]: "Lunch" });
		const theirs = await spool("set-aside", "theirs", RECEIPT);
		expect(theirs.stdout).toBe(`kept the team's design/${RECEIPT}; your version is let go\n`);
		expect(text(ben, RECEIPT)).toBe(page("Refunded by ana"));
		expect((await spool("set-aside", "theirs", RECEIPT)).stderr).toContain(
			`nothing is set aside at design/${RECEIPT} in this copy`,
		);
		write(ben, MENU, page("Lunch by ana and ben"));
		await until(() => text(ana, MENU) === page("Lunch by ana and ben"));
		await until(async () => (await spool("check")).status === 0);
	});
});
