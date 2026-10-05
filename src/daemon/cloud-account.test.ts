import { expect, it, onTestFinished, vi } from "vitest";
import { type CloudAccount, CloudSignedOut } from "../cloud-auth";
import { SpoolError } from "../errors";
import { makeTempDir } from "../test-helpers";
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
	return { api, services, opened, finish: (account: CloudAccount) => finish?.(account), daemon };
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

it("keeps the account behind the control token", async () => {
	const { daemon } = harness();
	const response = await daemon.app.request("http://localhost/api/cloud/account/sign-in", { method: "POST" });
	expect(response.status).toBe(401);
});
