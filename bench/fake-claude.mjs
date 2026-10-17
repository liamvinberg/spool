#!/usr/bin/env node
/**
 * A stand-in for the `claude` binary that works the way a real turn looks on the wire, for
 * the benches that measure what a turn in flight costs the canvas (bench/agent-lag.ts). Put
 * its folder first on the daemon's PATH as `claude`.
 *
 * A turn streams prose word by word, then streams a Write's input as partial JSON, writes
 * the file, answers the call, and goes again until FAKE_TURN_MS is spent. The files are
 * the frames FAKE_FRAMES names (folders under design/frames, comma separated), each written
 * back with one more line, so every write recompiles and reloads a real frame.
 *
 *   FAKE_TURN_MS=60000 FAKE_FRAMES=cue-edit,shelf PATH=<dir with this as claude>:$PATH spool serve
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const out = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);

if (args[0] === "auth") {
	out({ loggedIn: true, email: "bench@spool.page" });
	process.exit(0);
}
if (args.includes("--version")) {
	process.stdout.write("2.1.999 (Claude Code)\n");
	process.exit(0);
}

const at = Math.max(args.indexOf("--session-id"), args.indexOf("--resume"));
const session = at === -1 ? "probe" : args[at + 1];
const cwd = process.cwd();
const turnMs = Number(process.env.FAKE_TURN_MS ?? 60_000);
const wordMs = Number(process.env.FAKE_WORD_MS ?? 40);
const fragmentMs = Number(process.env.FAKE_FRAGMENT_MS ?? 15);
const framesDir = join(cwd, "design", "frames");
const named = (process.env.FAKE_FRAMES ?? "").split(",").filter((one) => one !== "");
const frames = (
	named.length > 0
		? named
		: readdirSync(framesDir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name)
)
	.flatMap((dir) => {
		try {
			return readdirSync(join(framesDir, dir), { recursive: true })
				.filter((file) => String(file).endsWith("frame.tsx"))
				.map((file) => join(framesDir, dir, String(file)));
		} catch {
			return [];
		}
	})
	.slice(0, 40);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const base = { session_id: session, parent_tool_use_id: null };
const WORDS =
	"I am reworking the hero so the headline reads first, then tightening the spacing on the cards below it so the rhythm matches the rest of the page, and checking the frame again once it has rebuilt.".split(
		" ",
	);

let calls = 0;
async function message(index) {
	const id = `msg_${index}`;
	out({ type: "stream_event", event: { type: "message_start", message: { id, model: "claude-opus-5" } }, ...base });
	out({
		type: "stream_event",
		event: { type: "content_block_start", index: 0, content_block: { type: "text" } },
		...base,
	});
	let said = "";
	for (const word of WORDS) {
		said += `${word} `;
		out({
			type: "stream_event",
			event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `${word} ` } },
			...base,
		});
		await sleep(wordMs);
	}
	out({ type: "stream_event", event: { type: "content_block_stop", index: 0 }, ...base });
	const file = frames[calls % Math.max(frames.length, 1)];
	const call = `toolu_${++calls}`;
	if (file === undefined) {
		out({ type: "assistant", message: { id, role: "assistant", content: [{ type: "text", text: said }] }, ...base });
		return;
	}
	const content = `${readFileSync(file, "utf8").trimEnd()}\n// bench write ${calls}\n`;
	const input = JSON.stringify({ file_path: file, content });
	out({
		type: "stream_event",
		event: {
			type: "content_block_start",
			index: 1,
			content_block: { type: "tool_use", id: call, name: "Write", input: {} },
		},
		...base,
	});
	for (let from = 0; from < input.length; from += 160) {
		out({
			type: "stream_event",
			event: {
				type: "content_block_delta",
				index: 1,
				delta: { type: "input_json_delta", partial_json: input.slice(from, from + 160) },
			},
			...base,
		});
		await sleep(fragmentMs);
	}
	out({ type: "stream_event", event: { type: "content_block_stop", index: 1 }, ...base });
	out({ type: "stream_event", event: { type: "message_stop" }, ...base });
	out({
		type: "assistant",
		message: {
			id,
			role: "assistant",
			model: "claude-opus-5",
			content: [
				{ type: "text", text: said },
				{ type: "tool_use", id: call, name: "Write", input: { file_path: file, content } },
			],
		},
		...base,
	});
	writeFileSync(file, content);
	await sleep(50);
	out({
		type: "user",
		message: { role: "user", content: [{ tool_use_id: call, type: "tool_result", content: "File written" }] },
		...base,
	});
}

const lines = createInterface({ input: process.stdin });
let started = false;
lines.on("line", async () => {
	if (started) return;
	started = true;
	out({ type: "system", subtype: "init", cwd, session_id: session, model: "claude-opus-5", tools: ["Write"] });
	const begin = Date.now();
	let index = 0;
	if (session !== "probe") while (Date.now() - begin < turnMs) await message(index++);
	out({
		type: "result",
		subtype: "success",
		is_error: false,
		duration_ms: Date.now() - begin,
		num_turns: index,
		result: "done",
		...base,
	});
	process.exit(0);
});
