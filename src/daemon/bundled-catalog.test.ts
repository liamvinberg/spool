import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { BundledCatalog } from "./bundled-catalog";
import { BundledRuntime } from "./bundled-runtime";
import { BundledCredentialStore, writePrivate } from "./bundled-store";

async function fixture() {
	const directory = makeTempDir();
	const credentials = new BundledCredentialStore(directory);
	await credentials.modify("openai", async () => ({ type: "api_key", key: "fixture-key" }));
	let body: unknown = [];
	let status = 200;
	let delay = false;
	let requests = 0;
	let aborted = false;
	const server = createServer((request, response) => {
		requests++;
		expect(request.headers.authorization).toBeUndefined();
		expect(request.headers["user-agent"]).toContain("pi/");
		if (delay) {
			request.on("close", () => {
				aborted = true;
			});
			return;
		}
		response.writeHead(status, {
			"content-type": "application/json",
			"last-modified": "Thu, 01 Jan 2099 00:00:00 GMT",
			etag: '"fixture"',
		});
		response.end(JSON.stringify(body));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(() => {
		server.closeAllConnections();
		server.close();
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing address");
	let failSave = false;
	const open = async () => {
		const catalog = new BundledCatalog(directory, (path, content) => {
			if (failSave) throw new Error("disk full");
			writePrivate(path, content);
		});
		const models = await ModelRuntime.create({
			credentials,
			modelsStore: catalog,
			modelsPath: null,
			refreshOnCreate: false,
			catalogBaseUrl: `http://127.0.0.1:${address.port}`,
		});
		catalog.install(models);
		await catalog.restore(models);
		const runtime = new BundledRuntime(directory, credentials, models);
		onTestFinished(() => {
			catalog.close();
			return runtime.close();
		});
		return { catalog, models, runtime };
	};
	return {
		directory,
		credentials,
		open,
		body: (next: unknown) => {
			body = next;
		},
		status: (next: number) => {
			status = next;
		},
		delay: () => {
			delay = true;
		},
		failSave: () => {
			failSave = true;
		},
		requests: () => requests,
		aborted: () => aborted,
	};
}

it("refreshes only compatible model data through the real SDK and restores durable offers offline", async () => {
	const f = await fixture();
	const { catalog, models, runtime } = await f.open();
	const builtin = models.getModel("openai", "gpt-6-astra");
	if (!builtin) throw new Error("Missing pinned Astra");
	const before = models.getProvider("openai");
	f.body([
		{
			...builtin,
			id: "new-image",
			name: "New image",
			thinkingLevelMap: { minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: null },
			auth: "executable injection",
			headers: { Authorization: "injected" },
			baseUrl: builtin.baseUrl,
		},
		{ ...builtin, id: "text-only", input: ["text"] },
		{ ...builtin, id: "new-protocol", api: "unshipped-protocol" },
		{ ...builtin, id: "other-endpoint", baseUrl: "https://untrusted.invalid" },
		{ ...builtin, id: builtin.id, api: "unshipped-protocol" },
	]);
	await catalog.refresh(models);
	expect(f.requests()).toBe(1);
	const model = models.getModel("openai", "new-image");
	expect(model?.input).toContain("image");
	expect(model?.headers).toEqual(builtin.headers);
	expect(models.getModel("openai", "gpt-6-astra")).toEqual(builtin);
	for (const id of ["text-only", "new-protocol", "other-endpoint"])
		expect(models.getModel("openai", id)).toBeUndefined();
	expect(models.getProvider("openai")?.auth).toBe(before?.auth);
	expect(models.getProvider("openai")?.stream).toBe(before?.stream);
	expect(models.getProvider("openai")?.streamSimple).toBe(before?.streamSimple);
	const options = {
		root: makeTempDir(),
		session: { id: randomUUID() },
		ask: {},
		choose: { value: "spool/openai/api_key/new-image" },
	};
	const offer = await runtime.offer(options);
	expect(offer.current.value).toBe(options.choose.value);
	expect(offer.models.find((entry) => entry.value === options.choose.value)?.supportedEffortLevels).toEqual([
		"low",
		"high",
	]);
	const cache = readFileSync(join(f.directory, "models-openai.json"), "utf8");
	expect(cache).not.toContain("executable injection");
	expect(cache).not.toContain("injected");
	const offline = await f.open();
	expect(offline.models.getModel("openai", "new-image")).toEqual(model);
	expect(f.requests()).toBe(1);
	expect((await offline.runtime.offer({ ...options, choose: {} })).current.value).toBe(options.choose.value);
	await catalog.refresh(models);
	expect(f.requests()).toBe(1);
});

it("keeps the last compatible catalog across a missing remote catalog and failed cache read", async () => {
	const f = await fixture();
	const first = await f.open();
	const builtin = first.models.getModel("openai", "gpt-6-astra");
	if (!builtin) throw new Error("Missing model");
	f.body([{ ...builtin, id: "cached-image" }]);
	await first.catalog.refresh(first.models);
	const path = join(f.directory, "models-openai.json");
	const cached = JSON.parse(readFileSync(path, "utf8"));
	writeFileSync(path, JSON.stringify({ ...cached, checkedAt: 0 }));
	const missing = await f.open();
	f.status(404);
	await missing.catalog.refresh(missing.models);
	expect(missing.models.getModel("openai", "cached-image")).toBeDefined();
	const restored = await f.open();
	expect(restored.models.getModel("openai", "cached-image")).toBeDefined();
	writeFileSync(path, "{broken");
	await restored.catalog.restore(restored.models);
	expect(restored.models.getModel("openai", "cached-image")).toBeDefined();
});

it("bounds background refresh and preserves builtins and cache when offline, malformed or unwritable", async () => {
	const f = await fixture();
	const first = await f.open();
	const builtin = first.models.getModel("openai", "gpt-6-astra");
	if (!builtin) throw new Error("Missing model");
	f.body([{ ...builtin, id: "cached-image" }]);
	await first.catalog.refresh(first.models);
	// Make the durable body due for revalidation without altering its models.
	const path = join(f.directory, "models-openai.json");
	const cached = JSON.parse(readFileSync(path, "utf8"));
	writeFileSync(path, JSON.stringify({ ...cached, checkedAt: 0 }));
	const failed = await f.open();
	f.failSave();
	f.body([{ ...builtin, id: "unsaved-image" }]);
	await failed.catalog.refresh(failed.models);
	expect(failed.models.getModel("openai", "cached-image")).toBeDefined();
	expect(failed.models.getModel("openai", "unsaved-image")).toBeUndefined();
	expect(JSON.parse(readFileSync(path, "utf8")).models[0].id).toBe("cached-image");
	const offline = await f.open();
	f.delay();
	const start = Date.now();
	const pending = offline.catalog.refresh(offline.models, 80);
	const offer = await offline.runtime.offer({ root: makeTempDir(), session: { id: randomUUID() }, ask: {} });
	expect(offer.models.some((model) => model.resolvedModel === "cached-image")).toBe(true);
	await pending;
	expect(Date.now() - start).toBeLessThan(1500);
	await expect.poll(f.aborted).toBe(true);
	writeFileSync(path, "{broken");
	const corrupt = await f.open();
	expect(corrupt.models.getModel("openai", "gpt-6-astra")).toBeDefined();
	expect(corrupt.models.getModel("openai", "cached-image")).toBeUndefined();
});
