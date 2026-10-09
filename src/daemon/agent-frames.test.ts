import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Rect } from "../page-box";
import {
	agentReader,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	until,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import {
	changedRange,
	createReservedSpots,
	type FrameHub,
	frameWritten,
	linesOf,
	partialField,
	sourceWritten,
	spotName,
	witnessFrames,
} from "./agent-frames";
import type { AgentTurn } from "./agent-turn";
import type { ChangeEvent } from "./events";
import { listProjectFrames } from "./projection";

describe("reading a call's input for the frame it writes", () => {
	it("reads a string field out of JSON that has not finished arriving", () => {
		expect(partialField('{"file_path":"design/frames/a/frame.tsx","content":"one\\ntw', "content")).toBe("one\ntw");
		expect(partialField('{"content":"cut mid-escape \\', "content")).toBe("cut mid-escape ");
		expect(partialField('{"content":"\\u00e9\\u00', "content")).toBe("é");
		expect(partialField('{"file_path":"x"', "content")).toBeUndefined();
	});

	it("knows a frame's entry by its path, nested pages and all, and nothing else", () => {
		expect(frameWritten("/p/design/frames/home/frame.tsx")).toBe("home");
		expect(frameWritten("design/frames/onboarding/step-1/frame.tsx")).toBe("onboarding/step-1");
		expect(frameWritten("design/frames/home/parts.tsx")).toBeUndefined();
		expect(frameWritten("design/shared/frame.tsx")).toBeUndefined();
	});

	it("reads a heredoc's body as the frame's source while it streams", () => {
		const command = "mkdir -p design/frames/calm && cat > design/frames/calm/frame.tsx <<'EOF'\nline 1\nline 2\n";
		expect(sourceWritten("Bash", JSON.stringify({ command }))).toEqual({ frame: "calm", source: "line 1\nline 2\n" });
		const closed = `${command}EOF\nwc -l design/frames/calm/frame.tsx`;
		expect(sourceWritten("Bash", JSON.stringify({ command: closed }))?.source).toBe("line 1\nline 2\n");
		expect(sourceWritten("Bash", JSON.stringify({ command: "cat design/frames/calm/frame.tsx" }))).toBeUndefined();
		expect(
			sourceWritten("Write", JSON.stringify({ file_path: "design/frames/calm/frame.tsx", content: "x" })),
		).toEqual({
			frame: "calm",
			source: "x",
		});
	});

	it("counts lines the way an editor does", () => {
		expect([linesOf(""), linesOf("a"), linesOf("a\n"), linesOf("a\nb")]).toEqual([0, 1, 1, 2]);
	});
});

describe("what moved in a frame", () => {
	it("is the run of new lines between what stayed the same at both ends", () => {
		expect(changedRange("a\nb\nc\n", "a\nB\nc\n")).toEqual({ from: 2, to: 2 });
		expect(changedRange("a\nb\nc\n", "a\nb\nx\ny\nc\n")).toEqual({ from: 3, to: 4 });
		// a deletion is the line it closed up on
		expect(changedRange("a\nb\nc\n", "a\nc\n")).toEqual({ from: 2, to: 2 });
	});
});

describe("a reserved spot", () => {
	it("is named from the delegation's own words", () => {
		expect(spotName("Design hello-calm frame")).toBe("hello-calm");
		expect(spotName("Design cart--empty restrained")).toBe("cart-empty-restrained");
		expect(spotName("Make an onboarding direction")).toBe("onboarding");
		expect(spotName(null)).toBe("designer");
	});

	it("takes the one frame a brief says to write, over its description", () => {
		const brief = "You are the loud direction designer. Create design/frames/hello-loud/frame.tsx as a bold frame.";
		expect(spotName("You are the loud direction designer.", brief)).toBe("hello-loud");
		expect(
			spotName("Design hello-calm frame", "Write frames/hello-calm/frame.tsx and frames/hello-x/frame.tsx"),
		).toBe("hello-calm");
	});

	it("takes the frame born into it, and keeps every other new frame off it", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		writeFrame(root, "home", "export default () => null;\n");
		writeDesignFile(root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		writeFrame(root, "calm", "export default () => null;\n");
		writeFrame(root, "other", "export default () => null;\n");
		const reserved = [{ name: "calm", x: 5000, y: 0, w: 390, h: 844 }];

		const frames = listProjectFrames(root, { reserved }).frames;
		expect(frames.find((frame) => frame.name === "calm")).toMatchObject({ x: 5000, y: 0 });
		const other = frames.find((frame) => frame.name === "other");
		expect(other !== undefined && (other.x >= 5000 + 390 || other.x + other.w <= 5000)).toBe(true);
	});
});

const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

/** a project with a turn started in it, and every event the turn sends as it arrives */
async function turnOn(setup: (root: string) => void) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	setup(root);
	const agent = fixtureAgentExecutor();
	const app = makeApp(spoolDir, { agentExecutor: agent.executor });
	const res = await app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			thread: THREAD,
			turn: "t1",
			said: [{ prompt: "two directions for hello, one designer each" }],
		}),
	});
	await until(() => agent.spawned.length === 1);
	const proc = agent.spawned[0] as FakeAgentProc;
	const seen: AgentEvent[] = [];
	const reading = (async () => {
		const events = agentReader(res);
		for (;;) {
			const next = await events.next(15_000);
			seen.push(next.data as AgentEvent);
			if ((next.data as AgentEvent).kind === "closed") return;
		}
	})();
	/** the agent answers and exits, and the turn's log is read to its end */
	async function close(): Promise<void> {
		proc.emit(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: THREAD }));
		proc.exit(0);
		await reading;
	}
	return { root, name, app, proc, seen, reading, close };
}

