import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

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

Once the frame renders, look at it with \`spool shot\` and hold it against the brief. Revise whatever reads as generic. Then say in two or three sentences what you drew and where.`;

/** when to use it, which is what each engine shows the main agent beside the name */
export const DESIGNER_DESCRIPTION =
	"Draws one design direction as frames on the spool canvas. Use one designer per direction when someone asks for options or several directions. The brief is all it sees, so give it the product, the page and frame names to write, and what sets this direction apart.";

/**
 * Codex's spawn tool can fork the parent's turns into the child. A designer works from its
 * brief, so the hint asks for none of them. Codex 0.161 offered its v1 spawn tool here,
 * which takes `fork_context` rather than `fork_turns`, so the hint names both.
 */
export const CODEX_DESIGNER_DESCRIPTION = `${DESIGNER_DESCRIPTION} Spawn it with fork_turns "none" (fork_context false where the spawn tool takes that), so it starts from the brief.`;

/** the framing's one line about designers, the same in every engine */
export const DESIGNER_FRAMING =
	"When someone asks for options or several directions, give each direction to its own designer with a brief. Make single edits yourself.";

/**
 * Where Codex keeps the designer, which its framing has to say (#367).
 *
 * Codex 0.161 under its code-mode `exec` lists its multi-agent tools only in `ALL_TOOLS`,
 * not up front. Recorded, a main agent framed with the one line alone said it had no way
 * to spawn a designer and drew both directions itself; told where the tool was, it
 * spawned one designer per direction.
 */
export const CODEX_DESIGNER_FRAMING = `${DESIGNER_FRAMING} A designer is an agent role: spawn it with spawn_agent and agent_type "designer", one per direction (under exec, spawn_agent is among ALL_TOOLS).`;

/** where the designer lives in spool's state, one file per engine */
export interface DesignerMount {
	/** Claude Code's `--agents` file */
	readonly claude: string;
	/** Codex's role layer, for `agents.designer.config_file` */
	readonly codex: string;
	/** pi's extension, for `-e` */
	readonly pi: string;
}

export function designerDir(spoolDir: string): string {
	return join(spoolDir, "designer");
}

/** a TOML basic string: JSON's escapes are a subset TOML reads the same way */
const toml = (value: string): string => JSON.stringify(value);

export function claudeDesignerFile(): string {
	return `${JSON.stringify(
		{ [DESIGNER_NAME]: { description: DESIGNER_DESCRIPTION, prompt: DESIGNER_PROMPT } },
		null,
		"\t",
	)}\n`;
}

export function codexDesignerFile(): string {
	return `developer_instructions = ${toml(DESIGNER_PROMPT)}\n`;
}

/**
 * The pi extension, as the source pi compiles at start.
 *
 * One `designer` tool. Its call runs the same pi that loaded it (the running script, the
 * way pi's own sub-agent example does), in JSON mode with no session, on the parent's
 * model and thinking level, with the designer prompt appended. The child is the person's
 * own pi with their login and settings and without this extension, so a designer brings
 * in no designers of its own. Tool calls from one message run in parallel, so a fan-out
 * is one call per direction. Each tool the child starts comes back as the tool's partial
 * result (`details.step`, the tool and its path or command), and the child's last words
 * are the result.
 */
export function piDesignerFile(): string {
	return `// spool's designer for pi (#367). Written by spool into its own state and loaded with -e.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Type } from "@earendil-works/pi-ai";

const PROMPT = ${JSON.stringify(DESIGNER_PROMPT)};

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
			if (ctx?.thinkingLevel) args.push("--thinking", ctx.thinkingLevel);
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
 * The designer's files, written into spool's state if they are missing or stale, and
 * where they are. Called on every turn's spawn, so a spool upgrade that changes the
 * prompt reaches the next turn; a file that already says the same thing is left alone.
 */
export function mountDesigner(spoolDir: string): DesignerMount {
	const dir = designerDir(spoolDir);
	const mount: DesignerMount = {
		claude: join(dir, "claude-agents.json"),
		codex: join(dir, "codex-designer.toml"),
		pi: join(dir, "pi-designer.ts"),
	};
	writeIfChanged(mount.claude, claudeDesignerFile());
	writeIfChanged(mount.codex, codexDesignerFile());
	writeIfChanged(mount.pi, piDesignerFile());
	return mount;
}
