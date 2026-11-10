import { describe, expect, it } from "vitest";
import { filesOf, foldHook, type OutsideSession, type Payload, sessionLive, startSession } from "./session";

const ROOT = "/work/shop";
// the shop's design, as the daemon reads its folders: a frame by its folder, the shared folder, nothing else
const designAt = (file: string) => {
	if (file.startsWith(`${ROOT}/design/shared/`)) return "shared" as const;
	const frame = /^(?:\/work\/shop\/design\/)?frames\/([^/]+)/.exec(file)?.[1];
	return frame === undefined ? null : { frame };
};
const start = () => startSession("claude:s1", "claude", ROOT, { name: "Ghostty", bundle: "com.mitchellh.ghostty" }, 0);

function run(events: readonly [string, Payload][], from: OutsideSession = start()): OutsideSession | null {
	let session: OutsideSession | null = from;
	let at = 1;
	for (const [event, payload] of events) {
		if (session === null) return null;
		session = foldHook(session, event, { cwd: ROOT, ...payload }, at++, designAt);
	}
	return session;
}

const edit = (frame: string) => ({
	tool_name: "Edit",
	tool_input: { file_path: `${ROOT}/design/frames/${frame}/frame.tsx` },
});

describe("a Claude Code session, folded from its hooks", () => {
	it("works on frames, waits on a permission, and ends with what it said and changed", () => {
		const working = run([
			["UserPromptSubmit", { prompt: "restyle the cart\nand keep the totals" }],
			["TaskCreated", { task_id: "1", task_subject: "Restyle the cart" }],
			["TaskCreated", { task_id: "2", task_subject: "Check the receipt" }],
			["PreToolUse", edit("cart")],
			["PostToolUse", edit("cart")],
			["TaskCompleted", { task_id: "1", task_subject: "Restyle the cart" }],
			["SubagentStart", { agent_id: "a1", agent_type: "Explore" }],
			[
				"PreToolUse",
				{
					agent_id: "a1",
					agent_type: "Explore",
					tool_name: "Read",
					tool_input: { file_path: "design/frames/menu/frame.tsx" },
				},
			],
		]);
		expect(working).toMatchObject({
			name: "restyle the cart",
			state: "working",
			hands: [
				{ agent: "main", who: "claude", act: "editing", frame: "cart" },
				{ agent: "a1", who: "explore", act: "reading", frame: "menu" },
			],
			tasks: [
				{ id: "1", done: true },
				{ id: "2", done: false },
			],
			changed: ["cart"],
		});

		const waiting = run(
			[
				[
					"PermissionRequest",
					{ tool_name: "WebFetch", tool_input: { url: "https://fonts.google.com/specimen/Inter" } },
				],
			],
			working as OutsideSession,
		);
		expect(waiting).toMatchObject({ state: "waiting", wants: "fetch fonts.google.com" });

		const asking = run(
			[
				["PostToolUse", { tool_name: "WebFetch", tool_input: {} }],
				["PreToolUse", { tool_name: "AskUserQuestion", tool_input: { questions: [] } }],
			],
			waiting as OutsideSession,
		);
		expect(asking).toMatchObject({ state: "waiting", wants: "ask you something" });

		const done = run(
			[
				["PostToolUse", { tool_name: "AskUserQuestion", tool_input: {} }],
				["SubagentStop", { agent_id: "a1", agent_type: "Explore" }],
				["Stop", { last_assistant_message: "Restyled the cart." }],
			],
			asking as OutsideSession,
		);
		expect(done).toMatchObject({
			state: "done",
			wants: null,
			hands: [],
			said: "Restyled the cart.",
			stopped: false,
			ended: 3,
		});
		expect(run([["SessionEnd", {}]], done as OutsideSession)).toMatchObject({
			state: "done",
			changed: ["cart"],
			ended: 3,
		});
		expect(
			run([
				["UserPromptSubmit", { prompt: "look" }],
				["SessionEnd", {}],
			]),
		).toBeNull();
	});

	it("keeps its prompt's name through what the harness feeds in itself, and reads a whole to-do list", () => {
		const there = run([
			["UserPromptSubmit", { prompt: "tidy the menu" }],
			[
				"PreToolUse",
				{
					tool_name: "TodoWrite",
					tool_input: {
						todos: [
							{ content: "Read it", status: "completed" },
							{ content: "Tidy it", status: "in_progress" },
						],
					},
				},
			],
			["UserPromptSubmit", { prompt: "<task-notification>\n<task-id>b1</task-id>" }],
			["PermissionRequest", { tool_name: "AskUserQuestion", tool_input: {} }],
		]);
		expect(there).toMatchObject({
			name: "tidy the menu",
			// changed nothing in the design yet: heard, not drawn
			drawn: false,
			state: "waiting",
			wants: "ask you something",
			tasks: [
				{ subject: "Read it", done: true },
				{ subject: "Tidy it", done: false },
			],
		});
	});

	it("is drawn once it writes a frame, and leaves it as it goes to work elsewhere, keeping its place through a command", () => {
		const shell = (command: string): Payload => ({ tool_name: "Bash", tool_input: { command } });
		// reading the design, a frame's or a fixture's, and looking at a frame draw nothing
		const looking = run([
			["UserPromptSubmit", { prompt: "tidy" }],
			["PreToolUse", { tool_name: "Read", tool_input: { file_path: `${ROOT}/src/app.ts` } }],
			["PreToolUse", shell("cat > src/fixtures/frames/menu/frame.tsx <<'EOF'\nx\nEOF")],
			["PreToolUse", shell(`grep -n "a > b" design/frames/menu/frame.tsx > /tmp/hits`)],
			["PreToolUse", shell("spool shot menu && pnpm -s dev check menu")],
		]) as OutsideSession;
		expect(looking).toMatchObject({ drawn: false, hands: [{ act: "reading", frame: "menu" }] });
		const there = run([["PreToolUse", edit("cart")]], looking) as OutsideSession;
		expect(there.drawn).toBe(true);
		expect(run([["PreToolUse", { tool_name: "Bash", tool_input: { command: "pnpm test" } }]], there)?.hands).toEqual(
			there.hands,
		);
		// gone from the frame, it stays drawn for the rest of the turn, through what the harness feeds in
		const away = run(
			[
				["PreToolUse", { tool_name: "Read", tool_input: { file_path: `${ROOT}/src/app.ts` } }],
				["UserPromptSubmit", { prompt: "<task-notification>\n<task-id>b1</task-id>" }],
			],
			there,
		);
		expect(away).toMatchObject({ hands: [], drawn: true });
		expect(run([["UserPromptSubmit", { prompt: "now the api" }]], away as OutsideSession)?.drawn).toBe(false);
	});

	it("is drawn by a write to the shared folder with no hand, and by a designer's first word", () => {
		const shared = { tool_name: "Write", tool_input: { file_path: `${ROOT}/design/shared/ui/button.tsx` } };
		expect(run([["PreToolUse", shared]])).toMatchObject({ drawn: true, hands: [], changed: [] });
		expect(run([["SubagentStart", { agent_id: "d1", agent_type: "Designer" }]])?.drawn).toBe(true);
		expect(run([["SubagentStart", { agent_id: "e1", agent_type: "Explore" }]])?.drawn).toBe(false);
	});

	it("counts a session interrupted where no hook could say so as stopped, once it sits idle", () => {
		const there = run([
			["UserPromptSubmit", { prompt: "tidy" }],
			["PreToolUse", edit("cart")],
			["PostToolUse", edit("cart")],
			["Notification", { notification_type: "idle_prompt" }],
		]);
		expect(there).toMatchObject({ state: "done", stopped: true, hands: [], changed: ["cart"] });
	});
});