type Line = Record<string, unknown> & {
	type?: string;
	message?: {
		content?: {
			type?: string;
			id?: string;
			name?: string;
			input?: { command?: string };
			tool_use_id?: string;
			is_error?: boolean;
		}[];
	};
};

/**
 * The capture, a line at a time, with the disk doing what the recorded shell did: when a
 * heredoc's result comes back without an error, the frame it wrote is written into the
 * test's project, and the replay waits for the turn to have seen it, as the binary's next
 * line would only come after the write.
 */
async function replayWithWrites(
	proc: FakeAgentProc,
	root: string,
	seen: () => readonly AgentEvent[],
	stopAt = Number.POSITIVE_INFINITY,
): Promise<void> {
	const capture = readCapture("claude-background") as Line[];
	const commands = new Map<string, string>();
	for (const [index, line] of capture.entries()) {
		if (index >= stopAt) return;
		for (const block of line.message?.content ?? []) {
			if (block.type === "tool_use" && block.id !== undefined && typeof block.input?.command === "string")
				commands.set(block.id, block.input.command);
			if (block.type !== "tool_result" || block.is_error === true) continue;
			const command = commands.get(block.tool_use_id ?? "");
			const written = command === undefined ? undefined : sourceWritten("Bash", JSON.stringify({ command }));
			if (written === undefined) continue;
			writeFrame(root, written.frame, written.source);
			await until(() =>
				seen().some(
					(event) => event.kind === "frame" && event.frame === written.frame && event.change === "created",
				),
			);
		}
		proc.emit(JSON.stringify(line));
		await new Promise((resolve) => setImmediate(resolve));
	}
}

describe("a turn's frames, off claude-background.json", () => {
	it("are each designer's, attributed to its delegation and filling the spot reserved for it", async () => {
		const { root, proc, seen, reading } = await turnOn((root) =>
			writeFrame(root, "hello", "export default () => <p>hello</p>;\n"),
		);
		await replayWithWrites(proc, root, () => seen);
		await until(() => seen.some((event) => event.kind === "ended"));
		proc.exit(0);
		await reading;

		// each designer's frame is the turn's, attributed to its delegation and its task
		const created = seen.filter((event) => event.kind === "frame" && event.change === "created");
		expect(created.map((event) => event.kind === "frame" && event.frame).sort()).toEqual([
			"hello-calm",
			"hello-loud",
		]);
		const calm = created.find((event) => event.kind === "frame" && event.frame === "hello-calm");
		expect(calm?.kind === "frame" && calm.parent).toBe("toolu_01ET9HqZdgzmqYVbLxg15uMn");
		expect(calm?.kind === "frame" && calm.task).toBe("a333817c7dc56d393");
		expect(calm?.kind === "frame" && calm.lines).toBe(18);
		expect(calm?.kind === "frame" && calm.spot).toBe("hello-calm");

		// each reserved a spot the moment it started, named from its task, and its frame landed there
		const held = seen.filter((event) => event.kind === "spot" && event.state === "held");
		expect(held.map((event) => event.kind === "spot" && event.name)).toEqual(["hello-calm", "hello-loud"]);
		const spot = held[0];
		const sidecar = JSON.parse(readFileSync(join(root, "design/frames/hello-calm/frame.json"), "utf8")) as {
			x: number;
			y: number;
		};
		expect(spot?.kind === "spot" && { x: spot.x, y: spot.y }).toEqual({ x: sidecar.x, y: sidecar.y });
		expect(seen.filter((event) => event.kind === "spot" && event.state === "filled")).toHaveLength(2);
		expect(seen.filter((event) => event.kind === "spot" && event.state === "released")).toHaveLength(0);
		// the two spots stood clear of each other and of the frame that was there
		const second = held[1];
		expect(second?.kind === "spot" && spot?.kind === "spot" && second.x !== spot.x).toBe(true);
	});

	it("lets the spots nobody filled go when the turn is stopped", async () => {
		const { root, name, app, proc, seen, reading } = await turnOn((root) =>
			writeFrame(root, "hello", "export default () => <p>hello</p>;\n"),
		);
		// up to the agent's first answer, with both designers still running
		await replayWithWrites(proc, root, () => seen, 240);
		await until(() => seen.some((event) => event.kind === "holding"));
		const stopped = await app.request(`/api/p/${name}/agent/interrupt`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ turn: "t1" }),
		});
		expect(stopped.status).toBe(204);
		await until(() => seen.some((event) => event.kind === "ended"));
		proc.exit(0);
		await reading;
		expect(seen.filter((event) => event.kind === "spot" && event.state === "released")).toHaveLength(2);
	});
});

