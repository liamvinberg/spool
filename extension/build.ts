import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

/**
 * Builds spool's Chrome extension into extension/dist, ready to load unpacked: the picker (the content script) and
 * the service worker, each one self-contained script, beside the manifest and the icons. Nothing is fetched at run
 * time, as the Web Store requires.
 *
 *     pnpm extension:build          # what ships
 *     pnpm extension:build --test   # plus <all_urls>, so automation can open the picker on any tab
 */

const here = dirname(fileURLToPath(import.meta.url));
export const dist = join(here, "dist");

export interface Manifest {
	version: string;
	key?: string;
	host_permissions?: string[];
	[field: string]: unknown;
}

export function manifest(): Manifest {
	return JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as Manifest;
}

const ENTRIES = [
	["picker", "src/picker/main.tsx"],
	["background", "src/background.ts"],
] as const;

export async function buildExtension({ test = false } = {}): Promise<Manifest> {
	rmSync(dist, { recursive: true, force: true });
	mkdirSync(dist, { recursive: true });
	for (const [name, entry] of ENTRIES) {
		await build({
			configFile: false,
			root: here,
			logLevel: "warn",
			plugins: [react(), tailwindcss()],
			define: { "process.env.NODE_ENV": JSON.stringify("production") },
			build: {
				outDir: dist,
				emptyOutDir: false,
				copyPublicDir: false,
				target: "chrome114",
				lib: { entry: join(here, entry), formats: ["iife"], name: `spool_${name}`, fileName: () => `${name}.js` },
			},
		});
	}
	const m = manifest();
	if (test) m.host_permissions = ["<all_urls>"];
	writeFileSync(join(dist, "manifest.json"), `${JSON.stringify(m, null, "\t")}\n`);
	cpSync(join(here, "icons"), join(dist, "icons"), { recursive: true });
	return m;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const m = await buildExtension({ test: process.argv.includes("--test") });
	console.log(`built spool ${m.version}${m.host_permissions === undefined ? "" : " (test)"} into ${dist}`);
}
