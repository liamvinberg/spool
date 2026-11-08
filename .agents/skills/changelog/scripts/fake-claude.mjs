#!/usr/bin/env node
/**
 * `claude` for a clip's spool: answers the questions spool asks the binary and plays the
 * one turn the clip scripts (CLIP_AGENT_SCRIPT, a JSON file), streaming each file's source
 * in and then writing it, as a real agent's Write does. Nothing reaches a model.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

/** @type {{ name?: string, steps: ({ say: string } | { write: string, content: string, json?: string, ms?: number } | { wait: number })[] }} */
const script = JSON.parse(readFileSync(process.env.CLIP_AGENT_SCRIPT ?? "", "utf8"));
const args = process.argv.slice(2);
const out = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

if (args[0] === "auth") {
	out({ loggedIn: true, email: "you@example.com", authMethod: "claude.ai" });
	process.exit(0);
}
if (args.includes("--version")) {
	process.stdout.write("2.1.300 (Claude Code)\n");
	process.exit(0);
}
if (!args.includes("stream-json")) {
	process.stdout.write(`${script.name ?? "clip"}\n`);
	process.exit(0);
}

const flag = (name) => {
	const at = args.indexOf(name);
	return at === -1 ? undefined : args[at + 1];
};
const session = flag("--session-id") ?? flag("--resume") ?? "clip-session";
const model = "claude-opus-5";
const base = { session_id: session, parent_tool_use_id: null };
let played = false;
let n = 0;

async function play() {
	out({ type: "system", subtype: "init", cwd: process.cwd(), model, tools: ["Write"], ...base });
	for (const step of script.steps) {
		if ("wait" in step) await sleep(step.wait);
		else if ("say" in step) {
			n += 1;
			out({
				type: "assistant",
				message: {
					model,
					id: `msg_${n}`,
					type: "message",
					role: "assistant",
					content: [{ type: "text", text: step.say }],
				},
				...base,
			});
		} else {
			n += 1;
			const id = `toolu_${n}`;
			const path = join(process.cwd(), step.write);
			const input = { file_path: path, content: step.content };
			const json = JSON.stringify(input);
			out({ type: "stream_event", event: { type: "message_start", message: { id: `msg_${n}`, model } }, ...base });
			out({
				type: "stream_event",
				event: {
					type: "content_block_start",
					index: 0,
					content_block: { type: "tool_use", id, name: "Write", input: {} },
				},
				...base,
			});
			const chunks = 24;
			for (let i = 0; i < chunks; i++) {
				const part = json.slice(
					Math.floor((i * json.length) / chunks),
					Math.floor(((i + 1) * json.length) / chunks),
				);
				out({
					type: "stream_event",
					event: {
						type: "content_block_delta",
						index: 0,
						delta: { type: "input_json_delta", partial_json: part },
					},
					...base,
				});
				await sleep((step.ms ?? 1200) / chunks);
			}
			out({ type: "stream_event", event: { type: "content_block_stop", index: 0 }, ...base });
			out({
				type: "assistant",
				message: {
					model,
					id: `msg_${n}`,
					type: "message",
					role: "assistant",
					content: [{ type: "tool_use", id, name: "Write", input }],
				},
				...base,
			});
			mkdirSync(dirname(path), { recursive: true });
			if (step.json !== undefined) writeFileSync(join(dirname(path), "frame.json"), step.json);
			writeFileSync(path, step.content);
			out({
				type: "user",
				message: {
					role: "user",
					content: [{ tool_use_id: id, type: "tool_result", content: "File created successfully" }],
				},
				...base,
			});
		}
	}
	out({ type: "result", subtype: "success", result: "done", num_turns: 1, is_error: false, ...base });
}

createInterface({ input: process.stdin }).on("line", (line) => {
	let wire;
	try {
		wire = JSON.parse(line);
	} catch {
		return;
	}
	if (wire.type !== "user") return;
	const content = wire.message?.content;
	const text = typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join("");
	// the model menu's probe asks with slash commands: those get an init and nothing else
	if (played || text.trim().startsWith("/")) {
		out({ type: "system", subtype: "init", cwd: process.cwd(), model, tools: [], ...base });
		out({ type: "result", subtype: "success", result: "", num_turns: 0, is_error: false, ...base });
		return;
	}
	played = true;
	void play();
});
process.stdin.on("end", () => setTimeout(() => process.exit(0), 200));
