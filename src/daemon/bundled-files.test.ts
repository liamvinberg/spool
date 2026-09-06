import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "@earendil-works/pi-ai";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, writeFrame } from "../test-helpers";
import type { EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";

function fileOptions(
	root: string,
	calls: { name: string; arguments: Record<string, unknown> }[],
	id: string = randomUUID(),
): EngineTurnOptions {
	return {
		root,
		session: { id },
		permissions: "ask",
		ask: { value: "spool/openai/api_key/spool-test" },
		said: [{ selection: "", prompt: `file tools: ${JSON.stringify(calls)}` }],
	};
}
const write = (path: string, content = "written") => ({ name: "write", arguments: { path, content } });
const read = (path: string) => ({ name: "read", arguments: { path } });
async function setup() {
	const root = makeTempDir();
	const directory = join(makeTempDir(), "bundled");
	const contexts: Context[] = [];
	const runtime = await deterministicBundledRuntime(directory, (context) => contexts.push(structuredClone(context)));
	await runtime.request({ kind: "connect", provider: "openai", key: "secret-fixture-key" });
	onTestFinished(() => runtime.close());
	return { root, directory, runtime, contexts };
}

it("runs actual pi reads, image reads, frame creation and every disjoint edit quietly", async () => {
	const { root, runtime, contexts } = await setup();
	const path = "design/frames/home/frame.tsx";
	const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
	writeFileSync(join(root, "image.png"), Buffer.from(png, "base64"));
	const events: AgentEvent[] = [];
	await runtime.turn(
		"quiet",
		fileOptions(root, [
			write(path, "export default () => <><h1>Old title</h1><p>Old body</p></>"),
			read(path),
			read("image.png"),
			{
				name: "edit",
				arguments: {
					path,
					edits: [
						{ oldText: "Old title", newText: "New title" },
						{ oldText: "Old body", newText: "New body" },
					],
				},
			},
		]),
		(event) => events.push(event),
	);
	expect(events.filter((event) => event.kind === "asking")).toEqual([]);
	expect(readFileSync(join(root, path), "utf8")).toContain("New title</h1><p>New body");
	expect(events.filter((event) => event.kind === "result")).toHaveLength(4);
	expect(events.find((event) => event.kind === "called" && event.tool === "MultiEdit")).toMatchObject({
		input: {
			edits: [
				{ old_string: "Old title", new_string: "New title" },
				{ old_string: "Old body", new_string: "New body" },
			],
		},
	});
	expect(JSON.stringify(contexts.at(-1)?.messages)).toContain(png);
	expect(contexts[0]?.tools?.find((tool) => tool.name === "edit")?.description).toContain(
		"Each edits[].oldText is matched against the original file",
	);
});

it("keeps once to one action, directory grants to their thread, and denial leaves other grants intact", async () => {
	const { root, runtime, directory } = await setup();
	const options = fileOptions(root, [
		write("src/ui/a"),
		write("src/ui/b"),
		write("src/ui/c"),
		write("other/d"),
		write("src/ui/d"),
	]);
	const asks: AgentEvent[] = [];
	await runtime.turn("scopes", options, (event) => {
		if (event.kind !== "asking") return;
		asks.push(event);
		void runtime
			.request({ kind: "answer", turn: "scopes", request: event.request, reply: { kind: "said", text: "yes" } })
			.then((accepted) => expect(accepted).toBe(false));
		void runtime.request({
			kind: "answer",
			turn: "scopes",
			request: event.request,
			reply: { kind: asks.length === 1 ? "allow" : asks.length === 2 ? "always" : "deny" },
		});
	});
	expect(asks).toHaveLength(3);
	expect(existsSync(join(root, "other/d"))).toBe(false);
	expect(readFileSync(join(root, "src/ui/d"), "utf8")).toBe("written");
	let count = 0;
	const deny = (turn: string) => (event: AgentEvent) => {
		if (event.kind === "asking") {
			count++;
			void runtime.request({ kind: "answer", turn, request: event.request, reply: { kind: "deny" } });
		}
	};
	await runtime.turn("same", fileOptions(root, [write("src/ui/e")], options.session.id), deny("same"));
	expect(count).toBe(0);
	await runtime.turn("new", fileOptions(root, [write("src/ui/f")]), deny("new"));
	expect(count).toBe(1);
	await runtime.close();
	const restarted = await deterministicBundledRuntime(directory);
	onTestFinished(() => restarted.close());
	await restarted.turn("restart", fileOptions(root, [write("src/ui/g")], options.session.id), (event) => {
		if (event.kind === "asking") {
			count++;
			void restarted.request({ kind: "answer", turn: "restart", request: event.request, reply: { kind: "deny" } });
		}
	});
	expect(count).toBe(2);
	expect(readFileSync(join(directory, "sessions", `${options.session.id}.jsonl`), "utf8")).not.toContain(
		'"kind":"file"',
	);
});

it("canonicalizes symlinks, traversal, dangling links and missing parents, and rechecks after approval", async () => {
	const { root, runtime } = await setup();
	writeFrame(root, "home", "export default () => <h1>Home</h1>");
	const outside = makeTempDir();
	symlinkSync(outside, join(root, "design/escape"));
	symlinkSync(join(outside, "missing/file"), join(root, "design/dangling"));
	let asks = 0;
	await runtime.turn(
		"paths",
		fileOptions(root, [write("design/escape/new/deep/file"), write("design/../outside"), write("design/dangling")]),
		(event) => {
			if (event.kind === "asking") {
				asks++;
				void runtime.request({ kind: "answer", turn: "paths", request: event.request, reply: { kind: "deny" } });
			}
		},
	);
	expect(asks).toBe(3);
	expect(existsSync(join(outside, "new"))).toBe(false);
	expect(existsSync(join(outside, "missing"))).toBe(false);
	await runtime.turn("swap", fileOptions(root, [write("src/new")]), (event) => {
		if (event.kind !== "asking") return;
		symlinkSync(outside, join(root, "src"));
		void runtime.request({ kind: "answer", turn: "swap", request: event.request, reply: { kind: "allow" } });
	});
	expect(existsSync(join(outside, "new"))).toBe(false);
});

it("withholds protected files and symlinked project instructions even in bypass", async () => {
	const { root, runtime, directory, contexts } = await setup();
	writeFrame(root, "home", "export default () => <h1>Home</h1>");
	const control = join(directory, "../daemon.json");
	writeFileSync(control, "secret-control-token");
	symlinkSync(join(directory, "credentials.json"), join(root, "AGENTS.md"));
	symlinkSync(control, join(root, "design/AGENTS.md"));
	symlinkSync(directory, join(root, "design/credentials"));
	const events: AgentEvent[] = [];
	await runtime.turn(
		"protected",
		{
			...fileOptions(root, [
				read("AGENTS.md"),
				read("design/AGENTS.md"),
				read("design/credentials/credentials.json"),
				write("design/credentials/../bundled/credentials.json"),
				write("design/canvas.json"),
				write(control),
			]),
			permissions: "bypass",
		},
		(event) => events.push(event),
	);
	expect(events.filter((event) => event.kind === "result" && event.failed)).toHaveLength(6);
	expect(JSON.stringify(contexts)).not.toContain("secret-fixture-key");
	expect(JSON.stringify(contexts)).not.toContain("secret-control-token");
	expect(events.some((event) => event.kind === "asking")).toBe(false);
});

it.each(["edits", "bypass"] as const)(
	"accepts file edits in %s and settles Stop and live mode changes",
	async (permissions) => {
		const { root, runtime } = await setup();
		const events: AgentEvent[] = [];
		await runtime.turn("mode", { ...fileOptions(root, [write("outside")]), permissions }, (event) =>
			events.push(event),
		);
		expect(events.some((event) => event.kind === "asking")).toBe(false);
		await runtime.turn("stop", fileOptions(root, [write("denied")]), (event) => {
			events.push(event);
			if (event.kind === "asking") void runtime.request({ kind: "stop", turn: "stop" });
		});
		expect(existsSync(join(root, "denied"))).toBe(false);
		expect(events.filter((event) => event.kind === "ended").at(-1)).toMatchObject({ ending: "stopped" });
		expect(events.find((event) => event.kind === "answered")).toMatchObject({ answer: "deny" });
		await runtime.turn("apply", fileOptions(root, [write("allowed")]), (event) => {
			if (event.kind === "asking") void runtime.request({ kind: "permissions", turn: "apply", mode: permissions });
		});
		expect(readFileSync(join(root, "allowed"), "utf8")).toBe("written");
	},
);
