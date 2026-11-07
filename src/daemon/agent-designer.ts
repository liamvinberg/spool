import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import type { AgentEngineId } from "./agent-engine";

/**
 * The designer every engine gets (#367): one short prompt and one description, owned by
 * spool and kept in spool's own instance state.
 *
 * Each engine mounts it per spawn in its own vocabulary, and none of them writes it into
 * the project or the person's agent config:
 *
 *   - Claude Code reads an `--agents` file (a path is allowed under `--print`);
 *   - Codex reads a role layer through `-c agents.designer.config_file=<path>` with a
 *     `-c agents.designer.description=…` beside it;
 *   - pi loads a small extension through `-e <path>`, a `designer` tool that runs a child
 *     pi with the prompt appended.
 *
 * The main agent decides when to bring designers in. Its framing gets one line about it
 * and the description says what a designer needs; the workflow is the model's own.
 */

export const DESIGNER_NAME = "designer";

/**
 * Drawn from Anthropic's frontend-design guidance: leave the usual defaults out, plan
 * colour and type first, spend boldness in one place, check against the brief.
 */
export const DESIGNER_PROMPT = `You are a designer on a spool canvas. You get one brief and draw one direction for it as frames under design/. \`spool skill\` has the canvas contract when you need it.

Plan colour and type before you write any code: a small palette where each colour has a job, and a display face and a text face chosen for this product. The defaults every model reaches for make every take look alike, so leave out Inter, Roboto and system font stacks, purple gradients, grids of identical rounded cards, and small ALL-CAPS labels above headings.

Spend boldness in one place, such as the headline, one strong colour, the layout or a single motion, and keep the rest quiet.

Your brief names your frame as design/frames/<page>/<name>/frame.tsx. Spool has already put a placeholder there, a folder whose frame.json holds its place: draw into it by writing that frame.tsx, and keep its frame.json unless you need another size, which you state as w and h alone, before you write frame.tsx.

Once the frame renders, look at it with \`spool shot\` and hold it against the brief. Revise whatever reads as generic. Then say in two or three sentences what you drew and where.`;

/** when to use it, which is what each engine shows the main agent beside the name */
export const DESIGNER_DESCRIPTION =
	"Draws one design direction as frames on the spool canvas. Use one designer per direction when someone asks for options or several directions. The brief is all it sees, so give it the product, its own frame to write as design/frames/<page>/<name>/frame.tsx, and what sets this direction apart.";

/** the framing's one line about designers, the same in every engine */
export const DESIGNER_FRAMING =
	"When someone asks for options or several directions, give each direction to its own designer with a brief. Before it starts, choose each designer's own frame and name it in the brief as design/frames/<page>/<name>/frame.tsx, one new frame per designer: spool puts a placeholder there the moment the designer starts, and the designer draws into it. Make single edits yourself.";

/**
 * The most a designer thinks. Every engine's sub-agent takes the parent's effort unless
 * told otherwise, so a thread on xhigh fanned out to three designers ran all three on
 * xhigh. A direction is drawn and then checked against its shot, which medium does as
 * well for a fraction of the tokens; the model stays the thread's own, which is where the
 * taste is.
 */
export const DESIGNER_EFFORT = "medium";

/** the levels, in every engine's vocabulary, that already sit at or under the cap */
const UNDER_CAP: readonly string[] = ["off", "none", "minimal", "low", DESIGNER_EFFORT];

/** a designer's effort: the thread's own where it is at or under the cap, else the cap */
export function designerEffort(thread: string | undefined): string {
	return thread !== undefined && UNDER_CAP.includes(thread) ? thread : DESIGNER_EFFORT;
}

export function designerDir(spoolDir: string): string {
	return join(spoolDir, "designer");
}

/** a TOML basic string: JSON's escapes are a subset TOML reads the same way */
const toml = (value: string): string => JSON.stringify(value);

function claudeDesignerFile(effort: string): string {
	return `${JSON.stringify(
		{ [DESIGNER_NAME]: { description: DESIGNER_DESCRIPTION, prompt: DESIGNER_PROMPT, effort } },
		null,
		"\t",
	)}\n`;
}

/** a role file's own effort outranks what the spawn asks for, so the cap holds */
function codexDesignerFile(effort: string): string {
	return `model_reasoning_effort = ${toml(effort)}\ndeveloper_instructions = ${toml(DESIGNER_PROMPT)}\n`;
}

/**
 * The pi extension, as the source pi compiles at start.
 *
 * One `designer` tool. Its call runs the same pi that loaded it (the running script, the
 * way pi's own sub-agent example does), in JSON mode with no session, on the parent's
 * model and on its thinking level held to the cap, with the designer prompt appended. The child is the person's
 * own pi with their login and settings and without this extension, so a designer brings
 * in no designers of its own. Tool calls from one message run in parallel, so a fan-out
 * is one call per direction. Each tool the child starts comes back as the tool's partial
 * result (`details.step`, the tool and its path or command), and the child's last words
 * are the result.
 */