/** two rects share some area */
function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** a designer delegation starting, as Claude Code says it */
function designerStarts(proc: FakeAgentProc, task: string, description: string): void {
	proc.emit(
		JSON.stringify({
			type: "system",
			subtype: "task_started",
			task_id: task,
			task_type: "local_agent",
			subagent_type: "designer",
			description,
			tool_use_id: `toolu_${task}`,
			session_id: THREAD,
		}),
	);
}

/**
 * The witness over a turn whose events the test says, with a hub the test rings: no
 * engine and no watcher, just a call, the disk, and what the turn's log says of it.
 */
function witnessed(root: string) {
	const pending: AgentEvent[] = [];
	let wake: (() => void) | undefined;
	let done = false;
	const turn: AgentTurn = {
		events: {
			async *[Symbol.asyncIterator]() {
				for (;;) {
					while (pending.length > 0) yield pending.shift() as AgentEvent;
					if (done) return;
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
				}
			},
		},
		answer: () => false,
		interrupt: () => false,
		abandon: () => {},
	};
	const listeners: ((event: ChangeEvent) => void)[] = [];
	const hub: FrameHub = {
		subscribe: (_root, listener) => {
			listeners.push(listener);
			return () => {};
		},
		publish: () => {},
	};
	const witness = witnessFrames(turn, { root, hub, spots: createReservedSpots() });
	const log: AgentEvent[] = [];
	const reading = (async () => {
		for await (const event of witness.events) log.push(event);
	})();
	return {
		log,
		say(event: AgentEvent) {
			pending.push(event);
			wake?.();
		},
		/** the watcher heard this frame's folder move */
		ring(frame: string) {
			for (const listener of listeners) listener({ kind: "frame", frame } as ChangeEvent);
		},
		async end() {
			done = true;
			wake?.();
			await reading;
		},
	};
}

describe("what a turn did to a frame", () => {
	const entry = "design/frames/card/frame.tsx";
	const before = "export default () => <p>one</p>;\n";
	const after = "export default () => <p>two</p>;\n";
	const heredoc = (text: string) => ({ command: `cat > ${entry} <<'EOF'\n${text}EOF` });
	const cases = [
		{ change: "created", by: "a heredoc", tool: "Bash", input: heredoc(after), there: false },
		{
			change: "created",
			by: "a file tool",
			tool: "Write",
			input: { file_path: entry, content: after },
			there: false,
		},
		{ change: "changed", by: "a heredoc", tool: "Bash", input: heredoc(after), there: true },
		{
			change: "changed",
			by: "a file tool",
			tool: "Edit",
			input: { file_path: entry, old_string: "one", new_string: "two" },
			there: true,
		},
		{ change: "deleted", by: "a shell", tool: "Bash", input: { command: "rm -rf design/frames/card" }, there: true },
		// Codex's file change of kind delete, read as the `Delete` tool
		{ change: "deleted", by: "a file tool", tool: "Delete", input: { file_path: entry }, there: true },
	] as const;

	for (const { change, by, tool, input, there } of cases)
		it(`is ${change} by ${by}, and the call that did it is named`, async () => {
			const spoolDir = join(makeTempDir(), ".spool");
			const { root } = makeProject(spoolDir);
			if (there) writeFrame(root, "card", before);
			const turn = witnessed(root);
			turn.say({ kind: "called", id: "c1", tool, input, parent: null });
			await until(() => turn.log.some((event) => event.kind === "called"));
			if (change === "deleted") rmSync(join(root, "design/frames/card"), { recursive: true });
			else writeFrame(root, "card", after);
			turn.ring("card");
			await until(() => turn.log.some((event) => event.kind === "frame"));
			await turn.end();

			const frames = turn.log.filter((event) => event.kind === "frame");
			expect(frames).toHaveLength(1);
			expect(frames[0]).toMatchObject({ frame: "card", change, call: "c1", parent: null });
			if (change === "created") expect(frames[0]).toMatchObject({ lines: 1, source: after });
			if (change === "changed") expect(frames[0]).toMatchObject({ lines: 1, range: { from: 1, to: 1 } });
			if (change === "deleted") expect(frames[0]).toMatchObject({ source: before });
		});
});

