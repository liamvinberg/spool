import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshot(file: string) {
	const source = readFileSync(file, "utf8");
	const lines = source.split("\n");
	if (lines.at(-1) === "") lines.pop();
	const entries = lines.map((line, index) => {
		try {
			const value: unknown = JSON.parse(line);
			if (!record(value)) throw new Error("Expected an object");
			return { line: index + 1, value, error: false };
		} catch {
			return { line: index + 1, value: {}, error: true };
		}
	});
	return { file, digest: createHash("sha256").update(source).digest("hex"), entries };
}

function inventory(file: string) {
	const { digest, entries } = snapshot(file);
	const header = entries[0]?.value;
	const messages = entries.flatMap(({ value }) => (record(value.message) ? [value.message] : []));
	return {
		file,
		digest,
		modifiedAt: statSync(file).mtime.toISOString(),
		session: header?.id,
		project: header?.cwd,
		startedAt: header?.timestamp,
		lines: entries.length,
		lastEntry: entries.at(-1)?.value.id,
		models: [...new Set(messages.flatMap((message) => (typeof message.model === "string" ? [message.model] : [])))],
		messages: messages.length,
		toolErrors: messages.filter((message) => message.role === "toolResult" && message.isError === true).length,
		providerErrors: messages.filter((message) => message.role === "assistant" && message.stopReason === "error")
			.length,
		parseErrors: entries.filter((entry) => entry.error).map((entry) => entry.line),
		headerValid: header?.type === "session",
	};
}

/** Keep operational evidence; never print the image bytes or thinking blocks. */
function visible(value: unknown): unknown {
	if (Array.isArray(value))
		return value.map((item: unknown) => visible(item)).filter((item: unknown) => item !== undefined);
	if (!record(value)) return value;
	if (value.type === "thinking") return undefined;
	if (value.type === "image") return { type: "image", mimeType: value.mimeType, omitted: true };
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !["thinking", "thinkingSignature", "signature"].includes(key))
			.map(([key, item]) => [key, visible(item)]),
	);
}

function bounded(value: unknown, chars: number): unknown {
	const cleaned = visible(value);
	const text = JSON.stringify(cleaned);
	return text !== undefined && text.length > chars
		? { preview: text.slice(0, chars), omittedCharacters: text.length - chars }
		: cleaned;
}

function positive(value: string, name: string): number {
	if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
		throw new Error(`${name} must be a positive integer`);
	return Number(value);
}

const help = `Read local bundled Spool sessions without embedded image data.

  sessions.ts list [--state-dir <directory>]
  sessions.ts read <file> [--from 1] [--to 20] [--chars 1500]

list defaults to SPOOL_DIR or the checkout's ~/.spool-dev instance.
read prints JSON rows with original line numbers; --chars bounds each body.
Omitted images/thinking are not secret redaction. Keep the output private.`;

try {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			"state-dir": { type: "string" },
			from: { type: "string", default: "1" },
			to: { type: "string" },
			chars: { type: "string", default: "1500" },
			help: { type: "boolean" },
		},
	});
	const [command, path] = positionals;
	if (values.help) {
		process.stdout.write(`${help}\n`);
	} else if (command === "list" && positionals.length === 1) {
		const state = resolve(values["state-dir"] ?? (process.env.SPOOL_DIR || join(homedir(), ".spool-dev")));
		const directory = join(state, "bundled", "sessions");
		const files = readdirSync(directory)
			.filter((file) => file.endsWith(".jsonl"))
			.sort();
		process.stdout.write(`${JSON.stringify({ state, engine: "spool", sessions: files.length })}\n`);
		for (const file of files) {
			const path = join(directory, file);
			try {
				const summary = inventory(path);
				process.stdout.write(`${JSON.stringify(summary)}\n`);
				if (!summary.headerValid || summary.parseErrors.length > 0) process.exitCode = 1;
			} catch {
				process.stdout.write(`${JSON.stringify({ file: path, error: "Session could not be read" })}\n`);
				process.exitCode = 1;
			}
		}
	} else if (command === "read" && path && positionals.length === 2) {
		const from = positive(values.from, "--from");
		const to = values.to === undefined ? from + 19 : positive(values.to, "--to");
		if (to < from) throw new Error("--to must be at least --from");
		const chars = positive(values.chars, "--chars");
		const { file, digest, entries } = snapshot(resolve(path));
		process.stdout.write(`${JSON.stringify({ file, digest, totalLines: entries.length, from, to })}\n`);
		for (const { line, value, error } of entries.slice(from - 1, to)) {
			if (error) {
				process.stdout.write(`${JSON.stringify({ line, error: "Invalid JSON object" })}\n`);
				process.exitCode = 1;
				continue;
			}
			const message = record(value.message) ? value.message : {};
			process.stdout.write(
				`${JSON.stringify({
					line,
					id: value.id,
					parentId: value.parentId,
					timestamp: value.timestamp,
					type: value.type,
					role: message.role,
					toolCallId: message.toolCallId,
					toolName: message.toolName,
					isError: message.isError,
					stopReason: message.stopReason,
					provider: message.provider,
					model: message.model,
					body: bounded(value, chars),
				})}\n`,
			);
		}
	} else {
		throw new Error(help);
	}
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : "Could not read sessions"}\n`);
	process.exitCode = 1;
}
