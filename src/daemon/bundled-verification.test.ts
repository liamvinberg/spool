import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "@earendil-works/pi-ai";
import { expect, it, onTestFinished } from "vitest";
import { serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { transcriptOf } from "../ui/canvas/agent-transcript";
import type { EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";

it("uses this package and instance for real shots, logs and Playwright interactions, carrying every slice into the model and look row", {
	timeout: 90_000,
}, async () => {
	const project = await serveProject();
	const { root } = project;
	writeFrame(
		root,
		"home",
		'export default () => <main><h1>Original</h1><button data-go="next">Continue</button></main>',
	);
	writeDesignFile(root, "frames/home/frame.json", '{"w":600,"h":2600}');
	writeFrame(root, "next", "export default () => <h1>Arrived</h1>");
	writeFrame(root, "broken", "export default () => <main>unclosed");
	writeFrame(root, "error", 'console.error("fixture runtime error"); export default () => <h1>Error fixture</h1>');
	const directory = join(project.spoolDir, "bundled");
	const contexts: Context[] = [];
	const runtime = await deterministicBundledRuntime(directory, (context) => contexts.push(structuredClone(context)));
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	onTestFinished(() => runtime.close());
	const events: AgentEvent[] = [];
	const session = { id: randomUUID() };
	const run = async (calls: { name: string; arguments: Record<string, unknown> }[]) => {
		const id = randomUUID();
		const options: EngineTurnOptions = {
			root,
			session,
			permissions: "ask",
			ask: { value: "spool/openai/api_key/spool-test" },
			said: [{ selection: "", prompt: `file tools: ${JSON.stringify(calls)}` }],
		};
		await runtime.turn(id, options, (event) => {
			events.push(event);
			if (event.kind === "asking")
				void runtime.request({ kind: "answer", turn: id, request: event.request, reply: { kind: "allow" } });
		});
	};
	const bash = (command: string, extra: Record<string, unknown> = {}) => ({
		name: "bash",
		arguments: { command, ...extra },
	});
	await run([
		{ name: "read", arguments: { path: "design/frames/home/frame.tsx" } },
		{
			name: "edit",
			arguments: { path: "design/frames/home/frame.tsx", edits: [{ oldText: "Original", newText: "Edited frame" }] },
		},
		bash("spool shot home"),
		bash("spool logs home"),
		bash("spool logs error"),
		bash("spool shot broken"),
		bash("spool skill verbs"),
		bash("spool status"),
		bash("spool selection"),
		bash("spool flows"),
		bash("spool url home"),
	]);
	expect(events.filter((event) => event.kind === "asking")).toHaveLength(0);
	const results = events.filter((event) => event.kind === "result");
	const shot = results[2];
	expect(shot).toMatchObject({ failed: false });
	expect(shot?.images.length).toBeGreaterThan(1);
	for (const image of shot?.images ?? [])
		expect(Buffer.from(image.data, "base64").subarray(1, 4).toString()).toBe("PNG");
	expect(results[4]?.text).toContain("fixture runtime error");
	expect(results[5]).toMatchObject({ failed: true });
	expect(results[5]?.text).toContain("Unexpected end of file");
	expect(results[7]?.text).toContain(project.url);
	expect(results[10]?.text).toContain(`/play/${project.name}?frame=home`);
	const modelShot = contexts
		.at(-1)
		?.messages.find((message) => message.role === "toolResult" && message.toolCallId === shot?.id);
	if (modelShot?.role !== "toolResult") throw new Error("Missing model shot");
	expect(modelShot.content.filter((part) => part.type === "image")).toHaveLength(shot?.images.length ?? 0);
	const row = transcriptOf(
		[{ text: "verify" }],
		events.map((event, index) => ({ event, at: index })),
	).entries.find((entry) => entry.kind === "row" && entry.verb === "look");
	expect(row).toMatchObject({ kind: "row", verb: "look", frame: "home", subject: "home" });
	if (row?.kind !== "row") throw new Error("Missing look row");
	expect(1 + (row.slices?.length ?? 0)).toBe(shot?.images.length);
	// Use the exact installed-package anchor handed to the model by the actual skill command.
	const anchor = /const requireFromSpool = createRequire\((.+)\);/.exec(results[6]?.text ?? "")?.[1];
	expect(anchor).toBeDefined();
	const url = results[10]?.text.trim();
	writeFileSync(
		join(root, "design/check.mjs"),
		`import { createRequire } from 'node:module';
const requireFromSpool = createRequire(${anchor});
const { chromium } = requireFromSpool('playwright-core');
const browser = await chromium.launch({ channel: 'chromium-headless-shell', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
 await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded' });
 const frame = page.frameLocator('#spool-player');
 await frame.getByRole('heading', { name: 'Edited frame' }).waitFor();
 await frame.getByRole('button', { name: 'Continue' }).click();
 await frame.getByRole('heading', { name: 'Arrived' }).waitFor();
 console.log('verified interaction');
} finally { await browser.close(); }
`,
	);
	await run([bash(`'${process.execPath}' design/check.mjs`, { unsandboxed: true, description: "Run browser check" })]);
	expect(events.filter((event) => event.kind === "asking")).toHaveLength(1);
	expect(events.filter((event) => event.kind === "result").at(-1)).toMatchObject({ failed: false });
	expect(events.filter((event) => event.kind === "result").at(-1)?.text).toContain("verified interaction");
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toContain("Edited frame");
});