describe("a frame landing in its reserved spot", () => {
	it("stands clear of every frame there, even when it is bigger than the spot", async () => {
		const { root, name, app, proc, seen, close } = await turnOn((root) => {
			writeFrame(root, "home", "export default () => null;\n");
			writeDesignFile(root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		});
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: root }));
		designerStarts(proc, "calm", "Design calm frame");
		await until(() => seen.some((event) => event.kind === "spot" && event.state === "held"));
		const spot = seen.find((event) => event.kind === "spot" && event.state === "held");
		if (spot?.kind !== "spot") throw new Error("no spot");
		expect({ w: spot.w, h: spot.h }).toEqual({ w: 390, h: 844 });

		// a frame born while the designer works stands beside the field, the spot included
		writeFrame(root, "late", "export default () => null;\n");
		await until(() => seen.some((event) => event.kind === "frame" && event.frame === "late"));
		expect((await app.request(`/api/p/${name}/frames`)).status).toBe(200);
		const late = listProjectFrames(root).frames.find((frame) => frame.name === "late");
		expect(late !== undefined && !overlaps(late, spot)).toBe(true);

		// the designer's frame says it is a desktop frame, far wider than the spot it was given
		writeDesignFile(root, "frames/calm/frame.json", '{ "w": 1440, "h": 900 }\n');
		writeFrame(root, "calm", "export default () => null;\n");
		await until(() => seen.some((event) => event.kind === "spot" && event.state === "filled"));

		const frames = listProjectFrames(root).frames;
		const calm = frames.find((frame) => frame.name === "calm");
		if (calm === undefined) throw new Error("calm never landed");
		expect({ w: calm.w, h: calm.h }).toEqual({ w: 1440, h: 900 });
		for (const other of frames.filter((frame) => frame.name !== "calm")) expect(overlaps(calm, other)).toBe(false);
		// and the spot says where it went, so the canvas follows it there
		const filled = seen.find((event) => event.kind === "spot" && event.state === "filled");
		expect(filled?.kind === "spot" && { x: filled.x, y: filled.y, w: filled.w, h: filled.h }).toEqual({
			x: calm.x,
			y: calm.y,
			w: calm.w,
			h: calm.h,
		});
		await close();
	});

	it("stands exactly in the spot when it fits there", async () => {
		const { root, proc, seen, close } = await turnOn((root) => {
			writeFrame(root, "home", "export default () => null;\n");
			writeDesignFile(root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 390, "h": 844 }\n');
		});
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: root }));
		designerStarts(proc, "calm", "Design calm frame");
		await until(() => seen.some((event) => event.kind === "spot" && event.state === "held"));
		const spot = seen.find((event) => event.kind === "spot" && event.state === "held");
		if (spot?.kind !== "spot") throw new Error("no spot");
		writeFrame(root, "calm", "export default () => null;\n");
		await until(() => seen.some((event) => event.kind === "spot" && event.state === "filled"));

		const frames = listProjectFrames(root).frames;
		const calm = frames.find((frame) => frame.name === "calm");
		expect(calm).toMatchObject({ x: spot.x, y: spot.y, w: spot.w, h: spot.h });
		for (const other of frames.filter((frame) => frame.name !== "calm"))
			expect(calm !== undefined && overlaps(calm, other)).toBe(false);
		await close();
	});
});

