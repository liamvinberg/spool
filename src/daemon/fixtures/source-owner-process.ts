import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "../agent-engine-spool";
import { createFrameCompiler } from "../compile";
import { createSourceOwner } from "../source-owner";

const root = process.env.SPOOL_TEST_ROOT,
	directory = process.env.SPOOL_TEST_STATE;
if (!root || !directory) throw new Error("missing source process fixture paths");
const heldRoot = root,
	heldDirectory = directory;
const stage = process.env.SPOOL_TEST_STAGE;
let host: ReturnType<typeof fork> | undefined;
let release = () => {};
const checkpoint = async (name: string) => {
	if (stage !== name) return;
	await new Promise<void>((resolve) => {
		release = resolve;
		process.send?.({ kind: "checkpoint", name, host: host?.pid });
	});
};
const client = new BundledHostClient(heldDirectory, (state) => {
	host = fork(fileURLToPath(new URL("./bundled-provider-host.ts", import.meta.url)), [], {
		cwd: state,
		env: bundledEnvironment(state),
		execArgv: ["--import", import.meta.resolve("tsx")],
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
	return host;
});
const owner = createSourceOwner(createFrameCompiler("test"), async () => undefined);
client.source = {
	open: (options) => {
		const authority = owner.agent(options.root, () => options.root === heldRoot);
		return {
			revoke: () => authority.revoke(),
			request: async (request) => {
				await checkpoint(`before-${request.kind}`);
				const response = await authority.request(request);
				await checkpoint(`after-${request.kind}`);
				return response;
			},
		};
	},
};
const engine = createSpoolEngine(heldDirectory, client);
await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
const server = createServer(async (_request, response) => {
	const turn = engine.start({
		root: heldRoot,
		session: { id: randomUUID() },
		permissions: "ask",
		ask: { value: "spool/openai/api_key/spool-test" },
		said: [
			{
				selection: "",
				prompt: `file tools: ${JSON.stringify([
					{ name: "read", arguments: { path: join(heldRoot, "design/frames/home/frame.tsx") } },
					{
						name: "edit",
						arguments: {
							path: join(heldRoot, "design/frames/home/frame.tsx"),
							edits: [{ oldText: "Original body", newText: "Agent body" }],
						},
					},
				])}`,
			},
		],
	});
	const events = [];
	for await (const event of turn.events) events.push(event);
	response.setHeader("content-type", "application/json");
	response.end(JSON.stringify(events));
});
server.listen(0, "127.0.0.1", () => {
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("missing address");
	process.send?.({ kind: "ready", url: `http://127.0.0.1:${address.port}` });
});
process.on("message", (message: { kind: string }) => {
	if (message.kind === "kill-host") {
		host?.once("exit", () => release());
		host?.kill("SIGKILL");
	} else if (message.kind === "release") release();
});
process.on("disconnect", () => {
	owner.close();
	client.close();
	server.close();
});
