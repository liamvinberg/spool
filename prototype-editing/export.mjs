import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Export this in-memory playground without the daemon connection or authority.
// The authored frame uses React state and DOM edits, never the spool runtime.
const [renderUrl, outputDirectory] = process.argv.slice(2);
assert(renderUrl && outputDirectory, "usage: pnpm export <raw frame URL> <output directory>");
const source = new URL(renderUrl);
const destination = resolve(outputDirectory);
const read = async (url) => {
	const response = await fetch(url);
	assert(response.ok, `cannot export ${url}: ${response.status}`);
	return response.text();
};

let html = await read(source);
assert.equal([...html.matchAll(/<script>[\s\S]*?<\/script>/g)].length, 2, "unexpected frame bootstrap");
html = html.replace(/<script>[\s\S]*?<\/script>/g, "");
assert.equal([...html.matchAll(/^import "spool";$/gm)].length, 1, "frame must only import the injected runtime");
html = html.replace(/^import "spool";\n/m, "");

const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
assert(mapMatch, "frame import map missing");
const map = JSON.parse(mapMatch[1]);
delete map.imports.spool;
const vendors = new Map();
for (const [name, url] of Object.entries(map.imports)) {
	if (!url.startsWith("/")) continue;
	assert(url.startsWith("/vendor/"), `unexpected local dependency: ${url}`);
	const filename = url.slice("/vendor/".length);
	assert(!filename.includes("/"), "nested vendor path is unsupported");
	map.imports[name] = `./${filename}`;
	vendors.set(filename, new URL(url, source.origin));
}
html = html.replace(mapMatch[0], `<script type="importmap">${JSON.stringify(map)}</script>`);
html = html.replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">', '<link rel="icon" href="data:,">');
html = html.replace("<title>editing · spool</title>", "<title>Editing playground · spool</title>");
assert(!html.includes("projectCapability"), "daemon capability must never be exported");
assert(!html.includes("controlOrigin"), "daemon control origin must never be exported");
assert(!html.includes(source.origin), "export must not require the local render host");

const files = await Promise.all([...vendors].map(async ([name, url]) => [name, await read(url)]));
const fontPaths = new Set(html.match(/\/vendor\/webfont\/[a-f0-9]+/g) ?? []);
for (const path of fontPaths) {
	const response = await fetch(new URL(path, source.origin));
	assert(response.ok, `cannot export font: ${response.status}`);
	const filename = `font-${path.split("/").at(-1)}`;
	files.push([filename, new Uint8Array(await response.arrayBuffer())]);
	html = html.replaceAll(path, `./${filename}`);
}
await mkdir(destination, { recursive: true });
for (const [name, content] of files) await writeFile(resolve(destination, name), content);
await writeFile(resolve(destination, "index.html"), html);
process.stdout.write(`exported ${files.length + 1} files to ${destination}\n`);
