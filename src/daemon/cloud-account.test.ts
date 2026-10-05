import { expect, it, onTestFinished, vi } from "vitest";
import { type CloudAccount, CloudSignedOut } from "../cloud-auth";
import { SpoolError } from "../errors";
import { makeTempDir, sseReader } from "../test-helpers";
import { createDaemonApp } from "./app";
import type { CloudAccountServices } from "./cloud-account";

const ADA: CloudAccount = { accountId: "account", email: "ada@tidemark.app", sessionId: "device", expiresAt: 1 };

function harness() {
	let signedIn: CloudAccount | null = null;
	let finish: ((account: CloudAccount) => void) | undefined;
	const opened: string[] = [];
	const services: CloudAccountServices = {
		origin: () => "https://cloud.test",
		account: async () => {
			if (!signedIn) throw new CloudSignedOut("not signed in; run `spool login`");
			return signedIn;
		},
		login: (_spoolDir, { open, signal }) =>
			new Promise((resolve, reject) => {
				open("https://cloud.test/sign-in?return_url=loopback");
				signal.addEventListener("abort", () => reject(new SpoolError("sign-in was cancelled")));
				finish = (account) => {
					signedIn = account;
					resolve(account);
				};
			}),
		logout: vi.fn(async () => {
			signedIn = null;
		}),
		open: (url) => opened.push(url),
	};
	const daemon = createDaemonApp({
		spoolDir: makeTempDir(),
		version: "test",
		controlHost: "localhost",
		controlToken: "control-secret",
		cloudAccountServices: services,
	});
	onTestFinished(() => daemon.close());
	const control = { "x-spool-control": "control-secret", origin: "http://localhost" };
	const api = async (path: string, method = "GET") => {
		const response = await daemon.app.request(`http://localhost/api/cloud/account${path}`, {
			method,
			headers: control,
		});
		return { status: response.status, body: response.status === 204 ? null : await response.json() };
	};
	return {
		api,
		services,
		opened,
		finish: (account: CloudAccount) => finish?.(account),
		/** `spool login` or `spool logout` in a terminal: the Keychain changes without the daemon. */
		elsewhere: (account: CloudAccount | null) => {
			signedIn = account;
		},
		control,
		daemon,
	};
}

it("signs this Mac in through the browser, shows who it is, and signs it out", async () => {
	const { api, services, opened, finish } = harness();
	expect(await api("")).toEqual({ status: 200, body: { state: "signed-out" } });
	expect(await api("/sign-in", "POST")).toEqual({ status: 202, body: { state: "signing-in" } });
	expect(opened).toEqual(["https://cloud.test/sign-in?return_url=loopback"]);
	expect(await api("/reopen", "POST")).toEqual({ status: 200, body: { reopened: true } });
	expect(opened).toHaveLength(2);
	finish(ADA);
	await vi.waitFor(async () =>
		expect((await api("")).body).toEqual({
			state: "signed-in",
			email: "ada@tidemark.app",
			accountUrl: "https://cloud.test/account",
		}),
	);
	expect(await api("/sign-out", "POST")).toEqual({ status: 200, body: { state: "signed-out" } });
	expect(services.logout).toHaveBeenCalledOnce();
});

it("cancels a sign-in that is waiting on the browser", async () => {
	const { api } = harness();
	await api("/sign-in", "POST");
	expect((await api("/cancel", "POST")).status).toBe(204);
	await vi.waitFor(async () => expect((await api("")).body).toEqual({ state: "signed-out" }));
	expect(await api("/reopen", "POST")).toEqual({ status: 200, body: { reopened: false } });
});

it("reads the account again when the CLI says it changed, and tells every page", async () => {
	const { api, elsewhere, control, daemon } = harness();
	const controller = new AbortController();
	onTestFinished(() => controller.abort());
	const events = sseReader(
		await daemon.app.request("http://localhost/api/events", { headers: control, signal: controller.signal }),
	);
	expect((await events.next()).event).toBe("hello");
	elsewhere(ADA);
	expect((await api("")).body).toMatchObject({ state: "signed-in", email: "ada@tidemark.app" });
	elsewhere(null);
	expect((await api("")).body).toMatchObject({ state: "signed-in" });
	expect((await api("/changed", "POST")).status).toBe(204);
	expect(await events.next()).toEqual({ event: "app", data: { kind: "account" } });
	expect((await api("")).body).toEqual({ state: "signed-out" });
});

it("keeps the account behind the control token", async () => {
	const { daemon } = harness();
	const response = await daemon.app.request("http://localhost/api/cloud/account/sign-in", { method: "POST" });
	expect(response.status).toBe(401);
});
