import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { accountItems, type CloudAccountState, followAccount } from "./cloud-account";

const ADA: CloudAccountState = {
	state: "signed-in",
	email: "ada@tidemark.app",
	accountUrl: "https://spool.page/account",
};

test("the Cloud Account menu offers Sign In while signed out and names the account while signed in", () => {
	const clicked: string[] = [];
	const actions = { signIn: () => clicked.push("sign in"), signOut: () => clicked.push("sign out") };
	const shown = (account: CloudAccountState | undefined) =>
		accountItems(account, actions).map(({ label, enabled }) => ({ label, enabled: enabled ?? true }));

	assert.deepEqual(shown(undefined), [{ label: "Sign In…", enabled: true }]);
	assert.deepEqual(shown({ state: "signed-out" }), [{ label: "Sign In…", enabled: true }]);
	assert.deepEqual(shown({ state: "signing-in" }), [{ label: "Signing In…", enabled: false }]);
	assert.deepEqual(shown(ADA), [
		{ label: "ada@tidemark.app", enabled: false },
		{ label: "Sign Out", enabled: true },
	]);
	assert.deepEqual(shown({ state: "unreachable" }), [{ label: "Sign Out", enabled: true }]);

	for (const account of [{ state: "signed-out" }, ADA] as const)
		for (const item of accountItems(account, actions)) (item.click as (() => void) | undefined)?.();
	assert.deepEqual(clicked, ["sign in", "sign out"]);
});

test("the menu follows the daemon's account events, and the daemon again after its stream ends", async () => {
	let current: CloudAccountState = { state: "signed-out" };
	const streams: ServerResponse[] = [];
	const tokens = new Set<unknown>();
	const server = createServer((request, response) => {
		tokens.add(request.headers["x-spool-control"]);
		if (request.url === "/api/cloud/account") {
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify(current));
			return;
		}
		if (request.url === "/api/events") {
			response.writeHead(200, { "content-type": "text/event-stream" });
			response.write(`event: hello\ndata: {"name":"spool"}\nid: 0\n\n`);
			streams.push(response);
			return;
		}
		response.statusCode = 404;
		response.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address !== null && typeof address !== "string");

	const seen: CloudAccountState[] = [];
	let waiting: (() => void) | undefined;
	const next = () => new Promise<void>((resolve) => (waiting = resolve));
	const send = (event: object) => streams.at(-1)?.write(`event: app\ndata: ${JSON.stringify(event)}\nid: 1\n\n`);
	let arrived = next();
	const follower = followAccount(
		`http://127.0.0.1:${address.port}`,
		"control-secret",
		(account) => {
			seen.push(account);
			waiting?.();
		},
		10,
	);
	try {
		await arrived;
		assert.deepEqual(seen, [{ state: "signed-out" }]);

		// signed in from Home or the terminal: the daemon says the account changed
		current = ADA;
		arrived = next();
		send({ kind: "settings" });
		send({ kind: "account" });
		await arrived;
		assert.deepEqual(seen, [{ state: "signed-out" }, ADA]);

		// the daemon restarted: signed out meanwhile, and the new stream reads it
		current = { state: "signed-out" };
		arrived = next();
		streams.at(-1)?.end();
		await arrived;
		assert.deepEqual(seen.at(-1), { state: "signed-out" });
		assert.equal(streams.length, 2);
		assert.deepEqual([...tokens], ["control-secret"]);
	} finally {
		follower.stop();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