function piDesignerFile(): string {
	return `// spool's designer for pi (#367). Written by spool into its own state and loaded with -e.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Type } from "@earendil-works/pi-ai";

const PROMPT = ${JSON.stringify(DESIGNER_PROMPT)};
const UNDER_CAP = ${JSON.stringify(UNDER_CAP)};

function invocation(args) {
	const script = process.argv[1];
	if (script && !script.startsWith("/$bunfs/") && existsSync(script)) return { command: process.execPath, args: [script, ...args] };
	if (!/^(node|bun)(\\.exe)?$/i.test(process.execPath.split(/[\\\\/]/).pop() ?? "")) return { command: process.execPath, args };
	return { command: "pi", args };
}

function stepOf(tool, args) {
	const what = typeof args?.path === "string" ? args.path : typeof args?.command === "string" ? args.command.split("\\n")[0] : "";
	const step = what === "" ? String(tool ?? "") : String(tool ?? "") + " " + what;
	return step.length > 80 ? step.slice(0, 79) + "…" : step;
}

function textOf(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	return (Array.isArray(content) ? content : []).filter((part) => part?.type === "text").map((part) => part.text ?? "").join("");
}

export default function (pi) {
	pi.registerTool({
		name: ${JSON.stringify(DESIGNER_NAME)},
		label: "Designer",
		description: ${JSON.stringify(DESIGNER_DESCRIPTION)},
		parameters: Type.Object({
			description: Type.String({ description: "A few words naming this direction" }),
			prompt: Type.String({ description: "The whole brief for this direction" }),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			const args = ["--mode", "json", "-p", "--no-session"];
			if (ctx?.model) args.push("--model", ctx.model.provider + "/" + ctx.model.id);
			args.push("--thinking", UNDER_CAP.includes(ctx?.thinkingLevel) ? ctx.thinkingLevel : ${JSON.stringify(DESIGNER_EFFORT)});
			args.push("--append-system-prompt", PROMPT, params.prompt);
			const run = invocation(args);
			const child = spawn(run.command, run.args, { cwd: ctx?.cwd ?? process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
			let buffer = "";
			let last = "";
			let stderr = "";
			const line = (text) => {
				let event;
				try {
					event = JSON.parse(text);
				} catch {
					return;
				}
				if (event.type === "tool_execution_start") {
					const step = stepOf(event.toolName, event.args);
					onUpdate?.({ content: [{ type: "text", text: last }], details: { step } });
				} else if (event.type === "message_end" && event.message?.role === "assistant") {
					const text = textOf(event.message);
					if (text !== "") last = text;
				}
			};
			const stop = () => child.kill("SIGTERM");
			signal?.addEventListener("abort", stop, { once: true });
			child.stdout.on("data", (chunk) => {
				buffer += chunk;
				let at;
				while ((at = buffer.indexOf("\\n")) >= 0) {
					line(buffer.slice(0, at).replace(/\\r$/, ""));
					buffer = buffer.slice(at + 1);
				}
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk;
			});
			const code = await new Promise((resolve) => {
				child.on("error", () => resolve(1));
				child.on("close", (exit) => resolve(exit ?? 1));
			});
			signal?.removeEventListener("abort", stop);
			if (buffer !== "") line(buffer);
			if (signal?.aborted) throw new Error("The designer was stopped.");
			if (code !== 0) throw new Error(last || stderr.trim().slice(-2000) || "The designer exited with " + code + ".");
			return { content: [{ type: "text", text: last || "(the designer said nothing)" }], details: { step: null } };
		},
	});
}
`;
}

function writeIfChanged(file: string, text: string): void {
	try {
		if (readFileSync(file, "utf8") === text) return;
	} catch {
		// not there yet
	}
	writeAtomic(file, text);
}

/**
 * Where the designer lives in spool's state, one file per engine in its own vocabulary:
 * Claude Code's `--agents` file, Codex's role layer for `agents.designer.config_file`, and
 * pi's extension for `-e`. Claude's and Codex's carry the designer's effort, so there is
 * one per level, and two threads on two levels never write the same file; pi's extension
 * reads the level when it runs.
 */
const DESIGNER_FILES: Readonly<
	Record<AgentEngineId, { readonly name: (effort: string) => string; readonly text: (effort: string) => string }>
> = {
	claude: { name: (effort) => `claude-agents-${effort}.json`, text: claudeDesignerFile },
	codex: { name: (effort) => `codex-designer-${effort}.toml`, text: codexDesignerFile },
	pi: { name: () => "pi-designer.ts", text: piDesignerFile },
};

/**
 * One engine's designer file for a thread on `effort`, written into spool's state if it
 * is missing or stale, and where it is. Called on every turn's spawn, so a spool upgrade
 * that changes the prompt reaches the next turn; a file that already says the same thing
 * is left alone.
 */
export function mountDesigner(spoolDir: string, engine: AgentEngineId, effort?: string): string {
	const { name, text } = DESIGNER_FILES[engine];
	const level = designerEffort(effort);
	const file = join(designerDir(spoolDir), name(level));
	writeIfChanged(file, text(level));
	return file;
}