describe("how long a session is shown", () => {
	it("drops a silent session unless a command of its is still running, and a done one that changed nothing", () => {
		const working = { ...start(), at: 0 };
		expect(sessionLive(working, 179_000)).toBe(true);
		expect(sessionLive(working, 181_000)).toBe(false);
		expect(sessionLive({ ...working, busy: 1 }, 181_000)).toBe(true);
		const done = { ...working, state: "done" as const, ended: 0 };
		expect(sessionLive(done, 1)).toBe(false);
		expect(sessionLive({ ...done, changed: ["cart"] }, 599_000)).toBe(true);
		expect(sessionLive({ ...done, changed: ["cart"] }, 601_000)).toBe(false);
	});
});

describe("the files a tool call names", () => {
	it("reads Codex's patches and pi's relative paths", () => {
		const patch =
			"*** Begin Patch\n*** Update File: design/frames/cart/frame.tsx\n@@\n*** Add File: design/frames/tip/frame.tsx\n*** End Patch";
		expect(filesOf("codex", "apply_patch", { command: patch }, ROOT)).toEqual({
			read: [],
			written: [`${ROOT}/design/frames/cart/frame.tsx`, `${ROOT}/design/frames/tip/frame.tsx`],
		});
		expect(filesOf("pi", "read", { path: "design/frames/cart/frame.tsx" }, ROOT)).toEqual({
			read: [`${ROOT}/design/frames/cart/frame.tsx`],
			written: [],
		});
		expect(filesOf("pi", "bash", { command: "ls" }, ROOT)).toBeNull();
	});

	it("finds the files a shell command names where it runs, and which of them it writes", () => {
		const shell = (command: string) => filesOf("claude", "Bash", { command }, ROOT);
		const DESIGN = `${ROOT}/design`;
		expect(
			shell("cd /work/shop/design; cat frames/cart/frame.json; cat > frames/cart/frame.tsx <<'EOF'\na > b\nEOF"),
		).toEqual({
			read: [`${DESIGN}/frames/cart/frame.json`, DESIGN],
			written: [`${DESIGN}/frames/cart/frame.tsx`],
		});
		// a copy out of the design reads it; a quoted `>` is a pattern's
		expect(
			shell(`cp design/frames/cart/frame.tsx site/cart.tsx && grep -c "a > b" design/frames/menu/frame.tsx 2>&1`),
		).toEqual({
			read: [`${DESIGN}/frames/cart/frame.tsx`, `${DESIGN}/frames/menu/frame.tsx`],
			written: [`${ROOT}/site/cart.tsx`],
		});
		// a script that writes files writes where it was taken to
		expect(shell("cd design/frames/cart && python3 - <<'EOF'\np='frame.tsx'\nopen(p, 'w').write(s)\nEOF")).toEqual({
			read: [],
			written: [`${DESIGN}/frames/cart`],
		});
		expect(shell(`pnpm -s dev comments add cart "too tight" && spool shot menu`)).toEqual({
			read: [],
			written: ["frames/cart"],
		});
		expect(shell("spool shot menu")).toBeNull();
	});
});
