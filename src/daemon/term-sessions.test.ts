import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navSequence } from "../term/osc";
import { fixtureTermExecutor, makeTempDir, writeDesignFile } from "../test-helpers";
import { createTermSessions } from "./term-sessions";
import { termScreenFile } from "./thumbs";

const enc = (s: string) => new TextEncoder().encode(s);

class FakeClient {
	binary: string[] = [];
	controls: { t: string; [key: string]: unknown }[] = [];
	send(message: string | Uint8Array): void {
		if (typeof message === "string") this.controls.push(JSON.parse(message));
		else this.binary.push(new TextDecoder().decode(message));
	}
	streamed(): string {
		return this.binary.join("");
	}
}

function harness(options?: { detachGraceMs?: number }) {
	const root = makeTempDir();
	writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
	writeDesignFile(root, join("frames", "dash", "frame.json"), `{\n\t"x": 0,\n\t"y": 0,\n\t"w": 720,\n\t"h": 432\n}\n`);
	const { spawned, executor } = fixtureTermExecutor();
	const published: string[] = [];
	const sessions = createTermSessions({
		executor,
		publish: (_root, frame) => published.push(frame),
		detachGraceMs: options?.detachGraceMs ?? 40,
	});
	return { root, spawned, published, sessions };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

describe("attach and stream", () => {
	it("spawns at the geometry's whole-cell size and streams output to the client", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);

		expect(spawned).toHaveLength(1);
		expect(spawned[0]?.spawn).toMatchObject({
			cols: 80,
			rows: 24,
			entry: join(root, "design", "frames", "dash", "term.tsx"),
		});
		// size precedes the snapshot: the client must grid its emulator before the replay
		expect(client.controls[0]).toMatchObject({ t: "size", cols: 80, rows: 24 });
		expect(client.controls[1]).toMatchObject({ t: "state", state: "running" });

		spawned[0]?.emit("hello from tui");
		expect(client.streamed()).toContain("hello from tui");
	});

	it("delivers input bytes to the process untouched", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		sessions.input(root, "dash", enc("\x1b\x03q"));
		expect(spawned[0]?.inputs).toEqual(["\x1b\x03q"]);
	});

	it("hands a real terminal resize to the process and its buffer, and echoes it to every mirror", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);
		sessions.resize(root, "dash", 100, 30);
		expect(spawned[0]?.sizes).toEqual([{ cols: 100, rows: 30 }]);
		expect(client.controls.at(-1)).toMatchObject({ t: "size", cols: 100, rows: 30 });
		const still = await sessions.still(root, "dash");
		expect(still).toContain(`viewBox="0 0 ${100 * 9} ${30 * 18}"`);
	});

	it("gives a second client the screen so far, not a blank", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("history");
		await flush();
		const late = new FakeClient();
		await sessions.attach(root, "dash", late);
		expect(late.streamed()).toContain("history");
		expect(spawned).toHaveLength(1);
	});
});

describe("osc navigation", () => {
	it("strips the nav escape from the stream and surfaces it as a control event", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);

		spawned[0]?.emit(`menu${navSequence("checkout")}rest`);

		expect(client.controls.some((c) => c.t === "nav" && c.target === "checkout")).toBe(true);
		expect(client.streamed()).toContain("menurest");
		expect(client.streamed()).not.toContain("7770");
	});
});

describe("death and revival", () => {
	it("keeps the last screen and reports the exit code, and never respawns on its own", async () => {
		const { root, spawned, published, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);
		spawned[0]?.emit("final screen");
		await flush();
		spawned[0]?.exit(3);
		await flush();

		expect(client.controls.some((c) => c.t === "exit" && c.code === 3)).toBe(true);
		expect(spawned).toHaveLength(1);
		expect(published).toContain("dash");
		const still = await sessions.still(root, "dash");
		expect(still).toContain("final screen");
	});

	it("revives an exited session only on request", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);
		spawned[0]?.exit(1);

		await sessions.revive(root, "dash");
		expect(spawned).toHaveLength(2);
		expect(client.controls.some((c) => c.t === "restart")).toBe(true);
	});

	it("attaching to a dead session shows the corpse, not a fresh boot", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("crashed here");
		await flush();
		spawned[0]?.exit(2);

		const viewer = new FakeClient();
		await sessions.attach(root, "dash", viewer);
		expect(spawned).toHaveLength(1);
		expect(viewer.streamed()).toContain("crashed here");
		expect(viewer.controls.some((c) => c.t === "exit" && c.code === 2)).toBe(true);
	});

	it("a TUI that leaves the alternate screen as it dies keeps its last frame", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);
		// the full-screen life of a TUI: enter alt, paint, wipe on the way out
		spawned[0]?.emit("\x1b[?1049h\x1b[2J\x1b[Hthe dashboard\x1b[?1049l");
		await flush();
		spawned[0]?.exit(0);
		await flush();

		// the artifact survives the wipe — on every mirror and in the still
		const still = await sessions.still(root, "dash");
		expect(still).toContain("the dashboard");
		expect(client.streamed()).toContain("the dashboard");

		// and the corpse persisted with it: a fresh attach shows the screen, not a blank
		const late = new FakeClient();
		await sessions.attach(root, "dash", late);
		expect(late.streamed()).toContain("the dashboard");
	});

	it("a corpse keeps its screen through a resize — the new grid waits for the revival", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);
		spawned[0]?.emit("last words");
		await flush();
		spawned[0]?.exit(1);

		sessions.resize(root, "dash", 100, 30);
		// no echo, no reflow: the dead screen stays exactly as it was painted
		expect(client.controls.some((c) => c.t === "size" && c.cols === 100)).toBe(false);
		const still = await sessions.still(root, "dash");
		expect(still).toContain(`viewBox="0 0 ${80 * 9} ${24 * 18}"`);

		await sessions.revive(root, "dash");
		// the deferred grid lands with the respawn — process, buffer, and mirrors together
		expect(spawned[1]?.spawn).toMatchObject({ cols: 100, rows: 30 });
		expect(client.controls.some((c) => c.t === "size" && c.cols === 100 && c.rows === 30)).toBe(true);
	});

	it("marks an attach-time exit so entering can revive; a live death stays unmarked", async () => {
		const { root, spawned, sessions } = harness();
		const witness = new FakeClient();
		await sessions.attach(root, "dash", witness);
		spawned[0]?.exit(2);
		await flush();

		// the death happened while attached: never an invitation to respawn
		const death = witness.controls.find((c) => c.t === "exit");
		expect(death).toBeDefined();
		expect(death?.attach).toBeUndefined();

		// a later attach replays the exit as arrival state — the enter gesture
		// (walk arrival, canvas enter) may answer it with a revive
		const arriver = new FakeClient();
		await sessions.attach(root, "dash", arriver);
		expect(arriver.controls.find((c) => c.t === "exit")).toMatchObject({ code: 2, attach: true });
	});
});

