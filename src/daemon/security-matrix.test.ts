import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { initProject } from "../init";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createDaemonApp } from "./app";

const CONTROL_HOST = "localhost";
const RENDER_HOST = "run.spool.localhost";
const CONTROL_TOKEN = "control-token-for-tests";

function makeSecurityHarness() {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeFrame(project.root, "home", "export default function Home() { return <main>safe</main> }");
	writeDesignFile(
		project.root,
		"shared/scenarios/default.json",
		JSON.stringify({ state: { owner: project.root }, mock: {} }),
	);
	writeDesignFile(project.root, "shared/fixtures/secret.json", JSON.stringify({ project: project.root }));
	const daemon = createDaemonApp({
		spoolDir,
		version: "0.0.0-test",
		controlHost: CONTROL_HOST,
		controlToken: CONTROL_TOKEN,
	});
	daemon.setSelfOrigin(`http://${CONTROL_HOST}`);
	onTestFinished(() => daemon.close());

	const request = (host: string, path: string, init?: RequestInit) =>
		daemon.app.request(`http://${host}${path}`, init);
	const control = (path: string, init: RequestInit = {}) =>
		request(CONTROL_HOST, path, {
			...init,
			headers: { "x-spool-control": CONTROL_TOKEN, ...Object.fromEntries(new Headers(init.headers)) },
		});
	const render = (path: string, init?: RequestInit) => request(RENDER_HOST, path, init);

	return { spoolDir, project, daemon, request, control, render };
}

