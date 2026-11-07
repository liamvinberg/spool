import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { buildExtension, dist } from "./build.ts";

/**
 * Builds what ships and packs it into extension/spool-<version>.zip, the file the Chrome Web Store takes. The store
 * refuses a manifest with a `key` (it signs with its own, which gives the store's ID), so the zip's manifest has none.
 *
 *     pnpm extension:pack
 */

const here = dirname(fileURLToPath(import.meta.url));

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
	);
}

const m = await buildExtension();
const { key: _key, ...store } = m;
const entries: Record<string, Uint8Array> = {};
for (const path of files(dist)) {
	const name = relative(dist, path).split("\\").join("/");
	entries[name] = name === "manifest.json" ? Buffer.from(`${JSON.stringify(store, null, "\t")}\n`) : readFileSync(path);
}
const out = join(here, `spool-${m.version}.zip`);
writeFileSync(out, zipSync(entries, { level: 9 }));
console.log(`packed ${out}`);
