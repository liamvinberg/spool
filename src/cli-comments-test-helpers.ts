import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { spoolAsync } from "./cli-test-helpers";
import { CONTROL_HEADER } from "./daemon/security";
import { serveDaemon } from "./daemon/server";
import { initTeamProject } from "./init";
import { fetchLocalCopy, openProject } from "./open";
import { fakeTeam, TEAM_ORIGIN } from "./team-sync-test-harness";
import { makeTempDir } from "./test-helpers";

function repo(): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(root);
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", "."], { cwd: root });
	return realpathSync(root);
}

/** Ana starts the team project with a receipt frame on the root page and a cart on the shop page; Ben's clone fetches it. */
export async function team() {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const anaState = join(makeTempDir(), ".spool");
	const benState = join(makeTempDir(), ".spool");
	const { root: anaRoot } = await initTeamProject(repo(), anaState, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	const receipt = join(anaRoot, "design", "frames", "receipt");
	mkdirSync(receipt, { recursive: true });
	writeFileSync(
		join(receipt, "frame.tsx"),
		"export default function Receipt() {\n\treturn (\n\t\t<main>\n\t\t\t<h2>Thanks!</h2>\n\t\t</main>\n\t);\n}\n",
	);
	const benRoot = repo();
	copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
	await fetchLocalCopy(benRoot, benState, { origin: TEAM_ORIGIN, request: ben.request, openSocket: ben.openSocket });
	openProject(benRoot, benState);
	return {
		cloud,
		ana: { root: anaRoot, state: anaState, cloud: ana.cloud },
		ben: { root: benRoot, state: benState, cloud: ben.cloud },
	};
}

type Machine = {
	root: string;
	state: string;
	cloud: ReturnType<ReturnType<typeof fakeTeam>["machine"]>["cloud"];
};

/** The machine's daemon, really served, and its `spool` at a terminal in the project. */
export async function mac(machine: Machine) {
	const daemon = await serveDaemon({
		spoolDir: machine.state,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		cloud: machine.cloud,
		teamNotice: () => {},
	});
	onTestFinished(() => daemon.close());
	const home = makeTempDir();
	const read = async () =>
		(await (
			await fetch(`${daemon.url}/api/p/checkout/comments`, { headers: { [CONTROL_HEADER]: daemon.controlToken } })
		).json()) as {
			online: boolean;
			comments: {
				id: string;
				body: string;
				agent: boolean;
				resolved: { by: { name: string }; agent?: true } | null;
				standing: string;
				replies: { agent: boolean; body: string }[];
				editedSince?: true;
			}[];
		};
	return {
		read,
		url: daemon.url,
		token: daemon.controlToken,
		/** What the person's canvas sends, as themself: a POST to one of the comment routes, with no body. */
		call: (path: string) =>
			fetch(`${daemon.url}/api/p/checkout/comments/${path}`, {
				method: "POST",
				headers: { [CONTROL_HEADER]: daemon.controlToken },
			}),
		async online(): Promise<void> {
			const start = Date.now();
			while (!(await read()).online) {
				if (Date.now() - start > 8000) throw new Error("never connected");
				await new Promise((wake) => setTimeout(wake, 25));
			}
		},
		async until(holds: (comments: Awaited<ReturnType<typeof read>>["comments"]) => boolean): Promise<void> {
			const start = Date.now();
			while (!holds((await read()).comments)) {
				if (Date.now() - start > 8000) throw new Error("it never held");
				await new Promise((wake) => setTimeout(wake, 25));
			}
		},
		spool: (...args: string[]) => spoolAsync(["comments", ...args], home, machine.root, { SPOOL_DIR: machine.state }),
	};
}
