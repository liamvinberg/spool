import { expect, it } from "vitest";
import { agentReader, makeApp, makeProject, makeTempDir, until } from "../test-helpers";
import { permissionClaude } from "./fixtures/claude-permissions";

const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
it("applies Claude modes only after acknowledgement and releases files, commands and questions independently", async () => {
	const spoolDir = makeTempDir();
	const { name } = makeProject(spoolDir);
	const peer = permissionClaude();
	const app = makeApp(spoolDir, { agentExecutor: peer.executor });
	const events = agentReader(
		await app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "Permission journey" }] }),
		}),
	);
	await until(() => peer.spawned.length === 1);
	const route = `/api/p/${name}/agent/threads/${THREAD}/permissions?engine=claude`;
	const read = async () => (await app.request(route)).json();
	const put = (mode: unknown) =>
		app.request(route, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode }),
		});
	const saved = async () =>
		(await (await app.request(`/api/settings?project=${name}`)).json()) as {
			entries: { key: string; value: unknown }[];
		};
	expect(await read()).toEqual({ mode: "ask" });
	expect((await put("invalid")).status).toBe(400);
	peer.acknowledge(false);
	const changing = put("edits");
	await until(() => peer.changes.length === 1);
	expect(peer.changes[0]?.mode).toBe("acceptEdits");
	expect(await read()).toEqual({ mode: "ask" });
	expect(peer.answers).toEqual([]);
	expect((await put("bypass")).status).toBe(409);
	const pending = peer.changes[0];
	if (!pending) throw new Error("Missing mode request");
	peer.reply(pending);
	expect(await (await changing).json()).toEqual({ mode: "edits" });
	expect(peer.answers).toEqual(["file"]);
	expect((await saved()).entries.find((entry) => entry.key === "agent.permissions")?.value).toBe("edits");
	peer.acknowledge(true);
	peer.reject(true);
	expect((await put("bypass")).status).toBe(409);
	expect(await read()).toEqual({ mode: "edits" });
	expect(peer.answers).toEqual(["file"]);
	peer.reject(false);
	expect(await (await put("bypass")).json()).toEqual({ mode: "bypass" });
	expect(peer.changes.at(-1)?.mode).toBe("bypassPermissions");
	expect(peer.answers).toEqual(["file", "command"]);
	expect(await (await put("ask")).json()).toEqual({ mode: "ask" });
	expect(peer.changes.at(-1)?.mode).toBe("default");
	expect(peer.answers).not.toContain("question");
	peer.acknowledge(false);
	const abandoned = put("edits");
	await until(() => peer.changes.length === 5);
	peer.spawned[0]?.exit(1);
	expect((await abandoned).status).toBe(409);
	await events.cancel();
});

it("routes a mode to its own thread and leaves another running engine mode intact", async () => {
	const spoolDir = makeTempDir();
	const { name } = makeProject(spoolDir);
	const peer = permissionClaude();
	const app = makeApp(spoolDir, { agentExecutor: peer.executor });
	const second = "8f0e2d3c-4b5a-4697-8899-aabbccddeeff";
	const events = [];
	for (const thread of [THREAD, second]) {
		events.push(
			agentReader(
				await app.request(`/api/p/${name}/agent/turn`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ thread, engine: "claude", said: [{ prompt: "Permission journey" }] }),
				}),
			),
		);
	}
	await until(() => peer.spawned.length === 2);
	const route = `/api/p/${name}/agent/threads/${THREAD}/permissions`;
	const write = {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ mode: "edits" }),
	};
	expect((await app.request(`${route}?engine=spool`, write)).status).toBe(409);
	expect(await (await app.request(`${route}?engine=claude`, write)).json()).toEqual({ mode: "edits" });
	expect(await (await app.request(`/api/p/${name}/agent/threads/${second}/permissions?engine=claude`)).json()).toEqual(
		{ mode: "ask" },
	);
	expect(peer.spawned[1]?.inputs.some((line) => line.includes("set_permission_mode"))).toBe(false);
	for (const proc of peer.spawned) proc.exit(0);
	for (const event of events) await event.cancel();
});
