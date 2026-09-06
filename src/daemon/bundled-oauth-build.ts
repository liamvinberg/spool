import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const native = "auth/oauth/openai-codex.js";
const page = "auth/oauth/oauth-page.js";
const reviewed = {
	[native]: "41432753ef2ec7ef21c577fdc8f83b731c78be90c10ed8e7e1df7010f84d198f",
	[page]: "42a64830cc90e228550cab0e765ea5e86653956912bc9197ce655c0685cf0b0c",
};

/** One checked build for the source host and the asset shipped to npm/Electron. */
export async function buildBundledOAuth(renderer: string): Promise<string> {
	const sdk = new URL("./", import.meta.resolve("@earendil-works/pi-ai"));
	const manifest = JSON.parse(readFileSync(new URL("../package.json", sdk), "utf8"));
	if (manifest.name !== "@earendil-works/pi-ai" || manifest.version !== "0.85.1")
		throw new Error("Review the bundled OAuth page adapter before changing the pinned SDK");
	for (const [path, expected] of Object.entries(reviewed)) {
		if (
			createHash("sha256")
				.update(readFileSync(new URL(path, sdk)))
				.digest("hex") !== expected
		)
			throw new Error(`The reviewed OAuth source changed: ${path}`);
	}
	const originalPage = fileURLToPath(new URL(page, sdk));
	const font = fileURLToPath(
		import.meta.resolve("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2"),
	);
	let replaced = 0;
	const result = await build({
		entryPoints: [fileURLToPath(new URL(native, sdk))],
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		write: false,
		loader: { ".woff2": "dataurl" },
		banner: { js: "// Native OAuth from @earendil-works/pi-ai 0.85.1; local page renderer by Spool." },
		plugins: [
			{
				name: "spool-oauth-page",
				setup(builder) {
					builder.onLoad({ filter: /\/auth\/oauth\/oauth-page\.js$/ }, (args) => {
						if (args.path !== originalPage) throw new Error("Unexpected OAuth page module");
						replaced++;
						return {
							loader: "js",
							contents: `
import { bundledOAuthPage } from ${JSON.stringify(renderer)};
import font from ${JSON.stringify(font)};
export function oauthSuccessHtml() { return bundledOAuthPage("received", font); }
export function oauthErrorHtml() { return bundledOAuthPage("error", font); }
`,
						};
					});
				},
			},
		],
	});
	const output = result.outputFiles[0];
	if (replaced !== 1 || result.outputFiles.length !== 1 || !output)
		throw new Error("The bundled OAuth page was not replaced exactly once");
	return output.text;
}