describe("a spot its designer writes under another name", () => {
	const designer = (task: string, call: string, description: string): AgentEvent => ({
		kind: "task-started",
		task,
		call,
		description,
		agent: "designer",
		prompt: null,
		parent: null,
	});

	it("is filled by the designer's first new frame, when the designer's own call named it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const turn = witnessed(root);
		turn.say({ kind: "called", id: "d1", tool: "Agent", input: { description: "Design calm" }, parent: null });
		turn.say(designer("t1", "d1", "Design calm"));
		await until(() => turn.log.some((event) => event.kind === "spot" && event.state === "held"));
		const held = turn.log.find((event) => event.kind === "spot");
		expect(held?.kind === "spot" && held.name).toBe("calm");
		for (const frame of ["quiet-home", "quiet-home-2"]) {
			turn.say({
				kind: "called",
				id: `w-${frame}`,
				tool: "Write",
				input: { file_path: `design/frames/${frame}/frame.tsx`, content: "x" },
				parent: "d1",
			});
			await until(() => turn.log.some((event) => event.kind === "called" && event.id === `w-${frame}`));
			writeFrame(root, frame, "export default () => null;\n");
			turn.ring(frame);
			await until(() => turn.log.some((event) => event.kind === "frame" && event.frame === frame));
		}
		turn.say({ kind: "task-done", task: "t1", status: "completed", summary: null, parent: null });
		await turn.end();

		const filled = turn.log.filter((event) => event.kind === "spot" && event.state === "filled");
		expect(filled).toMatchObject([{ name: "calm", frame: "quiet-home", task: "t1" }]);
		expect(turn.log.find((event) => event.kind === "frame" && event.frame === "quiet-home")).toMatchObject({
			spot: "calm",
			task: "t1",
		});
		expect(turn.log.find((event) => event.kind === "frame" && event.frame === "quiet-home-2")).not.toHaveProperty(
			"spot",
		);
		expect(turn.log.some((event) => event.kind === "spot" && event.state === "released")).toBe(false);
	});

	it("is let go empty when only timing ties the frame to the designer", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root } = makeProject(spoolDir);
		const turn = witnessed(root);
		turn.say({ kind: "called", id: "d1", tool: "Agent", input: { description: "Design calm" }, parent: null });
		turn.say(designer("t1", "d1", "Design calm"));
		await until(() => turn.log.some((event) => event.kind === "spot" && event.state === "held"));
		// a script the designer ran, which named no frame
		turn.say({ kind: "called", id: "s1", tool: "Bash", input: { command: "node make.mjs" }, parent: "d1" });
		await until(() => turn.log.some((event) => event.kind === "called" && event.id === "s1"));
		writeFrame(root, "stray", "export default () => null;\n");
		turn.ring("stray");
		await until(() => turn.log.some((event) => event.kind === "frame" && event.frame === "stray"));
		turn.say({ kind: "task-done", task: "t1", status: "completed", summary: null, parent: null });
		await until(() => turn.log.some((event) => event.kind === "spot" && event.state === "released"));
		await turn.end();

		expect(turn.log.some((event) => event.kind === "spot" && event.state === "filled")).toBe(false);
		expect(turn.log.find((event) => event.kind === "frame" && event.frame === "stray")).not.toHaveProperty("spot");
	});
});

