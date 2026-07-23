import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navSequence } from "../term/osc";
import {
	fixtureTermExecutor,
	serveProject,
	settle,
	termWsClient,
	until,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";

/**
 * The player's daemon seam for live terminal frames (#44): a walk attaches to
 * the same session the canvas mirrors, an OSC navigation verifies a derived
 * edge and never mints one, and a play-session restart gets a clean process.
 * Fixture executor throughout — CI never downloads the toolchain.
 */

const enc = (s: string) => new TextEncoder().encode(s);

describe("mirrored attach (#44)", () => {
	it("canvas and player mirror one process: output to both, input from either", { timeout: 20_000 }, async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const canvas = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await canvas.open;
		await until(() => spawned.length >= 1);
		await settle(() => spawned.length);
		const proc = spawned[spawned.length - 1];
		proc?.emit("acts one and ");

		const player = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await player.open;
		// the late surface gets the screen so far, and no second process spawns
		await until(() => player.streamed().includes("acts one"));
		expect(spawned.length).toBe(spawned.indexOf(proc as never) + 1);

		proc?.emit("two");
		await until(() => canvas.streamed().includes("two") && player.streamed().includes("two"));

		// input from either surface interleaves into the one PTY
		canvas.socket.send(enc("a"));
		player.socket.send(enc("b"));
		await until(() => (proc?.inputs.join("") ?? "").includes("a") && (proc?.inputs.join("") ?? "").includes("b"));
	});
});

describe("the play-session restart endpoint (#44)", () => {
	it("restarts a running session and tells every mirror to reset", { timeout: 20_000 }, async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const client = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await client.open;
		await until(() => spawned.length >= 1);
		await settle(() => spawned.length);
		const before = spawned.length;

		const res = await fetch(`${url}/api/p/${name}/term/dash/restart`, { method: "POST" });
		expect(res.status).toBe(204);

		await until(() => spawned.length === before + 1);
		expect(spawned[before - 1]?.killed).toBe(true);
		expect(client.controls.some((c) => c.t === "restart")).toBe(true);
	});

	it("is a quiet 204 when nothing runs — the next attach is already clean", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const res = await fetch(`${url}/api/p/${name}/term/dash/restart`, { method: "POST" });
		expect(res.status).toBe(204);
		expect(spawned).toHaveLength(0);
	});

	it("404s an html frame, a ghost frame, and an unknown project", async () => {
		const { executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeFrame(root, "menu", "export default () => null;\n");

		expect((await fetch(`${url}/api/p/${name}/term/menu/restart`, { method: "POST" })).status).toBe(404);
		expect((await fetch(`${url}/api/p/${name}/term/ghost/restart`, { method: "POST" })).status).toBe(404);
		expect((await fetch(`${url}/api/p/nowhere/term/dash/restart`, { method: "POST" })).status).toBe(404);
	});
});

describe("osc navigation drives the walk (#44)", () => {
	it("a nav event verifies the derived edge over /walked, and never mints one", { timeout: 20_000 }, async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url } = await serveProject({ termExecutor: executor });
		writeDesignFile(
			root,
			join("frames", "dash", "term.tsx"),
			'import { term } from "spool/term";\nexport const go = () => term.go("checkout");\n',
		);
		writeFrame(root, "checkout", "export default () => <p>pay</p>;\n");
		writeFrame(root, "menu", "export default () => <p>menu</p>;\n");

		const player = termWsClient(`${url.replace("http", "ws")}/term/${name}/dash`);
		await player.open;
		await until(() => spawned.length >= 1);
		await settle(() => spawned.length);

		// the TUI navigates: the daemon strips the escape and hands every
		// mirrored surface the event — the walk advances on it
		spawned[spawned.length - 1]?.emit(`pick a plan${navSequence("checkout")}`);
		await until(() => player.controls.some((c) => c.t === "nav" && c.target === "checkout"));

		// the player reports the walk it took; the map can only confirm source
		const walked = await fetch(`${url}/api/p/${name}/walked`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ from: "dash", to: "checkout" }),
		});
		expect(walked.status).toBe(204);

		// a walk the source never claims records nothing — no minted arrows
		const unclaimed = await fetch(`${url}/api/p/${name}/walked`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ from: "dash", to: "menu" }),
		});
		expect(unclaimed.status).toBe(204);

		const flows = (await (await fetch(`${url}/api/p/${name}/flows`)).json()) as {
			edges: { from: string; to: string; verified?: boolean }[];
		};
		const edge = flows.edges.find((e) => e.from === "dash" && e.to === "checkout");
		expect(edge?.verified).toBe(true);
		expect(flows.edges.find((e) => e.from === "dash" && e.to === "menu")).toBeUndefined();
	});
});
