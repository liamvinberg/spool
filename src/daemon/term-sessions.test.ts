import { chmodSync, existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navSequence } from "../term/osc";
import { fixtureTermExecutor, makeTempDir, writeDesignFile } from "../test-helpers";
import { createTermSessions } from "./term-sessions";
import { terminalSourceVersion } from "./term-source";
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

function harness(options?: { detachGraceMs?: number; root?: string }) {
	const root = options?.root ?? makeTempDir();
	writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
	writeDesignFile(root, join("frames", "dash", "frame.json"), `{\n\t"x": 0,\n\t"y": 0,\n\t"w": 720,\n\t"h": 480\n}\n`);
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

describe("terminal source versions", () => {
	it("is deterministic regardless of directory creation order", () => {
		const first = harness().root;
		const second = harness().root;
		writeDesignFile(first, "frames/dash/z.ts", "export const z = 1;\n");
		writeDesignFile(first, "shared/a.ts", "export const a = 1;\n");
		writeDesignFile(second, "shared/a.ts", "export const a = 1;\n");
		writeDesignFile(second, "frames/dash/z.ts", "export const z = 1;\n");

		expect(terminalSourceVersion(first, "dash")).toBe(terminalSourceVersion(second, "dash"));
	});

	it("separates NUL-containing file bytes from following source records", () => {
		const twoFiles = harness().root;
		const embeddedRecord = harness().root;
		writeDesignFile(twoFiles, "frames/dash/a", "A");
		writeDesignFile(twoFiles, "frames/dash/b", "B");
		writeDesignFile(embeddedRecord, "frames/dash/a", "A\0file\0frames/dash/b\0B");

		expect(terminalSourceVersion(twoFiles, "dash")).not.toBe(terminalSourceVersion(embeddedRecord, "dash"));
	});

	it("excludes canonical geometry and app-owned targets reached through aliases", () => {
		const root = harness().root;
		writeDesignFile(root, "canvas.json", '{"camera": 1}\n');
		writeDesignFile(root, ".spool/state.json", '{"selection": 1}\n');
		symlinkSync("frame.json", join(root, "design", "frames", "dash", "geometry-alias.json"));
		symlinkSync("../../canvas.json", join(root, "design", "frames", "dash", "canvas-alias.json"));
		symlinkSync("../../.spool", join(root, "design", "frames", "dash", "app-alias"), "dir");
		const before = terminalSourceVersion(root, "dash");

		writeDesignFile(root, "frames/dash/frame.json", '{"x":10,"y":20,"w":900,"h":600}\n');
		writeDesignFile(root, "canvas.json", '{"camera": 2}\n');
		writeDesignFile(root, ".spool/state.json", '{"selection": 2}\n');

		expect(terminalSourceVersion(root, "dash")).toBe(before);
	});

	it("rejects a dangling symlink whose target escapes design", () => {
		const root = harness().root;
		const outside = join(makeTempDir(), "missing.ts");
		symlinkSync(outside, join(root, "design", "frames", "dash", "escape.ts"));

		expect(() => terminalSourceVersion(root, "dash")).toThrow(/design boundary/);
	});
});

describe("persisted screen records", () => {
	it.each([
		["zero columns", { cols: 0 }],
		["negative rows", { rows: -1 }],
		["fractional columns", { cols: 80.5 }],
		["oversized rows", { rows: 1001 }],
		["unsafe columns", { cols: Number.MAX_SAFE_INTEGER + 1 }],
		["fractional exit code", { exitCode: 1.5 }],
		["unsafe exit code", { exitCode: Number.MAX_SAFE_INTEGER + 1 }],
	])("treats %s as stale", async (_name, invalid) => {
		const { root, sessions } = harness();
		writeDesignFile(
			root,
			".spool/term/dash.screen",
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "old grid",
				sourceVersion: terminalSourceVersion(root, "dash"),
				...invalid,
			})}\n`,
		);

		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "stale" });
	});

	it("rethrows an operational persisted-store read failure", async () => {
		const { root, sessions } = harness();
		mkdirSync(termScreenFile(root, "dash"), { recursive: true });

		await expect(sessions.screen(root, "dash")).rejects.toMatchObject({ code: "EISDIR" });
	});

	it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
		"rethrows an operational source read failure",
		async () => {
			const { root, sessions } = harness();
			const source = join(root, "design", "frames", "dash", "private.ts");
			writeDesignFile(root, "frames/dash/private.ts", "export const privateValue = 1;\n");
			writeDesignFile(
				root,
				".spool/term/dash.screen",
				`${JSON.stringify({
					cols: 80,
					rows: 24,
					screen: "current grid",
					sourceVersion: terminalSourceVersion(root, "dash"),
				})}\n`,
			);
			chmodSync(source, 0);
			try {
				await expect(sessions.screen(root, "dash")).rejects.toMatchObject({ code: "EACCES" });
			} finally {
				chmodSync(source, 0o644);
			}
		},
	);
});

describe("attach and stream", () => {
	it("spawns at the geometry's whole-cell size and streams output to the client", async () => {
		const { root, spawned, sessions } = harness();
		const client = new FakeClient();
		await sessions.attach(root, "dash", client);

		expect(spawned).toHaveLength(1);
		expect(spawned[0]?.spawn).toMatchObject({
			cols: 80,
			rows: 24,
			entry: join(realpathSync(join(root, "design")), "frames", "dash", "term.tsx"),
		});
		// size precedes the snapshot: the client must grid its emulator before the replay
		expect(client.controls[0]).toMatchObject({ t: "size", cols: 80, rows: 24 });
		expect(client.controls[1]).toMatchObject({ t: "state", state: "running" });

		spawned[0]?.emit("hello from tui");
		expect(client.streamed()).toContain("hello from tui");
	});

	it("uses DECTCEM for the active terminal still's cursor", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("x\x1b[?25l");
		await flush();
		expect(await sessions.still(root, "dash")).not.toContain('fill="#f0efeb"');

		spawned[0]?.emit("\x1b[?25h");
		await flush();
		expect(await sessions.still(root, "dash")).toContain('fill="#f0efeb"');
	});

	it("replays DECSTR with its visible cursor state", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("x\x1b[?25l\x1b[!p");
		await flush();
		expect(await sessions.still(root, "dash")).toContain('fill="#f0efeb"');
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
		expect(still).toContain(`viewBox="0 0 ${100 * 9} ${30 * 20}"`);
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
		expect(still).toContain(`viewBox="0 0 ${80 * 9} ${24 * 20}"`);

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

describe("save invalidation", () => {
	it("invalidates an in-memory screen without restarting its process", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		writeDesignFile(root, "frames/dash/term.tsx", "// changed\n");

		await sessions.handleChange(root, "dash");

		expect(spawned).toHaveLength(1);
		expect(spawned[0]?.killed).toBe(false);
		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "stale" });
	});

	it("does not start a terminal that has never run", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.handleChange(root, "dash");
		expect(spawned).toHaveLength(0);
		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "never-run" });
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

	it("keeps a hidden cursor hidden when a serialized screen is replayed", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("persisted\x1b[?25l");
		await flush();
		attached.detach();
		await new Promise((resolve) => setTimeout(resolve, 60));

		const still = await sessions.still(root, "dash");
		expect(still).toContain("persisted");
		expect(still).not.toContain('fill="#f0efeb"');
	});

	it("restores DECSTR's visible cursor from a hibernated screen in a new session store", async () => {
		const first = harness({ detachGraceMs: 10 });
		const attached = await first.sessions.attach(first.root, "dash", new FakeClient());
		first.spawned[0]?.emit("x\b\x1b[?25l\x1b[!p");
		await flush();
		attached.detach();
		await new Promise((resolve) => setTimeout(resolve, 60));

		const reloaded = harness({ root: first.root });
		const screen = await reloaded.sessions.screen(reloaded.root, "dash");
		expect(reloaded.spawned).toHaveLength(0);
		expect(screen).toMatchObject({
			kind: "current",
			grid: {
				cursor: { col: 0, row: 0, cell: { text: "x", width: 1, fg: "#d8d6d0" } },
			},
		});
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

	it("rejects a hibernated screen after the source that produced it changes", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("old source output");
		await flush();
		writeDesignFile(root, "frames/dash/term.tsx", "// changed before hibernate\n");
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));

		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "stale" });
	});

	it("invalidates for shared source and nested frame.json changes", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		writeDesignFile(root, "frames/dash/nested/frame.json", '{"source": 1}\n');
		writeDesignFile(root, "shared/nested/frame.json", '{"source": 1}\n');
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("version one");
		await flush();
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));

		writeDesignFile(root, "shared/nested/frame.json", '{"source": 2}\n');
		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "stale" });

		await sessions.attach(root, "dash", new FakeClient());
		const latest = spawned.at(-1);
		latest?.emit("version two");
		writeDesignFile(root, "frames/dash/nested/frame.json", '{"source": 2}\n');
		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "stale" });
	});

	it("ignores only root geometry and app-owned state", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("still current");
		await flush();
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));

		writeDesignFile(root, "frames/dash/frame.json", '{"x":1,"y":2,"w":720,"h":480}\n');
		writeDesignFile(root, "canvas.json", '{"format":1,"camera":{}}\n');
		writeDesignFile(root, ".spool/state.json", '{"selection":[]}\n');

		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "current" });
	});

	it("does not invalidate itself when persistence is aliased into frame source", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		writeDesignFile(root, ".spool/term/.keep", "");
		symlinkSync("../../.spool", join(root, "design", "frames", "dash", "app-state"), "dir");
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("stable output");
		await flush();
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));

		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "current" });
	});

	it("follows contained symlink source and handles directory cycles", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		writeDesignFile(root, "linked/value.ts", "export const value = 1;\n");
		symlinkSync("../../linked", join(root, "design", "frames", "dash", "linked"), "dir");
		symlinkSync(".", join(root, "design", "frames", "dash", "loop"), "dir");
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("linked output");
		await flush();
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));

		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "current" });
		writeDesignFile(root, "linked/value.ts", "export const value = 2;\n");
		expect(await sessions.screen(root, "dash")).toMatchObject({ kind: "stale" });
	});

	it("rejects escaped symlink source without reading it", async () => {
		const { root, spawned, sessions } = harness({ detachGraceMs: 10 });
		const attached = await sessions.attach(root, "dash", new FakeClient());
		spawned[0]?.emit("safe output");
		await flush();
		attached.detach();
		await new Promise((r) => setTimeout(r, 60));
		const outside = makeTempDir();
		writeDesignFile(outside, "secret.ts", "outside\n");
		symlinkSync(join(outside, "design", "secret.ts"), join(root, "design", "frames", "dash", "escape.ts"));

		await expect(sessions.screen(root, "dash")).rejects.toThrow(/design boundary/);
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
	it("does not thaw or kill a frozen process for a source edit", async () => {
		const { root, spawned, sessions } = harness();
		await sessions.attach(root, "dash", new FakeClient());
		sessions.freeze(root, "dash", true);
		writeDesignFile(root, "frames/dash/term.tsx", "// changed\n");
		await sessions.handleChange(root, "dash");
		expect(spawned[0]?.signals).toEqual(["SIGSTOP"]);
		expect(spawned[0]?.killed).toBe(false);
	});
});
