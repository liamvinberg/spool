import { fork, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir } from "../test-helpers";
import type { AgentLoginProgress } from "./agent-engine";
import { BundledHostClient, bundledEnvironment } from "./agent-engine-spool";
import { BundledRuntime } from "./bundled-runtime";

async function requireFreeCallbackPort() {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", () =>
			reject(new Error("Native OAuth test requires free callback port 1455; leave the existing process untouched")),
		);
		server.listen(1455, "127.0.0.1", resolve);
	});
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

it.each(["saved", "rejected"])(
	"serves Spool pages from the real native callback while account save is %s",
	{ timeout: 30_000 },
	async (outcome) => {
		await requireFreeCallbackPort();
		const browser =
			outcome === "saved"
				? await chromium.launch({ channel: "chromium-headless-shell", headless: true })
				: undefined;
		onTestFinished(() => browser?.close());
		const page = await browser?.newPage();
		const capture = async (name: string) => {
			if (!page) return;
			await page.evaluate(() => document.fonts.ready);
			expect(await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
				"Instrument Sans Variable",
			);
			expect(await page.locator(".mark path").evaluate((element) => getComputedStyle(element).fill)).toBe(
				"rgb(245, 57, 26)",
			);
			for (const viewport of [
				{ width: 1100, height: 720 },
				{ width: 320, height: 568 },
			]) {
				await page.setViewportSize(viewport);
				expect(
					await page.locator("main").evaluate((element) => element.getBoundingClientRect().width),
				).toBeLessThanOrEqual(viewport.width - 48);
				if (process.env.SPOOL_TEST_SHOTS) {
					mkdirSync(process.env.SPOOL_TEST_SHOTS, { recursive: true });
					await page.screenshot({ path: join(process.env.SPOOL_TEST_SHOTS, `${name}-${viewport.width}.png`) });
				}
			}
		};
		const nativeFetch = globalThis.fetch;
		const tokenCalls: URLSearchParams[] = [];
		const access = `fixture.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } })).toString("base64")}.fixture`;
		const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			if (String(input) !== "https://auth.openai.com/oauth/token")
				throw new Error("Unexpected provider transport in OAuth fixture");
			tokenCalls.push(new URLSearchParams(String(init?.body)));
			return outcome === "saved"
				? Response.json({ access_token: access, refresh_token: "fixture-refresh-secret", expires_in: 3600 })
				: new Response("fixture-provider-secret", { status: 401 });
		});
		onTestFinished(() => transport.mockRestore());
		const runtime = await BundledRuntime.create(join(makeTempDir(), "bundled"));
		onTestFinished(() => runtime.close());
		const start = (await runtime.request({
			kind: "login",
			provider: "openai-codex",
			method: "oauth",
		})) as AgentLoginProgress;
		if (start.kind !== "step" || start.step.type !== "select") throw new Error("Missing native login-method prompt");
		await runtime.request({ kind: "login-input", id: start.id, value: "browser", revision: start.revision });
		let authUrl = "";
		await expect
			.poll(async () => {
				const step = (await runtime.request({ kind: "login-poll", id: start.id })) as AgentLoginProgress;
				if (step.kind === "step")
					authUrl = step.browser?.url ?? (step.step.type === "auth_url" ? step.step.url : "");
				return authUrl !== "";
			})
			.toBe(true);
		const authorize = new URL(authUrl);
		expect(authorize.origin).toBe("https://auth.openai.com");
		expect(authorize.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
		expect(authorize.searchParams.get("originator")).toBe("pi");
		expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
		expect(authorize.searchParams.get("scope")).toBe("openid profile email offline_access");
		const redirect = authorize.searchParams.get("redirect_uri");
		expect(redirect).toBe("http://localhost:1455/auth/callback");
		const state = authorize.searchParams.get("state") ?? "";
		for (const url of [
			"http://localhost:1455/not-the-callback",
			`${redirect}?state=wrong-secret&code=callback-secret`,
			`${redirect}?state=${state}`,
		]) {
			const response = await nativeFetch(url);
			expect(response.status).toBe(url.includes("not-the-callback") ? 404 : 400);
			const html = await response.text();
			expect(html).toContain('data-spool-oauth="error"');
			expect(html).toContain("Return to Spool");
			expect(html).toContain('viewBox="250 182 524 660"');
			expect(html).not.toContain('viewBox="0 0 800 800"');
			for (const secret of [state, "callback-secret", "wrong-secret", access, "fixture-refresh-secret"])
				expect(html).not.toContain(secret);
		}
		if (page) {
			await page.goto(`${redirect}?state=wrong-secret&code=callback-secret`);
			await capture("callback-error");
		}
		expect(tokenCalls).toHaveLength(0);
		const successUrl = `${redirect}?state=${state}&code=callback-secret`;
		const response = page ? await page.goto(successUrl) : await nativeFetch(successUrl);
		if (!response) throw new Error("Missing native callback response");
		expect(typeof response.status === "function" ? response.status() : response.status).toBe(200);
		const html = await response.text();
		await capture("callback-received");
		expect(html).toContain('data-spool-oauth="received"');
		expect(html).toContain("Continue in Spool to finish connecting your account.");
		expect(html).not.toContain("models are now available");
		expect(html).not.toContain('viewBox="0 0 800 800"');
		for (const secret of [state, "callback-secret", access, "fixture-refresh-secret", "fixture-provider-secret"])
			expect(html).not.toContain(secret);
		await expect
			.poll(async () => {
				const view = (await runtime.request({ kind: "login-poll", id: start.id })) as AgentLoginProgress;
				return view.kind;
			})
			.toBe(outcome === "saved" ? "connected" : "error");
		expect(tokenCalls).toHaveLength(1);
		expect(tokenCalls[0]?.get("code")).toBe("callback-secret");
		expect(tokenCalls[0]?.get("client_id")).toBe(authorize.searchParams.get("client_id"));
		expect(tokenCalls[0]?.get("redirect_uri")).toBe(redirect);
		expect(
			createHash("sha256")
				.update(tokenCalls[0]?.get("code_verifier") ?? "")
				.digest("base64url"),
		).toBe(authorize.searchParams.get("code_challenge"));
		expect(await runtime.credentials.read("openai-codex")).toEqual(
			outcome === "saved" ? expect.objectContaining({ access, refresh: "fixture-refresh-secret" }) : undefined,
		);
		const account = JSON.stringify(await runtime.request({ kind: "account" }));
		expect(account).not.toContain(access);
		expect(account).not.toContain("fixture-refresh-secret");
		expect(account).not.toContain("callback-secret");
	},
);

