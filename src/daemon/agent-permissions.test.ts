import { expect, it } from "vitest";
import { agentReader, makeApp, makeProject, makeTempDir, until } from "../test-helpers";
import { permissionClaude } from "./fixtures/claude-permissions";

const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const OTHER = "8f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const json = (body: unknown) => ({
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

/*
 * The reported revert to bypass (#361): a pick made while a turn ran was applied to the
 * running process first and saved only if that worked, so any refusal left bypass saved
 * and the menu read it back. A pick is the machine's now, saved at once and never refused.
 */
it("stores a mode picked mid-turn at once, applies it at the next turn, and never refuses it", async () => {
	const spoolDir = makeTempDir();
	const { name } = makeProject(spoolDir);
	const peer = permissionClaude();
	const app = makeApp(spoolDir, { agentExecutor: peer.executor });
	const route = (thread: string) => `/api/p/${name}/agent/threads/${thread}/permissions`;
	const read = async (thread = THREAD) => (await app.request(route(thread))).json();
	const put = (mode: unknown) => app.request(route(THREAD), { method: "PUT", ...json({ mode }) });

	expect(await (await put("bypass")).json()).toEqual({ mode: "bypass", pending: false });
	const events = agentReader(
		await app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			...json({ thread: THREAD, said: [{ prompt: "Permission journey" }] }),
		}),
	);
	await until(() => peer.spawned.length === 1);
	const first = peer.spawned[0];
	if (!first) throw new Error("Missing turn");
	expect(first.spawn.args[first.spawn.args.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");

	// two picks in a row, the second before anything could acknowledge the first
	expect((await put("invalid")).status).toBe(400);
	expect(await (await put("edits")).json()).toEqual({ mode: "edits", pending: true });
	expect(await (await put("ask")).json()).toEqual({ mode: "ask", pending: true });
	expect(await read()).toEqual({ mode: "ask", pending: true });
	// every other thread, running or new, already starts on the pick
	expect(await read(OTHER)).toEqual({ mode: "ask", pending: false });
	// the running process is left on the mode it started with
	expect(first.inputs.some((line) => line.includes("set_permission_mode"))).toBe(false);

	first.exit(0);
	await events.cancel();
	await expect.poll(read).toEqual({ mode: "ask", pending: false });
	void app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		...json({ thread: THREAD, said: [{ prompt: "Next turn" }] }),
	});
	await until(() => peer.spawned.length === 2);
	const next = peer.spawned[1]?.spawn.args ?? [];
	expect(next[next.indexOf("--permission-mode") + 1]).toBe("default");
	peer.spawned[1]?.exit(0);

	// and a restart reads the same pick
	const restarted = makeApp(spoolDir, { agentExecutor: permissionClaude().executor });
	expect(await (await restarted.request(route(OTHER))).json()).toEqual({ mode: "ask", pending: false });
});