describe("player restarts (#44)", () => {
	it("restart kills and respawns a running session, telling every mirror to reset", async () => {
		const { root, spawned, sessions } = harness();
		const canvas = new FakeClient();
		const player = new FakeClient();
		await sessions.attach(root, "dash", canvas);
		await sessions.attach(root, "dash", player);

		await sessions.restart(root, "dash");

		expect(spawned[0]?.killed).toBe(true);
		expect(spawned).toHaveLength(2);
		expect(canvas.controls.some((c) => c.t === "restart")).toBe(true);
		expect(player.controls.some((c) => c.t === "restart")).toBe(true);
	});

	it("restart revives an exited session", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.exit(1);
		await sessions.restart(root, "dash");
		expect(spawned).toHaveLength(2);
	});

	it("restart without a session is a quiet no-op — the next attach is already clean", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.restart(root, "dash");
		expect(spawned).toHaveLength(0);
	});

	it("restart clears a hibernated corpse's death mark — the next attach spawns fresh, not dead", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.exit(3);
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));

		await sessions.restart(root, "dash");

		const arriver = new FakeClient();
		await sessions.attach(root, "dash", arriver);
		expect(spawned).toHaveLength(2);
		expect(arriver.controls.some((c) => c.t === "exit")).toBe(false);
	});
});

describe("save restarts", () => {
	it("kills and respawns on a source change, telling clients to reset", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);

		await sessions.handleChange(root, "dash");

		expect(spawned[0]?.killed).toBe(true);
		expect(spawned).toHaveLength(2);
		expect(client.controls.some((c) => c.t === "restart")).toBe(true);
	});

	it("revives an exited session on save", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.exit(1);
		await sessions.handleChange(root, "dash");
		expect(spawned).toHaveLength(2);
	});
});

describe("freeze", () => {
	it("maps freeze to a kernel stop and thaw to a continue", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		sessions.freeze(root, "dash", true);
		sessions.freeze(root, "dash", false);
		expect(spawned[0]?.signals).toEqual(["SIGSTOP", "SIGCONT"]);
	});
});

describe("hibernation", () => {
	it("kills the process after the last detach and serializes the screen for restore", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 40 });
		const client = new FakeClient();
		const attached = await sessions.attach(root, "dash", client);
		spawned[0]?.emit("keep me");
		await flush();

		attached.detach();
		await new Promise((r) => setTimeout(r, 150));

		expect(spawned[0]?.killed).toBe(true);
		expect(existsSync(termScreenFile(root, "dash"))).toBe(true);
	});

	it("a reattach within the grace keeps the process alive", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 200 });
		const first = await sessions.attach(root, "dash", new FakeClient());
		first.detach();
		await new Promise((r) => setTimeout(r, 50));
		await sessions.attach(root, "dash", new FakeClient());
		await new Promise((r) => setTimeout(r, 400));
		expect(spawned[0]?.killed).toBe(false);
		expect(spawned).toHaveLength(1);
	});

	it("serves a still from the serialized screen after hibernation, and wakes fresh on attach", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("persisted text");
		await flush();
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));
		expect(spawned[0]?.killed).toBe(true);

		const still = await sessions.still(root, "dash");
		expect(still).toContain("persisted text");

		await sessions.attach(root, "dash", new FakeClient());
		expect(spawned).toHaveLength(2);
	});
});

describe("teardown", () => {
	it("close kills every process and persists every screen", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("bye");
		await flush();
		await sessions.close();
		expect(spawned[0]?.killed).toBe(true);
		expect(existsSync(termScreenFile(root, "dash"))).toBe(true);
	});
});

describe("frozen death", () => {
	it("continues a stopped process before killing it — death is explicit, never pending", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		sessions.freeze(root, "dash", true);
		await sessions.handleChange(root, "dash");
		expect(spawned[0]?.signals).toEqual(["SIGSTOP", "SIGCONT"]);
		expect(spawned[0]?.killed).toBe(true);
	});
});