describe("daemon authority matrix", () => {
	it("accepts only the configured control and render hosts", async () => {
		const { request } = makeSecurityHarness();

		expect((await request(CONTROL_HOST, "/api/health")).status).toBe(200);
		expect((await request(RENDER_HOST, "/api/health")).status).toBe(404);
		expect((await request("attacker.example", "/api/health")).status).toBe(421);
		expect((await request("spool.localhost.attacker.example", "/")).status).toBe(421);
	});

	it("authenticates every control API before resolving sensitive targets", async () => {
		const { project, request, control } = makeSecurityHarness();
		const path = `/api/p/${encodeURIComponent(project.name)}/frames`;

		const missing = await request(CONTROL_HOST, path);
		expect(missing.status).toBe(401);
		expect(await missing.text()).not.toContain(project.root);

		const incorrect = await request(CONTROL_HOST, path, {
			headers: { "x-spool-control": "incorrect" },
		});
		expect(incorrect.status).toBe(401);
		expect(await incorrect.text()).not.toContain(project.root);

		expect((await control(path)).status).toBe(200);
		expect((await request(CONTROL_HOST, "/api/health")).status).toBe(200);
	});

	it("protects control writes with the same token and origin policy as reads", async () => {
		const { project, request, control } = makeSecurityHarness();
		const path = `/api/p/${encodeURIComponent(project.name)}/selection`;
		const body = JSON.stringify({ frames: ["home"] });
		const init = { method: "PUT", headers: { "content-type": "application/json" }, body };

		expect((await request(CONTROL_HOST, path, init)).status).toBe(401);
		expect(
			(
				await request(CONTROL_HOST, path, {
					...init,
					headers: {
						...init.headers,
						"x-spool-control": CONTROL_TOKEN,
						origin: "https://attacker.example",
					},
				})
			).status,
		).toBe(403);
		expect((await control(path, init)).status).toBe(204);
		expect(await (await control(path)).json()).toMatchObject({ selection: [{ frame: "home" }] });
	});

	it("requires the expected browser origin in addition to the control token", async () => {
		const { request } = makeSecurityHarness();
		const headers = { "x-spool-control": CONTROL_TOKEN };

		expect(
			(
				await request(CONTROL_HOST, "/api/projects", {
					headers: { ...headers, origin: `http://${CONTROL_HOST}` },
				})
			).status,
		).toBe(200);
		expect(
			(
				await request(CONTROL_HOST, "/api/projects", {
					headers: { ...headers, origin: "https://attacker.example" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await request(CONTROL_HOST, "/api/projects", {
					headers: { ...headers, origin: "null" },
				})
			).status,
		).toBe(403);

		const preflight = await request(CONTROL_HOST, "/api/projects", {
			method: "OPTIONS",
			headers: {
				origin: "https://attacker.example",
				"access-control-request-method": "GET",
				"access-control-request-headers": "x-spool-control",
			},
		});
		expect(preflight.status).toBe(403);
		expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
		expect(preflight.headers.get("access-control-allow-headers")).toBeNull();
	});

	it("partitions control and executable render routes by host", async () => {
		const { project, control, render, request } = makeSecurityHarness();
		const framePath = `/p/${encodeURIComponent(project.name)}/frames/home`;
		const playPath = `/play/${encodeURIComponent(project.name)}?frame=home`;

		expect((await control(framePath)).status).toBe(404);
		expect((await render("/api/projects")).status).toBe(404);
		expect(
			(await request(RENDER_HOST, "/api/projects", { headers: { "x-spool-control": CONTROL_TOKEN } })).status,
		).toBe(404);

		const frame = await render(framePath);
		expect(frame.status).toBe(200);
		expect(frame.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
		expect(await frame.text()).toContain('children: "safe"');

		const shell = await request(CONTROL_HOST, playPath);
		const shellHtml = await shell.text();
		expect(shell.status).toBe(200);
		expect(shell.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
		expect(shell.headers.get("x-frame-options")).toBe("DENY");
		expect(shellHtml).toContain('sandbox="allow-scripts"');
		expect(shellHtml).toContain(`http://${RENDER_HOST}${playPath}`);
		expect(shellHtml).not.toContain("<spool-boot>");

		const inner = await render(playPath);
		const innerHtml = await inner.text();
		expect(inner.status).toBe(200);
		expect(inner.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
		expect(innerHtml).toContain("window.__SPOOL_PLAY__");
	});

	it("serves public runtime assets only from the render host", async () => {
		const { request, render } = makeSecurityHarness();

		const runtime = await render("/vendor/spool.js", { headers: { origin: "null" } });
		expect(runtime.status).toBe(200);
		expect(runtime.headers.get("access-control-allow-origin")).toBe("*");
		expect((await request(CONTROL_HOST, "/vendor/spool.js")).status).toBe(404);
	});
});

describe("project data capabilities", () => {
	it("mints one project-scoped capability into render documents", async () => {
		const { project, render } = makeSecurityHarness();
		const document = await (await render(`/p/${encodeURIComponent(project.name)}/frames/home`)).text();

		const match = document.match(/"projectCapability":"([^"]+)"/);
		expect(match?.[1]).toBeTruthy();
		expect(document).not.toContain(CONTROL_TOKEN);
	});

	it("accepts opaque-origin reads only with the matching project capability", async () => {
		const first = makeSecurityHarness();
		const second = makeProject(first.spoolDir);
		writeDesignFile(second.root, "shared/fixtures/secret.json", JSON.stringify({ project: second.root }));
		writeDesignFile(
			second.root,
			"shared/scenarios/default.json",
			JSON.stringify({ state: { owner: second.root }, mock: {} }),
		);
		const capability = first.daemon.projectCapability(first.project.root);
		const firstPath = `/api/p/${encodeURIComponent(first.project.name)}/fixtures/secret`;
		const firstScenarioPath = `/api/p/${encodeURIComponent(first.project.name)}/scenarios/default`;
		const secondPath = `/api/p/${encodeURIComponent(second.name)}/fixtures/secret`;
		const secondScenarioPath = `/api/p/${encodeURIComponent(second.name)}/scenarios/default`;
		const headers = { origin: "null", "x-spool-project": capability };

		expect((await first.render(firstPath, { headers: { origin: "null" } })).status).toBe(401);
		expect(
			(await first.render(firstPath, { headers: { origin: "null", "x-spool-project": "incorrect" } })).status,
		).toBe(401);
		expect((await first.render(firstPath, { headers: { "x-spool-project": capability } })).status).toBe(403);
		expect(
			(
				await first.render(firstPath, {
					headers: { origin: `http://${RENDER_HOST}`, "x-spool-project": capability },
				})
			).status,
		).toBe(403);

		const own = await first.render(firstPath, { headers });
		expect(own.status).toBe(200);
		expect((await own.json()) as unknown).toEqual({ project: first.project.root });
		expect(own.headers.get("access-control-allow-origin")).toBe("null");
		expect(own.headers.get("access-control-allow-origin")).not.toBe("*");
		expect(own.headers.get("vary")).toContain("Origin");

		const ownScenario = await first.render(firstScenarioPath, { headers });
		expect(ownScenario.status).toBe(200);
		expect(await ownScenario.json()).toEqual({ state: { owner: first.project.root }, mock: {} });

		const crossProject = await first.render(secondPath, { headers });
		expect(crossProject.status).toBe(403);
		expect(await crossProject.text()).not.toContain(second.root);
		const crossProjectScenario = await first.render(secondScenarioPath, { headers });
		expect(crossProjectScenario.status).toBe(403);
		expect(await crossProjectScenario.text()).not.toContain(second.root);

		const foreignOrigin = await first.render(firstPath, {
			headers: { origin: "https://attacker.example", "x-spool-project": capability },
		});
		expect(foreignOrigin.status).toBe(403);
		expect(await foreignOrigin.text()).not.toContain(first.project.root);
	});

	it("uses the capability to isolate roots that share one display name", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const firstDir = join(makeTempDir(), "same-name");
		const secondDir = join(makeTempDir(), "same-name");
		mkdirSync(firstDir);
		mkdirSync(secondDir);
		const first = { root: initProject(firstDir, spoolDir).root, name: "same-name" };
		const second = { root: initProject(secondDir, spoolDir).root, name: "same-name" };
		writeDesignFile(first.root, "shared/fixtures/secret.json", JSON.stringify({ owner: "first" }));
		writeDesignFile(second.root, "shared/fixtures/secret.json", JSON.stringify({ owner: "second" }));
		const daemon = createDaemonApp({
			spoolDir,
			version: "0.0.0-test",
			controlHost: CONTROL_HOST,
			controlToken: CONTROL_TOKEN,
		});
		onTestFinished(() => daemon.close());
		const read = (capability: string) =>
			daemon.app.request(`http://${RENDER_HOST}/api/p/same-name/fixtures/secret`, {
				headers: { origin: "null", "x-spool-project": capability },
			});

		const firstRead = await read(daemon.projectCapability(first.root));
		expect(await firstRead.json()).toEqual({ owner: "first" });
		expect(firstRead.headers.get("cache-control")).toBe("no-store");
		expect(firstRead.headers.get("vary")).toContain("X-Spool-Project");
		expect(await (await read(daemon.projectCapability(second.root))).json()).toEqual({ owner: "second" });
		const controlAmbiguity = await daemon.app.request(`http://${CONTROL_HOST}/api/p/same-name/frames`, {
			headers: { "x-spool-control": CONTROL_TOKEN },
		});
		expect(controlAmbiguity.status).toBe(409);
		expect(await controlAmbiguity.text()).toContain(first.root);

		const renderAmbiguity = await daemon.app.request(`http://${RENDER_HOST}/p/same-name/frames/ghost`);
		expect(renderAmbiguity.status).toBe(409);
		const renderError = await renderAmbiguity.text();
		expect(renderError).not.toContain(first.root);
		expect(renderError).not.toContain(second.root);
	});

	it("answers only the project-capability preflight used by opaque-origin frames", async () => {
		const { project, daemon, render } = makeSecurityHarness();
		const path = `/api/p/${encodeURIComponent(project.name)}/scenarios/default`;
		const preflight = await render(path, {
			method: "OPTIONS",
			headers: {
				origin: "null",
				"access-control-request-method": "GET",
				"access-control-request-headers": "x-spool-project",
				"x-spool-project": daemon.projectCapability(project.root),
			},
		});

		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe("null");
		expect(preflight.headers.get("access-control-allow-methods")).toBe("GET");
		expect(preflight.headers.get("access-control-allow-headers")).toBe("x-spool-project");

		const scenario = await render(path, {
			headers: {
				origin: "null",
				"x-spool-project": daemon.projectCapability(project.root),
			},
		});
		expect(scenario.status).toBe(200);
		expect(await scenario.json()).toEqual({ state: { owner: project.root }, mock: {} });
	});
});
