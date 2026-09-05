import { writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { buildBlockMap } from "app-builder-lib/out/targets/blockmap/blockmap";
import { parseVersion } from "./version";

/** Build-time only. Use the pinned builder's blockmap format for the final ZIP. */
export async function writeUpdateFeed(archive: string, version: string): Promise<void> {
	if (parseVersion(version) === undefined) throw new Error(`Invalid release version: ${version}`);
	const name = basename(archive);
	const { sha512, size } = await buildBlockMap(archive, "gzip", `${archive}.blockmap`);
	await writeFile(
		join(dirname(archive), "latest-mac.yml"),
		[
			`version: ${JSON.stringify(version)}`,
			"files:",
			`  - url: ${JSON.stringify(name)}`,
			`    sha512: ${sha512}`,
			`    size: ${size}`,
			`path: ${JSON.stringify(name)}`,
			`sha512: ${sha512}`,
			`releaseDate: ${JSON.stringify(new Date().toISOString())}`,
			"",
		].join("\n"),
	);
}

if (require.main === module) {
	const [archive, version] = process.argv.slice(2);
	if (archive === undefined || version === undefined) throw new Error("Usage: update-feed <archive.zip> <version>");
	void writeUpdateFeed(archive, version).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