// These native-listener tests share one file because the SDK owns fixed port 1455.
it("ships the branded native callback in a clean installed host", { timeout: 180_000 }, async () => {
	await requireFreeCallbackPort();
	const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
	const packageRoot = makeTempDir();
	for (const file of [
		"package.json",
		"LICENSE.md",
		"THIRD_PARTY_NOTICES.md",
		"tsup.config.ts",
		"vite.config.ts",
		"tsconfig.json",
		"tsconfig.runtime.json",
		"tsconfig.ui.json",
	])
		cpSync(join(repoRoot, file), join(packageRoot, file));
	cpSync(join(repoRoot, "src"), join(packageRoot, "src"), { recursive: true });
	symlinkSync(join(repoRoot, "node_modules"), join(packageRoot, "node_modules"), "dir");
	const run = (args: string[], cwd: string) => {
		const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", timeout: 120_000 });
		expect(result.status, result.stderr + result.stdout).toBe(0);
	};
	const tarball = join(makeTempDir(), "spool-page.tgz");
	run(["pack", "--out", tarball], packageRoot);
	const prefix = makeTempDir();
	writeFileSync(join(prefix, "package.json"), '{ "private": true }\n');
	run(["add", "--prefer-offline", "--ignore-scripts", tarball], prefix);
	const installed = join(prefix, "node_modules", "spool.page");
	expect(existsSync(join(installed, "src"))).toBe(false);
	const asset = readFileSync(join(installed, "dist", "bundled-oauth-native.js"), "utf8");
	expect(asset).toContain("local page renderer by Spool");
	expect(asset).not.toContain('viewBox="0 0 800 800"');
	// The installed production host is unchanged. Only token HTTP is simulated
	// by a test preload; its native listener and normal auth persistence run.
	const state = makeTempDir();
	const fixture = join(makeTempDir(), "token-transport.mjs");
	writeFileSync(
		fixture,
		`
globalThis.fetch = async (input, init) => {
	if (String(input) !== "https://auth.openai.com/oauth/token") throw new Error("Unexpected fixture transport");
	const body = new URLSearchParams(String(init?.body));
	if (body.get("code") !== "packed-callback-secret" || !body.get("code_verifier")) throw new Error("Invalid native token exchange");
	return Response.json({access_token: "fixture." + Buffer.from(JSON.stringify({"https://api.openai.com/auth": {chatgpt_account_id: "packed-account"}})).toString("base64") + ".fixture", refresh_token: "packed-refresh-secret", expires_in: 3600});
};
`,
	);
	const child = fork(join(installed, "dist", "bundled-host.js"), [], {
		cwd: state,
		env: bundledEnvironment(state),
		execArgv: ["--import", pathToFileURL(fixture).href],
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
	const client = new BundledHostClient(state, () => child);
	onTestFinished(async () => {
		const exited = once(child, "exit");
		client.close();
		await exited;
	});
	const start = (await client.request({
		kind: "login",
		provider: "openai-codex",
		method: "oauth",
	})) as AgentLoginProgress;
	if (start.kind !== "step" || start.step.type !== "select") throw new Error("Missing installed native prompt");
	await client.request({ kind: "login-input", id: start.id, value: "browser", revision: start.revision });
	let authUrl = "";
	await expect
		.poll(async () => {
			const step = (await client.request({ kind: "login-poll", id: start.id })) as AgentLoginProgress;
			if (step.kind === "step") authUrl = step.browser?.url ?? (step.step.type === "auth_url" ? step.step.url : "");
			return authUrl !== "";
		})
		.toBe(true);
	const authorize = new URL(authUrl);
	const redirect = authorize.searchParams.get("redirect_uri");
	expect(redirect).toBe("http://localhost:1455/auth/callback");
	const error = await fetch(`${redirect}?state=wrong&code=packed-callback-secret`);
	expect(error.status).toBe(400);
	const errorHtml = await error.text();
	expect(errorHtml).toContain('data-spool-oauth="error"');
	expect(errorHtml).not.toContain("packed-callback-secret");
	const response = await fetch(`${redirect}?state=${authorize.searchParams.get("state")}&code=packed-callback-secret`);
	expect(response.status).toBe(200);
	const html = await response.text();
	expect(html).toContain('data-spool-oauth="received"');
	expect(html).toContain("Continue in Spool to finish connecting your account.");
	expect(html).toContain("Instrument Sans Variable");
	expect(html).not.toContain("packed-refresh-secret");
	expect(html).not.toContain("packed-callback-secret");
	await expect
		.poll(async () => ((await client.request({ kind: "login-poll", id: start.id })) as AgentLoginProgress).kind)
		.toBe("connected");
	expect(await client.request({ kind: "account" })).toMatchObject({ signedIn: true });
});