describe("put back", () => {
	it("writes a deleted frame back from the source the turn kept, and refuses one that stands", async () => {
		const { root, name, app, proc, seen, close } = await turnOn((root) => {
			writeFrame(root, "doomed", "export default () => <p>one</p>;\n");
			writeDesignFile(root, "frames/doomed/frame.json", '{ "x": 40, "y": 60, "w": 390, "h": 844 }\n');
		});
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: root }));
		rmSync(join(root, "design/frames/doomed"), { recursive: true });
		await until(() => seen.some((event) => event.kind === "frame" && event.change === "deleted"));
		const deleted = seen.find((event) => event.kind === "frame" && event.change === "deleted");
		expect(deleted?.kind === "frame" && deleted.source).toBe("export default () => <p>one</p>;\n");

		const put = (body: unknown) =>
			app.request(`/api/p/${name}/agent/put-back`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		expect((await put({ thread: THREAD, frame: "../escape" })).status).toBe(400);
		expect((await put({ thread: THREAD, frame: "../escape", source: "x" })).status).toBe(400);
		expect((await put({ thread: THREAD, frame: "doomed" })).status).toBe(204);
		expect(readFileSync(join(root, "design/frames/doomed/frame.tsx"), "utf8")).toBe(
			"export default () => <p>one</p>;\n",
		);
		expect(JSON.parse(readFileSync(join(root, "design/frames/doomed/frame.json"), "utf8"))).toMatchObject({
			x: 40,
			y: 60,
		});
		expect((await put({ thread: THREAD, frame: "doomed", source: "x" })).status).toBe(409);
		expect(existsSync(join(root, "design/escape"))).toBe(false);

		// and the turn does not take the restore as the agent's own work
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(seen.filter((event) => event.kind === "frame" && event.change === "created")).toHaveLength(0);
		await close();
	});

	it("refuses a thread that is not there, and a frame its turn never deleted", async () => {
		const { root, name, app, proc, seen, close } = await turnOn((root) =>
			writeFrame(root, "home", "export default () => null;\n"),
		);
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: root }));
		await until(() => seen.length > 0);
		const put = (body: unknown) =>
			app.request(`/api/p/${name}/agent/put-back`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		expect((await put({ thread: "not-a-thread", frame: "ghost", source: "x" })).status).toBe(400);
		// a thread this project never had, whatever source the rail sends with it
		const stranger = "00000000-1111-4222-8333-444444444444";
		expect((await put({ thread: stranger, frame: "ghost", source: "x" })).status).toBe(404);
		// the thread's turn deleted nothing called ghost: the rail's copy does not make it so
		expect((await put({ thread: THREAD, frame: "ghost", source: "x" })).status).toBe(404);
		expect(existsSync(join(root, "design/frames/ghost"))).toBe(false);
		// and one it never deleted that stands is still a frame that stands
		expect((await put({ thread: THREAD, frame: "home", source: "x" })).status).toBe(409);
		await close();
	});

	it("still finds what the turn kept after the project is renamed", async () => {
		const { root, name, app, proc, seen, close } = await turnOn((root) =>
			writeFrame(root, "doomed", "export default () => <p>one</p>;\n"),
		);
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: root }));
		rmSync(join(root, "design/frames/doomed"), { recursive: true });
		await until(() => seen.some((event) => event.kind === "frame" && event.change === "deleted"));
		await close();

		const renamed = await app.request("/api/projects/rename", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root, name: `${name}-two` }),
		});
		expect(renamed.status).toBe(200);
		const moved = ((await renamed.json()) as { root: string }).root;
		// no source from the rail: only the turn's own copy can answer this
		const back = await app.request(`/api/p/${name}-two/agent/put-back`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, frame: "doomed" }),
		});
		expect(back.status).toBe(204);
		expect(readFileSync(join(moved, "design/frames/doomed/frame.tsx"), "utf8")).toBe(
			"export default () => <p>one</p>;\n",
		);
	});
});

describe("a frame the main agent writes", () => {
	it("streams its source a line at a time and reports the change with its lines", async () => {
		const { root, proc, seen, close } = await turnOn((root) => writeFrame(root, "home", "line 1\nline 2\nline 3\n"));
		const stream = (event: unknown) =>
			proc.emit(JSON.stringify({ type: "stream_event", event, parent_tool_use_id: null, session_id: THREAD }));
		stream({ type: "message_start", message: { id: "m1" } });
		stream({
			type: "content_block_start",
			index: 0,
			content_block: { type: "tool_use", id: "w1", name: "Write", input: {} },
		});
		const input = JSON.stringify({
			file_path: `${root}/design/frames/home/frame.tsx`,
			content: "line 1\nline two\nline 3\nline 4\n",
		});
		for (let at = 0; at < input.length; at += 7)
			stream({
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: input.slice(at, at + 7) },
			});
		await until(() => seen.some((event) => event.kind === "frame-source" && event.lines === 4));
		const sources = seen.filter((event) => event.kind === "frame-source");
		expect(sources.map((event) => event.kind === "frame-source" && event.text).join("")).toBe(
			"line 1\nline two\nline 3\nline 4\n",
		);
		// a line at a time, never the whole again
		expect(sources.map((event) => event.kind === "frame-source" && event.lines)).toEqual([1, 2, 3, 4]);

		writeFileSync(join(root, "design/frames/home/frame.tsx"), "line 1\nline two\nline 3\nline 4\n");
		await until(() => seen.some((event) => event.kind === "frame" && event.change === "changed"));
		const changed = seen.find((event) => event.kind === "frame" && event.change === "changed");
		expect(changed).toMatchObject({ frame: "home", lines: 4, range: { from: 2, to: 4 }, call: "w1" });
		await close();
	});
});
