import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { hookToken } from "../outside/install";
import { parseProjectLink, writeProjectLink } from "../team-project";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createOutside, type OutsideView } from "./outside";

const FRAME = "export default function Frame() { return <div />; }";

describe("hooks from a connected harness", () => {
	it("take only spool's own hook secret, never a page's request, and draw on the project's canvas once at a frame", async () => {
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
		// another, asked about code and no frame, is heard but not drawn
		const code = { session_id: "s2", cwd: root, hook_event_name: "UserPromptSubmit", prompt: "fix the api" };
		expect((await hook(code, { "x-spool-hook": token })).status).toBe(204);

		const view = (await (await app.request(`/api/p/${name}/outside`)).json()) as OutsideView;
		expect(view.sessions).toMatchObject([
			{ id: "claude:s1", state: "working", hands: [{ who: "claude", act: "editing", frame: "cart" }] },
		]);
	});
});

describe("an agent in another checkout of a team project open here", () => {
	it("draws on the copy open here, its frames read from its own checkout, unless a registered root holds it", () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const team = parseProjectLink("https://spool.page/devosurf/shop");
		if (team === undefined) throw new Error("bad link");
		const open = makeProject(spoolDir);
		writeProjectLink(open.root, team);
		// a worktree of the same repo, with its own copy of design/ and a frame that has not reached this copy yet
		const sibling = makeTempDir();
		writeProjectLink(sibling, team);
		writeFrame(sibling, "receipt", FRAME);
		const elsewhere = makeTempDir();
		writeProjectLink(elsewhere, { ...team, url: "https://spool.page/devosurf/other", project: "other" });
		const roots = [open.root];
		const keeper = createOutside({ spoolDir, roots: () => roots, publish: () => {}, env: { HOME: home } });
		onTestFinished(() => keeper.close());
		const edit = (id: string, cwd: string) =>
			keeper.hook(
				"pi",
				{
					session_id: id,
					cwd: join(cwd, "src"),
					hook_event_name: "PreToolUse",
					tool_name: "edit",
					tool_input: { path: join(cwd, "design", "frames", "receipt", "frame.tsx") },
				},
				{ name: null, bundle: null },
			);

		expect(edit("s1", sibling)).toBe(true);
		expect(keeper.view(open.root).sessions).toMatchObject([
			{ id: "pi:s1", hands: [{ who: "pi", act: "editing", frame: "receipt" }] },
		]);
		expect(edit("s2", elsewhere)).toBe(false);

		roots.push(sibling);
		expect(edit("s3", sibling)).toBe(true);
		expect(keeper.view(sibling).sessions.map((one) => one.id)).toEqual(["pi:s3"]);
		expect(keeper.view(open.root).sessions.map((one) => one.id)).toEqual(["pi:s1"]);
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
