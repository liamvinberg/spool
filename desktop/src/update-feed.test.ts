import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { computeOperations, OperationKind } from "electron-updater/out/differentialDownloader/downloadPlanBuilder";
import { parseUpdateInfo } from "electron-updater/out/providers/Provider";
import { writeUpdateFeed } from "./update-feed";

const silent = { info() {}, warn() {}, error() {} };

test("the final ZIP, feed and blockmaps reconstruct an update using the updater's own download plan", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "spool-update-feed-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	// An incompressible unchanged binary beside a small source file that changes.
	const binary = Buffer.concat(
		Array.from({ length: 32768 }, (_, i) => createHash("sha256").update(String(i)).digest()),
	);
	const archives: Buffer[] = [];
	const maps: Parameters<typeof computeOperations>[0][] = [];
	for (const version of ["0.12.0", "0.13.0"]) {
		const out = join(directory, version);
		const app = join(out, "Spool.app");
		await mkdir(app, { recursive: true });
		await writeFile(join(app, "engine"), binary);
		await writeFile(join(app, "app.js"), `console.log(${JSON.stringify(version)})`);
		const archive = join(out, `Spool-${version}-arm64-mac.zip`);
		execFileSync("ditto", ["-c", "-k", "--keepParent", app, archive]);
		const original = await readFile(archive);
		await writeUpdateFeed(archive, version);
		assert.deepEqual(await readFile(archive), original, "generating the map must not mutate the signed archive");
		const feed = parseUpdateInfo(
			await readFile(join(out, "latest-mac.yml"), "utf8"),
			"latest-mac.yml",
			new URL("https://example.com/latest-mac.yml"),
		);
		assert.equal(feed.version, version);
		assert.equal(feed.files[0]?.size, original.length);
		assert.equal(feed.files[0]?.sha512, createHash("sha512").update(original).digest("base64"));
		assert.equal(feed.files[0]?.url, `Spool-${version}-arm64-mac.zip`);
		maps.push(JSON.parse(gunzipSync(await readFile(`${archive}.blockmap`)).toString()));
		archives.push(original);
	}
	const [oldMap, newMap] = maps;
	const [oldArchive, newArchive] = archives;
	assert.ok(oldMap && newMap && oldArchive && newArchive);
	const plan = computeOperations(oldMap, newMap, silent);
	const rebuilt = Buffer.concat(
		plan.map((operation) =>
			(operation.kind === OperationKind.COPY ? oldArchive : newArchive).subarray(operation.start, operation.end),
		),
	);
	assert.deepEqual(rebuilt, newArchive, "the updater must reconstruct the exact signed ZIP");
	const downloaded = plan
		.filter((operation) => operation.kind === OperationKind.DOWNLOAD)
		.reduce((sum, operation) => sum + operation.end - operation.start, 0);
	assert.ok(
		downloaded < newArchive.length / 10,
		`a source-only update should reuse the binary: ${downloaded}/${newArchive.length}`,
	);
});
