import { describe, expect, it } from "vitest";
import { skillText } from "../skill";
import { AGENT_ALLOW_RULES, agentFraming, agentPromptContent, agentPromptLine, planAgentSpawn } from "./agent-spawn";

/** a thread nobody has spawned yet, which is the ordinary case a flag test wants */
const FRESH = { id: "6b5c1d2e-1111-4222-8333-444455556666", resume: false } as const;

/** the value that follows a flag, the way the child's argv reads it */
function flagValue(args: readonly string[], flag: string): string | undefined {
	const at = args.indexOf(flag);
	return at < 0 ? undefined : args[at + 1];
}

describe("the spawn", () => {
	it("resolves the developer's own binary by bare name", () => {
		const spawn = planAgentSpawn("/tmp/product", {}, FRESH);

		// bare name, so PATH answers it — spool ships no agent and pins no install
		expect(spawn.command).toBe("claude");
		expect(spawn.cwd).toBe("/tmp/product");
	});

	it("carries the settled arguments, with partial messages and structured input", () => {
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

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
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

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
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

		// #121 rests on this and the binary's own help does not document it: without a
		// permission prompt tool wired to the stdio the adapter already opens, the ask
		// has nowhere to land, the tool fails quietly and the agent apologises and
		// stops — so the fence would be a wall rather than a question
		expect(flagValue(args, "--permission-prompt-tool")).toBe("stdio");
	});

	it("allows edits under design/ and the tools that cannot change anything, denies nothing", () => {
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

		const settings = JSON.parse(flagValue(args, "--settings") ?? "{}") as {
			permissions?: { allow?: string[]; deny?: string[] };
			sandbox?: { enabled?: boolean };
		};
		expect(settings.permissions?.allow).toEqual(AGENT_ALLOW_RULES);
		// the mutation fence, the harmless three (read anywhere, fetch, search),
		// and spool's own read-only CLI, which runs outside the sandbox where
		// only a rule keeps it quiet
		expect(AGENT_ALLOW_RULES).toEqual([
			"Edit(./design/**)",
			"Read(//**)",
			"WebFetch",
			"WebSearch",
			"Bash(spool)",
			"Bash(spool *)",
		]);
		// deny beats allow and cannot express an exception, so there is no deny
		expect(settings.permissions?.deny).toBeUndefined();
		// and the shell is not narrowed: the fence is paths, never commands
		expect(args).not.toContain("--tools");
		expect(args).not.toContain("--disallowedTools");
		expect(args).not.toContain("--dangerously-skip-permissions");
		expect(args).not.toContain("--permission-mode=bypassPermissions");
	});

	it("runs the shell sandboxed, which is what makes commands quiet", () => {
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

		const settings = JSON.parse(flagValue(args, "--settings") ?? "{}") as {
			sandbox?: { enabled?: boolean; excludedCommands?: string[]; filesystem?: unknown };
		};
		// the OS judges the running process where an allowlist could only judge
		// the command string, and a script the agent wrote is not a string anyone
		// can judge
		expect(settings.sandbox?.enabled).toBe(true);
		// spool's own CLI runs outside the sandbox: `spool shot` launches Chrome,
		// and Chrome cannot start under Seatbelt (mach ports, observed live)
		expect(settings.sandbox?.excludedCommands).toEqual(["spool", "spool *"]);
		// no filesystem narrowing: denyWrite on the root with allowWrite on
		// design/ blocks design/ too (measured on 2.1.220 — deny beats allow), so
		// the boundary stays the binary's own cwd + temp and the framing carries
		// the design/ intent instead
		expect(settings.sandbox && "filesystem" in settings.sandbox).toBe(false);
	});

	it("puts no API key in the environment and strips none the developer set", () => {
		const bare = planAgentSpawn("/tmp/product", { PATH: "/usr/bin", HOME: "/home/liam" }, FRESH);

		// spool configures no key anywhere in this path
		expect(Object.keys(bare.env)).toEqual(["PATH", "HOME"]);
		expect(JSON.stringify(bare.env)).not.toMatch(/API_KEY|sk-ant/i);

		// and someone's own CLI configured with a key breaks no promise spool
		// made, so it rides along untouched
		const keyed = planAgentSpawn("/tmp/product", { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-theirs" }, FRESH);
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
		expect(agentPromptContent([{ prompt: "make these consistent", selection: block }])).toEqual([
			{ type: "text", text: `${block}\n\nmake these consistent` },
		]);
		expect(
			agentPromptContent([
				{ prompt: "match this", selection: "", attachment: { media: "image/png", data: "AAAA" } },
			]),
		).toEqual([
			{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
			{ type: "text", text: "match this" },
		]);
	});

	it("adds no block when nothing is pointed at", () => {
		expect(agentPromptContent([{ prompt: "start a habit tracker", selection: "" }])).toEqual([
			{ type: "text", text: "start a habit tracker" },
		]);
	});

	it("sends every message a queue fired, in order, each with its own block (#170)", () => {
		const second = "<selection>\nmenu — design/frames/menu/frame.tsx — 390×844\n</selection>";

		// one turn, not two: the messages are blocks of one user message, so nothing
		// depends on the binary's own queueing to keep them from becoming two turns
		expect(
			agentPromptContent([
				{ prompt: "make these consistent", selection: block },
				{ prompt: "and the menu too", selection: second },
			]),
		).toEqual([
			{ type: "text", text: `${block}\n\nmake these consistent` },
			{ type: "text", text: `${second}\n\nand the menu too` },
		]);
	});
});

/**
 * The thread, in the binary's own vocabulary for one (#120, #200).
 *
 * The session id is the thread: spool mints a uuid before there is any process, hands it
 * over on the thread's first turn, and resumes it on every turn after. Measured in #120,
 * a resumed session keeps its id and does not fork, and the agent remembers what it was
 * told with nothing re-sent — which is exactly why the rail's own picture is spool's
 * problem, since a resume emits no history at all.
 */
describe("the session", () => {
	it("is started under the id spool minted for the thread", () => {
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

		expect(flagValue(args, "--session-id")).toBe(FRESH.id);
		expect(args).not.toContain("--resume");
	});

	it("is resumed under that same id on every turn after the first", () => {
		const { args } = planAgentSpawn("/tmp/product", {}, { id: FRESH.id, resume: true });

		expect(flagValue(args, "--resume")).toBe(FRESH.id);
		// the two are exclusive: --session-id wants an id the binary has never seen
		expect(args).not.toContain("--session-id");
	});
});

describe("the framing", () => {
	it("is what the spawn actually appends, rather than text nobody sends", () => {
		const { args } = planAgentSpawn("/tmp/product", {}, FRESH);

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
		// the framing carries the fence's one gap: the sandbox's write boundary is
		// the project root, so only the file tools ask outside design/
		expect(framing).toContain("writing under design/ are\nall silent.");
		expect(framing).toContain("with the file\ntools rather than the shell");
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
		expect(planAgentSpawn("/a", {}, FRESH).args).toEqual(planAgentSpawn("/a", {}, FRESH).args);
	});
});
