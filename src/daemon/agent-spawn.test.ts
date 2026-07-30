import { describe, expect, it } from "vitest";
import { skillText } from "../skill";
import { AGENT_ALLOW_RULE, agentFraming, agentPromptContent, agentPromptLine, planAgentSpawn } from "./agent-spawn";

/** the value that follows a flag, the way the child's argv reads it */
function flagValue(args: readonly string[], flag: string): string | undefined {
	const at = args.indexOf(flag);
	return at < 0 ? undefined : args[at + 1];
}

describe("the spawn", () => {
	it("resolves the developer's own binary by bare name", () => {
		const spawn = planAgentSpawn("/tmp/product", {});

		// bare name, so PATH answers it — spool ships no agent and pins no install
		expect(spawn.command).toBe("claude");
		expect(spawn.cwd).toBe("/tmp/product");
	});

	it("carries the settled arguments, with partial messages and structured input", () => {
		const { args } = planAgentSpawn("/tmp/product", {});

		expect(args).toContain("--print");
		expect(flagValue(args, "--output-format")).toBe("stream-json");
		expect(args).toContain("--verbose");
		// not a flag, the product: without it there are no deltas at all, only
		// whole assistant messages
		expect(args).toContain("--include-partial-messages");
		// opened on the way in, because later work sends images and queued
		// messages down it
		expect(flagValue(args, "--input-format")).toBe("stream-json");
	});

	it("restricts settings to the developer's own and sets the permission mode explicitly", () => {
		const { args } = planAgentSpawn("/tmp/product", {});

		// the project's settings stay out: opening someone's design must not
		// change what your agent may do
		expect(flagValue(args, "--setting-sources")).toBe("user");
		expect(flagValue(args, "--setting-sources")).not.toContain("project");
		expect(flagValue(args, "--setting-sources")).not.toContain("local");
		// measured, a default spawn inherited a configuration that ran with every
		// check off, so this is load-bearing rather than cosmetic
		expect(flagValue(args, "--permission-mode")).toBe("default");
	});

	it("wires the permission prompt tool to stdio, which is what makes an ask data", () => {
		const { args } = planAgentSpawn("/tmp/product", {});

		// #121 rests on this and the binary's own help does not document it: without a
		// permission prompt tool wired to the stdio the adapter already opens, the ask
		// has nowhere to land, the tool fails quietly and the agent apologises and
		// stops — so the fence would be a wall rather than a question
		expect(flagValue(args, "--permission-prompt-tool")).toBe("stdio");
	});

	it("passes one allow rule and denies nothing", () => {
		const { args } = planAgentSpawn("/tmp/product", {});

		const settings = JSON.parse(flagValue(args, "--settings") ?? "{}") as {
			permissions?: { allow?: string[]; deny?: string[] };
		};
		expect(settings.permissions?.allow).toEqual([AGENT_ALLOW_RULE]);
		expect(AGENT_ALLOW_RULE).toBe("Edit(./design/**)");
		// deny beats allow and cannot express an exception, so there is no deny
		expect(settings.permissions?.deny).toBeUndefined();
		// and the shell is not narrowed: the fence is paths, never commands
		expect(args).not.toContain("--tools");
		expect(args).not.toContain("--disallowedTools");
		expect(args).not.toContain("--dangerously-skip-permissions");
		expect(args).not.toContain("--permission-mode=bypassPermissions");
	});

	it("puts no API key in the environment and strips none the developer set", () => {
		const bare = planAgentSpawn("/tmp/product", { PATH: "/usr/bin", HOME: "/home/liam" });

		// spool configures no key anywhere in this path
		expect(Object.keys(bare.env)).toEqual(["PATH", "HOME"]);
		expect(JSON.stringify(bare.env)).not.toMatch(/API_KEY|sk-ant/i);

		// and someone's own CLI configured with a key breaks no promise spool
		// made, so it rides along untouched
		const keyed = planAgentSpawn("/tmp/product", { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-theirs" });
		expect(keyed.env.ANTHROPIC_API_KEY).toBe("sk-ant-theirs");
	});

	it("sends the prompt as structured input carrying content blocks", () => {
		const line = agentPromptLine([{ type: "text", text: "make these consistent" }]);

		expect(line.endsWith("\n")).toBe(true);
		expect(JSON.parse(line)).toEqual({
			type: "user",
			message: { role: "user", content: [{ type: "text", text: "make these consistent" }] },
		});
	});
});

describe("what rides with the words", () => {
	const block = "<selection>\ncart — design/frames/cart/frame.tsx — 390×844\n</selection>";

	it("leads the words with the selection, and with a picture before both", () => {
		expect(agentPromptContent("make these consistent", block)).toEqual([
			{ type: "text", text: `${block}\n\nmake these consistent` },
		]);
		expect(agentPromptContent("match this", "", { media: "image/png", data: "AAAA" })).toEqual([
			{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
			{ type: "text", text: "match this" },
		]);
	});

	it("adds no block when nothing is pointed at", () => {
		expect(agentPromptContent("start a habit tracker", "")).toEqual([
			{ type: "text", text: "start a habit tracker" },
		]);
	});
});

describe("the framing", () => {
	it("is what the spawn actually appends, rather than text nobody sends", () => {
		const { args } = planAgentSpawn("/tmp/product", {});

		// appended rather than replacing: --system-prompt would take Claude Code's
		// own tool instructions with it
		expect(args).toContain("--append-system-prompt");
		expect(args).not.toContain("--system-prompt");
		expect(flagValue(args, "--append-system-prompt")).toBe(agentFraming());
	});

	it("tells the agent what spool is, and where the selection arrives", () => {
		const framing = agentFraming();

		expect(framing).toContain("You are the agent inside Spool, a live prototyping canvas.");
		expect(framing).toContain("The canvas is design/.");
		expect(framing).toContain("<selection>");
		// the price of restricting setting sources: the project's own memory file
		// never reaches the agent, so one line spends the agent's own Read on it
		expect(framing).toContain("Read the project's own CLAUDE.md or AGENTS.md before your first change.");
		expect(framing).toContain("Writing under design/ is silent.");
	});

	it("forbids nothing the fence leaves open", () => {
		const framing = agentFraming();

		// #121 left writes outside design/ possible on purpose
		expect(framing).not.toMatch(/never write outside|do not write outside|you may not/i);
	});

	it("carries the skill overview from the binary rather than a second copy", () => {
		const framing = agentFraming();

		expect(framing).toContain(skillText());
		// only the overview: a thread that renames one frame would otherwise pay
		// for six thousand tokens of topics it never opens
		expect(framing).not.toContain(skillText("frames"));
		expect(framing).not.toContain(skillText("verbs"));
	});

	it("is the same bytes on every spawn, so it caches", () => {
		expect(agentFraming()).toBe(agentFraming());
		expect(planAgentSpawn("/a", {}).args).toEqual(planAgentSpawn("/a", {}).args);
	});
});
