import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { hookToken } from "../outside/install";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createOutside, type OutsideView } from "./outside";

const FRAME = "export default function Frame() { return <div />; }";

describe("hooks from a connected harness", () => {
	it("take only spool's own hook secret, never a page's request, and draw on the project's canvas", async () => {
		const spoolDir = makeTempDir();
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", FRAME);
		const token = hookToken(spoolDir);
		const app = makeApp(spoolDir);
		const hook = (body: unknown, headers: Record<string, string>) =>
			app.fetch("/api/hook/claude", {
				method: "POST",
				headers: { "content-type": "application/json", ...headers },
				body: JSON.stringify(body),
			});
		const edit = {
			session_id: "s1",
			cwd: root,
			hook_event_name: "PreToolUse",
			tool_name: "Edit",
			tool_input: { file_path: join(root, "design", "frames", "cart", "frame.tsx") },
		};

		expect((await hook(edit, {})).status).toBe(401);
		expect((await hook(edit, { "x-spool-hook": "wrong" })).status).toBe(401);
		expect((await hook(edit, { "x-spool-hook": token, origin: "https://example.com" })).status).toBe(403);
		expect((await hook(edit, { "x-spool-hook": token, "x-spool-term": "ghostty" })).status).toBe(204);

		const view = (await (await app.request(`/api/p/${name}/outside`)).json()) as OutsideView;
		expect(view.sessions).toMatchObject([
			{ id: "claude:s1", state: "working", hands: [{ who: "claude", act: "editing", frame: "cart" }] },
		]);
	});
});

describe("the ask about an agent heard running spool", () => {
	function outside() {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const project = makeProject(spoolDir);
		writeFrame(project.root, "cart", FRAME);
		const told: OutsideView[] = [];
		const keeper = createOutside({
			spoolDir,
			roots: () => [project.root],
			publish: (_root, view) => told.push(view),
			env: { HOME: home },
		});
		onTestFinished(() => keeper.close());
		return { keeper, root: project.root };
	}

	it("names the frames it wrote lately, and stops after a second Not now", () => {
		const { keeper, root } = outside();
		keeper.notice(root, "claude");
		expect(keeper.view(root).ask).toMatchObject({ harness: "claude", frames: ["cart"] });

		expect(keeper.later("claude")).toEqual({ never: false });
		expect(keeper.view(root).ask).toBeNull();
		expect(keeper.later("claude")).toEqual({ never: true });
		expect(keeper.view(root).ask).toBeNull();
		// another harness is its own question
		keeper.notice(root, "codex");
		expect(keeper.view(root).ask?.harness).toBe("codex");
	});
});
