import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readRegistry } from "../registry";
import { makeApp, makeProject, makeTempDir } from "../test-helpers";
import { createSettingsStore } from "./settings";

it("reads what Open… was handed and imports a .spool file from where it lies", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	const project = makeProject(spoolDir);
	const location = realpathSync(makeTempDir());
	createSettingsStore(spoolDir).write("projects.location", location);
	const app = makeApp(spoolDir);
	const find = async (given: string) =>
		(await app.request(`/api/projects/find?${new URLSearchParams({ given })}`)).json();
	expect(await find(project.root)).toEqual({ kind: "project", root: project.root, name: project.name });

	const exported = await app.request("/api/projects/export", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ root: project.root }),
	});
	const file = join(makeTempDir(), "kaffe-menu.spool");
	writeFileSync(file, Buffer.from(await exported.arrayBuffer()));
	expect(await find(file)).toMatchObject({ kind: "file", into: location });

	const imported = await app.request("/api/projects/import/path", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ path: file }),
	});
	expect(imported.status).toBe(200);
	const { root } = (await imported.json()) as { root: string };
	expect(root.startsWith(location)).toBe(true);
	expect(existsSync(join(root, "design", "canvas.json"))).toBe(true);
	expect(readRegistry(spoolDir).projects.some((entry) => entry.root === root)).toBe(true);

	const refused = await app.request("/api/projects/import/path", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ path: project.root }),
	});
	expect(refused.status).toBe(400);
});

it("says spool.page could not be reached for a team link while it doesn't answer", async () => {
	const app = makeApp(join(makeTempDir(), ".spool"), {
		cloud: {
			origin: "https://cloud.test",
			vault: { read: async () => "t".repeat(43) },
			fetch: async () => {
				throw new TypeError("fetch failed");
			},
		},
	});
	const found = await app.request(
		`/api/projects/find?${new URLSearchParams({ given: "https://cloud.test/tidemark/app" })}`,
	);
	expect(await found.json()).toEqual({ kind: "nothing", says: "spool.page could not be reached. Try again." });
});
